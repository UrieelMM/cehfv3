"use client";

import {
  Activity,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardPenLine,
  GraduationCap,
  LogOut,
  Moon,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Target,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { toast, Toaster } from "sonner";
import type { User } from "firebase/auth";
import {
  firebaseConfigured,
  friendlyFirebaseError,
  getProfile,
  listManagedAccounts,
  loginWithEmail,
  logoutFirebase,
  refreshPortalAccess,
  resetPassword,
  watchAuth,
} from "@/lib/firebase";
import {
  defaultAcademicCalendar,
  defaultAcademicConfig,
  resolveAcademicConfig,
  watchAcademicCalendar,
  watchAcademicConfig,
} from "@/lib/tasks-firebase";
import {
  calculateWeightedGrade,
  DEFAULT_GRADING_WEIGHTS,
  DEFAULT_WEEKLY_GRADE_SCORES,
  GRADING_CRITERIA,
  gradingWeightTotal,
  saveTeacherGradingConfig,
  saveWeeklyGrade,
  watchTeacherGradingConfig,
  watchWeeklyGrades,
} from "@/lib/grades-firebase";
import { demoManagedAccounts, demoProfiles } from "@/lib/demo-data";
import type {
  AcademicCalendar,
  AcademicConfig,
  AcademicWeek,
  GradingCriterion,
  GradingWeights,
  ManagedAccount,
  Role,
  TeacherGradingConfig,
  UserProfile,
  WeeklyGradeRecord,
  WeeklyGradeScores,
} from "@/lib/types";

type GradesTab = "summary" | "capture" | "weights";
type GradeTheme = "light" | "dark";

const DEMO_CONFIG_KEY = "cehf-calificaciones-demo-config";
const DEMO_RECORDS_KEY = "cehf-calificaciones-demo-records";

const roleLabels: Record<Role, string> = {
  director: "Dirección",
  teacher: "Docente",
  student: "Alumno",
};

const criterionDescriptions: Record<GradingCriterion, string> = {
  classWork: "Evidencias y actividades realizadas durante la clase.",
  homework: "Cumplimiento y calidad del trabajo en casa.",
  participation: "Aportaciones, colaboración y disposición para aprender.",
  attendance: "Asistencia y puntualidad durante la semana.",
  exam: "Evaluación o comprobación de aprendizajes de la semana.",
};

function defaultTeacherConfig(profile: UserProfile): TeacherGradingConfig {
  return {
    teacherId: profile.uid,
    teacherName: profile.name,
    institutionId: profile.institutionId,
    subjects: profile.subjects ?? [],
    weights: { ...DEFAULT_GRADING_WEIGHTS },
  };
}

function scoreTone(score: number) {
  if (score >= 90) return "outstanding";
  if (score >= 80) return "steady";
  if (score >= 70) return "developing";
  return "attention";
}

function average(values: number[]) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10;
}

function formatScore(value: number) {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" })
    .format(new Date(`${value}T12:00:00`));
}

function weekRange(week?: AcademicWeek) {
  if (!week) return "Sin fechas configuradas";
  return `${formatShortDate(week.startDate)} — ${formatShortDate(week.endDate)}`;
}

function sortedWeeks(calendar: AcademicCalendar) {
  return [...calendar.weeks].sort((first, second) => (
    first.startDate.localeCompare(second.startDate) || first.order - second.order
  ));
}

function weekPair(calendar: AcademicCalendar, config: AcademicConfig) {
  const weeks = sortedWeeks(calendar);
  let currentIndex = weeks.findIndex((week) => week.id === config.weekId);
  if (currentIndex < 0) {
    const now = Date.now();
    currentIndex = weeks.findLastIndex((week) => new Date(week.startAt).getTime() <= now);
  }
  if (currentIndex < 0 && weeks.length) currentIndex = 0;
  return {
    current: currentIndex >= 0 ? weeks[currentIndex] : undefined,
    previous: currentIndex > 0 ? weeks[currentIndex - 1] : undefined,
  };
}

function termForWeek(calendar: AcademicCalendar, weekId?: string) {
  if (!weekId) return undefined;
  return calendar.terms.find((term) => term.weekIds.includes(weekId));
}

function demoGrades(
  profile: UserProfile,
  calendar: AcademicCalendar,
  config: AcademicConfig,
) {
  try {
    const saved = window.localStorage.getItem(DEMO_RECORDS_KEY);
    if (saved) return JSON.parse(saved) as WeeklyGradeRecord[];
  } catch {
    window.localStorage.removeItem(DEMO_RECORDS_KEY);
  }
  const pair = weekPair(calendar, config);
  const week = pair.current;
  const term = termForWeek(calendar, week?.id);
  if (!week || !term) return [];
  const teachers = demoManagedAccounts.filter((account) => account.role === "teacher");
  const students = demoManagedAccounts.filter((account) => account.role === "student");
  const scoreSeeds: WeeklyGradeScores[] = [
    { classWork: 96, homework: 92, participation: 98, attendance: 100, exam: 94 },
    { classWork: 84, homework: 88, participation: 86, attendance: 100, exam: 82 },
    { classWork: 76, homework: 80, participation: 74, attendance: 90, exam: 78 },
  ];
  return teachers.flatMap((teacher, teacherIndex) => students.flatMap((student, studentIndex) => (
    teacher.subjects
      .filter((subject) => student.subjects.includes(subject) && student.teacherIds.includes(teacher.uid))
      .map((subject, subjectIndex) => {
        const scores = scoreSeeds[(teacherIndex + studentIndex + subjectIndex) % scoreSeeds.length];
        return {
          id: `${week.id}-${subject}-${teacher.uid}-${student.uid}`,
          institutionId: profile.institutionId,
          schoolYearId: config.schoolYearId,
          schoolYearLabel: config.schoolYearLabel,
          termId: term.id,
          termLabel: term.label,
          weekId: week.id,
          weekLabel: week.label,
          subjectId: subject.toLowerCase(),
          subject,
          teacherId: teacher.uid,
          teacherName: teacher.name,
          studentId: student.uid,
          studentName: student.name,
          studentGrade: student.grade,
          studentGroup: student.group,
          scores,
          weights: { ...DEFAULT_GRADING_WEIGHTS },
          weightedScore: calculateWeightedGrade(scores, DEFAULT_GRADING_WEIGHTS),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } satisfies WeeklyGradeRecord;
      })
  )));
}

function readDemoConfig(profile: UserProfile) {
  try {
    const raw = window.localStorage.getItem(`${DEMO_CONFIG_KEY}-${profile.uid}`);
    if (!raw) return defaultTeacherConfig(profile);
    const saved = JSON.parse(raw) as TeacherGradingConfig;
    return {
      ...defaultTeacherConfig(profile),
      ...saved,
      weights: { ...DEFAULT_GRADING_WEIGHTS, ...saved.weights },
    };
  } catch {
    return defaultTeacherConfig(profile);
  }
}

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await loginWithEmail(email.trim(), password, remember);
    } catch (error) {
      toast.error(friendlyFirebaseError(error));
    } finally {
      setSubmitting(false);
    }
  };

  const recover = async () => {
    if (!email.trim()) {
      toast.error("Escribe tu correo para enviarte el enlace de acceso.");
      return;
    }
    try {
      await resetPassword(email.trim());
      toast.success("Revisa tu correo para restablecer la contraseña.");
    } catch (error) {
      toast.error(friendlyFirebaseError(error));
    }
  };

  return (
    <main className="grades-login-shell">
      <div className="grades-login-visual" aria-hidden="true">
        <span className="login-orbit orbit-one" />
        <span className="login-orbit orbit-two" />
        <div className="login-score-card card-one"><small>Promedio semanal</small><strong>92.4</strong><i /></div>
        <div className="login-score-card card-two"><small>Avance del grupo</small><strong>86%</strong><i /></div>
        <div className="login-wordmark"><span>CEHF</span><strong>Calificaciones</strong><p>Decisiones claras para acompañar cada aprendizaje.</p></div>
      </div>
      <section className="grades-login-panel">
        <form onSubmit={submit}>
          <span className="grades-kicker">Portal académico</span>
          <h1>Bienvenido de nuevo</h1>
          <p>Consulta avances, captura resultados y entiende cada semana en un solo lugar.</p>
          <label><span>Correo institucional</span><input autoComplete="email" onChange={(event) => setEmail(event.target.value)} placeholder="nombre@cehf.edu.mx" required type="email" value={email} /></label>
          <label><span>Contraseña</span><input autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" required type="password" value={password} /></label>
          <div className="login-options">
            <label className="remember-choice"><input checked={remember} onChange={(event) => setRemember(event.target.checked)} type="checkbox" /><span>Recordarme</span></label>
            <button onClick={() => void recover()} type="button">Recuperar acceso</button>
          </div>
          <button className="grades-primary-action" disabled={submitting} type="submit">
            {submitting ? "Ingresando…" : "Entrar a Calificaciones"}<ArrowUpRight size={18} />
          </button>
        </form>
      </section>
      <Toaster position="top-right" richColors />
    </main>
  );
}

function LoadingScreen() {
  return (
    <main className="grades-loading-screen">
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}>
        <GraduationCap size={28} />
      </motion.div>
      <strong>Preparando tus calificaciones</strong>
      <span>Organizando semanas, materias y resultados…</span>
    </main>
  );
}

function WeekSwitch({
  current,
  previous,
  selectedId,
  onSelect,
}: {
  current?: AcademicWeek;
  previous?: AcademicWeek;
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grades-week-switch" aria-label="Selector de semana">
      <button className={previous?.id === selectedId ? "active" : ""} disabled={!previous} onClick={() => previous && onSelect(previous.id)} type="button">
        <ChevronLeft size={17} /><span><small>Anterior</small><strong>{previous?.label ?? "Sin anterior"}</strong></span>
      </button>
      <button className={current?.id === selectedId ? "active" : ""} disabled={!current} onClick={() => current && onSelect(current.id)} type="button">
        <span><small>Actual</small><strong>{current?.label ?? "Sin semana"}</strong></span><ChevronRight size={17} />
      </button>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon,
  tone,
  delay = 0,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
  tone: string;
  delay?: number;
}) {
  return (
    <motion.article className={`grade-metric-card is-${tone}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <div><span>{icon}</span><small>{label}</small></div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </motion.article>
  );
}

function DistributionChart({ records }: { records: WeeklyGradeRecord[] }) {
  const bands = [
    { label: "90–100", key: "outstanding", count: records.filter((item) => item.weightedScore >= 90).length },
    { label: "80–89", key: "steady", count: records.filter((item) => item.weightedScore >= 80 && item.weightedScore < 90).length },
    { label: "70–79", key: "developing", count: records.filter((item) => item.weightedScore >= 70 && item.weightedScore < 80).length },
    { label: "< 70", key: "attention", count: records.filter((item) => item.weightedScore < 70).length },
  ];
  const maximum = Math.max(1, ...bands.map((band) => band.count));
  return (
    <div className="distribution-chart" role="img" aria-label="Distribución de calificaciones por rango">
      {bands.map((band, index) => (
        <div key={band.key}>
          <strong>{band.count}</strong>
          <div><motion.i className={`is-${band.key}`} initial={{ height: 0 }} animate={{ height: `${Math.max(8, band.count / maximum * 100)}%` }} transition={{ delay: index * 0.06, duration: 0.45 }} /></div>
          <span>{band.label}</span>
        </div>
      ))}
    </div>
  );
}

function SubjectAverages({ records }: { records: WeeklyGradeRecord[] }) {
  const subjects = Array.from(new Set(records.map((record) => record.subject)))
    .map((subject) => ({
      subject,
      value: average(records.filter((record) => record.subject === subject).map((record) => record.weightedScore)),
    }))
    .sort((first, second) => second.value - first.value);
  if (!subjects.length) return <ChartEmpty />;
  return (
    <div className="subject-average-chart">
      {subjects.map((item, index) => (
        <div key={item.subject}>
          <span>{item.subject}</span>
          <div><motion.i initial={{ width: 0 }} animate={{ width: `${item.value}%` }} transition={{ duration: 0.5, delay: index * 0.05 }} /></div>
          <strong>{formatScore(item.value)}</strong>
        </div>
      ))}
    </div>
  );
}

function RubricAverages({ records }: { records: WeeklyGradeRecord[] }) {
  if (!records.length) return <ChartEmpty />;
  return (
    <div className="rubric-average-chart">
      {GRADING_CRITERIA.map((criterion, index) => {
        const value = average(records.map((record) => record.scores[criterion.key]));
        return (
          <div data-criterion={criterion.key} key={criterion.key}>
            <span>{criterion.shortLabel}</span>
            <div><motion.i initial={{ width: 0 }} animate={{ width: `${value}%` }} transition={{ duration: 0.5, delay: index * 0.04 }} /></div>
            <strong>{formatScore(value)}</strong>
          </div>
        );
      })}
    </div>
  );
}

function TrendChart({ records, calendar }: { records: WeeklyGradeRecord[]; calendar: AcademicCalendar }) {
  const entries = sortedWeeks(calendar)
    .map((week) => ({
      week,
      value: average(records.filter((record) => record.weekId === week.id).map((record) => record.weightedScore)),
      count: records.filter((record) => record.weekId === week.id).length,
    }))
    .filter((entry) => entry.count > 0)
    .slice(-6);
  if (!entries.length) return <ChartEmpty />;
  const minimum = Math.min(...entries.map((entry) => entry.value), 65);
  return (
    <div className="trend-chart" role="img" aria-label="Evolución del promedio por semana">
      {entries.map((entry, index) => (
        <div key={entry.week.id}>
          <strong>{formatScore(entry.value)}</strong>
          <div><motion.i initial={{ height: 0 }} animate={{ height: `${Math.max(12, (entry.value - minimum + 12) / (112 - minimum) * 100)}%` }} transition={{ duration: 0.48, delay: index * 0.05 }} /></div>
          <span>{entry.week.label.replace("Semana ", "S")}</span>
        </div>
      ))}
    </div>
  );
}

function ChartEmpty() {
  return <div className="chart-empty"><BarChart3 size={22} /><span>Los datos aparecerán al guardar calificaciones.</span></div>;
}

function StudentSubjectCards({ records }: { records: WeeklyGradeRecord[] }) {
  if (!records.length) {
    return <div className="grades-empty-state"><span><ClipboardPenLine size={24} /></span><h3>Esta semana todavía no tiene resultados</h3><p>Tus calificaciones aparecerán en cuanto tus profesores terminen la captura.</p></div>;
  }
  return (
    <div className="student-grade-cards">
      {records.map((record, index) => (
        <motion.article initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.045 }} key={record.id}>
          <header><div><small>{record.teacherName}</small><h3>{record.subject}</h3></div><strong className={`score-pill is-${scoreTone(record.weightedScore)}`}>{formatScore(record.weightedScore)}</strong></header>
          <div className="student-rubric-grid">
            {GRADING_CRITERIA.map((criterion) => (
              <div data-criterion={criterion.key} key={criterion.key}>
                <span><b>{criterion.shortLabel}</b><small>{record.weights[criterion.key]}%</small></span>
                <div><i style={{ width: `${record.scores[criterion.key]}%` }} /></div>
                <strong>{formatScore(record.scores[criterion.key])}</strong>
              </div>
            ))}
          </div>
        </motion.article>
      ))}
    </div>
  );
}

function RecentGrades({ records }: { records: WeeklyGradeRecord[] }) {
  const recent = [...records].sort((first, second) => second.updatedAt.localeCompare(first.updatedAt)).slice(0, 7);
  if (!recent.length) return <ChartEmpty />;
  return (
    <div className="recent-grades-table">
      <div className="recent-table-head"><span>Alumno</span><span>Materia</span><span>Docente</span><span>Resultado</span></div>
      {recent.map((record) => (
        <div key={record.id}><span><i>{record.studentName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2)}</i><b>{record.studentName}</b></span><span>{record.subject}</span><span>{record.teacherName}</span><strong className={`score-pill is-${scoreTone(record.weightedScore)}`}>{formatScore(record.weightedScore)}</strong></div>
      ))}
    </div>
  );
}

function SummaryDashboard({
  profile,
  records,
  allRecords,
  calendar,
  accounts,
}: {
  profile: UserProfile;
  records: WeeklyGradeRecord[];
  allRecords: WeeklyGradeRecord[];
  calendar: AcademicCalendar;
  accounts: ManagedAccount[];
}) {
  const overall = average(records.map((record) => record.weightedScore));
  const students = new Set(records.map((record) => record.studentId)).size;
  const teachers = new Set(records.map((record) => record.teacherId)).size;
  const attention = records.filter((record) => record.weightedScore < 70).length;
  const assignedExpected = profile.role === "teacher"
    ? (profile.subjects ?? []).reduce((total, subject) => total + accounts.filter((account) => (
        account.role === "student" && account.active && account.teacherIds.includes(profile.uid) && account.subjects.includes(subject)
      )).length, 0)
    : records.length;
  const completion = assignedExpected ? Math.min(100, Math.round(records.length / assignedExpected * 100)) : 0;
  const previousRecords = (() => {
    const weeks = sortedWeeks(calendar);
    const currentIndex = weeks.findIndex((week) => records.some((record) => record.weekId === week.id));
    const previous = currentIndex > 0 ? weeks[currentIndex - 1] : undefined;
    return previous ? allRecords.filter((record) => record.weekId === previous.id) : [];
  })();
  const previousAverage = average(previousRecords.map((record) => record.weightedScore));
  const delta = previousRecords.length ? Math.round((overall - previousAverage) * 10) / 10 : 0;

  const metrics = profile.role === "student"
    ? [
        { label: "Promedio semanal", value: records.length ? formatScore(overall) : "—", detail: delta ? `${delta > 0 ? "+" : ""}${delta} vs. semana anterior` : "Sin comparación disponible", icon: <TrendingUp size={19} />, tone: scoreTone(overall) },
        { label: "Materias calificadas", value: String(records.length), detail: "Resultados publicados esta semana", icon: <GraduationCap size={19} />, tone: "violet" },
        { label: "Mejor resultado", value: records.length ? formatScore(Math.max(...records.map((record) => record.weightedScore))) : "—", detail: [...records].sort((a, b) => b.weightedScore - a.weightedScore)[0]?.subject ?? "Aún sin datos", icon: <Sparkles size={19} />, tone: "lime" },
        { label: "Rubros destacados", value: String(GRADING_CRITERIA.filter((criterion) => average(records.map((record) => record.scores[criterion.key])) >= 90).length), detail: "Con promedio igual o mayor a 90", icon: <Target size={19} />, tone: "coral" },
      ]
    : [
        { label: "Promedio general", value: records.length ? formatScore(overall) : "—", detail: `${records.length} calificaciones en la semana`, icon: <TrendingUp size={19} />, tone: scoreTone(overall) },
        { label: profile.role === "director" ? "Alumnos evaluados" : "Captura completada", value: profile.role === "director" ? String(students) : `${completion}%`, detail: profile.role === "director" ? `${teachers} docentes con actividad` : `${records.length} de ${assignedExpected} registros`, icon: <UsersRound size={19} />, tone: "violet" },
        { label: "Resultados destacados", value: String(records.filter((record) => record.weightedScore >= 90).length), detail: "Calificaciones de 90 o más", icon: <Sparkles size={19} />, tone: "lime" },
        { label: "Requieren atención", value: String(attention), detail: "Calificaciones menores a 70", icon: <Target size={19} />, tone: "coral" },
      ];

  return (
    <div className="grades-summary-stack">
      <section className="grade-metrics-grid">
        {metrics.map((metric, index) => <MetricCard {...metric} delay={index * 0.045} key={metric.label} />)}
      </section>
      <section className="grades-analytics-grid">
        <article className="grades-chart-card chart-wide"><header><div><span className="grades-kicker">Rendimiento</span><h2>Promedio por materia</h2></div><Activity size={20} /></header><SubjectAverages records={records} /></article>
        <article className="grades-chart-card"><header><div><span className="grades-kicker">Distribución</span><h2>Rangos de resultado</h2></div><BarChart3 size={20} /></header><DistributionChart records={records} /></article>
        <article className="grades-chart-card"><header><div><span className="grades-kicker">Composición</span><h2>Promedio por rubro</h2></div><Target size={20} /></header><RubricAverages records={records} /></article>
        <article className="grades-chart-card chart-wide"><header><div><span className="grades-kicker">Evolución</span><h2>Tendencia semanal</h2></div><TrendingUp size={20} /></header><TrendChart records={allRecords} calendar={calendar} /></article>
      </section>
      {profile.role === "student" ? <StudentSubjectCards records={records} /> : (
        <section className="grades-chart-card grades-recent-card"><header><div><span className="grades-kicker">Actividad reciente</span><h2>Últimas calificaciones guardadas</h2></div><ClipboardPenLine size={20} /></header><RecentGrades records={records} /></section>
      )}
    </div>
  );
}

function GradeCaptureRow({
  student,
  record,
  weights,
  onSave,
}: {
  student: ManagedAccount;
  record?: WeeklyGradeRecord;
  weights: GradingWeights;
  onSave: (student: ManagedAccount, scores: WeeklyGradeScores) => Promise<void>;
}) {
  const [scores, setScores] = useState<WeeklyGradeScores>(record?.scores ?? { ...DEFAULT_WEEKLY_GRADE_SCORES });
  const [saving, setSaving] = useState(false);
  const result = calculateWeightedGrade(scores, weights);
  const persist = async () => {
    setSaving(true);
    try { await onSave(student, scores); } finally { setSaving(false); }
  };
  return (
    <motion.div className="capture-row" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} layout>
      <div className="capture-student"><i>{student.initials}</i><span><strong>{student.name}</strong><small>{student.grade} {student.group}</small></span></div>
      <div className="capture-scores">
        {GRADING_CRITERIA.map((criterion) => (
          <label key={criterion.key}><span>{criterion.shortLabel}</span><div><input aria-label={`${criterion.label} de ${student.name}`} max="100" min="0" onChange={(event) => setScores((current) => ({ ...current, [criterion.key]: Math.max(0, Math.min(100, Number(event.target.value))) }))} type="number" value={scores[criterion.key]} /><small>{weights[criterion.key]}%</small></div></label>
        ))}
      </div>
      <div className="capture-result"><strong className={`score-pill is-${scoreTone(result)}`}>{formatScore(result)}</strong><button disabled={saving} onClick={() => void persist()} type="button">{record ? <Check size={16} /> : <Save size={16} />}{saving ? "Guardando…" : record ? "Actualizar" : "Guardar"}</button></div>
    </motion.div>
  );
}

function CaptureWorkspace({
  profile,
  config,
  academicConfig,
  calendar,
  week,
  records,
  accounts,
  firebaseReady,
  onDemoRecords,
}: {
  profile: UserProfile;
  config: TeacherGradingConfig;
  academicConfig: AcademicConfig;
  calendar: AcademicCalendar;
  week?: AcademicWeek;
  records: WeeklyGradeRecord[];
  accounts: ManagedAccount[];
  firebaseReady: boolean;
  onDemoRecords: (records: WeeklyGradeRecord[]) => void;
}) {
  const subjects = profile.subjects ?? [];
  const [selectedSubject, setSelectedSubject] = useState(subjects[0] ?? "");
  const activeSubject = subjects.includes(selectedSubject) ? selectedSubject : subjects[0] ?? "";
  const students = accounts.filter((account) => account.role === "student" && account.active && account.teacherIds.includes(profile.uid) && account.subjects.includes(activeSubject));
  const term = termForWeek(calendar, week?.id);

  const persist = async (student: ManagedAccount, scores: WeeklyGradeScores) => {
    if (!week || !term) {
      toast.error("La semana debe pertenecer a un trimestre configurado.");
      return;
    }
    try {
      if (firebaseReady) {
        await saveWeeklyGrade(profile, config, academicConfig, week, term, student, activeSubject, scores);
      } else {
        const existing = records.find((record) => record.studentId === student.uid && record.subject === activeSubject && record.teacherId === profile.uid);
        const nextRecord: WeeklyGradeRecord = {
          id: existing?.id ?? `${week.id}-${activeSubject}-${profile.uid}-${student.uid}`,
          institutionId: profile.institutionId,
          schoolYearId: academicConfig.schoolYearId,
          schoolYearLabel: academicConfig.schoolYearLabel,
          termId: term.id,
          termLabel: term.label,
          weekId: week.id,
          weekLabel: week.label,
          subjectId: activeSubject.toLowerCase(),
          subject: activeSubject,
          teacherId: profile.uid,
          teacherName: profile.name,
          studentId: student.uid,
          studentName: student.name,
          studentGrade: student.grade,
          studentGroup: student.group,
          scores,
          weights: config.weights,
          weightedScore: calculateWeightedGrade(scores, config.weights),
          createdAt: existing?.createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const next = existing ? records.map((record) => record.id === existing.id ? nextRecord : record) : [nextRecord, ...records];
        onDemoRecords(next);
        window.localStorage.setItem(DEMO_RECORDS_KEY, JSON.stringify(next));
      }
      toast.success(`Calificación de ${student.name} guardada`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos guardar la calificación.");
    }
  };

  return (
    <section className="capture-workspace">
      <div className="capture-toolbar">
        <div><span className="grades-kicker">Captura semanal</span><h2>Califica a tu grupo</h2><p>Registra cada rubro de 0 a 100; el resultado ponderado se calcula al instante.</p></div>
        <label><span>Materia</span><select onChange={(event) => setSelectedSubject(event.target.value)} value={activeSubject}>{subjects.map((subject) => <option key={subject}>{subject}</option>)}</select></label>
      </div>
      <div className="weight-ribbon">{GRADING_CRITERIA.map((criterion) => <span data-criterion={criterion.key} key={criterion.key}><i />{criterion.shortLabel}<strong>{config.weights[criterion.key]}%</strong></span>)}</div>
      {!subjects.length ? <div className="grades-empty-state"><h3>No tienes materias asignadas</h3><p>Dirección debe actualizar tu perfil antes de iniciar la captura.</p></div> : !students.length ? <div className="grades-empty-state"><h3>No hay alumnos asignados a {activeSubject}</h3><p>Revisa las asignaciones de alumnos y materias.</p></div> : (
        <div className="capture-table"><div className="capture-table-head"><span>Alumno</span><span>Rubros de evaluación</span><span>Resultado</span></div>{students.map((student) => {
          const record = records.find((item) => item.studentId === student.uid && item.subject === activeSubject && item.teacherId === profile.uid);
          return <GradeCaptureRow key={`${week?.id}-${activeSubject}-${student.uid}-${record?.updatedAt ?? "new"}`} student={student} record={record} weights={config.weights} onSave={persist} />;
        })}</div>
      )}
    </section>
  );
}

function WeightsWorkspace({
  profile,
  config,
  firebaseReady,
  onDemoConfig,
}: {
  profile: UserProfile;
  config: TeacherGradingConfig;
  firebaseReady: boolean;
  onDemoConfig: (config: TeacherGradingConfig) => void;
}) {
  const [form, setForm] = useState<GradingWeights>(config.weights);
  const [saving, setSaving] = useState(false);
  const total = gradingWeightTotal(form);
  const persist = async (weights: GradingWeights, message: string) => {
    setSaving(true);
    try {
      if (firebaseReady) await saveTeacherGradingConfig(profile, weights);
      else {
        const next = { ...config, weights, subjects: profile.subjects ?? [], updatedAt: new Date().toISOString() };
        onDemoConfig(next);
        setForm(weights);
        window.localStorage.setItem(`${DEMO_CONFIG_KEY}-${profile.uid}`, JSON.stringify(next));
      }
      toast.success(message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos guardar la ponderación.");
    } finally { setSaving(false); }
  };
  return (
    <section className="weights-workspace">
      <header><div><span className="grades-kicker">Configuración docente</span><h2>Diseña tu ponderación</h2><p>La misma fórmula se aplicará a todas tus materias y alumnos asignados.</p></div><motion.div className={total === 100 ? "ready" : "pending"} animate={{ scale: total === 100 ? [1, 1.04, 1] : 1 }} key={total}><strong>{total}%</strong><span>{total === 100 ? "Lista para usar" : "Debe sumar 100"}</span></motion.div></header>
      <div className="weight-editor-grid">
        {GRADING_CRITERIA.map((criterion, index) => (
          <motion.label data-criterion={criterion.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.045 }} key={criterion.key}>
            <div><i /><span><strong>{criterion.label}</strong><small>{criterionDescriptions[criterion.key]}</small></span><output>{form[criterion.key]}%</output></div>
            <input aria-label={`Ponderación de ${criterion.label}`} max="100" min="0" onChange={(event) => setForm((current) => ({ ...current, [criterion.key]: Number(event.target.value) }))} type="range" value={form[criterion.key]} />
            <div className="weight-scale"><span>0%</span><input aria-label={`Valor numérico de ${criterion.label}`} max="100" min="0" onChange={(event) => setForm((current) => ({ ...current, [criterion.key]: Math.max(0, Math.min(100, Number(event.target.value))) }))} type="number" value={form[criterion.key]} /><span>100%</span></div>
          </motion.label>
        ))}
      </div>
      <footer><div className={total === 100 ? "ready" : "pending"}>{total === 100 ? <Check size={18} /> : <SlidersHorizontal size={18} />}<span>{total === 100 ? "La fórmula está equilibrada." : `Ajusta ${Math.abs(100 - total)} puntos para llegar a 100%.`}</span></div><div><button disabled={saving} onClick={() => void persist({ ...DEFAULT_GRADING_WEIGHTS }, "Ponderación CEHF restaurada")} type="button"><RotateCcw size={16} />Restaurar CEHF</button><button className="grades-primary-action" disabled={saving || total !== 100} onClick={() => void persist(form, "Ponderación guardada")} type="button"><Save size={16} />{saving ? "Guardando…" : "Guardar ponderación"}</button></div></footer>
    </section>
  );
}

export function GradesApp() {
  const [authReady, setAuthReady] = useState(!firebaseConfigured);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [demoRole, setDemoRole] = useState<Role>("teacher");
  const [tab, setTab] = useState<GradesTab>("summary");
  const [theme, setTheme] = useState<GradeTheme>(() => typeof window !== "undefined" && window.localStorage.getItem("cehf-grades-theme") === "dark" ? "dark" : "light");
  const [storedAcademicConfig, setStoredAcademicConfig] = useState(defaultAcademicConfig);
  const [calendar, setCalendar] = useState(defaultAcademicCalendar);
  const [accounts, setAccounts] = useState<ManagedAccount[]>(demoManagedAccounts);
  const [records, setRecords] = useState<WeeklyGradeRecord[]>([]);
  const [gradingConfig, setGradingConfig] = useState<TeacherGradingConfig>(() => defaultTeacherConfig(demoProfiles.teacher));
  const [loadingData, setLoadingData] = useState(firebaseConfigured);
  const currentProfile = profile ?? demoProfiles[demoRole];
  const firebaseReady = Boolean(firebaseUser && profile);
  const academicConfig = useMemo(() => resolveAcademicConfig({ ...storedAcademicConfig, institutionId: currentProfile.institutionId }, calendar), [calendar, currentProfile.institutionId, storedAcademicConfig]);
  const pair = useMemo(() => weekPair(calendar, academicConfig), [academicConfig, calendar]);
  const [selectedWeekId, setSelectedWeekId] = useState<string | undefined>(pair.current?.id);
  const activeWeekId = calendar.weeks.some((week) => week.id === selectedWeekId) ? selectedWeekId : pair.current?.id;
  const activeWeek = calendar.weeks.find((week) => week.id === activeWeekId);

  useEffect(() => {
    if (window.location.pathname !== "/calificaciones") {
      window.history.replaceState({}, "", "/calificaciones");
    }
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      void navigator.serviceWorker.register("/sw.js");
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.gradeTheme = theme;
    window.localStorage.setItem("cehf-grades-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!firebaseConfigured) return;
    return watchAuth(async (user) => {
      setAuthReady(false);
      setFirebaseUser(user);
      setAuthError(null);
      if (!user) {
        setProfile(null);
        setAuthReady(true);
        return;
      }
      try {
        const nextProfile = await getProfile(user);
        if (!nextProfile) throw new Error("Tu cuenta no tiene un perfil activo en CEHF.");
        await refreshPortalAccess(user);
        setProfile(nextProfile);
        setStoredAcademicConfig((current) => ({ ...current, institutionId: nextProfile.institutionId }));
      } catch (error) {
        setAuthError(friendlyFirebaseError(error));
      } finally { setAuthReady(true); }
    });
  }, []);

  useEffect(() => {
    if (!firebaseReady || !profile) return;
    return watchAcademicConfig(profile.institutionId, setStoredAcademicConfig, () => toast.error("No pudimos cargar el calendario académico."));
  }, [firebaseReady, profile]);

  useEffect(() => {
    if (!firebaseReady || !profile) return;
    return watchAcademicCalendar(storedAcademicConfig, setCalendar, () => toast.error("No pudimos cargar las semanas académicas."));
  }, [firebaseReady, profile, storedAcademicConfig]);

  useEffect(() => {
    if (!firebaseReady || !profile) return;
    queueMicrotask(() => setLoadingData(true));
    const stopRecords = watchWeeklyGrades(profile, (next) => { setRecords(next); setLoadingData(false); }, () => { setLoadingData(false); toast.error("No pudimos cargar las calificaciones."); });
    const stopConfig = profile.role === "teacher" ? watchTeacherGradingConfig(profile, setGradingConfig, () => toast.error("No pudimos cargar tu ponderación.")) : () => undefined;
    return () => { stopRecords(); stopConfig(); };
  }, [firebaseReady, profile]);

  useEffect(() => {
    if (!firebaseReady || !profile || profile.role === "student") return;
    let active = true;
    void listManagedAccounts(profile.institutionId, profile.role).then((next) => { if (active) setAccounts(next); }).catch(() => toast.error("No pudimos cargar las asignaciones."));
    return () => { active = false; };
  }, [firebaseReady, profile]);

  useEffect(() => {
    if (firebaseConfigured) return;
    queueMicrotask(() => {
      setStoredAcademicConfig(defaultAcademicConfig);
      setCalendar(defaultAcademicCalendar);
      setAccounts(demoManagedAccounts);
      setRecords(demoGrades(currentProfile, defaultAcademicCalendar, defaultAcademicConfig));
      setGradingConfig(readDemoConfig(currentProfile));
      setLoadingData(false);
      setTab("summary");
    });
  }, [currentProfile, demoRole]);

  useEffect(() => {
    if (currentProfile.role === "teacher") return;
    queueMicrotask(() => setTab("summary"));
  }, [currentProfile.role]);

  if (!authReady) return <LoadingScreen />;
  if (firebaseConfigured && !firebaseUser) return <LoginScreen />;
  if (firebaseConfigured && firebaseUser && (!profile || authError)) {
    return <main className="grades-access-error"><GraduationCap size={32} /><h1>No pudimos abrir Calificaciones</h1><p>{authError ?? "Tu perfil no está disponible."}</p><button onClick={() => void logoutFirebase()} type="button">Cerrar sesión</button></main>;
  }

  const scopedRecords = records.filter((record) => record.schoolYearId === academicConfig.schoolYearId);
  const weekRecords = scopedRecords.filter((record) => record.weekId === activeWeekId);
  const tabs: Array<{ id: GradesTab; label: string; icon: ReactNode }> = [
    { id: "summary", label: "Resumen", icon: <BarChart3 size={17} /> },
    ...(currentProfile.role === "teacher" ? [
      { id: "capture" as const, label: "Captura", icon: <ClipboardPenLine size={17} /> },
      { id: "weights" as const, label: "Ponderación", icon: <SlidersHorizontal size={17} /> },
    ] : []),
  ];

  return (
    <div className="grades-app-shell">
      <header className="grades-topbar">
        <Link className="grades-brand" href="/calificaciones"><span><GraduationCap size={20} /></span><div><strong>CEHF</strong><small>Calificaciones</small></div></Link>
        <div className="grades-topbar-actions">
          {!firebaseConfigured && <label className="demo-role-switch"><span>Vista demo</span><select onChange={(event) => setDemoRole(event.target.value as Role)} value={demoRole}><option value="teacher">Docente</option><option value="student">Alumno</option><option value="director">Dirección</option></select></label>}
          <button aria-label="Cambiar tema" className="grades-icon-button" onClick={() => setTheme((current) => current === "light" ? "dark" : "light")} type="button">{theme === "light" ? <Moon size={18} /> : <Sun size={18} />}</button>
          <div className="grades-profile-chip"><span>{currentProfile.initials}</span><div><strong>{currentProfile.name}</strong><small>{roleLabels[currentProfile.role]}</small></div></div>
          {firebaseReady && <button aria-label="Cerrar sesión" className="grades-icon-button" onClick={() => void logoutFirebase()} type="button"><LogOut size={18} /></button>}
        </div>
      </header>

      <main className="grades-main">
        <section className="grades-hero">
          <div className="grades-hero-copy"><span className="grades-kicker">{academicConfig.schoolYearLabel} · {termForWeek(calendar, activeWeekId)?.label ?? "Calendario académico"}</span><h1>Calificaciones</h1><p>{currentProfile.role === "student" ? "Entiende tus avances de la semana, materia por materia." : currentProfile.role === "teacher" ? "Captura, analiza y acompaña el progreso de tus alumnos." : "Una lectura clara del rendimiento académico de la institución."}</p></div>
          <div className="grades-hero-week"><div><CalendarDays size={19} /><span><small>{activeWeek?.label ?? "Sin semana"}</small><strong>{weekRange(activeWeek)}</strong></span></div><WeekSwitch current={pair.current} previous={pair.previous} selectedId={activeWeekId} onSelect={setSelectedWeekId} /></div>
        </section>

        <nav className="grades-tabs" aria-label="Secciones de Calificaciones">{tabs.map((item) => <button aria-selected={tab === item.id} className={tab === item.id ? "active" : ""} key={item.id} onClick={() => setTab(item.id)} role="tab" type="button">{item.icon}<span>{item.label}</span></button>)}</nav>

        {loadingData ? <div className="grades-content-loading"><span /><span /><span /></div> : (
          <AnimatePresence mode="wait">
            <motion.div className="grades-tab-panel" key={`${tab}-${activeWeekId}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
              {tab === "summary" && <SummaryDashboard profile={currentProfile} records={weekRecords} allRecords={scopedRecords} calendar={calendar} accounts={accounts} />}
              {tab === "capture" && currentProfile.role === "teacher" && <CaptureWorkspace profile={currentProfile} config={gradingConfig} academicConfig={academicConfig} calendar={calendar} week={activeWeek} records={weekRecords} accounts={accounts} firebaseReady={firebaseReady} onDemoRecords={(nextWeekRecords) => setRecords((current) => [...current.filter((record) => record.weekId !== activeWeekId), ...nextWeekRecords])} />}
              {tab === "weights" && currentProfile.role === "teacher" && <WeightsWorkspace profile={currentProfile} config={gradingConfig} firebaseReady={firebaseReady} onDemoConfig={setGradingConfig} />}
            </motion.div>
          </AnimatePresence>
        )}
      </main>
      <footer className="grades-footer"><span>CEHF Calificaciones</span><small>Información académica protegida · {academicConfig.schoolYearLabel}</small></footer>
      <Toaster position="top-right" richColors />
    </div>
  );
}
