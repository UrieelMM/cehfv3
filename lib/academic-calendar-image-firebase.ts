"use client";

import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type DocumentData,
  type Unsubscribe,
} from "firebase/firestore";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";
import { firebase } from "./firebase";
import type { AcademicCalendarImage, UserProfile } from "./types";

export const ACADEMIC_CALENDAR_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/png",
  "image/webp",
] as const;

export const MAX_ACADEMIC_CALENDAR_IMAGE_SIZE = 10 * 1024 * 1024;

function requireCalendarFirebase() {
  if (!firebase.db || !firebase.storage) {
    throw new Error("Firebase no está configurado para el calendario académico.");
  }
  return { db: firebase.db, storage: firebase.storage };
}

function calendarDocument(institutionId: string) {
  if (!firebase.db) throw new Error("Firestore no está configurado.");
  return doc(
    firebase.db,
    "institutions",
    institutionId,
    "configuracion",
    "calendarioVisual",
  );
}

function dateFromData(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    return value.toDate().toISOString();
  }
  return typeof value === "string" ? value : "";
}

async function calendarImageFromData(
  data: DocumentData,
): Promise<AcademicCalendarImage | null> {
  const imagePath = String(data.imagePath ?? "");
  if (data.published !== true || !imagePath || !firebase.storage) return null;
  const imageUrl = await getDownloadURL(ref(firebase.storage, imagePath));
  return {
    institutionId: String(data.institutionId ?? ""),
    imagePath,
    imageUrl,
    fileName: String(data.fileName ?? "calendario-academico"),
    contentType: String(data.contentType ?? "image/jpeg"),
    size: Number(data.size ?? 0),
    published: true,
    updatedBy: String(data.updatedBy ?? ""),
    updatedByName: String(data.updatedByName ?? "Dirección"),
    updatedAt: dateFromData(data.updatedAt),
  };
}

function imageMetadata(file: File) {
  if (!ACADEMIC_CALENDAR_IMAGE_TYPES.includes(
    file.type as (typeof ACADEMIC_CALENDAR_IMAGE_TYPES)[number],
  )) {
    throw new Error("Selecciona una imagen JPG, PNG o WEBP.");
  }
  if (file.size <= 0 || file.size > MAX_ACADEMIC_CALENDAR_IMAGE_SIZE) {
    throw new Error("La imagen debe pesar menos de 10 MB.");
  }
  const extension = file.type === "image/png"
    ? "png"
    : file.type === "image/webp"
      ? "webp"
      : "jpg";
  const contentType = extension === "jpg" ? "image/jpeg" : file.type;
  return { extension, contentType };
}

export function watchAcademicCalendarImage(
  institutionId: string,
  callback: (calendar: AcademicCalendarImage | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!firebase.db) {
    callback(null);
    return () => undefined;
  }
  let revision = 0;
  return onSnapshot(
    calendarDocument(institutionId),
    (snapshot) => {
      const currentRevision = ++revision;
      if (!snapshot.exists()) {
        callback(null);
        return;
      }
      void calendarImageFromData(snapshot.data())
        .then((calendar) => {
          if (currentRevision === revision) callback(calendar);
        })
        .catch((error: unknown) => {
          if (currentRevision !== revision) return;
          onError?.(
            error instanceof Error
              ? error
              : new Error("No pudimos cargar el calendario académico."),
          );
        });
    },
    (error) => onError?.(error),
  );
}

export async function publishAcademicCalendarImage(
  file: File,
  profile: UserProfile,
  previous?: AcademicCalendarImage | null,
) {
  if (profile.role !== "director") {
    throw new Error("Sólo Dirección puede publicar el calendario académico.");
  }
  const { db, storage } = requireCalendarFirebase();
  const metadata = imageMetadata(file);
  const imagePath = `institutions/${profile.institutionId}/academic-calendar/${crypto.randomUUID()}.${metadata.extension}`;
  const imageReference = ref(storage, imagePath);

  await uploadBytes(imageReference, file, { contentType: metadata.contentType });
  try {
    await setDoc(doc(
      db,
      "institutions",
      profile.institutionId,
      "configuracion",
      "calendarioVisual",
    ), {
      institutionId: profile.institutionId,
      imagePath,
      fileName: file.name.slice(0, 160),
      contentType: metadata.contentType,
      size: file.size,
      published: true,
      updatedBy: profile.uid,
      updatedByName: profile.name,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    await deleteObject(imageReference).catch(() => undefined);
    throw error;
  }

  if (previous?.imagePath && previous.imagePath !== imagePath) {
    await deleteObject(ref(storage, previous.imagePath)).catch(() => undefined);
  }
  const imageUrl = await getDownloadURL(imageReference);
  return {
    institutionId: profile.institutionId,
    imagePath,
    imageUrl,
    fileName: file.name.slice(0, 160),
    contentType: metadata.contentType,
    size: file.size,
    published: true,
    updatedBy: profile.uid,
    updatedByName: profile.name,
    updatedAt: new Date().toISOString(),
  } satisfies AcademicCalendarImage;
}

export async function unpublishAcademicCalendarImage(
  profile: UserProfile,
  current: AcademicCalendarImage,
) {
  if (profile.role !== "director") {
    throw new Error("Sólo Dirección puede retirar el calendario académico.");
  }
  const { db, storage } = requireCalendarFirebase();
  await setDoc(doc(
    db,
    "institutions",
    profile.institutionId,
    "configuracion",
    "calendarioVisual",
  ), {
    institutionId: profile.institutionId,
    imagePath: "",
    fileName: "",
    contentType: "",
    size: 0,
    published: false,
    updatedBy: profile.uid,
    updatedByName: profile.name,
    updatedAt: serverTimestamp(),
  });
  await deleteObject(ref(storage, current.imagePath)).catch(() => undefined);
}
