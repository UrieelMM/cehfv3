import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const source = await readFile(new URL("../lib/grade-scale.ts", import.meta.url), "utf8");
const { GRADE_MAX, clampGradeScore, gradeScorePercent, normalizeStoredGradeScore } = await import(
  `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString("base64")}`
);

test("weekly grades use the 0–10 scale", () => {
  assert.equal(GRADE_MAX, 10);
  assert.equal(clampGradeScore(8.74), 8.7);
  assert.equal(clampGradeScore(12), 10);
  assert.equal(clampGradeScore(-1), 0);
  assert.equal(gradeScorePercent(8.5), 85);
});

test("legacy 0–100 grade records are converted without changing current grades", () => {
  assert.equal(normalizeStoredGradeScore(95), 9.5);
  assert.equal(normalizeStoredGradeScore(70), 7);
  assert.equal(normalizeStoredGradeScore(8.5), 8.5);
  assert.equal(normalizeStoredGradeScore("invalid", 6), 6);
});
