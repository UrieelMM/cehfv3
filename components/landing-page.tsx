"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- Vinext client navigation is more stable with native anchors. */

import {
  ArrowDown,
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  GraduationCap,
  Heart,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
} from "lucide-react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import Image from "next/image";
import { useRef, type ReactNode } from "react";
import logoCehf from "@/assets/img/logoCEHF.png";

const ease = [0.22, 1, 0.36, 1] as const;

function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y: 34 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.18 }}
      transition={{ duration: 0.7, delay, ease }}
    >
      {children}
    </motion.div>
  );
}

function ProductWindow({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`lp-window${compact ? " is-compact" : ""}`}>
      <aside className="lp-window-sidebar">
        <Image
          className="lp-mini-brand"
          src={logoCehf}
          alt=""
          aria-hidden="true"
          sizes="34px"
          unoptimized
        />
        <span className="is-active" />
        <span />
        <span />
        <span />
        <span />
      </aside>
      <div className="lp-window-main">
        <div className="lp-window-topbar">
          <div>
            <small>SEMANA 8</small>
            <strong>¡Hola, Ana!</strong>
          </div>
          <div className="lp-window-actions">
            <span className="lp-window-bell"><Bell size={14} /></span>
            <span className="lp-avatar">AM</span>
          </div>
        </div>
        <div className="lp-window-grid">
          <article className="lp-preview-welcome">
            <span>Tu semana</span>
            <h2>Hoy es un buen día para avanzar.</h2>
            <p>3 actividades listas · 2 nuevas por descubrir</p>
            <div className="lp-preview-progress"><i /></div>
          </article>
          <article className="lp-preview-card lp-preview-next">
            <span className="lp-preview-icon"><BookOpen size={18} /></span>
            <small>LO QUE SIGUE</small>
            <strong>Ciencias naturales</strong>
            <p>El ecosistema y su equilibrio</p>
            <button type="button" aria-label="Abrir actividad">
              <ArrowRight size={15} />
            </button>
          </article>
          <article className="lp-preview-card lp-preview-grade">
            <small>MI PROGRESO</small>
            <strong>92<span>%</span></strong>
            <p>¡Excelente avance!</p>
          </article>
        </div>
      </div>
    </div>
  );
}

function MiniTask({
  subject,
  title,
  tone,
}: {
  subject: string;
  title: string;
  tone: "blue" | "coral" | "mint";
}) {
  return (
    <div className="lp-mini-task">
      <span className={`lp-task-dot is-${tone}`} />
      <div>
        <small>{subject}</small>
        <strong>{title}</strong>
      </div>
      <span className="lp-check"><Check size={13} /></span>
    </div>
  );
}

function ProgressOrb({ progress }: { progress: MotionValue<number> }) {
  const rotate = useTransform(progress, [0, 1], [-18, 18]);
  const y = useTransform(progress, [0, 1], [22, -22]);

  return <motion.span className="lp-story-orb" style={{ rotate, y }} />;
}

export function LandingPage() {
  const reduceMotion = useReducedMotion();
  const heroRef = useRef<HTMLElement>(null);
  const storyRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll();
  const pageProgress = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 26,
    mass: 0.25,
  });
  const { scrollYProgress: heroProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const { scrollYProgress: storyProgress } = useScroll({
    target: storyRef,
    offset: ["start end", "end start"],
  });
  const heroY = useTransform(heroProgress, [0, 1], [0, 120]);
  const heroScale = useTransform(heroProgress, [0, 1], [1, 0.94]);
  const achievementY = useTransform(storyProgress, [0, 1], [40, -40]);
  const messageY = useTransform(storyProgress, [0, 1], [-30, 34]);

  return (
    <main className="lp-shell" data-theme="light">
      <motion.div className="lp-page-progress" style={{ scaleX: pageProgress }} />

      <header className="lp-nav">
        <a className="lp-brand" href="#inicio" aria-label="Campus CEHF, inicio">
          <Image
            className="lp-brand-mark"
            src={logoCehf}
            alt=""
            priority
            sizes="44px"
            unoptimized
          />
          <span className="lp-brand-copy">
            <strong>CEHF</strong>
            <small>Campus</small>
          </span>
        </a>

        <nav className="lp-nav-links" aria-label="Navegación principal">
          <a href="#experiencia">Conoce el campus</a>
          <a href="#comunidad">Comunidad</a>
          <a href="#familias">Para cada perfil</a>
        </nav>

        <a className="lp-nav-action" href="/login">
          Acceder al campus <ArrowRight size={15} />
        </a>
      </header>

      <section className="lp-hero" id="inicio" ref={heroRef}>
        <div className="lp-hero-glow lp-hero-glow-one" aria-hidden="true" />
        <div className="lp-hero-glow lp-hero-glow-two" aria-hidden="true" />

        <motion.div
          className="lp-hero-copy"
          initial={reduceMotion ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, ease }}
        >
          <span className="lp-eyebrow">
            <Sparkles size={14} /> Tu escuela, a tu ritmo
          </span>
          <h1>
            Tu vida escolar,
            <span> más fácil y organizada.</span>
          </h1>
          <p>
            Tareas, avances, avisos y tu comunidad en un solo espacio para
            organizarte, aprender y seguir avanzando.
          </p>
          <div className="lp-hero-actions">
            <a className="lp-button-primary" href="/login">
              Entrar al campus <ArrowRight size={18} />
            </a>
            <a className="lp-button-link" href="#experiencia">
              Conocer todo lo que ofrece <ArrowDown size={16} />
            </a>
          </div>
        </motion.div>

        <motion.div
          className="lp-product-stage"
          initial={reduceMotion ? false : { opacity: 0, y: 56, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.18, duration: 0.9, ease }}
          style={reduceMotion ? undefined : { y: heroY, scale: heroScale }}
          aria-label="Vista previa del Campus CEHF"
        >
          <ProductWindow />
        </motion.div>

        <a className="lp-scroll-cue" href="#experiencia" aria-label="Continuar">
          <span /> Conoce más
        </a>
      </section>

      <section className="lp-manifesto" id="experiencia">
        <Reveal className="lp-manifesto-inner">
          <span className="lp-section-kicker">Tu escuela, más sencilla</span>
          <h2>
            Sin complicaciones.
            <br />
            <em>Todo bajo control.</em>
          </h2>
          <p>
            Encuentra tus tareas, revisa cómo vas y entérate de lo nuevo sin
            perder tiempo. Campus CEHF pone tu semana en orden para que tú te
            enfoques en aprender y disfrutarla.
          </p>
        </Reveal>
        <div className="lp-trust-row" aria-label="Beneficios del campus">
          <span><CheckCircle2 size={16} /> Encuentra todo al instante</span>
          <span><ShieldCheck size={16} /> Tu información siempre segura</span>
          <span><Heart size={16} /> Tu comunidad te acompaña</span>
        </div>
      </section>

      <section className="lp-bento-section" aria-labelledby="todo-heading">
        <Reveal className="lp-section-heading">
          <span className="lp-section-kicker">Tu semana, bien organizada</span>
          <h2 id="todo-heading">Todo en un solo lugar.</h2>
          <p>Tus actividades de hoy, tus logros y lo que viene, siempre a tu alcance.</p>
        </Reveal>

        <div className="lp-bento-grid">
          <Reveal className="lp-bento-card lp-bento-tasks">
            <div className="lp-bento-copy is-light">
              <span className="lp-card-icon"><ClipboardCheck size={19} /></span>
              <small>TAREAS</small>
              <h3>Ninguna tarea se queda atrás.</h3>
              <p>Tareas, archivos y fechas claras para que entregues a tiempo y sin contratiempos.</p>
            </div>
            <div className="lp-task-stack">
              <MiniTask subject="ESPAÑOL" title="Crónica de mi comunidad" tone="coral" />
              <MiniTask subject="MATEMÁTICAS" title="Fracciones equivalentes" tone="blue" />
              <MiniTask subject="CIENCIAS" title="Nuestro ecosistema" tone="mint" />
            </div>
          </Reveal>

          <Reveal className="lp-bento-card lp-bento-progress" delay={0.06}>
            <div className="lp-bento-copy">
              <span className="lp-card-icon"><BarChart3 size={19} /></span>
              <small>PROGRESO</small>
              <h3>Reconoce cuánto has avanzado.</h3>
            </div>
            <div className="lp-ring" aria-label="92 por ciento de progreso">
              <div><strong>92</strong><span>%</span></div>
            </div>
            <span className="lp-progress-note"><Sparkles size={14} /> ¡Excelente semana!</span>
          </Reveal>

          <Reveal className="lp-bento-card lp-bento-community" delay={0.08}>
            <div className="lp-community-art" aria-hidden="true">
              <span className="lp-community-avatar avatar-one">AM</span>
              <span className="lp-community-avatar avatar-two">JR</span>
              <span className="lp-community-avatar avatar-three">LM</span>
              <span className="lp-community-heart"><Heart size={22} /></span>
            </div>
            <div className="lp-bento-copy is-bottom">
              <small>COMUNIDAD</small>
              <h3>Tu comunidad, siempre cerca.</h3>
              <p>Comparte ideas, descubre historias y celebra lo que logra tu comunidad.</p>
            </div>
          </Reveal>

          <Reveal className="lp-bento-card lp-bento-calendar" delay={0.12}>
            <div className="lp-bento-copy">
              <span className="lp-card-icon"><CalendarDays size={19} /></span>
              <small>CALENDARIO</small>
              <h3>Sin sorpresas de última hora.</h3>
              <p>Fechas, eventos y recordatorios para llegar siempre un paso adelante.</p>
            </div>
            <div className="lp-calendar-sheet">
              <span>SEPTIEMBRE</span>
              <div className="lp-calendar-days">
                {[14, 15, 16, 17, 18].map((day) => (
                  <i key={day} className={day === 16 ? "is-today" : ""}>{day}</i>
                ))}
              </div>
              <div className="lp-calendar-event"><span /> Repaso de ciencias <small>10:30</small></div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="lp-story" ref={storyRef} id="comunidad">
        <div className="lp-story-grid">
          <div className="lp-story-copy">
            <span className="lp-section-kicker is-on-dark">Avanza a tu ritmo</span>
            <h2>Entra. Organízate.<br /><span>Sigue avanzando.</span></h2>
            <div className="lp-story-points">
              <article>
                <span>01</span>
                <div><strong>Comienza con claridad</strong><p>Lo importante aparece primero para que sepas por dónde comenzar.</p></div>
              </article>
              <article>
                <span>02</span>
                <div><strong>Aprende a tu manera</strong><p>Recursos y repasos listos justo cuando los necesitas.</p></div>
              </article>
              <article>
                <span>03</span>
                <div><strong>Reconoce tus logros</strong><p>Observa cómo crece tu progreso semana tras semana.</p></div>
              </article>
            </div>
          </div>

          <div className="lp-story-visual" aria-hidden="true">
            <ProgressOrb progress={storyProgress} />
            <div className="lp-story-frame">
              <ProductWindow compact />
              <motion.div
                className="lp-float-card lp-float-achievement"
                style={reduceMotion ? undefined : { y: achievementY }}
              >
                <span><Star size={17} /></span>
                <div><small>¡NUEVO LOGRO!</small><strong>Semana completada</strong></div>
              </motion.div>
              <motion.div
                className="lp-float-card lp-float-message"
                style={reduceMotion ? undefined : { y: messageY }}
              >
                <span><MessageCircle size={17} /></span>
                <div><small>TU COMUNIDAD</small><strong>¡Gran trabajo, Ana!</strong></div>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-roles" id="familias">
        <Reveal className="lp-section-heading is-centered">
          <span className="lp-section-kicker">Un campus, distintas formas de vivirlo</span>
          <h2>Un espacio para todos.</h2>
          <p>Cada perfil encuentra lo que necesita para que la escuela funcione mejor en equipo.</p>
        </Reveal>

        <div className="lp-role-grid">
          <Reveal className="lp-role-card is-student">
            <span className="lp-role-number">01</span>
            <div className="lp-role-icon"><GraduationCap size={25} /></div>
            <h3>Estudiantes</h3>
            <p>Aprende, entrega y celebra cada avance a tu manera.</p>
            <span className="lp-role-link">Mi espacio <ArrowRight size={15} /></span>
          </Reveal>
          <Reveal className="lp-role-card is-teacher" delay={0.06}>
            <span className="lp-role-number">02</span>
            <div className="lp-role-icon"><BookOpen size={25} /></div>
            <h3>Maestros</h3>
            <p>Impulsa a tu grupo y mantén cada aprendizaje en movimiento.</p>
            <span className="lp-role-link">Ver mi grupo <ArrowRight size={15} /></span>
          </Reveal>
          <Reveal className="lp-role-card is-family" delay={0.12}>
            <span className="lp-role-number">03</span>
            <div className="lp-role-icon"><Users size={25} /></div>
            <h3>Familias</h3>
            <p>Acompaña de cerca cada logro de forma sencilla y clara.</p>
            <span className="lp-role-link">Seguir sus logros <ArrowRight size={15} /></span>
          </Reveal>
        </div>
      </section>

      <section className="lp-quote-section">
        <Reveal className="lp-quote-card">
          <div className="lp-quote-mark">“</div>
          <blockquote>
            Entro, reviso lo que sigue y me pongo en acción. Todo resulta más claro.
          </blockquote>
          <p>Una experiencia hecha con la energía de la comunidad CEHF.</p>
          <div className="lp-quote-metrics">
            <span><strong>1</strong><small>campus</small></span>
            <i />
            <span><strong>3</strong><small>perspectivas</small></span>
            <i />
            <span><strong>∞</strong><small>motivos para seguir avanzando</small></span>
          </div>
        </Reveal>
      </section>

      <section className="lp-final-cta">
        <div className="lp-final-orbit orbit-one" aria-hidden="true" />
        <div className="lp-final-orbit orbit-two" aria-hidden="true" />
        <Reveal className="lp-final-inner">
          <span className="lp-section-kicker is-on-dark"><Clock3 size={14} /> ¿Listo para continuar?</span>
          <h2>Entra. Ponte al día.<br />Sigue avanzando.</h2>
          <p>Tu próxima tarea, tu mejor avance y toda tu comunidad ya están aquí.</p>
          <a className="lp-button-light" href="/login">
            Ir al Campus CEHF <ArrowRight size={18} />
          </a>
        </Reveal>
      </section>

      <footer className="lp-footer">
        <div className="lp-footer-brand">
          <Image
            className="lp-brand-mark"
            src={logoCehf}
            alt="Logo de CEHF"
            sizes="44px"
            unoptimized
          />
          <div><strong>Campus CEHF</strong><small>Crece. Conecta. Avanza.</small></div>
        </div>
        <p>Todo lo que necesitas para aprender, avanzar y compartir en comunidad.</p>
        <div className="lp-footer-links">
          <a href="#inicio">Inicio</a>
          <a href="#experiencia">Conoce el campus</a>
          <a href="/login">Acceso</a>
        </div>
        <small className="lp-footer-legal">© 2026 CEHF · Todos los derechos reservados.</small>
      </footer>
    </main>
  );
}
