"use client";

import {
  AlertCircle,
  ArrowRight,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  Copy,
  Database,
  FileBarChart,
  GraduationCap,
  Home,
  Eye,
  EyeOff,
  LayoutDashboard,
  LockKeyhole,
  LoaderCircle,
  LogIn,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  Moon,
  MoreHorizontal,
  Newspaper,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Pencil,
  Plus,
  Quote,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  UploadCloud,
  UserRound,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast, Toaster } from "sonner";
import type { User } from "firebase/auth";
import { ForumPage } from "@/components/forum-page";
import { AcademicCalendarModal } from "@/components/academic-calendar-modal";
import { UsersPage as CommunityUsersPage } from "@/components/users-page";
import { WallNewspaperPage } from "@/components/wall-newspaper-page";
import { WhatsAppAdminPanel } from "@/components/whatsapp-admin-panel";
import { StaffWorkspacePage } from "@/components/staff-workspace-page";
import { WorkshopsPage } from "@/components/workshops-page";
import { GradingWeightsCard } from "@/components/weekly-grades";
import {
  clearInstitutionDemoData,
  loadInstitutionDemoData,
  type DemoSeedCounts,
} from "@/lib/demo-seed-firebase";
import { AcademicGradesPanel } from "@/components/academic-grades";
import { AcademicReportsPage } from "@/components/academic-reports";
import {
  ReviewCreateModal,
  ReviewsPage,
} from "@/components/reviews-page";
import {
  AcademicConfigurationCard,
  TaskCreateModal,
  TaskDetailModal,
  TaskListPage,
} from "@/components/tasks-workflow";
import {
  createManagedAccount,
  firebaseConfigured,
  firebaseErrorDetails,
  friendlyFirebaseError,
  generateTemporaryPassword,
  getProfile,
  listManagedAccounts,
  loadPortalState,
  loginWithEmail,
  logoutFirebase,
  normalizeGuardianWhatsApp,
  refreshPortalAccess,
  PROFILE_PHOTO_MIME_TYPES,
  resetPassword,
  savePortalState,
  savePortalSettings,
  watchAuth,
} from "@/lib/firebase";
import {
  createDemoTask,
  createTaskAssignment,
  defaultAcademicCalendar,
  defaultAcademicConfig,
  legacyTasksToAssignments,
  markTaskNotificationsRead,
  resolveAcademicConfig,
  saveAcademicCalendar,
  watchAcademicCalendar,
  watchAcademicConfig,
  watchTaskAssignments,
  watchTaskNotifications,
} from "@/lib/tasks-firebase";
import {
  createDemoWeeklyReview,
  createWeeklyReview,
  legacyReviewsToWeeklyReviews,
  watchWeeklyReviews,
} from "@/lib/reviews-firebase";
import {
  createDemoState,
  demoManagedAccounts,
  demoProfiles,
  roleLabel,
} from "@/lib/demo-data";
import {
  createForumTopic,
  watchForumWorkspace,
} from "@/lib/forum-firebase";
import { useOutsidePointerDismiss } from "@/lib/use-outside-pointer-dismiss";
import {
  publishAcademicCalendarImage,
  unpublishAcademicCalendarImage,
  watchAcademicCalendarImage,
} from "@/lib/academic-calendar-image-firebase";
import type {
  AcademicCalendar,
  AcademicCalendarImage,
  AcademicCalendarInput,
  ForumTopic,
  ForumTopicKind,
  ManagedAccount,
  AcademicConfig,
  PortalState,
  PortalSettings,
  ProgressLevel,
  Role,
  SchoolLevel,
  SectionKey,
  UserProfile,
  TaskAssignment,
  TaskCreateInput,
  WeeklyReview,
  WeeklyReviewCreateInput,
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

const primarySubjectOptions = [
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

const routes: Record<SectionKey, string> = {
  dashboard: "/dashboard",
  "my-week": "/qualifications",
  "weekly-review": "/weekly-review",
  tasks: "/tasks",
  "weekly-progress": "/my-space",
  reports: "/reports",
  "wall-newspaper": "/wall-newspaper",
  forum: "/forum",
  workshops: "/workshops",
  users: "/users",
  settings: "/settings/appearance",
  profile: "/profile",
};

type SettingsTabId =
  | "appearance"
  | "notifications"
  | "grading"
  | "whatsapp"
  | "academic";

const settingsRoutes: Record<SettingsTabId, string> = {
  appearance: "/settings/appearance",
  notifications: "/settings/notifications",
  grading: "/settings/grading",
  whatsapp: "/settings/whatsapp",
  academic: "/settings/academic",
};

function settingsTabFromPath(path: string): SettingsTabId {
  const [section, tab] = path.split("/").filter(Boolean);
  return section === "settings" && tab && tab in settingsRoutes
    ? (tab as SettingsTabId)
    : "appearance";
}

function canOpenSettingsTab(tab: SettingsTabId, role: Role) {
  if (tab === "grading") return role === "teacher";
  if (tab === "whatsapp") return role === "director" || role === "teacher";
  if (tab === "academic") return role === "director";
  return true;
}

const sectionFromPath = (path: string): SectionKey => {
  const name = path.split("/").filter(Boolean)[0] as
    | SectionKey
    | "qualifications"
    | "my-space"
    | "weekly-materials"
    | undefined;
  if (!name || name === ("login" as SectionKey)) return "dashboard";
  if (name === "qualifications" || name === "my-week") return "my-week";
  if (name === "my-space") return "weekly-progress";
  if (name === "weekly-materials") return "tasks";
  return name in routes ? name : "dashboard";
};

const taskIdFromPath = (path: string) => {
  const [section, taskId] = path.split("/").filter(Boolean);
  return section === "tasks" && taskId ? decodeURIComponent(taskId) : null;
};

function academicWeekRange(config: AcademicConfig) {
  if (!config.weekStartDate || !config.weekEndDate) return "";
  const format = (value: string) =>
    new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" }).format(
      new Date(`${value}T12:00:00`),
    );
  return `${format(config.weekStartDate)}–${format(config.weekEndDate)}`;
}

function demoCalendarFromInput(input: AcademicCalendarInput): AcademicCalendar {
  const weeks = [...input.weeks]
    .sort((first, second) => first.startDate.localeCompare(second.startDate))
    .map((week, index) => {
      const endExclusive = new Date(`${week.endDate}T12:00:00`);
      endExclusive.setDate(endExclusive.getDate() + 1);
      return {
        ...week,
        startAt: new Date(`${week.startDate}T00:00:00`).toISOString(),
        endAt: new Date(
          `${endExclusive.toISOString().slice(0, 10)}T00:00:00`,
        ).toISOString(),
        order: index + 1,
        active: true,
      };
    });
  const terms = input.terms.map((term, index) => {
    const selected = weeks.filter((week) => term.weekIds.includes(week.id));
    return {
      ...term,
      startDate: selected[0]?.startDate ?? "",
      endDate: selected.at(-1)?.endDate ?? "",
      order: index + 1,
      active: true,
    };
  });
  return {
    schoolYearId: input.schoolYearId,
    configured: true,
    weeks,
    terms,
    nonWorkingDays: (input.nonWorkingDays ?? []).map((day) => {
      const week = weeks.find(
        (candidate) => day.date >= candidate.startDate && day.date <= candidate.endDate,
      );
      const term = week
        ? terms.find((candidate) => candidate.weekIds.includes(week.id))
        : undefined;
      return {
        id: day.date,
        ...day,
        weekId: week?.id ?? "",
        weekLabel: week?.label ?? "Semana",
        termId: term?.id ?? "",
        termLabel: term?.label ?? "Bimestre",
        active: true,
      };
    }),
  };
}

const navigation: Array<{
  key: SectionKey;
  label: string;
  icon: IconType;
  roles?: Role[];
}> = [
  { key: "dashboard", label: "Inicio", icon: LayoutDashboard },
  { key: "my-week", label: "Calificaciones", icon: GraduationCap },
  { key: "weekly-review", label: "Repasos", icon: BookOpen },
  { key: "tasks", label: "Tareas", icon: ClipboardCheck },
  {
    key: "weekly-progress",
    label: "Mi espacio",
    icon: Target,
    roles: ["director", "teacher"],
  },
  { key: "reports", label: "Reportes", icon: FileBarChart },
  { key: "wall-newspaper", label: "Periódico mural", icon: Newspaper },
  { key: "forum", label: "Foro", icon: MessageCircle },
  { key: "workshops", label: "Talleres", icon: Sparkles },
  {
    key: "users",
    label: "Comunidad",
    icon: Users,
    roles: ["director", "teacher"],
  },
];

const pageTitles: Record<SectionKey, { eyebrow: string; title: string }> = {
  dashboard: { eyebrow: "Historial académico", title: "Buenos días" },
  "my-week": { eyebrow: "Resultados y seguimiento", title: "Calificaciones" },
  "weekly-review": { eyebrow: "Práctica breve", title: "Repasos" },
  tasks: { eyebrow: "Actividades y entregas", title: "Tareas" },
  "weekly-progress": {
    eyebrow: "Organización personal y del equipo",
    title: "Mi espacio",
  },
  reports: { eyebrow: "Seguimiento con contexto", title: "Reportes" },
  "wall-newspaper": {
    eyebrow: "Historias de nuestra comunidad",
    title: "Periódico mural",
  },
  forum: { eyebrow: "Conversaciones guiadas", title: "Foro" },
  workshops: { eyebrow: "Explorar, crear y compartir", title: "Talleres" },
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

function reportFirebaseError(operation: string, error: unknown) {
  const message = friendlyFirebaseError(error);
  console.error(`[Campus CEHF] ${operation}`, error);
  toast.error(message, { description: `Operación: ${operation}` });
  return message;
}

export function CEHFApp() {
  const [activeSection, setActiveSection] = useState<SectionKey>(() =>
    typeof window === "undefined"
      ? "dashboard"
      : sectionFromPath(window.location.pathname),
  );
  const [authReady, setAuthReady] = useState(!firebaseConfigured);
  const [authFailure, setAuthFailure] = useState<string | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [demoRole, setDemoRole] = useState<Role>("student");
  const [demoStarted, setDemoStarted] = useState(false);
  const [state, setState] = useState<PortalState>(createDemoState);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationWrapRef = useOutsidePointerDismiss<HTMLDivElement>(
    notificationsOpen,
    setNotificationsOpen,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState<string | null>(() =>
    typeof window === "undefined" ? null : taskIdFromPath(window.location.pathname),
  );
  const [storedAcademicConfig, setStoredAcademicConfig] = useState<AcademicConfig>(
    defaultAcademicConfig,
  );
  const [academicCalendar, setAcademicCalendar] = useState<AcademicCalendar>(
    defaultAcademicCalendar,
  );
  const [academicCalendarImage, setAcademicCalendarImage] =
    useState<AcademicCalendarImage | null>(null);
  const [academicCalendarImageLoading, setAcademicCalendarImageLoading] =
    useState(false);
  const [academicCalendarOpen, setAcademicCalendarOpen] = useState(false);
  const [academicCalendarSaving, setAcademicCalendarSaving] = useState(false);
  const [taskRecords, setTaskRecords] = useState<TaskAssignment[]>(() =>
    legacyTasksToAssignments(
      createDemoState().tasks,
      defaultAcademicConfig,
      demoProfiles.student,
    ),
  );
  const [taskRecordsLoading, setTaskRecordsLoading] = useState(false);
  const [reviewRecords, setReviewRecords] = useState<WeeklyReview[]>(() =>
    legacyReviewsToWeeklyReviews(
      createDemoState().reviews,
      demoProfiles.student,
      defaultAcademicConfig,
      demoManagedAccounts,
    ),
  );
  const [reviewRecordsLoading, setReviewRecordsLoading] = useState(false);
  const [reviewRecordsRevision, setReviewRecordsRevision] = useState(0);
  const [mobileMore, setMobileMore] = useState(false);
  const [systemPrefersDark, setSystemPrefersDark] = useState(false);
  const [managedAccounts, setManagedAccounts] = useState<ManagedAccount[]>(
    demoManagedAccounts,
  );
  const [managedAccountsLoading, setManagedAccountsLoading] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const currentProfile = profile ?? demoProfiles[demoRole];
  const usingDemo = !firebaseUser;
  const role = currentProfile.role;
  const unread = state.notifications.filter((item) => !item.read).length;
  const darkModeActive =
    state.settings.theme === "dark" ||
    (state.settings.theme === "system" && systemPrefersDark);
  const academicConfig = useMemo(
    () =>
      resolveAcademicConfig(
        {
          ...storedAcademicConfig,
          institutionId: currentProfile.institutionId,
        },
        academicCalendar,
      ),
    [academicCalendar, currentProfile.institutionId, storedAcademicConfig],
  );

  useEffect(() => {
    if (window.location.pathname.split("/").filter(Boolean)[0] === "my-week") {
      window.history.replaceState({}, "", routes["my-week"]);
    }
    const onPopState = () => {
      setActiveSection(sectionFromPath(window.location.pathname));
      setDetailOpen(taskIdFromPath(window.location.pathname));
    };
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
              forumBans: restored.forumBans ?? defaults.forumBans,
            }
          : {
              ...defaults,
              ...restored,
              weeklyVerse: restored.weeklyVerse ?? defaults.weeklyVerse,
              wallPosts: migratedWallPosts,
              forumTopics: defaults.forumTopics,
              forumModeration: defaults.forumModeration,
              forumBans: defaults.forumBans,
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
    if (!firebaseUser || !profile) return;
    return watchAcademicConfig(
      profile.institutionId,
      setStoredAcademicConfig,
      (error) => reportFirebaseError("cargar configuración académica", error),
    );
  }, [firebaseUser, profile]);

  useEffect(() => {
    if (!firebaseUser || !profile) return;
    return watchAcademicCalendar(
      storedAcademicConfig,
      setAcademicCalendar,
      (error) => reportFirebaseError("cargar semanas y bimestres", error),
    );
  }, [firebaseUser, profile, storedAcademicConfig]);

  useEffect(() => {
    if (!firebaseUser || !profile) {
      queueMicrotask(() => setAcademicCalendarImageLoading(false));
      return;
    }
    queueMicrotask(() => setAcademicCalendarImageLoading(true));
    return watchAcademicCalendarImage(
      profile.institutionId,
      (calendar) => {
        setAcademicCalendarImage(calendar);
        setAcademicCalendarImageLoading(false);
      },
      (error) => {
        setAcademicCalendarImageLoading(false);
        reportFirebaseError("cargar calendario visual", error);
      },
    );
  }, [firebaseUser, profile]);

  useEffect(() => {
    if (!firebaseUser || !profile) return;
    queueMicrotask(() => {
      setTaskRecords([]);
      setTaskRecordsLoading(true);
    });
    return watchTaskAssignments(
      profile,
      academicConfig,
      (tasks) => {
        setTaskRecords(tasks);
        setTaskRecordsLoading(false);
      },
      (error) => {
        setTaskRecordsLoading(false);
        reportFirebaseError("cargar tareas", error);
      },
    );
  }, [academicConfig, firebaseUser, profile]);

  useEffect(() => {
    if (firebaseUser) return;
    queueMicrotask(() => {
      setStoredAcademicConfig(defaultAcademicConfig);
      setAcademicCalendar(defaultAcademicCalendar);
      setTaskRecords(
        legacyTasksToAssignments(
          createDemoState().tasks,
          defaultAcademicConfig,
          demoProfiles[demoRole],
        ),
      );
      setTaskRecordsLoading(false);
    });
  }, [demoRole, firebaseUser]);

  useEffect(() => {
    if (!firebaseUser || !profile) return;
    queueMicrotask(() => {
      setReviewRecords([]);
      setReviewRecordsLoading(true);
    });
    return watchWeeklyReviews(
      profile,
      (reviews) => {
        setReviewRecords(reviews);
        setReviewRecordsLoading(false);
      },
      (error) => {
        setReviewRecordsLoading(false);
        reportFirebaseError("cargar repasos", error);
      },
    );
  }, [firebaseUser, profile, reviewRecordsRevision]);

  useEffect(() => {
    if (firebaseUser) return;
    queueMicrotask(() => {
      setReviewRecords(
        legacyReviewsToWeeklyReviews(
          state.reviews,
          currentProfile,
          academicConfig,
          managedAccounts,
        ),
      );
      setReviewRecordsLoading(false);
    });
  }, [academicConfig, currentProfile, demoRole, firebaseUser, managedAccounts, state.reviews]);

  useEffect(() => {
    if (!firebaseUser || !profile) return;
    return watchTaskNotifications(
      profile.uid,
      (notifications) =>
        setState((previous) => ({ ...previous, notifications })),
      (error) => reportFirebaseError("cargar notificaciones", error),
    );
  }, [firebaseUser, profile]);

  useEffect(() => {
    if (!firebaseUser || !profile) return;
    return watchForumWorkspace(
      profile,
      (workspace) =>
        setState((previous) => ({
          ...previous,
          forumTopics: workspace.topics,
          forumModeration: workspace.moderation,
          forumBans: workspace.bans,
        })),
      (error) => reportFirebaseError("cargar el foro", error),
    );
  }, [firebaseUser, profile]);

  useEffect(() => {
    if (!firebaseConfigured) return;
    return watchAuth(async (user) => {
      setAuthReady(false);
      setAuthFailure(null);
      setFirebaseUser(user);
      if (!user) {
        setProfile(null);
        setAuthReady(true);
        return;
      }
      try {
        const nextProfile = await getProfile(user);
        if (nextProfile) {
          const access = await refreshPortalAccess(user);
          if (access.institutionId !== nextProfile.institutionId) {
            throw new Error("El acceso institucional no coincide con el perfil.");
          }
          setStoredAcademicConfig((current) => ({
            ...current,
            institutionId: nextProfile.institutionId,
          }));
          setState(await loadPortalState(nextProfile));
        }
        setProfile(nextProfile);
      } catch (error) {
        const message = reportFirebaseError("inicializar acceso", error);
        setAuthFailure(message);
      } finally {
        setAuthReady(true);
      }
    });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = state.settings.theme;
    window.localStorage.setItem("cehf-theme", state.settings.theme);
    document.documentElement.classList.toggle(
      "reduce-motion",
      state.settings.reducedMotion,
    );
  }, [state.settings]);

  useEffect(() => {
    if (!authReady || activeSection !== "weekly-progress") return;
    if (role === "student") {
      window.history.replaceState({}, "", routes.dashboard);
      queueMicrotask(() => setActiveSection("dashboard"));
      return;
    }
    if (window.location.pathname !== routes["weekly-progress"]) {
      window.history.replaceState({}, "", routes["weekly-progress"]);
    }
  }, [activeSection, authReady, role]);

  useEffect(() => {
    if (!firebaseUser || !profile || role === "student") return;
    let active = true;
    queueMicrotask(() => setManagedAccountsLoading(true));
    void listManagedAccounts(profile.institutionId, profile.role)
      .then((accounts) => {
        if (active) setManagedAccounts(accounts);
      })
      .catch((error) => {
        if (active) reportFirebaseError("cargar comunidad escolar", error);
      })
      .finally(() => {
        if (active) setManagedAccountsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [firebaseUser, profile, role]);

  useEffect(() => {
    if (firebaseUser) return;
    const savedAccounts = window.localStorage.getItem("cehf-demo-accounts");
    if (!savedAccounts) return;
    try {
      const restored = JSON.parse(savedAccounts) as ManagedAccount[];
      if (Array.isArray(restored)) {
        queueMicrotask(() => setManagedAccounts(restored));
      }
    } catch {
      window.localStorage.removeItem("cehf-demo-accounts");
    }
  }, [firebaseUser]);

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
    setDetailOpen(null);
    setSidebarOpen(false);
    setMobileMore(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openTaskDetail(taskId: string) {
    window.history.pushState({}, "", `/tasks/${encodeURIComponent(taskId)}`);
    setActiveSection("tasks");
    setDetailOpen(taskId);
  }

  function closeTaskDetail() {
    window.history.pushState({}, "", "/tasks");
    setActiveSection("tasks");
    setDetailOpen(null);
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
          reportFirebaseError("guardar estado del portal", error),
        );
      }
      return next;
    });
    if (successMessage) toast.success(successMessage);
  }

  function updateSettings(
    updater: (previous: PortalSettings) => PortalSettings,
    successMessage?: string,
  ) {
    setState((previous) => {
      const settings = updater(previous.settings);
      const next = { ...previous, settings };
      if (usingDemo) {
        window.localStorage.setItem("cehf-demo-state", JSON.stringify(next));
      } else if (profile) {
        void savePortalSettings(settings, profile).catch((error) =>
          reportFirebaseError("guardar preferencias de apariencia", error),
        );
      }
      return next;
    });
    if (successMessage) toast.success(successMessage);
  }

  function toggleTheme() {
    updateSettings((previous) => ({
        ...previous,
        theme: darkModeActive ? "light" : "dark",
    }));
  }

  function addManagedAccount(account: ManagedAccount) {
    setManagedAccounts((previous) => {
      const next = [account, ...previous].sort((first, second) =>
        first.name.localeCompare(second.name, "es"),
      );
      if (usingDemo) {
        window.localStorage.setItem("cehf-demo-accounts", JSON.stringify(next));
      }
      return next;
    });
  }

  function replaceManagedAccount(account: ManagedAccount) {
    setManagedAccounts((previous) => {
      const next = previous
        .map((item) => (item.uid === account.uid ? account : item))
        .sort((first, second) => first.name.localeCompare(second.name, "es"));
      if (usingDemo) {
        window.localStorage.setItem("cehf-demo-accounts", JSON.stringify(next));
      }
      return next;
    });
  }

  function removeManagedAccount(uid: string) {
    setManagedAccounts((previous) => {
      const next = previous.filter((item) => item.uid !== uid);
      if (usingDemo) {
        window.localStorage.setItem("cehf-demo-accounts", JSON.stringify(next));
      }
      return next;
    });
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

  if (firebaseUser && authFailure) {
    return (
      <GuidedState
        icon={AlertCircle}
        title="No pudimos cargar tu acceso"
        description={authFailure}
        actionLabel="Reintentar"
        onAction={() => window.location.reload()}
      />
    );
  }

  if (firebaseUser && !profile) {
    return (
      <GuidedState
        icon={ShieldCheck}
        title="Tu cuenta necesita una asignación"
        description="La cuenta existe, pero todavía no tiene un perfil de Campus CEHF. Pide a Dirección que complete tu rol y grupo."
        actionLabel="Cerrar sesión"
        onAction={() => void logoutFirebase()}
      />
    );
  }

  const visibleNavigation = navigation.filter(
    (item) => !item.roles || item.roles.includes(role),
  );
  const title = pageTitles[activeSection];
  const currentWeekRange = academicWeekRange(academicConfig);
  const headingEyebrow =
    activeSection === "dashboard"
      ? academicConfig.calendarStatus === "active"
        ? `${academicConfig.weekLabel} · ${currentWeekRange}`
        : academicConfig.weekLabel
      : title.eyebrow;

  return (
    <div
      className={`app-shell ${sidebarCollapsed ? "sidebar-is-collapsed" : ""}`}
    >
      <Toaster position="top-center" richColors closeButton />
      <div
        className={`sidebar-backdrop ${sidebarOpen ? "is-open" : ""}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />
      <aside
        className={`sidebar ${sidebarOpen ? "is-open" : ""} ${sidebarCollapsed ? "is-collapsed" : ""}`}
        aria-label="Menú principal"
      >
        <div className="sidebar-header">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true">
              <span>CE</span>
            </div>
            <div className="brand-copy">
              <strong>CEHF</strong>
              <span>Campus</span>
            </div>
          </div>
          <button
            className="sidebar-toggle"
            type="button"
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            aria-label={sidebarCollapsed ? "Expandir menú" : "Contraer menú"}
            aria-expanded={!sidebarCollapsed}
            title={sidebarCollapsed ? "Expandir menú" : "Contraer menú"}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen size={16} aria-hidden="true" />
            ) : (
              <PanelLeftClose size={16} aria-hidden="true" />
            )}
          </button>
          <button
            className="sidebar-mobile-close"
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Cerrar menú"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          className={`week-switcher is-${academicConfig.calendarStatus}`}
          onClick={() => {
            setAcademicCalendarOpen(true);
            setSidebarOpen(false);
          }}
          aria-haspopup="dialog"
          aria-label={`Abrir calendario académico. ${academicConfig.weekLabel}`}
          title={`Abrir calendario académico. ${academicConfig.weekLabel}. ${
            academicConfig.calendarStatus === "active"
              ? `${currentWeekRange}, ${academicConfig.termLabel}`
              : "Dirección debe configurarlo"
          }`}
        >
          <span className="week-switcher-icon" aria-hidden="true">
            <CalendarDays size={16} />
          </span>
          <div className="week-switcher-copy">
            <span>
              {academicConfig.calendarStatus === "active"
                ? "Semana actual"
                : "Calendario académico"}
            </span>
            <strong>{academicConfig.weekLabel}</strong>
            <small>
              {academicConfig.calendarStatus === "active"
                ? `${currentWeekRange} · ${academicConfig.termLabel}`
                : academicConfig.nextWeekLabel && academicConfig.nextWeekStartDate
                  ? `Próxima: ${academicConfig.nextWeekLabel}`
                  : "Dirección debe configurarlo"}
            </small>
          </div>
          <span className="week-switcher-action" aria-hidden="true">
            <span>Ver</span>
            <ChevronRight size={14} />
          </span>
        </button>
        <nav className="sidebar-nav" aria-label="Navegación principal">
          <span className="nav-kicker">Tu portal</span>
          {visibleNavigation.map((item) => (
            <button
              className={activeSection === item.key ? "active" : ""}
              key={item.key}
              onClick={() => navigate(item.key)}
              title={sidebarCollapsed ? item.label : undefined}
            >
              <item.icon size={19} aria-hidden="true" />
              <span>{item.label}</span>
              {item.key === "tasks" && role === "student" && (
                <span className="nav-count">
                  {
                    taskRecords.filter(
                      (task) =>
                        task.status === "published" &&
                        new Date(task.dueAt).getTime() >= Date.now(),
                    ).length
                  }
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button
            className={activeSection === "settings" ? "active" : ""}
            onClick={() => navigate("settings")}
            title={sidebarCollapsed ? "Configuración" : undefined}
          >
            <Settings size={19} aria-hidden="true" />
            <span>Configuración</span>
          </button>
          <button
            className={activeSection === "profile" ? "active" : ""}
            onClick={() => navigate("profile")}
            title={sidebarCollapsed ? "Perfil" : undefined}
          >
            <UserRound size={19} aria-hidden="true" />
            <span>Perfil</span>
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
              placeholder="Buscar tareas, recursos o temas…"
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
            <div className="notification-wrap" ref={notificationWrapRef}>
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
                      firebaseUser && profile
                        ? void markTaskNotificationsRead(profile.uid)
                            .then(() =>
                              toast.success("Notificaciones marcadas como leídas"),
                            )
                            .catch((error) =>
                              toast.error(friendlyFirebaseError(error)),
                            )
                        : updateState(
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
              <span className="eyebrow">{headingEyebrow}</span>
              <h1>
                {title.title}
                {activeSection === "dashboard"
                  ? `, ${currentProfile.name.split(" ")[0]}`
                  : ""}
              </h1>
            </div>
            <div className="page-heading-actions">
              <span
                className={"page-week-context is-" + academicConfig.calendarStatus}
                title={
                  academicConfig.calendarStatus === "active"
                    ? [currentWeekRange, academicConfig.termLabel].join(" · ")
                    : academicConfig.nextWeekLabel
                      ? "Próxima: " + academicConfig.nextWeekLabel
                      : "Calendario sin configurar"
                }
              >
                <CalendarDays size={15} />
                <span>
                  <small>Semana actual</small>
                  <strong>{academicConfig.weekLabel}</strong>
                </span>
              </span>
              {["teacher", "director"].includes(role) &&
                (activeSection !== "users" || role === "director") &&
                [
                  "weekly-review",
                  "tasks",
                  "forum",
                  "users",
                ].includes(activeSection) && (
                  <button
                    className="primary-button"
                    disabled={
                      (activeSection === "tasks" &&
                        academicConfig.calendarStatus !== "active") ||
                      (activeSection === "weekly-review" &&
                        academicCalendar.weeks.length === 0)
                    }
                    title={
                      activeSection === "tasks" &&
                      academicConfig.calendarStatus !== "active"
                        ? "Dirección debe configurar una semana activa"
                        : activeSection === "weekly-review" &&
                            academicCalendar.weeks.length === 0
                          ? "Dirección debe configurar las semanas académicas"
                        : undefined
                    }
                    onClick={() => setCreateOpen(true)}
                  >
                    <Plus size={18} />
                    {createLabel(activeSection)}
                  </button>
                )}
            </div>
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
              updateSettings={updateSettings}
              openDetail={openTaskDetail}
              taskRecords={taskRecords}
              taskRecordsLoading={taskRecordsLoading}
              reviewRecords={reviewRecords}
              reviewRecordsLoading={reviewRecordsLoading}
              onDemoReviewChange={(updatedReview) =>
                setReviewRecords((previous) =>
                  previous.map((review) =>
                    review.id === updatedReview.id ? updatedReview : review,
                  ),
                )
              }
              academicConfig={academicConfig}
              academicCalendar={academicCalendar}
              saveAcademicCalendarConfiguration={async (input) => {
                if (firebaseUser) {
                  await saveAcademicCalendar(input);
                } else {
                  setStoredAcademicConfig((current) => ({
                    ...current,
                    schoolYearId: input.schoolYearId,
                    schoolYearLabel: input.schoolYearLabel,
                    timezone: input.timezone,
                  }));
                  setAcademicCalendar(demoCalendarFromInput(input));
                }
              }}
              managedAccounts={managedAccounts}
              managedAccountsLoading={managedAccountsLoading}
              updateManagedAccountState={replaceManagedAccount}
              removeManagedAccountState={removeManagedAccount}
              firebaseReady={Boolean(firebaseUser && profile)}
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
        {academicCalendarOpen && (
          <AcademicCalendarModal
            calendar={academicCalendarImage}
            loading={academicCalendarImageLoading}
            saving={academicCalendarSaving}
            role={role}
            onClose={() => setAcademicCalendarOpen(false)}
            onPublish={async (file) => {
              setAcademicCalendarSaving(true);
              try {
                if (firebaseUser && profile) {
                  const publishedCalendar = await publishAcademicCalendarImage(
                    file,
                    profile,
                    academicCalendarImage,
                  );
                  setAcademicCalendarImage(publishedCalendar);
                } else {
                  const imageUrl = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(String(reader.result ?? ""));
                    reader.onerror = () => reject(new Error("No pudimos leer la imagen."));
                    reader.readAsDataURL(file);
                  });
                  setAcademicCalendarImage({
                    institutionId: currentProfile.institutionId,
                    imagePath: "demo/academic-calendar",
                    imageUrl,
                    fileName: file.name,
                    contentType: file.type,
                    size: file.size,
                    published: true,
                    updatedBy: currentProfile.uid,
                    updatedByName: currentProfile.name,
                    updatedAt: new Date().toISOString(),
                  });
                }
                toast.success("Calendario académico publicado", {
                  description: "Alumnos y maestros ya pueden consultarlo desde el sidebar.",
                });
                return true;
              } catch (error) {
                reportFirebaseError("publicar calendario académico", error);
                return false;
              } finally {
                setAcademicCalendarSaving(false);
              }
            }}
            onRemove={async () => {
              if (!academicCalendarImage) return;
              setAcademicCalendarSaving(true);
              try {
                if (firebaseUser && profile) {
                  await unpublishAcademicCalendarImage(profile, academicCalendarImage);
                }
                setAcademicCalendarImage(null);
                toast.success("Calendario retirado", {
                  description: "Puedes publicar una nueva imagen cuando esté lista.",
                });
              } catch (error) {
                reportFirebaseError("retirar calendario académico", error);
              } finally {
                setAcademicCalendarSaving(false);
              }
            }}
          />
        )}
        {mobileMore && (
          <MobileMore
            navigation={visibleNavigation}
            onClose={() => setMobileMore(false)}
            onNavigate={navigate}
          />
        )}
        {createOpen && activeSection === "weekly-review" ? (
          <ReviewCreateModal
            profile={currentProfile}
            config={academicConfig}
            calendar={academicCalendar}
            accounts={managedAccounts}
            onClose={() => setCreateOpen(false)}
            onCreate={async (input: WeeklyReviewCreateInput) => {
              if (firebaseUser && profile) {
                const result = await createWeeklyReview(
                  input,
                  profile,
                  academicConfig,
                  academicCalendar,
                );
                setReviewRecordsRevision((current) => current + 1);
                toast.success(
                  input.status === "published"
                    ? "Repaso publicado"
                    : "Borrador guardado",
                  {
                    description:
                      input.status === "published"
                        ? `${result.recipientCount} ${result.recipientCount === 1 ? "alumno fue notificado" : "alumnos fueron notificados"}.`
                        : "Puedes publicarlo cuando esté listo.",
                  },
                );
              } else {
                const review = createDemoWeeklyReview(
                  input,
                  currentProfile,
                  academicConfig,
                  academicCalendar,
                  managedAccounts,
                );
                setReviewRecords((previous) => [review, ...previous]);
                toast.success(
                  input.status === "published"
                    ? "Repaso publicado en la demostración"
                    : "Borrador guardado en la demostración",
                  {
                    description: `${review.audienceCount} destinatarios preparados.`,
                  },
                );
              }
            }}
          />
        ) : createOpen && activeSection === "tasks" ? (
          <TaskCreateModal
            config={academicConfig}
            accounts={managedAccounts}
            onClose={() => setCreateOpen(false)}
            onCreate={async (input: TaskCreateInput) => {
              if (firebaseUser && profile) {
                await createTaskAssignment(input, profile, academicConfig);
              } else {
                setTaskRecords((previous) => [
                  createDemoTask(input, currentProfile, academicConfig),
                  ...previous,
                ]);
              }
              toast.success(
                input.publicationMode === "now"
                  ? "Tarea publicada y notificación preparada"
                  : input.publicationMode === "scheduled"
                    ? "Tarea programada"
                    : "Borrador guardado",
              );
            }}
          />
        ) : createOpen && activeSection === "users" ? (
          <AccountRegistrationModal
            accounts={managedAccounts}
            firebaseReady={firebaseConfigured && Boolean(firebaseUser)}
            institutionId={currentProfile.institutionId}
            onClose={() => setCreateOpen(false)}
            onCreated={addManagedAccount}
          />
        ) : createOpen ? (
          <CreateModal
            section={activeSection}
            forumGroups={[
              ...new Set(
                managedAccounts
                  .filter((account) => account.role === "student")
                  .map((account) =>
                    `${account.grade ?? ""} ${account.group ?? ""}`.trim(),
                  )
                  .filter(Boolean),
              ),
            ]}
            forumSubjects={currentProfile.subjects ?? []}
            onClose={() => setCreateOpen(false)}
            onCreate={async (titleValue, subject, forumDraft) => {
              if (
                activeSection === "forum" &&
                firebaseUser &&
                profile &&
                forumDraft
              ) {
                await createForumTopic({
                  title: titleValue,
                  subject,
                  ...forumDraft,
                });
                toast.success(
                  forumDraft.status === "scheduled"
                    ? "Conversación programada y grupo notificado"
                    : "Conversación publicada y grupo notificado",
                );
                setCreateOpen(false);
                return;
              }
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
        ) : null}
        {detailOpen && taskRecords.find((task) => task.id === detailOpen) && (
          <TaskDetailModal
            task={taskRecords.find((task) => task.id === detailOpen)!}
            profile={currentProfile}
            accounts={managedAccounts}
            firebaseReady={Boolean(firebaseUser && profile)}
            onClose={closeTaskDetail}
            onDemoTaskChange={(updatedTask) =>
              setTaskRecords((previous) =>
                previous.map((task) => (task.id === updatedTask.id ? updatedTask : task)),
              )
            }
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
    if (!email.trim() || !password) {
      setError("Completa los datos solicitados para continuar.");
      return;
    }
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    setBusy(true);
    try {
      await loginWithEmail(email, password, remember);
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
            <span>Campus</span>
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
            Todo lo que necesitas para aprender, avanzar y conectar con tu
            comunidad, en cada etapa.
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
          <span>— Comunidad Campus CEHF</span>
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
                <span>Campus</span>
              </div>
            </div>
          </div>
          <span className="login-kicker">
            <span />
            ACCESO INSTITUCIONAL
          </span>
          <h2>
            Qué bueno verte.
          </h2>
          <p>
            Ingresa con la cuenta que Dirección creó para ti.
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
              autoComplete="current-password"
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

          <button
            className="login-button"
            type="submit"
            disabled={busy || resetting || !configured}
          >
            {busy ? <span className="button-spinner" /> : <LogIn size={17} />}
            {busy
              ? "Verificando acceso…"
              : "Entrar a CEHF"}
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
  updateSettings,
  openDetail,
  taskRecords,
  taskRecordsLoading,
  reviewRecords,
  reviewRecordsLoading,
  onDemoReviewChange,
  academicConfig,
  academicCalendar,
  saveAcademicCalendarConfiguration,
  managedAccounts,
  managedAccountsLoading,
  updateManagedAccountState,
  removeManagedAccountState,
  firebaseReady,
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
  updateSettings: (
    updater: (previous: PortalSettings) => PortalSettings,
    message?: string,
  ) => void;
  openDetail: (id: string) => void;
  taskRecords: TaskAssignment[];
  taskRecordsLoading: boolean;
  reviewRecords: WeeklyReview[];
  reviewRecordsLoading: boolean;
  onDemoReviewChange: (review: WeeklyReview) => void;
  academicConfig: AcademicConfig;
  academicCalendar: AcademicCalendar;
  saveAcademicCalendarConfiguration: (
    input: AcademicCalendarInput,
  ) => Promise<void>;
  managedAccounts: ManagedAccount[];
  managedAccountsLoading: boolean;
  updateManagedAccountState: (account: ManagedAccount) => void;
  removeManagedAccountState: (uid: string) => void;
  firebaseReady: boolean;
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
          profile={profile}
          academicConfig={academicConfig}
          academicCalendar={academicCalendar}
          managedAccounts={managedAccounts}
          firebaseReady={firebaseReady}
        />
      );
    case "weekly-review":
      return (
        <ReviewsPage
          reviews={reviewRecords}
          loading={reviewRecordsLoading}
          profile={profile}
          calendar={academicCalendar}
          accounts={managedAccounts}
          firebaseReady={firebaseReady}
          onDemoReviewChange={onDemoReviewChange}
        />
      );
    case "tasks":
      return (
        <TaskListPage
          role={role}
          tasks={taskRecords}
          loading={taskRecordsLoading}
          openDetail={openDetail}
        />
      );
    case "weekly-progress":
      return role === "student" ? null : (
        <StaffWorkspacePage
          profile={profile}
          accounts={managedAccounts}
          firebaseReady={firebaseReady}
        />
      );
    case "reports":
      return (
        <AcademicReportsPage
          profile={profile}
          academicConfig={academicConfig}
          calendar={academicCalendar}
          accounts={managedAccounts}
          firebaseReady={firebaseReady}
        />
      );
    case "wall-newspaper":
      return (
        <WallNewspaperPage
          state={state}
          updateState={updateState}
          profile={profile}
          accounts={managedAccounts}
          firebaseReady={firebaseReady}
        />
      );
    case "forum":
      return (
        <ForumPage
          state={state}
          updateState={updateState}
          profile={profile}
          role={role}
          managedAccounts={managedAccounts}
          firebaseReady={firebaseReady}
        />
      );
    case "workshops":
      return (
        <WorkshopsPage
          profile={profile}
          role={role}
          managedAccounts={managedAccounts}
          firebaseReady={firebaseReady}
        />
      );
    case "users":
      return (
        <CommunityUsersPage
          role={role}
          accounts={managedAccounts}
          loading={managedAccountsLoading}
          firebaseReady={firebaseReady}
          institutionId={profile.institutionId}
          onUpdated={updateManagedAccountState}
          onRemoved={removeManagedAccountState}
        />
      );
    case "settings":
      return (
        <SettingsPage
          state={state}
          updateSettings={updateSettings}
          role={role}
          profile={profile}
          academicConfig={academicConfig}
          academicCalendar={academicCalendar}
          saveAcademicCalendarConfiguration={saveAcademicCalendarConfiguration}
          institutionId={profile.institutionId}
          managedAccounts={managedAccounts}
          firebaseReady={firebaseReady}
        />
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
                ? "Nuestra comunidad avanza con una semana bien preparada."
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
              {director ? "Ver calificaciones institucionales" : "Capturar calificaciones"}
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
            Ver mis calificaciones <ArrowRight size={17} />
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
                <Paperclip size={20} />
              </span>
              <span className="soft-tag">Matemáticas</span>
            </div>
            <span className="card-kicker">Recurso de tarea</span>
            <h3>Guía visual del tema</h3>
            <p>Consulta el vídeo desde los recursos de tu actividad.</p>
            <div className="due-line">
              <CheckCircle2 size={16} /> Recurso obligatorio
            </div>
            <button
              className="card-action"
              onClick={() => navigate("tasks")}
            >
              Ver recursos <ArrowRight size={17} />
            </button>
          </article>
        </div>
      </section>

      <section className="two-column student-lower">
        <article className="panel">
          <PanelHeading title="Así vas esta semana" />
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
  const canEdit = role === "director";

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
              if (role !== "director") return;
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
          <p>Al guardar, el versículo aparecerá en el Inicio de todos los usuarios.</p>
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
  profile,
  academicConfig,
  academicCalendar,
  managedAccounts,
  firebaseReady,
}: {
  profile: UserProfile;
  academicConfig: AcademicConfig;
  academicCalendar: AcademicCalendar;
  managedAccounts: ManagedAccount[];
  firebaseReady: boolean;
}) {
  return (
    <div className="qualifications-page">
      <AcademicGradesPanel
        profile={profile}
        academicConfig={academicConfig}
        calendar={academicCalendar}
        accounts={managedAccounts}
        firebaseReady={firebaseReady}
      />
    </div>
  );
}

function SettingsPage({
  state,
  updateSettings,
  role,
  profile,
  academicConfig,
  academicCalendar,
  saveAcademicCalendarConfiguration,
  institutionId,
  managedAccounts,
  firebaseReady,
}: {
  state: PortalState;
  updateSettings: (
    updater: (previous: PortalSettings) => PortalSettings,
    message?: string,
  ) => void;
  role: Role;
  profile: UserProfile;
  academicConfig: AcademicConfig;
  academicCalendar: AcademicCalendar;
  saveAcademicCalendarConfiguration: (
    input: AcademicCalendarInput,
  ) => Promise<void>;
  institutionId: string;
  managedAccounts: ManagedAccount[];
  firebaseReady: boolean;
}) {
  const [activeSettingsTab, setActiveSettingsTab] =
    useState<SettingsTabId>(() =>
      typeof window === "undefined"
        ? "appearance"
        : settingsTabFromPath(window.location.pathname),
    );
  const [demoSeedLoading, setDemoSeedLoading] = useState(false);
  const [demoSeedClearing, setDemoSeedClearing] = useState(false);
  const [demoSeedCounts, setDemoSeedCounts] = useState<DemoSeedCounts | null>(null);

  useEffect(() => {
    const syncSettingsRoute = () => {
      const requestedTab = settingsTabFromPath(window.location.pathname);
      const nextTab = canOpenSettingsTab(requestedTab, role)
        ? requestedTab
        : "appearance";
      setActiveSettingsTab(nextTab);
      if (window.location.pathname !== settingsRoutes[nextTab]) {
        window.history.replaceState({}, "", settingsRoutes[nextTab]);
      }
    };
    syncSettingsRoute();
    window.addEventListener("popstate", syncSettingsRoute);
    return () => window.removeEventListener("popstate", syncSettingsRoute);
  }, [role]);

  const openSettingsTab = (tab: SettingsTabId) => {
    window.history.pushState({}, "", settingsRoutes[tab]);
    setActiveSettingsTab(tab);
  };

  const handleDemoSeed = async () => {
    if (demoSeedLoading) return;
    setDemoSeedLoading(true);
    try {
      const result = await loadInstitutionDemoData();
      setDemoSeedCounts(result.counts);
      toast.success("Datos de demostración cargados en Firebase");
    } catch (error) {
      toast.error(friendlyFirebaseError(error));
    } finally {
      setDemoSeedLoading(false);
    }
  };

  const handleDemoSeedClear = async () => {
    if (demoSeedClearing) return;
    setDemoSeedClearing(true);
    try {
      const result = await clearInstitutionDemoData();
      setDemoSeedCounts(null);
      toast.success(
        result.alreadyClean
          ? "La semilla ya estaba eliminada"
          : `${result.deleted} documentos demo eliminados`,
      );
    } catch (error) {
      toast.error(friendlyFirebaseError(error));
    } finally {
      setDemoSeedClearing(false);
    }
  };
  const settingsTabs: Array<{
    id: SettingsTabId;
    label: string;
    description: string;
    icon: ReactNode;
  }> = [
    {
      id: "appearance",
      label: "Apariencia",
      description: "Tema y accesibilidad",
      icon: <Sun size={18} />,
    },
    {
      id: "notifications",
      label: "Notificaciones",
      description: "Avisos del portal",
      icon: <Bell size={18} />,
    },
    ...(role === "teacher"
      ? [
          {
            id: "grading" as const,
            label: "Calificaciones",
            description: "Porcentajes y ponderación",
            icon: <GraduationCap size={18} />,
          },
        ]
      : []),
    ...(["director", "teacher"].includes(role)
      ? [
          {
            id: "whatsapp" as const,
            label: "WhatsApp",
            description: role === "director" ? "Mensajes a familias" : "Historial de envíos",
            icon: <MessageCircle size={18} />,
          },
        ]
      : []),
    ...(role === "director"
      ? [
          {
            id: "academic" as const,
            label: "Académico",
            description: "Ciclo y calendario",
            icon: <CalendarDays size={18} />,
          },
        ]
      : []),
  ];

  return (
    <div className="settings-page">
      <nav
        aria-label="Secciones de configuración"
        className="panel settings-tabs"
        role="tablist"
      >
        {settingsTabs.map((tab, index) => (
          <button
            aria-controls={`settings-panel-${tab.id}`}
            aria-selected={activeSettingsTab === tab.id}
            className={activeSettingsTab === tab.id ? "active" : ""}
            id={`settings-tab-${tab.id}`}
            key={tab.id}
            onClick={() => openSettingsTab(tab.id)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
                return;
              }
              event.preventDefault();
              const direction = event.key === "ArrowRight" ? 1 : -1;
              const nextIndex =
                (index + direction + settingsTabs.length) % settingsTabs.length;
              const nextTab = settingsTabs[nextIndex];
              openSettingsTab(nextTab.id);
              document.getElementById(`settings-tab-${nextTab.id}`)?.focus();
            }}
            role="tab"
            tabIndex={activeSettingsTab === tab.id ? 0 : -1}
            type="button"
          >
            <span className="settings-tab-icon">{tab.icon}</span>
            <span>
              <strong>{tab.label}</strong>
              <small>{tab.description}</small>
            </span>
          </button>
        ))}
      </nav>

      <div className="settings-tab-content">
        <div
          aria-labelledby="settings-tab-appearance"
          className="settings-tab-panel"
          hidden={activeSettingsTab !== "appearance"}
          id="settings-panel-appearance"
          role="tabpanel"
        >
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
                      updateSettings(
                        (previous) => ({
                          ...previous,
                          theme,
                        }),
                        "Preferencia guardada",
                      )
                    }
                    type="button"
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
                  updateSettings((previous) => ({
                    ...previous,
                    reducedMotion: checked,
                  }))
                }
              />
            </div>
          </section>
        </div>

        <div
          aria-labelledby="settings-tab-notifications"
          className="settings-tab-panel"
          hidden={activeSettingsTab !== "notifications"}
          id="settings-panel-notifications"
          role="tabpanel"
        >
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
                <span>Tareas, recursos, repasos y reportes.</span>
              </div>
              <Toggle checked label="Avisos internos" onChange={() => undefined} />
            </div>
          </section>
        </div>

        {role === "teacher" && (
          <div
            aria-labelledby="settings-tab-grading"
            className="settings-tab-panel"
            hidden={activeSettingsTab !== "grading"}
            id="settings-panel-grading"
            role="tabpanel"
          >
            <GradingWeightsCard profile={profile} firebaseReady={firebaseReady} />
          </div>
        )}

        {["director", "teacher"].includes(role) && (
          <div
            aria-labelledby="settings-tab-whatsapp"
            className="settings-tab-panel"
            hidden={activeSettingsTab !== "whatsapp"}
            id="settings-panel-whatsapp"
            role="tabpanel"
          >
            <WhatsAppAdminPanel
              institutionId={institutionId}
              accounts={managedAccounts}
              firebaseReady={firebaseReady}
              role={role}
            />
          </div>
        )}

        {role === "director" && (
          <>
            <div
              aria-labelledby="settings-tab-academic"
              className="settings-tab-panel"
              hidden={activeSettingsTab !== "academic"}
              id="settings-panel-academic"
              role="tabpanel"
            >
              <AcademicConfigurationCard
                key={`${academicConfig.schoolYearId}-${academicCalendar.weeks
                  .map((week) => `${week.id}:${week.startDate}:${week.endDate}`)
                  .join("|")}-${academicCalendar.terms
                  .map((term) => `${term.id}:${term.weekIds.join(",")}`)
                  .join("|")}`}
                config={academicConfig}
                calendar={academicCalendar}
                onSave={saveAcademicCalendarConfiguration}
              />
              <section className="panel settings-section demo-seed-card">
                <div className="settings-heading">
                  <span className="settings-icon">
                    <Database size={20} />
                  </span>
                  <div>
                    <h2>Datos de demostración</h2>
                    <p>Puebla Firebase con información relacionada para revisar todos los módulos.</p>
                  </div>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>Carga segura y repetible</strong>
                    <span>
                      Crea 12 alumnos, 3 docentes y al menos 10 registros en tareas,
                      repasos, materiales, reportes, mural, foro y talleres. No activa
                      mensajes reales ni crea accesos de autenticación.
                    </span>
                  </div>
                  <button
                    className="primary-button"
                    disabled={!firebaseReady || demoSeedLoading || demoSeedClearing}
                    onClick={() => void handleDemoSeed()}
                    type="button"
                  >
                    {demoSeedLoading ? <LoaderCircle className="spin" size={16} /> : <Database size={16} />}
                    {demoSeedLoading ? "Cargando…" : "Cargar datos demo"}
                  </button>
                  <button
                    className="danger-button"
                    disabled={!firebaseReady || demoSeedLoading || demoSeedClearing}
                    onClick={() => void handleDemoSeedClear()}
                    type="button"
                  >
                    {demoSeedClearing ? <LoaderCircle className="spin" size={16} /> : <X size={16} />}
                    {demoSeedClearing ? "Eliminando…" : "Eliminar datos demo"}
                  </button>
                </div>
                {demoSeedCounts && (
                  <div className="demo-seed-summary" role="status">
                    <strong>Carga completada</strong>
                    <span>{demoSeedCounts.dailyGrades} calificaciones diarias</span>
                    <span>{demoSeedCounts.weeklyReports} reportes semanales</span>
                    <span>{demoSeedCounts.tasks} tareas</span>
                    <span>{demoSeedCounts.reviews} repasos</span>
                    <span>{demoSeedCounts.wallPosts} publicaciones</span>
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </div>
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

function AccountRegistrationModal({
  accounts,
  firebaseReady,
  institutionId,
  onClose,
  onCreated,
}: {
  accounts: ManagedAccount[];
  firebaseReady: boolean;
  institutionId: string;
  onClose: () => void;
  onCreated: (account: ManagedAccount) => void;
}) {
  const [accountRole, setAccountRole] = useState<"student" | "teacher">(
    "student",
  );
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [guardianWhatsApp, setGuardianWhatsApp] = useState("");
  const [schoolLevel, setSchoolLevel] = useState<SchoolLevel>("primary");
  const [grade, setGrade] = useState("5.º");
  const [group, setGroup] = useState("A");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [teacherIds, setTeacherIds] = useState<string[]>([]);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [credentials, setCredentials] = useState<{
    account: ManagedAccount;
    password: string;
  } | null>(null);
  const teachers = accounts.filter((account) => account.role === "teacher");
  const compatibleTeachers = teachers.filter(
    (teacher) =>
      subjects.length === 0 ||
      teacher.subjects.some((subject) => subjects.includes(subject)),
  );
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const validGuardianWhatsApp =
    accountRole === "teacher" || Boolean(normalizeGuardianWhatsApp(guardianWhatsApp));
  const validGuardianName = accountRole === "teacher" || guardianName.trim().length >= 2;
  const validStudentAssignment =
    accountRole === "teacher" ||
    (gradesBySchoolLevel[schoolLevel].includes(grade) && Boolean(group));
  const identityComplete = Boolean(
    firstName.trim() &&
      lastName.trim() &&
      validEmail &&
      validGuardianName &&
      validGuardianWhatsApp &&
      photo,
  );
  const assignmentComplete =
    validStudentAssignment &&
    subjects.length > 0 &&
    (accountRole === "teacher" || teacherIds.length > 0);
  const ready = identityComplete && assignmentComplete;
  const displayName =
    `${firstName.trim()} ${lastName.trim()}`.trim() ||
    (accountRole === "student" ? "Nuevo alumno" : "Nuevo maestro");

  useEffect(
    () => () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    },
    [photoPreview],
  );

  useEffect(() => {
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", closeWithEscape);
    return () => window.removeEventListener("keydown", closeWithEscape);
  }, [onClose, submitting]);

  function selectRole(nextRole: "student" | "teacher") {
    setAccountRole(nextRole);
    setTeacherIds([]);
  }

  function selectSchoolLevel(nextLevel: SchoolLevel) {
    setSchoolLevel(nextLevel);
    setGrade(nextLevel === "primary" ? "5.º" : "1.º");
  }

  function selectPhoto(file?: File) {
    if (!file) return;
    if (
      !PROFILE_PHOTO_MIME_TYPES.includes(file.type) ||
      file.size >= 4 * 1024 * 1024
    ) {
      toast.error("Fotografía no válida", {
        description: "Selecciona un JPG, PNG o WEBP menor a 4 MB.",
      });
      return;
    }
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  function generateAvatar() {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) return;
    const gradient = context.createLinearGradient(0, 0, 256, 256);
    gradient.addColorStop(0, "#1F2985");
    gradient.addColorStop(1, "#C62E45");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 256);
    context.fillStyle = "#FFFFFF";
    context.font = "700 92px Georgia";
    context.textAlign = "center";
    context.textBaseline = "middle";
    const initials =
      `${firstName.trim()[0] ?? ""}${lastName.trim()[0] ?? ""}`.toUpperCase() ||
      (accountRole === "student" ? "A" : "M");
    context.fillText(initials, 128, 134);
    canvas.toBlob((blob) => {
      if (blob) selectPhoto(new File([blob], `avatar-${initials}.png`, { type: "image/png" }));
    }, "image/png");
  }

  function toggleSubject(subject: string) {
    const nextSubjects = subjects.includes(subject)
      ? subjects.filter((item) => item !== subject)
      : [...subjects, subject];
    setSubjects(nextSubjects);
    setTeacherIds((current) =>
      current.filter((teacherId) => {
        const teacher = teachers.find((account) => account.uid === teacherId);
        return teacher?.subjects.some((item) => nextSubjects.includes(item));
      }),
    );
  }

  function resetRegistration() {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setFirstName("");
    setLastName("");
    setEmail("");
    setGuardianName("");
    setGuardianWhatsApp("");
    setSchoolLevel("primary");
    setGrade("5.º");
    setGroup("A");
    setSubjects([]);
    setTeacherIds([]);
    setPhoto(null);
    setPhotoPreview("");
    setCredentials(null);
  }

  async function submitRegistration(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || !photo) {
      toast.error("Completa el registro", {
        description:
          accountRole === "student"
            ? "Agrega identidad, nombre y WhatsApp del tutor, fotografía, materias y al menos un maestro."
            : "Agrega identidad, fotografía y al menos una materia.",
      });
      return;
    }
    setSubmitting(true);
    try {
      const result = firebaseReady
        ? await createManagedAccount(
            {
              firstName,
              lastName,
              email,
              role: accountRole,
              schoolLevel: accountRole === "student" ? schoolLevel : undefined,
              grade: accountRole === "student" ? grade : undefined,
              group: accountRole === "student" ? group : undefined,
              guardianName:
                accountRole === "student" ? guardianName : undefined,
              guardianWhatsApp:
                accountRole === "student" ? guardianWhatsApp : undefined,
              subjects,
              teacherIds,
              photo,
            },
            institutionId,
          )
        : await new Promise<{ account: ManagedAccount; password: string }>(
            (resolve) =>
              window.setTimeout(() => {
                const cleanFirstName = firstName.trim();
                const cleanLastName = lastName.trim();
                resolve({
                  account: {
                    uid: `demo-account-${Date.now()}`,
                    firstName: cleanFirstName,
                    lastName: cleanLastName,
                    name: `${cleanFirstName} ${cleanLastName}`,
                    email: email.trim().toLowerCase(),
                    role: accountRole,
                    initials:
                      `${cleanFirstName[0] ?? ""}${cleanLastName[0] ?? ""}`.toUpperCase(),
                    active: true,
                    schoolLevel:
                      accountRole === "student" ? schoolLevel : undefined,
                    grade: accountRole === "student" ? grade : undefined,
                    group: accountRole === "student" ? group : undefined,
                    guardianName:
                      accountRole === "student" ? guardianName.trim() : undefined,
                    guardianWhatsApp:
                      accountRole === "student"
                        ? normalizeGuardianWhatsApp(guardianWhatsApp)
                        : undefined,
                    guardianWhatsAppAuthorized:
                      accountRole === "student" ? true : undefined,
                    subjects,
                    teacherIds: accountRole === "student" ? teacherIds : [],
                    createdAt: new Date().toISOString(),
                  },
                  password: generateTemporaryPassword(),
                });
              }, 720),
          );
      onCreated(result.account);
      setCredentials(result);
      toast.success(
        accountRole === "student"
          ? "Alumno registrado"
          : "Maestro registrado",
        {
          description: firebaseReady
            ? "La cuenta institucional ya puede iniciar sesión."
            : "Cuenta agregada a la demostración; Firebase está listo para conectarse.",
        },
      );
    } catch (error) {
      console.error(
        "[Campus CEHF] registrar cuenta",
        firebaseErrorDetails(error),
      );
      toast.error("No pudimos crear la cuenta", {
        description: friendlyFirebaseError(error),
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function copyCredentials() {
    if (!credentials) return;
    try {
      await navigator.clipboard.writeText(
        `Campus CEHF · ${credentials.account.name}\nCorreo: ${credentials.account.email}\nContraseña temporal: ${credentials.password}\nIngreso: ${window.location.origin}/login`,
      );
      toast.success("Credenciales copiadas");
    } catch {
      toast.error("Selecciona y copia las credenciales manualmente.");
    }
  }

  return (
    <motion.div
      className="modal-backdrop account-registration-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <motion.section
        className={`account-registration-modal ${
          credentials ? "is-complete" : ""
        }`}
        role="dialog"
        aria-modal="true"
        aria-label={credentials ? "Credenciales listas" : "Registrar una cuenta"}
        initial={{ opacity: 0, y: 22, scale: 0.975 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 14, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
      >
        <header className="account-registration-header">
          <div>
            <span className="account-registration-mark">
              {credentials ? <Check size={20} /> : <UserPlus size={20} />}
            </span>
            <div>
              <span className="eyebrow">
                {credentials ? "CUENTA CREADA" : "GESTIÓN DE ACCESOS"}
              </span>
              <h2>{credentials ? "Credenciales listas" : "Registrar una cuenta"}</h2>
            </div>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Cerrar registro"
          >
            <X size={19} />
          </button>
        </header>

        <AnimatePresence mode="wait">
          {credentials ? (
            <motion.div
              className="account-credentials-success"
              key="success"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              <motion.span
                className="account-success-orbit"
                initial={{ scale: 0.55, rotate: -35 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 18 }}
              >
                <Check size={34} />
              </motion.span>
              <span className="role-chip">
                {credentials.account.role === "student"
                  ? `Alumno · ${schoolLevelLabels[credentials.account.schoolLevel ?? "primary"]}`
                  : "Maestro"}
              </span>
              <h3>{credentials.account.name}</h3>
              <p>
                {firebaseReady
                  ? "La cuenta ya puede ingresar al portal con estas credenciales."
                  : "Esta vista demuestra el flujo completo. Al conectar Firebase, la cuenta se creará realmente."}
              </p>
              <div className="account-credential-grid">
                <div>
                  <span>Correo institucional</span>
                  <strong>{credentials.account.email}</strong>
                </div>
                <div>
                  <span>Contraseña temporal</span>
                  <code>{credentials.password}</code>
                </div>
              </div>
              <div className="credential-security-note">
                <LockKeyhole size={17} />
                <span>
                  Guarda la contraseña ahora. Por seguridad no volverá a mostrarse
                  al cerrar esta ventana.
                </span>
              </div>
              <div className="account-success-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={resetRegistration}
                >
                  <UserPlus size={16} /> Registrar otra cuenta
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => void copyCredentials()}
                >
                  <Copy size={16} /> Copiar credenciales
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.form
              className="account-registration-form"
              key="form"
              onSubmit={(event) => void submitRegistration(event)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="account-registration-main">
                <div className="registration-progress" aria-label="Progreso del registro">
                  {[
                    ["1", "Identidad", identityComplete],
                    ["2", "Asignación", assignmentComplete],
                    ["3", "Acceso", false],
                  ].map(([number, label, complete]) => (
                    <span className={complete ? "complete" : ""} key={String(number)}>
                      <i>{complete ? <Check size={12} /> : number}</i>
                      <b>{label}</b>
                    </span>
                  ))}
                </div>

                <div className="account-role-picker" role="radiogroup" aria-label="Tipo de cuenta">
                  {(
                    [
                      {
                        value: "student",
                        label: "Alumno",
                        copy: "Aprende, entrega actividades y consulta su avance",
                        icon: UserRound,
                      },
                      {
                        value: "teacher",
                        label: "Maestro",
                        copy: "Gestiona materias y acompaña a sus alumnos",
                        icon: GraduationCap,
                      },
                    ] as const
                  ).map((option) => (
                    <motion.button
                      type="button"
                      role="radio"
                      aria-checked={accountRole === option.value}
                      className={accountRole === option.value ? "selected" : ""}
                      onClick={() => selectRole(option.value)}
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.985 }}
                      key={option.value}
                    >
                      <span><option.icon size={20} /></span>
                      <div>
                        <strong>{option.label}</strong>
                        <small>{option.copy}</small>
                      </div>
                      <i>{accountRole === option.value && <Check size={13} />}</i>
                    </motion.button>
                  ))}
                </div>

                <section className="registration-section">
                  <div className="registration-section-heading">
                    <span>01</span>
                    <div><strong>Datos de identidad</strong><small>Información visible dentro del portal escolar</small></div>
                  </div>
                  <div className="registration-name-grid">
                    <label>Nombre<input autoFocus value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="Ej. Mariana" autoComplete="off" required /></label>
                    <label>Apellidos<input value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder="Ej. Flores Hernández" autoComplete="off" required /></label>
                  </div>
                  <label className="registration-field">Correo institucional<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={accountRole === "student" ? "alumno@cehf.edu.mx" : "maestro@cehf.edu.mx"} autoComplete="off" required /></label>
                  {accountRole === "student" && (
                    <div className="registration-name-grid registration-guardian-grid">
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
                          aria-describedby="guardian-whatsapp-help"
                          required
                        />
                        <small id="guardian-whatsapp-help" className="registration-field-help">
                          <MessageCircle size={13} /> 10 dígitos de México.
                        </small>
                      </label>
                    </div>
                  )}
                  <div className={`registration-photo ${photo ? "has-photo" : ""}`}>
                    <motion.span
                      className="registration-photo-preview"
                      animate={{ scale: photo ? [0.94, 1.03, 1] : 1 }}
                      style={photoPreview ? { backgroundImage: `url(${photoPreview})` } : undefined}
                    >
                      {!photoPreview && <UserRound size={28} />}
                    </motion.span>
                    <div><strong>Fotografía de perfil</strong><p>JPG, JPEG, PNG o WEBP · máximo 4 MB.</p><label className="secondary-button"><UploadCloud size={15} /> {photo ? "Cambiar fotografía" : "Seleccionar fotografía"}<input type="file" accept="image/jpeg,image/jpg,image/pjpeg,image/png,image/webp,.jpg,.jpeg" onChange={(event) => selectPhoto(event.target.files?.[0])} /></label><button type="button" className="registration-avatar-generate" onClick={generateAvatar}><Sparkles size={14} /> Generar avatar</button>{photo && <small>{photo.name}</small>}</div>
                  </div>
                </section>

                <AnimatePresence mode="wait">
                  <motion.section
                    className="registration-section"
                    key={accountRole}
                    initial={{ opacity: 0, x: accountRole === "student" ? -10 : 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: accountRole === "student" ? 10 : -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="registration-section-heading">
                      <span>02</span>
                      <div><strong>{accountRole === "student" ? "Asignación académica" : "Materias que imparte"}</strong><small>{accountRole === "student" ? "Define su grupo, materias y acompañamiento" : "Selecciona los espacios que podrá administrar"}</small></div>
                    </div>
                    {accountRole === "student" && (
                      <div className="registration-grade-grid">
                        <label>Nivel escolar<select value={schoolLevel} onChange={(event) => selectSchoolLevel(event.target.value as SchoolLevel)}><option value="primary">Primaria</option><option value="secondary">Secundaria</option></select></label>
                        <label>Grado<select value={grade} onChange={(event) => setGrade(event.target.value)}>{gradesBySchoolLevel[schoolLevel].map((item) => <option key={item}>{item}</option>)}</select></label>
                        <label>Grupo<select value={group} onChange={(event) => setGroup(event.target.value)}>{["A", "B", "C"].map((item) => <option key={item}>{item}</option>)}</select></label>
                      </div>
                    )}
                    <fieldset className="registration-multiselect">
                      <legend>Materias</legend>
                      <p>Selecciona una o varias opciones.</p>
                      <div>
                        {primarySubjectOptions.map((subject) => (
                          <motion.button
                            type="button"
                            className={subjects.includes(subject) ? "selected" : ""}
                            aria-pressed={subjects.includes(subject)}
                            onClick={() => toggleSubject(subject)}
                            whileTap={{ scale: 0.96 }}
                            key={subject}
                          >
                            <i>{subjects.includes(subject) && <Check size={11} />}</i>
                            {subject}
                          </motion.button>
                        ))}
                      </div>
                    </fieldset>
                    {accountRole === "student" && (
                      <fieldset className="registration-teachers">
                        <legend>Maestros asignados</legend>
                        <p>Mostramos únicamente maestros compatibles con las materias elegidas.</p>
                        <div>
                          {compatibleTeachers.map((teacher) => (
                            <motion.button
                              type="button"
                              className={teacherIds.includes(teacher.uid) ? "selected" : ""}
                              aria-pressed={teacherIds.includes(teacher.uid)}
                              onClick={() => setTeacherIds((current) => current.includes(teacher.uid) ? current.filter((id) => id !== teacher.uid) : [...current, teacher.uid])}
                              whileHover={{ x: 3 }}
                              key={teacher.uid}
                            >
                              <span>{teacher.initials}</span>
                              <div><strong>{teacher.name}</strong><small>{teacher.subjects.filter((subject) => subjects.length === 0 || subjects.includes(subject)).join(" · ")}</small></div>
                              <i>{teacherIds.includes(teacher.uid) && <Check size={12} />}</i>
                            </motion.button>
                          ))}
                          {compatibleTeachers.length === 0 && (
                            <div className="registration-empty-option"><CircleHelp size={16} /> {subjects.length === 0 ? "Selecciona materias para ver maestros compatibles." : "Primero registra un maestro que imparta estas materias."}</div>
                          )}
                        </div>
                      </fieldset>
                    )}
                  </motion.section>
                </AnimatePresence>
              </div>

              <aside className="account-registration-aside">
                <motion.article className="registration-summary-card" layout>
                  <motion.span
                    className="registration-summary-avatar"
                    role="img"
                    aria-label={photoPreview ? `Fotografía de ${displayName}` : `Iniciales de ${displayName}`}
                    animate={{ scale: photoPreview ? [0.94, 1.04, 1] : 1 }}
                    style={photoPreview ? { backgroundImage: `url(${photoPreview})` } : undefined}
                  >
                    {!photoPreview && <>{firstName[0]?.toUpperCase() || (accountRole === "student" ? "A" : "M")}{lastName[0]?.toUpperCase() || ""}</>}
                  </motion.span>
                  <span className="role-chip">{accountRole === "student" ? `Alumno · ${schoolLevelLabels[schoolLevel]}` : "Maestro"}</span>
                  <h3>{displayName}</h3>
                  <p>{email.trim() || "correo@cehf.edu.mx"}</p>
                  <div className="registration-summary-facts">
                    {accountRole === "student" && <span><strong>{grade} {group}</strong><small>Grupo</small></span>}
                    <span><strong>{subjects.length}</strong><small>Materias</small></span>
                    {accountRole === "student" && <span><strong>{teacherIds.length}</strong><small>Maestros</small></span>}
                  </div>
                  <div className="registration-checklist">
                    <span className={identityComplete ? "complete" : ""}><i>{identityComplete && <Check size={11} />}</i> Identidad y fotografía</span>
                    <span className={assignmentComplete ? "complete" : ""}><i>{assignmentComplete && <Check size={11} />}</i> Asignación académica</span>
                    <span className={firebaseReady ? "complete" : "prepared"}><i>{firebaseReady ? <Check size={11} /> : <Sparkles size={11} />}</i> {firebaseReady ? "Conexión disponible" : "Preparado para Firebase"}</span>
                  </div>
                  <button className="primary-button registration-submit" disabled={!ready || submitting}>
                    {submitting ? <span className="button-spinner" /> : <UserPlus size={17} />}
                    {submitting ? "Creando cuenta…" : `Crear cuenta de ${accountRole === "student" ? "alumno" : "maestro"}`}
                  </button>
                  <small className="registration-session-note"><ShieldCheck size={13} /> Tu sesión de Dirección permanecerá abierta.</small>
                </motion.article>
              </aside>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.section>
    </motion.div>
  );
}

function CreateModal({
  section,
  forumGroups,
  forumSubjects,
  onClose,
  onCreate,
}: {
  section: SectionKey;
  forumGroups?: string[];
  forumSubjects?: string[];
  onClose: () => void;
  onCreate: (
    title: string,
    subject: string,
    forumDraft?: ForumDraftDetails,
  ) => Promise<void> | void;
}) {
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState(forumSubjects?.[0] ?? "Ciencias");
  const [prompt, setPrompt] = useState("");
  const [group, setGroup] = useState(forumGroups?.[0] ?? "5.º A");
  const [forumName, setForumName] = useState(
    `${forumSubjects?.[0] ?? "Ciencias"} · ${forumGroups?.[0] ?? "5.º A"}`,
  );
  const [forumKind, setForumKind] =
    useState<ForumTopicKind>("weekly_question");
  const [forumStatus, setForumStatus] =
    useState<ForumTopic["status"]>("open");
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState(() => {
    const date = new Date(Date.now() + 7 * 24 * 60 * 60_000);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);
  });
  const [allowReplies, setAllowReplies] = useState(true);
  const [allowAttachments, setAllowAttachments] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState("");
  const isForum = section === "forum";
  const subjectOptions = [
    ...new Set([
      ...(forumSubjects ?? []),
      "Ciencias",
      "Matemáticas",
      "Español",
      "Comunidad",
    ]),
  ];
  const groupOptions = [
    ...new Set([
      ...(forumGroups?.length ? forumGroups : ["5.º A", "5.º B"]),
      "4.º–6.º",
      "Todo el campus",
    ]),
  ];
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
        onSubmit={async (event) => {
          event.preventDefault();
          setSubmitting(true);
          setCreateError("");
          try {
            await onCreate(
              title.trim(),
              subject,
              isForum
                ? {
                    prompt: prompt.trim(),
                    group,
                    forumName: forumName.trim(),
                    kind: forumKind,
                    status: forumStatus,
                    opensAt:
                      forumStatus === "scheduled" && opensAt
                        ? new Date(opensAt).toISOString()
                        : new Date().toISOString(),
                    closesAt: closesAt
                      ? new Date(closesAt).toISOString()
                      : "",
                    allowReplies,
                    allowAttachments,
                  }
                : undefined,
            );
          } catch (error) {
            setCreateError(friendlyFirebaseError(error));
          } finally {
            setSubmitting(false);
          }
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
            {subjectOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
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
                  {groupOptions.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
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
                    if (nextStatus === "scheduled" && !opensAt) {
                      const date = new Date(Date.now() + 24 * 60 * 60_000);
                      setOpensAt(
                        new Date(
                          date.getTime() - date.getTimezoneOffset() * 60_000,
                        )
                          .toISOString()
                          .slice(0, 16),
                      );
                    }
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
                  type={forumStatus === "scheduled" ? "datetime-local" : "text"}
                  value={
                    forumStatus === "scheduled"
                      ? opensAt
                      : forumStatus === "closed"
                        ? "Publicado cerrado"
                        : "Publicado ahora"
                  }
                  onChange={(event) => setOpensAt(event.target.value)}
                  readOnly={forumStatus !== "scheduled"}
                  required={forumStatus === "scheduled"}
                />
              </label>
              <label>
                Cierre
                <input
                  type="datetime-local"
                  value={closesAt}
                  onChange={(event) => setClosesAt(event.target.value)}
                />
              </label>
            </div>
            {createError && (
              <div className="forum-composer-error" role="alert">
                <ShieldCheck size={15} /> {createError}
              </div>
            )}
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
            disabled={
              submitting ||
              !title.trim() ||
              (isForum &&
                (!prompt.trim() ||
                  (forumStatus === "scheduled" && !opensAt)))
            }
          >
            {isForum
              ? forumStatus === "scheduled"
                ? submitting
                  ? "Programando…"
                  : "Programar tema"
                : submitting
                  ? "Publicando…"
                  : "Publicar tema"
              : "Crear borrador"}{" "}
            <ArrowRight size={17} />
          </button>
        </div>
      </motion.form>
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
    { key: "my-week", label: "Calificaciones", icon: GraduationCap },
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
    <main
      className="loading-screen"
      role="status"
      aria-live="polite"
      aria-label="Preparando Campus CEHF"
    >
      <div className="loading-atmosphere" aria-hidden="true">
        <span className="loading-aura loading-aura-primary" />
        <span className="loading-aura loading-aura-accent" />
        <span className="loading-grid" />
      </div>

      <section className="loading-stage">
        <div className="loading-emblem" aria-hidden="true">
          <span className="loading-orbit loading-orbit-outer">
            <i />
          </span>
          <span className="loading-orbit loading-orbit-inner">
            <i />
          </span>
          <span className="loading-emblem-glow" />
          <div className="brand-mark">
            <span>CE</span>
          </div>
        </div>

        <div className="loading-brand">
          <span>Campus</span>
          <strong>CEHF</strong>
        </div>

        <div className="loading-copy">
          <h1>Preparando tu experiencia</h1>
          <p>Sincronizando tu semana y tu comunidad.</p>
        </div>

        <div className="loading-progress" aria-hidden="true">
          <span />
        </div>
        <span className="loading-status">
          Conectando todo para ti
          <i aria-hidden="true">
            <b />
            <b />
            <b />
          </i>
        </span>
      </section>

      <p className="loading-footer">
        Un espacio para aprender, conectar y avanzar.
      </p>
    </main>
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
    "weekly-review": "Nuevo repaso",
    tasks: "Nueva tarea",
    forum: "Nuevo tema",
    users: "Registrar cuenta",
  };
  return labels[section] ?? "Nuevo elemento";
}
