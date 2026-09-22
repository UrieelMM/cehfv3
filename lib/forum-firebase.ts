"use client";

import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  setDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";
import { firebase } from "./firebase";
import type {
  ForumAttachment,
  ForumBan,
  ForumModerationCase,
  ForumParticipant,
  ForumReactionKind,
  ForumReply,
  ForumTopic,
  ForumTopicKind,
  UserProfile,
} from "./types";

export type ForumWorkspace = {
  topics: ForumTopic[];
  moderation: ForumModerationCase[];
  bans: ForumBan[];
};

export type ForumTopicInput = {
  title: string;
  prompt: string;
  promptRich: string;
  subject: string;
  group: string;
  forumName: string;
  kind: ForumTopicKind;
  status: ForumTopic["status"];
  opensAt: string;
  closesAt: string;
  allowReplies: boolean;
  allowAttachments: boolean;
};

export type ForumTopicUpdate = Pick<
  ForumTopic,
  | "title"
  | "prompt"
  | "promptRich"
  | "status"
  | "opensAt"
  | "closesAt"
  | "allowReplies"
  | "allowAttachments"
>;

function isoDate(value: unknown) {
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

export function forumDateLabel(value: string | undefined, fallback: string) {
  const timestamp = Date.parse(value ?? "");
  if (!Number.isFinite(timestamp)) return value || fallback;
  const difference = Date.now() - timestamp;
  if (Math.abs(difference) < 60_000) return "Ahora";
  if (difference > 0 && difference < 60 * 60_000) {
    return `Hace ${Math.max(1, Math.floor(difference / 60_000))} min`;
  }
  if (difference > 0 && difference < 24 * 60 * 60_000) {
    return `Hace ${Math.max(1, Math.floor(difference / (60 * 60_000)))} h`;
  }
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function participantList(value: unknown): ForumParticipant[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const data = (item ?? {}) as Record<string, unknown>;
      const uid = String(data.uid ?? "");
      const name = String(data.name ?? "");
      if (!uid || !name) return null;
      return {
        uid,
        name,
        initials: String(data.initials ?? "CE"),
      };
    })
    .filter((item): item is ForumParticipant => Boolean(item));
}

function attachmentFromData(value: unknown): ForumAttachment | undefined {
  if (!value || typeof value !== "object") return undefined;
  const data = value as Record<string, unknown>;
  const storagePath = String(data.storagePath ?? "");
  if (!storagePath) return undefined;
  const contentType = String(data.contentType ?? "application/octet-stream");
  const size = Number(data.size ?? 0);
  return {
    id: String(data.id ?? storagePath),
    name: String(data.name ?? "Adjunto"),
    type: contentType.startsWith("image/") ? "image" : "document",
    sizeLabel: `${contentType.startsWith("image/") ? "Imagen" : "Documento"} · ${Math.max(0.1, size / 1_000_000).toFixed(1)} MB`,
    storagePath,
    contentType,
    size,
  };
}

function replyFromSnapshot(
  snapshot: QueryDocumentSnapshot<DocumentData>,
  currentUserId: string,
) {
  const data = snapshot.data();
  const reactionUsers = (data.reactionUsers ?? {}) as Record<string, unknown>;
  const reactionKinds: ForumReactionKind[] = [
    "helpful",
    "interesting",
    "celebrate",
  ];
  const reactedByMe = reactionKinds.filter((kind) =>
    Array.isArray(reactionUsers[kind])
      ? reactionUsers[kind].map(String).includes(currentUserId)
      : false,
  );
  const reactions = Object.fromEntries(
    reactionKinds.map((kind) => [
      kind,
      Array.isArray(reactionUsers[kind]) ? reactionUsers[kind].length : 0,
    ]),
  );
  const reportedByIds = Array.isArray(data.reportedByIds)
    ? data.reportedByIds.map(String)
    : [];
  const createdAt = isoDate(data.createdAt);
  return {
    topicId: String(data.topicId ?? ""),
    reply: {
      id: snapshot.id,
      authorId: String(data.authorId ?? ""),
      author: String(data.authorName ?? "Integrante CEHF"),
      initials: String(data.authorInitials ?? "CE"),
      body: String(data.body ?? ""),
      bodyRich: data.bodyRich ? String(data.bodyRich) : undefined,
      createdAt: forumDateLabel(createdAt, "Reciente"),
      teacher: ["teacher", "director"].includes(String(data.authorRole)),
      parentId: data.parentId ? String(data.parentId) : undefined,
      attachment: attachmentFromData(data.attachment),
      reactions,
      reactedByMe,
      status: data.status === "hidden" ? "hidden" : "visible",
      reports: Number(data.reportCount ?? reportedByIds.length),
      markedAnswer: data.markedAnswer === true,
      edited: data.edited === true,
      reportedByMe: reportedByIds.includes(currentUserId),
    } satisfies ForumReply,
    createdAt,
  };
}

function topicFromSnapshot(
  snapshot: QueryDocumentSnapshot<DocumentData>,
): ForumTopic | null {
  const data = snapshot.data();
  if (data.deletedAt) return null;
  const participants = participantList(data.participants);
  const status = ["open", "scheduled", "closed", "archived"].includes(
    String(data.status),
  )
    ? (String(data.status) as ForumTopic["status"])
    : "closed";
  const kind = [
    "weekly_question",
    "subject",
    "reading_club",
    "task_help",
    "group_chat",
    "wall",
    "announcement",
  ].includes(String(data.kind))
    ? (String(data.kind) as ForumTopicKind)
    : "subject";
  const lastActivityAt = isoDate(data.lastActivityAt ?? data.updatedAt);
  return {
    id: snapshot.id,
    creatorId: String(data.creatorId ?? ""),
    creatorRole:
      data.creatorRole === "director" ? "director" : "teacher",
    forumId: String(data.forumId ?? snapshot.id),
    forumName: String(data.forumName ?? data.subject ?? "Conversaciones"),
    title: String(data.title ?? "Tema sin título"),
    prompt: String(data.prompt ?? ""),
    promptRich: data.promptRich ? String(data.promptRich) : undefined,
    kind,
    subject: String(data.subject ?? "Comunidad"),
    group: String(data.targetGroup ?? "Todo el campus"),
    responsible: String(data.creatorName ?? "Equipo docente"),
    participants: participants.map((participant) => participant.name),
    participantProfiles: participants,
    opensAt: isoDate(data.opensAt),
    closesAt: isoDate(data.closesAt),
    status,
    allowReplies: data.allowReplies === true,
    allowAttachments: data.allowAttachments === true,
    pinned: data.pinned === true,
    unreadCount: 0,
    lastActivity: forumDateLabel(lastActivityAt, "Reciente"),
    lastActivityAt,
    replies: [],
  };
}

function moderationFromSnapshot(
  snapshot: QueryDocumentSnapshot<DocumentData>,
): ForumModerationCase {
  const data = snapshot.data();
  const status = ["open", "hidden", "dismissed", "restored"].includes(
    String(data.status),
  )
    ? (String(data.status) as ForumModerationCase["status"])
    : "open";
  return {
    id: snapshot.id,
    topicId: String(data.topicId ?? ""),
    replyId: String(data.postId ?? ""),
    author: String(data.authorName ?? "Integrante CEHF"),
    excerpt: String(data.excerpt ?? data.originalBody ?? "").slice(0, 180),
    originalBody: data.originalBody ? String(data.originalBody) : undefined,
    reason: String(data.reason ?? "Revisión de convivencia"),
    reportedAt: forumDateLabel(isoDate(data.createdAt), "Reciente"),
    status,
    resolvedBy: data.resolvedByName
      ? String(data.resolvedByName)
      : undefined,
    resolvedAt: isoDate(data.resolvedAt) || undefined,
    reportCount: Number(data.reportCount ?? 0),
  };
}

function banFromSnapshot(
  snapshot: QueryDocumentSnapshot<DocumentData>,
): ForumBan {
  const data = snapshot.data();
  return {
    userId: snapshot.id,
    userName: String(data.userName ?? "Integrante CEHF"),
    active: data.active === true,
    reason: String(data.reason ?? ""),
    bannedBy: String(data.bannedByName ?? "Dirección"),
    bannedAt: isoDate(data.bannedAt),
    restoredBy: data.restoredByName
      ? String(data.restoredByName)
      : undefined,
    restoredAt: isoDate(data.restoredAt) || undefined,
  };
}

export function watchForumWorkspace(
  profile: UserProfile,
  callback: (workspace: ForumWorkspace) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!firebase.db) {
    callback({ topics: [], moderation: [], bans: [] });
    return () => undefined;
  }
  let topics: ForumTopic[] = [];
  let replies: Array<ReturnType<typeof replyFromSnapshot>> = [];
  let moderation: ForumModerationCase[] = [];
  let bans: ForumBan[] = [];
  const emit = () => {
    const repliesByTopic = new Map<string, ForumReply[]>();
    replies
      .sort(
        (first, second) =>
          Date.parse(second.createdAt) - Date.parse(first.createdAt),
      )
      .forEach((item) => {
        repliesByTopic.set(item.topicId, [
          ...(repliesByTopic.get(item.topicId) ?? []),
          item.reply,
        ]);
      });
    callback({
      topics: topics
        .map((topic) => ({
          ...topic,
          replies: repliesByTopic.get(topic.id) ?? [],
        }))
        .sort(
          (first, second) =>
            Date.parse(second.lastActivityAt ?? "") -
            Date.parse(first.lastActivityAt ?? ""),
        ),
      moderation,
      bans,
    });
  };
  const handleError = (error: Error) => onError?.(error);
  const topicQuery =
    profile.role === "student"
      ? query(
          collection(firebase.db, "forumTopics"),
          where("institutionId", "==", profile.institutionId),
          where("participantIds", "array-contains", profile.uid),
        )
      : query(
          collection(firebase.db, "forumTopics"),
          where("institutionId", "==", profile.institutionId),
        );
  const postQuery =
    profile.role === "student"
      ? query(
          collection(firebase.db, "forumPosts"),
          where("institutionId", "==", profile.institutionId),
          where("participantIds", "array-contains", profile.uid),
        )
      : query(
          collection(firebase.db, "forumPosts"),
          where("institutionId", "==", profile.institutionId),
        );
  const stops: Unsubscribe[] = [
    onSnapshot(
      topicQuery,
      (snapshot) => {
        topics = snapshot.docs
          .map(topicFromSnapshot)
          .filter((topic): topic is ForumTopic => Boolean(topic));
        emit();
      },
      handleError,
    ),
    onSnapshot(
      postQuery,
      (snapshot) => {
        replies = snapshot.docs.map((entry) =>
          replyFromSnapshot(entry, profile.uid),
        );
        emit();
      },
      handleError,
    ),
  ];

  if (profile.role !== "student") {
    stops.push(
      onSnapshot(
        query(
          collection(firebase.db, "forumModeration"),
          where("institutionId", "==", profile.institutionId),
        ),
        (snapshot) => {
          moderation = [...snapshot.docs]
            .sort(
              (first, second) =>
                Date.parse(isoDate(second.data().createdAt)) -
                Date.parse(isoDate(first.data().createdAt)),
            )
            .map(moderationFromSnapshot);
          emit();
        },
        handleError,
      ),
    );
  }
  if (profile.role === "director") {
    stops.push(
      onSnapshot(
        collection(firebase.db, "forumBans", profile.institutionId, "users"),
        (snapshot) => {
          bans = snapshot.docs.map(banFromSnapshot);
          emit();
        },
        handleError,
      ),
    );
  } else {
    stops.push(
      onSnapshot(
        doc(firebase.db, "forumBans", profile.institutionId, "users", profile.uid),
        (snapshot) => {
          bans = snapshot.exists()
            ? [
                banFromSnapshot(
                  snapshot as QueryDocumentSnapshot<DocumentData>,
                ),
              ]
            : [];
          emit();
        },
        handleError,
      ),
    );
  }
  return () => stops.forEach((stop) => stop());
}

async function callForum<Input, Output>(name: string, input: Input) {
  if (!firebase.functions) throw new Error("Firebase no está configurado.");
  const callable = httpsCallable<Input, Output>(firebase.functions, name);
  const result = await callable(input);
  return result.data;
}

export function createForumTopic(input: ForumTopicInput) {
  return callForum<ForumTopicInput, { topicId: string }>(
    "createForumTopic",
    input,
  );
}

export function updateForumTopic(topicId: string, values: ForumTopicUpdate) {
  return callForum<{ topicId: string; values: ForumTopicUpdate }, { ok: true }>(
    "updateForumTopic",
    { topicId, values },
  );
}

export function deleteForumTopic(topicId: string) {
  return callForum<{ topicId: string }, { ok: true }>("deleteForumTopic", {
    topicId,
  });
}

export async function publishForumReply(input: {
  profile: UserProfile;
  topicId: string;
  body: string;
  bodyRich: string;
  parentId?: string;
  mentionedUserIds: string[];
  file?: File | null;
}) {
  if (!firebase.db || !firebase.storage) {
    throw new Error("Firebase no está configurado.");
  }
  const postId = doc(collection(firebase.db, "forumPosts")).id;
  let attachment: ForumAttachment | undefined;
  let attachmentReference: ReturnType<typeof ref> | undefined;
  if (input.file) {
    const file = input.file;
    if (file.size > 5_000_000) {
      throw new Error("El archivo debe pesar menos de 5 MB.");
    }
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      throw new Error("Sólo puedes adjuntar una imagen o un archivo PDF.");
    }
    const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, "-").slice(-120);
    const storagePath = `institutions/${input.profile.institutionId}/forum/${input.topicId}/${postId}/${safeName}`;
    attachmentReference = ref(firebase.storage, storagePath);
    await uploadBytes(attachmentReference, file, { contentType: file.type });
    attachment = {
      id: postId,
      name: file.name,
      type: file.type.startsWith("image/") ? "image" : "document",
      storagePath,
      contentType: file.type,
      size: file.size,
      sizeLabel: `${file.type.startsWith("image/") ? "Imagen" : "Documento"} · ${Math.max(0.1, file.size / 1_000_000).toFixed(1)} MB`,
    };
  }
  try {
    return await callForum<
      {
        postId: string;
        topicId: string;
        body: string;
        bodyRich: string;
        parentId?: string;
        mentionedUserIds: string[];
        attachment?: ForumAttachment;
      },
      { postId: string }
    >("createForumPost", {
      postId,
      topicId: input.topicId,
      body: input.body,
      bodyRich: input.bodyRich,
      ...(input.parentId ? { parentId: input.parentId } : {}),
      mentionedUserIds: input.mentionedUserIds,
      ...(attachment ? { attachment } : {}),
    });
  } catch (error) {
    if (attachmentReference) {
      await deleteObject(attachmentReference).catch(() => undefined);
    }
    throw error;
  }
}

export function reactToForumPost(
  postId: string,
  reaction: ForumReactionKind,
) {
  return callForum<
    { postId: string; reaction: ForumReactionKind },
    { active: boolean }
  >("reactToForumPost", { postId, reaction });
}

export function reportForumPost(postId: string, reason: string) {
  return callForum<{ postId: string; reason: string }, { ok: true }>(
    "reportForumPost",
    { postId, reason },
  );
}

export function moderateForumPost(
  postId: string,
  action: "hidden" | "dismissed" | "restored",
) {
  return callForum<
    { postId: string; action: "hidden" | "dismissed" | "restored" },
    { ok: true }
  >("moderateForumPost", { postId, action });
}

export function setForumPostMarked(postId: string, marked: boolean) {
  return callForum<{ postId: string; marked: boolean }, { ok: true }>(
    "setForumPostMarked",
    { postId, marked },
  );
}

export function setForumUserBan(userId: string, active: boolean, reason = "") {
  return callForum<
    { userId: string; active: boolean; reason: string },
    { ok: true }
  >("setForumUserBan", { userId, active, reason });
}

export async function getForumAttachmentUrl(attachment: ForumAttachment) {
  if (!firebase.storage || !attachment.storagePath) {
    throw new Error("El archivo no está disponible.");
  }
  return getDownloadURL(ref(firebase.storage, attachment.storagePath));
}

export function watchForumFollowing(
  profile: UserProfile,
  callback: (topicIds: string[]) => void,
  onError?: (error: Error) => void,
) {
  if (!firebase.db) return () => undefined;
  return onSnapshot(
    collection(firebase.db, "users", profile.uid, "preferences"),
    (snapshot) =>
      callback(
        snapshot.docs
          .filter((entry) => entry.data().kind === "forum-following")
          .map((entry) => String(entry.data().topicId ?? ""))
          .filter(Boolean),
      ),
    (error) => onError?.(error),
  );
}

export async function setForumTopicFollowing(
  profile: UserProfile,
  topicId: string,
  following: boolean,
) {
  if (!firebase.db) return;
  const reference = doc(
    firebase.db,
    "users",
    profile.uid,
    "preferences",
    `forum-${topicId}`,
  );
  if (!following) {
    await deleteDoc(reference);
    return;
  }
  await setDoc(reference, {
    kind: "forum-following",
    topicId,
    updatedAt: new Date().toISOString(),
  });
}
