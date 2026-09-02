"use client";

import {
  ArrowLeft,
  ArrowRight,
  BellRing,
  CalendarDays,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  History,
  Link2,
  LockKeyhole,
  MessageSquareText,
  Paperclip,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { TaskResourceViewer } from "@/components/task-resource-viewer";
import {
  closeTaskAssignment,
  extendTaskForGroup,
  grantIndividualTaskExtension,
  isFirebaseTaskAssignment,
  isTaskSubmissionOpen,
  loadViewedTaskResourceIds,
  markTaskSubmissionReviewed,
  publishTaskNow,
  sendTaskFeedback,
  submitTaskResponse,
  watchSubmissionHistory,
  watchTaskExtension,
  watchTaskHistory,
  watchTaskSubmissions,
} from "@/lib/tasks-firebase";
import type {
  AcademicCalendar,
  AcademicCalendarInput,
  AcademicConfig,
  ManagedAccount,
  Role,
  TaskAssignment,
  TaskCreateInput,
  TaskExtension,
  TaskHistoryEvent,
  TaskResource,
  TaskSubmission,
  UserProfile,
} from "@/lib/types";

const TASK_PAGE_SIZE = 6;
const acceptedTaskFiles =
  ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.webp,.txt,.csv,audio/*,video/*";

const subjectOptions = [
  "Español",
  "Matemáticas",
  "Ciencias",
  "Historia",
  "Geografía",
  "Formación Cívica",
  "Inglés",
  "Artes",
  "Educación Física",
];

const subjectTone: Record<string, string> = {
  Ciencias: "mint",
  Matemáticas: "gold",
  Español: "coral",
  Historia: "violet",
  Geografía: "mint",
  Inglés: "coral",
};

function toLocalDateTime(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatDate(value: string, includeYear = false) {
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(includeYear ? { year: "numeric" } : {}),
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatBytes(bytes: number) {
  if (!bytes) return "Archivo";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function taskVisualStatus(task: TaskAssignment) {
  if (task.status === "published" && new Date(task.dueAt).getTime() < Date.now()) {
    return { key: "expired", label: "Vencida", className: "is-expired" };
  }
  const values = {
    draft: { key: "draft", label: "Borrador", className: "is-draft" },
    scheduled: {
      key: "scheduled",
      label: "Programada",
      className: "is-scheduled",
    },
    published: { key: "published", label: "Activa", className: "is-active" },
    closed: { key: "closed", label: "Cerrada", className: "is-closed" },
    archived: { key: "archived", label: "Archivada", className: "is-closed" },
  } as const;
  return values[task.status];
}

export function TaskListPage({
  role,
  tasks,
  loading,
  openDetail,
}: {
  role: Role;
  tasks: TaskAssignment[];
  loading: boolean;
  openDetail: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [subject, setSubject] = useState("all");
  const [week, setWeek] = useState("all");
  const [page, setPage] = useState(1);
  const subjects = useMemo(
    () => [...new Set(tasks.map((task) => task.subject))].sort(),
    [tasks],
  );
  const weeks = useMemo(
    () =>
      [...new Map(tasks.map((task) => [task.weekId, task.weekLabel])).entries()],
    [tasks],
  );
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es-MX");
    return tasks.filter((task) => {
      const visualStatus = taskVisualStatus(task).key;
      const matchesTerm =
        !term ||
        [task.title, task.description, task.subject, task.weekLabel, task.teacherName]
          .join(" ")
          .toLocaleLowerCase("es-MX")
          .includes(term);
      return (
        matchesTerm &&
        (status === "all" || visualStatus === status) &&
        (subject === "all" || task.subject === subject) &&
        (week === "all" || task.weekId === week)
      );
    });
  }, [search, status, subject, tasks, week]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / TASK_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleTasks = filtered.slice(
    (currentPage - 1) * TASK_PAGE_SIZE,
    currentPage * TASK_PAGE_SIZE,
  );

  const statusOptions =
    role === "student"
      ? [
          ["all", "Todas"],
          ["published", "Pendientes"],
          ["expired", "Vencidas"],
          ["closed", "Cerradas"],
        ]
      : [
          ["all", "Todas"],
          ["draft", "Borradores"],
          ["scheduled", "Programadas"],
          ["published", "Activas"],
          ["expired", "Vencidas"],
          ["closed", "Cerradas"],
        ];

  return (
    <div className="task-workspace">
      <section className="task-toolbar" aria-label="Filtros de tareas">
        <div className="task-search-field">
          <Search size={18} aria-hidden="true" />
          <input
            aria-label="Buscar tareas"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Buscar por actividad, materia o docente…"
          />
        </div>
        <select
          aria-label="Filtrar por estado"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          {statusOptions.map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrar por materia"
          value={subject}
          onChange={(event) => {
            setSubject(event.target.value);
            setPage(1);
          }}
        >
          <option value="all">Todas las materias</option>
          {subjects.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select
          aria-label="Filtrar por semana"
          value={week}
          onChange={(event) => {
            setWeek(event.target.value);
            setPage(1);
          }}
        >
          <option value="all">Todas las semanas</option>
          {weeks.map(([id, label]) => (
            <option value={id} key={id}>
              {label}
            </option>
          ))}
        </select>
      </section>

      <div className="task-results-heading">
        <div>
          <strong>{filtered.length} actividades</strong>
          <span>
            {role === "student"
              ? "Tu trabajo y retroalimentación en un mismo lugar"
              : "Seguimiento del grupo en tiempo real"}
          </span>
        </div>
        <span className="task-live-indicator">
          <i /> Actualización en tiempo real
        </span>
      </div>

      {loading ? (
        <section className="task-loading-grid" aria-label="Cargando tareas">
          {Array.from({ length: 3 }, (_, index) => (
            <span key={index} />
          ))}
        </section>
      ) : visibleTasks.length ? (
        <section className="task-modern-grid">
          {visibleTasks.map((task) => {
            const visualStatus = taskVisualStatus(task);
            return (
              <motion.button
                type="button"
                className="task-modern-card"
                onClick={() => openDetail(task.id)}
                whileHover={{ y: -3 }}
                transition={{ duration: 0.18 }}
                key={task.id}
              >
                <span
                  className={`task-card-accent ${subjectTone[task.subject] ?? "violet"}`}
                />
                <span className="task-modern-card-head">
                  <span className="task-subject-icon">
                    <FileText size={19} />
                  </span>
                  <span className={`task-status-badge ${visualStatus.className}`}>
                    {visualStatus.label}
                  </span>
                </span>
                <span className="task-card-context">
                  {task.subject} <i>•</i> {task.weekLabel}
                </span>
                <strong>{task.title}</strong>
                <p>{task.description}</p>
                <span className="task-card-chips">
                  {task.attachments.length > 0 && (
                    <span>
                      <Paperclip size={13} /> {task.attachments.length}
                    </span>
                  )}
                  {task.links.length > 0 && (
                    <span>
                      <Link2 size={13} /> {task.links.length}
                    </span>
                  )}
                  <span>
                    <Users size={13} /> {task.targetGroup}
                  </span>
                </span>
                <span className="task-card-deadline">
                  <span>
                    <Clock3 size={16} />
                    <span>
                      <small>Fecha de entrega</small>
                      <b>{formatDate(task.dueAt)}</b>
                    </span>
                  </span>
                  <ArrowRight size={18} />
                </span>
              </motion.button>
            );
          })}
        </section>
      ) : (
        <section className="task-empty-results">
          <span>
            <Search size={24} />
          </span>
          <h2>No encontramos tareas</h2>
          <p>Ajusta los filtros o prueba con otra búsqueda.</p>
          <button
            className="secondary-button"
            onClick={() => {
              setSearch("");
              setStatus("all");
              setSubject("all");
              setWeek("all");
            }}
          >
            Limpiar filtros
          </button>
        </section>
      )}

      {filtered.length > TASK_PAGE_SIZE && (
        <nav className="task-pagination" aria-label="Paginación de tareas">
          <button
            className="plain-icon"
            disabled={currentPage === 1}
            onClick={() => setPage((current) => current - 1)}
            aria-label="Página anterior"
          >
            <ChevronLeft size={18} />
          </button>
          <span>
            Página <strong>{currentPage}</strong> de {totalPages}
          </span>
          <button
            className="plain-icon"
            disabled={currentPage === totalPages}
            onClick={() => setPage((current) => current + 1)}
            aria-label="Página siguiente"
          >
            <ChevronRight size={18} />
          </button>
        </nav>
      )}
    </div>
  );
}

export function TaskCreateModal({
  config,
  accounts,
  onClose,
  onCreate,
}: {
  config: AcademicConfig;
  accounts: ManagedAccount[];
  onClose: () => void;
  onCreate: (input: TaskCreateInput) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subject, setSubject] = useState("Ciencias");
  const [dueAt, setDueAt] = useState(() => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    tomorrow.setHours(20, 0, 0, 0);
    return toLocalDateTime(tomorrow);
  });
  const [targetGroup, setTargetGroup] = useState("");
  const [links, setLinks] = useState([{ label: "", url: "" }]);
  const [files, setFiles] = useState<Array<File | null>>([null]);
  const [publicationMode, setPublicationMode] =
    useState<TaskCreateInput["publicationMode"]>("now");
  const [publishAt, setPublishAt] = useState(() =>
    toLocalDateTime(new Date(Date.now() + 60 * 60 * 1000)),
  );
  const [busy, setBusy] = useState(false);
  const hasActiveWeek =
    config.calendarStatus === "active" && Boolean(config.weekId && config.termId);
  const groups = useMemo(() => {
    const fromAccounts = accounts
      .filter((account) => account.role === "student" && account.grade && account.group)
      .map((account) => `${account.grade} ${account.group}`);
    return [...new Set([...fromAccounts, "5.º A", "5.º B"])].sort();
  }, [accounts]);
  const selectedGroup = targetGroup || groups[0] || "5.º A";

  function selectFile(index: number, file?: File) {
    if (!file) return;
    if (file.size >= 100 * 1024 * 1024) {
      toast.error("Cada recurso debe pesar menos de 100 MB.");
      return;
    }
    setFiles((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? file : item)),
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!hasActiveWeek) {
      toast.error("Dirección debe configurar una semana activa antes de crear tareas.");
      return;
    }
    if (new Date(dueAt).getTime() <= Date.now()) {
      toast.error("La fecha de entrega debe estar en el futuro.");
      return;
    }
    if (
      publicationMode === "scheduled" &&
      (new Date(publishAt).getTime() <= Date.now() ||
        new Date(publishAt).getTime() >= new Date(dueAt).getTime())
    ) {
      toast.error("La publicación debe ser futura y anterior a la entrega.");
      return;
    }
    setBusy(true);
    try {
      await onCreate({
        title: title.trim(),
        description: description.trim(),
        subject,
        subjectId: subject
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-"),
        weekId: config.weekId,
        weekLabel: config.weekLabel,
        dueAt: new Date(dueAt).toISOString(),
        targetGroup: selectedGroup,
        links,
        files: files.filter(Boolean) as File[],
        publicationMode,
        publishAt:
          publicationMode === "scheduled"
            ? new Date(publishAt).toISOString()
            : undefined,
      });
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos crear la tarea.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      className="modal-backdrop task-modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <motion.form
        className="task-create-modal"
        initial={{ opacity: 0, y: 18, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.985 }}
        onSubmit={submit}
      >
        <header className="task-create-header">
          <div>
            <span className="eyebrow">Nueva actividad</span>
            <h2>Prepara una tarea para tu grupo</h2>
            <p>Los alumnos recibirán el aviso en cuanto se publique.</p>
          </div>
          <button className="plain-icon" type="button" onClick={onClose}>
            <X size={21} />
          </button>
        </header>

        <div className="task-create-body">
          {!hasActiveWeek && (
            <div className="task-calendar-warning" role="alert">
              <CircleAlert size={19} />
              <div>
                <strong>No hay una semana activa</strong>
                <span>Revisa las fechas del calendario académico desde Configuración.</span>
              </div>
            </div>
          )}
          <section className="task-form-section">
            <div className="task-form-section-title">
              <span>01</span>
              <div>
                <strong>Contenido de la actividad</strong>
                <small>Una indicación clara ayuda a entregar mejor.</small>
              </div>
            </div>
            <label>
              Nombre de la actividad
              <input
                autoFocus
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ej. Bitácora de un cambio"
              />
            </label>
            <label>
              Descripción e indicaciones
              <textarea
                required
                rows={5}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Explica qué debe hacer el alumno y qué esperas recibir…"
              />
            </label>
            <div className="task-form-grid three">
              <label>
                Semana
                <input value={config.weekLabel} readOnly />
                {config.weekStartDate && config.weekEndDate && (
                  <small>
                    {config.weekStartDate} a {config.weekEndDate} · {config.termLabel}
                  </small>
                )}
              </label>
              <label>
                Materia
                <select value={subject} onChange={(event) => setSubject(event.target.value)}>
                  {subjectOptions.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                Grupo
                <select
                  value={selectedGroup}
                  onChange={(event) => setTargetGroup(event.target.value)}
                >
                  {groups.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="task-form-section">
            <div className="task-form-section-title">
              <span>02</span>
              <div>
                <strong>Recursos para trabajar</strong>
                <small>Agrega tantos enlaces y archivos como necesites.</small>
              </div>
            </div>
            <div className="task-repeatable-heading">
              <strong>
                <Link2 size={16} /> Enlaces
              </strong>
              <button
                type="button"
                onClick={() => setLinks((current) => [...current, { label: "", url: "" }])}
              >
                <Plus size={15} /> Agregar enlace
              </button>
            </div>
            <div className="task-repeatable-list">
              {links.map((link, index) => (
                <div className="task-link-row" key={index}>
                  <input
                    aria-label={`Nombre del enlace ${index + 1}`}
                    value={link.label}
                    onChange={(event) =>
                      setLinks((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, label: event.target.value } : item,
                        ),
                      )
                    }
                    placeholder="Nombre del recurso"
                  />
                  <input
                    aria-label={`URL del enlace ${index + 1}`}
                    type="url"
                    value={link.url}
                    onChange={(event) =>
                      setLinks((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, url: event.target.value } : item,
                        ),
                      )
                    }
                    placeholder="https://…"
                  />
                  {links.length > 1 && (
                    <button
                      className="plain-icon"
                      type="button"
                      aria-label="Quitar enlace"
                      onClick={() =>
                        setLinks((current) => current.filter((_, itemIndex) => itemIndex !== index))
                      }
                    >
                      <X size={17} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="task-repeatable-heading task-files-heading">
              <strong>
                <Paperclip size={16} /> Archivos adjuntos
              </strong>
              <button type="button" onClick={() => setFiles((current) => [...current, null])}>
                <Plus size={15} /> Agregar archivo
              </button>
            </div>
            <div className="task-file-slots">
              {files.map((file, index) => (
                <label className={file ? "has-file" : ""} key={index}>
                  <UploadCloud size={20} />
                  <span>
                    <strong>{file?.name ?? `Seleccionar archivo ${index + 1}`}</strong>
                    <small>{file ? formatBytes(file.size) : "PDF, Office, imagen, audio o vídeo · máx. 100 MB"}</small>
                  </span>
                  <input
                    type="file"
                    accept={acceptedTaskFiles}
                    onChange={(event) => selectFile(index, event.target.files?.[0])}
                  />
                  {files.length > 1 && (
                    <button
                      className="plain-icon"
                      type="button"
                      aria-label="Quitar archivo"
                      onClick={(event) => {
                        event.preventDefault();
                        setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
                      }}
                    >
                      <X size={16} />
                    </button>
                  )}
                </label>
              ))}
            </div>
          </section>

          <section className="task-form-section">
            <div className="task-form-section-title">
              <span>03</span>
              <div>
                <strong>Fechas y publicación</strong>
                <small>El cierre se aplica en Firebase con la hora de Ciudad de México.</small>
              </div>
            </div>
            <div className="task-form-grid">
              <label>
                Fecha de entrega
                <input
                  type="datetime-local"
                  min={toLocalDateTime(new Date())}
                  value={dueAt}
                  onChange={(event) => setDueAt(event.target.value)}
                  required
                />
              </label>
              {publicationMode === "scheduled" && (
                <label>
                  Fecha de publicación
                  <input
                    type="datetime-local"
                    min={toLocalDateTime(new Date())}
                    value={publishAt}
                    onChange={(event) => setPublishAt(event.target.value)}
                    required
                  />
                </label>
              )}
            </div>
            <fieldset className="task-publication-options">
              <legend>¿Cuándo podrán verla los alumnos?</legend>
              {[
                ["now", "Publicar ahora", "Notifica al grupo al guardar", BellRing],
                ["scheduled", "Programar", "Se publicará automáticamente", CalendarClock],
                ["draft", "Guardar borrador", "Sólo será visible para ti", LockKeyhole],
              ].map(([value, label, detail, Icon]) => (
                <button
                  type="button"
                  className={publicationMode === value ? "selected" : ""}
                  onClick={() => setPublicationMode(value as TaskCreateInput["publicationMode"])}
                  key={value as string}
                >
                  <Icon size={19} />
                  <span>
                    <strong>{label as string}</strong>
                    <small>{detail as string}</small>
                  </span>
                  <i>{publicationMode === value && <Check size={12} />}</i>
                </button>
              ))}
            </fieldset>
          </section>
        </div>

        <footer className="task-create-footer">
          <span>
            <ShieldCheck size={16} /> Ciclo {config.schoolYearLabel} · {config.termLabel}
          </span>
          <div>
            <button className="secondary-button" type="button" onClick={onClose}>
              Cancelar
            </button>
            <button
              className="primary-button"
              disabled={
                busy || !hasActiveWeek || !title.trim() || !description.trim()
              }
            >
              {busy ? <span className="button-spinner" /> : <Sparkles size={17} />}
              {busy
                ? "Guardando y subiendo…"
                : publicationMode === "now"
                  ? "Publicar tarea"
                  : publicationMode === "scheduled"
                    ? "Programar tarea"
                    : "Guardar borrador"}
            </button>
          </div>
        </footer>
      </motion.form>
    </motion.div>
  );
}

function demoSubmission(profile: UserProfile): TaskSubmission {
  const now = new Date().toISOString();
  return {
    id: profile.role === "student" ? profile.uid : "demo-student",
    studentId: profile.role === "student" ? profile.uid : "demo-student",
    studentName: profile.role === "student" ? profile.name : "Sofía Hernández",
    teacherId: "demo-teacher",
    taskId: "demo",
    content:
      "Observé cómo un cubo de hielo se convirtió en agua. Tomé notas sobre la temperatura y el tiempo.",
    attachments: [],
    status: "submitted",
    version: 1,
    submittedAt: now,
    updatedAt: now,
  };
}

function demoHistory(submission: TaskSubmission): TaskHistoryEvent[] {
  return [
    {
      id: "demo-event",
      type: "submitted",
      authorId: submission.studentId,
      authorName: submission.studentName,
      authorRole: "student",
      studentId: submission.studentId,
      studentName: submission.studentName,
      message: submission.content,
      version: 1,
      createdAt: submission.updatedAt,
    },
  ];
}

export function TaskDetailModal({
  task,
  profile,
  accounts,
  firebaseReady,
  onClose,
  onDemoTaskChange,
}: {
  task: TaskAssignment;
  profile: UserProfile;
  accounts: ManagedAccount[];
  firebaseReady: boolean;
  onClose: () => void;
  onDemoTaskChange: (task: TaskAssignment) => void;
}) {
  const staff = profile.role !== "student";
  const liveFirebaseTask = firebaseReady && isFirebaseTaskAssignment(task);
  const [submissions, setSubmissions] = useState<TaskSubmission[]>(() =>
    !liveFirebaseTask && staff ? [demoSubmission(profile)] : [],
  );
  const [selectedStudentId, setSelectedStudentId] = useState(
    profile.role === "student" ? profile.uid : "",
  );
  const [history, setHistory] = useState<TaskHistoryEvent[]>(() =>
    !liveFirebaseTask && staff ? demoHistory(demoSubmission(profile)) : [],
  );
  const [taskHistory, setTaskHistory] = useState<TaskHistoryEvent[]>([]);
  const [selectedResource, setSelectedResource] = useState<TaskResource | null>(null);
  const [viewedResourceIds, setViewedResourceIds] = useState<Set<string>>(new Set());
  const [extension, setExtension] = useState<TaskExtension | null>(null);
  const [response, setResponse] = useState("");
  const [responseFiles, setResponseFiles] = useState<File[]>([]);
  const [feedback, setFeedback] = useState("");
  const [groupDueAt, setGroupDueAt] = useState(() =>
    toLocalDateTime(
      new Date(
        Math.max(Date.now(), new Date(task.dueAt).getTime()) +
          24 * 60 * 60 * 1000,
      ),
    ),
  );
  const [extensionStudentId, setExtensionStudentId] = useState("");
  const [individualDueAt, setIndividualDueAt] = useState(() =>
    toLocalDateTime(new Date(Date.now() + 24 * 60 * 60 * 1000)),
  );
  const [busy, setBusy] = useState("");
  const eligibleStudents = useMemo(
    () =>
      accounts.filter(
        (account) =>
          account.role === "student" &&
          `${account.grade ?? ""} ${account.group ?? ""}`.trim() === task.targetGroup,
      ),
    [accounts, task.targetGroup],
  );
  const activeSelectedStudentId =
    selectedStudentId ||
    (staff ? submissions[0]?.studentId ?? "" : profile.uid);
  const selectedSubmission = submissions.find(
    (submission) => submission.studentId === activeSelectedStudentId,
  );
  const effectiveOpen = isTaskSubmissionOpen(task, extension);
  const visualStatus = taskVisualStatus(task);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (selectedResource) setSelectedResource(null);
      else onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, selectedResource]);

  useEffect(() => {
    if (!liveFirebaseTask) return;
    return watchTaskSubmissions(task, profile, setSubmissions, (error) =>
      toast.error(error.message),
    );
  }, [liveFirebaseTask, profile, task]);

  useEffect(() => {
    if (!activeSelectedStudentId || !liveFirebaseTask) return;
    return watchSubmissionHistory(task, activeSelectedStudentId, setHistory, (error) =>
      toast.error(error.message),
    );
  }, [activeSelectedStudentId, liveFirebaseTask, task]);

  useEffect(() => {
    if (profile.role !== "student" || !liveFirebaseTask) return;
    let active = true;
    void loadViewedTaskResourceIds(task, profile)
      .then((ids) => {
        if (active) setViewedResourceIds(ids);
      })
      .catch((error) => {
        if (active) toast.error("No pudimos cargar tus recursos vistos", {
          description: error instanceof Error ? error.message : undefined,
        });
      });
    return () => {
      active = false;
    };
  }, [liveFirebaseTask, profile, task]);

  useEffect(() => {
    if (!liveFirebaseTask || !staff) return;
    return watchTaskHistory(task, setTaskHistory, (error) => toast.error(error.message));
  }, [liveFirebaseTask, staff, task]);

  useEffect(() => {
    if (!activeSelectedStudentId || !liveFirebaseTask) return;
    return watchTaskExtension(task, activeSelectedStudentId, setExtension, (error) =>
      toast.error(error.message),
    );
  }, [activeSelectedStudentId, liveFirebaseTask, task]);

  async function runAction(key: string, action: () => Promise<void>, success: string) {
    setBusy(key);
    try {
      await action();
      toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos completar la acción.");
    } finally {
      setBusy("");
    }
  }

  function openResource(resource: TaskResource) {
    const id = resource.kind === "attachment"
      ? resource.attachment.id
      : resource.link.id;
    setViewedResourceIds((current) => new Set(current).add(id));
    setSelectedResource(resource);
  }

  async function submitResponse() {
    if (!response.trim() && !responseFiles.length) return;
    if (!liveFirebaseTask) {
      const current = submissions.find((item) => item.studentId === profile.uid);
      const next: TaskSubmission = {
        id: profile.uid,
        studentId: profile.uid,
        studentName: profile.name,
        teacherId: task.createdBy,
        taskId: task.id,
        content: response.trim(),
        attachments: [],
        status: "submitted",
        version: (current?.version ?? 0) + 1,
        submittedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setSubmissions([next]);
      setHistory((currentHistory) => [
        ...currentHistory,
        {
          id: crypto.randomUUID(),
          type: next.version === 1 ? "submitted" : "resubmitted",
          authorId: profile.uid,
          authorName: profile.name,
          authorRole: "student",
          message: next.content,
          version: next.version,
          createdAt: next.updatedAt,
        },
      ]);
      setResponse("");
      setResponseFiles([]);
      toast.success(`Versión ${next.version} entregada`);
      return;
    }
    await runAction(
      "submit",
      async () => {
        const version = await submitTaskResponse(task, profile, response, responseFiles);
        setResponse("");
        setResponseFiles([]);
        toast.success(`Versión ${version} entregada y maestro notificado`);
      },
      "Entrega registrada",
    );
  }

  async function sendFeedback() {
    if (!selectedSubmission || !feedback.trim()) return;
    if (!liveFirebaseTask) {
      const now = new Date().toISOString();
      setSubmissions((current) =>
        current.map((item) =>
          item.id === selectedSubmission.id
            ? { ...item, status: "feedback", teacherFeedback: feedback, updatedAt: now }
            : item,
        ),
      );
      setHistory((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          type: "feedback",
          authorId: profile.uid,
          authorName: profile.name,
          authorRole: profile.role,
          message: feedback,
          createdAt: now,
        },
      ]);
      setFeedback("");
      toast.success("Retroalimentación enviada al alumno");
      return;
    }
    await runAction(
      "feedback",
      async () => {
        await sendTaskFeedback(task, selectedSubmission, profile, feedback);
        setFeedback("");
      },
      "Retroalimentación enviada al alumno",
    );
  }

  return (
    <motion.div
      className="task-detail-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <motion.section
        className="task-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-detail-title"
        initial={{ opacity: 0, y: 18, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.985 }}
      >
        <header className="task-detail-header">
          <button className="plain-icon" onClick={onClose} aria-label="Cerrar detalle">
            <ArrowLeft size={20} />
          </button>
          <div>
            <span>
              {task.subject} · {task.weekLabel}
            </span>
            <strong id="task-detail-title">{task.title}</strong>
          </div>
          <span className={`task-status-badge ${visualStatus.className}`}>
            {visualStatus.label}
          </span>
          <button className="plain-icon task-detail-close" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        <div className="task-detail-scroll">
          <section className="task-detail-hero">
            <div>
              <span className="task-detail-kicker">
                <FileText size={16} /> Actividad para {task.targetGroup}
              </span>
              <h2>{task.title}</h2>
              <p>{task.description}</p>
              <span className="task-teacher-line">
                <UserRound size={15} /> {task.teacherName}
              </span>
            </div>
            <aside>
              <span>
                <Clock3 size={19} />
                <span>
                  <small>Fecha límite</small>
                  <strong>{formatDate(task.dueAt, true)}</strong>
                </span>
              </span>
              <span>
                <CalendarClock size={19} />
                <span>
                  <small>Ciclo académico</small>
                  <strong>
                    {task.schoolYearLabel} · {task.termLabel}
                  </strong>
                </span>
              </span>
            </aside>
          </section>

          {(task.links.length > 0 || task.attachments.length > 0) && (
            <section className="task-resources-panel">
              <div className="task-section-heading">
                <span>
                  <Paperclip size={18} />
                </span>
                <div>
                  <h3>Recursos de la actividad</h3>
                  <p>Recursos preparados por el docente.</p>
                </div>
              </div>
              <div className="task-resource-list">
                {task.links.map((link) => (
                  <button
                    type="button"
                    onClick={() => openResource({ kind: "link", link })}
                    key={link.id}
                  >
                    <span className="task-resource-icon link">
                      <Link2 size={18} />
                    </span>
                    <span>
                      <strong>{link.label}</strong>
                      <small>{link.url}</small>
                    </span>
                    {viewedResourceIds.has(link.id) && profile.role === "student" ? (
                      <span className="task-resource-viewed"><Check size={12} /> Visto</span>
                    ) : (
                      <ExternalLink size={16} />
                    )}
                  </button>
                ))}
                {task.attachments.map((attachment) => (
                  <button
                    type="button"
                    onClick={() => openResource({ kind: "attachment", attachment })}
                    key={attachment.id}
                  >
                    <span className="task-resource-icon file">
                      <FileText size={18} />
                    </span>
                    <span>
                      <strong>{attachment.name}</strong>
                      <small>{formatBytes(attachment.size)}</small>
                    </span>
                    {viewedResourceIds.has(attachment.id) && profile.role === "student" ? (
                      <span className="task-resource-viewed"><Check size={12} /> Visto</span>
                    ) : (
                      <Download size={16} />
                    )}
                  </button>
                ))}
              </div>
            </section>
          )}

          {staff ? (
            <StaffTaskFlow
              task={task}
              profile={profile}
              submissions={submissions}
              selectedSubmission={selectedSubmission}
              selectedStudentId={activeSelectedStudentId}
              setSelectedStudentId={setSelectedStudentId}
              history={history}
              taskHistory={taskHistory}
              feedback={feedback}
              setFeedback={setFeedback}
              sendFeedback={sendFeedback}
              busy={busy}
              runAction={runAction}
              firebaseReady={liveFirebaseTask}
              onDemoTaskChange={onDemoTaskChange}
              groupDueAt={groupDueAt}
              setGroupDueAt={setGroupDueAt}
              eligibleStudents={eligibleStudents}
              extensionStudentId={extensionStudentId}
              setExtensionStudentId={setExtensionStudentId}
              individualDueAt={individualDueAt}
              setIndividualDueAt={setIndividualDueAt}
            />
          ) : (
            <StudentTaskFlow
              submission={selectedSubmission}
              history={history}
              extension={extension}
              effectiveOpen={effectiveOpen}
              task={task}
              response={response}
              setResponse={setResponse}
              responseFiles={responseFiles}
              setResponseFiles={setResponseFiles}
              submitResponse={submitResponse}
              busy={busy}
            />
          )}
        </div>

        <AnimatePresence>
          {selectedResource && (
            <TaskResourceViewer
              task={task}
              resource={selectedResource}
              profile={profile}
              accounts={accounts}
              firebaseReady={liveFirebaseTask}
              onClose={() => setSelectedResource(null)}
            />
          )}
        </AnimatePresence>
      </motion.section>
    </motion.div>
  );
}

function StudentTaskFlow({
  submission,
  history,
  extension,
  effectiveOpen,
  task,
  response,
  setResponse,
  responseFiles,
  setResponseFiles,
  submitResponse,
  busy,
}: {
  submission?: TaskSubmission;
  history: TaskHistoryEvent[];
  extension: TaskExtension | null;
  effectiveOpen: boolean;
  task: TaskAssignment;
  response: string;
  setResponse: (value: string) => void;
  responseFiles: File[];
  setResponseFiles: (files: File[]) => void;
  submitResponse: () => Promise<void>;
  busy: string;
}) {
  return (
    <div className="task-flow-grid student-flow">
      <section className="task-response-panel">
        <div className="task-section-heading">
          <span>
            <Send size={18} />
          </span>
          <div>
            <h3>{submission ? "Enviar una nueva versión" : "Tu respuesta"}</h3>
            <p>
              {submission
                ? `La última entrega fue la versión ${submission.version}.`
                : "Escribe tu respuesta y adjunta tus evidencias."}
            </p>
          </div>
        </div>
        {extension && (
          <div className="task-extension-notice">
            <CalendarClock size={18} />
            <span>
              <strong>Tienes una prórroga individual</strong>
              <small>Nueva fecha: {formatDate(extension.dueAt, true)}</small>
            </span>
          </div>
        )}
        {effectiveOpen ? (
          <>
            <label>
              Respuesta o comentario
              <textarea
                rows={6}
                value={response}
                onChange={(event) => setResponse(event.target.value)}
                placeholder="Describe tu trabajo, hallazgos o cambios de esta versión…"
              />
            </label>
            <label className="task-response-upload">
              <UploadCloud size={20} />
              <span>
                <strong>Adjuntar archivos</strong>
                <small>PDF, Office o imágenes · máx. 20 MB por archivo</small>
              </span>
              <input
                type="file"
                multiple
                accept={acceptedTaskFiles}
                onChange={(event) => {
                  const incoming = Array.from(event.target.files ?? []);
                  const valid = incoming.filter((file) => file.size <= 20 * 1024 * 1024);
                  if (valid.length !== incoming.length) toast.error("Omitimos archivos mayores a 20 MB.");
                  setResponseFiles([...responseFiles, ...valid]);
                }}
              />
            </label>
            {responseFiles.length > 0 && (
              <div className="task-selected-files">
                {responseFiles.map((file, index) => (
                  <span key={`${file.name}-${index}`}>
                    <Paperclip size={14} /> {file.name}
                    <button
                      className="plain-icon"
                      onClick={() =>
                        setResponseFiles(responseFiles.filter((_, itemIndex) => itemIndex !== index))
                      }
                    >
                      <X size={13} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <button
              className="primary-button full-button"
              disabled={busy === "submit" || (!response.trim() && !responseFiles.length)}
              onClick={() => void submitResponse()}
            >
              {busy === "submit" ? <span className="button-spinner" /> : <Send size={17} />}
              {submission ? "Enviar nueva versión" : "Entregar tarea"}
            </button>
          </>
        ) : (
          <div className="task-closed-notice">
            <LockKeyhole size={22} />
            <div>
              <strong>Las entregas están cerradas</strong>
              <p>
                {task.status === "closed"
                  ? "El docente cerró esta actividad."
                  : "La fecha límite terminó."} Puedes consultar tu historial, pero ya no enviar archivos.
              </p>
            </div>
          </div>
        )}
      </section>
      <TaskTimeline history={history} emptyLabel="Tu entrega y la respuesta del maestro aparecerán aquí." />
    </div>
  );
}

function StaffTaskFlow({
  task,
  profile,
  submissions,
  selectedSubmission,
  selectedStudentId,
  setSelectedStudentId,
  history,
  taskHistory,
  feedback,
  setFeedback,
  sendFeedback,
  busy,
  runAction,
  firebaseReady,
  onDemoTaskChange,
  groupDueAt,
  setGroupDueAt,
  eligibleStudents,
  extensionStudentId,
  setExtensionStudentId,
  individualDueAt,
  setIndividualDueAt,
}: {
  task: TaskAssignment;
  profile: UserProfile;
  submissions: TaskSubmission[];
  selectedSubmission?: TaskSubmission;
  selectedStudentId: string;
  setSelectedStudentId: (id: string) => void;
  history: TaskHistoryEvent[];
  taskHistory: TaskHistoryEvent[];
  feedback: string;
  setFeedback: (value: string) => void;
  sendFeedback: () => Promise<void>;
  busy: string;
  runAction: (key: string, action: () => Promise<void>, success: string) => Promise<void>;
  firebaseReady: boolean;
  onDemoTaskChange: (task: TaskAssignment) => void;
  groupDueAt: string;
  setGroupDueAt: (value: string) => void;
  eligibleStudents: ManagedAccount[];
  extensionStudentId: string;
  setExtensionStudentId: (value: string) => void;
  individualDueAt: string;
  setIndividualDueAt: (value: string) => void;
}) {
  const selectedExtensionStudentId = extensionStudentId || eligibleStudents[0]?.uid || "";

  async function staffAction(
    key: string,
    realAction: () => Promise<void>,
    demoChanges: Partial<TaskAssignment>,
    success: string,
  ) {
    await runAction(
      key,
      firebaseReady
        ? realAction
        : async () => onDemoTaskChange({ ...task, ...demoChanges, updatedAt: new Date().toISOString() }),
      success,
    );
  }

  return (
    <div className="task-staff-stack">
      <section className="task-control-panel">
        <div className="task-section-heading">
          <span>
            <ShieldCheck size={18} />
          </span>
          <div>
            <h3>Control de la actividad</h3>
            <p>Publica, cierra o extiende sin perder el historial.</p>
          </div>
        </div>
        <div className="task-control-actions">
          {task.status === "draft" || task.status === "scheduled" ? (
            <button
              className="primary-button"
              disabled={Boolean(busy)}
              onClick={() =>
                void staffAction(
                  "publish",
                  () => publishTaskNow(task, profile),
                  { status: "published", publicationMode: "now" },
                  "Tarea publicada y grupo notificado",
                )
              }
            >
              <BellRing size={16} /> Publicar ahora
            </button>
          ) : task.status === "published" ? (
            <button
              className="secondary-button danger-button"
              disabled={Boolean(busy)}
              onClick={() =>
                void staffAction(
                  "close",
                  () => closeTaskAssignment(task, profile),
                  { status: "closed", closedAt: new Date().toISOString() },
                  "Tarea cerrada para nuevas entregas",
                )
              }
            >
              <LockKeyhole size={16} /> Cerrar tarea
            </button>
          ) : null}
          <span>
            {submissions.length} {submissions.length === 1 ? "entrega" : "entregas"}
          </span>
        </div>
        <div className="task-extension-grid">
          <div>
            <strong>Reabrir o prorrogar al grupo</strong>
            <p>Actualiza la fecha para todos los alumnos.</p>
            <input
              type="datetime-local"
              min={toLocalDateTime(new Date())}
              value={groupDueAt}
              onChange={(event) => setGroupDueAt(event.target.value)}
            />
            <button
              className="secondary-button"
              disabled={Boolean(busy)}
              onClick={() =>
                void staffAction(
                  "group-extension",
                  () => extendTaskForGroup(task, profile, new Date(groupDueAt).toISOString()),
                  {
                    status: "published",
                    dueAt: new Date(groupDueAt).toISOString(),
                    closedAt: undefined,
                  },
                  task.status === "closed" ? "Tarea reabierta para el grupo" : "Fecha extendida para el grupo",
                )
              }
            >
              <Users size={16} /> Aplicar al grupo
            </button>
          </div>
          <div>
            <strong>Prórroga individual</strong>
            <p>Sólo el alumno elegido podrá entregar después.</p>
            <select
              value={selectedExtensionStudentId}
              onChange={(event) => setExtensionStudentId(event.target.value)}
            >
              {eligibleStudents.length ? (
                eligibleStudents.map((student) => (
                  <option value={student.uid} key={student.uid}>
                    {student.name}
                  </option>
                ))
              ) : (
                <option value="">Sin alumnos disponibles</option>
              )}
            </select>
            <input
              type="datetime-local"
              min={toLocalDateTime(new Date())}
              value={individualDueAt}
              onChange={(event) => setIndividualDueAt(event.target.value)}
            />
            <button
              className="secondary-button"
              disabled={Boolean(busy) || !selectedExtensionStudentId}
              onClick={() => {
                const student = eligibleStudents.find(
                  (item) => item.uid === selectedExtensionStudentId,
                );
                if (!student) return;
                void runAction(
                  "individual-extension",
                  firebaseReady
                    ? () =>
                        grantIndividualTaskExtension(
                          task,
                          profile,
                          { uid: student.uid, name: student.name },
                          new Date(individualDueAt).toISOString(),
                        )
                    : async () => undefined,
                  `Prórroga enviada a ${student.name}`,
                );
              }}
            >
              <UserRound size={16} /> Dar prórroga
            </button>
          </div>
        </div>
      </section>

      <div className="task-flow-grid">
        <section className="task-review-panel">
          <div className="task-section-heading">
            <span>
              <MessageSquareText size={18} />
            </span>
            <div>
              <h3>Entregas y retroalimentación</h3>
              <p>Selecciona a un alumno para revisar su conversación.</p>
            </div>
          </div>
          {submissions.length ? (
            <>
              <label>
                Alumno
                <select
                  value={selectedStudentId}
                  onChange={(event) => setSelectedStudentId(event.target.value)}
                >
                  {submissions.map((submission) => (
                    <option value={submission.studentId} key={submission.studentId}>
                      {submission.studentName} · Versión {submission.version}
                    </option>
                  ))}
                </select>
              </label>
              {selectedSubmission && (
                <div className="task-submission-summary">
                  <span className={`submission-state is-${selectedSubmission.status}`}>
                    {selectedSubmission.status === "submitted"
                      ? "Por revisar"
                      : selectedSubmission.status === "feedback"
                        ? "Retroalimentada"
                        : selectedSubmission.status === "reviewed"
                          ? "Finalizada"
                          : "Borrador"}
                  </span>
                  <strong>Versión {selectedSubmission.version}</strong>
                  <p>{selectedSubmission.content}</p>
                </div>
              )}
              <label>
                Retroalimentación para el alumno
                <textarea
                  rows={5}
                  value={feedback}
                  onChange={(event) => setFeedback(event.target.value)}
                  placeholder="Reconoce el avance y explica el siguiente paso…"
                />
              </label>
              <div className="task-feedback-actions">
                <button
                  className="primary-button"
                  disabled={!feedback.trim() || Boolean(busy)}
                  onClick={() => void sendFeedback()}
                >
                  <Send size={16} /> Enviar retroalimentación
                </button>
                <button
                  className="secondary-button"
                  disabled={!selectedSubmission || Boolean(busy)}
                  onClick={() => {
                    if (!selectedSubmission) return;
                    void runAction(
                      "reviewed",
                      firebaseReady
                        ? () => markTaskSubmissionReviewed(task, selectedSubmission, profile)
                        : async () => undefined,
                      "Entrega finalizada y alumno notificado",
                    );
                  }}
                >
                  <CheckCircle2 size={16} /> Finalizar entrega
                </button>
              </div>
            </>
          ) : (
            <div className="task-no-submissions">
              <span>
                <History size={22} />
              </span>
              <strong>Aún no hay entregas</strong>
              <p>Se actualizarán aquí en tiempo real.</p>
            </div>
          )}
        </section>
        <TaskTimeline history={history} emptyLabel="El intercambio con el alumno aparecerá aquí." />
      </div>

      {taskHistory.length > 0 && (
        <section className="task-administration-history">
          <div className="task-section-heading">
            <span>
              <ShieldCheck size={18} />
            </span>
            <div>
              <h3>Historial administrativo</h3>
              <p>Publicaciones, cierres y prórrogas de la actividad.</p>
            </div>
          </div>
          <div>
            {taskHistory.map((event) => (
              <span key={event.id}>
                <i />
                <strong>{event.message}</strong>
                <small>
                  {event.authorName} · {formatDate(event.createdAt)}
                </small>
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function TaskTimeline({
  history,
  emptyLabel,
}: {
  history: TaskHistoryEvent[];
  emptyLabel: string;
}) {
  return (
    <section className="task-timeline-panel">
      <div className="task-section-heading">
        <span>
          <History size={18} />
        </span>
        <div>
          <h3>Historial de la tarea</h3>
          <p>Todo el intercambio queda registrado.</p>
        </div>
      </div>
      {history.length ? (
        <div className="task-timeline">
          {history.map((event) => {
            const teacherEvent = event.authorRole !== "student";
            return (
              <article className={teacherEvent ? "is-teacher" : "is-student"} key={event.id}>
                <span className="task-timeline-avatar">
                  {teacherEvent ? <ShieldCheck size={15} /> : <UserRound size={15} />}
                </span>
                <div>
                  <header>
                    <strong>{event.authorName}</strong>
                    <small>{formatDate(event.createdAt)}</small>
                  </header>
                  <span className="task-event-label">
                    {event.type === "submitted"
                      ? "Entregó la tarea"
                      : event.type === "resubmitted"
                        ? `Envió la versión ${event.version}`
                        : event.type === "feedback"
                          ? "Envió retroalimentación"
                          : event.type === "reviewed"
                            ? "Finalizó la entrega"
                            : "Actualizó la actividad"}
                  </span>
                  {event.message && <p>{event.message}</p>}
                  {event.attachments && event.attachments.length > 0 && (
                    <span className="task-event-files">
                      <Paperclip size={13} /> {event.attachments.length} archivos
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="task-timeline-empty">
          <CircleAlert size={20} />
          <p>{emptyLabel}</p>
        </div>
      )}
    </section>
  );
}

type WeekDraft = AcademicCalendarInput["weeks"][number];
type TermDraft = AcademicCalendarInput["terms"][number];
type NonWorkingDayDraft = AcademicCalendarInput["nonWorkingDays"][number] & { id: string };
const ACADEMIC_WEEKS_PAGE_SIZE = 5;
const ACADEMIC_NONWORKING_PAGE_SIZE = 10;

function dateInputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function addDaysToDateInput(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return dateInputValue(date);
}

function initialAcademicWeek(): WeekDraft {
  const today = new Date();
  const mondayOffset = (today.getDay() + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - mondayOffset);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  return {
    id: "semana1",
    label: "Semana 1",
    startDate: dateInputValue(monday),
    endDate: dateInputValue(friday),
  };
}

function academicDateStatus(week: WeekDraft) {
  const today = dateInputValue(new Date());
  if (today < week.startDate) return { label: "Próxima", className: "is-upcoming" };
  if (today > week.endDate) return { label: "Finalizada", className: "is-past" };
  return { label: "Actual", className: "is-current" };
}

function isWeekendInput(value: string) {
  const day = new Date(`${value}T12:00:00`).getDay();
  return day === 0 || day === 6;
}

function academicScopeForDate(
  weeks: WeekDraft[],
  terms: TermDraft[],
  date: string,
) {
  const week = weeks.find((candidate) => date >= candidate.startDate && date <= candidate.endDate);
  const term = week ? terms.find((candidate) => candidate.weekIds.includes(week.id)) : undefined;
  return { week, term };
}

function workingDayCountForWeek(week: WeekDraft, nonWorkingDays: NonWorkingDayDraft[]) {
  let count = 0;
  for (let date = week.startDate; date && date <= week.endDate; date = addDaysToDateInput(date, 1)) {
    if (!isWeekendInput(date) && !nonWorkingDays.some((day) => day.date === date)) count += 1;
  }
  return count;
}

export function AcademicConfigurationCard({
  config,
  calendar,
  onSave,
}: {
  config: AcademicConfig;
  calendar: AcademicCalendar;
  onSave: (input: AcademicCalendarInput) => Promise<void>;
}) {
  const firstWeek = calendar.weeks.length
    ? null
    : initialAcademicWeek();
  const [schoolYearId, setSchoolYearId] = useState(config.schoolYearId);
  const [schoolYearLabel, setSchoolYearLabel] = useState(config.schoolYearLabel);
  const [weeks, setWeeks] = useState<WeekDraft[]>(() =>
    calendar.weeks.length
      ? calendar.weeks.map(({ id, label, startDate, endDate }) => ({
          id,
          label,
          startDate,
          endDate,
        }))
      : [firstWeek as WeekDraft],
  );
  const [terms, setTerms] = useState<TermDraft[]>(() =>
    calendar.terms.length
      ? calendar.terms.map(({ id, label, weekIds }) => ({ id, label, weekIds }))
      : [
          {
            id: "bimestre1",
            label: "Bimestre 1",
            weekIds: firstWeek ? [firstWeek.id] : [],
          },
        ],
  );
  const [nonWorkingDays, setNonWorkingDays] = useState<NonWorkingDayDraft[]>(() =>
    (calendar.nonWorkingDays ?? []).map(({ id, date, label }) => ({ id, date, label })),
  );
  const [nonWorkingSearch, setNonWorkingSearch] = useState("");
  const [nonWorkingWeekFilter, setNonWorkingWeekFilter] = useState("all");
  const [nonWorkingPage, setNonWorkingPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [weekPage, setWeekPage] = useState(() => {
    const currentIndex = weeks.findIndex(
      (week) => academicDateStatus(week).className === "is-current",
    );
    return currentIndex >= 0
      ? Math.floor(currentIndex / ACADEMIC_WEEKS_PAGE_SIZE) + 1
      : 1;
  });
  const totalWeekPages = Math.max(
    1,
    Math.ceil(weeks.length / ACADEMIC_WEEKS_PAGE_SIZE),
  );
  const weekPageStart = (weekPage - 1) * ACADEMIC_WEEKS_PAGE_SIZE;
  const visibleWeeks = weeks.slice(
    weekPageStart,
    weekPageStart + ACADEMIC_WEEKS_PAGE_SIZE,
  );
  const normalizedNonWorkingSearch = nonWorkingSearch.trim().toLocaleLowerCase("es");
  const filteredNonWorkingDays = [...nonWorkingDays]
    .sort((first, second) => first.date.localeCompare(second.date))
    .filter((day) => {
      const scope = academicScopeForDate(weeks, terms, day.date);
      return (nonWorkingWeekFilter === "all" || scope.week?.id === nonWorkingWeekFilter)
        && (!normalizedNonWorkingSearch
          || `${day.date} ${day.label} ${scope.week?.label ?? ""} ${scope.term?.label ?? ""}`
            .toLocaleLowerCase("es")
            .includes(normalizedNonWorkingSearch));
    });
  const totalNonWorkingPages = Math.max(
    1,
    Math.ceil(filteredNonWorkingDays.length / ACADEMIC_NONWORKING_PAGE_SIZE),
  );
  const activeNonWorkingPage = Math.min(nonWorkingPage, totalNonWorkingPages);
  const visibleNonWorkingDays = filteredNonWorkingDays.slice(
    (activeNonWorkingPage - 1) * ACADEMIC_NONWORKING_PAGE_SIZE,
    activeNonWorkingPage * ACADEMIC_NONWORKING_PAGE_SIZE,
  );

  const validationMessage = useMemo(() => {
    if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(schoolYearId.trim())) {
      return "El identificador del ciclo sólo puede usar minúsculas, números y guiones.";
    }
    if (schoolYearLabel.trim().length < 2) return "Escribe el nombre visible del ciclo.";
    if (!weeks.length) return "Agrega al menos una semana.";
    for (const week of weeks) {
      if (!week.label.trim() || !week.startDate || !week.endDate) {
        return "Completa el nombre y el rango de todas las semanas.";
      }
      if (week.endDate < week.startDate) {
        return `${week.label || "Una semana"} termina antes de comenzar.`;
      }
    }
    const sortedWeeks = [...weeks].sort((first, second) =>
      first.startDate.localeCompare(second.startDate),
    );
    for (let index = 1; index < sortedWeeks.length; index += 1) {
      if (sortedWeeks[index].startDate <= sortedWeeks[index - 1].endDate) {
        return `${sortedWeeks[index - 1].label} y ${sortedWeeks[index].label} se traslapan.`;
      }
    }
    if (!terms.length) return "Agrega al menos un bimestre.";
    if (terms.length > 5) return "El ciclo puede tener un máximo de cinco bimestres.";
    if (terms.some((term) => !term.label.trim() || !term.weekIds.length)) {
      return "Cada bimestre necesita nombre y al menos una semana.";
    }
    const weekOrder = new Map(
      sortedWeeks.map((week, index) => [week.id, index]),
    );
    for (const term of terms) {
      const indexes = term.weekIds
        .map((weekId) => weekOrder.get(weekId) ?? -1)
        .sort((first, second) => first - second);
      if (
        indexes.some(
          (weekIndex, index) =>
            index > 0 && weekIndex !== indexes[index - 1] + 1,
        )
      ) {
        return `${term.label} debe agrupar semanas consecutivas.`;
      }
    }
    const assignments = terms.flatMap((term) => term.weekIds);
    const unassigned = weeks.find((week) => !assignments.includes(week.id));
    if (unassigned) return `Asigna ${unassigned.label} a un bimestre.`;
    if (new Set(assignments).size !== assignments.length) {
      return "Cada semana sólo puede pertenecer a un bimestre.";
    }
    const configuredDates = new Set<string>();
    for (const day of nonWorkingDays) {
      if (!day.date || !day.label.trim()) {
        return "Completa la fecha y el motivo de todos los días no laborales.";
      }
      if (configuredDates.has(day.date)) return `El día no laboral ${day.date} está duplicado.`;
      configuredDates.add(day.date);
      if (isWeekendInput(day.date)) {
        return `${day.date} ya es fin de semana; selecciona un día hábil.`;
      }
      const scope = academicScopeForDate(weeks, terms, day.date);
      if (!scope.week) return `El día no laboral ${day.date} no pertenece a ninguna semana.`;
      if (!scope.term) return `Asigna ${scope.week.label} a un bimestre para ubicar ${day.date}.`;
    }
    const emptyWeek = weeks.find(
      (week) => workingDayCountForWeek(week, nonWorkingDays) === 0,
    );
    if (emptyWeek) return `${emptyWeek.label} debe conservar al menos un día hábil.`;
    return "";
  }, [nonWorkingDays, schoolYearId, schoolYearLabel, terms, weeks]);

  const currentWeek = weeks.find(
    (week) => academicDateStatus(week).className === "is-current",
  );

  function addWeek() {
    const nextNumber = weeks.length + 1;
    const usedIds = new Set(weeks.map((week) => week.id));
    let id = `semana${nextNumber}`;
    let suffix = nextNumber;
    while (usedIds.has(id)) {
      suffix += 1;
      id = `semana${suffix}`;
    }
    const lastWeek = [...weeks].sort((first, second) =>
      first.endDate.localeCompare(second.endDate),
    ).at(-1);
    const startDate = lastWeek
      ? addDaysToDateInput(lastWeek.endDate, 3)
      : dateInputValue(new Date());
    const nextWeek = {
      id,
      label: `Semana ${nextNumber}`,
      startDate,
      endDate: addDaysToDateInput(startDate, 4),
    };
    setWeeks((current) => [...current, nextWeek]);
    setWeekPage(
      Math.ceil((weeks.length + 1) / ACADEMIC_WEEKS_PAGE_SIZE),
    );
    setTerms((current) =>
      current.map((term, index) =>
        index === current.length - 1
          ? { ...term, weekIds: [...term.weekIds, nextWeek.id] }
          : term,
      ),
    );
  }

  function addTerm() {
    const nextNumber = terms.length + 1;
    const usedIds = new Set(terms.map((term) => term.id));
    let id = `bimestre${nextNumber}`;
    let suffix = nextNumber;
    while (usedIds.has(id)) {
      suffix += 1;
      id = `bimestre${suffix}`;
    }
    setTerms((current) => [
      ...current,
      { id, label: `Bimestre ${nextNumber}`, weekIds: [] },
    ]);
  }

  function addNonWorkingDay() {
    const usedDates = new Set(nonWorkingDays.map((day) => day.date));
    let availableDate = "";
    for (const week of [...weeks].sort((first, second) => first.startDate.localeCompare(second.startDate))) {
      for (let date = week.startDate; date && date <= week.endDate; date = addDaysToDateInput(date, 1)) {
        if (!isWeekendInput(date) && !usedDates.has(date)) {
          availableDate = date;
          break;
        }
      }
      if (availableDate) break;
    }
    if (!availableDate) {
      toast.info("No quedan días hábiles disponibles en las semanas configuradas.");
      return;
    }
    setNonWorkingDays((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        date: availableDate,
        label: "Suspensión de labores",
      },
    ]);
    setNonWorkingSearch("");
    setNonWorkingWeekFilter("all");
    setNonWorkingPage(Math.ceil((nonWorkingDays.length + 1) / ACADEMIC_NONWORKING_PAGE_SIZE));
  }

  function assignWeek(termId: string, weekId: string, selected: boolean) {
    setTerms((current) =>
      current.map((term) => {
        if (selected) {
          return term.id === termId
            ? { ...term, weekIds: [...new Set([...term.weekIds, weekId])] }
            : { ...term, weekIds: term.weekIds.filter((id) => id !== weekId) };
        }
        return term.id === termId
          ? { ...term, weekIds: term.weekIds.filter((id) => id !== weekId) }
          : term;
      }),
    );
  }

  function weekPagination(label: string) {
    if (weeks.length <= ACADEMIC_WEEKS_PAGE_SIZE) return null;
    const firstVisible = weekPageStart + 1;
    const lastVisible = Math.min(
      weekPageStart + ACADEMIC_WEEKS_PAGE_SIZE,
      weeks.length,
    );
    return (
      <nav className="academic-week-pagination" aria-label={label}>
        <span>
          Semanas <strong>{firstVisible}–{lastVisible}</strong> de {weeks.length}
        </span>
        <div>
          <button
            className="plain-icon"
            type="button"
            disabled={weekPage === 1}
            aria-label="Ver las cinco semanas anteriores"
            onClick={() => setWeekPage((current) => Math.max(1, current - 1))}
          >
            <ChevronLeft size={17} />
          </button>
          <span>
            Página <strong>{weekPage}</strong> de {totalWeekPages}
          </span>
          <button
            className="plain-icon"
            type="button"
            disabled={weekPage === totalWeekPages}
            aria-label="Ver las cinco semanas siguientes"
            onClick={() =>
              setWeekPage((current) => Math.min(totalWeekPages, current + 1))
            }
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </nav>
    );
  }

  return (
    <section className="panel settings-section academic-config-section">
      <div className="settings-heading academic-calendar-heading">
        <span className="settings-icon">
          <CalendarClock size={20} />
        </span>
        <div>
          <h2>Calendario académico</h2>
          <p>Dirección define aquí las semanas que utilizarán tareas, avances y reportes.</p>
        </div>
        <span className={`academic-current-chip ${currentWeek ? "is-active" : ""}`}>
          <i /> {currentWeek ? `${currentWeek.label} en curso` : "Sin semana para hoy"}
        </span>
      </div>

      <div className="academic-path-preview">
        <span>{schoolYearId || "ciclo-escolar"}</span>
        <ChevronRight size={14} />
        <span>{config.termId || "bimestre"}</span>
        <ChevronRight size={14} />
        <span>{currentWeek?.id ?? "semana"}</span>
        <ChevronRight size={14} />
        <span>materia</span>
      </div>

      <div className="academic-config-grid academic-cycle-grid">
        <label>
          Identificador del ciclo
          <input
            value={schoolYearId}
            onChange={(event) => setSchoolYearId(event.target.value.toLowerCase())}
            placeholder="cicloescolar26-27"
          />
          <small>Se conserva como clave estable para consultas históricas.</small>
        </label>
        <label>
          Nombre visible del ciclo
          <input
            value={schoolYearLabel}
            onChange={(event) => setSchoolYearLabel(event.target.value)}
            placeholder="2026–2027"
          />
          <small>Se mostrará en tareas, reportes y filtros.</small>
        </label>
      </div>

      <div className="academic-calendar-block">
        <div className="academic-calendar-title">
          <div>
            <span className="eyebrow">Semanas del ciclo</span>
            <h3>Nombre y rango de fechas</h3>
            <p>Las fechas no pueden traslaparse. El cambio de semana se realiza automáticamente.</p>
          </div>
          <button className="secondary-button" type="button" onClick={addWeek}>
            <Plus size={16} /> Agregar semana
          </button>
        </div>
        <div className="academic-week-list">
          {visibleWeeks.map((week, index) => {
            const status = academicDateStatus(week);
            return (
              <article className="academic-week-row" key={week.id}>
                <div className="academic-week-index">
                  <CalendarDays size={17} />
                  <span>{String(weekPageStart + index + 1).padStart(2, "0")}</span>
                </div>
                <label>
                  Nombre
                  <input
                    value={week.label}
                    onChange={(event) =>
                      setWeeks((current) =>
                        current.map((item) =>
                          item.id === week.id
                            ? { ...item, label: event.target.value }
                            : item,
                        ),
                      )
                    }
                    placeholder="Semana 1"
                  />
                </label>
                <label>
                  Inicio
                  <input
                    type="date"
                    value={week.startDate}
                    onChange={(event) =>
                      setWeeks((current) =>
                        current.map((item) =>
                          item.id === week.id
                            ? { ...item, startDate: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Fin
                  <input
                    type="date"
                    value={week.endDate}
                    onChange={(event) =>
                      setWeeks((current) =>
                        current.map((item) =>
                          item.id === week.id
                            ? { ...item, endDate: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </label>
                <span className={`academic-week-status ${status.className}`}>
                  {status.label}
                </span>
                <button
                  className="plain-icon academic-remove"
                  type="button"
                  disabled={weeks.length === 1}
                  aria-label={`Quitar ${week.label}`}
                  onClick={() => {
                    setWeeks((current) => current.filter((item) => item.id !== week.id));
                    setWeekPage((current) =>
                      Math.min(
                        current,
                        Math.max(
                          1,
                          Math.ceil(
                            (weeks.length - 1) / ACADEMIC_WEEKS_PAGE_SIZE,
                          ),
                        ),
                      ),
                    );
                    setTerms((current) =>
                      current.map((term) => ({
                        ...term,
                        weekIds: term.weekIds.filter((id) => id !== week.id),
                      })),
                    );
                    setNonWorkingDays((current) => current.filter(
                      (day) => day.date < week.startDate || day.date > week.endDate,
                    ));
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </article>
            );
          })}
        </div>
        {weekPagination("Paginación de semanas del ciclo")}
      </div>

      <div className="academic-calendar-block">
        <div className="academic-calendar-title">
          <div>
            <span className="eyebrow">Excepciones del calendario</span>
            <h3>Días no laborales</h3>
            <p>
              La semana y el bimestre se detectan por fecha. Estos días no aparecen en captura ni
              cuentan como evidencia esperada para el promedio semanal.
            </p>
          </div>
          <button className="secondary-button" type="button" onClick={addNonWorkingDay}>
            <Plus size={16} /> Agregar día no laboral
          </button>
        </div>
        {nonWorkingDays.length ? (
          <>
            <div className="academic-nonworking-toolbar">
              <label>
                <Search size={16} />
                <input
                  type="search"
                  value={nonWorkingSearch}
                  onChange={(event) => { setNonWorkingSearch(event.target.value); setNonWorkingPage(1); }}
                  placeholder="Buscar fecha, motivo, semana…"
                />
              </label>
              <select
                aria-label="Filtrar días no laborales por semana"
                value={nonWorkingWeekFilter}
                onChange={(event) => { setNonWorkingWeekFilter(event.target.value); setNonWorkingPage(1); }}
              >
                <option value="all">Todas las semanas</option>
                {[...weeks].sort((first, second) => first.startDate.localeCompare(second.startDate)).map((week) => (
                  <option key={week.id} value={week.id}>{week.label}</option>
                ))}
              </select>
              <span>{filteredNonWorkingDays.length} {filteredNonWorkingDays.length === 1 ? "resultado" : "resultados"}</span>
            </div>
            <div className="academic-nonworking-list">
            {visibleNonWorkingDays.map((day) => {
              const scope = academicScopeForDate(weeks, terms, day.date);
              const workingDays = scope.week
                ? workingDayCountForWeek(scope.week, nonWorkingDays)
                : 0;
              return (
                <article className="academic-nonworking-row" key={day.id}>
                  <span className="academic-nonworking-icon" aria-hidden="true">
                    <CalendarDays size={18} />
                  </span>
                  <label>
                    Fecha
                    <input
                      type="date"
                      value={day.date}
                      onChange={(event) => setNonWorkingDays((current) => current.map((item) =>
                        item.id === day.id ? { ...item, date: event.target.value } : item
                      ))}
                    />
                  </label>
                  <label>
                    Motivo
                    <input
                      value={day.label}
                      onChange={(event) => setNonWorkingDays((current) => current.map((item) =>
                        item.id === day.id ? { ...item, label: event.target.value } : item
                      ))}
                      placeholder="Consejo técnico, festivo…"
                    />
                  </label>
                  <div className={`academic-nonworking-scope ${scope.week && scope.term ? "is-ready" : "has-error"}`}>
                    <strong>
                      {scope.week && scope.term
                        ? `${scope.week.label} · ${scope.term.label}`
                        : "Fuera del calendario"}
                    </strong>
                    <small>
                      {scope.week
                        ? `${workingDays} ${workingDays === 1 ? "día hábil" : "días hábiles"} en esta semana`
                        : "Selecciona una fecha dentro de una semana"}
                    </small>
                  </div>
                  <button
                    className="plain-icon academic-remove"
                    type="button"
                    aria-label={`Quitar día no laboral ${day.date}`}
                    onClick={() => setNonWorkingDays((current) => current.filter((item) => item.id !== day.id))}
                  >
                    <Trash2 size={16} />
                  </button>
                </article>
              );
            })}
            {!visibleNonWorkingDays.length && (
              <div className="academic-nonworking-empty">
                <Search size={18} />
                <span>No hay días no laborales que coincidan con esta búsqueda.</span>
              </div>
            )}
            </div>
            {filteredNonWorkingDays.length > ACADEMIC_NONWORKING_PAGE_SIZE && (
              <nav className="academic-week-pagination" aria-label="Paginación de días no laborales">
                <span>
                  Días <strong>{(activeNonWorkingPage - 1) * ACADEMIC_NONWORKING_PAGE_SIZE + 1}–{Math.min(activeNonWorkingPage * ACADEMIC_NONWORKING_PAGE_SIZE, filteredNonWorkingDays.length)}</strong> de {filteredNonWorkingDays.length}
                </span>
                <div>
                  <button className="plain-icon" type="button" disabled={activeNonWorkingPage === 1} aria-label="Ver días no laborales anteriores" onClick={() => setNonWorkingPage((current) => Math.max(1, current - 1))}><ChevronLeft size={17} /></button>
                  <span>Página <strong>{activeNonWorkingPage}</strong> de {totalNonWorkingPages}</span>
                  <button className="plain-icon" type="button" disabled={activeNonWorkingPage === totalNonWorkingPages} aria-label="Ver días no laborales siguientes" onClick={() => setNonWorkingPage((current) => Math.min(totalNonWorkingPages, current + 1))}><ChevronRight size={17} /></button>
                </div>
              </nav>
            )}
          </>
        ) : (
          <div className="academic-nonworking-empty">
            <CalendarDays size={18} />
            <span>No hay suspensiones registradas; cada semana usa sus días hábiles de lunes a viernes.</span>
          </div>
        )}
      </div>

      <div className="academic-calendar-block">
        <div className="academic-calendar-title">
          <div>
            <span className="eyebrow">Bimestres</span>
            <h3>Agrupa las semanas</h3>
            <p>Cada semana pertenece a un solo bimestre para evitar reportes ambiguos.</p>
          </div>
          <button className="secondary-button" type="button" onClick={addTerm} disabled={terms.length >= 5}>
            <Plus size={16} /> Agregar bimestre
          </button>
        </div>
        <div className="academic-term-grid">
          {terms.map((term) => (
            <article className="academic-term-card" key={term.id}>
              <header>
                <label>
                  Nombre del bimestre
                  <input
                    value={term.label}
                    onChange={(event) =>
                      setTerms((current) =>
                        current.map((item) =>
                          item.id === term.id
                            ? { ...item, label: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </label>
                <button
                  className="plain-icon"
                  type="button"
                  disabled={terms.length === 1}
                  aria-label={`Quitar ${term.label}`}
                  onClick={() =>
                    setTerms((current) => current.filter((item) => item.id !== term.id))
                  }
                >
                  <Trash2 size={16} />
                </button>
              </header>
              <div className="academic-term-weeks">
                {visibleWeeks.map((week) => (
                  <label
                    className={term.weekIds.includes(week.id) ? "is-selected" : ""}
                    key={week.id}
                  >
                    <input
                      type="checkbox"
                      checked={term.weekIds.includes(week.id)}
                      onChange={(event) =>
                        assignWeek(term.id, week.id, event.target.checked)
                      }
                    />
                    <span>{week.label}</span>
                    <small>{week.startDate.slice(5)} · {week.endDate.slice(5)}</small>
                  </label>
                ))}
              </div>
              <footer>
                {term.weekIds.length} {term.weekIds.length === 1 ? "semana" : "semanas"}
              </footer>
            </article>
          ))}
        </div>
        {weekPagination("Paginación de semanas para los bimestres")}
      </div>

      <div className={`academic-integrity-note ${validationMessage ? "has-error" : "is-ready"}`}>
        {validationMessage ? <CircleAlert size={17} /> : <ShieldCheck size={17} />}
        <span>
          {validationMessage ||
            "Calendario consistente: semanas, bimestres y días no laborales están relacionados."}
        </span>
      </div>

      <div className="academic-config-footer">
        <span>
          <ShieldCheck size={15} /> Validación en Firebase · America/Mexico_City · historial protegido
        </span>
        <button
          className="primary-button"
          disabled={busy || Boolean(validationMessage)}
          onClick={async () => {
            setBusy(true);
            try {
              const order = new Map(
                [...weeks]
                  .sort((first, second) => first.startDate.localeCompare(second.startDate))
                  .map((week, index) => [week.id, index]),
              );
              await onSave({
                schoolYearId: schoolYearId.trim().toLowerCase(),
                schoolYearLabel: schoolYearLabel.trim(),
                timezone: config.timezone,
                weeks: [...weeks]
                  .sort((first, second) => first.startDate.localeCompare(second.startDate))
                  .map((week) => ({
                    ...week,
                    label: week.label.trim(),
                  })),
                terms: terms.map((term) => ({
                  ...term,
                  label: term.label.trim(),
                  weekIds: [...term.weekIds].sort(
                    (first, second) => (order.get(first) ?? 0) - (order.get(second) ?? 0),
                  ),
                })),
                nonWorkingDays: [...nonWorkingDays]
                  .sort((first, second) => first.date.localeCompare(second.date))
                  .map(({ date, label }) => ({ date, label: label.trim() })),
              });
              toast.success("Calendario académico actualizado", {
                description: currentWeek
                  ? `${currentWeek.label} quedó establecida como la semana actual.`
                  : "El sistema activará la siguiente semana al llegar su fecha.",
              });
            } catch (error) {
              toast.error(
                error instanceof Error
                  ? error.message
                  : "No pudimos guardar el calendario.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <span className="button-spinner" /> : <Check size={16} />}
          {busy ? "Validando calendario…" : "Guardar calendario"}
        </button>
      </div>
    </section>
  );
}
