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
import { firebase } from "./firebase";
import type {
  GuardianContact,
  GuardianContactStatus,
  WhatsAppConfiguration,
  WhatsAppOutboxMessage,
} from "./types";

export const defaultWhatsAppConfiguration: WhatsAppConfiguration = {
  institutionId: "cehf-primaria",
  enabled: false,
  dailySummaryEnabled: true,
  sendTime: "18:00",
  sendOnNoTaskDays: true,
  timeZone: "America/Mexico_City",
  templateName: "cehf_reporte_diario_alumno_v1",
  templateLanguage: "es_MX",
  graphApiVersion: "v23.0",
};

export type GuardianContactInput = {
  id?: string;
  name: string;
  phone: string;
  relationship: string;
  studentIds: string[];
  consentConfirmed: boolean;
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

function contactFromData(id: string, data: DocumentData): GuardianContact {
  return {
    id,
    institutionId: String(data.institutionId ?? ""),
    name: String(data.name ?? "Familia CEHF"),
    phoneE164: String(data.phoneE164 ?? ""),
    phoneMasked: String(data.phoneMasked ?? "••••"),
    relationship: String(data.relationship ?? "Tutor"),
    studentIds: stringList(data.studentIds),
    studentNames: stringList(data.studentNames),
    categories: stringList(data.categories),
    status: (data.status ?? "paused") as GuardianContactStatus,
    consentStatus: data.consentStatus === "active" ? "active" : "withdrawn",
    consentVersion: String(data.consentVersion ?? ""),
    consentGrantedAt: dateValue(data.consentGrantedAt),
    optedOutAt: data.optedOutAt ? dateValue(data.optedOutAt) : undefined,
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
    enabled: data?.enabled === true,
    dailySummaryEnabled: data?.dailySummaryEnabled !== false,
    sendOnNoTaskDays: data?.sendOnNoTaskDays !== false,
    sendTime: String(data?.sendTime ?? "18:00"),
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
      collection(firebase.db, "guardianContacts"),
      where("institutionId", "==", institutionId),
    ),
    (snapshot) =>
      callback(
        snapshot.docs
          .map((entry) => contactFromData(entry.id, entry.data()))
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

export async function saveGuardianContact(input: GuardianContactInput) {
  const callable = httpsCallable<GuardianContactInput, { contact: GuardianContact }>(
    requireWhatsAppFunctions(),
    "saveGuardianContact",
  );
  return (await callable(input)).data.contact;
}

export async function setGuardianContactStatus(
  id: string,
  status: "active" | "paused" | "opted_out",
  consentConfirmed = false,
) {
  const callable = httpsCallable<
    { id: string; status: string; consentConfirmed: boolean },
    { id: string; status: GuardianContactStatus }
  >(requireWhatsAppFunctions(), "setGuardianContactStatus");
  return (await callable({ id, status, consentConfirmed })).data;
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

export async function sendWhatsAppTest(contactId: string) {
  const callable = httpsCallable<
    { contactId: string },
    { outboxId: string; status: string }
  >(requireWhatsAppFunctions(), "sendWhatsAppTest");
  return (await callable({ contactId })).data;
}

export async function queueDailyWhatsAppSummaries(businessDate?: string) {
  const callable = httpsCallable<
    { businessDate?: string },
    { queued: number; skipped: number; businessDate: string }
  >(requireWhatsAppFunctions(), "queueDailyWhatsAppSummaries");
  return (await callable({ ...(businessDate ? { businessDate } : {}) })).data;
}
