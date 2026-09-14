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
  assert.match(rules, /student\.teacherIds\.hasAny\(\[request\.auth\.uid\]\)/);
  assert.match(rules, /hasAssignedGradeSubject\(\s*profile\(\)\.subjects/);
});
