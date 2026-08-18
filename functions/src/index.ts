import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import {
  FieldValue,
  Timestamp,
  getFirestore,
  type DocumentData,
  type DocumentReference,
  type QueryDocumentSnapshot,
  type WriteBatch,
} from "firebase-admin/firestore";
import { logger, setGlobalOptions } from "firebase-functions/v2";
import {
  HttpsError,
  onCall,
  type CallableRequest,
} from "firebase-functions/v2/https";
import {
  onDocumentCreated,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";

initializeApp();
setGlobalOptions({ region: "us-central1", maxInstances: 10 });

const db = getFirestore();
const TASK_PATH =
  "institutions/{institutionId}/ciclosEscolares/{schoolYearId}/trimestres/{termId}/semanas/{weekId}/materias/{subjectId}/tareas/{taskId}";
const HISTORY_PATH = `${TASK_PATH}/entregas/{studentId}/historial/{eventId}`;
const EXTENSION_PATH = `${TASK_PATH}/prorrogas/{studentId}`;
const ACADEMIC_TIMEZONE = "America/Mexico_City";

type CalendarWeek = {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  startAt: Date;
  endAt: Date;
  order: number;
};

type CalendarTerm = {
  id: string;
  label: string;
  weekIds: string[];
  startDate: string;
  endDate: string;
  order: number;
};

function calendarId(value: unknown, field: string) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(normalized)) {
    throw new HttpsError(
      "invalid-argument",
      `${field} debe usar únicamente minúsculas, números y guiones.`,
    );
  }
  return normalized;
}

function calendarLabel(value: unknown, field: string) {
  const normalized = String(value ?? "").trim();
  if (normalized.length < 2 || normalized.length > 80) {
    throw new HttpsError(
      "invalid-argument",
      `${field} debe tener entre 2 y 80 caracteres.`,
    );
  }
  return normalized;
}

function calendarDate(value: unknown, field: string) {
  const normalized = String(value ?? "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (!match) {
    throw new HttpsError("invalid-argument", `${field} no es una fecha válida.`);
  }
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new HttpsError("invalid-argument", `${field} no es una fecha válida.`);
  }
  return normalized;
}

function addCalendarDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function zonedMidnight(value: string, timeZone: string) {
  const [year, month, day] = value.split("-").map(Number);
  const desired = Date.UTC(year, month - 1, day, 0, 0, 0);
  let candidate = desired;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(candidate))
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number(part.value)]),
    );
    const represented = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    candidate -= represented - desired;
  }
  return new Date(candidate);
}

function currentCalendarContext(
  weeks: CalendarWeek[],
  terms: CalendarTerm[],
  now = new Date(),
) {
  const currentWeek = weeks.find(
    (week) => now >= week.startAt && now < week.endAt,
  );
  const currentTerm = currentWeek
    ? terms.find((term) => term.weekIds.includes(currentWeek.id))
    : undefined;
  const nextWeek = weeks.find((week) => week.startAt > now);
  return { currentWeek, currentTerm, nextWeek };
}

async function requireCalendarDirector(
  auth: CallableRequest<unknown>["auth"],
) {
  if (!auth) throw new HttpsError("unauthenticated", "Inicia sesión para continuar.");
  const profileSnapshot = await db.doc(`users/${auth.uid}`).get();
  const profile = profileSnapshot.data();
  const valid =
    profileSnapshot.exists &&
    profile?.active === true &&
    profile.role === "director" &&
    auth.token.role === "director" &&
    auth.token.allPermissions === true &&
    auth.token.institutionId === profile.institutionId;
  if (!valid) {
    throw new HttpsError(
      "permission-denied",
      "Sólo Dirección puede configurar el calendario académico.",
    );
  }
  return {
    uid: auth.uid,
    name: String(profile?.name ?? "Dirección"),
    institutionId: String(profile?.institutionId),
  };
}

export const refreshPortalAccess = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Inicia sesión para continuar.");
  }
  const profileSnapshot = await db.doc(`users/${request.auth.uid}`).get();
  const profile = profileSnapshot.data();
  const role = String(profile?.role ?? "");
  const institutionId = String(profile?.institutionId ?? "");
  if (
    !profileSnapshot.exists ||
    profile?.active !== true ||
    !["director", "teacher", "student"].includes(role) ||
    !institutionId
  ) {
    throw new HttpsError(
      "permission-denied",
      "Tu perfil institucional no está activo o está incompleto.",
    );
  }
  const user = await getAuth().getUser(request.auth.uid);
  const currentClaims = user.customClaims ?? {};
  const desiredClaims = {
    ...currentClaims,
    role,
    institutionId,
    allPermissions: role === "director",
  };
  const changed =
    currentClaims.role !== desiredClaims.role ||
    currentClaims.institutionId !== desiredClaims.institutionId ||
    currentClaims.allPermissions !== desiredClaims.allPermissions;
  // Se reemiten siempre para que clientes que todavía condicionan la
  // renovación del ID token a `changed` también obtengan una sesión fresca.
  await getAuth().setCustomUserClaims(request.auth.uid, desiredClaims);
  logger.info("Portal access claims refreshed", {
    uid: request.auth.uid,
    role,
    institutionId,
    claimsChanged: changed,
  });
  return { changed: true, claimsChanged: changed, role, institutionId };
});

export const saveAcademicCalendar = onCall(async (request) => {
  const director = await requireCalendarDirector(request.auth);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const schoolYearId = calendarId(input.schoolYearId, "El identificador del ciclo");
  const schoolYearLabel = calendarLabel(input.schoolYearLabel, "El nombre del ciclo");
  const timezone = String(input.timezone ?? ACADEMIC_TIMEZONE);
  if (timezone !== ACADEMIC_TIMEZONE) {
    throw new HttpsError(
      "invalid-argument",
      `La zona horaria debe ser ${ACADEMIC_TIMEZONE}.`,
    );
  }
  if (!Array.isArray(input.weeks) || input.weeks.length < 1 || input.weeks.length > 60) {
    throw new HttpsError(
      "invalid-argument",
      "Configura entre 1 y 60 semanas para el ciclo.",
    );
  }
  if (!Array.isArray(input.terms) || input.terms.length < 1 || input.terms.length > 6) {
    throw new HttpsError(
      "invalid-argument",
      "Configura entre 1 y 6 trimestres para el ciclo.",
    );
  }

  const weekIds = new Set<string>();
  const weeks = input.weeks
    .map((raw, index) => {
      const value = raw as Record<string, unknown>;
      const id = calendarId(value.id, `El identificador de la semana ${index + 1}`);
      if (weekIds.has(id)) {
        throw new HttpsError("invalid-argument", `La semana ${id} está duplicada.`);
      }
      weekIds.add(id);
      const startDate = calendarDate(value.startDate, `El inicio de ${id}`);
      const endDate = calendarDate(value.endDate, `El fin de ${id}`);
      if (endDate < startDate) {
        throw new HttpsError(
          "invalid-argument",
          `El fin de ${id} no puede ser anterior a su inicio.`,
        );
      }
      return {
        id,
        label: calendarLabel(value.label, `El nombre de ${id}`),
        startDate,
        endDate,
        startAt: zonedMidnight(startDate, timezone),
        endAt: zonedMidnight(addCalendarDays(endDate, 1), timezone),
        order: index + 1,
      } satisfies CalendarWeek;
    })
    .sort((first, second) => first.startDate.localeCompare(second.startDate));

  for (let index = 1; index < weeks.length; index += 1) {
    if (weeks[index].startDate <= weeks[index - 1].endDate) {
      throw new HttpsError(
        "invalid-argument",
        `${weeks[index - 1].label} y ${weeks[index].label} tienen fechas traslapadas.`,
      );
    }
  }
  weeks.forEach((week, index) => {
    week.order = index + 1;
  });

  const termIds = new Set<string>();
  const assignedWeeks = new Set<string>();
  const terms = input.terms.map((raw, index) => {
    const value = raw as Record<string, unknown>;
    const id = calendarId(value.id, `El identificador del trimestre ${index + 1}`);
    if (termIds.has(id)) {
      throw new HttpsError("invalid-argument", `El trimestre ${id} está duplicado.`);
    }
    termIds.add(id);
    const selectedIds = Array.isArray(value.weekIds)
      ? [...new Set(value.weekIds.map((weekId) => String(weekId)))]
      : [];
    if (!selectedIds.length || selectedIds.some((weekId) => !weekIds.has(weekId))) {
      throw new HttpsError(
        "invalid-argument",
        `${id} debe incluir al menos una semana válida.`,
      );
    }
    selectedIds.forEach((weekId) => {
      if (assignedWeeks.has(weekId)) {
        throw new HttpsError(
          "invalid-argument",
          "Cada semana sólo puede pertenecer a un trimestre.",
        );
      }
      assignedWeeks.add(weekId);
    });
    const selectedWeeks = weeks.filter((week) => selectedIds.includes(week.id));
    const selectedIndexes = selectedWeeks.map((week) =>
      weeks.findIndex((candidate) => candidate.id === week.id),
    );
    if (
      selectedIndexes.some(
        (weekIndex, position) =>
          position > 0 && weekIndex !== selectedIndexes[position - 1] + 1,
      )
    ) {
      throw new HttpsError(
        "invalid-argument",
        `${id} debe contener semanas consecutivas.`,
      );
    }
    return {
      id,
      label: calendarLabel(value.label, `El nombre de ${id}`),
      weekIds: selectedWeeks.map((week) => week.id),
      startDate: selectedWeeks[0].startDate,
      endDate: selectedWeeks[selectedWeeks.length - 1].endDate,
      order: index + 1,
    } satisfies CalendarTerm;
  });
  if (assignedWeeks.size !== weeks.length) {
    throw new HttpsError(
      "invalid-argument",
      "Todas las semanas deben pertenecer exactamente a un trimestre.",
    );
  }

  terms.sort((first, second) => first.startDate.localeCompare(second.startDate));
  terms.forEach((term, index) => {
    term.order = index + 1;
  });

  const institutionRef = db.doc(`institutions/${director.institutionId}`);
  const cycleRef = institutionRef.collection("ciclosEscolares").doc(schoolYearId);
  const weeksCollection = cycleRef.collection("semanas");
  const termsCollection = cycleRef.collection("trimestres");
  const configReference = institutionRef.collection("configuracion").doc("academica");
  const [existingWeeks, existingTerms, previousConfigSnapshot] = await Promise.all([
    weeksCollection.get(),
    termsCollection.get(),
    configReference.get(),
  ]);
  const batch = db.batch();
  const now = FieldValue.serverTimestamp();
  batch.set(
    cycleRef,
    {
      institutionId: director.institutionId,
      label: schoolYearLabel,
      timezone,
      active: true,
      updatedAt: now,
      updatedBy: director.uid,
    },
    { merge: true },
  );
  const previousSchoolYearId = String(
    previousConfigSnapshot.data()?.schoolYearId ?? "",
  );
  if (previousSchoolYearId && previousSchoolYearId !== schoolYearId) {
    batch.set(
      institutionRef.collection("ciclosEscolares").doc(previousSchoolYearId),
      {
        active: false,
        closedAt: now,
        updatedAt: now,
        updatedBy: director.uid,
      },
      { merge: true },
    );
  }
  weeks.forEach((week) => {
    batch.set(
      weeksCollection.doc(week.id),
      {
        institutionId: director.institutionId,
        schoolYearId,
        label: week.label,
        startDate: week.startDate,
        endDate: week.endDate,
        startAt: Timestamp.fromDate(week.startAt),
        endAt: Timestamp.fromDate(week.endAt),
        order: week.order,
        active: true,
        archivedAt: FieldValue.delete(),
        updatedAt: now,
        updatedBy: director.uid,
      },
      { merge: true },
    );
  });
  existingWeeks.docs
    .filter((snapshot) => !weekIds.has(snapshot.id))
    .forEach((snapshot) =>
      batch.set(
        snapshot.ref,
        { active: false, archivedAt: now, updatedAt: now, updatedBy: director.uid },
        { merge: true },
      ),
    );
  terms.forEach((term) => {
    batch.set(
      termsCollection.doc(term.id),
      {
        institutionId: director.institutionId,
        schoolYearId,
        label: term.label,
        weekIds: term.weekIds,
        startDate: term.startDate,
        endDate: term.endDate,
        order: term.order,
        active: true,
        archivedAt: FieldValue.delete(),
        updatedAt: now,
        updatedBy: director.uid,
      },
      { merge: true },
    );
  });
  existingTerms.docs
    .filter((snapshot) => !termIds.has(snapshot.id))
    .forEach((snapshot) =>
      batch.set(
        snapshot.ref,
        { active: false, archivedAt: now, updatedAt: now, updatedBy: director.uid },
        { merge: true },
      ),
    );

  const context = currentCalendarContext(weeks, terms);
  const calendarStatus = context.currentWeek && context.currentTerm ? "active" : "gap";
  batch.set(
    configReference,
    {
      institutionId: director.institutionId,
      schoolYearId,
      schoolYearLabel,
      timezone,
      termId: context.currentTerm?.id ?? "",
      termLabel: context.currentTerm?.label ?? "Sin trimestre activo",
      weekId: context.currentWeek?.id ?? "",
      weekLabel: context.currentWeek?.label ?? "Sin semana activa",
      weekStartDate: context.currentWeek?.startDate ?? "",
      weekEndDate: context.currentWeek?.endDate ?? "",
      nextWeekLabel: context.nextWeek?.label ?? "",
      nextWeekStartDate: context.nextWeek?.startDate ?? "",
      calendarStatus,
      calendarRevision: FieldValue.increment(1),
      updatedAt: now,
      updatedBy: director.uid,
    },
    { merge: true },
  );
  batch.set(cycleRef.collection("calendarioHistorial").doc(), {
    institutionId: director.institutionId,
    schoolYearId,
    type: "calendar_configured",
    authorId: director.uid,
    authorName: director.name,
    weekIds: weeks.map((week) => week.id),
    termIds: terms.map((term) => term.id),
    createdAt: now,
  });
  await batch.commit();
  logger.info("Academic calendar saved", {
    institutionId: director.institutionId,
    schoolYearId,
    weeks: weeks.length,
    terms: terms.length,
  });
  return { calendarStatus };
});

type StudentRecipient = {
  uid: string;
  name: string;
};

function taskUrl(taskId: string) {
  return `/tasks/${encodeURIComponent(taskId)}`;
}

async function targetStudents(
  institutionId: string,
  targetGroup: string,
): Promise<StudentRecipient[]> {
  const snapshot = await db
    .collection("users")
    .where("institutionId", "==", institutionId)
    .get();
  return snapshot.docs
    .map((entry) => ({ uid: entry.id, ...entry.data() }) as DocumentData & { uid: string })
    .filter(
      (profile) =>
        profile.active === true &&
        profile.role === "student" &&
        `${String(profile.grade ?? "")} ${String(profile.group ?? "")}`.trim() ===
          targetGroup,
    )
    .map((profile) => ({ uid: profile.uid, name: String(profile.name ?? "Alumno") }));
}

async function writeNotifications(
  recipients: string[],
  eventId: string,
  notification: Record<string, unknown>,
) {
  const uniqueRecipients = [...new Set(recipients.filter(Boolean))];
  for (let offset = 0; offset < uniqueRecipients.length; offset += 450) {
    const batch = db.batch();
    uniqueRecipients.slice(offset, offset + 450).forEach((userId) => {
      batch.set(
        db.doc(`notifications/${userId}/items/${eventId}`),
        {
          ...notification,
          read: false,
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    });
    await batch.commit();
  }
}

const MURAL_CATEGORIES = [
  "Ciencia y curiosidades",
  "Comunidad",
  "Lecturas",
  "Arte y creatividad",
  "Deportes",
  "Medio ambiente",
  "Historia",
  "Vida escolar",
  "Salud y bienestar",
  "Música",
  "Proyectos",
  "Opinión",
  "Entrevistas",
] as const;

type MuralRole = "director" | "teacher" | "student";

type MuralUser = {
  uid: string;
  institutionId: string;
  name: string;
  role: MuralRole;
  group: string;
};

type MuralSubmission = {
  title: string;
  category: typeof MURAL_CATEGORIES[number];
  section: string;
  lead: string;
  paragraphs: string[];
  quote: string;
};

function compactMuralText(value: unknown) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function muralText(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
) {
  const normalized = compactMuralText(value);
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new HttpsError(
      "invalid-argument",
      `${label} debe tener entre ${minimum} y ${maximum.toLocaleString("es-MX")} caracteres.`,
    );
  }
  return normalized;
}

function muralSubmission(value: unknown): MuralSubmission {
  const input = (value ?? {}) as Record<string, unknown>;
  if (input.authorshipConfirmed !== true) {
    throw new HttpsError(
      "invalid-argument",
      "Confirma que la historia es tuya y puede compartirse en CEHF.",
    );
  }
  const category = compactMuralText(input.category);
  if (!MURAL_CATEGORIES.includes(category as typeof MURAL_CATEGORIES[number])) {
    throw new HttpsError("invalid-argument", "Selecciona una categoría válida.");
  }
  const normalizedBody = String(input.body ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
  if (normalizedBody.length < 180 || normalizedBody.length > 8_000) {
    throw new HttpsError(
      "invalid-argument",
      "La historia debe tener entre 180 y 8,000 caracteres.",
    );
  }
  const paragraphs = normalizedBody
    .split(/\n\s*\n/)
    .map(compactMuralText)
    .filter(Boolean);
  if (paragraphs.length < 2) {
    throw new HttpsError(
      "invalid-argument",
      "Separa la historia en al menos dos párrafos con una línea en blanco.",
    );
  }
  return {
    title: muralText(input.title, "El título", 8, 120),
    category: category as typeof MURAL_CATEGORIES[number],
    section: muralText(input.section, "La sección", 3, 60),
    lead: muralText(input.lead, "La entrada", 20, 180),
    paragraphs,
    quote: muralText(input.quote, "La frase destacada", 10, 240),
  };
}

function muralStoryId(value: unknown) {
  const id = String(value ?? "").trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    throw new HttpsError("invalid-argument", "La historia seleccionada no es válida.");
  }
  return id;
}

async function requireMuralUser(
  auth: CallableRequest<unknown>["auth"],
): Promise<MuralUser> {
  if (!auth) throw new HttpsError("unauthenticated", "Inicia sesión para continuar.");
  const profileSnapshot = await db.doc(`users/${auth.uid}`).get();
  const profile = profileSnapshot.data();
  const role = String(profile?.role ?? "");
  const institutionId = String(profile?.institutionId ?? "");
  if (
    !profileSnapshot.exists ||
    profile?.active !== true ||
    !["director", "teacher", "student"].includes(role) ||
    !institutionId
  ) {
    throw new HttpsError(
      "permission-denied",
      "Tu perfil institucional no está activo o está incompleto.",
    );
  }
  const group = `${String(profile?.grade ?? "")} ${String(profile?.group ?? "")}`.trim();
  return {
    uid: auth.uid,
    institutionId,
    name: String(profile?.name ?? "Integrante CEHF"),
    role: role as MuralRole,
    group: group || "Comunidad CEHF",
  };
}

function muralReadingTime(story: MuralSubmission) {
  const words = [story.title, story.lead, ...story.paragraphs, story.quote]
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
  return `${Math.max(2, Math.ceil(words / 180))} min de lectura`;
}

function muralAccent(id: string) {
  const accents = ["violet", "coral", "mint", "gold"] as const;
  const index = [...id].reduce((total, character) => total + character.charCodeAt(0), 0);
  return accents[index % accents.length];
}

function muralIso(value: unknown) {
  return value instanceof Timestamp ? value.toDate().toISOString() : "";
}

function muralStoryResponse(id: string, story: DocumentData) {
  return {
    id,
    institutionId: String(story.institutionId ?? ""),
    title: String(story.title ?? ""),
    excerpt: String(story.lead ?? ""),
    category: String(story.category ?? "Comunidad"),
    author: String(story.author ?? "Alumno CEHF"),
    authorId: String(story.authorId ?? ""),
    group: String(story.group ?? "Comunidad CEHF"),
    publishedAt: muralIso(story.publishedAt),
    accent: String(story.accent ?? "violet"),
    status: String(story.status ?? "submitted"),
    favorite: false,
    section: String(story.section ?? ""),
    lead: String(story.lead ?? ""),
    paragraphs: Array.isArray(story.paragraphs) ? story.paragraphs.map(String) : [],
    quote: String(story.quote ?? ""),
    readingTime: String(story.readingTime ?? "3 min de lectura"),
    version: Number(story.version ?? 1),
    reviewNote: String(story.reviewNote ?? ""),
    reviewedById: String(story.reviewedById ?? ""),
    reviewedByName: String(story.reviewedByName ?? ""),
    reviewedByRole: String(story.reviewedByRole ?? ""),
    reviewedAt: muralIso(story.reviewedAt),
    approvedById: String(story.approvedById ?? ""),
    approvedByName: String(story.approvedByName ?? ""),
    approvedByRole: String(story.approvedByRole ?? ""),
    approvedAt: muralIso(story.approvedAt),
    createdAt: muralIso(story.createdAt),
    updatedAt: muralIso(story.updatedAt),
    submittedAt: muralIso(story.submittedAt),
  };
}

export const submitWallStory = onCall(async (request) => {
  const student = await requireMuralUser(request.auth);
  if (student.role !== "student") {
    throw new HttpsError("permission-denied", "Sólo los alumnos pueden enviar historias.");
  }
  const input = (request.data ?? {}) as Record<string, unknown>;
  const submission = muralSubmission(input);
  const requestedStoryId = input.storyId ? muralStoryId(input.storyId) : "";
  const storyReference = requestedStoryId
    ? db.doc(`wallPosts/${requestedStoryId}`)
    : db.collection("wallPosts").doc();
  const now = Timestamp.now();
  const content = {
    title: submission.title,
    excerpt: submission.lead,
    category: submission.category,
    section: submission.section,
    lead: submission.lead,
    paragraphs: submission.paragraphs,
    quote: submission.quote,
    readingTime: muralReadingTime(submission),
  };

  let savedStory: DocumentData;
  if (requestedStoryId) {
    savedStory = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(storyReference);
      const previous = snapshot.data();
      if (
        !snapshot.exists ||
        previous?.institutionId !== student.institutionId ||
        previous.authorId !== student.uid
      ) {
        throw new HttpsError("not-found", "La historia no está disponible para tu cuenta.");
      }
      if (previous.status !== "changes_requested") {
        throw new HttpsError(
          "failed-precondition",
          "Esta historia ya no está disponible para correcciones.",
        );
      }
      const nextStory = {
        ...previous,
        ...content,
        status: "submitted",
        version: Number(previous.version ?? 1) + 1,
        submittedAt: now,
        updatedAt: now,
        updatedBy: student.uid,
      };
      transaction.set(storyReference, nextStory);
      transaction.set(db.collection("auditEvents").doc(), {
        entityType: "wallPost",
        entityId: storyReference.id,
        institutionId: student.institutionId,
        action: "wall.story.resubmitted",
        actorId: student.uid,
        actorName: student.name,
        actorRole: student.role,
        before: { status: previous.status, version: previous.version ?? 1 },
        after: { status: "submitted", version: nextStory.version },
        createdAt: now,
      });
      return nextStory;
    });
  } else {
    savedStory = {
      ...content,
      institutionId: student.institutionId,
      author: student.name,
      authorId: student.uid,
      group: student.group,
      accent: muralAccent(storyReference.id),
      status: "submitted",
      version: 1,
      reviewNote: "",
      reviewedById: "",
      reviewedByName: "",
      reviewedByRole: "",
      approvedById: "",
      approvedByName: "",
      approvedByRole: "",
      createdAt: now,
      createdBy: student.uid,
      submittedAt: now,
      updatedAt: now,
      updatedBy: student.uid,
    };
    const batch = db.batch();
    batch.create(storyReference, savedStory);
    batch.create(db.collection("auditEvents").doc(), {
      entityType: "wallPost",
      entityId: storyReference.id,
      institutionId: student.institutionId,
      action: "wall.story.submitted",
      actorId: student.uid,
      actorName: student.name,
      actorRole: student.role,
      after: { status: "submitted", version: 1 },
      createdAt: now,
    });
    await batch.commit();
  }

  logger.info("Mural story submitted", {
    storyId: storyReference.id,
    institutionId: student.institutionId,
    version: savedStory.version,
  });
  return { story: muralStoryResponse(storyReference.id, savedStory) };
});

export const reviewWallStory = onCall(async (request) => {
  const reviewer = await requireMuralUser(request.auth);
  if (reviewer.role !== "teacher" && reviewer.role !== "director") {
    throw new HttpsError(
      "permission-denied",
      "Sólo un maestro o Dirección puede revisar historias.",
    );
  }
  const input = (request.data ?? {}) as Record<string, unknown>;
  const storyId = muralStoryId(input.storyId);
  const decision = String(input.decision ?? "");
  if (decision !== "approve" && decision !== "request_changes") {
    throw new HttpsError("invalid-argument", "Selecciona una decisión editorial válida.");
  }
  const rawReviewNote = compactMuralText(input.reviewNote);
  if (rawReviewNote.length > 500) {
    throw new HttpsError(
      "invalid-argument",
      "Las observaciones pueden tener hasta 500 caracteres.",
    );
  }
  if (decision === "request_changes" && rawReviewNote.length < 8) {
    throw new HttpsError(
      "invalid-argument",
      "Explica en al menos 8 caracteres qué debe corregir el alumno.",
    );
  }

  const storyReference = db.doc(`wallPosts/${storyId}`);
  const now = Timestamp.now();
  const savedStory = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(storyReference);
    const previous = snapshot.data();
    if (!snapshot.exists || previous?.institutionId !== reviewer.institutionId) {
      throw new HttpsError("not-found", "La historia ya no está disponible.");
    }
    if (previous.status !== "submitted") {
      throw new HttpsError(
        "already-exists",
        "La historia ya fue revisada por otra persona. Actualiza la bandeja.",
      );
    }
    const approved = decision === "approve";
    const nextStory = {
      ...previous,
      status: approved ? "published" : "changes_requested",
      reviewNote: rawReviewNote,
      reviewedById: reviewer.uid,
      reviewedByName: reviewer.name,
      reviewedByRole: reviewer.role,
      reviewedAt: now,
      approvedById: approved ? reviewer.uid : "",
      approvedByName: approved ? reviewer.name : "",
      approvedByRole: approved ? reviewer.role : "",
      approvedAt: approved ? now : null,
      publishedAt: approved ? now : null,
      updatedAt: now,
      updatedBy: reviewer.uid,
    };
    transaction.set(storyReference, nextStory);
    transaction.create(db.collection("auditEvents").doc(), {
      entityType: "wallPost",
      entityId: storyId,
      institutionId: reviewer.institutionId,
      action: approved ? "wall.story.published" : "wall.story.changes_requested",
      actorId: reviewer.uid,
      actorName: reviewer.name,
      actorRole: reviewer.role,
      before: { status: previous.status, version: previous.version ?? 1 },
      after: {
        status: nextStory.status,
        version: previous.version ?? 1,
        reviewNote: rawReviewNote,
      },
      createdAt: now,
    });
    return nextStory;
  });

  logger.info("Mural story reviewed", {
    storyId,
    institutionId: reviewer.institutionId,
    reviewerId: reviewer.uid,
    decision,
  });
  return { story: muralStoryResponse(storyId, savedStory) };
});

async function muralReviewers(institutionId: string) {
  const snapshot = await db
    .collection("users")
    .where("institutionId", "==", institutionId)
    .get();
  return snapshot.docs
    .filter((entry) => {
      const profile = entry.data();
      return profile.active === true && ["teacher", "director"].includes(profile.role);
    })
    .map((entry) => entry.id);
}

export const onWallStoryCreated = onDocumentCreated(
  { document: "wallPosts/{storyId}", retry: true },
  async (event) => {
    const story = event.data?.data();
    if (!story || story.status !== "submitted") return;
    const recipients = await muralReviewers(String(story.institutionId ?? ""));
    await writeNotifications(recipients, `wall-review-${event.params.storyId}-v1`, {
      category: "wall",
      title: "Nueva historia por revisar",
      detail: `${String(story.author ?? "Un alumno")} envió “${String(story.title ?? "Nueva historia")}”.`,
      storyId: event.params.storyId,
      url: "/wall-newspaper",
      eventType: "wall_story_submitted",
    });
  },
);

export const onWallStoryChanged = onDocumentWritten(
  { document: "wallPosts/{storyId}", retry: true },
  async (event) => {
    const beforeSnapshot = event.data?.before;
    const afterSnapshot = event.data?.after;
    if (!beforeSnapshot?.exists || !afterSnapshot?.exists) return;
    const before = beforeSnapshot.data();
    const after = afterSnapshot.data();
    if (!before || !after) return;
    if (before.status === after.status) return;
    const storyId = event.params.storyId;
    const version = Number(after.version ?? 1);
    if (before.status === "changes_requested" && after.status === "submitted") {
      const recipients = await muralReviewers(String(after.institutionId ?? ""));
      await writeNotifications(recipients, `wall-review-${storyId}-v${version}`, {
        category: "wall",
        title: "Historia corregida por revisar",
        detail: `${String(after.author ?? "Un alumno")} envió una nueva versión de “${String(after.title ?? "su historia")}”.`,
        storyId,
        url: "/wall-newspaper",
        eventType: "wall_story_resubmitted",
      });
      return;
    }
    if (!["published", "changes_requested"].includes(String(after.status))) return;
    const authorId = String(after.authorId ?? "");
    if (!authorId) return;
    const published = after.status === "published";
    await writeNotifications(
      [authorId],
      `wall-decision-${storyId}-v${version}-${after.status}`,
      {
        category: "wall",
        title: published ? "Tu historia fue publicada" : "Tu historia necesita correcciones",
        detail: published
          ? `“${String(after.title ?? "Tu historia")}” ya está en el Periódico mural.`
          : String(after.reviewNote ?? "Revisa las observaciones de tu maestro."),
        storyId,
        url: "/wall-newspaper",
        eventType: published ? "wall_story_published" : "wall_story_changes_requested",
      },
    );
  },
);

export const onTaskStateChanged = onDocumentWritten(
  { document: TASK_PATH, retry: true },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;
    const before = event.data?.before;
    const previousStatus = before?.exists ? before.data()?.status : null;
    const task = after.data() as DocumentData;
    const nextStatus = task.status;
    if (previousStatus === nextStatus || !["published", "closed"].includes(nextStatus)) {
      return;
    }
    const recipients = await targetStudents(
      String(task.institutionId),
      String(task.targetGroup),
    );
    if (!recipients.length) {
      logger.info("Task state changed without matching student recipients", {
        taskId: event.params.taskId,
        targetGroup: task.targetGroup,
      });
      return;
    }
    const reopened = nextStatus === "published" && previousStatus === "closed";
    const title =
      nextStatus === "closed"
        ? `Tarea cerrada: ${task.title}`
        : reopened
          ? `Tarea reabierta: ${task.title}`
          : `Nueva tarea: ${task.title}`;
    const detail =
      nextStatus === "closed"
        ? "El docente cerró esta actividad para nuevas entregas."
        : reopened
          ? "La actividad tiene una nueva fecha de entrega."
          : `${task.subject} · entrega ${formatTaskDate(task.dueAt)}`;
    await writeNotifications(
      recipients.map((recipient) => recipient.uid),
      `task-state-${event.params.taskId}-${nextStatus}-${event.id}`,
      {
        category: "task",
        title,
        detail,
        taskId: event.params.taskId,
        taskPath: after.ref.path,
        url: taskUrl(event.params.taskId),
        eventType: reopened ? "task_reopened" : `task_${nextStatus}`,
      },
    );
  },
);

function formatTaskDate(value: unknown) {
  const date = value instanceof Timestamp ? value.toDate() : new Date(String(value));
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Mexico_City",
  }).format(date);
}

function taskReferenceFromConversation(
  eventDocument: QueryDocumentSnapshot,
): DocumentReference | null {
  const submissionReference = eventDocument.ref.parent.parent;
  return submissionReference?.parent.parent ?? null;
}

export const onTaskConversationEvent = onDocumentCreated(
  { document: HISTORY_PATH, retry: true },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;
    const taskReference = taskReferenceFromConversation(snapshot);
    if (!taskReference) return;
    const taskSnapshot = await taskReference.get();
    if (!taskSnapshot.exists) return;
    const task = taskSnapshot.data() as DocumentData;
    const conversation = snapshot.data();
    const type = String(conversation.type ?? "");
    const studentId = String(event.params.studentId);
    if (["submitted", "resubmitted"].includes(type)) {
      await writeNotifications(
        [String(task.createdBy)],
        `task-conversation-${event.params.eventId}`,
        {
          category: "task",
          title: `${conversation.studentName ?? "Un alumno"} entregó ${task.title}`,
          detail: `Versión ${conversation.version ?? 1} lista para revisar.`,
          taskId: event.params.taskId,
          studentId,
          taskPath: taskReference.path,
          url: taskUrl(event.params.taskId),
          eventType: type,
        },
      );
      return;
    }
    if (["feedback", "reviewed"].includes(type)) {
      await writeNotifications(
        [studentId],
        `task-conversation-${event.params.eventId}`,
        {
          category: "task",
          title:
            type === "reviewed"
              ? `Entrega finalizada: ${task.title}`
              : `Nueva retroalimentación: ${task.title}`,
          detail:
            type === "reviewed"
              ? "El docente marcó tu entrega como finalizada."
              : "Tu maestro respondió a tu entrega.",
          taskId: event.params.taskId,
          taskPath: taskReference.path,
          url: taskUrl(event.params.taskId),
          eventType: type,
        },
      );
    }
  },
);

export const onIndividualExtensionChanged = onDocumentWritten(
  { document: EXTENSION_PATH, retry: true },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;
    const beforeDue = event.data?.before.exists
      ? event.data.before.data()?.dueAt?.toMillis?.()
      : null;
    const extension = after.data() as DocumentData;
    const afterDue = extension.dueAt?.toMillis?.();
    if (beforeDue === afterDue) return;
    const taskReference = after.ref.parent.parent;
    const taskSnapshot = await taskReference?.get();
    if (!taskSnapshot?.exists) return;
    const task = taskSnapshot.data() as DocumentData;
    await writeNotifications(
      [event.params.studentId],
      `task-extension-${event.params.taskId}-${event.params.studentId}-${afterDue}`,
      {
        category: "task",
        title: `Prórroga para ${task.title}`,
        detail: `Puedes entregar hasta ${formatTaskDate(extension.dueAt)}.`,
        taskId: event.params.taskId,
        taskPath: taskReference?.path,
        url: taskUrl(event.params.taskId),
        eventType: "individual_extension",
      },
    );
  },
);

function addScheduledPublicationToBatch(
  batch: WriteBatch,
  taskSnapshot: QueryDocumentSnapshot,
) {
  batch.update(taskSnapshot.ref, {
    status: "published",
    publicationMode: "scheduled",
    publishedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(taskSnapshot.ref.collection("historial").doc(), {
    type: "published",
    authorId: "system",
    authorName: "Campus CEHF",
    authorRole: "director",
    message: "Publicó automáticamente la actividad programada.",
    createdAt: FieldValue.serverTimestamp(),
  });
}

async function syncInstitutionAcademicContext(institutionId: string) {
  const configReference = db.doc(
    `institutions/${institutionId}/configuracion/academica`,
  );
  const configSnapshot = await configReference.get();
  if (!configSnapshot.exists) return;
  const config = configSnapshot.data() as DocumentData;
  const schoolYearId = String(config.schoolYearId ?? "");
  if (!schoolYearId) return;
  const cycleReference = db.doc(
    `institutions/${institutionId}/ciclosEscolares/${schoolYearId}`,
  );
  const [weekSnapshots, termSnapshots] = await Promise.all([
    cycleReference.collection("semanas").where("active", "==", true).get(),
    cycleReference.collection("trimestres").where("active", "==", true).get(),
  ]);
  const weeks = weekSnapshots.docs
    .map((snapshot) => {
      const data = snapshot.data();
      return {
        id: snapshot.id,
        label: String(data.label ?? "Semana"),
        startDate: String(data.startDate ?? ""),
        endDate: String(data.endDate ?? ""),
        startAt: data.startAt instanceof Timestamp ? data.startAt.toDate() : new Date(0),
        endAt: data.endAt instanceof Timestamp ? data.endAt.toDate() : new Date(0),
        order: Number(data.order ?? 0),
      } satisfies CalendarWeek;
    })
    .sort((first, second) => first.startDate.localeCompare(second.startDate));
  const terms = termSnapshots.docs.map((snapshot) => {
    const data = snapshot.data();
    return {
      id: snapshot.id,
      label: String(data.label ?? "Trimestre"),
      weekIds: Array.isArray(data.weekIds) ? data.weekIds.map(String) : [],
      startDate: String(data.startDate ?? ""),
      endDate: String(data.endDate ?? ""),
      order: Number(data.order ?? 0),
    } satisfies CalendarTerm;
  });
  const context = currentCalendarContext(weeks, terms);
  const calendarStatus =
    weeks.length && terms.length
      ? context.currentWeek && context.currentTerm
        ? "active"
        : "gap"
      : "unconfigured";
  const nextState = {
    termId: context.currentTerm?.id ?? "",
    termLabel: context.currentTerm?.label ?? "Sin trimestre activo",
    weekId: context.currentWeek?.id ?? "",
    weekLabel:
      context.currentWeek?.label ??
      (calendarStatus === "unconfigured" ? "Calendario pendiente" : "Sin semana activa"),
    weekStartDate: context.currentWeek?.startDate ?? "",
    weekEndDate: context.currentWeek?.endDate ?? "",
    nextWeekLabel: context.nextWeek?.label ?? "",
    nextWeekStartDate: context.nextWeek?.startDate ?? "",
    calendarStatus,
  };
  const changed = Object.entries(nextState).some(
    ([key, value]) => config[key] !== value,
  );
  if (!changed) return;
  await configReference.set(
    {
      ...nextState,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: "system",
    },
    { merge: true },
  );
  logger.info("Academic context synchronized", {
    institutionId,
    schoolYearId,
    weekId: nextState.weekId,
    termId: nextState.termId,
  });
}

export const syncAcademicCalendar = onSchedule(
  {
    schedule: "every 5 minutes",
    timeZone: ACADEMIC_TIMEZONE,
    retryCount: 3,
  },
  async () => {
    await syncInstitutionAcademicContext("cehf-primaria");
  },
);

export const publishScheduledTasks = onSchedule(
  {
    schedule: "every 1 minutes",
    timeZone: "America/Mexico_City",
    retryCount: 3,
  },
  async () => {
    const snapshot = await db
      .collectionGroup("tareas")
      .where("status", "==", "scheduled")
      .where("publishAt", "<=", Timestamp.now())
      .limit(200)
      .get();
    if (snapshot.empty) return;
    const batch = db.batch();
    snapshot.docs.forEach((taskSnapshot) =>
      addScheduledPublicationToBatch(batch, taskSnapshot),
    );
    await batch.commit();
    logger.info("Scheduled tasks published", { count: snapshot.size });
  },
);
