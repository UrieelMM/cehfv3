import { algoliasearch } from "algoliasearch";
import { getFirestore, type DocumentData } from "firebase-admin/firestore";
import { defineSecret, defineString } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  forumPostSearchRecord,
  forumTopicSearchRecord,
  materialSearchRecord,
  reportSearchRecord,
  reviewSearchRecord,
  searchTokensForUser,
  storySearchRecord,
  taskSearchRecord,
  workshopResourceSearchRecord,
  workshopSearchRecord,
  workshopTaskSearchRecord,
  workspaceSearchRecord,
  type SearchRecord,
} from "./search-core.js";

const firestore = () => getFirestore();
const algoliaAppId = defineString("ALGOLIA_APP_ID");
const algoliaIndexName = defineString("ALGOLIA_INDEX_NAME", {
  default: "cehf_portal_search",
});
const algoliaAdminApiKey = defineSecret("ALGOLIA_ADMIN_API_KEY");
const algoliaSearchApiKey = defineSecret("ALGOLIA_SEARCH_API_KEY");

const searchAdminSecrets = [algoliaAdminApiKey];
let settingsPromise: Promise<unknown> | undefined;

function adminClient() {
  return algoliasearch(algoliaAppId.value(), algoliaAdminApiKey.value());
}

function ensureIndexSettings() {
  settingsPromise ??= (async () => {
    const client = adminClient();
    const indexName = algoliaIndexName.value();
    const response = await client.setSettings({
      indexName,
      indexSettings: {
        searchableAttributes: [
          "title",
          "unordered(excerpt)",
          "unordered(searchableText)",
          "unordered(subject)",
          "unordered(context)",
        ],
        attributesForFaceting: [
          "filterOnly(institutionId)",
          "filterOnly(visibleBy)",
          "filterOnly(entityType)",
          "filterOnly(status)",
        ],
        attributesToRetrieve: [
          "objectID",
          "entityType",
          "entityId",
          "parentId",
          "title",
          "excerpt",
          "subject",
          "context",
          "status",
          "route",
          "updatedAt",
        ],
        unretrievableAttributes: ["visibleBy", "institutionId", "searchableText"],
        customRanking: ["desc(updatedAt)"],
        typoTolerance: true,
        hitsPerPage: 10,
      },
    });
    return client.waitForTask({ indexName, taskID: response.taskID });
  })();
  return settingsPromise;
}

async function saveRecord(record: SearchRecord | null, objectID: string) {
  await ensureIndexSettings();
  if (!record || !record.institutionId || record.visibleBy.length === 0) {
    await adminClient().deleteObject({
      indexName: algoliaIndexName.value(),
      objectID,
    });
    return;
  }
  await adminClient().saveObject({
    indexName: algoliaIndexName.value(),
    body: record,
  });
}

function afterData(event: { data?: { after: { exists: boolean; data(): DocumentData | undefined } } }) {
  return event.data?.after.exists ? event.data.after.data() ?? null : null;
}

function searchTrigger(
  document: string,
  entityType: string,
  mapper: (event: Parameters<Parameters<typeof onDocumentWritten>[1]>[0]) => Promise<SearchRecord | null> | SearchRecord | null,
) {
  return onDocumentWritten(
    { document, retry: true, secrets: searchAdminSecrets },
    async (event) => {
      const params = event.params as Record<string, string>;
      const entityId = params.taskId ?? params.reviewId ?? params.materialId
        ?? params.storyId ?? params.topicId ?? params.postId ?? params.itemId
        ?? params.workshopId ?? params.resourceId ?? params.reportId;
      if (!entityId) return;
      try {
        const record = await mapper(event);
        const sourceData = event.data?.after.exists
          ? event.data.after.data()
          : event.data?.before.data();
        const institutionId = String(
          record?.institutionId ?? params.institutionId ?? sourceData?.institutionId ?? "",
        );
        const parent = ["workshop_resource", "workshop_task"].includes(entityType)
          ? `${params.workshopId}:`
          : "";
        await saveRecord(
          record,
          `${institutionId}:${entityType}:${parent}${entityId}`,
        );
      } catch (error) {
        settingsPromise = undefined;
        logger.error("Algolia search synchronization failed", {
          entityType,
          entityId,
          error,
        });
        throw error;
      }
    },
  );
}

export const syncSearchTask = searchTrigger(
  "institutions/{institutionId}/ciclosEscolares/{schoolYearId}/bimestres/{termId}/semanas/{weekId}/materias/{subjectId}/tareas/{taskId}",
  "task",
  (event) => {
    const data = afterData(event);
    return data ? taskSearchRecord(event.params.taskId, data) : null;
  },
);

export const syncSearchReview = searchTrigger(
  "weeklyReviews/{reviewId}",
  "review",
  (event) => {
    const data = afterData(event);
    return data ? reviewSearchRecord(event.params.reviewId, data) : null;
  },
);

export const syncSearchMaterial = searchTrigger(
  "institutions/{institutionId}/materials/{materialId}",
  "material",
  (event) => {
    const data = afterData(event);
    return data ? materialSearchRecord(event.params.materialId, data) : null;
  },
);

export const syncSearchStory = searchTrigger(
  "wallPosts/{storyId}",
  "story",
  (event) => {
    const data = afterData(event);
    return data ? storySearchRecord(event.params.storyId, data) : null;
  },
);

export const syncSearchForumTopic = searchTrigger(
  "forumTopics/{topicId}",
  "forum_topic",
  (event) => {
    const data = afterData(event);
    return data && !data.deletedAt
      ? forumTopicSearchRecord(event.params.topicId, data)
      : null;
  },
);

export const syncSearchForumPost = searchTrigger(
  "forumPosts/{postId}",
  "forum_post",
  async (event) => {
    const data = afterData(event);
    if (!data) return null;
    const topicId = String(data.topicId ?? "");
    const topic = topicId
      ? await firestore().doc(`forumTopics/${topicId}`).get()
      : null;
    return forumPostSearchRecord(
      event.params.postId,
      data,
      topic?.data() ?? {},
    );
  },
);

export const syncSearchWorkspace = searchTrigger(
  "institutions/{institutionId}/staffWorkspace/{itemId}",
  "workspace",
  (event) => {
    const data = afterData(event);
    return data ? workspaceSearchRecord(event.params.itemId, data) : null;
  },
);

export const syncSearchWorkshop = searchTrigger(
  "institutions/{institutionId}/workshops/{workshopId}",
  "workshop",
  (event) => {
    const data = afterData(event);
    return data ? workshopSearchRecord(event.params.workshopId, data) : null;
  },
);

export const syncSearchWorkshopResource = searchTrigger(
  "institutions/{institutionId}/workshops/{workshopId}/resources/{resourceId}",
  "workshop_resource",
  async (event) => {
    const data = afterData(event);
    if (!data) return null;
    const workshop = await firestore().doc(
      `institutions/${event.params.institutionId}/workshops/${event.params.workshopId}`,
    ).get();
    if (!workshop.exists) return null;
    return workshopResourceSearchRecord(
      event.params.resourceId,
      event.params.workshopId,
      data,
      workshop.data() ?? {},
    );
  },
);

export const syncSearchWorkshopTask = searchTrigger(
  "institutions/{institutionId}/workshops/{workshopId}/tasks/{taskId}",
  "workshop_task",
  async (event) => {
    const data = afterData(event);
    if (!data) return null;
    const workshop = await firestore().doc(
      `institutions/${event.params.institutionId}/workshops/${event.params.workshopId}`,
    ).get();
    return workshopTaskSearchRecord(
      event.params.taskId,
      event.params.workshopId,
      data,
      workshop.data() ?? {},
    );
  },
);

export const syncSearchWorkshopChildren = onDocumentWritten(
  {
    document: "institutions/{institutionId}/workshops/{workshopId}",
    retry: true,
    secrets: searchAdminSecrets,
  },
  async (event) => {
    const workshopId = event.params.workshopId;
    const institutionId = event.params.institutionId;
    const workshop = afterData(event);
    const reference = firestore().doc(
      `institutions/${institutionId}/workshops/${workshopId}`,
    );
    const [resources, tasks] = await Promise.all([
      reference.collection("resources").get(),
      reference.collection("tasks").get(),
    ]);
    await Promise.all([
      ...resources.docs.map((doc) => saveRecord(
        workshop
          ? workshopResourceSearchRecord(doc.id, workshopId, doc.data(), workshop)
          : null,
        `${institutionId}:workshop_resource:${workshopId}:${doc.id}`,
      )),
      ...tasks.docs.map((doc) => saveRecord(
        workshop
          ? workshopTaskSearchRecord(doc.id, workshopId, doc.data(), workshop)
          : null,
        `${institutionId}:workshop_task:${workshopId}:${doc.id}`,
      )),
    ]);
  },
);

export const syncSearchForumTopicPosts = onDocumentWritten(
  {
    document: "forumTopics/{topicId}",
    retry: true,
    secrets: searchAdminSecrets,
  },
  async (event) => {
    const topicId = event.params.topicId;
    const topic = afterData(event);
    const posts = await firestore()
      .collection("forumPosts")
      .where("topicId", "==", topicId)
      .get();
    await Promise.all(posts.docs.map((doc) => saveRecord(
      topic && !topic.deletedAt
        ? forumPostSearchRecord(doc.id, doc.data(), topic)
        : null,
      `${String(doc.data().institutionId ?? topic?.institutionId ?? "")}:forum_post:${doc.id}`,
    )));
  },
);

export const syncSearchReport = searchTrigger(
  "institutions/{institutionId}/studentWeeklyReports/{reportId}",
  "report",
  (event) => {
    const data = afterData(event);
    return data ? reportSearchRecord(event.params.reportId, data) : null;
  },
);

function quotedFilter(value: string) {
  return JSON.stringify(value);
}

export const getPortalSearchAccess = onCall(
  { secrets: [algoliaSearchApiKey] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Inicia sesión para buscar.");
    }
    const profileSnapshot = await firestore().doc(`users/${request.auth.uid}`).get();
    const profile = profileSnapshot.data();
    if (!profileSnapshot.exists || profile?.active !== true || !profile.institutionId) {
      throw new HttpsError("permission-denied", "Tu cuenta no tiene acceso al buscador.");
    }
    if (
      profile.role === "director"
      && (
        request.auth.token.role !== "director"
        || request.auth.token.institutionId !== profile.institutionId
        || request.auth.token.allPermissions !== true
      )
    ) {
      throw new HttpsError("permission-denied", "Actualiza tu sesión para buscar como Dirección.");
    }
    const tokens = searchTokensForUser(profile, request.auth.uid);
    const filters = [
      `institutionId:${quotedFilter(String(profile.institutionId))}`,
      `(${tokens.map((token) => `visibleBy:${quotedFilter(token)}`).join(" OR ")})`,
    ].join(" AND ");
    const validUntil = Math.floor(Date.now() / 1000) + 60 * 60;
    const client = algoliasearch(algoliaAppId.value(), algoliaSearchApiKey.value());
    const securedApiKey = client.generateSecuredApiKey({
      parentApiKey: algoliaSearchApiKey.value(),
      restrictions: {
        filters,
        restrictIndices: [algoliaIndexName.value()],
        userToken: request.auth.uid,
        validUntil,
      },
    });
    return {
      appId: algoliaAppId.value(),
      indexName: algoliaIndexName.value(),
      securedApiKey,
      expiresAt: validUntil * 1000,
    };
  },
);

export const backfillPortalSearch = onCall(
  { timeoutSeconds: 540, memory: "1GiB", secrets: searchAdminSecrets },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Inicia sesión para continuar.");
    const profileSnapshot = await firestore().doc(`users/${request.auth.uid}`).get();
    const profile = profileSnapshot.data();
    const institutionId = String(profile?.institutionId ?? "");
    if (
      !profileSnapshot.exists
      || profile?.active !== true
      || profile.role !== "director"
      || request.auth.token.role !== "director"
      || request.auth.token.institutionId !== institutionId
      || request.auth.token.allPermissions !== true
    ) {
      throw new HttpsError("permission-denied", "Sólo Dirección puede reconstruir el buscador.");
    }

    const [tasks, reviews, materials, stories, topics, posts, workspace, workshops, reports] =
      await Promise.all([
        firestore().collectionGroup("tareas").where("institutionId", "==", institutionId).get(),
        firestore().collection("weeklyReviews").where("institutionId", "==", institutionId).get(),
        firestore().collection(`institutions/${institutionId}/materials`).get(),
        firestore().collection("wallPosts").where("institutionId", "==", institutionId).get(),
        firestore().collection("forumTopics").where("institutionId", "==", institutionId).get(),
        firestore().collection("forumPosts").where("institutionId", "==", institutionId).get(),
        firestore().collection(`institutions/${institutionId}/staffWorkspace`).get(),
        firestore().collection(`institutions/${institutionId}/workshops`).get(),
        firestore().collection(`institutions/${institutionId}/studentWeeklyReports`).get(),
      ]);
    const records: SearchRecord[] = [
      ...tasks.docs.map((doc) => taskSearchRecord(doc.id, doc.data())),
      ...reviews.docs.map((doc) => reviewSearchRecord(doc.id, doc.data())),
      ...materials.docs.map((doc) => materialSearchRecord(doc.id, doc.data())),
      ...stories.docs.map((doc) => storySearchRecord(doc.id, doc.data())),
      ...topics.docs
        .filter((doc) => !doc.data().deletedAt)
        .map((doc) => forumTopicSearchRecord(doc.id, doc.data())),
      ...workspace.docs.map((doc) => workspaceSearchRecord(doc.id, doc.data())),
      ...workshops.docs.map((doc) => workshopSearchRecord(doc.id, doc.data())),
      ...reports.docs.map((doc) => reportSearchRecord(doc.id, doc.data())),
    ];
    const topicsById = new Map(topics.docs.map((doc) => [doc.id, doc.data()]));
    posts.docs.forEach((doc) => {
      const topic = topicsById.get(String(doc.data().topicId ?? ""));
      if (topic && !topic.deletedAt) {
        records.push(forumPostSearchRecord(doc.id, doc.data(), topic));
      }
    });
    for (const workshop of workshops.docs) {
      const [resources, workshopTasks] = await Promise.all([
        workshop.ref.collection("resources").get(),
        workshop.ref.collection("tasks").get(),
      ]);
      resources.docs.forEach((doc) => records.push(workshopResourceSearchRecord(
        doc.id,
        workshop.id,
        doc.data(),
        workshop.data(),
      )));
      workshopTasks.docs.forEach((doc) => records.push(workshopTaskSearchRecord(
        doc.id,
        workshop.id,
        doc.data(),
        workshop.data(),
      )));
    }
    if (records.length > 45_000) {
      throw new HttpsError(
        "resource-exhausted",
        "La institución supera el margen seguro del plan gratuito de Algolia.",
      );
    }
    await ensureIndexSettings();
    const client = adminClient();
    const indexName = algoliaIndexName.value();
    const deletion = await client.deleteBy({
      indexName,
      deleteByParams: {
        filters: `institutionId:${quotedFilter(institutionId)}`,
      },
    });
    await client.waitForTask({ indexName, taskID: deletion.taskID });
    if (records.length) {
      await client.saveObjects({
        indexName,
        objects: records,
        waitForTasks: true,
      });
    }
    logger.info("Portal search backfill completed", {
      institutionId,
      records: records.length,
      actorId: request.auth.uid,
    });
    return { ok: true as const, records: records.length };
  },
);
