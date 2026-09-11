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
  assert.match(tasks, /"deleteAcademicTask"/);
  assert.match(reviews, /"deleteWeeklyReview"/);
  assert.match(reports, /"deleteStudentWeeklyReport"/);
  assert.match(materials, /"deleteLearningMaterial"/);
  assert.match(workshops, /"deleteWorkshopResource"/);
  assert.match(workshops, /"deleteWorkshopTask"/);
});
