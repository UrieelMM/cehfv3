"use client";

import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Image as ImageIcon,
  Link2,
  LoaderCircle,
  Paperclip,
  Play,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UploadCloud,
  Users,
  Volume2,
  X,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { friendlyFirebaseError } from "@/lib/firebase";
import {
  getLearningMaterialAttachmentUrl,
  isFirebaseLearningMaterial,
  markLearningMaterialViewed,
  watchLearningMaterialViews,
} from "@/lib/materials-firebase";
import type {
  AcademicCalendar,
  AcademicConfig,
  LearningMaterial,
  LearningMaterialCreateInput,
  LearningMaterialType,
  LearningMaterialView,
  ManagedAccount,
  UserProfile,
} from "@/lib/types";

const MATERIALS_PAGE_SIZE = 6;

function materialFromPath() {
  if (typeof window === "undefined") return null;
  const [section, materialId] = window.location.pathname.split("/").filter(Boolean);
  return section === "weekly-materials" && materialId
    ? decodeURIComponent(materialId)
    : null;
}

const materialTypeOptions: Array<{
  value: LearningMaterialType;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  { value: "pdf", label: "PDF", description: "Lectura dentro del portal", icon: FileText },
  { value: "audio", label: "Audio", description: "Reproductor con controles", icon: Volume2 },
  { value: "video", label: "Vídeo", description: "Reproductor de vídeo", icon: Play },
  { value: "image", label: "Imagen", description: "Vista amplia y descarga", icon: ImageIcon },
  { value: "document", label: "Documento", description: "Archivo para descargar", icon: Paperclip },
  { value: "link", label: "Enlace", description: "Recurso en otra página", icon: Link2 },
  { value: "other", label: "Otro", description: "Archivo complementario", icon: BookOpen },
];

const materialTypeMap = Object.fromEntries(
  materialTypeOptions.map((option) => [option.value, option]),
) as Record<LearningMaterialType, (typeof materialTypeOptions)[number]>;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(size > 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function videoEmbedUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    if (url.hostname.includes("youtube.com")) {
      const id = url.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (url.hostname === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (url.hostname.includes("vimeo.com")) {
      const id = url.pathname.split("/").filter(Boolean).at(-1);
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
  } catch {
    return null;
  }
  return null;
}

function groupOf(account: ManagedAccount) {
  return `${account.grade ?? ""} ${account.group ?? ""}`.trim();
}

export function MaterialsPage({
  materials,
  loading,
  profile,
  accounts,
  viewedIds,
  onViewed,
  firebaseReady,
}: {
  materials: LearningMaterial[];
  loading: boolean;
  profile: UserProfile;
  accounts: ManagedAccount[];
  viewedIds: Set<string>;
  onViewed: (materialId: string) => void;
  firebaseReady: boolean;
}) {
  const [search, setSearch] = useState("");
  const [week, setWeek] = useState("all");
  const [subject, setSubject] = useState("all");
  const [type, setType] = useState<LearningMaterialType | "all">("all");
  const [required, setRequired] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(materialFromPath);
  const selected = materials.find((material) => material.id === selectedId) ?? null;

  useEffect(() => {
    const onPopState = () => setSelectedId(materialFromPath());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (selectedId && !loading && !selected) {
      window.history.replaceState({}, "", "/weekly-materials");
      queueMicrotask(() => setSelectedId(null));
    }
  }, [loading, selected, selectedId]);

  function openMaterial(material: LearningMaterial) {
    window.history.pushState(
      {},
      "",
      `/weekly-materials/${encodeURIComponent(material.id)}`,
    );
    setSelectedId(material.id);
    if (profile.role === "student") onViewed(material.id);
  }

  function closeMaterial() {
    window.history.pushState({}, "", "/weekly-materials");
    setSelectedId(null);
  }

  const weeks = useMemo(
    () => [...new Map(materials.map((item) => [item.weekId, item.weekLabel])).entries()],
    [materials],
  );
  const subjects = useMemo(
    () => [...new Set(materials.map((item) => item.subject))].sort((a, b) => a.localeCompare(b, "es")),
    [materials],
  );
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es");
    return materials.filter((material) => {
      const haystack = [
        material.title,
        material.description,
        material.subject,
        material.weekLabel,
        material.createdByName,
        ...material.attachments.map((attachment) => attachment.name),
        ...material.links.map((link) => link.label),
      ]
        .join(" ")
        .toLocaleLowerCase("es");
      return (
        (!term || haystack.includes(term)) &&
        (week === "all" || material.weekId === week) &&
        (subject === "all" || material.subject === subject) &&
        (type === "all" || material.type === type) &&
        (required === "all" ||
          (required === "required" ? material.required : !material.required))
      );
    });
  }, [materials, required, search, subject, type, week]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / MATERIALS_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice(
    (currentPage - 1) * MATERIALS_PAGE_SIZE,
    currentPage * MATERIALS_PAGE_SIZE,
  );

  return (
    <div className="materials-workspace">
      <section className="materials-toolbar" aria-label="Filtros de materiales">
        <label className="materials-search">
          <Search size={17} aria-hidden="true" />
          <input
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(1); }}
            placeholder="Buscar por nombre, materia o archivo…"
            aria-label="Buscar materiales"
          />
          {search && (
            <button type="button" onClick={() => { setSearch(""); setPage(1); }} aria-label="Limpiar búsqueda">
              <X size={15} />
            </button>
          )}
        </label>
        <select value={week} onChange={(event) => { setWeek(event.target.value); setPage(1); }} aria-label="Filtrar por semana">
          <option value="all">Todas las semanas</option>
          {weeks.map(([id, label]) => <option value={id} key={id}>{label}</option>)}
        </select>
        <select value={subject} onChange={(event) => { setSubject(event.target.value); setPage(1); }} aria-label="Filtrar por materia">
          <option value="all">Todas las materias</option>
          {subjects.map((item) => <option key={item}>{item}</option>)}
        </select>
        <select value={type} onChange={(event) => { setType(event.target.value as LearningMaterialType | "all"); setPage(1); }} aria-label="Filtrar por tipo">
          <option value="all">Todos los tipos</option>
          {materialTypeOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
        </select>
        <select value={required} onChange={(event) => { setRequired(event.target.value); setPage(1); }} aria-label="Filtrar por obligatoriedad">
          <option value="all">Obligatorios y opcionales</option>
          <option value="required">Sólo obligatorios</option>
          <option value="optional">Sólo opcionales</option>
        </select>
      </section>

      <div className="materials-results-heading">
        <div>
          <strong>{loading ? "Cargando…" : `${filtered.length} ${filtered.length === 1 ? "material" : "materiales"}`}</strong>
          <span>{profile.role === "student" ? "Disponibles para tus materias" : "Publicados para tus alumnos"}</span>
        </div>
        {profile.role === "student" && (
          <span className="materials-viewed-summary"><CheckCircle2 size={15} /> {viewedIds.size} revisados</span>
        )}
      </div>

      {loading ? (
        <section className="materials-grid" aria-label="Cargando materiales">
          {Array.from({ length: 4 }, (_, index) => <div className="material-modern-card material-skeleton" key={index} />)}
        </section>
      ) : visible.length ? (
        <section className="materials-grid">
          {visible.map((material) => {
            const option = materialTypeMap[material.type] ?? materialTypeMap.other;
            const TypeIcon = option.icon;
            const viewed = viewedIds.has(material.id);
            return (
              <motion.article className={`material-modern-card is-${material.type}`} layout key={material.id}>
                <div className="material-modern-top">
                  <span className="material-modern-icon"><TypeIcon size={22} /></span>
                  <div>
                    <span>{option.label}</span>
                    <small>{material.weekLabel}</small>
                  </div>
                  {viewed && <span className="material-viewed-chip"><Check size={12} /> Visto</span>}
                </div>
                <div className="material-modern-copy">
                  <span className="material-subject">{material.subject}</span>
                  <h2>{material.title}</h2>
                  <p>{material.description || "Recurso de apoyo para esta semana."}</p>
                </div>
                <div className="material-modern-facts">
                  <span className={material.required ? "is-required" : ""}>{material.required ? "Obligatorio" : "Opcional"}</span>
                  <span><Paperclip size={12} /> {material.attachments.length + material.links.length} recursos</span>
                  {profile.role !== "student" && <span><Users size={12} /> {material.audienceStudentIds.length} alumnos</span>}
                </div>
                <footer>
                  <span>Por {material.createdByName} · {formatDate(material.createdAt)}</span>
                  <button className={profile.role === "student" && !viewed ? "primary-button" : "secondary-button"} onClick={() => {
                    openMaterial(material);
                  }}>
                    {profile.role === "student" ? (viewed ? "Abrir de nuevo" : "Abrir material") : "Ver material"}
                    <ArrowRight size={15} />
                  </button>
                </footer>
              </motion.article>
            );
          })}
        </section>
      ) : (
        <section className="materials-empty">
          <span><BookOpen size={28} /></span>
          <h2>No encontramos materiales</h2>
          <p>{materials.length ? "Prueba otra búsqueda o cambia los filtros." : profile.role === "student" ? "Cuando tus maestros publiquen recursos, aparecerán aquí." : "Publica el primer material para comenzar la biblioteca."}</p>
          {materials.length > 0 && <button className="secondary-button" onClick={() => { setSearch(""); setWeek("all"); setSubject("all"); setType("all"); setRequired("all"); }}>Limpiar filtros</button>}
        </section>
      )}

      {!loading && filtered.length > MATERIALS_PAGE_SIZE && (
        <nav className="materials-pagination" aria-label="Paginación de materiales">
          <button className="plain-icon" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label="Página anterior"><ChevronLeft size={18} /></button>
          <span>Página <strong>{currentPage}</strong> de {pageCount}</span>
          <button className="plain-icon" disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} aria-label="Página siguiente"><ChevronRight size={18} /></button>
        </nav>
      )}

      <AnimatePresence>
        {selected && (
          <MaterialViewerModal
            material={selected}
            profile={profile}
            accounts={accounts}
            firebaseReady={firebaseReady}
            onClose={closeMaterial}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function MaterialViewerModal({
  material,
  profile,
  accounts,
  firebaseReady,
  onClose,
}: {
  material: LearningMaterial;
  profile: UserProfile;
  accounts: ManagedAccount[];
  firebaseReady: boolean;
  onClose: () => void;
}) {
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const [loadingFiles, setLoadingFiles] = useState(material.attachments.length > 0);
  const [views, setViews] = useState<LearningMaterialView[]>([]);
  const [viewError, setViewError] = useState("");
  const option = materialTypeMap[material.type] ?? materialTypeMap.other;
  const TypeIcon = option.icon;

  useEffect(() => {
    let active = true;
    Promise.all(
      material.attachments.map(async (attachment) => ({
        id: attachment.id,
        url: await getLearningMaterialAttachmentUrl(attachment),
      })),
    )
      .then((entries) => {
        if (active) setAttachmentUrls(Object.fromEntries(entries.map((entry) => [entry.id, entry.url])));
      })
      .catch((error) => {
        if (active) setViewError(friendlyFirebaseError(error));
      })
      .finally(() => {
        if (active) setLoadingFiles(false);
      });
    return () => { active = false; };
  }, [material]);

  useEffect(() => {
    if (profile.role !== "student") return;
    if (!firebaseReady || !isFirebaseLearningMaterial(material)) return;
    void markLearningMaterialViewed(material, profile).catch((error) =>
      toast.error("No pudimos registrar la lectura", { description: friendlyFirebaseError(error) }),
    );
  }, [firebaseReady, material, profile]);

  useEffect(() => {
    if (profile.role === "student" || !firebaseReady) return;
    return watchLearningMaterialViews(
      material,
      setViews,
      (error) => setViewError(friendlyFirebaseError(error)),
    );
  }, [firebaseReady, material, profile.role]);

  const audience = accounts
    .filter((account) => material.audienceStudentIds.includes(account.uid))
    .sort((first, second) => first.name.localeCompare(second.name, "es"));
  const viewsByStudent = new Map(views.map((view) => [view.studentId, view]));
  const primaryAttachment = material.attachments.find((attachment) => {
    if (material.type === "pdf") return attachment.contentType === "application/pdf";
    if (material.type === "audio") return attachment.contentType.startsWith("audio/");
    if (material.type === "video") return attachment.contentType.startsWith("video/");
    if (material.type === "image") return attachment.contentType.startsWith("image/");
    return true;
  });
  const primaryUrl = primaryAttachment ? attachmentUrls[primaryAttachment.id] : "";
  const embeddedVideo = material.type === "video"
    ? material.links.map((link) => videoEmbedUrl(link.url)).find(Boolean)
    : null;

  return (
    <motion.div className="material-viewer-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <motion.section className="material-viewer" initial={{ opacity: 0, y: 20, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.985 }} role="dialog" aria-modal="true" aria-labelledby="material-viewer-title">
        <header>
          <div className={`material-viewer-title is-${material.type}`}>
            <span><TypeIcon size={22} /></span>
            <div><small>{option.label} · {material.subject}</small><h2 id="material-viewer-title">{material.title}</h2><p>{material.weekLabel} · {material.termLabel}</p></div>
          </div>
          <button className="plain-icon" onClick={onClose} aria-label="Cerrar material"><X size={19} /></button>
        </header>
        <div className="material-viewer-layout">
          <main>
            {loadingFiles ? (
              <div className="material-preview-state"><LoaderCircle className="spin" size={25} /><span>Preparando el recurso…</span></div>
            ) : material.type === "pdf" && primaryUrl ? (
              <iframe className="material-pdf-frame" src={primaryUrl} title={`PDF: ${material.title}`} />
            ) : material.type === "audio" && primaryUrl ? (
              <div className="material-audio-player"><span><Volume2 size={34} /></span><div><small>Ahora escuchas</small><strong>{primaryAttachment?.name}</strong><audio controls preload="metadata" src={primaryUrl}>Tu navegador no puede reproducir este audio.</audio></div></div>
            ) : material.type === "video" && primaryUrl ? (
              <video className="material-video-player" controls preload="metadata" src={primaryUrl}>Tu navegador no puede reproducir este vídeo.</video>
            ) : material.type === "video" && embeddedVideo ? (
              <iframe className="material-video-player" src={embeddedVideo} title={`Vídeo: ${material.title}`} allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowFullScreen />
            ) : material.type === "image" && primaryUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="material-image-preview" src={primaryUrl} alt={material.title} />
            ) : (
              <div className="material-preview-state"><span><TypeIcon size={28} /></span><strong>{material.attachments.length || material.links.length ? "El recurso está listo" : "Vista de demostración"}</strong><p>{material.attachments.length || material.links.length ? "Ábrelo desde la lista de archivos o enlaces." : "Este ejemplo muestra la experiencia; los materiales reales incluyen su archivo o enlace."}</p></div>
            )}
            {viewError && <p className="material-inline-error">{viewError}</p>}
            {material.description && <section className="material-description"><small>Acerca de este material</small><p>{material.description}</p></section>}
            {(material.attachments.length > 0 || material.links.length > 0) && (
              <section className="material-resource-list">
                <h3>Archivos y enlaces</h3>
                {material.attachments.map((attachment) => (
                  <a href={attachmentUrls[attachment.id]} target="_blank" rel="noreferrer" aria-disabled={!attachmentUrls[attachment.id]} key={attachment.id}>
                    <span><Paperclip size={16} /></span><div><strong>{attachment.name}</strong><small>{formatFileSize(attachment.size)}</small></div><Download size={16} />
                  </a>
                ))}
                {material.links.map((link) => (
                  <a href={link.url} target="_blank" rel="noreferrer" key={link.id}>
                    <span><Link2 size={16} /></span><div><strong>{link.label}</strong><small>{new URL(link.url).hostname}</small></div><ExternalLink size={16} />
                  </a>
                ))}
              </section>
            )}
          </main>
          <aside>
            <div className="material-detail-facts">
              <span className={material.required ? "is-required" : ""}><ShieldCheck size={15} /><div><small>Seguimiento</small><strong>{material.required ? "Obligatorio" : "Opcional"}</strong></div></span>
              <span><CalendarDays size={15} /><div><small>Publicado</small><strong>{formatDate(material.createdAt)}</strong></div></span>
              <span><Users size={15} /><div><small>Destinatarios</small><strong>{material.audienceStudentIds.length} alumnos</strong></div></span>
            </div>
            <div className="material-groups"><small>Grupos</small><div>{material.targetGroups.map((group) => <span key={group}>{group}</span>)}</div></div>
            {profile.role !== "student" && (
              <section className="material-reading-panel">
                <div><span><Eye size={16} /></span><div><strong>Registro de lectura</strong><small>{views.length} de {material.audienceStudentIds.length} han abierto el material</small></div></div>
                <div className="material-reading-progress"><i style={{ width: `${material.audienceStudentIds.length ? Math.round((views.length / material.audienceStudentIds.length) * 100) : 0}%` }} /></div>
                <div className="material-student-views">
                  {audience.map((student) => {
                    const view = viewsByStudent.get(student.uid);
                    return <span className={view ? "has-viewed" : ""} key={student.uid}><i>{view ? <Check size={12} /> : student.initials}</i><div><strong>{student.name}</strong><small>{view ? `Visto ${formatDateTime(view.lastOpenedAt)}${view.viewCount > 1 ? ` · ${view.viewCount} aperturas` : ""}` : "Aún no lo abre"}</small></div></span>;
                  })}
                  {!audience.length && <p>La audiencia está protegida; las lecturas aparecerán aquí conforme los alumnos abran el material.</p>}
                </div>
              </section>
            )}
          </aside>
        </div>
      </motion.section>
    </motion.div>
  );
}

function acceptsForType(type: LearningMaterialType) {
  if (type === "pdf") return "application/pdf,.pdf";
  if (type === "audio") return "audio/*";
  if (type === "video") return "video/*";
  if (type === "image") return "image/*";
  if (type === "document") return ".doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,application/pdf";
  return "application/pdf,image/*,audio/*,video/*,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv";
}

function matchesMaterialType(file: File, type: LearningMaterialType) {
  if (type === "pdf") return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (type === "audio") return file.type.startsWith("audio/");
  if (type === "video") return file.type.startsWith("video/");
  if (type === "image") return file.type.startsWith("image/");
  return true;
}

export function MaterialCreateModal({
  profile,
  config,
  calendar,
  accounts,
  onClose,
  onCreate,
}: {
  profile: UserProfile;
  config: AcademicConfig;
  calendar: AcademicCalendar;
  accounts: ManagedAccount[];
  onClose: () => void;
  onCreate: (input: LearningMaterialCreateInput) => Promise<void>;
}) {
  const subjectOptions = useMemo(() => {
    const subjects = profile.role === "teacher"
      ? profile.subjects ?? []
      : accounts.flatMap((account) => account.role === "student" ? account.subjects : []);
    return [...new Set(subjects)].sort((first, second) => first.localeCompare(second, "es"));
  }, [accounts, profile.role, profile.subjects]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<LearningMaterialType>("pdf");
  const [subject, setSubject] = useState(subjectOptions[0] ?? "General");
  const [weekId, setWeekId] = useState(config.weekId || calendar.weeks[0]?.id || "");
  const [required, setRequired] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [links, setLinks] = useState([{ id: crypto.randomUUID(), label: "", url: "" }]);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const compatibleStudents = useMemo(
    () => accounts.filter((account) => account.role === "student" && account.active && account.subjects.includes(subject) && (profile.role === "director" || account.teacherIds.includes(profile.uid))),
    [accounts, profile.role, profile.uid, subject],
  );
  const groups = useMemo(
    () => [...new Set(compatibleStudents.map(groupOf).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es", { numeric: true })),
    [compatibleStudents],
  );
  const recipients = compatibleStudents.filter((student) => selectedGroups.length === 0 || selectedGroups.includes(groupOf(student)));

  function selectFiles(selected: FileList | null) {
    if (!selected) return;
    const next = Array.from(selected);
    const invalid = next.find((file) => !matchesMaterialType(file, type));
    if (invalid) {
      setError(`${invalid.name} no coincide con el tipo ${materialTypeMap[type].label}.`);
      return;
    }
    const oversized = next.find((file) => file.size >= 100 * 1024 * 1024);
    if (oversized) {
      setError(`${oversized.name} supera el límite de 100 MB.`);
      return;
    }
    setError("");
    setFiles((current) => [...current, ...next].slice(0, 8));
  }

  return (
    <motion.div className="material-create-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) onClose(); }}>
      <motion.form className="material-create-modal" initial={{ opacity: 0, y: 18, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.985 }} onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        if (!recipients.length) { setError("No hay alumnos compatibles en los grupos seleccionados."); return; }
        if (!files.length && !links.some((link) => link.url.trim())) { setError("Agrega al menos un archivo o enlace."); return; }
        setSubmitting(true);
        try {
          await onCreate({ title, description, type, subject, weekId, targetGroups: selectedGroups, links: links.map(({ label, url }) => ({ label, url })), files, required });
          onClose();
        } catch (creationError) {
          setError(friendlyFirebaseError(creationError));
        } finally {
          setSubmitting(false);
        }
      }}>
        <header>
          <div><span className="eyebrow">Biblioteca académica</span><h2>Nuevo material</h2><p>El tipo elegido prepara la experiencia adecuada para el alumno.</p></div>
          <button className="plain-icon" type="button" onClick={onClose} disabled={submitting} aria-label="Cerrar"><X size={19} /></button>
        </header>
        <div className="material-create-body">
          <section className="material-create-fields">
            <div className="material-create-grid">
              <label className="material-span-2">Nombre<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ej. Guía visual de fracciones" minLength={3} maxLength={120} required /></label>
              <label>Materia<select value={subject} onChange={(event) => { setSubject(event.target.value); setSelectedGroups([]); }}>{subjectOptions.length ? subjectOptions.map((item) => <option key={item}>{item}</option>) : <option>General</option>}</select></label>
              <label>Semana<select value={weekId} onChange={(event) => setWeekId(event.target.value)} required><option value="" disabled>Selecciona una semana</option>{calendar.weeks.map((week) => <option value={week.id} key={week.id}>{week.label} · {formatDate(week.startAt)}</option>)}</select></label>
              <label className="material-span-2">Descripción <small>Opcional</small><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Explica brevemente cómo usar este recurso" maxLength={800} rows={3} /></label>
            </div>

            <fieldset className="material-type-picker">
              <legend>Tipo de material</legend>
              <div>{materialTypeOptions.map((option) => <button type="button" className={type === option.value ? "selected" : ""} onClick={() => { setType(option.value); setFiles([]); }} key={option.value}><span><option.icon size={17} /></span><div><strong>{option.label}</strong><small>{option.description}</small></div>{type === option.value && <i><Check size={11} /></i>}</button>)}</div>
            </fieldset>

            <fieldset className="material-audience-picker">
              <legend>Destinatarios</legend>
              <div className="material-audience-summary"><Users size={17} /><span><strong>{recipients.length} alumnos</strong><small>{profile.role === "teacher" ? "Sólo alumnos que te tienen asignado en esta materia" : "Alumnos activos que cursan esta materia"}</small></span></div>
              <div className="material-group-options"><button type="button" className={selectedGroups.length === 0 ? "selected" : ""} onClick={() => setSelectedGroups([])}>Todos los grupos</button>{groups.map((group) => <button type="button" className={selectedGroups.includes(group) ? "selected" : ""} onClick={() => setSelectedGroups((current) => current.includes(group) ? current.filter((item) => item !== group) : [...current, group])} key={group}>{selectedGroups.includes(group) && <Check size={11} />} {group}</button>)}</div>
            </fieldset>

            <fieldset className="material-links-fieldset">
              <legend>Enlaces</legend>
              {links.map((link, index) => <div className="material-link-row" key={link.id}><input value={link.label} onChange={(event) => setLinks((current) => current.map((item) => item.id === link.id ? { ...item, label: event.target.value } : item))} placeholder="Nombre del enlace" aria-label={`Nombre del enlace ${index + 1}`} /><input type="url" value={link.url} onChange={(event) => setLinks((current) => current.map((item) => item.id === link.id ? { ...item, url: event.target.value } : item))} placeholder="https://…" aria-label={`URL del enlace ${index + 1}`} />{links.length > 1 && <button type="button" onClick={() => setLinks((current) => current.filter((item) => item.id !== link.id))} aria-label="Eliminar enlace"><Trash2 size={15} /></button>}</div>)}
              <button className="material-add-link" type="button" onClick={() => setLinks((current) => [...current, { id: crypto.randomUUID(), label: "", url: "" }])}><Plus size={14} /> Agregar otro enlace</button>
            </fieldset>

            <fieldset className="material-files-fieldset">
              <legend>Archivos</legend>
              <label><UploadCloud size={22} /><span><strong>Seleccionar archivos</strong><small>{materialTypeMap[type].label} · máximo 100 MB por archivo</small></span><input type="file" accept={acceptsForType(type)} multiple onChange={(event) => { selectFiles(event.target.files); event.currentTarget.value = ""; }} /></label>
              {files.length > 0 && <div className="material-selected-files">{files.map((file, index) => <span key={`${file.name}-${index}`}><Paperclip size={14} /><div><strong>{file.name}</strong><small>{formatFileSize(file.size)}</small></div><button type="button" onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Quitar ${file.name}`}><X size={14} /></button></span>)}</div>}
            </fieldset>

            <label className="material-required-toggle"><input type="checkbox" checked={required} onChange={(event) => setRequired(event.target.checked)} /><span><i>{required && <Check size={12} />}</i><div><strong>Marcar como obligatorio</strong><small>Los alumnos lo verán destacado y su lectura quedará en seguimiento.</small></div></span></label>
            {error && <p className="material-form-error">{error}</p>}
          </section>
          <aside className={`material-create-preview is-${type}`}>
            <span className="material-create-preview-icon">{(() => { const Icon = materialTypeMap[type].icon; return <Icon size={28} />; })()}</span>
            <small>{materialTypeMap[type].label} · {calendar.weeks.find((week) => week.id === weekId)?.label ?? "Semana"}</small>
            <h3>{title || "Nombre del material"}</h3>
            <p>{description || "Aquí aparecerá la descripción que orientará a tus alumnos."}</p>
            <div><span>{subject}</span><span className={required ? "is-required" : ""}>{required ? "Obligatorio" : "Opcional"}</span></div>
            <footer><Users size={14} /> {recipients.length} destinatarios</footer>
          </aside>
        </div>
        <footer className="material-create-actions">
          <span><ShieldCheck size={14} /> Se notificará a los destinatarios al publicar.</span>
          <div><button className="secondary-button" type="button" onClick={onClose} disabled={submitting}>Cancelar</button><button className="primary-button" disabled={submitting || !weekId || !title.trim()}>{submitting ? <><LoaderCircle className="spin" size={16} /> Subiendo y publicando…</> : <><UploadCloud size={16} /> Publicar material</>}</button></div>
        </footer>
      </motion.form>
    </motion.div>
  );
}
