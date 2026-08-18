"use client";

import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  FileBarChart,
  FileText,
  GraduationCap,
  Heart,
  Home,
  Eye,
  EyeOff,
  LayoutDashboard,
  Library,
  LockKeyhole,
  LogIn,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  Moon,
  MoreHorizontal,
  Newspaper,
  Pencil,
  Plus,
  Quote,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast, Toaster } from "sonner";
import type { User } from "firebase/auth";
import { ForumPage } from "@/components/forum-page";
import {
  createFirstDirector,
  firebaseConfigured,
  friendlyFirebaseError,
  getProfile,
  loadPortalState,
  loginWithEmail,
  logoutFirebase,
  resetPassword,
  savePortalState,
  watchAuth,
} from "@/lib/firebase";
import {
  createDemoState,
  demoProfiles,
  roleLabel,
  subjectColors,
} from "@/lib/demo-data";
import type {
  ForumTopic,
  ForumTopicKind,
  PortalState,
  ProgressLevel,
  Role,
  SectionKey,
  UserProfile,
  WallPost,
} from "@/lib/types";

type IconType = typeof Home;

type ForumDraftDetails = {
  prompt: string;
  group: string;
  forumName: string;
  kind: ForumTopicKind;
  status: ForumTopic["status"];
  opensAt: string;
  closesAt: string;
  allowReplies: boolean;
  allowAttachments: boolean;
};

const routes: Record<SectionKey, string> = {
  dashboard: "/dashboard",
  "my-week": "/my-week",
  "weekly-review": "/weekly-review",
  tasks: "/tasks",
  "weekly-progress": "/weekly-progress",
  reports: "/reports",
  "weekly-materials": "/weekly-materials",
  "wall-newspaper": "/wall-newspaper",
  forum: "/forum",
  users: "/users",
  settings: "/settings",
  profile: "/profile",
};

const sectionFromPath = (path: string): SectionKey => {
  const name = path.split("/").filter(Boolean)[0] as SectionKey | undefined;
  if (!name || name === ("login" as SectionKey)) return "dashboard";
  return name in routes ? name : "dashboard";
};

const navigation: Array<{
  key: SectionKey;
  label: string;
  icon: IconType;
  roles?: Role[];
}> = [
  { key: "dashboard", label: "Inicio", icon: LayoutDashboard },
  { key: "my-week", label: "Mi semana", icon: CalendarDays },
  { key: "weekly-review", label: "Repasos", icon: BookOpen },
  { key: "tasks", label: "Tareas", icon: ClipboardCheck },
  { key: "weekly-progress", label: "Mi avance", icon: Target },
  { key: "reports", label: "Reportes", icon: FileBarChart },
  { key: "weekly-materials", label: "Materiales", icon: Library },
  { key: "wall-newspaper", label: "Periódico mural", icon: Newspaper },
  { key: "forum", label: "Foro", icon: MessageCircle },
  {
    key: "users",
    label: "Comunidad",
    icon: Users,
    roles: ["director", "teacher"],
  },
];

const pageTitles: Record<SectionKey, { eyebrow: string; title: string }> = {
  dashboard: { eyebrow: "Semana 7 · 20–24 de julio", title: "Buenos días" },
  "my-week": { eyebrow: "Planeación semanal", title: "Mi semana" },
  "weekly-review": { eyebrow: "Práctica breve", title: "Repasos" },
  tasks: { eyebrow: "Actividades y entregas", title: "Tareas" },
  "weekly-progress": {
    eyebrow: "Evidencias y próximos pasos",
    title: "Avance semanal",
  },
  reports: { eyebrow: "Seguimiento con contexto", title: "Reportes" },
  "weekly-materials": {
    eyebrow: "Recursos organizados",
    title: "Materiales de la semana",
  },
  "wall-newspaper": {
    eyebrow: "Historias de nuestra comunidad",
    title: "Periódico mural",
  },
  forum: { eyebrow: "Conversaciones guiadas", title: "Foro" },
  users: { eyebrow: "Personas y asignaciones", title: "Comunidad escolar" },
  settings: { eyebrow: "Preferencias del portal", title: "Configuración" },
  profile: { eyebrow: "Tu espacio", title: "Perfil" },
};

const progressLabels: Record<
  ProgressLevel,
  { label: string; className: string }
> = {
  achieved: { label: "Logrado", className: "status-achieved" },
  in_progress: { label: "En proceso", className: "status-progress" },
  needs_support: {
    label: "Necesita acompañamiento",
    className: "status-support",
  },
  not_observed: {
    label: "Aún no observado",
    className: "status-neutral",
  },
};

export function CEHFApp() {
  const [activeSection, setActiveSection] = useState<SectionKey>(() =>
    typeof window === "undefined"
      ? "dashboard"
      : sectionFromPath(window.location.pathname),
  );
  const [authReady, setAuthReady] = useState(!firebaseConfigured);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [demoRole, setDemoRole] = useState<Role>("student");
  const [demoStarted, setDemoStarted] = useState(false);
  const [state, setState] = useState<PortalState>(createDemoState);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState<string | null>(null);
  const [mobileMore, setMobileMore] = useState(false);
  const [systemPrefersDark, setSystemPrefersDark] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const currentProfile = profile ?? demoProfiles[demoRole];
  const usingDemo = !firebaseUser;
  const role = currentProfile.role;
  const unread = state.notifications.filter((item) => !item.read).length;
  const darkModeActive =
    state.settings.theme === "dark" ||
    (state.settings.theme === "system" && systemPrefersDark);

  useEffect(() => {
    const onPopState = () =>
      setActiveSection(sectionFromPath(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    const saved = window.localStorage.getItem("cehf-demo-state");
    if (saved) {
      try {
        const restored = JSON.parse(saved) as PortalState;
        const defaults = createDemoState();
        const hasCurrentForumModel = restored.forumTopics?.some(
          (topic) => "forumId" in topic && "allowReplies" in topic,
        );
        const migratedWallPosts = (restored.wallPosts ?? defaults.wallPosts).map(
          (post) => {
            const editorial = defaults.wallPosts.find(
              (defaultPost) => defaultPost.id === post.id,
            );
            return {
              ...editorial,
              ...post,
              section: post.section ?? editorial?.section,
              lead: post.lead ?? editorial?.lead,
              paragraphs: post.paragraphs ?? editorial?.paragraphs,
              quote: post.quote ?? editorial?.quote,
              readingTime: post.readingTime ?? editorial?.readingTime,
            };
          },
        );
        const migrated = hasCurrentForumModel
          ? {
              ...defaults,
              ...restored,
              weeklyVerse: restored.weeklyVerse ?? defaults.weeklyVerse,
              wallPosts: migratedWallPosts,
              forumModeration:
                restored.forumModeration ?? defaults.forumModeration,
            }
          : {
              ...defaults,
              ...restored,
              weeklyVerse: restored.weeklyVerse ?? defaults.weeklyVerse,
              wallPosts: migratedWallPosts,
              forumTopics: defaults.forumTopics,
              forumModeration: defaults.forumModeration,
            };
        window.localStorage.setItem(
          "cehf-demo-state",
          JSON.stringify(migrated),
        );
        queueMicrotask(() => setState(migrated));
      } catch {
        window.localStorage.removeItem("cehf-demo-state");
      }
    }
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      void navigator.serviceWorker.register("/sw.js");
    }
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!firebaseConfigured) return;
    return watchAuth(async (user) => {
      setFirebaseUser(user);
      if (!user) {
        setProfile(null);
        setAuthReady(true);
        return;
      }
      try {
        const nextProfile = await getProfile(user);
        setProfile(nextProfile);
        if (nextProfile) {
          setState(await loadPortalState(nextProfile));
        }
      } catch (error) {
        toast.error(friendlyFirebaseError(error));
      } finally {
        setAuthReady(true);
      }
    });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = state.settings.theme;
    document.documentElement.classList.toggle(
      "reduce-motion",
      state.settings.reducedMotion,
    );
  }, [state.settings]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncPreference = () => setSystemPrefersDark(media.matches);
    syncPreference();
    media.addEventListener("change", syncPreference);
    return () => media.removeEventListener("change", syncPreference);
  }, []);

  function navigate(section: SectionKey) {
    window.history.pushState({}, "", routes[section]);
    setActiveSection(section);
    setSidebarOpen(false);
    setMobileMore(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateState(
    updater: (previous: PortalState) => PortalState,
    successMessage?: string,
  ) {
    setState((previous) => {
      const next = updater(previous);
      if (usingDemo) {
        window.localStorage.setItem("cehf-demo-state", JSON.stringify(next));
      } else if (profile) {
        void savePortalState(next, profile).catch((error) =>
          toast.error(friendlyFirebaseError(error)),
        );
      }
      return next;
    });
    if (successMessage) toast.success(successMessage);
  }

  function toggleTheme() {
    updateState((previous) => ({
      ...previous,
      settings: {
        ...previous.settings,
        theme: darkModeActive ? "light" : "dark",
      },
    }));
  }

  if (!authReady) return <LoadingScreen />;

  if (!demoStarted && !firebaseUser) {
    return (
      <LoginScreen
        configured={firebaseConfigured}
        onDemo={() => setDemoStarted(true)}
      />
    );
  }

  if (firebaseUser && !profile) {
    return (
      <GuidedState
        icon={ShieldCheck}
        title="Tu cuenta necesita una asignación"
        description="La cuenta existe, pero todavía no tiene un perfil de CEHF Primaria. Pide a Dirección que complete tu rol y grupo."
        actionLabel="Cerrar sesión"
        onAction={() => void logoutFirebase()}
      />
    );
  }

  const visibleNavigation = navigation.filter(
    (item) => !item.roles || item.roles.includes(role),
  );
  const title = pageTitles[activeSection];

  return (
    <div className="app-shell">
      <Toaster position="top-center" richColors closeButton />
      <div
        className={`sidebar-backdrop ${sidebarOpen ? "is-open" : ""}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />
      <aside className={`sidebar ${sidebarOpen ? "is-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <span>CE</span>
          </div>
          <div>
            <strong>CEHF</strong>
            <span>Primaria</span>
          </div>
        </div>
        <div className="week-switcher">
          <div>
            <span>Semana activa</span>
            <strong>{state.week.label}</strong>
          </div>
          <ChevronDown size={16} aria-hidden="true" />
        </div>
        <nav className="sidebar-nav" aria-label="Navegación principal">
          <span className="nav-kicker">Tu portal</span>
          {visibleNavigation.map((item) => (
            <button
              className={activeSection === item.key ? "active" : ""}
              key={item.key}
              onClick={() => navigate(item.key)}
            >
              <item.icon size={19} aria-hidden="true" />
              <span>{item.label}</span>
              {item.key === "tasks" && role === "student" && (
                <span className="nav-count">1</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button
            className={activeSection === "settings" ? "active" : ""}
            onClick={() => navigate("settings")}
          >
            <Settings size={19} aria-hidden="true" />
            Configuración
          </button>
          <button
            className={activeSection === "profile" ? "active" : ""}
            onClick={() => navigate("profile")}
          >
            <UserRound size={19} aria-hidden="true" />
            Perfil
          </button>
          {usingDemo && (
            <div className="demo-switcher">
              <span>Vista de demostración</span>
              <select
                aria-label="Cambiar rol de demostración"
                value={demoRole}
                onChange={(event) => {
                  setDemoRole(event.target.value as Role);
                  toast.info(
                    `Ahora estás viendo el portal como ${roleLabel[event.target.value as Role].toLowerCase()}.`,
                  );
                }}
              >
                <option value="student">Estudiante</option>
                <option value="teacher">Docente</option>
                <option value="director">Dirección</option>
              </select>
            </div>
          )}
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <button
            className="icon-button menu-button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menú"
          >
            <Menu size={21} />
          </button>
          <div className="search">
            <Search size={18} aria-hidden="true" />
            <input
              aria-label="Buscar en el portal"
              placeholder="Buscar tareas, materiales o temas…"
            />
            <kbd>⌘ K</kbd>
          </div>
          <div className="topbar-actions">
            {usingDemo && <span className="demo-badge">Demo</span>}
            <button
              type="button"
              className={`theme-switch ${darkModeActive ? "is-dark" : ""}`}
              onClick={toggleTheme}
              role="switch"
              aria-checked={darkModeActive}
              aria-label={
                darkModeActive
                  ? "Cambiar a modo claro"
                  : "Cambiar a modo oscuro"
              }
              title={darkModeActive ? "Modo claro" : "Modo oscuro"}
            >
              <motion.span
                className="theme-switch-thumb"
                animate={{ x: darkModeActive ? 26 : 0 }}
                transition={
                  state.settings.reducedMotion || prefersReducedMotion
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 520, damping: 30 }
                }
                aria-hidden="true"
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={darkModeActive ? "moon" : "sun"}
                    initial={{ opacity: 0, rotate: -70, scale: 0.55 }}
                    animate={{ opacity: 1, rotate: 0, scale: 1 }}
                    exit={{ opacity: 0, rotate: 70, scale: 0.55 }}
                    transition={{
                      duration:
                        state.settings.reducedMotion || prefersReducedMotion
                          ? 0
                          : 0.18,
                    }}
                  >
                    {darkModeActive ? <Moon size={15} /> : <Sun size={15} />}
                  </motion.span>
                </AnimatePresence>
              </motion.span>
            </button>
            <div className="notification-wrap">
              <button
                className="icon-button"
                onClick={() => setNotificationsOpen((open) => !open)}
                aria-label={`Notificaciones, ${unread} sin leer`}
                aria-expanded={notificationsOpen}
              >
                <Bell size={20} />
                {unread > 0 && <span className="notification-dot">{unread}</span>}
              </button>
              <AnimatePresence>
                {notificationsOpen && (
                  <NotificationPanel
                    state={state}
                    onClose={() => setNotificationsOpen(false)}
                    onMarkAll={() =>
                      updateState(
                        (previous) => ({
                          ...previous,
                          notifications: previous.notifications.map((item) => ({
                            ...item,
                            read: true,
                          })),
                        }),
                        "Notificaciones marcadas como leídas",
                      )
                    }
                  />
                )}
              </AnimatePresence>
            </div>
            <button className="profile-chip" onClick={() => navigate("profile")}>
              <span className="avatar">{currentProfile.initials}</span>
              <span className="profile-copy">
                <strong>{currentProfile.name.split(" ")[0]}</strong>
                <small>{roleLabel[role]}</small>
              </span>
              <ChevronDown size={15} aria-hidden="true" />
            </button>
          </div>
        </header>

        <main className="content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">{title.eyebrow}</span>
              <h1>
                {title.title}
                {activeSection === "dashboard"
                  ? `, ${currentProfile.name.split(" ")[0]}`
                  : ""}
              </h1>
            </div>
            {["teacher", "director"].includes(role) &&
              [
                "my-week",
                "weekly-review",
                "tasks",
                "weekly-materials",
                "wall-newspaper",
                "forum",
                "users",
              ].includes(activeSection) && (
                <button
                  className="primary-button"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus size={18} />
                  {createLabel(activeSection)}
                </button>
              )}
          </div>

          <motion.div
            key={`${activeSection}-${role}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
          >
            <SectionContent
              section={activeSection}
              role={role}
              profile={currentProfile}
              state={state}
              navigate={navigate}
              updateState={updateState}
              openDetail={setDetailOpen}
            />
          </motion.div>
        </main>
      </div>

      <MobileNavigation
        active={activeSection}
        onNavigate={navigate}
        onMore={() => setMobileMore(true)}
      />

      <AnimatePresence>
        {mobileMore && (
          <MobileMore
            navigation={visibleNavigation}
            onClose={() => setMobileMore(false)}
            onNavigate={navigate}
          />
        )}
        {createOpen && (
          <CreateModal
            section={activeSection}
            onClose={() => setCreateOpen(false)}
            onCreate={(titleValue, subject, forumDraft) => {
              const id = `${activeSection}-${Date.now()}`;
              updateState((previous) => {
                if (activeSection === "tasks") {
                  return {
                    ...previous,
                    tasks: [
                      {
                        id,
                        title: titleValue,
                        subject,
                        description:
                          "Actividad creada desde el portal. Añade instrucciones antes de publicar.",
                        dueLabel: "Viernes, 20:00",
                        dueAt: new Date().toISOString(),
                        status: "draft",
                        type: "Actividad",
                        objective: previous.week.objectives[0],
                      },
                      ...previous.tasks,
                    ],
                  };
                }
                if (activeSection === "weekly-materials") {
                  return {
                    ...previous,
                    materials: [
                      {
                        id,
                        title: titleValue,
                        subject,
                        description: "Recurso listo para completar y programar.",
                        type: "Enlace",
                        day: "Viernes",
                        required: false,
                        reviewed: false,
                      },
                      ...previous.materials,
                    ],
                  };
                }
                if (activeSection === "weekly-review") {
                  return {
                    ...previous,
                    reviews: [
                      {
                        id,
                        title: titleValue,
                        subject,
                        purpose: "Practicar",
                        duration: 8,
                        questions: 0,
                        progress: 0,
                        attempts: 2,
                        status: "draft",
                      },
                      ...previous.reviews,
                    ],
                  };
                }
                if (activeSection === "forum") {
                  const details = forumDraft ?? {
                    prompt:
                      "Escribe una consigna clara para iniciar la conversación.",
                    group: "5.º A",
                    forumName: `${subject} · 5.º A`,
                    kind: "subject" as const,
                    status: "open" as const,
                    opensAt: "Publicado ahora",
                    closesAt: "Sin fecha de cierre",
                    allowReplies: true,
                    allowAttachments: false,
                  };
                  return {
                    ...previous,
                    forumTopics: [
                      {
                        id,
                        forumId: `custom-${Date.now()}`,
                        forumName: details.forumName,
                        title: titleValue,
                        prompt: details.prompt,
                        kind: details.kind,
                        subject,
                        group: details.group,
                        responsible: currentProfile.name,
                        participants: [
                          currentProfile.name.split(" ")[0],
                          "Sofía",
                          "Diego",
                          "Emilia",
                        ],
                        opensAt: details.opensAt,
                        closesAt: details.closesAt,
                        status: details.status,
                        allowReplies: details.allowReplies,
                        allowAttachments: details.allowAttachments,
                        lastActivity:
                          details.status === "scheduled" ? "Programado" : "Ahora",
                        replies: [],
                      },
                      ...previous.forumTopics,
                    ],
                  };
                }
                if (activeSection === "wall-newspaper") {
                  return {
                    ...previous,
                    wallPosts: [
                      {
                        id,
                        title: titleValue,
                        excerpt:
                          "Borrador editorial listo para completar y enviar a revisión.",
                        category: subject,
                        author: currentProfile.name,
                        group: currentProfile.group ?? "Comunidad CEHF",
                        publishedAt: "Borrador",
                        accent: "violet",
                        status: "draft",
                        favorite: false,
                      },
                      ...previous.wallPosts,
                    ],
                  };
                }
                if (activeSection === "my-week") {
                  return {
                    ...previous,
                    week: {
                      ...previous.week,
                      id,
                      label: titleValue,
                      title: "Nueva planeación semanal",
                      status: "draft",
                      completion: 0,
                    },
                  };
                }
                return previous;
              },
              activeSection === "forum"
                ? forumDraft?.status === "scheduled"
                  ? "Conversación programada"
                  : "Conversación publicada"
                : "Borrador creado",
              );
              setCreateOpen(false);
            }}
          />
        )}
        {detailOpen && (
          <DetailDrawer
            itemId={detailOpen}
            state={state}
            onClose={() => setDetailOpen(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function LoginScreen({
  configured,
  onDemo,
}: {
  configured: boolean;
  onDemo: () => void;
}) {
  const [mode, setMode] = useState<"login" | "bootstrap">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    if (!configured) {
      setError(
        "El acceso institucional no está disponible en este entorno. Puedes explorar la demostración.",
      );
      return;
    }
    if (!email.trim() || !password || (mode === "bootstrap" && !name.trim())) {
      setError("Completa los datos solicitados para continuar.");
      return;
    }
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "bootstrap") {
        await createFirstDirector(name, email, password);
        toast.success("Portal inicializado. Ya puedes comenzar.");
      } else {
        await loginWithEmail(email, password, remember);
      }
    } catch (submitError) {
      setError(friendlyFirebaseError(submitError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Toaster position="top-center" richColors />
      <motion.div
        className="login-page"
        data-theme="light"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35 }}
      >
        <motion.section
        className="login-brand-panel"
        initial={{ x: -24 }}
        animate={{ x: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 0.8, 0.25, 1] }}
      >
        <div className="login-grid" />
        <div className="login-orb login-orb-a" />
        <div className="login-orb login-orb-b" />
        <div className="login-campus-scene" aria-hidden="true">
          <span className="login-campus-glow" />
          <span className="login-floating-leaf leaf-a" />
          <span className="login-floating-leaf leaf-b" />
          <span className="login-floating-leaf leaf-c" />
          <span className="login-floating-leaf leaf-d" />
          <span className="login-campus-caption">
            <i /> CAMPUS CEHF · IDEAS QUE CRECEN
          </span>
        </div>
        <div className="brand brand-light">
          <div className="brand-mark">
            <span>CE</span>
          </div>
          <div>
            <strong>CEHF</strong>
            <span>Primaria</span>
          </div>
        </div>
        <div className="login-message">
          <span className="glass-label">
            <Sparkles size={14} /> Una semana clara para aprender mejor
          </span>
          <h1>
            Tu escuela,
            <br />
            en movimiento.
          </h1>
          <p>
            Todo lo que necesitas para aprender, descubrir y compartir tus
            logros en Primaria.
          </p>
        </div>
        <div className="login-access-card">
          <span>
            <LockKeyhole size={18} />
          </span>
          <div>
            <strong>Acceso exclusivo CEHF</strong>
            <small>Estudiantes, maestros y Dirección</small>
          </div>
          <ShieldCheck size={18} />
        </div>
        <div className="login-testimonial">
          <p>
            “Aquí encuentro mis actividades y puedo ver todo lo que voy
            logrando.”
          </p>
          <span>— Comunidad CEHF Primaria</span>
        </div>
        </motion.section>

        <section className="login-form-panel">
          <motion.form
          onSubmit={handleSubmit}
          noValidate
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.45 }}
          aria-busy={busy || resetting}
        >
          <div className="mobile-login-brand">
            <div className="brand">
              <div className="brand-mark">
                <span>CE</span>
              </div>
              <div>
                <strong>CEHF</strong>
                <span>Primaria</span>
              </div>
            </div>
          </div>
          <span className="login-kicker">
            <span />
            {mode === "login" ? "ACCESO INSTITUCIONAL" : "PRIMER ACCESO"}
          </span>
          <h2>
            {mode === "login" ? "Qué bueno verte." : "Activa CEHF Primaria."}
          </h2>
          <p>
            {mode === "login"
              ? "Ingresa con la cuenta que Dirección creó para ti."
              : "Crea la primera cuenta de Dirección y prepara el portal."}
          </p>

          {(!configured || error) && (
            <div className="login-alert" role="alert">
              <AlertCircle size={17} />
              <span>
                {error ||
                  "El acceso institucional no está disponible en este entorno. Puedes explorar la demostración."}
              </span>
            </div>
          )}

          {mode === "bootstrap" && (
            <>
              <label className="login-field-label" htmlFor="login-name">
                Nombre completo
              </label>
              <div className="login-input-wrap">
                <UserRound size={17} />
                <input
                  id="login-name"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Alejandra Torres"
                  disabled={busy || resetting}
                  required
                />
              </div>
            </>
          )}

          <label className="login-field-label" htmlFor="login-email">
            Correo institucional
          </label>
          <div className="login-input-wrap">
            <Mail size={17} />
            <input
              id="login-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nombre@cehf.edu.mx"
              disabled={busy || resetting}
              aria-invalid={Boolean(error)}
              required
            />
          </div>

          <label className="login-field-label" htmlFor="login-password">
            Contraseña
          </label>
          <div className="login-input-wrap login-password-field">
            <LockKeyhole size={17} />
            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Al menos 8 caracteres"
              minLength={8}
              disabled={busy || resetting}
              aria-invalid={Boolean(error)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((show) => !show)}
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>

          {mode === "login" && (
            <div className="login-options">
              <label>
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                  disabled={busy || resetting}
                />
                Mantener mi sesión
              </label>
              <button
                type="button"
                disabled={busy || resetting || !configured}
                onClick={async () => {
                  if (!email.trim()) {
                    setError("Escribe primero tu correo institucional.");
                    return;
                  }
                  setResetting(true);
                  setError("");
                  try {
                    await resetPassword(email.trim());
                    toast.success("Revisa tu correo", {
                      description:
                        "Te enviamos instrucciones para recuperar el acceso.",
                    });
                  } catch (resetError) {
                    setError(friendlyFirebaseError(resetError));
                  } finally {
                    setResetting(false);
                  }
                }}
              >
                {resetting ? "Enviando…" : "¿Olvidaste tu contraseña?"}
              </button>
            </div>
          )}

          <button
            className="login-button"
            type="submit"
            disabled={busy || resetting || !configured}
          >
            {busy ? <span className="button-spinner" /> : <LogIn size={17} />}
            {busy
              ? "Verificando acceso…"
              : mode === "login"
                ? "Entrar a CEHF"
                : "Crear portal"}
          </button>

          <button
            type="button"
            className="text-button mode-button"
            onClick={() => {
              setError("");
              setMode((current) =>
                current === "login" ? "bootstrap" : "login",
              );
            }}
          >
            {mode === "login"
              ? "¿Es la primera vez? Activar portal"
              : "Ya existe una cuenta · Iniciar sesión"}
          </button>

          <div className="demo-divider">
            <span>o</span>
          </div>
          <button
            className="secondary-button demo-button"
            type="button"
            onClick={onDemo}
          >
            <Sparkles size={18} />
            Explorar la demostración
          </button>
          <div className="login-security">
            <ShieldCheck size={15} /> Acceso cifrado y protegido por Firebase
          </div>
          <p className="login-help">
            ¿Aún no tienes cuenta? Solicítala directamente en Dirección.
          </p>
          </motion.form>
        </section>
      </motion.div>
    </>
  );
}

function SectionContent({
  section,
  role,
  profile,
  state,
  navigate,
  updateState,
  openDetail,
}: {
  section: SectionKey;
  role: Role;
  profile: UserProfile;
  state: PortalState;
  navigate: (section: SectionKey) => void;
  updateState: (
    updater: (previous: PortalState) => PortalState,
    message?: string,
  ) => void;
  openDetail: (id: string) => void;
}) {
  switch (section) {
    case "dashboard":
      return (
        <Dashboard
          role={role}
          profile={profile}
          state={state}
          navigate={navigate}
          updateState={updateState}
        />
      );
    case "my-week":
      return (
        <WeekPage
          role={role}
          state={state}
          navigate={navigate}
          updateState={updateState}
        />
      );
    case "weekly-review":
      return (
        <ReviewsPage
          role={role}
          state={state}
          updateState={updateState}
        />
      );
    case "tasks":
      return (
        <TasksPage
          role={role}
          state={state}
          updateState={updateState}
          openDetail={openDetail}
        />
      );
    case "weekly-progress":
      return (
        <ProgressPage
          role={role}
          state={state}
          updateState={updateState}
        />
      );
    case "reports":
      return (
        <ReportsPage
          role={role}
          state={state}
          updateState={updateState}
        />
      );
    case "weekly-materials":
      return (
        <MaterialsPage state={state} updateState={updateState} role={role} />
      );
    case "wall-newspaper":
      return (
        <WallPage state={state} updateState={updateState} role={role} />
      );
    case "forum":
      return (
        <ForumPage
          state={state}
          updateState={updateState}
          profile={profile}
          role={role}
        />
      );
    case "users":
      return <UsersPage role={role} />;
    case "settings":
      return (
        <SettingsPage state={state} updateState={updateState} role={role} />
      );
    case "profile":
      return <ProfilePage profile={profile} state={state} />;
    default:
      return null;
  }
}

function Dashboard({
  role,
  profile,
  state,
  navigate,
  updateState,
}: {
  role: Role;
  profile: UserProfile;
  state: PortalState;
  navigate: (section: SectionKey) => void;
  updateState: (
    updater: (previous: PortalState) => PortalState,
    message?: string,
  ) => void;
}) {
  if (role !== "student") {
    const director = role === "director";
    return (
      <div className="dashboard-stack">
        <WeeklyVerseCard
          role={role}
          profile={profile}
          state={state}
          updateState={updateState}
        />
        <section className="hero-card teacher-hero">
          <div className="hero-copy">
            <span className="pill pill-light">
              <span className="live-dot" /> Semana activa
            </span>
            <h2>
              {director
                ? "La primaria avanza con una semana bien preparada."
                : "Tu semana está casi lista para el grupo."}
            </h2>
            <p>
              {director
                ? "Consulta la preparación, los pendientes y las señales que necesitan atención."
                : "Revisa los últimos detalles y acompaña las evidencias que faltan."}
            </p>
            <button
              className="light-button"
              onClick={() => navigate("my-week")}
            >
              {director ? "Ver resumen institucional" : "Continuar planeación"}
              <ArrowRight size={17} />
            </button>
          </div>
          <div className="hero-metric">
            <ProgressRing value={director ? 84 : 78} />
            <span>Preparación semanal</span>
          </div>
        </section>
        <section className="metric-grid">
          {[
            {
              icon: ClipboardCheck,
              value: director ? "128" : "7",
              label: director ? "Entregas esta semana" : "Tareas por revisar",
              tone: "coral",
            },
            {
              icon: BookOpen,
              value: director ? "91%" : "4",
              label: director ? "Repasos completados" : "Respuestas abiertas",
              tone: "violet",
            },
            {
              icon: FileBarChart,
              value: director ? "18" : "6",
              label: "Reportes pendientes",
              tone: "gold",
            },
            {
              icon: MessageCircle,
              value: director ? "2" : "1",
              label: "Casos de moderación",
              tone: "mint",
            },
          ].map((metric) => (
            <article className="metric-card" key={metric.label}>
              <span className={`metric-icon ${metric.tone}`}>
                <metric.icon size={20} />
              </span>
              <strong>{metric.value}</strong>
              <p>{metric.label}</p>
            </article>
          ))}
        </section>
        <section className="two-column">
          <article className="panel">
            <PanelHeading
              title={director ? "Grupos esta semana" : "Prioridades de hoy"}
              action="Ver todo"
            />
            <div className="priority-list">
              {[
                {
                  title: director
                    ? "5.º A · Mariana López"
                    : "Revisar Bitácora de un cambio",
                  detail: director
                    ? "Planeación publicada · 78% de evidencias"
                    : "7 entregas nuevas",
                  status: "Ahora",
                },
                {
                  title: director
                    ? "4.º B · Roberto Díaz"
                    : "Completar avances semanales",
                  detail: director
                    ? "Falta publicar 1 repaso"
                    : "6 estudiantes pendientes",
                  status: "Hoy",
                },
                {
                  title: director
                    ? "3.º A · Elena Gómez"
                    : "Revisar propuesta del mural",
                  detail: director
                    ? "Semana lista · sin alertas"
                    : "1 publicación enviada",
                  status: "Mañana",
                },
              ].map((item, index) => (
                <button className="priority-row" key={item.title}>
                  <span className={`priority-number n${index + 1}`}>
                    {index + 1}
                  </span>
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.detail}</small>
                  </span>
                  <em>{item.status}</em>
                </button>
              ))}
            </div>
          </article>
          <article className="panel">
            <PanelHeading title="Actividad reciente" action="Abrir centro" />
            <Timeline notifications={state.notifications} />
          </article>
        </section>
      </div>
    );
  }

  const nextTask = state.tasks.find((task) => task.status === "published");
  const nextReview = state.reviews.find((review) => review.progress < 100);
  return (
    <div className="dashboard-stack">
      <WeeklyVerseCard
        role={role}
        profile={profile}
        state={state}
        updateState={updateState}
      />
      <section className="hero-card">
        <div className="hero-copy">
          <span className="pill pill-light">
            <span className="live-dot" /> En curso
          </span>
          <h2>{state.week.title}</h2>
          <p>{state.week.welcomeMessage}</p>
          <button
            className="light-button"
            onClick={() => navigate("my-week")}
          >
            Ver mi semana <ArrowRight size={17} />
          </button>
        </div>
        <div className="hero-metric">
          <ProgressRing value={state.week.completion} />
          <span>Tu camino semanal</span>
        </div>
      </section>

      <section className="today-section">
        <div className="section-title-row">
          <div>
            <span className="eyebrow">Para hoy</span>
            <h2>Un paso a la vez</h2>
          </div>
          <span className="date-chip">Jueves 23</span>
        </div>
        <div className="focus-grid">
          {nextReview && (
            <article className="focus-card violet-card">
              <div className="focus-card-top">
                <span className="subject-icon">
                  <BookOpen size={20} />
                </span>
                <span className="soft-tag">{nextReview.subject}</span>
              </div>
              <span className="card-kicker">Repaso recomendado</span>
              <h3>{nextReview.title}</h3>
              <p>{nextReview.duration} min · Puedes continuar donde te quedaste.</p>
              <div className="linear-progress">
                <span style={{ width: `${nextReview.progress}%` }} />
              </div>
              <button
                className="card-action"
                onClick={() =>
                  updateState(
                    (previous) => ({
                      ...previous,
                      reviews: previous.reviews.map((review) =>
                        review.id === nextReview.id
                          ? {
                              ...review,
                              progress: Math.min(100, review.progress + 50),
                              status:
                                review.progress + 50 >= 100
                                  ? "completed"
                                  : review.status,
                            }
                          : review,
                      ),
                    }),
                    "Tu avance quedó guardado",
                  )
                }
              >
                {nextReview.progress ? "Continuar repaso" : "Comenzar repaso"}
                <ArrowRight size={17} />
              </button>
            </article>
          )}
          {nextTask && (
            <article className="focus-card coral-card">
              <div className="focus-card-top">
                <span className="subject-icon">
                  <ClipboardCheck size={20} />
                </span>
                <span className="soft-tag">{nextTask.subject}</span>
              </div>
              <span className="card-kicker">Próxima entrega</span>
              <h3>{nextTask.title}</h3>
              <p>{nextTask.dueLabel} · Aún estás a tiempo.</p>
              <div className="due-line">
                <Clock3 size={16} /> Falta 1 día
              </div>
              <button
                className="card-action"
                onClick={() => navigate("tasks")}
              >
                Abrir tarea <ArrowRight size={17} />
              </button>
            </article>
          )}
          <article className="focus-card mint-card">
            <div className="focus-card-top">
              <span className="subject-icon">
                <Library size={20} />
              </span>
              <span className="soft-tag">Matemáticas</span>
            </div>
            <span className="card-kicker">Material nuevo</span>
            <h3>Fracciones en la cocina</h3>
            <p>Video de 4 minutos · Tiene transcripción.</p>
            <div className="due-line">
              <CheckCircle2 size={16} /> Recurso obligatorio
            </div>
            <button
              className="card-action"
              onClick={() => navigate("weekly-materials")}
            >
              Ver material <ArrowRight size={17} />
            </button>
          </article>
        </div>
      </section>

      <section className="two-column student-lower">
        <article className="panel">
          <PanelHeading title="Así vas esta semana" action="Ver mi avance" />
          <div className="mini-progress-list">
            {state.progress.slice(0, 3).map((criterion) => (
              <div key={criterion.id}>
                <span className={`status-dot ${criterion.level}`} />
                <div>
                  <strong>{criterion.label}</strong>
                  <small>{criterion.detail}</small>
                </div>
                <span
                  className={`status-tag ${progressLabels[criterion.level].className}`}
                >
                  {progressLabels[criterion.level].label}
                </span>
              </div>
            ))}
          </div>
        </article>
        <article className="panel editorial-card">
          <span className="eyebrow">Desde el periódico</span>
          <div className="editorial-art" aria-hidden="true">
            <span className="leaf leaf-a" />
            <span className="leaf leaf-b" />
            <span className="sun-shape" />
          </div>
          <h3>{state.wallPosts[0]?.title}</h3>
          <p>{state.wallPosts[0]?.excerpt}</p>
          <button className="text-link" onClick={() => navigate("wall-newspaper")}>
            Leer historia <ArrowRight size={16} />
          </button>
        </article>
      </section>
    </div>
  );
}

function WeeklyVerseCard({
  role,
  profile,
  state,
  updateState,
}: {
  role: Role;
  profile: UserProfile;
  state: PortalState;
  updateState: (
    updater: (previous: PortalState) => PortalState,
    message?: string,
  ) => void;
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const canEdit = role === "teacher" || role === "director";

  return (
    <>
      <section className="weekly-verse" aria-labelledby="weekly-verse-title">
        <div className="weekly-verse-icon" aria-hidden="true">
          <Quote size={24} />
        </div>
        <div className="weekly-verse-copy">
          <span className="eyebrow">Versículo bíblico de la semana</span>
          <blockquote id="weekly-verse-title">
            “{state.weeklyVerse.text}”
          </blockquote>
          <div className="weekly-verse-meta">
            <cite>{state.weeklyVerse.reference}</cite>
            <span aria-hidden="true">·</span>
            <span>Establecido por {state.weeklyVerse.updatedBy}</span>
          </div>
        </div>
        {canEdit && (
          <button
            className="secondary-button weekly-verse-edit"
            onClick={() => setEditorOpen(true)}
          >
            <Pencil size={16} />
            Editar versículo
          </button>
        )}
      </section>

      <AnimatePresence>
        {editorOpen && (
          <VerseEditorModal
            text={state.weeklyVerse.text}
            reference={state.weeklyVerse.reference}
            onClose={() => setEditorOpen(false)}
            onSave={(text, reference) => {
              updateState(
                (previous) => ({
                  ...previous,
                  weeklyVerse: {
                    text,
                    reference,
                    updatedBy: profile.name,
                    updatedAt: new Date().toISOString(),
                  },
                }),
                "Versículo semanal actualizado",
              );
              setEditorOpen(false);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function VerseEditorModal({
  text,
  reference,
  onClose,
  onSave,
}: {
  text: string;
  reference: string;
  onClose: () => void;
  onSave: (text: string, reference: string) => void;
}) {
  const [verseText, setVerseText] = useState(text);
  const [verseReference, setVerseReference] = useState(reference);
  const ready = Boolean(verseText.trim() && verseReference.trim());

  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.form
        className="modal verse-editor-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="verse-editor-title"
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) onSave(verseText.trim(), verseReference.trim());
        }}
      >
        <div className="modal-heading">
          <div>
            <span className="eyebrow">Mensaje para toda la comunidad</span>
            <h2 id="verse-editor-title">Versículo de la semana</h2>
          </div>
          <button
            className="plain-icon"
            type="button"
            onClick={onClose}
            aria-label="Cerrar editor"
          >
            <X size={20} />
          </button>
        </div>
        <label>
          Versículo
          <textarea
            autoFocus
            value={verseText}
            onChange={(event) => setVerseText(event.target.value)}
            placeholder="Escribe el texto del versículo"
            maxLength={300}
            rows={4}
            required
          />
          <small>{verseText.length}/300 caracteres</small>
        </label>
        <label>
          Referencia bíblica
          <input
            value={verseReference}
            onChange={(event) => setVerseReference(event.target.value)}
            placeholder="Ej. Filipenses 4:13"
            maxLength={80}
            required
          />
        </label>
        <div className="setup-note compact-note">
          <BookOpen size={19} />
          <p>Al guardar, el versículo aparecerá en el Inicio de todos los roles.</p>
        </div>
        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary-button" type="submit" disabled={!ready}>
            Guardar versículo
          </button>
        </div>
      </motion.form>
    </motion.div>
  );
}

function WeekPage({
  role,
  state,
  navigate,
  updateState,
}: {
  role: Role;
  state: PortalState;
  navigate: (section: SectionKey) => void;
  updateState: (
    updater: (previous: PortalState) => PortalState,
    message?: string,
  ) => void;
}) {
  return (
    <div className="week-layout">
      <section className="panel week-overview">
        <div className="week-header">
          <div>
            <span className="pill pill-active">Semana activa</span>
            <h2>{state.week.title}</h2>
            <p>{state.week.welcomeMessage}</p>
          </div>
          {role !== "student" && (
            <button
              className="secondary-button"
              onClick={() =>
                updateState(
                  (previous) => ({
                    ...previous,
                    week: {
                      ...previous.week,
                      status:
                        previous.week.status === "active" ? "draft" : "active",
                    },
                  }),
                  state.week.status === "active"
                    ? "Semana devuelta a borrador"
                    : "Semana publicada",
                )
              }
            >
              {state.week.status === "active"
                ? "Editar planeación"
                : "Publicar semana"}
            </button>
          )}
        </div>
        <div className="objective-block">
          <span className="eyebrow">Lo que aprenderemos</span>
          {state.week.objectives.map((objective, index) => (
            <div className="objective-row" key={objective}>
              <span>{index + 1}</span>
              <p>{objective}</p>
              {role !== "student" && <MoreHorizontal size={18} />}
            </div>
          ))}
        </div>
      </section>
      <section className="week-path">
        <div className="section-title-row compact">
          <div>
            <span className="eyebrow">Ruta sugerida</span>
            <h2>Tu semana, día por día</h2>
          </div>
        </div>
        {[
          {
            day: "Lun",
            title: "Observar y preguntar",
            detail: "Guía visual · Repaso de Ciencias",
            complete: true,
          },
          {
            day: "Mar",
            title: "Explicar con evidencias",
            detail: "Bitácora de un cambio",
            complete: true,
          },
          {
            day: "Mié",
            title: "Representar fracciones",
            detail: "Video · Reto de fracciones",
            complete: false,
          },
          {
            day: "Jue",
            title: "Leer para comprender",
            detail: "Audio y lectura · Repaso",
            complete: false,
          },
          {
            day: "Vie",
            title: "Cerrar y reconocer avances",
            detail: "Revisión de pendientes",
            complete: false,
          },
        ].map((day) => (
          <article className={`day-card ${day.complete ? "complete" : ""}`} key={day.day}>
            <span className="day-label">{day.day}</span>
            <div>
              <h3>{day.title}</h3>
              <p>{day.detail}</p>
            </div>
            {day.complete ? (
              <CheckCircle2 size={22} />
            ) : (
              <ArrowRight size={20} />
            )}
          </article>
        ))}
      </section>
      <aside className="week-side">
        <article className="panel">
          <span className="eyebrow">Contenido semanal</span>
          <div className="content-counts">
            {[
              {
                label: "Repasos",
                value: state.reviews.length,
                icon: BookOpen,
                section: "weekly-review" as SectionKey,
              },
              {
                label: "Tareas",
                value: state.tasks.length,
                icon: ClipboardCheck,
                section: "tasks" as SectionKey,
              },
              {
                label: "Materiales",
                value: state.materials.length,
                icon: Library,
                section: "weekly-materials" as SectionKey,
              },
            ].map((item) => (
              <button key={item.label} onClick={() => navigate(item.section)}>
                <item.icon size={19} />
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </button>
            ))}
          </div>
        </article>
        <article className="panel family-note">
          <span className="eyebrow">Para las familias</span>
          <h3>Acompañar sin resolver</h3>
          <p>
            Pregunten qué evidencia encontró y pídanle explicar su idea con un
            ejemplo cotidiano.
          </p>
          <span className="safe-note">
            <ShieldCheck size={16} /> Aviso listo para WhatsApp
          </span>
        </article>
      </aside>
    </div>
  );
}

function ReviewsPage({
  role,
  state,
  updateState,
}: {
  role: Role;
  state: PortalState;
  updateState: (
    updater: (previous: PortalState) => PortalState,
    message?: string,
  ) => void;
}) {
  const completed = state.reviews.filter((item) => item.progress === 100).length;
  return (
    <div>
      <section className="summary-strip">
        <div>
          <span className="summary-icon violet">
            <BookOpen size={21} />
          </span>
          <div>
            <strong>
              {role === "student"
                ? `${completed} de ${state.reviews.length} completados`
                : "84% del grupo participó"}
            </strong>
            <span>
              {role === "student"
                ? "Cada práctica te acerca a tus objetivos."
                : "4 respuestas cortas esperan revisión."}
            </span>
          </div>
        </div>
        <ProgressRing
          value={
            role === "student"
              ? Math.round((completed / state.reviews.length) * 100)
              : 84
          }
          small
        />
      </section>
      <div className="filter-row">
        <div className="filter-pills">
          <button className="active">Todos</button>
          <button>Pendientes</button>
          <button>Completados</button>
        </div>
        <button className="filter-button">
          <CalendarDays size={17} /> Esta semana
        </button>
      </div>
      <section className="card-list">
        {state.reviews.map((review) => (
          <article className="review-card" key={review.id}>
            <div className={`large-subject-icon ${subjectColors[review.subject] ?? "violet"}`}>
              <BookOpen size={24} />
            </div>
            <div className="list-card-copy">
              <div className="list-card-meta">
                <span>{review.subject}</span>
                <i>•</i>
                <span>{review.purpose}</span>
              </div>
              <h3>{review.title}</h3>
              <p>
                {review.questions} actividades · {review.duration} minutos ·{" "}
                {review.attempts} intento{review.attempts > 1 ? "s" : ""}
              </p>
              <div className="linear-progress">
                <span style={{ width: `${review.progress}%` }} />
              </div>
            </div>
            <div className="list-card-action">
              <span
                className={`status-tag ${
                  review.progress === 100 ? "status-achieved" : "status-progress"
                }`}
              >
                {review.progress === 100
                  ? "Completado"
                  : review.progress
                    ? `${review.progress}%`
                    : "Pendiente"}
              </span>
              <button
                className="secondary-button"
                onClick={() =>
                  updateState(
                    (previous) => ({
                      ...previous,
                      reviews: previous.reviews.map((item) =>
                        item.id === review.id
                          ? {
                              ...item,
                              progress:
                                role === "student"
                                  ? Math.min(100, item.progress + 50)
                                  : item.progress,
                              status:
                                role === "student" && item.progress + 50 >= 100
                                  ? "completed"
                                  : item.status,
                            }
                          : item,
                      ),
                    }),
                    role === "student"
                      ? "Respuesta guardada automáticamente"
                      : "Vista previa abierta",
                  )
                }
              >
                {role === "student"
                  ? review.progress
                    ? "Continuar"
                    : "Comenzar"
                  : "Vista previa"}
                <ArrowRight size={16} />
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

function TasksPage({
  role,
  state,
  updateState,
  openDetail,
}: {
  role: Role;
  state: PortalState;
  updateState: (
    updater: (previous: PortalState) => PortalState,
    message?: string,
  ) => void;
  openDetail: (id: string) => void;
}) {
  return (
    <div>
      <div className="filter-row">
        <div className="filter-pills">
          <button className="active">Todas</button>
          <button>Pendientes</button>
          <button>Entregadas</button>
          <button>Revisadas</button>
        </div>
        <div className="small-search">
          <Search size={17} />
          <input aria-label="Buscar tareas" placeholder="Buscar tarea…" />
        </div>
      </div>
      <section className="task-grid">
        {state.tasks.map((task) => {
          const completed = ["submitted", "under_review", "reviewed"].includes(
            task.status,
          );
          return (
            <article className="task-card" key={task.id}>
              <div className="task-card-top">
                <span className={`subject-line ${subjectColors[task.subject] ?? "violet"}`} />
                <div className="list-card-meta">
                  <span>{task.subject}</span>
                  <i>•</i>
                  <span>{task.type}</span>
                </div>
                <button className="plain-icon" aria-label="Más opciones">
                  <MoreHorizontal size={19} />
                </button>
              </div>
              <h3>{task.title}</h3>
              <p>{task.description}</p>
              <div className="task-objective">
                <Target size={16} />
                <span>{task.objective}</span>
              </div>
              <div className="task-footer">
                <span className={completed ? "success-copy" : "due-copy"}>
                  {completed ? <CheckCircle2 size={17} /> : <Clock3 size={17} />}
                  {completed
                    ? task.status === "under_review"
                      ? "En revisión"
                      : "Entregada"
                    : task.dueLabel}
                </span>
                <button
                  className={completed ? "secondary-button" : "primary-button"}
                  onClick={() => {
                    if (role === "student" && !completed) {
                      updateState(
                        (previous) => ({
                          ...previous,
                          tasks: previous.tasks.map((item) =>
                            item.id === task.id
                              ? { ...item, status: "submitted" }
                              : item,
                          ),
                        }),
                        "Tarea entregada · 23 jul, 18:42",
                      );
                    } else {
                      openDetail(task.id);
                    }
                  }}
                >
                  {role === "student"
                    ? completed
                      ? "Ver entrega"
                      : "Entregar"
                    : "Revisar"}
                  <ArrowRight size={16} />
                </button>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}

function ProgressPage({
  role,
  state,
  updateState,
}: {
  role: Role;
  state: PortalState;
  updateState: (
    updater: (previous: PortalState) => PortalState,
    message?: string,
  ) => void;
}) {
  const score = Math.round(
    state.progress.reduce((total, criterion) => {
      const value = {
        achieved: 1,
        in_progress: 0.65,
        needs_support: 0.35,
        not_observed: 0,
      }[criterion.level];
      return total + value * criterion.weight;
    }, 0),
  );
  return (
    <div className="progress-layout">
      <section className="panel progress-summary">
        <div>
          <span className="pill pill-active">Semana 7</span>
          <h2>{role === "student" ? "Vas construyendo tu avance" : "Avance del grupo"}</h2>
          <p>
            {role === "student"
              ? "Estos estados explican lo que ya lograste y cuál puede ser tu siguiente paso."
              : "La propuesta se calcula con evidencias y siempre requiere revisión docente."}
          </p>
        </div>
        <div className="score-block">
          <ProgressRing value={score} />
          <span>Propuesta actual</span>
        </div>
      </section>
      <section className="criteria-list">
        {state.progress.map((criterion) => {
          const status = progressLabels[criterion.level];
          return (
            <article className="criterion-card" key={criterion.id}>
              <div className="criterion-weight">{criterion.weight}%</div>
              <div className="criterion-copy">
                <h3>{criterion.label}</h3>
                <p>{criterion.detail}</p>
                <button className="text-link">
                  Ver evidencias <ArrowRight size={15} />
                </button>
              </div>
              {role === "student" ? (
                <span className={`status-tag ${status.className}`}>
                  {status.label}
                </span>
              ) : (
                <select
                  aria-label={`Estado de ${criterion.label}`}
                  value={criterion.level}
                  onChange={(event) =>
                    updateState(
                      (previous) => ({
                        ...previous,
                        progress: previous.progress.map((item) =>
                          item.id === criterion.id
                            ? {
                                ...item,
                                level: event.target.value as ProgressLevel,
                              }
                            : item,
                        ),
                      }),
                      "Criterio actualizado",
                    )
                  }
                >
                  {Object.entries(progressLabels).map(([value, item]) => (
                    <option value={value} key={value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              )}
            </article>
          );
        })}
      </section>
      <aside className="panel next-step-card">
        <span className="metric-icon gold">
          <Sparkles size={21} />
        </span>
        <span className="eyebrow">Tu siguiente paso</span>
        <h3>Completa el repaso de lectura.</h3>
        <p>
          Después revisa la retroalimentación para mejorar tu idea principal.
        </p>
        {role !== "student" && (
          <button
            className="primary-button"
            onClick={() => toast.success("Avance publicado con versión 1")}
          >
            <Check size={17} /> Publicar avance
          </button>
        )}
      </aside>
    </div>
  );
}

function ReportsPage({
  role,
  state,
  updateState,
}: {
  role: Role;
  state: PortalState;
  updateState: (
    updater: (previous: PortalState) => PortalState,
    message?: string,
  ) => void;
}) {
  return (
    <section className="reports-stack">
      {state.reports
        .filter((report) => role !== "student" || report.status === "published")
        .map((report) => (
          <article className="report-card" key={report.id}>
            <div className="report-header">
              <div>
                <span
                  className={`status-tag ${
                    report.status === "published"
                      ? "status-achieved"
                      : "status-neutral"
                  }`}
                >
                  {report.status === "published" ? "Publicado" : "Borrador"}
                </span>
                <h2>{report.week}</h2>
                <p>
                  {report.teacher} · Versión {report.version}
                  {report.publishedAt ? ` · ${report.publishedAt}` : ""}
                </p>
              </div>
              <FileText size={28} />
            </div>
            <div className="report-body">
              <div className="report-summary">
                <span className="eyebrow">Resumen</span>
                <p>{report.summary}</p>
              </div>
              <div className="report-detail success-block">
                <CheckCircle2 size={19} />
                <div>
                  <strong>Un logro para reconocer</strong>
                  <p>{report.achievement}</p>
                </div>
              </div>
              <div className="report-detail support-block">
                <CircleHelp size={19} />
                <div>
                  <strong>Área de acompañamiento</strong>
                  <p>{report.support}</p>
                </div>
              </div>
              <div className="report-detail next-block">
                <ArrowRight size={19} />
                <div>
                  <strong>Próximo paso</strong>
                  <p>{report.nextStep}</p>
                </div>
              </div>
            </div>
            <div className="report-footer">
              <span>
                <ShieldCheck size={16} /> El detalle solo se muestra dentro del
                portal.
              </span>
              {role !== "student" && report.status === "draft" && (
                <button
                  className="primary-button"
                  onClick={() =>
                    updateState(
                      (previous) => ({
                        ...previous,
                        reports: previous.reports.map((item) =>
                          item.id === report.id
                            ? {
                                ...item,
                                status: "published",
                                publishedAt: "Ahora",
                              }
                            : item,
                        ),
                      }),
                      "Reporte publicado y aviso seguro encolado",
                    )
                  }
                >
                  Publicar reporte
                </button>
              )}
            </div>
          </article>
        ))}
    </section>
  );
}

function MaterialsPage({
  state,
  updateState,
  role,
}: {
  state: PortalState;
  updateState: (
    updater: (previous: PortalState) => PortalState,
    message?: string,
  ) => void;
  role: Role;
}) {
  return (
    <div>
      <div className="filter-row">
        <div className="filter-pills">
          <button className="active">Toda la semana</button>
          <button>Lunes</button>
          <button>Miércoles</button>
          <button>Jueves</button>
        </div>
        <button className="filter-button">
          Todas las materias <ChevronDown size={16} />
        </button>
      </div>
      <section className="materials-grid">
        {state.materials.map((material) => (
          <article className="material-card" key={material.id}>
            <div className={`material-type ${subjectColors[material.subject] ?? "violet"}`}>
              {material.type === "Video" ? (
                <Sparkles size={24} />
              ) : material.type === "Audio" ? (
                <MessageCircle size={24} />
              ) : (
                <FileText size={24} />
              )}
              <span>{material.type}</span>
            </div>
            <div className="material-copy">
              <div className="list-card-meta">
                <span>{material.day}</span>
                <i>•</i>
                <span>{material.subject}</span>
              </div>
              <h3>{material.title}</h3>
              <p>{material.description}</p>
              <div className="material-flags">
                <span className={material.required ? "required" : ""}>
                  {material.required ? "Obligatorio" : "Opcional"}
                </span>
                {material.type === "Audio" && <span>Con transcripción</span>}
              </div>
              <button
                className={
                  material.reviewed ? "secondary-button" : "primary-button"
                }
                onClick={() =>
                  updateState(
                    (previous) => ({
                      ...previous,
                      materials: previous.materials.map((item) =>
                        item.id === material.id
                          ? { ...item, reviewed: true }
                          : item,
                      ),
                    }),
                    role === "student"
                      ? "Material marcado como revisado"
                      : "Vista previa abierta",
                  )
                }
              >
                {role === "student"
                  ? material.reviewed
                    ? "Revisado"
                    : "Abrir material"
                  : "Previsualizar"}
                {material.reviewed ? (
                  <CheckCircle2 size={17} />
                ) : (
                  <ArrowRight size={17} />
                )}
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

type WallReaderPage =
  | { kind: "intro" }
  | {
      kind: "content";
      paragraphs: string[];
      first: boolean;
      last: boolean;
    };

function wallStoryParagraphs(post: WallPost) {
  if (post.paragraphs?.length) return post.paragraphs;
  return [
    post.excerpt,
    `Esta historia fue preparada por ${post.author} para compartir una experiencia de ${post.category.toLocaleLowerCase("es-MX")} con la comunidad de CEHF Primaria.`,
    "Cada publicación del Periódico mural reúne observaciones, preguntas y aprendizajes que nacen dentro de nuestra escuela.",
  ];
}

function WallStoryReader({
  post,
  onClose,
  onFavorite,
}: {
  post: WallPost;
  onClose: () => void;
  onFavorite: () => void;
}) {
  const [readingPosition, setReadingPosition] = useState({
    postId: post.id,
    spread: 0,
  });
  const [pageTurn, setPageTurn] = useState<{
    id: number;
    direction: 1 | -1;
  } | null>(null);
  const pageTurnSequence = useRef(0);
  const reduceMotion = useReducedMotion();
  const paragraphs = useMemo(() => wallStoryParagraphs(post), [post]);
  const physicalPages = useMemo<WallReaderPage[]>(() => {
    const contentPages: WallReaderPage[] = [];
    for (let index = 0; index < paragraphs.length; index += 2) {
      contentPages.push({
        kind: "content",
        paragraphs: paragraphs.slice(index, index + 2),
        first: index === 0,
        last: index + 2 >= paragraphs.length,
      });
    }
    return [{ kind: "intro" }, ...contentPages];
  }, [paragraphs]);
  const spreadCount = Math.max(1, Math.ceil(physicalPages.length / 2));
  const requestedSpread =
    readingPosition.postId === post.id ? readingPosition.spread : 0;
  const spread = Math.min(Math.max(requestedSpread, 0), spreadCount - 1);
  const firstVisiblePage = spread * 2;
  const visiblePages = physicalPages.slice(
    firstVisiblePage,
    firstVisiblePage + 2,
  );
  const progress = Math.round(((spread + 1) / spreadCount) * 100);

  const moveSpread = useCallback(
    (delta: number) => {
      if (pageTurn) return;
      const next = spread + delta;
      if (next < 0 || next >= spreadCount) return;
      if (!reduceMotion) {
        pageTurnSequence.current += 1;
        setPageTurn({
          id: pageTurnSequence.current,
          direction: delta > 0 ? 1 : -1,
        });
      }
      setReadingPosition({ postId: post.id, spread: next });
    },
    [pageTurn, post.id, reduceMotion, spread, spreadCount],
  );

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") moveSpread(1);
      if (event.key === "ArrowLeft") moveSpread(-1);
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [moveSpread, onClose]);

  function renderPage(
    page: WallReaderPage | undefined,
    physicalIndex: number,
    side: "left" | "right",
  ) {
    if (!page) {
      return (
        <section
          className={`reader-page reader-page-${side} reader-page-blank`}
          aria-hidden="true"
        >
          <span className="reader-blank-mark">CE</span>
          <span>Entre líneas</span>
          <small>CEHF Primaria</small>
        </section>
      );
    }

    if (page.kind === "intro") {
      return (
        <section
          className={`reader-page reader-page-${side} reader-intro-page`}
        >
          <div className="reader-running-head">
            <span>{post.category}</span>
            <span>PERIÓDICO MURAL · 07</span>
          </div>
          <span className="reader-section-label">
            {post.section ?? post.category}
          </span>
          <h1>{post.title}</h1>
          <p className="reader-lead">{post.lead ?? post.excerpt}</p>
          <div className="reader-byline">
            <span>Texto</span>
            <strong>{post.author}</strong>
            <small>
              <Clock3 size={12} /> {post.readingTime ?? "3 min de lectura"}
            </small>
          </div>
          <div className="reader-page-number">{physicalIndex + 1}</div>
        </section>
      );
    }

    return (
      <section
        className={`reader-page reader-page-${side} reader-content-page ${
          page.first ? "is-first" : ""
        } ${page.last ? "is-last" : ""}`}
      >
        <div className="reader-running-head">
          <span>{post.category}</span>
          <span>{post.section ?? "Historias de nuestra comunidad"}</span>
        </div>
        {page.first && (
          <div className={`reader-story-art ${post.accent}`}>
            <span>
              EDICIÓN
              <br />
              07
            </span>
            <Newspaper size={48} />
            <i />
          </div>
        )}
        <div className="reader-content-copy">
          {page.paragraphs.map((paragraph, index) => (
            <p
              className={page.first && index === 0 ? "reader-first-paragraph" : ""}
              key={`${physicalIndex}-${index}`}
            >
              {paragraph}
            </p>
          ))}
        </div>
        {page.last && (
          <blockquote>
            “{post.quote ?? "Cada historia nos ayuda a mirar nuestra escuela de una forma nueva."}”
          </blockquote>
        )}
        <div className="reader-content-footer">
          <span>{page.last ? "CEHF PRIMARIA" : "CONTINÚA EN LA SIGUIENTE PÁGINA"}</span>
          {page.last && (
            <button
              type="button"
              className={post.favorite ? "favorite" : ""}
              onClick={onFavorite}
              aria-pressed={post.favorite}
            >
              <Heart size={13} fill={post.favorite ? "currentColor" : "none"} />
              {post.favorite ? "Guardada" : "Guardar"}
            </button>
          )}
        </div>
        <div className="reader-page-number">{physicalIndex + 1}</div>
        {side === "right" && <span className="reader-page-curl" />}
      </section>
    );
  }

  return (
    <motion.section
      className="magazine-reader-shell"
      role="dialog"
      aria-modal="true"
      aria-label={`Lectura de ${post.title}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.3 }}
    >
      <div className="reader-paper-grain" />
      <header className="reader-header">
        <div className="reader-identity">
          <span className="reader-brand-mark">CE</span>
          <span />
          <div>
            <strong>Entre líneas</strong>
            <small>Periódico mural · Julio 2026</small>
          </div>
        </div>
        <div className="reader-status">
          <span>{progress}% leído</span>
          <div>
            <i style={{ width: `${progress}%` }} />
          </div>
          <button
            type="button"
            autoFocus
            onClick={onClose}
            aria-label="Cerrar la revista"
          >
            <X size={19} />
          </button>
        </div>
      </header>

      <div className="reader-scene">
        <div className="reader-desk-light" />
        <div className="reader-book-shadow" />
        <div className="reader-book">
          <div className="reader-page-stack reader-page-stack-left" />
          <div className="reader-page-stack reader-page-stack-right" />
          <div className="reader-spine" />
          <AnimatePresence mode="wait">
            <motion.article
              className="reader-spread"
              key={`${post.id}-${spread}`}
              initial={{ opacity: reduceMotion ? 1 : 0.72 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: reduceMotion ? 1 : 0.72 }}
              transition={{ duration: reduceMotion ? 0 : 0.18 }}
              aria-live="polite"
            >
              {renderPage(visiblePages[0], firstVisiblePage, "left")}
              {renderPage(visiblePages[1], firstVisiblePage + 1, "right")}
            </motion.article>
          </AnimatePresence>
          {pageTurn && (
            <motion.div
              key={pageTurn.id}
              className={`reader-turn-sheet ${
                pageTurn.direction > 0 ? "forward" : "backward"
              }`}
              initial={{ rotateY: 0 }}
              animate={{
                rotateY:
                  pageTurn.direction > 0 ? [0, -92, -180] : [0, 92, 180],
              }}
              transition={{ duration: 0.76, ease: [0.45, 0, 0.2, 1] }}
              style={{
                transformOrigin:
                  pageTurn.direction > 0 ? "left center" : "right center",
              }}
              onAnimationComplete={() =>
                setPageTurn((active) =>
                  active?.id === pageTurn.id ? null : active,
                )
              }
              aria-hidden="true"
            >
              <div className="reader-turn-front">
                <span />
              </div>
              <div className="reader-turn-back">
                <span />
              </div>
            </motion.div>
          )}
        </div>
      </div>

      <nav className="reader-controls" aria-label="Navegación de páginas">
        <button
          type="button"
          onClick={() => moveSpread(-1)}
          disabled={spread === 0 || Boolean(pageTurn)}
          aria-label="Página anterior"
        >
          <ChevronLeft size={19} /> <span>Anterior</span>
        </button>
        <div className="reader-position">
          <small>
            Páginas {firstVisiblePage + 1}–
            {Math.min(firstVisiblePage + 2, physicalPages.length)} de {physicalPages.length}
          </small>
        </div>
        <button
          type="button"
          onClick={() => moveSpread(1)}
          disabled={spread === spreadCount - 1 || Boolean(pageTurn)}
          aria-label="Página siguiente"
        >
          <span>Siguiente</span> <ChevronRight size={19} />
        </button>
      </nav>
      <div className="reader-key-hint">
        <kbd>←</kbd>
        <kbd>→</kbd> pasar página <span /> <kbd>ESC</kbd> cerrar
      </div>
    </motion.section>
  );
}

function WallPage({
  state,
  updateState,
  role,
}: {
  state: PortalState;
  updateState: (
    updater: (previous: PortalState) => PortalState,
    message?: string,
  ) => void;
  role: Role;
}) {
  const [readerPostId, setReaderPostId] = useState<string | null>(null);
  const featured = state.wallPosts[0];
  const readerPost = state.wallPosts.find((post) => post.id === readerPostId);
  const toggleFavorite = (postId: string) =>
    updateState((previous) => ({
      ...previous,
      wallPosts: previous.wallPosts.map((item) =>
        item.id === postId ? { ...item, favorite: !item.favorite } : item,
      ),
    }));
  return (
    <div>
      <section className="wall-feature">
        <div className="wall-art" aria-hidden="true">
          <span className="wall-circle" />
          <span className="wall-arch" />
          <span className="wall-leaf one" />
          <span className="wall-leaf two" />
        </div>
        <div className="wall-feature-copy">
          <span className="pill pill-light">Historia destacada</span>
          <span className="wall-category">{featured.category}</span>
          <h2>{featured.title}</h2>
          <p>{featured.excerpt}</p>
          <button
            className="light-button"
            onClick={() => setReaderPostId(featured.id)}
          >
            Leer historia <ArrowRight size={17} />
          </button>
        </div>
      </section>
      <div className="filter-row">
        <div className="filter-pills">
          <button className="active">Todo el mural</button>
          <button>Ciencia</button>
          <button>Lecturas</button>
          <button>Comunidad</button>
        </div>
      </div>
      <section className="wall-grid">
        {state.wallPosts.slice(1).map((post) => (
          <article className="wall-card" key={post.id}>
            <div className={`wall-card-art ${post.accent}`}>
              <span>{post.category}</span>
              <Newspaper size={31} />
            </div>
            <div className="wall-card-copy">
              <div className="wall-byline">
                <span>{post.author}</span>
                <span>{post.publishedAt}</span>
              </div>
              <h3>{post.title}</h3>
              <p>{post.excerpt}</p>
              <div className="wall-actions">
                <button
                  className="text-link"
                  onClick={() => setReaderPostId(post.id)}
                >
                  Leer <ArrowRight size={15} />
                </button>
                <button
                  className={`favorite-button ${post.favorite ? "active" : ""}`}
                  aria-label={
                    post.favorite ? "Quitar de favoritos" : "Añadir a favoritos"
                  }
                  onClick={() => toggleFavorite(post.id)}
                >
                  <Heart size={18} fill={post.favorite ? "currentColor" : "none"} />
                </button>
              </div>
            </div>
          </article>
        ))}
      </section>
      {role === "student" && (
        <div className="proposal-note">
          <Sparkles size={21} />
          <div>
            <strong>¿Tienes una historia para compartir?</strong>
            <p>
              Puedes proponerla. Una persona adulta la revisará antes de
              publicarla.
            </p>
          </div>
          <button className="secondary-button">Proponer historia</button>
        </div>
      )}
      <AnimatePresence>
        {readerPost && (
          <WallStoryReader
            post={readerPost}
            onClose={() => setReaderPostId(null)}
            onFavorite={() => toggleFavorite(readerPost.id)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function UsersPage({ role }: { role: Role }) {
  if (role === "student") {
    return (
      <GuidedState
        icon={LockKeyhole}
        title="Esta sección es para personal autorizado"
        description="Tu información académica sigue disponible en Mi semana, Avance y Reportes."
      />
    );
  }
  const users = [
    {
      name: "Sofía Martínez",
      initials: "SM",
      role: "Estudiante",
      assignment: "5.º A",
      status: "Activa",
    },
    {
      name: "Diego Ramírez",
      initials: "DR",
      role: "Estudiante",
      assignment: "5.º A",
      status: "Activa",
    },
    {
      name: "Mariana López",
      initials: "ML",
      role: "Docente",
      assignment: "5.º A · Ciencias y Español",
      status: "Activa",
    },
    {
      name: "Roberto Díaz",
      initials: "RD",
      role: "Docente",
      assignment: "4.º B · Matemáticas",
      status: "Activa",
    },
  ];
  return (
    <div>
      <section className="metric-grid compact-metrics">
        <article className="metric-card">
          <span className="metric-icon violet">
            <Users size={20} />
          </span>
          <strong>186</strong>
          <p>Estudiantes activos</p>
        </article>
        <article className="metric-card">
          <span className="metric-icon mint">
            <GraduationCap size={20} />
          </span>
          <strong>14</strong>
          <p>Docentes</p>
        </article>
        <article className="metric-card">
          <span className="metric-icon gold">
            <Library size={20} />
          </span>
          <strong>9</strong>
          <p>Grupos</p>
        </article>
        <article className="metric-card">
          <span className="metric-icon coral">
            <ShieldCheck size={20} />
          </span>
          <strong>0</strong>
          <p>Cuentas por revisar</p>
        </article>
      </section>
      <section className="panel user-table-card">
        <div className="table-toolbar">
          <div className="small-search">
            <Search size={17} />
            <input aria-label="Buscar personas" placeholder="Buscar por nombre…" />
          </div>
          <div className="filter-pills">
            <button className="active">Todos</button>
            <button>Estudiantes</button>
            <button>Personal</button>
          </div>
        </div>
        <div className="user-table">
          <div className="user-row table-head">
            <span>Persona</span>
            <span>Rol</span>
            <span>Asignación</span>
            <span>Estado</span>
            <span />
          </div>
          {users.map((user) => (
            <div className="user-row" key={user.name}>
              <div className="user-cell">
                <span className="avatar small">{user.initials}</span>
                <strong>{user.name}</strong>
              </div>
              <span>{user.role}</span>
              <span>{user.assignment}</span>
              <span className="status-tag status-achieved">{user.status}</span>
              <button className="plain-icon" aria-label={`Opciones de ${user.name}`}>
                <MoreHorizontal size={18} />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function SettingsPage({
  state,
  updateState,
  role,
}: {
  state: PortalState;
  updateState: (
    updater: (previous: PortalState) => PortalState,
    message?: string,
  ) => void;
  role: Role;
}) {
  return (
    <div className="settings-layout">
      <section className="panel settings-section">
        <div className="settings-heading">
          <span className="settings-icon">
            <Sun size={20} />
          </span>
          <div>
            <h2>Apariencia y accesibilidad</h2>
            <p>Elige cómo quieres ver y recorrer el portal.</p>
          </div>
        </div>
        <div className="setting-row">
          <div>
            <strong>Tema</strong>
            <span>Claro, oscuro o según tu dispositivo.</span>
          </div>
          <div className="theme-options">
            {(["light", "dark", "system"] as const).map((theme) => (
              <button
                className={state.settings.theme === theme ? "active" : ""}
                key={theme}
                onClick={() =>
                  updateState(
                    (previous) => ({
                      ...previous,
                      settings: { ...previous.settings, theme },
                    }),
                    "Preferencia guardada",
                  )
                }
              >
                {theme === "light" ? (
                  <Sun size={16} />
                ) : theme === "dark" ? (
                  <Moon size={16} />
                ) : (
                  <Settings size={16} />
                )}
                {theme === "light"
                  ? "Claro"
                  : theme === "dark"
                    ? "Oscuro"
                    : "Sistema"}
              </button>
            ))}
          </div>
        </div>
        <div className="setting-row">
          <div>
            <strong>Reducir movimiento</strong>
            <span>Disminuye transiciones y animaciones.</span>
          </div>
          <Toggle
            checked={state.settings.reducedMotion}
            label="Reducir movimiento"
            onChange={(checked) =>
              updateState((previous) => ({
                ...previous,
                settings: { ...previous.settings, reducedMotion: checked },
              }))
            }
          />
        </div>
      </section>
      <section className="panel settings-section">
        <div className="settings-heading">
          <span className="settings-icon">
            <Bell size={20} />
          </span>
          <div>
            <h2>Notificaciones</h2>
            <p>Controla los avisos internos y sus horarios.</p>
          </div>
        </div>
        <div className="setting-row">
          <div>
            <strong>Avisos internos</strong>
            <span>Tareas, repasos, materiales y reportes.</span>
          </div>
          <Toggle checked label="Avisos internos" onChange={() => undefined} />
        </div>
        {role === "director" && (
          <>
            <div className="setting-row">
              <div>
                <strong>WhatsApp para familias</strong>
                <span>
                  Solo avisos genéricos para contactos con consentimiento.
                </span>
              </div>
              <Toggle
                checked={state.settings.whatsappEnabled}
                label="WhatsApp para familias"
                onChange={(checked) =>
                  updateState(
                    (previous) => ({
                      ...previous,
                      settings: {
                        ...previous.settings,
                        whatsappEnabled: checked,
                      },
                    }),
                    checked
                      ? "WhatsApp habilitado"
                      : "WhatsApp pausado; el portal sigue funcionando",
                  )
                }
              />
            </div>
            <div className="setting-row">
              <div>
                <strong>Horario silencioso</strong>
                <span>No se envían recordatorios no críticos.</span>
              </div>
              <select
                value={state.settings.quietHours}
                onChange={(event) =>
                  updateState((previous) => ({
                    ...previous,
                    settings: {
                      ...previous.settings,
                      quietHours: event.target.value,
                    },
                  }))
                }
              >
                <option>20:00–07:00</option>
                <option>21:00–07:00</option>
                <option>Sin horario</option>
              </select>
            </div>
          </>
        )}
      </section>
      {role === "director" && (
        <section className="panel settings-section">
          <div className="settings-heading">
            <span className="settings-icon">
              <ShieldCheck size={20} />
            </span>
            <div>
              <h2>Institución</h2>
              <p>Datos generales, ciclos, grados, grupos y políticas.</p>
            </div>
          </div>
          <div className="setting-row">
            <div>
              <strong>CEHF Primaria</strong>
              <span>America/Mexico_City · Ciclo 2026–2027</span>
            </div>
            <button className="secondary-button">Administrar</button>
          </div>
        </section>
      )}
    </div>
  );
}

function ProfilePage({
  profile,
  state,
}: {
  profile: UserProfile;
  state: PortalState;
}) {
  return (
    <div className="profile-layout">
      <section className="panel profile-card">
        <span className="avatar profile-avatar">{profile.initials}</span>
        <h2>{profile.name}</h2>
        <span className="role-chip">{roleLabel[profile.role]}</span>
        <p>{profile.email}</p>
        <div className="profile-facts">
          {profile.grade && (
            <span>
              <strong>Grado</strong>
              {profile.grade}
            </span>
          )}
          {profile.group && (
            <span>
              <strong>Grupo</strong>
              {profile.group}
            </span>
          )}
          {profile.subjects?.length ? (
            <span>
              <strong>Materias</strong>
              {profile.subjects.join(", ")}
            </span>
          ) : null}
        </div>
        <button
          className="secondary-button logout-button"
          onClick={() => void logoutFirebase()}
        >
          <LogOut size={17} /> Cerrar sesión
        </button>
      </section>
      <section className="profile-main">
        <article className="panel">
          <PanelHeading title="Tu actividad" />
          <div className="profile-stats">
            <div>
              <strong>{state.reviews.filter((item) => item.progress === 100).length}</strong>
              <span>Repasos completados</span>
            </div>
            <div>
              <strong>{state.tasks.filter((item) => item.status !== "published").length}</strong>
              <span>Tareas entregadas</span>
            </div>
            <div>
              <strong>{state.reports.filter((item) => item.status === "published").length}</strong>
              <span>Reportes disponibles</span>
            </div>
          </div>
        </article>
        <article className="panel privacy-panel">
          <span className="metric-icon mint">
            <ShieldCheck size={21} />
          </span>
          <div>
            <h3>Tu información está protegida</h3>
            <p>
              Tu avance, reportes y correo no aparecen en el foro ni en el
              periódico. Solo las personas autorizadas pueden consultarlos.
            </p>
          </div>
        </article>
      </section>
    </div>
  );
}

function NotificationPanel({
  state,
  onClose,
  onMarkAll,
}: {
  state: PortalState;
  onClose: () => void;
  onMarkAll: () => void;
}) {
  return (
    <motion.div
      className="notification-panel"
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.98 }}
    >
      <div className="notification-header">
        <div>
          <span className="eyebrow">Centro de avisos</span>
          <h3>Notificaciones</h3>
        </div>
        <button className="plain-icon" onClick={onClose} aria-label="Cerrar">
          <X size={19} />
        </button>
      </div>
      <div className="notification-list">
        {state.notifications.map((item) => (
          <button className={!item.read ? "unread" : ""} key={item.id}>
            <span className={`notification-type ${item.category}`}>
              <Bell size={16} />
            </span>
            <span>
              <strong>{item.title}</strong>
              <small>{item.detail}</small>
              <em>{item.createdAt}</em>
            </span>
          </button>
        ))}
      </div>
      <button className="text-button notification-mark" onClick={onMarkAll}>
        <Check size={16} /> Marcar todas como leídas
      </button>
    </motion.div>
  );
}

function CreateModal({
  section,
  onClose,
  onCreate,
}: {
  section: SectionKey;
  onClose: () => void;
  onCreate: (
    title: string,
    subject: string,
    forumDraft?: ForumDraftDetails,
  ) => void;
}) {
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("Ciencias");
  const [prompt, setPrompt] = useState("");
  const [group, setGroup] = useState("5.º A");
  const [forumName, setForumName] = useState("Ciencias · 5.º A");
  const [forumKind, setForumKind] =
    useState<ForumTopicKind>("weekly_question");
  const [forumStatus, setForumStatus] =
    useState<ForumTopic["status"]>("open");
  const [opensAt, setOpensAt] = useState("Publicado ahora");
  const [closesAt, setClosesAt] = useState("Cierra el viernes");
  const [allowReplies, setAllowReplies] = useState(true);
  const [allowAttachments, setAllowAttachments] = useState(false);
  const isForum = section === "forum";
  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.form
        className={`modal ${isForum ? "forum-create-modal" : ""}`}
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        onSubmit={(event) => {
          event.preventDefault();
          onCreate(
            title.trim(),
            subject,
            isForum
              ? {
                  prompt: prompt.trim(),
                  group,
                  forumName: forumName.trim(),
                  kind: forumKind,
                  status: forumStatus,
                  opensAt: opensAt.trim(),
                  closesAt: closesAt.trim(),
                  allowReplies,
                  allowAttachments,
                }
              : undefined,
          );
        }}
      >
        <div className="modal-heading">
          <div>
            <span className="eyebrow">
              {isForum ? "Conversación guiada" : "Nuevo borrador"}
            </span>
            <h2>{createLabel(section)}</h2>
          </div>
          <button className="plain-icon" type="button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <label>
          Título
          <input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Escribe un título claro"
            required
          />
        </label>
        <label>
          Materia o campo
          <select
            value={subject}
            onChange={(event) => {
              setSubject(event.target.value);
              if (isForum) setForumName(`${event.target.value} · ${group}`);
            }}
          >
            <option>Ciencias</option>
            <option>Matemáticas</option>
            <option>Español</option>
            <option>Comunidad</option>
          </select>
        </label>
        {isForum ? (
          <>
            <label>
              Consigna
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Escribe la pregunta o indicación que guiará la conversación"
                rows={3}
                required
              />
            </label>
            <div className="forum-create-grid">
              <label>
                Tipo de foro
                <select
                  value={forumKind}
                  onChange={(event) => {
                    const nextKind = event.target.value as ForumTopicKind;
                    setForumKind(nextKind);
                    if (nextKind === "announcement") setAllowReplies(false);
                  }}
                >
                  <option value="weekly_question">Pregunta de la semana</option>
                  <option value="subject">Foro de materia</option>
                  <option value="reading_club">Club de lectura</option>
                  <option value="task_help">Dudas sobre una tarea</option>
                  <option value="group_chat">Conversación de grupo</option>
                  <option value="wall">Foro del periódico</option>
                  <option value="announcement">Aviso institucional</option>
                </select>
              </label>
              <label>
                Grupo
                <select
                  value={group}
                  onChange={(event) => {
                    setGroup(event.target.value);
                    setForumName(`${subject} · ${event.target.value}`);
                  }}
                >
                  <option>5.º A</option>
                  <option>5.º B</option>
                  <option>4.º–6.º</option>
                  <option>Toda Primaria</option>
                </select>
              </label>
              <label>
                Espacio
                <input
                  value={forumName}
                  onChange={(event) => setForumName(event.target.value)}
                  placeholder="Ciencias · 5.º A"
                  required
                />
              </label>
              <label>
                Publicación
                <select
                  value={forumStatus}
                  onChange={(event) => {
                    const nextStatus = event.target.value as ForumTopic["status"];
                    setForumStatus(nextStatus);
                    setOpensAt(
                      nextStatus === "scheduled"
                        ? "Se abre el lunes · 07:00"
                        : "Publicado ahora",
                    );
                  }}
                >
                  <option value="open">Publicar ahora</option>
                  <option value="scheduled">Programar</option>
                  <option value="closed">Publicar cerrado</option>
                </select>
              </label>
              <label>
                Apertura
                <input
                  value={opensAt}
                  onChange={(event) => setOpensAt(event.target.value)}
                />
              </label>
              <label>
                Cierre
                <input
                  value={closesAt}
                  onChange={(event) => setClosesAt(event.target.value)}
                />
              </label>
            </div>
            <div className="forum-create-options">
              <label>
                <input
                  type="checkbox"
                  checked={allowReplies}
                  onChange={(event) => setAllowReplies(event.target.checked)}
                />
                Permitir respuestas
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={allowAttachments}
                  onChange={(event) => setAllowAttachments(event.target.checked)}
                />
                Permitir un adjunto
              </label>
            </div>
            <div className="setup-note compact-note">
              <ShieldCheck size={19} />
              <p>
                La audiencia será el grupo seleccionado y la conversación
                quedará disponible para moderación.
              </p>
            </div>
          </>
        ) : (
          <div className="setup-note compact-note">
            <ShieldCheck size={19} />
            <p>
              Se guardará como borrador. Podrás revisar audiencia, fechas y
              accesibilidad antes de publicar.
            </p>
          </div>
        )}
        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="primary-button"
            disabled={!title.trim() || (isForum && !prompt.trim())}
          >
            {isForum
              ? forumStatus === "scheduled"
                ? "Programar tema"
                : "Publicar tema"
              : "Crear borrador"}{" "}
            <ArrowRight size={17} />
          </button>
        </div>
      </motion.form>
    </motion.div>
  );
}

function DetailDrawer({
  itemId,
  state,
  onClose,
}: {
  itemId: string;
  state: PortalState;
  onClose: () => void;
}) {
  const task = state.tasks.find((item) => item.id === itemId);
  return (
    <motion.div
      className="drawer-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.aside
        className="detail-drawer"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 260 }}
      >
        <div className="drawer-header">
          <button className="plain-icon" onClick={onClose}>
            <ArrowLeft size={20} />
          </button>
          <span>Detalle de la tarea</span>
          <button className="plain-icon">
            <MoreHorizontal size={20} />
          </button>
        </div>
        {task && (
          <div className="drawer-body">
            <span className="pill pill-active">{task.subject}</span>
            <h2>{task.title}</h2>
            <p>{task.description}</p>
            <div className="drawer-info">
              <span>
                <Clock3 size={18} />
                <span>
                  <small>Fecha límite</small>
                  <strong>{task.dueLabel}</strong>
                </span>
              </span>
              <span>
                <Target size={18} />
                <span>
                  <small>Objetivo</small>
                  <strong>{task.objective}</strong>
                </span>
              </span>
            </div>
            <div className="submission-box">
              <span className="metric-icon mint">
                <CheckCircle2 size={21} />
              </span>
              <div>
                <strong>Entrega recibida</strong>
                <p>23 jul, 18:42 · Versión 1</p>
              </div>
            </div>
            <label>
              Retroalimentación
              <textarea
                rows={5}
                defaultValue="Tu observación es clara. Añade una frase que explique qué evidencia te permitió decidirlo."
              />
            </label>
            <button
              className="primary-button full-button"
              onClick={() => toast.success("Retroalimentación publicada")}
            >
              Publicar retroalimentación
            </button>
          </div>
        )}
      </motion.aside>
    </motion.div>
  );
}

function MobileNavigation({
  active,
  onNavigate,
  onMore,
}: {
  active: SectionKey;
  onNavigate: (section: SectionKey) => void;
  onMore: () => void;
}) {
  const items: Array<{ key: SectionKey; label: string; icon: IconType }> = [
    { key: "dashboard", label: "Inicio", icon: Home },
    { key: "weekly-review", label: "Repaso", icon: BookOpen },
    { key: "tasks", label: "Tareas", icon: ClipboardCheck },
    { key: "my-week", label: "Mi semana", icon: CalendarDays },
  ];
  return (
    <nav className="mobile-nav" aria-label="Navegación móvil">
      {items.map((item) => (
        <button
          className={active === item.key ? "active" : ""}
          key={item.key}
          onClick={() => onNavigate(item.key)}
        >
          <item.icon size={20} />
          <span>{item.label}</span>
        </button>
      ))}
      <button onClick={onMore}>
        <MoreHorizontal size={20} />
        <span>Más</span>
      </button>
    </nav>
  );
}

function MobileMore({
  navigation,
  onClose,
  onNavigate,
}: {
  navigation: Array<{
    key: SectionKey;
    label: string;
    icon: IconType;
    roles?: Role[];
  }>;
  onClose: () => void;
  onNavigate: (section: SectionKey) => void;
}) {
  return (
    <motion.div
      className="modal-backdrop mobile-more-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="mobile-more-sheet"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mobile-sheet-handle" />
        <div className="mobile-sheet-heading">
          <h2>Más secciones</h2>
          <button className="plain-icon" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="mobile-more-grid">
          {navigation
            .filter(
              (item) =>
                !["dashboard", "weekly-review", "tasks", "my-week"].includes(
                  item.key,
                ),
            )
            .map((item) => (
              <button key={item.key} onClick={() => onNavigate(item.key)}>
                <item.icon size={21} />
                <span>{item.label}</span>
              </button>
            ))}
          <button onClick={() => onNavigate("settings")}>
            <Settings size={21} />
            <span>Configuración</span>
          </button>
          <button onClick={() => onNavigate("profile")}>
            <UserRound size={21} />
            <span>Perfil</span>
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ProgressRing({
  value,
  small = false,
}: {
  value: number;
  small?: boolean;
}) {
  return (
    <div
      className={`progress-ring ${small ? "small" : ""}`}
      style={{ "--value": `${value * 3.6}deg` } as React.CSSProperties}
      aria-label={`${value}%`}
      role="img"
    >
      <span>{value}%</span>
    </div>
  );
}

function PanelHeading({
  title,
  action,
}: {
  title: string;
  action?: string;
}) {
  return (
    <div className="panel-heading">
      <h2>{title}</h2>
      {action && (
        <button className="text-link">
          {action} <ArrowRight size={15} />
        </button>
      )}
    </div>
  );
}

function Timeline({
  notifications,
}: {
  notifications: PortalState["notifications"];
}) {
  return (
    <div className="timeline">
      {notifications.map((item) => (
        <div key={item.id}>
          <span className={`timeline-dot ${item.category}`} />
          <div>
            <strong>{item.title}</strong>
            <p>{item.detail}</p>
            <small>{item.createdAt}</small>
          </div>
        </div>
      ))}
    </div>
  );
}

function Toggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      className={`toggle ${checked ? "active" : ""}`}
      aria-label={label}
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="brand-mark">
        <span>CE</span>
      </div>
      <div className="loading-line">
        <span />
      </div>
      <p>Preparando tu semana…</p>
    </div>
  );
}

function GuidedState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: IconType;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="guided-page">
      <div className="empty-state">
        <span className="empty-icon">
          <Icon size={29} />
        </span>
        <h2>{title}</h2>
        <p>{description}</p>
        {actionLabel && onAction && (
          <button className="primary-button" onClick={onAction}>
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function createLabel(section: SectionKey) {
  const labels: Partial<Record<SectionKey, string>> = {
    "my-week": "Nueva semana",
    "weekly-review": "Nuevo repaso",
    tasks: "Nueva tarea",
    "weekly-materials": "Nuevo material",
    "wall-newspaper": "Nueva publicación",
    forum: "Nuevo tema",
    users: "Nueva persona",
  };
  return labels[section] ?? "Nuevo elemento";
}
