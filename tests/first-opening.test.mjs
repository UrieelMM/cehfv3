import assert from "node:assert/strict";
import test from "node:test";
import { loadFirebaseTransactions } from "./helpers/firebase-transactions.mjs";

const school = "institutions/school-a";
const profile = { uid: "student-a", role: "student", institutionId: "school-a", name: "Alumno" };
const material = { id: "material-a", institutionId: "school-a", firestorePath: `${school}/materials/material-a` };
const task = {
  id: "task-a",
  institutionId: "school-a",
  firestorePath: `${school}/ciclosEscolares/cycle/bimestres/term/semanas/week/materias/subject/tareas/task-a`,
};
const workshopItem = { id: "item-a", institutionId: "school-a", workshopId: "reading" };
const report = {
  id: "report-a", institutionId: "school-a", teacherId: "teacher-a",
  studentId: profile.uid, studentName: "Nombre al publicar",
};

for (const [label, module, path, open, identity] of [
  ["material", "materials", `${material.firestorePath}/views/${profile.uid}`,
    (api) => api.markLearningMaterialViewed(material, profile), { materialId: material.id }],
  ["task link", "tasks", `${task.firestorePath}/resourceViews/link-a/students/${profile.uid}`,
    (api) => api.markTaskResourceViewed(task, { kind: "link", link: { id: "link-a", label: "Enlace" } }, profile),
    { taskId: task.id, resourceId: "link-a", resourceKind: "link" }],
  ["task attachment", "tasks", `${task.firestorePath}/resourceViews/file-a/students/${profile.uid}`,
    (api) => api.markTaskResourceViewed(task, { kind: "attachment", attachment: { id: "file-a", name: "Archivo" } }, profile),
    { taskId: task.id, resourceId: "file-a", resourceKind: "attachment" }],
  ["workshop resource", "workshops", `${school}/workshops/reading/resources/item-a/views/${profile.uid}`,
    (api) => api.markWorkshopViewed(workshopItem, profile), { workshopId: "reading", itemId: "item-a" }],
  ["workshop task", "workshops", `${school}/workshops/reading/tasks/item-a/views/${profile.uid}`,
    (api) => api.markWorkshopViewed({ ...workshopItem, audienceStudentIds: [profile.uid] }, profile),
    { workshopId: "reading", itemId: "item-a" }],
  ["weekly report", "reports", `${school}/studentWeeklyReportViews/${report.id}`,
    (api) => api.markStudentWeeklyReportViewed(report, profile), { reportId: report.id, studentName: report.studentName }],
]) {
  test(`${label} records only its first opening`, async () => {
    const { api, state } = await loadFirebaseTransactions(`lib/${module}-firebase.ts`);
    await open(api);
    await open(api);

    assert.equal(state.commits.length, 1);
    assert.equal(state.commits[0].type, "set");
    const saved = state.documents.get(path);
    assert.equal(saved.institutionId, profile.institutionId);
    assert.equal(saved.studentId, profile.uid);
    assert.equal(saved.firstOpenedAt, "server-timestamp");
    assert.equal(saved.lastOpenedAt, saved.firstOpenedAt);
    assert.equal(saved.viewCount, 1);
    for (const [key, value] of Object.entries(identity)) assert.equal(saved[key], value);

    const legacy = {
      ...saved, firstOpenedAt: "2026-10-01T15:00:00Z", lastOpenedAt: "2026-10-02T16:00:00Z", viewCount: 4,
    };
    state.documents.set(path, legacy);
    await open(api);
    assert.equal(state.commits.length, 1);
    assert.deepEqual(state.documents.get(path), legacy);
  });
}

test("a retry after a concurrent first opening preserves the winning record", async () => {
  const { api, state } = await loadFirebaseTransactions("lib/materials-firebase.ts");
  const path = `${material.firestorePath}/views/${profile.uid}`;
  const winner = { firstOpenedAt: "2026-10-01T15:00:00Z", viewCount: 1 };
  state.rounds = 2;
  state.readDocument = (readPath, round) => {
    assert.equal(readPath, path);
    if (round === 1) state.documents.set(path, winner);
    return state.documents.get(path);
  };

  await api.markLearningMaterialViewed(material, profile);
  assert.equal(state.reads.length, 2);
  assert.deepEqual(state.commits, []);
  assert.deepEqual(state.documents.get(path), winner);
});
