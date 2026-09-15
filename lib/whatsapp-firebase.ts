"use client";

import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { firebase, normalizeGuardianWhatsApp } from "./firebase";
import type {
  GuardianContact,
  WhatsAppConfiguration,
  WhatsAppLogFilters,
  WhatsAppLogPage,
  WhatsAppOutboxMessage,
} from "./types";

export const defaultWhatsAppConfiguration: WhatsAppConfiguration = {
  institutionId: "cehf-primaria",
  scheduleVersion: 2,
  enabled: false,
  dailySummaryEnabled: true,
  sendTime: "18:00",
  sendOnNoTaskDays: true,
  timeZone: "America/Mexico_City",
  templateName: "cehf_reporte_diario_alumno_v1",
  templateLanguage: "es_MX",
  graphApiVersion: "v23.0",
};

function dateValue(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    return value.toDate().toISOString();
  }
  if (typeof value === "string") return value;
  return new Date(0).toISOString();
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function maskGuardianPhone(phoneE164: string) {
  const digits = phoneE164.replace(/\D/g, "");
  return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : "Número inválido";
}

function contactFromStudentData(id: string, data: DocumentData): GuardianContact {
  const phoneE164 = normalizeGuardianWhatsApp(String(data.guardianWhatsApp ?? ""));
  const authorized = data.guardianWhatsAppAuthorized !== false;
  return {
    id,
    institutionId: String(data.institutionId ?? ""),
    name: String(data.guardianName ?? `Familia de ${String(data.name ?? "Alumno")}`),
    phoneE164,
    phoneMasked: maskGuardianPhone(phoneE164),
    relationship: "Padre, madre o tutor",
    studentIds: [id],
    studentNames: [String(data.name ?? "Alumno")],
    categories: ["daily_grade_report"],
    status: !phoneE164 ? "invalid" : authorized ? "active" : "paused",
    consentStatus: authorized ? "active" : "withdrawn",
    consentVersion: "student-registration",
    consentGrantedAt: dateValue(data.createdAt),
    createdAt: dateValue(data.createdAt),
    updatedAt: dateValue(data.updatedAt),
  };
}

function configurationFromData(
  institutionId: string,
  data?: DocumentData,
): WhatsAppConfiguration {
  const storedTemplateName = String(data?.templateName ?? "");
  return {
    ...defaultWhatsAppConfiguration,
    ...data,
    institutionId,
    scheduleVersion: 2,
    enabled: data?.enabled === true,
    dailySummaryEnabled: data?.dailySummaryEnabled !== false,
    sendOnNoTaskDays: data?.sendOnNoTaskDays !== false,
    sendTime:
      Number(data?.scheduleVersion) === 2
        ? String(data?.sendTime ?? "18:00")
        : "18:00",
    timeZone: String(data?.timeZone ?? "America/Mexico_City"),
    templateName:
      storedTemplateName === "cehf_resumen_tareas_diario_v1"
        ? defaultWhatsAppConfiguration.templateName
        : storedTemplateName || defaultWhatsAppConfiguration.templateName,
    templateLanguage: String(data?.templateLanguage ?? "es_MX"),
    graphApiVersion: String(data?.graphApiVersion ?? "v23.0"),
    lastSuccessfulSendAt: data?.lastSuccessfulSendAt
      ? dateValue(data.lastSuccessfulSendAt)
      : undefined,
  };
}

function messageFromData(
  id: string,
  data: DocumentData,
): WhatsAppOutboxMessage {
  return {
    id,
    institutionId: String(data.institutionId ?? ""),
    guardianContactId: String(data.guardianContactId ?? ""),
    recipientName: String(data.recipientName ?? "Familia CEHF"),
    toMasked: String(data.toMasked ?? "••••"),
    studentNames: stringList(data.studentNames),
    messageKind:
      data.messageKind === "daily_task_summary_test"
        ? "daily_task_summary_test"
        : "daily_task_summary",
    businessDate: String(data.businessDate ?? ""),
    status: data.status ?? "queued",
    attemptCount: Number(data.attemptCount ?? 0),
    createdAt: dateValue(data.createdAt),
    updatedAt: dateValue(data.updatedAt),
    sentAt: data.sentAt ? dateValue(data.sentAt) : undefined,
    deliveredAt: data.deliveredAt ? dateValue(data.deliveredAt) : undefined,
    readAt: data.readAt ? dateValue(data.readAt) : undefined,
    failedAt: data.failedAt ? dateValue(data.failedAt) : undefined,
    lastErrorCode: data.lastErrorCode ? String(data.lastErrorCode) : undefined,
    lastErrorMessage: data.lastErrorMessage
      ? String(data.lastErrorMessage)
      : undefined,
    dailyIndicators:
      data.dailyIndicators && typeof data.dailyIndicators === "object"
        ? data.dailyIndicators
        : undefined,
    dailyScores:
      data.dailyScores && typeof data.dailyScores === "object"
        ? data.dailyScores
        : undefined,
    dailyGradeRecordCount: Number(data.dailyGradeRecordCount ?? 0),
    dailyGradeSubjects: stringList(data.dailyGradeSubjects),
    test: data.test === true,
  };
}

export function watchGuardianContacts(
  institutionId: string,
  callback: (contacts: GuardianContact[]) => void,
  onError?: (error: Error) => void,
) {
  if (!firebase.db) {
    callback([]);
    return () => undefined;
  }
  return onSnapshot(
    query(
      collection(firebase.db, "users"),
      where("institutionId", "==", institutionId),
    ),
    (snapshot) =>
      callback(
        snapshot.docs
          .filter(
            (entry) =>
              entry.data().role === "student" && entry.data().active !== false,
          )
          .map((entry) => contactFromStudentData(entry.id, entry.data()))
          .sort((first, second) => first.name.localeCompare(second.name, "es")),
      ),
    (error) => onError?.(error),
  );
}

export function watchWhatsAppConfiguration(
  institutionId: string,
  callback: (configuration: WhatsAppConfiguration) => void,
  onError?: (error: Error) => void,
) {
  if (!firebase.db) {
    callback({ ...defaultWhatsAppConfiguration, institutionId });
    return () => undefined;
  }
  return onSnapshot(
    doc(firebase.db, "institutions", institutionId, "configuracion", "whatsapp"),
    (snapshot) => callback(configurationFromData(institutionId, snapshot.data())),
    (error) => onError?.(error),
  );
}

export function watchRecentWhatsAppMessages(
  institutionId: string,
  callback: (messages: WhatsAppOutboxMessage[]) => void,
  onError?: (error: Error) => void,
) {
  if (!firebase.db) {
    callback([]);
    return () => undefined;
  }
  return onSnapshot(
    query(
      collection(firebase.db, "messageOutbox"),
      where("institutionId", "==", institutionId),
      orderBy("createdAt", "desc"),
      limit(30),
    ),
    (snapshot) =>
      callback(
        snapshot.docs.map((entry) => messageFromData(entry.id, entry.data())),
      ),
    (error) => onError?.(error),
  );
}

function requireWhatsAppFunctions() {
  if (!firebase.functions) throw new Error("Firebase Functions no está configurado.");
  return firebase.functions;
}

export async function setStudentWhatsAppAuthorized(
  studentId: string,
  authorized: boolean,
) {
  const callable = httpsCallable<
    { studentId: string; authorized: boolean },
    { studentId: string; authorized: boolean }
  >(requireWhatsAppFunctions(), "setStudentWhatsAppAuthorized");
  return (await callable({ studentId, authorized })).data;
}

export async function saveWhatsAppConfiguration(
  configuration: Pick<
    WhatsAppConfiguration,
    | "enabled"
    | "dailySummaryEnabled"
    | "sendTime"
    | "sendOnNoTaskDays"
    | "templateName"
  >,
) {
  const callable = httpsCallable<
    typeof configuration,
    { configuration: WhatsAppConfiguration }
  >(requireWhatsAppFunctions(), "saveWhatsAppConfiguration");
  return (await callable(configuration)).data.configuration;
}

export async function sendWhatsAppTest(studentId: string) {
  const callable = httpsCallable<
    { studentId: string },
    { outboxId: string; status: string }
  >(requireWhatsAppFunctions(), "sendWhatsAppTest");
  return (await callable({ studentId })).data;
}

export async function queueDailyWhatsAppSummaries(businessDate?: string) {
  const callable = httpsCallable<
    { businessDate?: string },
    { queued: number; skipped: number; businessDate: string }
  >(requireWhatsAppFunctions(), "queueDailyWhatsAppSummaries");
  return (await callable({ ...(businessDate ? { businessDate } : {}) })).data;
}

export async function listWhatsAppMessageLog(
  filters: WhatsAppLogFilters,
  pageToken?: string,
  pageSize = 15,
) {
  const callable = httpsCallable<
    WhatsAppLogFilters & { pageToken?: string; pageSize: number },
    WhatsAppLogPage
  >(requireWhatsAppFunctions(), "listWhatsAppMessageLog");
  return (
    await callable({
      ...filters,
      pageSize,
      ...(pageToken ? { pageToken } : {}),
    })
  ).data;
}
