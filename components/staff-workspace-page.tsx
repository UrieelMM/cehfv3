"use client";

import {
  BookOpen, CalendarDays, Check, ClipboardCheck, Clock3, Download, Eye,
  FileText, LoaderCircle, LockKeyhole, MapPin, Paperclip, Pencil, Pin,
  PinOff, Plus, Save, Search, Sparkles, StickyNote, Trash2, UploadCloud,
  UserRound, Users, X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { toast } from "sonner";
import {
  StaffWorkspaceRichEditor, WorkspaceEditorHint,
  type WorkspaceMentionMember,
} from "@/components/staff-workspace-rich-editor";
import { friendlyFirebaseError } from "@/lib/firebase";
import {
  createStaffWorkspaceItem, deleteStaffWorkspaceFile, deleteStaffWorkspaceItem,
  setStaffWorkspaceItemPinned, updateStaffWorkspaceItem,
  uploadStaffWorkspaceFile, watchStaffWorkspace,
} from "@/lib/staff-workspace-firebase";
import type {
  ManagedAccount, StaffWorkspaceAttachment, StaffWorkspaceItem,
  StaffWorkspaceItemInput, StaffWorkspaceItemType, UserProfile,
} from "@/lib/types";

type Props = {
  profile: UserProfile;
  accounts: ManagedAccount[];
  firebaseReady: boolean;
};
type WorkspaceFilter = "all" | StaffWorkspaceItemType;
type WorkspaceScope = "all" | "private" | "shared";

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
  const heading = (content: string) => ({ type: "heading", props: { level: 2 }, content });
  const templates: Record<StaffWorkspaceItemType, object[]> = {
    planning: [
      heading("Propósito de aprendizaje"),
      paragraph("Describe qué aprenderán los alumnos y cómo sabrás que lo lograron."),
      heading("Secuencia"),
      paragraph("Escribe / para agregar actividades, listas, tablas o archivos."),
    ],
    resource: [
      heading("Cómo usar este recurso"),
      paragraph("Agrega una descripción, indicaciones o ideas para aprovechar el material."),
    ],
    schedule: [heading("Agenda"), paragraph("Añade los temas, responsables y acuerdos de este momento.")],
    note: [paragraph("")],
  };
  return JSON.stringify(templates[type]);
}

function emptyDraft(type: StaffWorkspaceItemType = "note"): StaffWorkspaceItemInput {
  return {
    type, title: "", content: templateContent(type), visibility: "private",
    sharedWithIds: [], eventAt: "", resourceUrl: "", subject: "", group: "",
    location: "", attachments: [],
  };
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

function demoWorkspaceItems(profile: UserProfile): StaffWorkspaceItem[] {
  const now = new Date();
  const later = new Date(now);
  later.setHours(13, 30, 0, 0);
  return [
    {
      ...emptyDraft("planning"), id: "demo-planning", institutionId: profile.institutionId,
      ownerId: profile.uid, ownerName: profile.name, title: "Secuencia de lectura · Semana 8",
      subject: "Español", group: "4° A", visibility: "private", pinned: true,
      createdAt: now.toISOString(), updatedAt: now.toISOString(),
    },
    {
      ...emptyDraft("resource"), id: "demo-resource", institutionId: profile.institutionId,
      ownerId: "demo-colleague", ownerName: "Mariana López",
      title: "Banco de actividades socioemocionales",
      content: JSON.stringify([{ type: "paragraph", content: "Dinámicas breves para apertura y cierre de clase." }]),
      visibility: "staff", pinned: false,
      attachments: [{
        id: "demo-file", name: "Actividades-socioemocionales.pdf",
        contentType: "application/pdf", size: 1_245_000, storagePath: "",
        url: "https://example.com/actividades.pdf",
      }], createdAt: now.toISOString(), updatedAt: now.toISOString(),
    },
    {
      ...emptyDraft("schedule"), id: "demo-schedule", institutionId: profile.institutionId,
      ownerId: profile.uid, ownerName: profile.name, title: "Reunión de seguimiento",
      location: "Sala de maestros", visibility: "staff", pinned: false,
      eventAt: later.toISOString().slice(0, 16), createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
  ];
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

export function StaffWorkspacePage({ profile, accounts, firebaseReady }: Props) {
  const reduceMotion = useReducedMotion();
  const [items, setItems] = useState<StaffWorkspaceItem[]>(() => firebaseReady ? [] : demoWorkspaceItems(profile));
  const [loading, setLoading] = useState(firebaseReady);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<WorkspaceFilter>("all");
  const [scope, setScope] = useState<WorkspaceScope>("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<StaffWorkspaceItem | null>(null);
  const [draft, setDraft] = useState<StaffWorkspaceItemInput>(() => emptyDraft());
  const [draftId, setDraftId] = useState("");
  const [initialAttachmentPaths, setInitialAttachmentPaths] = useState<string[]>([]);
  const [removedAttachments, setRemovedAttachments] = useState<StaffWorkspaceAttachment[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(0);
  const [focusMode, setFocusMode] = useState(false);

  const teamMembers = useMemo<WorkspaceMentionMember[]>(() => {
    const members = new Map<string, WorkspaceMentionMember>();
    members.set(profile.uid, { id: profile.uid, name: profile.name, initials: profile.initials });
    accounts.filter((account) => account.role === "teacher" && account.active).forEach((account) =>
      members.set(account.uid, { id: account.uid, name: account.name, initials: account.initials }),
    );
    return [...members.values()].sort((first, second) => first.name.localeCompare(second.name, "es-MX"));
  }, [accounts, profile.initials, profile.name, profile.uid]);
  const shareCandidates = teamMembers.filter((member) => member.id !== profile.uid);

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

  function closeEditor(cleanUploads = true) {
    if (saving) return;
    if (cleanUploads) cleanUnsavedUploads();
    setEditorOpen(false);
  }

  useEffect(() => {
    if (!editorOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (event.key === "Escape" && !saving && !target?.closest(".bn-container")) {
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

  const filteredItems = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es-MX");
    return items.filter((item) => {
      if (filter !== "all" && item.type !== filter) return false;
      if (scope === "private" && item.visibility !== "private") return false;
      if (scope === "shared" && item.visibility === "private") return false;
      if (!term) return true;
      return `${item.title} ${workspacePlainText(item.content)} ${item.ownerName} ${item.subject ?? ""} ${item.group ?? ""}`
        .toLocaleLowerCase("es-MX").includes(term);
    });
  }, [filter, items, scope, search]);

  const privateCount = items.filter((item) => item.ownerId === profile.uid && item.visibility === "private").length;
  const sharedCount = items.filter((item) => item.visibility !== "private").length;
  const todayKey = mexicoDateKey();
  const upcomingItems = items.filter((item) => item.type === "schedule" && item.eventAt)
    .sort((first, second) => String(first.eventAt).localeCompare(String(second.eventAt))).slice(0, 3);

  function openNewItem(type: StaffWorkspaceItemType = "note") {
    setSelectedItem(null);
    setDraft(emptyDraft(type));
    setDraftId(workspaceId());
    setInitialAttachmentPaths([]);
    setRemovedAttachments([]);
    setFocusMode(false);
    setEditorOpen(true);
  }

  function openItem(item: StaffWorkspaceItem, focused = false) {
    setSelectedItem(item);
    setDraft({
      type: item.type, title: item.title, content: item.content,
      visibility: item.visibility, sharedWithIds: item.sharedWithIds,
      eventAt: item.eventAt ?? "", resourceUrl: item.resourceUrl ?? "",
      subject: item.subject ?? "", group: item.group ?? "", location: item.location ?? "",
      attachments: item.attachments,
    });
    setDraftId(item.id);
    setInitialAttachmentPaths(item.attachments.map((attachment) => attachment.storagePath));
    setRemovedAttachments([]);
    setFocusMode(focused);
    setEditorOpen(true);
  }

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

  async function saveItem() {
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
      toast.success(selectedItem ? "Bloque actualizado" : "Bloque creado");
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

  async function removeItem(item: StaffWorkspaceItem) {
    if (!window.confirm(`¿Eliminar “${item.title}”? Esta acción no se puede deshacer.`)) return;
    setSaving(true);
    try {
      if (firebaseReady) await deleteStaffWorkspaceItem(profile, item);
      else setItems((current) => current.filter((candidate) => candidate.id !== item.id));
      setEditorOpen(false);
      toast.success("Bloque eliminado");
    } catch (error) { toast.error(friendlyFirebaseError(error)); }
    finally { setSaving(false); }
  }

  const selectedOwned = !selectedItem || selectedItem.ownerId === profile.uid;
  const activeDetails = typeDetails[draft.type];
  const ActiveEditorIcon = activeDetails.icon;

  return (
    <div className="staff-workspace-page">
      <motion.section animate={{ opacity: 1, y: 0 }} className="staff-workspace-hero" initial={reduceMotion ? false : { opacity: 0, y: 12 }}>
        <div className="staff-workspace-hero-copy">
          <span className="staff-workspace-kicker"><Sparkles size={14} /> Tu centro de trabajo</span>
          <h2>Un lugar para pensar, preparar y compartir.</h2>
          <p>Organiza planeaciones, recursos, horarios y notas con la flexibilidad de un documento por bloques.</p>
        </div>
        <div className="staff-workspace-hero-actions">
          <button className="staff-workspace-focus-button" disabled={!items.length} onClick={() => openItem(items.find((item) => item.pinned) ?? items[0], true)} type="button"><Eye size={16} /> Modo enfoque</button>
          <button className="primary-button staff-workspace-create-button" onClick={() => openNewItem()} type="button"><Plus size={17} /> Nuevo bloque</button>
        </div>
        <div className="staff-workspace-stats">
          <span><strong>{items.length}</strong> bloques</span>
          <span><LockKeyhole size={14} /><strong>{privateCount}</strong> privados</span>
          <span><Users size={14} /><strong>{sharedCount}</strong> compartidos</span>
        </div>
      </motion.section>

      <section className="staff-workspace-quick-create" aria-label="Creación rápida">
        <div><span className="eyebrow">CAPTURA RÁPIDA</span><strong>¿Qué quieres guardar?</strong></div>
        {Object.entries(typeDetails).map(([type, details]) => (
          <button key={type} onClick={() => openNewItem(type as StaffWorkspaceItemType)} type="button">
            <span className={`staff-workspace-type-icon ${type}`}><details.icon size={17} /></span>
            <span><strong>{details.label}</strong><small>{details.description}</small></span><Plus size={15} />
          </button>
        ))}
      </section>

      <div className="staff-workspace-layout">
        <main className="staff-workspace-main">
          <div className="staff-workspace-toolbar">
            <label className="staff-workspace-search"><Search size={16} /><input aria-label="Buscar en Mi espacio" onChange={(event) => setSearch(event.target.value)} placeholder="Buscar notas, recursos o personas…" value={search} /></label>
            <div className="staff-workspace-scope" aria-label="Visibilidad">
              {(["all", "private", "shared"] as WorkspaceScope[]).map((value) => (
                <button className={scope === value ? "active" : ""} key={value} onClick={() => setScope(value)} type="button">{value === "all" ? "Todo" : value === "private" ? "Sólo yo" : "Compartido"}</button>
              ))}
            </div>
          </div>
          <div className="staff-workspace-filters" aria-label="Tipos de bloque">
            {(["all", ...Object.keys(typeDetails)] as WorkspaceFilter[]).map((value) => (
              <button className={filter === value ? "active" : ""} key={value} onClick={() => setFilter(value)} type="button">{value === "all" ? "Todos" : typeDetails[value].label}</button>
            ))}
          </div>

          {loading ? <div className="staff-workspace-loading"><LoaderCircle className="spin" size={20} /> Preparando tu espacio…</div> : filteredItems.length ? (
            <motion.div className="staff-workspace-board" layout><AnimatePresence mode="popLayout">
              {filteredItems.map((item, index) => {
                const details = typeDetails[item.type];
                const TypeIcon = details.icon;
                const owned = item.ownerId === profile.uid;
                const firstAttachment = item.attachments[0];
                return (
                  <motion.article animate={{ opacity: 1, scale: 1, y: 0 }} className={`staff-workspace-card ${item.type}`} exit={reduceMotion ? undefined : { opacity: 0, scale: 0.97 }} initial={reduceMotion ? false : { opacity: 0, y: 10 }} key={item.id} layout transition={{ delay: reduceMotion ? 0 : Math.min(index * 0.025, 0.15) }}>
                    <div className="staff-workspace-card-topline">
                      <span className={`staff-workspace-type-icon ${item.type}`}><TypeIcon size={16} /></span><span className="staff-workspace-card-type">{details.label}</span>{item.pinned && <Pin aria-label="Fijado" size={14} />}
                      <span className={`staff-workspace-visibility ${item.visibility}`}>
                        {item.visibility === "private" ? <LockKeyhole size={12} /> : item.visibility === "selected" ? <UserRound size={12} /> : <Users size={12} />}{visibilityLabel(item)}
                      </span>
                    </div>
                    <button className="staff-workspace-card-open" onClick={() => openItem(item)} type="button"><h3>{item.title}</h3><p>{workspacePlainText(item.content) || "Sin contenido adicional."}</p></button>
                    {item.type === "schedule" && item.eventAt && <span className="staff-workspace-card-date"><Clock3 size={14} /> {shortDate(item.eventAt)}</span>}
                    {item.type === "resource" && firstAttachment && <a className="staff-workspace-card-link" href={firstAttachment.url} rel="noreferrer" target="_blank"><Download size={13} /> {item.attachments.length === 1 ? "Abrir archivo" : `${item.attachments.length} archivos`}</a>}
                    <footer><span>{owned ? "Tú" : item.ownerName} · {relativeDate(item.updatedAt)}</span>{owned && <button aria-label={item.pinned ? "Desfijar bloque" : "Fijar bloque"} onClick={() => void togglePinned(item)} type="button">{item.pinned ? <PinOff size={14} /> : <Pin size={14} />}</button>}</footer>
                  </motion.article>
                );
              })}
            </AnimatePresence></motion.div>
          ) : <div className="staff-workspace-empty"><span><Search size={20} /></span><h3>No encontramos bloques</h3><p>Ajusta los filtros o crea algo nuevo para comenzar.</p><button onClick={() => openNewItem()} type="button"><Plus size={15} /> Crear una nota</button></div>}
        </main>

        <aside className="staff-workspace-aside">
          <section className="staff-workspace-today">
            <header><span><CalendarDays size={16} /></span><div><small>HOY</small><strong>{new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</strong></div></header>
            {upcomingItems.length ? <div className="staff-workspace-agenda">{upcomingItems.map((item) => <button key={item.id} onClick={() => openItem(item)} type="button"><span>{item.eventAt?.slice(0, 10) === todayKey ? "Hoy" : shortDate(item.eventAt)}</span><strong>{item.title}</strong></button>)}</div> : <p>No tienes horarios próximos. Tu día está despejado.</p>}
            <button className="staff-workspace-add-event" onClick={() => openNewItem("schedule")} type="button"><Plus size={14} /> Agregar horario</button>
          </section>
          <section className="staff-workspace-collaboration">
            <span className="staff-workspace-collaboration-icon"><Users size={18} /></span><h3>Trabajo conectado</h3><p>Usa <strong>@</strong> para mencionar colegas y comparte cada bloque con quien corresponda.</p>
            <div className="staff-workspace-avatar-row" aria-label="Equipo docente">{teamMembers.slice(0, 3).map((member) => <span key={member.id} title={member.name}>{member.initials}</span>)}{teamMembers.length > 3 && <span>+{teamMembers.length - 3}</span>}</div>
          </section>
        </aside>
      </div>

      <AnimatePresence>{editorOpen && (
        <motion.div animate={{ opacity: 1 }} className={`staff-workspace-editor-backdrop ${focusMode ? "is-focus" : ""}`} exit={{ opacity: 0 }} initial={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) closeEditor(); }}>
          <motion.section animate={{ opacity: 1, x: 0, scale: 1 }} aria-labelledby="staff-workspace-editor-title" aria-modal="true" className="staff-workspace-editor" exit={reduceMotion ? undefined : { opacity: 0, x: 28, scale: 0.985 }} initial={reduceMotion ? false : { opacity: 0, x: 42, scale: 0.985 }} role="dialog" transition={{ type: "spring", stiffness: 360, damping: 34 }}>
            <header><div><span className="eyebrow">{focusMode ? "MODO ENFOQUE" : selectedItem ? "EDITAR BLOQUE" : "NUEVO BLOQUE"}</span><h2 id="staff-workspace-editor-title">{selectedItem?.title || activeDetails.label}</h2></div><button aria-label="Cerrar Mi espacio" className="plain-icon" onClick={() => closeEditor()} type="button"><X size={19} /></button></header>

            {selectedOwned ? <div className="staff-workspace-editor-form">
              <div className="staff-workspace-type-picker" aria-label="Tipo de bloque">{Object.entries(typeDetails).map(([type, details]) => <button className={draft.type === type ? "active" : ""} key={type} onClick={() => setDraft((current) => ({ ...current, type: type as StaffWorkspaceItemType }))} type="button"><details.icon size={15} /> {details.label}</button>)}</div>
              <div className={`staff-workspace-editor-context ${draft.type}`}><span className={`staff-workspace-type-icon ${draft.type}`}><ActiveEditorIcon size={17} /></span><div><strong>{activeDetails.label}</strong><p>{activeDetails.editorDescription}</p></div></div>
              <label className="staff-workspace-title-field"><span>Título</span><input autoFocus maxLength={120} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder={activeDetails.titlePlaceholder} value={draft.title} /></label>

              {draft.type === "planning" && <div className="staff-workspace-metadata-grid planning">
                <label><span>Materia</span><input onChange={(event) => setDraft((current) => ({ ...current, subject: event.target.value }))} placeholder="Ej. Español" value={draft.subject} /></label>
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
                <div className="staff-workspace-field-heading"><span>{draft.type === "planning" ? "Desarrollo de la planeación" : draft.type === "resource" ? "Ficha del recurso" : draft.type === "schedule" ? "Agenda y acuerdos" : "Contenido"}</span><small>Editor por bloques</small></div>
                <WorkspaceEditorHint />
                <StaffWorkspaceRichEditor content={draft.content} documentKey={draftId} members={teamMembers} onChange={(content) => setDraft((current) => ({ ...current, content }))} onUploadFile={uploadEditorFile} />
              </section>

              <fieldset className="staff-workspace-visibility-picker"><legend>Compartir</legend>{([
                { value: "private", icon: LockKeyhole, title: "Sólo yo", detail: "Privado en tu cuenta" },
                { value: "selected", icon: UserRound, title: "Personas específicas", detail: "Elige uno o varios miembros" },
                { value: "staff", icon: Users, title: "Todo el equipo", detail: "Dirección y docentes" },
              ] as const).map((option) => <button className={draft.visibility === option.value ? "active" : ""} key={option.value} onClick={() => setDraft((current) => ({ ...current, visibility: option.value }))} type="button"><option.icon size={16} /><span><strong>{option.title}</strong><small>{option.detail}</small></span>{draft.visibility === option.value && <Check size={16} />}</button>)}</fieldset>

              <AnimatePresence initial={false}>{draft.visibility === "selected" && <motion.div animate={{ opacity: 1, y: 0 }} className="staff-workspace-member-picker" exit={{ opacity: 0, y: -6 }} initial={{ opacity: 0, y: -6 }}><div><strong>Compartir con</strong><span>{draft.sharedWithIds.length} seleccionados</span></div>{shareCandidates.length ? <div className="staff-workspace-member-grid">{shareCandidates.map((member) => <label className={draft.sharedWithIds.includes(member.id) ? "selected" : ""} key={member.id}><input checked={draft.sharedWithIds.includes(member.id)} onChange={() => toggleSharedMember(member.id)} type="checkbox" /><span className="staff-workspace-mention-avatar">{member.initials}</span><span>{member.name}</span>{draft.sharedWithIds.includes(member.id) && <Check size={14} />}</label>)}</div> : <p>No hay otros docentes activos disponibles.</p>}</motion.div>}</AnimatePresence>

              <footer>{selectedItem && <button className="staff-workspace-delete" disabled={saving} onClick={() => void removeItem(selectedItem)} type="button"><Trash2 size={15} /> Eliminar</button>}<button className="secondary-button" disabled={saving} onClick={() => closeEditor()} type="button">Cancelar</button><button className="primary-button" disabled={saving || uploadingFiles > 0 || !draft.title.trim()} onClick={() => void saveItem()} type="button">{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}{saving ? "Guardando…" : "Guardar"}</button></footer>
            </div> : selectedItem ? <div className="staff-workspace-reader">
              <div className="staff-workspace-reader-meta"><span className={`staff-workspace-type-icon ${selectedItem.type}`}>{(() => { const ReaderIcon = typeDetails[selectedItem.type].icon; return <ReaderIcon size={17} />; })()}</span><span>Compartido por <strong>{selectedItem.ownerName}</strong></span></div>
              <h3>{selectedItem.title}</h3>
              {(selectedItem.subject || selectedItem.group || selectedItem.location) && <div className="staff-workspace-reader-details">{selectedItem.subject && <span><BookOpen size={14} /> {selectedItem.subject}</span>}{selectedItem.group && <span><Users size={14} /> {selectedItem.group}</span>}{selectedItem.location && <span><MapPin size={14} /> {selectedItem.location}</span>}</div>}
              {selectedItem.eventAt && <span className="staff-workspace-reader-date"><CalendarDays size={15} /> {shortDate(selectedItem.eventAt)}</span>}
              {selectedItem.attachments.length > 0 && <div className="staff-workspace-attachment-list reader">{selectedItem.attachments.map((attachment) => <a href={attachment.url} key={attachment.id} rel="noreferrer" target="_blank"><FileText size={15} /><span><strong>{attachment.name}</strong><small>{bytesLabel(attachment.size)}</small></span><Download size={14} /></a>)}</div>}
              <StaffWorkspaceRichEditor content={selectedItem.content} documentKey={`reader-${selectedItem.id}-${selectedItem.updatedAt}`} editable={false} members={teamMembers} />
              <div className="staff-workspace-reader-note"><Pencil size={15} /> Sólo la persona que creó este bloque puede editarlo.</div>
            </div> : null}
          </motion.section>
        </motion.div>
      )}</AnimatePresence>
    </div>
  );
}
