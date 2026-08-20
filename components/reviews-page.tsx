"use client";

import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  Download,
  FileQuestion,
  FileText,
  Gauge,
  ListChecks,
  LoaderCircle,
  LockKeyhole,
  Paperclip,
  Plus,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  Users,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { friendlyFirebaseError } from "@/lib/firebase";
import {
  getWeeklyReviewAttachmentUrl,
  restartWeeklyReview,
  saveWeeklyReviewProgress,
  submitWeeklyReview,
  updateWeeklyReviewStatus,
  watchWeeklyReviewAttempts,
} from "@/lib/reviews-firebase";
import type {
  AcademicCalendar,
  AcademicConfig,
  ManagedAccount,
  UserProfile,
  WeeklyReview,
  WeeklyReviewAttempt,
  WeeklyReviewCreateInput,
  WeeklyReviewQuestionInput,
  WeeklyReviewQuestionType,
  WeeklyReviewStatus,
} from "@/lib/types";

const REVIEWS_PAGE_SIZE = 6;

const questionTypeMeta: Record<
  WeeklyReviewQuestionType,
  { label: string; detail: string }
> = {
  multiple_choice: {
    label: "Opción múltiple",
    detail: "Una respuesta correcta",
  },
  true_false: { label: "Verdadero o falso", detail: "Comprobación rápida" },
  reflection: { label: "Respuesta reflexiva", detail: "Explica con tus palabras" },
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function groupOf(account: ManagedAccount) {
  return `${account.grade ?? ""} ${account.group ?? ""}`.trim();
}

function studentReviewState(review: WeeklyReview) {
  if (review.myAttempt?.status === "completed") return "completed";
  if (review.myAttempt) return "in_progress";
  return "pending";
}

function attemptLimitLabel(maxAttempts: number) {
  if (maxAttempts === 0) return "Intentos ilimitados";
  return `${maxAttempts} intento${maxAttempts === 1 ? "" : "s"}`;
}

export function ReviewsPage({
  reviews,
  loading,
  profile,
  calendar,
  accounts,
  firebaseReady,
  onDemoReviewChange,
}: {
  reviews: WeeklyReview[];
  loading: boolean;
  profile: UserProfile;
  calendar: AcademicCalendar;
  accounts: ManagedAccount[];
  firebaseReady: boolean;
  onDemoReviewChange: (review: WeeklyReview) => void;
}) {
  const [search, setSearch] = useState("");
  const [week, setWeek] = useState("all");
  const [subject, setSubject] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const weeks = useMemo(() => {
    const fromReviews = new Map(reviews.map((item) => [item.weekId, item.weekLabel]));
    calendar.weeks.forEach((item) => fromReviews.set(item.id, item.label));
    return [...fromReviews.entries()];
  }, [calendar.weeks, reviews]);
  const subjects = useMemo(
    () =>
      [...new Set(reviews.map((item) => item.subject))].sort((a, b) =>
        a.localeCompare(b, "es"),
      ),
    [reviews],
  );
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es");
    return reviews.filter((review) => {
      const haystack = [
        review.title,
        review.description,
        review.subject,
        review.weekLabel,
        review.createdByName,
      ]
        .join(" ")
        .toLocaleLowerCase("es");
      const reviewState =
        profile.role === "student" ? studentReviewState(review) : review.status;
      return (
        (!term || haystack.includes(term)) &&
        (week === "all" || review.weekId === week) &&
        (subject === "all" || review.subject === subject) &&
        (status === "all" || reviewState === status)
      );
    });
  }, [profile.role, reviews, search, status, subject, week]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / REVIEWS_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice(
    (currentPage - 1) * REVIEWS_PAGE_SIZE,
    currentPage * REVIEWS_PAGE_SIZE,
  );
  const completed = reviews.filter(
    (review) => review.myAttempt?.status === "completed",
  ).length;
  const totalCompleted = reviews.reduce(
    (sum, review) => sum + review.completedCount,
    0,
  );
  const totalAudience = reviews.reduce((sum, review) => sum + review.audienceCount, 0);
  const selected = reviews.find((review) => review.id === selectedId) ?? null;

  return (
    <div className="reviews-workspace">
      <section className="reviews-hero">
        <div className="reviews-hero-copy">
          <span className="reviews-kicker">
            <Sparkles size={15} /> Repaso semanal
          </span>
          <h2>
            {profile.role === "student"
              ? "Practica un poco, aprende mucho."
              : "Prácticas breves con avance visible."}
          </h2>
          <p>
            {profile.role === "student"
              ? "Responde a tu ritmo, guarda tu avance y descubre cuánto recuerdas de cada materia."
              : "Crea experiencias por materia y semana; identifica quién terminó y quién necesita acompañamiento."}
          </p>
        </div>
        <div className="reviews-hero-stat">
          <span>
            <BookOpenCheck size={22} />
          </span>
          <div>
            <strong>
              {profile.role === "student"
                ? `${completed} de ${reviews.length}`
                : `${totalCompleted} de ${totalAudience}`}
            </strong>
            <small>
              {profile.role === "student" ? "repasos completados" : "entregas completadas"}
            </small>
          </div>
          <i
            style={{
              "--review-progress": `${
                profile.role === "student"
                  ? reviews.length
                    ? Math.round((completed / reviews.length) * 100)
                    : 0
                  : totalAudience
                    ? Math.round((totalCompleted / totalAudience) * 100)
                    : 0
              }%`,
            } as React.CSSProperties}
          />
        </div>
      </section>

      <section className="reviews-toolbar" aria-label="Filtros de repasos">
        <label className="reviews-search">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Buscar por título, materia o docente…"
            aria-label="Buscar repasos"
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setPage(1);
              }}
              aria-label="Limpiar búsqueda"
            >
              <X size={15} />
            </button>
          )}
        </label>
        <select
          value={week}
          onChange={(event) => {
            setWeek(event.target.value);
            setPage(1);
          }}
          aria-label="Filtrar por semana"
        >
          <option value="all">Todas las semanas</option>
          {weeks.map(([id, label]) => (
            <option value={id} key={id}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={subject}
          onChange={(event) => {
            setSubject(event.target.value);
            setPage(1);
          }}
          aria-label="Filtrar por materia"
        >
          <option value="all">Todas las materias</option>
          {subjects.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          aria-label="Filtrar por estado"
        >
          <option value="all">Todos los estados</option>
          {profile.role === "student" ? (
            <>
              <option value="pending">Pendientes</option>
              <option value="in_progress">En progreso</option>
              <option value="completed">Completados</option>
            </>
          ) : (
            <>
              <option value="draft">Borradores</option>
              <option value="published">Publicados</option>
              <option value="closed">Cerrados</option>
            </>
          )}
        </select>
      </section>

      <div className="reviews-results-heading">
        <div>
          <strong>{filtered.length} repasos</strong>
          <span>Organizados por las semanas configuradas por Dirección</span>
        </div>
        {profile.role === "student" && reviews.some((review) => review.myAttempt) && (
          <span className="reviews-saved-note">
            <ShieldCheck size={14} /> Tu avance se guarda en Firebase
          </span>
        )}
      </div>

      {loading ? (
        <section className="reviews-grid" aria-label="Cargando repasos">
          {Array.from({ length: 6 }, (_, index) => (
            <article className="review-modern-card review-skeleton" key={index} />
          ))}
        </section>
      ) : visible.length ? (
        <section className="reviews-grid">
          {visible.map((review, index) => {
            const attempt = review.myAttempt;
            const progress =
              profile.role === "student"
                ? attempt?.progress ?? 0
                : review.audienceCount
                  ? Math.round((review.completedCount / review.audienceCount) * 100)
                  : 0;
            const state = profile.role === "student" ? studentReviewState(review) : review.status;
            return (
              <motion.article
                className={`review-modern-card is-${state}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.035 }}
                key={review.id}
              >
                <header>
                  <span className="review-card-icon">
                    <FileQuestion size={21} />
                  </span>
                  <div>
                    <small>{review.weekLabel}</small>
                    <strong>{review.subject}</strong>
                  </div>
                  <span className={`review-status is-${state}`}>
                    {state === "completed"
                      ? "Completado"
                      : state === "in_progress"
                        ? "En progreso"
                        : state === "pending"
                          ? "Pendiente"
                          : state === "published"
                            ? "Publicado"
                            : state === "closed"
                              ? "Cerrado"
                              : "Borrador"}
                  </span>
                </header>
                <div className="review-card-copy">
                  <h3>{review.title}</h3>
                  <p>{review.description || "Práctica breve para reforzar lo aprendido."}</p>
                </div>
                <div className="review-card-facts">
                  <span>
                    <ListChecks size={13} /> {review.questions.length} reactivos
                  </span>
                  <span>
                    <Clock3 size={13} /> {review.duration} min
                  </span>
                  <span>
                    <RotateCcw size={13} /> {attemptLimitLabel(review.maxAttempts)}
                  </span>
                </div>
                <div className="review-card-progress">
                  <div>
                    <span>{profile.role === "student" ? "Tu avance" : "Completado por el grupo"}</span>
                    <strong>{progress}%</strong>
                  </div>
                  <i>
                    <span style={{ width: `${progress}%` }} />
                  </i>
                </div>
                <footer>
                  <span>
                    {profile.role === "student" && attempt?.status === "completed"
                      ? `Resultado: ${attempt.scorePercent ?? 0}%`
                      : profile.role === "student"
                        ? `${attempt?.answeredCount ?? 0} respuestas guardadas`
                        : `${review.completedCount} de ${review.audienceCount} alumnos`}
                  </span>
                  <button className="secondary-button" onClick={() => setSelectedId(review.id)}>
                    {profile.role === "student"
                      ? review.status === "closed" && attempt?.status !== "completed"
                        ? "Ver estado"
                        : attempt?.status === "completed"
                        ? "Ver resultado"
                        : attempt
                          ? "Continuar"
                          : "Comenzar"
                      : "Ver avance"}
                    <ArrowRight size={15} />
                  </button>
                </footer>
              </motion.article>
            );
          })}
        </section>
      ) : (
        <section className="reviews-empty">
          <span>
            <BookOpenCheck size={28} />
          </span>
          <h2>No encontramos repasos</h2>
          <p>Ajusta los filtros o crea un repaso para una semana académica.</p>
          {(search || week !== "all" || subject !== "all" || status !== "all") && (
            <button
              className="secondary-button"
              onClick={() => {
                setSearch("");
                setWeek("all");
                setSubject("all");
                setStatus("all");
              }}
            >
              Limpiar filtros
            </button>
          )}
        </section>
      )}

      {pageCount > 1 && (
        <nav className="reviews-pagination" aria-label="Paginación de repasos">
          <button
            className="secondary-button"
            disabled={currentPage === 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            <ChevronLeft size={15} /> Anterior
          </button>
          <span>
            Página <strong>{currentPage}</strong> de {pageCount}
          </span>
          <button
            className="secondary-button"
            disabled={currentPage === pageCount}
            onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
          >
            Siguiente <ChevronRight size={15} />
          </button>
        </nav>
      )}

      <AnimatePresence>
        {selected && profile.role === "student" && (
          <StudentReviewModal
            review={selected}
            firebaseReady={firebaseReady}
            onClose={() => setSelectedId(null)}
            onDemoChange={onDemoReviewChange}
          />
        )}
        {selected && profile.role !== "student" && (
          <StaffReviewModal
            review={selected}
            accounts={accounts}
            firebaseReady={firebaseReady}
            onClose={() => setSelectedId(null)}
            onDemoChange={onDemoReviewChange}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function StudentReviewModal({
  review,
  firebaseReady,
  onClose,
  onDemoChange,
}: {
  review: WeeklyReview;
  firebaseReady: boolean;
  onClose: () => void;
  onDemoChange: (review: WeeklyReview) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(
    review.myAttempt?.answers ?? {},
  );
  const [current, setCurrent] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [error, setError] = useState("");
  const [resourceUrls, setResourceUrls] = useState<Record<string, string>>({});
  const completed = review.myAttempt?.status === "completed";
  const closed = review.status === "closed" && !completed;
  const answeredCount = review.questions.filter((question) =>
    answers[question.id]?.trim(),
  ).length;
  const allAnswered = answeredCount === review.questions.length;
  const question = review.questions[current];
  const canRetry = Boolean(
    review.myAttempt &&
      review.status === "published" &&
      (review.maxAttempts === 0 ||
        review.myAttempt.attemptNumber < review.maxAttempts),
  );

  useEffect(() => {
    if (!review.attachments.length) return;
    let active = true;
    void Promise.all(
      review.attachments.map(async (attachment) => [
        attachment.id,
        await getWeeklyReviewAttachmentUrl(attachment),
      ] as const),
    )
      .then((entries) => {
        if (active) setResourceUrls(Object.fromEntries(entries));
      })
      .catch((loadError) => {
        if (active) setError(friendlyFirebaseError(loadError));
      });
    return () => {
      active = false;
    };
  }, [review.attachments]);

  useEffect(() => {
    if (!dirty || completed || closed) return;
    const timer = window.setTimeout(() => {
      if (firebaseReady) {
        setSaving(true);
        void saveWeeklyReviewProgress(review, answers)
          .then(() => setDirty(false))
          .catch((saveError) => setError(friendlyFirebaseError(saveError)))
          .finally(() => setSaving(false));
      } else {
        const progress = review.questions.length
          ? Math.round((answeredCount / review.questions.length) * 100)
          : 0;
        onDemoChange({
          ...review,
          startedCount: Math.max(1, review.startedCount),
          myAttempt: {
            id: "demo-student",
            reviewId: review.id,
            studentId: "demo-student",
            studentName: "Alumno demo",
            answers,
            answeredCount,
            progress,
            status: "in_progress",
            attemptNumber: review.myAttempt?.attemptNumber ?? 1,
            startedAt: review.myAttempt?.startedAt ?? new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        });
        setDirty(false);
      }
    }, 650);
    return () => window.clearTimeout(timer);
  }, [answeredCount, answers, closed, completed, dirty, firebaseReady, onDemoChange, review]);

  function answer(value: string) {
    setAnswers((currentAnswers) => ({
      ...currentAnswers,
      [question.id]: value,
    }));
    setDirty(true);
    setError("");
  }

  async function submit() {
    if (!allAnswered) {
      setError("Responde todos los reactivos antes de finalizar.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const result = await submitWeeklyReview(review, answers);
      if (!firebaseReady) {
        onDemoChange({
          ...review,
          completedCount: Math.max(1, review.completedCount),
          startedCount: Math.max(1, review.startedCount),
          myAttempt: {
            id: "demo-student",
            reviewId: review.id,
            studentId: "demo-student",
            studentName: "Alumno demo",
            answers,
            answeredCount,
            progress: 100,
            status: "completed",
            score: review.questions.filter((item) => item.type !== "reflection").length,
            maxScore: review.questions.filter((item) => item.type !== "reflection").length,
            scorePercent: result.scorePercent,
            attemptNumber: review.myAttempt?.attemptNumber ?? 1,
            startedAt: review.myAttempt?.startedAt ?? new Date().toISOString(),
            completedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        });
      }
      toast.success("¡Repaso completado!", {
        description: `Resultado: ${result.scorePercent}%`,
      });
    } catch (submitError) {
      setError(friendlyFirebaseError(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  async function restart() {
    setRestarting(true);
    setError("");
    try {
      await restartWeeklyReview(review);
      const attemptNumber = (review.myAttempt?.attemptNumber ?? 1) + 1;
      setAnswers({});
      setCurrent(0);
      if (!firebaseReady) {
        onDemoChange({
          ...review,
          completedCount: Math.max(0, review.completedCount - 1),
          myAttempt: {
            id: "demo-student",
            reviewId: review.id,
            studentId: "demo-student",
            studentName: "Alumno demo",
            answers: {},
            answeredCount: 0,
            progress: 0,
            status: "in_progress",
            attemptNumber,
            startedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        });
      }
      toast.success(`Intento ${attemptNumber} listo`);
    } catch (restartError) {
      setError(friendlyFirebaseError(restartError));
    } finally {
      setRestarting(false);
    }
  }

  return (
    <motion.div
      className="review-player-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <motion.section
        className="review-player"
        initial={{ opacity: 0, y: 18, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.985 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-player-title"
      >
        <header>
          <div className="review-player-heading">
            <span>
              <BookOpenCheck size={22} />
            </span>
            <div>
              <small>{review.subject} · {review.weekLabel}</small>
              <h2 id="review-player-title">{review.title}</h2>
            </div>
          </div>
          <div className="review-save-state">
            {saving ? <LoaderCircle className="spin" size={14} /> : <ShieldCheck size={14} />}
            {saving ? "Guardando…" : "Avance protegido"}
          </div>
          <button className="plain-icon" onClick={onClose} aria-label="Cerrar repaso">
            <X size={19} />
          </button>
        </header>

        {completed ? (
          <div className="review-result">
            <span className="review-result-icon">
              <CheckCircle2 size={34} />
            </span>
            <small>Repaso completado</small>
            <h3>{review.myAttempt?.scorePercent ?? 0}%</h3>
            <p>
              Completaste {review.questions.length} reactivos en tu intento {review.myAttempt?.attemptNumber ?? 1}.
            </p>
            <div className="review-result-facts">
              <span><Gauge size={16} /><div><small>Puntaje</small><strong>{review.myAttempt?.score ?? 0} de {review.myAttempt?.maxScore ?? 0}</strong></div></span>
              <span><CalendarDays size={16} /><div><small>Finalizado</small><strong>{formatDateTime(review.myAttempt?.completedAt ?? review.myAttempt?.updatedAt ?? new Date().toISOString())}</strong></div></span>
            </div>
            {review.myAttempt && canRetry && (
              <button className="secondary-button" onClick={() => void restart()} disabled={restarting}>
                {restarting ? <LoaderCircle className="spin" size={15} /> : <RotateCcw size={15} />}
                {review.maxAttempts === 0
                  ? "Intentar de nuevo · sin límite"
                  : `Intentar de nuevo (${review.maxAttempts - review.myAttempt.attemptNumber} disponible${review.maxAttempts - review.myAttempt.attemptNumber === 1 ? "" : "s"})`}
              </button>
            )}
            <button className="primary-button" onClick={onClose}>Volver a repasos</button>
          </div>
        ) : closed ? (
          <div className="review-result is-closed">
            <span className="review-result-icon">
              <LockKeyhole size={34} />
            </span>
            <small>Repaso cerrado</small>
            <h3>{review.myAttempt?.progress ?? 0}%</h3>
            <p>
              El docente cerró este repaso. Conservamos las respuestas que alcanzaste a guardar para dar seguimiento a tu avance.
            </p>
            <button className="primary-button" onClick={onClose}>Volver a repasos</button>
          </div>
        ) : (
          <div className="review-player-layout">
            <aside>
              <div className="review-player-progress">
                <span>{answeredCount} de {review.questions.length} respondidos</span>
                <strong>{review.questions.length ? Math.round((answeredCount / review.questions.length) * 100) : 0}%</strong>
                <i><span style={{ width: `${review.questions.length ? Math.round((answeredCount / review.questions.length) * 100) : 0}%` }} /></i>
              </div>
              <nav aria-label="Preguntas del repaso">
                {review.questions.map((item, index) => (
                  <button
                    className={`${index === current ? "active" : ""} ${answers[item.id]?.trim() ? "answered" : ""}`}
                    onClick={() => setCurrent(index)}
                    key={item.id}
                  >
                    {answers[item.id]?.trim() ? <Check size={13} /> : index + 1}
                    <span>{questionTypeMeta[item.type].label}</span>
                  </button>
                ))}
              </nav>
              {review.attachments.length > 0 && (
                <div className="review-resources">
                  <small>Material de apoyo</small>
                  {review.attachments.map((attachment) => (
                    <a
                      href={resourceUrls[attachment.id]}
                      target="_blank"
                      rel="noreferrer"
                      aria-disabled={!resourceUrls[attachment.id]}
                      key={attachment.id}
                    >
                      <Paperclip size={14} />
                      <span>{attachment.name}</span>
                      <Download size={13} />
                    </a>
                  ))}
                </div>
              )}
            </aside>
            <main>
              {question && (
                <motion.div
                  className="review-question"
                  key={question.id}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                >
                  <div className="review-question-meta">
                    <span>Pregunta {current + 1}</span>
                    <small>{questionTypeMeta[question.type].label}</small>
                  </div>
                  <h3>{question.prompt}</h3>
                  {question.type === "reflection" ? (
                    <label className="review-reflection-answer">
                      Tu respuesta
                      <textarea
                        value={answers[question.id] ?? ""}
                        onChange={(event) => answer(event.target.value)}
                        placeholder="Explica con tus palabras…"
                        maxLength={800}
                        rows={7}
                        autoFocus
                      />
                      <small>{(answers[question.id] ?? "").length}/800</small>
                    </label>
                  ) : (
                    <div className="review-answer-options">
                      {question.options.map((option) => (
                        <button
                          className={answers[question.id] === option.id ? "selected" : ""}
                          onClick={() => answer(option.id)}
                          key={option.id}
                        >
                          <i>{answers[question.id] === option.id ? <Check size={15} /> : <Circle size={14} />}</i>
                          <span>{option.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
              {error && <p className="review-inline-error">{error}</p>}
              <footer>
                <button className="secondary-button" disabled={current === 0} onClick={() => setCurrent((value) => value - 1)}>
                  <ArrowLeft size={15} /> Anterior
                </button>
                {current < review.questions.length - 1 ? (
                  <button className="primary-button" onClick={() => setCurrent((value) => value + 1)}>
                    Siguiente <ArrowRight size={15} />
                  </button>
                ) : (
                  <button className="primary-button" disabled={submitting || !allAnswered} onClick={() => void submit()}>
                    {submitting ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />}
                    {submitting ? "Calificando…" : "Finalizar repaso"}
                  </button>
                )}
              </footer>
            </main>
          </div>
        )}
      </motion.section>
    </motion.div>
  );
}

function StaffReviewModal({
  review,
  accounts,
  firebaseReady,
  onClose,
  onDemoChange,
}: {
  review: WeeklyReview;
  accounts: ManagedAccount[];
  firebaseReady: boolean;
  onClose: () => void;
  onDemoChange: (review: WeeklyReview) => void;
}) {
  const [attempts, setAttempts] = useState<WeeklyReviewAttempt[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    return watchWeeklyReviewAttempts(
      review,
      setAttempts,
      (watchError) => setError(friendlyFirebaseError(watchError)),
    );
  }, [review]);

  const attemptsByStudent = new Map(attempts.map((attempt) => [attempt.studentId, attempt]));
  const audience = accounts
    .filter((account) => review.audienceStudentIds.includes(account.uid))
    .map((account) => ({
      id: account.uid,
      name: account.name,
      initials: account.initials,
      group: groupOf(account),
      attempt: attemptsByStudent.get(account.uid),
    }));
  attempts.forEach((attempt) => {
    if (!audience.some((student) => student.id === attempt.studentId)) {
      audience.push({
        id: attempt.studentId,
        name: attempt.studentName,
        initials: attempt.studentName.split(" ").map((part) => part[0]).join("").slice(0, 2),
        group: "",
        attempt,
      });
    }
  });
  const filtered = audience
    .filter((student) => student.name.toLocaleLowerCase("es").includes(search.trim().toLocaleLowerCase("es")))
    .sort((first, second) => {
      const rank = (attempt?: WeeklyReviewAttempt) => attempt?.status === "completed" ? 2 : attempt ? 1 : 0;
      return rank(first.attempt) - rank(second.attempt) || first.name.localeCompare(second.name, "es");
    });
  const completed = audience.filter((student) => student.attempt?.status === "completed").length || review.completedCount;
  const started = audience.filter((student) => student.attempt).length || review.startedCount;
  const denominator = audience.length || review.audienceCount;

  async function changeStatus(status: WeeklyReviewStatus) {
    setBusy(true);
    setError("");
    try {
      await updateWeeklyReviewStatus(review, status);
      if (!firebaseReady) {
        onDemoChange({
          ...review,
          status,
          updatedAt: new Date().toISOString(),
          publishedAt: status === "published" ? new Date().toISOString() : review.publishedAt,
          closedAt: status === "closed" ? new Date().toISOString() : undefined,
        });
      }
      toast.success(status === "published" ? "Repaso publicado" : status === "closed" ? "Repaso cerrado" : "Repaso guardado como borrador");
    } catch (statusError) {
      setError(friendlyFirebaseError(statusError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div className="review-player-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <motion.section className="review-staff-modal" initial={{ opacity: 0, y: 18, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.985 }} role="dialog" aria-modal="true" aria-labelledby="review-staff-title">
        <header>
          <div className="review-player-heading"><span><BarChart3 size={22} /></span><div><small>{review.subject} · {review.weekLabel}</small><h2 id="review-staff-title">{review.title}</h2></div></div>
          <span className={`review-status is-${review.status}`}>{review.status === "published" ? "Publicado" : review.status === "closed" ? "Cerrado" : "Borrador"}</span>
          <button className="plain-icon" onClick={onClose} disabled={busy} aria-label="Cerrar"><X size={19} /></button>
        </header>
        <div className="review-staff-layout">
          <main>
            <div className="review-staff-summary">
              <span><CheckCircle2 size={19} /><div><small>Completaron</small><strong>{completed} de {denominator}</strong></div></span>
              <span><Gauge size={19} /><div><small>En progreso</small><strong>{Math.max(0, started - completed)}</strong></div></span>
              <span><Clock3 size={19} /><div><small>Sin comenzar</small><strong>{Math.max(0, denominator - started)}</strong></div></span>
            </div>
            <label className="review-student-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar alumno…" /></label>
            <div className="review-student-table">
              <div className="review-student-table-head"><span>Alumno</span><span>Avance</span><span>Resultado</span><span>Estado</span></div>
              {filtered.map((student) => {
                const attempt = student.attempt;
                return <div className="review-student-row" key={student.id}><span className="review-student-name"><i>{student.initials}</i><div><strong>{student.name}</strong><small>{student.group || "Alumno asignado"}</small></div></span><span><i className="review-mini-progress"><b style={{ width: `${attempt?.progress ?? 0}%` }} /></i><small>{attempt?.progress ?? 0}%</small></span><span>{attempt?.status === "completed" ? <strong>{attempt.scorePercent ?? 0}%</strong> : <small>—</small>}</span><span className={`review-status is-${attempt?.status ?? "pending"}`}>{attempt?.status === "completed" ? "Completado" : attempt ? "En progreso" : "Pendiente"}</span></div>;
              })}
              {!filtered.length && <p className="review-no-students">Aún no hay alumnos visibles para este repaso.</p>}
            </div>
          </main>
          <aside>
            <section className="review-staff-details">
              <small>Configuración</small>
              <h3>Vista del repaso</h3>
              <p>{review.description || "Sin descripción adicional."}</p>
              <div><span><ListChecks size={14} /> {review.questions.length} reactivos</span><span><Clock3 size={14} /> {review.duration} min</span><span><RotateCcw size={14} /> {attemptLimitLabel(review.maxAttempts)}</span></div>
            </section>
            <section className="review-question-preview">
              <small>Reactivos</small>
              {review.questions.map((question, index) => <div key={question.id}><i>{index + 1}</i><span><strong>{question.prompt}</strong><small>{questionTypeMeta[question.type].label}</small></span></div>)}
            </section>
            {error && <p className="review-inline-error">{error}</p>}
            <div className="review-status-actions">
              {review.status === "draft" && <button className="primary-button" disabled={busy} onClick={() => void changeStatus("published")}><Send size={15} /> Publicar repaso</button>}
              {review.status === "published" && <button className="secondary-button" disabled={busy} onClick={() => void changeStatus("closed")}><LockKeyhole size={15} /> Cerrar repaso</button>}
              {review.status === "closed" && <button className="primary-button" disabled={busy} onClick={() => void changeStatus("published")}><RotateCcw size={15} /> Reabrir repaso</button>}
            </div>
          </aside>
        </div>
      </motion.section>
    </motion.div>
  );
}

function newChoiceQuestion(): WeeklyReviewQuestionInput {
  const options = Array.from({ length: 4 }, () => ({
    id: crypto.randomUUID(),
    label: "",
  }));
  return {
    id: crypto.randomUUID(),
    type: "multiple_choice",
    prompt: "",
    options,
    correctAnswer: options[0].id,
    points: 1,
  };
}

function changeQuestionType(
  question: WeeklyReviewQuestionInput,
  type: WeeklyReviewQuestionType,
): WeeklyReviewQuestionInput {
  if (type === "multiple_choice") return { ...newChoiceQuestion(), id: question.id, prompt: question.prompt };
  if (type === "true_false") {
    return {
      ...question,
      type,
      options: [
        { id: "true", label: "Verdadero" },
        { id: "false", label: "Falso" },
      ],
      correctAnswer: "true",
      points: 1,
    };
  }
  return { ...question, type, options: [], correctAnswer: "", points: 0 };
}

export function ReviewCreateModal({
  profile,
  config,
  calendar,
  accounts,
  onClose,
  onCreate,
}: {
  profile: UserProfile;
  config: AcademicConfig;
  calendar: AcademicCalendar;
  accounts: ManagedAccount[];
  onClose: () => void;
  onCreate: (input: WeeklyReviewCreateInput) => Promise<void>;
}) {
  const subjectOptions = useMemo(() => {
    const source = profile.role === "teacher"
      ? profile.subjects ?? []
      : accounts.flatMap((account) => account.role === "student" ? account.subjects : []);
    return [...new Set(source)].sort((first, second) => first.localeCompare(second, "es"));
  }, [accounts, profile.role, profile.subjects]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subject, setSubject] = useState(subjectOptions[0] ?? "General");
  const [weekId, setWeekId] = useState(config.weekId || calendar.weeks[0]?.id || "");
  const [duration, setDuration] = useState(10);
  const [maxAttempts, setMaxAttempts] = useState(2);
  const [status, setStatus] = useState<"draft" | "published">("published");
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [questions, setQuestions] = useState<WeeklyReviewQuestionInput[]>([newChoiceQuestion()]);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const compatibleStudents = useMemo(
    () => accounts.filter((account) => account.role === "student" && account.active && account.subjects.includes(subject) && (profile.role === "director" || account.teacherIds.includes(profile.uid))),
    [accounts, profile.role, profile.uid, subject],
  );
  const groups = useMemo(
    () => [...new Set(compatibleStudents.map(groupOf).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es", { numeric: true })),
    [compatibleStudents],
  );
  const recipients = compatibleStudents.filter((student) => selectedGroups.length === 0 || selectedGroups.includes(groupOf(student)));

  function updateQuestion(id: string, update: (question: WeeklyReviewQuestionInput) => WeeklyReviewQuestionInput) {
    setQuestions((current) => current.map((question) => question.id === id ? update(question) : question));
  }

  function selectFiles(selected: FileList | null) {
    if (!selected) return;
    const next = Array.from(selected);
    const oversized = next.find((file) => file.size >= 20 * 1024 * 1024);
    if (oversized) {
      setError(`${oversized.name} supera el límite de 20 MB.`);
      return;
    }
    setFiles((current) => [...current, ...next].slice(0, 3));
    setError("");
  }

  function validate() {
    if (!recipients.length) return "No hay alumnos compatibles en los grupos seleccionados.";
    if (!questions.length) return "Agrega al menos un reactivo.";
    const invalidIndex = questions.findIndex((question) => {
      if (question.prompt.trim().length < 5) return true;
      if (question.type === "multiple_choice") {
        return question.options.some((option) => option.label.trim().length < 1) || !question.options.some((option) => option.id === question.correctAnswer);
      }
      return question.type === "true_false" && !["true", "false"].includes(question.correctAnswer);
    });
    return invalidIndex >= 0 ? `Revisa el reactivo ${invalidIndex + 1} y su respuesta correcta.` : "";
  }

  return (
    <motion.div className="review-create-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) onClose(); }}>
      <motion.form className="review-create-modal" initial={{ opacity: 0, y: 18, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.985 }} onSubmit={async (event) => {
        event.preventDefault();
        const validationError = validate();
        if (validationError) { setError(validationError); return; }
        setSubmitting(true);
        setError("");
        try {
          await onCreate({ title, description, subject, weekId, duration, maxAttempts, targetGroups: selectedGroups, status, questions, files });
          onClose();
        } catch (creationError) {
          setError(friendlyFirebaseError(creationError));
        } finally {
          setSubmitting(false);
        }
      }}>
        <header><div><span className="eyebrow">Diseñador de práctica</span><h2>Nuevo repaso semanal</h2><p>Combina reactivos automáticos y reflexión en una experiencia breve.</p></div><button className="plain-icon" type="button" onClick={onClose} disabled={submitting} aria-label="Cerrar"><X size={19} /></button></header>
        <div className="review-create-body">
          <main>
            <section className="review-create-section">
              <div className="review-create-section-title"><span>1</span><div><strong>Información general</strong><small>Materia, semana y propósito</small></div></div>
              <div className="review-create-grid">
                <label className="review-span-2">Título<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ej. Desafío de fracciones equivalentes" minLength={3} maxLength={120} required /></label>
                <label>Materia<select value={subject} onChange={(event) => { setSubject(event.target.value); setSelectedGroups([]); }}>{subjectOptions.length ? subjectOptions.map((item) => <option key={item}>{item}</option>) : <option>General</option>}</select></label>
                <label>Semana<select value={weekId} onChange={(event) => setWeekId(event.target.value)} required><option value="" disabled>Selecciona una semana</option>{calendar.weeks.map((week) => <option value={week.id} key={week.id}>{week.label} · {formatDate(week.startAt)}</option>)}</select></label>
                <label>Duración estimada<input type="number" min={3} max={60} value={duration} onChange={(event) => setDuration(Number(event.target.value))} /></label>
                <label>Intentos permitidos<select value={maxAttempts} onChange={(event) => setMaxAttempts(Number(event.target.value))}><option value={1}>1 intento</option><option value={2}>2 intentos</option><option value={3}>3 intentos</option><option value={5}>5 intentos</option><option value={0}>Ilimitados</option></select></label>
                <label className="review-span-2">Instrucciones <small>Opcional</small><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Explica qué deben recordar antes de comenzar" maxLength={800} rows={3} /></label>
              </div>
            </section>

            <section className="review-create-section">
              <div className="review-create-section-title"><span>2</span><div><strong>Destinatarios</strong><small>{recipients.length} alumnos recibirán este repaso</small></div></div>
              <div className="review-group-options"><button type="button" className={selectedGroups.length === 0 ? "selected" : ""} onClick={() => setSelectedGroups([])}>Todos los grupos</button>{groups.map((group) => <button type="button" className={selectedGroups.includes(group) ? "selected" : ""} onClick={() => setSelectedGroups((current) => current.includes(group) ? current.filter((item) => item !== group) : [...current, group])} key={group}>{selectedGroups.includes(group) && <Check size={11} />}{group}</button>)}</div>
            </section>

            <section className="review-create-section">
              <div className="review-create-section-title"><span>3</span><div><strong>Reactivos</strong><small>La clave correcta se guarda de forma privada</small></div></div>
              <div className="review-question-builder">
                {questions.map((item, index) => (
                  <article key={item.id}>
                    <header><strong>Reactivo {index + 1}</strong><select value={item.type} onChange={(event) => updateQuestion(item.id, (question) => changeQuestionType(question, event.target.value as WeeklyReviewQuestionType))}><option value="multiple_choice">Opción múltiple</option><option value="true_false">Verdadero o falso</option><option value="reflection">Respuesta reflexiva</option></select>{questions.length > 1 && <button type="button" onClick={() => setQuestions((current) => current.filter((question) => question.id !== item.id))} aria-label={`Eliminar reactivo ${index + 1}`}><Trash2 size={15} /></button>}</header>
                    <label>Pregunta<textarea value={item.prompt} onChange={(event) => updateQuestion(item.id, (question) => ({ ...question, prompt: event.target.value }))} placeholder="Escribe una pregunta clara" maxLength={500} rows={2} /></label>
                    {item.type === "multiple_choice" && <div className="review-option-builder"><small>Marca la respuesta correcta</small>{item.options.map((option, optionIndex) => <label key={option.id}><input type="radio" name={`correct-${item.id}`} checked={item.correctAnswer === option.id} onChange={() => updateQuestion(item.id, (question) => ({ ...question, correctAnswer: option.id }))} /><span>{String.fromCharCode(65 + optionIndex)}</span><input value={option.label} onChange={(event) => updateQuestion(item.id, (question) => ({ ...question, options: question.options.map((current) => current.id === option.id ? { ...current, label: event.target.value } : current) }))} placeholder={`Opción ${optionIndex + 1}`} /></label>)}</div>}
                    {item.type === "true_false" && <label className="review-correct-select">Respuesta correcta<select value={item.correctAnswer} onChange={(event) => updateQuestion(item.id, (question) => ({ ...question, correctAnswer: event.target.value }))}><option value="true">Verdadero</option><option value="false">Falso</option></select></label>}
                    {item.type === "reflection" && <p className="review-reflection-note"><Sparkles size={14} /> Se evalúa por participación; permite al alumno explicar y conectar ideas.</p>}
                  </article>
                ))}
              </div>
              <button className="review-add-question" type="button" disabled={questions.length >= 30} onClick={() => setQuestions((current) => [...current, newChoiceQuestion()])}><Plus size={15} /> Agregar reactivo</button>
            </section>

            <section className="review-create-section">
              <div className="review-create-section-title"><span>4</span><div><strong>Material de apoyo</strong><small>PDF, documento, imagen o audio · opcional</small></div></div>
              <label className="review-file-picker"><UploadCloud size={21} /><span><strong>Seleccionar archivos</strong><small>Hasta 3 archivos de 20 MB</small></span><input type="file" multiple accept="application/pdf,image/*,audio/*,.doc,.docx,.ppt,.pptx,.txt" onChange={(event) => { selectFiles(event.target.files); event.currentTarget.value = ""; }} /></label>
              {files.length > 0 && <div className="review-selected-files">{files.map((file, index) => <span key={`${file.name}-${index}`}><Paperclip size={14} /><div><strong>{file.name}</strong><small>{formatFileSize(file.size)}</small></div><button type="button" onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}><X size={14} /></button></span>)}</div>}
            </section>
            {error && <p className="review-form-error">{error}</p>}
          </main>
          <aside>
            <div className="review-create-preview"><span><BookOpenCheck size={27} /></span><small>{calendar.weeks.find((week) => week.id === weekId)?.label ?? "Semana"} · {subject}</small><h3>{title || "Nombre del repaso"}</h3><p>{description || "Una práctica breve para recordar, aplicar y explicar lo aprendido."}</p><div><span><ListChecks size={13} /> {questions.length} reactivos</span><span><Clock3 size={13} /> {duration} min</span><span><Users size={13} /> {recipients.length} alumnos</span></div></div>
            <label className="review-publication-label">Publicación<select value={status} onChange={(event) => setStatus(event.target.value as "draft" | "published")}><option value="published">Publicar ahora</option><option value="draft">Guardar borrador</option></select></label>
            <p className="review-security-note"><ShieldCheck size={15} /> Las respuestas correctas se califican en el servidor y no se envían al navegador.</p>
          </aside>
        </div>
        <footer><span><CalendarDays size={14} /> El repaso quedará vinculado a la semana seleccionada.</span><div><button className="secondary-button" type="button" onClick={onClose} disabled={submitting}>Cancelar</button><button className="primary-button" disabled={submitting || !title.trim() || !weekId}>{submitting ? <><LoaderCircle className="spin" size={15} /> Guardando…</> : status === "published" ? <><Send size={15} /> Publicar repaso</> : <><FileText size={15} /> Guardar borrador</>}</button></div></footer>
      </motion.form>
    </motion.div>
  );
}
