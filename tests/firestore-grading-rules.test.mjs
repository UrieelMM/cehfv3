import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Sólo se permite sembrar datos en un emulador local y un proyecto demo.
const host = process.env.FIRESTORE_EMULATOR_HOST;
const project = "demo-cehf-grading";
const institution = "school-a";

function token(uid) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  return `${encode({ alg: "none", typ: "JWT" })}.${encode({
    sub: uid, user_id: uid, aud: project, iss: `https://securetoken.google.com/${project}`,
    iat: now, exp: now + 3600, auth_time: now,
    firebase: { sign_in_provider: "custom", identities: {} },
  })}.`;
}

function value(data) {
  if (data instanceof Date) return { timestampValue: data.toISOString() };
  if (Array.isArray(data)) return { arrayValue: { values: data.map(value) } };
  if (typeof data === "string") return { stringValue: data };
  if (typeof data === "number") return Number.isInteger(data) ? { integerValue: String(data) } : { doubleValue: data };
  if (typeof data === "boolean") return { booleanValue: data };
  if (data === null) return { nullValue: null };
  return { mapValue: { fields: Object.fromEntries(Object.entries(data).map(([key, item]) => [key, value(item)])) } };
}

test("Firestore enforces sixth-grade Cívica and author-only daily deletion", { skip: !host }, async (t) => {
  assert.match(host, /^(localhost|127\.0\.0\.1):\d+$/, "Rules tests require a loopback emulator");
  const base = `http://${host}/v1/projects/${project}/databases/(default)/documents`;
  async function write(path, data, actor = "owner") {
    return fetch(`${base}/${path}`, {
      method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${actor === "owner" ? actor : token(actor)}` },
      body: JSON.stringify({ fields: value(data).mapValue.fields }),
    });
  }
  async function seed(path, data) {
    const response = await write(path, data);
    assert.ok(response.ok, await response.text());
  }
  async function remove(path, actor) {
    return fetch(`${base}/${path}`, { method: "DELETE", headers: actor ? { Authorization: `Bearer ${token(actor)}` } : {} });
  }

  const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
  const compiled = await fetch(`http://${host}/emulator/v1/projects/${project}:securityRules`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rules: { files: [{ name: "firestore.rules", content: rules }] } }),
  });
  assert.ok(compiled.ok, await compiled.text());

  for (const [uid, role, active, institutionId] of [
    ["teacher-a", "teacher", true, institution], ["teacher-b", "teacher", true, institution],
    ["inactive-teacher", "teacher", false, institution], ["foreign-teacher", "teacher", true, "school-b"],
    ["director-a", "director", true, institution], ["student-a", "student", true, institution],
    ["unassigned-student", "student", true, institution],
  ]) {
    await seed(`users/${uid}`, {
      institutionId, role, active, schoolLevel: "primary", grade: "6.º", group: "A",
      subjects: role === "student" ? ["Lenguaje"] : ["Cívica", "Física"],
      teacherIds: uid === "unassigned-student" ? ["teacher-b"] : ["teacher-a"],
    });
  }
  await seed(`institutions/${institution}/ciclosEscolares/cycle-a/semanas/week-a`, {
    active: true, label: "Semana 1", startDate: "2026-09-28", endDate: "2026-10-02",
  });
  await seed(`institutions/${institution}/ciclosEscolares/cycle-a/bimestres/term-a`, {
    active: true, label: "Bimestre 1", weekIds: ["week-a"],
  });
  const grade = {
    institutionId: institution, schoolYearId: "cycle-a", schoolYearLabel: "2026–2027",
    termId: "term-a", termLabel: "Bimestre 1", weekId: "week-a", weekLabel: "Semana 1",
    gradeDate: "2026-09-28", subjectId: "civica", subject: "Cívica",
    teacherId: "teacher-a", teacherName: "Docente", studentId: "student-a", studentName: "Alumno",
    studentGrade: "6.º", studentGroup: "A", scores: { classWork: 9, homework: 9, participation: 9, attendance: 9, exam: 9 },
    weights: { classWork: 45, homework: 10, participation: 15, attendance: 10, exam: 20 }, weightedScore: 9,
    createdAt: new Date(), updatedAt: new Date(),
  };
  const gradePath = (id) => `institutions/${institution}/dailyGrades/${id}`;

  await t.test("assigned teachers can grade Cívica for legacy sixth-grade profiles", async () => {
    const response = await write(gradePath("civica"), grade, "teacher-a");
    assert.ok(response.ok, await response.text());
  });
  await t.test("the other sixth-grade subjects retain their grading permissions", async () => {
    const subjects = [
      ["Lenguaje", "lenguaje"], ["Matemáticas", "matematicas"], ["Ciencias", "ciencias"],
      ["Historia", "historia"], ["Geografía", "geografia"], ["Inglés", "ingles"], ["Cívica", "civica"],
    ];
    await seed("users/teacher-a", { institutionId: institution, role: "teacher", active: true, subjects: [...subjects.map(([subject]) => subject), "Física"] });
    for (const [subject, subjectId] of subjects) {
      const response = await write(gradePath(`subject-${subjectId}`), { ...grade, subject, subjectId }, "teacher-a");
      assert.ok(response.ok, `${subject}: ${await response.text()}`);
    }
  });
  await t.test("catalog restoration does not grant other subjects or student assignments", async () => {
    for (const data of [
      { ...grade, subject: "Física", subjectId: "fisica" },
      { ...grade, studentId: "unassigned-student" },
      { ...grade, teacherId: "teacher-b" },
    ]) {
      const response = await write(gradePath("forbidden-capture"), data, "teacher-a");
      assert.equal(response.status, 403, await response.text());
    }
  });
  await t.test("students, other teachers and unauthenticated callers cannot delete a capture", async () => {
    for (const actor of ["student-a", "teacher-b", "inactive-teacher", "foreign-teacher", "director-a", null]) {
      const response = await remove(gradePath("civica"), actor);
      assert.equal(response.status, 403, await response.text());
    }
  });
  await t.test("deletion uses stored ownership and institution", async () => {
    for (const [id, data] of [
      ["other-author", { ...grade, teacherId: "teacher-b" }],
      ["wrong-institution", { ...grade, institutionId: "school-b" }],
    ]) {
      await seed(gradePath(id), data);
      const response = await remove(gradePath(id), "teacher-a");
      assert.equal(response.status, 403, await response.text());
    }
  });
  await t.test("the author can delete a historical daily capture after reassignment", async () => {
    await seed("users/student-a", { institutionId: institution, role: "student", active: false, teacherIds: [] });
    const response = await remove(gradePath("civica"), "teacher-a");
    assert.ok(response.ok, await response.text());
  });
  await t.test("weekly grades still cannot be deleted", async () => {
    const path = `institutions/${institution}/weeklyGrades/weekly-a`;
    await seed(path, grade);
    const response = await remove(path, "teacher-a");
    assert.equal(response.status, 403, await response.text());
  });
});
