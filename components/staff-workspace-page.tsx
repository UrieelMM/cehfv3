"use client";

import {
  Archive, ArchiveRestore, AtSign, BookOpen, CalendarDays, Check,
  ClipboardCheck, Clock3, Copy, Download, Eye, FileText, Folder, History,
  Inbox, LayoutGrid, LoaderCircle, LockKeyhole, MapPin, MessageCircle,
  Paperclip, Pencil, Pin, PinOff, Plus, RotateCcw, Save, Search, Sparkles,
  SlidersHorizontal, Maximize2, Minimize2, MoreHorizontal, StickyNote, Tag,
  Trash2, UploadCloud, UserCheck, UserRound, Users, X,
} from "lucide-react";
import { FocusTrap } from "@mantine/core";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { toast } from "sonner";
import {
  StaffWorkspaceRichEditor, WorkspaceEditorHint,
  type WorkspaceMentionMember,
} from "@/components/staff-workspace-rich-editor";
import { workspaceTemplateDraft } from "@/lib/staff-workspace-content";
import { friendlyFirebaseError } from "@/lib/firebase";
import { subjectsMatch } from "@/lib/academic-subjects";
import {
  createStaffWorkspaceComment, createStaffWorkspaceItem,
  deleteStaffWorkspaceFile, deleteStaffWorkspaceItem,
  markStaffWorkspaceItemRead, setStaffWorkspaceItemArchived,
  setStaffWorkspaceItemPinned, transferStaffWorkspaceItem,
  updateStaffWorkspaceItem, uploadStaffWorkspaceFile,
  watchStaffWorkspace, watchStaffWorkspaceActivity,
  watchStaffWorkspaceComments, watchStaffWorkspaceReads,
} from "@/lib/staff-workspace-firebase";
import type {
  ManagedAccount, StaffWorkspaceActivity, StaffWorkspaceAttachment,
  StaffWorkspaceComment, StaffWorkspaceItem, StaffWorkspaceItemInput,
  StaffWorkspaceItemType, StaffWorkspaceReadReceipt, UserProfile,
} from "@/lib/types";

type Props = {
  profile: UserProfile;
  accounts: ManagedAccount[];
  firebaseReady: boolean;
};
type WorkspaceFilter = "all" | StaffWorkspaceItemType;
type WorkspaceScope = "all" | "private" | "shared";
type WorkspaceView = "blocks" | "inbox" | "templates" | "archive";
type WorkspaceDateFilter = "all" | "today" | "week" | "month" | "without-date";
type WorkspaceSort = "updated" | "oldest" | "title" | "event";
type DraftSaveState = "idle" | "saving" | "saved" | "error";
type WorkspaceConfirmation = {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  icon: ComponentType<{ size?: number }>;
  onConfirm: () => void | Promise<void>;
};

function workspaceItemFromPath() {
  if (typeof window === "undefined") return null;
  const [section, itemId] = window.location.pathname.split("/").filter(Boolean);
  return section === "my-space" && itemId ? decodeURIComponent(itemId) : null;
}

type WorkspaceSavedView = {
  id: string;
  name: string;
  search: string;
  filter: WorkspaceFilter;
  scope: WorkspaceScope;
  subject: string;
  group: string;
  owner: string;
  folder: string;
  tag: string;
  date: WorkspaceDateFilter;
  sort: WorkspaceSort;
};

type StoredWorkspaceDraft = {
  itemId: string;
  selectedItemId: string | null;
  baseline: string;
  draft: StaffWorkspaceItemInput;
  savedAt: string;
};

const typeDetails: Record<StaffWorkspaceItemType, {
  label: string;
  description: string;
  editorDescription: string;
  titlePlaceholder: string;
  icon: ComponentType<{ size?: number }>;
}> = {
  planning: {
    label: "Planeación", description: "Secuencias, objetivos y pendientes",
    editorDescription: "Define el contexto de clase y desarrolla la secuencia con bloques.",
    titlePlaceholder: "Ej. Lectura guiada · Semana 8", icon: ClipboardCheck,
  },
  resource: {
    label: "Recurso", description: "Archivos y materiales del equipo",
    editorDescription: "Sube uno o varios materiales y documenta cómo utilizarlos.",
    titlePlaceholder: "Ej. Actividades socioemocionales", icon: Paperclip,
  },
  schedule: {
    label: "Horario", description: "Agenda, recordatorios y reuniones",
    editorDescription: "Programa una fecha y agrega ubicación, agenda o acuerdos.",
    titlePlaceholder: "Ej. Reunión de seguimiento", icon: CalendarDays,
  },
  note: {
    label: "Nota", description: "Ideas, minutas y documentación",
    editorDescription: "Captura libremente ideas, acuerdos, tablas o listas de trabajo.",
    titlePlaceholder: "Ej. Acuerdos de la junta docente", icon: StickyNote,
  },
};

function templateContent(type: StaffWorkspaceItemType) {
  const paragraph = (content: string) => ({ type: "paragraph", content });
  const heading = (content: string, level: 2 | 3 = 2) => ({
    type: "heading",
    props: { level },
    content,
  });
  const bullet = (content: string) => ({ type: "bulletListItem", content });
  const task = (content: string) => ({
    type: "checkListItem",
    props: { checked: false },
    content,
  });
  const templates: Record<StaffWorkspaceItemType, object[]> = {
    planning: [
      heading("Propósito de aprendizaje"),
      paragraph("Describe el aprendizaje esperado y la evidencia que permitirá comprobarlo."),
      heading("Preparación"),
      bullet("Materiales y recursos:"),
      bullet("Conocimientos previos:"),
      bullet("Adecuaciones o apoyos:"),
      heading("Secuencia didáctica"),
      heading("Inicio", 3),
      task("Actividad de apertura y recuperación de saberes previos."),
      heading("Desarrollo", 3),
      task("Actividad central, acompañamiento y preguntas guía."),
      heading("Cierre", 3),
      task("Síntesis, producto o reflexión final."),
      heading("Evaluación"),
      paragraph("Criterios, instrumento y retroalimentación prevista."),
    ],
    resource: [
      heading("Descripción del recurso"),
      paragraph("Explica brevemente qué contiene y qué necesidad resuelve."),
      heading("Uso sugerido"),
      bullet("Materia o área:"),
      bullet("Grado o grupo recomendado:"),
      bullet("Momento de la clase:"),
      heading("Indicaciones"),
      paragraph("Agrega pasos, recomendaciones o adaptaciones para aprovechar el archivo."),
    ],
    schedule: [
      heading("Objetivo"),
      paragraph("Describe el propósito de la reunión, actividad o recordatorio."),
      heading("Agenda"),
      task("Tema principal."),
      task("Responsables o participantes."),
      task("Material que debe prepararse."),
      heading("Acuerdos y seguimiento"),
      bullet("Acuerdo:"),
      bullet("Responsable y fecha:"),
    ],
    note: [
      heading("Idea principal"),
      paragraph("Escribe aquí el contexto o la idea que quieres conservar."),
      heading("Puntos clave"),
      bullet("Dato, hallazgo o acuerdo importante."),
      bullet("Referencia o persona relacionada."),
      heading("Próximos pasos"),
      task("Acción pendiente."),
    ],
  };
  return JSON.stringify(templates[type]);
}

function emptyDraft(type: StaffWorkspaceItemType = "note"): StaffWorkspaceItemInput {
  return {
    type, title: "", content: "", visibility: "private",
    sharedWithIds: [], mentionedUserIds: [], assigneeIds: [], archived: false,
    isTemplate: false, folder: "", tags: [], eventAt: "", resourceUrl: "",
    subject: "", group: "", location: "", attachments: [],
  };
}

function draftFromItem(item: StaffWorkspaceItem): StaffWorkspaceItemInput {
  return {
    type: item.type,
    title: item.title,
    content: item.content,
    visibility: item.visibility,
    sharedWithIds: item.sharedWithIds,
    mentionedUserIds: item.mentionedUserIds,
    assigneeIds: item.assigneeIds,
    archived: item.archived,
    isTemplate: item.isTemplate,
    folder: item.folder ?? "",
    tags: item.tags,
    eventAt: item.eventAt ?? "",
    resourceUrl: item.resourceUrl ?? "",
    subject: item.subject ?? "",
    group: item.group ?? "",
    location: item.location ?? "",
    attachments: item.attachments,
  };
}

function workspaceDraftKey(userId: string) {
  return `cehf-staff-workspace-draft:${userId}`;
}

function workspaceViewsKey(userId: string) {
  return `cehf-staff-workspace-views:${userId}`;
}

function dateMatchesFilter(value: string | undefined, filter: WorkspaceDateFilter) {
  if (filter === "all") return true;
  if (!value) return filter === "without-date";
  const itemDate = new Date(value);
  if (Number.isNaN(itemDate.getTime())) return filter === "without-date";
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(startToday);
  if (filter === "today") end.setDate(end.getDate() + 1);
  if (filter === "week") end.setDate(end.getDate() + 7);
  if (filter === "month") end.setMonth(end.getMonth() + 1);
  return itemDate >= startToday && itemDate < end;
}

function activityLabel(activity: StaffWorkspaceActivity) {
  const labels: Record<StaffWorkspaceActivity["action"], string> = {
    created: "creó el bloque",
    updated: "actualizó el contenido",
    commented: "agregó un comentario",
    archived: "archivó el bloque",
    restored: "restauró el bloque",
    transferred: "transfirió la propiedad",
    template_created: "guardó una plantilla",
  };
  return labels[activity.action];
}

function workspaceId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `workspace-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function workspacePlainText(content: string) {
  if (!content.trim()) return "";
  try {
    const parsed: unknown = JSON.parse(content);
    const chunks: string[] = [];
    const visit = (value: unknown) => {
      if (Array.isArray(value)) return void value.forEach(visit);
      if (!value || typeof value !== "object") return;
      const record = value as Record<string, unknown>;
      if (typeof record.text === "string") chunks.push(record.text);
      if (typeof record.content === "string") chunks.push(record.content);
      else visit(record.content);
      visit(record.children);
    };
    visit(parsed);
    return chunks.join(" ").replace(/\s+/g, " ").trim();
  } catch {
    return content.replace(/\s+/g, " ").trim();
  }
}

function shortDate(value?: string) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
  }).format(date);
}

function relativeDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Actualizado recientemente";
  const days = Math.round((date.getTime() - Date.now()) / 86_400_000);
  if (days === 0) return "Actualizado hoy";
  if (days === -1) return "Actualizado ayer";
  return new Intl.RelativeTimeFormat("es-MX", { numeric: "auto" }).format(days, "day");
}

function bytesLabel(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function visibilityLabel(item: Pick<StaffWorkspaceItem, "visibility" | "sharedWithIds">) {
  if (item.visibility === "private") return "Sólo yo";
  if (item.visibility === "staff") return "Todo el equipo";
  return item.sharedWithIds.length === 1 ? "1 persona" : `${item.sharedWithIds.length} personas`;
}

function mexicoDateKey() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date()).filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function WorkspaceConfirmationModal({
  confirmation,
  busy,
  reduceMotion,
  onCancel,
  onConfirm,
}: {
  confirmation: WorkspaceConfirmation;
  busy: boolean;
  reduceMotion: boolean | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const ConfirmationIcon = confirmation.icon;

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, onCancel]);

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="staff-workspace-confirm-backdrop"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <motion.section
        animate={{ opacity: 1, y: 0, scale: 1 }}
        aria-describedby="staff-workspace-confirm-description"
        aria-labelledby="staff-workspace-confirm-title"
        aria-modal="true"
        className={`staff-workspace-confirm-modal ${confirmation.danger ? "is-danger" : ""}`}
        exit={reduceMotion ? undefined : { opacity: 0, y: 10, scale: 0.98 }}
        initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.98 }}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          if (event.shiftKey && document.activeElement === cancelRef.current) {
            event.preventDefault();
            confirmRef.current?.focus();
          } else if (!event.shiftKey && document.activeElement === confirmRef.current) {
            event.preventDefault();
            cancelRef.current?.focus();
          }
        }}
        role="alertdialog"
      >
        <span className="staff-workspace-confirm-icon"><ConfirmationIcon size={23} /></span>
        <span className="eyebrow">MI ESPACIO</span>
        <h2 id="staff-workspace-confirm-title">{confirmation.title}</h2>
        <p id="staff-workspace-confirm-description">{confirmation.description}</p>
        <footer>
          <button className="secondary-button" disabled={busy} onClick={onCancel} ref={cancelRef} type="button">Cancelar</button>
          <button className={confirmation.danger ? "danger-button" : "primary-button"} disabled={busy} onClick={onConfirm} ref={confirmRef} type="button">
            {busy ? <LoaderCircle className="spin" size={16} /> : <ConfirmationIcon size={16} />}
            {busy ? "Procesando…" : confirmation.confirmLabel}
          </button>
        </footer>
      </motion.section>
    </motion.div>
  );
}

export function StaffWorkspacePage({ profile, accounts, firebaseReady }: Props) {
  const reduceMotion = useReducedMotion();
  const [items, setItems] = useState<StaffWorkspaceItem[]>([]);
  const [loading, setLoading] = useState(firebaseReady);
  const [view, setView] = useState<WorkspaceView>("blocks");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<WorkspaceFilter>("all");
  const [scope, setScope] = useState<WorkspaceScope>("all");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [folderFilter, setFolderFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [dateFilter, setDateFilter] = useState<WorkspaceDateFilter>("all");
  const [sort, setSort] = useState<WorkspaceSort>("updated");
  const [savedViews, setSavedViews] = useState<WorkspaceSavedView[]>([]);
  const [activeSavedViewId, setActiveSavedViewId] = useState("");
  const [receipts, setReceipts] = useState<StaffWorkspaceReadReceipt[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<StaffWorkspaceItem | null>(null);
  const [draft, setDraft] = useState<StaffWorkspaceItemInput>(() => emptyDraft());
  const [tagsText, setTagsText] = useState("");
  const [draftId, setDraftId] = useState("");
  const [draftSaveState, setDraftSaveState] = useState<DraftSaveState>("idle");
  const [recoverableDraft, setRecoverableDraft] = useState<StoredWorkspaceDraft | null>(null);
  const [initialAttachmentPaths, setInitialAttachmentPaths] = useState<string[]>([]);
  const [removedAttachments, setRemovedAttachments] = useState<StaffWorkspaceAttachment[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(0);
  const [focusMode, setFocusMode] = useState(false);
  const [comments, setComments] = useState<StaffWorkspaceComment[]>([]);
  const [activity, setActivity] = useState<StaffWorkspaceActivity[]>([]);
  const [itemReceipts, setItemReceipts] = useState<StaffWorkspaceReadReceipt[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentSending, setCommentSending] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState("");
  const [draftBaseline, setDraftBaseline] = useState(JSON.stringify(emptyDraft()));
  const [confirmation, setConfirmation] = useState<WorkspaceConfirmation | null>(null);
  const [confirmationBusy, setConfirmationBusy] = useState(false);

  const teamMembers = useMemo<WorkspaceMentionMember[]>(() => {
    const members = new Map<string, WorkspaceMentionMember>();
    members.set(profile.uid, { id: profile.uid, name: profile.name, initials: profile.initials });
    accounts.filter((account) => account.role === "teacher" && account.active).forEach((account) =>
      members.set(account.uid, { id: account.uid, name: account.name, initials: account.initials }),
    );
    return [...members.values()].sort((first, second) => first.name.localeCompare(second.name, "es-MX"));
  }, [accounts, profile.initials, profile.name, profile.uid]);
  const shareCandidates = teamMembers.filter((member) => member.id !== profile.uid);
  const transferCandidates = accounts.filter((account) =>
    account.role === "teacher" && account.active && account.uid !== profile.uid,
  );

  useEffect(() => {
    if (!firebaseReady) return;
    return watchStaffWorkspace(profile, (next) => {
      setItems(next);
      setLoading(false);
    }, (error) => {
      setLoading(false);
      toast.error(friendlyFirebaseError(error));
    });
  }, [firebaseReady, profile]);

  useEffect(() => {
    const syncItemFromRoute = () => {
      const itemId = workspaceItemFromPath();
      if (!itemId) return;
      const item = items.find((candidate) => candidate.id === itemId);
      if (item && selectedItem?.id !== item.id) openItem(item, false, false);
    };
    syncItemFromRoute();
    window.addEventListener("popstate", syncItemFromRoute);
    return () => window.removeEventListener("popstate", syncItemFromRoute);
  // openItem intentionally stays outside the dependency list: it reads the
  // latest item and would otherwise recreate this route subscription each render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, selectedItem?.id]);

  useEffect(() => {
    if (!firebaseReady) return;
    return watchStaffWorkspaceReads(profile, setReceipts, undefined, (error) =>
      toast.error(friendlyFirebaseError(error)),
    );
  }, [firebaseReady, profile]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const storedDraft = window.localStorage.getItem(workspaceDraftKey(profile.uid));
        if (storedDraft) setRecoverableDraft(JSON.parse(storedDraft) as StoredWorkspaceDraft);
        const storedViews = window.localStorage.getItem(workspaceViewsKey(profile.uid));
        if (storedViews) setSavedViews(JSON.parse(storedViews) as WorkspaceSavedView[]);
      } catch {
        window.localStorage.removeItem(workspaceDraftKey(profile.uid));
        window.localStorage.removeItem(workspaceViewsKey(profile.uid));
      }
    });
    return () => { active = false; };
  }, [profile.uid]);

  const draftDirty = editorOpen && JSON.stringify(draft) !== draftBaseline;

  useEffect(() => {
    if (!editorOpen || !draftDirty) return;
    const pendingTimer = window.setTimeout(() => setDraftSaveState("saving"), 0);
    const timer = window.setTimeout(() => {
      const stored: StoredWorkspaceDraft = {
        itemId: draftId,
        selectedItemId: selectedItem?.id ?? null,
        baseline: draftBaseline,
        draft,
        savedAt: new Date().toISOString(),
      };
      try {
        window.localStorage.setItem(workspaceDraftKey(profile.uid), JSON.stringify(stored));
        setRecoverableDraft(stored);
        setDraftSaveState("saved");
      } catch {
        setDraftSaveState("error");
      }
    }, 650);
    return () => {
      window.clearTimeout(pendingTimer);
      window.clearTimeout(timer);
    };
  }, [draft, draftBaseline, draftDirty, draftId, editorOpen, profile.uid, selectedItem?.id]);

  useEffect(() => {
    if (!draftDirty) return;
    const protectDraft = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", protectDraft);
    return () => window.removeEventListener("beforeunload", protectDraft);
  }, [draftDirty]);

  useEffect(() => {
    if (!selectedItem || !firebaseReady) return;
    const stopComments = watchStaffWorkspaceComments(
      profile,
      selectedItem.id,
      setComments,
      (error) => toast.error(friendlyFirebaseError(error)),
    );
    const stopActivity = watchStaffWorkspaceActivity(
      profile,
      selectedItem.id,
      setActivity,
      (error) => toast.error(friendlyFirebaseError(error)),
    );
    const stopReceipts = watchStaffWorkspaceReads(
      profile,
      setItemReceipts,
      selectedItem.id,
      (error) => toast.error(friendlyFirebaseError(error)),
    );
    return () => {
      stopComments();
      stopActivity();
      stopReceipts();
    };
  }, [firebaseReady, profile, selectedItem]);

  const readAtByItem = useMemo(
    () => new Map(receipts.map((receipt) => [receipt.itemId, receipt.readAt])),
    [receipts],
  );
  const isUnread = (item: StaffWorkspaceItem) => item.ownerId !== profile.uid
    && (!readAtByItem.get(item.id) || item.updatedAt > String(readAtByItem.get(item.id)));
  const unreadCount = items.filter((item) =>
    !item.archived && !item.isTemplate && isUnread(item),
  ).length;

  const filterOptions = useMemo(() => ({
    subjects: [...new Set(items.map((item) => item.subject).filter(Boolean) as string[])].sort(),
    groups: [...new Set(items.map((item) => item.group).filter(Boolean) as string[])].sort(),
    owners: [...new Map(items.map((item) => [item.ownerId, item.ownerName])).entries()],
    folders: [...new Set(items.map((item) => item.folder).filter(Boolean) as string[])].sort(),
    tags: [...new Set(items.flatMap((item) => item.tags))].sort(),
  }), [items]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es-MX");
    const base = items.filter((item) => {
      if (view === "templates") return item.isTemplate && !item.archived;
      if (view === "archive") return item.archived;
      if (item.archived || item.isTemplate) return false;
      if (view === "inbox" && item.ownerId === profile.uid) return false;
      if (view === "blocks" && item.ownerId !== profile.uid) return false;
      return true;
    });
    return base.filter((item) => {
      if (filter !== "all" && item.type !== filter) return false;
      if (scope === "private" && item.visibility !== "private") return false;
      if (scope === "shared" && item.visibility === "private") return false;
      if (subjectFilter && !subjectsMatch(item.subject ?? "", subjectFilter)) return false;
      if (groupFilter && item.group !== groupFilter) return false;
      if (ownerFilter && item.ownerId !== ownerFilter) return false;
      if (folderFilter && item.folder !== folderFilter) return false;
      if (tagFilter && !item.tags.includes(tagFilter)) return false;
      if (!dateMatchesFilter(item.eventAt, dateFilter)) return false;
      if (!term) return true;
      return `${item.title} ${workspacePlainText(item.content)} ${item.ownerName} ${item.subject ?? ""} ${item.group ?? ""} ${item.folder ?? ""} ${item.tags.join(" ")}`
        .toLocaleLowerCase("es-MX").includes(term);
    }).sort((first, second) => {
      if (first.pinned !== second.pinned) return first.pinned ? -1 : 1;
      if (sort === "oldest") return first.updatedAt.localeCompare(second.updatedAt);
      if (sort === "title") return first.title.localeCompare(second.title, "es-MX");
      if (sort === "event") return String(first.eventAt || "9999").localeCompare(String(second.eventAt || "9999"));
      return second.updatedAt.localeCompare(first.updatedAt);
    });
  }, [dateFilter, filter, folderFilter, groupFilter, items, ownerFilter, profile.uid, scope, search, sort, subjectFilter, tagFilter, view]);

  const activeItems = items.filter((item) => !item.archived && !item.isTemplate);
  const ownedCount = activeItems.filter((item) => item.ownerId === profile.uid).length;
  const activeFilterCount = [filter !== "all", scope !== "all", !!subjectFilter, !!groupFilter, !!ownerFilter, !!folderFilter, !!tagFilter, dateFilter !== "all"].filter(Boolean).length;
  const todayKey = mexicoDateKey();
  const upcomingItems = activeItems.filter((item) =>
    item.type === "schedule" && item.eventAt && item.eventAt.slice(0, 10) >= todayKey,
  ).sort((first, second) => String(first.eventAt).localeCompare(String(second.eventAt))).slice(0, 3);

  function prepareEditor(nextDraft: StaffWorkspaceItemInput, itemId: string, item: StaffWorkspaceItem | null, focused = false, baseline?: string) {
    setSelectedItem(item);
    setDraft(nextDraft);
    setTagsText(nextDraft.tags.join(", "));
    setDraftId(itemId);
    setDraftBaseline(baseline ?? JSON.stringify(nextDraft));
    setInitialAttachmentPaths(nextDraft.attachments.map((attachment) => attachment.storagePath));
    setRemovedAttachments([]);
    setFocusMode(focused);
    setDraftSaveState("idle");
    setTransferTargetId("");
    setCommentText("");
    setComments([]);
    setItemReceipts([]);
    setActivity([]);
    setEditorOpen(true);
  }

  function startNewDraft(nextDraft: StaffWorkspaceItemInput) {
    const start = () => prepareEditor(nextDraft, workspaceId(), null);
    if (recoverableDraft) {
      setConfirmation({
        title: "¿Reemplazar el borrador guardado?",
        description: "Al empezar, el borrador anterior se reemplazará cuando edites contenido. Puedes cancelar y continuar tu borrador primero.",
        confirmLabel: nextDraft.isTemplate ? "Crear plantilla" : "Crear documento",
        danger: true,
        icon: RotateCcw,
        onConfirm: start,
      });
      return;
    }
    start();
  }

  function openNewItem(type: StaffWorkspaceItemType = "note", isTemplate = false, withStructure = false) {
    startNewDraft({ ...emptyDraft(type), isTemplate, content: withStructure ? templateContent(type) : "" });
  }

  function openItem(item: StaffWorkspaceItem, focused = false, syncRoute = true) {
    if (syncRoute) {
      window.history.pushState({}, "", `/my-space/${encodeURIComponent(item.id)}`);
    }
    const nextDraft = draftFromItem(item);
    prepareEditor(nextDraft, item.id, item, focused);
    if (!isUnread(item)) return;
    const optimisticReceipt: StaffWorkspaceReadReceipt = {
      id: `${item.id}_${profile.uid}`,
      institutionId: profile.institutionId,
      itemId: item.id,
      readerId: profile.uid,
      readerName: profile.name,
      readAt: new Date().toISOString(),
    };
    setReceipts((current) => [
      ...current.filter((receipt) => receipt.itemId !== item.id),
      optimisticReceipt,
    ]);
    setItemReceipts((current) => [
      ...current.filter((receipt) => receipt.readerId !== profile.uid),
      optimisticReceipt,
    ]);
    if (firebaseReady) void markStaffWorkspaceItemRead(profile, item.id).catch((error) =>
      toast.error(friendlyFirebaseError(error)),
    );
  }

  function restoreDraft() {
    if (!recoverableDraft) return;
    const item = recoverableDraft.selectedItemId
      ? items.find((candidate) => candidate.id === recoverableDraft.selectedItemId) ?? null
      : null;
    prepareEditor(
      recoverableDraft.draft,
      recoverableDraft.itemId,
      item,
      false,
      recoverableDraft.baseline,
    );
  }

  function persistLocalDraft() {
    const stored: StoredWorkspaceDraft = { itemId: draftId, selectedItemId: selectedItem?.id ?? null, baseline: draftBaseline, draft, savedAt: new Date().toISOString() };
    try {
      window.localStorage.setItem(workspaceDraftKey(profile.uid), JSON.stringify(stored));
      setRecoverableDraft(stored);
      return true;
    } catch {
      toast.error("No se pudo guardar el borrador en este dispositivo. Guarda el documento antes de cerrar.");
      return false;
    }
  }

  useEffect(() => {
    if (!editorOpen) return;
    const trigger = document.activeElement as HTMLElement | null;
    return () => { trigger?.focus(); };
  }, [editorOpen]);

  function closeEditor() {
    if (saving || uploadingFiles > 0) return;
    const finishClosing = () => {
      if (draftDirty && !persistLocalDraft()) return;
      window.history.pushState({}, "", "/my-space");
      setEditorOpen(false);
    };
    if (draftDirty) {
      setConfirmation({
        title: "¿Cerrar con cambios pendientes?",
        description: "Tus cambios sin publicar seguirán guardados en este dispositivo para que puedas recuperarlos más tarde.",
        confirmLabel: "Cerrar editor",
        icon: X,
        onConfirm: finishClosing,
      });
      return;
    }
    finishClosing();
  }

  function discardDraft() {
    setConfirmation({
      title: "¿Descartar este borrador?",
      description: "Se eliminarán el borrador local y los archivos nuevos que todavía no se hayan publicado. Esta acción no se puede deshacer.",
      confirmLabel: "Descartar borrador",
      danger: true,
      icon: Trash2,
      onConfirm: () => {
        cleanUnsavedUploads();
        window.localStorage.removeItem(workspaceDraftKey(profile.uid));
        setRecoverableDraft(null);
        setEditorOpen(false);
      },
    });
  }

  function discardSavedDraft() {
    setConfirmation({
      title: "¿Descartar el borrador guardado?",
      description: "El borrador se eliminará de este dispositivo y ya no podrás recuperarlo.",
      confirmLabel: "Descartar borrador",
      danger: true,
      icon: Trash2,
      onConfirm: () => {
        window.localStorage.removeItem(workspaceDraftKey(profile.uid));
        setRecoverableDraft(null);
      },
    });
  }

  function cleanUnsavedUploads() {
    if (!firebaseReady) {
      draft.attachments.forEach((attachment) => {
        if (attachment.url.startsWith("blob:")) URL.revokeObjectURL(attachment.url);
      });
      return;
    }
    const initial = new Set(initialAttachmentPaths);
    draft.attachments.filter((attachment) => attachment.storagePath && !initial.has(attachment.storagePath))
      .forEach((attachment) => void deleteStaffWorkspaceFile(attachment.storagePath));
  }

  useEffect(() => {
    if (!editorOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (event.key === "Escape" && !saving && !confirmation && !target?.closest(".bn-container")) {
        closeEditor();
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  });

  async function uploadEditorFile(file: File) {
    setUploadingFiles((count) => count + 1);
    try {
      const attachment = firebaseReady
        ? await uploadStaffWorkspaceFile(profile, draftId, file)
        : {
          id: workspaceId(), name: file.name,
          contentType: file.type || "application/octet-stream", size: file.size,
          storagePath: "", url: URL.createObjectURL(file),
        };
      setDraft((current) => ({
        ...current,
        attachments: current.attachments.some((item) => item.id === attachment.id)
          ? current.attachments : [...current.attachments, attachment],
      }));
      return attachment.url;
    } catch (error) {
      toast.error(friendlyFirebaseError(error));
      throw error;
    } finally {
      setUploadingFiles((count) => Math.max(0, count - 1));
    }
  }

  async function addResourceFiles(files: File[]) {
    for (const file of files) {
      try { await uploadEditorFile(file); } catch { /* error surfaced by uploadEditorFile */ }
    }
  }

  function removeAttachment(attachment: StaffWorkspaceAttachment) {
    setDraft((current) => ({
      ...current,
      attachments: current.attachments.filter((item) => item.id !== attachment.id),
    }));
    if (initialAttachmentPaths.includes(attachment.storagePath)) {
      setRemovedAttachments((current) => [...current, attachment]);
    } else if (attachment.storagePath) {
      void deleteStaffWorkspaceFile(attachment.storagePath);
    } else if (attachment.url.startsWith("blob:")) {
      URL.revokeObjectURL(attachment.url);
    }
  }

  function toggleSharedMember(memberId: string) {
    setDraft((current) => ({
      ...current,
      sharedWithIds: current.sharedWithIds.includes(memberId)
        ? current.sharedWithIds.filter((id) => id !== memberId)
        : [...current.sharedWithIds, memberId],
    }));
  }

  function registerMention(memberId: string) {
    if (memberId === profile.uid) return;
    setDraft((current) => ({
      ...current,
      visibility: current.visibility === "private" ? "selected" : current.visibility,
      sharedWithIds: current.visibility === "staff" || current.sharedWithIds.includes(memberId)
        ? current.sharedWithIds
        : [...current.sharedWithIds, memberId],
      mentionedUserIds: current.mentionedUserIds.includes(memberId)
        ? current.mentionedUserIds
        : [...current.mentionedUserIds, memberId],
    }));
  }

  function toggleAssignee(memberId: string) {
    if (memberId === profile.uid) return;
    setDraft((current) => {
      const selected = current.assigneeIds.includes(memberId);
      return {
        ...current,
        visibility: selected ? current.visibility : current.visibility === "private" ? "selected" : current.visibility,
        sharedWithIds: selected || current.visibility === "staff" || current.sharedWithIds.includes(memberId)
          ? current.sharedWithIds
          : [...current.sharedWithIds, memberId],
        assigneeIds: selected
          ? current.assigneeIds.filter((id) => id !== memberId)
          : [...current.assigneeIds, memberId],
      };
    });
  }

  function persistSavedViews(next: WorkspaceSavedView[]) {
    setSavedViews(next);
    window.localStorage.setItem(workspaceViewsKey(profile.uid), JSON.stringify(next));
  }

  function saveCurrentView() {
    const name = window.prompt("Nombre para esta vista:", "Mi vista");
    if (!name?.trim()) return;
    const savedView: WorkspaceSavedView = {
      id: workspaceId(),
      name: name.trim().slice(0, 50),
      search,
      filter,
      scope,
      subject: subjectFilter,
      group: groupFilter,
      owner: ownerFilter,
      folder: folderFilter,
      tag: tagFilter,
      date: dateFilter,
      sort,
    };
    persistSavedViews([...savedViews, savedView]);
    setActiveSavedViewId(savedView.id);
    toast.success("Vista guardada");
  }

  function applySavedView(id: string) {
    setActiveSavedViewId(id);
    const savedView = savedViews.find((candidate) => candidate.id === id);
    if (!savedView) return;
    setSearch(savedView.search);
    setFilter(savedView.filter);
    setScope(savedView.scope);
    setSubjectFilter(savedView.subject);
    setGroupFilter(savedView.group);
    setOwnerFilter(savedView.owner);
    setFolderFilter(savedView.folder);
    setTagFilter(savedView.tag);
    setDateFilter(savedView.date);
    setSort(savedView.sort);
  }

  function deleteActiveView() {
    if (!activeSavedViewId) return;
    persistSavedViews(savedViews.filter((savedView) => savedView.id !== activeSavedViewId));
    setActiveSavedViewId("");
    toast.success("Vista eliminada");
  }

  function resetFilters() {
    setSearch("");
    setFilter("all");
    setScope("all");
    setSubjectFilter("");
    setGroupFilter("");
    setOwnerFilter("");
    setFolderFilter("");
    setTagFilter("");
    setDateFilter("all");
    setSort("updated");
    setActiveSavedViewId("");
  }

  async function saveItem() {
    if (saving) return;
    if (!draft.title.trim()) return void toast.error("Agrega un título para guardar el bloque.");
    if (draft.visibility === "selected" && draft.sharedWithIds.length === 0) {
      return void toast.error("Selecciona al menos una persona para compartir este bloque.");
    }
    if (uploadingFiles > 0) return void toast.error("Espera a que terminen de subir los archivos.");
    setSaving(true);
    try {
      if (firebaseReady) {
        if (selectedItem) await updateStaffWorkspaceItem(profile, selectedItem.id, draft);
        else await createStaffWorkspaceItem(profile, draft, draftId);
        await Promise.all(removedAttachments.filter((attachment) => attachment.storagePath)
          .map((attachment) => deleteStaffWorkspaceFile(attachment.storagePath)));
      } else if (selectedItem) {
        setItems((current) => current.map((item) => item.id === selectedItem.id
          ? { ...item, ...draft, updatedAt: new Date().toISOString() } : item));
      } else {
        const now = new Date().toISOString();
        setItems((current) => [{
          ...draft, id: draftId, institutionId: profile.institutionId,
          ownerId: profile.uid, ownerName: profile.name, pinned: false,
          createdAt: now, updatedAt: now,
        }, ...current]);
      }
      toast.success(draft.isTemplate ? "Plantilla guardada" : selectedItem ? "Documento actualizado" : "Documento guardado");
      setView(draft.isTemplate ? "templates" : "blocks");
      resetFilters();
      window.history.pushState({}, "", "/my-space");
      window.localStorage.removeItem(workspaceDraftKey(profile.uid));
      setRecoverableDraft(null);
      setDraftBaseline(JSON.stringify(draft));
      setEditorOpen(false);
    } catch (error) {
      toast.error(friendlyFirebaseError(error));
    } finally {
      setSaving(false);
    }
  }

  async function togglePinned(item: StaffWorkspaceItem) {
    try {
      if (firebaseReady) await setStaffWorkspaceItemPinned(profile, item.id, !item.pinned);
      else setItems((current) => current.map((candidate) => candidate.id === item.id
        ? { ...candidate, pinned: !candidate.pinned } : candidate));
      toast.success(item.pinned ? "Quitado de favoritos" : "Fijado en tu espacio");
    } catch (error) { toast.error(friendlyFirebaseError(error)); }
  }

  async function toggleArchived(item: StaffWorkspaceItem) {
    try {
      if (firebaseReady) await setStaffWorkspaceItemArchived(profile, item.id, !item.archived);
      else setItems((current) => current.map((candidate) => candidate.id === item.id
        ? { ...candidate, archived: !candidate.archived, updatedAt: new Date().toISOString() }
        : candidate));
      setEditorOpen(false);
      toast.success(item.archived ? "Bloque restaurado" : "Bloque archivado");
    } catch (error) { toast.error(friendlyFirebaseError(error)); }
  }

  function duplicateItem(item: StaffWorkspaceItem) {
    const nextDraft = {
      ...draftFromItem(item),
      title: `${item.title} · copia`,
      archived: false,
      isTemplate: false,
      eventAt: item.type === "schedule" ? "" : item.eventAt ?? "",
      attachments: [],
    };
    startNewDraft(nextDraft);
  }

  function createFromTemplate(item: StaffWorkspaceItem) {
    startNewDraft({ ...workspaceTemplateDraft(draftFromItem(item)), isTemplate: false });
  }

  async function saveAsTemplate(item: StaffWorkspaceItemInput) {
    if (saving || uploadingFiles > 0 || !item.title.trim()) return;
    setSaving(true);
    const templateDraft = workspaceTemplateDraft(item);
    try {
      if (firebaseReady) await createStaffWorkspaceItem(profile, templateDraft);
      else {
        const now = new Date().toISOString();
        setItems((current) => [{
          ...templateDraft,
          id: workspaceId(),
          institutionId: profile.institutionId,
          ownerId: profile.uid,
          ownerName: profile.name,
          pinned: false,
          createdAt: now,
          updatedAt: now,
        }, ...current]);
      }
      toast.success("Plantilla guardada", { description: "Encuéntrala en Plantillas y elige «Usar plantilla». Se guardaron el texto y la estructura; agrega los archivos a cada documento." });
    } catch (error) { toast.error(friendlyFirebaseError(error)); }
    finally { setSaving(false); }
  }

  async function addComment() {
    const content = commentText.trim();
    if (!selectedItem || !content) return;
    setCommentSending(true);
    try {
      if (firebaseReady) await createStaffWorkspaceComment(profile, selectedItem.id, content);
      else {
        const now = new Date().toISOString();
        setComments((current) => [...current, {
          id: workspaceId(),
          institutionId: profile.institutionId,
          itemId: selectedItem.id,
          authorId: profile.uid,
          authorName: profile.name,
          authorInitials: profile.initials,
          content,
          createdAt: now,
        }]);
        setActivity((current) => [{
          id: workspaceId(),
          institutionId: profile.institutionId,
          itemId: selectedItem.id,
          actorId: profile.uid,
          actorName: profile.name,
          action: "commented",
          detail: "Agregó un comentario",
          createdAt: now,
        }, ...current]);
      }
      setCommentText("");
      toast.success("Comentario publicado");
    } catch (error) { toast.error(friendlyFirebaseError(error)); }
    finally { setCommentSending(false); }
  }

  async function transferOwnership() {
    if (!selectedItem || !transferTargetId) return;
    const nextOwner = transferCandidates.find((candidate) => candidate.uid === transferTargetId);
    if (!nextOwner) return;
    const item = selectedItem;
    setConfirmation({
      title: `¿Transferir “${item.title}”?`,
      description: `${nextOwner.name} pasará a ser la persona propietaria y podrá editar el bloque. Tú conservarás acceso como colaborador.`,
      confirmLabel: "Transferir propiedad",
      icon: UserRound,
      onConfirm: async () => {
        setSaving(true);
        try {
          if (firebaseReady) await transferStaffWorkspaceItem(profile, item, nextOwner);
          else setItems((current) => current.map((candidate) => candidate.id === item.id
            ? {
              ...candidate,
              ownerId: nextOwner.uid,
              ownerName: nextOwner.name,
              visibility: candidate.visibility === "private" ? "selected" : candidate.visibility,
              sharedWithIds: [...new Set([...candidate.sharedWithIds, profile.uid])],
              updatedAt: new Date().toISOString(),
            }
            : candidate));
          setEditorOpen(false);
          toast.success("Propiedad transferida", { description: `${nextOwner.name} ahora puede editar este bloque.` });
        } catch (error) { toast.error(friendlyFirebaseError(error)); }
        finally { setSaving(false); }
      },
    });
  }

  function removeItem(item: StaffWorkspaceItem) {
    setConfirmation({
      title: `¿Eliminar “${item.title}”?`,
      description: "Se eliminarán el bloque y sus archivos asociados. Esta acción no se puede deshacer.",
      confirmLabel: "Eliminar definitivamente",
      danger: true,
      icon: Trash2,
      onConfirm: async () => {
        setSaving(true);
        try {
          if (firebaseReady) await deleteStaffWorkspaceItem(profile, item);
          else setItems((current) => current.filter((candidate) => candidate.id !== item.id));
          setEditorOpen(false);
          toast.success("Bloque eliminado");
        } catch (error) { toast.error(friendlyFirebaseError(error)); }
        finally { setSaving(false); }
      },
    });
  }

  async function confirmWorkspaceAction() {
    if (!confirmation || confirmationBusy) return;
    setConfirmationBusy(true);
    try {
      await confirmation.onConfirm();
      setConfirmation(null);
    } catch (error) {
      toast.error(friendlyFirebaseError(error));
    } finally {
      setConfirmationBusy(false);
    }
  }

  const selectedOwned = !selectedItem || selectedItem.ownerId === profile.uid;
  const activeDetails = typeDetails[draft.type];

  return (
    <div className="staff-workspace-page">
      {recoverableDraft && !editorOpen && (
        <section className="staff-workspace-draft-banner" role="status">
          <span><RotateCcw size={18} /></span>
          <div><strong>Tienes un borrador guardado</strong><small>Se conservó automáticamente {relativeDate(recoverableDraft.savedAt).toLowerCase()}.</small></div>
          <button onClick={restoreDraft} type="button">Continuar borrador</button>
          <button aria-label="Descartar borrador guardado" onClick={discardSavedDraft} type="button"><X size={16} /></button>
        </section>
      )}

      <nav className="staff-workspace-view-tabs" aria-label="Vistas de Mi espacio">
        {([
          { id: "blocks", label: "Mis documentos", icon: LayoutGrid, count: ownedCount },
          { id: "inbox", label: "Compartido conmigo", icon: Inbox, count: unreadCount },
          { id: "templates", label: "Plantillas", icon: Copy, count: items.filter((item) => item.isTemplate && !item.archived).length },
          { id: "archive", label: "Archivo", icon: Archive, count: items.filter((item) => item.archived).length },
        ] as const).map((option) => (
          <button aria-current={view === option.id ? "page" : undefined} className={view === option.id ? "active" : ""} key={option.id} onClick={() => { setView(option.id); resetFilters(); }} type="button">
            <option.icon size={16} /><span>{option.label}</span>{option.count > 0 && <em>{option.count}</em>}
          </button>
        ))}
      </nav>

      <div className="staff-workspace-layout">
        <main className="staff-workspace-main">
          <div className="staff-workspace-toolbar">
            <label className="staff-workspace-search"><Search size={16} /><input aria-label="Buscar en Mi espacio" onChange={(event) => setSearch(event.target.value)} placeholder="Buscar notas, recursos o personas…" value={search} /></label>
            <button className="primary-button staff-workspace-create-button" onClick={() => openNewItem("note", view === "templates")} type="button"><Plus size={16} /> {view === "templates" ? "Crear plantilla" : "Nuevo documento"}</button>
            <button className="secondary-button" aria-expanded={filtersOpen} aria-controls="workspace-filter-panel" onClick={() => setFiltersOpen((open) => !open)} type="button"><SlidersHorizontal size={16} /> Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}</button>
            {(activeFilterCount > 0 || search) && <button className="secondary-button" onClick={resetFilters} type="button">Limpiar</button>}
          </div>
          {filtersOpen && <section id="workspace-filter-panel" aria-label="Filtros de documentos">
          <div className="staff-workspace-advanced-filters">
            <label><span>Tipo</span><select aria-label="Filtrar por tipo" value={filter} onChange={(event) => setFilter(event.target.value as WorkspaceFilter)}><option value="all">Todos los tipos</option>{Object.entries(typeDetails).map(([type, details]) => <option key={type} value={type}>{details.label}</option>)}</select></label>
            <label><span>Visibilidad</span><select value={scope} onChange={(event) => setScope(event.target.value as WorkspaceScope)}><option value="all">Cualquiera</option><option value="private">Sólo yo</option><option value="shared">Compartido</option></select></label>
            <label><span>Materia</span><select aria-label="Filtrar por materia" onChange={(event) => setSubjectFilter(event.target.value)} value={subjectFilter}><option value="">Todas</option>{filterOptions.subjects.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label><span>Grupo</span><select aria-label="Filtrar por grupo" onChange={(event) => setGroupFilter(event.target.value)} value={groupFilter}><option value="">Todos</option>{filterOptions.groups.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label><span>Autor</span><select aria-label="Filtrar por autor" onChange={(event) => setOwnerFilter(event.target.value)} value={ownerFilter}><option value="">Todos</option>{filterOptions.owners.map(([id, name]) => <option key={id} value={id}>{id === profile.uid ? "Yo" : name}</option>)}</select></label>
            <label><span>Carpeta</span><select aria-label="Filtrar por carpeta" onChange={(event) => setFolderFilter(event.target.value)} value={folderFilter}><option value="">Todas</option>{filterOptions.folders.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label><span>Etiqueta</span><select aria-label="Filtrar por etiqueta" onChange={(event) => setTagFilter(event.target.value)} value={tagFilter}><option value="">Todas</option>{filterOptions.tags.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label><span>Fecha</span><select aria-label="Filtrar por fecha" onChange={(event) => setDateFilter(event.target.value as WorkspaceDateFilter)} value={dateFilter}><option value="all">Cualquier fecha</option><option value="today">Hoy</option><option value="week">Próximos 7 días</option><option value="month">Próximo mes</option><option value="without-date">Sin fecha</option></select></label>
            <label><span>Orden</span><select aria-label="Ordenar bloques" onChange={(event) => setSort(event.target.value as WorkspaceSort)} value={sort}><option value="updated">Actualizados</option><option value="oldest">Más antiguos</option><option value="title">Título</option><option value="event">Fecha programada</option></select></label>
          </div>

          <div className="staff-workspace-saved-views">
            <label><History size={15} /><select aria-label="Abrir vista guardada" onChange={(event) => applySavedView(event.target.value)} value={activeSavedViewId}><option value="">Vistas guardadas</option>{savedViews.map((savedView) => <option key={savedView.id} value={savedView.id}>{savedView.name}</option>)}</select></label>
            <button onClick={saveCurrentView} type="button"><Save size={14} /> Guardar vista</button>
            {activeSavedViewId && <button aria-label="Eliminar vista guardada" onClick={deleteActiveView} type="button"><Trash2 size={14} /></button>}
            <button onClick={resetFilters} type="button"><RotateCcw size={14} /> Limpiar filtros</button>
          </div>

          </section>}

          {view === "templates" && <section className="staff-workspace-template-guide">
            <div><span className="eyebrow">EMPIEZA CON UNA ESTRUCTURA</span><h3>Prepara una vez. Reutiliza cuando quieras.</h3><p>Crea una plantilla o guarda cualquier documento con «Guardar como plantilla». Al usarla, se abre una copia privada y el original se conserva.</p></div>
            <div className="staff-workspace-template-starters">{Object.entries(typeDetails).map(([type, details]) => <button key={type} onClick={() => openNewItem(type as StaffWorkspaceItemType, true, true)} type="button"><details.icon size={20} /><span><strong>{details.label}</strong><small>{details.description}</small></span><Plus size={16} /></button>)}</div>
          </section>}
          <p className="staff-workspace-result-count" role="status">{filteredItems.length} {view === "templates" ? "plantillas guardadas" : "documentos"}{activeFilterCount > 0 || search ? " · Con filtros aplicados" : ""}</p>

          {loading ? <div className="staff-workspace-loading"><LoaderCircle className="spin" size={20} /> Preparando tu espacio…</div> : filteredItems.length ? (
            <motion.div className="staff-workspace-board" layout><AnimatePresence mode="popLayout">
              {filteredItems.map((item, index) => {
                const details = typeDetails[item.type];
                const TypeIcon = details.icon;
                const owned = item.ownerId === profile.uid;
                const firstAttachment = item.attachments[0];
                return (
                  <motion.article animate={{ opacity: 1, scale: 1, y: 0 }} className={`staff-workspace-card ${item.type} ${isUnread(item) ? "is-unread" : ""}`} exit={reduceMotion ? undefined : { opacity: 0, scale: 0.97 }} initial={reduceMotion ? false : { opacity: 0, y: 10 }} key={item.id} layout transition={{ delay: reduceMotion ? 0 : Math.min(index * 0.025, 0.15) }}>
                    <div className="staff-workspace-card-topline">
                      <span className={`staff-workspace-type-icon ${item.type}`}><TypeIcon size={16} /></span><span className="staff-workspace-card-type">{item.isTemplate ? "Plantilla" : details.label}</span>{item.pinned && <Pin aria-label="Fijado" size={14} />}{item.mentionedUserIds.includes(profile.uid) && <span className="staff-workspace-mention-badge"><AtSign size={11} /> Mención</span>}{isUnread(item) && <span className="staff-workspace-unread-dot">Nuevo</span>}
                      <span className={`staff-workspace-visibility ${item.visibility}`}>
                        {item.visibility === "private" ? <LockKeyhole size={12} /> : item.visibility === "selected" ? <UserRound size={12} /> : <Users size={12} />}{visibilityLabel(item)}
                      </span>
                    </div>
                    <button className="staff-workspace-card-open" onClick={() => openItem(item)} type="button"><h3>{item.title}</h3><p>{workspacePlainText(item.content) || "Sin contenido adicional."}</p></button>
                    {(item.folder || item.tags.length > 0) && <div className="staff-workspace-card-taxonomy">{item.folder && <span><Folder size={12} /> {item.folder}</span>}{item.tags.slice(0, 3).map((tag) => <span key={tag}><Tag size={11} /> {tag}</span>)}</div>}
                    {item.assigneeIds.length > 0 && <div className="staff-workspace-card-assignees"><UserCheck size={13} /> {item.assigneeIds.slice(0, 2).map((id) => teamMembers.find((member) => member.id === id)?.name ?? "Equipo").join(", ")}{item.assigneeIds.length > 2 ? ` +${item.assigneeIds.length - 2}` : ""}</div>}
                    {item.type === "schedule" && item.eventAt && <span className="staff-workspace-card-date"><Clock3 size={14} /> {shortDate(item.eventAt)}</span>}
                    {item.type === "resource" && firstAttachment && <a className="staff-workspace-card-link" href={firstAttachment.url} rel="noreferrer" target="_blank"><Download size={13} /> {item.attachments.length === 1 ? "Abrir archivo" : `${item.attachments.length} archivos`}</a>}
                    <footer>
                      <span>{owned ? "Tú" : item.ownerName} · {relativeDate(item.updatedAt)}</span>
                      <div className="staff-workspace-card-actions">
                        {item.isTemplate && !item.archived && <button onClick={() => createFromTemplate(item)} type="button"><Copy size={14} /> Usar plantilla</button>}
                        <details className="staff-workspace-item-menu">
                          <summary aria-label={`Acciones de ${item.title}`}><MoreHorizontal size={19} /></summary>
                          <div>
                            <button onClick={() => openItem(item)} type="button"><Pencil size={15} /> {owned ? "Editar" : "Abrir"}</button>
                            {!item.isTemplate && <button onClick={() => duplicateItem(item)} type="button"><Copy size={15} /> Duplicar</button>}
                            {owned && !item.isTemplate && <button disabled={saving} onClick={() => void saveAsTemplate(item)} type="button"><Sparkles size={15} /> Guardar como plantilla</button>}
                            {owned && <button onClick={() => void toggleArchived(item)} type="button">{item.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}{item.archived ? "Restaurar" : "Archivar"}</button>}
                            {owned && !item.archived && <button onClick={() => void togglePinned(item)} type="button">{item.pinned ? <PinOff size={15} /> : <Pin size={15} />}{item.pinned ? "Desfijar" : "Fijar"}</button>}
                          </div>
                        </details>
                      </div>
                    </footer>
                  </motion.article>
                );
              })}
            </AnimatePresence></motion.div>
          ) : <div className="staff-workspace-empty"><span>{view === "inbox" ? <Inbox size={20} /> : view === "templates" ? <Copy size={20} /> : view === "archive" ? <Archive size={20} /> : <Search size={20} />}</span><h3>{activeFilterCount > 0 || search ? "No hay resultados para esta búsqueda" : view === "inbox" ? "Tu bandeja está al día" : view === "templates" ? "Aún no tienes plantillas" : view === "archive" ? "El archivo está vacío" : "Tu próximo documento empieza aquí"}</h3><p>{activeFilterCount > 0 || search ? "Prueba con otras palabras o limpia los filtros." : view === "inbox" ? "Los bloques que compartan contigo aparecerán aquí." : view === "templates" ? "Guarda un bloque como plantilla para reutilizar su estructura." : view === "archive" ? "Aquí aparecerán los bloques que decidas archivar." : "Crea un documento en blanco o elige una estructura en Plantillas."}</p>{view === "blocks" && <button onClick={() => openNewItem()} type="button"><Plus size={15} /> Crear una nota</button>}</div>}
        </main>

        <aside className="staff-workspace-aside">
          <section className="staff-workspace-today">
            <header><span><CalendarDays size={16} /></span><div><small>HOY</small><strong>{new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</strong></div></header>
            {upcomingItems.length ? <div className="staff-workspace-agenda">{upcomingItems.map((item) => <button key={item.id} onClick={() => openItem(item)} type="button"><span>{item.eventAt?.slice(0, 10) === todayKey ? "Hoy" : shortDate(item.eventAt)}</span><strong>{item.title}</strong></button>)}</div> : <p>No tienes horarios próximos. Tu día está despejado.</p>}
            <button className="staff-workspace-add-event" onClick={() => openNewItem("schedule")} type="button"><Plus size={14} /> Agregar horario</button>
          </section>
        </aside>
      </div>

      <AnimatePresence>{editorOpen && (
        <motion.div animate={{ opacity: 1 }} className={`staff-workspace-editor-backdrop ${focusMode ? "is-focus" : ""}`} exit={{ opacity: 0 }} initial={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) closeEditor(); }}>
          <FocusTrap active={!confirmation}><motion.section animate={{ opacity: 1, x: 0, scale: 1 }} aria-labelledby="staff-workspace-editor-title" aria-modal="true" className="staff-workspace-editor" exit={reduceMotion ? undefined : { opacity: 0, x: 28, scale: 0.985 }} initial={reduceMotion ? false : { opacity: 0, x: 42, scale: 0.985 }} role="dialog" transition={{ type: "spring", stiffness: 360, damping: 34 }}>
            <header><div><span className="eyebrow">{focusMode ? "MODO ENFOQUE" : draft.isTemplate ? "PLANTILLA REUTILIZABLE" : selectedItem ? "EDITAR DOCUMENTO" : "NUEVO DOCUMENTO"}</span><h2 id="staff-workspace-editor-title">{selectedItem?.title || activeDetails.label}</h2></div><span role="status" className={`staff-workspace-autosave ${draftSaveState}`}>{draftSaveState === "saving" ? <LoaderCircle className="spin" size={13} /> : <Check size={13} />}{draftSaveState === "saving" ? "Guardando borrador…" : draftSaveState === "saved" ? "Borrador guardado en este dispositivo" : draftSaveState === "error" ? "No se pudo guardar el borrador" : "Sin cambios"}</span><button aria-pressed={focusMode} aria-label={focusMode ? "Salir del modo enfoque" : "Modo enfoque"} className="plain-icon" onClick={() => setFocusMode((current) => !current)} type="button">{focusMode ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button><button disabled={saving || uploadingFiles > 0} aria-label="Cerrar Mi espacio" className="plain-icon" onClick={() => closeEditor()} type="button"><X size={19} /></button></header>

            {selectedOwned ? <div className="staff-workspace-editor-form" inert={saving}>
              <label className="staff-workspace-document-type"><span>Tipo de documento</span><select value={draft.type} onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value as StaffWorkspaceItemType }))}>{Object.entries(typeDetails).map(([type, details]) => <option key={type} value={type}>{details.label}</option>)}</select></label>
              {draft.isTemplate && <p className="staff-workspace-template-notice"><Copy size={17} /> Estás editando una plantilla. Guárdala y después elige «Usar plantilla» para crear documentos con esta estructura. Los archivos se agregan a cada copia.</p>}
              <label className="staff-workspace-title-field"><span>Título</span><input data-autofocus maxLength={120} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder={activeDetails.titlePlaceholder} value={draft.title} /></label>

              {draft.type === "planning" && <div className="staff-workspace-metadata-grid planning">
                <label><span>Materia</span><input onChange={(event) => setDraft((current) => ({ ...current, subject: event.target.value }))} placeholder="Ej. Lenguaje" value={draft.subject} /></label>
                <label><span>Grupo</span><input onChange={(event) => setDraft((current) => ({ ...current, group: event.target.value }))} placeholder="Ej. 4° A" value={draft.group} /></label>
                <label><span>Fecha</span><input onChange={(event) => setDraft((current) => ({ ...current, eventAt: event.target.value }))} type="date" value={draft.eventAt?.slice(0, 10)} /></label>
              </div>}
              {draft.type === "schedule" && <div className="staff-workspace-metadata-grid schedule">
                <label><span>Fecha y hora</span><input onChange={(event) => setDraft((current) => ({ ...current, eventAt: event.target.value }))} type="datetime-local" value={draft.eventAt} /></label>
                <label><span>Ubicación</span><span className="staff-workspace-input-with-icon"><MapPin size={14} /><input onChange={(event) => setDraft((current) => ({ ...current, location: event.target.value }))} placeholder="Sala, aula o enlace" value={draft.location} /></span></label>
              </div>}

              {draft.type === "resource" && <section className="staff-workspace-resource-uploader">
                <div className="staff-workspace-field-heading"><span>Archivos del recurso</span><small>PDF, Office, imágenes, audio, video o ZIP · 25 MB máx.</small></div>
                <label className="staff-workspace-dropzone">{uploadingFiles > 0 ? <LoaderCircle className="spin" size={22} /> : <UploadCloud size={22} />}<span><strong>{uploadingFiles > 0 ? "Subiendo…" : "Selecciona archivos"}</strong><small>También puedes insertarlos dentro del documento con <b>/</b></small></span><input disabled={uploadingFiles > 0} multiple onChange={(event) => { void addResourceFiles(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = ""; }} type="file" /></label>
                {draft.attachments.length > 0 && <div className="staff-workspace-attachment-list">{draft.attachments.map((attachment) => <div key={attachment.id}><span className="staff-workspace-file-icon"><FileText size={15} /></span><span><strong>{attachment.name}</strong><small>{bytesLabel(attachment.size)}</small></span><a aria-label={`Abrir ${attachment.name}`} href={attachment.url} rel="noreferrer" target="_blank"><Download size={14} /></a><button aria-label={`Quitar ${attachment.name}`} onClick={() => removeAttachment(attachment)} type="button"><X size={14} /></button></div>)}</div>}
              </section>}

              <section className="staff-workspace-document-field">
                <div className="staff-workspace-field-heading"><span>{draft.type === "planning" ? "Desarrollo de la planeación" : draft.type === "resource" ? "Ficha del recurso" : draft.type === "schedule" ? "Agenda y acuerdos" : "Contenido"}</span><small>Selecciona texto para darle formato</small></div>
                <WorkspaceEditorHint />
                <StaffWorkspaceRichEditor content={draft.content} documentKey={draftId} members={teamMembers} onChange={(content) => setDraft((current) => ({ ...current, content }))} onMention={registerMention} onUploadFile={uploadEditorFile} />
              </section>

              <details className="staff-workspace-details"><summary>Organización y etiquetas</summary>
              <div className="staff-workspace-metadata-grid organization">
                <label><span>Carpeta</span><span className="staff-workspace-input-with-icon"><Folder size={14} /><input list="workspace-folders" maxLength={80} onChange={(event) => setDraft((current) => ({ ...current, folder: event.target.value }))} placeholder="Ej. Planeaciones 4° A" value={draft.folder} /></span><datalist id="workspace-folders">{filterOptions.folders.map((folder) => <option key={folder} value={folder} />)}</datalist></label>
                <label><span>Etiquetas</span><span className="staff-workspace-input-with-icon"><Tag size={14} /><input maxLength={240} onChange={(event) => { const value = event.target.value; setTagsText(value); setDraft((current) => ({ ...current, tags: value.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 12) })); }} placeholder="lectura, semana 8" value={tagsText} /></span></label>
              </div>

              </details>

              <details className="staff-workspace-details"><summary>Compartir · {visibilityLabel(draft)}</summary>
              <fieldset className="staff-workspace-visibility-picker"><legend>Compartir</legend>{([
                { value: "private", icon: LockKeyhole, title: "Sólo yo", detail: "Privado en tu cuenta" },
                { value: "selected", icon: UserRound, title: "Personas específicas", detail: "Elige uno o varios miembros" },
                { value: "staff", icon: Users, title: "Todo el equipo", detail: "Dirección y docentes" },
              ] as const).map((option) => <button aria-pressed={draft.visibility === option.value} className={draft.visibility === option.value ? "active" : ""} key={option.value} onClick={() => setDraft((current) => ({ ...current, visibility: option.value }))} type="button"><option.icon size={16} /><span><strong>{option.title}</strong><small>{option.detail}</small></span>{draft.visibility === option.value && <Check size={16} />}</button>)}</fieldset>

              <AnimatePresence initial={false}>{draft.visibility === "selected" && <motion.div animate={{ opacity: 1, y: 0 }} className="staff-workspace-member-picker" exit={{ opacity: 0, y: -6 }} initial={{ opacity: 0, y: -6 }}><div><strong>Compartir con</strong><span>{draft.sharedWithIds.length} seleccionados</span></div>{shareCandidates.length ? <div className="staff-workspace-member-grid">{shareCandidates.map((member) => <label className={draft.sharedWithIds.includes(member.id) ? "selected" : ""} key={member.id}><input checked={draft.sharedWithIds.includes(member.id)} onChange={() => toggleSharedMember(member.id)} type="checkbox" /><span className="staff-workspace-mention-avatar">{member.initials}</span><span>{member.name}</span>{draft.sharedWithIds.includes(member.id) && <Check size={14} />}</label>)}</div> : <p>No hay otros docentes activos disponibles.</p>}</motion.div>}</AnimatePresence>

              {draft.visibility !== "private" && <fieldset className="staff-workspace-assignee-picker"><legend><UserCheck size={15} /> Responsables</legend><p>Asigna a quienes deben dar seguimiento. También recibirán acceso al bloque.</p><div>{shareCandidates.map((member) => <label className={draft.assigneeIds.includes(member.id) ? "selected" : ""} key={member.id}><input checked={draft.assigneeIds.includes(member.id)} onChange={() => toggleAssignee(member.id)} type="checkbox" /><span className="staff-workspace-mention-avatar">{member.initials}</span><span>{member.name}</span>{draft.assigneeIds.includes(member.id) && <Check size={14} />}</label>)}</div></fieldset>}

              </details>

              <footer>
                <details className="staff-workspace-item-menu editor-actions">
                  <summary><MoreHorizontal size={18} /> Más opciones</summary>
                  <div>
                    {selectedItem && <button disabled={saving || uploadingFiles > 0} onClick={() => removeItem(selectedItem)} type="button"><Trash2 size={15} /> Eliminar</button>}
                    {selectedItem && <button disabled={saving || uploadingFiles > 0 || draftDirty} title={draftDirty ? "Guarda o descarta los cambios antes de archivar" : undefined} onClick={() => void toggleArchived(selectedItem)} type="button">{selectedItem.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}{selectedItem.archived ? "Restaurar" : "Archivar"}</button>}
                    {draftDirty && <button disabled={saving || uploadingFiles > 0} onClick={discardDraft} type="button">Descartar borrador</button>}
                    <button disabled={saving || uploadingFiles > 0} onClick={() => closeEditor()} type="button">Cerrar editor</button>
                  </div>
                </details>
                {!draft.isTemplate && <button className="secondary-button" disabled={saving || uploadingFiles > 0 || !draft.title.trim()} onClick={() => void saveAsTemplate(draft)} type="button"><Copy size={15} /> Guardar como plantilla</button>}
                <button className="primary-button" disabled={saving || uploadingFiles > 0 || !draft.title.trim()} onClick={() => void saveItem()} type="button">{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}{saving ? "Guardando…" : draft.isTemplate ? "Guardar plantilla" : "Guardar documento"}</button>
              </footer>
            </div> : selectedItem ? <div className="staff-workspace-reader">
              <div className="staff-workspace-reader-meta"><span className={`staff-workspace-type-icon ${selectedItem.type}`}>{(() => { const ReaderIcon = typeDetails[selectedItem.type].icon; return <ReaderIcon size={17} />; })()}</span><span>Compartido por <strong>{selectedItem.ownerName}</strong></span></div>
              <h3>{selectedItem.title}</h3>
              {(selectedItem.subject || selectedItem.group || selectedItem.location) && <div className="staff-workspace-reader-details">{selectedItem.subject && <span><BookOpen size={14} /> {selectedItem.subject}</span>}{selectedItem.group && <span><Users size={14} /> {selectedItem.group}</span>}{selectedItem.location && <span><MapPin size={14} /> {selectedItem.location}</span>}</div>}
              {selectedItem.eventAt && <span className="staff-workspace-reader-date"><CalendarDays size={15} /> {shortDate(selectedItem.eventAt)}</span>}
              {selectedItem.attachments.length > 0 && <div className="staff-workspace-attachment-list reader">{selectedItem.attachments.map((attachment) => <a href={attachment.url} key={attachment.id} rel="noreferrer" target="_blank"><FileText size={15} /><span><strong>{attachment.name}</strong><small>{bytesLabel(attachment.size)}</small></span><Download size={14} /></a>)}</div>}
              <StaffWorkspaceRichEditor content={selectedItem.content} documentKey={`reader-${selectedItem.id}-${selectedItem.updatedAt}`} editable={false} members={teamMembers} />
              <div className="staff-workspace-reader-note"><Pencil size={15} /> Sólo la persona que creó este bloque puede editarlo.</div>
            </div> : null}

            {selectedItem && <section className="staff-workspace-collaboration-hub">
              <div className="staff-workspace-collaboration-grid">
                <section className="staff-workspace-comments">
                  <header><span><MessageCircle size={16} /></span><div><strong>Comentarios</strong><small>{comments.length ? `${comments.length} en la conversación` : "Inicia la conversación"}</small></div></header>
                  <div className="staff-workspace-comment-list">{comments.length ? comments.map((comment) => <article key={comment.id}><span>{comment.authorInitials}</span><div><strong>{comment.authorName}</strong><small>{relativeDate(comment.createdAt)}</small><p>{comment.content}</p></div></article>) : <p>Aún no hay comentarios en este bloque.</p>}</div>
                  <div className="staff-workspace-comment-form"><textarea aria-label="Escribir comentario" maxLength={2000} onChange={(event) => setCommentText(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void addComment(); }} placeholder="Escribe un comentario para el equipo…" value={commentText} /><button disabled={commentSending || !commentText.trim()} onClick={() => void addComment()} type="button">{commentSending ? <LoaderCircle className="spin" size={15} /> : <MessageCircle size={15} />} Comentar</button></div>
                </section>

                <section className="staff-workspace-activity-panel">
                  <header><span><History size={16} /></span><div><strong>Actividad</strong><small>Historial del bloque</small></div></header>
                  <div>{activity.length ? activity.slice(0, 8).map((entry) => <article key={entry.id}><span /><p><strong>{entry.actorName}</strong> {activityLabel(entry)}<small>{relativeDate(entry.createdAt)}</small></p></article>) : <p>La actividad aparecerá aquí.</p>}</div>
                </section>
              </div>

              <div className="staff-workspace-collaboration-footer">
                <div className="staff-workspace-read-receipts"><Eye size={15} /><span><strong>Confirmaciones de lectura</strong><small>{itemReceipts.length ? itemReceipts.map((receipt) => receipt.readerId === profile.uid ? "Tú" : receipt.readerName).join(", ") : "Nadie ha abierto este bloque todavía"}</small></span></div>
                {selectedOwned && transferCandidates.length > 0 && <div className="staff-workspace-transfer"><UserRound size={15} /><label><span>Transferir propiedad</span><select onChange={(event) => setTransferTargetId(event.target.value)} value={transferTargetId}><option value="">Selecciona docente</option>{transferCandidates.map((account) => <option key={account.uid} value={account.uid}>{account.name}</option>)}</select></label><button disabled={!transferTargetId || saving} onClick={() => void transferOwnership()} type="button">Transferir</button></div>}
              </div>
            </section>}
          </motion.section></FocusTrap>
        </motion.div>
      )}</AnimatePresence>

      <AnimatePresence>{confirmation && (
        <WorkspaceConfirmationModal
          busy={confirmationBusy}
          confirmation={confirmation}
          onCancel={() => {
            if (!confirmationBusy) setConfirmation(null);
          }}
          onConfirm={() => void confirmWorkspaceAction()}
          reduceMotion={reduceMotion}
        />
      )}</AnimatePresence>
    </div>
  );
}
