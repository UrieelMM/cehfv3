import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("student lists prefer profile photos and keep initials as fallback", async () => {
  const [grades, reports, workshops] = await Promise.all([
    readFile(new URL("components/academic-grades.tsx", root), "utf8"),
    readFile(new URL("components/academic-reports.tsx", root), "utf8"),
    readFile(new URL("components/workshop-tasks.tsx", root), "utf8"),
  ]);

  for (const source of [grades, reports, workshops]) {
    assert.match(source, /student\.photoURL \? \(/);
    assert.match(source, /<Image src=\{student\.photoURL\}/);
    assert.match(source, /\) : student\.initials}/);
  }
});

test("student photos fill and crop their avatar frames", async () => {
  const [gradesCss, reportsCss, workshopsCss] = await Promise.all([
    readFile(new URL("app/academic-grades.css", root), "utf8"),
    readFile(new URL("app/academic-reports.css", root), "utf8"),
    readFile(new URL("app/workshops.css", root), "utf8"),
  ]);

  assert.match(gradesCss, /\.academic-student-cell > span img \{ object-fit: cover; \}/);
  assert.match(reportsCss, /\.report-student-avatar img \{ object-fit: cover; \}/);
  assert.match(workshopsCss, /\.workshop-roster-picker i img \{ object-fit: cover; \}/);
});

test("published reports and forum participation resolve profile photos", async () => {
  const [reports, forum, globalCss] = await Promise.all([
    readFile(new URL("components/academic-reports.tsx", root), "utf8"),
    readFile(new URL("components/forum-page.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);

  assert.match(reports, /student=\{accounts\.find\(\(account\) => account\.uid === report\.studentId\)}/);
  assert.match(reports, /student\?\.photoURL \? <Image src=\{student\.photoURL\}/);
  assert.match(forum, /resolvePhotoURL\(item\.authorId, item\.author\)/);
  assert.match(forum, /profile\.photoURL \? <Image src=\{profile\.photoURL\}/);
  assert.match(forum, /participant\.photoURL \? <Image src=\{participant\.photoURL\}/);
  assert.match(globalCss, /\.forum-avatar-stack span img[\s\S]*?object-fit: cover/);
  assert.match(globalCss, /\.forum-mention-menu button span img[\s\S]*?object-fit: cover/);
});
