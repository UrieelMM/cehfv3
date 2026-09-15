export const WHATSAPP_DAILY_TEMPLATE = "cehf_reporte_diario_alumno_v1";
export const WHATSAPP_TEMPLATE_LANGUAGE = "es_MX";
export const WHATSAPP_TIMEZONE = "America/Mexico_City";
export const WHATSAPP_CONSENT_VERSION = "2026-08-19";

export type DailyStudentSummary = {
  studentId: string;
  studentName: string;
  firstName: string;
  submitted: number;
  total: number;
  pending: number;
};

export type DailyAttendanceStatus = "present" | "absent";
export type DailyParticipationStatus =
  | "positive"
  | "neutral"
  | "needs_support";
export type DailyHomeworkStatus = "complete" | "pending";

export type DailyGradeIndicatorScores = {
  attendance: number;
  participation: number;
  homework: number;
};

export type DailyReportTemplateInput = {
  guardianName: string;
  studentName: string;
  businessDate: string;
  attendance: DailyAttendanceStatus;
  participation: DailyParticipationStatus;
  homework: DailyHomeworkStatus;
};

function digits(value: string) {
  return value.replace(/\D/g, "");
}

export function normalizeMexicanPhone(value: unknown) {
  let normalized = digits(String(value ?? "").trim());
  if (normalized.startsWith("00")) normalized = normalized.slice(2);
  if (normalized.length === 10) normalized = `52${normalized}`;
  // México eliminó el prefijo móvil 1; todavía aparece en agendas antiguas.
  if (normalized.startsWith("521") && normalized.length === 13) {
    normalized = `52${normalized.slice(3)}`;
  }
  if (!normalized.startsWith("52") || normalized.length !== 12) {
    throw new Error(
      "El teléfono debe tener 10 dígitos de México, por ejemplo 55 1234 5678.",
    );
  }
  return `+${normalized}`;
}

export function maskPhone(phoneE164: string) {
  const phoneDigits = digits(phoneE164);
  return phoneDigits.length >= 4 ? `•••• ${phoneDigits.slice(-4)}` : "••••";
}

function zonedParts(date: Date, timeZone: string) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}

export function localDateKey(
  date = new Date(),
  timeZone = WHATSAPP_TIMEZONE,
) {
  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function localTimeKey(
  date = new Date(),
  timeZone = WHATSAPP_TIMEZONE,
) {
  const parts = zonedParts(date, timeZone);
  return `${parts.hour}:${parts.minute}`;
}

export function isWeekday(
  date = new Date(),
  timeZone = WHATSAPP_TIMEZONE,
) {
  return !["Sat", "Sun"].includes(zonedParts(date, timeZone).weekday);
}

export function isValidSendTime(value: unknown) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value ?? ""));
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && [0, 15, 30, 45].includes(minute);
}

export function shouldRunDailySummary(
  sendTime: string,
  date = new Date(),
  timeZone = WHATSAPP_TIMEZONE,
) {
  if (!isWeekday(date, timeZone) || !isValidSendTime(sendTime)) return false;
  const [sendHour, sendMinute] = sendTime.split(":").map(Number);
  const [localHour, localMinute] = localTimeKey(date, timeZone)
    .split(":")
    .map(Number);
  const elapsedMinutes = localHour * 60 + localMinute -
    (sendHour * 60 + sendMinute);
  // Cloud Scheduler may invoke an `every 15 minutes` job a few minutes after
  // the quarter-hour. The deterministic outbox id keeps this window idempotent.
  return elapsedMinutes >= 0 && elapsedMinutes < 15;
}

export function formatBusinessDateSpanish(dateKey: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new Error("La fecha escolar no es válida.");
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12),
  );
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function firstName(value: unknown) {
  return String(value ?? "Alumno").trim().split(/\s+/)[0] || "Alumno";
}

export function buildStudentSummaryLine(summary: DailyStudentSummary) {
  if (summary.total === 0) {
    return `${summary.firstName}: no tuvo tareas programadas para entrega.`;
  }
  if (summary.pending === 0) {
    return `${summary.firstName}: ${summary.submitted} de ${summary.total} entregadas; sin pendientes.`;
  }
  return `${summary.firstName}: ${summary.submitted} de ${summary.total} entregadas; ${summary.pending} pendiente${summary.pending === 1 ? "" : "s"}.`;
}

export function buildTemplateParameters(
  businessDate: string,
  summaries: DailyStudentSummary[],
) {
  if (!summaries.length) throw new Error("El resumen no contiene estudiantes.");
  return [
    formatBusinessDateSpanish(businessDate),
    summaries.map(buildStudentSummaryLine).join("\n"),
  ];
}

export function attendanceEmoji(status: DailyAttendanceStatus) {
  return status === "present" ? "✅" : "❌";
}

export function participationEmoji(status: DailyParticipationStatus) {
  if (status === "positive") return "😊";
  if (status === "neutral") return "😐";
  return "😟";
}

export function homeworkEmoji(
  status: DailyHomeworkStatus,
) {
  return status === "complete" ? "✅" : "❌";
}

export function dailyGradeIndicators(
  scores: DailyGradeIndicatorScores,
): {
  attendance: DailyAttendanceStatus;
  participation: DailyParticipationStatus;
  homework: DailyHomeworkStatus;
} {
  return {
    attendance: (scores.attendance >= 7
      ? "present"
      : "absent") satisfies DailyAttendanceStatus,
    participation: (scores.participation >= 8
      ? "positive"
      : scores.participation >= 6
        ? "neutral"
        : "needs_support") satisfies DailyParticipationStatus,
    homework: (scores.homework >= 7
      ? "complete"
      : "pending") satisfies DailyHomeworkStatus,
  };
}

const DAILY_GRADE_SUBJECT_ALIASES = new Map([
  ["espanol", "lenguaje"],
  ["formacion civica", "civica"],
  ["educacion fisica", "fisica"],
  ["lectura y compresion", "lectura y comprension"],
]);

function dailyGradeSubjectKey(value: unknown) {
  const key = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("es-MX");
  return DAILY_GRADE_SUBJECT_ALIASES.get(key) ?? key;
}

export function hasCompleteDailyGradeCoverage(
  expectedSubjects: readonly string[],
  recordedSubjects: readonly string[],
) {
  const expected = new Set(
    expectedSubjects.map(dailyGradeSubjectKey).filter(Boolean),
  );
  if (!expected.size) return false;
  const recorded = new Set(
    recordedSubjects.map(dailyGradeSubjectKey).filter(Boolean),
  );
  return [...expected].every((subject) => recorded.has(subject));
}

export function buildDailyReportTemplateParameters(
  report: DailyReportTemplateInput,
) {
  return [
    firstName(report.guardianName),
    String(report.studentName).trim() || "Alumno",
    formatBusinessDateSpanish(report.businessDate),
    attendanceEmoji(report.attendance),
    participationEmoji(report.participation),
    homeworkEmoji(report.homework),
  ];
}

export function templateParameterValues(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

export function dailyOutboxId(
  businessDate: string,
  contactId: string,
  studentId?: string,
) {
  const safeDate = businessDate.replace(/[^0-9-]/g, "");
  const safeContact = contactId.replace(/[^A-Za-z0-9_-]/g, "_");
  const safeStudent = studentId?.replace(/[^A-Za-z0-9_-]/g, "_");
  return `daily_${safeDate}_${safeContact}${safeStudent ? `_${safeStudent}` : ""}`;
}

export function isOptOutMessage(value: unknown) {
  const normalized = String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  return ["BAJA", "STOP", "CANCELAR", "SALIR", "DETENER"].includes(normalized);
}

export function retryDelayMinutes(attempt: number) {
  return [1, 5, 15, 60, 240][Math.max(0, Math.min(attempt - 1, 4))];
}

export function isTransientWhatsAppError(httpStatus: number, code?: string) {
  if (httpStatus === 408 || httpStatus === 429 || httpStatus >= 500) return true;
  return new Set([
    "1",
    "2",
    "4",
    "17",
    "32",
    "613",
    "131000",
    "131016",
    "131048",
    "131056",
  ]).has(String(code ?? ""));
}
