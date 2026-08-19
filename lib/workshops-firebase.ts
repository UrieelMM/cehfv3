"use client";

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";
import { firebase } from "./firebase";
import type {
  UserProfile,
  Workshop,
  WorkshopAccessInput,
  WorkshopKind,
  WorkshopResource,
  WorkshopSubmission,
  WorkshopTask,
  WorkshopTaskAttachment,
} from "./types";

export const workshopDefinitions: Array<{
  id: string;
  kind: WorkshopKind;
  title: string;
  shortTitle: string;
  description: string;
}> = [
  {
    id: "tics",
    kind: "tics",
    title: "TICS",
    shortTitle: "Tecnologías de la información",
    description:
      "Explora programación, ciudadanía digital y herramientas para crear soluciones.",
  },
  {
    id: "club-lectura",
    kind: "reading",
    title: "Club de lectura",
    shortTitle: "Historias para compartir",
    description:
      "Una biblioteca viva para leer, conversar y descubrir nuevos mundos.",
  },
];

const demoResourceDate = "2026-08-18T15:00:00.000Z";

export const demoWorkshops: Workshop[] = [
  {
    ...workshopDefinitions[0],
    institutionId: "cehf-primaria",
    studentIds: ["demo-student", "demo-student-sofia", "demo-student-diego"],
    teacherIds: ["demo-teacher", "demo-teacher-mariana"],
    managerIds: ["demo-teacher", "demo-teacher-mariana"],
    teacherStudentIds: {
      "demo-teacher": ["demo-student", "demo-student-sofia", "demo-student-diego"],
      "demo-teacher-mariana": ["demo-student-sofia", "demo-student-diego"],
    },
    memberIds: [
      "demo-student",
      "demo-student-sofia",
      "demo-student-diego",
      "demo-teacher",
      "demo-teacher-mariana",
    ],
    resources: [
      {
        id: "demo-tics-resource",
        workshopId: "tics",
        institutionId: "cehf-primaria",
        title: "Reto: mi primera animación",
        description: "Guía paso a paso para crear una historia interactiva.",
        fileName: "reto-animacion.pdf",
        storagePath: "",
        contentType: "application/pdf",
        size: 1_420_000,
        uploadedBy: "demo-teacher",
        uploadedByName: "Mariana López",
        createdAt: demoResourceDate,
      },
    ],
    updatedAt: demoResourceDate,
  },
  {
    ...workshopDefinitions[1],
    institutionId: "cehf-primaria",
    studentIds: ["demo-student", "demo-student-sofia", "demo-student-diego"],
    teacherIds: ["demo-teacher", "demo-teacher-mariana"],
    managerIds: ["demo-teacher", "demo-teacher-mariana"],
    teacherStudentIds: {
      "demo-teacher": ["demo-student", "demo-student-sofia", "demo-student-diego"],
      "demo-teacher-mariana": ["demo-student-sofia", "demo-student-diego"],
    },
    memberIds: [
      "demo-student",
      "demo-student-sofia",
      "demo-student-diego",
      "demo-teacher",
      "demo-teacher-mariana",
    ],
    resources: [
      {
        id: "demo-reading-resource",
        workshopId: "club-lectura",
        institutionId: "cehf-primaria",
        title: "Bitácora de lector",
        description: "Preguntas para guardar frases, personajes y nuevas ideas.",
        fileName: "bitacora-de-lector.pdf",
        storagePath: "",
        contentType: "application/pdf",
        size: 860_000,
        uploadedBy: "demo-teacher",
        uploadedByName: "Mariana López",
        createdAt: demoResourceDate,
      },
    ],
    updatedAt: demoResourceDate,
  },
];

function requireFirebase() {
  if (!firebase.db || !firebase.storage) {
    throw new Error("Firebase no está configurado para Talleres.");
  }
  return { db: firebase.db, storage: firebase.storage };
}

function asIso(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    return value.toDate().toISOString();
  }
  return typeof value === "string" && value
    ? value
    : new Date().toISOString();
}

function stringList(value: unknown) {
  return Array.isArray(value) ? [...new Set(value.map(String).filter(Boolean))] : [];
}

function studentMap(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([teacherId, studentIds]) => [teacherId, stringList(studentIds)])
      .filter(([teacherId]) => Boolean(teacherId)),
  );
}

function resourceFromSnapshot(
  snapshot: QueryDocumentSnapshot<DocumentData>,
): WorkshopResource {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    workshopId: String(data.workshopId ?? ""),
    institutionId: String(data.institutionId ?? ""),
    title: String(data.title ?? "Recurso del taller"),
    description: String(data.description ?? ""),
    fileName: String(data.fileName ?? "archivo"),
    storagePath: String(data.storagePath ?? ""),
    contentType: String(data.contentType ?? "application/octet-stream"),
    size: Number(data.size ?? 0),
    uploadedBy: String(data.uploadedBy ?? ""),
    uploadedByName: String(data.uploadedByName ?? "Equipo docente"),
    createdAt: asIso(data.createdAt),
  };
}

function workshopFromSnapshot(
  snapshot: QueryDocumentSnapshot<DocumentData>,
): Workshop {
  const data = snapshot.data();
  const definition =
    workshopDefinitions.find((item) => item.id === snapshot.id) ??
    workshopDefinitions[0];
  return {
    id: snapshot.id,
    institutionId: String(data.institutionId ?? ""),
    kind: data.kind === "reading" ? "reading" : "tics",
    title: String(data.title ?? definition.title),
    shortTitle: String(data.shortTitle ?? definition.shortTitle),
    description: String(data.description ?? definition.description),
    studentIds: stringList(data.studentIds),
    teacherIds: stringList(data.teacherIds),
    managerIds: stringList(data.managerIds),
    teacherStudentIds: studentMap(data.teacherStudentIds),
    memberIds: stringList(data.memberIds),
    resources: [],
    updatedAt: asIso(data.updatedAt),
  };
}

function workshopCollection(institutionId: string) {
  if (!firebase.db) throw new Error("Firebase no está configurado.");
  return collection(firebase.db, "institutions", institutionId, "workshops");
}

export async function ensureDefaultWorkshops(profile: UserProfile) {
  if (profile.role !== "director" || !firebase.db) return;
  const references = workshopDefinitions.map((definition) =>
    doc(firebase.db!, "institutions", profile.institutionId, "workshops", definition.id),
  );
  const snapshots = await Promise.all(references.map((reference) => getDoc(reference)));
  const missing = snapshots
    .map((snapshot, index) => ({ snapshot, definition: workshopDefinitions[index] }))
    .filter((item) => !item.snapshot.exists());
  if (!missing.length) return;
  const batch = writeBatch(firebase.db);
  missing.forEach(({ snapshot, definition }) => {
    batch.set(snapshot.ref, {
      ...definition,
      institutionId: profile.institutionId,
      studentIds: [],
      teacherIds: [],
      managerIds: [],
      teacherStudentIds: {},
      memberIds: [],
      createdBy: profile.uid,
      createdByName: profile.name,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: profile.uid,
    });
  });
  await batch.commit();
}

export function watchWorkshops(
  profile: UserProfile,
  callback: (workshops: Workshop[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!firebase.db) {
    callback([]);
    return () => undefined;
  }
  const source =
    profile.role === "director"
      ? query(workshopCollection(profile.institutionId))
      : query(
          workshopCollection(profile.institutionId),
          where("memberIds", "array-contains", profile.uid),
        );
  return onSnapshot(
    source,
    (snapshot) =>
      callback(
        snapshot.docs
          .map(workshopFromSnapshot)
          .sort(
            (first, second) =>
              workshopDefinitions.findIndex((item) => item.id === first.id) -
              workshopDefinitions.findIndex((item) => item.id === second.id),
          ),
      ),
    (error) => onError?.(error),
  );
}

export function watchWorkshopResources(
  institutionId: string,
  workshopIds: string[],
  callback: (resources: Record<string, WorkshopResource[]>) => void,
  onError?: (error: Error) => void,
) {
  if (!firebase.db || !workshopIds.length) {
    callback({});
    return () => undefined;
  }
  const resourcesByWorkshop: Record<string, WorkshopResource[]> = {};
  const emit = () => callback({ ...resourcesByWorkshop });
  const unsubscribes = workshopIds.map((workshopId) =>
    onSnapshot(
      collection(
        firebase.db!,
        "institutions",
        institutionId,
        "workshops",
        workshopId,
        "resources",
      ),
      (snapshot) => {
        resourcesByWorkshop[workshopId] = snapshot.docs
          .map(resourceFromSnapshot)
          .sort((first, second) => second.createdAt.localeCompare(first.createdAt));
        emit();
      },
      (error) => onError?.(error),
    ),
  );
  return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
}

export async function updateWorkshopAccess(
  workshop: Workshop,
  access: WorkshopAccessInput,
  profile: UserProfile,
) {
  if (profile.role !== "director") {
    throw new Error("Sólo Dirección puede administrar el acceso a Talleres.");
  }
  const { db } = requireFirebase();
  const studentIds = [...new Set(access.studentIds.filter(Boolean))];
  const teacherIds = [...new Set(access.teacherIds.filter(Boolean))];
  const managerIds = [
    ...new Set(access.managerIds.filter((id) => teacherIds.includes(id))),
  ];
  const teacherStudentIds = Object.fromEntries(
    managerIds.map((teacherId) => [
      teacherId,
      [
        ...new Set(
          (access.teacherStudentIds[teacherId] ?? []).filter((studentId) =>
            studentIds.includes(studentId),
          ),
        ),
      ],
    ]),
  );
  await updateDoc(
    doc(db, "institutions", profile.institutionId, "workshops", workshop.id),
    {
      studentIds,
      teacherIds,
      managerIds,
      teacherStudentIds,
      memberIds: [...new Set([...studentIds, ...teacherIds])],
      updatedAt: serverTimestamp(),
      updatedBy: profile.uid,
      updatedByName: profile.name,
    },
  );
}

function safeFileName(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.slice(0, 120) || "recurso";
}

export async function uploadWorkshopResource(
  workshop: Workshop,
  profile: UserProfile,
  input: { title: string; description: string; file: File },
) {
  const { db, storage } = requireFirebase();
  if (input.file.size <= 0 || input.file.size >= 20 * 1024 * 1024) {
    throw new Error("El archivo debe pesar menos de 20 MB.");
  }
  const resourceReference = doc(
    collection(
      db,
      "institutions",
      profile.institutionId,
      "workshops",
      workshop.id,
      "resources",
    ),
  );
  const storagePath = `institutions/${profile.institutionId}/workshops/${workshop.id}/resources/${resourceReference.id}/${safeFileName(input.file.name)}`;
  const storageReference = ref(storage, storagePath);
  await uploadBytes(storageReference, input.file, {
    contentType: input.file.type || "application/octet-stream",
    customMetadata: {
      workshopId: workshop.id,
      uploadedBy: profile.uid,
    },
  });
  try {
    await setDoc(resourceReference, {
      institutionId: profile.institutionId,
      workshopId: workshop.id,
      title: input.title.trim(),
      description: input.description.trim(),
      fileName: input.file.name,
      storagePath,
      contentType: input.file.type || "application/octet-stream",
      size: input.file.size,
      uploadedBy: profile.uid,
      uploadedByName: profile.name,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    await deleteObject(storageReference).catch(() => undefined);
    throw error;
  }
  return resourceReference.id;
}

export async function deleteWorkshopResource(resource: WorkshopResource) {
  const { db, storage } = requireFirebase();
  await deleteDoc(
    doc(
      db,
      "institutions",
      resource.institutionId,
      "workshops",
      resource.workshopId,
      "resources",
      resource.id,
    ),
  );
  if (resource.storagePath) {
    await deleteObject(ref(storage, resource.storagePath)).catch(() => undefined);
  }
}

export async function getWorkshopResourceUrl(resource: WorkshopResource) {
  if (!resource.storagePath) {
    throw new Error("Este recurso pertenece a la demostración.");
  }
  const { storage } = requireFirebase();
  return getDownloadURL(ref(storage, resource.storagePath));
}

export type WorkshopTaskCreateInput = {
  title: string;
  description: string;
  dueAt: string;
  status: "draft" | "published";
  audienceStudentIds: string[];
  files: File[];
};

export const demoWorkshopTasks: WorkshopTask[] = [
  {
    id: "demo-task-tics",
    workshopId: "tics",
    institutionId: "cehf-primaria",
    title: "Diseña una animación interactiva",
    description:
      "Crea una escena con al menos dos personajes, movimiento y un mensaje sobre ciudadanía digital.",
    dueAt: "2026-08-28T23:00:00.000Z",
    status: "published",
    audienceStudentIds: ["demo-student", "demo-student-sofia", "demo-student-diego"],
    attachments: [],
    createdBy: "demo-teacher",
    teacherName: "Mariana López",
    createdAt: "2026-08-19T15:00:00.000Z",
    updatedAt: "2026-08-19T15:00:00.000Z",
  },
  {
    id: "demo-task-reading",
    workshopId: "club-lectura",
    institutionId: "cehf-primaria",
    title: "Carta a un personaje",
    description:
      "Escribe una carta breve a tu personaje favorito y cuéntale qué decisión suya te hizo pensar.",
    dueAt: "2026-08-30T20:00:00.000Z",
    status: "published",
    audienceStudentIds: ["demo-student", "demo-student-sofia", "demo-student-diego"],
    attachments: [],
    createdBy: "demo-teacher",
    teacherName: "Mariana López",
    createdAt: "2026-08-19T15:30:00.000Z",
    updatedAt: "2026-08-19T15:30:00.000Z",
  },
];

function attachmentFromData(value: unknown): WorkshopTaskAttachment | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const storagePath = String(data.storagePath ?? "");
  const name = String(data.name ?? "");
  if (!storagePath || !name) return null;
  return {
    id: String(data.id ?? storagePath),
    name,
    storagePath,
    contentType: String(data.contentType ?? "application/octet-stream"),
    size: Number(data.size ?? 0),
  };
}

function attachmentsFromData(value: unknown) {
  return Array.isArray(value)
    ? value
        .map(attachmentFromData)
        .filter((item): item is WorkshopTaskAttachment => Boolean(item))
    : [];
}

function taskFromSnapshot(
  snapshot: QueryDocumentSnapshot<DocumentData>,
): WorkshopTask {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    workshopId: String(data.workshopId ?? ""),
    institutionId: String(data.institutionId ?? ""),
    title: String(data.title ?? "Trabajo del taller"),
    description: String(data.description ?? ""),
    dueAt: asIso(data.dueAt),
    status: ["draft", "closed"].includes(String(data.status))
      ? (String(data.status) as WorkshopTask["status"])
      : "published",
    audienceStudentIds: stringList(data.audienceStudentIds),
    attachments: attachmentsFromData(data.attachments),
    createdBy: String(data.createdBy ?? ""),
    teacherName: String(data.teacherName ?? "Equipo docente"),
    createdAt: asIso(data.createdAt),
    updatedAt: asIso(data.updatedAt),
  };
}

function submissionFromData(
  id: string,
  data: DocumentData,
): WorkshopSubmission {
  return {
    id,
    taskId: String(data.taskId ?? ""),
    workshopId: String(data.workshopId ?? ""),
    institutionId: String(data.institutionId ?? ""),
    studentId: String(data.studentId ?? id),
    studentName: String(data.studentName ?? "Alumno CEHF"),
    content: String(data.content ?? ""),
    attachments: attachmentsFromData(data.attachments),
    version: Math.max(1, Number(data.version ?? 1)),
    status: ["feedback", "reviewed"].includes(String(data.status))
      ? (String(data.status) as WorkshopSubmission["status"])
      : "submitted",
    teacherFeedback: String(data.teacherFeedback ?? ""),
    submittedAt: asIso(data.submittedAt),
    feedbackAt: data.feedbackAt ? asIso(data.feedbackAt) : undefined,
    reviewedAt: data.reviewedAt ? asIso(data.reviewedAt) : undefined,
    updatedAt: asIso(data.updatedAt),
  };
}

function taskCollection(institutionId: string, workshopId: string) {
  if (!firebase.db) throw new Error("Firebase no está configurado.");
  return collection(
    firebase.db,
    "institutions",
    institutionId,
    "workshops",
    workshopId,
    "tasks",
  );
}

export function watchWorkshopTasks(
  workshop: Workshop,
  profile: UserProfile,
  callback: (tasks: WorkshopTask[]) => void,
  onError?: (error: Error) => void,
) {
  if (!firebase.db) {
    callback([]);
    return () => undefined;
  }
  const source =
    profile.role === "director"
      ? query(taskCollection(profile.institutionId, workshop.id))
      : profile.role === "teacher"
        ? query(
            taskCollection(profile.institutionId, workshop.id),
            where("createdBy", "==", profile.uid),
          )
        : query(
            taskCollection(profile.institutionId, workshop.id),
            where("audienceStudentIds", "array-contains", profile.uid),
            where("status", "in", ["published", "closed"]),
          );
  return onSnapshot(
    source,
    (snapshot) =>
      callback(
        snapshot.docs
          .map(taskFromSnapshot)
          .sort((first, second) => second.createdAt.localeCompare(first.createdAt)),
      ),
    (error) => onError?.(error),
  );
}

async function uploadWorkshopFiles(
  prefix: string,
  files: File[],
): Promise<WorkshopTaskAttachment[]> {
  const { storage } = requireFirebase();
  const uploaded: Array<{
    attachment: WorkshopTaskAttachment;
    storageReference: ReturnType<typeof ref>;
  }> = [];
  try {
    for (const file of files) {
      if (file.size <= 0 || file.size >= 20 * 1024 * 1024) {
        throw new Error(`“${file.name}” debe pesar menos de 20 MB.`);
      }
      const id = crypto.randomUUID();
      const storagePath = `${prefix}/${id}/${safeFileName(file.name)}`;
      const storageReference = ref(storage, storagePath);
      await uploadBytes(storageReference, file, {
        contentType: file.type || "application/octet-stream",
      });
      uploaded.push({
        storageReference,
        attachment: {
          id,
          name: file.name,
          storagePath,
          contentType: file.type || "application/octet-stream",
          size: file.size,
        },
      });
    }
    return uploaded.map((item) => item.attachment);
  } catch (error) {
    await Promise.all(
      uploaded.map((item) => deleteObject(item.storageReference).catch(() => undefined)),
    );
    throw error;
  }
}

export async function createWorkshopTask(
  workshop: Workshop,
  profile: UserProfile,
  input: WorkshopTaskCreateInput,
) {
  const allowedStudents =
    profile.role === "director"
      ? workshop.studentIds
      : workshop.teacherStudentIds[profile.uid] ?? [];
  const audienceStudentIds = [
    ...new Set(
      input.audienceStudentIds.filter((studentId) =>
        allowedStudents.includes(studentId),
      ),
    ),
  ];
  if (!audienceStudentIds.length) {
    throw new Error("Selecciona al menos un alumno de tu grupo.");
  }
  const reference = doc(taskCollection(profile.institutionId, workshop.id));
  const prefix = `institutions/${profile.institutionId}/workshops/${workshop.id}/tasks/${reference.id}/resources`;
  const attachments = await uploadWorkshopFiles(prefix, input.files);
  try {
    await setDoc(reference, {
      institutionId: profile.institutionId,
      workshopId: workshop.id,
      title: input.title.trim(),
      description: input.description.trim(),
      dueAt: new Date(input.dueAt),
      status: input.status,
      audienceStudentIds,
      attachments,
      createdBy: profile.uid,
      teacherName: profile.name,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    await Promise.all(
      attachments.map((attachment) =>
        deleteObject(ref(firebase.storage!, attachment.storagePath)).catch(() => undefined),
      ),
    );
    throw error;
  }
  return reference.id;
}

export async function setWorkshopTaskStatus(
  task: WorkshopTask,
  status: WorkshopTask["status"],
) {
  const { db } = requireFirebase();
  await updateDoc(
    doc(
      db,
      "institutions",
      task.institutionId,
      "workshops",
      task.workshopId,
      "tasks",
      task.id,
    ),
    { status, updatedAt: serverTimestamp() },
  );
}

export function watchWorkshopSubmissions(
  task: WorkshopTask,
  profile: UserProfile,
  callback: (submissions: WorkshopSubmission[]) => void,
  onError?: (error: Error) => void,
) {
  if (!firebase.db) {
    callback([]);
    return () => undefined;
  }
  const submissions = collection(
    firebase.db,
    "institutions",
    task.institutionId,
    "workshops",
    task.workshopId,
    "tasks",
    task.id,
    "submissions",
  );
  if (profile.role === "student") {
    return onSnapshot(
      doc(submissions, profile.uid),
      (snapshot) =>
        callback(snapshot.exists() ? [submissionFromData(snapshot.id, snapshot.data())] : []),
      (error) => onError?.(error),
    );
  }
  return onSnapshot(
    submissions,
    (snapshot) =>
      callback(
        snapshot.docs
          .map((entry) => submissionFromData(entry.id, entry.data()))
          .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt)),
      ),
    (error) => onError?.(error),
  );
}

export async function submitWorkshopTask(
  task: WorkshopTask,
  profile: UserProfile,
  input: { content: string; files: File[] },
) {
  if (profile.role !== "student") {
    throw new Error("Sólo los alumnos pueden enviar este trabajo.");
  }
  const { db } = requireFirebase();
  const submissionReference = doc(
    db,
    "institutions",
    task.institutionId,
    "workshops",
    task.workshopId,
    "tasks",
    task.id,
    "submissions",
    profile.uid,
  );
  const previous = await getDoc(submissionReference);
  const version = previous.exists() ? Number(previous.data().version ?? 1) + 1 : 1;
  const prefix = `institutions/${task.institutionId}/workshops/${task.workshopId}/tasks/${task.id}/submissions/${profile.uid}/${version}`;
  const attachments = await uploadWorkshopFiles(prefix, input.files);
  const payload = {
    institutionId: task.institutionId,
    workshopId: task.workshopId,
    taskId: task.id,
    studentId: profile.uid,
    studentName: previous.exists()
      ? String(previous.data().studentName ?? profile.name)
      : profile.name,
    content: input.content.trim(),
    attachments,
    version,
    status: "submitted",
    teacherFeedback: "",
    submittedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const batch = writeBatch(db);
  batch.set(submissionReference, payload);
  batch.set(doc(collection(submissionReference, "history"), `version-${version}`), payload);
  try {
    await batch.commit();
  } catch (error) {
    await Promise.all(
      attachments.map((attachment) =>
        deleteObject(ref(firebase.storage!, attachment.storagePath)).catch(() => undefined),
      ),
    );
    throw error;
  }
}

export async function saveWorkshopFeedback(
  task: WorkshopTask,
  submission: WorkshopSubmission,
  feedback: string,
  reviewed: boolean,
) {
  const { db } = requireFirebase();
  await updateDoc(
    doc(
      db,
      "institutions",
      task.institutionId,
      "workshops",
      task.workshopId,
      "tasks",
      task.id,
      "submissions",
      submission.studentId,
    ),
    {
      teacherFeedback: feedback.trim(),
      status: reviewed ? "reviewed" : "feedback",
      feedbackAt: serverTimestamp(),
      reviewedAt: reviewed ? serverTimestamp() : null,
      updatedAt: serverTimestamp(),
    },
  );
}

export async function getWorkshopTaskAttachmentUrl(
  attachment: WorkshopTaskAttachment,
) {
  const { storage } = requireFirebase();
  return getDownloadURL(ref(storage, attachment.storagePath));
}
