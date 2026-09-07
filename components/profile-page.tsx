"use client";

import {
  ArrowRight,
  Bell,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileBarChart,
  GraduationCap,
  LogOut,
  Mail,
  Palette,
  Paperclip,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { demoDailyGrades } from "@/components/academic-grades";
import { demoStudentWeeklyReports } from "@/components/academic-reports";
import {
  buildDashboardViewModel,
  dashboardReviewScope,
  dashboardTaskScope,
  roleMetricIconKey,
} from "@/lib/dashboard";
import { logoutFirebase } from "@/lib/firebase";
import { aggregateDailyGradesByWeek, watchDailyGrades } from "@/lib/grades-firebase";
import { watchStudentWeeklyReports } from "@/lib/reports-firebase";
import { isFirebaseTaskAssignment, watchTaskSubmissions } from "@/lib/tasks-firebase";
import { watchWeeklyReviewAttempts } from "@/lib/reviews-firebase";
import type {
  AcademicCalendar,
  AcademicConfig,
  DailyGradeRecord,
  LearningMaterial,
  ManagedAccount,
  PortalState,
  Role,
  SectionKey,
  StudentWeeklyReport,
  TaskAssignment,
  TaskSubmission,
  UserProfile,
  WeeklyReview,
  WeeklyReviewAttempt,
} from "@/lib/types";

type ProfilePageProps = {
  profile: UserProfile;
  state: PortalState;
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
  navigate: (section: SectionKey) => void;
  openTask: (id: string) => void;
};

const roleLabels: Record<Role, string> = {
  student: "Estudiante",
  teacher: "Docente",
  director: "Dirección",
};

const metricIcons: Record<string, ComponentType<{ size?: number }>> = {
  users: Users,
  tasks: ClipboardCheck,
  reviews: BookOpen,
  reports: FileBarChart,
  grades: GraduationCap,
  materials: Paperclip,
};

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatDueDate(value: string, timeZone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Consulta los detalles de la actividad.";
  return `Entrega ${new Intl.DateTimeFormat("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(date)}`;
}

function useProfileDashboard({
  profile,
  state,
  taskRecords,
  reviewRecords,
  materialRecords,
  viewedMaterialIds,
  academicConfig,
  academicCalendar,
  managedAccounts,
  firebaseReady,
}: Omit<
  ProfilePageProps,
  | "taskRecordsLoading"
  | "reviewRecordsLoading"
  | "materialRecordsLoading"
  | "managedAccountsLoading"
  | "navigate"
  | "openTask"
>) {
  const [grades, setGrades] = useState<DailyGradeRecord[]>([]);
  const [reports, setReports] = useState<StudentWeeklyReport[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(firebaseReady);
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
      const demoGrades = demoDailyGrades(
        profile,
        academicCalendar,
        academicConfig,
        managedAccounts,
      );
      queueMicrotask(() => {
        setGrades(demoGrades);
        setReports(
          demoStudentWeeklyReports(
            aggregateDailyGradesByWeek(demoGrades, academicCalendar),
            profile,
            academicConfig,
          ),
        );
        setRecordsLoading(false);
      });
      return;
    }

    let gradesReady = false;
    let reportsReady = false;
    queueMicrotask(() => setRecordsLoading(true));
    const finish = () => {
      if (gradesReady && reportsReady) setRecordsLoading(false);
    };
    const stopGrades = watchDailyGrades(
      profile,
      (nextGrades) => {
        setGrades(nextGrades);
        gradesReady = true;
        finish();
      },
      () => {
        gradesReady = true;
        finish();
      },
    );
    const stopReports = watchStudentWeeklyReports(
      profile,
      (nextReports) => {
        setReports(nextReports);
        reportsReady = true;
        finish();
      },
      () => {
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
      const legacyTasks = new Map(state.tasks.map((task) => [task.id, task]));
      const students = managedAccounts.filter(
        (account) => account.role === "student" && account.active,
      );
      const demoSubmissions: Record<string, TaskSubmission[]> = {};
      scopedTasks.forEach((task, index) => {
        const legacy = legacyTasks.get(task.id);
        if (!legacy || legacy.status === "published") return;
        const student = profile.role === "student"
          ? profile
          : students[index % Math.max(students.length, 1)];
        if (!student) return;
        const status: TaskSubmission["status"] =
          legacy.status === "reviewed" ? "reviewed" : "submitted";
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
          () => undefined,
        ),
      );
    return () => stops.forEach((stop) => stop());
  }, [firebaseReady, managedAccounts, profile, scopedTasks, state.tasks]);

  useEffect(() => {
    if (!firebaseReady || profile.role === "student") {
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
        () => undefined,
      ),
    );
    return () => stops.forEach((stop) => stop());
  }, [firebaseReady, profile.role, scopedReviews]);

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
        grades,
        reports,
        notifications: state.notifications,
        openModerationCount: state.forumModeration.filter(
          (item) => item.status === "open",
        ).length,
      }),
    [
      academicConfig,
      attemptsByReview,
      grades,
      managedAccounts,
      materialRecords,
      profile,
      reports,
      reviewRecords,
      state.forumModeration,
      state.notifications,
      submissionsByTask,
      taskRecords,
      viewedMaterialIds,
    ],
  );

  return { dashboard, recordsLoading };
}

export function ProfilePage(props: ProfilePageProps) {
  const {
    profile,
    state,
    taskRecordsLoading,
    reviewRecordsLoading,
    materialRecordsLoading,
    managedAccountsLoading,
    academicConfig,
    managedAccounts,
    navigate,
    openTask,
  } = props;
  const { dashboard, recordsLoading } = useProfileDashboard(props);
  const loading =
    recordsLoading ||
    taskRecordsLoading ||
    reviewRecordsLoading ||
    materialRecordsLoading ||
    (profile.role !== "student" && managedAccountsLoading);
  const assignedGroups = useMemo(() => {
    if (profile.role !== "teacher") return [];
    return [...new Set(
      managedAccounts
        .filter(
          (account) =>
            account.role === "student" &&
            account.active &&
            account.teacherIds.includes(profile.uid),
        )
        .map((account) => [account.grade, account.group].filter(Boolean).join(" "))
        .filter(Boolean),
    )].sort((first, second) => first.localeCompare(second, "es"));
  }, [managedAccounts, profile.role, profile.uid]);
  const createdAt = formatDate(profile.createdAt);
  const themeLabel =
    state.settings.theme === "dark"
      ? "Oscuro"
      : state.settings.theme === "system"
        ? "Según el dispositivo"
        : "Claro";
  const periodLabel = academicConfig.weekLabel || "Periodo actual";
  const facts = [
    profile.role === "student" && profile.schoolLevel
      ? {
          label: "Nivel",
          value: profile.schoolLevel === "secondary" ? "Secundaria" : "Primaria",
        }
      : null,
    profile.role === "student" && (profile.grade || profile.group)
      ? {
          label: "Grado y grupo",
          value: [profile.grade, profile.group].filter(Boolean).join(" "),
        }
      : null,
    profile.role === "student" && profile.guardianName
      ? { label: "Madre, padre o tutor", value: profile.guardianName }
      : null,
    profile.role === "teacher" && assignedGroups.length
      ? { label: "Grupos", value: assignedGroups.join(", ") }
      : null,
    profile.subjects?.length
      ? { label: "Materias", value: profile.subjects.join(", ") }
      : null,
    { label: "Estado de la cuenta", value: profile.active === false ? "Inactiva" : "Activa" },
    createdAt ? { label: "Miembro desde", value: createdAt } : null,
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact));
  const studentActions = [
    {
      key: "task",
      icon: ClipboardCheck,
      title: dashboard.nextTask?.title ?? "Tus tareas están al día",
      detail: dashboard.nextTask
        ? formatDueDate(
            dashboard.nextTask.dueAt,
            academicConfig.timezone || "America/Mexico_City",
          )
        : "Consulta tus entregas y actividades recientes.",
      action: () =>
        dashboard.nextTask ? openTask(dashboard.nextTask.id) : navigate("tasks"),
    },
    {
      key: "review",
      icon: BookOpen,
      title: dashboard.nextReview?.title ?? "No tienes repasos pendientes",
      detail: dashboard.nextReview
        ? `${dashboard.nextReview.subject} · ${dashboard.nextReview.myAttempt?.progress ?? 0}% completado`
        : "Puedes volver a consultar tus repasos completados.",
      action: () => navigate("weekly-review"),
    },
    {
      key: "report",
      icon: FileBarChart,
      title: dashboard.latestReport
        ? `Reporte de ${dashboard.latestReport.subject}`
        : "Aún no hay un reporte publicado",
      detail: dashboard.latestReport
        ? `${dashboard.latestReport.weekLabel} · ${dashboard.latestReport.teacherName}`
        : "Aparecerá aquí en cuanto tu docente lo comparta.",
      action: () => navigate("reports"),
    },
  ];
  const staffActions = dashboard.priorities.map((priority) => ({
    key: priority.id,
    icon: priority.section === "reports" ? FileBarChart : priority.section === "users" ? Users : ClipboardCheck,
    title: priority.title,
    detail: priority.detail,
    action: () => priority.taskId ? openTask(priority.taskId) : navigate(priority.section),
  }));
  const actions = profile.role === "student" ? studentActions : staffActions;

  return (
    <div className="account-profile-layout">
      <aside className="panel account-profile-identity">
        <div className="account-profile-cover" aria-hidden="true" />
        <div className="account-profile-avatar-wrap">
          <span
            className={`account-profile-avatar${profile.photoURL ? " has-photo" : ""}`}
            style={profile.photoURL ? { backgroundImage: `url(${profile.photoURL})` } : undefined}
            aria-label={profile.photoURL ? `Fotografía de ${profile.name}` : `Iniciales de ${profile.name}`}
          >
            {!profile.photoURL && profile.initials}
          </span>
          <span className="account-profile-status" title="Cuenta activa">
            <CheckCircle2 size={16} aria-hidden="true" />
          </span>
        </div>
        <div className="account-profile-name">
          <span className="account-profile-role">{roleLabels[profile.role]}</span>
          <h2>{profile.name}</h2>
          <p><Mail size={16} aria-hidden="true" /> {profile.email}</p>
        </div>
        <dl className="account-profile-facts">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
        <button
          className="secondary-button account-profile-logout"
          onClick={() => void logoutFirebase()}
          type="button"
        >
          <LogOut size={17} aria-hidden="true" /> Cerrar sesión
        </button>
      </aside>

      <div className="account-profile-main">
        <section className="panel account-profile-overview" aria-busy={loading}>
          <div className="account-profile-overview-heading">
            <div>
              <span className="eyebrow">Actividad del periodo</span>
              <h2>{profile.role === "student" ? "Tu avance, en un vistazo" : "Tu trabajo, en un vistazo"}</h2>
              <p>{loading ? "Estamos reuniendo tu información…" : dashboard.heroDescription}</p>
            </div>
            <span className="account-profile-period">
              <CalendarDays size={16} aria-hidden="true" /> {periodLabel}
            </span>
          </div>
          <div className="account-profile-metrics" aria-label="Resumen con datos actuales">
            {dashboard.metrics.map((metric) => {
              const Icon = metricIcons[roleMetricIconKey(profile.role, metric.key)] ?? GraduationCap;
              return (
                <article className={`account-profile-metric is-${metric.tone}`} key={metric.key}>
                  <span><Icon size={19} aria-hidden="true" /></span>
                  <strong>{loading ? "…" : metric.value}</strong>
                  <p>{metric.label}</p>
                </article>
              );
            })}
          </div>
          <div className="account-profile-live-note" role="status">
            <span />
            {props.firebaseReady
              ? "Información actualizada con la actividad del portal"
              : "Datos de demostración para explorar la experiencia"}
          </div>
        </section>

        <div className="account-profile-grid">
          <section className="panel account-profile-actions">
            <div className="account-profile-section-heading">
              <div>
                <span className="eyebrow">Siguiente paso</span>
                <h3>{profile.role === "student" ? "Continúa desde aquí" : "Prioridades del periodo"}</h3>
              </div>
              <ArrowRight size={19} aria-hidden="true" />
            </div>
            <div className="account-profile-action-list">
              {actions.map((item) => {
                const Icon = item.icon;
                return (
                  <button key={item.key} onClick={item.action} type="button">
                    <span className="account-profile-action-icon"><Icon size={19} aria-hidden="true" /></span>
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.detail}</small>
                    </span>
                    <ArrowRight size={17} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </section>

          <section className="panel account-profile-preferences">
            <div className="account-profile-section-heading">
              <div>
                <span className="eyebrow">Preferencias</span>
                <h3>Tu experiencia</h3>
              </div>
              <Palette size={20} aria-hidden="true" />
            </div>
            <div className="account-profile-preference-list">
              <div>
                <span><Palette size={18} aria-hidden="true" /></span>
                <div><strong>Tema</strong><small>{themeLabel}</small></div>
              </div>
              <div>
                <span><Bell size={18} aria-hidden="true" /></span>
                <div><strong>Movimiento</strong><small>{state.settings.reducedMotion ? "Reducido" : "Animaciones activas"}</small></div>
              </div>
            </div>
            <button className="secondary-button" onClick={() => navigate("settings")} type="button">
              Ajustar preferencias <ArrowRight size={16} aria-hidden="true" />
            </button>
          </section>
        </div>

        <aside className="account-profile-privacy">
          <span><ShieldCheck size={21} aria-hidden="true" /></span>
          <div>
            <strong>Tu información escolar es privada</strong>
            <p>
              Tus calificaciones, reportes y datos de cuenta solo están disponibles
              para las personas autorizadas dentro de Campus CEHF.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
