"use client";

import {
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  FileBarChart,
  GraduationCap,
  LogOut,
  Mail,
  Paperclip,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  buildDashboardViewModel,
  dashboardReviewScope,
  dashboardTaskScope,
  roleMetricIconKey,
} from "@/lib/dashboard";
import { logoutFirebase } from "@/lib/firebase";
import { watchDailyGrades } from "@/lib/grades-firebase";
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

function useProfileDashboard({
  profile,
  state,
  taskRecords,
  reviewRecords,
  materialRecords,
  viewedMaterialIds,
  academicConfig,
  managedAccounts,
  firebaseReady,
}: Omit<
  ProfilePageProps,
  | "taskRecordsLoading"
  | "reviewRecordsLoading"
  | "materialRecordsLoading"
  | "managedAccountsLoading"
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
  }, [profile]);

  useEffect(() => {
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
  }, [profile, scopedTasks]);

  useEffect(() => {
    if (profile.role === "student") {
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
  }, [profile.role, scopedReviews]);

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
    taskRecordsLoading,
    reviewRecordsLoading,
    materialRecordsLoading,
    managedAccountsLoading,
    managedAccounts,
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
            Información actualizada con la actividad del portal
          </div>
        </section>

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
