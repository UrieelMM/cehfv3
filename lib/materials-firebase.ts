"use client";

import {
  collection,
  doc,
  getDoc,
  increment,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  type DocumentData,
  type Unsubscribe,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { firebase } from "./firebase";
import type {
  AcademicCalendar,
  AcademicConfig,
  LearningMaterial,
  LearningMaterialAttachment,
  LearningMaterialCreateInput,
  LearningMaterialLink,
  LearningMaterialType,
  LearningMaterialView,
  UserProfile,
} from "./types";

const MAX_MATERIAL_FILE_SIZE = 100 * 1024 * 1024;

function requireFirebase() {
  if (!firebase.db || !firebase.storage || !firebase.functions) {
    throw new Error("Firebase no está configurado para Materiales.");
  }
  return {
    db: firebase.db,
    storage: firebase.storage,
    functions: firebase.functions,
  };
}

function asIso(value: unknown, fallback = new Date().toISOString()) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    return value.toDate().toISOString();
  }
  return typeof value === "string" && value ? value : fallback;
}

function slugify(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "general"
  );
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function materialLink(value: unknown): LearningMaterialLink | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (!data.url) return null;
  return {
    id: String(data.id ?? crypto.randomUUID()),
    label: String(data.label ?? "Enlace"),
    url: String(data.url),
  };
}

function materialAttachment(
  value: unknown,
): LearningMaterialAttachment | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (!data.storagePath || !data.name) return null;
  return {
    id: String(data.id ?? crypto.randomUUID()),
    name: String(data.name),
    storagePath: String(data.storagePath),
    contentType: String(data.contentType ?? "application/octet-stream"),
    size: Number(data.size ?? 0),
  };
}

function materialFromData(
  id: string,
  firestorePath: string,
  data: DocumentData,
): LearningMaterial {
  return {
    id,
    firestorePath,
    institutionId: String(data.institutionId ?? ""),
    schoolYearId: String(data.schoolYearId ?? ""),
    schoolYearLabel: String(data.schoolYearLabel ?? ""),
    termId: String(data.termId ?? ""),
    termLabel: String(data.termLabel ?? ""),
    weekId: String(data.weekId ?? ""),
    weekLabel: String(data.weekLabel ?? "Semana"),
    subjectId: String(data.subjectId ?? slugify(String(data.subject ?? "General"))),
    subject: String(data.subject ?? "General"),
    title: String(data.title ?? "Material sin nombre"),
    description: String(data.description ?? ""),
    type: String(data.type ?? "other") as LearningMaterialType,
    links: Array.isArray(data.links)
      ? data.links.map(materialLink).filter(Boolean) as LearningMaterialLink[]
      : [],
    attachments: Array.isArray(data.attachments)
      ? data.attachments.map(materialAttachment).filter(Boolean) as LearningMaterialAttachment[]
      : [],
    required: data.required === true,
    audienceStudentIds: stringList(data.audienceStudentIds),
    targetGroups: stringList(data.targetGroups),
    managerIds: stringList(data.managerIds),
    createdBy: String(data.createdBy ?? ""),
    createdByName: String(data.createdByName ?? "Campus CEHF"),
    createdByRole: data.createdByRole === "director" ? "director" : "teacher",
    createdAt: asIso(data.createdAt),
    updatedAt: asIso(data.updatedAt),
  };
}

function materialViewFromData(data: DocumentData): LearningMaterialView {
  return {
    studentId: String(data.studentId ?? ""),
    studentName: String(data.studentName ?? "Alumno"),
    firstOpenedAt: asIso(data.firstOpenedAt),
    lastOpenedAt: asIso(data.lastOpenedAt),
    viewCount: Math.max(1, Number(data.viewCount ?? 1)),
  };
}

export function isFirebaseLearningMaterial(material: LearningMaterial) {
  const segments = material.firestorePath.split("/").filter(Boolean);
  return (
    segments.length === 4 &&
    segments[0] === "institutions" &&
    segments[2] === "materials" &&
    segments[3] === material.id
  );
}

export function watchLearningMaterials(
  profile: UserProfile,
  callback: (materials: LearningMaterial[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!firebase.db) {
    callback([]);
    return () => undefined;
  }
  if (profile.role !== "director") {
    if (!firebase.functions) {
      onError?.(new Error("Firebase Functions no está configurado para Materiales."));
      return () => undefined;
    }
    let active = true;
    const callable = httpsCallable<
      Record<string, never>,
      { materials: Array<Record<string, unknown>> }
    >(
      firebase.functions,
      profile.role === "student" ? "listStudentMaterials" : "listStaffMaterials",
    );
    void callable({})
      .then(({ data }) => {
        if (!active) return;
        callback(
          data.materials.map((material) =>
            materialFromData(
              String(material.id ?? ""),
              String(material.firestorePath ?? ""),
              material,
            ),
          ),
        );
      })
      .catch((error: unknown) => {
        if (!active) return;
        onError?.(
          error instanceof Error
            ? error
            : new Error("No pudimos cargar los materiales."),
        );
      });
    return () => {
      active = false;
    };
  }
  const base = collection(
    firebase.db,
    "institutions",
    profile.institutionId,
    "materials",
  );
  return onSnapshot(
    base,
    (snapshot) => {
      callback(
        snapshot.docs
          .map((entry) =>
            materialFromData(entry.id, entry.ref.path, entry.data()),
          )
          .sort((first, second) => second.createdAt.localeCompare(first.createdAt)),
      );
    },
    (error) => onError?.(error),
  );
}

export async function createLearningMaterial(
  input: LearningMaterialCreateInput,
  profile: UserProfile,
  config: AcademicConfig,
  calendar: AcademicCalendar,
) {
  if (profile.role === "student") {
    throw new Error("Los alumnos no pueden publicar materiales.");
  }
  const week = calendar.weeks.find((item) => item.id === input.weekId);
  const term = calendar.terms.find((item) => item.weekIds.includes(input.weekId));
  if (!week || !term) {
    throw new Error("Selecciona una semana configurada dentro de un bimestre.");
  }
  if (!input.links.some((link) => link.url.trim()) && input.files.length === 0) {
    throw new Error("Agrega al menos un enlace o archivo.");
  }
  const oversized = input.files.find((file) => file.size >= MAX_MATERIAL_FILE_SIZE);
  if (oversized) {
    throw new Error(`${oversized.name} supera el límite de 100 MB.`);
  }

  const { storage, functions } = requireFirebase();
  const materialId = crypto.randomUUID();
  const attachments = await Promise.all(
    input.files.map(async (file) => {
      const assetId = crypto.randomUUID();
      const storagePath = [
        "institutions",
        profile.institutionId,
        "materials",
        materialId,
        assetId,
      ].join("/");
      await uploadBytes(ref(storage, storagePath), file, {
        contentType: file.type || "application/octet-stream",
        customMetadata: { originalName: file.name },
      });
      return {
        id: assetId,
        name: file.name,
        storagePath,
        contentType: file.type || "application/octet-stream",
        size: file.size,
      } satisfies LearningMaterialAttachment;
    }),
  );

  const callable = httpsCallable<
    Record<string, unknown>,
    { materialId: string; recipientCount: number }
  >(functions, "createMaterial");
  return (
    await callable({
      materialId,
      institutionId: profile.institutionId,
      schoolYearId: config.schoolYearId,
      schoolYearLabel: config.schoolYearLabel,
      termId: term.id,
      termLabel: term.label,
      weekId: week.id,
      weekLabel: week.label,
      title: input.title.trim(),
      description: input.description.trim(),
      type: input.type,
      subject: input.subject,
      subjectId: slugify(input.subject),
      targetGroups: input.targetGroups,
      required: input.required,
      links: input.links
        .filter((link) => link.url.trim())
        .map((link) => ({
          id: crypto.randomUUID(),
          label: link.label.trim() || "Enlace",
          url: link.url.trim(),
        })),
      attachments,
    })
  ).data;
}

export async function getLearningMaterialAttachmentUrl(
  attachment: LearningMaterialAttachment,
) {
  if (attachment.downloadUrl) return attachment.downloadUrl;
  const { storage } = requireFirebase();
  return getDownloadURL(ref(storage, attachment.storagePath));
}

export async function deleteLearningMaterial(material: LearningMaterial) {
  if (!firebase.functions || !isFirebaseLearningMaterial(material)) {
    throw new Error("Este recurso no se puede eliminar porque no está sincronizado con Firebase.");
  }
  const callable = httpsCallable<{ materialId: string }, { deleted: boolean }>(
    firebase.functions,
    "deleteLearningMaterial",
  );
  return (await callable({ materialId: material.id })).data;
}

export async function updateLearningMaterial(
  material: LearningMaterial,
  input: Pick<LearningMaterial, "title" | "description" | "links" | "required">,
) {
  if (!firebase.functions || !isFirebaseLearningMaterial(material)) {
    throw new Error("Este recurso no se puede editar porque no está sincronizado con Firebase.");
  }
  const callable = httpsCallable<
    { entityType: "material"; materialId: string } & typeof input,
    { updated: boolean }
  >(firebase.functions, "updateManagedContent");
  return (await callable({ entityType: "material", materialId: material.id, ...input })).data;
}

export async function markLearningMaterialViewed(
  material: LearningMaterial,
  profile: UserProfile,
) {
  if (profile.role !== "student" || !isFirebaseLearningMaterial(material)) return;
  const { db } = requireFirebase();
  const viewReference = doc(
    db,
    material.firestorePath,
    "views",
    profile.uid,
  );
  const snapshot = await getDoc(viewReference);
  if (snapshot.exists()) {
    await updateDoc(viewReference, {
      lastOpenedAt: serverTimestamp(),
      viewCount: increment(1),
    });
    return;
  }
  await setDoc(viewReference, {
    institutionId: material.institutionId,
    materialId: material.id,
    studentId: profile.uid,
    studentName: profile.name,
    firstOpenedAt: serverTimestamp(),
    lastOpenedAt: serverTimestamp(),
    viewCount: 1,
  });
}

export function watchLearningMaterialViews(
  material: LearningMaterial,
  callback: (views: LearningMaterialView[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!firebase.db || !isFirebaseLearningMaterial(material)) {
    callback([]);
    return () => undefined;
  }
  return onSnapshot(
    collection(firebase.db, material.firestorePath, "views"),
    (snapshot) =>
      callback(
        snapshot.docs
          .map((entry) => materialViewFromData(entry.data()))
          .sort((first, second) =>
            second.lastOpenedAt.localeCompare(first.lastOpenedAt),
          ),
      ),
    (error) => onError?.(error),
  );
}

export async function loadViewedLearningMaterialIds(
  materials: LearningMaterial[],
  profile: UserProfile,
) {
  if (!firebase.db || profile.role !== "student") return new Set<string>();
  const entries = await Promise.all(
    materials
      .filter(isFirebaseLearningMaterial)
      .map(async (material) => ({
        id: material.id,
        viewed: (
          await getDoc(
            doc(firebase.db!, material.firestorePath, "views", profile.uid),
          )
        ).exists(),
      })),
  );
  return new Set(entries.filter((entry) => entry.viewed).map((entry) => entry.id));
}
