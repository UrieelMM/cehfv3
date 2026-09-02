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
  AcademicCalendar,
  AcademicConfig,
  AcademicTerm,
  AcademicWeek,
  DailyGradeRecord,
  GradePeriodSummary,
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

export type GradeReportDirector = { id: string; name: string };

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
  return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : fallback;
};

export function normalizeGradingWeights(value: unknown): GradingWeights {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    classWork: normalizePercentage(data.classWork, DEFAULT_GRADING_WEIGHTS.classWork),
    homework: normalizePercentage(data.homework, DEFAULT_GRADING_WEIGHTS.homework),
    participation: normalizePercentage(data.participation, DEFAULT_GRADING_WEIGHTS.participation),
    attendance: normalizePercentage(data.attendance, DEFAULT_GRADING_WEIGHTS.attendance),
    exam: normalizePercentage(data.exam, DEFAULT_GRADING_WEIGHTS.exam),
  };
}

export function normalizeWeeklyGradeScores(value: unknown): WeeklyGradeScores {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    classWork: normalizePercentage(data.classWork, 0),
    homework: normalizePercentage(data.homework, 0),
    participation: normalizePercentage(data.participation, 0),
    attendance: normalizePercentage(data.attendance, 0),
    exam: normalizePercentage(data.exam, 0),
  };
}

export function gradingWeightTotal(weights: GradingWeights) {
  return GRADING_CRITERIA.reduce((total, criterion) => total + weights[criterion.key], 0);
}

export function calculateWeightedGrade(scores: WeeklyGradeScores, weights: GradingWeights) {
  const result = GRADING_CRITERIA.reduce(
    (total, criterion) => total + scores[criterion.key] * (weights[criterion.key] / 100),
    0,
  );
  return Math.round(result * 10) / 10;
}

function averageScores(items: WeeklyGradeScores[]): WeeklyGradeScores {
  if (!items.length) return normalizeWeeklyGradeScores({});
  return Object.fromEntries(GRADING_CRITERIA.map(({ key }) => [
    key,
    Math.round(items.reduce((sum, scores) => sum + scores[key], 0) / items.length * 10) / 10,
  ])) as WeeklyGradeScores;
}

function nextCalendarDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + 1));
  return date.toISOString().slice(0, 10);
}

export function workingDatesForWeek(calendar: AcademicCalendar, week: AcademicWeek) {
  const excluded = new Set(
    (calendar.nonWorkingDays ?? [])
      .filter((day) => day.active && day.date >= week.startDate && day.date <= week.endDate)
      .map((day) => day.date),
  );
  const dates: string[] = [];
  for (let date = week.startDate; date && date <= week.endDate; date = nextCalendarDate(date)) {
    const weekday = new Date(`${date}T12:00:00.000Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6 && !excluded.has(date)) dates.push(date);
  }
  return dates;
}

function asIso(value: unknown, fallback = new Date().toISOString()) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  return typeof value === "string" && value ? value : fallback;
}

export function gradeSubjectId(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "general";
}

function requireFirestore() {
  if (!firebase.db) throw new Error("Firebase no está configurado para Calificaciones.");
  return firebase.db;
}

function gradingConfigFromData(profile: UserProfile, data?: DocumentData): TeacherGradingConfig {
  return {
    teacherId: profile.uid,
    teacherName: String(data?.teacherName ?? profile.name),
    institutionId: profile.institutionId,
    weights: normalizeGradingWeights(data?.weights),
    subjects: Array.isArray(data?.subjects) ? data.subjects.map(String) : profile.subjects ?? [],
    updatedAt: data?.updatedAt ? asIso(data.updatedAt) : undefined,
  };
}

function dailyGradeFromData(id: string, data: DocumentData): DailyGradeRecord {
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
    gradeDate: String(data.gradeDate ?? ""),
    subjectId: String(data.subjectId ?? gradeSubjectId(String(data.subject ?? "General"))),
    subject: String(data.subject ?? "General"),
    teacherId: String(data.teacherId ?? ""),
    teacherName: String(data.teacherName ?? "Docente CEHF"),
    studentId: String(data.studentId ?? ""),
    studentName: String(data.studentName ?? "Alumno"),
    studentGrade: data.studentGrade ? String(data.studentGrade) : undefined,
    studentGroup: data.studentGroup ? String(data.studentGroup) : undefined,
    scores,
    weights,
    weightedScore: normalizePercentage(data.weightedScore, calculateWeightedGrade(scores, weights)),
    createdAt: asIso(data.createdAt),
    updatedAt: asIso(data.updatedAt),
  };
}

export function aggregateDailyGradesByWeek(
  records: DailyGradeRecord[],
  calendar?: AcademicCalendar,
): WeeklyGradeRecord[] {
  const workingDatesByWeek = new Map(
    (calendar?.weeks ?? []).map((week) => [week.id, new Set(workingDatesForWeek(calendar!, week))]),
  );
  const groups = new Map<string, DailyGradeRecord[]>();
  records.forEach((record) => {
    const validDates = workingDatesByWeek.get(record.weekId);
    if (validDates && !validDates.has(record.gradeDate)) return;
    const key = [record.schoolYearId, record.weekId, record.subjectId, record.teacherId, record.studentId].join("__");
    groups.set(key, [...(groups.get(key) ?? []), record]);
  });
  return [...groups.entries()].map(([id, items]) => {
    const sorted = [...items].sort((a, b) => a.gradeDate.localeCompare(b.gradeDate));
    const latest = sorted.at(-1)!;
    const scores = averageScores(sorted.map((item) => item.scores));
    const dayCount = new Set(sorted.map((item) => item.gradeDate)).size;
    const workingDayCount = workingDatesByWeek.get(latest.weekId)?.size ?? dayCount;
    return {
      id,
      institutionId: latest.institutionId,
      schoolYearId: latest.schoolYearId,
      schoolYearLabel: latest.schoolYearLabel,
      termId: latest.termId,
      termLabel: latest.termLabel,
      weekId: latest.weekId,
      weekLabel: latest.weekLabel,
      subjectId: latest.subjectId,
      subject: latest.subject,
      teacherId: latest.teacherId,
      teacherName: latest.teacherName,
      studentId: latest.studentId,
      studentName: latest.studentName,
      studentGrade: latest.studentGrade,
      studentGroup: latest.studentGroup,
      scores,
      weights: latest.weights,
      weightedScore: calculateWeightedGrade(scores, latest.weights),
      dayCount,
      workingDayCount,
      missingDayCount: Math.max(0, workingDayCount - dayCount),
      createdAt: sorted[0].createdAt,
      updatedAt: latest.updatedAt,
    };
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function weeklySummary(record: WeeklyGradeRecord): GradePeriodSummary {
  return {
    id: record.id,
    level: "weekly",
    periodId: record.weekId,
    periodLabel: record.weekLabel,
    institutionId: record.institutionId,
    schoolYearId: record.schoolYearId,
    schoolYearLabel: record.schoolYearLabel,
    termId: record.termId,
    termLabel: record.termLabel,
    weekId: record.weekId,
    weekLabel: record.weekLabel,
    subjectId: record.subjectId,
    subject: record.subject,
    teacherId: record.teacherId,
    teacherName: record.teacherName,
    studentId: record.studentId,
    studentName: record.studentName,
    studentGrade: record.studentGrade,
    studentGroup: record.studentGroup,
    scores: record.scores,
    weightedScore: record.weightedScore,
    evidenceCount: record.dayCount ?? 0,
    expectedEvidenceCount: record.workingDayCount,
  };
}

function aggregateSummaries(
  source: GradePeriodSummary[],
  level: "bimonthly" | "cycle",
  period: (record: GradePeriodSummary) => { id: string; label: string },
): GradePeriodSummary[] {
  const groups = new Map<string, GradePeriodSummary[]>();
  source.forEach((record) => {
    const selected = period(record);
    const key = [selected.id, record.subjectId, record.teacherId, record.studentId].join("__");
    groups.set(key, [...(groups.get(key) ?? []), record]);
  });
  return [...groups.entries()].map(([id, items]) => {
    const first = items[0];
    const selected = period(first);
    const scores = averageScores(items.map((item) => item.scores));
    const weightedScore = Math.round(
      items.reduce((sum, item) => sum + item.weightedScore, 0) / items.length * 10,
    ) / 10;
    return {
      ...first,
      id,
      level,
      periodId: selected.id,
      periodLabel: selected.label,
      termId: level === "bimonthly" ? first.termId : undefined,
      termLabel: level === "bimonthly" ? first.termLabel : undefined,
      weekId: undefined,
      weekLabel: undefined,
      scores,
      weightedScore,
      evidenceCount: items.length,
    };
  });
}

export function buildGradePeriodSummaries(records: DailyGradeRecord[], calendar: AcademicCalendar) {
  const weekly = aggregateDailyGradesByWeek(records, calendar).map(weeklySummary);
  const bimonthly = aggregateSummaries(weekly, "bimonthly", (record) => ({
    id: record.termId ?? "sin-bimestre",
    label: record.termLabel ?? "Sin bimestre",
  }));
  const cycle = aggregateSummaries(bimonthly, "cycle", (record) => ({
    id: record.schoolYearId,
    label: `Ciclo ${record.schoolYearLabel}`,
  }));
  const termOrder = new Map(calendar.terms.map((term) => [term.id, term.order]));
  bimonthly.sort((a, b) => (termOrder.get(a.periodId) ?? 999) - (termOrder.get(b.periodId) ?? 999));
  return { weekly, bimonthly, cycle };
}

export function watchGradeReportDirectors(
  profile: UserProfile,
  callback: (directors: GradeReportDirector[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!firebase.db) {
    callback(profile.role === "director" ? [{ id: profile.uid, name: profile.name }] : []);
    return () => undefined;
  }
  return onSnapshot(
    query(
      collection(firebase.db, "users"),
      where("institutionId", "==", profile.institutionId),
      where("role", "==", "director"),
      where("active", "==", true),
    ),
    (snapshot) => callback(snapshot.docs.map((entry) => ({
      id: entry.id,
      name: String(entry.data().name ?? "Dirección CEHF"),
    })).sort((a, b) => a.name.localeCompare(b.name, "es"))),
    (error) => onError?.(error),
  );
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
    doc(firebase.db, "institutions", profile.institutionId, "gradingConfigs", profile.uid),
    (snapshot) => callback(gradingConfigFromData(profile, snapshot.exists() ? snapshot.data() : undefined)),
    (error) => onError?.(error),
  );
}

export function watchDailyGrades(
  profile: UserProfile,
  callback: (records: DailyGradeRecord[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!firebase.db) {
    callback([]);
    return () => undefined;
  }
  const constraints: QueryConstraint[] = [];
  if (profile.role === "teacher") constraints.push(where("teacherId", "==", profile.uid));
  if (profile.role === "student") constraints.push(where("studentId", "==", profile.uid));
  return onSnapshot(
    query(collection(firebase.db, "institutions", profile.institutionId, "dailyGrades"), ...constraints),
    (snapshot) => callback(snapshot.docs
      .map((entry) => dailyGradeFromData(entry.id, entry.data()))
      .sort((a, b) => b.gradeDate.localeCompare(a.gradeDate) || a.studentName.localeCompare(b.studentName, "es"))),
    (error) => onError?.(error),
  );
}

export async function saveTeacherGradingConfig(profile: UserProfile, weights: GradingWeights) {
  if (profile.role !== "teacher") throw new Error("Sólo los docentes pueden configurar ponderaciones.");
  if (Math.abs(gradingWeightTotal(weights) - 100) > 0.001) {
    throw new Error("La ponderación debe sumar exactamente 100%.");
  }
  const db = requireFirestore();
  const batch = writeBatch(db);
  batch.set(doc(db, "institutions", profile.institutionId, "gradingConfigs", profile.uid), {
    institutionId: profile.institutionId,
    teacherId: profile.uid,
    teacherName: profile.name,
    subjects: profile.subjects ?? [],
    weights,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  await batch.commit();
}

export async function saveDailyGrade(
  profile: UserProfile,
  config: TeacherGradingConfig,
  academicConfig: AcademicConfig,
  calendar: AcademicCalendar,
  week: AcademicWeek,
  term: AcademicTerm,
  gradeDate: string,
  student: ManagedAccount,
  subject: string,
  scores: WeeklyGradeScores,
) {
  if (profile.role !== "teacher") throw new Error("Sólo los docentes pueden capturar calificaciones.");
  if (!profile.subjects?.includes(subject)) throw new Error("Esta materia no está asignada a tu perfil.");
  if (student.role !== "student" || !student.teacherIds.includes(profile.uid) || !student.subjects.includes(subject)) {
    throw new Error("El alumno no está asignado a esta materia contigo.");
  }
  if (gradeDate < week.startDate || gradeDate > week.endDate) {
    throw new Error("La fecha de captura debe estar dentro de la semana seleccionada.");
  }
  if (!workingDatesForWeek(calendar, week).includes(gradeDate)) {
    throw new Error("La fecha seleccionada es fin de semana o está marcada como día no laboral.");
  }
  if (!term.weekIds.includes(week.id)) throw new Error("La semana seleccionada no pertenece a este bimestre.");
  const normalizedScores = normalizeWeeklyGradeScores(scores);
  const weights = normalizeGradingWeights(config.weights);
  if (Math.abs(gradingWeightTotal(weights) - 100) > 0.001) {
    throw new Error("Configura una ponderación que sume 100% antes de calificar.");
  }
  const db = requireFirestore();
  const subjectId = gradeSubjectId(subject);
  const recordId = [academicConfig.schoolYearId, week.id, gradeDate, subjectId, profile.uid, student.uid].join("__");
  const recordReference = doc(db, "institutions", profile.institutionId, "dailyGrades", recordId);
  const batch = writeBatch(db);
  batch.set(doc(db, "institutions", profile.institutionId, "gradingConfigs", profile.uid), {
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
    gradeDate,
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

// Compatibilidad temporal: cualquier consumidor semanal recibe el promedio
// calculado desde la colección diaria.
export function watchWeeklyGrades(
  profile: UserProfile,
  callback: (records: WeeklyGradeRecord[]) => void,
  onError?: (error: Error) => void,
) {
  return watchDailyGrades(profile, (records) => callback(aggregateDailyGradesByWeek(records)), onError);
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
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: academicConfig.timezone || "America/Mexico_City",
  });
  const gradeDate = today >= week.startDate && today <= week.endDate ? today : week.startDate;
  const calendar: AcademicCalendar = {
    schoolYearId: academicConfig.schoolYearId,
    weeks: [week],
    terms: [term],
    nonWorkingDays: [],
    configured: true,
  };
  const workingDates = workingDatesForWeek(calendar, week);
  const validGradeDate = workingDates.includes(gradeDate) ? gradeDate : workingDates[0] ?? gradeDate;
  return saveDailyGrade(
    profile,
    config,
    academicConfig,
    calendar,
    week,
    term,
    validGradeDate,
    student,
    subject,
    scores,
  );
}
