"use client";

import {
  AlertCircle,
  ArrowRight,
  Brush,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  Heart,
  ImagePlus,
  Layers3,
  ListChecks,
  LoaderCircle,
  Maximize2,
  Palette,
  Newspaper,
  Pencil,
  Presentation,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Type,
  Upload,
  UserRoundCheck,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { toast } from "sonner";
import {
  muralCategories,
  muralCoverFonts,
  muralCoverGradients,
  muralCoverLayouts,
  muralCoverLimits,
  muralCoverMotifs,
  muralEditionSchema,
  muralGalleryLayouts,
  muralGalleryLimits,
  muralRevealModes,
  muralSceneStyles,
  muralSceneTransitions,
  muralLimits,
  muralSubmissionSchema,
  type MuralEditionInput,
  type MuralSubmissionInput,
} from "@/lib/mural-contract";
import {
  defaultMuralCover,
  defaultMuralEdition,
  defaultMuralGallerySlides,
  reviewMuralStory,
  reviewerRoleLabel,
  saveMuralEdition,
  submitMuralStory,
  watchActiveMuralEdition,
  watchMuralWorkspace,
  type MuralWorkspace,
} from "@/lib/mural-firebase";
import type {
  ManagedAccount,
  MuralCoverGradientPreset,
  MuralEdition,
  MuralGallerySlide,
  MuralSceneTransition,
  PortalState,
  UserProfile,
  WallPost,
} from "@/lib/types";

const STORIES_PER_PAGE = 6;

const coverPalettes = [
  { name: "Medianoche", backgroundColor: "#172554", accentColor: "#fb7185", textColor: "#ffffff" },
  { name: "Bosque", backgroundColor: "#12372a", accentColor: "#f6c453", textColor: "#fffdf5" },
  { name: "Tinta", backgroundColor: "#202124", accentColor: "#9ae6b4", textColor: "#ffffff" },
  { name: "Terracota", backgroundColor: "#7c2d3a", accentColor: "#f5c7a9", textColor: "#fffaf5" },
  { name: "Cobalto", backgroundColor: "#173f73", accentColor: "#8dd3f7", textColor: "#ffffff" },
] as const;

const coverGradientStyles = {
  campus: {
    name: "Campus",
    description: "El degradado de Una mirada. Todo claro.",
    background: "radial-gradient(circle at 76% 46%, rgb(66 77 190 / 0.3), transparent 28%), linear-gradient(145deg, #0d1239, #111744 48%, #1b246f)",
    title: "linear-gradient(100deg, #ffffff 5%, #aeb5ff 45%, #ef8998 75%, #ffffff 96%)",
  },
  aurora: {
    name: "Aurora",
    description: "Azules luminosos y un matiz menta.",
    background: "radial-gradient(circle at 82% 28%, rgb(141 180 255 / 0.3), transparent 30%), linear-gradient(145deg, #0b1520, #172838 52%, #1c3159)",
    title: "linear-gradient(100deg, #ffffff 4%, #8db4ff 46%, #aeb5ff 74%, #ffffff 96%)",
  },
  coral: {
    name: "Coral",
    description: "Cálido, editorial y expresivo.",
    background: "radial-gradient(circle at 76% 72%, rgb(239 107 125 / 0.34), transparent 31%), linear-gradient(145deg, #351523, #6b2138 54%, #151c63)",
    title: "linear-gradient(100deg, #ffffff 3%, #ef8998 42%, #d0a068 72%, #ffffff 97%)",
  },
  cobalt: {
    name: "Cobalto",
    description: "Profundo, sobrio y contemporáneo.",
    background: "radial-gradient(circle at 78% 30%, rgb(59 111 158 / 0.38), transparent 30%), linear-gradient(145deg, #0b1520, #173f73 54%, #1f2985)",
    title: "linear-gradient(100deg, #ffffff 4%, #a7c7ff 48%, #aeb5ff 76%, #ffffff 97%)",
  },
} satisfies Record<MuralCoverGradientPreset, {
  name: string;
  description: string;
  background: string;
  title: string;
}>;

const coverLayoutLabels = {
  split: "Dividida",
  editorial: "Editorial",
  immersive: "Inmersiva",
} as const;

const coverFontLabels = {
  modern: "Moderna",
  editorial: "Editorial",
  classic: "Clásica",
} as const;

const coverMotifLabels = {
  orbits: "Órbitas",
  grid: "Retícula",
  confetti: "Confeti",
  waves: "Ondas",
  rays: "Rayos",
  frames: "Marcos",
  dots: "Puntos",
  ribbons: "Cintas",
  stars: "Estrellas",
  geometry: "Geometría",
  arches: "Arcos",
  checkerboard: "Ajedrez",
  sprinkles: "Chispas",
  bubbles: "Burbujas",
  crosses: "Cruces",
  leaves: "Hojas",
  pixels: "Píxeles",
  halftone: "Semitono",
  corners: "Esquinas",
  spiral: "Espiral",
} as const;

const muralSceneStyleLabels = {
  aurora: { name: "Aurora", description: "Luz suave y profundidad contemporánea." },
  constellation: { name: "Constelación", description: "Puntos de luz para temas históricos o científicos." },
  museum: { name: "Museo", description: "Iluminación editorial cálida y sobria." },
  archive: { name: "Archivo", description: "Texturas de papel y luz ámbar para memoria e historia." },
  ocean: { name: "Océano", description: "Capas turquesa y movimiento sereno para explorar ideas." },
  festival: { name: "Festival", description: "Destellos de color para celebraciones, arte y proyectos." },
} as const;

const muralTransitionLabels = {
  orbit: { name: "Órbita", description: "Entrada tridimensional lateral." },
  zoom: { name: "Acercamiento", description: "La escena aparece desde la profundidad." },
  lift: { name: "Ascenso", description: "Movimiento vertical tipo escenario." },
  flip: { name: "Giro", description: "La escena se abre como un panel tridimensional." },
  wipe: { name: "Revelado", description: "Un barrido descubre el contenido de izquierda a derecha." },
  drift: { name: "Diagonal", description: "Entrada inclinada con energía y profundidad." },
} as const;

const MURAL_GRAPHIC_PARTS = 14;

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

function muralMonthLabel(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) return "Edición actual";
  const label = new Intl.DateTimeFormat("es-MX", {
    month: "long",
    year: "numeric",
    timeZone: "America/Mexico_City",
  }).format(new Date(`${month}-15T12:00:00`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function editionToInput(edition: MuralEdition): MuralEditionInput {
  const normalizedCover = { ...defaultMuralCover, ...edition.cover };
  const cover = Object.fromEntries(
    Object.entries(normalizedCover).filter(([key]) => key !== "imageUrl"),
  ) as MuralEditionInput["cover"];
  return {
    id: edition.id,
    periodType: edition.periodType,
    month: edition.month,
    seasonName: edition.seasonName,
    group: edition.group,
    teacherId: edition.teacherId,
    teacherName: edition.teacherName,
    cover,
    gallerySlides: (edition.gallerySlides?.length ? edition.gallerySlides : defaultMuralGallerySlides).map((slide, index) => Object.fromEntries(
      Object.entries({ ...defaultMuralGallerySlides[index % defaultMuralGallerySlides.length], ...slide }).filter(([key]) => key !== "imageUrl"),
    ) as MuralEditionInput["gallerySlides"][number]),
  };
}

function MuralEditionCover({
  edition,
  featured,
  imagePreview,
  preview = false,
  onExplore,
  onOpenStory,
}: {
  edition: MuralEdition;
  featured?: WallPost;
  imagePreview?: string;
  preview?: boolean;
  onExplore?: () => void;
  onOpenStory?: (story: WallPost) => void;
}) {
  const { cover } = edition;
  const gradientPreset = coverGradientStyles[cover.gradientPreset ?? "campus"];
  const useTitleGradient = cover.useTitleGradient !== false;
  const useBackgroundGradient = cover.useBackgroundGradient !== false;
  const periodLabel = edition.periodLabel || "Edición actual";
  const imageUrl = imagePreview === undefined ? cover.imageUrl : imagePreview;
  const coverStyle = {
    "--mural-cover-bg": cover.backgroundColor,
    "--mural-cover-accent": cover.accentColor,
    "--mural-cover-text": cover.textColor,
    "--mural-cover-surface": useBackgroundGradient ? gradientPreset.background : cover.backgroundColor,
    "--mural-title-gradient": gradientPreset.title,
    "--mural-cover-overlay": `${cover.overlayOpacity / 100}`,
    "--mural-image-x": `${cover.imagePositionX}%`,
    "--mural-image-y": `${cover.imagePositionY}%`,
  } as CSSProperties;
  return (
    <section
      className={`mural-cover mural-cover-${cover.layout} mural-cover-font-${cover.font} ${useTitleGradient ? "has-title-gradient" : "has-solid-title"} ${useBackgroundGradient ? "has-background-gradient" : "has-solid-background"} ${imageUrl ? "has-image" : "no-image"} ${preview ? "is-preview" : ""}`}
      style={coverStyle}
      aria-label={`Portada de ${periodLabel}`}
    >
      <div className={`mural-cover-motif motif-${cover.motif}`} aria-hidden="true">
        {Array.from({ length: MURAL_GRAPHIC_PARTS }, (_, index) => <i key={index} />)}
      </div>
      <div className="mural-cover-copy">
        <div className="mural-cover-topline">
          <span>{cover.kicker}</span>
          {cover.showBadge && cover.badge && <strong>{cover.badge}</strong>}
        </div>
        <h1>{cover.title}</h1>
        <p>{cover.description}</p>
        {cover.showManager && (
          <div className="mural-cover-management">
            <span><CalendarDays size={14} />{periodLabel}</span>
            <span><UserRoundCheck size={14} />{edition.group} · {edition.teacherName}</span>
          </div>
        )}
        <button type="button" className="mural-cover-cta" onClick={onExplore} tabIndex={preview ? -1 : 0}>
          {cover.ctaLabel}<ArrowRight size={16} />
        </button>
      </div>
      <div className="mural-cover-visual" aria-hidden={!imageUrl}>
        {imageUrl && (
          <div
            className="mural-cover-image"
            role="img"
            aria-label="Imagen de portada del periódico mural"
            style={{ backgroundImage: `url(${imageUrl})` }}
          />
        )}
        <div className="mural-cover-monogram" aria-hidden="true">
          <span>CEHF</span><strong>{periodLabel.slice(0, 3).toLocaleUpperCase("es-MX")}</strong><small>PERIÓDICO<br />MURAL</small>
        </div>
        {featured && !preview && (
          <button type="button" className="mural-cover-featured" onClick={() => onOpenStory?.(featured)}>
            <span>Historia destacada</span><strong>{featured.title}</strong><small>Leer ahora <ArrowRight size={12} /></small>
          </button>
        )}
      </div>
    </section>
  );
}

function muralSceneMotion(transition: MuralSceneTransition, reduceMotion: boolean) {
  const animate = {
    opacity: 1,
    x: 0,
    y: 0,
    rotateX: 0,
    rotateY: 0,
    rotateZ: 0,
    skewX: 0,
    z: 0,
    scale: 1,
    filter: "blur(0px)",
    clipPath: "inset(0% 0% 0% 0% round 28px)",
  };
  if (reduceMotion) return { initial: animate, animate, exit: { ...animate, opacity: 0 }, duration: 0 };

  const transitions = {
    orbit: {
      initial: { ...animate, opacity: 0, x: 180, rotateY: -48, z: -280, scale: 0.76 },
      exit: { ...animate, opacity: 0, x: -150, rotateY: 38, z: -220, scale: 0.84 },
    },
    zoom: {
      initial: { ...animate, opacity: 0, scale: 0.38, filter: "blur(22px)" },
      exit: { ...animate, opacity: 0, scale: 1.22, filter: "blur(14px)" },
    },
    lift: {
      initial: { ...animate, opacity: 0, y: 150, rotateX: 18, scale: 0.9 },
      exit: { ...animate, opacity: 0, y: -120, rotateX: -13, scale: 0.94 },
    },
    flip: {
      initial: { ...animate, opacity: 0, rotateX: -78, y: 34, scale: 0.82, transformOrigin: "50% 100%" },
      exit: { ...animate, opacity: 0, rotateX: 72, y: -28, scale: 0.84, transformOrigin: "50% 0%" },
    },
    wipe: {
      initial: { ...animate, opacity: 1, x: -54, clipPath: "inset(0% 100% 0% 0% round 28px)" },
      exit: { ...animate, opacity: 1, x: 54, clipPath: "inset(0% 0% 0% 100% round 28px)" },
    },
    drift: {
      initial: { ...animate, opacity: 0, x: 150, y: -110, rotateZ: 8, skewX: -5, scale: 0.74 },
      exit: { ...animate, opacity: 0, x: -130, y: 100, rotateZ: -7, skewX: 4, scale: 0.82 },
    },
  } as const;

  return { ...transitions[transition], animate, duration: transition === "wipe" ? 0.82 : 0.72 };
}

function MuralSceneTitle({ title, layout }: { title: string; layout: MuralGallerySlide["layout"] }) {
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const titleNode = titleRef.current;
    const slideNode = titleNode?.closest<HTMLElement>(".mural-3d-gallery-slide");
    if (!titleNode || !slideNode) return;
    let animationFrame = 0;

    const fitTitle = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        titleNode.style.removeProperty("font-size");
        const maximum = Number.parseFloat(window.getComputedStyle(titleNode).fontSize);
        if (!Number.isFinite(maximum) || titleNode.clientWidth === 0) return;
        const compact = slideNode.clientWidth < 680;
        const minimum = compact ? 26 : 38;
        const maximumHeight = slideNode.clientHeight * (layout === "cinematic" ? (compact ? 0.27 : 0.43) : (compact ? 0.48 : 0.56));
        let size = maximum;
        titleNode.style.fontSize = `${size}px`;
        while ((titleNode.scrollWidth > titleNode.clientWidth + 1 || titleNode.scrollHeight > maximumHeight) && size > minimum) {
          size -= 1;
          titleNode.style.fontSize = `${size}px`;
        }
      });
    };

    fitTitle();
    const observer = new ResizeObserver(fitTitle);
    observer.observe(slideNode);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
    };
  }, [layout, title]);

  return <h2 ref={titleRef}>{title}</h2>;
}

function Mural3DGallerySlide({
  slide,
  index,
  total,
  preview = false,
}: {
  slide: MuralGallerySlide;
  index: number;
  total: number;
  preview?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const paragraphs = (slide.body || "Agrega párrafos desde el editor para presentar hechos, ideas y conclusiones de forma clara.")
    .split(/\n\s*\n/)
    .filter(Boolean);
  const facts = slide.facts ?? [];
  const [activeIdea, setActiveIdea] = useState(0);
  const [imageDetailsOpen, setImageDetailsOpen] = useState(false);
  const guidedReading = (slide.revealMode ?? "all") === "steps" && paragraphs.length > 1;
  const visibleIdea = Math.min(activeIdea, paragraphs.length - 1);
  const visibleParagraphs = guidedReading ? [paragraphs[visibleIdea] ?? paragraphs[0]] : paragraphs;
  const sceneStyle = {
    "--gallery-accent": slide.accentColor,
    "--gallery-image-x": `${slide.imagePositionX}%`,
    "--gallery-image-y": `${slide.imagePositionY}%`,
    "--gallery-depth": slide.depth,
  } as CSSProperties;

  return (
    <article
      className={`mural-3d-gallery-slide layout-${slide.layout} scene-${slide.sceneStyle ?? "aurora"} depth-${slide.depth} ${slide.imageUrl ? "has-image" : "no-image"} ${preview ? "is-preview" : ""}`}
      style={sceneStyle}
    >
      <div className="mural-3d-orbit" aria-hidden="true"><i /><i /><i /></div>
      <div className="mural-3d-backdrop" aria-hidden="true"><i /><i /><i /></div>
      {slide.layout !== "cinematic" && <div className="mural-3d-image-plane">
          {slide.imageUrl ? (
            <div role="img" aria-label={slide.title} style={{ backgroundImage: `url(${slide.imageUrl})` }} />
          ) : (
            <div className="mural-3d-placeholder" aria-hidden="true"><Layers3 /><span>CEHF</span></div>
          )}
          <i aria-hidden="true" />
          {slide.layout === "split" && (slide.caption || facts.length > 0) && <button type="button" className="mural-image-explore-button" onClick={() => setImageDetailsOpen((current) => !current)} aria-expanded={imageDetailsOpen}><Eye size={16} />{imageDetailsOpen ? "Cerrar detalle" : "Explorar imagen"}</button>}
          <AnimatePresence>{slide.layout === "split" && imageDetailsOpen && <motion.aside className="mural-image-detail-panel" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: reduceMotion ? 0 : 0.28 }}><strong>{slide.title}</strong>{slide.caption && <p>{slide.caption}</p>}{facts.length > 0 && <div>{facts.map((fact, factIndex) => <span key={`${factIndex}-${fact}`}>{fact}</span>)}</div>}</motion.aside>}</AnimatePresence>
        </div>}
      <div className="mural-3d-copy">
        <span className="mural-3d-kicker"><i />{slide.kicker || "EXPOSICIÓN CEHF"}</span>
        <MuralSceneTitle title={slide.title} layout={slide.layout} />
        {slide.caption && <p>{slide.caption}</p>}
      </div>
      {slide.layout === "focus" && facts.length > 0 && <div className="mural-scene-facts" aria-label="Ideas clave">{facts.map((fact, factIndex) => <motion.span key={`${factIndex}-${fact}`} initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduceMotion ? 0 : 0.32 + factIndex * 0.08 }}>{fact}</motion.span>)}</div>}
      {slide.layout === "cinematic" && (
        <section className="mural-3d-editorial-panel">
          {slide.contentKicker && <span>{slide.contentKicker}</span>}
          <h3>{slide.contentTitle || "Desarrolla el tema"}</h3>
          {slide.contentSubtitle && <h4>{slide.contentSubtitle}</h4>}
          {guidedReading && <div className="mural-guided-status"><span>IDEA {visibleIdea + 1} DE {paragraphs.length}</span><div>{paragraphs.map((_, ideaIndex) => <i key={ideaIndex} className={ideaIndex === visibleIdea ? "active" : ""} />)}</div></div>}
          <div className="mural-3d-editorial-body"><AnimatePresence mode="wait" initial={false}>{visibleParagraphs.map((paragraph, paragraphIndex) => <motion.p key={guidedReading ? `${visibleIdea}-${paragraph}` : `${paragraphIndex}-${paragraph}`} initial={{ opacity: 0, x: reduceMotion ? 0 : 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduceMotion ? 0 : -10 }} transition={{ duration: reduceMotion ? 0 : 0.28 }}>{paragraph}</motion.p>)}</AnimatePresence></div>
          {facts.length > 0 && <div className="mural-editorial-facts">{facts.map((fact, factIndex) => <span key={`${factIndex}-${fact}`}>{fact}</span>)}</div>}
          {guidedReading && <div className="mural-guided-controls"><button type="button" onClick={() => setActiveIdea(Math.max(0, visibleIdea - 1))} disabled={visibleIdea === 0}><ChevronLeft size={15} />Idea anterior</button><button type="button" className="primary" onClick={() => setActiveIdea(visibleIdea >= paragraphs.length - 1 ? 0 : visibleIdea + 1)}><ListChecks size={15} />{visibleIdea >= paragraphs.length - 1 ? "Reiniciar recorrido" : "Siguiente idea"}<ChevronRight size={15} /></button></div>}
        </section>
      )}
      <div className="mural-3d-number" aria-hidden="true"><span>{String(index).padStart(2, "0")}</span><i />{String(total).padStart(2, "0")}</div>
      <span className="mural-3d-watermark" aria-hidden="true">ENTRE LÍNEAS</span>
    </article>
  );
}

function MuralImmersiveView({
  edition,
  onClose,
}: {
  edition: MuralEdition;
  onClose: () => void;
}) {
  const [activeSlide, setActiveSlide] = useState(0);
  const reduceMotion = useReducedMotion();
  const gallerySlides = edition.gallerySlides?.length ? edition.gallerySlides : defaultMuralGallerySlides;
  const slideCount = gallerySlides.length + 1;
  const cover = edition.cover;
  const immersiveStyle = {
    "--mural-cover-bg": cover.backgroundColor,
    "--mural-cover-accent": cover.accentColor,
    "--mural-cover-text": cover.textColor,
  } as CSSProperties;

  const move = useCallback((delta: number) => {
    setActiveSlide((current) => (current + delta + slideCount) % slideCount);
  }, [slideCount]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") {
        event.preventDefault();
        move(1);
      }
      if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        move(-1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [move, onClose]);

  useEffect(() => {
    let enteredNativeFullscreen = Boolean(document.fullscreenElement);
    const onFullscreenChange = () => {
      if (document.fullscreenElement) enteredNativeFullscreen = true;
      else if (enteredNativeFullscreen) onClose();
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [onClose]);

  const activeGallerySlide = activeSlide > 0 ? gallerySlides[activeSlide - 1] : undefined;
  const galleryMotion = muralSceneMotion(activeGallerySlide?.transition ?? "orbit", Boolean(reduceMotion));
  const closeImmersive = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
    onClose();
  };

  return (
    <motion.section
      className="mural-immersive-shell"
      style={immersiveStyle}
      role="dialog"
      aria-modal="true"
      aria-label={`Exposición virtual del Periódico mural · ${edition.periodLabel}`}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.28 }}
    >
      <div className="mural-immersive-ambient" aria-hidden="true"><i /><i /><i /></div>
      <header className="mural-immersive-header">
        <div className="mural-immersive-brand"><span>CE</span><i /><div><strong>Exposición virtual</strong><small>{edition.periodLabel} · {edition.group}</small></div></div>
        <div className="mural-immersive-progress"><span>{activeSlide + 1} / {slideCount}</span><div><i style={{ width: `${((activeSlide + 1) / slideCount) * 100}%` }} /></div></div>
        <div className="mural-immersive-header-actions">
          <button type="button" onClick={closeImmersive} aria-label="Salir del modo inmersivo"><X size={18} />Salir</button>
        </div>
      </header>

      <main className="mural-immersive-stage" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          {activeSlide === 0 ? (
            <motion.div
              className="mural-immersive-cover-wrap"
              key="immersive-cover"
              initial={{ opacity: 0, x: reduceMotion ? 0 : 36 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: reduceMotion ? 0 : -36 }}
              transition={{ duration: reduceMotion ? 0 : 0.38, ease: [0.22, 1, 0.36, 1] }}
            >
              <MuralEditionCover edition={edition} onExplore={() => move(1)} />
            </motion.div>
          ) : activeGallerySlide ? (
            <motion.div
              className="mural-immersive-gallery-wrap"
              key={activeGallerySlide.id}
              drag={reduceMotion ? false : "x"}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.16}
              onDragEnd={(_, info) => {
                if (Math.abs(info.offset.x) > 70) move(info.offset.x < 0 ? 1 : -1);
              }}
              initial={galleryMotion.initial}
              animate={galleryMotion.animate}
              exit={galleryMotion.exit}
              transition={{ duration: galleryMotion.duration, ease: [0.16, 1, 0.3, 1] }}
            >
              <Mural3DGallerySlide slide={activeGallerySlide} index={activeSlide} total={gallerySlides.length} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </main>

      <footer className="mural-immersive-controls">
        <button type="button" onClick={() => move(-1)} aria-label="Diapositiva anterior"><ChevronLeft size={19} />Anterior</button>
        <nav aria-label="Escenas de la exposición">
          {Array.from({ length: slideCount }, (_, index) => (
            <button type="button" key={index} className={activeSlide === index ? "active" : ""} onClick={() => setActiveSlide(index)} aria-label={index === 0 ? "Ver portada" : `Ver escena ${index}`} aria-current={activeSlide === index ? "true" : undefined}><i /></button>
          ))}
        </nav>
        <button type="button" onClick={() => move(1)}>Siguiente<ChevronRight size={19} /></button>
      </footer>
      <span className="mural-immersive-keyhint"><kbd>←</kbd><kbd>→</kbd> navegar <i /><kbd>ESC</kbd> salir</span>
    </motion.section>
  );
}

function MuralEditionEditor({
  edition,
  profile,
  accounts,
  groups,
  busy,
  onClose,
  onSave,
}: {
  edition: MuralEdition;
  profile: UserProfile;
  accounts: ManagedAccount[];
  groups: string[];
  busy: boolean;
  onClose: () => void;
  onSave: (input: MuralEditionInput, image: File | null, galleryImages: Record<string, File>) => Promise<void>;
}) {
  const canAssign = profile.role === "director";
  const reduceMotion = useReducedMotion();
  const [tab, setTab] = useState<"assignment" | "content" | "design" | "image" | "gallery">(
    canAssign ? "assignment" : "content",
  );
  const [draft, setDraft] = useState<MuralEditionInput>(() => editionToInput(edition));
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | undefined>(edition.cover.imageUrl);
  const [galleryImages, setGalleryImages] = useState<Record<string, File>>({});
  const [galleryPreviews, setGalleryPreviews] = useState<Record<string, string>>(() => Object.fromEntries((edition.gallerySlides ?? []).map((slide) => [slide.id, slide.imageUrl ?? ""])));
  const [selectedSlideId, setSelectedSlideId] = useState(() => draft.gallerySlides[0]?.id ?? "");
  const [transitionPreviewRun, setTransitionPreviewRun] = useState(0);
  const generatedPreviewUrls = useRef(new Set<string>());
  const [error, setError] = useState("");
  const teachers = accounts.filter((account) => account.role === "teacher" && account.active);
  const coverField = <Key extends keyof MuralEditionInput["cover"]>(
    key: Key,
    value: MuralEditionInput["cover"][Key],
  ) => setDraft((previous) => ({
    ...previous,
    cover: { ...previous.cover, [key]: value },
  }));
  const selectedTeacher = teachers.find((teacher) => teacher.uid === draft.teacherId);
  const selectedSlideIndex = Math.max(0, draft.gallerySlides.findIndex((slide) => slide.id === selectedSlideId));
  const selectedSlide = draft.gallerySlides[selectedSlideIndex];
  const galleryPreviewMotion = muralSceneMotion(selectedSlide?.transition ?? "orbit", Boolean(reduceMotion));
  const gallerySlideField = <Key extends keyof MuralEditionInput["gallerySlides"][number]>(
    key: Key,
    value: MuralEditionInput["gallerySlides"][number][Key],
  ) => setDraft((previous) => ({
    ...previous,
    gallerySlides: previous.gallerySlides.map((slide) => slide.id === selectedSlideId ? { ...slide, [key]: value } : slide),
  }));
  const previewEdition: MuralEdition = {
    ...edition,
    periodType: draft.periodType,
    periodLabel: draft.periodType === "month" ? muralMonthLabel(draft.month) : draft.seasonName || "Nueva temporada",
    month: draft.month,
    seasonName: draft.seasonName,
    group: draft.group,
    teacherId: draft.teacherId,
    teacherName: selectedTeacher?.name ?? draft.teacherName,
    cover: { ...draft.cover, imageUrl: imagePreview },
    gallerySlides: draft.gallerySlides.map((slide) => ({ ...slide, imageUrl: galleryPreviews[slide.id] })),
  };

  useEffect(() => () => {
    generatedPreviewUrls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const chooseImage = (file?: File) => {
    if (!file) return;
    if (!(["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(file.type)) || file.size >= 8 * 1024 * 1024) {
      setError("Selecciona una imagen JPG, PNG o WEBP menor a 8 MB.");
      return;
    }
    setError("");
    setImage(file);
    const previewUrl = URL.createObjectURL(file);
    generatedPreviewUrls.current.add(previewUrl);
    setImagePreview(previewUrl);
  };

  const chooseGalleryImage = (file?: File) => {
    if (!file || !selectedSlide) return;
    if (!( ["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(file.type)) || file.size >= 8 * 1024 * 1024) {
      setError("Selecciona una imagen JPG, PNG o WEBP menor a 8 MB.");
      return;
    }
    setError("");
    const previewUrl = URL.createObjectURL(file);
    generatedPreviewUrls.current.add(previewUrl);
    setGalleryImages((previous) => ({ ...previous, [selectedSlide.id]: file }));
    setGalleryPreviews((previous) => ({ ...previous, [selectedSlide.id]: previewUrl }));
  };

  const addGallerySlide = () => {
    if (draft.gallerySlides.length >= muralGalleryLimits.slides) return;
    const template = defaultMuralGallerySlides[draft.gallerySlides.length % defaultMuralGallerySlides.length];
    const slide = { ...template, id: `gallery-${crypto.randomUUID()}`, imagePath: "" };
    setDraft((previous) => ({ ...previous, gallerySlides: [...previous.gallerySlides, slide] }));
    setSelectedSlideId(slide.id);
    setTab("gallery");
  };

  const moveGallerySlide = (delta: number) => {
    if (!selectedSlide) return;
    const nextIndex = selectedSlideIndex + delta;
    if (nextIndex < 0 || nextIndex >= draft.gallerySlides.length) return;
    setDraft((previous) => {
      const slides = [...previous.gallerySlides];
      [slides[selectedSlideIndex], slides[nextIndex]] = [slides[nextIndex], slides[selectedSlideIndex]];
      return { ...previous, gallerySlides: slides };
    });
  };

  const removeGallerySlide = () => {
    if (!selectedSlide || draft.gallerySlides.length === 1) return;
    const nextSlides = draft.gallerySlides.filter((slide) => slide.id !== selectedSlide.id);
    setDraft((previous) => ({ ...previous, gallerySlides: nextSlides }));
    setGalleryImages((previous) => { const next = { ...previous }; delete next[selectedSlide.id]; return next; });
    setGalleryPreviews((previous) => { const next = { ...previous }; delete next[selectedSlide.id]; return next; });
    setSelectedSlideId(nextSlides[Math.min(selectedSlideIndex, nextSlides.length - 1)].id);
  };

  const coverTabs = [
    ...(canAssign ? [{ id: "assignment" as const, label: "Edición", icon: CalendarDays }] : []),
    { id: "content" as const, label: "Textos", icon: Type },
    { id: "design" as const, label: "Diseño", icon: Palette },
    { id: "image" as const, label: "Imagen", icon: Camera },
  ];

  return (
    <motion.div
      className="modal-backdrop mural-studio-backdrop"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}
    >
      <motion.form
        className="mural-studio"
        role="dialog"
        aria-modal="true"
        aria-label="Estudio del Periódico mural"
        initial={{ opacity: 0, y: 20, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12 }}
        onSubmit={(event) => {
          event.preventDefault();
          const teacherName = selectedTeacher?.name ?? draft.teacherName;
          const result = muralEditionSchema.safeParse({ ...draft, teacherName });
          if (!result.success) {
            setError(result.error.issues[0]?.message ?? "Revisa la configuración de la edición.");
            return;
          }
          setError("");
          void onSave(result.data, image, galleryImages);
        }}
      >
        <header className="mural-studio-header">
          <div><span className="eyebrow">ESTUDIO DEL MURAL</span><h2>Portada y exposición</h2><p>Diseña la entrada del periódico y construye una exposición virtual por escenas.</p></div>
          <button className="plain-icon" type="button" onClick={onClose} disabled={busy} aria-label="Cerrar"><X size={20} /></button>
        </header>
        <div className="mural-studio-body">
          <aside className="mural-studio-controls">
            <nav className="mural-studio-tabs" aria-label="Áreas del estudio del mural">
              <div className={`mural-studio-tab-group mural-studio-cover-tabs ${canAssign ? "" : "three"}`}><span>PORTADA</span><div>
                {coverTabs.map(({ id, label, icon: Icon }) => (
                  <button type="button" key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}><Icon size={15} />{label}</button>
                ))}
              </div></div>
              <div className="mural-studio-tab-group mural-studio-exhibit-tab"><span>CONTENIDO INMERSIVO</span><button type="button" className={tab === "gallery" ? "active" : ""} onClick={() => setTab("gallery")}><Presentation size={15} />Exposición virtual</button></div>
            </nav>
            {error && <div className="mural-form-error" role="alert"><AlertCircle size={16} />{error}</div>}

            {tab === "assignment" && canAssign && (
              <div className="mural-studio-panel">
                <div className="mural-control-heading"><Settings2 size={17} /><div><strong>Responsables de la edición</strong><span>Sólo Dirección puede modificar esta asignación.</span></div></div>
                <label>Tipo de periodo<div className="mural-choice-row"><button type="button" className={draft.periodType === "month" ? "active" : ""} onClick={() => setDraft((current) => ({ ...current, periodType: "month" }))}>Mes</button><button type="button" className={draft.periodType === "season" ? "active" : ""} onClick={() => setDraft((current) => ({ ...current, periodType: "season" }))}>Temporada</button></div></label>
                <label>{draft.periodType === "month" ? "Mes de publicación" : "Año de referencia"}<input type="month" value={draft.month} onChange={(event) => setDraft((current) => ({ ...current, month: event.target.value }))} /></label>
                {draft.periodType === "season" && <label>Nombre de la temporada<input value={draft.seasonName} maxLength={muralCoverLimits.seasonName} onChange={(event) => setDraft((current) => ({ ...current, seasonName: event.target.value }))} placeholder="Ej. Navidad, Cuaresma o Semana cultural" /></label>}
                <label>Grupo responsable<select value={draft.group} onChange={(event) => setDraft((current) => ({ ...current, group: event.target.value }))}>{groups.map((item) => <option key={item}>{item}</option>)}</select></label>
                <label>Maestra encargada<select value={draft.teacherId} onChange={(event) => { const teacher = teachers.find((item) => item.uid === event.target.value); setDraft((current) => ({ ...current, teacherId: event.target.value, teacherName: teacher?.name ?? "" })); }}><option value="">Selecciona una maestra</option>{teachers.map((teacher) => <option value={teacher.uid} key={teacher.uid}>{teacher.name}</option>)}</select></label>
                <div className="mural-assignment-note"><ShieldCheck size={17} /><span><strong>Permisos automáticos</strong>La maestra asignada podrá revisar, solicitar cambios, publicar y diseñar esta portada.</span></div>
              </div>
            )}

            {tab === "content" && (
              <div className="mural-studio-panel">
                <div className="mural-control-heading"><Type size={17} /><div><strong>Contenido de portada</strong><span>Textos breves, claros y con jerarquía editorial.</span></div></div>
                <label>Antetítulo<input value={draft.cover.kicker} maxLength={muralCoverLimits.kicker} onChange={(event) => coverField("kicker", event.target.value)} /><small>{draft.cover.kicker.length}/{muralCoverLimits.kicker}</small></label>
                <label>Título principal<textarea value={draft.cover.title} maxLength={muralCoverLimits.title} onChange={(event) => coverField("title", event.target.value)} /><small>{draft.cover.title.length}/{muralCoverLimits.title}</small></label>
                <label>Presentación<textarea value={draft.cover.description} maxLength={muralCoverLimits.description} onChange={(event) => coverField("description", event.target.value)} /><small>{draft.cover.description.length}/{muralCoverLimits.description}</small></label>
                <div className="mural-control-grid"><label>Insignia<input value={draft.cover.badge} maxLength={muralCoverLimits.badge} onChange={(event) => coverField("badge", event.target.value)} /></label><label>Texto del botón<input value={draft.cover.ctaLabel} maxLength={muralCoverLimits.ctaLabel} onChange={(event) => coverField("ctaLabel", event.target.value)} /></label></div>
                <div className="mural-toggle-stack"><label><input type="checkbox" checked={draft.cover.showBadge} onChange={(event) => coverField("showBadge", event.target.checked)} /><span><strong>Mostrar insignia</strong><small>Destaca que se trata de una nueva edición.</small></span></label><label><input type="checkbox" checked={draft.cover.showManager} onChange={(event) => coverField("showManager", event.target.checked)} /><span><strong>Mostrar responsables</strong><small>Incluye periodo, grupo y maestra en la portada.</small></span></label></div>
              </div>
            )}

            {tab === "design" && (
              <div className="mural-studio-panel">
                <div className="mural-control-heading"><Brush size={17} /><div><strong>Dirección de arte</strong><span>Composición, color, tipografía y ritmo visual.</span></div></div>
                <div className="mural-gradient-control">
                  <div className="mural-gradient-heading"><span>Degradados editoriales</span><small>Campus es el estilo predeterminado.</small></div>
                  <div className="mural-gradient-grid">
                    {muralCoverGradients.map((item) => {
                      const gradient = coverGradientStyles[item];
                      return (
                        <button
                          type="button"
                          key={item}
                          className={draft.cover.gradientPreset === item ? "active" : ""}
                          onClick={() => coverField("gradientPreset", item)}
                          aria-pressed={draft.cover.gradientPreset === item}
                          title={gradient.description}
                        >
                          <i style={{ background: gradient.background }}><span style={{ background: gradient.title }} /></i>
                          <em>{gradient.name}</em>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mural-toggle-stack mural-gradient-toggles">
                    <label><input type="checkbox" checked={draft.cover.useTitleGradient} onChange={(event) => coverField("useTitleGradient", event.target.checked)} /><span><strong>Degradado en el título</strong><small>Aplica el color al título principal.</small></span></label>
                    <label><input type="checkbox" checked={draft.cover.useBackgroundGradient} onChange={(event) => coverField("useBackgroundGradient", event.target.checked)} /><span><strong>Fondo degradado</strong><small>Puede desactivarse para usar un color sólido.</small></span></label>
                  </div>
                </div>
                <label>Paletas de color sólido<div className="mural-palette-grid">{coverPalettes.map((palette) => <button type="button" key={palette.name} className={!draft.cover.useBackgroundGradient && draft.cover.backgroundColor === palette.backgroundColor ? "active" : ""} onClick={() => setDraft((current) => ({ ...current, cover: { ...current.cover, backgroundColor: palette.backgroundColor, accentColor: palette.accentColor, textColor: palette.textColor, useBackgroundGradient: false } }))}><i style={{ background: palette.backgroundColor }}><span style={{ background: palette.accentColor }} /></i><em>{palette.name}</em></button>)}</div></label>
                <div className="mural-color-row"><label>Fondo<span><input type="color" value={draft.cover.backgroundColor} onChange={(event) => coverField("backgroundColor", event.target.value)} /><code>{draft.cover.backgroundColor}</code></span></label><label>Acento<span><input type="color" value={draft.cover.accentColor} onChange={(event) => coverField("accentColor", event.target.value)} /><code>{draft.cover.accentColor}</code></span></label><label>Texto<span><input type="color" value={draft.cover.textColor} onChange={(event) => coverField("textColor", event.target.value)} /><code>{draft.cover.textColor}</code></span></label></div>
                <label>Composición<div className="mural-option-grid three">{muralCoverLayouts.map((item) => <button type="button" key={item} className={draft.cover.layout === item ? "active" : ""} onClick={() => coverField("layout", item)}><span className={`layout-icon ${item}`}><i /><i /></span>{coverLayoutLabels[item]}</button>)}</div></label>
                <label>Personalidad tipográfica<div className="mural-option-grid three">{muralCoverFonts.map((item) => <button type="button" key={item} className={`${draft.cover.font === item ? "active" : ""} font-${item}`} onClick={() => coverField("font", item)}>Aa<small>{coverFontLabels[item]}</small></button>)}</div></label>
                <label>Elementos gráficos · 20 estilos<div className="mural-option-grid mural-motif-grid">{muralCoverMotifs.map((item) => <button type="button" key={item} className={draft.cover.motif === item ? "active" : ""} onClick={() => coverField("motif", item)}><span className={`mural-motif-swatch ${item}`} aria-hidden="true">{Array.from({ length: MURAL_GRAPHIC_PARTS }, (_, index) => <i key={index} />)}</span><small>{coverMotifLabels[item]}</small></button>)}</div></label>
                <button type="button" className="mural-reset-button" onClick={() => setDraft((current) => ({ ...current, cover: { ...defaultMuralCover, imagePath: current.cover.imagePath } }))}><RotateCcw size={14} />Restaurar estilo base</button>
              </div>
            )}

            {tab === "image" && (
              <div className="mural-studio-panel">
                <div className="mural-control-heading"><Camera size={17} /><div><strong>Imagen de portada</strong><span>JPG, PNG o WEBP · máximo 8 MB.</span></div></div>
                <label className="mural-image-drop"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseImage(event.target.files?.[0])} /><Upload size={22} /><strong>{imagePreview ? "Cambiar imagen" : "Subir una imagen"}</strong><span>Elige una fotografía horizontal y nítida.</span></label>
                {imagePreview && <div className="mural-image-mini" style={{ backgroundImage: `url(${imagePreview})` }}><button type="button" onClick={() => { setImage(null); setImagePreview(""); coverField("imagePath", ""); }}><X size={14} />Quitar</button></div>}
                <label className="mural-range-label"><span><strong>Enfoque horizontal</strong><small>{draft.cover.imagePositionX}%</small></span><input type="range" min="0" max="100" value={draft.cover.imagePositionX} onChange={(event) => coverField("imagePositionX", Number(event.target.value))} /></label>
                <label className="mural-range-label"><span><strong>Enfoque vertical</strong><small>{draft.cover.imagePositionY}%</small></span><input type="range" min="0" max="100" value={draft.cover.imagePositionY} onChange={(event) => coverField("imagePositionY", Number(event.target.value))} /></label>
                <label className="mural-range-label"><span><strong>Contraste sobre la imagen</strong><small>{draft.cover.overlayOpacity}%</small></span><input type="range" min="0" max="85" value={draft.cover.overlayOpacity} onChange={(event) => coverField("overlayOpacity", Number(event.target.value))} /></label>
                <div className="mural-image-tip"><SlidersHorizontal size={17} /><span>Usa el contraste para mantener el texto legible cuando la imagen tenga zonas claras.</span></div>
              </div>
            )}

            {tab === "gallery" && selectedSlide && (
              <div className="mural-studio-panel mural-gallery-editor">
                <div className="mural-exhibit-intro"><Presentation size={22} /><div><strong>Contenido de la exposición</strong><span>Construye un recorrido virtual para presentar historia, ciencia, celebraciones, arte o proyectos.</span></div></div>
                <div className="mural-gallery-slide-rail" aria-label="Escenas de la exposición">
                  {draft.gallerySlides.map((slide, index) => (
                    <button type="button" key={slide.id} className={slide.id === selectedSlide.id ? "active" : ""} onClick={() => setSelectedSlideId(slide.id)}>
                      <span style={galleryPreviews[slide.id] ? { backgroundImage: `url(${galleryPreviews[slide.id]})` } : { background: `linear-gradient(145deg, #111744, ${slide.accentColor})` }}>{index + 1}</span>
                      <small>{slide.title || `Escena ${index + 1}`}</small>
                    </button>
                  ))}
                  <button type="button" className="add" onClick={addGallerySlide} disabled={draft.gallerySlides.length >= muralGalleryLimits.slides}><ImagePlus size={17} /><small>Agregar</small></button>
                </div>
                <div className="mural-gallery-editor-actions">
                  <span>Escena {selectedSlideIndex + 1} de {draft.gallerySlides.length}</span>
                  <div>
                    <button type="button" onClick={() => moveGallerySlide(-1)} disabled={selectedSlideIndex === 0} aria-label="Mover antes"><ChevronLeft size={15} /></button>
                    <button type="button" onClick={() => moveGallerySlide(1)} disabled={selectedSlideIndex === draft.gallerySlides.length - 1} aria-label="Mover después"><ChevronRight size={15} /></button>
                    <button type="button" className="danger" onClick={removeGallerySlide} disabled={draft.gallerySlides.length === 1} aria-label="Eliminar escena"><Trash2 size={15} /></button>
                  </div>
                </div>
                <div className="mural-exhibit-section-label"><span>01</span><div><strong>Historia de la escena</strong><small>Define qué aprenderá o descubrirá el visitante.</small></div></div>
                <label>Antetítulo<input value={selectedSlide.kicker} maxLength={muralGalleryLimits.kicker} onChange={(event) => gallerySlideField("kicker", event.target.value)} /><small>{selectedSlide.kicker.length}/{muralGalleryLimits.kicker}</small></label>
                <label>Título principal<textarea value={selectedSlide.title} maxLength={muralGalleryLimits.title} onChange={(event) => gallerySlideField("title", event.target.value)} /><small>{selectedSlide.title.length}/{muralGalleryLimits.title}</small></label>
                <label>Introducción breve<textarea value={selectedSlide.caption} maxLength={muralGalleryLimits.caption} onChange={(event) => gallerySlideField("caption", event.target.value)} /><small>{selectedSlide.caption.length}/{muralGalleryLimits.caption}</small></label>
                <label>Tipo de escena<div className="mural-option-grid three mural-gallery-type-grid">{muralGalleryLayouts.map((layout) => <button type="button" key={layout} className={selectedSlide.layout === layout ? "active" : ""} onClick={() => gallerySlideField("layout", layout)}><span className={`gallery-layout-icon ${layout}`}><i /><i /></span><small>{layout === "focus" ? "Apertura visual" : layout === "split" ? "Imagen comentada" : "Tema desarrollado"}</small></button>)}</div></label>
                {selectedSlide.layout !== "cinematic" && <>
                  <label className="mural-image-drop compact"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseGalleryImage(event.target.files?.[0])} /><Upload size={20} /><strong>{galleryPreviews[selectedSlide.id] ? "Cambiar imagen de la escena" : "Subir imagen a la escena"}</strong><span>JPG, PNG o WEBP · máximo 8 MB</span></label>
                  {galleryPreviews[selectedSlide.id] && <button type="button" className="mural-gallery-remove-image" onClick={() => { setGalleryImages((previous) => { const next = { ...previous }; delete next[selectedSlide.id]; return next; }); setGalleryPreviews((previous) => ({ ...previous, [selectedSlide.id]: "" })); gallerySlideField("imagePath", ""); }}><X size={13} />Quitar imagen</button>}
                </>}
                {selectedSlide.layout === "cinematic" && <div className="mural-gallery-content-fields">
                  <div className="mural-control-heading"><Type size={16} /><div><strong>Contenido del lado derecho</strong><span>Ideal para exponer historia, celebraciones, ciencia o proyectos.</span></div></div>
                  <label>Sección<input value={selectedSlide.contentKicker} maxLength={muralGalleryLimits.contentKicker} onChange={(event) => gallerySlideField("contentKicker", event.target.value)} placeholder="Ej. Momento histórico" /><small>{selectedSlide.contentKicker.length}/{muralGalleryLimits.contentKicker}</small></label>
                  <label>Título del contenido<input value={selectedSlide.contentTitle} maxLength={muralGalleryLimits.contentTitle} onChange={(event) => gallerySlideField("contentTitle", event.target.value)} placeholder="El inicio de un nuevo país" /><small>{selectedSlide.contentTitle.length}/{muralGalleryLimits.contentTitle}</small></label>
                  <label>Subtítulo<textarea value={selectedSlide.contentSubtitle} maxLength={muralGalleryLimits.contentSubtitle} onChange={(event) => gallerySlideField("contentSubtitle", event.target.value)} placeholder="Una frase que introduzca el tema." /><small>{selectedSlide.contentSubtitle.length}/{muralGalleryLimits.contentSubtitle}</small></label>
                  <label>Párrafos<textarea className="mural-gallery-body-input" value={selectedSlide.body} maxLength={muralGalleryLimits.body} onChange={(event) => gallerySlideField("body", event.target.value)} placeholder={"Escribe el desarrollo del tema.\n\nSepara cada párrafo con una línea en blanco."} /><small>{selectedSlide.body.length}/{muralGalleryLimits.body}</small></label>
                </div>}
                <label>Datos clave · uno por línea<textarea value={selectedSlide.facts.join("\n")} maxLength={muralGalleryLimits.facts * muralGalleryLimits.fact} onChange={(event) => gallerySlideField("facts", event.target.value.split("\n").map((fact) => fact.trim().slice(0, muralGalleryLimits.fact)).filter(Boolean).slice(0, muralGalleryLimits.facts))} placeholder={"1810 · Inicio del movimiento\n1821 · Consumación\nLibertad e identidad"} /><small>{selectedSlide.facts.length}/{muralGalleryLimits.facts} datos</small></label>

                <div className="mural-exhibit-section-label"><span>02</span><div><strong>Dirección escénica</strong><small>Personaliza la atmósfera y la forma de presentar el contenido.</small></div></div>
                <label>Atmósfera visual<div className="mural-scene-style-grid">{muralSceneStyles.map((sceneStyle) => <button type="button" key={sceneStyle} className={`${selectedSlide.sceneStyle === sceneStyle ? "active" : ""} scene-${sceneStyle}`} onClick={() => gallerySlideField("sceneStyle", sceneStyle)}><i /><span><strong>{muralSceneStyleLabels[sceneStyle].name}</strong><small>{muralSceneStyleLabels[sceneStyle].description}</small></span></button>)}</div></label>
                <label>Transición de entrada<div className="mural-transition-grid">{muralSceneTransitions.map((transition) => <button type="button" key={transition} className={selectedSlide.transition === transition ? "active" : ""} onClick={() => { gallerySlideField("transition", transition); setTransitionPreviewRun((current) => current + 1); }}><i className={transition} /><span><strong>{muralTransitionLabels[transition].name}</strong><small>{muralTransitionLabels[transition].description}</small></span></button>)}</div></label>
                {selectedSlide.layout === "cinematic" && <label>Forma de recorrer el contenido<div className="mural-choice-row">{muralRevealModes.map((mode) => <button type="button" key={mode} className={selectedSlide.revealMode === mode ? "active" : ""} onClick={() => gallerySlideField("revealMode", mode)}>{mode === "all" ? "Lectura completa" : "Recorrido guiado"}</button>)}</div><small>{selectedSlide.revealMode === "steps" ? "Presenta una idea a la vez con avance, retroceso y progreso visible." : "Muestra todos los párrafos juntos desde el inicio."}</small></label>}
                <div className="mural-color-row single"><label>Color de la escena<span><input type="color" value={selectedSlide.accentColor} onChange={(event) => gallerySlideField("accentColor", event.target.value)} /><code>{selectedSlide.accentColor}</code></span></label></div>
                {selectedSlide.layout !== "cinematic" && galleryPreviews[selectedSlide.id] && <label>Punto focal de la imagen<div className="mural-focus-picker" role="group" aria-label="Punto focal de la imagen">{[20, 50, 80].flatMap((vertical) => [20, 50, 80].map((horizontal) => <button type="button" key={`${horizontal}-${vertical}`} className={selectedSlide.imagePositionX === horizontal && selectedSlide.imagePositionY === vertical ? "active" : ""} onClick={() => setDraft((previous) => ({ ...previous, gallerySlides: previous.gallerySlides.map((slide) => slide.id === selectedSlide.id ? { ...slide, imagePositionX: horizontal, imagePositionY: vertical } : slide) }))} aria-label={`Enfocar imagen en ${horizontal === 20 ? "izquierda" : horizontal === 50 ? "centro" : "derecha"}, ${vertical === 20 ? "arriba" : vertical === 50 ? "centro" : "abajo"}`}><i /></button>))}</div><small>El punto marcado será el centro visible de la fotografía.</small></label>}
              </div>
            )}
          </aside>
          <section className="mural-studio-preview">
            <div className="mural-preview-heading"><span>{tab === "gallery" ? "VISTA PREVIA · EXPOSICIÓN" : "VISTA PREVIA · PORTADA"}</span><div className="mural-preview-meta"><small>{previewEdition.periodLabel} · {previewEdition.group}</small>{tab === "gallery" && <button type="button" onClick={() => setTransitionPreviewRun((current) => current + 1)}><RotateCcw size={13} />Repetir transición</button>}</div></div>
            {tab === "gallery" && selectedSlide ? (
              <div className="mural-gallery-editor-preview"><AnimatePresence mode="wait"><motion.div className="mural-gallery-preview-transition" key={`${selectedSlide.id}-${selectedSlide.transition}-${transitionPreviewRun}`} initial={galleryPreviewMotion.initial} animate={galleryPreviewMotion.animate} exit={galleryPreviewMotion.exit} transition={{ duration: galleryPreviewMotion.duration, ease: [0.16, 1, 0.3, 1] }}><Mural3DGallerySlide slide={{ ...selectedSlide, imageUrl: galleryPreviews[selectedSlide.id] }} index={selectedSlideIndex + 1} total={draft.gallerySlides.length} preview /></motion.div></AnimatePresence></div>
            ) : <MuralEditionCover edition={previewEdition} imagePreview={imagePreview} preview />}
            <div className="mural-preview-devices"><span><i />Escritorio</span><span><i />Adaptable a móvil</span></div>
          </section>
        </div>
        <footer className="mural-studio-footer">
          <span><CheckCircle2 size={16} />Los cambios se verán para toda la comunidad.</span>
          <div><button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Cancelar</button><button className="primary-button" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}Guardar y publicar edición</button></div>
        </footer>
      </motion.form>
    </motion.div>
  );
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
  accounts,
  firebaseReady,
}: {
  state: PortalState;
  updateState: (
    updater: (previous: PortalState) => PortalState,
    message?: string,
  ) => void;
  profile: UserProfile;
  accounts: ManagedAccount[];
  firebaseReady: boolean;
}) {
  const [workspace, setWorkspace] = useState<MuralWorkspace>(emptyWorkspace);
  const [edition, setEdition] = useState<MuralEdition>(() => state.muralEdition ?? defaultMuralEdition(profile));
  const [editionConfigured, setEditionConfigured] = useState(!firebaseReady);
  const [editionLoading, setEditionLoading] = useState(firebaseReady);
  const [editionEditorOpen, setEditionEditorOpen] = useState(false);
  const [immersiveOpen, setImmersiveOpen] = useState(false);
  const [editionSaving, setEditionSaving] = useState(false);
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

  useEffect(() => {
    if (!firebaseReady) return;
    return watchActiveMuralEdition(
      profile,
      (nextEdition) => {
        setEdition(nextEdition ?? defaultMuralEdition(profile));
        setEditionConfigured(Boolean(nextEdition));
        setEditionLoading(false);
      },
      (error) => {
        setEditionLoading(false);
        toast.error("No pudimos cargar la edición del mural", { description: error.message });
      },
    );
  }, [firebaseReady, profile, state.muralEdition]);

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
  const storyGroups = useMemo(
    () => [...new Set(publishedStories.map((story) => story.group).filter(Boolean))].sort((first, second) => first.localeCompare(second, "es")),
    [publishedStories],
  );
  const editionGroups = useMemo(() => {
    const standardGroups = ["1.º", "2.º", "3.º", "4.º", "5.º", "6.º"].flatMap((grade) =>
      ["A", "B", "C"].map((letter) => `${grade} ${letter}`),
    );
    const accountGroups = accounts
      .filter((account) => account.role === "student")
      .map((account) => `${account.grade ?? ""} ${account.group ?? ""}`.trim())
      .filter(Boolean);
    return [...new Set([...standardGroups, ...accountGroups, edition.group])].sort((first, second) => first.localeCompare(second, "es", { numeric: true }));
  }, [accounts, edition.group]);
  const activeTeachers = useMemo(
    () => accounts.filter((account) => account.role === "teacher" && account.active),
    [accounts],
  );
  const canManageEdition = profile.role === "director" || (
    profile.role === "teacher" && editionConfigured && edition.teacherId === profile.uid
  );
  const canReviewEdition = profile.role === "director" || (
    profile.role === "teacher" && (
      (editionConfigured && edition.teacherId === profile.uid) || reviewQueue.length > 0
    )
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

  const openEditionEditor = () => {
    if (!editionConfigured && profile.role === "director" && activeTeachers.length) {
      const firstTeacher = activeTeachers[0];
      setEdition((current) => ({
        ...current,
        teacherId: firstTeacher.uid,
        teacherName: firstTeacher.name,
        group: editionGroups.includes(current.group) ? current.group : editionGroups[0] ?? "1.º A",
      }));
    }
    setEditionEditorOpen(true);
  };

  const openImmersive = useCallback(() => {
    setImmersiveOpen(true);
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      void document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => undefined);
    }
  }, []);

  const closeImmersive = useCallback(() => {
    setImmersiveOpen(false);
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
  }, []);

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

  const saveEdition = async (input: MuralEditionInput, image: File | null, galleryImages: Record<string, File>) => {
    setEditionSaving(true);
    try {
      if (firebaseReady) {
        await saveMuralEdition(profile, input, image, galleryImages);
      } else {
        let imageUrl = input.cover.imagePath ? edition.cover.imageUrl : "";
        if (image) {
          imageUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result ?? ""));
            reader.onerror = () => reject(new Error("No pudimos leer la imagen seleccionada."));
            reader.readAsDataURL(image);
          });
        }
        const gallerySlides = await Promise.all(input.gallerySlides.map(async (slide) => {
          const galleryImage = galleryImages[slide.id];
          if (!galleryImage) {
            const currentSlide = edition.gallerySlides?.find((item) => item.id === slide.id);
            return { ...slide, imageUrl: slide.imagePath ? currentSlide?.imageUrl : "" };
          }
          const slideImageUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result ?? ""));
            reader.onerror = () => reject(new Error("No pudimos leer una imagen de la exposición."));
            reader.readAsDataURL(galleryImage);
          });
          return { ...slide, imageUrl: slideImageUrl };
        }));
        const teacher = accounts.find((account) => account.uid === input.teacherId);
        const periodLabel = input.periodType === "month" ? muralMonthLabel(input.month) : input.seasonName;
        const nextEdition: MuralEdition = {
          id: edition.id || `demo-edition-${input.month}`,
          institutionId: profile.institutionId,
          active: true,
          periodType: input.periodType,
          periodKey: input.periodType === "month" ? input.month : `${input.month.slice(0, 4)}-${normalizeSearch(input.seasonName).replace(/[^a-z0-9]+/g, "-")}`,
          periodLabel,
          month: input.month,
          seasonName: input.seasonName,
          group: input.group,
          teacherId: input.teacherId,
          teacherName: teacher?.name ?? input.teacherName,
          cover: { ...input.cover, imageUrl },
          gallerySlides,
          updatedAt: new Date().toISOString(),
          updatedBy: profile.uid,
          updatedByName: profile.name,
        };
        setEdition(nextEdition);
        setEditionConfigured(true);
        updateState((previous) => ({ ...previous, muralEdition: nextEdition }));
      }
      setEditionEditorOpen(false);
      toast.success("Edición y exposición actualizadas", {
        description: profile.role === "director"
          ? "La asignación y el diseño ya están visibles para la comunidad."
          : "El nuevo diseño ya está visible para la comunidad.",
      });
    } catch (error) {
      toast.error("No pudimos guardar la edición", { description: error instanceof Error ? error.message : undefined });
    } finally {
      setEditionSaving(false);
    }
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
      <section className="mural-edition-bar panel">
        <div className="mural-edition-identity">
          <span className="mural-edition-icon"><Newspaper size={19} /></span>
          <div><span>{editionLoading ? "ACTUALIZANDO EDICIÓN" : editionConfigured ? "EDICIÓN EN PORTADA" : "CONFIGURACIÓN INICIAL"}</span><strong>{edition.periodLabel}</strong></div>
        </div>
        <div className="mural-edition-team"><span>Grupo responsable<strong>{edition.group}</strong></span><i /><span>Edición y revisión<strong>{edition.teacherName}</strong></span></div>
        <div className="mural-edition-actions">
          <button className="secondary-button" onClick={openImmersive}><Maximize2 size={15} />Periódico Mural</button>
          {canManageEdition && <button className="primary-button" onClick={openEditionEditor}><Brush size={15} />{profile.role === "director" ? "Configurar edición" : "Diseñar portada"}</button>}
        </div>
        {profile.role === "director" && !editionConfigured && <span className="mural-edition-alert"><AlertCircle size={15} />Falta publicar la primera asignación</span>}
      </section>

      <MuralEditionCover
        edition={edition}
        featured={featured}
        onExplore={() => document.getElementById("mural-stories")?.scrollIntoView({ behavior: "smooth", block: "start" })}
        onOpenStory={setReaderPost}
      />

      {canReviewEdition && (
        <section className="mural-editorial-desk panel">
          <div className="mural-desk-heading">
            <div><span className="eyebrow">MESA EDITORIAL · {profile.role === "director" ? "DIRECCIÓN" : edition.group}</span><h2>Historias por revisar</h2><p>{profile.role === "director" ? `Edición a cargo de ${edition.teacherName}.` : "Tú administras las revisiones y publicaciones de esta edición."} Lee cada propuesta completa antes de decidir.</p></div>
            <span className="mural-pending-count">{reviewQueue.length}<small>pendientes</small></span>
          </div>
          {loading && !reviewQueue.length ? <div className="mural-review-empty"><LoaderCircle className="spin" size={22} />Actualizando bandeja…</div> : !reviewQueue.length ? <div className="mural-review-empty"><CheckCircle2 size={24} /><strong>La bandeja está al día</strong><span>Las nuevas historias aparecerán aquí.</span></div> : (
            <div className="mural-review-list">{reviewQueue.map((story) => (
              <article className="mural-review-card" key={story.id}>
                <div className={`wall-card-art ${story.accent}`}><span>{story.category}</span><Newspaper size={30} /></div>
                <div className="mural-review-copy">
                  <div><span>{story.section} · versión {story.version ?? 1}{story.editionLabel ? ` · ${story.editionLabel}` : ""}</span><h3>{story.title}</h3><p>Por {story.author} · {story.group} · {story.readingTime}</p></div>
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

      {profile.role === "teacher" && !canReviewEdition && (
        <section className="mural-not-assigned panel"><ShieldCheck size={22} /><div><span className="eyebrow">EQUIPO EDITORIAL</span><strong>{edition.teacherName} administra esta edición</strong><p>Dirección asignó {edition.periodLabel} al grupo {edition.group}. La bandeja de revisión sólo está disponible para su maestra responsable.</p></div></section>
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

      <section id="mural-stories" className="mural-discovery panel" aria-label="Buscar y filtrar historias">
        <label className="mural-search"><Search size={18} /><input type="search" value={queryText} onChange={(event) => { setQueryText(event.target.value); setPage(1); }} placeholder="Buscar por título, autor o palabra…" aria-label="Buscar historias" />{queryText && <button type="button" onClick={() => { setQueryText(""); setPage(1); }} aria-label="Borrar búsqueda"><X size={14} /></button>}</label>
        <label className="mural-filter"><span>Categoría</span><select value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}><option value="all">Todas</option>{muralCategories.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={14} /></label>
        <label className="mural-filter"><span>Grupo</span><select value={group} onChange={(event) => { setGroup(event.target.value); setPage(1); }}><option value="all">Todos</option>{storyGroups.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={14} /></label>
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
        <div className="proposal-note"><Sparkles size={21} /><div><strong>¿Tienes una historia para compartir?</strong><p>Envíala al equipo editorial. {edition.teacherName} o Dirección la revisará antes de publicarla.</p></div><button className="secondary-button" onClick={() => { setEditingStory(null); setSubmissionOpen(true); }}>Proponer historia</button></div>
      )}

      <AnimatePresence>{immersiveOpen && <MuralImmersiveView edition={edition} onClose={closeImmersive} />}</AnimatePresence>
      <AnimatePresence>{readerPost && <WallStoryReader post={readerPost} onClose={() => setReaderPost(null)} onFavorite={() => toggleFavorite(readerPost.id)} />}</AnimatePresence>
      <AnimatePresence>{submissionOpen && <MuralSubmissionModal story={editingStory} busy={saving} onClose={() => { if (!saving) { setSubmissionOpen(false); setEditingStory(null); } }} onSubmit={submitStory} />}</AnimatePresence>
      <AnimatePresence>{changesStory && <ReviewRequestModal story={changesStory} busy={reviewBusy === changesStory.id} onClose={() => { if (!reviewBusy) setChangesStory(null); }} onSubmit={(note) => reviewStory(changesStory, "request_changes", note)} />}</AnimatePresence>
      <AnimatePresence>{editionEditorOpen && <MuralEditionEditor edition={edition} profile={profile} accounts={accounts} groups={editionGroups} busy={editionSaving} onClose={() => { if (!editionSaving) setEditionEditorOpen(false); }} onSave={saveEdition} />}</AnimatePresence>
    </div>
  );
}
