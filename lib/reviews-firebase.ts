"use client";

import {
  collection,
  doc,
  onSnapshot,
  query,
  Timestamp,
  where,
  type DocumentData,
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
import { includesSubject } from "./academic-subjects";
import type {
  AcademicCalendar,
  AcademicConfig,
  ManagedAccount,
  Review,
  UserProfile,
  WeeklyReview,
  WeeklyReviewAttachment,
  WeeklyReviewAttempt,
  WeeklyReviewCreateInput,
  WeeklyReviewQuestion,
  WeeklyReviewQuestionInput,
  WeeklyReviewStatus,
} from "./types";

const MAX_REVIEW_FILE_SIZE = 20 * 1024 * 1024;

function requireFirebase() {
  if (!firebase.db || !firebase.storage || !firebase.functions) {
    throw new Error("Firebase no está configurado para Repasos.");
  }
  return {
    db: firebase.db,
    storage: firebase.storage,
    functions: firebase.functions,
  };
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
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "general"
  );
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function questionFromData(value: unknown): WeeklyReviewQuestion | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (!data.id || !data.prompt) return null;
  const type = String(data.type ?? "multiple_choice");
  if (!["multiple_choice", "true_false", "reflection"].includes(type)) {
    return null;
  }
  return {
    id: String(data.id),
    type: type as WeeklyReviewQuestion["type"],
    prompt: String(data.prompt),
    options: Array.isArray(data.options)
      ? data.options
          .map((option) => {
            if (!option || typeof option !== "object") return null;
            const entry = option as Record<string, unknown>;
            return entry.id && entry.label
              ? { id: String(entry.id), label: String(entry.label) }
              : null;
          })
          .filter(Boolean) as WeeklyReviewQuestion["options"]
      : [],
    points: Math.max(0, Number(data.points ?? 1)),
  };
}

function attachmentFromData(value: unknown): WeeklyReviewAttachment | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (!data.id || !data.storagePath || !data.name) return null;
  return {
    id: String(data.id),
    name: String(data.name),
    storagePath: String(data.storagePath),
    contentType: String(data.contentType ?? "application/octet-stream"),
    size: Math.max(0, Number(data.size ?? 0)),
  };
}

function attemptFromData(id: string, data: DocumentData): WeeklyReviewAttempt {
  const answers =
    data.answers && typeof data.answers === "object" && !Array.isArray(data.answers)
      ? Object.fromEntries(
          Object.entries(data.answers as Record<string, unknown>).map(
            ([questionId, answer]) => [questionId, String(answer ?? "")],
          ),
        )
      : {};
  return {
    id,
    reviewId: String(data.reviewId ?? ""),
    studentId: String(data.studentId ?? id),
    studentName: String(data.studentName ?? "Alumno"),
    answers,
    answeredCount: Math.max(0, Number(data.answeredCount ?? 0)),
    progress: Math.min(100, Math.max(0, Number(data.progress ?? 0))),
    status: data.status === "completed" ? "completed" : "in_progress",
    score: data.score == null ? undefined : Number(data.score),
    maxScore: data.maxScore == null ? undefined : Number(data.maxScore),
    scorePercent:
      data.scorePercent == null ? undefined : Number(data.scorePercent),
    attemptNumber: Math.max(1, Number(data.attemptNumber ?? 1)),
    startedAt: asIso(data.startedAt),
    completedAt: data.completedAt ? asIso(data.completedAt) : undefined,
    updatedAt: asIso(data.updatedAt),
  };
}

function reviewFromData(
  id: string,
  firestorePath: string,
  data: DocumentData,
): WeeklyReview {
  return {
    id,
    firestorePath,
    institutionId: String(data.institutionId ?? ""),
    schoolYearId: String(data.schoolYearId ?? ""),
    schoolYearLabel: String(data.schoolYearLabel ?? ""),
    termId: String(data.termId ?? ""),
    termLabel: String(data.termLabel ?? ""),
    weekId: String(data.weekId ?? ""),
    weekLabel: String(data.weekLabel ?? "Semana"),
    subjectId: String(data.subjectId ?? slugify(String(data.subject ?? "General"))),
    subject: String(data.subject ?? "General"),
    title: String(data.title ?? "Repaso sin nombre"),
    description: String(data.description ?? ""),
    duration: Math.max(1, Number(data.duration ?? 10)),
    maxAttempts:
      Number(data.maxAttempts ?? 1) === 0
        ? 0
        : Math.max(1, Number(data.maxAttempts ?? 1)),
    status: (["draft", "published", "closed"].includes(String(data.status))
      ? data.status
      : "draft") as WeeklyReviewStatus,
    questions: Array.isArray(data.questions)
      ? data.questions.map(questionFromData).filter(Boolean) as WeeklyReviewQuestion[]
      : [],
    attachments: Array.isArray(data.attachments)
      ? data.attachments.map(attachmentFromData).filter(Boolean) as WeeklyReviewAttachment[]
      : [],
    audienceStudentIds: stringList(data.audienceStudentIds),
    targetGroups: stringList(data.targetGroups),
    managerIds: stringList(data.managerIds),
    audienceCount: Math.max(0, Number(data.audienceCount ?? 0)),
    startedCount: Math.max(0, Number(data.startedCount ?? 0)),
    completedCount: Math.max(0, Number(data.completedCount ?? 0)),
    createdBy: String(data.createdBy ?? ""),
    createdByName: String(data.createdByName ?? "Campus CEHF"),
    createdByRole: data.createdByRole === "director" ? "director" : "teacher",
    createdAt: asIso(data.createdAt),
    updatedAt: asIso(data.updatedAt),
    publishedAt: data.publishedAt ? asIso(data.publishedAt) : undefined,
    closedAt: data.closedAt ? asIso(data.closedAt) : undefined,
  };
}

export function isFirebaseWeeklyReview(review: WeeklyReview) {
  return review.firestorePath === `weeklyReviews/${review.id}`;
}

export function watchWeeklyReviews(
  profile: UserProfile,
  callback: (reviews: WeeklyReview[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!firebase.db) {
    callback([]);
    return () => undefined;
  }
  if (profile.role !== "director") {
    if (!firebase.functions) {
      onError?.(new Error("Firebase Functions no está configurado para Repasos."));
      return () => undefined;
    }
    let active = true;
    const callable = httpsCallable<
      Record<string, never>,
      { reviews: Array<Record<string, unknown>> }
    >(
      firebase.functions,
      profile.role === "student"
        ? "listStudentWeeklyReviews"
        : "listStaffWeeklyReviews",
    );
    const attemptStops = new Map<string, Unsubscribe>();
    const attempts = new Map<string, WeeklyReviewAttempt>();
    let reviews: WeeklyReview[] = [];
    const emit = () =>
      callback(
        reviews.map((review) => ({
          ...review,
          myAttempt:
            profile.role === "student" ? attempts.get(review.id) : undefined,
        })),
      );
    void callable({})
      .then(({ data }) => {
        if (!active) return;
        reviews = data.reviews.map((review) =>
          reviewFromData(
            String(review.id ?? ""),
            String(review.firestorePath ?? ""),
            review,
          ),
        );
        if (profile.role === "student") {
          reviews.forEach((review) => {
            attemptStops.set(
              review.id,
              onSnapshot(
                doc(
                  firebase.db!,
                  "weeklyReviews",
                  review.id,
                  "attempts",
                  profile.uid,
                ),
                (attemptSnapshot) => {
                  if (attemptSnapshot.exists()) {
                    attempts.set(
                      review.id,
                      attemptFromData(
                        attemptSnapshot.id,
                        attemptSnapshot.data(),
                      ),
                    );
                  } else {
                    attempts.delete(review.id);
                  }
                  emit();
                },
                (error) => onError?.(error),
              ),
            );
          });
        }
        emit();
      })
      .catch((error: unknown) => {
        if (!active) return;
        onError?.(
          error instanceof Error
            ? error
            : new Error("No pudimos cargar los repasos."),
        );
      });
    return () => {
      active = false;
      attemptStops.forEach((stop) => stop());
    };
  }
  const stopReviews = onSnapshot(
    query(
      collection(firebase.db, "weeklyReviews"),
      where("institutionId", "==", profile.institutionId),
    ),
    (snapshot) => {
      callback(
        snapshot.docs
          .map((entry) =>
            reviewFromData(entry.id, entry.ref.path, entry.data()),
          )
          .sort((first, second) =>
            second.createdAt.localeCompare(first.createdAt),
          ),
      );
    },
    (error) => onError?.(error),
  );

  return () => {
    stopReviews();
  };
}

export function watchWeeklyReviewAttempts(
  review: WeeklyReview,
  callback: (attempts: WeeklyReviewAttempt[]) => void,
  onError?: (error: Error) => void,
) {
  if (!firebase.db || !isFirebaseWeeklyReview(review)) {
    callback(review.myAttempt ? [review.myAttempt] : []);
    return () => undefined;
  }
  return onSnapshot(
    collection(firebase.db, "weeklyReviews", review.id, "attempts"),
    (snapshot) =>
      callback(
        snapshot.docs
          .map((entry) => attemptFromData(entry.id, entry.data()))
          .sort((first, second) => first.studentName.localeCompare(second.studentName, "es")),
      ),
    (error) => onError?.(error),
  );
}

export async function createWeeklyReview(
  input: WeeklyReviewCreateInput,
  profile: UserProfile,
  config: AcademicConfig,
  calendar: AcademicCalendar,
) {
  if (profile.role === "student") {
    throw new Error("Los alumnos no pueden crear repasos.");
  }
  const week = calendar.weeks.find((item) => item.id === input.weekId);
  const term = calendar.terms.find((item) => item.weekIds.includes(input.weekId));
  if (!week || !term) {
    throw new Error("Selecciona una semana configurada dentro de un bimestre.");
  }
  if (input.questions.length < 1 || input.questions.length > 30) {
    throw new Error("Agrega entre 1 y 30 preguntas.");
  }
  const oversized = input.files.find((file) => file.size >= MAX_REVIEW_FILE_SIZE);
  if (oversized) throw new Error(`${oversized.name} supera el límite de 20 MB.`);

  const { storage, functions } = requireFirebase();
  const reviewId = crypto.randomUUID();
  const uploaded: WeeklyReviewAttachment[] = [];
  try {
    for (const file of input.files.slice(0, 3)) {
      const id = crypto.randomUUID();
      const storagePath = `institutions/${profile.institutionId}/weeklyReviews/${reviewId}/${id}`;
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
    const callable = httpsCallable<
      Record<string, unknown>,
      { reviewId: string; recipientCount: number }
    >(functions, "createWeeklyReview");
    return (
      await callable({
        reviewId,
        institutionId: profile.institutionId,
        schoolYearId: config.schoolYearId,
        schoolYearLabel: config.schoolYearLabel,
        termId: term.id,
        termLabel: term.label,
        weekId: week.id,
        weekLabel: week.label,
        title: input.title.trim(),
        description: input.description.trim(),
        subject: input.subject,
        subjectId: slugify(input.subject),
        duration: input.duration,
        maxAttempts: input.maxAttempts,
        targetGroups: input.targetGroups,
        status: input.status,
        questions: input.questions,
        attachments: uploaded,
      })
    ).data;
  } catch (error) {
    await Promise.allSettled(
      uploaded.map((attachment) =>
        deleteObject(ref(storage, attachment.storagePath)),
      ),
    );
    throw error;
  }
}

export async function saveWeeklyReviewProgress(
  review: WeeklyReview,
  answers: Record<string, string>,
) {
  if (!isFirebaseWeeklyReview(review)) return;
  const { functions } = requireFirebase();
  const callable = httpsCallable<
    { reviewId: string; answers: Record<string, string> },
    { attempt: Record<string, unknown> }
  >(functions, "saveWeeklyReviewProgress");
  return (await callable({ reviewId: review.id, answers })).data;
}

export async function submitWeeklyReview(
  review: WeeklyReview,
  answers: Record<string, string>,
) {
  if (!isFirebaseWeeklyReview(review)) {
    return { scorePercent: 100 };
  }
  const { functions } = requireFirebase();
  const callable = httpsCallable<
    { reviewId: string; answers: Record<string, string> },
    { score: number; maxScore: number; scorePercent: number }
  >(functions, "submitWeeklyReview");
  return (await callable({ reviewId: review.id, answers })).data;
}

export async function restartWeeklyReview(review: WeeklyReview) {
  if (!isFirebaseWeeklyReview(review)) return;
  const { functions } = requireFirebase();
  const callable = httpsCallable<{ reviewId: string }, { attemptNumber: number }>(
    functions,
    "restartWeeklyReview",
  );
  return (await callable({ reviewId: review.id })).data;
}

export async function updateWeeklyReviewStatus(
  review: WeeklyReview,
  status: WeeklyReviewStatus,
) {
  if (!isFirebaseWeeklyReview(review)) return;
  const { functions } = requireFirebase();
  const callable = httpsCallable<
    { reviewId: string; status: WeeklyReviewStatus },
    { status: WeeklyReviewStatus }
  >(functions, "updateWeeklyReviewStatus");
  return (await callable({ reviewId: review.id, status })).data;
}

export async function getWeeklyReviewAttachmentUrl(
  attachment: WeeklyReviewAttachment,
) {
  if (attachment.downloadUrl) return attachment.downloadUrl;
  const { storage } = requireFirebase();
  return getDownloadURL(ref(storage, attachment.storagePath));
}

function demoQuestions(subject: string): WeeklyReviewQuestion[] {
  return [
    {
      id: "demo-choice",
      type: "multiple_choice",
      prompt: `¿Cuál opción explica mejor la idea principal de ${subject}?`,
      options: [
        { id: "a", label: "Relacionar lo aprendido con un ejemplo" },
        { id: "b", label: "Memorizar sin explicar" },
        { id: "c", label: "Omitir la evidencia" },
      ],
      points: 1,
    },
    {
      id: "demo-true-false",
      type: "true_false",
      prompt: "Explicar el procedimiento ayuda a comprobar una respuesta.",
      options: [
        { id: "true", label: "Verdadero" },
        { id: "false", label: "Falso" },
      ],
      points: 1,
    },
    {
      id: "demo-reflection",
      type: "reflection",
      prompt: "Escribe con tus palabras qué fue lo más importante que recordaste.",
      options: [],
      points: 0,
    },
  ];
}

export function legacyReviewsToWeeklyReviews(
  reviews: Review[],
  profile: UserProfile,
  config: AcademicConfig,
  accounts: ManagedAccount[],
): WeeklyReview[] {
  const students = accounts.filter((account) => account.role === "student" && account.active);
  return reviews.map((review, index) => {
    const audience = students.filter((student) => includesSubject(student.subjects, review.subject));
    const progress = profile.role === "student" ? review.progress : 0;
    const completed = progress === 100;
    const questions = demoQuestions(review.subject).slice(
      0,
      Math.max(1, Math.min(3, review.questions)),
    );
    const answeredCount = Math.round((progress / 100) * questions.length);
    const answers = Object.fromEntries(
      questions.slice(0, answeredCount).map((question) => [
        question.id,
        question.type === "reflection"
          ? "Lo más importante fue explicar la idea con un ejemplo."
          : question.options[0]?.id ?? "",
      ]),
    );
    return {
      id: review.id,
      firestorePath: `demo/weeklyReviews/${review.id}`,
      institutionId: profile.institutionId,
      schoolYearId: config.schoolYearId,
      schoolYearLabel: config.schoolYearLabel,
      termId: config.termId,
      termLabel: config.termLabel,
      weekId: config.weekId,
      weekLabel: config.weekLabel,
      subjectId: slugify(review.subject),
      subject: review.subject,
      title: review.title,
      description: `Práctica breve para ${review.purpose.toLowerCase()} lo aprendido esta semana.`,
      duration: review.duration,
      maxAttempts: review.attempts,
      status: review.status === "draft" ? "draft" : "published",
      questions,
      attachments: [],
      audienceStudentIds: audience.map((student) => student.uid),
      targetGroups: [...new Set(audience.map((student) => `${student.grade ?? ""} ${student.group ?? ""}`.trim()).filter(Boolean))],
      managerIds: profile.role === "student" ? ["demo-teacher-mariana"] : [profile.uid],
      audienceCount: Math.max(1, audience.length),
      startedCount: review.progress > 0 ? Math.max(1, Math.floor(audience.length * 0.75)) : 0,
      completedCount: completed ? Math.max(1, Math.floor(audience.length * 0.6)) : Math.floor(audience.length * 0.45),
      createdBy: "demo-teacher-mariana",
      createdByName: "Mariana López",
      createdByRole: "teacher",
      createdAt: new Date(Date.now() - index * 86_400_000).toISOString(),
      updatedAt: new Date(Date.now() - index * 86_400_000).toISOString(),
      publishedAt: new Date(Date.now() - index * 86_400_000).toISOString(),
      myAttempt:
        profile.role === "student" && progress > 0
          ? {
              id: profile.uid,
              reviewId: review.id,
              studentId: profile.uid,
              studentName: profile.name,
              answers,
              answeredCount,
              progress,
              status: completed ? "completed" : "in_progress",
              score: completed ? 2 : undefined,
              maxScore: completed ? 2 : undefined,
              scorePercent: completed ? 100 : undefined,
              attemptNumber: 1,
              startedAt: new Date(Date.now() - index * 3_600_000).toISOString(),
              completedAt: completed ? new Date().toISOString() : undefined,
              updatedAt: new Date().toISOString(),
            }
          : undefined,
    };
  });
}

export function createDemoWeeklyReview(
  input: WeeklyReviewCreateInput,
  profile: UserProfile,
  config: AcademicConfig,
  calendar: AcademicCalendar,
  accounts: ManagedAccount[],
): WeeklyReview {
  const week = calendar.weeks.find((item) => item.id === input.weekId);
  const term = calendar.terms.find((item) => item.weekIds.includes(input.weekId));
  const students = accounts.filter(
    (account) =>
      account.role === "student" &&
      account.active &&
      includesSubject(account.subjects, input.subject) &&
      (profile.role === "director" || account.teacherIds.includes(profile.uid)) &&
      (input.targetGroups.length === 0 ||
        input.targetGroups.includes(`${account.grade ?? ""} ${account.group ?? ""}`.trim())),
  );
  const id = `demo-review-${Date.now()}`;
  const questions = input.questions.map((question) => ({
    id: question.id,
    type: question.type,
    prompt: question.prompt,
    options: question.options,
    points: question.points,
  }));
  return {
    id,
    firestorePath: `demo/weeklyReviews/${id}`,
    institutionId: profile.institutionId,
    schoolYearId: config.schoolYearId,
    schoolYearLabel: config.schoolYearLabel,
    termId: term?.id ?? config.termId,
    termLabel: term?.label ?? config.termLabel,
    weekId: week?.id ?? config.weekId,
    weekLabel: week?.label ?? config.weekLabel,
    subjectId: slugify(input.subject),
    subject: input.subject,
    title: input.title.trim(),
    description: input.description.trim(),
    duration: input.duration,
    maxAttempts: input.maxAttempts,
    status: input.status,
    questions,
    attachments: input.files.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      storagePath: "",
      contentType: file.type || "application/octet-stream",
      size: file.size,
      downloadUrl: URL.createObjectURL(file),
    })),
    audienceStudentIds: students.map((student) => student.uid),
    targetGroups: [...new Set(students.map((student) => `${student.grade ?? ""} ${student.group ?? ""}`.trim()).filter(Boolean))],
    managerIds: [profile.uid],
    audienceCount: students.length,
    startedCount: 0,
    completedCount: 0,
    createdBy: profile.uid,
    createdByName: profile.name,
    createdByRole: profile.role === "director" ? "director" : "teacher",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    publishedAt: input.status === "published" ? new Date().toISOString() : undefined,
  };
}

export type { WeeklyReviewQuestionInput };
