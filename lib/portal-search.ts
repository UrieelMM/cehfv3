"use client";

import { liteClient } from "algoliasearch/lite";
import { httpsCallable } from "firebase/functions";
import { firebase } from "./firebase";
import type { PortalSearchEntityType, PortalSearchHit } from "./types";

type SearchAccess = {
  appId: string;
  indexName: string;
  securedApiKey: string;
  expiresAt: number;
};

const accessByUser = new Map<string, Promise<SearchAccess>>();

async function getAccess(uid: string) {
  const existing = accessByUser.get(uid);
  if (existing) {
    const access = await existing;
    if (access.expiresAt > Date.now() + 60_000) return access;
    accessByUser.delete(uid);
  }
  if (!firebase.functions) throw new Error("El buscador todavía no está configurado.");
  const request = httpsCallable<Record<string, never>, SearchAccess>(
    firebase.functions,
    "getPortalSearchAccess",
  )({});
  accessByUser.set(uid, request.then(({ data }) => data));
  try {
    return await accessByUser.get(uid)!;
  } catch (error) {
    accessByUser.delete(uid);
    throw error;
  }
}

export async function searchPortal(
  uid: string,
  query: string,
  entityTypes?: PortalSearchEntityType[],
) {
  const access = await getAccess(uid);
  const client = liteClient(access.appId, access.securedApiKey);
  const { results } = await client.searchForHits<PortalSearchHit>({
    requests: [{
      indexName: access.indexName,
      query: query.trim(),
      hitsPerPage: 30,
      attributesToHighlight: ["title", "excerpt", "subject", "context"],
      highlightPreTag: "<mark>",
      highlightPostTag: "</mark>",
      ...(entityTypes?.length
        ? {
            filters: `(${entityTypes
              .map((entityType) => `entityType:${JSON.stringify(entityType)}`)
              .join(" OR ")})`,
          }
        : {}),
    }],
  });
  return (results[0]?.hits ?? []) as PortalSearchHit[];
}

export function searchLocalPortal(
  records: PortalSearchHit[],
  query: string,
  entityTypes?: PortalSearchEntityType[],
) {
  const normalized = query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
  return records
    .filter((record) => !entityTypes?.length || entityTypes.includes(record.entityType))
    .filter((record) =>
      [record.title, record.excerpt, record.subject, record.context]
        .join(" ")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("es")
        .includes(normalized),
    )
    .sort((first, second) => second.updatedAt - first.updatedAt)
    .slice(0, 30);
}

export async function backfillPortalSearch() {
  if (!firebase.functions) throw new Error("Firebase Functions no está configurado.");
  const callable = httpsCallable<
    Record<string, never>,
    { ok: true; records: number }
  >(firebase.functions, "backfillPortalSearch");
  return (await callable({})).data;
}
