"use client";

import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { firebase } from "./firebase";
import type { MuralEditionInput, MuralSubmissionInput } from "./mural-contract";
import type {
  MuralEdition,
  MuralEditionCover,
  Role,
  UserProfile,
  WallPost,
} from "./types";

export type MuralWorkspace = {
  published: WallPost[];
  mine: WallPost[];
  reviewQueue: WallPost[];
};

type SubmitMuralStoryPayload = MuralSubmissionInput & { storyId?: string };

type ReviewMuralStoryPayload = {
  storyId: string;
  decision: "approve" | "request_changes";
  reviewNote: string;
};

export const defaultMuralCover: MuralEditionCover = {
  kicker: "PERIÓDICO MURAL · CAMPUS CEHF",
  title: "Ideas que dejan huella",
  description: "Historias, descubrimientos y proyectos creados por nuestra comunidad escolar.",
  badge: "Nueva edición",
  ctaLabel: "Explorar historias",
  backgroundColor: "#172554",
  accentColor: "#fb7185",
  textColor: "#ffffff",
  layout: "split",
  font: "editorial",
  motif: "orbits",
  showBadge: true,
  showManager: true,
  imagePath: "",
  imagePositionX: 50,
  imagePositionY: 50,
  overlayOpacity: 24,
};

export function defaultMuralEdition(profile: UserProfile): MuralEdition {
  const month = new Date().toISOString().slice(0, 7);
  const periodLabel = new Intl.DateTimeFormat("es-MX", {
    month: "long",
    year: "numeric",
    timeZone: "America/Mexico_City",
  }).format(new Date(`${month}-15T12:00:00`));
  return {
    id: "demo-edition-current",
    institutionId: profile.institutionId,
    active: true,
    periodType: "month",
    periodKey: month,
    periodLabel: periodLabel.charAt(0).toUpperCase() + periodLabel.slice(1),
    month,
    seasonName: "",
    group: profile.role === "student"
      ? `${profile.grade ?? ""} ${profile.group ?? ""}`.trim() || "5.º A"
      : profile.group ?? "5.º A",
    teacherId: profile.role === "teacher" ? profile.uid : "demo-teacher-mariana",
    teacherName: profile.role === "teacher" ? profile.name : "Mariana López",
    cover: { ...defaultMuralCover },
  };
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

function wallPostFromSnapshot(snapshot: QueryDocumentSnapshot<DocumentData>): WallPost {
  const data = snapshot.data();
  const publishedAt = dateFromData(data.publishedAt);
  const createdAt = dateFromData(data.createdAt);
  const category = String(data.category ?? "Comunidad");
  const paragraphs = Array.isArray(data.paragraphs)
    ? data.paragraphs.map(String).filter(Boolean)
    : [];
  const status = ["draft", "submitted", "changes_requested", "published", "archived"].includes(
    String(data.status),
  )
    ? (String(data.status) as WallPost["status"])
    : "submitted";
  const approvedByRole = ["director", "teacher"].includes(String(data.approvedByRole))
    ? (String(data.approvedByRole) as "director" | "teacher")
    : undefined;
  const reviewedByRole = ["director", "teacher"].includes(String(data.reviewedByRole))
    ? (String(data.reviewedByRole) as "director" | "teacher")
    : undefined;

  return {
    id: snapshot.id,
    institutionId: String(data.institutionId ?? ""),
    title: String(data.title ?? "Historia sin título"),
    excerpt: String(data.lead ?? data.excerpt ?? paragraphs[0] ?? ""),
    category,
    author: String(data.author ?? "Alumno CEHF"),
    authorId: String(data.authorId ?? ""),
    group: String(data.group ?? "Comunidad CEHF"),
    publishedAt: publishedAt || createdAt,
    accent: ["violet", "coral", "mint", "gold"].includes(String(data.accent))
      ? (String(data.accent) as WallPost["accent"])
      : "violet",
    status,
    favorite: false,
    section: String(data.section ?? category),
    lead: String(data.lead ?? data.excerpt ?? ""),
    paragraphs,
    quote: String(data.quote ?? ""),
    readingTime: String(data.readingTime ?? "3 min de lectura"),
    version: Number(data.version ?? 1),
    reviewNote: String(data.reviewNote ?? ""),
    reviewedById: data.reviewedById ? String(data.reviewedById) : undefined,
    reviewedByName: data.reviewedByName ? String(data.reviewedByName) : undefined,
    reviewedByRole,
    reviewedAt: dateFromData(data.reviewedAt),
    approvedById: data.approvedById ? String(data.approvedById) : undefined,
    approvedByName: data.approvedByName ? String(data.approvedByName) : undefined,
    approvedByRole,
    approvedAt: dateFromData(data.approvedAt),
    createdAt,
    updatedAt: dateFromData(data.updatedAt),
    submittedAt: dateFromData(data.submittedAt),
    editionId: data.editionId ? String(data.editionId) : undefined,
    editionLabel: data.editionLabel ? String(data.editionLabel) : undefined,
    editionGroup: data.editionGroup ? String(data.editionGroup) : undefined,
    assignedTeacherId: data.assignedTeacherId ? String(data.assignedTeacherId) : undefined,
    assignedTeacherName: data.assignedTeacherName ? String(data.assignedTeacherName) : undefined,
  };
}

function numberInRange(value: unknown, fallback: number, minimum = 0, maximum = 100) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

async function muralEditionFromData(id: string, data: DocumentData): Promise<MuralEdition> {
  const coverData = data.cover && typeof data.cover === "object"
    ? data.cover as Record<string, unknown>
    : {};
  const imagePath = String(coverData.imagePath ?? "");
  let imageUrl = "";
  if (imagePath && firebase.storage) {
    imageUrl = await getDownloadURL(ref(firebase.storage, imagePath)).catch(() => "");
  }
  const cover: MuralEditionCover = {
    ...defaultMuralCover,
    kicker: String(coverData.kicker ?? defaultMuralCover.kicker),
    title: String(coverData.title ?? defaultMuralCover.title),
    description: String(coverData.description ?? defaultMuralCover.description),
    badge: String(coverData.badge ?? defaultMuralCover.badge),
    ctaLabel: String(coverData.ctaLabel ?? defaultMuralCover.ctaLabel),
    backgroundColor: String(coverData.backgroundColor ?? defaultMuralCover.backgroundColor),
    accentColor: String(coverData.accentColor ?? defaultMuralCover.accentColor),
    textColor: String(coverData.textColor ?? defaultMuralCover.textColor),
    layout: ["split", "editorial", "immersive"].includes(String(coverData.layout))
      ? String(coverData.layout) as MuralEditionCover["layout"]
      : defaultMuralCover.layout,
    font: ["modern", "editorial", "classic"].includes(String(coverData.font))
      ? String(coverData.font) as MuralEditionCover["font"]
      : defaultMuralCover.font,
    motif: [
      "orbits",
      "grid",
      "confetti",
      "waves",
      "rays",
      "frames",
      "dots",
      "ribbons",
      "stars",
      "geometry",
      "arches",
      "checkerboard",
      "sprinkles",
      "bubbles",
      "crosses",
      "leaves",
      "pixels",
      "halftone",
      "corners",
      "spiral",
    ].includes(String(coverData.motif))
      ? String(coverData.motif) as MuralEditionCover["motif"]
      : defaultMuralCover.motif,
    showBadge: coverData.showBadge !== false,
    showManager: coverData.showManager !== false,
    imagePath,
    imageUrl,
    imagePositionX: numberInRange(coverData.imagePositionX, 50),
    imagePositionY: numberInRange(coverData.imagePositionY, 50),
    overlayOpacity: numberInRange(coverData.overlayOpacity, 24, 0, 85),
  };
  return {
    id,
    institutionId: String(data.institutionId ?? ""),
    active: data.active !== false,
    periodType: data.periodType === "season" ? "season" : "month",
    periodKey: String(data.periodKey ?? ""),
    periodLabel: String(data.periodLabel ?? "Edición actual"),
    month: String(data.month ?? new Date().toISOString().slice(0, 7)),
    seasonName: String(data.seasonName ?? ""),
    group: String(data.group ?? "Comunidad CEHF"),
    teacherId: String(data.teacherId ?? ""),
    teacherName: String(data.teacherName ?? "Dirección CEHF"),
    cover,
    createdAt: dateFromData(data.createdAt),
    updatedAt: dateFromData(data.updatedAt),
    updatedBy: data.updatedBy ? String(data.updatedBy) : undefined,
    updatedByName: data.updatedByName ? String(data.updatedByName) : undefined,
  };
}

function newestFirst(items: WallPost[]) {
  const timestamp = (item: WallPost) =>
    Date.parse(item.publishedAt || item.updatedAt || item.createdAt || "") || 0;
  return [...items].sort((first, second) => timestamp(second) - timestamp(first));
}

export function watchMuralWorkspace(
  profile: UserProfile,
  callback: (workspace: MuralWorkspace) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!firebase.db) {
    callback({ published: [], mine: [], reviewQueue: [] });
    return () => undefined;
  }

  let published: WallPost[] = [];
  let mine: WallPost[] = [];
  let reviewQueue: WallPost[] = [];
  const emit = () => callback({ published, mine, reviewQueue });
  const muralCollection = collection(firebase.db, "wallPosts");
  const stops: Unsubscribe[] = [];
  const handleError = (error: Error) => onError?.(error);

  if (profile.role === "student") {
    stops.push(
      onSnapshot(
        query(
          muralCollection,
          where("institutionId", "==", profile.institutionId),
          where("status", "==", "published"),
          orderBy("updatedAt", "desc"),
          limit(500),
        ),
        (snapshot) => {
          published = newestFirst(snapshot.docs.map(wallPostFromSnapshot));
          emit();
        },
        handleError,
      ),
      onSnapshot(
        query(
          muralCollection,
          where("institutionId", "==", profile.institutionId),
          where("authorId", "==", profile.uid),
          orderBy("updatedAt", "desc"),
          limit(100),
        ),
        (snapshot) => {
          mine = newestFirst(snapshot.docs.map(wallPostFromSnapshot));
          emit();
        },
        handleError,
      ),
    );
  } else {
    stops.push(
      onSnapshot(
        query(
          muralCollection,
          where("institutionId", "==", profile.institutionId),
          orderBy("updatedAt", "desc"),
          limit(500),
        ),
        (snapshot) => {
          const stories = newestFirst(snapshot.docs.map(wallPostFromSnapshot));
          published = stories.filter((story) => story.status === "published");
          reviewQueue = stories.filter((story) =>
            story.status === "submitted" && (
              profile.role === "director" ||
              !story.assignedTeacherId ||
              story.assignedTeacherId === profile.uid
            ),
          );
          emit();
        },
        handleError,
      ),
    );
  }

  return () => stops.forEach((stop) => stop());
}

export function watchActiveMuralEdition(
  profile: UserProfile,
  callback: (edition: MuralEdition | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!firebase.db) {
    callback(null);
    return () => undefined;
  }
  let revision = 0;
  return onSnapshot(
    query(
      collection(firebase.db, "muralEditions"),
      where("institutionId", "==", profile.institutionId),
      where("active", "==", true),
      limit(1),
    ),
    (snapshot) => {
      const currentRevision = ++revision;
      const entry = snapshot.docs[0];
      if (!entry) {
        callback(null);
        return;
      }
      void muralEditionFromData(entry.id, entry.data()).then((edition) => {
        if (currentRevision === revision) callback(edition);
      });
    },
    (error) => onError?.(error),
  );
}

function coverImageMetadata(file: File) {
  const extensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  const extension = extensions[file.type];
  if (!extension || file.size <= 0 || file.size >= 8 * 1024 * 1024) {
    throw new Error("Selecciona una imagen JPG, PNG o WEBP menor a 8 MB.");
  }
  return { extension, contentType: file.type === "image/jpg" ? "image/jpeg" : file.type };
}

export async function saveMuralEdition(
  profile: UserProfile,
  input: MuralEditionInput,
  coverImage?: File | null,
) {
  if (!firebase.functions) throw new Error("Firebase no está configurado.");
  let imagePath = input.cover.imagePath;
  if (coverImage) {
    if (!firebase.storage) throw new Error("El almacenamiento de imágenes no está disponible.");
    const metadata = coverImageMetadata(coverImage);
    imagePath = `institutions/${profile.institutionId}/wall/covers/${crypto.randomUUID()}.${metadata.extension}`;
    await uploadBytes(ref(firebase.storage, imagePath), coverImage, {
      contentType: metadata.contentType,
      customMetadata: { institutionId: profile.institutionId, purpose: "mural-cover" },
    });
  }
  const callable = httpsCallable<MuralEditionInput, { edition: MuralEdition }>(
    firebase.functions,
    "saveMuralEdition",
  );
  const result = await callable({
    ...input,
    cover: { ...input.cover, imagePath },
  });
  return result.data.edition;
}

export async function submitMuralStory(input: MuralSubmissionInput, storyId?: string) {
  if (!firebase.functions) throw new Error("Firebase no está configurado.");
  const callable = httpsCallable<SubmitMuralStoryPayload, { story: WallPost }>(
    firebase.functions,
    "submitWallStory",
  );
  const result = await callable({ ...input, ...(storyId ? { storyId } : {}) });
  return result.data.story;
}

export async function reviewMuralStory(
  storyId: string,
  decision: ReviewMuralStoryPayload["decision"],
  reviewNote = "",
) {
  if (!firebase.functions) throw new Error("Firebase no está configurado.");
  const callable = httpsCallable<ReviewMuralStoryPayload, { story: WallPost }>(
    firebase.functions,
    "reviewWallStory",
  );
  const result = await callable({ storyId, decision, reviewNote });
  return result.data.story;
}

export function reviewerRoleLabel(role: Role | undefined) {
  return role === "director" ? "Dirección" : role === "teacher" ? "Maestro" : "Personal CEHF";
}
