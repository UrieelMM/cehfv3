export type SearchEntityType =
  | "task"
  | "review"
  | "material"
  | "story"
  | "forum_topic"
  | "forum_post"
  | "workspace"
  | "workshop"
  | "workshop_resource"
  | "workshop_task"
  | "report";

export type SearchRecord = {
  objectID: string;
  institutionId: string;
  entityType: SearchEntityType;
  entityId: string;
  parentId?: string;
  title: string;
  excerpt: string;
  searchableText: string;
  subject: string;
  context: string;
  status: string;
  route: string;
  updatedAt: number;
  visibleBy: string[];
};

type SearchData = Record<string, unknown>;

const text = (value: unknown) => String(value ?? "").trim();

const list = (value: unknown) =>
  Array.isArray(value) ? value.map(text).filter(Boolean) : [];

const clip = (value: unknown, length: number) =>
  text(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, length);

const timestamp = (value: unknown) => {
  if (value && typeof value === "object" && "toMillis" in value) {
    const toMillis = (value as { toMillis?: unknown }).toMillis;
    if (typeof toMillis === "function") {
      return Number(toMillis.call(value)) || Date.now();
    }
  }
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : Date.now();
};

export const institutionToken = (institutionId: string, scope: string) =>
  `institution:${institutionId}:${scope}`;

export const userToken = (institutionId: string, uid: string) =>
  institutionToken(institutionId, `user:${uid}`);

export const roleToken = (institutionId: string, role: string) =>
  institutionToken(institutionId, `role:${role}`);

export const groupToken = (institutionId: string, group: string) =>
  institutionToken(institutionId, `group:${text(group).toLocaleLowerCase("es")}`);

const unique = (values: string[]) => [...new Set(values.filter(Boolean))];

export function searchTokensForUser(profile: SearchData, uid: string) {
  const institutionId = text(profile.institutionId);
  const role = text(profile.role);
  const tokens = [userToken(institutionId, uid), roleToken(institutionId, role)];
  if (role === "director") tokens.push(roleToken(institutionId, "staff"));
  if (role === "teacher") tokens.push(roleToken(institutionId, "staff"));
  if (role === "student") {
    const group = `${text(profile.grade)} ${text(profile.group)}`.trim();
    if (group) tokens.push(groupToken(institutionId, group));
  }
  return unique(tokens);
}

function baseRecord(
  entityType: SearchEntityType,
  entityId: string,
  institutionId: string,
  data: SearchData,
  values: Omit<
    SearchRecord,
    "objectID" | "institutionId" | "entityType" | "entityId" | "updatedAt"
  >,
): SearchRecord {
  return {
    objectID: `${institutionId}:${entityType}:${entityId}`,
    institutionId,
    entityType,
    entityId,
    ...values,
    title: clip(values.title, 180),
    excerpt: clip(values.excerpt, 500),
    searchableText: clip(values.searchableText, 4_000),
    subject: clip(values.subject, 100),
    context: clip(values.context, 180),
    status: clip(values.status, 40),
    updatedAt: timestamp(data.updatedAt ?? data.createdAt ?? data.publishedAt),
    visibleBy: unique(values.visibleBy),
  };
}

export function taskSearchRecord(entityId: string, data: SearchData) {
  const institutionId = text(data.institutionId);
  const status = text(data.status);
  const visibleBy = [
    roleToken(institutionId, "director"),
    userToken(institutionId, text(data.createdBy)),
  ];
  if (["published", "closed"].includes(status)) {
    visibleBy.push(groupToken(institutionId, text(data.targetGroup)));
  }
  const links = Array.isArray(data.links) ? data.links : [];
  const attachments = Array.isArray(data.attachments) ? data.attachments : [];
  return baseRecord("task", entityId, institutionId, data, {
    title: text(data.title) || "Tarea",
    excerpt: text(data.description),
    searchableText: [
      data.description,
      data.teacherName,
      ...links.map((item) => text((item as SearchData)?.label)),
      ...attachments.map((item) => text((item as SearchData)?.name)),
    ].join(" "),
    subject: text(data.subject),
    context: [data.weekLabel, data.targetGroup].map(text).filter(Boolean).join(" · "),
    status,
    route: `/tasks/${encodeURIComponent(entityId)}`,
    visibleBy,
  });
}

export function reviewSearchRecord(entityId: string, data: SearchData) {
  const institutionId = text(data.institutionId);
  const status = text(data.status);
  const visibleBy = [roleToken(institutionId, "director")];
  list(data.managerIds).forEach((uid) => visibleBy.push(userToken(institutionId, uid)));
  if (["published", "closed"].includes(status)) {
    list(data.audienceStudentIds).forEach((uid) => visibleBy.push(userToken(institutionId, uid)));
  }
  return baseRecord("review", entityId, institutionId, data, {
    title: text(data.title) || "Repaso",
    excerpt: text(data.description),
    searchableText: [data.description, data.createdByName, ...list(data.targetGroups)].join(" "),
    subject: text(data.subject),
    context: text(data.weekLabel),
    status,
    route: `/weekly-review/${encodeURIComponent(entityId)}`,
    visibleBy,
  });
}

export function materialSearchRecord(entityId: string, data: SearchData) {
  const institutionId = text(data.institutionId);
  const visibleBy = [roleToken(institutionId, "director")];
  list(data.managerIds).forEach((uid) => visibleBy.push(userToken(institutionId, uid)));
  list(data.audienceStudentIds).forEach((uid) => visibleBy.push(userToken(institutionId, uid)));
  const links = Array.isArray(data.links) ? data.links : [];
  const attachments = Array.isArray(data.attachments) ? data.attachments : [];
  return baseRecord("material", entityId, institutionId, data, {
    title: text(data.title) || "Recurso",
    excerpt: text(data.description),
    searchableText: [
      data.description,
      data.createdByName,
      ...links.map((item) => text((item as SearchData)?.label)),
      ...attachments.map((item) => text((item as SearchData)?.name)),
    ].join(" "),
    subject: text(data.subject),
    context: [data.weekLabel, ...list(data.targetGroups)].map(text).filter(Boolean).join(" · "),
    status: text(data.type) || "resource",
    route: `/weekly-materials/${encodeURIComponent(entityId)}`,
    visibleBy,
  });
}

export function storySearchRecord(entityId: string, data: SearchData) {
  const institutionId = text(data.institutionId);
  const status = text(data.status);
  const visibleBy = [
    roleToken(institutionId, "staff"),
    userToken(institutionId, text(data.authorId)),
  ];
  if (status === "published") visibleBy.push(roleToken(institutionId, "student"));
  return baseRecord("story", entityId, institutionId, data, {
    title: text(data.title) || "Historia",
    excerpt: text(data.lead ?? data.excerpt),
    searchableText: [data.excerpt, data.lead, data.quote, ...list(data.paragraphs), data.author].join(" "),
    subject: text(data.category),
    context: [data.section, data.group, data.author].map(text).filter(Boolean).join(" · "),
    status,
    route: `/wall-newspaper/stories/${encodeURIComponent(entityId)}`,
    visibleBy,
  });
}

export function forumTopicSearchRecord(entityId: string, data: SearchData) {
  const institutionId = text(data.institutionId);
  const visibleBy = [roleToken(institutionId, "staff")];
  list(data.participantIds).forEach((uid) => visibleBy.push(userToken(institutionId, uid)));
  const forumId = text(data.forumId);
  return baseRecord("forum_topic", entityId, institutionId, data, {
    title: text(data.title) || "Tema del foro",
    excerpt: text(data.prompt),
    searchableText: [data.prompt, data.forumName, data.responsible, data.targetGroup, data.group].join(" "),
    subject: text(data.subject),
    context: [data.forumName, data.targetGroup ?? data.group].map(text).filter(Boolean).join(" · "),
    status: text(data.status),
    route: `/forum/${encodeURIComponent(forumId)}/${encodeURIComponent(entityId)}`,
    visibleBy,
  });
}

export function forumPostSearchRecord(
  entityId: string,
  data: SearchData,
  topic: SearchData = {},
) {
  const institutionId = text(data.institutionId);
  const visibleBy = [roleToken(institutionId, "staff")];
  if (text(data.status) !== "hidden") {
    list(data.participantIds).forEach((uid) => visibleBy.push(userToken(institutionId, uid)));
  }
  const topicId = text(data.topicId);
  const forumId = text(data.forumId ?? topic.forumId);
  return baseRecord("forum_post", entityId, institutionId, data, {
    title: `Respuesta de ${text(data.authorName) || "la comunidad"}`,
    excerpt: text(data.body),
    searchableText: [data.body, data.authorName, topic.title, topic.subject].join(" "),
    subject: text(topic.subject) || "Foro",
    context: text(data.topicTitle ?? topic.title),
    status: text(data.status),
    route: `/forum/${encodeURIComponent(forumId)}/${encodeURIComponent(topicId)}?post=${encodeURIComponent(entityId)}`,
    visibleBy,
  });
}

export function workspaceSearchRecord(entityId: string, data: SearchData) {
  const institutionId = text(data.institutionId);
  const visibility = text(data.visibility);
  const visibleBy = [userToken(institutionId, text(data.ownerId))];
  if (visibility === "staff") visibleBy.push(roleToken(institutionId, "staff"));
  if (visibility === "selected") {
    list(data.sharedWithIds).forEach((uid) => visibleBy.push(userToken(institutionId, uid)));
  }
  return baseRecord("workspace", entityId, institutionId, data, {
    title: text(data.title) || "Mi espacio",
    excerpt: text(data.content),
    searchableText: [data.content, data.ownerName, data.folder, ...list(data.tags)].join(" "),
    subject: text(data.subject),
    context: [data.ownerName, data.type, data.group].map(text).filter(Boolean).join(" · "),
    status: text(data.archived) === "true" ? "archived" : visibility,
    route: `/my-space/${encodeURIComponent(entityId)}`,
    visibleBy,
  });
}

export function workshopSearchRecord(entityId: string, data: SearchData) {
  const institutionId = text(data.institutionId);
  const visibleBy = [roleToken(institutionId, "director")];
  list(data.memberIds).forEach((uid) => visibleBy.push(userToken(institutionId, uid)));
  return baseRecord("workshop", entityId, institutionId, data, {
    title: text(data.title) || "Taller",
    excerpt: text(data.description),
    searchableText: [data.description, data.shortTitle, data.kind].join(" "),
    subject: "Taller",
    context: text(data.shortTitle),
    status: "active",
    route: `/workshops/${encodeURIComponent(entityId)}`,
    visibleBy,
  });
}

export function workshopResourceSearchRecord(
  entityId: string,
  workshopId: string,
  data: SearchData,
  workshop: SearchData,
) {
  const institutionId = text(data.institutionId ?? workshop.institutionId);
  const visibleBy = [roleToken(institutionId, "director")];
  list(workshop.memberIds).forEach((uid) => visibleBy.push(userToken(institutionId, uid)));
  const record = baseRecord("workshop_resource", entityId, institutionId, data, {
    parentId: workshopId,
    title: text(data.title) || text(data.fileName) || "Recurso del taller",
    excerpt: text(data.description),
    searchableText: [data.description, data.fileName, data.uploadedByName, workshop.title].join(" "),
    subject: text(workshop.title),
    context: "Recurso de taller",
    status: "resource",
    route: `/workshops/${encodeURIComponent(workshopId)}?resource=${encodeURIComponent(entityId)}`,
    visibleBy,
  });
  return {
    ...record,
    objectID: `${institutionId}:workshop_resource:${workshopId}:${entityId}`,
  };
}

export function workshopTaskSearchRecord(
  entityId: string,
  workshopId: string,
  data: SearchData,
  workshop: SearchData = {},
) {
  const institutionId = text(data.institutionId);
  const status = text(data.status);
  const members = new Set(list(workshop.memberIds));
  const createdBy = text(data.createdBy);
  const visibleBy = [roleToken(institutionId, "director")];
  if (members.has(createdBy)) visibleBy.push(userToken(institutionId, createdBy));
  if (["published", "closed"].includes(status)) {
    list(data.audienceStudentIds)
      .filter((uid) => members.has(uid))
      .forEach((uid) => visibleBy.push(userToken(institutionId, uid)));
  }
  const record = baseRecord("workshop_task", entityId, institutionId, data, {
    parentId: workshopId,
    title: text(data.title) || "Actividad de taller",
    excerpt: text(data.description),
    searchableText: [data.description, data.teacherName].join(" "),
    subject: "Taller",
    context: text(data.teacherName),
    status,
    route: `/workshops/${encodeURIComponent(workshopId)}?task=${encodeURIComponent(entityId)}`,
    visibleBy,
  });
  return {
    ...record,
    objectID: `${institutionId}:workshop_task:${workshopId}:${entityId}`,
  };
}

export function reportSearchRecord(entityId: string, data: SearchData) {
  const institutionId = text(data.institutionId);
  const status = text(data.status);
  const visibleBy = [
    roleToken(institutionId, "director"),
    userToken(institutionId, text(data.teacherId)),
  ];
  if (status === "published") {
    visibleBy.push(userToken(institutionId, text(data.studentId)));
  }
  return baseRecord("report", entityId, institutionId, data, {
    title: `Reporte de ${text(data.studentName) || "alumno"}`,
    excerpt: text(data.achievement),
    searchableText: [data.achievement, data.supportArea, data.nextStep, data.studentName, data.teacherName].join(" "),
    subject: text(data.subject),
    context: [data.weekLabel, data.studentGrade, data.studentGroup].map(text).filter(Boolean).join(" · "),
    status,
    route: `/reports/${encodeURIComponent(entityId)}`,
    visibleBy,
  });
}
