import type {
  AcademicConfig,
  AppNotification,
  DailyGradeRecord,
  LearningMaterial,
  ManagedAccount,
  Role,
  SectionKey,
  StudentWeeklyReport,
  TaskAssignment,
  TaskSubmission,
  UserProfile,
  WeeklyReview,
  WeeklyReviewAttempt,
} from "./types";
import { includesSubject } from "./academic-subjects";

export type DashboardTone = "coral" | "violet" | "gold" | "mint";
export type DashboardProgressTone =
  | "critical"
  | "low"
  | "medium"
  | "high"
  | "complete";

export type DashboardMetric = {
  key: string;
  value: string;
  label: string;
  tone: DashboardTone;
};

export type DashboardPriority = {
  id: string;
  title: string;
  detail: string;
  status: string;
  section: SectionKey;
  taskId?: string;
};

export type DashboardActivity = {
  id: string;
  title: string;
  detail: string;
  createdAt: string;
  timestamp: number;
  category: AppNotification["category"];
  section: SectionKey;
  taskId?: string;
};

export type DashboardProgressItem = {
  id: string;
  label: string;
  detail: string;
  level: "achieved" | "in_progress" | "needs_support" | "not_observed";
};

export type DashboardViewModel = {
  periodWeekId: string;
  completion: number;
  completionLabel: string;
  heroTitle: string;
  heroDescription: string;
  metrics: DashboardMetric[];
  priorities: DashboardPriority[];
  activity: DashboardActivity[];
  progress: DashboardProgressItem[];
  nextTask?: TaskAssignment;
  nextReview?: WeeklyReview;
  nextMaterial?: LearningMaterial;
  latestReport?: StudentWeeklyReport;
};

type DashboardInput = {
  profile: UserProfile;
  academicConfig: AcademicConfig;
  accounts: ManagedAccount[];
  tasks: TaskAssignment[];
  submissionsByTask: Record<string, TaskSubmission[]>;
  reviews: WeeklyReview[];
  attemptsByReview: Record<string, WeeklyReviewAttempt[]>;
  materials: LearningMaterial[];
  viewedMaterialIds: Set<string>;
  grades: DailyGradeRecord[];
  reports: StudentWeeklyReport[];
  notifications: AppNotification[];
  openModerationCount: number;
  now?: number;
};

const categorySections: Record<AppNotification["category"], SectionKey> = {
  task: "tasks",
  review: "weekly-review",
  progress: "my-week",
  report: "reports",
  material: "materials",
  wall: "wall-newspaper",
  forum: "forum",
  workshop: "workshops",
  workspace: "weekly-progress",
  system: "dashboard",
};

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function dashboardProgressTone(value: number): DashboardProgressTone {
  const progress = clampPercent(value);
  if (progress <= 20) return "critical";
  if (progress <= 40) return "low";
  if (progress <= 60) return "medium";
  if (progress < 80) return "high";
  return "complete";
}

function ratio(completed: number, total: number) {
  return total ? clampPercent((completed / total) * 100) : 0;
}

function average(values: number[]) {
  return values.length
    ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
    : 0;
}

const performanceMessages = [
  [
    "Todo gran avance comienza con un primer paso.",
    "Este es un buen momento para comenzar a avanzar.",
    "Cada esfuerzo de hoy abre nuevas posibilidades.",
    "El camino apenas comienza y cada paso cuenta.",
    "Con constancia, cada meta se vuelve más cercana.",
  ],
  [
    "Ya hay avances importantes; sigamos construyendo.",
    "Cada paso suma y el progreso comienza a notarse.",
    "El esfuerzo constante está marcando la diferencia.",
    "Vamos por buen camino; aún hay mucho por lograr.",
    "Lo que hoy se fortalece será el logro de mañana.",
  ],
  [
    "El progreso es claro y seguimos avanzando con firmeza.",
    "Estamos a mitad del camino y cada esfuerzo cuenta.",
    "Los resultados comienzan a reflejar el trabajo realizado.",
    "Cada avance nos acerca a una semana más completa.",
    "El compromiso está dando frutos; continuemos así.",
  ],
  [
    "El desempeño avanza con fuerza y constancia.",
    "El esfuerzo sostenido se refleja en grandes resultados.",
    "Estamos muy cerca de alcanzar todas las metas.",
    "El progreso inspira; mantengamos este buen ritmo.",
    "Cada logro confirma que vamos por excelente camino.",
  ],
  [
    "El desempeño es excelente; sigamos creciendo.",
    "Los grandes resultados reflejan un esfuerzo extraordinario.",
    "El compromiso de esta semana merece celebrarse.",
    "Estamos alcanzando las metas con excelencia.",
    "Este progreso demuestra todo lo que podemos lograr.",
  ],
] as const;

export function dashboardPerformanceMessage(completion: number, seed: string) {
  const value = clampPercent(completion);
  const rangeIndex = value <= 20 ? 0 : value <= 40 ? 1 : value <= 60 ? 2 : value <= 80 ? 3 : 4;
  const messages = performanceMessages[rangeIndex];
  const messageIndex = [...seed].reduce(
    (hash, character) => (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0,
    0,
  ) % messages.length;
  return messages[messageIndex];
}

function scoreLabel(value: number, hasRecords: boolean) {
  if (!hasRecords) return "—";
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}

function timestamp(value?: string) {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

export function dashboardRelativeTime(value: string | undefined, now = Date.now()) {
  const time = timestamp(value);
  if (!time) return "Reciente";
  const difference = Math.max(0, now - time);
  if (difference < 60_000) return "Ahora";
  if (difference < 3_600_000) return `Hace ${Math.max(1, Math.floor(difference / 60_000))} min`;
  if (difference < 86_400_000) return `Hace ${Math.floor(difference / 3_600_000)} h`;
  if (difference < 172_800_000) return "Ayer";
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" }).format(new Date(time));
}

function activePeriodWeekId(input: DashboardInput) {
  if (input.academicConfig.weekId) return input.academicConfig.weekId;
  const candidates = [
    ...input.tasks.map((item) => ({ weekId: item.weekId, time: timestamp(item.updatedAt) })),
    ...input.reviews.map((item) => ({ weekId: item.weekId, time: timestamp(item.updatedAt) })),
    ...input.grades.map((item) => ({ weekId: item.weekId, time: timestamp(item.updatedAt) })),
    ...input.reports.map((item) => ({ weekId: item.weekId, time: timestamp(item.updatedAt) })),
  ].filter((item) => item.weekId);
  return candidates.sort((first, second) => second.time - first.time)[0]?.weekId ?? "";
}

function visibleToRole<T extends { studentId?: string; teacherId?: string }>(
  items: T[],
  profile: UserProfile,
) {
  if (profile.role === "student") return items.filter((item) => item.studentId === profile.uid);
  if (profile.role === "teacher") return items.filter((item) => item.teacherId === profile.uid);
  return items;
}

function uniqueLatestGrades(grades: DailyGradeRecord[]) {
  const latest = new Map<string, DailyGradeRecord>();
  grades.forEach((grade) => {
    const key = `${grade.studentId}:${grade.subjectId}`;
    const current = latest.get(key);
    if (!current || timestamp(grade.updatedAt) > timestamp(current.updatedAt)) latest.set(key, grade);
  });
  return [...latest.values()];
}

function buildActivity(
  input: DashboardInput,
  periodTasks: TaskAssignment[],
  periodReviews: WeeklyReview[],
  periodMaterials: LearningMaterial[],
  periodGrades: DailyGradeRecord[],
  periodReports: StudentWeeklyReport[],
) {
  const now = input.now ?? Date.now();
  const taskById = new Map(periodTasks.map((task) => [task.id, task]));
  const reviewById = new Map(periodReviews.map((review) => [review.id, review]));
  const activities: DashboardActivity[] = [];

  input.notifications.forEach((notification) => {
    activities.push({
      id: `notification:${notification.id}`,
      title: notification.title,
      detail: notification.detail,
      createdAt: notification.createdAtIso
        ? dashboardRelativeTime(notification.createdAtIso, now)
        : notification.createdAt,
      timestamp: timestamp(notification.createdAtIso),
      category: notification.category,
      section: categorySections[notification.category] ?? "dashboard",
    });
  });

  Object.entries(input.submissionsByTask).forEach(([taskId, submissions]) => {
    const task = taskById.get(taskId);
    if (!task) return;
    submissions.forEach((submission) => {
      const isStudent = input.profile.role === "student";
      const title = isStudent
        ? submission.status === "feedback"
          ? `Recibiste retroalimentación en ${task.title}`
          : submission.status === "reviewed"
            ? `Tu tarea ${task.title} fue revisada`
            : `Entregaste ${task.title}`
        : `${submission.studentName} entregó ${task.title}`;
      activities.push({
        id: `submission:${taskId}:${submission.id}:${submission.updatedAt}`,
        title,
        detail: `${task.subject} · ${submission.status === "reviewed" ? "Revisada" : submission.status === "feedback" ? "Con comentarios" : "Lista para revisar"}`,
        createdAt: dashboardRelativeTime(submission.updatedAt, now),
        timestamp: timestamp(submission.updatedAt),
        category: "task",
        section: "tasks",
        taskId,
      });
    });
  });

  Object.entries(input.attemptsByReview).forEach(([reviewId, attempts]) => {
    const review = reviewById.get(reviewId);
    if (!review) return;
    attempts.forEach((attempt) => {
      activities.push({
        id: `attempt:${reviewId}:${attempt.id}:${attempt.updatedAt}`,
        title: input.profile.role === "student"
          ? attempt.status === "completed" ? `Completaste ${review.title}` : `Avanzaste en ${review.title}`
          : `${attempt.studentName} ${attempt.status === "completed" ? "completó" : "avanzó en"} ${review.title}`,
        detail: `${review.subject} · ${attempt.progress}% de avance`,
        createdAt: dashboardRelativeTime(attempt.updatedAt, now),
        timestamp: timestamp(attempt.updatedAt),
        category: "review",
        section: "weekly-review",
      });
    });
  });

  periodReports.forEach((report) => {
    activities.push({
      id: `report:${report.id}:${report.updatedAt}`,
      title: input.profile.role === "student"
        ? `Tienes un reporte nuevo de ${report.subject}`
        : `Reporte de ${report.studentName} ${report.status === "published" ? "publicado" : "guardado"}`,
      detail: `${report.weekLabel} · ${report.teacherName}`,
      createdAt: dashboardRelativeTime(report.updatedAt, now),
      timestamp: timestamp(report.updatedAt),
      category: "report",
      section: "reports",
    });
  });

  uniqueLatestGrades(periodGrades).forEach((grade) => {
    activities.push({
      id: `grade:${grade.id}:${grade.updatedAt}`,
      title: input.profile.role === "student"
        ? `Se actualizó tu calificación de ${grade.subject}`
        : `Calificación registrada para ${grade.studentName}`,
      detail: `${grade.subject} · ${scoreLabel(grade.weightedScore, true)}`,
      createdAt: dashboardRelativeTime(grade.updatedAt, now),
      timestamp: timestamp(grade.updatedAt),
      category: "progress",
      section: "my-week",
    });
  });

  if (input.profile.role === "student") {
    periodMaterials.forEach((material) => {
      activities.push({
        id: `material:${material.id}:${material.updatedAt}`,
        title: `${material.required ? "Nuevo recurso obligatorio" : "Nuevo recurso"}: ${material.title}`,
        detail: `${material.subject} · ${material.weekLabel}`,
        createdAt: dashboardRelativeTime(material.updatedAt, now),
        timestamp: timestamp(material.updatedAt),
        category: "material",
        section: "materials",
      });
    });
  } else {
    periodTasks.forEach((task) => {
      activities.push({
        id: `task:${task.id}:${task.updatedAt}`,
        title: `${task.status === "draft" ? "Borrador actualizado" : "Actividad actualizada"}: ${task.title}`,
        detail: `${task.subject} · ${task.targetGroup}`,
        createdAt: dashboardRelativeTime(task.updatedAt, now),
        timestamp: timestamp(task.updatedAt),
        category: "task",
        section: "tasks",
        taskId: task.id,
      });
    });
  }

  const seen = new Set<string>();
  return activities
    .sort((first, second) => second.timestamp - first.timestamp)
    .filter((activity) => {
      const key = `${activity.title}:${activity.detail}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);
}

function studentViewModel(
  input: DashboardInput,
  base: Omit<DashboardViewModel, "completion" | "completionLabel" | "heroTitle" | "heroDescription" | "metrics" | "priorities" | "progress">,
  periodTasks: TaskAssignment[],
  periodReviews: WeeklyReview[],
  periodMaterials: LearningMaterial[],
  periodGrades: DailyGradeRecord[],
  periodReports: StudentWeeklyReport[],
): DashboardViewModel {
  const taskSubmissions = new Map(
    Object.entries(input.submissionsByTask).flatMap(([taskId, submissions]) =>
      submissions.filter((submission) => submission.studentId === input.profile.uid).map((submission) => [taskId, submission] as const),
    ),
  );
  const availableTasks = periodTasks.filter((task) => ["published", "closed"].includes(task.status));
  const completedTasks = availableTasks.filter((task) => {
    const submission = taskSubmissions.get(task.id);
    return submission && ["submitted", "feedback", "reviewed"].includes(submission.status);
  });
  const missedTasks = availableTasks.filter(
    (task) => task.status === "closed" && !taskSubmissions.has(task.id),
  );
  const availableReviews = periodReviews.filter((review) => ["published", "closed"].includes(review.status));
  const completedReviews = availableReviews.filter((review) => review.myAttempt?.status === "completed");
  const requiredMaterials = periodMaterials.filter((material) => material.required);
  const viewedRequired = requiredMaterials.filter((material) => input.viewedMaterialIds.has(material.id));
  const viewedMaterials = periodMaterials.filter((material) => input.viewedMaterialIds.has(material.id));
  const componentProgress = [
    availableTasks.length ? ratio(completedTasks.length, availableTasks.length) : undefined,
    availableReviews.length ? ratio(completedReviews.length, availableReviews.length) : undefined,
    requiredMaterials.length ? ratio(viewedRequired.length, requiredMaterials.length) : undefined,
  ].filter((value): value is number => value !== undefined);
  const completion = componentProgress.length ? clampPercent(average(componentProgress)) : 0;
  const pendingTasks = availableTasks
    .filter((task) => !taskSubmissions.has(task.id) && task.status === "published")
    .sort((first, second) => timestamp(first.dueAt) - timestamp(second.dueAt));
  const nextReview = availableReviews
    .filter((review) => review.myAttempt?.status !== "completed")
    .sort((first, second) => timestamp(second.updatedAt) - timestamp(first.updatedAt))[0];
  const nextMaterial = periodMaterials
    .filter((material) => !input.viewedMaterialIds.has(material.id))
    .sort((first, second) => Number(second.required) - Number(first.required) || timestamp(second.updatedAt) - timestamp(first.updatedAt))[0];
  const gradeAverage = average(periodGrades.map((grade) => grade.weightedScore));
  const latestReport = [...periodReports]
    .filter((report) => report.status === "published")
    .sort((first, second) => timestamp(second.publishedAt ?? second.updatedAt) - timestamp(first.publishedAt ?? first.updatedAt))[0];
  const progress: DashboardProgressItem[] = [
    {
      id: "grades",
      label: "Calificaciones de la semana",
      detail: periodGrades.length ? `Tu promedio registrado es ${scoreLabel(gradeAverage, true)}.` : "Aún no hay calificaciones publicadas para esta semana.",
      level: !periodGrades.length ? "not_observed" : gradeAverage >= 80 ? "achieved" : gradeAverage >= 60 ? "in_progress" : "needs_support",
    },
    {
      id: "tasks",
      label: "Tareas y evidencias",
      detail: `${completedTasks.length} de ${availableTasks.length} ${availableTasks.length === 1 ? "entregada" : "entregadas"}.`,
      level: !availableTasks.length ? "not_observed" : missedTasks.length ? "needs_support" : completedTasks.length === availableTasks.length ? "achieved" : "in_progress",
    },
    {
      id: "reviews",
      label: "Repasos",
      detail: `${completedReviews.length} de ${availableReviews.length} ${availableReviews.length === 1 ? "completado" : "completados"}.`,
      level: !availableReviews.length ? "not_observed" : completedReviews.length === availableReviews.length ? "achieved" : "in_progress",
    },
  ];

  return {
    ...base,
    completion,
    completionLabel: "Tu avance real",
    heroTitle: dashboardPerformanceMessage(
      completion,
      `${input.profile.uid}:${base.periodWeekId}`,
    ),
    heroDescription: periodGrades.length
      ? `Tu promedio registrado es ${scoreLabel(gradeAverage, true)} y ya entregaste ${completedTasks.length} de ${availableTasks.length} tareas.`
      : `Aquí ves solamente tus tareas, repasos, recursos y reportes disponibles.`,
    metrics: [
      { key: "average", value: scoreLabel(gradeAverage, periodGrades.length > 0), label: "Promedio semanal", tone: "violet" },
      { key: "tasks", value: `${completedTasks.length}/${availableTasks.length}`, label: "Tareas entregadas", tone: "coral" },
      { key: "reviews", value: `${completedReviews.length}/${availableReviews.length}`, label: "Repasos completados", tone: "gold" },
      { key: "materials", value: `${viewedMaterials.length}/${periodMaterials.length}`, label: "Recursos consultados", tone: "mint" },
    ],
    priorities: [],
    progress,
    nextTask: pendingTasks[0],
    nextReview,
    nextMaterial,
    latestReport,
  };
}

function staffViewModel(
  input: DashboardInput,
  base: Omit<DashboardViewModel, "completion" | "completionLabel" | "heroTitle" | "heroDescription" | "metrics" | "priorities" | "progress">,
  periodTasks: TaskAssignment[],
  periodReviews: WeeklyReview[],
  periodMaterials: LearningMaterial[],
  periodGrades: DailyGradeRecord[],
  periodReports: StudentWeeklyReport[],
): DashboardViewModel {
  const director = input.profile.role === "director";
  const activeStudents = input.accounts.filter((account) => account.role === "student" && account.active);
  const activeTeachers = input.accounts.filter((account) => account.role === "teacher" && account.active);
  const eligibleStudents = director
    ? activeStudents
    : activeStudents.filter((student) => student.teacherIds.includes(input.profile.uid));
  const submissions = Object.values(input.submissionsByTask).flat();
  const reviewQueue = submissions.filter((submission) => submission.status === "submitted");
  const gradedStudentIds = new Set(periodGrades.map((grade) => grade.studentId));
  const gradeCoverage = ratio(gradedStudentIds.size, eligibleStudents.length);
  const reportPairs = new Set(periodReports.map((report) => `${report.studentId}:${report.subject}`));
  const expectedReportPairs = new Set(
    eligibleStudents.flatMap((student) => {
      const subjects = director
        ? student.subjects
        : student.subjects.filter((subject) =>
            includesSubject(input.profile.subjects ?? [], subject),
          );
      return subjects.map((subject) => `${student.uid}:${subject}`);
    }),
  );
  const reportCoverage = ratio(reportPairs.size, expectedReportPairs.size);
  const publishedTasks = periodTasks.filter((task) => task.status === "published");
  const publishedReviews = periodReviews.filter((review) => review.status === "published");
  const contentPreparation = average([
    publishedTasks.length ? 100 : 0,
    publishedReviews.length ? 100 : 0,
    periodMaterials.length ? 100 : 0,
  ]);
  const completion = clampPercent(average([contentPreparation, gradeCoverage, reportCoverage]));
  const totalReviewAudience = periodReviews.reduce((sum, review) => sum + review.audienceCount, 0);
  const totalReviewCompleted = periodReviews.reduce((sum, review) => {
    const attempts = input.attemptsByReview[review.id];
    return sum + (attempts?.filter((attempt) => attempt.status === "completed").length ?? review.completedCount);
  }, 0);
  const reviewCompletion = ratio(totalReviewCompleted, totalReviewAudience);
  const pendingReports = Math.max(0, expectedReportPairs.size - reportPairs.size);
  const studentsWithoutGrades = Math.max(0, eligibleStudents.length - gradedStudentIds.size);
  const priorities: DashboardPriority[] = [];

  if (director) {
    const groups = new Map<string, ManagedAccount[]>();
    activeStudents.forEach((student) => {
      const group = [student.grade, student.group].filter(Boolean).join(" ") || "Sin grupo";
      groups.set(group, [...(groups.get(group) ?? []), student]);
    });
    [...groups.entries()]
      .map(([group, students]) => {
        const graded = students.filter((student) => gradedStudentIds.has(student.uid)).length;
        const coverage = ratio(graded, students.length);
        const tasks = periodTasks.filter((task) => task.targetGroup === group && task.status === "published").length;
        return { group, students, coverage, tasks };
      })
      .sort((first, second) => first.coverage - second.coverage || first.group.localeCompare(second.group, "es"))
      .slice(0, 3)
      .forEach((group) => priorities.push({
        id: `group:${group.group}`,
        title: `${group.group} · ${group.students.length} ${group.students.length === 1 ? "alumno" : "alumnos"}`,
        detail: `${group.tasks} ${group.tasks === 1 ? "actividad publicada" : "actividades publicadas"} · ${group.students.length - Math.round((group.coverage / 100) * group.students.length)} sin captura`,
        status: `${group.coverage}% seguimiento`,
        section: "users",
      }));
  } else {
    const taskWithQueue = periodTasks
      .map((task) => ({ task, count: (input.submissionsByTask[task.id] ?? []).filter((submission) => submission.status === "submitted").length }))
      .sort((first, second) => second.count - first.count)[0];
    if (taskWithQueue?.count) priorities.push({
      id: `task:${taskWithQueue.task.id}`,
      title: `Revisar ${taskWithQueue.task.title}`,
      detail: `${taskWithQueue.count} ${taskWithQueue.count === 1 ? "entrega nueva" : "entregas nuevas"} de ${taskWithQueue.task.targetGroup}`,
      status: "Ahora",
      section: "tasks",
      taskId: taskWithQueue.task.id,
    });
    if (pendingReports) priorities.push({
      id: "pending-reports",
      title: "Completar reportes semanales",
      detail: `${pendingReports} ${pendingReports === 1 ? "reporte pendiente" : "reportes pendientes"} para tus materias`,
      status: "Esta semana",
      section: "reports",
    });
    if (studentsWithoutGrades) priorities.push({
      id: "missing-grades",
      title: "Registrar calificaciones",
      detail: `${studentsWithoutGrades} ${studentsWithoutGrades === 1 ? "alumno sin captura" : "alumnos sin captura"} en el periodo`,
      status: "Hoy",
      section: "my-week",
    });
    if (input.openModerationCount) priorities.push({
      id: "moderation",
      title: "Revisar conversaciones reportadas",
      detail: `${input.openModerationCount} ${input.openModerationCount === 1 ? "caso abierto" : "casos abiertos"}`,
      status: "Pendiente",
      section: "forum",
    });
  }

  if (!priorities.length) priorities.push({
    id: "all-clear",
    title: director ? "Los grupos no tienen alertas visibles" : "Tus pendientes principales están al día",
    detail: `${eligibleStudents.length} ${eligibleStudents.length === 1 ? "alumno activo" : "alumnos activos"} en el seguimiento actual`,
    status: "Al día",
    section: director ? "users" : "my-week",
  });

  const publishedReports = periodReports.filter((report) => report.status === "published").length;
  return {
    ...base,
    completion,
    completionLabel: director ? "Cobertura de seguimiento" : "Preparación semanal",
    heroTitle: dashboardPerformanceMessage(
      completion,
      `${input.profile.uid}:${base.periodWeekId}`,
    ),
    heroDescription: director
      ? `${gradeCoverage}% del alumnado tiene captura y se han publicado ${publishedReports} reportes en el periodo.`
      : `${gradeCoverage}% de tus alumnos tiene calificaciones y faltan ${pendingReports} reportes por completar.`,
    metrics: director
      ? [
          { key: "students", value: String(activeStudents.length), label: "Alumnos activos", tone: "violet" },
          { key: "teachers", value: String(activeTeachers.length), label: "Docentes activos", tone: "mint" },
          { key: "tasks", value: String(publishedTasks.length), label: "Actividades de la semana", tone: "coral" },
          { key: "reports", value: String(publishedReports), label: "Reportes publicados", tone: "gold" },
        ]
      : [
          { key: "review-queue", value: String(reviewQueue.length), label: "Entregas por revisar", tone: "coral" },
          { key: "review-progress", value: `${reviewCompletion}%`, label: "Repasos completados", tone: "violet" },
          { key: "reports", value: String(pendingReports), label: "Reportes pendientes", tone: "gold" },
          { key: "grades", value: String(studentsWithoutGrades), label: "Alumnos sin captura", tone: "mint" },
        ],
    priorities: priorities.slice(0, 3),
    progress: [],
  };
}

export function buildDashboardViewModel(input: DashboardInput): DashboardViewModel {
  const periodWeekId = activePeriodWeekId(input);
  const inPeriod = <T extends { schoolYearId: string; weekId: string }>(item: T) =>
    item.schoolYearId === input.academicConfig.schoolYearId && (!periodWeekId || item.weekId === periodWeekId);
  const periodTasks = input.tasks.filter(inPeriod);
  const periodReviews = input.reviews.filter(inPeriod);
  const periodMaterials = input.materials.filter(inPeriod);
  const periodGrades = visibleToRole(input.grades, input.profile).filter(inPeriod);
  const periodReports = visibleToRole(input.reports, input.profile).filter(inPeriod);
  const base = {
    periodWeekId,
    activity: buildActivity(input, periodTasks, periodReviews, periodMaterials, periodGrades, periodReports),
  };
  if (input.profile.role !== "student") {
    return staffViewModel(input, base, periodTasks, periodReviews, periodMaterials, periodGrades, periodReports);
  }
  const dashboard = studentViewModel(
    input,
    base,
    periodTasks,
    periodReviews,
    periodMaterials,
    periodGrades,
    periodReports,
  );
  const latestReport = visibleToRole(input.reports, input.profile)
    .filter((report) => report.schoolYearId === input.academicConfig.schoolYearId && report.status === "published")
    .sort((first, second) => timestamp(second.publishedAt ?? second.updatedAt) - timestamp(first.publishedAt ?? first.updatedAt))[0];
  return { ...dashboard, latestReport: latestReport ?? dashboard.latestReport };
}

export function dashboardTaskScope(tasks: TaskAssignment[], academicConfig: AcademicConfig, limit = 24) {
  const current = academicConfig.weekId
    ? tasks.filter((task) => task.schoolYearId === academicConfig.schoolYearId && task.weekId === academicConfig.weekId)
    : tasks.filter((task) => task.schoolYearId === academicConfig.schoolYearId);
  return [...current]
    .sort((first, second) => timestamp(second.updatedAt) - timestamp(first.updatedAt))
    .slice(0, limit);
}

export function dashboardReviewScope(reviews: WeeklyReview[], academicConfig: AcademicConfig, limit = 16) {
  const current = academicConfig.weekId
    ? reviews.filter((review) => review.schoolYearId === academicConfig.schoolYearId && review.weekId === academicConfig.weekId)
    : reviews.filter((review) => review.schoolYearId === academicConfig.schoolYearId);
  return [...current]
    .sort((first, second) => timestamp(second.updatedAt) - timestamp(first.updatedAt))
    .slice(0, limit);
}

export function roleMetricIconKey(role: Role, metricKey: string) {
  if (metricKey === "students" || metricKey === "teachers") return "users";
  if (metricKey === "tasks" || metricKey === "review-queue") return "tasks";
  if (metricKey === "reviews" || metricKey === "review-progress") return "reviews";
  if (metricKey === "reports") return "reports";
  if (metricKey === "average" || metricKey === "grades") return "grades";
  if (metricKey === "materials") return "materials";
  return role === "student" ? "grades" : "users";
}
