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
  MuralGallerySlide,
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

type ToggleMuralStoryLikeResponse = {
  storyId: string;
  likeCount: number;
  liked: boolean;
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
  gradientPreset: "campus",
  useTitleGradient: true,
  useBackgroundGradient: true,
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

export const defaultMuralGallerySlides: MuralGallerySlide[] = [
  { id: "gallery-ideas", kicker: "IDEAS EN MOVIMIENTO", title: "Creamos para transformar", caption: "Proyectos, hallazgos y voces que nacen en nuestras aulas.", contentKicker: "", contentTitle: "", contentSubtitle: "", body: "", facts: ["Curiosidad", "Creatividad", "Comunidad"], imagePath: "", accentColor: "#aeb5ff", layout: "focus", sceneStyle: "aurora", transition: "orbit", revealMode: "all", depth: 3, imagePositionX: 50, imagePositionY: 50 },
  { id: "gallery-community", kicker: "COMUNIDAD CEHF", title: "Aprender también es compartir", caption: "Una mirada cercana a los momentos que nos unen como comunidad.", contentKicker: "", contentTitle: "", contentSubtitle: "", body: "", facts: ["Observar", "Relacionar", "Descubrir"], imagePath: "", accentColor: "#ef6b7d", layout: "split", sceneStyle: "museum", transition: "zoom", revealMode: "all", depth: 2, imagePositionX: 50, imagePositionY: 50 },
  { id: "gallery-future", kicker: "HISTORIA PARA DESCUBRIR", title: "La Independencia de México", caption: "Un tema presentado de forma clara, visual y memorable.", contentKicker: "MOMENTO HISTÓRICO", contentTitle: "El inicio de un nuevo país", contentSubtitle: "Una lucha que transformó nuestra historia y nuestra identidad.", body: "En 1810 comenzó un movimiento que buscaba justicia, libertad y una nueva forma de organizar el territorio.\n\nSus protagonistas, ideas y consecuencias siguen ayudándonos a comprender el México de hoy.", facts: ["1810 · Inicio", "1821 · Consumación", "Libertad e identidad"], imagePath: "", accentColor: "#8db4ff", layout: "cinematic", sceneStyle: "constellation", transition: "lift", revealMode: "steps", depth: 3, imagePositionX: 50, imagePositionY: 50 },
];

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
    gallerySlides: defaultMuralGallerySlides.map((slide) => ({ ...slide })),
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

function wallPostFromSnapshot(
  snapshot: QueryDocumentSnapshot<DocumentData>,
  likedStoryIds: ReadonlySet<string> = new Set(),
): WallPost {
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
    favorite: likedStoryIds.has(snapshot.id),
    likeCount: Math.max(0, Number(data.likeCount ?? 0) || 0),
    likedByCurrentUser: likedStoryIds.has(snapshot.id),
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
    gradientPreset: ["campus", "aurora", "coral", "cobalt"].includes(String(coverData.gradientPreset))
      ? String(coverData.gradientPreset) as MuralEditionCover["gradientPreset"]
      : defaultMuralCover.gradientPreset,
    useTitleGradient: coverData.useTitleGradient !== false,
    useBackgroundGradient: coverData.useBackgroundGradient !== false,
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
  const rawSlides = Array.isArray(data.gallerySlides) && data.gallerySlides.length
    ? data.gallerySlides
    : defaultMuralGallerySlides;
  const gallerySlides = await Promise.all(rawSlides.slice(0, 10).map(async (entry: unknown, index: number): Promise<MuralGallerySlide> => {
    const slide = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    const slideImagePath = String(slide.imagePath ?? "");
    const slideImageUrl = slideImagePath && firebase.storage
      ? await getDownloadURL(ref(firebase.storage, slideImagePath)).catch(() => "")
      : "";
    const fallback = defaultMuralGallerySlides[index % defaultMuralGallerySlides.length];
    return {
      id: /^[A-Za-z0-9_-]{1,80}$/.test(String(slide.id ?? "")) ? String(slide.id) : `gallery-${index + 1}`,
      kicker: String(slide.kicker ?? fallback.kicker),
      title: String(slide.title ?? fallback.title),
      caption: String(slide.caption ?? fallback.caption),
      contentKicker: String(slide.contentKicker ?? fallback.contentKicker),
      contentTitle: String(slide.contentTitle ?? fallback.contentTitle),
      contentSubtitle: String(slide.contentSubtitle ?? fallback.contentSubtitle),
      body: String(slide.body ?? fallback.body),
      facts: Array.isArray(slide.facts) ? slide.facts.slice(0, 4).map(String) : fallback.facts,
      imagePath: slideImagePath,
      imageUrl: slideImageUrl,
      accentColor: /^#[0-9a-f]{6}$/i.test(String(slide.accentColor ?? "")) ? String(slide.accentColor) : fallback.accentColor,
      layout: ["focus", "split", "cinematic"].includes(String(slide.layout)) ? String(slide.layout) as MuralGallerySlide["layout"] : fallback.layout,
      sceneStyle: ["aurora", "constellation", "museum", "archive", "ocean", "festival"].includes(String(slide.sceneStyle)) ? String(slide.sceneStyle) as MuralGallerySlide["sceneStyle"] : fallback.sceneStyle,
      transition: ["orbit", "zoom", "lift", "flip", "wipe", "drift"].includes(String(slide.transition)) ? String(slide.transition) as MuralGallerySlide["transition"] : fallback.transition,
      revealMode: ["all", "steps"].includes(String(slide.revealMode)) ? String(slide.revealMode) as MuralGallerySlide["revealMode"] : fallback.revealMode,
      depth: numberInRange(slide.depth, fallback.depth, 1, 3),
      imagePositionX: numberInRange(slide.imagePositionX, 50),
      imagePositionY: numberInRange(slide.imagePositionY, 50),
    };
  }));
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
    gallerySlides,
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
  editionId: string,
  callback: (workspace: MuralWorkspace) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!firebase.db || !editionId) {
    callback({ published: [], mine: [], reviewQueue: [] });
    return () => undefined;
  }

  let published: WallPost[] = [];
  let mine: WallPost[] = [];
  let reviewQueue: WallPost[] = [];
  let likedStoryIds = new Set<string>();
  const emit = () => callback({ published, mine, reviewQueue });
  const applyLikeState = (story: WallPost): WallPost => ({
    ...story,
    favorite: likedStoryIds.has(story.id),
    likedByCurrentUser: likedStoryIds.has(story.id),
  });
  const muralCollection = collection(firebase.db, "wallPosts");
  const stops: Unsubscribe[] = [];
  const handleError = (error: Error) => onError?.(error);

  stops.push(onSnapshot(
    query(
      collection(firebase.db, "wallPostLikes"),
      where("institutionId", "==", profile.institutionId),
      where("editionId", "==", editionId),
      where("userId", "==", profile.uid),
      limit(500),
    ),
    (snapshot) => {
      likedStoryIds = new Set(snapshot.docs.map((entry) => String(entry.data().storyId ?? "")).filter(Boolean));
      published = published.map(applyLikeState);
      mine = mine.map(applyLikeState);
      emit();
    },
    handleError,
  ));

  stops.push(onSnapshot(
    query(
      muralCollection,
      where("institutionId", "==", profile.institutionId),
      where("editionId", "==", editionId),
      where("status", "==", "published"),
      orderBy("updatedAt", "desc"),
      limit(500),
    ),
    (snapshot) => {
      published = newestFirst(snapshot.docs.map((entry) => wallPostFromSnapshot(entry, likedStoryIds)));
      emit();
    },
    handleError,
  ));

  if (profile.role === "student") {
    stops.push(
      onSnapshot(
        query(
          muralCollection,
          where("institutionId", "==", profile.institutionId),
          where("editionId", "==", editionId),
          where("authorId", "==", profile.uid),
          orderBy("updatedAt", "desc"),
          limit(100),
        ),
        (snapshot) => {
          mine = newestFirst(snapshot.docs.map((entry) => wallPostFromSnapshot(entry, likedStoryIds)));
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
          where("editionId", "==", editionId),
          where("status", "==", "submitted"),
          orderBy("updatedAt", "desc"),
          limit(200),
        ),
        (snapshot) => {
          const stories = newestFirst(snapshot.docs.map((entry) => wallPostFromSnapshot(entry, likedStoryIds)));
          reviewQueue = stories.filter((story) =>
            profile.role === "director" ||
            !story.assignedTeacherId ||
            story.assignedTeacherId === profile.uid,
          );
          emit();
        },
        handleError,
      ),
    );
  }

  return () => stops.forEach((stop) => stop());
}

export function watchMuralEditionArchive(
  profile: UserProfile,
  callback: (editions: MuralEdition[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!firebase.db) {
    callback([]);
    return () => undefined;
  }
  let revision = 0;
  return onSnapshot(
    query(
      collection(firebase.db, "muralEditions"),
      where("institutionId", "==", profile.institutionId),
      orderBy("updatedAt", "desc"),
      limit(80),
    ),
    (snapshot) => {
      const currentRevision = ++revision;
      void Promise.all(snapshot.docs
        .filter((entry) => entry.data().active !== true)
        .map((entry) => muralEditionFromData(entry.id, entry.data())))
        .then((editions) => {
          if (currentRevision === revision) callback(editions);
        });
    },
    (error) => onError?.(error),
  );
}

export function watchPublishedMuralStories(
  profile: UserProfile,
  editionId: string,
  callback: (stories: WallPost[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!firebase.db || !editionId) {
    callback([]);
    return () => undefined;
  }
  return onSnapshot(
    query(
      collection(firebase.db, "wallPosts"),
      where("institutionId", "==", profile.institutionId),
      where("editionId", "==", editionId),
      where("status", "==", "published"),
      orderBy("updatedAt", "desc"),
      limit(500),
    ),
    (snapshot) => callback(newestFirst(snapshot.docs.map((entry) => wallPostFromSnapshot(entry)))),
    (error) => onError?.(error),
  );
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
  galleryImages: Record<string, File> = {},
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
  const gallerySlides = await Promise.all(input.gallerySlides.map(async (slide) => {
    const galleryImage = galleryImages[slide.id];
    if (!galleryImage) return slide;
    if (!firebase.storage) throw new Error("El almacenamiento de imágenes no está disponible.");
    const metadata = coverImageMetadata(galleryImage);
    const slideImagePath = `institutions/${profile.institutionId}/wall/gallery/${slide.id}-${crypto.randomUUID()}.${metadata.extension}`;
    await uploadBytes(ref(firebase.storage, slideImagePath), galleryImage, {
      contentType: metadata.contentType,
      customMetadata: { institutionId: profile.institutionId, purpose: "mural-gallery", slideId: slide.id },
    });
    return { ...slide, imagePath: slideImagePath };
  }));
  const callable = httpsCallable<MuralEditionInput, { edition: MuralEdition }>(
    firebase.functions,
    "saveMuralEdition",
  );
  const result = await callable({
    ...input,
    cover: { ...input.cover, imagePath },
    gallerySlides,
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

export async function toggleMuralStoryLike(storyId: string) {
  if (!firebase.functions) throw new Error("Firebase no está configurado.");
  const callable = httpsCallable<{ storyId: string }, ToggleMuralStoryLikeResponse>(
    firebase.functions,
    "toggleWallStoryLike",
  );
  const result = await callable({ storyId });
  return result.data;
}

export function reviewerRoleLabel(role: Role | undefined) {
  return role === "director" ? "Dirección" : role === "teacher" ? "Maestro" : "Personal CEHF";
}
