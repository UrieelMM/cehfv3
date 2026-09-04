import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

test("staff can inspect every saved answer in weekly reviews", async () => {
  const source = await readFile(
    new URL("components/reviews-page.tsx", projectRoot),
    "utf8",
  );

  assert.match(source, /Respuestas del alumno/);
  assert.match(source, /answerLabel\(review, selectedAttempt, question\.id\)/);
  assert.match(source, /setSelectedStudentId\(student\.id\)/);
});

test("submission history attachments open in the in-app task viewer", async () => {
  const [workflow, viewer] = await Promise.all([
    readFile(new URL("components/tasks-workflow.tsx", projectRoot), "utf8"),
    readFile(new URL("components/task-resource-viewer.tsx", projectRoot), "utf8"),
  ]);

  assert.match(workflow, /openSubmissionAttachment/);
  assert.match(workflow, /onOpenAttachment\(attachment\)/);
  assert.match(workflow, /source:\s*"submission"/);
  assert.match(viewer, /source !== "resource"/);
  assert.match(viewer, /Evidencia de la entrega/);
});

test("the reading workshop has one canonical entry and tolerates its legacy id", async () => {
  const source = await readFile(
    new URL("lib/workshops-firebase.ts", projectRoot),
    "utf8",
  );

  assert.match(source, /id:\s*"reading"/);
  assert.match(source, /function uniqueWorkshops/);
  assert.match(source, /"club-lectura"/);
  assert.match(source, /callback\(uniqueWorkshops/);
});
