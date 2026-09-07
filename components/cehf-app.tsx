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
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
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
  Mail,
  Menu,
  MessageCircle,
  Moon,
  MoonStar,
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
  SunMedium,
  Sunrise,
  Sunset,
  Target,
  UploadCloud,
  UserRound,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
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
import {
  AcademicGradesPanel,
  demoDailyGrades,
} from "@/components/academic-grades";
import {
  AcademicReportsPage,
  demoStudentWeeklyReports,
} from "@/components/academic-reports";
import { MaterialCreateModal, MaterialsPage } from "@/components/materials-page";
import { PortalSearch } from "@/components/portal-search";
import { ProfilePage } from "@/components/profile-page";
import { backfillPortalSearch } from "@/lib/portal-search";
import {
  aggregateDailyGradesByWeek,
  watchDailyGrades,
} from "@/lib/grades-firebase";
import { watchStudentWeeklyReports } from "@/lib/reports-firebase";
import {
  buildDashboardViewModel,
  dashboardReviewScope,
  dashboardTaskScope,
  roleMetricIconKey,
  type DashboardActivity,
} from "@/lib/dashboard";
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
  isFirebaseTaskAssignment,
  legacyTasksToAssignments,
  markTaskNotificationsRead,
  resolveAcademicConfig,
  saveAcademicCalendar,
  watchAcademicCalendar,
  watchAcademicConfig,
  watchTaskAssignments,
  watchTaskNotifications,
  watchTaskSubmissions,
} from "@/lib/tasks-firebase";
import {
  createDemoWeeklyReview,
  createWeeklyReview,
  legacyReviewsToWeeklyReviews,
  watchWeeklyReviewAttempts,
  watchWeeklyReviews,
} from "@/lib/reviews-firebase";
import {
  createDemoLearningMaterial,
  createLearningMaterial,
  legacyMaterialsToLearningMaterials,
  loadViewedLearningMaterialIds,
  watchLearningMaterials,
} from "@/lib/materials-firebase";
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
import logoCehf from "@/assets/img/logoCEHF.png";
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
  PortalSearchHit,
  ProgressLevel,
  Role,
  SchoolLevel,
  SectionKey,
  UserProfile,
  TaskAssignment,
  TaskCreateInput,
  TaskSubmission,
  LearningMaterial,
  LearningMaterialCreateInput,
  DailyGradeRecord,
  StudentWeeklyReport,
  WeeklyReview,
  WeeklyReviewCreateInput,
  WeeklyReviewAttempt,
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
  materials: "/weekly-materials",
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
  if (name === "weekly-materials") return "materials";
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
  { key: "materials", label: "Recursos", icon: BookOpen },
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
  dashboard: { eyebrow: "Historial académico", title: "Inicio" },
  "my-week": { eyebrow: "Resultados y seguimiento", title: "Calificaciones" },
  "weekly-review": { eyebrow: "Práctica breve", title: "Repasos" },
  tasks: { eyebrow: "Actividades y entregas", title: "Tareas" },
  materials: { eyebrow: "Biblioteca de aprendizaje", title: "Recursos" },
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

type DayPhase = {
  key: "dawn" | "morning" | "afternoon" | "sunset" | "dusk" | "night";
  label: string;
  greeting: string;
  icon: IconType;
};

const dayPhases: DayPhase[] = [
  { key: "dawn", label: "Un nuevo día comienza", greeting: "Buenos días", icon: Sunrise },
  { key: "morning", label: "Un buen momento para avanzar", greeting: "Buenos días", icon: SunMedium },
  { key: "afternoon", label: "Sigamos construyendo", greeting: "Buenas tardes", icon: CloudSun },
  { key: "sunset", label: "Cada avance cuenta", greeting: "Buenas tardes", icon: Sunset },
  { key: "dusk", label: "Cerramos el día con calma", greeting: "Buenas noches", icon: CloudMoon },
  { key: "night", label: "Mañana será una nueva oportunidad", greeting: "Buenas noches", icon: MoonStar },
];

type WeatherKind = "clear" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm";

type CurrentWeather = {
  kind: WeatherKind;
  label: string;
  temperature: number;
  timeZone: string;
  icon: IconType;
};

type WeatherPreviewMode = "live" | "time" | WeatherKind;

const weatherPreviewModes: WeatherPreviewMode[] = [
  "live",
  "clear",
  "cloudy",
  "fog",
  "drizzle",
  "rain",
  "snow",
  "storm",
  "time",
];

const weatherPreviewCodes: Record<WeatherKind, number> = {
  clear: 0,
  cloudy: 3,
  fog: 45,
  drizzle: 53,
  rain: 63,
  snow: 73,
  storm: 95,
};

const weatherPreviewLabels: Record<WeatherPreviewMode, string> = {
  live: "Clima real",
  clear: "Despejado",
  cloudy: "Nublado",
  fog: "Niebla",
  drizzle: "Llovizna",
  rain: "Lluvia",
  snow: "Nieve",
  storm: "Tormenta",
  time: "Por hora",
};

function weatherForCode(code: number): Omit<CurrentWeather, "temperature" | "timeZone"> {
  if (code === 0) return { kind: "clear", label: "Cielo despejado", icon: Sun };
  if (code <= 3) return { kind: "cloudy", label: code === 3 ? "Cielo nublado" : "Algunas nubes", icon: Cloud };
  if (code === 45 || code === 48) return { kind: "fog", label: "Ambiente con niebla", icon: CloudFog };
  if (code >= 51 && code <= 57) return { kind: "drizzle", label: "Llovizna ligera", icon: CloudDrizzle };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) {
    return { kind: "rain", label: "Está lloviendo", icon: CloudRain };
  }
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) {
    return { kind: "snow", label: "Está nevando", icon: CloudSnow };
  }
  if (code >= 95) return { kind: "storm", label: "Hay tormenta", icon: CloudLightning };
  return { kind: "cloudy", label: "Cielo cambiante", icon: CloudSun };
}

function hourInTimeZone(date: Date, timeZone: string) {
  try {
    const hour = new Intl.DateTimeFormat("es-MX", {
      hour: "2-digit",
      hourCycle: "h23",
      timeZone,
    }).formatToParts(date).find((part) => part.type === "hour")?.value;
    const parsed = Number(hour);
    return Number.isFinite(parsed) ? parsed : date.getHours();
  } catch {
    return date.getHours();
  }
}

function dayPhaseAt(date: Date, timeZone: string) {
  const hour = hourInTimeZone(date, timeZone);
  if (hour >= 5 && hour < 8) return dayPhases[0];
  if (hour >= 8 && hour < 12) return dayPhases[1];
  if (hour >= 12 && hour < 17) return dayPhases[2];
  if (hour >= 17 && hour < 19) return dayPhases[3];
  if (hour >= 19 && hour < 21) return dayPhases[4];
  return dayPhases[5];
}

function TimeAwareGreeting({
  name,
  timeZone,
  reduceMotion,
}: {
  name: string;
  timeZone: string;
  reduceMotion: boolean;
}) {
  const [now, setNow] = useState(() => new Date());
  const [weather, setWeather] = useState<CurrentWeather | null>(null);
  const [previewMode, setPreviewMode] = useState<WeatherPreviewMode>("live");

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!("geolocation" in navigator)) return;

    const controller = new AbortController();
    let active = true;

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const query = new URLSearchParams({
          // City-scale precision is enough for weather and avoids sending exact coordinates.
          latitude: coords.latitude.toFixed(2),
          longitude: coords.longitude.toFixed(2),
          current: "temperature_2m,weather_code",
          timezone: "auto",
        });

        void fetch(`https://api.open-meteo.com/v1/forecast?${query}`, {
          signal: controller.signal,
        })
          .then((response) => {
            if (!response.ok) throw new Error(`Weather request failed: ${response.status}`);
            return response.json() as Promise<{
              timezone?: unknown;
              current?: { temperature_2m?: unknown; weather_code?: unknown };
            }>;
          })
          .then((data) => {
            const temperature = Number(data.current?.temperature_2m);
            const code = Number(data.current?.weather_code);
            if (!active || !Number.isFinite(temperature) || !Number.isFinite(code)) return;

            setWeather({
              ...weatherForCode(code),
              temperature: Math.round(temperature),
              timeZone: typeof data.timezone === "string" ? data.timezone : timeZone,
            });
          })
          .catch(() => {
            // Location, network and provider failures intentionally keep the time-based fallback.
          });
      },
      () => {
        // Denied or unavailable location intentionally keeps the time-based fallback.
      },
      { enableHighAccuracy: false, maximumAge: 30 * 60_000, timeout: 8_000 },
    );

    return () => {
      active = false;
      controller.abort();
    };
  }, [timeZone]);

  const previewWeather = previewMode === "live" || previewMode === "time"
    ? null
    : {
        ...weatherForCode(weatherPreviewCodes[previewMode]),
        temperature: weather?.temperature ?? 22,
        timeZone: weather?.timeZone || timeZone,
      };
  const displayedWeather = previewMode === "live" ? weather : previewWeather;
  const phase = dayPhaseAt(now, displayedWeather?.timeZone || timeZone);
  const GreetingIcon = displayedWeather?.icon || phase.icon;
  const atmosphere = displayedWeather?.kind || phase.key;
  const detail = displayedWeather
    ? `${displayedWeather.label} · ${displayedWeather.temperature}°${previewMode === "live" ? "" : " · Prueba"}`
    : phase.label;

  function showNextWeatherPreview() {
    setPreviewMode((current) => {
      const currentIndex = weatherPreviewModes.indexOf(current);
      return weatherPreviewModes[(currentIndex + 1) % weatherPreviewModes.length];
    });
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        className={`time-greeting is-${phase.key} weather-${atmosphere}${reduceMotion ? " motion-reduced" : ""}`}
        key={`${phase.key}-${atmosphere}`}
        initial={reduceMotion ? false : { opacity: 0, y: 6, filter: "blur(4px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={reduceMotion ? undefined : { opacity: 0, y: -6, filter: "blur(4px)" }}
        transition={{ duration: reduceMotion ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <span className="time-greeting-glow" aria-hidden="true" />
        <span className="time-greeting-atmosphere" aria-hidden="true">
          <span className="weather-orb" />
          <span className="weather-cloud weather-cloud-one" />
          <span className="weather-cloud weather-cloud-two" />
          <span className="weather-mist weather-mist-one" />
          <span className="weather-mist weather-mist-two" />
          <span className="weather-particles">
            {Array.from({ length: 10 }, (_, index) => <i key={index} />)}
          </span>
        </span>
        <button
          type="button"
          className="weather-test-button"
          onClick={showNextWeatherPreview}
          title="Cambiar al siguiente clima de prueba"
          aria-label={`Cambiar clima de prueba. Vista actual: ${weatherPreviewLabels[previewMode]}`}
        >
          <Eye size={12} aria-hidden="true" />
          <span>{previewMode === "live" ? "Probar clima" : weatherPreviewLabels[previewMode]}</span>
        </button>
        <motion.span
          className="time-greeting-icon"
          aria-hidden="true"
          animate={reduceMotion ? undefined : { y: [0, -4, 0], rotate: [-3, 3, -3] }}
          transition={{ duration: 5.5, ease: "easeInOut", repeat: Infinity }}
        >
          <GreetingIcon size={27} strokeWidth={1.8} />
        </motion.span>
        <span className="eyebrow">{detail}</span>
        <h1>{phase.greeting}, {name}</h1>
      </motion.div>
    </AnimatePresence>
  );
}

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
  const [materialRecords, setMaterialRecords] = useState<LearningMaterial[]>(() =>
    legacyMaterialsToLearningMaterials(
      createDemoState().materials,
      demoProfiles.student,
      defaultAcademicConfig,
      demoManagedAccounts,
    ),
  );
  const [materialRecordsLoading, setMaterialRecordsLoading] = useState(false);
  const [viewedMaterialIds, setViewedMaterialIds] = useState<Set<string>>(
    () => new Set(),
  );
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
  const localSearchRecords = useMemo<PortalSearchHit[]>(() => {
    const asTime = (value?: string) => {
      const parsed = Date.parse(value ?? "");
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const tasks: PortalSearchHit[] = taskRecords.map((task) => ({
      objectID: `task:${task.id}`,
      entityType: "task",
      entityId: task.id,
      title: task.title,
      excerpt: task.description,
      subject: task.subject,
      context: `${task.weekLabel} · ${task.targetGroup}`,
      status: task.status,
      route: `/tasks/${encodeURIComponent(task.id)}`,
      updatedAt: asTime(task.updatedAt),
    }));
    const reviews: PortalSearchHit[] = reviewRecords.map((review) => ({
      objectID: `review:${review.id}`,
      entityType: "review",
      entityId: review.id,
      title: review.title,
      excerpt: review.description,
      subject: review.subject,
      context: review.weekLabel,
      status: review.status,
      route: `/weekly-review/${encodeURIComponent(review.id)}`,
      updatedAt: asTime(review.updatedAt),
    }));
    const materials: PortalSearchHit[] = materialRecords.map((material) => ({
      objectID: `material:${material.id}`,
      entityType: "material",
      entityId: material.id,
      title: material.title,
      excerpt: material.description,
      subject: material.subject,
      context: material.weekLabel,
      status: material.type,
      route: `/weekly-materials/${encodeURIComponent(material.id)}`,
      updatedAt: asTime(material.updatedAt),
    }));
    const stories: PortalSearchHit[] = state.wallPosts
      .filter((story) =>
        role !== "student"
        || story.status === "published"
        || story.authorId === currentProfile.uid,
      )
      .map((story) => ({
        objectID: `story:${story.id}`,
        entityType: "story",
        entityId: story.id,
        title: story.title,
        excerpt: story.lead ?? story.excerpt,
        subject: story.category,
        context: `${story.author} · ${story.group}`,
        status: story.status,
        route: `/wall-newspaper/stories/${encodeURIComponent(story.id)}`,
        updatedAt: asTime(story.updatedAt ?? story.publishedAt),
      }));
    const topics: PortalSearchHit[] = state.forumTopics.map((topic) => ({
      objectID: `forum_topic:${topic.id}`,
      entityType: "forum_topic",
      entityId: topic.id,
      title: topic.title,
      excerpt: topic.prompt,
      subject: topic.subject,
      context: `${topic.forumName} · ${topic.group}`,
      status: topic.status,
      route: `/forum/${encodeURIComponent(topic.forumId)}/${encodeURIComponent(topic.id)}`,
      updatedAt: asTime(topic.lastActivityAt),
    }));
    return [...tasks, ...reviews, ...materials, ...stories, ...topics];
  }, [currentProfile.uid, materialRecords, reviewRecords, role, state.forumTopics, state.wallPosts, taskRecords]);

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
    queueMicrotask(() => {
      setMaterialRecords([]);
      setMaterialRecordsLoading(true);
    });
    return watchLearningMaterials(
      profile,
      (materials) => {
        setMaterialRecords(materials);
        setMaterialRecordsLoading(false);
        if (profile.role === "student") {
          void loadViewedLearningMaterialIds(materials, profile)
            .then(setViewedMaterialIds)
            .catch((error) => reportFirebaseError("cargar lecturas de materiales", error));
        } else {
          setViewedMaterialIds(new Set());
        }
      },
      (error) => {
        setMaterialRecordsLoading(false);
        reportFirebaseError("cargar materiales", error);
      },
    );
  }, [firebaseUser, profile]);

  useEffect(() => {
    if (firebaseUser) return;
    queueMicrotask(() => {
      setMaterialRecords(
        legacyMaterialsToLearningMaterials(
          state.materials,
          currentProfile,
          academicConfig,
          managedAccounts,
        ),
      );
      setMaterialRecordsLoading(false);
      setViewedMaterialIds(
        new Set(
          state.materials
            .filter((material) => material.reviewed)
            .map((material) => material.id),
        ),
      );
    });
  }, [academicConfig, currentProfile, demoRole, firebaseUser, managedAccounts, state.materials]);

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
    if (!authReady) return;
    document.documentElement.dataset.theme = state.settings.theme;
    window.localStorage.setItem("cehf-theme", state.settings.theme);
    document.documentElement.classList.toggle(
      "reduce-motion",
      state.settings.reducedMotion,
    );
  }, [authReady, state.settings]);

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
    queueMicrotask(() => {
      setManagedAccounts([]);
      setManagedAccountsLoading(true);
    });
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

  function openSearchResult(result: PortalSearchHit) {
    window.history.pushState({}, "", result.route);
    setActiveSection(sectionFromPath(new URL(result.route, window.location.origin).pathname));
    setDetailOpen(taskIdFromPath(new URL(result.route, window.location.origin).pathname));
    setSidebarOpen(false);
    setMobileMore(false);
    window.dispatchEvent(new PopStateEvent("popstate"));
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
  const hasPublishedAcademicCalendar = academicCalendarImage?.published === true;
  const sidebarCalendarStatus =
    academicConfig.calendarStatus === "active"
      ? "active"
      : hasPublishedAcademicCalendar
        ? "published"
        : academicConfig.calendarStatus;
  const sidebarCalendarLabel =
    academicConfig.calendarStatus === "active"
      ? academicConfig.weekLabel
      : academicCalendarImageLoading
        ? "Cargando calendario"
        : hasPublishedAcademicCalendar
          ? ""
          : academicConfig.weekLabel;
  const sidebarCalendarDetail =
    academicConfig.calendarStatus === "active"
      ? `${currentWeekRange} · ${academicConfig.termLabel}`
      : academicCalendarImageLoading
        ? "Consultando publicación"
        : hasPublishedAcademicCalendar
          ? ""
          : academicConfig.nextWeekLabel && academicConfig.nextWeekStartDate
            ? `Próxima: ${academicConfig.nextWeekLabel}`
            : "Dirección debe configurarlo";
  const sidebarCalendarAccessibleLabel = [
    "Abrir calendario académico",
    sidebarCalendarLabel,
    sidebarCalendarDetail,
  ].filter(Boolean).join(". ");
  const headingEyebrow = title.eyebrow;

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
            <Image
              className="sidebar-brand-logo"
              src={logoCehf}
              alt=""
              aria-hidden="true"
              sizes="43px"
              unoptimized
            />
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
          className={`week-switcher is-${sidebarCalendarStatus}`}
          onClick={() => {
            setAcademicCalendarOpen(true);
            setSidebarOpen(false);
          }}
          aria-haspopup="dialog"
          aria-label={sidebarCalendarAccessibleLabel}
          title={sidebarCalendarAccessibleLabel}
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
            {sidebarCalendarLabel && <strong>{sidebarCalendarLabel}</strong>}
            {sidebarCalendarDetail && <small>{sidebarCalendarDetail}</small>}
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
          <PortalSearch
            profile={currentProfile}
            firebaseReady={Boolean(firebaseUser && profile)}
            localRecords={localSearchRecords}
            onOpen={openSearchResult}
          />
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
            {activeSection === "dashboard" ? (
              <TimeAwareGreeting
                name={currentProfile.name.split(" ")[0]}
                timeZone={academicConfig.timezone || "America/Mexico_City"}
                reduceMotion={Boolean(state.settings.reducedMotion || prefersReducedMotion)}
              />
            ) : (
              <div>
                <span className="eyebrow">{headingEyebrow}</span>
                <h1>{title.title}</h1>
              </div>
            )}
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
                  "materials",
                  "forum",
                  "users",
                ].includes(activeSection) && (
                  <button
                    className="primary-button"
                    disabled={
                      (activeSection === "tasks" &&
                        academicConfig.calendarStatus !== "active") ||
                      (activeSection === "weekly-review" &&
                        academicCalendar.weeks.length === 0) ||
                      (activeSection === "materials" &&
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
              materialRecords={materialRecords}
              materialRecordsLoading={materialRecordsLoading}
              viewedMaterialIds={viewedMaterialIds}
              onMaterialViewed={(materialId) =>
                setViewedMaterialIds((current) => new Set(current).add(materialId))
              }
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
        ) : createOpen && activeSection === "materials" ? (
          <MaterialCreateModal
            profile={currentProfile}
            config={academicConfig}
            calendar={academicCalendar}
            accounts={managedAccounts}
            onClose={() => setCreateOpen(false)}
            onCreate={async (input: LearningMaterialCreateInput) => {
              if (firebaseUser && profile) {
                await createLearningMaterial(
                  input,
                  profile,
                  academicConfig,
                  academicCalendar,
                );
              } else {
                const material = createDemoLearningMaterial(
                  input,
                  currentProfile,
                  academicConfig,
                  academicCalendar,
                  managedAccounts,
                );
                setMaterialRecords((current) => [material, ...current]);
              }
              toast.success("Material publicado");
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
  materialRecords,
  materialRecordsLoading,
  viewedMaterialIds,
  onMaterialViewed,
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
  materialRecords: LearningMaterial[];
  materialRecordsLoading: boolean;
  viewedMaterialIds: Set<string>;
  onMaterialViewed: (materialId: string) => void;
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
          openTask={openDetail}
          taskRecords={taskRecords}
          taskRecordsLoading={taskRecordsLoading}
          reviewRecords={reviewRecords}
          reviewRecordsLoading={reviewRecordsLoading}
          materialRecords={materialRecords}
          materialRecordsLoading={materialRecordsLoading}
          viewedMaterialIds={viewedMaterialIds}
          academicConfig={academicConfig}
          academicCalendar={academicCalendar}
          managedAccounts={managedAccounts}
          managedAccountsLoading={managedAccountsLoading}
          firebaseReady={firebaseReady}
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
    case "materials":
      return (
        <MaterialsPage
          materials={materialRecords}
          loading={materialRecordsLoading}
          profile={profile}
          accounts={managedAccounts}
          viewedIds={viewedMaterialIds}
          onViewed={onMaterialViewed}
          firebaseReady={firebaseReady}
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
      return (
        <ProfilePage
          profile={profile}
          state={state}
          taskRecords={taskRecords}
          taskRecordsLoading={taskRecordsLoading}
          reviewRecords={reviewRecords}
          reviewRecordsLoading={reviewRecordsLoading}
          materialRecords={materialRecords}
          materialRecordsLoading={materialRecordsLoading}
          viewedMaterialIds={viewedMaterialIds}
          academicConfig={academicConfig}
          academicCalendar={academicCalendar}
          managedAccounts={managedAccounts}
          managedAccountsLoading={managedAccountsLoading}
          firebaseReady={firebaseReady}
          navigate={navigate}
          openTask={openDetail}
        />
      );
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
  openTask,
  taskRecords,
  taskRecordsLoading,
  reviewRecords,
  reviewRecordsLoading,
  materialRecords,
  materialRecordsLoading,
  viewedMaterialIds,
  academicConfig,
  academicCalendar,
  managedAccounts,
  managedAccountsLoading,
  firebaseReady,
}: {
  role: Role;
  profile: UserProfile;
  state: PortalState;
  navigate: (section: SectionKey) => void;
  updateState: (
    updater: (previous: PortalState) => PortalState,
    message?: string,
  ) => void;
  openTask: (id: string) => void;
  taskRecords: TaskAssignment[];
  taskRecordsLoading: boolean;
  reviewRecords: WeeklyReview[];
  reviewRecordsLoading: boolean;
  materialRecords: LearningMaterial[];
  materialRecordsLoading: boolean;
  viewedMaterialIds: Set<string>;
  academicConfig: AcademicConfig;
  academicCalendar: AcademicCalendar;
  managedAccounts: ManagedAccount[];
  managedAccountsLoading: boolean;
  firebaseReady: boolean;
}) {
  const [dashboardGrades, setDashboardGrades] = useState<DailyGradeRecord[]>([]);
  const [dashboardReports, setDashboardReports] = useState<StudentWeeklyReport[]>([]);
  const [dashboardRecordsLoading, setDashboardRecordsLoading] = useState(firebaseReady);
  const [submissionsByTask, setSubmissionsByTask] = useState<Record<string, TaskSubmission[]>>({});
  const [attemptsByReview, setAttemptsByReview] = useState<Record<string, WeeklyReviewAttempt[]>>({});
  const scopedTasks = useMemo(
    () => dashboardTaskScope(taskRecords, academicConfig),
    [academicConfig, taskRecords],
  );
  const scopedReviews = useMemo(
    () => dashboardReviewScope(reviewRecords, academicConfig),
    [academicConfig, reviewRecords],
  );

  useEffect(() => {
    if (!firebaseReady) {
      queueMicrotask(() => {
        const grades = demoDailyGrades(
          profile,
          academicCalendar,
          academicConfig,
          managedAccounts,
        );
        setDashboardGrades(grades);
        setDashboardReports(
          demoStudentWeeklyReports(
            aggregateDailyGradesByWeek(grades, academicCalendar),
            profile,
            academicConfig,
          ),
        );
        setDashboardRecordsLoading(false);
      });
      return;
    }

    let gradesReady = false;
    let reportsReady = false;
    queueMicrotask(() => setDashboardRecordsLoading(true));
    const finish = () => {
      if (gradesReady && reportsReady) setDashboardRecordsLoading(false);
    };
    const stopGrades = watchDailyGrades(
      profile,
      (grades) => {
        setDashboardGrades(grades);
        gradesReady = true;
        finish();
      },
      (error) => {
        console.error("[Campus CEHF] cargar resumen de calificaciones", error);
        gradesReady = true;
        finish();
      },
    );
    const stopReports = watchStudentWeeklyReports(
      profile,
      (reports) => {
        setDashboardReports(reports);
        reportsReady = true;
        finish();
      },
      (error) => {
        console.error("[Campus CEHF] cargar resumen de reportes", error);
        reportsReady = true;
        finish();
      },
    );
    return () => {
      stopGrades();
      stopReports();
    };
  }, [academicCalendar, academicConfig, firebaseReady, managedAccounts, profile]);

  useEffect(() => {
    if (!firebaseReady) {
      const taskState = new Map(state.tasks.map((task) => [task.id, task]));
      const students = managedAccounts.filter((account) => account.role === "student" && account.active);
      const demoSubmissions: Record<string, TaskSubmission[]> = {};
      scopedTasks.forEach((task, index) => {
        const legacy = taskState.get(task.id);
        if (!legacy || legacy.status === "published") return;
        const student = role === "student" ? profile : students[index % Math.max(1, students.length)];
        if (!student) return;
        const status: TaskSubmission["status"] = legacy.status === "reviewed" ? "reviewed" : "submitted";
        const updatedAt = new Date(Date.now() - (index + 1) * 45 * 60_000).toISOString();
        demoSubmissions[task.id] = [{
            id: student.uid,
            studentId: student.uid,
            studentName: student.name,
            teacherId: task.createdBy,
            taskId: task.id,
            content: legacy.description,
            attachments: [],
            status,
            version: 1,
            submittedAt: updatedAt,
            updatedAt,
            reviewedAt: status === "reviewed" ? updatedAt : undefined,
          }];
      });
      queueMicrotask(() => setSubmissionsByTask(demoSubmissions));
      return;
    }
    queueMicrotask(() => setSubmissionsByTask({}));
    const stops = scopedTasks
      .filter(isFirebaseTaskAssignment)
      .map((task) =>
      watchTaskSubmissions(
        task,
        profile,
        (submissions) =>
          setSubmissionsByTask((current) => ({ ...current, [task.id]: submissions })),
        (error) => console.error(`[Campus CEHF] cargar entregas de ${task.id}`, error),
      ),
    );
    return () => stops.forEach((stop) => stop());
  }, [firebaseReady, managedAccounts, profile, role, scopedTasks, state.tasks]);

  useEffect(() => {
    if (!firebaseReady || role === "student") {
      queueMicrotask(() =>
        setAttemptsByReview(
          Object.fromEntries(
            scopedReviews.map((review) => [
              review.id,
              review.myAttempt ? [review.myAttempt] : [],
            ]),
          ),
        ),
      );
      return;
    }
    queueMicrotask(() => setAttemptsByReview({}));
    const stops = scopedReviews.map((review) =>
      watchWeeklyReviewAttempts(
        review,
        (attempts) =>
          setAttemptsByReview((current) => ({ ...current, [review.id]: attempts })),
        (error) => console.error(`[Campus CEHF] cargar intentos de ${review.id}`, error),
      ),
    );
    return () => stops.forEach((stop) => stop());
  }, [firebaseReady, role, scopedReviews]);

  const dashboard = useMemo(
    () =>
      buildDashboardViewModel({
        profile,
        academicConfig,
        accounts: managedAccounts,
        tasks: taskRecords,
        submissionsByTask,
        reviews: reviewRecords,
        attemptsByReview,
        materials: materialRecords,
        viewedMaterialIds,
        grades: dashboardGrades,
        reports: dashboardReports,
        notifications: state.notifications,
        openModerationCount: state.forumModeration.filter(
          (item) => item.status === "open",
        ).length,
      }),
    [
      academicConfig,
      attemptsByReview,
      dashboardGrades,
      dashboardReports,
      managedAccounts,
      materialRecords,
      profile,
      reviewRecords,
      state.forumModeration,
      state.notifications,
      submissionsByTask,
      taskRecords,
      viewedMaterialIds,
    ],
  );
  const dashboardLoading =
    dashboardRecordsLoading ||
    taskRecordsLoading ||
    reviewRecordsLoading ||
    materialRecordsLoading ||
    (role !== "student" && managedAccountsLoading);
  const metricIcons: Record<string, IconType> = {
    users: Users,
    tasks: ClipboardCheck,
    reviews: BookOpen,
    reports: FileBarChart,
    grades: GraduationCap,
    materials: Paperclip,
  };
  const openDashboardTarget = (target: { section: SectionKey; taskId?: string }) => {
    if (target.taskId) openTask(target.taskId);
    else navigate(target.section);
  };
  const currentDate = new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: academicConfig.timezone || "America/Mexico_City",
  }).format(new Date());
  const dateLabel = currentDate.charAt(0).toUpperCase() + currentDate.slice(1);
  const dueLabel = dashboard.nextTask
    ? new Intl.DateTimeFormat("es-MX", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: academicConfig.timezone || "America/Mexico_City",
      }).format(new Date(dashboard.nextTask.dueAt))
    : "";

  return (
    <div className="dashboard-stack">
      <WeeklyVerseCard
        role={role}
        profile={profile}
        state={state}
        updateState={updateState}
      />
      <section className={`hero-card ${role !== "student" ? "teacher-hero" : ""}`} aria-busy={dashboardLoading}>
        <div className="hero-copy">
          <span className="pill pill-light">
            <span className="live-dot" /> Desempeño actual
          </span>
          <h2>{dashboard.heroTitle}</h2>
          <p>{dashboard.heroDescription}</p>
          <button
            className="light-button"
            onClick={() => navigate("my-week")}
          >
            {role === "student"
              ? "Ver mis calificaciones"
              : role === "teacher"
                ? "Capturar calificaciones"
                : "Ver seguimiento institucional"}
            <ArrowRight size={17} />
          </button>
        </div>
        <div className="hero-metric">
          <ProgressRing value={dashboardLoading ? 0 : dashboard.completion} />
          <span>{dashboardLoading ? "Calculando resumen…" : dashboard.completionLabel}</span>
        </div>
      </section>

      <section className={`metric-grid ${role === "student" ? "student-metric-grid" : ""}`} aria-label="Resumen con datos actuales">
        {dashboard.metrics.map((metric) => {
          const MetricIcon = metricIcons[roleMetricIconKey(role, metric.key)] ?? GraduationCap;
          return (
            <article className="metric-card" key={metric.key}>
              <span className={`metric-icon ${metric.tone}`}>
                <MetricIcon size={20} />
              </span>
              <strong>{dashboardLoading ? "…" : metric.value}</strong>
              <p>{metric.label}</p>
            </article>
          );
        })}
      </section>

      {role === "student" ? <><section className="today-section">
        <div className="section-title-row">
          <div>
            <span className="eyebrow">Para hoy</span>
            <h2>Tu siguiente paso</h2>
          </div>
          <span className="date-chip">{dateLabel}</span>
        </div>
        <div className="focus-grid">
          <article className="focus-card violet-card">
            <div className="focus-card-top"><span className="subject-icon"><BookOpen size={20} /></span><span className="soft-tag">{dashboard.nextReview?.subject ?? "Repasos"}</span></div>
            <span className="card-kicker">{dashboard.nextReview ? "Repaso recomendado" : "Repasos al día"}</span>
            <h3>{dashboard.nextReview?.title ?? "No tienes repasos pendientes"}</h3>
            <p>{dashboard.nextReview ? `${dashboard.nextReview.duration} min · ${dashboard.nextReview.myAttempt?.progress ?? 0}% completado.` : "Cuando se publique un nuevo repaso aparecerá aquí."}</p>
            {dashboard.nextReview && <div className="linear-progress"><span style={{ width: `${dashboard.nextReview.myAttempt?.progress ?? 0}%` }} /></div>}
            <button className="card-action" onClick={() => navigate("weekly-review")}>{dashboard.nextReview?.myAttempt?.progress ? "Continuar repaso" : "Ver repasos"}<ArrowRight size={17} /></button>
          </article>
          <article className="focus-card coral-card">
            <div className="focus-card-top"><span className="subject-icon"><ClipboardCheck size={20} /></span><span className="soft-tag">{dashboard.nextTask?.subject ?? "Tareas"}</span></div>
            <span className="card-kicker">{dashboard.nextTask ? "Próxima entrega" : "Tareas al día"}</span>
            <h3>{dashboard.nextTask?.title ?? "No tienes entregas pendientes"}</h3>
            <p>{dashboard.nextTask ? `${dashboard.nextTask.description || "Revisa las instrucciones de la actividad."}` : "Las nuevas actividades aparecerán aquí cuando se publiquen."}</p>
            {dashboard.nextTask && <div className="due-line"><Clock3 size={16} /> Entrega {dueLabel}</div>}
            <button className="card-action" onClick={() => dashboard.nextTask ? openTask(dashboard.nextTask.id) : navigate("tasks")}>{dashboard.nextTask ? "Abrir tarea" : "Ver tareas"}<ArrowRight size={17} /></button>
          </article>
          <article className="focus-card mint-card">
            <div className="focus-card-top"><span className="subject-icon"><Paperclip size={20} /></span><span className="soft-tag">{dashboard.nextMaterial?.subject ?? "Recursos"}</span></div>
            <span className="card-kicker">{dashboard.nextMaterial ? "Recurso por consultar" : "Recursos al día"}</span>
            <h3>{dashboard.nextMaterial?.title ?? "Ya consultaste tus recursos"}</h3>
            <p>{dashboard.nextMaterial?.description ?? "Los materiales nuevos aparecerán aquí."}</p>
            {dashboard.nextMaterial && <div className="due-line"><CheckCircle2 size={16} /> {dashboard.nextMaterial.required ? "Recurso obligatorio" : "Recurso complementario"}</div>}
            <button className="card-action" onClick={() => navigate("materials")}>Ver recursos <ArrowRight size={17} /></button>
          </article>
        </div>
      </section>

      <section className="two-column student-lower">
        <article className="panel">
          <PanelHeading title="Tu seguimiento real" onAction={() => navigate("my-week")} action="Ver calificaciones" />
          <div className="mini-progress-list">
            {dashboard.progress.map((criterion) => (
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
        <article className="panel dashboard-report-card">
          <PanelHeading title="Tu último reporte" onAction={() => navigate("reports")} action="Ver reportes" />
          {dashboard.latestReport ? <>
            <span className="soft-tag">{dashboard.latestReport.subject} · {dashboard.latestReport.weekLabel}</span>
            <h3>{dashboard.latestReport.achievement}</h3>
            <p><strong>Próximo paso:</strong> {dashboard.latestReport.nextStep}</p>
            <small>{dashboard.latestReport.teacherName}</small>
          </> : <div className="dashboard-empty-summary"><FileBarChart size={24} /><strong>Aún no hay un reporte publicado</strong><p>Tu docente lo compartirá aquí cuando esté listo.</p></div>}
        </article>
      </section>

      <section className="panel dashboard-activity-panel">
        <PanelHeading title="Tu actividad reciente" />
        <Timeline activities={dashboard.activity} onOpen={openDashboardTarget} />
      </section>
      </> : <section className="two-column">
        <article className="panel">
          <PanelHeading
            title={role === "director" ? "Grupos que conviene revisar" : "Tus prioridades"}
            action={role === "director" ? "Ver comunidad" : "Ver seguimiento"}
            onAction={() => navigate(role === "director" ? "users" : "my-week")}
          />
          <div className="priority-list">
            {dashboard.priorities.map((item, index) => (
              <button className="priority-row" key={item.id} onClick={() => openDashboardTarget(item)}>
                <span className={`priority-number n${index + 1}`}>{index + 1}</span>
                <span><strong>{item.title}</strong><small>{item.detail}</small></span>
                <em>{item.status}</em>
              </button>
            ))}
          </div>
        </article>
        <article className="panel">
          <PanelHeading title={role === "director" ? "Actividad institucional reciente" : "Actividad de tus grupos"} />
          <Timeline activities={dashboard.activity} onOpen={openDashboardTarget} />
        </article>
      </section>}
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
  const [searchBackfillLoading, setSearchBackfillLoading] = useState(false);

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

  const handleSearchBackfill = async () => {
    if (searchBackfillLoading) return;
    setSearchBackfillLoading(true);
    try {
      const result = await backfillPortalSearch();
      toast.success("Índice de búsqueda actualizado", {
        description: `${result.records} elementos disponibles con sus permisos actuales.`,
      });
    } catch (error) {
      toast.error("No pudimos actualizar el buscador", {
        description: friendlyFirebaseError(error),
      });
    } finally {
      setSearchBackfillLoading(false);
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
              <section className="panel settings-section">
                <div className="settings-heading">
                  <span className="settings-icon">
                    <Search size={20} />
                  </span>
                  <div>
                    <h2>Buscador global</h2>
                    <p>Sincroniza con Algolia los contenidos que ya existen y conserva sus permisos.</p>
                  </div>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>Reconstruir índice seguro</strong>
                    <span>Úsalo una vez al activar Algolia o después de una migración.</span>
                  </div>
                  <button
                    className="secondary-button"
                    disabled={!firebaseReady || searchBackfillLoading}
                    onClick={() => void handleSearchBackfill()}
                    type="button"
                  >
                    {searchBackfillLoading ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <Database size={16} />
                    )}
                    {searchBackfillLoading ? "Sincronizando…" : "Sincronizar ahora"}
                  </button>
                </div>
              </section>
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
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="panel-heading">
      <h2>{title}</h2>
      {action && (
        <button className="text-link" onClick={onAction} type="button">
          {action} <ArrowRight size={15} />
        </button>
      )}
    </div>
  );
}

function Timeline({
  activities,
  onOpen,
}: {
  activities: DashboardActivity[];
  onOpen: (activity: DashboardActivity) => void;
}) {
  if (!activities.length) {
    return (
      <div className="dashboard-empty-summary compact">
        <Clock3 size={22} />
        <strong>Aún no hay actividad en este periodo</strong>
        <p>Las actualizaciones que te correspondan aparecerán aquí.</p>
      </div>
    );
  }
  return (
    <div className="timeline">
      {activities.map((item) => (
        <button key={item.id} onClick={() => onOpen(item)} type="button">
          <span className={`timeline-dot ${item.category}`} />
          <div>
            <strong>{item.title}</strong>
            <p>{item.detail}</p>
            <small>{item.createdAt}</small>
          </div>
          <ChevronRight className="timeline-arrow" size={15} aria-hidden="true" />
        </button>
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
          <Image
            className="loading-logo"
            src={logoCehf}
            alt=""
            sizes="100px"
            unoptimized
          />
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
    materials: "Nuevo recurso",
    forum: "Nuevo tema",
    users: "Registrar cuenta",
  };
  return labels[section] ?? "Nuevo elemento";
}
