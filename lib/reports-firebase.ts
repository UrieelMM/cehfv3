"use client";

import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
  type DocumentData,
  type QueryConstraint,
  type Unsubscribe,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { firebase } from "./firebase";
import { clampGradeScore, normalizeStoredGradeScore } from "./grade-scale";
import { includesSubject, studentCanTakeSubject } from "./academic-subjects";
import type {
  AcademicConfig,
  AcademicTerm,
  AcademicWeek,
  ManagedAccount,
  StudentWeeklyReport,
  StudentWeeklyReportView,
  UserProfile,
} from "./types";

function asIso(value: unknown, fallback = new Date().toISOString()) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  return typeof value === "string" && value ? value : fallback;
}

function fromData(id: string, data: DocumentData): StudentWeeklyReport {
  return {
    id,
    institutionId: String(data.institutionId ?? ""),
    schoolYearId: String(data.schoolYearId ?? ""),
    schoolYearLabel: String(data.schoolYearLabel ?? ""),
    termId: String(data.termId ?? ""),
    termLabel: String(data.termLabel ?? ""),
    weekId: String(data.weekId ?? ""),
    weekLabel: String(data.weekLabel ?? "Semana"),
    subjectId: String(data.subjectId ?? "general"),
    subject: String(data.subject ?? "General"),
    teacherId: String(data.teacherId ?? ""),
    teacherName: String(data.teacherName ?? "Docente CEHF"),
    studentId: String(data.studentId ?? ""),
    studentName: String(data.studentName ?? "Alumno"),
    studentGrade: data.studentGrade ? String(data.studentGrade) : undefined,
    studentGroup: data.studentGroup ? String(data.studentGroup) : undefined,
    achievement: String(data.achievement ?? ""),
    supportArea: String(data.supportArea ?? ""),
    nextStep: String(data.nextStep ?? ""),
    weeklyScore: normalizeStoredGradeScore(data.weeklyScore),
    gradedDays: Math.max(0, Number(data.gradedDays) || 0),
    workingDays: Math.max(0, Number(data.workingDays) || Number(data.gradedDays) || 0),
    status: data.status === "published" ? "published" : "draft",
    createdAt: asIso(data.createdAt),
    updatedAt: asIso(data.updatedAt),
    publishedAt: data.publishedAt ? asIso(data.publishedAt) : undefined,
  };
}

function viewFromData(data: DocumentData): StudentWeeklyReportView {
  return {
    reportId: String(data.reportId ?? ""),
    institutionId: String(data.institutionId ?? ""),
    teacherId: String(data.teacherId ?? ""),
    studentId: String(data.studentId ?? ""),
    studentName: String(data.studentName ?? "Alumno"),
    firstOpenedAt: asIso(data.firstOpenedAt),
    lastOpenedAt: asIso(data.lastOpenedAt),
    viewCount: Math.max(1, Number(data.viewCount ?? 1)),
  };
}

export function watchStudentWeeklyReports(
  profile: UserProfile,
  callback: (reports: StudentWeeklyReport[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!firebase.db) {
    callback([]);
    return () => undefined;
  }
  const constraints: QueryConstraint[] = [];
  if (profile.role === "teacher") constraints.push(where("teacherId", "==", profile.uid));
  if (profile.role === "student") {
    constraints.push(where("studentId", "==", profile.uid));
    constraints.push(where("status", "==", "published"));
  }
  return onSnapshot(
    query(
      collection(firebase.db, "institutions", profile.institutionId, "studentWeeklyReports"),
      ...constraints,
    ),
    (snapshot) => callback(snapshot.docs
      .map((entry) => fromData(entry.id, entry.data()))
      .filter((report) => profile.role !== "student" || report.status === "published")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))),
    (error) => onError?.(error),
  );
}

export function watchStudentWeeklyReportViews(
  profile: UserProfile,
  callback: (views: StudentWeeklyReportView[]) => void,
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
    query(
      collection(firebase.db, "institutions", profile.institutionId, "studentWeeklyReportViews"),
      ...constraints,
    ),
    (snapshot) => callback(snapshot.docs
      .map((entry) => viewFromData(entry.data()))
      .sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt))),
    (error) => onError?.(error),
  );
}

export async function markStudentWeeklyReportViewed(
  report: StudentWeeklyReport,
  profile: UserProfile,
) {
  if (!firebase.db || profile.role !== "student" || report.studentId !== profile.uid) return;
  const reference = doc(
    firebase.db,
    "institutions",
    profile.institutionId,
    "studentWeeklyReportViews",
    report.id,
  );
  await runTransaction(firebase.db, async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (snapshot.exists()) {
      transaction.update(reference, {
        lastOpenedAt: serverTimestamp(),
        viewCount: Math.max(1, Number(snapshot.data().viewCount ?? 1)) + 1,
      });
      return;
    }
    transaction.set(reference, {
      reportId: report.id,
      institutionId: report.institutionId,
      teacherId: report.teacherId,
      studentId: report.studentId,
      // The report keeps the canonical student snapshot that the security
      // rules validate. The profile name may have changed after publication.
      studentName: report.studentName,
      firstOpenedAt: serverTimestamp(),
      lastOpenedAt: serverTimestamp(),
      viewCount: 1,
    });
  });
}

export type SaveStudentWeeklyReportInput = {
  week: AcademicWeek;
  term: AcademicTerm;
  student: ManagedAccount;
  subject: string;
  achievement: string;
  supportArea: string;
  nextStep: string;
  weeklyScore: number;
  gradedDays: number;
  workingDays: number;
  status: "draft" | "published";
};

export async function saveStudentWeeklyReport(
  profile: UserProfile,
  academicConfig: AcademicConfig,
  input: SaveStudentWeeklyReportInput,
) {
  if (profile.role !== "teacher") throw new Error("Sólo los docentes pueden elaborar reportes.");
  if (!includesSubject(profile.subjects ?? [], input.subject)) throw new Error("Esta materia no está asignada a tu perfil.");
  if (
    input.student.role !== "student" ||
    !input.student.teacherIds.includes(profile.uid) ||
    !studentCanTakeSubject(input.student, input.subject)
  ) {
    throw new Error("El alumno no está asignado a esta materia contigo.");
  }
  if (!input.term.weekIds.includes(input.week.id)) {
    throw new Error("La semana seleccionada no pertenece a este bimestre.");
  }
  const achievement = input.achievement.trim();
  const supportArea = input.supportArea.trim();
  const nextStep = input.nextStep.trim();
  if (!achievement || !supportArea || !nextStep) {
    throw new Error("Completa los tres campos de acompañamiento.");
  }
  if ([achievement, supportArea, nextStep].some((value) => value.length > 600)) {
    throw new Error("Cada campo puede tener hasta 600 caracteres.");
  }
  if (!firebase.functions) throw new Error("Firebase no está configurado para Reportes.");
  const callable = httpsCallable<
    {
      schoolYearId: string;
      schoolYearLabel: string;
      termId: string;
      termLabel: string;
      weekId: string;
      weekLabel: string;
      studentId: string;
      subject: string;
      achievement: string;
      supportArea: string;
      nextStep: string;
      weeklyScore: number;
      gradedDays: number;
      workingDays: number;
      status: "draft" | "published";
    },
    { reportId: string; status: "draft" | "published" }
  >(firebase.functions, "saveStudentWeeklyReport");
  return (await callable({
    schoolYearId: academicConfig.schoolYearId,
    schoolYearLabel: academicConfig.schoolYearLabel,
    termId: input.term.id,
    termLabel: input.term.label,
    weekId: input.week.id,
    weekLabel: input.week.label,
    studentId: input.student.uid,
    subject: input.subject,
    achievement,
    supportArea,
    nextStep,
    weeklyScore: clampGradeScore(input.weeklyScore),
    gradedDays: Math.max(0, Math.round(input.gradedDays)),
    workingDays: Math.max(0, Math.round(input.workingDays)),
    status: input.status,
  })).data;
}

export async function deleteStudentWeeklyReport(report: StudentWeeklyReport) {
  if (!firebase.functions) throw new Error("Firebase no está configurado para Reportes.");
  const callable = httpsCallable<{ reportId: string }, { deleted: boolean }>(
    firebase.functions,
    "deleteStudentWeeklyReport",
  );
  return (await callable({ reportId: report.id })).data;
}

export async function updateStudentWeeklyReport(
  report: StudentWeeklyReport,
  input: Pick<StudentWeeklyReport, "achievement" | "supportArea" | "nextStep" | "status">,
) {
  if (!firebase.functions) throw new Error("Firebase no está configurado para Reportes.");
  const callable = httpsCallable<
    { entityType: "report"; reportId: string } & typeof input,
    { updated: boolean }
  >(firebase.functions, "updateManagedContent");
  return (await callable({ entityType: "report", reportId: report.id, ...input })).data;
}
