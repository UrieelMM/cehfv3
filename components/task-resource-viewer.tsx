"use client";

import {
  CalendarDays,
  Check,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Image as ImageIcon,
  Link2,
  Music2,
  Paperclip,
  Play,
  Users,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { friendlyFirebaseError } from "@/lib/firebase";
import {
  getTaskAttachmentUrl,
  markTaskResourceViewed,
  watchTaskResourceViews,
} from "@/lib/tasks-firebase";
import type {
  ManagedAccount,
  TaskAssignment,
  TaskResource,
  TaskResourceView,
  UserProfile,
} from "@/lib/types";

type ResourceType = "pdf" | "audio" | "video" | "image" | "document" | "link";

function resourceId(resource: TaskResource) {
  return resource.kind === "attachment" ? resource.attachment.id : resource.link.id;
}

function resourceLabel(resource: TaskResource) {
  return resource.kind === "attachment" ? resource.attachment.name : resource.link.label;
}

function resourceType(resource: TaskResource): ResourceType {
  if (resource.kind === "link") return "link";
  const contentType = resource.attachment.contentType.toLowerCase();
  const name = resource.attachment.name.toLowerCase();
  if (contentType === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (contentType.startsWith("audio/")) return "audio";
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("image/")) return "image";
  return "document";
}

function resourceHostname(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
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

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(size > 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

const typeDetails = {
  pdf: { label: "PDF", icon: FileText },
  audio: { label: "Audio", icon: Music2 },
  video: { label: "Vídeo", icon: Play },
  image: { label: "Imagen", icon: ImageIcon },
  document: { label: "Documento", icon: Paperclip },
  link: { label: "Enlace", icon: Link2 },
} satisfies Record<ResourceType, { label: string; icon: typeof FileText }>;

const loadingMessages: Record<ResourceType, string> = {
  pdf: "Cargando las páginas del documento",
  audio: "Preparando el reproductor de audio",
  video: "Preparando la reproducción del vídeo",
  image: "Ajustando la vista de la imagen",
  document: "Generando un acceso seguro al archivo",
  link: "Verificando el enlace",
};

export function TaskResourceViewer({
  task,
  resource,
  profile,
  accounts,
  firebaseReady,
  source = "resource",
  onClose,
}: {
  task: TaskAssignment;
  resource: TaskResource;
  profile: UserProfile;
  accounts: ManagedAccount[];
  firebaseReady: boolean;
  source?: "resource" | "submission";
  onClose: () => void;
}) {
  const [resourceUrl, setResourceUrl] = useState("");
  const [loading, setLoading] = useState(resource.kind === "attachment");
  const [views, setViews] = useState<TaskResourceView[]>([]);
  const [error, setError] = useState("");
  const type = resourceType(resource);
  const details = typeDetails[type];
  const TypeIcon = details.icon;
  const id = resourceId(resource);
  const label = resourceLabel(resource);
  const embeddedVideo = resource.kind === "link" ? videoEmbedUrl(resource.link.url) : null;

  useEffect(() => {
    if (resource.kind === "link") {
      queueMicrotask(() => {
        setResourceUrl(resource.link.url);
        setLoading(false);
      });
      return;
    }
    let active = true;
    let loadingTimer: number | undefined;
    const loadingStartedAt = Date.now();
    void getTaskAttachmentUrl(resource.attachment)
      .then((url) => {
        if (active) setResourceUrl(url);
      })
      .catch((resourceError) => {
        if (active) setError(friendlyFirebaseError(resourceError));
      })
      .finally(() => {
        const remainingTime = Math.max(0, 450 - (Date.now() - loadingStartedAt));
        loadingTimer = window.setTimeout(() => {
          if (active) setLoading(false);
        }, remainingTime);
      });
    return () => {
      active = false;
      if (loadingTimer !== undefined) window.clearTimeout(loadingTimer);
    };
  }, [resource]);

  useEffect(() => {
    if (source !== "resource" || profile.role !== "student" || !firebaseReady) return;
    void markTaskResourceViewed(task, resource, profile).catch((viewError) =>
      toast.error("No pudimos registrar la apertura", {
        description: friendlyFirebaseError(viewError),
      }),
    );
  }, [firebaseReady, profile, resource, source, task]);

  useEffect(() => {
    if (source !== "resource" || profile.role === "student" || !firebaseReady) return;
    return watchTaskResourceViews(
      task,
      id,
      setViews,
      (viewError) => setError(friendlyFirebaseError(viewError)),
    );
  }, [firebaseReady, id, profile.role, source, task]);

  const audience = useMemo(
    () => accounts
      .filter(
        (account) =>
          account.role === "student" &&
          account.active &&
          `${account.grade ?? ""} ${account.group ?? ""}`.trim() === task.targetGroup,
      )
      .sort((first, second) => first.name.localeCompare(second.name, "es")),
    [accounts, task.targetGroup],
  );
  const viewsByStudent = new Map(views.map((view) => [view.studentId, view]));
  const coverage = audience.length ? Math.round((views.length / audience.length) * 100) : 0;

  return (
    <motion.div
      className="material-viewer-backdrop task-resource-viewer-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <motion.section
        className="material-viewer task-resource-viewer"
        initial={{ opacity: 0, y: 20, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.985 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-resource-viewer-title"
      >
        <header>
          <div className={`material-viewer-title is-${type}`}>
            <span><TypeIcon size={22} /></span>
            <div>
              <small>{details.label} · {source === "submission" ? "Evidencia de la entrega" : "Recurso de la tarea"}</small>
              <h2 id="task-resource-viewer-title">{label}</h2>
              <p>{task.subject} · {task.weekLabel}</p>
            </div>
          </div>
          <button className="plain-icon" onClick={onClose} aria-label="Cerrar archivo">
            <X size={19} />
          </button>
        </header>

        <div className="material-viewer-layout">
          <main>
            {loading ? (
              <div className={`task-resource-loading is-${type}`} role="status" aria-live="polite">
                <div className="task-resource-loading-preview" aria-hidden="true">
                  <span><TypeIcon size={25} /></span>
                  <i />
                  <i />
                  <i />
                </div>
                <div className="task-resource-loading-copy">
                  <small>{details.label} · {source === "submission" ? "Evidencia de la entrega" : "Recurso de la tarea"}</small>
                  <strong>{loadingMessages[type]}…</strong>
                  <p>Estamos verificando el acceso y preparando una vista segura.</p>
                </div>
                <span className="task-resource-loading-track" aria-hidden="true"><i /></span>
              </div>
            ) : type === "pdf" && resourceUrl ? (
              <iframe className="material-pdf-frame" src={resourceUrl} title={`PDF: ${label}`} />
            ) : type === "audio" && resourceUrl ? (
              <div className="material-audio-player">
                <span><Music2 size={34} /></span>
                <div>
                  <small>Ahora escuchas</small>
                  <strong>{label}</strong>
                  <audio controls preload="metadata" src={resourceUrl}>Tu navegador no puede reproducir este audio.</audio>
                </div>
              </div>
            ) : type === "video" && resourceUrl ? (
              <video className="material-video-player" controls preload="metadata" src={resourceUrl}>Tu navegador no puede reproducir este vídeo.</video>
            ) : embeddedVideo ? (
              <iframe className="material-video-player" src={embeddedVideo} title={`Vídeo: ${label}`} allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowFullScreen />
            ) : type === "image" && resourceUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="material-image-preview" src={resourceUrl} alt={label} />
            ) : (
              <div className="material-preview-state">
                <span><TypeIcon size={28} /></span>
                <strong>{type === "link" ? "Recurso externo listo" : "Archivo listo para consultar"}</strong>
                <p>
                  {type === "link"
                    ? `Este recurso se abrirá en ${resourceHostname(resourceUrl)}.`
                    : "Este formato se descarga o abre con la aplicación compatible de tu dispositivo."}
                </p>
                {resourceUrl && (
                  <a className="primary-button task-resource-open-action" href={resourceUrl} target="_blank" rel="noreferrer">
                    {type === "link" ? <ExternalLink size={15} /> : <Download size={15} />}
                    {type === "link" ? "Abrir recurso" : "Abrir archivo"}
                  </a>
                )}
              </div>
            )}

            {error && <p className="material-inline-error">{error}</p>}
            <section className="material-description">
              <small>{source === "submission" ? "Archivo entregado por el alumno" : "Recurso de la actividad"}</small>
              <p>{source === "submission" ? "Esta evidencia forma parte del historial de entregas de la tarea." : task.description}</p>
            </section>
            {resourceUrl && (
              <section className="material-resource-list">
                <h3>{source === "submission" ? "Acceso al archivo" : "Acceso al recurso"}</h3>
                <a href={resourceUrl} target="_blank" rel="noreferrer">
                  <span>{type === "link" ? <Link2 size={16} /> : <Paperclip size={16} />}</span>
                  <div>
                    <strong>{label}</strong>
                    <small>
                      {resource.kind === "attachment"
                        ? formatBytes(resource.attachment.size)
                        : resourceHostname(resource.link.url)}
                    </small>
                  </div>
                  {type === "link" ? <ExternalLink size={16} /> : <Download size={16} />}
                </a>
              </section>
            )}
          </main>

          <aside>
            <div className="material-detail-facts">
              <span><CalendarDays size={15} /><div><small>Tarea</small><strong>{task.title}</strong></div></span>
              <span><Users size={15} /><div><small>Grupo</small><strong>{task.targetGroup}</strong></div></span>
              <span><Eye size={15} /><div><small>Tipo</small><strong>{details.label}</strong></div></span>
            </div>
            {source === "resource" && profile.role !== "student" && (
              <section className="material-reading-panel">
                <div>
                  <span><Eye size={16} /></span>
                  <div>
                    <strong>Registro de aperturas</strong>
                    <small>{views.length} de {audience.length} alumnos abrieron este recurso</small>
                  </div>
                </div>
                <div className="material-reading-progress"><i style={{ width: `${coverage}%` }} /></div>
                <div className="material-student-views">
                  {audience.map((student) => {
                    const view = viewsByStudent.get(student.uid);
                    return (
                      <span className={view ? "has-viewed" : ""} key={student.uid}>
                        <i>{view ? <Check size={12} /> : student.initials}</i>
                        <div>
                          <strong>{student.name}</strong>
                          <small>
                            {view
                              ? `Visto ${formatDateTime(view.lastOpenedAt)}${view.viewCount > 1 ? ` · ${view.viewCount} aperturas` : ""}`
                              : "Aún no lo abre"}
                          </small>
                        </div>
                      </span>
                    );
                  })}
                  {!audience.length && <p>Las aperturas aparecerán aquí cuando los alumnos consulten el recurso.</p>}
                </div>
              </section>
            )}
          </aside>
        </div>
      </motion.section>
    </motion.div>
  );
}
