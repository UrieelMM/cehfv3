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
  FolderOpen,
  Headphones,
  LibraryBig,
  LoaderCircle,
  LockKeyhole,
  MonitorSmartphone,
  Paperclip,
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
import { friendlyFirebaseError } from "@/lib/firebase";
import {
  deleteWorkshopResource,
  demoWorkshops,
  ensureDefaultWorkshops,
  getWorkshopResourceUrl,
  updateWorkshopAccess,
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
  WorkshopResource,
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

function resourceIcon(resource: WorkshopResource) {
  if (resource.contentType.startsWith("image/")) return FileImage;
  if (resource.contentType.startsWith("audio/")) return Headphones;
  if (resource.contentType.startsWith("video/")) return Video;
  if (resource.contentType.includes("zip")) return FileArchive;
  return FileText;
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
  const [baseWorkshops, setBaseWorkshops] = useState<Workshop[]>(() =>
    firebaseReady ? [] : demoWorkshops,
  );
  const [resourcesByWorkshop, setResourcesByWorkshop] = useState<
    Record<string, WorkshopResource[]>
  >({});
  const [selectedId, setSelectedId] = useState<string | null>(workshopFromPath);
  const [loading, setLoading] = useState(firebaseReady);
  const [accessWorkshop, setAccessWorkshop] = useState<Workshop | null>(null);
  const [uploadWorkshop, setUploadWorkshop] = useState<Workshop | null>(null);
  const initializedRef = useRef(false);

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
      const saved = window.localStorage.getItem("cehf-demo-workshops");
      if (saved) {
        try {
          const restored = JSON.parse(saved) as Workshop[];
          if (Array.isArray(restored)) queueMicrotask(() => setBaseWorkshops(restored));
        } catch {
          window.localStorage.removeItem("cehf-demo-workshops");
        }
      }
      queueMicrotask(() => setLoading(false));
      return;
    }

    let unsubscribe = () => undefined;
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
    window.history.pushState({}, "", "/workshops");
    setSelectedId(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveAccess(workshop: Workshop, access: WorkshopAccessInput) {
    if (firebaseReady) {
      await updateWorkshopAccess(workshop, access, profile);
    } else {
      setBaseWorkshops((current) => {
        const next = current.map((item) =>
          item.id === workshop.id
            ? {
                ...item,
                ...access,
                memberIds: [...new Set([...access.studentIds, ...access.teacherIds])],
                updatedAt: new Date().toISOString(),
              }
            : item,
        );
        window.localStorage.setItem("cehf-demo-workshops", JSON.stringify(next));
        return next;
      });
    }
  }

  async function uploadResource(
    workshop: Workshop,
    input: { title: string; description: string; file: File },
  ) {
    if (firebaseReady) {
      await uploadWorkshopResource(workshop, profile, input);
      return;
    }
    const resource: WorkshopResource = {
      id: `demo-${Date.now()}`,
      workshopId: workshop.id,
      institutionId: profile.institutionId,
      title: input.title,
      description: input.description,
      fileName: input.file.name,
      storagePath: "",
      contentType: input.file.type || "application/octet-stream",
      size: input.file.size,
      uploadedBy: profile.uid,
      uploadedByName: profile.name,
      createdAt: new Date().toISOString(),
    };
    setBaseWorkshops((current) => {
      const next = current.map((item) =>
        item.id === workshop.id
          ? { ...item, resources: [resource, ...item.resources] }
          : item,
      );
      window.localStorage.setItem("cehf-demo-workshops", JSON.stringify(next));
      return next;
    });
  }

  async function removeResource(resource: WorkshopResource) {
    if (firebaseReady) {
      await deleteWorkshopResource(resource);
      return;
    }
    setBaseWorkshops((current) => {
      const next = current.map((item) =>
        item.id === resource.workshopId
          ? {
              ...item,
              resources: item.resources.filter((entry) => entry.id !== resource.id),
            }
          : item,
      );
      window.localStorage.setItem("cehf-demo-workshops", JSON.stringify(next));
      return next;
    });
  }

  async function openResource(resource: WorkshopResource) {
    if (!firebaseReady) {
      toast.info("En Firebase, este botón abrirá el archivo guardado en Storage.");
      return;
    }
    try {
      const url = await getWorkshopResourceUrl(resource);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  if (loading) {
    return (
      <div className="workshops-loading" role="status">
        <LoaderCircle size={25} />
        <strong>Abriendo los talleres…</strong>
        <span>Estamos preparando los espacios y sus recursos.</span>
      </div>
    );
  }

  if (selected) {
    const canManage =
      role === "director" || selected.managerIds.includes(profile.uid);
    return (
      <>
        <WorkshopDetail
          workshop={selected}
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
            <strong>Acceso cuidado</strong>
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
  canManage,
  isDirector,
  onBack,
  onManageAccess,
  onUpload,
  onOpenResource,
  onDeleteResource,
}: {
  workshop: Workshop;
  canManage: boolean;
  isDirector: boolean;
  onBack: () => void;
  onManageAccess: () => void;
  onUpload: () => void;
  onOpenResource: (resource: WorkshopResource) => void;
  onDeleteResource: (resource: WorkshopResource) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const reading = workshop.kind === "reading";
  const filteredResources = workshop.resources.filter((resource) =>
    [resource.title, resource.description, resource.fileName]
      .join(" ")
      .toLocaleLowerCase("es-MX")
      .includes(query.trim().toLocaleLowerCase("es-MX")),
  );

  async function remove(resource: WorkshopResource) {
    if (!window.confirm(`¿Eliminar “${resource.title}”?`)) return;
    setDeletingId(resource.id);
    try {
      await onDeleteResource(resource);
      toast.success("Recurso eliminado");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className={`workshop-detail is-${workshop.kind}`}>
      <button className="workshop-back" onClick={onBack}>
        <ArrowLeft size={17} /> Todos los talleres
      </button>

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
            Puedes subir y retirar recursos. Sólo Dirección cambia participantes y administradores.
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
              return (
                <article className="workshop-resource-card" key={resource.id}>
                  <button
                    className="workshop-resource-main"
                    onClick={() => onOpenResource(resource)}
                  >
                    <span className="workshop-resource-icon"><Icon size={22} /></span>
                    <span className="workshop-resource-copy">
                      <small>{resource.fileName}</small>
                      <strong>{resource.title}</strong>
                      <p>{resource.description || "Material disponible para el taller."}</p>
                    </span>
                    <ChevronRight size={18} />
                  </button>
                  <footer>
                    <span>{fileSize(resource.size)} · {resourceDate(resource.createdAt)}</span>
                    <span>Por {resource.uploadedByName}</span>
                    <div>
                      <button onClick={() => onOpenResource(resource)} aria-label="Abrir recurso">
                        <Download size={15} />
                      </button>
                      {canManage && (
                        <button
                          className="is-danger"
                          disabled={deletingId === resource.id}
                          onClick={() => void remove(resource)}
                          aria-label="Eliminar recurso"
                        >
                          {deletingId === resource.id ? (
                            <LoaderCircle className="spin" size={15} />
                          ) : (
                            <Trash2 size={15} />
                          )}
                        </button>
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
    </div>
  );
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
      return;
    }
    setTeacherIds((current) => {
      const removing = current.includes(account.uid);
      if (removing) {
        setManagerIds((managers) => managers.filter((id) => id !== account.uid));
        return current.filter((id) => id !== account.uid);
      }
      return [...current, account.uid];
    });
  }

  function toggleManager(account: ManagedAccount) {
    setTeacherIds((current) =>
      current.includes(account.uid) ? current : [...current, account.uid],
    );
    setManagerIds((current) =>
      current.includes(account.uid)
        ? current.filter((id) => id !== account.uid)
        : [...current, account.uid],
    );
  }

  async function submit() {
    setSaving(true);
    try {
      await onSave(workshop, { studentIds, teacherIds, managerIds });
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
            <p>Elige participantes y docentes administradores.</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar"><X size={20} /></button>
        </header>

        <div className="workshop-access-summary">
          <span><strong>{studentIds.length}</strong> alumnos</span>
          <span><strong>{teacherIds.length}</strong> maestros</span>
          <span><strong>{managerIds.length}</strong> administradores</span>
        </div>

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
          {visible.length ? visible.map((account) => {
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
                  <button
                    className={`workshop-manager-toggle ${manager ? "active" : ""}`}
                    onClick={() => toggleManager(account)}
                    aria-pressed={manager}
                  >
                    <UserRoundCog size={15} />
                    {manager ? "Administra recursos" : "Hacer administrador"}
                  </button>
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
    input: { title: string; description: string; file: File },
  ) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !file) {
      toast.error("Agrega un título y selecciona un archivo.");
      return;
    }
    if (file.size >= 20 * 1024 * 1024) {
      toast.error("El archivo debe pesar menos de 20 MB.");
      return;
    }
    setUploading(true);
    try {
      await onUpload(workshop, { title: title.trim(), description: description.trim(), file });
      toast.success("Recurso publicado", {
        description: "Los participantes recibirán una notificación.",
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
          <label>
            <span>Descripción <small>Opcional</small></span>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={280} rows={3} placeholder="Cuenta brevemente para qué sirve este material…" />
          </label>
          <label className={`workshop-file-drop ${file ? "has-file" : ""}`}>
            <input
              type="file"
              accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,.zip,image/*,audio/*,video/*"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              required
            />
            {file ? <Paperclip size={25} /> : <UploadCloud size={28} />}
            <strong>{file ? file.name : "Selecciona o arrastra un archivo"}</strong>
            <small>{file ? fileSize(file.size) : "Documentos, imágenes, audio o video · máximo 20 MB"}</small>
          </label>
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
