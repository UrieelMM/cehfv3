"use client";

import {
  BarChart3,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardPenLine,
  FileDown,
  GraduationCap,
  Layers3,
  Save,
  Search,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  aggregateDailyGradesByWeek,
  buildGradePeriodSummaries,
  calculateWeightedGrade,
  DEFAULT_GRADING_WEIGHTS,
  DEFAULT_WEEKLY_GRADE_SCORES,
  gradeSubjectId,
  GRADING_CRITERIA,
  saveDailyGrade,
  watchDailyGrades,
  watchTeacherGradingConfig,
  workingDatesForWeek,
} from "@/lib/grades-firebase";
import type {
  AcademicCalendar,
  AcademicConfig,
  AcademicWeek,
  DailyGradeRecord,
  GradePeriodLevel,
  GradePeriodSummary,
  ManagedAccount,
  TeacherGradingConfig,
  UserProfile,
  WeeklyGradeScores,
} from "@/lib/types";

const PAGE_SIZE = 10;
export const DEMO_DAILY_GRADES_KEY = "cehf-demo-daily-grades-v2";

function score(value: number) {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}

function groupLabel(record: { studentGrade?: string; studentGroup?: string }) {
  return [record.studentGrade, record.studentGroup].filter(Boolean).join(" ") || "Sin grupo";
}

function dateLabel(value: string, long = false) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-MX", long
    ? { weekday: "long", day: "numeric", month: "long", year: "numeric" }
    : { weekday: "short", day: "numeric", month: "short" })
    .format(new Date(`${value}T12:00:00`));
}

function formatWeekRange(week: AcademicWeek) {
  const format = (value: string) => new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
  }).format(new Date(`${value}T12:00:00`));
  return `${format(week.startDate)}–${format(week.endDate)}`;
}

function termForWeek(calendar: AcademicCalendar, weekId?: string) {
  return calendar.terms.find((term) => weekId && term.weekIds.includes(weekId));
}

function currentWeek(calendar: AcademicCalendar, config: AcademicConfig) {
  return calendar.weeks.find((week) => week.id === config.weekId)
    ?? calendar.weeks.find((week) => week.startDate <= new Date().toISOString().slice(0, 10) && week.endDate >= new Date().toISOString().slice(0, 10))
    ?? calendar.weeks[0];
}

function dateWithinWeek(calendar: AcademicCalendar, week: AcademicWeek | undefined, timezone: string) {
  if (!week) return "";
  const workingDates = workingDatesForWeek(calendar, week);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: timezone });
  return workingDates.includes(today) ? today : workingDates[0] ?? "";
}

function defaultConfig(profile: UserProfile): TeacherGradingConfig {
  return {
    teacherId: profile.uid,
    teacherName: profile.name,
    institutionId: profile.institutionId,
    weights: { ...DEFAULT_GRADING_WEIGHTS },
    subjects: profile.subjects ?? [],
  };
}

export function demoDailyGrades(
  profile: UserProfile,
  calendar: AcademicCalendar,
  academicConfig: AcademicConfig,
  accounts: ManagedAccount[],
) {
  try {
    const saved = window.localStorage.getItem(DEMO_DAILY_GRADES_KEY);
    if (saved) return JSON.parse(saved) as DailyGradeRecord[];
  } catch {
    window.localStorage.removeItem(DEMO_DAILY_GRADES_KEY);
  }
  const teachers = accounts.filter((account) => account.role === "teacher");
  const students = accounts.filter((account) => account.role === "student" && account.active);
  const records: DailyGradeRecord[] = [];
  calendar.weeks.forEach((week, weekIndex) => {
    const term = termForWeek(calendar, week.id);
    if (!term) return;
    const days = workingDatesForWeek(calendar, week);
    students.forEach((student, studentIndex) => {
      student.teacherIds.forEach((teacherId) => {
        const account = teachers.find((candidate) => candidate.uid === teacherId);
        const teacher = account ?? (teacherId === profile.uid && profile.role === "teacher"
          ? { uid: profile.uid, name: profile.name, subjects: profile.subjects ?? [] }
          : undefined);
        if (!teacher) return;
        teacher.subjects.filter((subject) => student.subjects.includes(subject)).forEach((subject, subjectIndex) => {
          days.forEach((gradeDate, dayIndex) => {
            const base = 76 + ((studentIndex * 7 + subjectIndex * 5 + weekIndex * 3 + dayIndex * 4) % 21);
            const scores: WeeklyGradeScores = {
              classWork: Math.min(100, base + 3),
              homework: Math.min(100, base + 1),
              participation: Math.min(100, base + 5),
              attendance: dayIndex === 2 && studentIndex % 2 ? 85 : 100,
              exam: Math.min(100, base - 1),
            };
            records.push({
              id: [academicConfig.schoolYearId, week.id, gradeDate, gradeSubjectId(subject), teacher.uid, student.uid].join("__"),
              institutionId: profile.institutionId,
              schoolYearId: academicConfig.schoolYearId,
              schoolYearLabel: academicConfig.schoolYearLabel,
              termId: term.id,
              termLabel: term.label,
              weekId: week.id,
              weekLabel: week.label,
              gradeDate,
              subjectId: gradeSubjectId(subject),
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
              createdAt: `${gradeDate}T18:00:00.000Z`,
              updatedAt: `${gradeDate}T18:00:00.000Z`,
            });
          });
        });
      });
    });
  });
  return records;
}

function Pagination({ page, total, onChange }: { page: number; total: number; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (total <= PAGE_SIZE) return null;
  return (
    <nav className="academic-pagination" aria-label="Paginación de calificaciones">
      <span>Mostrando <strong>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)}</strong> de {total}</span>
      <div>
        <button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Página anterior"><ChevronLeft size={16} /></button>
        <span>Página <strong>{page}</strong> de {pages}</span>
        <button type="button" onClick={() => onChange(page + 1)} disabled={page >= pages} aria-label="Página siguiente"><ChevronRight size={16} /></button>
      </div>
    </nav>
  );
}

function CaptureRow({
  student,
  record,
  weights,
  onSave,
}: {
  student: ManagedAccount;
  record?: DailyGradeRecord;
  weights: TeacherGradingConfig["weights"];
  onSave: (student: ManagedAccount, scores: WeeklyGradeScores) => Promise<void>;
}) {
  const [scores, setScores] = useState<WeeklyGradeScores>(record?.scores ?? { ...DEFAULT_WEEKLY_GRADE_SCORES });
  const [saving, setSaving] = useState(false);
  const result = calculateWeightedGrade(scores, weights);
  return (
    <div className="academic-capture-row">
      <div className="academic-student-cell">
        <span>{student.initials}</span>
        <div><strong>{student.name}</strong><small>{student.grade} {student.group}</small></div>
      </div>
      <div className="academic-score-inputs">
        {GRADING_CRITERIA.map((criterion) => (
          <label key={criterion.key}>
            <span>{criterion.shortLabel}</span>
            <input
              aria-label={`${criterion.label} de ${student.name}`}
              type="number"
              min="0"
              max="100"
              value={scores[criterion.key]}
              onChange={(event) => setScores((current) => ({
                ...current,
                [criterion.key]: Math.min(100, Math.max(0, Number(event.target.value))),
              }))}
            />
          </label>
        ))}
      </div>
      <div className="academic-capture-result">
        <span className={`academic-score-badge is-${result >= 90 ? "high" : result >= 70 ? "mid" : "low"}`}>{score(result)}</span>
        <button
          type="button"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try { await onSave(student, scores); } finally { setSaving(false); }
          }}
        >
          {saving ? <span className="academic-button-loader" /> : record ? <Check size={16} /> : <Save size={16} />}
          {saving ? "Guardando" : record ? "Actualizar" : "Guardar"}
        </button>
      </div>
    </div>
  );
}

function SummaryTable({ records, level }: { records: GradePeriodSummary[]; level: GradePeriodLevel }) {
  if (!records.length) {
    return <div className="academic-empty"><BarChart3 size={28} /><h3>Sin calificaciones para este periodo</h3><p>Los resultados aparecerán cuando exista al menos una captura diaria.</p></div>;
  }
  return (
    <div className="academic-table-wrap">
      <table className="academic-results-table">
        <thead><tr>
          <th>Alumno</th><th>Periodo</th><th>Materia</th>
          {GRADING_CRITERIA.map((criterion) => <th key={criterion.key}>{criterion.shortLabel}</th>)}
          <th>Promedio</th><th>Evidencias</th>
        </tr></thead>
        <tbody>{records.map((record) => (
          <tr key={record.id}>
            <td><strong>{record.studentName}</strong><small>{groupLabel(record)}</small></td>
            <td><strong>{record.periodLabel}</strong><small>{level === "weekly" ? record.termLabel : record.schoolYearLabel}</small></td>
            <td>{record.subject}<small>{record.teacherName}</small></td>
            {GRADING_CRITERIA.map((criterion) => <td key={criterion.key}>{score(record.scores[criterion.key])}</td>)}
            <td><span className={`academic-score-badge is-${record.weightedScore >= 90 ? "high" : record.weightedScore >= 70 ? "mid" : "low"}`}>{score(record.weightedScore)}</span></td>
            <td>{level === "weekly"
              ? `${record.evidenceCount} de ${record.expectedEvidenceCount ?? record.evidenceCount} días hábiles`
              : `${record.evidenceCount} ${level === "bimonthly" ? (record.evidenceCount === 1 ? "semana" : "semanas") : (record.evidenceCount === 1 ? "bimestre" : "bimestres")}`}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function DailyTable({ records }: { records: DailyGradeRecord[] }) {
  if (!records.length) {
    return <div className="academic-empty"><CalendarDays size={28} /><h3>Sin capturas para este día</h3><p>Selecciona otra fecha o espera a que el maestro registre la evaluación diaria.</p></div>;
  }
  return (
    <div className="academic-table-wrap">
      <table className="academic-results-table">
        <thead><tr><th>Alumno</th><th>Fecha</th><th>Materia</th>{GRADING_CRITERIA.map((criterion) => <th key={criterion.key}>{criterion.shortLabel}</th>)}<th>Resultado</th></tr></thead>
        <tbody>{records.map((record) => <tr key={record.id}>
          <td><strong>{record.studentName}</strong><small>{groupLabel(record)}</small></td>
          <td><strong>{dateLabel(record.gradeDate)}</strong><small>{record.weekLabel} · {record.termLabel}</small></td>
          <td>{record.subject}<small>{record.teacherName}</small></td>
          {GRADING_CRITERIA.map((criterion) => <td key={criterion.key}>{score(record.scores[criterion.key])}</td>)}
          <td><span className={`academic-score-badge is-${record.weightedScore >= 90 ? "high" : record.weightedScore >= 70 ? "mid" : "low"}`}>{score(record.weightedScore)}</span></td>
        </tr>)}</tbody>
      </table>
    </div>
  );
}

export function AcademicGradesPanel({
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
  const initialWeek = currentWeek(calendar, academicConfig);
  const [selectedWeekId, setSelectedWeekId] = useState(initialWeek?.id ?? "");
  const selectedWeek = calendar.weeks.find((week) => week.id === selectedWeekId) ?? initialWeek;
  const selectedTerm = termForWeek(calendar, selectedWeek?.id);
  const workingDates = selectedWeek ? workingDatesForWeek(calendar, selectedWeek) : [];
  const [selectedDate, setSelectedDate] = useState(() => dateWithinWeek(calendar, initialWeek, academicConfig.timezone));
  const activeDate = workingDates.includes(selectedDate)
    ? selectedDate
    : dateWithinWeek(calendar, selectedWeek, academicConfig.timezone);
  const [level, setLevel] = useState<GradePeriodLevel>(profile.role === "teacher" ? "daily" : "weekly");
  const [records, setRecords] = useState<DailyGradeRecord[]>([]);
  const [config, setConfig] = useState<TeacherGradingConfig>(() => defaultConfig(profile));
  const [loading, setLoading] = useState(firebaseReady);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const teacherSubjects = useMemo(() => profile.subjects ?? [], [profile.subjects]);
  const availableSubjects = useMemo(() => [...new Set([
    ...teacherSubjects,
    ...records.map((record) => record.subject),
  ])].sort((a, b) => a.localeCompare(b, "es")), [records, teacherSubjects]);
  const [subject, setSubject] = useState(profile.role === "teacher" ? teacherSubjects[0] ?? "" : "all");
  const activeSubject = profile.role === "teacher" ? (teacherSubjects.includes(subject) ? subject : teacherSubjects[0] ?? "") : subject;

  useEffect(() => {
    if (!firebaseReady) {
      queueMicrotask(() => {
        setRecords(demoDailyGrades(profile, calendar, academicConfig, accounts));
        setLoading(false);
      });
      return;
    }
    const stopGrades = watchDailyGrades(profile, (next) => {
      setRecords(next);
      setLoading(false);
    }, () => {
      setLoading(false);
      toast.error("No pudimos cargar las calificaciones diarias.");
    });
    const stopConfig = profile.role === "teacher"
      ? watchTeacherGradingConfig(profile, setConfig, () => toast.error("No pudimos cargar la ponderación."))
      : () => undefined;
    return () => { stopGrades(); stopConfig(); };
  }, [accounts, academicConfig, calendar, firebaseReady, profile]);

  const cycleRecords = records.filter((record) => record.schoolYearId === academicConfig.schoolYearId);
  const summaries = buildGradePeriodSummaries(cycleRecords, calendar);
  const normalizedSearch = search.trim().toLocaleLowerCase("es");
  const matches = (record: { studentName: string; studentGrade?: string; studentGroup?: string; subject: string; teacherName: string }) => (
    (activeSubject === "all" || !activeSubject || record.subject === activeSubject) &&
    (!normalizedSearch || `${record.studentName} ${record.studentGrade ?? ""} ${record.studentGroup ?? ""} ${record.subject} ${record.teacherName}`.toLocaleLowerCase("es").includes(normalizedSearch))
  );
  const dailyVisible = cycleRecords.filter((record) => (
    record.weekId === selectedWeek?.id &&
    record.gradeDate === activeDate &&
    matches(record)
  ));
  const summaryVisible = (level === "weekly" ? summaries.weekly
    : level === "bimonthly" ? summaries.bimonthly
      : summaries.cycle).filter((record) => (
        (level !== "weekly" || record.periodId === selectedWeek?.id) &&
        (level !== "bimonthly" || record.periodId === selectedTerm?.id) &&
        matches(record)
      ));
  const total = level === "daily" ? dailyVisible.length : summaryVisible.length;
  const pagedDaily = dailyVisible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pagedSummary = summaryVisible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const eligibleStudents = accounts.filter((account) => (
    account.role === "student" && account.active && account.teacherIds.includes(profile.uid) && account.subjects.includes(activeSubject)
  )).filter((student) => !normalizedSearch || `${student.name} ${student.grade ?? ""} ${student.group ?? ""}`.toLocaleLowerCase("es").includes(normalizedSearch));
  const capturePageStudents = eligibleStudents.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const daySubjectRecords = cycleRecords.filter((record) => record.weekId === selectedWeek?.id && record.gradeDate === activeDate && record.subject === activeSubject && record.teacherId === profile.uid);
  const weeklyRecords = aggregateDailyGradesByWeek(cycleRecords, calendar).filter((record) => record.weekId === selectedWeek?.id && matches(record));
  const average = (items: Array<{ weightedScore: number }>) => items.length
    ? Math.round(items.reduce((sum, record) => sum + record.weightedScore, 0) / items.length * 10) / 10
    : 0;

  async function persist(student: ManagedAccount, scores: WeeklyGradeScores) {
    if (!selectedWeek || !selectedTerm || !activeDate) {
      toast.error("Selecciona una fecha dentro de una semana y bimestre configurados.");
      return;
    }
    try {
      if (firebaseReady) {
        await saveDailyGrade(profile, config, academicConfig, calendar, selectedWeek, selectedTerm, activeDate, student, activeSubject, scores);
      } else {
        const id = [academicConfig.schoolYearId, selectedWeek.id, activeDate, gradeSubjectId(activeSubject), profile.uid, student.uid].join("__");
        const existing = records.find((record) => record.id === id);
        const nextRecord: DailyGradeRecord = {
          id,
          institutionId: profile.institutionId,
          schoolYearId: academicConfig.schoolYearId,
          schoolYearLabel: academicConfig.schoolYearLabel,
          termId: selectedTerm.id,
          termLabel: selectedTerm.label,
          weekId: selectedWeek.id,
          weekLabel: selectedWeek.label,
          gradeDate: activeDate,
          subjectId: gradeSubjectId(activeSubject),
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
        const next = existing ? records.map((record) => record.id === id ? nextRecord : record) : [nextRecord, ...records];
        setRecords(next);
        window.localStorage.setItem(DEMO_DAILY_GRADES_KEY, JSON.stringify(next));
      }
      toast.success(`Calificación diaria de ${student.name} guardada`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos guardar la calificación.");
    }
  }

  async function exportWeeklyPdf() {
    if (!selectedWeek || !weeklyRecords.length) {
      toast.error("No hay promedios semanales para exportar.");
      return;
    }
    const { downloadGradeReportPdf } = await import("@/lib/grade-report-pdf");
    downloadGradeReportPdf({
      role: profile.role,
      generatedBy: profile.name,
      records: weeklyRecords,
      weekLabel: selectedWeek.label,
      weekRange: formatWeekRange(selectedWeek),
      termLabel: selectedTerm?.label,
      schoolYearLabel: academicConfig.schoolYearLabel,
      guardianName: profile.guardianName,
    });
  }

  const captureTotal = profile.role === "teacher" && level === "daily" ? eligibleStudents.length : total;
  return (
    <section className="academic-grades-shell">
      <header className="academic-grades-hero">
        <div>
          <span className="eyebrow">Centro de calificaciones</span>
          <h2>Del día al ciclo, sin recapturar</h2>
          <p>La captura diaria alimenta automáticamente el promedio semanal, cada bimestre y la calificación final del ciclo.</p>
        </div>
        <button type="button" className="academic-export" onClick={() => void exportWeeklyPdf()}><FileDown size={17} /> Exportar semana</button>
      </header>

      <div className="academic-context-bar">
        <label><span>Semana</span><select value={selectedWeek?.id ?? ""} onChange={(event) => {
          const nextWeek = calendar.weeks.find((item) => item.id === event.target.value);
          setSelectedWeekId(event.target.value);
          setSelectedDate(dateWithinWeek(calendar, nextWeek, academicConfig.timezone));
          setPage(1);
        }}>
          {[...calendar.weeks].sort((a, b) => a.order - b.order).map((week) => <option key={week.id} value={week.id}>{week.label} · {formatWeekRange(week)}</option>)}
        </select></label>
        <div className="academic-context-readout"><CalendarDays size={18} /><span><small>Bimestre</small><strong>{selectedTerm?.label ?? "Sin bimestre"}</strong></span></div>
        {level === "daily" && <label><span>Día de captura</span><select value={activeDate} disabled={!workingDates.length} onChange={(event) => { setSelectedDate(event.target.value); setPage(1); }}>
          {!workingDates.length && <option value="">Sin días hábiles</option>}
          {workingDates.map((date) => <option key={date} value={date}>{dateLabel(date, true)}</option>)}
        </select></label>}
        <div className="academic-context-readout is-date"><Sparkles size={18} /><span><small>Contexto exacto</small><strong>{level === "daily" ? dateLabel(activeDate, true) : selectedWeek?.label}</strong></span></div>
      </div>

      <nav className="academic-level-tabs" aria-label="Nivel de calificaciones">
        {([
          ["daily", "Diarias", ClipboardPenLine],
          ["weekly", "Semanales", BarChart3],
          ["bimonthly", "Bimestrales", Layers3],
          ["cycle", "Ciclo / finales", GraduationCap],
        ] as const).map(([value, label, Icon]) => <button type="button" key={value} className={level === value ? "active" : ""} onClick={() => { setLevel(value); setPage(1); }}><Icon size={17} /> {label}</button>)}
      </nav>

      <section className="academic-toolbar">
        <div>
          <strong>{level === "daily" ? profile.role === "teacher" ? "Captura diaria" : "Detalle diario" : level === "weekly" ? "Promedios semanales" : level === "bimonthly" ? "Promedios bimestrales" : "Calificaciones finales"}</strong>
          <span>{level === "daily" ? `${selectedWeek?.label} · ${dateLabel(activeDate)}` : level === "bimonthly" ? selectedTerm?.label : level === "cycle" ? `Ciclo ${academicConfig.schoolYearLabel}` : selectedWeek?.label}</span>
        </div>
        <label className="academic-search"><Search size={16} /><input type="search" placeholder="Buscar alumno, grupo o materia…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
        <label className="academic-subject-filter"><span>Materia</span><select value={activeSubject} onChange={(event) => { setSubject(event.target.value); setPage(1); }}>
          {profile.role !== "teacher" && <option value="all">Todas las materias</option>}
          {availableSubjects.map((item) => <option key={item} value={item}>{item}</option>)}
        </select></label>
      </section>

      <div className="academic-metrics">
        <article><span>Promedio visible</span><strong>{score(level === "daily" ? average(dailyVisible) : average(summaryVisible))}</strong><small>Escala de 0 a 100</small></article>
        <article><span>{profile.role === "teacher" && level === "daily" ? "Capturados hoy" : "Registros"}</span><strong>{profile.role === "teacher" && level === "daily" ? daySubjectRecords.length : total}</strong><small>{profile.role === "teacher" && level === "daily" ? `de ${eligibleStudents.length} alumnos` : "según filtros"}</small></article>
        <article><span>Regla de cálculo</span><strong>{level === "daily" ? "Captura" : "Promedio"}</strong><small>{level === "weekly" ? `${workingDates.length} días hábiles esperados` : level === "bimonthly" ? "semanas del bimestre" : level === "cycle" ? "bimestres del ciclo" : "cinco criterios"}</small></article>
      </div>

      {loading ? <div className="academic-loading"><span /><span /><span /></div> : profile.role === "teacher" && level === "daily" ? (
        <div className="academic-capture-list">
          <div className="academic-capture-header"><span>Alumno</span><span>Criterios del día · valores de 0 a 100</span><span>Resultado</span></div>
          {!activeSubject ? <div className="academic-empty"><GraduationCap size={28} /><h3>No tienes materias asignadas</h3><p>Dirección debe actualizar tu perfil antes de capturar.</p></div>
            : !capturePageStudents.length ? <div className="academic-empty"><Search size={28} /><h3>No encontramos alumnos</h3><p>Revisa la materia o ajusta la búsqueda.</p></div>
              : capturePageStudents.map((student) => <CaptureRow
                key={`${activeDate}-${activeSubject}-${student.uid}-${daySubjectRecords.find((record) => record.studentId === student.uid)?.updatedAt ?? "new"}`}
                student={student}
                record={daySubjectRecords.find((record) => record.studentId === student.uid)}
                weights={config.weights}
                onSave={persist}
              />)}
        </div>
      ) : level === "daily" ? <DailyTable records={pagedDaily} /> : <SummaryTable records={pagedSummary} level={level} />}
      <Pagination page={page} total={captureTotal} onChange={setPage} />
    </section>
  );
}
