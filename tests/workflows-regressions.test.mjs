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

test("academic task edits preserve legacy attachments by their Storage path", async () => {
  const [clientSource, functionsSource] = await Promise.all([
    readFile(new URL("lib/tasks-firebase.ts", projectRoot), "utf8"),
    readFile(new URL("functions/src/index.ts", projectRoot), "utf8"),
  ]);

  assert.match(clientSource, /storageAssetId = storagePath\.split/);
  assert.match(functionsSource, /const attachmentId = \(attachment/);
  assert.match(functionsSource, /retainedStoragePaths/);
  assert.doesNotMatch(functionsSource, /const retainedIds = new Set\(attachments/);
});

test("workshops expose a configurable Zoom link and authorized file reads", async () => {
  const [pageSource, dataSource, firestoreRules, storageRules] = await Promise.all([
    readFile(new URL("components/workshops-page.tsx", projectRoot), "utf8"),
    readFile(new URL("lib/workshops-firebase.ts", projectRoot), "utf8"),
    readFile(new URL("firestore.rules", projectRoot), "utf8"),
    readFile(new URL("storage.rules", projectRoot), "utf8"),
  ]);

  assert.match(pageSource, /Enlace de Zoom/);
  assert.match(pageSource, /Entrar a Zoom/);
  assert.match(dataSource, /normalizeZoomUrl/);
  assert.match(firestoreRules, /data\.zoomUrl\.matches/);
  assert.match(storageRules, /profile\(\)\.role == "director"/);
  assert.match(storageRules, /resources\/\{resourceId\}/);
});
