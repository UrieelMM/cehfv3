"use client";

import {
  Archive,
  AtSign,
  BadgeCheck,
  BookOpen,
  Bookmark,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock3,
  EyeOff,
  FileText,
  Flag,
  GraduationCap,
  Hash,
  ImagePlus,
  Lightbulb,
  LockKeyhole,
  Megaphone,
  MessageCircle,
  MessagesSquare,
  MoreHorizontal,
  Paperclip,
  Pin,
  RotateCcw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  ThumbsUp,
  Users,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type {
  ForumAttachment,
  ForumModerationCase,
  ForumReactionKind,
  ForumReply,
  ForumTopic,
  PortalState,
  Role,
  UserProfile,
} from "@/lib/types";

type ForumPageProps = {
  state: PortalState;
  updateState: (
    updater: (previous: PortalState) => PortalState,
    message?: string,
  ) => void;
  profile: UserProfile;
  role: Role;
};

type TopicStatusFilter = "all" | ForumTopic["status"];
type TopicSort = "recent" | "participation";

const reactionDetails: Record<
  ForumReactionKind,
  { label: string; icon: typeof ThumbsUp }
> = {
  helpful: { label: "Me ayudó", icon: ThumbsUp },
  interesting: { label: "Interesante", icon: Lightbulb },
  celebrate: { label: "¡Gran idea!", icon: Sparkles },
};

const statusDetails: Record<
  ForumTopic["status"],
  { label: string; className: string }
> = {
  open: { label: "Abierto", className: "is-open" },
  scheduled: { label: "Programado", className: "is-scheduled" },
  closed: { label: "Cerrado", className: "is-closed" },
  archived: { label: "Archivado", className: "is-archived" },
};

const forumIconByKind: Record<ForumTopic["kind"], typeof MessageCircle> = {
  weekly_question: CircleHelp,
  subject: GraduationCap,
  reading_club: BookOpen,
  task_help: Lightbulb,
  group_chat: Users,
  wall: FileText,
  announcement: Megaphone,
};

function normalizeTopic(topic: ForumTopic, index: number): ForumTopic {
  return {
    ...topic,
    forumId: topic.forumId ?? `forum-${index}`,
    forumName: topic.forumName ?? topic.subject ?? "Conversaciones",
    kind: topic.kind ?? "subject",
    responsible: topic.responsible ?? "Equipo docente",
    participants: topic.participants ?? [
      "Mariana",
      "Sofía",
      "Diego",
      "Emilia",
    ],
    allowReplies: topic.allowReplies ?? true,
    allowAttachments: topic.allowAttachments ?? false,
    lastActivity: topic.lastActivity ?? "Reciente",
    replies: (topic.replies ?? []).map((reply) => ({
      status: "visible",
      reactions: {},
      reactedByMe: [],
      reports: 0,
      ...reply,
    })),
  };
}

function topicFromPath(topics: ForumTopic[]) {
  if (typeof window === "undefined") return topics[0]?.id;
  const path = window.location.pathname.split("/").filter(Boolean);
  const topicId = path[0] === "forum" ? path.at(-1) : undefined;
  return topics.some((topic) => topic.id === topicId)
    ? topicId
    : topics[0]?.id;
}

function initialsFor(label: string) {
  return label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function ForumPage({
  state,
  updateState,
  profile,
  role,
}: ForumPageProps) {
  const topics = useMemo(
    () => state.forumTopics.map(normalizeTopic),
    [state.forumTopics],
  );
  const [selectedId, setSelectedId] = useState(() => topicFromPath(topics));
  const [selectedSpace, setSelectedSpace] = useState("all");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<TopicStatusFilter>("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [sort, setSort] = useState<TopicSort>("recent");
  const [visibleCount, setVisibleCount] = useState(5);
  const [reply, setReply] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<ForumAttachment | null>(null);
  const [following, setFollowing] = useState<string[]>([]);
  const [guidelinesOpen, setGuidelinesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [moderationOpen, setModerationOpen] = useState(false);
  const [composerError, setComposerError] = useState("");
  const [guidelinesAccepted, setGuidelinesAccepted] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.localStorage.getItem("cehf-forum-guidelines") === "accepted",
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const lastPublishedAtRef = useRef(0);
  const staff = role !== "student";

  const spaces = useMemo(() => {
    const byId = new Map<
      string,
      { id: string; name: string; subject: string; count: number }
    >();
    topics.forEach((topic) => {
      const current = byId.get(topic.forumId);
      byId.set(topic.forumId, {
        id: topic.forumId,
        name: topic.forumName,
        subject: topic.subject,
        count: (current?.count ?? 0) + 1,
      });
    });
    return [...byId.values()];
  }, [topics]);

  const subjects = useMemo(
    () => [...new Set(topics.map((topic) => topic.subject))],
    [topics],
  );

  const filteredTopics = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("es-MX");
    const next = topics.filter((topic) => {
      const matchesQuery =
        !normalizedQuery ||
        [topic.title, topic.prompt, topic.subject, topic.group, topic.forumName]
          .join(" ")
          .toLocaleLowerCase("es-MX")
          .includes(normalizedQuery);
      return (
        matchesQuery &&
        (selectedSpace === "all" || topic.forumId === selectedSpace) &&
        (statusFilter === "all" || topic.status === statusFilter) &&
        (subjectFilter === "all" || topic.subject === subjectFilter)
      );
    });
    if (sort === "participation") {
      next.sort((a, b) => b.replies.length - a.replies.length);
    }
    return next;
  }, [query, selectedSpace, sort, statusFilter, subjectFilter, topics]);

  const selectedTopic =
    topics.find((topic) => topic.id === selectedId) ??
    filteredTopics[0] ??
    topics[0];

  const openModeration = (state.forumModeration ?? []).filter(
    (item) => item.status === "open",
  );

  useEffect(() => {
    const syncTopicWithPath = () => setSelectedId(topicFromPath(topics));
    window.addEventListener("popstate", syncTopicWithPath);
    return () => window.removeEventListener("popstate", syncTopicWithPath);
  }, [topics]);

  if (!selectedTopic) {
    return (
      <div className="empty-state forum-empty">
        <MessageCircle size={30} />
        <h2>Todavía no hay conversaciones</h2>
        <p>Cuando el equipo docente publique un tema, aparecerá aquí.</p>
      </div>
    );
  }

  function selectTopic(topic: ForumTopic) {
    setSelectedId(topic.id);
    setReplyingTo(null);
    const nextPath = `/forum/${topic.forumId}/${topic.id}`;
    window.history.pushState({}, "", nextPath);
  }

  function updateReply(
    topicId: string,
    replyId: string,
    updater: (item: ForumReply) => ForumReply,
    message?: string,
  ) {
    updateState(
      (previous) => ({
        ...previous,
        forumTopics: previous.forumTopics.map((topic) =>
          topic.id === topicId
            ? {
                ...topic,
                replies: topic.replies.map((item) =>
                  item.id === replyId ? updater(item) : item,
                ),
              }
            : topic,
        ),
      }),
      message,
    );
  }

  function reactToReply(replyItem: ForumReply, kind: ForumReactionKind) {
    updateReply(selectedTopic.id, replyItem.id, (item) => {
      const active = item.reactedByMe?.includes(kind) ?? false;
      const reactedByMe = active
        ? (item.reactedByMe ?? []).filter((reaction) => reaction !== kind)
        : [...(item.reactedByMe ?? []), kind];
      return {
        ...item,
        reactedByMe,
        reactions: {
          ...(item.reactions ?? {}),
          [kind]: Math.max(0, (item.reactions?.[kind] ?? 0) + (active ? -1 : 1)),
        },
      };
    });
  }

  function reportReply(replyItem: ForumReply) {
    const caseExists = (state.forumModeration ?? []).some(
      (item) =>
        item.topicId === selectedTopic.id &&
        item.replyId === replyItem.id &&
        item.status === "open",
    );
    if (caseExists) return;
    updateState(
      (previous) => ({
        ...previous,
        forumTopics: previous.forumTopics.map((topic) =>
          topic.id === selectedTopic.id
            ? {
                ...topic,
                replies: topic.replies.map((item) =>
                  item.id === replyItem.id
                    ? { ...item, reports: (item.reports ?? 0) + 1 }
                    : item,
                ),
              }
            : topic,
        ),
        forumModeration: [
          ...(previous.forumModeration ?? []),
          {
            id: `case-${Date.now()}`,
            topicId: selectedTopic.id,
            replyId: replyItem.id,
            author: replyItem.author,
            excerpt: replyItem.body.slice(0, 120),
            reason: "Revisión solicitada por un participante",
            reportedAt: "Ahora",
            status: "open",
          },
        ],
      }),
      "Reporte enviado al equipo de moderación",
    );
  }

  function moderateCase(
    moderationCase: ForumModerationCase,
    action: "hidden" | "dismissed" | "restored",
  ) {
    updateState(
      (previous) => ({
        ...previous,
        forumTopics: previous.forumTopics.map((topic) =>
          topic.id === moderationCase.topicId
            ? {
                ...topic,
                replies: topic.replies.map((item) =>
                  item.id === moderationCase.replyId
                    ? {
                        ...item,
                        status:
                          action === "hidden"
                            ? "hidden"
                            : action === "restored"
                              ? "visible"
                              : item.status,
                      }
                    : item,
                ),
              }
            : topic,
        ),
        forumModeration: (previous.forumModeration ?? []).map((item) =>
          item.id === moderationCase.id
            ? {
                ...item,
                status: action,
                resolvedBy: profile.name,
              }
            : item,
        ),
      }),
      action === "hidden"
        ? "Publicación ocultada y evidencia conservada"
        : action === "restored"
          ? "Publicación restaurada"
          : "Caso descartado",
    );
  }

  function moderateReplyDirectly(
    replyItem: ForumReply,
    action: "hidden" | "restored",
  ) {
    updateState(
      (previous) => {
        const cases = previous.forumModeration ?? [];
        const existing = cases.find(
          (item) =>
            item.topicId === selectedTopic.id &&
            item.replyId === replyItem.id &&
            ["open", "hidden"].includes(item.status),
        );
        const nextCases = existing
          ? cases.map((item) =>
              item.id === existing.id
                ? {
                    ...item,
                    status: action,
                    resolvedBy: profile.name,
                  }
                : item,
            )
          : [
              ...cases,
              {
                id: `case-direct-${Date.now()}`,
                topicId: selectedTopic.id,
                replyId: replyItem.id,
                author: replyItem.author,
                excerpt: replyItem.body.slice(0, 120),
                reason: "Acción directa de moderación",
                reportedAt: "Ahora",
                status: action,
                resolvedBy: profile.name,
              } satisfies ForumModerationCase,
            ];
        return {
          ...previous,
          forumTopics: previous.forumTopics.map((topic) =>
            topic.id === selectedTopic.id
              ? {
                  ...topic,
                  replies: topic.replies.map((item) =>
                    item.id === replyItem.id
                      ? {
                          ...item,
                          status:
                            action === "hidden" ? "hidden" : "visible",
                        }
                      : item,
                  ),
                }
              : topic,
          ),
          forumModeration: nextCases,
        };
      },
      action === "hidden"
        ? "Publicación ocultada y evidencia conservada"
        : "Publicación restaurada",
    );
  }

  function publishReply() {
    const cleanReply = reply.trim();
    if (!cleanReply) return;
    updateState(
      (previous) => ({
        ...previous,
        forumTopics: previous.forumTopics.map((topic) =>
          topic.id === selectedTopic.id
            ? {
                ...topic,
                unreadCount: 0,
                lastActivity: "Ahora",
                replies: [
                  ...topic.replies,
                  {
                    id: `reply-${Date.now()}`,
                    author: profile.name,
                    initials: profile.initials,
                    body: cleanReply,
                    createdAt: "Ahora",
                    teacher: staff,
                    parentId: replyingTo ?? undefined,
                    attachment: attachment ?? undefined,
                    reactions: {},
                    reactedByMe: [],
                    status: "visible",
                    reports: 0,
                  },
                ],
              }
            : topic,
        ),
      }),
      replyingTo
        ? "Tu respuesta se publicó en la conversación"
        : "Tu aportación se publicó en el grupo",
    );
    setReply("");
    setReplyingTo(null);
    setAttachment(null);
    setComposerError("");
    lastPublishedAtRef.current = Date.now();
  }

  function submitReply(event: FormEvent) {
    event.preventDefault();
    const cleanReply = reply.trim();
    const includesPrivateContact =
      /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(cleanReply) ||
      /(?:\+?52[\s.-]?)?(?:\d[\s.-]?){10}\b/.test(cleanReply);
    if (includesPrivateContact) {
      setComposerError(
        "Por seguridad, quita correos o números telefónicos antes de publicar.",
      );
      return;
    }
    if (Date.now() - lastPublishedAtRef.current < 5_000) {
      setComposerError(
        "Espera unos segundos antes de publicar otra aportación.",
      );
      return;
    }
    if (role === "student" && !guidelinesAccepted) {
      setGuidelinesOpen(true);
      return;
    }
    publishReply();
  }

  const parentReply = selectedTopic.replies.find(
    (item) => item.id === replyingTo,
  );
  const mentionMatch = reply.match(/(?:^|\s)@([\p{L}]*)$/u);
  const mentionSuggestions = mentionMatch
    ? selectedTopic.participants
        .filter((participant) =>
          participant
            .toLocaleLowerCase("es-MX")
            .startsWith(mentionMatch[1].toLocaleLowerCase("es-MX")),
        )
        .slice(0, 4)
    : [];

  const topLevelReplies = selectedTopic.replies.filter(
    (item) => !item.parentId,
  );

  return (
    <div className="forum-page">
      <section className="forum-community-hero">
        <div>
          <span className="forum-hero-kicker">
            <span className="forum-live-dot" /> Comunidad activa
          </span>
          <h2>Ideas que crecen cuando las compartimos.</h2>
          <p>
            Un espacio seguro para preguntar, explicar y aprender junto a tu
            grupo.
          </p>
        </div>
        <div className="forum-hero-stats" aria-label="Resumen del foro">
          <div>
            <strong>{topics.filter((topic) => topic.status === "open").length}</strong>
            <span>temas abiertos</span>
          </div>
          <div>
            <strong>
              {topics.reduce((total, topic) => total + topic.replies.length, 0)}
            </strong>
            <span>aportaciones</span>
          </div>
          {staff && (
            <button
              type="button"
              onClick={() => setModerationOpen(true)}
              aria-label={`Abrir moderación, ${openModeration.length} casos pendientes`}
            >
              <ShieldCheck size={20} />
              <span>
                <strong>{openModeration.length}</strong>
                por revisar
              </span>
            </button>
          )}
        </div>
      </section>

      <section className="forum-toolbar panel" aria-label="Buscar y filtrar">
        <div className="forum-search">
          <Search size={18} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar una conversación, materia o grupo…"
            aria-label="Buscar en el foro"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Limpiar búsqueda"
            >
              <X size={16} />
            </button>
          )}
        </div>
        <label className="forum-select">
          <span className="sr-only">Filtrar por materia</span>
          <select
            value={subjectFilter}
            onChange={(event) => setSubjectFilter(event.target.value)}
          >
            <option value="all">Todas las materias</option>
            {subjects.map((subject) => (
              <option key={subject}>{subject}</option>
            ))}
          </select>
          <ChevronDown size={15} aria-hidden="true" />
        </label>
        <label className="forum-select">
          <span className="sr-only">Ordenar conversaciones</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as TopicSort)}
          >
            <option value="recent">Actividad reciente</option>
            <option value="participation">Más participación</option>
          </select>
          <ChevronDown size={15} aria-hidden="true" />
        </label>
        <div className="forum-status-pills" aria-label="Estado de conversación">
          {[
            ["all", "Todos"],
            ["open", "Abiertos"],
            ["scheduled", "Programados"],
            ["closed", "Cerrados"],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={statusFilter === value ? "active" : ""}
              onClick={() => setStatusFilter(value as TopicStatusFilter)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <div className="forum-social-layout">
        <aside className="forum-directory">
          <section className="forum-spaces-card panel">
            <div className="forum-card-heading">
              <div>
                <span>Mis espacios</span>
                <strong>Comunidades</strong>
              </div>
              <Hash size={18} />
            </div>
            <button
              type="button"
              className={`forum-space ${selectedSpace === "all" ? "active" : ""}`}
              onClick={() => setSelectedSpace("all")}
            >
              <span className="forum-space-icon is-all">
                <MessagesSquare size={17} />
              </span>
              <span>
                <strong>Todos los temas</strong>
                <small>Tu comunidad escolar</small>
              </span>
              <em>{topics.length}</em>
            </button>
            {spaces.map((space, index) => {
              const SpaceIcon =
                forumIconByKind[
                  topics.find((topic) => topic.forumId === space.id)?.kind ??
                    "subject"
                ];
              return (
                <button
                  type="button"
                  key={space.id}
                  className={`forum-space ${selectedSpace === space.id ? "active" : ""}`}
                  onClick={() => setSelectedSpace(space.id)}
                >
                  <span
                    className={`forum-space-icon tone-${(index % 4) + 1}`}
                  >
                    <SpaceIcon size={17} />
                  </span>
                  <span>
                    <strong>{space.name}</strong>
                    <small>{space.subject}</small>
                  </span>
                  <em>{space.count}</em>
                </button>
              );
            })}
          </section>

          <section className="forum-topic-card panel">
            <div className="forum-card-heading compact">
              <div>
                <span>Conversaciones</span>
                <strong>
                  {filteredTopics.length}{" "}
                  {filteredTopics.length === 1 ? "tema" : "temas"}
                </strong>
              </div>
            </div>
            <div className="forum-topic-list">
              {filteredTopics.slice(0, visibleCount).map((topic) => {
                const TopicIcon = forumIconByKind[topic.kind];
                const visibleReplies = topic.replies.filter(
                  (item) => item.status !== "hidden",
                ).length;
                return (
                  <button
                    type="button"
                    key={topic.id}
                    className={`forum-topic-item ${selectedTopic.id === topic.id ? "active" : ""}`}
                    onClick={() => selectTopic(topic)}
                  >
                    <span className="forum-topic-item-icon">
                      <TopicIcon size={17} />
                    </span>
                    <span className="forum-topic-item-copy">
                      <span>
                        {topic.pinned && <Pin size={12} aria-label="Fijado" />}
                        <small>{topic.forumName}</small>
                      </span>
                      <strong>{topic.title}</strong>
                      <em>
                        {visibleReplies} respuestas · {topic.lastActivity}
                      </em>
                    </span>
                    {!!topic.unreadCount && (
                      <span
                        className="forum-unread"
                        aria-label={`${topic.unreadCount} novedades`}
                      >
                        {topic.unreadCount}
                      </span>
                    )}
                  </button>
                );
              })}
              {!filteredTopics.length && (
                <div className="forum-no-results">
                  <Search size={22} />
                  <strong>Sin coincidencias</strong>
                  <span>Prueba con otro filtro o búsqueda.</span>
                </div>
              )}
            </div>
            {visibleCount < filteredTopics.length && (
              <button
                type="button"
                className="forum-load-more"
                onClick={() => setVisibleCount((count) => count + 4)}
              >
                Ver más conversaciones
              </button>
            )}
          </section>
        </aside>

        <main className="forum-feed" aria-label="Conversación seleccionada">
          <article className="forum-post panel">
            <header className="forum-post-header">
              <div
                className={`forum-author-avatar subject-${selectedTopic.subject.toLocaleLowerCase("es-MX").replace(/á/g, "a")}`}
                aria-hidden="true"
              >
                {initialsFor(selectedTopic.forumName)}
              </div>
              <div className="forum-post-author">
                <div>
                  <strong>{selectedTopic.forumName}</strong>
                  <BadgeCheck size={15} aria-label="Espacio verificado" />
                </div>
                <span>
                  {selectedTopic.responsible} · {selectedTopic.opensAt}
                </span>
              </div>
              <span
                className={`forum-status ${statusDetails[selectedTopic.status].className}`}
              >
                {statusDetails[selectedTopic.status].label}
              </span>
              {staff && (
                <button
                  type="button"
                  className="forum-more-button"
                  onClick={() => setSettingsOpen(true)}
                  aria-label="Administrar conversación"
                >
                  <MoreHorizontal size={20} />
                </button>
              )}
            </header>

            <div className="forum-post-content">
              <div className="forum-post-labels">
                {selectedTopic.pinned && (
                  <span className="forum-pinned">
                    <Pin size={13} /> Fijado por el equipo docente
                  </span>
                )}
                <span>{selectedTopic.subject}</span>
              </div>
              <h2>{selectedTopic.title}</h2>
              <p>{selectedTopic.prompt}</p>
              <div className="forum-post-meta">
                <span>
                  <Users size={15} /> {selectedTopic.group}
                </span>
                <span>
                  <Clock3 size={15} /> {selectedTopic.closesAt}
                </span>
                {selectedTopic.allowAttachments && (
                  <span>
                    <Paperclip size={15} /> Adjunto permitido
                  </span>
                )}
              </div>
            </div>

            <div className="forum-participation-summary">
              <div className="forum-avatar-stack" aria-hidden="true">
                {selectedTopic.participants.slice(0, 4).map((participant) => (
                  <span key={participant}>{initialsFor(participant)}</span>
                ))}
              </div>
              <p>
                <strong>{selectedTopic.participants.length} participantes</strong>
                <span>
                  {selectedTopic.replies.length} aportaciones en esta conversación
                </span>
              </p>
              <button
                type="button"
                className={
                  following.includes(selectedTopic.id) ? "is-following" : ""
                }
                onClick={() =>
                  setFollowing((current) =>
                    current.includes(selectedTopic.id)
                      ? current.filter((item) => item !== selectedTopic.id)
                      : [...current, selectedTopic.id],
                  )
                }
              >
                <Bookmark
                  size={17}
                  fill={
                    following.includes(selectedTopic.id)
                      ? "currentColor"
                      : "none"
                  }
                />
                {following.includes(selectedTopic.id) ? "Siguiendo" : "Seguir"}
              </button>
            </div>
          </article>

          <section className="forum-conversation panel">
            <div className="forum-conversation-heading">
              <div>
                <MessageCircle size={19} />
                <strong>Aportaciones</strong>
                <span>{selectedTopic.replies.length}</span>
              </div>
              <small>Orden: más recientes</small>
            </div>

            <div className="forum-reply-list">
              {topLevelReplies.map((item) => {
                const children = selectedTopic.replies.filter(
                  (replyItem) => replyItem.parentId === item.id,
                );
                return (
                  <ForumReplyCard
                    key={item.id}
                    item={item}
                    nestedReplies={children}
                    role={role}
                    profile={profile}
                    onReact={reactToReply}
                    onReply={(replyId) => {
                      setReplyingTo(replyId);
                      requestAnimationFrame(() => composerRef.current?.focus());
                    }}
                    onReport={reportReply}
                    onHide={(replyItem) =>
                      moderateReplyDirectly(replyItem, "hidden")
                    }
                    onRestore={(replyItem) =>
                      moderateReplyDirectly(replyItem, "restored")
                    }
                    onMark={(replyItem) =>
                      updateReply(
                        selectedTopic.id,
                        replyItem.id,
                        (current) => ({
                          ...current,
                          markedAnswer: !current.markedAnswer,
                        }),
                        replyItem.markedAnswer
                          ? "Marca de respuesta retirada"
                          : "Respuesta docente destacada",
                      )
                    }
                  />
                );
              })}

              {!topLevelReplies.length && (
                <div className="forum-first-reply">
                  <span>
                    <MessageCircle size={26} />
                  </span>
                  <strong>Sé la primera persona en participar</strong>
                  <p>
                    Lee la consigna, piensa en un ejemplo y comparte tu idea con
                    el grupo.
                  </p>
                </div>
              )}
            </div>

            {selectedTopic.status === "open" &&
              selectedTopic.allowReplies && (
                <form className="forum-composer" onSubmit={submitReply}>
                  <span className="avatar">{profile.initials}</span>
                  <div className="forum-composer-body">
                    {parentReply && (
                      <div className="forum-replying-to">
                        <span>
                          Respondiendo a <strong>{parentReply.author}</strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => setReplyingTo(null)}
                          aria-label="Cancelar respuesta directa"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    )}
                    <textarea
                      ref={composerRef}
                      value={reply}
                      maxLength={600}
                      onChange={(event) => {
                        setReply(event.target.value);
                        setComposerError("");
                      }}
                      placeholder="Comparte una idea, una pregunta o algo que aprendiste…"
                      aria-label="Escribe tu aportación"
                      rows={3}
                    />
                    {mentionSuggestions.length > 0 && (
                      <div className="forum-mention-menu" role="listbox">
                        <span>Mencionar participante</span>
                        {mentionSuggestions.map((participant) => (
                          <button
                            type="button"
                            key={participant}
                            onClick={() => {
                              setReply((current) =>
                                current.replace(
                                  /@[\p{L}]*$/u,
                                  `@${participant} `,
                                ),
                              );
                              composerRef.current?.focus();
                            }}
                          >
                            <span>{initialsFor(participant)}</span>
                            {participant}
                          </button>
                        ))}
                      </div>
                    )}
                    {attachment && (
                      <div className="forum-pending-attachment">
                        <Paperclip size={16} />
                        <span>
                          <strong>{attachment.name}</strong>
                          <small>{attachment.sizeLabel}</small>
                        </span>
                        <button
                          type="button"
                          onClick={() => setAttachment(null)}
                          aria-label="Quitar adjunto"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    )}
                    {composerError && (
                      <div className="forum-composer-error" role="alert">
                        <ShieldCheck size={15} />
                        {composerError}
                      </div>
                    )}
                    <div className="forum-composer-toolbar">
                      <div>
                        {selectedTopic.allowAttachments && (
                          <>
                            <input
                              ref={fileInputRef}
                              className="sr-only"
                              type="file"
                              accept="image/*,.pdf"
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (!file) return;
                                if (file.size > 5_000_000) {
                                  setComposerError(
                                    "El archivo debe pesar menos de 5 MB.",
                                  );
                                  event.target.value = "";
                                  return;
                                }
                                setAttachment({
                                  id: `attachment-${Date.now()}`,
                                  name: file.name,
                                  type: file.type.startsWith("image/")
                                    ? "image"
                                    : "document",
                                  sizeLabel: `${file.type.startsWith("image/") ? "Imagen" : "Documento"} · ${Math.max(0.1, file.size / 1_000_000).toFixed(1)} MB`,
                                });
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              aria-label="Añadir un archivo"
                            >
                              <ImagePlus size={18} />
                              <span>Adjuntar</span>
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setReply((current) => `${current}@`);
                            composerRef.current?.focus();
                          }}
                          aria-label="Mencionar a un participante"
                        >
                          <AtSign size={18} />
                          <span>Mencionar</span>
                        </button>
                      </div>
                      <span>{reply.length}/600</span>
                      <button
                        className="forum-publish-button"
                        disabled={!reply.trim()}
                      >
                        <Send size={17} /> Publicar
                      </button>
                    </div>
                  </div>
                </form>
              )}

            {(selectedTopic.status !== "open" ||
              !selectedTopic.allowReplies) && (
              <div className="forum-closed-note">
                {selectedTopic.status === "scheduled" ? (
                  <CalendarClock size={20} />
                ) : (
                  <LockKeyhole size={20} />
                )}
                <div>
                  <strong>
                    {selectedTopic.status === "scheduled"
                      ? "Esta conversación aún no abre"
                      : selectedTopic.allowReplies
                        ? "La conversación está cerrada"
                        : "Este es un aviso de solo lectura"}
                  </strong>
                  <span>
                    {selectedTopic.status === "scheduled"
                      ? selectedTopic.opensAt
                      : "Puedes consultar las aportaciones, pero ya no se reciben respuestas."}
                  </span>
                </div>
              </div>
            )}
          </section>
        </main>

        <aside className="forum-context">
          <section className="forum-safety-card panel">
            <div className="forum-context-icon">
              <ShieldCheck size={22} />
            </div>
            <span>Antes de participar</span>
            <h3>Convivimos y aprendemos</h3>
            <ul>
              <li>
                <Check size={15} /> Escucha ideas diferentes con respeto.
              </li>
              <li>
                <Check size={15} /> Explica tus respuestas con ejemplos.
              </li>
              <li>
                <Check size={15} /> No compartas datos personales ni notas.
              </li>
            </ul>
            <button type="button" onClick={() => setGuidelinesOpen(true)}>
              Ver acuerdo de convivencia
            </button>
          </section>

          {staff ? (
            <section className="forum-moderation-card panel">
              <div className="forum-card-heading">
                <div>
                  <span>Moderación</span>
                  <strong>Casos pendientes</strong>
                </div>
                <span className="forum-case-count">{openModeration.length}</span>
              </div>
              {openModeration.slice(0, 2).map((moderationCase) => (
                <div className="forum-case-preview" key={moderationCase.id}>
                  <span>
                    <Flag size={14} /> {moderationCase.reason}
                  </span>
                  <p>“{moderationCase.excerpt}”</p>
                  <small>
                    {moderationCase.author} · {moderationCase.reportedAt}
                  </small>
                  <div>
                    <button
                      type="button"
                      onClick={() => moderateCase(moderationCase, "dismissed")}
                    >
                      Descartar
                    </button>
                    <button
                      type="button"
                      onClick={() => moderateCase(moderationCase, "hidden")}
                    >
                      Ocultar
                    </button>
                  </div>
                </div>
              ))}
              {!openModeration.length && (
                <div className="forum-all-clear">
                  <CheckCircle2 size={22} />
                  <strong>Todo en orden</strong>
                  <span>No hay casos pendientes.</span>
                </div>
              )}
              <button
                type="button"
                className="forum-context-link"
                onClick={() => setModerationOpen(true)}
              >
                Ver historial de moderación
              </button>
            </section>
          ) : (
            <section className="forum-participation-card panel">
              <span className="forum-section-kicker">Tu participación</span>
              <div>
                <strong>
                  {topics.reduce(
                    (total, topic) =>
                      total +
                      topic.replies.filter(
                        (item) => item.author === profile.name,
                      ).length,
                    0,
                  )}
                </strong>
                <span>aportaciones esta semana</span>
              </div>
              <p>
                Tus ideas se comparten únicamente con los espacios escolares a
                los que perteneces.
              </p>
              <span className="forum-private-note">
                <LockKeyhole size={14} /> Sin mensajes privados
              </span>
            </section>
          )}
        </aside>
      </div>

      <AnimatePresence>
        {guidelinesOpen && (
          <GuidelinesDialog
            firstParticipation={!guidelinesAccepted && !!reply.trim()}
            onClose={() => setGuidelinesOpen(false)}
            onAccept={() => {
              window.localStorage.setItem(
                "cehf-forum-guidelines",
                "accepted",
              );
              setGuidelinesAccepted(true);
              setGuidelinesOpen(false);
              if (reply.trim()) publishReply();
            }}
          />
        )}
        {settingsOpen && staff && (
          <TopicSettingsDialog
            topic={selectedTopic}
            onClose={() => setSettingsOpen(false)}
            onSave={(values) => {
              updateState(
                (previous) => ({
                  ...previous,
                  forumTopics: previous.forumTopics.map((topic) =>
                    topic.id === selectedTopic.id
                      ? { ...topic, ...values }
                      : topic,
                  ),
                }),
                "Configuración de la conversación actualizada",
              );
              setSettingsOpen(false);
            }}
          />
        )}
        {moderationOpen && staff && (
          <ModerationDrawer
            cases={state.forumModeration ?? []}
            topics={topics}
            onClose={() => setModerationOpen(false)}
            onModerate={moderateCase}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ForumReplyCard({
  item,
  nestedReplies,
  role,
  profile,
  onReact,
  onReply,
  onReport,
  onHide,
  onRestore,
  onMark,
}: {
  item: ForumReply;
  nestedReplies: ForumReply[];
  role: Role;
  profile: UserProfile;
  onReact: (item: ForumReply, kind: ForumReactionKind) => void;
  onReply: (replyId: string) => void;
  onReport: (item: ForumReply) => void;
  onHide: (item: ForumReply) => void;
  onRestore: (item: ForumReply) => void;
  onMark: (item: ForumReply) => void;
}) {
  const staff = role !== "student";

  if (item.status === "hidden" && !staff) return null;

  return (
    <article
      className={`forum-reply-card ${item.teacher ? "is-teacher" : ""} ${item.markedAnswer ? "is-marked" : ""} ${item.status === "hidden" ? "is-hidden" : ""}`}
    >
      <div className="forum-reply-main">
        <span className="avatar">{item.initials}</span>
        <div className="forum-reply-content">
          <div className="forum-reply-author">
            <div>
              <strong>{item.author}</strong>
              {item.teacher && (
                <span className="forum-teacher-label">
                  <BadgeCheck size={13} /> Docente
                </span>
              )}
              {item.author === profile.name && (
                <span className="forum-you-label">Tú</span>
              )}
            </div>
            <small>
              {item.createdAt}
              {item.edited ? " · Editado" : ""}
            </small>
          </div>

          {item.markedAnswer && (
            <div className="forum-marked-label">
              <CheckCircle2 size={15} />
              Respuesta destacada por el equipo docente
            </div>
          )}

          {item.status === "hidden" ? (
            <div className="forum-hidden-copy">
              <EyeOff size={18} />
              <div>
                <strong>Publicación oculta</strong>
                <span>
                  El contenido se conserva para el historial de moderación.
                </span>
              </div>
            </div>
          ) : (
            <>
              <p>{item.body}</p>
              {item.attachment && (
                <button type="button" className="forum-attachment">
                  {item.attachment.type === "image" ? (
                    <ImagePlus size={20} />
                  ) : (
                    <FileText size={20} />
                  )}
                  <span>
                    <strong>{item.attachment.name}</strong>
                    <small>{item.attachment.sizeLabel}</small>
                  </span>
                  <Paperclip size={16} />
                </button>
              )}
            </>
          )}

          <div className="forum-reply-actions">
            {item.status !== "hidden" &&
              (Object.keys(reactionDetails) as ForumReactionKind[]).map(
                (kind) => {
                  const detail = reactionDetails[kind];
                  const Icon = detail.icon;
                  const active = item.reactedByMe?.includes(kind);
                  const count = item.reactions?.[kind] ?? 0;
                  return (
                    <button
                      type="button"
                      key={kind}
                      className={active ? "active" : ""}
                      aria-pressed={active}
                      onClick={() => onReact(item, kind)}
                    >
                      <Icon size={15} />
                      <span>{detail.label}</span>
                      {count > 0 && <em>{count}</em>}
                    </button>
                  );
                },
              )}
            {item.status !== "hidden" && (
              <button type="button" onClick={() => onReply(item.id)}>
                <MessageCircle size={15} />
                <span>Responder</span>
              </button>
            )}
            {!staff && item.author !== profile.name && (
              <button
                type="button"
                className={item.reports ? "is-reported" : ""}
                onClick={() => onReport(item)}
                disabled={!!item.reports}
              >
                <Flag size={15} />
                <span>{item.reports ? "Reportado" : "Reportar"}</span>
              </button>
            )}
            {staff && (
              <>
                {item.teacher && item.status !== "hidden" && (
                  <button type="button" onClick={() => onMark(item)}>
                    <BadgeCheck size={15} />
                    <span>{item.markedAnswer ? "Desmarcar" : "Destacar"}</span>
                  </button>
                )}
                {item.status === "hidden" ? (
                  <button type="button" onClick={() => onRestore(item)}>
                    <RotateCcw size={15} />
                    <span>Restaurar</span>
                  </button>
                ) : (
                  <button type="button" onClick={() => onHide(item)}>
                    <EyeOff size={15} />
                    <span>Ocultar</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {nestedReplies.length > 0 && (
        <div className="forum-nested-replies">
          {nestedReplies.map((child) => (
            <ForumReplyCard
              key={child.id}
              item={child}
              nestedReplies={[]}
              role={role}
              profile={profile}
              onReact={onReact}
              onReply={() => onReply(item.id)}
              onReport={onReport}
              onHide={onHide}
              onRestore={onRestore}
              onMark={onMark}
            />
          ))}
        </div>
      )}
    </article>
  );
}

function GuidelinesDialog({
  firstParticipation,
  onClose,
  onAccept,
}: {
  firstParticipation: boolean;
  onClose: () => void;
  onAccept: () => void;
}) {
  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.section
        className="forum-guidelines-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="forum-guidelines-title"
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
      >
        <button
          type="button"
          className="forum-dialog-close"
          onClick={onClose}
          aria-label="Cerrar"
        >
          <X size={19} />
        </button>
        <span className="forum-dialog-illustration">
          <ShieldCheck size={32} />
        </span>
        <span className="eyebrow">
          {firstParticipation ? "Antes de tu primera aportación" : "Acuerdo CEHF"}
        </span>
        <h2 id="forum-guidelines-title">Construimos un espacio seguro</h2>
        <p>
          En el foro aprendemos conversando. Cada aportación debe cuidar a las
          personas y ayudar a comprender mejor el tema.
        </p>
        <div className="forum-guideline-list">
          <div>
            <span>01</span>
            <div>
              <strong>Habla de las ideas, no de las personas</strong>
              <p>Pregunta, explica y responde siempre con respeto.</p>
            </div>
          </div>
          <div>
            <span>02</span>
            <div>
              <strong>Protege tu información</strong>
              <p>No compartas teléfonos, direcciones, contraseñas o notas.</p>
            </div>
          </div>
          <div>
            <span>03</span>
            <div>
              <strong>Pide ayuda cuando algo no esté bien</strong>
              <p>Puedes reportar una aportación para que la revise un adulto.</p>
            </div>
          </div>
        </div>
        <div className="forum-dialog-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Volver
          </button>
          <button type="button" className="primary-button" onClick={onAccept}>
            <Check size={17} />
            {firstParticipation ? "Entendido, publicar" : "Entendido"}
          </button>
        </div>
      </motion.section>
    </motion.div>
  );
}

function TopicSettingsDialog({
  topic,
  onClose,
  onSave,
}: {
  topic: ForumTopic;
  onClose: () => void;
  onSave: (
    values: Pick<
      ForumTopic,
      | "title"
      | "prompt"
      | "status"
      | "allowReplies"
      | "allowAttachments"
      | "closesAt"
    >,
  ) => void;
}) {
  const [title, setTitle] = useState(topic.title);
  const [prompt, setPrompt] = useState(topic.prompt);
  const [status, setStatus] = useState(topic.status);
  const [closesAt, setClosesAt] = useState(topic.closesAt);
  const [allowReplies, setAllowReplies] = useState(topic.allowReplies);
  const [allowAttachments, setAllowAttachments] = useState(
    topic.allowAttachments,
  );

  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.form
        className="forum-settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="topic-settings-title"
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        onSubmit={(event) => {
          event.preventDefault();
          onSave({
            title: title.trim(),
            prompt: prompt.trim(),
            status,
            allowReplies,
            allowAttachments,
            closesAt: closesAt.trim(),
          });
        }}
      >
        <div className="forum-settings-heading">
          <div>
            <span className="eyebrow">Gestión docente</span>
            <h2 id="topic-settings-title">Administrar conversación</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        <div className="forum-settings-grid">
          <label className="forum-field forum-field-wide">
            <span>Título</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </label>
          <label className="forum-field forum-field-wide">
            <span>Consigna</span>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={4}
              required
            />
          </label>
          <label className="forum-field">
            <span>Estado</span>
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as ForumTopic["status"])
              }
            >
              <option value="open">Abierto</option>
              <option value="scheduled">Programado</option>
              <option value="closed">Cerrado</option>
              <option value="archived">Archivado</option>
            </select>
          </label>
          <label className="forum-field">
            <span>Cierre</span>
            <input
              value={closesAt}
              onChange={(event) => setClosesAt(event.target.value)}
            />
          </label>
        </div>
        <div className="forum-setting-toggles">
          <label>
            <span>
              <strong>Permitir respuestas</strong>
              <small>El cambio se aplica de inmediato.</small>
            </span>
            <input
              type="checkbox"
              checked={allowReplies}
              onChange={(event) => setAllowReplies(event.target.checked)}
            />
          </label>
          <label>
            <span>
              <strong>Permitir un adjunto</strong>
              <small>Imágenes o PDF en esta demostración.</small>
            </span>
            <input
              type="checkbox"
              checked={allowAttachments}
              onChange={(event) => setAllowAttachments(event.target.checked)}
            />
          </label>
        </div>
        <div className="forum-dialog-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-button" disabled={!title.trim()}>
            <Settings2 size={17} /> Guardar cambios
          </button>
        </div>
      </motion.form>
    </motion.div>
  );
}

function ModerationDrawer({
  cases,
  topics,
  onClose,
  onModerate,
}: {
  cases: ForumModerationCase[];
  topics: ForumTopic[];
  onClose: () => void;
  onModerate: (
    moderationCase: ForumModerationCase,
    action: "hidden" | "dismissed" | "restored",
  ) => void;
}) {
  return (
    <>
      <motion.button
        className="drawer-backdrop"
        aria-label="Cerrar moderación"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      <motion.aside
        className="forum-moderation-drawer"
        aria-label="Centro de moderación"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
      >
        <header>
          <div>
            <span className="eyebrow">Convivencia escolar</span>
            <h2>Centro de moderación</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </header>
        <div className="forum-moderation-summary">
          <div>
            <Flag size={18} />
            <strong>
              {cases.filter((item) => item.status === "open").length}
            </strong>
            <span>Pendientes</span>
          </div>
          <div>
            <EyeOff size={18} />
            <strong>
              {cases.filter((item) => item.status === "hidden").length}
            </strong>
            <span>Ocultos</span>
          </div>
          <div>
            <CheckCircle2 size={18} />
            <strong>
              {
                cases.filter((item) =>
                  ["dismissed", "restored"].includes(item.status),
                ).length
              }
            </strong>
            <span>Resueltos</span>
          </div>
        </div>
        <div className="forum-moderation-list">
          {cases.map((moderationCase) => {
            const topic = topics.find(
              (item) => item.id === moderationCase.topicId,
            );
            return (
              <article key={moderationCase.id}>
                <div className="forum-case-heading">
                  <span
                    className={`forum-case-status is-${moderationCase.status}`}
                  >
                    {moderationCase.status === "open"
                      ? "Pendiente"
                      : moderationCase.status === "hidden"
                        ? "Oculto"
                        : moderationCase.status === "restored"
                          ? "Restaurado"
                          : "Descartado"}
                  </span>
                  <small>{moderationCase.reportedAt}</small>
                </div>
                <strong>{moderationCase.reason}</strong>
                <p>“{moderationCase.excerpt}”</p>
                <span>
                  {moderationCase.author} · {topic?.title ?? "Conversación"}
                </span>
                {moderationCase.resolvedBy && (
                  <em>Atendido por {moderationCase.resolvedBy}</em>
                )}
                {moderationCase.status === "open" && (
                  <div>
                    <button
                      type="button"
                      onClick={() =>
                        onModerate(moderationCase, "dismissed")
                      }
                    >
                      Descartar
                    </button>
                    <button
                      type="button"
                      onClick={() => onModerate(moderationCase, "hidden")}
                    >
                      <EyeOff size={15} /> Ocultar contenido
                    </button>
                  </div>
                )}
                {moderationCase.status === "hidden" && (
                  <button
                    type="button"
                    className="forum-restore-button"
                    onClick={() => onModerate(moderationCase, "restored")}
                  >
                    <RotateCcw size={15} /> Restaurar contenido
                  </button>
                )}
              </article>
            );
          })}
          {!cases.length && (
            <div className="forum-all-clear drawer-clear">
              <CheckCircle2 size={30} />
              <strong>No hay casos de moderación</strong>
              <span>La conversación de la comunidad está en orden.</span>
            </div>
          )}
        </div>
        <footer>
          <Archive size={16} />
          La eliminación es lógica: la evidencia permanece en el historial.
        </footer>
      </motion.aside>
    </>
  );
}
