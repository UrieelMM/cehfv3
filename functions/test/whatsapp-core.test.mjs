import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStudentSummaryLine,
  buildDailyReportTemplateParameters,
  buildTemplateParameters,
  dailyOutboxId,
  isOptOutMessage,
  isTransientWhatsAppError,
  isValidSendTime,
  localDateKey,
  normalizeMexicanPhone,
  retryDelayMinutes,
  shouldRunDailySummary,
} from "../lib/whatsapp-core.js";

test("normaliza teléfonos mexicanos sin conservar el prefijo móvil antiguo", () => {
  assert.equal(normalizeMexicanPhone("55 1234 5678"), "+525512345678");
  assert.equal(normalizeMexicanPhone("+52 55 1234 5678"), "+525512345678");
  assert.equal(normalizeMexicanPhone("+52 1 55 1234 5678"), "+525512345678");
  assert.throws(() => normalizeMexicanPhone("1234"), /10 dígitos/);
});

test("calcula fecha y hora escolar en America/Mexico_City", () => {
  const instant = new Date("2026-08-20T00:00:00.000Z");
  assert.equal(localDateKey(instant), "2026-08-19");
  assert.equal(shouldRunDailySummary("18:00", instant), true);
  assert.equal(shouldRunDailySummary("18:15", instant), false);
  assert.equal(isValidSendTime("18:15"), true);
  assert.equal(isValidSendTime("18:10"), false);
});

test("genera un resumen sin calificaciones ni nombres de materias", () => {
  const summary = {
    studentId: "student-1",
    studentName: "Mateo Hernández",
    firstName: "Mateo",
    submitted: 3,
    total: 4,
    pending: 1,
  };
  assert.equal(
    buildStudentSummaryLine(summary),
    "Mateo: 3 de 4 entregadas; 1 pendiente.",
  );
  const parameters = buildTemplateParameters("2026-08-19", [summary]);
  assert.match(parameters[0], /miércoles,? 19 de agosto de 2026/i);
  assert.equal(parameters[1], "Mateo: 3 de 4 entregadas; 1 pendiente.");
});

test("genera los seis parámetros del reporte diario con emojis", () => {
  assert.deepEqual(
    buildDailyReportTemplateParameters({
      guardianName: "María Hernández",
      studentName: "Mateo Hernández",
      businessDate: "2026-08-19",
      attendance: "present",
      participation: "neutral",
      homework: { total: 2, pending: 1 },
    }),
    [
      "María",
      "Mateo Hernández",
      "miércoles, 19 de agosto de 2026",
      "✅",
      "😐",
      "❌",
    ],
  );
});

test("la clave diaria evita duplicados por contacto y fecha", () => {
  assert.equal(
    dailyOutboxId("2026-08-19", "guardian_123"),
    "daily_2026-08-19_guardian_123",
  );
  assert.equal(
    dailyOutboxId("2026-08-19", "guardian_123", "student_456"),
    "daily_2026-08-19_guardian_123_student_456",
  );
});

test("reconoce bajas y limita reintentos a errores transitorios", () => {
  assert.equal(isOptOutMessage(" baja "), true);
  assert.equal(isOptOutMessage("CANCELAR"), true);
  assert.equal(isOptOutMessage("gracias"), false);
  assert.equal(isTransientWhatsAppError(429), true);
  assert.equal(isTransientWhatsAppError(400, "131047"), false);
  assert.deepEqual(
    [1, 2, 3, 4, 5].map(retryDelayMinutes),
    [1, 5, 15, 60, 240],
  );
});
