"use client";

import {
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardPenLine,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
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
        <span><strong>{student.name}</strong><small>{student.grade} {student.group}</small></span>
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
          {saving ? "Guardando…" : record ? "Actualizar" : "Guardar"}
        </button>
      </div>
    </motion.div>
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
  const visibleRecords = records.filter((record) => (
    record.schoolYearId === academicConfig.schoolYearId &&
    record.weekId === activeWeekId &&
    (profile.role !== "student" || record.studentId === profile.uid)
  ));
  const eligibleStudents = accounts.filter((account) => (
    account.role === "student" &&
    account.active &&
    account.teacherIds.includes(profile.uid) &&
    account.subjects.includes(activeSubject)
  ));

  if (profile.role === "director") return null;

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
          <span className="eyebrow">Calificaciones</span>
          <h2>{profile.role === "teacher" ? "Captura semanal" : "Así va tu semana"}</h2>
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

      {loading ? (
        <div className="grade-loading"><span /><span /><span /></div>
      ) : profile.role === "student" ? (
        <AnimatePresence mode="wait">
          <motion.div
            key={activeWeekId}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
          >
            <StudentGrades records={visibleRecords} selectedWeek={selectedWeek} />
          </motion.div>
        </AnimatePresence>
      ) : (
        <div className="teacher-grades-workspace">
          <div className="teacher-grade-toolbar">
            <label>
              <span>Materia asignada</span>
              <select value={activeSubject} onChange={(event) => setSelectedSubject(event.target.value)}>
                {subjects.map((subject) => <option key={subject}>{subject}</option>)}
              </select>
            </label>
            <div className="teacher-weight-preview">
              <Sparkles size={17} />
              <span>
                {GRADING_CRITERIA.map((criterion) => (
                  <small key={criterion.key}>{criterion.shortLabel} {config.weights[criterion.key]}%</small>
                ))}
              </span>
            </div>
          </div>
          {!subjects.length ? (
            <div className="grade-empty-state"><h3>No tienes materias asignadas</h3><p>Dirección debe actualizar tu perfil antes de capturar calificaciones.</p></div>
          ) : !eligibleStudents.length ? (
            <div className="grade-empty-state"><h3>No hay alumnos asignados</h3><p>Revisa en Comunidad que los alumnos tengan esta materia y tu asignación docente.</p></div>
          ) : (
            <div className="grade-roster">
              <div className="grade-roster-header">
                <span>Alumno</span><span>Rubros de 0 a 100</span><span>Resultado</span>
              </div>
              {eligibleStudents.map((student) => (
                <GradeEditorRow
                  key={`${activeWeekId}-${activeSubject}-${student.uid}-${visibleRecords.find((record) => record.studentId === student.uid && record.subject === activeSubject && record.teacherId === profile.uid)?.updatedAt ?? "new"}`}
                  student={student}
                  weights={config.weights}
                  record={visibleRecords.find((record) => (
                    record.studentId === student.uid &&
                    record.subject === activeSubject &&
                    record.teacherId === profile.uid
                  ))}
                  onSave={persistGrade}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
