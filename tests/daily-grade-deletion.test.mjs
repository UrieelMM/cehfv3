import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadFirebaseTransactions } from "./helpers/firebase-transactions.mjs";

const profile = { uid: "teacher-a", role: "teacher", active: true, institutionId: "school-a" };
const record = {
  id: "daily-a", institutionId: "school-a", schoolYearId: "cycle-a", weekId: "week-a",
  termId: "term-a", subjectId: "civica", subject: "Cívica", studentId: "student-a",
  teacherId: "teacher-a", gradeDate: "2026-09-28", updatedAt: "2026-09-28T12:00:00.000Z",
};
const path = "institutions/school-a/dailyGrades/daily-a";

async function setup() {
  const harness = await loadFirebaseTransactions("lib/grades-firebase.ts");
  harness.state.documents.set(path, { ...record, updatedAt: new harness.Timestamp(record.updatedAt) });
  return harness;
}

test("the author deletes exactly the confirmed daily grade", async () => {
  const { api, state } = await setup();
  state.documents.set("institutions/school-a/dailyGrades/other-student", { ...record, studentId: "student-b" });
  await api.deleteDailyGrade(profile, record);
  assert.deepEqual(state.commits, [{ type: "delete", path }]);
  assert.equal(state.documents.has(path), false);
  assert.equal(state.documents.has("institutions/school-a/dailyGrades/other-student"), true);
});

test("students, directors, inactive teachers and other authors cannot request deletion", async () => {
  for (const actor of [
    { ...profile, role: "student" }, { ...profile, role: "director" },
    { ...profile, active: false }, { ...profile, uid: "teacher-b" },
    { ...profile, institutionId: "school-b" },
  ]) {
    const { api, state } = await setup();
    await assert.rejects(api.deleteDailyGrade(actor, record), /Sólo puedes eliminar/);
    assert.equal(state.reads.length, 0);
    assert.deepEqual(state.commits, []);
  }
});

test("deletion checks persisted ownership and rejects a forged record", async () => {
  for (const changed of [{ teacherId: "teacher-b" }, { institutionId: "school-b" }]) {
    const { api, state } = await setup();
    state.documents.set(path, { ...state.documents.get(path), ...changed });
    await assert.rejects(api.deleteDailyGrade(profile, record), /Sólo puedes eliminar/);
    assert.deepEqual(state.commits, []);
  }
});

test("changed captures and missing documents require a new confirmation", async () => {
  for (const changed of [
    { studentId: "student-b" }, { subjectId: "historia" }, { gradeDate: "2026-09-29" },
    { weekId: "week-b" }, { schoolYearId: "cycle-b" }, { updatedAt: "2026-09-28T13:00:00.000Z" },
  ]) {
    const { api, state } = await setup();
    state.documents.set(path, { ...state.documents.get(path), ...changed });
    await assert.rejects(api.deleteDailyGrade(profile, record), /calificación cambió/);
    assert.deepEqual(state.commits, []);
  }
  const { api, state } = await setup();
  state.documents.delete(path);
  await assert.rejects(api.deleteDailyGrade(profile, record), /ya fue eliminada/);
  assert.deepEqual(state.commits, []);
});

test("a transaction retry cannot delete a capture corrected during confirmation", async () => {
  const { api, state, Timestamp } = await setup();
  const initial = state.documents.get(path);
  state.rounds = 2;
  state.readDocument = (_path, round) => round === 0 ? initial : { ...initial, updatedAt: new Timestamp("2026-09-28T13:00:00Z") };
  await assert.rejects(api.deleteDailyGrade(profile, record), /calificación cambió/);
  assert.equal(state.reads.length, 2);
  assert.deepEqual(state.commits, []);
});

test("deleting evidence recalculates weekly, bimonthly and cycle averages", async () => {
  const { api } = await setup();
  const calendar = {
    weeks: [{ id: "week-a", startDate: "2026-09-28", endDate: "2026-10-02" }],
    terms: [{ id: "term-a", order: 1 }], nonWorkingDays: [],
  };
  const evidence = [4, 10].map((value, index) => ({
    ...record, id: `daily-${index}`, gradeDate: index ? "2026-09-29" : "2026-09-28",
    scores: { classWork: value, homework: value, participation: value, attendance: value, exam: value },
    weights: api.DEFAULT_GRADING_WEIGHTS, weightedScore: value,
  }));
  for (const level of ["weekly", "bimonthly", "cycle"]) {
    assert.equal(api.buildGradePeriodSummaries(evidence, calendar)[level][0].weightedScore, 7);
    assert.equal(api.buildGradePeriodSummaries(evidence.slice(1), calendar)[level][0].weightedScore, 10);
    assert.deepEqual(api.buildGradePeriodSummaries([], calendar)[level], []);
  }
});

test("daily deletion uses author permissions and a contextual confirmation", async () => {
  const [rules, ui] = await Promise.all([
    readFile(new URL("../firestore.rules", import.meta.url), "utf8"),
    readFile(new URL("../components/academic-grades.tsx", import.meta.url), "utf8"),
  ]);
  const daily = rules.slice(rules.indexOf("match /dailyGrades/{gradeId}"), rules.indexOf("match /studentWeeklyReports/{reportId}"));
  assert.match(daily, /allow delete: if teacherOwnsGrade\(resource\.data\)/);
  assert.match(ui, /<ConfirmDeleteDialog/);
  for (const field of ["studentName", "subject", "gradeDate"]) assert.ok(ui.includes(`gradeToDelete.${field}`));
  assert.doesNotMatch(ui, /window\.confirm/);
});
