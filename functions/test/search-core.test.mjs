import assert from "node:assert/strict";
import test from "node:test";
import {
  forumTopicSearchRecord,
  materialSearchRecord,
  reportSearchRecord,
  searchTokensForUser,
  storySearchRecord,
  taskSearchRecord,
  workshopResourceSearchRecord,
  workspaceSearchRecord,
} from "../lib/search-core.js";

const institutionId = "cehf-primary";
const token = (scope) => `institution:${institutionId}:${scope}`;

test("las claves de alumnos quedan acotadas a institución, rol, usuario y grupo", () => {
  assert.deepEqual(
    searchTokensForUser(
      { institutionId, role: "student", grade: "5.º", group: "A" },
      "student-1",
    ),
    [token("user:student-1"), token("role:student"), token("group:5.º a")],
  );
  assert.ok(
    !searchTokensForUser(
      { institutionId, role: "student", grade: "5.º", group: "A" },
      "student-1",
    ).some((value) => value.includes("other-school")),
  );
});

test("una tarea borrador nunca se expone al grupo; una publicada sí", () => {
  const draft = taskSearchRecord("task-1", {
    institutionId,
    title: "Fracciones",
    createdBy: "teacher-1",
    targetGroup: "5.º A",
    status: "draft",
  });
  const published = taskSearchRecord("task-1", {
    institutionId,
    title: "Fracciones",
    createdBy: "teacher-1",
    targetGroup: "5.º A",
    status: "published",
  });
  assert.deepEqual(draft.visibleBy, [token("role:director"), token("user:teacher-1")]);
  assert.ok(published.visibleBy.includes(token("group:5.º a")));
  assert.ok(!published.visibleBy.includes(token("role:staff")));
});

test("los materiales sólo incluyen Dirección, gestores y alumnos asignados", () => {
  const record = materialSearchRecord("material-1", {
    institutionId,
    managerIds: ["teacher-1"],
    audienceStudentIds: ["student-1"],
  });
  assert.deepEqual(record.visibleBy, [
    token("role:director"),
    token("user:teacher-1"),
    token("user:student-1"),
  ]);
  assert.ok(!record.visibleBy.includes(token("role:student")));
});

test("Mi espacio conserva privado, seleccionados y equipo", () => {
  const privateItem = workspaceSearchRecord("private-1", {
    institutionId,
    ownerId: "teacher-1",
    visibility: "private",
  });
  const selectedItem = workspaceSearchRecord("selected-1", {
    institutionId,
    ownerId: "teacher-1",
    visibility: "selected",
    sharedWithIds: ["teacher-2"],
  });
  const staffItem = workspaceSearchRecord("staff-1", {
    institutionId,
    ownerId: "teacher-1",
    visibility: "staff",
  });
  assert.deepEqual(privateItem.visibleBy, [token("user:teacher-1")]);
  assert.ok(selectedItem.visibleBy.includes(token("user:teacher-2")));
  assert.ok(!selectedItem.visibleBy.includes(token("role:staff")));
  assert.ok(staffItem.visibleBy.includes(token("role:staff")));
});

test("las historias en revisión son del autor y del personal; las publicadas llegan a alumnos", () => {
  const draft = storySearchRecord("story-1", {
    institutionId,
    authorId: "student-1",
    status: "submitted",
  });
  const published = storySearchRecord("story-1", {
    institutionId,
    authorId: "student-1",
    status: "published",
  });
  assert.deepEqual(draft.visibleBy, [token("role:staff"), token("user:student-1")]);
  assert.ok(!draft.visibleBy.includes(token("role:student")));
  assert.ok(published.visibleBy.includes(token("role:student")));
});

test("foros y recursos de taller sólo se entregan a sus participantes", () => {
  const topic = forumTopicSearchRecord("topic-1", {
    institutionId,
    forumId: "forum-1",
    participantIds: ["student-1"],
  });
  const resource = workshopResourceSearchRecord(
    "resource-1",
    "workshop-1",
    { institutionId },
    { institutionId, memberIds: ["student-2", "teacher-1"] },
  );
  assert.ok(topic.visibleBy.includes(token("user:student-1")));
  assert.ok(!topic.visibleBy.includes(token("role:student")));
  assert.ok(resource.visibleBy.includes(token("user:student-2")));
  assert.ok(!resource.visibleBy.includes(token("user:student-1")));
});

test("un reporte borrador no llega al alumno y uno publicado sí", () => {
  const draft = reportSearchRecord("report-1", {
    institutionId,
    teacherId: "teacher-1",
    studentId: "student-1",
    status: "draft",
  });
  const published = reportSearchRecord("report-1", {
    institutionId,
    teacherId: "teacher-1",
    studentId: "student-1",
    status: "published",
  });
  assert.ok(!draft.visibleBy.includes(token("user:student-1")));
  assert.ok(published.visibleBy.includes(token("user:student-1")));
  assert.ok(published.objectID.startsWith(`${institutionId}:report:`));
});
