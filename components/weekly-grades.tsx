"use client";

import {
  Activity,
  BarChart3,
  BookOpenCheck,
  CalendarRange,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardPenLine,
  GraduationCap,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
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
import type {
  AcademicCalendar,
  AcademicConfig,
  AcademicWeek,
  GradingWeights,
  ManagedAccount,
  TeacherGradingConfig,
  UserProfile,
  WeeklyGradeRecord,
  WeeklyGradeScores,
} from "@/lib/types";

const DEMO_CONFIG_KEY = "cehf-demo-grading-config";
const DEMO_GRADES_KEY = "cehf-demo-weekly-grades";

function defaultConfig(profile: UserProfile): TeacherGradingConfig {
  return {
    teacherId: profile.uid,
    teacherName: profile.name,
    institutionId: profile.institutionId,
    weights: { ...DEFAULT_GRADING_WEIGHTS },
    subjects: profile.subjects ?? [],
  };
}

function readDemoConfig(profile: UserProfile) {
  try {
    const saved = window.localStorage.getItem(`${DEMO_CONFIG_KEY}-${profile.uid}`);
    if (!saved) return defaultConfig(profile);
    const parsed = JSON.parse(saved) as TeacherGradingConfig;
    return {
      ...defaultConfig(profile),
      ...parsed,
      weights: { ...DEFAULT_GRADING_WEIGHTS, ...parsed.weights },
    };
  } catch {
    return defaultConfig(profile);
  }
}

function gradeTone(score: number) {
  if (score >= 90) return "excellent";
  if (score >= 80) return "good";
  if (score >= 70) return "developing";
  return "support";
}

function average(values: number[]) {
  if (!values.length) return 0;
  return Math.round(
    values.reduce((total, value) => total + value, 0) / values.length * 10,
  ) / 10;
}

function formatScore(value: number) {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}

function sortedWeeks(calendar: AcademicCalendar) {
  return [...calendar.weeks].sort((first, second) => (
    first.startDate.localeCompare(second.startDate) || first.order - second.order
  ));
}

function formatWeekRange(week: AcademicWeek) {
  const format = (value: string) => new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
  }).format(new Date(`${value}T12:00:00`));
  return `${format(week.startDate)}–${format(week.endDate)}`;
}

function resolveWeekChoices(
  calendar: AcademicCalendar,
  academicConfig: AcademicConfig,
) {
  const weeks = [...calendar.weeks].sort((first, second) => (
    first.startDate.localeCompare(second.startDate) || first.order - second.order
  ));
  let currentIndex = weeks.findIndex((week) => week.id === academicConfig.weekId);
  if (currentIndex < 0) {
    const now = Date.now();
    currentIndex = weeks.findLastIndex((week) => (
      new Date(week.startAt).getTime() <= now
    ));
  }
  if (currentIndex < 0 && weeks.length > 0) currentIndex = 0;
  return {
    current: currentIndex >= 0 ? weeks[currentIndex] : undefined,
    previous: currentIndex > 0 ? weeks[currentIndex - 1] : undefined,
  };
}

function termForWeek(calendar: AcademicCalendar, weekId: string) {
  return calendar.terms.find((term) => term.weekIds.includes(weekId));
}

function demoRecords(
  profile: UserProfile,
  calendar: AcademicCalendar,
  academicConfig: AcademicConfig,
  accounts: ManagedAccount[],
) {
  try {
    const saved = window.localStorage.getItem(DEMO_GRADES_KEY);
    if (saved) return JSON.parse(saved) as WeeklyGradeRecord[];
  } catch {
    window.localStorage.removeItem(DEMO_GRADES_KEY);
  }
  const choices = resolveWeekChoices(calendar, academicConfig);
  const week = choices.current;
  const term = week ? termForWeek(calendar, week.id) : undefined;
  if (!week || !term) return [];
  const teacher = profile.role === "teacher"
    ? profile
    : {
        uid: "demo-teacher-mariana",
        name: "Mariana López",
        institutionId: profile.institutionId,
        subjects: ["Español", "Ciencias"],
      };
  const students = accounts.filter((account) => (
    account.role === "student" &&
    account.teacherIds.includes(teacher.uid)
  ));
  const seedScores: WeeklyGradeScores[] = [
    { classWork: 94, homework: 90, participation: 96, attendance: 100, exam: 92 },
    { classWork: 82, homework: 88, participation: 85, attendance: 100, exam: 84 },
  ];
  return students.flatMap((student, studentIndex) => (
    (teacher.subjects ?? []).filter((subject) => student.subjects.includes(subject))
      .map((subject, subjectIndex) => {
        const scores = seedScores[(studentIndex + subjectIndex) % seedScores.length];
        return {
          id: `${week.id}-${subject}-${student.uid}`,
          institutionId: profile.institutionId,
          schoolYearId: academicConfig.schoolYearId,
          schoolYearLabel: academicConfig.schoolYearLabel,
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
  ));
}

export function GradingWeightsCard({
  profile,
  firebaseReady,
}: {
  profile: UserProfile;
  firebaseReady: boolean;
}) {
  const [config, setConfig] = useState<TeacherGradingConfig>(() => defaultConfig(profile));
  const [form, setForm] = useState<GradingWeights>({ ...DEFAULT_GRADING_WEIGHTS });
  const [saving, setSaving] = useState(false);
  const total = gradingWeightTotal(form);

  useEffect(() => {
    if (!firebaseReady) {
      const next = readDemoConfig(profile);
      queueMicrotask(() => {
        setConfig(next);
        setForm(next.weights);
      });
      return;
    }
    return watchTeacherGradingConfig(
      profile,
      (next) => {
        setConfig(next);
        setForm(next.weights);
      },
      () => toast.error("No pudimos cargar tu ponderación."),
    );
  }, [firebaseReady, profile]);

  const persist = async (weights: GradingWeights, message: string) => {
    setSaving(true);
    try {
      if (firebaseReady) {
        await saveTeacherGradingConfig(profile, weights);
      } else {
        const next = {
          ...config,
          weights,
          subjects: profile.subjects ?? [],
          updatedAt: new Date().toISOString(),
        };
        window.localStorage.setItem(
          `${DEMO_CONFIG_KEY}-${profile.uid}`,
          JSON.stringify(next),
        );
        setConfig(next);
        setForm(weights);
      }
      toast.success(message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos guardar la ponderación.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="panel grading-config-card">
      <div className="grading-config-heading">
        <span className="grading-heading-icon"><SlidersHorizontal size={21} /></span>
        <div>
          <span className="eyebrow">Evaluación semanal</span>
          <h2>Ponderación de calificaciones</h2>
          <p>
            Esta configuración se aplica a tus {config.subjects.length || ""}{" "}
            {config.subjects.length === 1 ? "materia asignada" : "materias asignadas"}
            {config.subjects.length ? `: ${config.subjects.join(", ")}.` : "."}
          </p>
        </div>
        <motion.span
          animate={{ scale: total === 100 ? [1, 1.06, 1] : 1 }}
          className={`grading-total is-${total === 100 ? "ready" : "pending"}`}
          key={total}
        >
          <strong>{total}%</strong>
          <small>{total === 100 ? "Lista" : "Debe sumar 100"}</small>
        </motion.span>
      </div>

      <div className="grading-weight-grid">
        {GRADING_CRITERIA.map((criterion, index) => (
          <motion.label
            className="grading-weight-field"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.035 }}
            key={criterion.key}
          >
            <span>
              <strong>{criterion.label}</strong>
              <output>{form[criterion.key]}%</output>
            </span>
            <input
              aria-label={`Porcentaje de ${criterion.label}`}
              max="100"
              min="0"
              onChange={(event) => setForm((current) => ({
                ...current,
                [criterion.key]: Number(event.target.value),
              }))}
              step="1"
              type="range"
              value={form[criterion.key]}
            />
            <input
              aria-label={`Valor numérico de ${criterion.label}`}
              className="grading-weight-number"
              max="100"
              min="0"
              onChange={(event) => setForm((current) => ({
                ...current,
                [criterion.key]: Math.min(100, Math.max(0, Number(event.target.value))),
              }))}
              type="number"
              value={form[criterion.key]}
            />
          </motion.label>
        ))}
      </div>

      <div className="grading-config-footer">
        <div className={`grading-sum-message is-${total === 100 ? "ready" : "pending"}`}>
          {total === 100 ? <Check size={17} /> : <BarChart3 size={17} />}
          {total === 100
            ? "La ponderación está equilibrada y lista para usarse."
            : `Ajusta ${Math.abs(100 - total)} puntos para llegar a 100%.`}
        </div>
        <div className="grading-config-actions">
          <button
            className="secondary-button"
            disabled={saving}
            onClick={() => void persist(
              { ...DEFAULT_GRADING_WEIGHTS },
              "Ponderación CEHF restaurada",
            )}
            type="button"
          >
            <RotateCcw size={16} /> Restaurar CEHF
          </button>
          <button
            className="primary-button"
            disabled={saving || total !== 100}
            onClick={() => void persist(form, "Ponderación guardada")}
            type="button"
          >
            <Save size={16} /> {saving ? "Guardando…" : "Guardar ponderación"}
          </button>
        </div>
      </div>
    </section>
  );
}

function WeekSelector({
  current,
  previous,
  selectedId,
  onSelect,
}: {
  current?: AcademicWeek;
  previous?: AcademicWeek;
  selectedId?: string;
  onSelect: (weekId: string) => void;
}) {
  return (
    <div className="grade-week-selector" aria-label="Cambiar semana">
      <button
        className={previous?.id === selectedId ? "active" : ""}
        disabled={!previous}
        onClick={() => previous && onSelect(previous.id)}
        type="button"
      >
        <ChevronLeft size={17} />
        <span><small>Anterior</small><strong>{previous?.label ?? "No disponible"}</strong></span>
      </button>
      <button
        className={current?.id === selectedId ? "active" : ""}
        disabled={!current}
        onClick={() => current && onSelect(current.id)}
        type="button"
      >
        <span><small>Actual</small><strong>{current?.label ?? "Sin semana"}</strong></span>
        <ChevronRight size={17} />
      </button>
    </div>
  );
}

function GradeEditorRow({
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
  const [scores, setScores] = useState<WeeklyGradeScores>(
    record?.scores ?? { ...DEFAULT_WEEKLY_GRADE_SCORES },
  );
  const [saving, setSaving] = useState(false);
  const result = calculateWeightedGrade(scores, weights);

  const persist = async () => {
    setSaving(true);
    try {
      await onSave(student, scores);
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      className="grade-roster-row"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      layout
    >
      <div className="grade-student-cell">
        <span className="grade-student-avatar">{student.initials}</span>
        <span>
          <strong>{student.name}</strong>
          <small>{student.grade} {student.group}</small>
          <em className={record ? "is-saved" : "is-pending"}>
            {record ? "Calificación guardada" : "Pendiente de captura"}
          </em>
        </span>
      </div>
      <div className="grade-score-inputs">
        {GRADING_CRITERIA.map((criterion) => (
          <label key={criterion.key}>
            <span>{criterion.shortLabel}</span>
            <input
              aria-label={`${criterion.label} de ${student.name}`}
              max="100"
              min="0"
              onChange={(event) => setScores((current) => ({
                ...current,
                [criterion.key]: Math.min(100, Math.max(0, Number(event.target.value))),
              }))}
              type="number"
              value={scores[criterion.key]}
            />
            <small>{weights[criterion.key]}%</small>
          </label>
        ))}
      </div>
      <div className="grade-row-result">
        <small>Resultado</small>
        <motion.strong
          className={`grade-badge is-${gradeTone(result)}`}
          key={result}
          initial={{ scale: 0.92 }}
          animate={{ scale: 1 }}
        >
          {result.toFixed(1)}
        </motion.strong>
        <button
          aria-label={`Guardar calificación de ${student.name}`}
          className="grade-save-button"
          disabled={saving}
          onClick={() => void persist()}
          type="button"
        >
          {record && !saving ? <Check size={17} /> : <Save size={17} />}
          {saving ? "Guardando…" : record ? "Actualizar" : "Guardar alumno"}
        </button>
      </div>
    </motion.div>
  );
}

function GradeMetricCard({
  label,
  value,
  detail,
  icon,
  tone,
  delay,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
  tone: string;
  delay: number;
}) {
  return (
    <motion.article
      className={`grade-metric-card is-${tone}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
    >
      <div><span>{icon}</span><small>{label}</small></div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </motion.article>
  );
}

function GradeChartEmpty() {
  return (
    <div className="grade-chart-empty">
      <BarChart3 size={22} />
      <span>Los datos aparecerán al guardar calificaciones.</span>
    </div>
  );
}

function GradeDistributionChart({ records }: { records: WeeklyGradeRecord[] }) {
  const bands = [
    {
      label: "90–100",
      tone: "excellent",
      count: records.filter((record) => record.weightedScore >= 90).length,
    },
    {
      label: "80–89",
      tone: "good",
      count: records.filter((record) => (
        record.weightedScore >= 80 && record.weightedScore < 90
      )).length,
    },
    {
      label: "70–79",
      tone: "developing",
      count: records.filter((record) => (
        record.weightedScore >= 70 && record.weightedScore < 80
      )).length,
    },
    {
      label: "< 70",
      tone: "support",
      count: records.filter((record) => record.weightedScore < 70).length,
    },
  ];
  const maximum = Math.max(1, ...bands.map((band) => band.count));

  return (
    <div
      className="grade-distribution-chart"
      role="img"
      aria-label="Distribución de calificaciones por rango"
    >
      {bands.map((band, index) => (
        <div key={band.tone}>
          <strong>{band.count}</strong>
          <div>
            <motion.i
              className={`is-${band.tone}`}
              initial={{ height: 0 }}
              animate={{ height: `${Math.max(8, band.count / maximum * 100)}%` }}
              transition={{ delay: index * 0.06, duration: 0.45 }}
            />
          </div>
          <span>{band.label}</span>
        </div>
      ))}
    </div>
  );
}

function GradeSubjectAverages({ records }: { records: WeeklyGradeRecord[] }) {
  const subjects = Array.from(new Set(records.map((record) => record.subject)))
    .map((subject) => ({
      subject,
      value: average(
        records
          .filter((record) => record.subject === subject)
          .map((record) => record.weightedScore),
      ),
    }))
    .sort((first, second) => second.value - first.value);

  if (!subjects.length) return <GradeChartEmpty />;

  return (
    <div className="grade-subject-chart">
      {subjects.map((item, index) => (
        <div key={item.subject}>
          <span>{item.subject}</span>
          <div>
            <motion.i
              initial={{ width: 0 }}
              animate={{ width: `${item.value}%` }}
              transition={{ duration: 0.5, delay: index * 0.05 }}
            />
          </div>
          <strong>{formatScore(item.value)}</strong>
        </div>
      ))}
    </div>
  );
}

function GradeRubricAverages({ records }: { records: WeeklyGradeRecord[] }) {
  if (!records.length) return <GradeChartEmpty />;

  return (
    <div className="grade-rubric-chart">
      {GRADING_CRITERIA.map((criterion, index) => {
        const value = average(records.map((record) => record.scores[criterion.key]));
        return (
          <div data-criterion={criterion.key} key={criterion.key}>
            <span>{criterion.shortLabel}</span>
            <div>
              <motion.i
                initial={{ width: 0 }}
                animate={{ width: `${value}%` }}
                transition={{ duration: 0.5, delay: index * 0.04 }}
              />
            </div>
            <strong>{formatScore(value)}</strong>
          </div>
        );
      })}
    </div>
  );
}

function GradeTrendChart({
  records,
  calendar,
}: {
  records: WeeklyGradeRecord[];
  calendar: AcademicCalendar;
}) {
  const entries = sortedWeeks(calendar)
    .map((week) => {
      const weekRecords = records.filter((record) => record.weekId === week.id);
      return {
        week,
        value: average(weekRecords.map((record) => record.weightedScore)),
        count: weekRecords.length,
      };
    })
    .filter((entry) => entry.count > 0)
    .slice(-6);

  if (!entries.length) return <GradeChartEmpty />;

  return (
    <div
      className="grade-trend-chart"
      role="img"
      aria-label="Evolución del promedio por semana"
    >
      {entries.map((entry, index) => (
        <div key={entry.week.id}>
          <strong>{formatScore(entry.value)}</strong>
          <div>
            <motion.i
              initial={{ height: 0 }}
              animate={{
                height: `${Math.max(10, Math.min(100, (entry.value - 60) * 2.5))}%`,
              }}
              transition={{ duration: 0.48, delay: index * 0.05 }}
            />
          </div>
          <span>{entry.week.label.replace("Semana ", "S")}</span>
        </div>
      ))}
    </div>
  );
}

function GradeRecentRecords({ records }: { records: WeeklyGradeRecord[] }) {
  const recent = [...records]
    .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))
    .slice(0, 7);

  if (!recent.length) return <GradeChartEmpty />;

  return (
    <div className="grade-recent-table">
      <div className="grade-recent-head">
        <span>Alumno</span><span>Materia</span><span>Docente</span><span>Resultado</span>
      </div>
      {recent.map((record) => (
        <div key={record.id}>
          <span>
            <i>
              {record.studentName
                .split(/\s+/)
                .map((part) => part[0])
                .join("")
                .slice(0, 2)}
            </i>
            <b>{record.studentName}</b>
          </span>
          <span>{record.subject}</span>
          <span>{record.teacherName}</span>
          <strong className={`grade-score-pill is-${gradeTone(record.weightedScore)}`}>
            {formatScore(record.weightedScore)}
          </strong>
        </div>
      ))}
    </div>
  );
}

function GradeSummaryDashboard({
  profile,
  records,
  allRecords,
  calendar,
  accounts,
  selectedWeekId,
}: {
  profile: UserProfile;
  records: WeeklyGradeRecord[];
  allRecords: WeeklyGradeRecord[];
  calendar: AcademicCalendar;
  accounts: ManagedAccount[];
  selectedWeekId?: string;
}) {
  const overall = average(records.map((record) => record.weightedScore));
  const students = new Set(records.map((record) => record.studentId)).size;
  const teachers = new Set(records.map((record) => record.teacherId)).size;
  const attention = records.filter((record) => record.weightedScore < 70).length;
  const assignedExpected = profile.role === "teacher"
    ? (profile.subjects ?? []).reduce((total, subject) => total + accounts.filter((account) => (
        account.role === "student" &&
        account.active &&
        account.teacherIds.includes(profile.uid) &&
        account.subjects.includes(subject)
      )).length, 0)
    : records.length;
  const completion = assignedExpected
    ? Math.min(100, Math.round(records.length / assignedExpected * 100))
    : 0;
  const weeks = sortedWeeks(calendar);
  const currentIndex = weeks.findIndex((week) => week.id === selectedWeekId);
  const previousWeek = currentIndex > 0 ? weeks[currentIndex - 1] : undefined;
  const previousRecords = previousWeek
    ? allRecords.filter((record) => record.weekId === previousWeek.id)
    : [];
  const previousAverage = average(previousRecords.map((record) => record.weightedScore));
  const delta = previousRecords.length
    ? Math.round((overall - previousAverage) * 10) / 10
    : 0;

  const metrics = profile.role === "student"
    ? [
        {
          label: "Promedio semanal",
          value: records.length ? formatScore(overall) : "—",
          detail: previousRecords.length
            ? `${delta > 0 ? "+" : ""}${formatScore(delta)} vs. semana anterior`
            : "Sin comparación disponible",
          icon: <TrendingUp size={19} />,
          tone: records.length ? gradeTone(overall) : "violet",
        },
        {
          label: "Materias calificadas",
          value: String(records.length),
          detail: "Resultados publicados esta semana",
          icon: <GraduationCap size={19} />,
          tone: "violet",
        },
        {
          label: "Mejor resultado",
          value: records.length
            ? formatScore(Math.max(...records.map((record) => record.weightedScore)))
            : "—",
          detail: [...records].sort((first, second) => (
            second.weightedScore - first.weightedScore
          ))[0]?.subject ?? "Aún sin datos",
          icon: <Sparkles size={19} />,
          tone: "lime",
        },
        {
          label: "Rubros destacados",
          value: String(GRADING_CRITERIA.filter((criterion) => (
            records.length &&
            average(records.map((record) => record.scores[criterion.key])) >= 90
          )).length),
          detail: "Con promedio igual o mayor a 90",
          icon: <Target size={19} />,
          tone: "coral",
        },
      ]
    : [
        {
          label: "Promedio general",
          value: records.length ? formatScore(overall) : "—",
          detail: `${records.length} calificaciones en la semana`,
          icon: <TrendingUp size={19} />,
          tone: records.length ? gradeTone(overall) : "violet",
        },
        {
          label: profile.role === "director" ? "Alumnos evaluados" : "Captura completada",
          value: profile.role === "director" ? String(students) : `${completion}%`,
          detail: profile.role === "director"
            ? `${teachers} docentes con actividad`
            : `${records.length} de ${assignedExpected} registros`,
          icon: <UsersRound size={19} />,
          tone: "violet",
        },
        {
          label: "Resultados destacados",
          value: String(records.filter((record) => record.weightedScore >= 90).length),
          detail: "Calificaciones de 90 o más",
          icon: <Sparkles size={19} />,
          tone: "lime",
        },
        {
          label: "Requieren atención",
          value: String(attention),
          detail: "Calificaciones menores a 70",
          icon: <Target size={19} />,
          tone: "coral",
        },
      ];

  return (
    <div className="grade-summary-stack">
      <section className="grade-metrics-grid" aria-label="Resumen de calificaciones">
        {metrics.map((metric, index) => (
          <GradeMetricCard
            {...metric}
            delay={index * 0.045}
            key={metric.label}
          />
        ))}
      </section>
      <section className="grade-analytics-grid">
        <article className="grade-chart-card is-wide">
          <header>
            <div><span className="grade-chart-kicker">Rendimiento</span><h2>Promedio por materia</h2></div>
            <Activity size={20} />
          </header>
          <GradeSubjectAverages records={records} />
        </article>
        <article className="grade-chart-card">
          <header>
            <div><span className="grade-chart-kicker">Distribución</span><h2>Rangos de resultado</h2></div>
            <BarChart3 size={20} />
          </header>
          <GradeDistributionChart records={records} />
        </article>
        <article className="grade-chart-card">
          <header>
            <div><span className="grade-chart-kicker">Composición</span><h2>Promedio por rubro</h2></div>
            <Target size={20} />
          </header>
          <GradeRubricAverages records={records} />
        </article>
        <article className="grade-chart-card is-wide">
          <header>
            <div><span className="grade-chart-kicker">Evolución</span><h2>Tendencia semanal</h2></div>
            <TrendingUp size={20} />
          </header>
          <GradeTrendChart records={allRecords} calendar={calendar} />
        </article>
      </section>
      {profile.role !== "student" && (
        <section className="grade-chart-card grade-recent-card">
          <header>
            <div><span className="grade-chart-kicker">Actividad reciente</span><h2>Últimas calificaciones guardadas</h2></div>
            <ClipboardPenLine size={20} />
          </header>
          <GradeRecentRecords records={records} />
        </section>
      )}
    </div>
  );
}

function StudentGrades({
  records,
  selectedWeek,
}: {
  records: WeeklyGradeRecord[];
  selectedWeek?: AcademicWeek;
}) {
  const average = records.length
    ? Math.round(
        records.reduce((total, record) => total + record.weightedScore, 0) /
        records.length * 10,
      ) / 10
    : null;

  if (!selectedWeek) {
    return <div className="grade-empty-state">El calendario académico aún no tiene una semana disponible.</div>;
  }

  if (!records.length) {
    return (
      <motion.div className="grade-empty-state" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <span><ClipboardPenLine size={24} /></span>
        <h3>Aún no hay calificaciones</h3>
        <p>Cuando tus profesores terminen de calificar {selectedWeek.label.toLowerCase()}, aparecerán aquí.</p>
      </motion.div>
    );
  }

  return (
    <div className="student-grades-layout">
      <motion.article
        className={`student-grade-summary is-${gradeTone(average ?? 0)}`}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <span className="eyebrow">Promedio de la semana</span>
        <strong>{average?.toFixed(1)}</strong>
        <p>{records.length} {records.length === 1 ? "materia calificada" : "materias calificadas"}</p>
        <div className="student-grade-summary-bar"><span style={{ width: `${average}%` }} /></div>
      </motion.article>
      <div className="student-subject-grades">
        {records.map((record, index) => (
          <motion.article
            className="student-subject-grade-card"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.045 }}
            key={record.id}
          >
            <header>
              <div><span className="eyebrow">{record.teacherName}</span><h3>{record.subject}</h3></div>
              <strong className={`grade-badge is-${gradeTone(record.weightedScore)}`}>
                {record.weightedScore.toFixed(1)}
              </strong>
            </header>
            <div className="student-grade-breakdown">
              {GRADING_CRITERIA.map((criterion) => (
                <div key={criterion.key}>
                  <span><strong>{criterion.shortLabel}</strong><small>{record.weights[criterion.key]}%</small></span>
                  <div><i style={{ width: `${record.scores[criterion.key]}%` }} /></div>
                  <b>{record.scores[criterion.key]}</b>
                </div>
              ))}
            </div>
          </motion.article>
        ))}
      </div>
    </div>
  );
}

export function WeeklyGradesPanel({
  profile,
  academicConfig,
  calendar,
  accounts,
  firebaseReady,
}: {
  profile: UserProfile;
  academicConfig: AcademicConfig;
  calendar: AcademicCalendar;
  accounts: ManagedAccount[];
  firebaseReady: boolean;
}) {
  const choices = useMemo(
    () => resolveWeekChoices(calendar, academicConfig),
    [academicConfig, calendar],
  );
  const [selectedWeekId, setSelectedWeekId] = useState<string | undefined>(
    choices.current?.id,
  );
  const [config, setConfig] = useState<TeacherGradingConfig>(() => defaultConfig(profile));
  const [records, setRecords] = useState<WeeklyGradeRecord[]>([]);
  const [loading, setLoading] = useState(firebaseReady);
  const [activeView, setActiveView] = useState<"summary" | "capture">(
    profile.role === "teacher" ? "capture" : "summary",
  );
  const [studentSearch, setStudentSearch] = useState("");
  const subjects = useMemo(() => profile.subjects ?? [], [profile.subjects]);
  const [selectedSubject, setSelectedSubject] = useState(subjects[0] ?? "");
  const activeWeekId = calendar.weeks.some((week) => week.id === selectedWeekId)
    ? selectedWeekId
    : choices.current?.id;
  const activeSubject = subjects.includes(selectedSubject)
    ? selectedSubject
    : subjects[0] ?? "";

  useEffect(() => {
    if (!firebaseReady) {
      queueMicrotask(() => {
        setConfig(readDemoConfig(profile));
        setRecords(demoRecords(profile, calendar, academicConfig, accounts));
        setLoading(false);
      });
      return;
    }
    queueMicrotask(() => setLoading(true));
    const stopGrades = watchWeeklyGrades(
      profile,
      (next) => {
        setRecords(next);
        setLoading(false);
      },
      () => {
        setLoading(false);
        toast.error("No pudimos cargar las calificaciones semanales.");
      },
    );
    const stopConfig = profile.role === "teacher"
      ? watchTeacherGradingConfig(
          profile,
          setConfig,
          () => toast.error("No pudimos cargar tu ponderación."),
        )
      : () => undefined;
    return () => {
      stopGrades();
      stopConfig();
    };
  }, [accounts, academicConfig, calendar, firebaseReady, profile]);

  const selectedWeek = calendar.weeks.find((week) => week.id === activeWeekId);
  const selectedTerm = selectedWeek
    ? termForWeek(calendar, selectedWeek.id)
    : undefined;
  const cycleRecords = records.filter((record) => (
    record.schoolYearId === academicConfig.schoolYearId &&
    (profile.role !== "student" || record.studentId === profile.uid)
  ));
  const visibleRecords = cycleRecords.filter((record) => record.weekId === activeWeekId);
  const eligibleStudents = accounts.filter((account) => (
    account.role === "student" &&
    account.active &&
    account.teacherIds.includes(profile.uid) &&
    account.subjects.includes(activeSubject)
  ));
  const normalizedStudentSearch = studentSearch.trim().toLocaleLowerCase("es");
  const filteredStudents = eligibleStudents.filter((student) => (
    !normalizedStudentSearch ||
    `${student.name} ${student.grade ?? ""} ${student.group ?? ""}`
      .toLocaleLowerCase("es")
      .includes(normalizedStudentSearch)
  ));
  const subjectRecords = visibleRecords.filter((record) => (
    record.subject === activeSubject && record.teacherId === profile.uid
  ));
  const gradedStudentIds = new Set(subjectRecords.map((record) => record.studentId));
  const gradedStudents = eligibleStudents.filter((student) => (
    gradedStudentIds.has(student.uid)
  )).length;
  const captureProgress = eligibleStudents.length
    ? Math.round(gradedStudents / eligibleStudents.length * 100)
    : 0;

  const persistGrade = async (student: ManagedAccount, scores: WeeklyGradeScores) => {
    if (!selectedWeek || !selectedTerm) {
      toast.error("Selecciona una semana configurada dentro de un trimestre.");
      return;
    }
    try {
      if (firebaseReady) {
        await saveWeeklyGrade(
          profile,
          config,
          academicConfig,
          selectedWeek,
          selectedTerm,
          student,
          activeSubject,
          scores,
        );
      } else {
        const existing = records.find((record) => (
          record.weekId === selectedWeek.id &&
          record.subject === activeSubject &&
          record.studentId === student.uid &&
          record.teacherId === profile.uid
        ));
        const nextRecord: WeeklyGradeRecord = {
          id: existing?.id ?? `${selectedWeek.id}-${activeSubject}-${student.uid}`,
          institutionId: profile.institutionId,
          schoolYearId: academicConfig.schoolYearId,
          schoolYearLabel: academicConfig.schoolYearLabel,
          termId: selectedTerm.id,
          termLabel: selectedTerm.label,
          weekId: selectedWeek.id,
          weekLabel: selectedWeek.label,
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
        const next = existing
          ? records.map((record) => record.id === existing.id ? nextRecord : record)
          : [nextRecord, ...records];
        setRecords(next);
        window.localStorage.setItem(DEMO_GRADES_KEY, JSON.stringify(next));
      }
      toast.success(`Calificación de ${student.name} guardada`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos guardar la calificación.");
    }
  };

  return (
    <section className="panel weekly-grades-panel">
      <div className="weekly-grades-heading">
        <div>
          <span className="eyebrow">Centro de resultados</span>
          <h2>
            {profile.role === "director"
              ? "Panorama académico"
              : profile.role === "teacher"
                ? "Calificaciones semanales"
                : "Tus calificaciones de la semana"}
          </h2>
          <p>
            {selectedWeek
              ? `${selectedWeek.label} · ${formatWeekRange(selectedWeek)}${selectedTerm ? ` · ${selectedTerm.label}` : ""}`
              : "Elige una semana del calendario académico."}
          </p>
        </div>
        <WeekSelector
          current={choices.current}
          previous={choices.previous}
          selectedId={activeWeekId}
          onSelect={setSelectedWeekId}
        />
      </div>

      {profile.role === "teacher" && (
        <nav className="grade-view-tabs" aria-label="Vista de calificaciones">
          <button
            className={activeView === "capture" ? "active" : ""}
            onClick={() => setActiveView("capture")}
            type="button"
          >
            <ClipboardPenLine size={17} /> Calificar alumnos
          </button>
          <button
            className={activeView === "summary" ? "active" : ""}
            onClick={() => setActiveView("summary")}
            type="button"
          >
            <BarChart3 size={17} /> Resumen y estadísticas
          </button>
        </nav>
      )}

      {loading ? (
        <div className="grade-loading"><span /><span /><span /></div>
      ) : profile.role !== "teacher" || activeView === "summary" ? (
        <AnimatePresence mode="wait">
          <motion.div
            className="grade-summary-content"
            key={`summary-${activeWeekId}`}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
          >
            {profile.role === "student" && (
              <section className="student-primary-results">
                <header>
                  <div>
                    <span className="eyebrow">Resultados publicados</span>
                    <h3>Tus calificaciones por materia</h3>
                    <p>Primero encontrarás tu promedio y el detalle de cada rubro evaluado.</p>
                  </div>
                  <span className="student-results-count">
                    <strong>{visibleRecords.length}</strong>
                    <small>{visibleRecords.length === 1 ? "materia" : "materias"}</small>
                  </span>
                </header>
                <StudentGrades records={visibleRecords} selectedWeek={selectedWeek} />
              </section>
            )}
            {profile.role === "student" && (
              <div className="student-analysis-heading">
                <span className="eyebrow">Tu avance en contexto</span>
                <h3>Resumen y estadísticas</h3>
                <p>Consulta tendencias, promedios y cómo se compone tu resultado semanal.</p>
              </div>
            )}
            <GradeSummaryDashboard
              profile={profile}
              records={visibleRecords}
              allRecords={cycleRecords}
              calendar={calendar}
              accounts={accounts}
              selectedWeekId={activeWeekId}
            />
          </motion.div>
        </AnimatePresence>
      ) : (
        <div className="teacher-grades-workspace">
          <header className="teacher-capture-heading">
            <span className="teacher-capture-icon"><BookOpenCheck size={23} /></span>
            <div>
              <span className="eyebrow">Captura semanal</span>
              <h3>Califica a tus alumnos</h3>
              <p>
                Registra cada rubro de 0 a 100. El resultado semanal se calcula
                automáticamente con tu ponderación configurada.
              </p>
            </div>
            <div className="teacher-capture-progress">
              <span>
                <small>Avance de captura</small>
                <strong>{gradedStudents} de {eligibleStudents.length}</strong>
              </span>
              <div aria-label={`${captureProgress}% de captura completada`}>
                <i style={{ width: `${captureProgress}%` }} />
              </div>
            </div>
          </header>

          {!subjects.length ? (
            <div className="grade-empty-state"><h3>No tienes materias asignadas</h3><p>Dirección debe actualizar tu perfil antes de capturar calificaciones.</p></div>
          ) : (
            <>
              <section className="teacher-capture-setup">
                <div className="teacher-capture-step">
                  <span className="teacher-step-number">1</span>
                  <div>
                    <span className="teacher-step-label">Elige la materia</span>
                    <div className="teacher-subject-selector">
                      {subjects.map((subject) => (
                        <button
                          className={activeSubject === subject ? "active" : ""}
                          key={subject}
                          onClick={() => {
                            setSelectedSubject(subject);
                            setStudentSearch("");
                          }}
                          type="button"
                        >
                          {subject}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="teacher-capture-context">
                  <span><CalendarRange size={17} /></span>
                  <div>
                    <small>Periodo seleccionado</small>
                    <strong>{selectedTerm?.label ?? "Sin trimestre"} · {selectedWeek?.label ?? "Sin semana"}</strong>
                  </div>
                </div>
              </section>

              <section className="teacher-capture-roster-section">
                <div className="teacher-roster-heading">
                  <div>
                    <span className="teacher-step-number">2</span>
                    <div>
                      <span className="teacher-step-label">Califica alumnos</span>
                      <p>{activeSubject} · {eligibleStudents.length} alumnos asignados</p>
                    </div>
                  </div>
                  <label className="teacher-student-search">
                    <Search size={16} />
                    <input
                      aria-label="Buscar alumno para calificar"
                      onChange={(event) => setStudentSearch(event.target.value)}
                      placeholder="Buscar alumno…"
                      type="search"
                      value={studentSearch}
                    />
                  </label>
                </div>

                <div className="teacher-weight-preview">
                  <Sparkles size={17} />
                  <span>
                    <b>Ponderación activa</b>
                    {GRADING_CRITERIA.map((criterion) => (
                      <small key={criterion.key}>
                        {criterion.shortLabel} {config.weights[criterion.key]}%
                      </small>
                    ))}
                  </span>
                </div>

                {!eligibleStudents.length ? (
                  <div className="grade-empty-state">
                    <h3>No hay alumnos asignados</h3>
                    <p>Revisa en Comunidad que los alumnos tengan esta materia y tu asignación docente.</p>
                  </div>
                ) : !filteredStudents.length ? (
                  <div className="grade-empty-state">
                    <h3>No encontramos alumnos</h3>
                    <p>Prueba con otro nombre, grado o grupo.</p>
                  </div>
                ) : (
                  <div className="grade-roster">
                    <div className="grade-roster-header">
                      <span>Alumno</span>
                      <div className="grade-roster-criteria">
                        {GRADING_CRITERIA.map((criterion) => (
                          <span key={criterion.key}>
                            <strong>{criterion.shortLabel}</strong>
                            <small>{config.weights[criterion.key]}%</small>
                          </span>
                        ))}
                      </div>
                      <span>Resultado semanal</span>
                    </div>
                    {filteredStudents.map((student) => (
                      <GradeEditorRow
                        key={`${activeWeekId}-${activeSubject}-${student.uid}-${subjectRecords.find((record) => record.studentId === student.uid)?.updatedAt ?? "new"}`}
                        student={student}
                        weights={config.weights}
                        record={subjectRecords.find((record) => record.studentId === student.uid)}
                        onSave={persistGrade}
                      />
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      )}
    </section>
  );
}
