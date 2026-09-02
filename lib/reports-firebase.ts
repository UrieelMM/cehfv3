"use client";

import {
  collection,
  deleteField,
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
import { gradeSubjectId } from "./grades-firebase";
import type {
  AcademicConfig,
  AcademicTerm,
  AcademicWeek,
  ManagedAccount,
  StudentWeeklyReport,
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
    weeklyScore: Math.min(100, Math.max(0, Number(data.weeklyScore) || 0)),
    gradedDays: Math.max(0, Number(data.gradedDays) || 0),
    workingDays: Math.max(0, Number(data.workingDays) || Number(data.gradedDays) || 0),
    status: data.status === "published" ? "published" : "draft",
    createdAt: asIso(data.createdAt),
    updatedAt: asIso(data.updatedAt),
    publishedAt: data.publishedAt ? asIso(data.publishedAt) : undefined,
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
  if (!profile.subjects?.includes(input.subject)) throw new Error("Esta materia no está asignada a tu perfil.");
  if (
    input.student.role !== "student" ||
    !input.student.teacherIds.includes(profile.uid) ||
    !input.student.subjects.includes(input.subject)
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
  const db = firebase.db;
  if (!db) throw new Error("Firebase no está configurado para Reportes.");
  const subjectId = gradeSubjectId(input.subject);
  const reportId = [
    academicConfig.schoolYearId,
    input.week.id,
    subjectId,
    profile.uid,
    input.student.uid,
  ].join("__");
  const reference = doc(
    db,
    "institutions",
    profile.institutionId,
    "studentWeeklyReports",
    reportId,
  );
  const batch = writeBatch(db);
  batch.set(reference, {
    institutionId: profile.institutionId,
    schoolYearId: academicConfig.schoolYearId,
    schoolYearLabel: academicConfig.schoolYearLabel,
    termId: input.term.id,
    termLabel: input.term.label,
    weekId: input.week.id,
    weekLabel: input.week.label,
    subjectId,
    subject: input.subject,
    teacherId: profile.uid,
    teacherName: profile.name,
    studentId: input.student.uid,
    studentName: input.student.name,
    studentGrade: input.student.grade ?? "",
    studentGroup: input.student.group ?? "",
    achievement,
    supportArea,
    nextStep,
    weeklyScore: Math.min(100, Math.max(0, input.weeklyScore)),
    gradedDays: Math.max(0, Math.round(input.gradedDays)),
    workingDays: Math.max(0, Math.round(input.workingDays)),
    status: input.status,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    publishedAt: input.status === "published" ? serverTimestamp() : deleteField(),
  }, { merge: true });
  await batch.commit();
}
