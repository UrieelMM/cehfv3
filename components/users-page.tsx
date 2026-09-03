"use client";

import {
  Check,
  GraduationCap,
  Library,
  LockKeyhole,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Search,
  ShieldCheck,
  Trash2,
  UploadCloud,
  UserCheck,
  UserX,
  Users,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  deleteManagedAccount,
  firebaseErrorDetails,
  friendlyFirebaseError,
  normalizeGuardianWhatsApp,
  PROFILE_PHOTO_MIME_TYPES,
  setManagedAccountActive,
  updateManagedAccount,
} from "@/lib/firebase";
import type { ManagedAccount, Role, SchoolLevel } from "@/lib/types";

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

const gradesBySchoolLevel: Record<SchoolLevel, readonly string[]> = {
  primary: ["1.º", "2.º", "3.º", "4.º", "5.º", "6.º"],
  secondary: ["1.º", "2.º", "3.º"],
};

const schoolLevelLabels: Record<SchoolLevel, string> = {
  primary: "Primaria",
  secondary: "Secundaria",
};

type AccountAction = { account: ManagedAccount; kind: "status" | "delete" };

export function UsersPage({
  role,
  accounts,
  loading,
  firebaseReady,
  institutionId,
  onUpdated,
  onRemoved,
}: {
  role: Role;
  accounts: ManagedAccount[];
  loading: boolean;
  firebaseReady: boolean;
  institutionId: string;
  onUpdated: (account: ManagedAccount) => void;
  onRemoved: (uid: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "student" | "teacher">("all");
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [editing, setEditing] = useState<ManagedAccount | null>(null);
  const [action, setAction] = useState<AccountAction | null>(null);

  if (role === "student") {
    return (
      <section className="panel guided-state">
        <LockKeyhole size={28} />
        <h2>Esta sección es para personal autorizado</h2>
        <p>Tu información académica sigue disponible en Calificaciones, Avance y Reportes.</p>
      </section>
    );
  }

  const normalizedQuery = query.trim().toLocaleLowerCase("es-MX");
  const visibleAccounts = accounts.filter(
    (account) =>
      (filter === "all" || account.role === filter) &&
      (!normalizedQuery ||
        `${account.name} ${account.email}`
          .toLocaleLowerCase("es-MX")
          .includes(normalizedQuery)),
  );
  const students = accounts.filter((account) => account.role === "student");
  const teachers = accounts.filter((account) => account.role === "teacher");
  const groups = new Set(
    students
      .map((account) =>
        `${schoolLevelLabels[account.schoolLevel ?? "primary"]} ${account.grade ?? ""} ${account.group ?? ""}`.trim(),
      )
      .filter(Boolean),
  );

  return (
    <div className="account-directory-page">
      <section className="metric-grid compact-metrics">
        <motion.article className="metric-card" whileHover={{ y: -3 }}>
          <span className="metric-icon violet"><Users size={20} /></span>
          <strong>{students.filter((account) => account.active).length}</strong>
          <p>Estudiantes activos</p>
        </motion.article>
        <motion.article className="metric-card" whileHover={{ y: -3 }}>
          <span className="metric-icon mint"><GraduationCap size={20} /></span>
          <strong>{teachers.filter((account) => account.active).length}</strong>
          <p>Maestros activos</p>
        </motion.article>
        <motion.article className="metric-card" whileHover={{ y: -3 }}>
          <span className="metric-icon gold"><Library size={20} /></span>
          <strong>{groups.size}</strong>
          <p>Grupos</p>
        </motion.article>
        <motion.article className="metric-card" whileHover={{ y: -3 }}>
          <span className="metric-icon coral"><ShieldCheck size={20} /></span>
          <strong>{accounts.filter((account) => !account.active).length}</strong>
          <p>Accesos pausados</p>
        </motion.article>
      </section>

      <section className="panel user-table-card">
        <div className="table-toolbar">
          <div className="small-search">
            <Search size={17} />
            <input
              type="search"
              aria-label="Buscar personas"
              placeholder="Buscar por nombre o correo…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="filter-pills" aria-label="Filtrar cuentas">
            {([['all', 'Todos'], ['student', 'Estudiantes'], ['teacher', 'Maestros']] as const).map(
              ([value, label]) => (
                <button
                  type="button"
                  className={filter === value ? "active" : ""}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                  key={value}
                >
                  {label}
                </button>
              ),
            )}
          </div>
        </div>
        <div className="user-table">
          <div className="user-row table-head">
            <span>Persona</span><span>Rol</span><span>Asignación</span><span>Estado</span><span />
          </div>
          <AnimatePresence mode="popLayout">
            {visibleAccounts.map((account, index) => (
              <motion.div
                className="user-row"
                key={account.uid}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ delay: Math.min(index, 6) * 0.035 }}
              >
                {role === "director" ? (
                  <button
                    className="user-cell account-user-trigger"
                    type="button"
                    aria-label={`Editar cuenta de ${account.name}`}
                    onClick={() => setEditing(account)}
                  >
                    <span
                      className="avatar small account-avatar"
                      style={account.photoURL ? { backgroundImage: `url(${account.photoURL})` } : undefined}
                    >
                      {!account.photoURL && account.initials}
                    </span>
                    <span className="user-identity">
                      <strong>{account.name}</strong><small>{account.email}</small>
                    </span>
                  </button>
                ) : (
                  <div className="user-cell">
                    <span
                      className="avatar small account-avatar"
                      style={account.photoURL ? { backgroundImage: `url(${account.photoURL})` } : undefined}
                    >
                      {!account.photoURL && account.initials}
                    </span>
                    <span className="user-identity">
                      <strong>{account.name}</strong><small>{account.email}</small>
                    </span>
                  </div>
                )}
                <span>{account.role === "student" ? "Estudiante" : "Maestro"}</span>
                <span>
                  {account.role === "student"
                    ? `${schoolLevelLabels[account.schoolLevel ?? "primary"]} · ${account.grade ?? "Sin grado"} ${account.group ?? ""}`
                    : account.subjects.join(" · ") || "Sin materias"}
                </span>
                <span className={`status-tag ${account.active ? "status-achieved" : "status-neutral"}`}>
                  {account.active ? "Activa" : "Pausada"}
                </span>
                {role === "director" ? (
                  <div className="account-row-actions">
                    <button
                      className="plain-icon"
                      type="button"
                      aria-label={`Opciones de ${account.name}`}
                      aria-expanded={openMenu === account.uid}
                      onClick={() => setOpenMenu((current) => current === account.uid ? null : account.uid)}
                    >
                      <MoreHorizontal size={18} />
                    </button>
                    <AnimatePresence>
                      {openMenu === account.uid && (
                        <motion.div
                          className="account-action-menu"
                          initial={{ opacity: 0, y: -5, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -4, scale: 0.98 }}
                        >
                          <button type="button" onClick={() => { setEditing(account); setOpenMenu(null); }}>
                            <Pencil size={15} /> Editar cuenta
                          </button>
                          <button type="button" onClick={() => { setAction({ account, kind: "status" }); setOpenMenu(null); }}>
                            {account.active ? <UserX size={15} /> : <UserCheck size={15} />}
                            {account.active ? "Desactivar acceso" : "Activar acceso"}
                          </button>
                          <button className="danger" type="button" onClick={() => { setAction({ account, kind: "delete" }); setOpenMenu(null); }}>
                            <Trash2 size={15} /> Eliminar cuenta
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ) : <span />}
              </motion.div>
            ))}
          </AnimatePresence>
          {!loading && visibleAccounts.length === 0 && (
            <div className="account-empty-state">
              <Search size={22} /><strong>No encontramos cuentas</strong>
              <span>Prueba con otro nombre o cambia el filtro.</span>
            </div>
          )}
          {loading && <div className="account-loading-state"><span className="button-spinner" /> Sincronizando cuentas…</div>}
        </div>
      </section>

      <AnimatePresence>
        {editing && (
          <AccountEditor
            key={editing.uid}
            account={editing}
            accounts={accounts}
            firebaseReady={firebaseReady}
            institutionId={institutionId}
            onClose={() => setEditing(null)}
            onSaved={(account) => { onUpdated(account); setEditing(null); }}
          />
        )}
        {action && (
          <AccountActionDialog
            key={`${action.account.uid}-${action.kind}`}
            action={action}
            firebaseReady={firebaseReady}
            onClose={() => setAction(null)}
            onUpdated={(account) => { onUpdated(account); setAction(null); }}
            onRemoved={(uid) => { onRemoved(uid); setAction(null); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function AccountEditor({
  account,
  accounts,
  firebaseReady,
  institutionId,
  onClose,
  onSaved,
}: {
  account: ManagedAccount;
  accounts: ManagedAccount[];
  firebaseReady: boolean;
  institutionId: string;
  onClose: () => void;
  onSaved: (account: ManagedAccount) => void;
}) {
  const [firstName, setFirstName] = useState(account.firstName);
  const [lastName, setLastName] = useState(account.lastName);
  const [email, setEmail] = useState(account.email);
  const [guardianName, setGuardianName] = useState(account.guardianName ?? "");
  const [guardianWhatsApp, setGuardianWhatsApp] = useState(
    account.guardianWhatsApp ?? "",
  );
  const [schoolLevel, setSchoolLevel] = useState<SchoolLevel>(account.schoolLevel ?? "primary");
  const [grade, setGrade] = useState(account.grade ?? "1.º");
  const [group, setGroup] = useState(account.group ?? "A");
  const [subjects, setSubjects] = useState(account.subjects);
  const [teacherIds, setTeacherIds] = useState(account.teacherIds);
  const [photo, setPhoto] = useState<File | undefined>();
  const [photoPreview, setPhotoPreview] = useState(account.photoURL ?? "");
  const [busy, setBusy] = useState(false);
  const teachers = useMemo(
    () => accounts.filter((item) => item.role === "teacher" && item.active),
    [accounts],
  );
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const ready = Boolean(
    firstName.trim() &&
    lastName.trim() &&
    validEmail &&
    (account.role === "teacher" || guardianName.trim().length >= 2) &&
    (account.role === "teacher" || normalizeGuardianWhatsApp(guardianWhatsApp)) &&
    subjects.length &&
    (account.role === "teacher" || teacherIds.length),
  );

  useEffect(() => {
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", closeWithEscape);
    return () => window.removeEventListener("keydown", closeWithEscape);
  }, [busy, onClose]);

  useEffect(() => () => {
    if (photo && photoPreview) URL.revokeObjectURL(photoPreview);
  }, [photo, photoPreview]);

  function toggleSubject(subject: string) {
    setSubjects((current) => current.includes(subject)
      ? current.filter((item) => item !== subject)
      : [...current, subject]);
  }

  function selectPhoto(file?: File) {
    if (!file) return;
    if (!PROFILE_PHOTO_MIME_TYPES.includes(file.type) || file.size >= 4 * 1024 * 1024) {
      toast.error("Fotografía no válida", { description: "Selecciona un JPG, PNG o WEBP menor a 4 MB." });
      return;
    }
    if (photo && photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready) {
      toast.error("Completa la información requerida");
      return;
    }
    setBusy(true);
    try {
      const updated = firebaseReady
        ? await updateManagedAccount({
            uid: account.uid,
            firstName,
            lastName,
            email,
            role: account.role,
            schoolLevel: account.role === "student" ? schoolLevel : undefined,
            grade: account.role === "student" ? grade : undefined,
            group: account.role === "student" ? group : undefined,
            guardianName: account.role === "student" ? guardianName : undefined,
            guardianWhatsApp:
              account.role === "student" ? guardianWhatsApp : undefined,
            subjects,
            teacherIds: account.role === "student" ? teacherIds : [],
            photo,
            currentPhotoURL: account.photoURL,
          }, institutionId)
        : {
            ...account,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            name: `${firstName.trim()} ${lastName.trim()}`,
            email: email.trim().toLowerCase(),
            initials: `${firstName.trim()[0] ?? ""}${lastName.trim()[0] ?? ""}`.toUpperCase(),
            subjects,
            teacherIds: account.role === "student" ? teacherIds : [],
            ...(account.role === "student"
              ? {
                  schoolLevel,
                  grade,
                  group,
                  guardianName: guardianName.trim(),
                  guardianWhatsApp: normalizeGuardianWhatsApp(guardianWhatsApp),
                  guardianWhatsAppAuthorized:
                    account.guardianWhatsAppAuthorized !== false,
                }
              : {}),
            ...(photoPreview ? { photoURL: photoPreview } : {}),
          };
      onSaved(updated);
      toast.success("Cuenta actualizada", { description: "Los cambios se aplicaron en Authentication y Comunidad." });
    } catch (error) {
      console.error("[Campus CEHF] editar cuenta", firebaseErrorDetails(error));
      toast.error("No pudimos actualizar la cuenta", { description: friendlyFirebaseError(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div className="modal-backdrop account-management-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.form className="account-editor-modal" onSubmit={submit} initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.98 }}>
        <header>
          <div><span className="account-registration-mark"><Pencil size={20} /></span><div><span className="eyebrow">COMUNIDAD ESCOLAR</span><h2>Editar cuenta</h2></div></div>
          <button className="plain-icon" type="button" onClick={onClose} disabled={busy} aria-label="Cerrar"><X size={19} /></button>
        </header>
        <div className="account-editor-body">
          <section className="account-editor-profile">
            <span className="avatar account-editor-avatar" style={photoPreview ? { backgroundImage: `url(${photoPreview})` } : undefined}>{!photoPreview && account.initials}</span>
            <div><strong>{account.role === "student" ? "Alumno" : "Maestro"}</strong><span>{account.active ? "Acceso activo" : "Acceso pausado"}</span></div>
            <label className="secondary-button account-photo-button"><UploadCloud size={15} /> Cambiar foto<input type="file" accept={PROFILE_PHOTO_MIME_TYPES.join(",")} onChange={(event) => selectPhoto(event.target.files?.[0])} /></label>
          </section>
          <section className="account-editor-section">
            <div className="registration-section-heading"><span>01</span><div><strong>Identidad</strong><small>Nombre y correo de acceso</small></div></div>
            <div className="registration-name-grid">
              <label>Nombre<input value={firstName} maxLength={80} onChange={(event) => setFirstName(event.target.value)} /></label>
              <label>Apellidos<input value={lastName} maxLength={80} onChange={(event) => setLastName(event.target.value)} /></label>
            </div>
            <label className="registration-field">Correo institucional<input type="email" value={email} maxLength={254} onChange={(event) => setEmail(event.target.value)} /></label>
            {account.role === "student" && (
              <div className="registration-name-grid account-editor-guardian-grid">
                <label>
                  Nombre del padre o tutor
                  <input
                    value={guardianName}
                    onChange={(event) => setGuardianName(event.target.value)}
                    placeholder="Ej. Patricia Hernández"
                    autoComplete="name"
                    maxLength={120}
                    required
                  />
                </label>
                <label>
                  WhatsApp del padre o tutor
                  <input
                    type="tel"
                    inputMode="tel"
                    value={guardianWhatsApp}
                    onChange={(event) => setGuardianWhatsApp(event.target.value)}
                    onBlur={() => {
                      const normalized = normalizeGuardianWhatsApp(guardianWhatsApp);
                      if (normalized) setGuardianWhatsApp(normalized);
                    }}
                    placeholder="55 1234 5678"
                    autoComplete="tel"
                    required
                  />
                  <small className="registration-field-help">
                    <MessageCircle size={12} /> Número familiar de 10 dígitos de México.
                  </small>
                </label>
              </div>
            )}
          </section>
          <section className="account-editor-section">
            <div className="registration-section-heading"><span>02</span><div><strong>Asignación académica</strong><small>Materias{account.role === "student" ? ", grupo y acompañamiento" : " del maestro"}</small></div></div>
            {account.role === "student" && (
              <div className="registration-grade-grid account-editor-assignment">
                <label>Nivel<select value={schoolLevel} onChange={(event) => { const level = event.target.value as SchoolLevel; setSchoolLevel(level); setGrade(gradesBySchoolLevel[level][0]); }}><option value="primary">Primaria</option><option value="secondary">Secundaria</option></select></label>
                <label>Grado<select value={grade} onChange={(event) => setGrade(event.target.value)}>{gradesBySchoolLevel[schoolLevel].map((item) => <option key={item}>{item}</option>)}</select></label>
                <label>Grupo<select value={group} onChange={(event) => setGroup(event.target.value)}>{["A", "B", "C"].map((item) => <option key={item}>{item}</option>)}</select></label>
              </div>
            )}
            <fieldset className="registration-multiselect"><legend>Materias</legend><div>{subjectOptions.map((subject) => <button className={subjects.includes(subject) ? "selected" : ""} type="button" key={subject} onClick={() => toggleSubject(subject)}>{subjects.includes(subject) && <Check size={13} />}{subject}</button>)}</div></fieldset>
            {account.role === "student" && (
              <fieldset className="registration-teachers"><legend>Acompañamiento</legend><div>{teachers.map((teacher) => <button className={teacherIds.includes(teacher.uid) ? "selected" : ""} type="button" key={teacher.uid} onClick={() => setTeacherIds((current) => current.includes(teacher.uid) ? current.filter((id) => id !== teacher.uid) : [...current, teacher.uid])}><span className="avatar small">{teacher.initials}</span><div><strong>{teacher.name}</strong><small>{teacher.subjects.join(" · ")}</small></div><i>{teacherIds.includes(teacher.uid) && <Check size={12} />}</i></button>)}</div></fieldset>
            )}
          </section>
        </div>
        <footer><button className="secondary-button" type="button" onClick={onClose} disabled={busy}>Cancelar</button><button className="primary-button" disabled={!ready || busy}>{busy ? <span className="button-spinner" /> : <Check size={16} />}Guardar cambios</button></footer>
      </motion.form>
    </motion.div>
  );
}

function AccountActionDialog({
  action,
  firebaseReady,
  onClose,
  onUpdated,
  onRemoved,
}: {
  action: AccountAction;
  firebaseReady: boolean;
  onClose: () => void;
  onUpdated: (account: ManagedAccount) => void;
  onRemoved: (uid: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const deleting = action.kind === "delete";
  const activating = !action.account.active;

  async function confirm() {
    setBusy(true);
    try {
      if (deleting) {
        if (firebaseReady) await deleteManagedAccount(action.account.uid);
        onRemoved(action.account.uid);
        toast.success("Cuenta eliminada", { description: "Se retiró de Authentication, Comunidad y fotografías de perfil." });
      } else {
        const updated = firebaseReady
          ? await setManagedAccountActive(action.account.uid, activating)
          : { ...action.account, active: activating };
        onUpdated(updated);
        toast.success(activating ? "Cuenta activada" : "Cuenta desactivada", {
          description: activating ? "La persona ya puede volver a iniciar sesión." : "El acceso quedó bloqueado inmediatamente.",
        });
      }
    } catch (error) {
      console.error(`[Campus CEHF] ${deleting ? "eliminar" : "cambiar estado de"} cuenta`, firebaseErrorDetails(error));
      toast.error(deleting ? "No pudimos eliminar la cuenta" : "No pudimos cambiar el acceso", { description: friendlyFirebaseError(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div className="modal-backdrop account-management-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.section className={`account-confirm-modal ${deleting ? "is-danger" : ""}`} initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.98 }} role="alertdialog" aria-modal="true" aria-labelledby="account-action-title">
        <span className="account-confirm-icon">{deleting ? <Trash2 size={24} /> : activating ? <UserCheck size={24} /> : <UserX size={24} />}</span>
        <span className="eyebrow">ACCESO A CEHF</span>
        <h2 id="account-action-title">{deleting ? "Eliminar cuenta definitivamente" : activating ? "Activar cuenta" : "Desactivar cuenta"}</h2>
        <p>{deleting ? `Se eliminará el acceso de ${action.account.name}, su perfil y sus fotografías. Esta acción no se puede deshacer.` : activating ? `${action.account.name} podrá iniciar sesión nuevamente.` : `${action.account.name} perderá el acceso inmediatamente, pero sus datos se conservarán.`}</p>
        {deleting && <div className="account-delete-warning"><ShieldCheck size={16} /> Las tareas, historias y revisiones institucionales conservan su autoría.</div>}
        <footer><button className="secondary-button" type="button" onClick={onClose} disabled={busy}>Cancelar</button><button className={deleting ? "danger-button" : "primary-button"} type="button" onClick={() => void confirm()} disabled={busy}>{busy ? <span className="button-spinner" /> : deleting ? <Trash2 size={16} /> : activating ? <UserCheck size={16} /> : <UserX size={16} />}{deleting ? "Eliminar definitivamente" : activating ? "Activar acceso" : "Desactivar acceso"}</button></footer>
      </motion.section>
    </motion.div>
  );
}
