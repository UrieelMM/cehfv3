import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

test("content deletion is confirmed in every requested workflow", async () => {
  const sources = await Promise.all(
    [
      "components/tasks-workflow.tsx",
      "components/reviews-page.tsx",
      "components/academic-reports.tsx",
      "components/materials-page.tsx",
      "components/workshops-page.tsx",
      "components/workshop-tasks.tsx",
    ].map((path) => readFile(new URL(path, projectRoot), "utf8")),
  );

  sources.forEach((source) => assert.match(source, /ConfirmDeleteDialog/));
  assert.doesNotMatch(sources.join("\n"), /window\.confirm/);
  assert.match(sources[0], /confirmLabel="Eliminar tarea"/);
  assert.match(sources[1], /confirmLabel="Eliminar repaso"/);
  assert.match(sources[2], /confirmLabel="Eliminar reporte"/);
  assert.match(sources[3], /confirmLabel="Eliminar archivo"/);
  assert.match(sources[4], /setResourceToDelete\(resource\)/);
  assert.match(sources[5], /confirmLabel="Eliminar actividad"/);
});

test("server deletion validates permissions and removes dependent data", async () => {
  const [functionsSource, tasks, reviews, reports, materials, workshops] =
    await Promise.all([
      readFile(new URL("functions/src/index.ts", projectRoot), "utf8"),
      readFile(new URL("lib/tasks-firebase.ts", projectRoot), "utf8"),
      readFile(new URL("lib/reviews-firebase.ts", projectRoot), "utf8"),
      readFile(new URL("lib/reports-firebase.ts", projectRoot), "utf8"),
      readFile(new URL("lib/materials-firebase.ts", projectRoot), "utf8"),
      readFile(new URL("lib/workshops-firebase.ts", projectRoot), "utf8"),
    ]);

  [
    "deleteAcademicTask",
    "deleteWeeklyReview",
    "deleteStudentWeeklyReport",
    "deleteLearningMaterial",
    "deleteWorkshopResource",
    "deleteWorkshopTask",
  ].forEach((name) => assert.match(functionsSource, new RegExp(`export const ${name} = onCall`)));
  assert.match(functionsSource, /requireMaterialStaff\(request\.auth\)/);
  assert.match(functionsSource, /db\.recursiveDelete\(reference\)/);
  assert.match(functionsSource, /deleteFiles\(\{ prefix: storagePrefix, force: true \}\)/);
  assert.match(functionsSource, /deleteRelatedNotifications/);
  assert.match(
    functionsSource,
    /canDeleteTask = actor\.role === "director" \|\| task\?\.createdBy === actor\.uid/,
  );
  assert.match(tasks, /"deleteAcademicTask"/);
  assert.match(reviews, /"deleteWeeklyReview"/);
  assert.match(reports, /"deleteStudentWeeklyReport"/);
  assert.match(materials, /"deleteLearningMaterial"/);
  assert.match(workshops, /"deleteWorkshopResource"/);
  assert.match(workshops, /"deleteWorkshopTask"/);
});

test("closed tasks remain visible but cannot receive new submissions", async () => {
  const [tasks, firestoreRules, storageRules] = await Promise.all([
    readFile(new URL("lib/tasks-firebase.ts", projectRoot), "utf8"),
    readFile(new URL("firestore.rules", projectRoot), "utf8"),
    readFile(new URL("storage.rules", projectRoot), "utf8"),
  ]);

  assert.match(tasks, /where\("status", "in", \["published", "closed"\]\)/);
  assert.match(
    tasks,
    /return task\.status === "published" && \([\s\S]*?Boolean\(extensionActive\)[\s\S]*?\);/,
  );
  assert.match(
    firestoreRules,
    /function canStudentSubmit\(studentId\)[\s\S]*?task\.status == "published"[\s\S]*?request\.time <= task\.dueAt[\s\S]*?hasActiveExtension\(studentId\)/,
  );
  assert.match(
    storageRules,
    /function canUploadTaskSubmission[\s\S]*?task\.status == "published"[\s\S]*?request\.time <= task\.dueAt[\s\S]*?hasActiveTaskExtension/,
  );
});

test("managed academic content exposes guarded edit flows", async () => {
  const [functionsSource, tasks, reviews, reports, materials, workshops, workshopTasks] =
    await Promise.all([
      readFile(new URL("functions/src/index.ts", projectRoot), "utf8"),
      readFile(new URL("components/tasks-workflow.tsx", projectRoot), "utf8"),
      readFile(new URL("components/reviews-page.tsx", projectRoot), "utf8"),
      readFile(new URL("components/academic-reports.tsx", projectRoot), "utf8"),
      readFile(new URL("components/materials-page.tsx", projectRoot), "utf8"),
      readFile(new URL("components/workshops-page.tsx", projectRoot), "utf8"),
      readFile(new URL("components/workshop-tasks.tsx", projectRoot), "utf8"),
    ]);

  [tasks, reviews, reports, materials, workshops, workshopTasks].forEach((source) =>
    assert.match(source, /ContentEditDialog/),
  );
  assert.match(functionsSource, /export const updateManagedContent = onCall/);
  assert.match(functionsSource, /const actor = await requireMaterialStaff\(request\.auth\)/);
  assert.match(functionsSource, /actor\.role === "teacher" && data\.createdBy !== actor\.uid/);
  assert.match(functionsSource, /actor\.role === "teacher" && data\.teacherId !== actor\.uid/);
  assert.match(functionsSource, /await requireManagedWorkshopRecord\(actor, workshopId\)/);
  assert.match(functionsSource, /action: `\$\{entityType\}\.updated`/);
});
