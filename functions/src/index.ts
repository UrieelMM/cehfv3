import { initializeApp } from "firebase-admin/app";
import {
  FieldValue,
  Timestamp,
  getFirestore,
  type DocumentData,
  type DocumentReference,
  type QueryDocumentSnapshot,
  type WriteBatch,
} from "firebase-admin/firestore";
import { logger, setGlobalOptions } from "firebase-functions/v2";
import {
  onDocumentCreated,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";

initializeApp();
setGlobalOptions({ region: "us-central1", maxInstances: 10 });

const db = getFirestore();
const TASK_PATH =
  "institutions/{institutionId}/ciclosEscolares/{schoolYearId}/trimestres/{termId}/semanas/{weekId}/materias/{subjectId}/tareas/{taskId}";
const HISTORY_PATH = `${TASK_PATH}/entregas/{studentId}/historial/{eventId}`;
const EXTENSION_PATH = `${TASK_PATH}/prorrogas/{studentId}`;

type StudentRecipient = {
  uid: string;
  name: string;
};

function taskUrl(taskId: string) {
  return `/tasks/${encodeURIComponent(taskId)}`;
}

async function targetStudents(
  institutionId: string,
  targetGroup: string,
): Promise<StudentRecipient[]> {
  const snapshot = await db
    .collection("users")
    .where("institutionId", "==", institutionId)
    .get();
  return snapshot.docs
    .map((entry) => ({ uid: entry.id, ...entry.data() }) as DocumentData & { uid: string })
    .filter(
      (profile) =>
        profile.active === true &&
        profile.role === "student" &&
        `${String(profile.grade ?? "")} ${String(profile.group ?? "")}`.trim() ===
          targetGroup,
    )
    .map((profile) => ({ uid: profile.uid, name: String(profile.name ?? "Alumno") }));
}

async function writeNotifications(
  recipients: string[],
  eventId: string,
  notification: Record<string, unknown>,
) {
  const uniqueRecipients = [...new Set(recipients.filter(Boolean))];
  for (let offset = 0; offset < uniqueRecipients.length; offset += 450) {
    const batch = db.batch();
    uniqueRecipients.slice(offset, offset + 450).forEach((userId) => {
      batch.set(
        db.doc(`notifications/${userId}/items/${eventId}`),
        {
          ...notification,
          read: false,
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    });
    await batch.commit();
  }
}

export const onTaskStateChanged = onDocumentWritten(
  { document: TASK_PATH, retry: true },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;
    const before = event.data?.before;
    const previousStatus = before?.exists ? before.data()?.status : null;
    const task = after.data() as DocumentData;
    const nextStatus = task.status;
    if (previousStatus === nextStatus || !["published", "closed"].includes(nextStatus)) {
      return;
    }
    const recipients = await targetStudents(
      String(task.institutionId),
      String(task.targetGroup),
    );
    if (!recipients.length) {
      logger.info("Task state changed without matching student recipients", {
        taskId: event.params.taskId,
        targetGroup: task.targetGroup,
      });
      return;
    }
    const reopened = nextStatus === "published" && previousStatus === "closed";
    const title =
      nextStatus === "closed"
        ? `Tarea cerrada: ${task.title}`
        : reopened
          ? `Tarea reabierta: ${task.title}`
          : `Nueva tarea: ${task.title}`;
    const detail =
      nextStatus === "closed"
        ? "El docente cerró esta actividad para nuevas entregas."
        : reopened
          ? "La actividad tiene una nueva fecha de entrega."
          : `${task.subject} · entrega ${formatTaskDate(task.dueAt)}`;
    await writeNotifications(
      recipients.map((recipient) => recipient.uid),
      `task-state-${event.params.taskId}-${nextStatus}-${event.id}`,
      {
        category: "task",
        title,
        detail,
        taskId: event.params.taskId,
        taskPath: after.ref.path,
        url: taskUrl(event.params.taskId),
        eventType: reopened ? "task_reopened" : `task_${nextStatus}`,
      },
    );
  },
);

function formatTaskDate(value: unknown) {
  const date = value instanceof Timestamp ? value.toDate() : new Date(String(value));
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Mexico_City",
  }).format(date);
}

function taskReferenceFromConversation(
  eventDocument: QueryDocumentSnapshot,
): DocumentReference | null {
  const submissionReference = eventDocument.ref.parent.parent;
  return submissionReference?.parent.parent ?? null;
}

export const onTaskConversationEvent = onDocumentCreated(
  { document: HISTORY_PATH, retry: true },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;
    const taskReference = taskReferenceFromConversation(snapshot);
    if (!taskReference) return;
    const taskSnapshot = await taskReference.get();
    if (!taskSnapshot.exists) return;
    const task = taskSnapshot.data() as DocumentData;
    const conversation = snapshot.data();
    const type = String(conversation.type ?? "");
    const studentId = String(event.params.studentId);
    if (["submitted", "resubmitted"].includes(type)) {
      await writeNotifications(
        [String(task.createdBy)],
        `task-conversation-${event.params.eventId}`,
        {
          category: "task",
          title: `${conversation.studentName ?? "Un alumno"} entregó ${task.title}`,
          detail: `Versión ${conversation.version ?? 1} lista para revisar.`,
          taskId: event.params.taskId,
          studentId,
          taskPath: taskReference.path,
          url: taskUrl(event.params.taskId),
          eventType: type,
        },
      );
      return;
    }
    if (["feedback", "reviewed"].includes(type)) {
      await writeNotifications(
        [studentId],
        `task-conversation-${event.params.eventId}`,
        {
          category: "task",
          title:
            type === "reviewed"
              ? `Entrega finalizada: ${task.title}`
              : `Nueva retroalimentación: ${task.title}`,
          detail:
            type === "reviewed"
              ? "El docente marcó tu entrega como finalizada."
              : "Tu maestro respondió a tu entrega.",
          taskId: event.params.taskId,
          taskPath: taskReference.path,
          url: taskUrl(event.params.taskId),
          eventType: type,
        },
      );
    }
  },
);

export const onIndividualExtensionChanged = onDocumentWritten(
  { document: EXTENSION_PATH, retry: true },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;
    const beforeDue = event.data?.before.exists
      ? event.data.before.data()?.dueAt?.toMillis?.()
      : null;
    const extension = after.data() as DocumentData;
    const afterDue = extension.dueAt?.toMillis?.();
    if (beforeDue === afterDue) return;
    const taskReference = after.ref.parent.parent;
    const taskSnapshot = await taskReference?.get();
    if (!taskSnapshot?.exists) return;
    const task = taskSnapshot.data() as DocumentData;
    await writeNotifications(
      [event.params.studentId],
      `task-extension-${event.params.taskId}-${event.params.studentId}-${afterDue}`,
      {
        category: "task",
        title: `Prórroga para ${task.title}`,
        detail: `Puedes entregar hasta ${formatTaskDate(extension.dueAt)}.`,
        taskId: event.params.taskId,
        taskPath: taskReference?.path,
        url: taskUrl(event.params.taskId),
        eventType: "individual_extension",
      },
    );
  },
);

function addScheduledPublicationToBatch(
  batch: WriteBatch,
  taskSnapshot: QueryDocumentSnapshot,
) {
  batch.update(taskSnapshot.ref, {
    status: "published",
    publicationMode: "scheduled",
    publishedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(taskSnapshot.ref.collection("historial").doc(), {
    type: "published",
    authorId: "system",
    authorName: "Campus CEHF",
    authorRole: "director",
    message: "Publicó automáticamente la actividad programada.",
    createdAt: FieldValue.serverTimestamp(),
  });
}

export const publishScheduledTasks = onSchedule(
  {
    schedule: "every 1 minutes",
    timeZone: "America/Mexico_City",
    retryCount: 3,
  },
  async () => {
    const snapshot = await db
      .collectionGroup("tareas")
      .where("status", "==", "scheduled")
      .where("publishAt", "<=", Timestamp.now())
      .limit(200)
      .get();
    if (snapshot.empty) return;
    const batch = db.batch();
    snapshot.docs.forEach((taskSnapshot) =>
      addScheduledPublicationToBatch(batch, taskSnapshot),
    );
    await batch.commit();
    logger.info("Scheduled tasks published", { count: snapshot.size });
  },
);
