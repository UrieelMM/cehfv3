import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const source = await readFile(
  new URL("../lib/academic-subjects.ts", import.meta.url),
  "utf8",
);
const [appSource, usersSource, firebaseSource, functionsSource, rulesSource] = await Promise.all([
  readFile(new URL("../components/cehf-app.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/users-page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../lib/firebase.ts", import.meta.url), "utf8"),
  readFile(new URL("../functions/src/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../firestore.rules", import.meta.url), "utf8"),
]);
const {
  academicSubjectOptions,
  canonicalizeSubject,
  sanitizeSubjects,
  subjectsForGrade,
  subjectsMatch,
} = await import(
  `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString("base64")}`
);

test("each grade exposes only its canonical subjects", () => {
  assert.deepEqual(subjectsForGrade("preschool", "1.º"), [
    "Lenguaje", "Matemáticas", "Ciencias", "Cívica", "Historia", "Física",
    "Inglés", "Lectura y comprensión",
  ]);
  assert.deepEqual(subjectsForGrade("preschool", "3.º"), [
    "Lenguaje", "Matemáticas", "Ciencias", "Cívica", "Historia", "Física",
    "Inglés", "Lectura y comprensión",
  ]);
  assert.deepEqual(subjectsForGrade("primary", "1.º"), [
    "Lenguaje", "Matemáticas", "Ciencias", "Cívica", "Historia", "Física",
    "Inglés", "Lectura y comprensión",
  ]);
  assert.deepEqual(subjectsForGrade("primary", "2.º"), [
    "Lenguaje", "Matemáticas", "Ciencias", "Cívica", "Historia", "Física",
    "Inglés", "Lectura y comprensión",
  ]);
  assert.deepEqual(subjectsForGrade("primary", "3.º"), [
    "Lenguaje", "Matemáticas", "Ciencias", "Cívica", "Historia", "Física",
    "Inglés", "Lectura y comprensión",
  ]);
  assert.deepEqual(subjectsForGrade("primary", "4.º"), [
    "Lenguaje", "Matemáticas", "Ciencias", "Historia", "Geografía", "Inglés",
    "Cívica", "Lectura y comprensión",
  ]);
  assert.deepEqual(subjectsForGrade("primary", "6.º"), [
    "Lenguaje", "Matemáticas", "Ciencias", "Historia", "Geografía", "Inglés",
  ]);
  assert.deepEqual(subjectsForGrade("secondary", "1.º"), [
    "Lenguaje", "Matemáticas", "Cívica", "Geografía", "Biología", "Inglés",
  ]);
  assert.deepEqual(subjectsForGrade("secondary", "2.º"), [
    "Lenguaje", "Matemáticas", "Cívica", "Historia", "Física", "Inglés",
  ]);
  assert.deepEqual(subjectsForGrade("secondary", "3.º"), [
    "Lenguaje", "Matemáticas", "Cívica", "Historia", "Física", "Inglés",
  ]);
});

test("legacy and unaccented names are normalized for exact-match filters", () => {
  assert.equal(canonicalizeSubject("Matematicas"), "Matemáticas");
  assert.equal(canonicalizeSubject("Formación Cívica"), "Cívica");
  assert.equal(canonicalizeSubject("Educacion Fisica"), "Física");
  assert.equal(canonicalizeSubject("Español"), "Lenguaje");
  assert.equal(subjectsMatch("Español", "Lenguaje"), true);
  assert.equal(subjectsMatch("Matematicas", "Matemáticas"), true);
  assert.equal(subjectsMatch("Historia", "Geografía"), false);
  assert.equal(canonicalizeSubject("lectura y compresion"), "Lectura y comprensión");
  assert.deepEqual(
    sanitizeSubjects(
      ["Matematicas", "MATEMÁTICAS", "Civica", "Artes"],
      academicSubjectOptions,
    ),
    ["Matemáticas", "Cívica"],
  );
});

test("sanitization removes subjects that do not belong to the selected grade", () => {
  assert.deepEqual(
    sanitizeSubjects(
      ["Biología", "Ciencias", "Inglés"],
      subjectsForGrade("primary", "6.º"),
    ),
    ["Ciencias", "Inglés"],
  );
});

test("registration, editing and backend saves use the grade catalog", () => {
  assert.match(appSource, /<option value="preschool">Preescolar<\/option>/);
  assert.match(usersSource, /<option value="preschool">Preescolar<\/option>/);
  assert.match(appSource, /availableSubjects\.map\(\(subject\)/);
  assert.match(appSource, /selectStudentGrade\(schoolLevel, event\.target\.value\)/);
  assert.match(usersSource, /availableSubjects\.map\(\(subject\)/);
  assert.match(firebaseSource, /subjectsBelongToCatalog\(input\.subjects, allowedSubjects\)/);
  assert.match(functionsSource, /subjectsBelongToCatalog\(rawSubjects, allowedSubjects\)/);
  assert.match(rulesSource, /validManagedAccountSubjects\(request\.resource\.data\)/);
  assert.match(rulesSource, /data\.schoolLevel == "preschool"/);
});
