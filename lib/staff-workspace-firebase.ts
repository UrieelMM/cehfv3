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
import { firebase } from "./firebase";
import type {
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
  const visibility: StaffWorkspaceVisibility = data.visibility === "staff"
    ? "staff"
    : "private";
  return {
    id,
    institutionId: String(data.institutionId ?? ""),
    ownerId: String(data.ownerId ?? ""),
    ownerName: String(data.ownerName ?? "Equipo CEHF"),
    type: itemType,
    title: String(data.title ?? "Sin título"),
    content: String(data.content ?? ""),
    visibility,
    pinned: data.pinned === true,
    eventAt: data.eventAt ? String(data.eventAt) : undefined,
    resourceUrl: data.resourceUrl ? String(data.resourceUrl) : undefined,
    createdAt: asIso(data.createdAt),
    updatedAt: asIso(data.updatedAt),
  };
}

function workspacePayload(input: StaffWorkspaceItemInput) {
  return {
    type: input.type,
    title: input.title.trim().slice(0, 120),
    content: input.content.trim().slice(0, 8_000),
    visibility: input.visibility,
    eventAt: input.eventAt?.trim().slice(0, 40) || "",
    resourceUrl: input.resourceUrl?.trim().slice(0, 1_000) || "",
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
  ];
  return () => stops.forEach((stop) => stop());
}

export async function createStaffWorkspaceItem(
  profile: UserProfile,
  input: StaffWorkspaceItemInput,
) {
  const reference = doc(workspaceCollection(profile.institutionId));
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
  itemId: string,
) {
  await deleteDoc(doc(workspaceCollection(profile.institutionId), itemId));
}
