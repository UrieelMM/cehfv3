import type { SchoolLevel } from "./types";

export const gradesBySchoolLevel: Record<SchoolLevel, readonly string[]> = {
  primary: ["1.º", "2.º", "3.º", "4.º", "5.º", "6.º"],
  secondary: ["1.º", "2.º", "3.º"],
};

export const academicSubjectOptions = [
  "Lenguaje",
  "Matemáticas",
  "Cívica",
  "Historia",
  "Física",
  "Inglés",
  "Ciencias",
  "Geografía",
  "Lectura y comprensión",
  "Biología",
] as const;

export type AcademicSubject = (typeof academicSubjectOptions)[number];

const primaryLowerSubjects = [
  "Lenguaje",
  "Matemáticas",
  "Ciencias",
  "Cívica",
  "Historia",
  "Física",
  "Inglés",
  "Lectura y comprensión",
] as const satisfies readonly AcademicSubject[];

const secondarySecondThirdSubjects = [
  "Lenguaje",
  "Matemáticas",
  "Cívica",
  "Historia",
  "Física",
  "Inglés",
] as const satisfies readonly AcademicSubject[];

const primaryUpperSubjects = [
  "Lenguaje",
  "Matemáticas",
  "Ciencias",
  "Historia",
  "Geografía",
  "Inglés",
  "Cívica",
  "Lectura y comprensión",
] as const satisfies readonly AcademicSubject[];

const primarySixthSubjects = [
  "Lenguaje",
  "Matemáticas",
  "Ciencias",
  "Historia",
  "Geografía",
  "Inglés",
] as const satisfies readonly AcademicSubject[];

const secondaryFirstSubjects = [
  "Lenguaje",
  "Matemáticas",
  "Cívica",
  "Geografía",
  "Biología",
  "Inglés",
] as const satisfies readonly AcademicSubject[];

export const subjectsByGrade: Record<
  SchoolLevel,
  Record<string, readonly AcademicSubject[]>
> = {
  primary: {
    "1.º": primaryLowerSubjects,
    "2.º": primaryLowerSubjects,
    "3.º": primaryLowerSubjects,
    "4.º": primaryUpperSubjects,
    "5.º": primaryUpperSubjects,
    "6.º": primarySixthSubjects,
  },
  secondary: {
    "1.º": secondaryFirstSubjects,
    "2.º": secondarySecondThirdSubjects,
    "3.º": secondarySecondThirdSubjects,
  },
};

function subjectKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("es-MX");
}

const subjectAliases = new Map<string, AcademicSubject>([
  ...academicSubjectOptions.map(
    (subject) => [subjectKey(subject), subject] as const,
  ),
  ["espanol", "Lenguaje"],
  ["formacion civica", "Cívica"],
  ["educacion fisica", "Física"],
  ["lectura y compresion", "Lectura y comprensión"],
]);

export function canonicalizeSubject(value: string): AcademicSubject | null {
  return subjectAliases.get(subjectKey(value)) ?? null;
}

export function subjectsMatch(first: string, second: string) {
  const firstCanonical = canonicalizeSubject(first);
  const secondCanonical = canonicalizeSubject(second);
  return firstCanonical && secondCanonical
    ? firstCanonical === secondCanonical
    : subjectKey(first) === subjectKey(second);
}

export function includesSubject(values: readonly string[], subject: string) {
  return values.some((value) => subjectsMatch(value, subject));
}

export function subjectsOverlap(
  first: readonly string[],
  second: readonly string[],
) {
  return first.some((subject) => includesSubject(second, subject));
}

export function subjectsForGrade(
  schoolLevel: SchoolLevel,
  grade: string,
): readonly AcademicSubject[] {
  return subjectsByGrade[schoolLevel][grade] ?? [];
}

export function sanitizeSubjects(
  values: readonly string[],
  allowed: readonly AcademicSubject[] = academicSubjectOptions,
) {
  const allowedSubjects = new Set<AcademicSubject>(allowed);
  const sanitized: AcademicSubject[] = [];
  for (const value of values) {
    const subject = canonicalizeSubject(value);
    if (
      subject &&
      allowedSubjects.has(subject) &&
      !sanitized.includes(subject)
    ) {
      sanitized.push(subject);
    }
  }
  return sanitized;
}

export function subjectsBelongToCatalog(
  values: readonly string[],
  allowed: readonly AcademicSubject[] = academicSubjectOptions,
) {
  const allowedSubjects = new Set<AcademicSubject>(allowed);
  return (
    values.length > 0 &&
    values.every((value) => {
      const subject = canonicalizeSubject(value);
      return Boolean(subject && allowedSubjects.has(subject));
    })
  );
}
