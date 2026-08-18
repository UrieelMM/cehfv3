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
import { firebase } from "./firebase";
import type { MuralSubmissionInput } from "./mural-contract";
import type { Role, UserProfile, WallPost } from "./types";

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
          reviewQueue = stories.filter((story) => story.status === "submitted");
          emit();
        },
        handleError,
      ),
    );
  }

  return () => stops.forEach((stop) => stop());
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
