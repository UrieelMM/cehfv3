"use client";

import {
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Eye,
  EyeOff,
  FileText,
  Pencil,
  Search,
  Send,
  Trash2,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { SectionOrbLoader } from "@/components/animated-orb";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { ContentEditDialog } from "@/components/content-edit-dialog";
import { includesSubject, studentCanTakeSubject, subjectsMatch } from "@/lib/academic-subjects";
import {
  aggregateDailyGradesByWeek,
  GRADING_CRITERIA,
  watchDailyGrades,
} from "@/lib/grades-firebase";
import {
  deleteStudentWeeklyReport,
  markStudentWeeklyReportViewed,
  saveStudentWeeklyReport,
  updateStudentWeeklyReport,
  watchStudentWeeklyReportViews,
  watchStudentWeeklyReports,
} from "@/lib/reports-firebase";
import type {
  AcademicCalendar,
  AcademicConfig,
  AcademicWeek,
  DailyGradeRecord,
  ManagedAccount,
  StudentWeeklyReport,
  StudentWeeklyReportView,
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
    <div className="report-evidence-score"><span>Promedio semanal</span><strong>{score(grade.weightedScore)} / 10</strong><small>{grade.dayCount ?? 0} de {grade.workingDayCount ?? grade.dayCount ?? 0} días hábiles{grade.missingDayCount ? " · provisional" : " · completo"}</small></div>
    <div className="report-evidence-rubrics">{GRADING_CRITERIA.map((criterion) => <span key={criterion.key}><small>{criterion.shortLabel}</small><strong>{score(grade.scores[criterion.key])}</strong></span>)}</div>
  </section>;
}

function reportViewLabel(report: StudentWeeklyReport, view?: StudentWeeklyReportView) {
  if (!view) return { current: false, label: "El alumno aún no lo abre" };
  const current = Date.parse(view.lastOpenedAt) >= Date.parse(report.updatedAt);
  if (!current) return { current: false, label: "Actualizado después de la última lectura" };
  return {
    current: true,
    label: `Visto ${new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(view.lastOpenedAt))}`,
  };
}

function ReportViewStatus({ report, view }: { report: StudentWeeklyReport; view?: StudentWeeklyReportView }) {
  if (report.status !== "published") return null;
  const status = reportViewLabel(report, view);
  return <span className={`report-view-status ${status.current ? "is-viewed" : "is-pending"}`} title={status.label}>
    {status.current ? <Eye size={13} /> : <EyeOff size={13} />}
    {status.label}
  </span>;
}

function ReportEditor({
  student,
  grade,
  report,
  view,
  onSave,
  onDelete,
}: {
  student: ManagedAccount;
  grade?: WeeklyGradeRecord;
  report?: StudentWeeklyReport;
  view?: StudentWeeklyReportView;
  onSave: (student: ManagedAccount, values: Pick<StudentWeeklyReport, "achievement" | "supportArea" | "nextStep" | "status">) => Promise<void>;
  onDelete: (report: StudentWeeklyReport) => void;
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
      <div className="report-student-avatar" aria-label={student.photoURL ? `Fotografía de ${student.name}` : `Iniciales de ${student.name}`}>
        {student.photoURL ? (
          <Image src={student.photoURL} alt="" fill sizes="36px" unoptimized />
        ) : student.initials}
      </div>
      <div><span className="report-card-kicker">Reporte individual · {groupLabel(student)}</span><h3>{student.name}</h3><p>{grade?.subject ?? report?.subject ?? "Materia"}</p></div>
      <div className="report-header-statuses"><span className={`report-status is-${report?.status ?? "new"}`}>{report?.status === "published" ? "Publicado" : report?.status === "draft" ? "Borrador" : "Sin iniciar"}</span>{report && <ReportViewStatus report={report} view={view} />}</div>
    </header>
    <WeeklyEvidence grade={grade} />
    <div className="report-field-grid">
      <label className="is-achievement"><span><CheckCircle2 size={17} /> Un logro para reconocer</span><textarea rows={4} maxLength={600} placeholder="Describe un avance concreto observado esta semana…" value={achievement} onChange={(event) => setAchievement(event.target.value)} /><small>{achievement.length}/600</small></label>
      <label className="is-support"><span><CircleHelp size={17} /> Área de acompañamiento</span><textarea rows={4} maxLength={600} placeholder="Explica dónde necesita apoyo y con qué evidencia…" value={supportArea} onChange={(event) => setSupportArea(event.target.value)} /><small>{supportArea.length}/600</small></label>
      <label className="is-next"><span><ArrowRight size={17} /> Próximo paso</span><textarea rows={4} maxLength={600} placeholder="Indica una acción breve, específica y alcanzable…" value={nextStep} onChange={(event) => setNextStep(event.target.value)} /><small>{nextStep.length}/600</small></label>
    </div>
    <footer><span>Se guarda por alumno, materia y semana.</span><div>{report && <button type="button" className="danger-button" disabled={Boolean(saving)} onClick={() => onDelete(report)}><Trash2 size={15} /> Eliminar</button>}<button type="button" disabled={Boolean(saving)} onClick={() => void submit("draft")}>{saving === "draft" ? "Guardando…" : "Guardar borrador"}</button><button type="button" className="is-primary" disabled={Boolean(saving)} onClick={() => void submit("published")}><Send size={15} /> {saving === "published" ? "Publicando…" : report?.status === "published" ? "Actualizar publicación" : "Publicar reporte"}</button></div></footer>
  </article>;
}

function PublishedReportCard({ report, grade, student, view, studentMode = false, expanded = true, onToggle, onEdit, onDelete }: { report: StudentWeeklyReport; grade?: WeeklyGradeRecord; student?: ManagedAccount; view?: StudentWeeklyReportView; studentMode?: boolean; expanded?: boolean; onToggle?: (report: StudentWeeklyReport) => void; onEdit?: (report: StudentWeeklyReport) => void; onDelete?: (report: StudentWeeklyReport) => void }) {
  const initials = student?.initials ?? report.studentName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  return <article className={`published-report-card ${studentMode ? "is-student-summary" : ""} ${expanded ? "is-expanded" : ""}`} id={`report-${report.id}`}>
    <header><span className="report-student-avatar" aria-label={student?.photoURL ? `Fotografía de ${report.studentName}` : `Iniciales de ${report.studentName}`}>{student?.photoURL ? <Image src={student.photoURL} alt="" fill sizes="36px" unoptimized /> : initials}</span><div><span className={`report-status is-${report.status}`}>{report.status === "published" ? "Publicado" : "Borrador"}</span><h3>{report.studentName}</h3><p>{report.subject} · {report.weekLabel} · {report.termLabel}</p></div>{!studentMode && <ReportViewStatus report={report} view={view} />}<FileText size={25} /></header>
    {expanded && <><WeeklyEvidence grade={grade} />
    <div className="published-report-fields">
      <section className="is-achievement"><CheckCircle2 size={19} /><div><strong>Un logro para reconocer</strong><p>{report.achievement}</p></div></section>
      <section className="is-support"><CircleHelp size={19} /><div><strong>Área de acompañamiento</strong><p>{report.supportArea}</p></div></section>
      <section className="is-next"><ArrowRight size={19} /><div><strong>Próximo paso</strong><p>{report.nextStep}</p></div></section>
    </div></>}
    <footer><span>{report.teacherName} · {groupLabel(report)}</span><span>Actualizado {new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(report.updatedAt))}</span>{studentMode && onToggle && <button type="button" className="report-open-button" aria-expanded={expanded} onClick={() => onToggle(report)}>{expanded ? "Cerrar reporte" : <><Eye size={15} /> Abrir reporte</>}</button>}{onEdit && <button type="button" onClick={() => onEdit(report)}><Pencil size={15} /> Editar</button>}{onDelete && <button type="button" className="danger-button" onClick={() => onDelete(report)}><Trash2 size={15} /> Eliminar reporte</button>}</footer>
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
  const [reportViews, setReportViews] = useState<StudentWeeklyReportView[]>([]);
  const [openReportId, setOpenReportId] = useState<string | null>(null);
  const recordedOpeningsRef = useRef(new Set<string>());
  const [loading, setLoading] = useState(firebaseReady);
  const subjects = useMemo(() => profile.role === "teacher"
    ? profile.subjects ?? []
    : [...new Set([...grades.map((item) => item.subject), ...reports.map((item) => item.subject)])].sort((a, b) => a.localeCompare(b, "es")), [grades, profile.role, profile.subjects, reports]);
  const [subject, setSubject] = useState(profile.role === "teacher" ? profile.subjects?.[0] ?? "" : "all");
  const activeSubject = profile.role === "teacher" ? (includesSubject(profile.subjects ?? [], subject) ? subject : profile.subjects?.[0] ?? "") : subject;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [reportToDelete, setReportToDelete] = useState<StudentWeeklyReport | null>(null);
  const [reportToEdit, setReportToEdit] = useState<StudentWeeklyReport | null>(null);
  const [deleting, setDeleting] = useState(false);

  const recordStudentOpening = useCallback((report: StudentWeeklyReport) => {
    if (profile.role !== "student" || !firebaseReady) return;
    const openingKey = `${report.id}:${report.updatedAt}`;
    if (recordedOpeningsRef.current.has(openingKey)) return;
    recordedOpeningsRef.current.add(openingKey);
    void markStudentWeeklyReportViewed(report, profile).catch((error) => {
      recordedOpeningsRef.current.delete(openingKey);
      console.error("[Campus CEHF] No se pudo registrar la lectura del reporte", error);
    });
  }, [firebaseReady, profile]);

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
      if (profile.role === "student") {
        setOpenReportId(report.id);
        recordStudentOpening(report);
      }
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
  }, [profile.role, recordStudentOpening, reports]);

  useEffect(() => {
    let gradesReady = false;
    let reportsReady = false;
    const done = () => { if (gradesReady && reportsReady) setLoading(false); };
    const stopGrades = watchDailyGrades(profile, (next) => { setGrades(next); gradesReady = true; done(); }, () => { gradesReady = true; done(); toast.error("No pudimos cargar las calificaciones para los reportes."); });
    const stopReports = watchStudentWeeklyReports(profile, (next) => { setReports(next); reportsReady = true; done(); }, () => { reportsReady = true; done(); toast.error("No pudimos cargar los reportes semanales."); });
    return () => { stopGrades(); stopReports(); };
  }, [profile]);

  useEffect(() => {
    if (!firebaseReady) return;
    return watchStudentWeeklyReportViews(
      profile,
      setReportViews,
      () => {
        if (profile.role !== "student") toast.error("No pudimos cargar las lecturas de reportes.");
      },
    );
  }, [firebaseReady, profile]);

  function toggleStudentReport(report: StudentWeeklyReport) {
    if (openReportId === report.id) {
      setOpenReportId(null);
      return;
    }
    setOpenReportId(report.id);
    recordStudentOpening(report);
  }

  const weeklyGrades = aggregateDailyGradesByWeek(
    grades.filter((grade) => grade.schoolYearId === academicConfig.schoolYearId),
    calendar,
  );
  const normalizedSearch = search.trim().toLocaleLowerCase("es");
  const matchesSearch = (value: { studentName: string; studentGrade?: string; studentGroup?: string }) => !normalizedSearch || `${value.studentName} ${value.studentGrade ?? ""} ${value.studentGroup ?? ""}`.toLocaleLowerCase("es").includes(normalizedSearch);
  const eligibleStudents = accounts.filter((account) => account.role === "student" && account.active && account.teacherIds.includes(profile.uid) && studentCanTakeSubject(account, activeSubject) && matchesSearch({ studentName: account.name, studentGrade: account.grade, studentGroup: account.group }));
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

  async function removeReport() {
    if (!reportToDelete) return;
    setDeleting(true);
    try {
      await deleteStudentWeeklyReport(reportToDelete);
      toast.success(`Reporte de ${reportToDelete.studentName} eliminado`);
      setReportToDelete(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos eliminar el reporte.");
    } finally {
      setDeleting(false);
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
    {loading ? <SectionOrbLoader label="Construyendo los reportes…" detail="Estamos reuniendo calificaciones y evidencias de la semana." tone="mint" /> : profile.role === "teacher" ? (
      <div className="report-editor-list">{!pagedStudents.length ? <div className="report-empty"><Search size={27} /><h3>No encontramos alumnos</h3><p>Revisa la materia seleccionada o ajusta la búsqueda.</p></div> : pagedStudents.map((student) => {
        const grade = weekSubjectGrades.find((item) => item.studentId === student.uid && item.teacherId === profile.uid);
        const report = reports.find((item) => item.weekId === week?.id && subjectsMatch(item.subject, activeSubject) && item.studentId === student.uid && item.teacherId === profile.uid);
        return <div id={report ? `report-${report.id}` : undefined} key={`${week?.id}-${activeSubject}-${student.uid}-${report?.updatedAt ?? "new"}`}><ReportEditor student={student} grade={grade} report={report} view={report ? reportViews.find((item) => item.reportId === report.id) : undefined} onSave={persist} onDelete={setReportToDelete} /></div>;
      })}</div>
    ) : <div className="published-report-list">{!pagedReports.length ? <div className="report-empty"><FileText size={27} /><h3>No hay reportes en esta selección</h3><p>Prueba otra semana, materia o búsqueda.</p></div> : pagedReports.map((report) => <PublishedReportCard key={report.id} report={report} student={accounts.find((account) => account.uid === report.studentId)} grade={weeklyGrades.find((grade) => grade.weekId === report.weekId && grade.subjectId === report.subjectId && grade.studentId === report.studentId && grade.teacherId === report.teacherId)} view={reportViews.find((item) => item.reportId === report.id)} studentMode={profile.role === "student"} expanded={profile.role !== "student" || openReportId === report.id} onToggle={profile.role === "student" ? toggleStudentReport : undefined} onEdit={profile.role === "director" ? setReportToEdit : undefined} onDelete={profile.role === "director" ? setReportToDelete : undefined} />)}</div>}
    <Pagination page={page} total={total} onChange={setPage} />
    <ConfirmDeleteDialog
      open={Boolean(reportToDelete)}
      title={`¿Eliminar el reporte de ${reportToDelete?.studentName ?? "este alumno"}?`}
      description={`Se eliminará el reporte de ${reportToDelete?.subject ?? "la materia"} para ${reportToDelete?.weekLabel ?? "esta semana"}. Las calificaciones originales no se borrarán. Esta acción no se puede deshacer.`}
      confirmLabel="Eliminar reporte"
      busy={deleting}
      onCancel={() => setReportToDelete(null)}
      onConfirm={() => void removeReport()}
    />
    {reportToEdit && <ReportEditDialog report={reportToEdit} onCancel={() => setReportToEdit(null)} />}
  </section>;
}

function ReportEditDialog({ report, onCancel }: { report: StudentWeeklyReport; onCancel: () => void }) {
  const [achievement, setAchievement] = useState(report.achievement);
  const [supportArea, setSupportArea] = useState(report.supportArea);
  const [nextStep, setNextStep] = useState(report.nextStep);
  const [status, setStatus] = useState(report.status);
  const [busy, setBusy] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await updateStudentWeeklyReport(report, { achievement: achievement.trim(), supportArea: supportArea.trim(), nextStep: nextStep.trim(), status });
      toast.success("Reporte actualizado");
      onCancel();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos actualizar el reporte.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ContentEditDialog open eyebrow="Reporte semanal" title={`Editar reporte de ${report.studentName}`} description={`${report.subject} · ${report.weekLabel}`} note="Las calificaciones y la identidad del docente se conservan como evidencia del reporte." busy={busy} onCancel={onCancel} onSubmit={save}>
      <label>Logro para reconocer<textarea value={achievement} minLength={3} maxLength={600} required onChange={(event) => setAchievement(event.target.value)} /></label>
      <label>Área de acompañamiento<textarea value={supportArea} minLength={3} maxLength={600} required onChange={(event) => setSupportArea(event.target.value)} /></label>
      <label>Próximo paso<textarea value={nextStep} minLength={3} maxLength={600} required onChange={(event) => setNextStep(event.target.value)} /></label>
      <label>Estado<select value={status} onChange={(event) => setStatus(event.target.value as StudentWeeklyReport["status"])}><option value="draft">Borrador</option><option value="published">Publicado</option></select></label>
    </ContentEditDialog>
  );
}
