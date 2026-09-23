import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("la fecha de entrega determina automáticamente semana y bimestre", async () => {
  const [workflow, app, data, types] = await Promise.all([
    source("components/tasks-workflow.tsx"),
    source("components/cehf-app.tsx"),
    source("lib/tasks-firebase.ts"),
    source("lib/types.ts"),
  ]);

  assert.match(workflow, /resolveTaskAcademicScope\(calendar, dueAt\)/);
  assert.match(workflow, /Esta tarea corresponde a \$\{academicScope\.week\.label\}/);
  assert.match(workflow, /Esta fecha no pertenece al calendario académico/);
  assert.doesNotMatch(workflow, /Entrega: \{task\.weekLabel\}/);
  assert.doesNotMatch(workflow, /weekId: config\.weekId/);
  assert.match(app, /createTaskAssignment\([\s\S]*academicCalendar/);
  assert.match(data, /const academicScope = resolveTaskAcademicScope\(calendar, dueAt\)/);
  assert.match(data, /termId: academicScope\.term\.id/);
  assert.match(data, /weekId: academicScope\.week\.id/);
  assert.doesNotMatch(
    types.match(/export type TaskCreateInput = \{[\s\S]*?\n\};/)?.[0] ?? "",
    /weekId|weekLabel/,
  );
});

test("Firestore rechaza una semana que no contiene la fecha de entrega", async () => {
  const rules = await source("firestore.rules");

  assert.match(rules, /function validTaskDueDateScope/);
  assert.match(rules, /data\.dueAt is timestamp/);
  assert.match(rules, /data\.dueAt > request\.time/);
  assert.match(rules, /data\.dueAt >= get\(weekPath\)\.data\.startAt/);
  assert.match(rules, /data\.dueAt < get\(weekPath\)\.data\.endAt/);
  assert.match(rules, /&& validTaskDueDateScope\(/);
});

test("Tareas abre filtrando la semana académica actual", async () => {
  const [workflow, app] = await Promise.all([
    source("components/tasks-workflow.tsx"),
    source("components/cehf-app.tsx"),
  ]);

  assert.match(workflow, /useState\(\(\) => currentWeekId \|\| "all"\)/);
  assert.match(workflow, /setWeek\(currentWeekId \|\| "all"\)/);
  assert.match(workflow, /id === currentWeekId \? " \(actual\)" : ""/);
  assert.match(app, /key=\{academicConfig\.weekId \|\| "no-active-week"\}/);
  assert.match(app, /currentWeekId=\{academicConfig\.weekId \|\| undefined\}/);
  assert.match(app, /currentWeekLabel=\{academicConfig\.weekLabel \|\| undefined\}/);
});
