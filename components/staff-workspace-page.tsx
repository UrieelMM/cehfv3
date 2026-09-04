"use client";

import {
  CalendarDays,
  Check,
  ClipboardCheck,
  Clock3,
  ExternalLink,
  Eye,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Save,
  Search,
  Sparkles,
  StickyNote,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { toast } from "sonner";
import {
  createStaffWorkspaceItem,
  deleteStaffWorkspaceItem,
  setStaffWorkspaceItemPinned,
  updateStaffWorkspaceItem,
  watchStaffWorkspace,
} from "@/lib/staff-workspace-firebase";
import type {
  StaffWorkspaceItem,
  StaffWorkspaceItemInput,
  StaffWorkspaceItemType,
  StaffWorkspaceVisibility,
  UserProfile,
} from "@/lib/types";
import { friendlyFirebaseError } from "@/lib/firebase";

type Props = {
  profile: UserProfile;
  firebaseReady: boolean;
};

type WorkspaceFilter = "all" | StaffWorkspaceItemType;
type WorkspaceScope = "all" | StaffWorkspaceVisibility;

const typeDetails: Record<
  StaffWorkspaceItemType,
  { label: string; description: string; icon: ComponentType<{ size?: number }> }
> = {
  planning: {
    label: "Planeación",
    description: "Secuencias, objetivos y pendientes",
    icon: ClipboardCheck,
  },
  resource: {
    label: "Recurso",
    description: "Enlaces y materiales de consulta",
    icon: Link2,
  },
  schedule: {
    label: "Horario",
    description: "Recordatorios y momentos clave",
    icon: CalendarDays,
  },
  note: {
    label: "Nota",
    description: "Ideas rápidas y acuerdos",
    icon: StickyNote,
  },
};

const emptyDraft: StaffWorkspaceItemInput = {
  type: "note",
  title: "",
  content: "",
  visibility: "private",
  eventAt: "",
  resourceUrl: "",
};

function demoWorkspaceItems(profile: UserProfile): StaffWorkspaceItem[] {
  const now = new Date();
  const later = new Date(now);
  later.setHours(13, 30, 0, 0);
  return [
    {
      id: "demo-planning",
      institutionId: profile.institutionId,
      ownerId: profile.uid,
      ownerName: profile.name,
      type: "planning",
      title: "Secuencia de lectura · Semana 8",
      content:
        "Propósito: distinguir ideas principales y secundarias.\n\nInicio · lectura guiada\nDesarrollo · mapa de ideas\nCierre · reflexión en parejas",
      visibility: "private",
      pinned: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: "demo-resource",
      institutionId: profile.institutionId,
      ownerId: "demo-colleague",
      ownerName: "Mariana López",
      type: "resource",
      title: "Banco de actividades socioemocionales",
      content: "Dinámicas breves para apertura y cierre de clase.",
      visibility: "staff",
      pinned: false,
      resourceUrl: "https://example.com/recursos",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: "demo-schedule",
      institutionId: profile.institutionId,
      ownerId: profile.uid,
      ownerName: profile.name,
      type: "schedule",
      title: "Reunión de seguimiento",
      content: "Revisar avances y acuerdos del grupo.",
      visibility: "staff",
      pinned: false,
      eventAt: later.toISOString().slice(0, 16),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
  ];
}

function shortDate(value?: string) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
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

function safeWebUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function mexicoDateKey() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Mexico_City",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function StaffWorkspacePage({ profile, firebaseReady }: Props) {
  const reduceMotion = useReducedMotion();
  const [items, setItems] = useState<StaffWorkspaceItem[]>(() =>
    firebaseReady ? [] : demoWorkspaceItems(profile),
  );
  const [loading, setLoading] = useState(firebaseReady);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<WorkspaceFilter>("all");
  const [scope, setScope] = useState<WorkspaceScope>("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<StaffWorkspaceItem | null>(null);
  const [draft, setDraft] = useState<StaffWorkspaceItemInput>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [focusMode, setFocusMode] = useState(false);

  useEffect(() => {
    if (!firebaseReady) return;
    return watchStaffWorkspace(
      profile,
      (next) => {
        setItems(next);
        setLoading(false);
      },
      (error) => {
        setLoading(false);
        toast.error(friendlyFirebaseError(error));
      },
    );
  }, [firebaseReady, profile]);

  useEffect(() => {
    if (!editorOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) setEditorOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [editorOpen, saving]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es-MX");
    return items.filter((item) => {
      if (filter !== "all" && item.type !== filter) return false;
      if (scope !== "all" && item.visibility !== scope) return false;
      if (!term) return true;
      return `${item.title} ${item.content} ${item.ownerName}`
        .toLocaleLowerCase("es-MX")
        .includes(term);
    });
  }, [filter, items, scope, search]);

  const privateCount = items.filter(
    (item) => item.ownerId === profile.uid && item.visibility === "private",
  ).length;
  const sharedCount = items.filter((item) => item.visibility === "staff").length;
  const todayKey = mexicoDateKey();
  const upcomingItems = items
    .filter((item) => item.type === "schedule" && item.eventAt)
    .sort((first, second) => String(first.eventAt).localeCompare(String(second.eventAt)))
    .slice(0, 3);

  function openNewItem(type: StaffWorkspaceItemType = "note") {
    setSelectedItem(null);
    setDraft({ ...emptyDraft, type });
    setFocusMode(false);
    setEditorOpen(true);
  }

  function openItem(item: StaffWorkspaceItem, focused = false) {
    setSelectedItem(item);
    setDraft({
      type: item.type,
      title: item.title,
      content: item.content,
      visibility: item.visibility,
      eventAt: item.eventAt ?? "",
      resourceUrl: item.resourceUrl ?? "",
    });
    setFocusMode(focused);
    setEditorOpen(true);
  }

  async function saveItem() {
    if (!draft.title.trim()) {
      toast.error("Agrega un título para guardar el bloque.");
      return;
    }
    if (draft.type === "resource" && draft.resourceUrl && !safeWebUrl(draft.resourceUrl)) {
      toast.error("El recurso necesita un enlace http o https válido.");
      return;
    }
    setSaving(true);
    try {
      if (firebaseReady) {
        if (selectedItem) {
          await updateStaffWorkspaceItem(profile, selectedItem.id, draft);
        } else {
          await createStaffWorkspaceItem(profile, draft);
        }
      } else if (selectedItem) {
        setItems((current) =>
          current.map((item) =>
            item.id === selectedItem.id
              ? { ...item, ...draft, updatedAt: new Date().toISOString() }
              : item,
          ),
        );
      } else {
        const now = new Date().toISOString();
        setItems((current) => [
          {
            ...draft,
            id: `demo-${Date.now()}`,
            institutionId: profile.institutionId,
            ownerId: profile.uid,
            ownerName: profile.name,
            pinned: false,
            createdAt: now,
            updatedAt: now,
          },
          ...current,
        ]);
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
      if (firebaseReady) {
        await setStaffWorkspaceItemPinned(profile, item.id, !item.pinned);
      } else {
        setItems((current) =>
          current.map((candidate) =>
            candidate.id === item.id
              ? { ...candidate, pinned: !candidate.pinned }
              : candidate,
          ),
        );
      }
      toast.success(item.pinned ? "Quitado de favoritos" : "Fijado en tu espacio");
    } catch (error) {
      toast.error(friendlyFirebaseError(error));
    }
  }

  async function removeItem(item: StaffWorkspaceItem) {
    if (!window.confirm(`¿Eliminar “${item.title}”? Esta acción no se puede deshacer.`)) {
      return;
    }
    setSaving(true);
    try {
      if (firebaseReady) {
        await deleteStaffWorkspaceItem(profile, item.id);
      } else {
        setItems((current) => current.filter((candidate) => candidate.id !== item.id));
      }
      setEditorOpen(false);
      toast.success("Bloque eliminado");
    } catch (error) {
      toast.error(friendlyFirebaseError(error));
    } finally {
      setSaving(false);
    }
  }

  const selectedOwned = !selectedItem || selectedItem.ownerId === profile.uid;

  return (
    <div className="staff-workspace-page">
      <motion.section
        animate={{ opacity: 1, y: 0 }}
        className="staff-workspace-hero"
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      >
        <div className="staff-workspace-hero-copy">
          <span className="staff-workspace-kicker">
            <Sparkles size={14} /> Tu centro de trabajo
          </span>
          <h2>Un lugar para pensar, preparar y compartir.</h2>
          <p>
            Organiza tus planeaciones, recursos, horarios y notas sin mezclarlo
            con el espacio académico de los alumnos.
          </p>
        </div>
        <div className="staff-workspace-hero-actions">
          <button
            className="staff-workspace-focus-button"
            disabled={!items.length}
            onClick={() => openItem(items.find((item) => item.pinned) ?? items[0], true)}
            type="button"
          >
            <Eye size={16} /> Modo enfoque
          </button>
          <button
            className="primary-button staff-workspace-create-button"
            onClick={() => openNewItem()}
            type="button"
          >
            <Plus size={17} /> Nuevo bloque
          </button>
        </div>
        <div className="staff-workspace-stats">
          <span><strong>{items.length}</strong> bloques</span>
          <span><LockKeyhole size={14} /><strong>{privateCount}</strong> privados</span>
          <span><Users size={14} /><strong>{sharedCount}</strong> compartidos</span>
        </div>
      </motion.section>

      <section className="staff-workspace-quick-create" aria-label="Creación rápida">
        <div>
          <span className="eyebrow">CAPTURA RÁPIDA</span>
          <strong>¿Qué quieres guardar?</strong>
        </div>
        {Object.entries(typeDetails).map(([type, details]) => (
          <button key={type} onClick={() => openNewItem(type as StaffWorkspaceItemType)} type="button">
            <span className={`staff-workspace-type-icon ${type}`}>
              <details.icon size={17} />
            </span>
            <span>
              <strong>{details.label}</strong>
              <small>{details.description}</small>
            </span>
            <Plus size={15} />
          </button>
        ))}
      </section>

      <div className="staff-workspace-layout">
        <main className="staff-workspace-main">
          <div className="staff-workspace-toolbar">
            <label className="staff-workspace-search">
              <Search size={16} />
              <input
                aria-label="Buscar en Mi espacio"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar notas, recursos o personas…"
                value={search}
              />
            </label>
            <div className="staff-workspace-scope" aria-label="Visibilidad">
              {(["all", "private", "staff"] as WorkspaceScope[]).map((value) => (
                <button
                  className={scope === value ? "active" : ""}
                  key={value}
                  onClick={() => setScope(value)}
                  type="button"
                >
                  {value === "all" ? "Todo" : value === "private" ? "Sólo yo" : "Equipo"}
                </button>
              ))}
            </div>
          </div>

          <div className="staff-workspace-filters" aria-label="Tipos de bloque">
            {(["all", ...Object.keys(typeDetails)] as WorkspaceFilter[]).map((value) => (
              <button
                className={filter === value ? "active" : ""}
                key={value}
                onClick={() => setFilter(value)}
                type="button"
              >
                {value === "all" ? "Todos" : typeDetails[value].label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="staff-workspace-loading">
              <LoaderCircle className="spin" size={20} /> Preparando tu espacio…
            </div>
          ) : filteredItems.length ? (
            <motion.div className="staff-workspace-board" layout>
              <AnimatePresence mode="popLayout">
                {filteredItems.map((item, index) => {
                  const details = typeDetails[item.type];
                  const TypeIcon = details.icon;
                  const owned = item.ownerId === profile.uid;
                  const resourceUrl = safeWebUrl(item.resourceUrl);
                  return (
                    <motion.article
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      className={`staff-workspace-card ${item.type}`}
                      exit={reduceMotion ? undefined : { opacity: 0, scale: 0.97 }}
                      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                      key={item.id}
                      layout
                      transition={{ delay: reduceMotion ? 0 : Math.min(index * 0.025, 0.15) }}
                    >
                      <div className="staff-workspace-card-topline">
                        <span className={`staff-workspace-type-icon ${item.type}`}>
                          <TypeIcon size={16} />
                        </span>
                        <span className="staff-workspace-card-type">{details.label}</span>
                        {item.pinned && <Pin aria-label="Fijado" size={14} />}
                        <span className={`staff-workspace-visibility ${item.visibility}`}>
                          {item.visibility === "private" ? <LockKeyhole size={12} /> : <Users size={12} />}
                          {item.visibility === "private" ? "Sólo yo" : "Equipo"}
                        </span>
                      </div>
                      <button
                        className="staff-workspace-card-open"
                        onClick={() => openItem(item)}
                        type="button"
                      >
                        <h3>{item.title}</h3>
                        <p>{item.content || "Sin contenido adicional."}</p>
                      </button>
                      {item.type === "schedule" && item.eventAt && (
                        <span className="staff-workspace-card-date">
                          <Clock3 size={14} /> {shortDate(item.eventAt)}
                        </span>
                      )}
                      {item.type === "resource" && resourceUrl && (
                        <a
                          className="staff-workspace-card-link"
                          href={resourceUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Abrir recurso <ExternalLink size={13} />
                        </a>
                      )}
                      <footer>
                        <span>
                          {owned ? "Tú" : item.ownerName} · {relativeDate(item.updatedAt)}
                        </span>
                        {owned && (
                          <button
                            aria-label={item.pinned ? "Desfijar bloque" : "Fijar bloque"}
                            onClick={() => void togglePinned(item)}
                            type="button"
                          >
                            {item.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                          </button>
                        )}
                      </footer>
                    </motion.article>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          ) : (
            <div className="staff-workspace-empty">
              <span><Search size={20} /></span>
              <h3>No encontramos bloques</h3>
              <p>Ajusta los filtros o crea algo nuevo para comenzar.</p>
              <button onClick={() => openNewItem()} type="button">
                <Plus size={15} /> Crear una nota
              </button>
            </div>
          )}
        </main>

        <aside className="staff-workspace-aside">
          <section className="staff-workspace-today">
            <header>
              <span><CalendarDays size={16} /></span>
              <div>
                <small>HOY</small>
                <strong>{new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</strong>
              </div>
            </header>
            {upcomingItems.length ? (
              <div className="staff-workspace-agenda">
                {upcomingItems.map((item) => (
                  <button key={item.id} onClick={() => openItem(item)} type="button">
                    <span>{item.eventAt?.slice(0, 10) === todayKey ? "Hoy" : shortDate(item.eventAt)}</span>
                    <strong>{item.title}</strong>
                  </button>
                ))}
              </div>
            ) : (
              <p>No tienes horarios próximos. Tu día está despejado.</p>
            )}
            <button className="staff-workspace-add-event" onClick={() => openNewItem("schedule")} type="button">
              <Plus size={14} /> Agregar horario
            </button>
          </section>

          <section className="staff-workspace-collaboration">
            <span className="staff-workspace-collaboration-icon"><Users size={18} /></span>
            <h3>Ideas que circulan</h3>
            <p>
              Comparte un bloque con el equipo para que Dirección y docentes
              puedan consultarlo en su propio espacio.
            </p>
            <div className="staff-workspace-avatar-row" aria-label="Equipo docente">
              <span>CE</span><span>ML</span><span>+</span>
            </div>
          </section>
        </aside>
      </div>

      <AnimatePresence>
        {editorOpen && (
          <motion.div
            animate={{ opacity: 1 }}
            className={`staff-workspace-editor-backdrop ${focusMode ? "is-focus" : ""}`}
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !saving) setEditorOpen(false);
            }}
          >
            <motion.section
              animate={{ opacity: 1, x: 0, scale: 1 }}
              aria-labelledby="staff-workspace-editor-title"
              aria-modal="true"
              className="staff-workspace-editor"
              exit={reduceMotion ? undefined : { opacity: 0, x: 28, scale: 0.985 }}
              initial={reduceMotion ? false : { opacity: 0, x: 42, scale: 0.985 }}
              role="dialog"
              transition={{ type: "spring", stiffness: 360, damping: 34 }}
            >
              <header>
                <div>
                  <span className="eyebrow">
                    {focusMode ? "MODO ENFOQUE" : selectedItem ? "EDITAR BLOQUE" : "NUEVO BLOQUE"}
                  </span>
                  <h2 id="staff-workspace-editor-title">
                    {selectedItem?.title || typeDetails[draft.type].label}
                  </h2>
                </div>
                <button
                  aria-label="Cerrar Mi espacio"
                  className="plain-icon"
                  onClick={() => setEditorOpen(false)}
                  type="button"
                >
                  <X size={19} />
                </button>
              </header>

              {selectedOwned ? (
                <form
                  className="staff-workspace-editor-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveItem();
                  }}
                >
                  <div className="staff-workspace-type-picker" aria-label="Tipo de bloque">
                    {Object.entries(typeDetails).map(([type, details]) => (
                      <button
                        className={draft.type === type ? "active" : ""}
                        key={type}
                        onClick={() => setDraft((current) => ({ ...current, type: type as StaffWorkspaceItemType }))}
                        type="button"
                      >
                        <details.icon size={15} /> {details.label}
                      </button>
                    ))}
                  </div>
                  <label className="staff-workspace-title-field">
                    <span>Título</span>
                    <input
                      autoFocus
                      maxLength={120}
                      onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                      placeholder="Escribe un título claro…"
                      value={draft.title}
                    />
                  </label>
                  <label className="staff-workspace-content-field">
                    <span>Contenido</span>
                    <textarea
                      maxLength={8000}
                      onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))}
                      placeholder="Empieza a escribir. Puedes usar saltos de línea para ordenar tus ideas…"
                      value={draft.content}
                    />
                  </label>
                  {draft.type === "schedule" && (
                    <label>
                      <span>Fecha y hora</span>
                      <input
                        onChange={(event) => setDraft((current) => ({ ...current, eventAt: event.target.value }))}
                        type="datetime-local"
                        value={draft.eventAt}
                      />
                    </label>
                  )}
                  {draft.type === "resource" && (
                    <label>
                      <span>Enlace del recurso</span>
                      <input
                        inputMode="url"
                        onChange={(event) => setDraft((current) => ({ ...current, resourceUrl: event.target.value }))}
                        placeholder="https://…"
                        type="url"
                        value={draft.resourceUrl}
                      />
                    </label>
                  )}
                  <fieldset className="staff-workspace-visibility-picker">
                    <legend>Quién puede verlo</legend>
                    <button
                      className={draft.visibility === "private" ? "active" : ""}
                      onClick={() => setDraft((current) => ({ ...current, visibility: "private" }))}
                      type="button"
                    >
                      <LockKeyhole size={16} />
                      <span><strong>Sólo yo</strong><small>Privado en tu cuenta</small></span>
                      {draft.visibility === "private" && <Check size={16} />}
                    </button>
                    <button
                      className={draft.visibility === "staff" ? "active" : ""}
                      onClick={() => setDraft((current) => ({ ...current, visibility: "staff" }))}
                      type="button"
                    >
                      <Users size={16} />
                      <span><strong>Equipo CEHF</strong><small>Visible para Dirección y docentes</small></span>
                      {draft.visibility === "staff" && <Check size={16} />}
                    </button>
                  </fieldset>
                  <footer>
                    {selectedItem && (
                      <button
                        className="staff-workspace-delete"
                        disabled={saving}
                        onClick={() => void removeItem(selectedItem)}
                        type="button"
                      >
                        <Trash2 size={15} /> Eliminar
                      </button>
                    )}
                    <button className="secondary-button" disabled={saving} onClick={() => setEditorOpen(false)} type="button">
                      Cancelar
                    </button>
                    <button className="primary-button" disabled={saving || !draft.title.trim()} type="submit">
                      {saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}
                      {saving ? "Guardando…" : "Guardar"}
                    </button>
                  </footer>
                </form>
              ) : selectedItem ? (
                <div className="staff-workspace-reader">
                  <div className="staff-workspace-reader-meta">
                    <span className={`staff-workspace-type-icon ${selectedItem.type}`}>
                      {(() => {
                        const ReaderIcon = typeDetails[selectedItem.type].icon;
                        return <ReaderIcon size={17} />;
                      })()}
                    </span>
                    <span>Compartido por <strong>{selectedItem.ownerName}</strong></span>
                  </div>
                  <h3>{selectedItem.title}</h3>
                  <p>{selectedItem.content || "Sin contenido adicional."}</p>
                  {safeWebUrl(selectedItem.resourceUrl) && (
                    <a href={safeWebUrl(selectedItem.resourceUrl)} rel="noreferrer" target="_blank">
                      Abrir recurso <ExternalLink size={15} />
                    </a>
                  )}
                  {selectedItem.eventAt && (
                    <span className="staff-workspace-reader-date">
                      <CalendarDays size={15} /> {shortDate(selectedItem.eventAt)}
                    </span>
                  )}
                  <div className="staff-workspace-reader-note">
                    <Pencil size={15} /> Sólo la persona que creó este bloque puede editarlo.
                  </div>
                </div>
              ) : null}
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
