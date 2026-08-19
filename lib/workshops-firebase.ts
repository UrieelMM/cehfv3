"use client";

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";
import { firebase } from "./firebase";
import type {
  UserProfile,
  Workshop,
  WorkshopAccessInput,
  WorkshopKind,
  WorkshopResource,
} from "./types";

export const workshopDefinitions: Array<{
  id: string;
  kind: WorkshopKind;
  title: string;
  shortTitle: string;
  description: string;
}> = [
  {
    id: "tics",
    kind: "tics",
    title: "TICS",
    shortTitle: "Tecnologías de la información",
    description:
      "Explora programación, ciudadanía digital y herramientas para crear soluciones.",
  },
  {
    id: "club-lectura",
    kind: "reading",
    title: "Club de lectura",
    shortTitle: "Historias para compartir",
    description:
      "Una biblioteca viva para leer, conversar y descubrir nuevos mundos.",
  },
];

const demoResourceDate = "2026-08-18T15:00:00.000Z";

export const demoWorkshops: Workshop[] = [
  {
    ...workshopDefinitions[0],
    institutionId: "cehf-primaria",
    studentIds: ["demo-student", "demo-student-sofia", "demo-student-diego"],
    teacherIds: ["demo-teacher", "demo-teacher-mariana"],
    managerIds: ["demo-teacher", "demo-teacher-mariana"],
    memberIds: [
      "demo-student",
      "demo-student-sofia",
      "demo-student-diego",
      "demo-teacher",
      "demo-teacher-mariana",
    ],
    resources: [
      {
        id: "demo-tics-resource",
        workshopId: "tics",
        institutionId: "cehf-primaria",
        title: "Reto: mi primera animación",
        description: "Guía paso a paso para crear una historia interactiva.",
        fileName: "reto-animacion.pdf",
        storagePath: "",
        contentType: "application/pdf",
        size: 1_420_000,
        uploadedBy: "demo-teacher",
        uploadedByName: "Mariana López",
        createdAt: demoResourceDate,
      },
    ],
    updatedAt: demoResourceDate,
  },
  {
    ...workshopDefinitions[1],
    institutionId: "cehf-primaria",
    studentIds: ["demo-student", "demo-student-sofia", "demo-student-diego"],
    teacherIds: ["demo-teacher", "demo-teacher-mariana"],
    managerIds: ["demo-teacher", "demo-teacher-mariana"],
    memberIds: [
      "demo-student",
      "demo-student-sofia",
      "demo-student-diego",
      "demo-teacher",
      "demo-teacher-mariana",
    ],
    resources: [
      {
        id: "demo-reading-resource",
        workshopId: "club-lectura",
        institutionId: "cehf-primaria",
        title: "Bitácora de lector",
        description: "Preguntas para guardar frases, personajes y nuevas ideas.",
        fileName: "bitacora-de-lector.pdf",
        storagePath: "",
        contentType: "application/pdf",
        size: 860_000,
        uploadedBy: "demo-teacher",
        uploadedByName: "Mariana López",
        createdAt: demoResourceDate,
      },
    ],
    updatedAt: demoResourceDate,
  },
];

function requireFirebase() {
  if (!firebase.db || !firebase.storage) {
    throw new Error("Firebase no está configurado para Talleres.");
  }
  return { db: firebase.db, storage: firebase.storage };
}

function asIso(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    return value.toDate().toISOString();
  }
  return typeof value === "string" && value
    ? value
    : new Date().toISOString();
}

function stringList(value: unknown) {
  return Array.isArray(value) ? [...new Set(value.map(String).filter(Boolean))] : [];
}

function resourceFromSnapshot(
  snapshot: QueryDocumentSnapshot<DocumentData>,
): WorkshopResource {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    workshopId: String(data.workshopId ?? ""),
    institutionId: String(data.institutionId ?? ""),
    title: String(data.title ?? "Recurso del taller"),
    description: String(data.description ?? ""),
    fileName: String(data.fileName ?? "archivo"),
    storagePath: String(data.storagePath ?? ""),
    contentType: String(data.contentType ?? "application/octet-stream"),
    size: Number(data.size ?? 0),
    uploadedBy: String(data.uploadedBy ?? ""),
    uploadedByName: String(data.uploadedByName ?? "Equipo docente"),
    createdAt: asIso(data.createdAt),
  };
}

function workshopFromSnapshot(
  snapshot: QueryDocumentSnapshot<DocumentData>,
): Workshop {
  const data = snapshot.data();
  const definition =
    workshopDefinitions.find((item) => item.id === snapshot.id) ??
    workshopDefinitions[0];
  return {
    id: snapshot.id,
    institutionId: String(data.institutionId ?? ""),
    kind: data.kind === "reading" ? "reading" : "tics",
    title: String(data.title ?? definition.title),
    shortTitle: String(data.shortTitle ?? definition.shortTitle),
    description: String(data.description ?? definition.description),
    studentIds: stringList(data.studentIds),
    teacherIds: stringList(data.teacherIds),
    managerIds: stringList(data.managerIds),
    memberIds: stringList(data.memberIds),
    resources: [],
    updatedAt: asIso(data.updatedAt),
  };
}

function workshopCollection(institutionId: string) {
  if (!firebase.db) throw new Error("Firebase no está configurado.");
  return collection(firebase.db, "institutions", institutionId, "workshops");
}

export async function ensureDefaultWorkshops(profile: UserProfile) {
  if (profile.role !== "director" || !firebase.db) return;
  const references = workshopDefinitions.map((definition) =>
    doc(firebase.db!, "institutions", profile.institutionId, "workshops", definition.id),
  );
  const snapshots = await Promise.all(references.map((reference) => getDoc(reference)));
  const missing = snapshots
    .map((snapshot, index) => ({ snapshot, definition: workshopDefinitions[index] }))
    .filter((item) => !item.snapshot.exists());
  if (!missing.length) return;
  const batch = writeBatch(firebase.db);
  missing.forEach(({ snapshot, definition }) => {
    batch.set(snapshot.ref, {
      ...definition,
      institutionId: profile.institutionId,
      studentIds: [],
      teacherIds: [],
      managerIds: [],
      memberIds: [],
      createdBy: profile.uid,
      createdByName: profile.name,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: profile.uid,
    });
  });
  await batch.commit();
}

export function watchWorkshops(
  profile: UserProfile,
  callback: (workshops: Workshop[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!firebase.db) {
    callback([]);
    return () => undefined;
  }
  const source =
    profile.role === "director"
      ? query(workshopCollection(profile.institutionId))
      : query(
          workshopCollection(profile.institutionId),
          where("memberIds", "array-contains", profile.uid),
        );
  return onSnapshot(
    source,
    (snapshot) =>
      callback(
        snapshot.docs
          .map(workshopFromSnapshot)
          .sort(
            (first, second) =>
              workshopDefinitions.findIndex((item) => item.id === first.id) -
              workshopDefinitions.findIndex((item) => item.id === second.id),
          ),
      ),
    (error) => onError?.(error),
  );
}

export function watchWorkshopResources(
  institutionId: string,
  workshopIds: string[],
  callback: (resources: Record<string, WorkshopResource[]>) => void,
  onError?: (error: Error) => void,
) {
  if (!firebase.db || !workshopIds.length) {
    callback({});
    return () => undefined;
  }
  const resourcesByWorkshop: Record<string, WorkshopResource[]> = {};
  const emit = () => callback({ ...resourcesByWorkshop });
  const unsubscribes = workshopIds.map((workshopId) =>
    onSnapshot(
      collection(
        firebase.db!,
        "institutions",
        institutionId,
        "workshops",
        workshopId,
        "resources",
      ),
      (snapshot) => {
        resourcesByWorkshop[workshopId] = snapshot.docs
          .map(resourceFromSnapshot)
          .sort((first, second) => second.createdAt.localeCompare(first.createdAt));
        emit();
      },
      (error) => onError?.(error),
    ),
  );
  return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
}

export async function updateWorkshopAccess(
  workshop: Workshop,
  access: WorkshopAccessInput,
  profile: UserProfile,
) {
  if (profile.role !== "director") {
    throw new Error("Sólo Dirección puede administrar el acceso a Talleres.");
  }
  const { db } = requireFirebase();
  const studentIds = [...new Set(access.studentIds.filter(Boolean))];
  const teacherIds = [...new Set(access.teacherIds.filter(Boolean))];
  const managerIds = [
    ...new Set(access.managerIds.filter((id) => teacherIds.includes(id))),
  ];
  await updateDoc(
    doc(db, "institutions", profile.institutionId, "workshops", workshop.id),
    {
      studentIds,
      teacherIds,
      managerIds,
      memberIds: [...new Set([...studentIds, ...teacherIds])],
      updatedAt: serverTimestamp(),
      updatedBy: profile.uid,
      updatedByName: profile.name,
    },
  );
}

function safeFileName(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.slice(0, 120) || "recurso";
}

export async function uploadWorkshopResource(
  workshop: Workshop,
  profile: UserProfile,
  input: { title: string; description: string; file: File },
) {
  const { db, storage } = requireFirebase();
  if (input.file.size <= 0 || input.file.size >= 20 * 1024 * 1024) {
    throw new Error("El archivo debe pesar menos de 20 MB.");
  }
  const resourceReference = doc(
    collection(
      db,
      "institutions",
      profile.institutionId,
      "workshops",
      workshop.id,
      "resources",
    ),
  );
  const storagePath = `institutions/${profile.institutionId}/workshops/${workshop.id}/resources/${resourceReference.id}/${safeFileName(input.file.name)}`;
  const storageReference = ref(storage, storagePath);
  await uploadBytes(storageReference, input.file, {
    contentType: input.file.type || "application/octet-stream",
    customMetadata: {
      workshopId: workshop.id,
      uploadedBy: profile.uid,
    },
  });
  try {
    await setDoc(resourceReference, {
      institutionId: profile.institutionId,
      workshopId: workshop.id,
      title: input.title.trim(),
      description: input.description.trim(),
      fileName: input.file.name,
      storagePath,
      contentType: input.file.type || "application/octet-stream",
      size: input.file.size,
      uploadedBy: profile.uid,
      uploadedByName: profile.name,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    await deleteObject(storageReference).catch(() => undefined);
    throw error;
  }
  return resourceReference.id;
}

export async function deleteWorkshopResource(resource: WorkshopResource) {
  const { db, storage } = requireFirebase();
  await deleteDoc(
    doc(
      db,
      "institutions",
      resource.institutionId,
      "workshops",
      resource.workshopId,
      "resources",
      resource.id,
    ),
  );
  if (resource.storagePath) {
    await deleteObject(ref(storage, resource.storagePath)).catch(() => undefined);
  }
}

export async function getWorkshopResourceUrl(resource: WorkshopResource) {
  if (!resource.storagePath) {
    throw new Error("Este recurso pertenece a la demostración.");
  }
  const { storage } = requireFirebase();
  return getDownloadURL(ref(storage, resource.storagePath));
}
