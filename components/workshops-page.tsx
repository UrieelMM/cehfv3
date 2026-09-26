"use client";

import {
  ArrowLeft,
  ArrowRight,
  BookMarked,
  BookOpen,
  Bot,
  Check,
  ChevronRight,
  Code2,
  Download,
  FileArchive,
  FileImage,
  FileText,
  ExternalLink,
  FolderOpen,
  Headphones,
  LibraryBig,
  LoaderCircle,
  LockKeyhole,
  MonitorSmartphone,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  UserRoundCog,
  Users,
  Video,
  Wifi,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { SectionOrbLoader } from "@/components/animated-orb";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { ContentEditDialog } from "@/components/content-edit-dialog";
import { ForumRichText } from "@/components/forum-rich-text";
import { WorkshopFileViewer } from "@/components/workshop-file-viewer";
import { WorkshopTasks } from "@/components/workshop-tasks";
import { WorkshopLinksEditor } from "@/components/workshop-links-editor";
import { friendlyFirebaseError } from "@/lib/firebase";
import { normalizeForumRichText } from "@/lib/forum-rich-text";
import {
  deleteWorkshopResource,
  ensureDefaultWorkshops,
  getWorkshopResourceUrl,
  updateWorkshopAccess,
  updateWorkshopResource,
  uploadWorkshopResource,
  watchWorkshopResources,
  watchWorkshops,
} from "@/lib/workshops-firebase";
import type {
  ManagedAccount,
  Role,
  UserProfile,
  Workshop,
  WorkshopAccessInput,
  WorkshopLink,
  WorkshopResource,
  WorkshopResourceFile,
} from "@/lib/types";

type WorkshopsPageProps = {
  profile: UserProfile;
  role: Role;
  managedAccounts: ManagedAccount[];
  firebaseReady: boolean;
};

function workshopFromPath() {
  if (typeof window === "undefined") return null;
  const [section, workshopId] = window.location.pathname.split("/").filter(Boolean);
  return section === "workshops" && workshopId
    ? decodeURIComponent(workshopId)
    : null;
}

function workshopResourceFromRoute() {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("resource");
}

function workshopResourceFileFromRoute() {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("file");
}

function resourceFileIcon(file: Pick<WorkshopResourceFile, "contentType">) {
  if (file.contentType.startsWith("image/")) return FileImage;
  if (file.contentType.startsWith("audio/")) return Headphones;
  if (file.contentType.startsWith("video/")) return Video;
  if (file.contentType.includes("zip")) return FileArchive;
  return FileText;
}

function resourceIcon(resource: WorkshopResource) {
  return resource.attachments.length > 1
    ? FolderOpen
    : resourceFileIcon(resource.attachments[0] ?? resource);
}

function fileSize(value: number) {
  if (value < 1_000_000) return `${Math.max(1, Math.round(value / 1_000))} KB`;
  return `${(value / 1_000_000).toFixed(1)} MB`;
}

function resourceDate(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Reciente";
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(timestamp));
}

function errorMessage(error: unknown) {
  if (
    error instanceof Error &&
    !(typeof error === "object" && error && "code" in error)
  ) {
    return error.message;
  }
  return friendlyFirebaseError(error);
}

export function WorkshopsPage({
  profile,
  role,
  managedAccounts,
  firebaseReady,
}: WorkshopsPageProps) {
  const [baseWorkshops, setBaseWorkshops] = useState<Workshop[]>([]);
  const [resourcesByWorkshop, setResourcesByWorkshop] = useState<
    Record<string, WorkshopResource[]>
  >({});
  const [selectedId, setSelectedId] = useState<string | null>(workshopFromPath);
  const [loading, setLoading] = useState(firebaseReady);
  const [accessWorkshop, setAccessWorkshop] = useState<Workshop | null>(null);
  const [uploadWorkshop, setUploadWorkshop] = useState<Workshop | null>(null);
  const [previewResource, setPreviewResource] = useState<WorkshopResource | null>(null);
  const [previewFile, setPreviewFile] = useState<WorkshopResourceFile | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const initializedRef = useRef(false);
  const previewRequest = useRef(0);

  const workshops = useMemo(
    () =>
      baseWorkshops.map((workshop) => ({
        ...workshop,
        resources: resourcesByWorkshop[workshop.id] ?? workshop.resources,
      })),
    [baseWorkshops, resourcesByWorkshop],
  );
  const selected = workshops.find((workshop) => workshop.id === selectedId) ?? null;

  useEffect(() => {
    const onPopState = () => setSelectedId(workshopFromPath());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!firebaseReady) {
      queueMicrotask(() => {
        setBaseWorkshops([]);
        setLoading(false);
      });
      return;
    }

    let unsubscribe: () => void = () => undefined;
    let active = true;
    queueMicrotask(() => setLoading(true));
    const start = async () => {
      try {
        if (role === "director" && !initializedRef.current) {
          initializedRef.current = true;
          await ensureDefaultWorkshops(profile);
        }
        if (!active) return;
        unsubscribe = watchWorkshops(
          profile,
          (next) => {
            setBaseWorkshops(next);
            setLoading(false);
          },
          (error) => {
            setLoading(false);
            toast.error(errorMessage(error));
          },
        );
      } catch (error) {
        setLoading(false);
        toast.error(errorMessage(error));
      }
    };
    void start();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [firebaseReady, profile, role]);

  useEffect(() => {
    if (!firebaseReady || !baseWorkshops.length) {
      queueMicrotask(() => setResourcesByWorkshop({}));
      return;
    }
    return watchWorkshopResources(
      profile.institutionId,
      baseWorkshops.map((workshop) => workshop.id),
      setResourcesByWorkshop,
      (error) => toast.error(errorMessage(error)),
    );
  }, [baseWorkshops, firebaseReady, profile.institutionId]);

  useEffect(() => {
    const resourceId = workshopResourceFromRoute();
    const fileId = workshopResourceFileFromRoute();
    if (
      !selected ||
      !resourceId ||
      (previewResource?.id === resourceId && (!fileId || previewFile?.id === fileId))
    ) return;
    const resource = selected.resources.find((candidate) => candidate.id === resourceId);
    const attachment = resource?.attachments.find((candidate) => candidate.id === fileId)
      ?? resource?.attachments[0];
    if (resource && attachment) void openResource(resource, attachment, false);
  // openResource changes with the selected workshop; these values are the
  // complete synchronization boundary for a deep-linked resource.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewFile?.id, previewResource?.id, selected]);

  useEffect(() => {
    if (selectedId && !loading && !workshops.some((item) => item.id === selectedId)) {
      window.history.replaceState({}, "", "/workshops");
      queueMicrotask(() => setSelectedId(null));
    }
  }, [loading, selectedId, workshops]);

  function selectWorkshop(workshop: Workshop) {
    window.history.pushState({}, "", `/workshops/${encodeURIComponent(workshop.id)}`);
    setSelectedId(workshop.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeWorkshop() {
    previewRequest.current += 1;
    setPreviewResource(null);
    setPreviewFile(null);
    window.history.pushState({}, "", "/workshops");
    setSelectedId(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveAccess(workshop: Workshop, access: WorkshopAccessInput) {
    if (!firebaseReady) throw new Error("Inicia sesión para administrar Talleres.");
    await updateWorkshopAccess(workshop, access, profile);
  }

  async function uploadResource(
    workshop: Workshop,
    input: { title: string; description: string; descriptionRich: string; files: File[]; links: WorkshopLink[] },
  ) {
    if (!firebaseReady) throw new Error("Inicia sesión para subir recursos.");
    await uploadWorkshopResource(workshop, profile, input);
  }

  async function removeResource(resource: WorkshopResource) {
    if (!firebaseReady) throw new Error("Inicia sesión para eliminar recursos.");
    await deleteWorkshopResource(resource);
  }

  async function openResource(
    resource: WorkshopResource,
    attachment: WorkshopResourceFile = resource.attachments[0],
    syncRoute = true,
  ) {
    if (!attachment) {
      toast.error("Este recurso no contiene archivos disponibles.");
      return;
    }
    if (!firebaseReady) {
      toast.error("Inicia sesión para abrir este recurso.");
      return;
    }
    const requestId = ++previewRequest.current;
    if (syncRoute) {
      window.history.pushState(
        {},
        "",
        `/workshops/${encodeURIComponent(resource.workshopId)}?resource=${encodeURIComponent(resource.id)}&file=${encodeURIComponent(attachment.id)}`,
      );
    }
    setPreviewResource(resource);
    setPreviewFile(attachment);
    setPreviewUrl("");
    setPreviewLoading(true);
    try {
      const url = await getWorkshopResourceUrl(resource, attachment);
      if (previewRequest.current === requestId) setPreviewUrl(url);
    } catch (error) {
      if (previewRequest.current === requestId) {
        setPreviewResource(null);
        setPreviewFile(null);
        toast.error(errorMessage(error));
      }
    } finally {
      if (previewRequest.current === requestId) setPreviewLoading(false);
    }
  }

  function closeResourcePreview() {
    previewRequest.current += 1;
    setPreviewResource(null);
    setPreviewFile(null);
    setPreviewUrl("");
    setPreviewLoading(false);
    if (selectedId) {
      window.history.pushState({}, "", `/workshops/${encodeURIComponent(selectedId)}`);
    }
  }

  if (loading) {
    return (
      <SectionOrbLoader
        className="workshops-loading"
        label="Abriendo los talleres…"
        detail="Estamos preparando los espacios y sus recursos."
        tone="mint"
      />
    );
  }

  if (!firebaseReady) {
    return (
      <section className="workshops-empty workshops-firebase-required">
        <span><LockKeyhole size={27} /></span>
        <h2>Talleres necesita una sesión de Firebase</h2>
        <p>
          Los accesos, recursos, trabajos y entregas de esta sección sólo se
          muestran desde la base de datos institucional.
        </p>
      </section>
    );
  }

  if (selected) {
    const canManage =
      role === "director" || selected.managerIds.includes(profile.uid);
    return (
      <>
        <WorkshopDetail
          workshop={selected}
          profile={profile}
          role={role}
          managedAccounts={managedAccounts}
          firebaseReady={firebaseReady}
          canManage={canManage}
          isDirector={role === "director"}
          onBack={closeWorkshop}
          onManageAccess={() => setAccessWorkshop(selected)}
          onUpload={() => setUploadWorkshop(selected)}
          onOpenResource={openResource}
          onDeleteResource={removeResource}
        />
        <AnimatePresence>
          {accessWorkshop && (
            <WorkshopAccessDialog
              workshop={accessWorkshop}
              accounts={managedAccounts}
              onClose={() => setAccessWorkshop(null)}
              onSave={saveAccess}
            />
          )}
          {uploadWorkshop && (
            <WorkshopUploadDialog
              workshop={uploadWorkshop}
              onClose={() => setUploadWorkshop(null)}
              onUpload={uploadResource}
            />
          )}
        </AnimatePresence>
        {previewResource && previewFile && (
          <WorkshopFileViewer
            file={{
              name: previewFile.name,
              size: previewFile.size,
              contentType: previewFile.contentType,
            }}
            url={previewUrl}
            loading={previewLoading}
            onClose={closeResourcePreview}
          />
        )}
      </>
    );
  }

  return (
    <>
      <section className="workshops-intro">
        <div>
          <span className="workshops-kicker">
            <Sparkles size={15} /> Aprender haciendo
          </span>
          <h2>Dos espacios, dos formas de descubrir</h2>
          <p>
            Entra a un taller para consultar materiales, retos y lecturas preparados
            especialmente para tu grupo.
          </p>
        </div>
        <div className="workshops-access-note">
          <ShieldCheck size={20} />
          <span>
            <strong>Acceso seguro</strong>
            Dirección decide quién participa y quién administra cada espacio.
          </span>
        </div>
      </section>

      {workshops.length ? (
        <section className="workshop-card-grid" aria-label="Talleres disponibles">
          {workshops.map((workshop) => (
            <WorkshopCoverCard
              key={workshop.id}
              workshop={workshop}
              role={role}
              onOpen={() => selectWorkshop(workshop)}
              onManage={() => setAccessWorkshop(workshop)}
            />
          ))}
        </section>
      ) : (
        <section className="workshops-empty">
          <span><LockKeyhole size={27} /></span>
          <h2>
            {role === "director"
              ? "Los talleres todavía no están disponibles"
              : "Aún no tienes talleres asignados"}
          </h2>
          <p>
            {role === "director"
              ? "Vuelve a cargar la página para preparar los espacios iniciales."
              : "Cuando Dirección te dé acceso, TICS o Club de lectura aparecerán aquí."}
          </p>
        </section>
      )}

      <AnimatePresence>
        {accessWorkshop && (
          <WorkshopAccessDialog
            workshop={accessWorkshop}
            accounts={managedAccounts}
            onClose={() => setAccessWorkshop(null)}
            onSave={saveAccess}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function WorkshopCoverCard({
  workshop,
  role,
  onOpen,
  onManage,
}: {
  workshop: Workshop;
  role: Role;
  onOpen: () => void;
  onManage: () => void;
}) {
  const reading = workshop.kind === "reading";
  return (
    <motion.article
      className={`workshop-cover-card is-${workshop.kind}`}
      whileHover={{ y: -5 }}
      transition={{ type: "spring", stiffness: 320, damping: 25 }}
    >
      <div className="workshop-cover-art" aria-hidden="true">
        {reading ? (
          <>
            <span className="library-lamp" />
            <span className="library-shelf shelf-one">
              <i /><i /><i /><i /><i />
            </span>
            <span className="library-shelf shelf-two">
              <i /><i /><i /><i />
            </span>
            <BookOpen className="library-open-book" size={58} />
          </>
        ) : (
          <>
            <span className="tech-orbit orbit-one" />
            <span className="tech-orbit orbit-two" />
            <span className="tech-node node-one" />
            <span className="tech-node node-two" />
            <span className="tech-console">
              <i /> <i /> <i />
              <code>{"<idea />"}</code>
            </span>
          </>
        )}
      </div>
      <div className="workshop-cover-copy">
        <span className="workshop-cover-label">
          {reading ? <LibraryBig size={16} /> : <MonitorSmartphone size={16} />}
          {reading ? "Biblioteca creativa" : "Laboratorio digital"}
        </span>
        <h2>{workshop.title}</h2>
        <strong>{workshop.shortTitle}</strong>
        <p>{workshop.description}</p>
        <div className="workshop-card-meta">
          <span><Users size={15} /> {workshop.memberIds.length} participantes</span>
          <span><FolderOpen size={15} /> {workshop.resources.length} recursos</span>
        </div>
        <div className="workshop-card-actions">
          <button className="workshop-enter-button" onClick={onOpen}>
            Entrar al taller <ArrowRight size={17} />
          </button>
          {role === "director" && (
            <button
              className="workshop-manage-button"
              onClick={onManage}
              aria-label={`Administrar acceso a ${workshop.title}`}
            >
              <Settings2 size={17} />
            </button>
          )}
        </div>
      </div>
    </motion.article>
  );
}

function WorkshopDetail({
  workshop,
  profile,
  role,
  managedAccounts,
  firebaseReady,
  canManage,
  isDirector,
  onBack,
  onManageAccess,
  onUpload,
  onOpenResource,
  onDeleteResource,
}: {
  workshop: Workshop;
  profile: UserProfile;
  role: Role;
  managedAccounts: ManagedAccount[];
  firebaseReady: boolean;
  canManage: boolean;
  isDirector: boolean;
  onBack: () => void;
  onManageAccess: () => void;
  onUpload: () => void;
  onOpenResource: (
    resource: WorkshopResource,
    attachment?: WorkshopResourceFile,
  ) => void;
  onDeleteResource: (resource: WorkshopResource) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [resourceToDelete, setResourceToDelete] = useState<WorkshopResource | null>(null);
  const [resourceToEdit, setResourceToEdit] = useState<WorkshopResource | null>(null);
  const reading = workshop.kind === "reading";
  const filteredResources = workshop.resources.filter((resource) =>
    [
      resource.title,
      resource.description,
      ...resource.attachments.map((attachment) => attachment.name),
      ...resource.links.map((link) => link.label),
    ]
      .join(" ")
      .toLocaleLowerCase("es-MX")
      .includes(query.trim().toLocaleLowerCase("es-MX")),
  );

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !document.querySelector(
          ".workshop-modal-backdrop, .workshop-attachment-viewer-backdrop, .delete-confirm-backdrop",
        )
      ) {
        onBack();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onBack]);

  async function remove(resource: WorkshopResource) {
    setDeletingId(resource.id);
    try {
      await onDeleteResource(resource);
      toast.success("Recurso eliminado");
      setResourceToDelete(null);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
    <motion.section
      className={`workshop-immersive-shell is-${workshop.kind}`}
      role="dialog"
      aria-modal="true"
      aria-label={`${workshop.title}, vista inmersiva`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.28 }}
    >
      <div className="workshop-immersive-grain" aria-hidden="true" />
      <div className="workshop-immersive-art" aria-hidden="true">
        {reading ? (
          <>
            <span className="immersive-library-window"><i /><b /></span>
            <span className="immersive-library-lamp lamp-left"><i /></span>
            <span className="immersive-library-lamp lamp-right"><i /></span>
            <span className="immersive-library-shelf shelf-left">
              <i /><i /><i /><i /><i /><i /><i />
            </span>
            <span className="immersive-library-shelf shelf-right">
              <i /><i /><i /><i /><i /><i />
            </span>
            <span className="immersive-floating-book book-left"><BookOpen size={42} /></span>
            <span className="immersive-floating-book book-right"><BookMarked size={35} /></span>
            <span className="immersive-reading-table"><i /><b /></span>
          </>
        ) : (
          <>
            <span className="immersive-tech-horizon" />
            <span className="immersive-tech-orbit orbit-large" />
            <span className="immersive-tech-orbit orbit-small" />
            <span className="immersive-tech-server">
              <i /><i /><i /><i />
            </span>
            <span className="immersive-tech-console">
              <code>workshop.init()</code><i /><i /><i />
            </span>
            <span className="immersive-tech-node tech-node-a" />
            <span className="immersive-tech-node tech-node-b" />
            <span className="immersive-tech-node tech-node-c" />
            <Bot className="immersive-tech-bot" size={76} />
          </>
        )}
      </div>

      <header className="workshop-immersive-header">
        <div className="workshop-immersive-identity">
          <span className="workshop-immersive-mark">
            {reading ? <LibraryBig size={19} /> : <Code2 size={19} />}
          </span>
          <span className="workshop-immersive-divider" />
          <div>
            <strong>{workshop.title}</strong>
            <small>{reading ? "Biblioteca creativa" : "Laboratorio digital"} · Campus CEHF</small>
          </div>
        </div>
        <div className="workshop-immersive-status">
          <span><i /> Espacio del taller</span>
          <button type="button" autoFocus onClick={onBack} aria-label="Volver a todos los talleres">
            <ArrowLeft size={17} /><span>Todos los talleres</span><X size={18} />
          </button>
        </div>
      </header>

      <div className="workshop-immersive-scroll">
        <div className={`workshop-detail is-${workshop.kind}`}>
          <section className="workshop-detail-hero">
        <div className="workshop-hero-pattern" aria-hidden="true">
          {reading ? (
            <>
              <span className="detail-books books-a"><i /><i /><i /><i /></span>
              <span className="detail-books books-b"><i /><i /><i /></span>
              <span className="reading-window"><i /></span>
              <BookMarked size={68} />
            </>
          ) : (
            <>
              <span className="detail-circuit circuit-a" />
              <span className="detail-circuit circuit-b" />
              <Bot size={74} />
              <code>CREATE · TEST · SHARE</code>
            </>
          )}
        </div>
        <div className="workshop-detail-copy">
          <span className="workshop-detail-label">
            {reading ? <LibraryBig size={17} /> : <Code2 size={17} />}
            {reading ? "Entre libros y conversaciones" : "Código, ideas y ciudadanía digital"}
          </span>
          <h2>{workshop.title}</h2>
          <strong>{workshop.shortTitle}</strong>
          <p>{workshop.description}</p>
          <div className="workshop-detail-stats">
            <span><Users size={17} /><strong>{workshop.memberIds.length}</strong> integrantes</span>
            <span><UserRoundCog size={17} /><strong>{workshop.managerIds.length}</strong> administradores</span>
            <span><FolderOpen size={17} /><strong>{workshop.resources.length}</strong> recursos</span>
          </div>
        </div>
        <div className="workshop-detail-actions">
          {workshop.zoomUrl && (
            <a
              className="workshop-zoom-button"
              href={workshop.zoomUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Video size={18} /> Entrar a Zoom
            </a>
          )}
          {canManage && (
            <button className="workshop-upload-button" onClick={onUpload}>
              <UploadCloud size={18} /> Subir recurso
            </button>
          )}
          {isDirector && (
            <button className="workshop-access-button" onClick={onManageAccess}>
              <Users size={18} /> Administrar acceso
            </button>
          )}
        </div>
          </section>

          {canManage && (
            <aside className="workshop-manager-note">
              <ShieldCheck size={20} />
              <span>
                <strong>Estás administrando este taller</strong>
                Puedes compartir recursos, publicar trabajos y retroalimentar a tu grupo.
              </span>
            </aside>
          )}

          <section className="workshop-resource-section">
        <div className="workshop-resource-heading">
          <div>
            <span className="eyebrow">Estantería del taller</span>
            <h2>{reading ? "Lecturas y bitácoras" : "Guías y recursos digitales"}</h2>
          </div>
          <label className="workshop-resource-search">
            <Search size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar recursos…"
              aria-label="Buscar recursos del taller"
            />
          </label>
        </div>

        {filteredResources.length ? (
          <div className="workshop-resource-grid">
            {filteredResources.map((resource) => {
              const Icon = resourceIcon(resource);
              const totalSize = resource.attachments.reduce(
                (sum, attachment) => sum + attachment.size,
                0,
              );
              const multipleFiles = resource.attachments.length > 1;
              return (
                <article className="workshop-resource-card" key={resource.id}>
                  <div
                    className={`workshop-resource-main${multipleFiles ? " is-bundle" : " is-single"}`}
                    role={multipleFiles ? undefined : "button"}
                    tabIndex={multipleFiles ? undefined : 0}
                    onClick={multipleFiles ? undefined : () => onOpenResource(resource, resource.attachments[0])}
                    onKeyDown={multipleFiles ? undefined : (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onOpenResource(resource, resource.attachments[0]);
                      }
                    }}
                  >
                    <span className="workshop-resource-icon"><Icon size={22} /></span>
                    <span className="workshop-resource-copy">
                      <small>
                        {multipleFiles
                          ? `${resource.attachments.length} archivos · ${fileSize(totalSize)}`
                          : resource.fileName}
                      </small>
                      <strong>{resource.title}</strong>
                      {resource.description ? (
                        <div className="workshop-rich-summary">
                          <ForumRichText
                            content={resource.descriptionRich || normalizeForumRichText(resource.description)}
                            editorKey={`workshop-resource-reader-${resource.id}`}
                            editable={false}
                          />
                        </div>
                      ) : (
                        <p>Material disponible para el taller.</p>
                      )}
                    </span>
                    {!multipleFiles && <ChevronRight size={18} />}
                  </div>
                  {multipleFiles && (
                    <div
                      className="workshop-resource-files"
                      role="list"
                      aria-label={`Archivos de ${resource.title}`}
                    >
                      {resource.attachments.map((attachment, index) => {
                        const FileIcon = resourceFileIcon(attachment);
                        return (
                          <button
                            type="button"
                            key={attachment.id}
                            onClick={() => onOpenResource(resource, attachment)}
                          >
                            <span><FileIcon size={15} /></span>
                            <span>
                              <strong>{attachment.name}</strong>
                              <small>Archivo {index + 1} de {resource.attachments.length}</small>
                            </span>
                            <em>{fileSize(attachment.size)}</em>
                            <ChevronRight size={15} />
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {resource.links.length > 0 && <div className="workshop-resource-links">{resource.links.map((link, index) => <a key={`${link.url}-${index}`} href={link.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} /> {link.label}</a>)}</div>}
                  <footer>
                    <span>{fileSize(totalSize)} · {resourceDate(resource.createdAt)}</span>
                    <span>Por {resource.uploadedByName}</span>
                    <div>
                      {!multipleFiles && (
                        <button onClick={() => onOpenResource(resource, resource.attachments[0])} aria-label="Abrir recurso">
                          <Download size={15} />
                        </button>
                      )}
                      {canManage && (
                        <>
                          <button onClick={() => setResourceToEdit(resource)} aria-label="Editar recurso"><Pencil size={15} /></button>
                          <button className="is-danger" disabled={deletingId === resource.id} onClick={() => setResourceToDelete(resource)} aria-label="Eliminar recurso">
                            {deletingId === resource.id ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />}
                          </button>
                        </>
                      )}
                    </div>
                  </footer>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="workshop-resources-empty">
            {reading ? <BookOpen size={29} /> : <FolderOpen size={29} />}
            <h3>{query ? "No encontramos ese recurso" : "La estantería está lista"}</h3>
            <p>
              {query
                ? "Prueba con otro título o palabra."
                : canManage
                  ? "Sube el primer material para los participantes."
                  : "Tu administrador agregará materiales muy pronto."}
            </p>
            {!query && canManage && (
              <button onClick={onUpload}><Plus size={16} /> Agregar recurso</button>
            )}
          </div>
        )}
          </section>

          <WorkshopTasks
            workshop={workshop}
            profile={profile}
            role={role}
            accounts={managedAccounts}
            firebaseReady={firebaseReady}
          />
          <footer className="workshop-immersive-footer">
            <span>{reading ? <BookOpen size={16} /> : <Wifi size={16} />}</span>
            <p>{reading ? "Cada libro abre una conversación." : "Imagina, crea, prueba y comparte."}</p>
            <button type="button" onClick={onBack}>Volver a talleres <ArrowRight size={15} /></button>
          </footer>
        </div>
      </div>
    </motion.section>
    <ConfirmDeleteDialog
      open={Boolean(resourceToDelete)}
      title={`¿Eliminar “${resourceToDelete?.title ?? "este recurso"}”?`}
      description={`Se eliminarán ${resourceToDelete?.attachments.length === 1 ? "el archivo" : `los ${resourceToDelete?.attachments.length ?? 0} archivos`} y el recurso dentro del taller. Esta acción no se puede deshacer.`}
      confirmLabel="Eliminar recurso"
      busy={Boolean(deletingId)}
      onCancel={() => setResourceToDelete(null)}
      onConfirm={() => resourceToDelete && void remove(resourceToDelete)}
    />
    {resourceToEdit && <WorkshopResourceEditDialog resource={resourceToEdit} onCancel={() => setResourceToEdit(null)} />}
    </>
  );
}

function WorkshopResourceEditDialog({ resource, onCancel }: { resource: WorkshopResource; onCancel: () => void }) {
  const [title, setTitle] = useState(resource.title);
  const [description, setDescription] = useState(resource.description);
  const [descriptionRich, setDescriptionRich] = useState(() =>
    resource.descriptionRich || normalizeForumRichText(resource.description),
  );
  const [links, setLinks] = useState<WorkshopLink[]>(resource.links);
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await updateWorkshopResource(resource, {
        title: title.trim(),
        description: description.trim(),
        descriptionRich,
        links,
      });
      toast.success("Recurso actualizado");
      onCancel();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return <ContentEditDialog open eyebrow="Recurso de taller" title="Editar recurso" description="Cambia el nombre o la descripción que ve el grupo." note="Los archivos originales y su historial permanecen intactos." busy={busy} onCancel={onCancel} onSubmit={save}>
    <label>Título<input value={title} minLength={3} maxLength={140} required onChange={(event) => setTitle(event.target.value)} /></label>
    <div className="workshop-rich-field">
      <label>Descripción</label>
      <ForumRichText
        content={descriptionRich}
        editorKey={`workshop-resource-edit-${resource.id}`}
        maxLength={1_000}
        onChange={(richText, plainText) => {
          setDescriptionRich(richText);
          setDescription(plainText);
        }}
      />
    </div>
    <WorkshopLinksEditor links={links} onChange={setLinks} />
  </ContentEditDialog>;
}

function WorkshopAccessDialog({
  workshop,
  accounts,
  onClose,
  onSave,
}: {
  workshop: Workshop;
  accounts: ManagedAccount[];
  onClose: () => void;
  onSave: (workshop: Workshop, access: WorkshopAccessInput) => Promise<void>;
}) {
  const [studentIds, setStudentIds] = useState(workshop.studentIds);
  const [teacherIds, setTeacherIds] = useState(workshop.teacherIds);
  const [managerIds, setManagerIds] = useState(workshop.managerIds);
  const [teacherStudentIds, setTeacherStudentIds] = useState(
    workshop.teacherStudentIds ?? {},
  );
  const [zoomUrl, setZoomUrl] = useState(workshop.zoomUrl);
  const [rosterTeacherId, setRosterTeacherId] = useState<string | null>(null);
  const [tab, setTab] = useState<"students" | "teachers">("students");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const students = accounts.filter((account) => account.role === "student" && account.active);
  const teachers = accounts.filter((account) => account.role === "teacher" && account.active);
  const visible = (tab === "students" ? students : teachers).filter((account) =>
    [account.name, account.email, account.grade, account.group]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("es-MX")
      .includes(query.trim().toLocaleLowerCase("es-MX")),
  );

  function toggleMember(account: ManagedAccount) {
    if (account.role === "student") {
      setStudentIds((current) =>
        current.includes(account.uid)
          ? current.filter((id) => id !== account.uid)
          : [...current, account.uid],
      );
      if (studentIds.includes(account.uid)) {
        setTeacherStudentIds((current) =>
          Object.fromEntries(
            Object.entries(current).map(([teacherId, roster]) => [
              teacherId,
              roster.filter((studentId) => studentId !== account.uid),
            ]),
          ),
        );
      }
      return;
    }
    setTeacherIds((current) => {
      const removing = current.includes(account.uid);
      if (removing) {
        setManagerIds((managers) => managers.filter((id) => id !== account.uid));
        setTeacherStudentIds((rosters) => {
          const next = { ...rosters };
          delete next[account.uid];
          return next;
        });
        return current.filter((id) => id !== account.uid);
      }
      return [...current, account.uid];
    });
  }

  function toggleManager(account: ManagedAccount) {
    setTeacherIds((current) =>
      current.includes(account.uid) ? current : [...current, account.uid],
    );
    setManagerIds((current) => {
      const removing = current.includes(account.uid);
      if (removing) {
        setTeacherStudentIds((rosters) => {
          const next = { ...rosters };
          delete next[account.uid];
          return next;
        });
        if (rosterTeacherId === account.uid) setRosterTeacherId(null);
        return current.filter((id) => id !== account.uid);
      }
      setTeacherStudentIds((rosters) => ({
        ...rosters,
        [account.uid]: rosters[account.uid] ?? [],
      }));
      return [...current, account.uid];
    });
  }

  function toggleRosterStudent(teacherId: string, studentId: string) {
    setStudentIds((current) =>
      current.includes(studentId) ? current : [...current, studentId],
    );
    setTeacherStudentIds((current) => {
      const roster = current[teacherId] ?? [];
      return {
        ...current,
        [teacherId]: roster.includes(studentId)
          ? roster.filter((id) => id !== studentId)
          : [...roster, studentId],
      };
    });
  }

  async function submit() {
    setSaving(true);
    try {
      await onSave(workshop, {
        zoomUrl,
        studentIds,
        teacherIds,
        managerIds,
        teacherStudentIds,
      });
      toast.success("Acceso del taller actualizado", {
        description: "Las nuevas personas recibirán una notificación.",
      });
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      className="modal-backdrop workshop-modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.section
        className="workshop-access-modal"
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="workshop-access-title"
      >
        <header>
          <span className={`workshop-modal-icon is-${workshop.kind}`}>
            {workshop.kind === "reading" ? <LibraryBig size={22} /> : <Code2 size={22} />}
          </span>
          <div>
            <span className="eyebrow">Control de Dirección</span>
            <h2 id="workshop-access-title">Acceso a {workshop.title}</h2>
            <p>Elige participantes, administradores y el grupo de cada maestro.</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar"><X size={20} /></button>
        </header>

        <div className="workshop-access-summary">
          <span><strong>{studentIds.length}</strong> alumnos</span>
          <span><strong>{teacherIds.length}</strong> maestros</span>
          <span><strong>{managerIds.length}</strong> administradores</span>
        </div>

        <label className="workshop-zoom-field">
          <span><Video size={16} /> Enlace de Zoom</span>
          <input
            type="url"
            value={zoomUrl}
            onChange={(event) => setZoomUrl(event.target.value)}
            placeholder="https://zoom.us/j/…"
          />
          <small>Opcional. Será visible para las personas con acceso al taller.</small>
        </label>

        <div className="workshop-access-toolbar">
          <div className="workshop-access-tabs" role="tablist">
            <button className={tab === "students" ? "active" : ""} onClick={() => setTab("students")}>
              Alumnos <span>{students.length}</span>
            </button>
            <button className={tab === "teachers" ? "active" : ""} onClick={() => setTab("teachers")}>
              Maestros <span>{teachers.length}</span>
            </button>
          </div>
          <label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar…" /></label>
        </div>

        <div className="workshop-access-list">
          {rosterTeacherId ? (
            <div className="workshop-roster-editor">
              <div className="workshop-roster-editor-heading">
                <button onClick={() => setRosterTeacherId(null)}><ArrowLeft size={16} /> Maestros</button>
                <span>
                  <strong>Alumnos de {teachers.find((teacher) => teacher.uid === rosterTeacherId)?.name}</strong>
                  <small>Este maestro sólo podrá enviar trabajos y revisar a los alumnos elegidos.</small>
                </span>
              </div>
              <div className="workshop-roster-editor-list">
                {students.map((student) => {
                  const assigned = (teacherStudentIds[rosterTeacherId] ?? []).includes(student.uid);
                  return (
                    <button
                      className={assigned ? "selected" : ""}
                      key={student.uid}
                      onClick={() => toggleRosterStudent(rosterTeacherId, student.uid)}
                    >
                      <span className="workshop-person-avatar">{student.initials}</span>
                      <span><strong>{student.name}</strong><small>{[student.grade, student.group].filter(Boolean).join(" ") || student.email}</small></span>
                      <i>{assigned && <Check size={14} />}</i>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : visible.length ? visible.map((account) => {
            const selected = account.role === "student"
              ? studentIds.includes(account.uid)
              : teacherIds.includes(account.uid);
            const manager = managerIds.includes(account.uid);
            return (
              <article key={account.uid} className={selected ? "selected" : ""}>
                <button className="workshop-person-main" onClick={() => toggleMember(account)}>
                  <span className="workshop-person-avatar">{account.initials}</span>
                  <span>
                    <strong>{account.name}</strong>
                    <small>
                      {account.role === "student"
                        ? [account.grade, account.group].filter(Boolean).join(" ") || account.email
                        : account.subjects.join(" · ") || account.email}
                    </small>
                  </span>
                  <i>{selected && <Check size={14} />}</i>
                </button>
                {account.role === "teacher" && (
                  <div className="workshop-teacher-controls">
                    <button
                      className={`workshop-manager-toggle ${manager ? "active" : ""}`}
                      onClick={() => toggleManager(account)}
                      aria-pressed={manager}
                    >
                      <UserRoundCog size={15} />
                      {manager ? "Administra el taller" : "Hacer administrador"}
                    </button>
                    {manager && (
                      <button
                        className="workshop-roster-button"
                        onClick={() => {
                          setRosterTeacherId(account.uid);
                          setQuery("");
                        }}
                      >
                        <Users size={15} />
                        {teacherStudentIds[account.uid]?.length ?? 0} alumnos
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          }) : (
            <div className="workshop-access-empty">No hay personas que coincidan con la búsqueda.</div>
          )}
        </div>

        <footer>
          <p><ShieldCheck size={16} /> Sólo Dirección puede cambiar estos permisos.</p>
          <div>
            <button onClick={onClose}>Cancelar</button>
            <button className="primary-button" disabled={saving} onClick={() => void submit()}>
              {saving ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}
              {saving ? "Guardando…" : "Guardar acceso"}
            </button>
          </div>
        </footer>
      </motion.section>
    </motion.div>
  );
}

function WorkshopUploadDialog({
  workshop,
  onClose,
  onUpload,
}: {
  workshop: Workshop;
  onClose: () => void;
  onUpload: (
    workshop: Workshop,
    input: { title: string; description: string; descriptionRich: string; files: File[]; links: WorkshopLink[] },
  ) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [descriptionRich, setDescriptionRich] = useState(() =>
    normalizeForumRichText(""),
  );
  const [files, setFiles] = useState<File[]>([]);
  const [links, setLinks] = useState<WorkshopLink[]>([]);
  const [uploading, setUploading] = useState(false);

  function addFiles(selectedFiles: File[]) {
    const nextFiles = [...files];
    selectedFiles.forEach((file) => {
      const duplicate = nextFiles.some(
        (current) =>
          current.name === file.name &&
          current.size === file.size &&
          current.lastModified === file.lastModified,
      );
      if (!duplicate && nextFiles.length < 10) nextFiles.push(file);
    });
    if (selectedFiles.length && nextFiles.length === files.length) {
      toast.error(files.length >= 10 ? "Puedes agregar hasta 10 archivos." : "Ese archivo ya está seleccionado.");
    } else if (nextFiles.length === 10 && selectedFiles.some((file) => !nextFiles.includes(file))) {
      toast.error("Puedes agregar hasta 10 archivos.");
    }
    setFiles(nextFiles);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !files.length) {
      toast.error("Agrega un título y selecciona al menos un archivo.");
      return;
    }
    const oversizedFile = files.find((file) => file.size >= 20 * 1024 * 1024);
    if (oversizedFile) {
      toast.error(`“${oversizedFile.name}” debe pesar menos de 20 MB.`);
      return;
    }
    setUploading(true);
    try {
      await onUpload(workshop, {
        title: title.trim(),
        description: description.trim(),
        descriptionRich,
        files,
        links,
      });
      toast.success(files.length === 1 ? "Recurso publicado" : `Recurso con ${files.length} archivos publicado`, {
        description: "Los participantes ya pueden consultar los archivos.",
      });
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setUploading(false);
    }
  }

  return (
    <motion.div
      className="modal-backdrop workshop-modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.form
        className="workshop-upload-modal"
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        onClick={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <header>
          <span className={`workshop-modal-icon is-${workshop.kind}`}><UploadCloud size={22} /></span>
          <div>
            <span className="eyebrow">Nueva publicación</span>
            <h2>Subir recurso a {workshop.title}</h2>
            <p>Quedará disponible para todas las personas con acceso.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar"><X size={20} /></button>
        </header>
        <div className="workshop-upload-fields">
          <label>
            <span>Título del recurso</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} placeholder="Ej. Reto de programación creativa" required />
          </label>
          <div className="workshop-rich-field">
            <label>Descripción <small>Opcional</small></label>
            <ForumRichText
              content={descriptionRich}
              editorKey={`workshop-resource-create-${workshop.id}`}
              maxLength={1_000}
              onChange={(richText, plainText) => {
                setDescriptionRich(richText);
                setDescription(plainText);
              }}
            />
          </div>
          <WorkshopLinksEditor links={links} onChange={setLinks} />
          <label className={`workshop-file-drop ${files.length ? "has-file" : ""}`}>
            <input
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,.zip,image/*,audio/*,video/*"
              onChange={(event) => {
                addFiles(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
            />
            {files.length ? <Paperclip size={25} /> : <UploadCloud size={28} />}
            <strong>{files.length ? `${files.length} archivo${files.length === 1 ? "" : "s"} seleccionado${files.length === 1 ? "" : "s"}` : "Selecciona archivos"}</strong>
            <small>{files.length ? `Puedes agregar ${10 - files.length} más · máximo 20 MB cada uno` : "Hasta 10 documentos, imágenes, audios o videos"}</small>
          </label>
          {files.length > 0 && (
            <div className="workshop-selected-files" aria-label="Archivos seleccionados">
              {files.map((file) => (
                <span key={`${file.name}-${file.size}-${file.lastModified}`}>
                  <FileText size={15} />
                  <strong>{file.name}</strong>
                  <small>{fileSize(file.size)}</small>
                  <button type="button" onClick={() => setFiles((current) => current.filter((item) => item !== file))} aria-label={`Quitar ${file.name}`}><X size={14} /></button>
                </span>
              ))}
            </div>
          )}
        </div>
        <footer>
          <span><Wifi size={16} /> Guardado seguro en Storage</span>
          <div>
            <button type="button" onClick={onClose}>Cancelar</button>
            <button className="primary-button" disabled={uploading} type="submit">
              {uploading ? <LoaderCircle className="spin" size={17} /> : <UploadCloud size={17} />}
              {uploading ? "Subiendo…" : "Publicar recurso"}
            </button>
          </div>
        </footer>
      </motion.form>
    </motion.div>
  );
}
