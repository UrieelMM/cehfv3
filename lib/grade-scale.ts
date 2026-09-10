export const GRADE_MAX = 10;

export function clampGradeScore(value: unknown, fallback = 0) {
  const score = Number(value);
  if (!Number.isFinite(score)) return fallback;
  return Math.round(Math.min(GRADE_MAX, Math.max(0, score)) * 10) / 10;
}

/** Converts records created with the former 0–100 scale while preserving 0–10 data. */
export function normalizeStoredGradeScore(value: unknown, fallback = 0) {
  const score = Number(value);
  if (!Number.isFinite(score)) return fallback;
  return clampGradeScore(score > GRADE_MAX ? score / 10 : score, fallback);
}

export function gradeScorePercent(value: number) {
  return clampGradeScore(value) * 10;
}
