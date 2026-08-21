"use client";

import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
  type DocumentData,
  type QueryConstraint,
  type Unsubscribe,
} from "firebase/firestore";
import { firebase } from "./firebase";
import type {
  AcademicConfig,
  AcademicTerm,
  AcademicWeek,
  GradingCriterion,
  GradingWeights,
  ManagedAccount,
  TeacherGradingConfig,
  UserProfile,
  WeeklyGradeRecord,
  WeeklyGradeScores,
} from "./types";

export const DEFAULT_GRADING_WEIGHTS: GradingWeights = {
  classWork: 45,
  homework: 10,
  participation: 15,
  attendance: 10,
  exam: 20,
};

export const DEFAULT_WEEKLY_GRADE_SCORES: WeeklyGradeScores = {
  classWork: 100,
  homework: 100,
  participation: 100,
  attendance: 100,
  exam: 100,
};

export const GRADING_CRITERIA: Array<{
  key: GradingCriterion;
  label: string;
  shortLabel: string;
}> = [
  { key: "classWork", label: "Trabajo en clase", shortLabel: "Clase" },
  { key: "homework", label: "Tareas", shortLabel: "Tareas" },
  { key: "participation", label: "Participación", shortLabel: "Participación" },
  { key: "attendance", label: "Asistencia", shortLabel: "Asistencia" },
  { key: "exam", label: "Evaluación", shortLabel: "Evaluación" },
];

const normalizePercentage = (value: unknown, fallback: number) => {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.min(100, Math.max(0, number))
    : fallback;
};

export function normalizeGradingWeights(value: unknown): GradingWeights {
  const data = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  return {
    classWork: normalizePercentage(
      data.classWork,
      DEFAULT_GRADING_WEIGHTS.classWork,
    ),
    homework: normalizePercentage(
      data.homework,
      DEFAULT_GRADING_WEIGHTS.homework,
    ),
    participation: normalizePercentage(
      data.participation,
      DEFAULT_GRADING_WEIGHTS.participation,
    ),
    attendance: normalizePercentage(
      data.attendance,
      DEFAULT_GRADING_WEIGHTS.attendance,
    ),
    exam: normalizePercentage(data.exam, DEFAULT_GRADING_WEIGHTS.exam),
  };
}

export function normalizeWeeklyGradeScores(value: unknown): WeeklyGradeScores {
  const data = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  return {
    classWork: normalizePercentage(data.classWork, 0),
    homework: normalizePercentage(data.homework, 0),
    participation: normalizePercentage(data.participation, 0),
    attendance: normalizePercentage(data.attendance, 0),
    exam: normalizePercentage(data.exam, 0),
  };
}

export function gradingWeightTotal(weights: GradingWeights) {
  return GRADING_CRITERIA.reduce((total, criterion) => (
    total + weights[criterion.key]
  ), 0);
}

export function calculateWeightedGrade(
  scores: WeeklyGradeScores,
  weights: GradingWeights,
) {
  const result = GRADING_CRITERIA.reduce((total, criterion) => (
    total + scores[criterion.key] * (weights[criterion.key] / 100)
  ), 0);
  return Math.round(result * 10) / 10;
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

function requireFirestore() {
  if (!firebase.db) {
    throw new Error("Firebase no está configurado para Calificaciones.");
  }
  return firebase.db;
}

function gradingConfigFromData(
  profile: UserProfile,
  data?: DocumentData,
): TeacherGradingConfig {
  return {
    teacherId: profile.uid,
    teacherName: String(data?.teacherName ?? profile.name),
    institutionId: profile.institutionId,
    weights: normalizeGradingWeights(data?.weights),
    subjects: Array.isArray(data?.subjects)
      ? data.subjects.map(String)
      : profile.subjects ?? [],
    updatedAt: data?.updatedAt ? asIso(data.updatedAt) : undefined,
  };
}

function weeklyGradeFromData(
  id: string,
  data: DocumentData,
): WeeklyGradeRecord {
  const scores = normalizeWeeklyGradeScores(data.scores);
  const weights = normalizeGradingWeights(data.weights);
  return {
    id,
    institutionId: String(data.institutionId ?? ""),
    schoolYearId: String(data.schoolYearId ?? ""),
    schoolYearLabel: String(data.schoolYearLabel ?? ""),
    termId: String(data.termId ?? ""),
    termLabel: String(data.termLabel ?? ""),
    weekId: String(data.weekId ?? ""),
    weekLabel: String(data.weekLabel ?? "Semana"),
    subjectId: String(data.subjectId ?? slugify(String(data.subject ?? "General"))),
    subject: String(data.subject ?? "General"),
    teacherId: String(data.teacherId ?? ""),
    teacherName: String(data.teacherName ?? "Docente CEHF"),
    studentId: String(data.studentId ?? ""),
    studentName: String(data.studentName ?? "Alumno"),
    studentGrade: data.studentGrade ? String(data.studentGrade) : undefined,
    studentGroup: data.studentGroup ? String(data.studentGroup) : undefined,
    scores,
    weights,
    weightedScore: normalizePercentage(
      data.weightedScore,
      calculateWeightedGrade(scores, weights),
    ),
    createdAt: asIso(data.createdAt),
    updatedAt: asIso(data.updatedAt),
  };
}

export function watchTeacherGradingConfig(
  profile: UserProfile,
  callback: (config: TeacherGradingConfig) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!firebase.db || profile.role !== "teacher") {
    callback(gradingConfigFromData(profile));
    return () => undefined;
  }
  return onSnapshot(
    doc(
      firebase.db,
      "institutions",
      profile.institutionId,
      "gradingConfigs",
      profile.uid,
    ),
    (snapshot) => callback(
      gradingConfigFromData(profile, snapshot.exists() ? snapshot.data() : undefined),
    ),
    (error) => onError?.(error),
  );
}

export function watchWeeklyGrades(
  profile: UserProfile,
  callback: (records: WeeklyGradeRecord[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!firebase.db) {
    callback([]);
    return () => undefined;
  }
  const constraints: QueryConstraint[] = [];
  if (profile.role === "teacher") {
    constraints.push(where("teacherId", "==", profile.uid));
  } else if (profile.role === "student") {
    constraints.push(where("studentId", "==", profile.uid));
  }
  return onSnapshot(
    query(
      collection(
        firebase.db,
        "institutions",
        profile.institutionId,
        "weeklyGrades",
      ),
      ...constraints,
    ),
    (snapshot) => callback(
      snapshot.docs
        .map((entry) => weeklyGradeFromData(entry.id, entry.data()))
        .sort((first, second) => (
          second.updatedAt.localeCompare(first.updatedAt) ||
          first.subject.localeCompare(second.subject, "es")
        )),
    ),
    (error) => onError?.(error),
  );
}

export async function saveTeacherGradingConfig(
  profile: UserProfile,
  weights: GradingWeights,
) {
  if (profile.role !== "teacher") {
    throw new Error("Sólo los docentes pueden configurar ponderaciones.");
  }
  if (Math.abs(gradingWeightTotal(weights) - 100) > 0.001) {
    throw new Error("La ponderación debe sumar exactamente 100%.");
  }
  const db = requireFirestore();
  const reference = doc(
    db,
    "institutions",
    profile.institutionId,
    "gradingConfigs",
    profile.uid,
  );
  const batch = writeBatch(db);
  batch.set(reference, {
    institutionId: profile.institutionId,
    teacherId: profile.uid,
    teacherName: profile.name,
    subjects: profile.subjects ?? [],
    weights,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  await batch.commit();
}

export async function saveWeeklyGrade(
  profile: UserProfile,
  config: TeacherGradingConfig,
  academicConfig: AcademicConfig,
  week: AcademicWeek,
  term: AcademicTerm,
  student: ManagedAccount,
  subject: string,
  scores: WeeklyGradeScores,
) {
  if (profile.role !== "teacher") {
    throw new Error("Sólo los docentes pueden capturar calificaciones.");
  }
  if (!profile.subjects?.includes(subject)) {
    throw new Error("Esta materia no está asignada a tu perfil.");
  }
  if (
    student.role !== "student" ||
    !student.teacherIds.includes(profile.uid) ||
    !student.subjects.includes(subject)
  ) {
    throw new Error("El alumno no está asignado a esta materia contigo.");
  }
  const normalizedScores = normalizeWeeklyGradeScores(scores);
  const weights = normalizeGradingWeights(config.weights);
  if (Math.abs(gradingWeightTotal(weights) - 100) > 0.001) {
    throw new Error("Configura una ponderación que sume 100% antes de calificar.");
  }
  if (!term.weekIds.includes(week.id)) {
    throw new Error("La semana seleccionada no pertenece a este trimestre.");
  }

  const db = requireFirestore();
  const subjectId = slugify(subject);
  const recordId = [
    academicConfig.schoolYearId,
    week.id,
    subjectId,
    profile.uid,
    student.uid,
  ].join("__");
  const configReference = doc(
    db,
    "institutions",
    profile.institutionId,
    "gradingConfigs",
    profile.uid,
  );
  const recordReference = doc(
    db,
    "institutions",
    profile.institutionId,
    "weeklyGrades",
    recordId,
  );
  const batch = writeBatch(db);
  batch.set(configReference, {
    institutionId: profile.institutionId,
    teacherId: profile.uid,
    teacherName: profile.name,
    subjects: profile.subjects ?? [],
    weights,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  batch.set(recordReference, {
    institutionId: profile.institutionId,
    schoolYearId: academicConfig.schoolYearId,
    schoolYearLabel: academicConfig.schoolYearLabel,
    termId: term.id,
    termLabel: term.label,
    weekId: week.id,
    weekLabel: week.label,
    subjectId,
    subject,
    teacherId: profile.uid,
    teacherName: profile.name,
    studentId: student.uid,
    studentName: student.name,
    studentGrade: student.grade ?? "",
    studentGroup: student.group ?? "",
    scores: normalizedScores,
    weights,
    weightedScore: calculateWeightedGrade(normalizedScores, weights),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
  await batch.commit();
}
