"use client";

import {
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Download,
  FileText,
  LoaderCircle,
  MessageSquareText,
  Paperclip,
  Pencil,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  UploadCloud,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { ContentEditDialog } from "@/components/content-edit-dialog";
import { WorkshopFileViewer } from "@/components/workshop-file-viewer";
import { friendlyFirebaseError } from "@/lib/firebase";
import {
  createWorkshopTask,
  deleteWorkshopTask,
  getWorkshopTaskAttachmentUrl,
  saveWorkshopFeedback,
  setWorkshopTaskStatus,
  submitWorkshopTask,
  updateWorkshopTask,
  watchWorkshopSubmissions,
  watchWorkshopTasks,
  type WorkshopTaskCreateInput,
} from "@/lib/workshops-firebase";
import type {
  ManagedAccount,
  Role,
  UserProfile,
  Workshop,
  WorkshopSubmission,
  WorkshopTask,
  WorkshopTaskAttachment,
} from "@/lib/types";

type WorkshopTasksProps = {
  workshop: Workshop;
  profile: UserProfile;
  role: Role;
  accounts: ManagedAccount[];
  firebaseReady: boolean;
};

function messageFor(error: unknown) {
  if (
    error instanceof Error &&
    !(typeof error === "object" && error && "code" in error)
  ) {
    return error.message;
  }
  return friendlyFirebaseError(error);
}

function dueLabel(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Sin fecha";
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function dateTimeLocal(daysFromNow = 7) {
  const date = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function fileSize(value: number) {
  return value < 1_000_000
    ? `${Math.max(1, Math.round(value / 1_000))} KB`
    : `${(value / 1_000_000).toFixed(1)} MB`;
}

export function WorkshopTasks({
  workshop,
  profile,
  role,
  accounts,
  firebaseReady,
}: WorkshopTasksProps) {
  const [tasks, setTasks] = useState<WorkshopTask[]>([]);
  const [loading, setLoading] = useState(firebaseReady);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<WorkshopTask | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<WorkshopTask | null>(null);
  const [taskToEdit, setTaskToEdit] = useState<WorkshopTask | null>(null);
  const [deleting, setDeleting] = useState(false);
  const canCreate =
    role === "director" || workshop.managerIds.includes(profile.uid);

  useEffect(() => {
    const syncTaskFromRoute = () => {
      const taskId = new URLSearchParams(window.location.search).get("task");
      if (!taskId) {
        setSelectedTask(null);
        return;
      }
      const task = tasks.find((candidate) => candidate.id === taskId);
      if (task) setSelectedTask(task);
    };
    syncTaskFromRoute();
    window.addEventListener("popstate", syncTaskFromRoute);
    return () => window.removeEventListener("popstate", syncTaskFromRoute);
  }, [tasks]);

  function openTask(task: WorkshopTask) {
    window.history.pushState(
      {},
      "",
      `/workshops/${encodeURIComponent(workshop.id)}?task=${encodeURIComponent(task.id)}`,
    );
    setSelectedTask(task);
  }

  function closeTask() {
    window.history.pushState({}, "", `/workshops/${encodeURIComponent(workshop.id)}`);
    setSelectedTask(null);
  }

  useEffect(() => {
    if (!firebaseReady) {
      queueMicrotask(() => {
        setTasks([]);
        setLoading(false);
      });
      return;
    }
    queueMicrotask(() => setLoading(true));
    return watchWorkshopTasks(
      workshop,
      profile,
      (next) => {
        setTasks(next);
        setLoading(false);
      },
      (error) => {
        setLoading(false);
        toast.error(messageFor(error));
      },
    );
  }, [firebaseReady, profile, role, workshop]);

  async function createTask(input: WorkshopTaskCreateInput) {
    if (!firebaseReady) throw new Error("Inicia sesión para publicar trabajos.");
    await createWorkshopTask(workshop, profile, input);
  }

  async function changeStatus(task: WorkshopTask, status: WorkshopTask["status"]) {
    if (!firebaseReady) throw new Error("Inicia sesión para actualizar trabajos.");
    await setWorkshopTaskStatus(task, status);
  }

  async function removeTask() {
    if (!taskToDelete) return;
    setDeleting(true);
    try {
      await deleteWorkshopTask(taskToDelete);
      toast.success("Actividad eliminada");
      setTaskToDelete(null);
      closeTask();
    } catch (error) {
      toast.error(messageFor(error));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="workshop-task-section">
      <div className="workshop-task-heading">
        <div>
          <span className="eyebrow">Aula del taller</span>
          <h2>Trabajos y entregas</h2>
          <p>
            {role === "student"
              ? "Consulta las indicaciones, entrega tus archivos y recibe retroalimentación."
              : "Publica trabajos para tu grupo y acompaña cada entrega."}
          </p>
        </div>
        {canCreate && (
          <button onClick={() => setCreateOpen(true)}>
            <Plus size={17} /> Nuevo trabajo
          </button>
        )}
      </div>

      {loading ? (
        <div className="workshop-task-loading"><LoaderCircle className="spin" size={22} /> Cargando trabajos…</div>
      ) : tasks.length ? (
        <div className="workshop-task-grid">
          {tasks.map((task) => (
            <button
              className="workshop-task-card"
              key={task.id}
              onClick={() => openTask(task)}
            >
              <span className={`workshop-task-status is-${task.status}`}>
                {task.status === "draft"
                  ? "Borrador"
                  : task.status === "closed"
                    ? "Cerrado"
                    : "Publicado"}
              </span>
              <span className="workshop-task-icon"><ClipboardCheck size={22} /></span>
              <strong>{task.title}</strong>
              <p>{task.description}</p>
              <span className="workshop-task-teacher">Por {task.teacherName}</span>
              <footer>
                <span><CalendarClock size={15} /> {dueLabel(task.dueAt)}</span>
                <span><Users size={15} /> {task.audienceStudentIds.length}</span>
                <ArrowRight size={17} />
              </footer>
            </button>
          ))}
        </div>
      ) : (
        <div className="workshop-task-empty">
          <ClipboardCheck size={28} />
          <h3>No hay trabajos por ahora</h3>
          <p>
            {canCreate
              ? "Crea el primer trabajo para los alumnos que Dirección asignó a tu grupo."
              : "Cuando tu maestro publique un trabajo, aparecerá en este espacio."}
          </p>
        </div>
      )}

      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {createOpen && (
            <WorkshopTaskCreateDialog
              workshop={workshop}
              profile={profile}
              accounts={accounts}
              onClose={() => setCreateOpen(false)}
              onCreate={createTask}
            />
          )}
          {selectedTask && (
            <WorkshopTaskDetailDialog
              task={selectedTask}
              profile={profile}
              role={role}
              accounts={accounts}
              firebaseReady={firebaseReady}
              canManage={role === "director" || (workshop.managerIds.includes(profile.uid) && selectedTask.createdBy === profile.uid)}
              onStatusChange={changeStatus}
              onEdit={() => setTaskToEdit(selectedTask)}
              onDelete={() => setTaskToDelete(selectedTask)}
              onClose={closeTask}
            />
          )}
        </AnimatePresence>,
        document.body,
      )}
      <ConfirmDeleteDialog
        open={Boolean(taskToDelete)}
        title={`¿Eliminar “${taskToDelete?.title ?? "esta actividad"}”?`}
        description="Se eliminarán la actividad, todas las entregas, versiones, retroalimentación y archivos asociados. Esta acción no se puede deshacer."
        confirmLabel="Eliminar actividad"
        busy={deleting}
        onCancel={() => setTaskToDelete(null)}
        onConfirm={() => void removeTask()}
      />
      {taskToEdit && <WorkshopTaskEditDialog task={taskToEdit} onCancel={() => setTaskToEdit(null)} />}
    </section>
  );
}

function WorkshopTaskEditDialog({ task, onCancel }: { task: WorkshopTask; onCancel: () => void }) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [dueAt, setDueAt] = useState(() => {
    const date = new Date(task.dueAt);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  });
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await updateWorkshopTask(task, { title: title.trim(), description: description.trim(), dueAt: new Date(dueAt).toISOString() });
      toast.success("Actividad actualizada");
      onCancel();
    } catch (error) {
      toast.error(messageFor(error));
    } finally {
      setBusy(false);
    }
  }

  return <ContentEditDialog open eyebrow="Actividad de taller" title="Editar actividad" description="Corrige las indicaciones o la fecha de entrega." note="El taller, alumnos asignados, archivos y entregas existentes permanecen vinculados." busy={busy} onCancel={onCancel} onSubmit={save}>
    <label>Título<input value={title} minLength={3} maxLength={140} required onChange={(event) => setTitle(event.target.value)} /></label>
    <label>Indicaciones<textarea value={description} minLength={3} maxLength={2000} required onChange={(event) => setDescription(event.target.value)} /></label>
    <label>Fecha límite<input type="datetime-local" value={dueAt} required onChange={(event) => setDueAt(event.target.value)} /></label>
  </ContentEditDialog>;
}

function WorkshopTaskCreateDialog({
  workshop,
  profile,
  accounts,
  onClose,
  onCreate,
}: {
  workshop: Workshop;
  profile: UserProfile;
  accounts: ManagedAccount[];
  onClose: () => void;
  onCreate: (input: WorkshopTaskCreateInput) => Promise<void>;
}) {
  const rosterIds =
    profile.role === "director"
      ? workshop.studentIds
      : workshop.teacherStudentIds[profile.uid] ?? [];
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState(dateTimeLocal());
  const [status, setStatus] = useState<"draft" | "published">("published");
  const [selectedStudents, setSelectedStudents] = useState<string[]>(rosterIds);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const accountById = new Map(accounts.map((account) => [account.uid, account]));
  const roster = rosterIds.map((studentId) =>
    accountById.get(studentId) ?? {
      uid: studentId,
      name: "Alumno asignado",
      initials: "CE",
      grade: "",
      group: "",
    },
  );

  function toggleStudent(studentId: string) {
    setSelectedStudents((current) =>
      current.includes(studentId)
        ? current.filter((id) => id !== studentId)
        : [...current, studentId],
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selectedStudents.length) {
      toast.error("Selecciona al menos un alumno.");
      return;
    }
    setSaving(true);
    try {
      await onCreate({
        title: title.trim(),
        description: description.trim(),
        dueAt: new Date(dueAt).toISOString(),
        status,
        audienceStudentIds: selectedStudents,
        files,
      });
      toast.success(status === "published" ? "Trabajo publicado" : "Borrador guardado");
      onClose();
    } catch (error) {
      toast.error(messageFor(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div className="modal-backdrop workshop-modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.form className="workshop-task-create-modal" initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }} onClick={(event) => event.stopPropagation()} onSubmit={submit}>
        <header>
          <span><ClipboardCheck size={22} /></span>
          <div><small>Nueva actividad</small><h2>Crear trabajo en {workshop.title}</h2><p>Sólo podrás elegir alumnos asignados por Dirección.</p></div>
          <button type="button" onClick={onClose} aria-label="Cerrar"><X size={20} /></button>
        </header>
        <div className="workshop-task-create-body">
          <div className="workshop-task-form-fields">
            <label><span>Título</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required placeholder="Ej. Mi primera historia interactiva" /></label>
            <label><span>Indicaciones</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1800} rows={5} required placeholder="Explica qué deben hacer y cómo entregar…" /></label>
            <label><span>Fecha límite</span><input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} required /></label>
            <label className="workshop-task-files">
              <input type="file" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []))} />
              <UploadCloud size={21} />
              <span><strong>{files.length ? `${files.length} archivo${files.length === 1 ? "" : "s"}` : "Adjuntar material"}</strong><small>Guías, imágenes, audio o video · 20 MB por archivo</small></span>
            </label>
          </div>
          <aside className="workshop-roster-picker">
            <div><span><Users size={17} /> Alumnos de este trabajo</span><button type="button" onClick={() => setSelectedStudents(selectedStudents.length === roster.length ? [] : rosterIds)}>{selectedStudents.length === roster.length ? "Quitar todos" : "Elegir todos"}</button></div>
            {roster.length ? roster.map((student) => (
              <button type="button" className={selectedStudents.includes(student.uid) ? "selected" : ""} key={student.uid} onClick={() => toggleStudent(student.uid)}>
                <i>{student.initials}</i><span><strong>{student.name}</strong><small>{[student.grade, student.group].filter(Boolean).join(" ") || "Taller asignado"}</small></span><em>{selectedStudents.includes(student.uid) && <Check size={13} />}</em>
              </button>
            )) : <p className="workshop-no-roster"><ShieldCheck size={20} /> Dirección aún no te asigna alumnos en este taller.</p>}
          </aside>
        </div>
        <footer>
          <div className="workshop-publication-choice">
            <button type="button" className={status === "draft" ? "active" : ""} onClick={() => setStatus("draft")}>Borrador</button>
            <button type="button" className={status === "published" ? "active" : ""} onClick={() => setStatus("published")}>Publicar ahora</button>
          </div>
          <div><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={saving || !roster.length}>{saving ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />}{saving ? "Guardando…" : status === "published" ? "Publicar" : "Guardar"}</button></div>
        </footer>
      </motion.form>
    </motion.div>
  );
}

function WorkshopTaskDetailDialog({
  task,
  profile,
  role,
  accounts,
  firebaseReady,
  canManage,
  onStatusChange,
  onEdit,
  onDelete,
  onClose,
}: {
  task: WorkshopTask;
  profile: UserProfile;
  role: Role;
  accounts: ManagedAccount[];
  firebaseReady: boolean;
  canManage: boolean;
  onStatusChange: (task: WorkshopTask, status: WorkshopTask["status"]) => Promise<void>;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [submissions, setSubmissions] = useState<WorkshopSubmission[]>([]);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<WorkshopTaskAttachment | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewRequest = useRef(0);
  const staff = canManage;
  const selectedSubmission =
    submissions.find((item) => item.id === selectedSubmissionId) ?? submissions[0];
  const mySubmission = role === "student" ? submissions[0] : undefined;
  const studentById = useMemo(
    () => new Map(accounts.map((account) => [account.uid, account])),
    [accounts],
  );

  useEffect(() => {
    if (!firebaseReady) {
      queueMicrotask(() => setSubmissions([]));
      return;
    }
    return watchWorkshopSubmissions(task, profile, setSubmissions, (error) =>
      toast.error(messageFor(error)),
    );
  }, [firebaseReady, profile, task]);

  useEffect(() => {
    queueMicrotask(() => setFeedback(selectedSubmission?.teacherFeedback ?? ""));
  }, [selectedSubmission]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !document.querySelector(".workshop-attachment-viewer-backdrop, .delete-confirm-backdrop")
      ) {
        onClose();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  async function openAttachment(attachment: WorkshopTaskAttachment) {
    if (!firebaseReady || !attachment.storagePath) {
      toast.error("El archivo no está disponible en Firebase Storage.");
      return;
    }
    const requestId = ++previewRequest.current;
    setPreviewAttachment(attachment);
    setPreviewUrl("");
    setPreviewLoading(true);
    try {
      const url = await getWorkshopTaskAttachmentUrl(attachment);
      if (previewRequest.current === requestId) setPreviewUrl(url);
    } catch (error) {
      if (previewRequest.current === requestId) {
        setPreviewAttachment(null);
        toast.error(messageFor(error));
      }
    } finally {
      if (previewRequest.current === requestId) setPreviewLoading(false);
    }
  }

  function closeAttachmentPreview() {
    previewRequest.current += 1;
    setPreviewAttachment(null);
    setPreviewUrl("");
    setPreviewLoading(false);
  }

  async function submitStudentWork(event: FormEvent) {
    event.preventDefault();
    if (!content.trim() && !files.length) {
      toast.error("Escribe una respuesta o adjunta un archivo.");
      return;
    }
    setBusy(true);
    try {
      if (!firebaseReady) throw new Error("Inicia sesión para entregar trabajos.");
      await submitWorkshopTask(task, profile, { content, files });
      setContent("");
      setFiles([]);
      toast.success(mySubmission ? "Nueva versión enviada" : "Trabajo enviado");
    } catch (error) {
      toast.error(messageFor(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveFeedback(reviewed: boolean) {
    if (!selectedSubmission || !feedback.trim()) {
      toast.error("Escribe una retroalimentación.");
      return;
    }
    setBusy(true);
    try {
      if (!firebaseReady) throw new Error("Inicia sesión para enviar retroalimentación.");
      await saveWorkshopFeedback(task, selectedSubmission, feedback, reviewed);
      toast.success(reviewed ? "Entrega finalizada" : "Retroalimentación enviada");
    } catch (error) {
      toast.error(messageFor(error));
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(status: WorkshopTask["status"]) {
    setBusy(true);
    try {
      await onStatusChange(task, status);
      toast.success(status === "published" ? "Trabajo publicado" : "Trabajo cerrado");
    } catch (error) {
      toast.error(messageFor(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div className="modal-backdrop workshop-modal-backdrop workshop-task-detail-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.section className="workshop-task-detail-modal" initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <header>
          <div><span className={`workshop-task-status is-${task.status}`}>{task.status === "draft" ? "Borrador" : task.status === "closed" ? "Cerrado" : "Publicado"}</span><h2>{task.title}</h2><p><CalendarClock size={15} /> Entrega: {dueLabel(task.dueAt)} · {task.teacherName}</p></div>
          <button onClick={onClose} aria-label="Cerrar"><X size={20} /></button>
        </header>
        <div className="workshop-task-detail-body">
          <main>
            <section className="workshop-task-instructions"><span className="eyebrow">Indicaciones</span><p>{task.description}</p>{task.attachments.length > 0 && <div className="workshop-task-attachments">{task.attachments.map((attachment) => <button key={attachment.id} onClick={() => void openAttachment(attachment)}><FileText size={17} /><span><strong>{attachment.name}</strong><small>{fileSize(attachment.size)}</small></span><Download size={15} /></button>)}</div>}</section>
            {role === "student" ? (
              <section className="workshop-student-delivery">
                {mySubmission?.teacherFeedback && <div className={`workshop-feedback-card is-${mySubmission.status}`}><MessageSquareText size={20} /><div><span>{mySubmission.status === "reviewed" ? "Entrega finalizada" : "Retroalimentación de tu maestro"}</span><p>{mySubmission.teacherFeedback}</p></div></div>}
                {mySubmission && <div className="workshop-previous-delivery"><CheckCircle2 size={18} /><span><strong>Versión {mySubmission.version} enviada</strong><small>{mySubmission.content || `${mySubmission.attachments.length} archivo(s)`}</small></span></div>}
                {task.status === "published" ? <form onSubmit={submitStudentWork}><label><span>{mySubmission ? "Enviar una nueva versión" : "Tu respuesta"}</span><textarea value={content} onChange={(event) => setContent(event.target.value)} rows={5} maxLength={2000} placeholder="Explica tu trabajo o escribe tu respuesta…" /></label><label className="workshop-delivery-file"><input type="file" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []))} /><Paperclip size={18} /><span>{files.length ? `${files.length} archivo(s) seleccionado(s)` : "Adjuntar archivos"}</span></label><button className="primary-button" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />}{mySubmission ? "Enviar nueva versión" : "Entregar trabajo"}</button></form> : <div className="workshop-task-closed"><Clock3 size={20} /> Este trabajo está cerrado para nuevas entregas.</div>}
              </section>
            ) : (
              <section className="workshop-teacher-review">
                <div className="workshop-submission-tabs"><span><Users size={16} /> Entregas ({submissions.length}/{task.audienceStudentIds.length})</span>{submissions.length ? submissions.map((submission) => <button className={selectedSubmission?.id === submission.id ? "active" : ""} key={submission.id} onClick={() => setSelectedSubmissionId(submission.id)}><i>{studentById.get(submission.studentId)?.initials ?? submission.studentName.split(" ").map((part) => part[0]).slice(0, 2).join("")}</i><span><strong>{submission.studentName}</strong><small>Versión {submission.version} · {submission.status === "reviewed" ? "Finalizada" : submission.status === "feedback" ? "Con comentarios" : "Por revisar"}</small></span></button>) : <p>Aún no hay entregas.</p>}</div>
                {selectedSubmission && <div className="workshop-review-pane"><span className="eyebrow">Entrega de {selectedSubmission.studentName}</span><p>{selectedSubmission.content || "Entrega basada en archivos adjuntos."}</p>{selectedSubmission.attachments.map((attachment) => <button className="workshop-submission-file" key={attachment.id} onClick={() => void openAttachment(attachment)}><FileText size={17} /> {attachment.name} <Download size={15} /></button>)}<label><span>Retroalimentación</span><textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} rows={5} maxLength={1600} placeholder="Reconoce lo logrado e indica el siguiente paso…" /></label><div><button disabled={busy} onClick={() => void saveFeedback(false)}><MessageSquareText size={16} /> Enviar comentarios</button><button className="primary-button" disabled={busy} onClick={() => void saveFeedback(true)}><UserCheck size={16} /> Finalizar revisión</button></div></div>}
              </section>
            )}
          </main>
          <aside>
            <div><span>Asignación</span><strong>{task.audienceStudentIds.length} alumnos</strong></div>
            <div><span>Archivos de apoyo</span><strong>{task.attachments.length}</strong></div>
            {staff && <div className="workshop-task-control"><span>Estado del trabajo</span><button disabled={busy} onClick={onEdit}><Pencil size={15} /> Editar actividad</button>{task.status === "draft" && <button disabled={busy} onClick={() => void changeStatus("published")}><Send size={15} /> Publicar</button>}{task.status === "published" && <button disabled={busy} onClick={() => void changeStatus("closed")}><Clock3 size={15} /> Cerrar entregas</button>}{task.status === "closed" && <button disabled={busy} onClick={() => void changeStatus("published")}><Send size={15} /> Reabrir</button>}<button className="danger-button" disabled={busy} onClick={onDelete}><Trash2 size={15} /> Eliminar actividad</button></div>}
          </aside>
        </div>
        {previewAttachment && (
          <WorkshopFileViewer
            file={previewAttachment}
            url={previewUrl}
            loading={previewLoading}
            onClose={closeAttachmentPreview}
          />
        )}
      </motion.section>
    </motion.div>
  );
}
