"use client";

import {
  collection,
  collectionGroup,
  deleteField,
  doc,
  getDoc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryConstraint,
  type Unsubscribe,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { firebase } from "./firebase";
import { normalizeForumRichText } from "./forum-rich-text";
import type {
  AcademicCalendar,
  AcademicCalendarInput,
  AcademicConfig,
  AcademicNonWorkingDay,
  AcademicTerm,
  AcademicWeek,
  AppNotification,
  TaskAssignment,
  TaskAttachment,
  TaskCreateInput,
  TaskExtension,
  TaskHistoryEvent,
  TaskHistoryEventType,
  TaskResource,
  TaskResourceView,
  TaskSubmission,
  UserProfile,
} from "./types";

const INSTITUTION_ID = "cehf-primaria";

export const defaultAcademicConfig: AcademicConfig = {
  institutionId: INSTITUTION_ID,
  schoolYearId: "cicloescolar26-27",
  schoolYearLabel: "2026–2027",
  termId: "bimestre1",
  termLabel: "Bimestre 1",
  weekId: "semana1",
  weekLabel: "Semana 1",
  timezone: "America/Mexico_City",
  calendarStatus: "active",
  weekStartDate: "2026-08-17",
  weekEndDate: "2026-08-21",
};

export const defaultAcademicCalendar: AcademicCalendar = {
  schoolYearId: defaultAcademicConfig.schoolYearId,
  configured: true,
  weeks: [
    {
      id: "semana1",
      label: "Semana 1",
      startDate: "2026-08-17",
      endDate: "2026-08-21",
      startAt: "2026-08-17T06:00:00.000Z",
      endAt: "2026-08-22T06:00:00.000Z",
      order: 1,
      active: true,
    },
  ],
  terms: [
    {
      id: "bimestre1",
      label: "Bimestre 1",
      weekIds: ["semana1"],
      startDate: "2026-08-17",
      endDate: "2026-08-21",
      order: 1,
      active: true,
    },
  ],
  nonWorkingDays: [],
};

export const emptyAcademicCalendar: AcademicCalendar = {
  schoolYearId: defaultAcademicConfig.schoolYearId,
  configured: false,
  weeks: [],
  terms: [],
  nonWorkingDays: [],
};

function requireFirebase() {
  if (!firebase.db || !firebase.storage) {
    throw new Error("Firebase no está configurado para el flujo de tareas.");
  }
  return { db: firebase.db, storage: firebase.storage };
}

function asIso(value: unknown, fallback = new Date().toISOString()) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    return value.toDate().toISOString();
  }
  return typeof value === "string" && value ? value : fallback;
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "general";
}

function academicTaskCollection(config: AcademicConfig, subjectId: string) {
  const { db } = requireFirebase();
  return collection(
    db,
    "institutions",
    config.institutionId,
    "ciclosEscolares",
    config.schoolYearId,
    "bimestres",
    config.termId,
    "semanas",
    config.weekId,
    "materias",
    subjectId,
    "tareas",
  );
}

export function isFirebaseTaskAssignment(task: TaskAssignment) {
  const segments = task.firestorePath.split("/").filter(Boolean);
  return (
    segments.length === 12 &&
    segments[0] === "institutions" &&
    segments[2] === "ciclosEscolares" &&
    segments[4] === "bimestres" &&
    segments[6] === "semanas" &&
    segments[8] === "materias" &&
    segments[10] === "tareas" &&
    segments[11] === task.id
  );
}

function taskRef(task: TaskAssignment) {
  if (!isFirebaseTaskAssignment(task)) {
    throw new Error("La ruta de esta tarea no es válida.");
  }
  const { db } = requireFirebase();
  return doc(db, task.firestorePath);
}

function attachmentFromData(value: unknown): TaskAttachment | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (!data.storagePath || !data.name) return null;
  const storagePath = String(data.storagePath);
  const storageAssetId = storagePath.split("/").filter(Boolean).at(-1);
  const explicitId = String(data.id ?? "").trim();
  return {
    id: explicitId || storageAssetId || crypto.randomUUID(),
    name: String(data.name),
    storagePath,
    contentType: String(data.contentType ?? "application/octet-stream"),
    size: Number(data.size ?? 0),
    downloadUrl: data.downloadUrl ? String(data.downloadUrl) : undefined,
  };
}

function resourceViewFromData(data: DocumentData): TaskResourceView {
  return {
    institutionId: String(data.institutionId ?? ""),
    taskId: String(data.taskId ?? ""),
    resourceId: String(data.resourceId ?? ""),
    resourceKind: data.resourceKind === "link" ? "link" : "attachment",
    resourceLabel: String(data.resourceLabel ?? "Recurso"),
    studentId: String(data.studentId ?? ""),
    studentName: String(data.studentName ?? "Alumno"),
    firstOpenedAt: asIso(data.firstOpenedAt),
    lastOpenedAt: asIso(data.lastOpenedAt),
    viewCount: Math.max(1, Number(data.viewCount ?? 1)),
  };
}

function attachmentsFromData(value: unknown) {
  return Array.isArray(value)
    ? value.map(attachmentFromData).filter(Boolean) as TaskAttachment[]
    : [];
}

function taskFromData(
  id: string,
  firestorePath: string,
  data: DocumentData,
): TaskAssignment {
  return {
    id,
    firestorePath,
    institutionId: String(data.institutionId ?? INSTITUTION_ID),
    schoolYearId: String(data.schoolYearId ?? defaultAcademicConfig.schoolYearId),
    schoolYearLabel: String(
      data.schoolYearLabel ?? defaultAcademicConfig.schoolYearLabel,
    ),
    termId: String(data.termId ?? defaultAcademicConfig.termId),
    termLabel: String(data.termLabel ?? defaultAcademicConfig.termLabel),
    weekId: String(data.weekId ?? defaultAcademicConfig.weekId),
    weekLabel: String(data.weekLabel ?? defaultAcademicConfig.weekLabel),
    subjectId: String(data.subjectId ?? slugify(String(data.subject ?? "General"))),
    subject: String(data.subject ?? "General"),
    title: String(data.title ?? "Actividad sin nombre"),
    description: String(data.description ?? ""),
    dueAt: asIso(data.dueAt),
    publishAt: data.publishAt ? asIso(data.publishAt) : undefined,
    publishedAt: data.publishedAt ? asIso(data.publishedAt) : undefined,
    closedAt: data.closedAt ? asIso(data.closedAt) : undefined,
    status: data.status ?? "draft",
    publicationMode: data.publicationMode ?? "draft",
    targetGroup: String(data.targetGroup ?? "5.º A"),
    links: Array.isArray(data.links)
      ? data.links.map((link: Record<string, unknown>) => ({
          id: String(link.id ?? crypto.randomUUID()),
          label: String(link.label ?? "Enlace"),
          url: String(link.url ?? ""),
        }))
      : [],
    attachments: attachmentsFromData(data.attachments),
    createdBy: String(data.createdBy ?? ""),
    teacherName: String(data.teacherName ?? "Docente CEHF"),
    createdAt: asIso(data.createdAt),
    updatedAt: asIso(data.updatedAt),
  };
}

function submissionFromData(id: string, data: DocumentData): TaskSubmission {
  return {
    id,
    studentId: String(data.studentId ?? id),
    studentName: String(data.studentName ?? "Alumno"),
    teacherId: String(data.teacherId ?? ""),
    taskId: String(data.taskId ?? ""),
    content: String(data.content ?? ""),
    contentRich: data.contentRich ? String(data.contentRich) : undefined,
    attachments: attachmentsFromData(data.attachments),
    status: data.status ?? "draft",
    version: Number(data.version ?? 0),
    submittedAt: data.submittedAt ? asIso(data.submittedAt) : undefined,
    updatedAt: asIso(data.updatedAt),
    teacherFeedback: data.teacherFeedback
      ? String(data.teacherFeedback)
      : undefined,
    teacherFeedbackRich: data.teacherFeedbackRich
      ? String(data.teacherFeedbackRich)
      : undefined,
    feedbackAt: data.feedbackAt ? asIso(data.feedbackAt) : undefined,
    reviewedAt: data.reviewedAt ? asIso(data.reviewedAt) : undefined,
  };
}

function historyFromData(id: string, data: DocumentData): TaskHistoryEvent {
  return {
    id,
    type: data.type,
    authorId: String(data.authorId ?? ""),
    authorName: String(data.authorName ?? "Campus CEHF"),
    authorRole: data.authorRole ?? "teacher",
    message: String(data.message ?? ""),
    messageRich: data.messageRich ? String(data.messageRich) : undefined,
    createdAt: asIso(data.createdAt),
    version: data.version ? Number(data.version) : undefined,
    attachments: attachmentsFromData(data.attachments),
    studentId: data.studentId ? String(data.studentId) : undefined,
    studentName: data.studentName ? String(data.studentName) : undefined,
    dueAt: data.dueAt ? asIso(data.dueAt) : undefined,
  };
}

export function watchAcademicConfig(
  institutionId: string,
  callback: (config: AcademicConfig) => void,
  onError?: (error: Error) => void,
) {
  if (!firebase.db) {
    callback({ ...defaultAcademicConfig, institutionId });
    return () => undefined;
  }
  return onSnapshot(
    doc(firebase.db, "institutions", institutionId, "configuracion", "academica"),
    (snapshot) => {
      if (!snapshot.exists()) {
        callback({ ...defaultAcademicConfig, institutionId });
        return;
      }
      callback({
        ...defaultAcademicConfig,
        ...snapshot.data(),
        institutionId,
      } as AcademicConfig);
    },
    (error) => onError?.(error),
  );
}

function weekFromData(id: string, data: DocumentData): AcademicWeek {
  return {
    id,
    label: String(data.label ?? "Semana"),
    startDate: String(data.startDate ?? ""),
    endDate: String(data.endDate ?? ""),
    startAt: asIso(data.startAt, ""),
    endAt: asIso(data.endAt, ""),
    order: Number(data.order ?? 0),
    active: data.active !== false,
  };
}

function termFromData(id: string, data: DocumentData): AcademicTerm {
  return {
    id,
    label: String(data.label ?? "Bimestre"),
    weekIds: Array.isArray(data.weekIds) ? data.weekIds.map(String) : [],
    startDate: String(data.startDate ?? ""),
    endDate: String(data.endDate ?? ""),
    order: Number(data.order ?? 0),
    active: data.active !== false,
  };
}

function nonWorkingDayFromData(id: string, data: DocumentData): AcademicNonWorkingDay {
  return {
    id,
    date: String(data.date ?? id),
    label: String(data.label ?? "Día no laboral"),
    weekId: String(data.weekId ?? ""),
    weekLabel: String(data.weekLabel ?? "Semana"),
    termId: String(data.termId ?? ""),
    termLabel: String(data.termLabel ?? "Bimestre"),
    active: data.active !== false,
  };
}

export function watchAcademicCalendar(
  config: AcademicConfig,
  callback: (calendar: AcademicCalendar) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!firebase.db) {
    callback(defaultAcademicCalendar);
    return () => undefined;
  }
  let weeks: AcademicWeek[] = [];
  let terms: AcademicTerm[] = [];
  let nonWorkingDays: AcademicNonWorkingDay[] = [];
  let weeksReady = false;
  let termsReady = false;
  let nonWorkingDaysReady = false;
  const emit = () => {
    if (!weeksReady || !termsReady || !nonWorkingDaysReady) return;
    callback({
      schoolYearId: config.schoolYearId,
      weeks,
      terms,
      nonWorkingDays,
      configured: weeks.length > 0 && terms.length > 0,
    });
  };
  const stopWeeks = onSnapshot(
    collection(
      firebase.db,
      "institutions",
      config.institutionId,
      "ciclosEscolares",
      config.schoolYearId,
      "semanas",
    ),
    (snapshot) => {
      weeks = snapshot.docs
        .map((entry) => weekFromData(entry.id, entry.data()))
        .filter((week) => week.active)
        .sort(
          (first, second) =>
            first.startDate.localeCompare(second.startDate) ||
            first.order - second.order,
        );
      weeksReady = true;
      emit();
    },
    (error) => onError?.(error),
  );
  const stopTerms = onSnapshot(
    collection(
      firebase.db,
      "institutions",
      config.institutionId,
      "ciclosEscolares",
      config.schoolYearId,
      "bimestres",
    ),
    (snapshot) => {
      terms = snapshot.docs
        .map((entry) => termFromData(entry.id, entry.data()))
        .filter((term) => term.active)
        .sort((first, second) => first.order - second.order);
      termsReady = true;
      emit();
    },
    (error) => onError?.(error),
  );
  const stopNonWorkingDays = onSnapshot(
    collection(
      firebase.db,
      "institutions",
      config.institutionId,
      "ciclosEscolares",
      config.schoolYearId,
      "diasNoLaborales",
    ),
    (snapshot) => {
      nonWorkingDays = snapshot.docs
        .map((entry) => nonWorkingDayFromData(entry.id, entry.data()))
        .filter((day) => day.active)
        .sort((first, second) => first.date.localeCompare(second.date));
      nonWorkingDaysReady = true;
      emit();
    },
    (error) => onError?.(error),
  );
  return () => {
    stopWeeks();
    stopTerms();
    stopNonWorkingDays();
  };
}

export function resolveAcademicConfig(
  config: AcademicConfig,
  calendar: AcademicCalendar,
  now = new Date(),
): AcademicConfig {
  const nowTime = now.getTime();
  const currentWeek = calendar.weeks.find((week) => {
    const starts = new Date(week.startAt).getTime();
    const ends = new Date(week.endAt).getTime();
    return Number.isFinite(starts) && Number.isFinite(ends) && nowTime >= starts && nowTime < ends;
  });
  const currentTerm = currentWeek
    ? calendar.terms.find((term) => term.weekIds.includes(currentWeek.id))
    : undefined;
  const nextWeek = calendar.weeks.find(
    (week) => new Date(week.startAt).getTime() > nowTime,
  );
  if (currentWeek && currentTerm) {
    return {
      ...config,
      termId: currentTerm.id,
      termLabel: currentTerm.label,
      weekId: currentWeek.id,
      weekLabel: currentWeek.label,
      calendarStatus: "active",
      weekStartDate: currentWeek.startDate,
      weekEndDate: currentWeek.endDate,
      nextWeekLabel: nextWeek?.label,
      nextWeekStartDate: nextWeek?.startDate,
    };
  }
  return {
    ...config,
    termId: "",
    termLabel: "Sin bimestre activo",
    weekId: "",
    weekLabel: calendar.configured ? "Sin semana activa" : "Calendario pendiente",
    calendarStatus: calendar.configured ? "gap" : "unconfigured",
    weekStartDate: undefined,
    weekEndDate: undefined,
    nextWeekLabel: nextWeek?.label,
    nextWeekStartDate: nextWeek?.startDate,
  };
}

export async function saveAcademicCalendar(input: AcademicCalendarInput) {
  if (!firebase.functions) throw new Error("Firebase no está configurado.");
  const callable = httpsCallable<AcademicCalendarInput, { calendarStatus: string }>(
    firebase.functions,
    "saveAcademicCalendar",
  );
  return (await callable(input)).data;
}

export function watchTaskAssignments(
  profile: UserProfile,
  config: AcademicConfig,
  callback: (tasks: TaskAssignment[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!firebase.db) {
    callback([]);
    return () => undefined;
  }
  const constraints: QueryConstraint[] = [
    where("institutionId", "==", config.institutionId),
    where("schoolYearId", "==", config.schoolYearId),
  ];
  if (profile.role === "teacher") {
    constraints.push(where("createdBy", "==", profile.uid));
  }
  if (profile.role === "student") {
    const targetGroup = `${profile.grade ?? ""} ${profile.group ?? ""}`.trim();
    constraints.push(where("targetGroup", "==", targetGroup));
    constraints.push(where("status", "in", ["published", "closed"]));
  }
  return onSnapshot(
    query(collectionGroup(firebase.db, "tareas"), ...constraints),
    (snapshot) => {
      const tasks = snapshot.docs
        .map((entry) => taskFromData(entry.id, entry.ref.path, entry.data()))
        .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
      callback(tasks);
    },
    (error) => onError?.(error),
  );
}

export async function createTaskAssignment(
  input: TaskCreateInput,
  profile: UserProfile,
  config: AcademicConfig,
) {
  if (config.calendarStatus !== "active" || !config.weekId || !config.termId) {
    throw new Error(
      "No hay una semana activa configurada. Dirección debe revisar el calendario académico.",
    );
  }
  const { db, storage } = requireFirebase();
  const subjectId = input.subjectId || slugify(input.subject);
  const reference = doc(academicTaskCollection(config, subjectId));
  const initialBatch = writeBatch(db);
  initialBatch.set(reference, {
    institutionId: config.institutionId,
    schoolYearId: config.schoolYearId,
    schoolYearLabel: config.schoolYearLabel,
    termId: config.termId,
    termLabel: config.termLabel,
    weekId: config.weekId,
    weekLabel: config.weekLabel,
    subjectId,
    subject: input.subject,
    title: input.title.trim(),
    description: input.description.trim(),
    dueAt: Timestamp.fromDate(new Date(input.dueAt)),
    publishAt:
      input.publicationMode === "scheduled" && input.publishAt
        ? Timestamp.fromDate(new Date(input.publishAt))
        : null,
    status: "draft",
    intendedStatus:
      input.publicationMode === "now"
        ? "published"
        : input.publicationMode === "scheduled"
          ? "scheduled"
          : "draft",
    publicationMode: input.publicationMode,
    targetGroup: input.targetGroup,
    links: input.links
      .filter((link) => link.url.trim())
      .map((link) => ({
        id: crypto.randomUUID(),
        label: link.label.trim() || "Enlace",
        url: link.url.trim(),
      })),
    attachments: [],
    createdBy: profile.uid,
    teacherName: profile.name,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const createdEvent = doc(collection(reference, "historial"));
  initialBatch.set(createdEvent, {
    type: "created",
    authorId: profile.uid,
    authorName: profile.name,
    authorRole: profile.role,
    message: "Creó la actividad.",
    createdAt: serverTimestamp(),
  });
  await initialBatch.commit();

  const attachments = await Promise.all(
    input.files.map(async (file) => {
      const assetId = crypto.randomUUID();
      const storagePath = [
        "institutions",
        config.institutionId,
        "ciclosEscolares",
        config.schoolYearId,
        "bimestres",
        config.termId,
        "semanas",
        config.weekId,
        "materias",
        subjectId,
        "tareas",
        reference.id,
        "recursos",
        assetId,
      ].join("/");
      await uploadBytes(ref(storage, storagePath), file, {
        contentType: file.type || "application/octet-stream",
        customMetadata: { originalName: file.name },
      });
      return {
        id: assetId,
        name: file.name,
        storagePath,
        contentType: file.type || "application/octet-stream",
        size: file.size,
      } satisfies TaskAttachment;
    }),
  );

  const finalStatus =
    input.publicationMode === "now"
      ? "published"
      : input.publicationMode === "scheduled"
        ? "scheduled"
        : "draft";
  const finalBatch = writeBatch(db);
  finalBatch.update(reference, {
    attachments,
    status: finalStatus,
    intendedStatus: deleteField(),
    updatedAt: serverTimestamp(),
    ...(finalStatus === "published" ? { publishedAt: serverTimestamp() } : {}),
  });
  if (finalStatus !== "draft") {
    finalBatch.set(doc(collection(reference, "historial")), {
      type: finalStatus === "scheduled" ? "scheduled" : "published",
      authorId: profile.uid,
      authorName: profile.name,
      authorRole: profile.role,
      message:
        finalStatus === "scheduled"
          ? "Programó la publicación de la actividad."
          : "Publicó la actividad para el grupo.",
      createdAt: serverTimestamp(),
    });
  }
  await finalBatch.commit();
  return reference.id;
}

export async function deleteTaskAssignment(task: TaskAssignment) {
  if (!firebase.functions || !isFirebaseTaskAssignment(task)) {
    throw new Error("Esta tarea no se puede eliminar porque no está sincronizada con Firebase.");
  }
  const callable = httpsCallable<{ firestorePath: string }, { deleted: boolean }>(
    firebase.functions,
    "deleteAcademicTask",
  );
  return (await callable({ firestorePath: task.firestorePath })).data;
}

export async function updateTaskAssignment(
  task: TaskAssignment,
  input: Pick<TaskAssignment, "title" | "description" | "dueAt" | "links" | "attachments"> & { files: File[] },
) {
  if (!firebase.functions || !isFirebaseTaskAssignment(task)) {
    throw new Error("Esta tarea no se puede editar porque no está sincronizada con Firebase.");
  }
  const { storage } = requireFirebase();
  const uploaded: TaskAttachment[] = [];
  try {
    for (const file of input.files) {
      const id = crypto.randomUUID();
      const storagePath = `${task.firestorePath}/recursos/${id}`;
      await uploadBytes(ref(storage, storagePath), file, {
        contentType: file.type || "application/octet-stream",
        customMetadata: { originalName: file.name },
      });
      uploaded.push({
        id,
        name: file.name,
        storagePath,
        contentType: file.type || "application/octet-stream",
        size: file.size,
      });
    }
  } catch (error) {
    await Promise.all(
      uploaded.map((attachment) =>
        deleteObject(ref(storage, attachment.storagePath)).catch(() => undefined),
      ),
    );
    throw error;
  }
  const attachments = [...input.attachments, ...uploaded];
  const callable = httpsCallable<
    {
      entityType: "task";
      firestorePath: string;
      title: string;
      description: string;
      dueAt: string;
      links: TaskAssignment["links"];
      attachments: TaskAttachment[];
    },
    { updated: boolean }
  >(firebase.functions, "updateManagedContent");
  try {
    return (await callable({
      entityType: "task",
      firestorePath: task.firestorePath,
      title: input.title,
      description: input.description,
      dueAt: input.dueAt,
      links: input.links,
      attachments,
    })).data;
  } catch (error) {
    await Promise.all(uploaded.map((attachment) => deleteObject(ref(storage, attachment.storagePath)).catch(() => undefined)));
    throw error;
  }
}

export function watchTaskSubmissions(
  task: TaskAssignment,
  profile: UserProfile,
  callback: (submissions: TaskSubmission[]) => void,
  onError?: (error: Error) => void,
) {
  const reference = taskRef(task);
  if (profile.role === "student") {
    return onSnapshot(
      doc(reference, "entregas", profile.uid),
      (snapshot) =>
        callback(snapshot.exists() ? [submissionFromData(snapshot.id, snapshot.data())] : []),
      (error) => onError?.(error),
    );
  }
  return onSnapshot(
    collection(reference, "entregas"),
    (snapshot) =>
      callback(
        snapshot.docs
          .map((entry) => submissionFromData(entry.id, entry.data()))
          .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt)),
      ),
    (error) => onError?.(error),
  );
}

export function watchSubmissionHistory(
  task: TaskAssignment,
  studentId: string,
  callback: (events: TaskHistoryEvent[]) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(
    query(
      collection(taskRef(task), "entregas", studentId, "historial"),
      orderBy("createdAt", "asc"),
    ),
    (snapshot) =>
      callback(snapshot.docs.map((entry) => historyFromData(entry.id, entry.data()))),
    (error) => onError?.(error),
  );
}

export function watchTaskHistory(
  task: TaskAssignment,
  callback: (events: TaskHistoryEvent[]) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(
    query(collection(taskRef(task), "historial"), orderBy("createdAt", "asc")),
    (snapshot) =>
      callback(snapshot.docs.map((entry) => historyFromData(entry.id, entry.data()))),
    (error) => onError?.(error),
  );
}

export function watchTaskExtension(
  task: TaskAssignment,
  studentId: string,
  callback: (extension: TaskExtension | null) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(
    doc(taskRef(task), "prorrogas", studentId),
    (snapshot) => {
      if (!snapshot.exists()) {
        callback(null);
        return;
      }
      const data = snapshot.data();
      callback({
        studentId,
        studentName: String(data.studentName ?? "Alumno"),
        dueAt: asIso(data.dueAt),
        grantedBy: String(data.grantedBy ?? ""),
        grantedByName: String(data.grantedByName ?? "Docente CEHF"),
        createdAt: asIso(data.createdAt),
      });
    },
    (error) => onError?.(error),
  );
}

export function isTaskSubmissionOpen(
  task: TaskAssignment,
  extension?: TaskExtension | null,
) {
  const now = Date.now();
  const extensionActive = extension && new Date(extension.dueAt).getTime() >= now;
  return task.status === "published" && (
    new Date(task.dueAt).getTime() >= now || Boolean(extensionActive)
  );
}

async function uploadSubmissionFiles(
  task: TaskAssignment,
  studentId: string,
  version: number,
  files: File[],
) {
  const { storage } = requireFirebase();
  return Promise.all(
    files.map(async (file) => {
      const id = crypto.randomUUID();
      const storagePath = `${task.firestorePath}/entregas/${studentId}/version-${version}/${id}`;
      await uploadBytes(ref(storage, storagePath), file, {
        contentType: file.type || "application/octet-stream",
        customMetadata: { originalName: file.name },
      });
      return {
        id,
        name: file.name,
        storagePath,
        contentType: file.type || "application/octet-stream",
        size: file.size,
      } satisfies TaskAttachment;
    }),
  );
}

export async function submitTaskResponse(
  task: TaskAssignment,
  profile: UserProfile,
  content: string,
  contentRich: string,
  files: File[],
) {
  const { db } = requireFirebase();
  const reference = taskRef(task);
  const currentTaskSnapshot = await getDoc(reference);
  if (!currentTaskSnapshot.exists()) throw new Error("La tarea ya no está disponible.");
  const currentTask = taskFromData(task.id, reference.path, currentTaskSnapshot.data());
  const extensionSnapshot = await getDoc(doc(reference, "prorrogas", profile.uid));
  const extension = extensionSnapshot.exists()
    ? ({ dueAt: asIso(extensionSnapshot.data().dueAt) } as TaskExtension)
    : null;
  if (!isTaskSubmissionOpen(currentTask, extension)) {
    throw new Error("La fecha de entrega terminó o la tarea está cerrada.");
  }
  const submissionReference = doc(reference, "entregas", profile.uid);
  const currentSubmission = await getDoc(submissionReference);
  const version = currentSubmission.exists()
    ? Number(currentSubmission.data().version ?? 0) + 1
    : 1;
  const attachments = await uploadSubmissionFiles(
    currentTask,
    profile.uid,
    version,
    files,
  );
  const normalizedContentRich = normalizeForumRichText(contentRich || content);
  const batch = writeBatch(db);
  batch.set(
    submissionReference,
    {
      institutionId: task.institutionId,
      taskId: task.id,
      studentId: profile.uid,
      studentName: profile.name,
      teacherId: task.createdBy,
      content: content.trim(),
      contentRich: normalizedContentRich,
      attachments,
      status: "submitted",
      version,
      submittedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdAt: currentSubmission.exists()
        ? currentSubmission.data().createdAt
        : serverTimestamp(),
      teacherFeedback: currentSubmission.exists()
        ? currentSubmission.data().teacherFeedback ?? ""
        : "",
    },
    { merge: true },
  );
  batch.set(doc(collection(submissionReference, "historial")), {
    type: version === 1 ? "submitted" : "resubmitted",
    authorId: profile.uid,
    authorName: profile.name,
    authorRole: "student",
    studentId: profile.uid,
    studentName: profile.name,
    message: content.trim(),
    messageRich: normalizedContentRich,
    attachments,
    version,
    createdAt: serverTimestamp(),
  });
  await batch.commit();
  return version;
}

export async function sendTaskFeedback(
  task: TaskAssignment,
  submission: TaskSubmission,
  profile: UserProfile,
  feedback: string,
  feedbackRich: string,
) {
  const { db } = requireFirebase();
  const normalizedFeedbackRich = normalizeForumRichText(feedbackRich || feedback);
  const submissionReference = doc(taskRef(task), "entregas", submission.studentId);
  const batch = writeBatch(db);
  batch.update(submissionReference, {
    status: "feedback",
    teacherFeedback: feedback.trim(),
    teacherFeedbackRich: normalizedFeedbackRich,
    feedbackAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(collection(submissionReference, "historial")), {
    type: "feedback",
    authorId: profile.uid,
    authorName: profile.name,
    authorRole: profile.role,
    studentId: submission.studentId,
    studentName: submission.studentName,
    message: feedback.trim(),
    messageRich: normalizedFeedbackRich,
    version: submission.version,
    createdAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function markTaskSubmissionReviewed(
  task: TaskAssignment,
  submission: TaskSubmission,
  profile: UserProfile,
) {
  const { db } = requireFirebase();
  const submissionReference = doc(taskRef(task), "entregas", submission.studentId);
  const batch = writeBatch(db);
  batch.update(submissionReference, {
    status: "reviewed",
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(collection(submissionReference, "historial")), {
    type: "reviewed",
    authorId: profile.uid,
    authorName: profile.name,
    authorRole: profile.role,
    studentId: submission.studentId,
    studentName: submission.studentName,
    message: "Marcó la entrega como finalizada.",
    version: submission.version,
    createdAt: serverTimestamp(),
  });
  await batch.commit();
}

async function updateTaskWithHistory(
  task: TaskAssignment,
  profile: UserProfile,
  changes: Record<string, unknown>,
  event: {
    type: TaskHistoryEventType;
    message: string;
    dueAt?: string;
    studentId?: string;
    studentName?: string;
  },
) {
  const { db } = requireFirebase();
  const reference = taskRef(task);
  const batch = writeBatch(db);
  batch.update(reference, { ...changes, updatedAt: serverTimestamp() });
  batch.set(doc(collection(reference, "historial")), {
    ...event,
    dueAt: event.dueAt ? Timestamp.fromDate(new Date(event.dueAt)) : null,
    authorId: profile.uid,
    authorName: profile.name,
    authorRole: profile.role,
    createdAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function publishTaskNow(
  task: TaskAssignment,
  profile: UserProfile,
) {
  if (new Date(task.dueAt).getTime() <= Date.now()) {
    throw new Error("Actualiza la fecha de entrega antes de publicar.");
  }
  await updateTaskWithHistory(
    task,
    profile,
    { status: "published", publicationMode: "now", publishedAt: serverTimestamp() },
    { type: "published", message: "Publicó la actividad para el grupo." },
  );
}

export async function closeTaskAssignment(
  task: TaskAssignment,
  profile: UserProfile,
) {
  await updateTaskWithHistory(
    task,
    profile,
    { status: "closed", closedAt: serverTimestamp() },
    { type: "closed", message: "Cerró la actividad para nuevas entregas." },
  );
}

export async function extendTaskForGroup(
  task: TaskAssignment,
  profile: UserProfile,
  dueAt: string,
) {
  if (new Date(dueAt).getTime() <= Date.now()) {
    throw new Error("La nueva fecha debe estar en el futuro.");
  }
  await updateTaskWithHistory(
    task,
    profile,
    {
      status: "published",
      dueAt: Timestamp.fromDate(new Date(dueAt)),
      closedAt: deleteField(),
    },
    {
      type: task.status === "closed" ? "reopened" : "group_extension",
      message: "Extendió la fecha de entrega para todo el grupo.",
      dueAt,
    },
  );
}

export async function grantIndividualTaskExtension(
  task: TaskAssignment,
  profile: UserProfile,
  student: { uid: string; name: string },
  dueAt: string,
) {
  if (new Date(dueAt).getTime() <= Date.now()) {
    throw new Error("La prórroga debe terminar en el futuro.");
  }
  const { db } = requireFirebase();
  const reference = taskRef(task);
  const batch = writeBatch(db);
  batch.set(
    doc(reference, "prorrogas", student.uid),
    {
      institutionId: task.institutionId,
      studentId: student.uid,
      studentName: student.name,
      dueAt: Timestamp.fromDate(new Date(dueAt)),
      grantedBy: profile.uid,
      grantedByName: profile.name,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  batch.set(doc(collection(reference, "historial")), {
    type: "individual_extension",
    authorId: profile.uid,
    authorName: profile.name,
    authorRole: profile.role,
    studentId: student.uid,
    studentName: student.name,
    dueAt: Timestamp.fromDate(new Date(dueAt)),
    message: `Otorgó una prórroga individual a ${student.name}.`,
    createdAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function getTaskAttachmentUrl(attachment: TaskAttachment) {
  if (attachment.downloadUrl) return attachment.downloadUrl;
  const { storage } = requireFirebase();
  return getDownloadURL(ref(storage, attachment.storagePath));
}

function resourceDetails(resource: TaskResource) {
  return resource.kind === "attachment"
    ? {
        id: resource.attachment.id,
        label: resource.attachment.name,
        kind: resource.kind,
      }
    : { id: resource.link.id, label: resource.link.label, kind: resource.kind };
}

export async function markTaskResourceViewed(
  task: TaskAssignment,
  resource: TaskResource,
  profile: UserProfile,
) {
  if (profile.role !== "student" || !isFirebaseTaskAssignment(task)) return;
  const { db } = requireFirebase();
  const details = resourceDetails(resource);
  const viewReference = doc(
    db,
    task.firestorePath,
    "resourceViews",
    details.id,
    "students",
    profile.uid,
  );
  const snapshot = await getDoc(viewReference);
  if (snapshot.exists()) {
    await updateDoc(viewReference, {
      lastOpenedAt: serverTimestamp(),
      viewCount: increment(1),
    });
    return;
  }
  await setDoc(viewReference, {
    institutionId: task.institutionId,
    taskId: task.id,
    resourceId: details.id,
    resourceKind: details.kind,
    resourceLabel: details.label,
    studentId: profile.uid,
    studentName: profile.name,
    firstOpenedAt: serverTimestamp(),
    lastOpenedAt: serverTimestamp(),
    viewCount: 1,
  });
}

export function watchTaskResourceViews(
  task: TaskAssignment,
  resourceId: string,
  callback: (views: TaskResourceView[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!firebase.db || !isFirebaseTaskAssignment(task)) {
    callback([]);
    return () => undefined;
  }
  return onSnapshot(
    collection(
      firebase.db,
      task.firestorePath,
      "resourceViews",
      resourceId,
      "students",
    ),
    (snapshot) => callback(
      snapshot.docs
        .map((entry) => resourceViewFromData(entry.data()))
        .sort((first, second) =>
          second.lastOpenedAt.localeCompare(first.lastOpenedAt),
        ),
    ),
    (error) => onError?.(error),
  );
}

export async function loadViewedTaskResourceIds(
  task: TaskAssignment,
  profile: UserProfile,
) {
  if (!firebase.db || profile.role !== "student" || !isFirebaseTaskAssignment(task)) {
    return new Set<string>();
  }
  const resourceIds = [
    ...task.links.map((link) => link.id),
    ...task.attachments.map((attachment) => attachment.id),
  ];
  const entries = await Promise.all(
    resourceIds.map(async (resourceId) => ({
      resourceId,
      viewed: (
        await getDoc(doc(
          firebase.db!,
          task.firestorePath,
          "resourceViews",
          resourceId,
          "students",
          profile.uid,
        ))
      ).exists(),
    })),
  );
  return new Set(entries.filter((entry) => entry.viewed).map((entry) => entry.resourceId));
}

function notificationDate(value: unknown) {
  const date = new Date(asIso(value));
  if (Date.now() - date.getTime() < 60_000) return "Ahora";
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function watchTaskNotifications(
  userId: string,
  callback: (notifications: AppNotification[]) => void,
  onError?: (error: Error) => void,
) {
  if (!firebase.db) return () => undefined;
  return onSnapshot(
    query(
      collection(firebase.db, "notifications", userId, "items"),
      orderBy("createdAt", "desc"),
    ),
    (snapshot) =>
      callback(
        snapshot.docs.map((entry) => {
          const data = entry.data();
          const createdAtIso = asIso(data.createdAt);
          const optionalId = (value: unknown) =>
            typeof value === "string" && value.trim() ? value : undefined;
          return {
            id: entry.id,
            title: String(data.title ?? "Nueva notificación"),
            detail: String(data.detail ?? ""),
            category: data.category ?? "task",
            createdAt: notificationDate(data.createdAt),
            createdAtIso,
            url: data.url ? String(data.url) : undefined,
            taskId: optionalId(data.taskId),
            reviewId: optionalId(data.reviewId),
            materialId: optionalId(data.materialId),
            reportId: optionalId(data.reportId),
            storyId: optionalId(data.storyId),
            topicId: optionalId(data.topicId),
            postId: optionalId(data.postId),
            workshopId: optionalId(data.workshopId),
            resourceId: optionalId(data.resourceId),
            workspaceItemId: optionalId(data.workspaceItemId),
            read: data.read === true,
          } satisfies AppNotification;
        }),
      ),
    (error) => onError?.(error),
  );
}

export async function markTaskNotificationRead(
  userId: string,
  notificationId: string,
) {
  if (!firebase.db) return;
  await updateDoc(
    doc(firebase.db, "notifications", userId, "items", notificationId),
    { read: true },
  );
}

export async function markTaskNotificationsRead(userId: string) {
  if (!firebase.db) return;
  const snapshot = await new Promise<
    Array<{ ref: ReturnType<typeof doc>; read: boolean }>
  >((resolve, reject) => {
    const unsubscribe = onSnapshot(
      collection(firebase.db!, "notifications", userId, "items"),
      (result) => {
        unsubscribe();
        resolve(result.docs.map((entry) => ({ ref: entry.ref, read: entry.data().read === true })));
      },
      reject,
    );
  });
  const unread = snapshot.filter((item) => !item.read);
  if (!unread.length) return;
  const batch = writeBatch(firebase.db);
  unread.forEach((item) => batch.update(item.ref, { read: true }));
  await batch.commit();
}
