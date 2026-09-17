"use client";

import {
  collection,
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
import { httpsCallable } from "firebase/functions";
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
  WorkshopLink,
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
      "Explora nuevas herramientas digitales y aprende a usarlas de manera responsable y creativa.",
  },
  {
    id: "reading",
    kind: "reading",
    title: "Club de lectura",
    shortTitle: "Historias para compartir",
    description:
      "Una biblioteca viva para leer, conversar y descubrir nuevos mundos.",
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

function normalizeZoomUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    const hostname = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      (hostname !== "zoom.us" && !hostname.endsWith(".zoom.us"))
    ) {
      throw new Error();
    }
    return url.toString();
  } catch {
    throw new Error("Escribe un enlace válido de Zoom que comience con https://.");
  }
}

function workshopLinksFromData(value: unknown): WorkshopLink[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const link = item as Record<string, unknown>;
    const label = String(link.label ?? "").trim();
    const url = String(link.url ?? "").trim();
    return label && /^https?:\/\//i.test(url) ? [{ label, url }] : [];
  });
}

function normalizeWorkshopLinks(links: WorkshopLink[]): WorkshopLink[] {
  if (links.length > 10) throw new Error("Puedes agregar hasta 10 enlaces.");
  return links.map((link, index) => {
    const label = link.label.trim();
    const url = link.url.trim();
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`El enlace ${index + 1} no es válido.`);
    }
    if (!label || label.length > 100 || url.length > 2000 || !["http:", "https:"].includes(parsed.protocol)) {
      throw new Error(`Revisa el nombre y la URL del enlace ${index + 1}.`);
    }
    return { label, url: parsed.toString() };
  });
}

function requirePersistedWorkshopLinks(
  result: { updated: boolean; links?: WorkshopLink[] },
  expected: WorkshopLink[],
) {
  const persisted = workshopLinksFromData(result.links);
  const matches =
    result.updated === true &&
    persisted.length === expected.length &&
    persisted.every(
      (link, index) =>
        link.label === expected[index]?.label && link.url === expected[index]?.url,
    );

  if (!matches) {
    throw new Error(
      "El servidor no confirmó los enlaces del taller. Recarga la página e inténtalo de nuevo.",
    );
  }

  return result;
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
    links: workshopLinksFromData(data.links),
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
    zoomUrl: String(data.zoomUrl ?? ""),
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
  const candidates = await Promise.all(
    workshopDefinitions.map(async (definition) => {
      const reference = doc(
        firebase.db!,
        "institutions",
        profile.institutionId,
        "workshops",
        definition.id,
      );
      const aliases = definition.kind === "reading" ? [reference, doc(firebase.db!, "institutions", profile.institutionId, "workshops", "club-lectura")] : [reference];
      const snapshots = await Promise.all(aliases.map((item) => getDoc(item)));
      return { reference, definition, exists: snapshots.some((snapshot) => snapshot.exists()) };
    }),
  );
  const missing = candidates.filter((item) => !item.exists);
  if (!missing.length) return;
  const batch = writeBatch(firebase.db);
  missing.forEach(({ reference, definition }) => {
    batch.set(reference, {
      ...definition,
      institutionId: profile.institutionId,
      studentIds: [],
      teacherIds: [],
      managerIds: [],
      teacherStudentIds: {},
      memberIds: [],
      zoomUrl: "",
      createdBy: profile.uid,
      createdByName: profile.name,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: profile.uid,
    });
  });
  await batch.commit();
}

function uniqueWorkshops(workshops: Workshop[]) {
  const byKind = new Map<WorkshopKind, Workshop>();
  workshops.forEach((workshop) => {
    const current = byKind.get(workshop.kind);
    const canonicalId = workshopDefinitions.find(
      (definition) => definition.kind === workshop.kind,
    )?.id;
    const priority = (item: Workshop) =>
      item.memberIds.length * 10 + item.studentIds.length + item.teacherIds.length +
      (item.id === canonicalId ? 1 : 0);
    if (!current || priority(workshop) > priority(current)) {
      byKind.set(workshop.kind, workshop);
    }
  });
  return workshopDefinitions
    .map((definition) => byKind.get(definition.kind))
    .filter((workshop): workshop is Workshop => Boolean(workshop));
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
    (snapshot) => callback(uniqueWorkshops(snapshot.docs.map(workshopFromSnapshot))),
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
  const zoomUrl = normalizeZoomUrl(access.zoomUrl);
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
      zoomUrl,
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
  input: { title: string; description: string; file: File; links: WorkshopLink[] },
) {
  const { db, storage } = requireFirebase();
  const links = normalizeWorkshopLinks(input.links);
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
      links,
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
  if (!firebase.functions) throw new Error("Firebase no está configurado para Talleres.");
  const callable = httpsCallable<
    { workshopId: string; resourceId: string },
    { deleted: boolean }
  >(firebase.functions, "deleteWorkshopResource");
  return (await callable({ workshopId: resource.workshopId, resourceId: resource.id })).data;
}

export async function updateWorkshopResource(
  resource: WorkshopResource,
  input: Pick<WorkshopResource, "title" | "description" | "links">,
) {
  if (!firebase.functions) throw new Error("Firebase no está configurado para Talleres.");
  const links = normalizeWorkshopLinks(input.links);
  const callable = httpsCallable<
    { entityType: "workshop_resource"; workshopId: string; resourceId: string } & typeof input,
    { updated: boolean; links?: WorkshopLink[] }
  >(firebase.functions, "updateManagedContent");
  const result = (await callable({ entityType: "workshop_resource", workshopId: resource.workshopId, resourceId: resource.id, ...input, links })).data;
  return requirePersistedWorkshopLinks(result, links);
}

export async function getWorkshopResourceUrl(resource: WorkshopResource) {
  if (!resource.storagePath) {
    throw new Error("Este recurso no tiene un archivo disponible.");
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
  links: WorkshopLink[];
};

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

function taskFromData(id: string, data: DocumentData): WorkshopTask {
  return {
    id,
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
    links: workshopLinksFromData(data.links),
    createdBy: String(data.createdBy ?? ""),
    teacherName: String(data.teacherName ?? "Equipo docente"),
    createdAt: asIso(data.createdAt),
    updatedAt: asIso(data.updatedAt),
  };
}

function taskFromSnapshot(
  snapshot: QueryDocumentSnapshot<DocumentData>,
): WorkshopTask {
  return taskFromData(snapshot.id, snapshot.data());
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

  if (profile.role === "student") {
    if (!firebase.functions) {
      onError?.(new Error("Firebase Functions no está configurado para Talleres."));
      return () => undefined;
    }
    let active = true;
    const callable = httpsCallable<
      { workshopId: string },
      { tasks: Array<Record<string, unknown>> }
    >(firebase.functions, "listStudentWorkshopTasks");
    void callable({ workshopId: workshop.id })
      .then(({ data }) => {
        if (!active) return;
        callback(
          data.tasks
            .map((task) => taskFromData(String(task.id ?? ""), task))
            .sort((first, second) =>
              second.createdAt.localeCompare(first.createdAt),
            ),
        );
      })
      .catch((error: unknown) => {
        if (active) {
          onError?.(
            error instanceof Error
              ? error
              : new Error("No pudimos cargar las actividades del taller."),
          );
        }
      });
    return () => {
      active = false;
    };
  }

  const source =
    profile.role === "director"
      ? query(taskCollection(profile.institutionId, workshop.id))
      : query(
          taskCollection(profile.institutionId, workshop.id),
          where("createdBy", "==", profile.uid),
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
  const links = normalizeWorkshopLinks(input.links);
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
      links,
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

export async function deleteWorkshopTask(task: WorkshopTask) {
  if (!firebase.functions) throw new Error("Firebase no está configurado para Talleres.");
  const callable = httpsCallable<
    { workshopId: string; taskId: string },
    { deleted: boolean }
  >(firebase.functions, "deleteWorkshopTask");
  return (await callable({ workshopId: task.workshopId, taskId: task.id })).data;
}

export async function updateWorkshopTask(
  task: WorkshopTask,
  input: Pick<WorkshopTask, "title" | "description" | "dueAt" | "links">,
) {
  if (!firebase.functions) throw new Error("Firebase no está configurado para Talleres.");
  const links = normalizeWorkshopLinks(input.links);
  const callable = httpsCallable<
    { entityType: "workshop_task"; workshopId: string; taskId: string } & typeof input,
    { updated: boolean; links?: WorkshopLink[] }
  >(firebase.functions, "updateManagedContent");
  const result = (await callable({ entityType: "workshop_task", workshopId: task.workshopId, taskId: task.id, ...input, links })).data;
  return requirePersistedWorkshopLinks(result, links);
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
