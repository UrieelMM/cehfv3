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
const WORKSHOP_PATH =
  "institutions/{institutionId}/workshops/{workshopId}";
const WORKSHOP_RESOURCE_PATH = `${WORKSHOP_PATH}/resources/{resourceId}`;
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

async function requireAccountDirector(
  auth: CallableRequest<unknown>["auth"],
) {
  if (!auth) throw new HttpsError("unauthenticated", "Inicia sesión para continuar.");
  const profileSnapshot = await db.doc(`users/${auth.uid}`).get();
  const profile = profileSnapshot.data();
  const institutionId = String(profile?.institutionId ?? "");
  const valid =
    profileSnapshot.exists &&
    profile?.active === true &&
    profile.role === "director" &&
    auth.token.role === "director" &&
    auth.token.allPermissions === true &&
    auth.token.institutionId === institutionId &&
    Boolean(institutionId);
  if (!valid) {
    throw new HttpsError(
      "permission-denied",
      "Sólo Dirección puede administrar cuentas de la comunidad.",
    );
  }
  return {
    uid: auth.uid,
    name: String(profile?.name ?? "Dirección"),
    institutionId,
  };
}

function accountText(value: unknown, field: string, maximum = 80) {
  const normalized = String(value ?? "").trim();
  if (normalized.length < 1 || normalized.length > maximum) {
    throw new HttpsError(
      "invalid-argument",
      `${field} debe tener entre 1 y ${maximum} caracteres.`,
    );
  }
  return normalized;
}

function accountEmail(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (
    normalized.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  ) {
    throw new HttpsError("invalid-argument", "Escribe un correo válido.");
  }
  return normalized;
}

function accountUid(value: unknown) {
  const normalized = String(value ?? "").trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(normalized)) {
    throw new HttpsError("invalid-argument", "La cuenta seleccionada no es válida.");
  }
  return normalized;
}

function accountStringList(value: unknown, field: string, minimum = 1) {
  if (!Array.isArray(value)) {
    throw new HttpsError("invalid-argument", `${field} no tiene un formato válido.`);
  }
  const values = [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
  if (
    values.length < minimum ||
    values.length > 20 ||
    values.some((item) => item.length > 80)
  ) {
    throw new HttpsError(
      "invalid-argument",
      `${field} debe contener entre ${minimum} y 20 opciones válidas.`,
    );
  }
  return values;
}

async function managedAccountTarget(uid: string, institutionId: string) {
  const reference = db.doc(`users/${uid}`);
  const snapshot = await reference.get();
  const data = snapshot.data();
  if (
    !snapshot.exists ||
    data?.institutionId !== institutionId ||
    !["student", "teacher"].includes(String(data?.role ?? ""))
  ) {
    throw new HttpsError(
      "not-found",
      "La cuenta ya no existe o no pertenece a esta institución.",
    );
  }
  return { reference, snapshot, data: data as DocumentData };
}

function accountAuthError(error: unknown): never {
  const code =
    typeof error === "object" && error && "code" in error
      ? String(error.code)
      : "";
  if (code === "auth/email-already-exists") {
    throw new HttpsError("already-exists", "Ese correo ya pertenece a otra cuenta.");
  }
  if (code === "auth/invalid-email") {
    throw new HttpsError("invalid-argument", "Escribe un correo válido.");
  }
  logger.error("Account administration failed in Firebase Auth", error);
  throw new HttpsError(
    "internal",
    "Firebase Authentication no pudo actualizar la cuenta.",
  );
}

function accountTimestamp(value: unknown) {
  return value instanceof Timestamp
    ? value.toDate().toISOString()
    : new Date().toISOString();
}

function serializeManagedAccount(uid: string, data: DocumentData) {
  return {
    uid,
    firstName: String(data.firstName ?? ""),
    lastName: String(data.lastName ?? ""),
    name: String(data.name ?? "Cuenta CEHF"),
    email: String(data.email ?? ""),
    role: String(data.role) as "student" | "teacher",
    initials: String(data.initials ?? "CE"),
    active: data.active !== false,
    ...(data.role === "student"
      ? {
          schoolLevel: data.schoolLevel === "secondary" ? "secondary" : "primary",
          grade: String(data.grade ?? ""),
          group: String(data.group ?? ""),
        }
      : {}),
    subjects: Array.isArray(data.subjects) ? data.subjects.map(String) : [],
    teacherIds: Array.isArray(data.teacherIds) ? data.teacherIds.map(String) : [],
    ...(data.photoURL ? { photoURL: String(data.photoURL) } : {}),
    createdAt: accountTimestamp(data.createdAt),
  };
}

export const updateManagedAccount = onCall(async (request) => {
  const director = await requireAccountDirector(request.auth);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const uid = accountUid(input.uid);
  const target = await managedAccountTarget(uid, director.institutionId);
  const role = String(target.data.role) as "student" | "teacher";
  const firstName = accountText(input.firstName, "El nombre");
  const lastName = accountText(input.lastName, "Los apellidos");
  const name = `${firstName} ${lastName}`;
  const email = accountEmail(input.email);
  const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
  const subjects = accountStringList(input.subjects, "Las materias");
  const teacherIds =
    role === "student"
      ? accountStringList(input.teacherIds, "El acompañamiento")
      : [];
  let studentAssignment: Record<string, string> = {};
  if (role === "student") {
    const schoolLevel = String(input.schoolLevel ?? "");
    const grade = String(input.grade ?? "").trim();
    const group = String(input.group ?? "").trim();
    const grades =
      schoolLevel === "secondary"
        ? ["1.º", "2.º", "3.º"]
        : schoolLevel === "primary"
          ? ["1.º", "2.º", "3.º", "4.º", "5.º", "6.º"]
          : [];
    if (!grades.includes(grade) || !["A", "B", "C"].includes(group)) {
      throw new HttpsError(
        "invalid-argument",
        "Selecciona un nivel, grado y grupo válidos.",
      );
    }
    const teacherSnapshots = await db.getAll(
      ...teacherIds.map((teacherId) => db.doc(`users/${teacherId}`)),
    );
    const invalidTeacher = teacherSnapshots.some((snapshot) => {
      const teacher = snapshot.data();
      return (
        !snapshot.exists ||
        teacher?.institutionId !== director.institutionId ||
        teacher?.role !== "teacher" ||
        teacher?.active !== true
      );
    });
    if (invalidTeacher) {
      throw new HttpsError(
        "failed-precondition",
        "Uno de los maestros asignados ya no está activo.",
      );
    }
    studentAssignment = { schoolLevel, grade, group };
  }
  const photoURL = input.photoURL ? String(input.photoURL).trim() : "";
  if (
    photoURL &&
    (!photoURL.startsWith("https://firebasestorage.googleapis.com/") ||
      photoURL.length > 2_000)
  ) {
    throw new HttpsError("invalid-argument", "La fotografía no es válida.");
  }

  const auth = getAuth();
  const previousAuth = await auth.getUser(uid).catch(accountAuthError);
  await auth.updateUser(uid, { email, displayName: name }).catch(accountAuthError);
  const updatedAt = FieldValue.serverTimestamp();
  const nextData = {
    firstName,
    lastName,
    name,
    email,
    initials,
    subjects,
    teacherIds,
    ...studentAssignment,
    ...(photoURL ? { photoURL } : {}),
    updatedAt,
    updatedBy: director.uid,
  };
  const auditReference = db
    .collection(`institutions/${director.institutionId}/accountAudit`)
    .doc();
  const batch = db.batch();
  batch.update(target.reference, nextData);
  batch.set(auditReference, {
    action: "updated",
    targetUid: uid,
    targetRole: role,
    actorUid: director.uid,
    actorName: director.name,
    createdAt: updatedAt,
  });
  try {
    await batch.commit();
  } catch (error) {
    await auth
      .updateUser(uid, {
        email: previousAuth.email,
        displayName: previousAuth.displayName,
      })
      .catch((rollbackError) =>
        logger.error("Could not roll back account Auth update", rollbackError),
      );
    logger.error("Could not save managed account profile", error);
    throw new HttpsError("internal", "No pudimos guardar el perfil actualizado.");
  }
  return {
    account: serializeManagedAccount(uid, {
      ...target.data,
      ...nextData,
      createdAt: target.data.createdAt,
    }),
  };
});

export const setManagedAccountActive = onCall(async (request) => {
  const director = await requireAccountDirector(request.auth);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const uid = accountUid(input.uid);
  if (typeof input.active !== "boolean") {
    throw new HttpsError("invalid-argument", "El estado solicitado no es válido.");
  }
  const active = input.active;
  const target = await managedAccountTarget(uid, director.institutionId);
  const auth = getAuth();
  const previousUser = await auth.getUser(uid).catch(accountAuthError);
  await auth.updateUser(uid, { disabled: !active }).catch(accountAuthError);
  const updatedAt = FieldValue.serverTimestamp();
  const auditReference = db
    .collection(`institutions/${director.institutionId}/accountAudit`)
    .doc();
  const batch = db.batch();
  batch.update(target.reference, {
    active,
    updatedAt,
    updatedBy: director.uid,
  });
  batch.set(auditReference, {
    action: active ? "activated" : "deactivated",
    targetUid: uid,
    targetRole: String(target.data.role),
    actorUid: director.uid,
    actorName: director.name,
    createdAt: updatedAt,
  });
  try {
    await batch.commit();
  } catch (error) {
    await auth
      .updateUser(uid, { disabled: previousUser.disabled })
      .catch((rollbackError) =>
        logger.error("Could not roll back account disabled state", rollbackError),
      );
    logger.error("Could not save managed account state", error);
    throw new HttpsError("internal", "No pudimos guardar el estado de la cuenta.");
  }
  if (!active) await auth.revokeRefreshTokens(uid).catch(() => undefined);
  return {
    account: serializeManagedAccount(uid, { ...target.data, active }),
  };
});

export const deleteManagedAccount = onCall(async (request) => {
  const director = await requireAccountDirector(request.auth);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const uid = accountUid(input.uid);
  const target = await managedAccountTarget(uid, director.institutionId);
  try {
    await getAuth().deleteUser(uid);
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? String(error.code)
        : "";
    if (code !== "auth/user-not-found") accountAuthError(error);
  }
  if (target.data.role === "teacher") {
    const assignedStudents = await db
      .collection("users")
      .where("teacherIds", "array-contains", uid)
      .get();
    const writer = db.bulkWriter();
    assignedStudents.docs
      .filter((student) => student.data().institutionId === director.institutionId)
      .forEach((student) => {
        writer.update(student.ref, {
          teacherIds: FieldValue.arrayRemove(uid),
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: director.uid,
        });
      });
    await writer.close();
  }
  await db.recursiveDelete(target.reference);
  await db
    .collection(`institutions/${director.institutionId}/accountAudit`)
    .add({
      action: "deleted",
      targetUid: uid,
      targetRole: String(target.data.role),
      targetName: String(target.data.name ?? "Cuenta CEHF"),
      actorUid: director.uid,
      actorName: director.name,
      createdAt: FieldValue.serverTimestamp(),
    });
  const bucket = (await import("firebase-admin/storage")).getStorage().bucket();
  await bucket
    .deleteFiles({ prefix: `institutions/${director.institutionId}/profiles/${uid}/` })
    .catch((error) => logger.warn("Could not delete profile photos", { uid, error }));
  return { uid };
});

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

function notificationRecipients(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.map(String).filter(Boolean))]
    : [];
}

export const onWorkshopAccessChanged = onDocumentWritten(
  { document: WORKSHOP_PATH },
  async (event) => {
    const afterSnapshot = event.data?.after;
    if (!afterSnapshot?.exists) return;
    const before = event.data?.before.exists ? event.data.before.data() : null;
    const after = afterSnapshot.data();
    if (!after) return;
    const beforeMembers = new Set(notificationRecipients(before?.memberIds));
    const beforeManagers = new Set(notificationRecipients(before?.managerIds));
    const nextMembers = notificationRecipients(after.memberIds);
    const nextManagers = notificationRecipients(after.managerIds);
    const newManagers = nextManagers.filter((userId) => !beforeManagers.has(userId));
    const managerSet = new Set(newManagers);
    const newParticipants = nextMembers.filter(
      (userId) => !beforeMembers.has(userId) && !managerSet.has(userId),
    );
    const workshopId = String(event.params.workshopId);
    const workshopTitle = String(after.title ?? "Talleres");

    if (newParticipants.length) {
      await writeNotifications(
        newParticipants,
        `workshop-access-${workshopId}-${event.id}`,
        {
          category: "workshop",
          title: `Ya tienes acceso a ${workshopTitle}`,
          detail: "Entra para descubrir las actividades y recursos disponibles.",
          workshopId,
          url: `/workshops/${encodeURIComponent(workshopId)}`,
          eventType: "workshop_access_granted",
        },
      );
    }

    if (newManagers.length) {
      await writeNotifications(
        newManagers,
        `workshop-manager-${workshopId}-${event.id}`,
        {
          category: "workshop",
          title: `Ahora administras ${workshopTitle}`,
          detail: "Ya puedes subir y retirar recursos de este taller.",
          workshopId,
          url: `/workshops/${encodeURIComponent(workshopId)}`,
          eventType: "workshop_manager_granted",
        },
      );
    }
  },
);

export const onWorkshopResourceCreated = onDocumentCreated(
  { document: WORKSHOP_RESOURCE_PATH },
  async (event) => {
    const resource = event.data?.data();
    if (!resource) return;
    const workshopReference = event.data?.ref.parent.parent;
    if (!workshopReference) return;
    const workshopSnapshot = await workshopReference.get();
    if (!workshopSnapshot.exists) return;
    const workshop = workshopSnapshot.data();
    const uploadedBy = String(resource.uploadedBy ?? "");
    const recipients = notificationRecipients(workshop?.memberIds).filter(
      (userId) => userId !== uploadedBy,
    );
    if (!recipients.length) return;
    const workshopId = String(event.params.workshopId);
    await writeNotifications(
      recipients,
      `workshop-resource-${event.params.resourceId}`,
      {
        category: "workshop",
        title: `Nuevo recurso en ${String(workshop?.title ?? "Talleres")}`,
        detail: String(resource.title ?? resource.fileName ?? "Material disponible"),
        workshopId,
        resourceId: event.params.resourceId,
        url: `/workshops/${encodeURIComponent(workshopId)}`,
        eventType: "workshop_resource_created",
      },
    );
  },
);

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

type ForumRole = "director" | "teacher" | "student";

type ForumUser = {
  uid: string;
  institutionId: string;
  name: string;
  initials: string;
  role: ForumRole;
  grade: string;
  group: string;
};

const FORUM_TOPIC_KINDS = [
  "weekly_question",
  "subject",
  "reading_club",
  "task_help",
  "group_chat",
  "wall",
  "announcement",
] as const;

const FORUM_TOPIC_STATUSES = ["open", "scheduled", "closed", "archived"] as const;
const FORUM_REACTIONS = ["helpful", "interesting", "celebrate"] as const;

function forumId(value: unknown, label: string) {
  const normalized = String(value ?? "").trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(normalized)) {
    throw new HttpsError("invalid-argument", `${label} no es válido.`);
  }
  return normalized;
}

function forumText(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
) {
  const normalized = String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new HttpsError(
      "invalid-argument",
      `${label} debe tener entre ${minimum} y ${maximum} caracteres.`,
    );
  }
  return normalized;
}

function forumOptionalText(value: unknown, maximum: number) {
  const normalized = String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length > maximum) {
    throw new HttpsError(
      "invalid-argument",
      `El texto puede tener hasta ${maximum} caracteres.`,
    );
  }
  return normalized;
}

function forumTimestamp(value: unknown, label: string, required: boolean) {
  const normalized = String(value ?? "").trim();
  if (!normalized && !required) return null;
  const milliseconds = Date.parse(normalized);
  if (!Number.isFinite(milliseconds)) {
    throw new HttpsError("invalid-argument", `${label} no es una fecha válida.`);
  }
  return Timestamp.fromMillis(milliseconds);
}

async function requireForumUser(
  auth: CallableRequest<unknown>["auth"],
  allowBanned = false,
): Promise<ForumUser> {
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
  if (!allowBanned) {
    const banSnapshot = await db.doc(`forumBans/${institutionId}/users/${auth.uid}`).get();
    if (banSnapshot.exists && banSnapshot.data()?.active === true) {
      throw new HttpsError(
        "permission-denied",
        "Tu participación en el foro está suspendida. Puedes seguir consultando los temas.",
      );
    }
  }
  return {
    uid: auth.uid,
    institutionId,
    name: String(profile?.name ?? "Integrante CEHF"),
    initials: String(profile?.initials ?? "CE"),
    role: role as ForumRole,
    grade: String(profile?.grade ?? ""),
    group: String(profile?.group ?? ""),
  };
}

function requireForumStaff(user: ForumUser) {
  if (user.role !== "teacher" && user.role !== "director") {
    throw new HttpsError(
      "permission-denied",
      "Sólo maestros y Dirección pueden realizar esta acción.",
    );
  }
}

function canManageForumTopic(user: ForumUser, topic: DocumentData) {
  return (
    user.role === "director" ||
    (user.role === "teacher" && topic.creatorId === user.uid)
  );
}

function canParticipateInForumEntity(user: ForumUser, data: DocumentData) {
  return (
    user.role === "director" ||
    user.role === "teacher" ||
    (Array.isArray(data.participantIds) && data.participantIds.includes(user.uid))
  );
}

function forumGroupMatches(profile: DocumentData, targetGroup: string) {
  if (targetGroup === "Todo el campus") return true;
  if (profile.role !== "student") return false;
  const exactGroup = `${String(profile.grade ?? "")} ${String(profile.group ?? "")}`.trim();
  if (exactGroup === targetGroup) return true;
  const range = /^(\d)\.º[–-](\d)\.º$/.exec(targetGroup);
  const grade = Number.parseInt(String(profile.grade ?? ""), 10);
  return Boolean(range && grade >= Number(range[1]) && grade <= Number(range[2]));
}

async function forumAudience(institutionId: string, targetGroup: string) {
  const snapshot = await db
    .collection("users")
    .where("institutionId", "==", institutionId)
    .get();
  return snapshot.docs
    .filter((entry) => {
      const profile = entry.data();
      return profile.active === true && forumGroupMatches(profile, targetGroup);
    })
    .map((entry) => {
      const profile = entry.data();
      return {
        uid: entry.id,
        name: String(profile.name ?? "Integrante CEHF"),
        initials: String(profile.initials ?? "CE"),
      };
    });
}

function forumTopicStatus(value: unknown) {
  const status = String(value ?? "");
  if (!FORUM_TOPIC_STATUSES.includes(status as typeof FORUM_TOPIC_STATUSES[number])) {
    throw new HttpsError("invalid-argument", "Selecciona un estado válido.");
  }
  return status as typeof FORUM_TOPIC_STATUSES[number];
}

function forumTopicKind(value: unknown) {
  const kind = String(value ?? "");
  if (!FORUM_TOPIC_KINDS.includes(kind as typeof FORUM_TOPIC_KINDS[number])) {
    throw new HttpsError("invalid-argument", "Selecciona un tipo de foro válido.");
  }
  return kind as typeof FORUM_TOPIC_KINDS[number];
}

function forumDates(
  status: typeof FORUM_TOPIC_STATUSES[number],
  opensValue: unknown,
  closesValue: unknown,
) {
  const requestedOpening =
    status === "scheduled"
      ? forumTimestamp(opensValue, "La apertura", true)
      : forumTimestamp(opensValue, "La apertura", false);
  const opensAt = requestedOpening ?? Timestamp.now();
  const closesAt = forumTimestamp(closesValue, "El cierre", false);
  if (status === "scheduled" && opensAt.toMillis() <= Date.now()) {
    throw new HttpsError(
      "invalid-argument",
      "La apertura programada debe estar en el futuro.",
    );
  }
  if (closesAt && closesAt.toMillis() <= opensAt.toMillis()) {
    throw new HttpsError(
      "invalid-argument",
      "El cierre debe ocurrir después de la apertura.",
    );
  }
  return { opensAt, closesAt };
}

async function writeForumAudit(
  action: string,
  entityType: "forumTopic" | "forumPost" | "forumBan",
  entityId: string,
  actor: ForumUser,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  await db.collection("auditEvents").add({
    entityType,
    entityId,
    institutionId: actor.institutionId,
    action,
    actorId: actor.uid,
    actorName: actor.name,
    actorRole: actor.role,
    before,
    after,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export const createForumTopic = onCall(async (request) => {
  const creator = await requireForumUser(request.auth);
  requireForumStaff(creator);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const title = forumText(input.title, "El título", 3, 140);
  const prompt = forumText(input.prompt, "La consigna", 8, 2_000);
  const subject = forumText(input.subject, "La materia", 2, 80);
  const targetGroup = forumText(input.group, "El grupo", 2, 80);
  const forumName = forumText(input.forumName, "El espacio", 2, 100);
  const kind = forumTopicKind(input.kind);
  const status = forumTopicStatus(input.status);
  const { opensAt, closesAt } = forumDates(status, input.opensAt, input.closesAt);
  if (typeof input.allowReplies !== "boolean" || typeof input.allowAttachments !== "boolean") {
    throw new HttpsError("invalid-argument", "Revisa las reglas de participación.");
  }
  const audience = await forumAudience(creator.institutionId, targetGroup);
  const participants = [...audience];
  if (!participants.some((participant) => participant.uid === creator.uid)) {
    participants.unshift({
      uid: creator.uid,
      name: creator.name,
      initials: creator.initials,
    });
  }
  const reference = db.collection("forumTopics").doc();
  const now = Timestamp.now();
  const topic = {
    institutionId: creator.institutionId,
    forumId: `space-${subject.toLocaleLowerCase("es-MX").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${targetGroup.toLocaleLowerCase("es-MX").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
    forumName,
    title,
    prompt,
    kind,
    subject,
    targetGroup,
    creatorId: creator.uid,
    creatorName: creator.name,
    creatorRole: creator.role,
    participants,
    participantIds: participants.map((participant) => participant.uid),
    opensAt,
    closesAt,
    status,
    allowReplies: input.allowReplies,
    allowAttachments: input.allowAttachments,
    pinned: false,
    replyCount: 0,
    createdAt: now,
    updatedAt: now,
    lastActivityAt: now,
  };
  const batch = db.batch();
  batch.create(reference, topic);
  batch.create(db.collection("auditEvents").doc(), {
    entityType: "forumTopic",
    entityId: reference.id,
    institutionId: creator.institutionId,
    action: "forum.topic.created",
    actorId: creator.uid,
    actorName: creator.name,
    actorRole: creator.role,
    after: { title, targetGroup, status, allowReplies: input.allowReplies, allowAttachments: input.allowAttachments },
    createdAt: now,
  });
  await batch.commit();
  await writeNotifications(
    audience.map((participant) => participant.uid),
    `forum-topic-${reference.id}`,
    {
      category: "forum",
      title: status === "scheduled" ? `Nuevo tema programado: ${title}` : `Nuevo tema: ${title}`,
      detail: `${forumName} · ${targetGroup}`,
      topicId: reference.id,
      url: `/forum/${encodeURIComponent(String(topic.forumId))}/${reference.id}`,
      eventType: "forum_topic_created",
    },
  );
  logger.info("Forum topic created", {
    topicId: reference.id,
    institutionId: creator.institutionId,
    targetGroup,
    recipients: audience.length,
  });
  return { topicId: reference.id };
});

export const updateForumTopic = onCall(async (request) => {
  const actor = await requireForumUser(request.auth);
  requireForumStaff(actor);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const topicId = forumId(input.topicId, "El tema");
  const values = (input.values ?? {}) as Record<string, unknown>;
  const reference = db.doc(`forumTopics/${topicId}`);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const previous = snapshot.data();
    if (!snapshot.exists || previous?.institutionId !== actor.institutionId || previous.deletedAt) {
      throw new HttpsError("not-found", "El tema ya no está disponible.");
    }
    if (!canManageForumTopic(actor, previous)) {
      throw new HttpsError(
        "permission-denied",
        "Sólo puedes administrar los temas creados por ti. Dirección puede administrar todos.",
      );
    }
    const status = forumTopicStatus(values.status);
    const { opensAt, closesAt } = forumDates(status, values.opensAt, values.closesAt);
    if (typeof values.allowReplies !== "boolean" || typeof values.allowAttachments !== "boolean") {
      throw new HttpsError("invalid-argument", "Revisa las reglas de participación.");
    }
    const next = {
      title: forumText(values.title, "El título", 3, 140),
      prompt: forumText(values.prompt, "La consigna", 8, 2_000),
      status,
      opensAt,
      closesAt,
      allowReplies: values.allowReplies,
      allowAttachments: values.allowAttachments,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
    };
    transaction.update(reference, next);
    transaction.create(db.collection("auditEvents").doc(), {
      entityType: "forumTopic",
      entityId: topicId,
      institutionId: actor.institutionId,
      action: status === "closed" ? "forum.topic.closed" : "forum.topic.updated",
      actorId: actor.uid,
      actorName: actor.name,
      actorRole: actor.role,
      before: {
        title: previous.title,
        status: previous.status,
        allowReplies: previous.allowReplies,
        allowAttachments: previous.allowAttachments,
      },
      after: next,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  return { ok: true as const };
});

export const deleteForumTopic = onCall(async (request) => {
  const actor = await requireForumUser(request.auth);
  requireForumStaff(actor);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const topicId = forumId(input.topicId, "El tema");
  const reference = db.doc(`forumTopics/${topicId}`);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const previous = snapshot.data();
    if (!snapshot.exists || previous?.institutionId !== actor.institutionId || previous.deletedAt) {
      throw new HttpsError("not-found", "El tema ya no está disponible.");
    }
    if (!canManageForumTopic(actor, previous)) {
      throw new HttpsError(
        "permission-denied",
        "Sólo puedes eliminar tus propios temas. Dirección puede eliminar cualquiera.",
      );
    }
    transaction.update(reference, {
      status: "archived",
      deletedAt: FieldValue.serverTimestamp(),
      deletedBy: actor.uid,
      deletedByName: actor.name,
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(db.collection("auditEvents").doc(), {
      entityType: "forumTopic",
      entityId: topicId,
      institutionId: actor.institutionId,
      action: "forum.topic.deleted",
      actorId: actor.uid,
      actorName: actor.name,
      actorRole: actor.role,
      before: { title: previous.title, status: previous.status },
      after: { status: "archived", deleted: true },
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  return { ok: true as const };
});

function forumAttachment(
  value: unknown,
  actor: ForumUser,
  topicId: string,
  postId: string,
) {
  if (!value || typeof value !== "object") return null;
  const attachment = value as Record<string, unknown>;
  const storagePath = String(attachment.storagePath ?? "");
  const contentType = String(attachment.contentType ?? "");
  const size = Number(attachment.size ?? 0);
  const prefix = `institutions/${actor.institutionId}/forum/${topicId}/${postId}/`;
  if (
    !storagePath.startsWith(prefix) ||
    storagePath.length > 600 ||
    !(contentType.startsWith("image/") || contentType === "application/pdf") ||
    !Number.isFinite(size) ||
    size <= 0 ||
    size > 5_000_000
  ) {
    throw new HttpsError("invalid-argument", "El archivo adjunto no es válido.");
  }
  return {
    id: forumId(attachment.id ?? postId, "El adjunto"),
    name: forumText(attachment.name, "El nombre del archivo", 1, 160),
    storagePath,
    contentType,
    size,
  };
}

async function validForumMentions(
  values: unknown,
  body: string,
  institutionId: string,
) {
  if (!Array.isArray(values)) return [];
  const ids = [...new Set(values.map((value) => forumId(value, "La mención")))].slice(0, 12);
  if (!ids.length) return [];
  const snapshots = await db.getAll(...ids.map((id) => db.doc(`users/${id}`)));
  const normalizedBody = body.toLocaleLowerCase("es-MX");
  return snapshots
    .filter((snapshot) => {
      const profile = snapshot.data();
      const name = String(profile?.name ?? "").toLocaleLowerCase("es-MX");
      return (
        snapshot.exists &&
        profile?.active === true &&
        profile.institutionId === institutionId &&
        Boolean(name) &&
        normalizedBody.includes(`@${name}`)
      );
    })
    .map((snapshot) => snapshot.id);
}

export const createForumPost = onCall(async (request) => {
  const actor = await requireForumUser(request.auth);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const postId = forumId(input.postId, "La publicación");
  const topicId = forumId(input.topicId, "El tema");
  const body = forumText(input.body, "La aportación", 1, 600);
  const parentId = input.parentId ? forumId(input.parentId, "La respuesta") : "";
  const attachment = forumAttachment(input.attachment, actor, topicId, postId);
  let mentionedUserIds = await validForumMentions(
    input.mentionedUserIds,
    body,
    actor.institutionId,
  );
  const topicReference = db.doc(`forumTopics/${topicId}`);
  const postReference = db.doc(`forumPosts/${postId}`);
  let parentAuthorId = "";
  let topicTitle = "Tema del foro";
  let forumName = "Foro CEHF";
  await db.runTransaction(async (transaction) => {
    const topicSnapshot = await transaction.get(topicReference);
    const topic = topicSnapshot.data();
    if (!topicSnapshot.exists || topic?.institutionId !== actor.institutionId || topic.deletedAt) {
      throw new HttpsError("not-found", "El tema ya no está disponible.");
    }
    if (!canParticipateInForumEntity(actor, topic)) {
      throw new HttpsError(
        "permission-denied",
        "Este tema pertenece a otro grupo.",
      );
    }
    const participantIds = Array.isArray(topic.participantIds)
      ? topic.participantIds.map(String)
      : [];
    mentionedUserIds = mentionedUserIds.filter((userId) =>
      participantIds.includes(userId),
    );
    if (topic.status !== "open" || topic.allowReplies !== true) {
      throw new HttpsError("failed-precondition", "Este tema no acepta respuestas.");
    }
    if (topic.closesAt instanceof Timestamp && topic.closesAt.toMillis() <= Date.now()) {
      throw new HttpsError("failed-precondition", "El periodo de participación terminó.");
    }
    if (attachment && topic.allowAttachments !== true) {
      throw new HttpsError("failed-precondition", "Este tema no permite archivos adjuntos.");
    }
    if (parentId) {
      const parentSnapshot = await transaction.get(db.doc(`forumPosts/${parentId}`));
      const parent = parentSnapshot.data();
      if (
        !parentSnapshot.exists ||
        parent?.institutionId !== actor.institutionId ||
        parent.topicId !== topicId ||
        parent.status !== "visible"
      ) {
        throw new HttpsError("not-found", "El comentario al que respondes ya no está disponible.");
      }
      parentAuthorId = String(parent.authorId ?? "");
    }
    const existing = await transaction.get(postReference);
    if (existing.exists) {
      throw new HttpsError("already-exists", "La aportación ya fue publicada.");
    }
    const now = Timestamp.now();
    transaction.create(postReference, {
      institutionId: actor.institutionId,
      topicId,
      participantIds,
      authorId: actor.uid,
      authorName: actor.name,
      authorInitials: actor.initials,
      authorRole: actor.role,
      body,
      parentId: parentId || null,
      mentionedUserIds,
      attachment,
      status: "visible",
      markedAnswer: false,
      reactionUsers: { helpful: [], interesting: [], celebrate: [] },
      reportedByIds: [],
      reportCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    transaction.update(topicReference, {
      replyCount: FieldValue.increment(1),
      updatedAt: now,
      lastActivityAt: now,
    });
    topicTitle = String(topic.title ?? topicTitle);
    forumName = String(topic.forumName ?? forumName);
  });
  if (parentAuthorId && parentAuthorId !== actor.uid) {
    await writeNotifications([parentAuthorId], `forum-reply-${postId}`, {
      category: "forum",
      title: `${actor.name} respondió a tu comentario`,
      detail: `${topicTitle} · ${body.slice(0, 120)}`,
      topicId,
      postId,
      url: `/forum/topic/${topicId}`,
      eventType: "forum_reply",
    });
  }
  const mentionRecipients = mentionedUserIds.filter(
    (userId) => userId !== actor.uid && userId !== parentAuthorId,
  );
  if (mentionRecipients.length) {
    await writeNotifications(mentionRecipients, `forum-mention-${postId}`, {
      category: "forum",
      title: `${actor.name} te mencionó en el foro`,
      detail: `${forumName} · ${body.slice(0, 120)}`,
      topicId,
      postId,
      url: `/forum/topic/${topicId}`,
      eventType: "forum_mention",
    });
  }
  return { postId };
});

export const reactToForumPost = onCall(async (request) => {
  const actor = await requireForumUser(request.auth);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const postId = forumId(input.postId, "La publicación");
  const reaction = String(input.reaction ?? "");
  if (!FORUM_REACTIONS.includes(reaction as typeof FORUM_REACTIONS[number])) {
    throw new HttpsError("invalid-argument", "Selecciona una reacción válida.");
  }
  const reference = db.doc(`forumPosts/${postId}`);
  const active = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const post = snapshot.data();
    if (
      !snapshot.exists ||
      post?.institutionId !== actor.institutionId ||
      post.status !== "visible" ||
      !canParticipateInForumEntity(actor, post)
    ) {
      throw new HttpsError("not-found", "La publicación ya no está disponible.");
    }
    const reactionUsers = (post.reactionUsers ?? {}) as Record<string, unknown>;
    const users = Array.isArray(reactionUsers[reaction])
      ? reactionUsers[reaction].map(String)
      : [];
    const nextActive = !users.includes(actor.uid);
    transaction.update(reference, {
      [`reactionUsers.${reaction}`]: nextActive
        ? FieldValue.arrayUnion(actor.uid)
        : FieldValue.arrayRemove(actor.uid),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return nextActive;
  });
  return { active };
});

export const reportForumPost = onCall(async (request) => {
  const actor = await requireForumUser(request.auth);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const postId = forumId(input.postId, "La publicación");
  const reason = forumText(input.reason, "El motivo", 5, 240);
  const postReference = db.doc(`forumPosts/${postId}`);
  const caseReference = db.doc(`forumModeration/post-${postId}`);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(postReference);
    const post = snapshot.data();
    if (
      !snapshot.exists ||
      post?.institutionId !== actor.institutionId ||
      post.status !== "visible" ||
      !canParticipateInForumEntity(actor, post)
    ) {
      throw new HttpsError("not-found", "La publicación ya no está disponible.");
    }
    if (post.authorId === actor.uid) {
      throw new HttpsError("failed-precondition", "No puedes reportar tu propia aportación.");
    }
    const reporters = Array.isArray(post.reportedByIds)
      ? post.reportedByIds.map(String)
      : [];
    if (reporters.includes(actor.uid)) return;
    const caseSnapshot = await transaction.get(caseReference);
    const moderationCase = caseSnapshot.data();
    transaction.update(postReference, {
      reportedByIds: FieldValue.arrayUnion(actor.uid),
      reportCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(
      caseReference,
      {
        institutionId: actor.institutionId,
        topicId: String(post.topicId ?? ""),
        postId,
        authorId: String(post.authorId ?? ""),
        authorName: String(post.authorName ?? "Integrante CEHF"),
        excerpt: String(post.body ?? "").slice(0, 180),
        reason: moderationCase?.reason ?? reason,
        status: moderationCase?.status === "hidden" ? "hidden" : "open",
        reporterIds: FieldValue.arrayUnion(actor.uid),
        reportCount: FieldValue.increment(1),
        createdAt: moderationCase?.createdAt ?? FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });
  return { ok: true as const };
});

export const moderateForumPost = onCall(async (request) => {
  const actor = await requireForumUser(request.auth);
  requireForumStaff(actor);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const postId = forumId(input.postId, "La publicación");
  const action = String(input.action ?? "");
  if (!["hidden", "dismissed", "restored"].includes(action)) {
    throw new HttpsError("invalid-argument", "Selecciona una acción de moderación válida.");
  }
  const postReference = db.doc(`forumPosts/${postId}`);
  const caseReference = db.doc(`forumModeration/post-${postId}`);
  await db.runTransaction(async (transaction) => {
    const [postSnapshot, caseSnapshot] = await Promise.all([
      transaction.get(postReference),
      transaction.get(caseReference),
    ]);
    const post = postSnapshot.data();
    const moderationCase = caseSnapshot.data();
    if (!postSnapshot.exists || post?.institutionId !== actor.institutionId) {
      throw new HttpsError("not-found", "La publicación ya no está disponible.");
    }
    if (action === "restored" && !moderationCase?.originalBody) {
      throw new HttpsError("failed-precondition", "No existe evidencia para restaurar.");
    }
    const now = FieldValue.serverTimestamp();
    if (action === "hidden") {
      transaction.update(postReference, {
        body: "",
        attachment: null,
        status: "hidden",
        hiddenAt: now,
        hiddenBy: actor.uid,
        updatedAt: now,
      });
    } else if (action === "restored") {
      transaction.update(postReference, {
        body: String(moderationCase?.originalBody ?? ""),
        attachment: moderationCase?.originalAttachment ?? null,
        status: "visible",
        restoredAt: now,
        restoredBy: actor.uid,
        updatedAt: now,
      });
    }
    transaction.set(
      caseReference,
      {
        institutionId: actor.institutionId,
        topicId: String(post.topicId ?? ""),
        postId,
        authorId: String(post.authorId ?? ""),
        authorName: String(post.authorName ?? "Integrante CEHF"),
        excerpt: String(moderationCase?.excerpt ?? post.body ?? "").slice(0, 180),
        reason: String(moderationCase?.reason ?? "Acción directa de moderación"),
        status: action,
        originalBody: String(moderationCase?.originalBody ?? post.body ?? ""),
        originalAttachment: moderationCase?.originalAttachment ?? post.attachment ?? null,
        reportCount: Number(moderationCase?.reportCount ?? post.reportCount ?? 0),
        createdAt: moderationCase?.createdAt ?? now,
        resolvedById: actor.uid,
        resolvedByName: actor.name,
        resolvedAt: now,
        updatedAt: now,
      },
      { merge: true },
    );
    transaction.create(db.collection("auditEvents").doc(), {
      entityType: "forumPost",
      entityId: postId,
      institutionId: actor.institutionId,
      action: `forum.post.${action}`,
      actorId: actor.uid,
      actorName: actor.name,
      actorRole: actor.role,
      before: { status: post.status },
      after: { status: action },
      createdAt: now,
    });
  });
  return { ok: true as const };
});

export const setForumPostMarked = onCall(async (request) => {
  const actor = await requireForumUser(request.auth);
  requireForumStaff(actor);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const postId = forumId(input.postId, "La publicación");
  if (typeof input.marked !== "boolean") {
    throw new HttpsError("invalid-argument", "La marca solicitada no es válida.");
  }
  const reference = db.doc(`forumPosts/${postId}`);
  const snapshot = await reference.get();
  const post = snapshot.data();
  if (!snapshot.exists || post?.institutionId !== actor.institutionId || post.status !== "visible") {
    throw new HttpsError("not-found", "La publicación ya no está disponible.");
  }
  await reference.update({
    markedAnswer: input.marked,
    markedBy: actor.uid,
    markedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { ok: true as const };
});

export const setForumUserBan = onCall(async (request) => {
  const director = await requireForumUser(request.auth, true);
  if (director.role !== "director") {
    throw new HttpsError("permission-denied", "Sólo Dirección puede suspender participantes.");
  }
  const input = (request.data ?? {}) as Record<string, unknown>;
  const userId = forumId(input.userId, "El participante");
  if (typeof input.active !== "boolean") {
    throw new HttpsError("invalid-argument", "El estado solicitado no es válido.");
  }
  const targetSnapshot = await db.doc(`users/${userId}`).get();
  const target = targetSnapshot.data();
  if (
    !targetSnapshot.exists ||
    target?.institutionId !== director.institutionId ||
    target.role === "director"
  ) {
    throw new HttpsError("not-found", "El participante no está disponible.");
  }
  const reason = input.active
    ? forumText(input.reason, "El motivo", 5, 240)
    : forumOptionalText(input.reason, 240);
  const reference = db.doc(`forumBans/${director.institutionId}/users/${userId}`);
  const previous = await reference.get();
  const now = FieldValue.serverTimestamp();
  await reference.set(
    {
      institutionId: director.institutionId,
      userId,
      userName: String(target.name ?? "Integrante CEHF"),
      active: input.active,
      reason: input.active ? reason : String(previous.data()?.reason ?? reason),
      ...(input.active
        ? {
            bannedById: director.uid,
            bannedByName: director.name,
            bannedAt: now,
            restoredById: null,
            restoredByName: null,
            restoredAt: null,
          }
        : {
            restoredById: director.uid,
            restoredByName: director.name,
            restoredAt: now,
          }),
      updatedAt: now,
    },
    { merge: true },
  );
  await writeForumAudit(
    input.active ? "forum.user.banned" : "forum.user.restored",
    "forumBan",
    userId,
    director,
    { active: previous.data()?.active === true },
    { active: input.active, reason },
  );
  return { ok: true as const };
});

export const syncScheduledForumTopics = onSchedule(
  {
    schedule: "every 1 minutes",
    timeZone: ACADEMIC_TIMEZONE,
    retryCount: 3,
  },
  async () => {
    const now = Timestamp.now();
    const [opening, closing] = await Promise.all([
      db
        .collection("forumTopics")
        .where("status", "==", "scheduled")
        .where("opensAt", "<=", now)
        .limit(200)
        .get(),
      db
        .collection("forumTopics")
        .where("status", "==", "open")
        .where("closesAt", "<=", now)
        .limit(200)
        .get(),
    ]);
    const batch = db.batch();
    opening.docs
      .filter((snapshot) => !snapshot.data().deletedAt)
      .forEach((snapshot) => {
        batch.update(snapshot.ref, {
          status: "open",
          openedAt: now,
          updatedAt: now,
          lastActivityAt: now,
        });
      });
    closing.docs
      .filter((snapshot) => !snapshot.data().deletedAt)
      .forEach((snapshot) => {
        batch.update(snapshot.ref, {
          status: "closed",
          closedAt: now,
          updatedAt: now,
        });
      });
    if (opening.size || closing.size) await batch.commit();
    logger.info("Scheduled forum topics synchronized", {
      opened: opening.size,
      closed: closing.size,
    });
  },
);
