"use client";

import {
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  FileText,
  Search,
  Send,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { includesSubject, subjectsMatch } from "@/lib/academic-subjects";
import {
  aggregateDailyGradesByWeek,
  GRADING_CRITERIA,
  watchDailyGrades,
} from "@/lib/grades-firebase";
import {
  saveStudentWeeklyReport,
  watchStudentWeeklyReports,
} from "@/lib/reports-firebase";
import type {
  AcademicCalendar,
  AcademicConfig,
  AcademicWeek,
  DailyGradeRecord,
  ManagedAccount,
  StudentWeeklyReport,
  UserProfile,
  WeeklyGradeRecord,
} from "@/lib/types";

const PAGE_SIZE = 10;

function score(value: number) {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}

function groupLabel(value: {
  studentGrade?: string;
  studentGroup?: string;
  grade?: string;
  group?: string;
}) {
  return [value.studentGrade ?? value.grade, value.studentGroup ?? value.group]
    .filter(Boolean)
    .join(" ") || "Sin grupo";
}

function weekRange(week: AcademicWeek) {
  const format = (value: string) => new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" })
    .format(new Date(`${value}T12:00:00`));
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

function Pagination({ page, total, onChange }: { page: number; total: number; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (total <= PAGE_SIZE) return null;
  return <nav className="report-pagination" aria-label="Paginación de reportes">
    <span>Mostrando <strong>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)}</strong> de {total}</span>
    <div><button type="button" disabled={page === 1} onClick={() => onChange(page - 1)} aria-label="Página anterior"><ChevronLeft size={16} /></button><span>Página <strong>{page}</strong> de {pages}</span><button type="button" disabled={page === pages} onClick={() => onChange(page + 1)} aria-label="Página siguiente"><ChevronRight size={16} /></button></div>
  </nav>;
}

function WeeklyEvidence({ grade }: { grade?: WeeklyGradeRecord }) {
  if (!grade) {
    return <div className="report-no-evidence"><CircleHelp size={20} /><span><strong>Sin calificaciones esta semana</strong><small>El reporte puede guardarse como borrador, pero conviene capturar las calificaciones diarias primero.</small></span></div>;
  }
  return <section className="report-evidence">
    <div className="report-evidence-score"><span>Promedio semanal</span><strong>{score(grade.weightedScore)}</strong><small>{grade.dayCount ?? 0} de {grade.workingDayCount ?? grade.dayCount ?? 0} días hábiles{grade.missingDayCount ? " · provisional" : " · completo"}</small></div>
    <div className="report-evidence-rubrics">{GRADING_CRITERIA.map((criterion) => <span key={criterion.key}><small>{criterion.shortLabel}</small><strong>{score(grade.scores[criterion.key])}</strong></span>)}</div>
  </section>;
}

function ReportEditor({
  student,
  grade,
  report,
  onSave,
}: {
  student: ManagedAccount;
  grade?: WeeklyGradeRecord;
  report?: StudentWeeklyReport;
  onSave: (student: ManagedAccount, values: Pick<StudentWeeklyReport, "achievement" | "supportArea" | "nextStep" | "status">) => Promise<void>;
}) {
  const [achievement, setAchievement] = useState(report?.achievement ?? "");
  const [supportArea, setSupportArea] = useState(report?.supportArea ?? "");
  const [nextStep, setNextStep] = useState(report?.nextStep ?? "");
  const [saving, setSaving] = useState<"draft" | "published" | null>(null);
  const ready = achievement.trim() && supportArea.trim() && nextStep.trim();
  const submit = async (status: "draft" | "published") => {
    if (!ready) {
      toast.error("Completa los tres campos del reporte.");
      return;
    }
    setSaving(status);
    try { await onSave(student, { achievement, supportArea, nextStep, status }); }
    finally { setSaving(null); }
  };
  return <article className="report-editor-card">
    <header>
      <div className="report-student-avatar">{student.initials}</div>
      <div><span className="report-card-kicker">Reporte individual · {groupLabel(student)}</span><h3>{student.name}</h3><p>{grade?.subject ?? report?.subject ?? "Materia"}</p></div>
      <span className={`report-status is-${report?.status ?? "new"}`}>{report?.status === "published" ? "Publicado" : report?.status === "draft" ? "Borrador" : "Sin iniciar"}</span>
    </header>
    <WeeklyEvidence grade={grade} />
    <div className="report-field-grid">
      <label className="is-achievement"><span><CheckCircle2 size={17} /> Un logro para reconocer</span><textarea rows={4} maxLength={600} placeholder="Describe un avance concreto observado esta semana…" value={achievement} onChange={(event) => setAchievement(event.target.value)} /><small>{achievement.length}/600</small></label>
      <label className="is-support"><span><CircleHelp size={17} /> Área de acompañamiento</span><textarea rows={4} maxLength={600} placeholder="Explica dónde necesita apoyo y con qué evidencia…" value={supportArea} onChange={(event) => setSupportArea(event.target.value)} /><small>{supportArea.length}/600</small></label>
      <label className="is-next"><span><ArrowRight size={17} /> Próximo paso</span><textarea rows={4} maxLength={600} placeholder="Indica una acción breve, específica y alcanzable…" value={nextStep} onChange={(event) => setNextStep(event.target.value)} /><small>{nextStep.length}/600</small></label>
    </div>
    <footer><span>Se guarda por alumno, materia y semana.</span><div><button type="button" disabled={Boolean(saving)} onClick={() => void submit("draft")}>{saving === "draft" ? "Guardando…" : "Guardar borrador"}</button><button type="button" className="is-primary" disabled={Boolean(saving)} onClick={() => void submit("published")}><Send size={15} /> {saving === "published" ? "Publicando…" : report?.status === "published" ? "Actualizar publicación" : "Publicar reporte"}</button></div></footer>
  </article>;
}

function PublishedReportCard({ report, grade }: { report: StudentWeeklyReport; grade?: WeeklyGradeRecord }) {
  return <article className="published-report-card" id={`report-${report.id}`}>
    <header><div><span className={`report-status is-${report.status}`}>{report.status === "published" ? "Publicado" : "Borrador"}</span><h3>{report.studentName}</h3><p>{report.subject} · {report.weekLabel} · {report.termLabel}</p></div><FileText size={25} /></header>
    <WeeklyEvidence grade={grade} />
    <div className="published-report-fields">
      <section className="is-achievement"><CheckCircle2 size={19} /><div><strong>Un logro para reconocer</strong><p>{report.achievement}</p></div></section>
      <section className="is-support"><CircleHelp size={19} /><div><strong>Área de acompañamiento</strong><p>{report.supportArea}</p></div></section>
      <section className="is-next"><ArrowRight size={19} /><div><strong>Próximo paso</strong><p>{report.nextStep}</p></div></section>
    </div>
    <footer><span>{report.teacherName} · {groupLabel(report)}</span><span>Actualizado {new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(report.updatedAt))}</span></footer>
  </article>;
}

export function AcademicReportsPage({
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
  const [weekId, setWeekId] = useState(initialWeek?.id ?? "");
  const week = calendar.weeks.find((item) => item.id === weekId) ?? initialWeek;
  const term = termForWeek(calendar, week?.id);
  const [grades, setGrades] = useState<DailyGradeRecord[]>([]);
  const [reports, setReports] = useState<StudentWeeklyReport[]>([]);
  const [loading, setLoading] = useState(firebaseReady);
  const subjects = useMemo(() => profile.role === "teacher"
    ? profile.subjects ?? []
    : [...new Set([...grades.map((item) => item.subject), ...reports.map((item) => item.subject)])].sort((a, b) => a.localeCompare(b, "es")), [grades, profile.role, profile.subjects, reports]);
  const [subject, setSubject] = useState(profile.role === "teacher" ? profile.subjects?.[0] ?? "" : "all");
  const activeSubject = profile.role === "teacher" ? (includesSubject(profile.subjects ?? [], subject) ? subject : profile.subjects?.[0] ?? "") : subject;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const openReportFromRoute = () => {
      const [section, reportId] = window.location.pathname.split("/").filter(Boolean);
      if (section !== "reports" || !reportId) return;
      const report = reports.find((candidate) => candidate.id === decodeURIComponent(reportId));
      if (!report) return;
      setWeekId(report.weekId);
      setSubject(report.subject);
      setStatus("all");
      setSearch(profile.role === "teacher" ? report.studentName : "");
      setPage(1);
      window.setTimeout(() => {
        document.getElementById(`report-${report.id}`)?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }, 120);
    };
    openReportFromRoute();
    window.addEventListener("popstate", openReportFromRoute);
    return () => window.removeEventListener("popstate", openReportFromRoute);
  }, [profile.role, reports]);

  useEffect(() => {
    let gradesReady = false;
    let reportsReady = false;
    const done = () => { if (gradesReady && reportsReady) setLoading(false); };
    const stopGrades = watchDailyGrades(profile, (next) => { setGrades(next); gradesReady = true; done(); }, () => { gradesReady = true; done(); toast.error("No pudimos cargar las calificaciones para los reportes."); });
    const stopReports = watchStudentWeeklyReports(profile, (next) => { setReports(next); reportsReady = true; done(); }, () => { reportsReady = true; done(); toast.error("No pudimos cargar los reportes semanales."); });
    return () => { stopGrades(); stopReports(); };
  }, [profile]);

  const weeklyGrades = aggregateDailyGradesByWeek(
    grades.filter((grade) => grade.schoolYearId === academicConfig.schoolYearId),
    calendar,
  );
  const normalizedSearch = search.trim().toLocaleLowerCase("es");
  const matchesSearch = (value: { studentName: string; studentGrade?: string; studentGroup?: string }) => !normalizedSearch || `${value.studentName} ${value.studentGrade ?? ""} ${value.studentGroup ?? ""}`.toLocaleLowerCase("es").includes(normalizedSearch);
  const eligibleStudents = accounts.filter((account) => account.role === "student" && account.active && account.teacherIds.includes(profile.uid) && includesSubject(account.subjects, activeSubject) && matchesSearch({ studentName: account.name, studentGrade: account.grade, studentGroup: account.group }));
  const visibleReports = reports.filter((report) => (
    report.schoolYearId === academicConfig.schoolYearId &&
    report.weekId === week?.id &&
    (profile.role !== "student" || report.status === "published") &&
    (activeSubject === "all" || !activeSubject || subjectsMatch(report.subject, activeSubject)) &&
    (status === "all" || report.status === status) &&
    matchesSearch(report)
  ));
  const total = profile.role === "teacher" ? eligibleStudents.length : visibleReports.length;
  const pagedStudents = eligibleStudents.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pagedReports = visibleReports.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const weekSubjectGrades = weeklyGrades.filter((grade) => grade.weekId === week?.id && (activeSubject === "all" || !activeSubject || subjectsMatch(grade.subject, activeSubject)));

  async function persist(student: ManagedAccount, values: Pick<StudentWeeklyReport, "achievement" | "supportArea" | "nextStep" | "status">) {
    if (!week || !term || !activeSubject) {
      toast.error("Selecciona una semana y materia configuradas.");
      return;
    }
    const grade = weekSubjectGrades.find((item) => item.studentId === student.uid && item.teacherId === profile.uid);
    try {
      await saveStudentWeeklyReport(profile, academicConfig, {
        week,
        term,
        student,
        subject: activeSubject,
        ...values,
        weeklyScore: grade?.weightedScore ?? 0,
        gradedDays: grade?.dayCount ?? 0,
        workingDays: grade?.workingDayCount ?? 0,
      });
      toast.success(values.status === "published" ? `Reporte de ${student.name} publicado` : `Borrador de ${student.name} guardado`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos guardar el reporte.");
    }
  }

  const publishedCount = reports.filter((report) => report.weekId === week?.id && report.status === "published" && (activeSubject === "all" || subjectsMatch(report.subject, activeSubject))).length;
  return <section className="academic-reports-shell">
    <header className="academic-reports-hero"><div><span className="eyebrow">Seguimiento semanal</span><h2>Reportes con evidencia, alumno por alumno</h2><p>{profile.role === "teacher" ? "Consulta el desempeño de la semana y redacta los tres acuerdos de acompañamiento por materia." : "Consulta los reportes publicados y el contexto de calificaciones que los respalda."}</p></div><div className="academic-reports-cycle"><CalendarRange size={20} /><span><small>Ciclo en curso</small><strong>{academicConfig.schoolYearLabel}</strong></span></div></header>
    <div className="academic-reports-context">
      <label><span>Semana del reporte</span><select value={week?.id ?? ""} onChange={(event) => { setWeekId(event.target.value); setPage(1); }}>{[...calendar.weeks].sort((a, b) => a.order - b.order).map((item) => <option key={item.id} value={item.id}>{item.label} · {weekRange(item)}</option>)}</select></label>
      <div><small>Bimestre correspondiente</small><strong>{term?.label ?? "Sin bimestre"}</strong></div>
      <label><span>Materia</span><select value={activeSubject} onChange={(event) => { setSubject(event.target.value); setPage(1); }}>{profile.role !== "teacher" && <option value="all">Todas las materias</option>}{subjects.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <div className="is-exact"><small>Estás trabajando en</small><strong>{week?.label} · {activeSubject === "all" ? "Todas las materias" : activeSubject}</strong></div>
    </div>
    <div className="academic-report-metrics"><article><span>Alumnos / reportes</span><strong>{total}</strong><small>según filtros actuales</small></article><article><span>Publicados en la semana</span><strong>{publishedCount}</strong><small>visibles para las familias</small></article><article><span>Evidencia disponible</span><strong>{weekSubjectGrades.length}</strong><small>promedios semanales calculados</small></article></div>
    <section className="academic-report-toolbar"><div><strong>{profile.role === "teacher" ? "Lista de alumnos" : profile.role === "director" ? "Reportes institucionales" : "Reportes publicados"}</strong><span>{week?.label} · {week ? weekRange(week) : "Sin fechas"}</span></div><label><Search size={16} /><input type="search" placeholder="Buscar alumno o grupo…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>{profile.role !== "teacher" && <select aria-label="Filtrar reportes por estado" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="all">Todos los estados</option><option value="published">Publicados</option>{profile.role === "director" && <option value="draft">Borradores</option>}</select>}</section>
    {loading ? <div className="report-loading"><span /><span /><span /></div> : profile.role === "teacher" ? (
      <div className="report-editor-list">{!pagedStudents.length ? <div className="report-empty"><Search size={27} /><h3>No encontramos alumnos</h3><p>Revisa la materia seleccionada o ajusta la búsqueda.</p></div> : pagedStudents.map((student) => {
        const grade = weekSubjectGrades.find((item) => item.studentId === student.uid && item.teacherId === profile.uid);
        const report = reports.find((item) => item.weekId === week?.id && subjectsMatch(item.subject, activeSubject) && item.studentId === student.uid && item.teacherId === profile.uid);
        return <div id={report ? `report-${report.id}` : undefined} key={`${week?.id}-${activeSubject}-${student.uid}-${report?.updatedAt ?? "new"}`}><ReportEditor student={student} grade={grade} report={report} onSave={persist} /></div>;
      })}</div>
    ) : <div className="published-report-list">{!pagedReports.length ? <div className="report-empty"><FileText size={27} /><h3>No hay reportes en esta selección</h3><p>Prueba otra semana, materia o búsqueda.</p></div> : pagedReports.map((report) => <PublishedReportCard key={report.id} report={report} grade={weeklyGrades.find((grade) => grade.weekId === report.weekId && grade.subjectId === report.subjectId && grade.studentId === report.studentId && grade.teacherId === report.teacherId)} />)}</div>}
    <Pagination page={page} total={total} onChange={setPage} />
  </section>;
}
