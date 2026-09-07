import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

test("profile uses live portal records and the stored account photo", async () => {
  const [profileSource, firebaseSource] = await Promise.all([
    readFile(new URL("components/profile-page.tsx", projectRoot), "utf8"),
    readFile(new URL("lib/firebase.ts", projectRoot), "utf8"),
  ]);

  assert.match(profileSource, /buildDashboardViewModel\(\{/);
  assert.match(profileSource, /watchDailyGrades\(/);
  assert.match(profileSource, /watchStudentWeeklyReports\(/);
  assert.match(profileSource, /watchTaskSubmissions\(/);
  assert.match(profileSource, /profile\.photoURL/);
  assert.doesNotMatch(profileSource, /state\.reviews\.filter/);
  assert.doesNotMatch(profileSource, /state\.reports\.filter/);
  assert.match(firebaseSource, /photoURL: data\.photoURL/);
  assert.match(firebaseSource, /createdAt: data\.createdAt/);
  assert.match(firebaseSource, /active: data\.active !== false/);
});
