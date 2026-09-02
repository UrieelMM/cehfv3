import { Timestamp, getFirestore } from "firebase-admin/firestore";

const SEED_TAG = "codex-demo-v1";
const SCHOOL_YEAR_ID = "ciclo-2026-2027-demo";
const SCHOOL_YEAR_LABEL = "Ciclo 2026–2027 · Demostración";
const TIMEZONE = "America/Mexico_City";

type Director = {
  uid: string;
  name: string;
  institutionId: string;
};

type SeedSummary = Record<string, number>;

const studentNames = [
  ["Sofía", "Martínez"], ["Diego", "Ramírez"], ["Valentina", "Hernández"],
  ["Mateo", "García"], ["Camila", "Torres"], ["Santiago", "Flores"],
  ["Renata", "Morales"], ["Emiliano", "Cruz"], ["Luciana", "Reyes"],
  ["Sebastián", "Vargas"], ["Regina", "Castillo"], ["Leonardo", "Navarro"],
] as const;

const teacherData = [
  ["demo-teacher-01", "Mariana", "López", ["Español", "Ciencias"]],
  ["demo-teacher-02", "Roberto", "Díaz", ["Matemáticas", "Geografía"]],
  ["demo-teacher-03", "Fernanda", "Ruiz", ["Inglés", "Cívica"]],
] as const;

const subjects = ["Español", "Matemáticas", "Ciencias"];
const subjectId = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const initials = (first: string, last: string) => `${first[0]}${last[0]}`.toUpperCase();
const stamp = (iso: string) => Timestamp.fromDate(new Date(iso));
const pathId = (index: number) => String(index + 1).padStart(2, "0");

function dateAt(date: string, hour = 14) {
  return stamp(`${date}T${String(hour).padStart(2, "0")}:00:00.000Z`);
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export async function seedDemoData(director: Director) {
  const db = getFirestore();
  const writer = db.bulkWriter();
  const now = Timestamp.now();
  const summary: SeedSummary = {};
  const paths: string[] = [];
  const put = (path: string, data: Record<string, unknown>) => {
    paths.push(path);
    summary[path.split("/").at(-2) ?? "documents"] =
      (summary[path.split("/").at(-2) ?? "documents"] ?? 0) + 1;
    writer.set(db.doc(path), { ...data, seedTag: SEED_TAG }, { merge: true });
  };

  const teachers = teacherData.map(([uid, firstName, lastName, assignedSubjects], index) => ({
    uid, firstName, lastName, name: `${firstName} ${lastName}`,
    email: `demo.docente${pathId(index)}@example.invalid`, role: "teacher" as const,
    subjects: [...assignedSubjects], group: index === 0 ? "5.º A" : index === 1 ? "5.º B" : "6.º A",
  }));
  const students = studentNames.map(([firstName, lastName], index) => ({
    uid: `demo-student-${pathId(index)}`, firstName, lastName, name: `${firstName} ${lastName}`,
    email: `demo.alumno${pathId(index)}@example.invalid`, role: "student" as const,
    grade: index < 8 ? "5.º" : "6.º", group: index < 4 ? "A" : index < 8 ? "B" : "A",
    guardianName: `Familia ${lastName}`, teacherIds: index < 8 ? teachers.slice(0, 2).map((item) => item.uid) : [teachers[2].uid],
  }));

  teachers.forEach((teacher, index) => put(`users/${teacher.uid}`, {
    ...teacher, institutionId: director.institutionId, initials: initials(teacher.firstName, teacher.lastName),
    active: true, teacherIds: [], createdAt: dateAt("2026-08-10", 14 + index), updatedAt: now,
  }));
  students.forEach((student, index) => put(`users/${student.uid}`, {
    ...student, institutionId: director.institutionId, initials: initials(student.firstName, student.lastName),
    active: true, schoolLevel: "primary", subjects, guardianWhatsApp: "", createdAt: dateAt(addDays("2026-08-11", index), 15), updatedAt: now,
  }));

  const weeks = Array.from({ length: 10 }, (_, index) => {
    const startDate = addDays("2026-08-31", index * 7);
    return { id: `demo-semana-${pathId(index)}`, label: `Semana ${index + 1}`, startDate, endDate: addDays(startDate, 4), order: index + 1 };
  });
  const terms = [0, 1].map((index) => ({
    id: `demo-bimestre-${pathId(index)}`, label: `${index + 1}.er bimestre`, order: index + 1,
    weekIds: weeks.slice(index * 5, index * 5 + 5).map((week) => week.id),
    startDate: weeks[index * 5].startDate, endDate: weeks[index * 5 + 4].endDate,
  }));
  const cycleBase = `institutions/${director.institutionId}/ciclosEscolares/${SCHOOL_YEAR_ID}`;
  put(cycleBase, { institutionId: director.institutionId, label: SCHOOL_YEAR_LABEL, timezone: TIMEZONE, active: true, updatedAt: now, updatedBy: director.uid });
  weeks.forEach((week) => put(`${cycleBase}/semanas/${week.id}`, {
    institutionId: director.institutionId, schoolYearId: SCHOOL_YEAR_ID, ...week,
    startAt: dateAt(week.startDate, 6), endAt: dateAt(addDays(week.endDate, 1), 6), active: true, updatedAt: now, updatedBy: director.uid,
  }));
  terms.forEach((term) => put(`${cycleBase}/bimestres/${term.id}`, {
    institutionId: director.institutionId, schoolYearId: SCHOOL_YEAR_ID, ...term, active: true, updatedAt: now, updatedBy: director.uid,
  }));
  put(`${cycleBase}/diasNoLaborales/2026-09-16`, {
    institutionId: director.institutionId, schoolYearId: SCHOOL_YEAR_ID, date: "2026-09-16", label: "Día de la Independencia",
    weekId: weeks[2].id, weekLabel: weeks[2].label, termId: terms[0].id, termLabel: terms[0].label, active: true, updatedAt: now, updatedBy: director.uid,
  });
  put(`institutions/${director.institutionId}/configuracion/academica`, {
    institutionId: director.institutionId, schoolYearId: SCHOOL_YEAR_ID, schoolYearLabel: SCHOOL_YEAR_LABEL,
    timezone: TIMEZONE, termId: terms[0].id, termLabel: terms[0].label, weekId: weeks[0].id, weekLabel: weeks[0].label,
    weekStartDate: weeks[0].startDate, weekEndDate: weeks[0].endDate, nextWeekLabel: weeks[1].label,
    nextWeekStartDate: weeks[1].startDate, calendarStatus: "active", calendarRevision: 1, updatedAt: now, updatedBy: director.uid,
  });

  teachers.forEach((teacher) => put(`institutions/${director.institutionId}/gradingConfigs/${teacher.uid}`, {
    institutionId: director.institutionId, teacherId: teacher.uid, teacherName: teacher.name, subjects: teacher.subjects,
    weights: { classWork: 45, homework: 10, participation: 15, attendance: 10, exam: 20 }, updatedAt: now,
  }));

  const gradeDates = ["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"];
  students.forEach((student, studentIndex) => subjects.forEach((subject, subjectIndex) => {
    const teacher = teachers[subjectIndex < 2 ? subjectIndex : 0];
    gradeDates.forEach((gradeDate, dayIndex) => {
      const base = 78 + ((studentIndex * 3 + subjectIndex * 5 + dayIndex * 2) % 21);
      const scores = { classWork: Math.min(100, base + 2), homework: Math.max(70, base - 2), participation: base, attendance: Math.min(100, base + 5), exam: Math.max(70, base - 1) };
      const weightedScore = Math.round((scores.classWork * .45 + scores.homework * .1 + scores.participation * .15 + scores.attendance * .1 + scores.exam * .2) * 10) / 10;
      put(`institutions/${director.institutionId}/dailyGrades/demo-grade-${pathId(studentIndex)}-${subjectId(subject)}-${gradeDate}`, {
        institutionId: director.institutionId, schoolYearId: SCHOOL_YEAR_ID, schoolYearLabel: SCHOOL_YEAR_LABEL,
        termId: terms[0].id, termLabel: terms[0].label, weekId: weeks[0].id, weekLabel: weeks[0].label,
        gradeDate, subjectId: subjectId(subject), subject, teacherId: teacher.uid, teacherName: teacher.name,
        studentId: student.uid, studentName: student.name, studentGrade: student.grade, studentGroup: student.group,
        scores, weights: { classWork: 45, homework: 10, participation: 15, attendance: 10, exam: 20 }, weightedScore,
        createdAt: dateAt(gradeDate, 19), updatedAt: dateAt(gradeDate, 19),
      });
    });
  }));

  const achievements = ["Explica sus procedimientos con claridad.", "Participa con constancia y escucha al grupo.", "Relaciona lo aprendido con situaciones cotidianas."];
  students.forEach((student, studentIndex) => subjects.forEach((subject, subjectIndex) => {
    const teacher = teachers[subjectIndex < 2 ? subjectIndex : 0];
    const weeklyScore = 80 + ((studentIndex * 4 + subjectIndex * 3) % 19);
    put(`institutions/${director.institutionId}/studentWeeklyReports/demo-report-${pathId(studentIndex)}-${subjectId(subject)}`, {
      institutionId: director.institutionId, schoolYearId: SCHOOL_YEAR_ID, schoolYearLabel: SCHOOL_YEAR_LABEL,
      termId: terms[0].id, termLabel: terms[0].label, weekId: weeks[0].id, weekLabel: weeks[0].label,
      subjectId: subjectId(subject), subject, teacherId: teacher.uid, teacherName: teacher.name,
      studentId: student.uid, studentName: student.name, studentGrade: student.grade, studentGroup: student.group,
      achievement: achievements[subjectIndex], supportArea: "Fortalecer la revisión de instrucciones antes de entregar.",
      nextStep: "Practicar diez minutos y explicar el procedimiento con sus propias palabras.", weeklyScore, gradedDays: 5, workingDays: 5,
      status: studentIndex % 4 === 0 ? "draft" : "published", createdAt: now, updatedAt: now, ...(studentIndex % 4 === 0 ? {} : { publishedAt: now }),
    });
  }));

  const taskTitles = ["Bitácora de lectura", "Reto de fracciones", "Cambios de la materia", "Mapa de mi comunidad", "Carta a un personaje", "Problemas con medidas", "Experimento en casa", "Línea del tiempo", "Infografía del agua", "Diario de vocabulario", "Entrevista familiar", "Proyecto de cierre"];
  taskTitles.forEach((title, index) => {
    const subject = subjects[index % subjects.length];
    const teacher = teachers[index % 2];
    const week = weeks[index % weeks.length];
    const term = terms[index < 5 ? 0 : 1];
    const taskPath = `${cycleBase}/bimestres/${term.id}/semanas/${week.id}/materias/${subjectId(subject)}/tareas/demo-task-${pathId(index)}`;
    put(taskPath, {
      institutionId: director.institutionId, schoolYearId: SCHOOL_YEAR_ID, schoolYearLabel: SCHOOL_YEAR_LABEL,
      termId: term.id, termLabel: term.label, weekId: week.id, weekLabel: week.label, subjectId: subjectId(subject), subject,
      title, description: `Actividad demostrativa de ${subject} con instrucciones, evidencia y fecha de entrega.`,
      dueAt: dateAt(week.endDate, 23), publishAt: dateAt(week.startDate, 12), publishedAt: dateAt(week.startDate, 12),
      status: index % 5 === 0 ? "draft" : "published", publicationMode: index % 5 === 0 ? "draft" : "now",
      targetGroup: index < 8 ? "5.º A" : "6.º A", links: [{ id: `demo-link-${index}`, label: "Recurso de consulta", url: "https://example.com" }], attachments: [],
      createdBy: teacher.uid, teacherName: teacher.name, createdAt: now, updatedAt: now,
    });
  });

  Array.from({ length: 10 }, (_, index) => {
    const subject = subjects[index % subjects.length];
    const teacher = teachers[index % 2];
    const week = weeks[index % weeks.length];
    const term = terms[index < 5 ? 0 : 1];
    put(`institutions/${director.institutionId}/materials/demo-material-${pathId(index)}`, {
      institutionId: director.institutionId, schoolYearId: SCHOOL_YEAR_ID, schoolYearLabel: SCHOOL_YEAR_LABEL,
      termId: term.id, termLabel: term.label, weekId: week.id, weekLabel: week.label, subjectId: subjectId(subject), subject,
      title: `Material ${index + 1}: ${subject}`, description: "Recurso demostrativo para acompañar el trabajo semanal.",
      type: ["pdf", "video", "link"][index % 3], links: [{ id: `material-link-${index}`, label: "Abrir recurso", url: "https://example.com" }], attachments: [], required: index % 2 === 0,
      audienceStudentIds: students.map((item) => item.uid), targetGroups: ["5.º A", "5.º B", "6.º A"], managerIds: [teacher.uid, director.uid],
      createdBy: teacher.uid, createdByName: teacher.name, createdByRole: "teacher", createdAt: now, updatedAt: now,
    });
  });

  Array.from({ length: 10 }, (_, index) => {
    const subject = subjects[index % subjects.length];
    const teacher = teachers[index % 2];
    const week = weeks[index % weeks.length];
    const term = terms[index < 5 ? 0 : 1];
    const reviewId = `demo-review-${pathId(index)}`;
    put(`weeklyReviews/${reviewId}`, {
      institutionId: director.institutionId, schoolYearId: SCHOOL_YEAR_ID, schoolYearLabel: SCHOOL_YEAR_LABEL,
      termId: term.id, termLabel: term.label, weekId: week.id, weekLabel: week.label, subjectId: subjectId(subject), subject,
      title: `Repaso ${index + 1}: ${subject}`, description: "Repaso breve con reactivos de práctica y reflexión.", duration: 10 + index,
      maxAttempts: 2, status: index % 4 === 0 ? "draft" : "published",
      questions: [{ id: "q1", type: "multiple_choice", prompt: "Selecciona la respuesta que mejor explica lo aprendido.", options: [{ id: "a", label: "Respuesta A" }, { id: "b", label: "Respuesta B" }], points: 1 }, { id: "q2", type: "reflection", prompt: "Explica tu estrategia con un ejemplo.", options: [], points: 2 }],
      attachments: [], audienceStudentIds: students.map((item) => item.uid), targetGroups: ["5.º A", "5.º B", "6.º A"], managerIds: [teacher.uid, director.uid],
      audienceCount: students.length, startedCount: index + 1, completedCount: index, createdBy: teacher.uid, createdByName: teacher.name,
      createdByRole: "teacher", createdAt: now, updatedAt: now, ...(index % 4 === 0 ? {} : { publishedAt: now }),
    });
    put(`weeklyReviews/${reviewId}/answerKeys/default`, { answers: { q1: "a" }, updatedAt: now });
  });

  const muralEditionId = "demo-edition-2026-09";
  put(`muralEditions/${muralEditionId}`, {
    institutionId: director.institutionId, title: "Periódico mural · Septiembre", subtitle: "Historias, ciencia y creatividad de nuestra comunidad",
    issueLabel: "Edición 01", status: "published", published: true, publishedAt: now, createdAt: now, updatedAt: now,
    createdBy: director.uid, createdByName: director.name, managerIds: [director.uid, ...teachers.map((item) => item.uid)],
    cover: { background: "mint", eyebrow: "Comunidad CEHF", headline: "Aprender también es compartir", summary: "Diez historias para conocer el trabajo de nuestros grupos.", imageUrl: "" },
  });
  const muralCategories = ["Ciencia", "Lecturas", "Comunidad", "Arte", "Deportes"];
  Array.from({ length: 10 }, (_, index) => put(`wallPosts/demo-wall-${pathId(index)}`, {
    institutionId: director.institutionId, editionId: muralEditionId, title: `Historia destacada ${index + 1}`,
    excerpt: "Una mirada breve a los proyectos, descubrimientos y logros de la semana.", category: muralCategories[index % muralCategories.length],
    author: index % 2 ? students[index % students.length].name : teachers[index % teachers.length].name, authorId: index % 2 ? students[index % students.length].uid : teachers[index % teachers.length].uid,
    group: index < 7 ? "5.º" : "6.º", status: "published", accent: ["mint", "violet", "coral"][index % 3], favorite: index < 2,
    section: "Vida escolar", readingTime: `${2 + index % 4} min de lectura`, lead: "Cada proyecto comenzó con una pregunta y terminó con nuevas ideas para compartir.",
    paragraphs: ["El grupo observó, registró y comparó sus hallazgos durante la semana.", "Después organizó la información para comunicarla de forma clara.", "La experiencia dejó nuevas preguntas para el siguiente proyecto."],
    quote: "Cuando compartimos lo aprendido, toda la comunidad crece.", createdAt: now, updatedAt: now, publishedAt: now, approvedAt: now,
    approvedById: director.uid, approvedByName: director.name, approvedByRole: "director",
  }));

  Array.from({ length: 10 }, (_, index) => {
    const teacher = teachers[index % teachers.length];
    const topicId = `demo-topic-${pathId(index)}`;
    put(`forumTopics/${topicId}`, {
      institutionId: director.institutionId, creatorId: teacher.uid, creatorName: teacher.name, creatorRole: "teacher",
      forumId: topicId, forumName: index % 3 === 0 ? "Pregunta semanal" : "Conversaciones por materia", title: `Conversación ${index + 1}: pensemos juntos`,
      prompt: "Comparte una idea, una evidencia y una pregunta respetuosa para el grupo.", kind: index % 3 === 0 ? "weekly_question" : "subject",
      subject: subjects[index % subjects.length], targetGroup: index < 7 ? "5.º A" : "6.º A", participants: students.slice(0, 6).map((item) => ({ id: item.uid, name: item.name, initials: initials(item.firstName, item.lastName) })),
      opensAt: now, closesAt: stamp("2026-11-30T23:59:00.000Z"), status: "open", allowReplies: true, allowAttachments: false,
      pinned: index === 0, createdAt: now, updatedAt: now, lastActivityAt: now, managerIds: [teacher.uid, director.uid],
    });
    const student = students[index % students.length];
    put(`forumPosts/demo-post-${pathId(index)}`, {
      institutionId: director.institutionId, topicId, authorId: student.uid, authorName: student.name,
      authorInitials: initials(student.firstName, student.lastName), authorRole: "student", body: "Mi idea principal se apoya en un ejemplo que observamos durante la actividad.",
      status: "visible", reactionUsers: { helpful: [teachers[index % teachers.length].uid], interesting: [], celebrate: [] }, reportCount: 0,
      reportedByIds: [], markedAnswer: index % 4 === 0, createdAt: now, updatedAt: now,
    });
  });

  const workshopDefinitions = [
    { id: "tics", kind: "tics", title: "Taller de TICS", shortTitle: "TICS", description: "Tecnología, creatividad y ciudadanía digital." },
    { id: "reading", kind: "reading", title: "Club de lectura", shortTitle: "Lectura", description: "Lecturas compartidas y conversación literaria." },
  ];
  workshopDefinitions.forEach((workshop) => put(`institutions/${director.institutionId}/workshops/${workshop.id}`, {
    ...workshop, institutionId: director.institutionId, studentIds: students.map((item) => item.uid), teacherIds: teachers.map((item) => item.uid),
    managerIds: [director.uid, ...teachers.map((item) => item.uid)], memberIds: [...students.map((item) => item.uid), ...teachers.map((item) => item.uid)],
    teacherStudentIds: Object.fromEntries(teachers.map((teacher) => [teacher.uid, students.map((item) => item.uid)])), createdAt: now, updatedAt: now, updatedBy: director.uid,
  }));
  Array.from({ length: 10 }, (_, index) => {
    const workshop = workshopDefinitions[index % 2];
    put(`institutions/${director.institutionId}/workshops/${workshop.id}/resources/demo-resource-${pathId(index)}`, {
      workshopId: workshop.id, institutionId: director.institutionId, title: `Recurso de taller ${index + 1}`,
      description: "Ficha de consulta demostrativa.", fileName: "recurso-demostrativo.pdf", storagePath: "", contentType: "application/pdf", size: 0,
      uploadedBy: director.uid, uploadedByName: director.name, createdAt: now,
    });
    put(`institutions/${director.institutionId}/workshops/${workshop.id}/tasks/demo-workshop-task-${pathId(index)}`, {
      workshopId: workshop.id, institutionId: director.institutionId, title: `Actividad de taller ${index + 1}`,
      description: "Producto breve para practicar y compartir con el grupo.", dueAt: stamp(`2026-${index < 4 ? "09" : "10"}-${String(10 + index).padStart(2, "0")}T23:00:00.000Z`),
      status: index % 5 === 0 ? "draft" : "published", audienceStudentIds: students.map((item) => item.uid), attachments: [],
      createdBy: teachers[index % teachers.length].uid, teacherName: teachers[index % teachers.length].name, createdAt: now, updatedAt: now,
    });
  });

  Array.from({ length: 10 }, (_, index) => put(`notifications/${director.uid}/items/demo-notification-${pathId(index)}`, {
    institutionId: director.institutionId, userId: director.uid, type: ["task", "review", "report"][index % 3],
    title: `Actividad reciente ${index + 1}`, message: "Hay información demostrativa lista para revisar en el portal.", href: index % 3 === 0 ? "/tasks" : index % 3 === 1 ? "/reviews" : "/reports",
    read: index > 4, createdAt: now,
  }));

  students.slice(0, 10).forEach((student, index) => {
    const contactId = `demo-guardian-${pathId(index)}`;
    put(`guardianContacts/${contactId}`, {
      institutionId: director.institutionId, name: student.guardianName, phoneE164: "",
      phoneMasked: "Número demo", relationship: "Tutor", studentIds: [student.uid], studentNames: [student.name],
      categories: ["daily_summary"], status: "paused", consentStatus: "withdrawn", consentVersion: "demo-no-consent",
      createdAt: now, updatedAt: now,
    });
    put(`messageOutbox/demo-message-${pathId(index)}`, {
      institutionId: director.institutionId, guardianContactId: contactId, recipientName: student.guardianName,
      toMasked: "Número demo", messageKind: "daily_task_summary_test", businessDate: "2026-09-01",
      status: "delivered", attemptCount: 1, test: true, createdAt: now, updatedAt: now, sentAt: now, deliveredAt: now,
    });
  });
  put(`institutions/${director.institutionId}/configuracion/whatsapp`, {
    institutionId: director.institutionId, enabled: false, dailySummaryEnabled: false, sendOnNoTaskDays: false,
    sendTime: "18:00", timeZone: TIMEZONE, updatedAt: now, updatedBy: director.uid,
  });

  const progress = Array.from({ length: 10 }, (_, index) => ({
    id: `demo-progress-${pathId(index)}`, label: ["Repaso semanal", "Tareas", "Comprensión", "Participación", "Lectura", "Investigación", "Trabajo en equipo", "Creatividad", "Organización", "Autonomía"][index],
    detail: `${70 + index * 3}% de avance con evidencias demostrativas.`, weight: 10, level: index < 3 ? "in_progress" : "achieved",
  }));
  const legacyReports = students.slice(0, 10).map((student, index) => ({
    id: `demo-legacy-report-${pathId(index)}`, week: `Semana ${index + 1}`, status: index % 4 === 0 ? "draft" : "published",
    summary: `${student.name} trabajó con constancia durante la semana.`, achievement: achievements[index % achievements.length],
    support: "Continuar revisando instrucciones y evidencias.", nextStep: "Explicar el procedimiento antes de entregar.", teacher: teachers[index % teachers.length].name,
    publishedAt: "1 sep, 13:20", version: 1,
  }));
  put(`institutions/${director.institutionId}/portal/shared`, {
    week: { id: weeks[0].id, label: weeks[0].label, range: "31 de agosto–4 de septiembre", status: "active", title: "Comenzamos un ciclo para aprender y compartir", welcomeMessage: "Exploraremos nuevas ideas con curiosidad, orden y colaboración.", objectives: ["Explicar ideas con evidencias.", "Resolver problemas con estrategias propias.", "Participar con respeto y claridad."], completion: 64 },
    weeklyVerse: { text: "Todo lo puedo en Cristo que me fortalece.", reference: "Filipenses 4:13", updatedBy: director.name, updatedAt: new Date().toISOString() },
    progress, reports: legacyReports,
    reviews: Array.from({ length: 10 }, (_, index) => ({ id: `demo-review-${pathId(index)}`, title: `Repaso ${index + 1}`, subject: subjects[index % 3], purpose: "Practicar", duration: 10, questions: 2, progress: index * 10, attempts: 2, status: index % 4 === 0 ? "draft" : "published" })),
    tasks: taskTitles.slice(0, 10).map((title, index) => ({ id: `demo-task-${pathId(index)}`, title, subject: subjects[index % 3], description: "Actividad demostrativa.", dueLabel: "Viernes, 20:00", dueAt: "2026-09-04T23:00:00.000Z", status: "published", type: "Actividad", objective: "Practicar lo aprendido." })),
    materials: Array.from({ length: 10 }, (_, index) => ({ id: `demo-material-${pathId(index)}`, title: `Material ${index + 1}`, subject: subjects[index % 3], description: "Recurso demostrativo.", type: "PDF", day: "Miércoles", required: index % 2 === 0, reviewed: index < 4 })),
    wallPosts: Array.from({ length: 10 }, (_, index) => ({ id: `demo-wall-${pathId(index)}`, title: `Historia destacada ${index + 1}`, excerpt: "Proyectos y aprendizajes de nuestra comunidad.", category: muralCategories[index % muralCategories.length], author: "Comunidad CEHF", group: "5.º y 6.º", publishedAt: "1 sep", accent: ["mint", "violet", "coral"][index % 3], status: "published", favorite: index < 2, section: "Vida escolar", readingTime: "3 min de lectura", lead: "Una experiencia para compartir.", paragraphs: ["El grupo investigó y compartió sus hallazgos."], quote: "Aprender juntos transforma nuestra comunidad." })),
    muralEdition: { id: muralEditionId, institutionId: director.institutionId, title: "Periódico mural · Septiembre", subtitle: "Historias de nuestra comunidad", issueLabel: "Edición 01", status: "published", published: true, publishedAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: director.uid, createdByName: director.name, managerIds: [director.uid], cover: { background: "mint", eyebrow: "Comunidad CEHF", headline: "Aprender también es compartir", summary: "Proyectos, ciencia y creatividad.", imageUrl: "" } },
    forumTopics: [], forumModeration: [], forumBans: [], notifications: [],
    settings: { theme: "system", reducedMotion: false, whatsappEnabled: false, quietHours: "20:00–07:00" },
    updatedAt: new Date().toISOString(), updatedBy: director.name,
  });

  put(`institutions/${director.institutionId}/demoSeeds/${SEED_TAG}`, {
    institutionId: director.institutionId, status: "active", version: 1, createdBy: director.uid, createdByName: director.name,
    createdAt: now, updatedAt: now, documentPaths: paths.slice(0, 1500), summary,
  });
  await writer.close();
  return {
    ok: true as const, seedTag: SEED_TAG,
    counts: {
      students: students.length, teachers: teachers.length, weeks: weeks.length, nonWorkingDays: 1,
      dailyGrades: students.length * subjects.length * gradeDates.length,
      weeklyReports: students.length * subjects.length, tasks: taskTitles.length, materials: 10, reviews: 10,
      wallPosts: 10, forumTopics: 10, forumPosts: 10, workshopResources: 10, workshopTasks: 10, notifications: 10,
      guardianContacts: 10, whatsappHistory: 10,
    },
  };
}
