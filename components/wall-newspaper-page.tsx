"use client";

import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Heart,
  LoaderCircle,
  Newspaper,
  Pencil,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import {
  muralCategories,
  muralLimits,
  muralSubmissionSchema,
  type MuralSubmissionInput,
} from "@/lib/mural-contract";
import {
  reviewMuralStory,
  reviewerRoleLabel,
  submitMuralStory,
  watchMuralWorkspace,
  type MuralWorkspace,
} from "@/lib/mural-firebase";
import type { PortalState, UserProfile, WallPost } from "@/lib/types";

const STORIES_PER_PAGE = 6;

const emptyWorkspace: MuralWorkspace = {
  published: [],
  mine: [],
  reviewQueue: [],
};

const emptyDraft: MuralSubmissionInput = {
  title: "",
  category: "Comunidad",
  section: "Historias de nuestra comunidad",
  lead: "",
  body: "",
  quote: "",
  authorshipConfirmed: false,
};

type ReaderPage =
  | { kind: "intro" }
  | { kind: "content"; paragraphs: string[]; first: boolean; last: boolean };

type ReaderContentPage = Extract<ReaderPage, { kind: "content" }>;

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-MX")
    .trim();
}

function storyDate(value: string | undefined) {
  if (!value) return "Fecha pendiente";
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return value;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function statusLabel(status: WallPost["status"]) {
  if (status === "changes_requested") return "Necesita correcciones";
  if (status === "published") return "Publicada";
  if (status === "submitted") return "En revisión";
  if (status === "archived") return "Archivada";
  return "Borrador";
}

function splitAtWordBoundaries(text: string, maximumLength: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let chunk = "";
  words.forEach((word) => {
    const candidate = chunk ? `${chunk} ${word}` : word;
    if (chunk && candidate.length > maximumLength) {
      chunks.push(chunk);
      chunk = word;
    } else {
      chunk = candidate;
    }
  });
  if (chunk) chunks.push(chunk);
  return chunks;
}

function storyParagraphs(post: WallPost) {
  const source = post.paragraphs?.length
    ? post.paragraphs
    : [
        post.excerpt,
        `Esta historia fue preparada por ${post.author} para compartir una experiencia de ${post.category.toLocaleLowerCase("es-MX")} con la comunidad de Campus CEHF.`,
        "Cada publicación del Periódico mural reúne observaciones, preguntas y aprendizajes que nacen dentro de nuestra escuela.",
      ];
  return source.flatMap((paragraph) => splitAtWordBoundaries(paragraph, 480));
}

function createReaderPages(post: WallPost): ReaderPage[] {
  const chunks = storyParagraphs(post);
  const contentPages: ReaderContentPage[] = [];
  let current: string[] = [];
  let length = 0;

  chunks.forEach((chunk) => {
    const firstPage = contentPages.length === 0;
    const budget = firstPage ? 520 : 720;
    if (current.length && length + chunk.length > budget) {
      contentPages.push({
        kind: "content",
        paragraphs: current,
        first: contentPages.length === 0,
        last: false,
      });
      current = [];
      length = 0;
    }
    current.push(chunk);
    length += chunk.length;
  });

  if (current.length) {
    contentPages.push({
      kind: "content",
      paragraphs: current,
      first: contentPages.length === 0,
      last: true,
    });
  }
  if (!contentPages.length) {
    contentPages.push({ kind: "content", paragraphs: [], first: true, last: true });
  } else {
    contentPages.forEach((page, index) => {
      page.last = index === contentPages.length - 1;
    });
  }
  return [{ kind: "intro" }, ...contentPages];
}

function WallStoryReader({
  post,
  onClose,
  onFavorite,
}: {
  post: WallPost;
  onClose: () => void;
  onFavorite: () => void;
}) {
  const [readingPosition, setReadingPosition] = useState({ postId: post.id, spread: 0 });
  const [pageTurn, setPageTurn] = useState<{ id: number; direction: 1 | -1 } | null>(null);
  const pageTurnSequence = useRef(0);
  const reduceMotion = useReducedMotion();
  const physicalPages = useMemo(() => createReaderPages(post), [post]);
  const spreadCount = Math.max(1, Math.ceil(physicalPages.length / 2));
  const requestedSpread = readingPosition.postId === post.id ? readingPosition.spread : 0;
  const spread = Math.min(Math.max(requestedSpread, 0), spreadCount - 1);
  const firstVisiblePage = spread * 2;
  const visiblePages = physicalPages.slice(firstVisiblePage, firstVisiblePage + 2);
  const progress = Math.round(((spread + 1) / spreadCount) * 100);

  const moveSpread = useCallback(
    (delta: number) => {
      if (pageTurn) return;
      const next = spread + delta;
      if (next < 0 || next >= spreadCount) return;
      if (!reduceMotion) {
        pageTurnSequence.current += 1;
        setPageTurn({ id: pageTurnSequence.current, direction: delta > 0 ? 1 : -1 });
      }
      setReadingPosition({ postId: post.id, spread: next });
    },
    [pageTurn, post.id, reduceMotion, spread, spreadCount],
  );

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") moveSpread(1);
      if (event.key === "ArrowLeft") moveSpread(-1);
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [moveSpread, onClose]);

  function renderPage(
    page: ReaderPage | undefined,
    physicalIndex: number,
    side: "left" | "right",
  ) {
    if (!page) {
      return (
        <section className={`reader-page reader-page-${side} reader-page-blank`} aria-hidden="true">
          <span className="reader-blank-mark">CE</span>
          <span>Entre líneas</span>
          <small>Campus CEHF</small>
        </section>
      );
    }
    if (page.kind === "intro") {
      return (
        <section
          className={`reader-page reader-page-${side} reader-intro-page ${post.title.length > 64 ? "long-title" : ""}`}
        >
          <div className="reader-running-head">
            <span>{post.category}</span>
            <span>PERIÓDICO MURAL</span>
          </div>
          <span className="reader-section-label">{post.section ?? post.category}</span>
          <h1>{post.title}</h1>
          <p className="reader-lead">{post.lead ?? post.excerpt}</p>
          <div className="reader-byline">
            <span>Texto</span>
            <strong>{post.author}</strong>
            <small><Clock3 size={12} /> {post.readingTime ?? "3 min de lectura"}</small>
          </div>
          {post.approvedByName && (
            <div className="reader-approval">
              <ShieldCheck size={13} /> Aprobó {post.approvedByName} · {reviewerRoleLabel(post.approvedByRole)}
            </div>
          )}
          <div className="reader-page-number">{physicalIndex + 1}</div>
        </section>
      );
    }
    return (
      <section
        className={`reader-page reader-page-${side} reader-content-page ${page.first ? "is-first" : ""} ${page.last ? "is-last" : ""}`}
      >
        <div className="reader-running-head">
          <span>{post.category}</span>
          <span>{post.section ?? "Historias de nuestra comunidad"}</span>
        </div>
        {page.first && (
          <div className={`reader-story-art ${post.accent}`}>
            <span>PERIÓDICO<br />MURAL</span>
            <Newspaper size={48} />
            <i />
          </div>
        )}
        <div className="reader-content-copy">
          {page.paragraphs.map((paragraph, index) => (
            <p
              className={page.first && index === 0 ? "reader-first-paragraph" : ""}
              key={`${physicalIndex}-${index}`}
            >
              {paragraph}
            </p>
          ))}
        </div>
        {page.last && post.quote && <blockquote>“{post.quote}”</blockquote>}
        <div className="reader-content-footer">
          <span>{page.last ? "CAMPUS CEHF" : "CONTINÚA EN LA SIGUIENTE PÁGINA"}</span>
          {page.last && (
            <button
              type="button"
              className={post.favorite ? "favorite" : ""}
              onClick={onFavorite}
              aria-pressed={post.favorite}
            >
              <Heart size={13} fill={post.favorite ? "currentColor" : "none"} />
              {post.favorite ? "Guardada" : "Guardar"}
            </button>
          )}
        </div>
        <div className="reader-page-number">{physicalIndex + 1}</div>
        {side === "right" && <span className="reader-page-curl" />}
      </section>
    );
  }

  return (
    <motion.section
      className="magazine-reader-shell"
      role="dialog"
      aria-modal="true"
      aria-label={`Lectura de ${post.title}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.3 }}
    >
      <div className="reader-paper-grain" />
      <header className="reader-header">
        <div className="reader-identity">
          <span className="reader-brand-mark">CE</span><span />
          <div><strong>Entre líneas</strong><small>Periódico mural · Campus CEHF</small></div>
        </div>
        <div className="reader-status">
          <span>{progress}% leído</span><div><i style={{ width: `${progress}%` }} /></div>
          <button type="button" autoFocus onClick={onClose} aria-label="Cerrar la historia"><X size={19} /></button>
        </div>
      </header>
      <div className="reader-scene">
        <div className="reader-desk-light" /><div className="reader-book-shadow" />
        <div className="reader-book">
          <div className="reader-page-stack reader-page-stack-left" />
          <div className="reader-page-stack reader-page-stack-right" />
          <div className="reader-spine" />
          <AnimatePresence mode="wait">
            <motion.article
              className="reader-spread"
              key={`${post.id}-${spread}`}
              initial={{ opacity: reduceMotion ? 1 : 0.72 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: reduceMotion ? 1 : 0.72 }}
              transition={{ duration: reduceMotion ? 0 : 0.18 }}
              aria-live="polite"
            >
              {renderPage(visiblePages[0], firstVisiblePage, "left")}
              {renderPage(visiblePages[1], firstVisiblePage + 1, "right")}
            </motion.article>
          </AnimatePresence>
          {pageTurn && (
            <motion.div
              key={pageTurn.id}
              className={`reader-turn-sheet ${pageTurn.direction > 0 ? "forward" : "backward"}`}
              initial={{ rotateY: 0 }}
              animate={{ rotateY: pageTurn.direction > 0 ? [0, -92, -180] : [0, 92, 180] }}
              transition={{ duration: 0.76, ease: [0.45, 0, 0.2, 1] }}
              style={{ transformOrigin: pageTurn.direction > 0 ? "left center" : "right center" }}
              onAnimationComplete={() => setPageTurn((active) => active?.id === pageTurn.id ? null : active)}
              aria-hidden="true"
            >
              <div className="reader-turn-front"><span /></div>
              <div className="reader-turn-back"><span /></div>
            </motion.div>
          )}
        </div>
      </div>
      <nav className="reader-controls" aria-label="Navegación de páginas">
        <button type="button" onClick={() => moveSpread(-1)} disabled={spread === 0 || Boolean(pageTurn)}>
          <ChevronLeft size={19} /><span>Anterior</span>
        </button>
        <div className="reader-position"><small>Páginas {firstVisiblePage + 1}–{Math.min(firstVisiblePage + 2, physicalPages.length)} de {physicalPages.length}</small></div>
        <button type="button" onClick={() => moveSpread(1)} disabled={spread === spreadCount - 1 || Boolean(pageTurn)}>
          <span>Siguiente</span><ChevronRight size={19} />
        </button>
      </nav>
      <div className="reader-key-hint"><kbd>←</kbd><kbd>→</kbd> pasar página <span /><kbd>ESC</kbd> cerrar</div>
    </motion.section>
  );
}

function MuralSubmissionModal({
  story,
  busy,
  onClose,
  onSubmit,
}: {
  story: WallPost | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: MuralSubmissionInput) => Promise<void>;
}) {
  const [draft, setDraft] = useState<MuralSubmissionInput>(() => story ? {
    title: story.title,
    category: muralCategories.includes(story.category as typeof muralCategories[number])
      ? story.category as typeof muralCategories[number]
      : "Comunidad",
    section: story.section ?? story.category,
    lead: story.lead ?? story.excerpt,
    body: story.paragraphs?.join("\n\n") ?? story.excerpt,
    quote: story.quote ?? "",
    authorshipConfirmed: true,
  } : emptyDraft);
  const [error, setError] = useState("");
  const field = <Key extends keyof MuralSubmissionInput>(key: Key, value: MuralSubmissionInput[Key]) =>
    setDraft((previous) => ({ ...previous, [key]: value }));

  return (
    <motion.div
      className="modal-backdrop mural-modal-backdrop"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}
    >
      <motion.form
        className="modal mural-submission-modal"
        role="dialog"
        aria-modal="true"
        aria-label={story ? "Corregir historia" : "Proponer una historia"}
        initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12 }}
        onSubmit={(event) => {
          event.preventDefault();
          const result = muralSubmissionSchema.safeParse(draft);
          if (!result.success) {
            setError(result.error.issues[0]?.message ?? "Revisa los datos de tu historia.");
            return;
          }
          setError("");
          void onSubmit(result.data);
        }}
      >
        <div className="modal-heading">
          <div><span className="eyebrow">PERIÓDICO MURAL</span><h2>{story ? "Corrige y reenvía" : "Comparte tu historia"}</h2></div>
          <button className="plain-icon" type="button" onClick={onClose} disabled={busy} aria-label="Cerrar"><X size={20} /></button>
        </div>
        <div className="mural-form-intro"><Sparkles size={20} /><p>Tu maestro o Dirección leerá el texto antes de publicarlo para toda la comunidad.</p></div>
        {error && <div className="mural-form-error" role="alert"><AlertCircle size={17} />{error}</div>}
        <div className="mural-form-grid">
          <label>Título<input autoFocus value={draft.title} maxLength={muralLimits.title} onChange={(event) => field("title", event.target.value)} placeholder="Un título claro que invite a leer" /><small>{draft.title.length}/{muralLimits.title}</small></label>
          <label>Categoría<select value={draft.category} onChange={(event) => field("category", event.target.value as MuralSubmissionInput["category"])}>{muralCategories.map((category) => <option key={category}>{category}</option>)}</select></label>
          <label>Sección<input value={draft.section} maxLength={muralLimits.section} onChange={(event) => field("section", event.target.value)} placeholder="Ej. Ciencia cotidiana" /><small>{draft.section.length}/{muralLimits.section}</small></label>
          <label>Entrada<input value={draft.lead} maxLength={muralLimits.lead} onChange={(event) => field("lead", event.target.value)} placeholder="Resume la historia en una o dos oraciones" /><small>{draft.lead.length}/{muralLimits.lead}</small></label>
          <label className="mural-field-wide">Historia<textarea className="mural-body-field" value={draft.body} maxLength={muralLimits.body} onChange={(event) => field("body", event.target.value)} placeholder={"Escribe el primer párrafo aquí.\n\nDeja una línea en blanco para comenzar el siguiente."} /><small>{draft.body.length}/{muralLimits.body.toLocaleString("es-MX")} · mínimo dos párrafos</small></label>
          <label className="mural-field-wide">Frase destacada<textarea value={draft.quote} maxLength={muralLimits.quote} onChange={(event) => field("quote", event.target.value)} placeholder="Una frase breve que resuma la idea más importante" /><small>{draft.quote.length}/{muralLimits.quote}</small></label>
        </div>
        <label className="mural-authorship-check">
          <input type="checkbox" checked={draft.authorshipConfirmed} onChange={(event) => field("authorshipConfirmed", event.target.checked)} />
          <span><strong>Confirmo que esta historia es mía</strong><small>Acepto que pueda publicarse dentro de la comunidad autenticada de CEHF.</small></span>
        </label>
        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="primary-button" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <ArrowRight size={16} />}{story ? "Reenviar a revisión" : "Enviar a revisión"}</button>
        </div>
      </motion.form>
    </motion.div>
  );
}

function ReviewRequestModal({
  story,
  busy,
  onClose,
  onSubmit,
}: {
  story: WallPost;
  busy: boolean;
  onClose: () => void;
  onSubmit: (note: string) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.form
        className="modal mural-review-modal"
        role="dialog" aria-modal="true"
        initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
        onSubmit={(event) => { event.preventDefault(); if (note.trim().length >= 8) void onSubmit(note.trim()); }}
      >
        <div className="modal-heading"><div><span className="eyebrow">REVISIÓN EDITORIAL</span><h2>Solicitar correcciones</h2></div><button className="plain-icon" type="button" onClick={onClose} disabled={busy}><X size={20} /></button></div>
        <p>Explica a <strong>{story.author}</strong> qué necesita mejorar en <em>“{story.title}”</em>.</p>
        <label>Observaciones<textarea autoFocus value={note} maxLength={muralLimits.reviewNote} onChange={(event) => setNote(event.target.value)} placeholder="Ej. Explica mejor el resultado en el segundo párrafo y revisa la frase final." /><small>{note.length}/{muralLimits.reviewNote}</small></label>
        <div className="modal-actions"><button className="secondary-button" type="button" onClick={onClose} disabled={busy}>Cancelar</button><button className="primary-button" disabled={busy || note.trim().length < 8}>{busy ? <LoaderCircle className="spin" size={16} /> : <ArrowRight size={16} />}Enviar al alumno</button></div>
      </motion.form>
    </motion.div>
  );
}

export function WallNewspaperPage({
  state,
  updateState,
  profile,
  firebaseReady,
}: {
  state: PortalState;
  updateState: (
    updater: (previous: PortalState) => PortalState,
    message?: string,
  ) => void;
  profile: UserProfile;
  firebaseReady: boolean;
}) {
  const [workspace, setWorkspace] = useState<MuralWorkspace>(emptyWorkspace);
  const [loading, setLoading] = useState(firebaseReady);
  const [readerPost, setReaderPost] = useState<WallPost | null>(null);
  const [submissionOpen, setSubmissionOpen] = useState(false);
  const [editingStory, setEditingStory] = useState<WallPost | null>(null);
  const [changesStory, setChangesStory] = useState<WallPost | null>(null);
  const [saving, setSaving] = useState(false);
  const [reviewBusy, setReviewBusy] = useState<string | null>(null);
  const [queryText, setQueryText] = useState("");
  const [category, setCategory] = useState("all");
  const [group, setGroup] = useState("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!firebaseReady) return;
    return watchMuralWorkspace(
      profile,
      (nextWorkspace) => {
        setWorkspace(nextWorkspace);
        setLoading(false);
      },
      (error) => {
        setLoading(false);
        toast.error("No pudimos cargar el Periódico mural", { description: error.message });
      },
    );
  }, [firebaseReady, profile]);

  const curatedPublished = state.wallPosts.filter((story) => story.status === "published");
  const publishedStories = useMemo(() => {
    const realIds = new Set(workspace.published.map((story) => story.id));
    return [...workspace.published, ...curatedPublished.filter((story) => !realIds.has(story.id))];
  }, [curatedPublished, workspace.published]);
  const mine = firebaseReady
    ? workspace.mine
    : state.wallPosts.filter((story) => story.authorId === profile.uid && story.status !== "published");
  const reviewQueue = firebaseReady
    ? workspace.reviewQueue
    : state.wallPosts.filter((story) => story.status === "submitted");
  const featured = publishedStories[0];
  const groups = useMemo(
    () => [...new Set(publishedStories.map((story) => story.group).filter(Boolean))].sort((first, second) => first.localeCompare(second, "es")),
    [publishedStories],
  );
  const normalizedQuery = normalizeSearch(queryText);
  const filteredStories = useMemo(() => publishedStories.filter((story) => {
    const matchesCategory = category === "all" || story.category === category;
    const matchesGroup = group === "all" || story.group === group;
    const matchesFavorite = !favoritesOnly || story.favorite;
    const searchable = normalizeSearch([
      story.title,
      story.author,
      story.group,
      story.category,
      story.section,
      story.lead,
      story.excerpt,
      ...(story.paragraphs ?? []),
    ].join(" "));
    return matchesCategory && matchesGroup && matchesFavorite && (!normalizedQuery || searchable.includes(normalizedQuery));
  }), [category, favoritesOnly, group, normalizedQuery, publishedStories]);
  const pageCount = Math.max(1, Math.ceil(filteredStories.length / STORIES_PER_PAGE));
  const safePage = Math.min(page, pageCount);
  const pageStories = filteredStories.slice((safePage - 1) * STORIES_PER_PAGE, safePage * STORIES_PER_PAGE);
  const hasFilters = Boolean(queryText.trim()) || category !== "all" || group !== "all" || favoritesOnly;

  const toggleFavorite = (postId: string) => {
    const apply = (story: WallPost) => story.id === postId ? { ...story, favorite: !story.favorite } : story;
    setWorkspace((previous) => ({
      ...previous,
      published: previous.published.map(apply),
      mine: previous.mine.map(apply),
    }));
    updateState((previous) => ({ ...previous, wallPosts: previous.wallPosts.map(apply) }));
    setReaderPost((previous) => previous?.id === postId ? apply(previous) : previous);
  };

  const clearFilters = () => {
    setQueryText("");
    setCategory("all");
    setGroup("all");
    setFavoritesOnly(false);
    setPage(1);
  };

  const submitStory = async (input: MuralSubmissionInput) => {
    setSaving(true);
    try {
      if (firebaseReady) {
        await submitMuralStory(input, editingStory?.id);
      } else {
        const now = new Date().toISOString();
        const paragraphs = input.body.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
        const words = [input.title, input.lead, ...paragraphs].join(" ").split(/\s+/).length;
        const next: WallPost = {
          id: editingStory?.id ?? `wall-${crypto.randomUUID()}`,
          title: input.title,
          excerpt: input.lead,
          category: input.category,
          author: profile.name,
          authorId: profile.uid,
          group: `${profile.grade ?? ""} ${profile.group ?? ""}`.trim() || "Comunidad CEHF",
          publishedAt: "",
          accent: editingStory?.accent ?? "violet",
          status: "submitted",
          favorite: false,
          section: input.section,
          lead: input.lead,
          paragraphs,
          quote: input.quote,
          readingTime: `${Math.max(2, Math.ceil(words / 180))} min de lectura`,
          version: (editingStory?.version ?? 0) + 1,
          reviewNote: editingStory?.reviewNote ?? "",
          createdAt: editingStory?.createdAt ?? now,
          updatedAt: now,
          submittedAt: now,
        };
        updateState((previous) => ({
          ...previous,
          wallPosts: [next, ...previous.wallPosts.filter((story) => story.id !== next.id)],
        }));
      }
      setSubmissionOpen(false);
      setEditingStory(null);
      toast.success(editingStory ? "Historia corregida y reenviada" : "Historia enviada a revisión", {
        description: "Te avisaremos cuando un maestro o Dirección termine de revisarla.",
      });
    } catch (error) {
      toast.error("No pudimos enviar tu historia", { description: error instanceof Error ? error.message : undefined });
    } finally {
      setSaving(false);
    }
  };

  const reviewStory = async (story: WallPost, decision: "approve" | "request_changes", note = "") => {
    setReviewBusy(story.id);
    try {
      if (firebaseReady) {
        await reviewMuralStory(story.id, decision, note);
      } else {
        const now = new Date().toISOString();
        updateState((previous) => ({
          ...previous,
          wallPosts: previous.wallPosts.map((candidate) => candidate.id === story.id ? {
            ...candidate,
            status: decision === "approve" ? "published" : "changes_requested",
            reviewNote: note,
            reviewedById: profile.uid,
            reviewedByName: profile.name,
            reviewedByRole: profile.role === "student" ? undefined : profile.role,
            reviewedAt: now,
            approvedById: decision === "approve" ? profile.uid : undefined,
            approvedByName: decision === "approve" ? profile.name : undefined,
            approvedByRole: decision === "approve" && profile.role !== "student" ? profile.role : undefined,
            approvedAt: decision === "approve" ? now : undefined,
            publishedAt: decision === "approve" ? now : candidate.publishedAt,
            updatedAt: now,
          } : candidate),
        }));
      }
      toast.success(decision === "approve" ? "Historia aprobada y publicada" : "Correcciones enviadas al alumno");
      setChangesStory(null);
    } catch (error) {
      toast.error("No pudimos guardar la revisión", { description: error instanceof Error ? error.message : undefined });
    } finally {
      setReviewBusy(null);
    }
  };

  return (
    <div className="wall-page-stack">
      {(profile.role === "teacher" || profile.role === "director") && (
        <section className="mural-editorial-desk panel">
          <div className="mural-desk-heading">
            <div><span className="eyebrow">MESA EDITORIAL · {profile.role === "director" ? "DIRECCIÓN" : "MAESTROS"}</span><h2>Historias por revisar</h2><p>Lee cada propuesta completa antes de publicarla o solicitar correcciones.</p></div>
            <span className="mural-pending-count">{reviewQueue.length}<small>pendientes</small></span>
          </div>
          {loading && !reviewQueue.length ? <div className="mural-review-empty"><LoaderCircle className="spin" size={22} />Actualizando bandeja…</div> : !reviewQueue.length ? <div className="mural-review-empty"><CheckCircle2 size={24} /><strong>La bandeja está al día</strong><span>Las nuevas historias aparecerán aquí.</span></div> : (
            <div className="mural-review-list">{reviewQueue.map((story) => (
              <article className="mural-review-card" key={story.id}>
                <div className={`wall-card-art ${story.accent}`}><span>{story.category}</span><Newspaper size={30} /></div>
                <div className="mural-review-copy">
                  <div><span>{story.section} · versión {story.version ?? 1}</span><h3>{story.title}</h3><p>Por {story.author} · {story.group} · {story.readingTime}</p></div>
                  <p>{story.lead ?? story.excerpt}</p>
                  <button className="text-link" onClick={() => setReaderPost(story)}>Leer historia completa <ArrowRight size={14} /></button>
                  <div className="mural-review-actions">
                    <button className="secondary-button" disabled={reviewBusy === story.id} onClick={() => setChangesStory(story)}><Pencil size={14} />Solicitar correcciones</button>
                    <button className="primary-button" disabled={reviewBusy === story.id} onClick={() => void reviewStory(story, "approve")}>
                      {reviewBusy === story.id ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}Aprobar y publicar
                    </button>
                  </div>
                </div>
              </article>
            ))}</div>
          )}
        </section>
      )}

      {profile.role === "student" && mine.length > 0 && (
        <section className="mural-my-stories panel">
          <div className="mural-section-heading"><div><span className="eyebrow">MIS HISTORIAS</span><h2>Seguimiento editorial</h2></div><button className="secondary-button" onClick={() => { setEditingStory(null); setSubmissionOpen(true); }}><Pencil size={15} />Nueva historia</button></div>
          <div className="mural-submission-list">{mine.map((story) => (
            <article key={story.id}>
              <span className={`mural-status ${story.status}`}>{statusLabel(story.status)}</span>
              <div><strong>{story.title}</strong><small>Versión {story.version ?? 1} · {storyDate(story.submittedAt ?? story.createdAt)}</small>{story.reviewNote && <p><strong>{story.reviewedByName ? `${story.reviewedByName}: ` : ""}</strong>{story.reviewNote}</p>}</div>
              {story.status === "changes_requested" && <button className="secondary-button" onClick={() => { setEditingStory(story); setSubmissionOpen(true); }}><Pencil size={14} />Corregir</button>}
            </article>
          ))}</div>
        </section>
      )}

      {featured && (
        <section className="wall-feature">
          <div className="wall-art" aria-hidden="true"><span className="wall-circle" /><span className="wall-arch" /><span className="wall-leaf one" /><span className="wall-leaf two" /></div>
          <div className="wall-feature-copy"><span className="pill pill-light">Historia destacada</span><span className="wall-category">{featured.category}</span><h2>{featured.title}</h2><p>{featured.excerpt}</p><button className="light-button" onClick={() => setReaderPost(featured)}>Leer historia <ArrowRight size={17} /></button></div>
        </section>
      )}

      <section className="mural-discovery panel" aria-label="Buscar y filtrar historias">
        <label className="mural-search"><Search size={18} /><input type="search" value={queryText} onChange={(event) => { setQueryText(event.target.value); setPage(1); }} placeholder="Buscar por título, autor o palabra…" aria-label="Buscar historias" />{queryText && <button type="button" onClick={() => { setQueryText(""); setPage(1); }} aria-label="Borrar búsqueda"><X size={14} /></button>}</label>
        <label className="mural-filter"><span>Categoría</span><select value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}><option value="all">Todas</option>{muralCategories.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={14} /></label>
        <label className="mural-filter"><span>Grupo</span><select value={group} onChange={(event) => { setGroup(event.target.value); setPage(1); }}><option value="all">Todos</option>{groups.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={14} /></label>
        <button type="button" className={`mural-favorites ${favoritesOnly ? "active" : ""}`} aria-pressed={favoritesOnly} onClick={() => { setFavoritesOnly((active) => !active); setPage(1); }}><Heart size={16} fill={favoritesOnly ? "currentColor" : "none"} />Favoritas</button>
      </section>

      <div className="mural-results-meta"><span><strong>{filteredStories.length}</strong> {filteredStories.length === 1 ? "historia" : "historias"}</span>{hasFilters && <button onClick={clearFilters}><X size={13} />Limpiar filtros</button>}</div>
      {pageStories.length ? (
        <motion.section className="wall-grid" layout>
          <AnimatePresence mode="popLayout">{pageStories.map((story, index) => (
            <motion.article className="wall-card" key={story.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: Math.min(index, 5) * 0.035 }}>
              <div className={`wall-card-art ${story.accent}`}><span>{story.category}</span><Newspaper size={31} /></div>
              <div className="wall-card-copy">
                <div className="wall-byline"><span>{story.author} · {story.group}</span><span>{storyDate(story.publishedAt)}</span></div>
                <h3>{story.title}</h3><p>{story.excerpt}</p>
                {story.approvedByName && <small className="mural-approved"><ShieldCheck size={12} />Aprobó {story.approvedByName} · {reviewerRoleLabel(story.approvedByRole)}</small>}
                <div className="wall-actions"><button className="text-link" onClick={() => setReaderPost(story)}>Leer <ArrowRight size={15} /></button><button className={`favorite-button ${story.favorite ? "active" : ""}`} aria-label={story.favorite ? "Quitar de favoritos" : "Añadir a favoritos"} onClick={() => toggleFavorite(story.id)}><Heart size={18} fill={story.favorite ? "currentColor" : "none"} /></button></div>
              </div>
            </motion.article>
          ))}</AnimatePresence>
        </motion.section>
      ) : (
        <section className="mural-empty panel"><Search size={24} /><strong>No encontramos historias</strong><p>Prueba otra palabra o cambia los filtros.</p><button className="secondary-button" onClick={clearFilters}>Ver todo el mural</button></section>
      )}

      {filteredStories.length > STORIES_PER_PAGE && (
        <nav className="mural-pagination" aria-label="Paginación de historias">
          <span>Mostrando {(safePage - 1) * STORIES_PER_PAGE + 1}–{Math.min(safePage * STORIES_PER_PAGE, filteredStories.length)} de {filteredStories.length}</span>
          <div><button className="secondary-button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={safePage === 1}><ChevronLeft size={15} />Anterior</button><strong>Página {safePage} de {pageCount}</strong><button className="secondary-button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={safePage === pageCount}>Siguiente<ChevronRight size={15} /></button></div>
        </nav>
      )}

      {profile.role === "student" && (
        <div className="proposal-note"><Sparkles size={21} /><div><strong>¿Tienes una historia para compartir?</strong><p>Envíala al equipo editorial. Un maestro o Dirección la revisará antes de publicarla.</p></div><button className="secondary-button" onClick={() => { setEditingStory(null); setSubmissionOpen(true); }}>Proponer historia</button></div>
      )}

      <AnimatePresence>{readerPost && <WallStoryReader post={readerPost} onClose={() => setReaderPost(null)} onFavorite={() => toggleFavorite(readerPost.id)} />}</AnimatePresence>
      <AnimatePresence>{submissionOpen && <MuralSubmissionModal story={editingStory} busy={saving} onClose={() => { if (!saving) { setSubmissionOpen(false); setEditingStory(null); } }} onSubmit={submitStory} />}</AnimatePresence>
      <AnimatePresence>{changesStory && <ReviewRequestModal story={changesStory} busy={reviewBusy === changesStory.id} onClose={() => { if (!reviewBusy) setChangesStory(null); }} onSubmit={(note) => reviewStory(changesStory, "request_changes", note)} />}</AnimatePresence>
    </div>
  );
}
