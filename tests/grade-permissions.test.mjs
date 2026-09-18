import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

test("saving a grade does not depend on rewriting the teacher configuration", async () => {
  const source = await readFile(
    new URL("lib/grades-firebase.ts", projectRoot),
    "utf8",
  );
  const saveDailyGrade = source.slice(
    source.indexOf("export async function saveDailyGrade"),
    source.indexOf("// Compatibilidad temporal"),
  );

  assert.match(saveDailyGrade, /await setDoc\(recordReference/);
  assert.doesNotMatch(saveDailyGrade, /gradingConfigs/);
  assert.doesNotMatch(saveDailyGrade, /batch\.commit/);
});

test("Firestore accepts every grade from 0 to 10 for assigned teachers", async () => {
  const rules = await readFile(new URL("firestore.rules", projectRoot), "utf8");

  for (const criterion of ["classWork", "homework", "participation", "attendance", "exam"]) {
    assert.match(rules, new RegExp(`scores\\.${criterion} >= 0 && scores\\.${criterion} <= 10`));
  }
  assert.match(rules, /function hasAssignedGradeSubject/);
  assert.match(rules, /function gradeCatalogHasSubject/);
  assert.match(rules, /student\.teacherIds\.hasAny\(\[request\.auth\.uid\]\)/);
  assert.match(rules, /hasAssignedGradeSubject\(\s*profile\(\)\.subjects/);
  assert.match(rules, /gradeCatalogHasSubject\(student, data\.subjectId\)/);
});

test("Firestore lets preschool teachers grade their assigned subject", async () => {
  const rules = await readFile(new URL("firestore.rules", projectRoot), "utf8");
  const assignedSubjectCheck = rules.slice(
    rules.indexOf("function hasAssignedGradeSubject"),
    rules.indexOf("function gradeCatalogHasSubject"),
  );
  const gradeCatalogCheck = rules.slice(
    rules.indexOf("function gradeCatalogHasSubject"),
    rules.indexOf("function teacherCanGrade"),
  );
  const preschoolCatalogBranch = gradeCatalogCheck.slice(
    gradeCatalogCheck.indexOf('student.schoolLevel == "preschool"'),
    gradeCatalogCheck.indexOf('student.schoolLevel == "primary"'),
  );

  assert.match(assignedSubjectCheck, /desarrollo-integral-y-motrocidad/);
  assert.match(assignedSubjectCheck, /Desarrollo Integral y Motricidad/);
  assert.match(gradeCatalogCheck, /let preschool = \[/);
  assert.match(preschoolCatalogBranch, /subjectId in preschool/);
  assert.doesNotMatch(preschoolCatalogBranch, /subjectId in primaryLower/);
});

test("Firestore validates integer, decimal, zero and mixed scores without integer division", async () => {
  const rules = await readFile(new URL("firestore.rules", projectRoot), "utf8");
  const weights = [45, 10, 15, 10, 20];
  const cases = [
    [9, 10, 10, 10, 10],
    [9, 9, 9, 9, 9],
    [0, 0, 0, 0, 0],
    [0, 5, 7, 9, 10],
    [9.9, 8.5, 7.2, 10, 6.1],
    [10, 10, 10, 10, 10],
  ];

  assert.match(rules, /let weightedTotal =/);
  assert.match(rules, /data\.weightedScore \* 100 >= weightedTotal - 5\.1/);
  assert.match(rules, /data\.weightedScore \* 100 <= weightedTotal \+ 5\.1/);
  assert.doesNotMatch(rules, /\) \/ 100;\s*return validGradingWeights/);

  for (const scores of cases) {
    const weightedTotal = scores.reduce((total, score, index) => total + score * weights[index], 0);
    const savedScore = Math.round((weightedTotal / 100) * 10) / 10;
    assert.ok(savedScore >= 0 && savedScore <= 10);
    assert.ok(Math.abs(savedScore * 100 - weightedTotal) <= 5.1);
  }
});

test("daily grading lists use the grade catalog for legacy student assignments", async () => {
  const sources = await Promise.all([
    "components/academic-grades.tsx",
    "components/weekly-grades.tsx",
    "components/academic-reports.tsx",
    "lib/grades-firebase.ts",
    "lib/reports-firebase.ts",
  ].map((path) => readFile(new URL(path, projectRoot), "utf8")));

  sources.forEach((source) => assert.match(source, /studentCanTakeSubject/));
});

test("teachers can correct their own daily grade without changing its academic scope", async () => {
  const rules = await readFile(new URL("firestore.rules", projectRoot), "utf8");
  const dailyGradesMatch = rules.slice(rules.indexOf("match /dailyGrades/{gradeId}"));

  assert.match(rules, /function teacherOwnsGrade/);
  assert.match(rules, /function validDailyGradeCorrection/);
  assert.match(rules, /after\.diff\(before\)\.affectedKeys\(\)\.hasOnly/);
  assert.match(rules, /sameDailyGradeScope\(before, after\)/);
  assert.match(dailyGradesMatch, /allow update: if validDailyGradeCorrection/);
  assert.doesNotMatch(dailyGradesMatch.slice(0, 850), /teacherCanGrade\(resource\.data\)/);
});

test("weekly reports publish through the backend and notify the student", async () => {
  const [client, functions] = await Promise.all([
    readFile(new URL("lib/reports-firebase.ts", projectRoot), "utf8"),
    readFile(new URL("functions/src/index.ts", projectRoot), "utf8"),
  ]);
  const clientSave = client.slice(
    client.indexOf("export async function saveStudentWeeklyReport"),
    client.indexOf("export async function deleteStudentWeeklyReport"),
  );

  assert.match(clientSave, /"saveStudentWeeklyReport"/);
  assert.doesNotMatch(clientSave, /writeBatch|batch\.set/);
  assert.match(functions, /export const saveStudentWeeklyReport = onCall/);
  assert.match(functions, /export const onStudentWeeklyReportChanged = onDocumentWritten/);
  assert.match(functions, /eventType: "report_published"/);
  assert.match(functions, /`\/reports\/\$\{encodeURIComponent/);
});
