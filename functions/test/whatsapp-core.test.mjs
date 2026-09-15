import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStudentSummaryLine,
  buildDailyReportTemplateParameters,
  buildTemplateParameters,
  dailyGradeIndicators,
  dailyOutboxId,
  hasCompleteDailyGradeCoverage,
  isOptOutMessage,
  isTransientWhatsAppError,
  isValidSendTime,
  localDateKey,
  normalizeMexicanPhone,
  retryDelayMinutes,
  shouldRunDailySummary,
  templateParameterValues,
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
  assert.equal(
    shouldRunDailySummary("18:00", new Date("2026-08-20T00:14:00.000Z")),
    true,
  );
  assert.equal(
    shouldRunDailySummary("18:00", new Date("2026-08-20T00:15:00.000Z")),
    false,
  );
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
      homework: "pending",
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

test("conserva parámetros repetidos de la plantilla y su orden", () => {
  assert.deepEqual(
    templateParameterValues(["María", "Mateo", "fecha", "✅", "😊", "✅"]),
    ["María", "Mateo", "fecha", "✅", "😊", "✅"],
  );
});

test("convierte las calificaciones diarias en indicadores familiares", () => {
  assert.deepEqual(
    dailyGradeIndicators({ attendance: 10, participation: 9.2, homework: 8 }),
    { attendance: "present", participation: "positive", homework: "complete" },
  );
  assert.deepEqual(
    dailyGradeIndicators({ attendance: 6, participation: 7, homework: 6.5 }),
    { attendance: "absent", participation: "neutral", homework: "pending" },
  );
  assert.deepEqual(
    dailyGradeIndicators({ attendance: 0, participation: 4, homework: 0 }),
    { attendance: "absent", participation: "needs_support", homework: "pending" },
  );
});

test("considera completo el día según las materias que tuvieron clase", () => {
  assert.equal(
    hasCompleteDailyGradeCoverage(
      ["Lenguaje", "Matemáticas", "Inglés"],
      ["Inglés", "Matemáticas", "Lenguaje"],
    ),
    true,
  );
  assert.equal(
    hasCompleteDailyGradeCoverage(
      ["Lenguaje", "Matemáticas", "Inglés"],
      ["Lenguaje", "Matemáticas"],
    ),
    false,
  );
  assert.equal(
    hasCompleteDailyGradeCoverage(["Matemáticas"], ["Matematicas"]),
    true,
  );
  assert.equal(
    hasCompleteDailyGradeCoverage(["Lenguaje"], ["Español"]),
    true,
  );
  assert.equal(hasCompleteDailyGradeCoverage([], ["Lenguaje"]), false);
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
