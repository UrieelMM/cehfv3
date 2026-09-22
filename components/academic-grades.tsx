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
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { SectionOrbLoader } from "@/components/animated-orb";
import { studentCanTakeSubject, subjectsMatch } from "@/lib/academic-subjects";
import { clampGradeScore, GRADE_MAX } from "@/lib/grade-scale";
import {
  aggregateDailyGradesByWeek,
  buildGradePeriodSummaries,
  calculateWeightedGrade,
  DEFAULT_GRADING_WEIGHTS,
  DEFAULT_WEEKLY_GRADE_SCORES,
  GRADING_CRITERIA,
  saveDailyGrade,
  watchDailyGrades,
  watchGradeReportDirectors,
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
  WeeklyGradeRecord,
  WeeklyGradeScores,
} from "@/lib/types";

const PAGE_SIZE = 10;

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
        <span aria-label={student.photoURL ? `Fotografía de ${student.name}` : `Iniciales de ${student.name}`}>
          {student.photoURL ? (
            <Image src={student.photoURL} alt="" fill sizes="34px" unoptimized />
          ) : student.initials}
        </span>
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
              max={GRADE_MAX}
              step="0.1"
              value={scores[criterion.key]}
              onChange={(event) => setScores((current) => ({
                ...current,
                [criterion.key]: clampGradeScore(event.target.value),
              }))}
            />
          </label>
        ))}
      </div>
      <div className="academic-capture-result">
        <span className={`academic-score-badge is-${result >= 9 ? "high" : result >= 7 ? "mid" : "low"}`}>{score(result)}</span>
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
          <th>Promedio (0–10)</th><th>Evidencias</th>
        </tr></thead>
        <tbody>{records.map((record) => (
          <tr key={record.id}>
            <td><strong>{record.studentName}</strong><small>{groupLabel(record)}</small></td>
            <td><strong>{record.periodLabel}</strong><small>{level === "weekly" ? record.termLabel : record.schoolYearLabel}</small></td>
            <td>{record.subject}<small>{record.teacherName}</small></td>
            {GRADING_CRITERIA.map((criterion) => <td key={criterion.key}>{score(record.scores[criterion.key])}</td>)}
            <td><span className={`academic-score-badge is-${record.weightedScore >= 9 ? "high" : record.weightedScore >= 7 ? "mid" : "low"}`}>{score(record.weightedScore)}</span></td>
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
        <thead><tr><th>Alumno</th><th>Fecha</th><th>Materia</th>{GRADING_CRITERIA.map((criterion) => <th key={criterion.key}>{criterion.shortLabel}</th>)}<th>Resultado (0–10)</th></tr></thead>
        <tbody>{records.map((record) => <tr key={record.id}>
          <td><strong>{record.studentName}</strong><small>{groupLabel(record)}</small></td>
          <td><strong>{dateLabel(record.gradeDate)}</strong><small>{record.weekLabel} · {record.termLabel}</small></td>
          <td>{record.subject}<small>{record.teacherName}</small></td>
          {GRADING_CRITERIA.map((criterion) => <td key={criterion.key}>{score(record.scores[criterion.key])}</td>)}
          <td><span className={`academic-score-badge is-${record.weightedScore >= 9 ? "high" : record.weightedScore >= 7 ? "mid" : "low"}`}>{score(record.weightedScore)}</span></td>
        </tr>)}</tbody>
      </table>
    </div>
  );
}

type GradeExportScope = "student" | "group";

function GradeExportDialog({
  profile,
  records,
  selectedWeek,
  termLabel,
  schoolYearLabel,
  accounts,
  directorNames,
  onClose,
}: {
  profile: UserProfile;
  records: WeeklyGradeRecord[];
  selectedWeek?: AcademicWeek;
  termLabel?: string;
  schoolYearLabel: string;
  accounts: ManagedAccount[];
  directorNames: string[];
  onClose: () => void;
}) {
  const groups = Array.from(new Set(records.map(groupLabel)))
    .sort((first, second) => first.localeCompare(second, "es"));
  const [scope, setScope] = useState<GradeExportScope>("student");
  const [group, setGroup] = useState(groups[0] ?? "");
  const [studentId, setStudentId] = useState("");
  const [exporting, setExporting] = useState(false);
  const selectedGroup = groups.includes(group) ? group : groups[0] ?? "";
  const groupRecords = records.filter((record) => groupLabel(record) === selectedGroup);
  const students = Array.from(new Map(groupRecords.map((record) => (
    [record.studentId, record.studentName]
  ))).entries()).sort((first, second) => first[1].localeCompare(second[1], "es"));
  const selectedStudentId = students.some(([id]) => id === studentId)
    ? studentId
    : students[0]?.[0] ?? "";
  const selectedStudentName = students.find(([id]) => id === selectedStudentId)?.[1];
  const filteredRecords = scope === "group"
    ? groupRecords
    : groupRecords.filter((record) => record.studentId === selectedStudentId);
  const guardianName = scope === "student"
    ? accounts.find((account) => account.uid === selectedStudentId)?.guardianName
    : undefined;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !exporting) onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [exporting, onClose]);

  async function exportPdf() {
    if (!selectedWeek || !filteredRecords.length) {
      toast.error("No hay calificaciones para el alcance seleccionado.");
      return;
    }
    setExporting(true);
    try {
      const { downloadGradeReportPdf } = await import("@/lib/grade-report-pdf");
      await downloadGradeReportPdf({
        role: scope === "student" ? "student" : profile.role,
        generatedBy: profile.name,
        records: filteredRecords,
        weekLabel: selectedWeek.label,
        weekRange: formatWeekRange(selectedWeek),
        termLabel,
        schoolYearLabel,
        directorNames,
        guardianName,
        fileNameLabel: scope === "student"
          ? `${selectedStudentName ?? "alumno"}-${selectedWeek.label}`
          : `${selectedGroup}-${selectedWeek.label}`,
        filters: [
          `Grupo: ${selectedGroup}`,
          `Alcance: ${scope === "student" ? "Por alumno" : "Grupo completo"}`,
        ],
      });
      toast.success(scope === "student"
        ? `El PDF de ${selectedStudentName ?? "el alumno"} se descargó correctamente.`
        : `El PDF del grupo ${selectedGroup} se descargó correctamente.`);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos generar el PDF.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="grade-export-modal-backdrop" onClick={() => !exporting && onClose()}>
      <section
        className="grade-export-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="academic-grade-export-title"
      >
        <header>
          <span className="grade-export-icon"><FileDown size={22} /></span>
          <div>
            <span className="eyebrow">Reporte listo para firma</span>
            <h2 id="academic-grade-export-title">Exportar calificaciones a PDF</h2>
            <p>Elige si necesitas la boleta de un alumno o el reporte completo de un grupo.</p>
          </div>
          <button disabled={exporting} onClick={onClose} type="button" aria-label="Cerrar exportación"><X size={19} /></button>
        </header>

        <div className="grade-export-scope" role="radiogroup" aria-label="Alcance del PDF">
          <button
            className={scope === "student" ? "active" : ""}
            type="button"
            role="radio"
            aria-checked={scope === "student"}
            onClick={() => setScope("student")}
          >
            <UserRound size={20} />
            <span><strong>Por alumno</strong><small>Genera una boleta individual.</small></span>
          </button>
          <button
            className={scope === "group" ? "active" : ""}
            type="button"
            role="radio"
            aria-checked={scope === "group"}
            onClick={() => setScope("group")}
          >
            <UsersRound size={20} />
            <span><strong>Grupo completo</strong><small>Incluye a todos sus alumnos.</small></span>
          </button>
        </div>

        <div className="grade-export-fields">
          <label>
            <span>Grupo</span>
            <select value={selectedGroup} onChange={(event) => { setGroup(event.target.value); setStudentId(""); }}>
              {groups.map((item) => <option value={item} key={item}>{item}</option>)}
            </select>
          </label>
          {scope === "student" && (
            <label>
              <span>Alumno</span>
              <select value={selectedStudentId} onChange={(event) => setStudentId(event.target.value)}>
                {students.map(([id, name]) => <option value={id} key={id}>{name}</option>)}
              </select>
            </label>
          )}
        </div>

        <div className="grade-export-preview">
          <span><strong>{scope === "student" ? (filteredRecords.length ? 1 : 0) : students.length}</strong><small>{scope === "student" ? "alumno" : "alumnos"}</small></span>
          <div>
            <strong>{scope === "student" ? selectedStudentName ?? "Sin alumno disponible" : selectedGroup || "Sin grupo disponible"}</strong>
            <p>{filteredRecords.length} {filteredRecords.length === 1 ? "calificación incluida" : "calificaciones incluidas"} de {selectedWeek?.label.toLowerCase() ?? "la semana"}.</p>
          </div>
        </div>

        <footer>
          <button className="grade-export-cancel" disabled={exporting} onClick={onClose} type="button">Cancelar</button>
          <button className="grade-export-submit" disabled={exporting || !filteredRecords.length || !selectedWeek} onClick={() => void exportPdf()} type="button">
            <FileDown size={17} /> {exporting ? "Generando…" : "Descargar PDF"}
          </button>
        </footer>
      </section>
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
  const todayDate = new Date().toLocaleDateString("en-CA", { timeZone: academicConfig.timezone });
  const isActiveDateToday = level === "daily" && activeDate === todayDate;
  const [records, setRecords] = useState<DailyGradeRecord[]>([]);
  const [config, setConfig] = useState<TeacherGradingConfig>(() => defaultConfig(profile));
  const [loading, setLoading] = useState(firebaseReady);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportingStudentPdf, setExportingStudentPdf] = useState(false);
  const [directorNames, setDirectorNames] = useState<string[]>(profile.role === "director" ? [profile.name] : []);
  const teacherSubjects = useMemo(() => profile.subjects ?? [], [profile.subjects]);
  const availableSubjects = useMemo(() => [...new Set([
    ...teacherSubjects,
    ...records.map((record) => record.subject),
  ])].sort((a, b) => a.localeCompare(b, "es")), [records, teacherSubjects]);
  const [subject, setSubject] = useState(profile.role === "teacher" ? teacherSubjects[0] ?? "" : "all");
  const activeSubject = profile.role === "teacher" ? (teacherSubjects.includes(subject) ? subject : teacherSubjects[0] ?? "") : subject;

  useEffect(() => {
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
    const stopDirectors = watchGradeReportDirectors(
      profile,
      (directors) => setDirectorNames(directors.map((director) => director.name)),
      () => toast.error("No pudimos cargar los perfiles de Dirección para el PDF."),
    );
    return () => { stopGrades(); stopConfig(); stopDirectors(); };
  }, [profile]);

  const cycleRecords = records.filter((record) => record.schoolYearId === academicConfig.schoolYearId);
  const summaries = buildGradePeriodSummaries(cycleRecords, calendar);
  const normalizedSearch = search.trim().toLocaleLowerCase("es");
  const matches = (record: { studentName: string; studentGrade?: string; studentGroup?: string; subject: string; teacherName: string }) => (
    (activeSubject === "all" || !activeSubject || subjectsMatch(record.subject, activeSubject)) &&
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
    account.role === "student" && account.active && account.teacherIds.includes(profile.uid) && studentCanTakeSubject(account, activeSubject)
  )).filter((student) => !normalizedSearch || `${student.name} ${student.grade ?? ""} ${student.group ?? ""}`.toLocaleLowerCase("es").includes(normalizedSearch));
  const capturePageStudents = eligibleStudents.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const daySubjectRecords = cycleRecords.filter((record) => record.weekId === selectedWeek?.id && record.gradeDate === activeDate && subjectsMatch(record.subject, activeSubject) && record.teacherId === profile.uid);
  const firebaseAccountNames = new Map(accounts.map((account) => [account.uid, account.name]));
  const selectedWeekRecords = aggregateDailyGradesByWeek(cycleRecords, calendar)
    .filter((record) => record.weekId === selectedWeek?.id)
    .map((record) => ({
      ...record,
      studentName: firebaseAccountNames.get(record.studentId) ?? record.studentName,
      teacherName: firebaseAccountNames.get(record.teacherId) ?? record.teacherName,
    }));
  const average = (items: Array<{ weightedScore: number }>) => items.length
    ? Math.round(items.reduce((sum, record) => sum + record.weightedScore, 0) / items.length * 10) / 10
    : 0;

  async function persist(student: ManagedAccount, scores: WeeklyGradeScores) {
    if (!selectedWeek || !selectedTerm || !activeDate) {
      toast.error("Selecciona una fecha dentro de una semana y bimestre configurados.");
      return;
    }
    try {
      await saveDailyGrade(profile, config, academicConfig, calendar, selectedWeek, selectedTerm, activeDate, student, activeSubject, scores);
      toast.success(`Calificación diaria de ${student.name} guardada`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos guardar la calificación.");
    }
  }

  async function exportStudentPdf() {
    if (!selectedWeek || !selectedWeekRecords.length) {
      toast.error("No hay promedios semanales para exportar.");
      return;
    }
    setExportingStudentPdf(true);
    try {
      const { downloadGradeReportPdf } = await import("@/lib/grade-report-pdf");
      await downloadGradeReportPdf({
        role: "student",
        generatedBy: profile.name,
        records: selectedWeekRecords,
        weekLabel: selectedWeek.label,
        weekRange: formatWeekRange(selectedWeek),
        termLabel: selectedTerm?.label,
        schoolYearLabel: academicConfig.schoolYearLabel,
        directorNames,
        guardianName: profile.guardianName,
        fileNameLabel: `${profile.name}-${selectedWeek.label}`,
      });
      toast.success("Tu boleta semanal se descargó en PDF.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos generar el PDF.");
    } finally {
      setExportingStudentPdf(false);
    }
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
        <button
          type="button"
          className="academic-export"
          disabled={loading || exportingStudentPdf || !selectedWeekRecords.length}
          onClick={() => profile.role === "student" ? void exportStudentPdf() : setExportOpen(true)}
        >
          <FileDown size={17} /> {exportingStudentPdf ? "Generando…" : "Exportar PDF"}
        </button>
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
        <div className={`academic-context-readout is-date${isActiveDateToday ? " is-today" : ""}`}>
          <Sparkles size={18} />
          <span>
            <small>{level === "daily" ? isActiveDateToday ? "Día actual" : "Día seleccionado" : "Semana seleccionada"}</small>
            <strong>{level === "daily" ? dateLabel(activeDate, true) : selectedWeek?.label}</strong>
          </span>
          {isActiveDateToday && <b className="academic-today-badge"><i /> Hoy</b>}
        </div>
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
        <article><span>Promedio</span><strong>{score(level === "daily" ? average(dailyVisible) : average(summaryVisible))}</strong><small>Escala de 0 a 10</small></article>
        <article><span>{profile.role === "teacher" && level === "daily" ? "Capturados hoy" : "Registros"}</span><strong>{profile.role === "teacher" && level === "daily" ? daySubjectRecords.length : total}</strong><small>{profile.role === "teacher" && level === "daily" ? `de ${eligibleStudents.length} alumnos` : "según filtros"}</small></article>
        <article><span>Regla de cálculo</span><strong>{level === "daily" ? "Captura" : "Promedio"}</strong><small>{level === "weekly" ? `${workingDates.length} días hábiles esperados` : level === "bimonthly" ? "semanas del bimestre" : level === "cycle" ? "bimestres del ciclo" : "cinco criterios"}</small></article>
      </div>

      {loading ? <SectionOrbLoader label="Calculando calificaciones…" detail="Estamos sincronizando alumnos, materias y periodos." /> : profile.role === "teacher" && level === "daily" ? (
        <div className="academic-capture-list">
          <div className="academic-capture-header"><span>Alumno</span><span>Criterios del día · valores de 0 a 10</span><span>Resultado</span></div>
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
      {typeof document !== "undefined" && createPortal(
        exportOpen && profile.role !== "student" ? (
          <GradeExportDialog
            profile={profile}
            records={selectedWeekRecords}
            selectedWeek={selectedWeek}
            termLabel={selectedTerm?.label}
            schoolYearLabel={academicConfig.schoolYearLabel}
            accounts={accounts}
            directorNames={directorNames}
            onClose={() => setExportOpen(false)}
          />
        ) : null,
        document.body,
      )}
    </section>
  );
}
