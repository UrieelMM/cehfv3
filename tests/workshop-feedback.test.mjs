import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadFirebaseTransactions } from "./helpers/firebase-transactions.mjs";

const task = { id: "task-a", institutionId: "school-a", workshopId: "reading" };
const submission = {
  id: "student-a", studentId: "student-a", institutionId: "school-a", workshopId: "reading",
  taskId: "task-a", version: 1, updatedAt: "2026-09-28T12:00:00.000Z",
  content: "Respuesta del alumno", status: "submitted",
};
const path = "institutions/school-a/workshops/reading/tasks/task-a/submissions/student-a";

async function setup() {
  const harness = await loadFirebaseTransactions("lib/workshops-firebase.ts");
  harness.state.documents.set(path, { ...submission, updatedAt: new harness.Timestamp(submission.updatedAt) });
  return harness;
}

test("workshop feedback updates only the selected version and preserves student work", async () => {
  for (const reviewed of [false, true]) {
    const { api, state } = await setup();
    await api.saveWorkshopFeedback(task, submission, " Buen trabajo ", "", reviewed);
    assert.equal(state.commits.length, 1);
    const saved = state.documents.get(path);
    assert.equal(saved.teacherFeedback, "Buen trabajo");
    assert.equal(saved.status, reviewed ? "reviewed" : "feedback");
    assert.equal(saved.reviewedAt, reviewed ? "server-timestamp" : null);
    assert.equal(saved.content, submission.content);
    assert.equal(saved.version, submission.version);
    assert.deepEqual(Object.keys(state.commits[0].data).sort(), ["feedbackAt", "reviewedAt", "status", "teacherFeedback", "teacherFeedbackRich", "updatedAt"]);
  }
});

test("feedback cannot overwrite a new version or a concurrent review", async () => {
  for (const changed of [{ version: 2 }, { updatedAt: "2026-09-28T13:00:00.000Z" }]) {
    const { api, state } = await setup();
    state.documents.set(path, { ...state.documents.get(path), ...changed });
    await assert.rejects(api.saveWorkshopFeedback(task, submission, "Comentario", "", false), /entrega cambió/);
    assert.deepEqual(state.commits, []);
  }
});

test("a transaction retry rejects a student version submitted during publication", async () => {
  const { api, state } = await setup();
  const initial = state.documents.get(path);
  state.rounds = 2;
  state.readDocument = (_path, round) => round === 0 ? initial : { ...initial, version: 2 };
  await assert.rejects(api.saveWorkshopFeedback(task, submission, "Comentario", "", false), /entrega cambió/);
  assert.equal(state.reads.length, 2);
  assert.deepEqual(state.commits, []);
});

test("feedback rejects empty, excessive, mismatched and removed submissions", async () => {
  const { api, state } = await setup();
  for (const feedback of [" ", "x".repeat(1601)]) {
    await assert.rejects(api.saveWorkshopFeedback(task, submission, feedback, "", false), /hasta 1600/);
  }
  for (const changed of [{ institutionId: "school-b" }, { workshopId: "tics" }, { taskId: "task-b" }, { id: "student-b" }]) {
    await assert.rejects(api.saveWorkshopFeedback(task, { ...submission, ...changed }, "Comentario", "", false), /no pertenece/);
  }
  state.documents.delete(path);
  await assert.rejects(api.saveWorkshopFeedback(task, submission, "Comentario", "", false), /no está disponible/);
  assert.deepEqual(state.commits, []);
});

test("published feedback has its own reader and drafts are isolated by student and version", async () => {
  const [ui, css] = await Promise.all([
    readFile(new URL("../components/workshop-tasks.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/workshops.css", import.meta.url), "utf8"),
  ]);
  assert.match(ui, /Retroalimentación publicada/);
  assert.match(ui, /<WorkshopFeedbackCard submission=\{submission\}/);
  assert.match(ui, /key=\{`\$\{task\.id\}-\$\{selectedSubmission\.id\}-\$\{selectedSubmission\.version\}`\}/);
  assert.match(ui, /setSelectedSubmissionId\(\(current\) => sorted\.some/);
  assert.match(ui, /editing \? feedbackBase : submission/);
  assert.doesNotMatch(ui, /\}, \[selectedSubmission\]\)/);
  assert.match(css, /\.workshop-submission-tabs strong \{ overflow-wrap: anywhere/);
  assert.match(css, /\.workshop-submission-list > button \{[^}]*min-width: 0/);
  assert.doesNotMatch(css, /\.workshop-review-pane > div:last-child/);
});
