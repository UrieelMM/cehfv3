import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("alumnos y maestros redactan el intercambio de tareas con el editor enriquecido", async () => {
  const workflow = await source("components/tasks-workflow.tsx");

  assert.match(workflow, /editorKey=\{`task-response-\$\{task\.id\}-\$\{responseRevision\}`\}/);
  assert.match(workflow, /editorKey=\{`task-feedback-\$\{task\.id\}-\$\{selectedStudentId\}-\$\{feedbackRevision\}`\}/);
  assert.match(workflow, /setResponseRich\(richText\)[\s\S]*setResponse\(plainText\)/);
  assert.match(workflow, /setFeedbackRich\(richText\)[\s\S]*setFeedback\(plainText\)/);
  assert.match(workflow, /content=\{event\.messageRich\}/);
  assert.match(workflow, /content=\{selectedSubmission\.contentRich\}/);
});

test("las entregas conservan texto plano y contenido enriquecido compatible", async () => {
  const [data, types, rules] = await Promise.all([
    source("lib/tasks-firebase.ts"),
    source("lib/types.ts"),
    source("firestore.rules"),
  ]);

  assert.match(data, /contentRich: normalizedContentRich/);
  assert.match(data, /teacherFeedbackRich: normalizedFeedbackRich/);
  assert.match(data, /messageRich: normalizedContentRich/);
  assert.match(data, /messageRich: normalizedFeedbackRich/);
  assert.match(data, /normalizeForumRichText\(contentRich \|\| content\)/);
  assert.match(types, /contentRich\?: string;/);
  assert.match(types, /teacherFeedbackRich\?: string;/);
  assert.match(types, /messageRich\?: string;/);
  assert.match(rules, /"content", "contentRich", "attachments"/);
  assert.match(rules, /"teacherFeedback", "teacherFeedbackRich"/);
  assert.match(rules, /function validHistoryRichText\(data\)/);
});

test("las consignas de Tareas conservan formato tras recargar", async () => {
  const [workflow, data, types, rules, functions] = await Promise.all([
    source("components/tasks-workflow.tsx"),
    source("lib/tasks-firebase.ts"),
    source("lib/types.ts"),
    source("firestore.rules"),
    source("functions/src/index.ts"),
  ]);

  assert.match(workflow, /editorKey="task-description-create"/);
  assert.match(workflow, /task\.descriptionRich \|\| normalizeForumRichText\(task\.description\)/);
  assert.match(data, /descriptionRich: normalizeForumRichText/);
  assert.match(types, /export type TaskAssignment = \{[\s\S]*?descriptionRich\?: string;/);
  assert.match(rules, /function validTaskRichText\(data\)/);
  assert.match(functions, /descriptionRich: forumRichText\([\s\S]*?4_000/);
});
