"use client";

import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type Query,
  type QuerySnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { firebase } from "./firebase";
import type {
  StaffWorkspaceAttachment,
  StaffWorkspaceItem,
  StaffWorkspaceItemInput,
  StaffWorkspaceItemType,
  StaffWorkspaceVisibility,
  UserProfile,
} from "./types";

function requireWorkspaceFirebase() {
  if (!firebase.db) throw new Error("Firebase no está configurado para Mi espacio.");
  return firebase.db;
}

function requireWorkspaceStorage() {
  if (!firebase.storage) throw new Error("Firebase Storage no está configurado para Mi espacio.");
  return firebase.storage;
}

function workspaceCollection(institutionId: string) {
  return collection(
    requireWorkspaceFirebase(),
    "institutions",
    institutionId,
    "staffWorkspace",
  );
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

function workspaceItemFromData(id: string, data: DocumentData): StaffWorkspaceItem {
  const itemType: StaffWorkspaceItemType = [
    "planning",
    "resource",
    "schedule",
    "note",
  ].includes(String(data.type))
    ? (data.type as StaffWorkspaceItemType)
    : "note";
  const visibility: StaffWorkspaceVisibility = ["staff", "selected"].includes(
    String(data.visibility),
  )
    ? (data.visibility as StaffWorkspaceVisibility)
    : "private";
  const attachments = Array.isArray(data.attachments)
    ? data.attachments.flatMap((value: unknown) => {
      if (!value || typeof value !== "object") return [];
      const item = value as Record<string, unknown>;
      const storagePath = String(item.storagePath ?? "");
      const url = String(item.url ?? "");
      if (!storagePath && !url) return [];
      return [{
        id: String(item.id || storagePath || url),
        name: String(item.name ?? "Archivo"),
        contentType: String(item.contentType ?? "application/octet-stream"),
        size: Number(item.size ?? 0),
        storagePath,
        url,
      } satisfies StaffWorkspaceAttachment];
    })
    : [];
  return {
    id,
    institutionId: String(data.institutionId ?? ""),
    ownerId: String(data.ownerId ?? ""),
    ownerName: String(data.ownerName ?? "Equipo CEHF"),
    type: itemType,
    title: String(data.title ?? "Sin título"),
    content: String(data.content ?? ""),
    visibility,
    sharedWithIds: Array.isArray(data.sharedWithIds)
      ? data.sharedWithIds.map(String).filter(Boolean)
      : [],
    pinned: data.pinned === true,
    eventAt: data.eventAt ? String(data.eventAt) : undefined,
    resourceUrl: data.resourceUrl ? String(data.resourceUrl) : undefined,
    subject: data.subject ? String(data.subject) : undefined,
    group: data.group ? String(data.group) : undefined,
    location: data.location ? String(data.location) : undefined,
    attachments,
    createdAt: asIso(data.createdAt),
    updatedAt: asIso(data.updatedAt),
  };
}

function workspacePayload(input: StaffWorkspaceItemInput) {
  const visibility = ["private", "selected", "staff"].includes(input.visibility)
    ? input.visibility
    : "private";
  return {
    type: input.type,
    title: input.title.trim().slice(0, 120),
    content: input.content.trim().slice(0, 200_000),
    visibility,
    sharedWithIds: visibility === "selected"
      ? [...new Set(input.sharedWithIds)].slice(0, 100)
      : [],
    eventAt: input.eventAt?.trim().slice(0, 40) || "",
    resourceUrl: input.resourceUrl?.trim().slice(0, 1_000) || "",
    subject: input.subject?.trim().slice(0, 100) || "",
    group: input.group?.trim().slice(0, 60) || "",
    location: input.location?.trim().slice(0, 120) || "",
    attachments: input.attachments.slice(0, 50).map((attachment) => ({
      id: attachment.id.slice(0, 100),
      name: attachment.name.slice(0, 180),
      contentType: attachment.contentType.slice(0, 120),
      size: Math.max(0, Math.round(attachment.size)),
      storagePath: attachment.storagePath.slice(0, 1_000),
      url: attachment.url.slice(0, 2_000),
    })),
  };
}

export function watchStaffWorkspace(
  profile: UserProfile,
  callback: (items: StaffWorkspaceItem[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!firebase.db || profile.role === "student") {
    callback([]);
    return () => undefined;
  }
  const source = workspaceCollection(profile.institutionId);
  const snapshots = new Map<string, QuerySnapshot<DocumentData>>();
  const emit = () => {
    const items = new Map<string, StaffWorkspaceItem>();
    snapshots.forEach((snapshot) => {
      snapshot.docs.forEach((entry) => {
        items.set(entry.id, workspaceItemFromData(entry.id, entry.data()));
      });
    });
    callback(
      [...items.values()].sort((first, second) => {
        if (first.pinned !== second.pinned) return first.pinned ? -1 : 1;
        return second.updatedAt.localeCompare(first.updatedAt);
      }),
    );
  };
  const subscribe = (
    key: string,
    sourceQuery: Query<DocumentData, DocumentData>,
  ) => onSnapshot(
    sourceQuery,
    (snapshot) => {
      snapshots.set(key, snapshot);
      emit();
    },
    (error) => onError?.(error),
  );
  const stops = [
    subscribe("owned", query(source, where("ownerId", "==", profile.uid))),
    subscribe("shared", query(source, where("visibility", "==", "staff"))),
    subscribe(
      "selected",
      query(source, where("sharedWithIds", "array-contains", profile.uid)),
    ),
  ];
  return () => stops.forEach((stop) => stop());
}

export async function createStaffWorkspaceItem(
  profile: UserProfile,
  input: StaffWorkspaceItemInput,
  itemId?: string,
) {
  const reference = itemId
    ? doc(workspaceCollection(profile.institutionId), itemId)
    : doc(workspaceCollection(profile.institutionId));
  await setDoc(reference, {
    ...workspacePayload(input),
    institutionId: profile.institutionId,
    ownerId: profile.uid,
    ownerName: profile.name,
    pinned: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return reference.id;
}

export async function updateStaffWorkspaceItem(
  profile: UserProfile,
  itemId: string,
  input: StaffWorkspaceItemInput,
) {
  await updateDoc(
    doc(workspaceCollection(profile.institutionId), itemId),
    { ...workspacePayload(input), updatedAt: serverTimestamp() },
  );
}

export async function setStaffWorkspaceItemPinned(
  profile: UserProfile,
  itemId: string,
  pinned: boolean,
) {
  await updateDoc(doc(workspaceCollection(profile.institutionId), itemId), {
    pinned,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteStaffWorkspaceItem(
  profile: UserProfile,
  item: StaffWorkspaceItem,
) {
  await deleteDoc(doc(workspaceCollection(profile.institutionId), item.id));
  if (!firebase.storage) return;
  await Promise.all(
    item.attachments
      .filter((attachment) => attachment.storagePath)
      .map((attachment) =>
        deleteObject(ref(firebase.storage!, attachment.storagePath)).catch(() => undefined),
      ),
  );
}

function safeFileName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "archivo";
}

export async function uploadStaffWorkspaceFile(
  profile: UserProfile,
  itemId: string,
  file: File,
): Promise<StaffWorkspaceAttachment> {
  if (file.size > 25 * 1024 * 1024) {
    throw new Error("Cada archivo debe pesar menos de 25 MB.");
  }
  const storage = requireWorkspaceStorage();
  const id = crypto.randomUUID();
  const storagePath = `institutions/${profile.institutionId}/staff-workspace/${itemId}/${profile.uid}/${id}-${safeFileName(file.name)}`;
  const storageReference = ref(storage, storagePath);
  await uploadBytes(storageReference, file, {
    contentType: file.type || "application/octet-stream",
  });
  const url = await getDownloadURL(storageReference);
  return {
    id,
    name: file.name.slice(0, 180),
    contentType: file.type || "application/octet-stream",
    size: file.size,
    storagePath,
    url,
  };
}

export async function deleteStaffWorkspaceFile(storagePath: string) {
  if (!storagePath || !firebase.storage) return;
  await deleteObject(ref(firebase.storage, storagePath)).catch(() => undefined);
}
