"use client";

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
import { useRef, type ReactNode } from "react";

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
        <span className="lp-mini-brand">CE</span>
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
            <strong>Buenos días, Ana</strong>
          </div>
          <div className="lp-window-actions">
            <span className="lp-window-bell"><Bell size={14} /></span>
            <span className="lp-avatar">AM</span>
          </div>
        </div>
        <div className="lp-window-grid">
          <article className="lp-preview-welcome">
            <span>Tu semana</span>
            <h2>Todo listo para seguir aprendiendo.</h2>
            <p>3 actividades completadas · 2 por descubrir</p>
            <div className="lp-preview-progress"><i /></div>
          </article>
          <article className="lp-preview-card lp-preview-next">
            <span className="lp-preview-icon"><BookOpen size={18} /></span>
            <small>SIGUIENTE</small>
            <strong>Ciencias naturales</strong>
            <p>El ecosistema y su equilibrio</p>
            <button type="button" aria-label="Abrir actividad">
              <ArrowRight size={15} />
            </button>
          </article>
          <article className="lp-preview-card lp-preview-grade">
            <small>MI PROGRESO</small>
            <strong>92<span>%</span></strong>
            <p>Vas por muy buen camino</p>
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
          <span className="lp-brand-mark">CE</span>
          <span className="lp-brand-copy">
            <strong>CEHF</strong>
            <small>Campus</small>
          </span>
        </a>

        <nav className="lp-nav-links" aria-label="Navegación principal">
          <a href="#experiencia">Experiencia</a>
          <a href="#comunidad">Comunidad</a>
          <a href="#familias">Para todos</a>
        </nav>

        <a className="lp-nav-action" href="/login">
          Entrar <ArrowRight size={15} />
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
            <Sparkles size={14} /> Campus CEHF
          </span>
          <h1>
            Todo lo que importa,
            <span> en un mismo lugar.</span>
          </h1>
          <p>
            Una experiencia académica clara y cercana para aprender, avanzar y
            sentirte parte de tu comunidad.
          </p>
          <div className="lp-hero-actions">
            <a className="lp-button-primary" href="/login">
              Entrar al campus <ArrowRight size={18} />
            </a>
            <a className="lp-button-link" href="#experiencia">
              Descubrir la experiencia <ArrowDown size={16} />
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
          <span /> Explora
        </a>
      </section>

      <section className="lp-manifesto" id="experiencia">
        <Reveal className="lp-manifesto-inner">
          <span className="lp-section-kicker">El campus que se siente tuyo</span>
          <h2>
            Menos vueltas.
            <br />
            <em>Más aprendizaje.</em>
          </h2>
          <p>
            La vida escolar fluye mejor cuando cada tarea, avance y conversación
            tiene un lugar claro. Campus CEHF une todo para que cada semana se
            sienta posible.
          </p>
        </Reveal>
        <div className="lp-trust-row" aria-label="Beneficios del campus">
          <span><CheckCircle2 size={16} /> Claro desde el primer vistazo</span>
          <span><ShieldCheck size={16} /> Seguro para tu comunidad</span>
          <span><Heart size={16} /> Cercano en cada momento</span>
        </div>
      </section>

      <section className="lp-bento-section" aria-labelledby="todo-heading">
        <Reveal className="lp-section-heading">
          <span className="lp-section-kicker">Tu semana, resuelta</span>
          <h2 id="todo-heading">Todo vive aquí.</h2>
          <p>Lo que necesitas hoy. Lo que has logrado. Lo que sigue mañana.</p>
        </Reveal>

        <div className="lp-bento-grid">
          <Reveal className="lp-bento-card lp-bento-tasks">
            <div className="lp-bento-copy is-light">
              <span className="lp-card-icon"><ClipboardCheck size={19} /></span>
              <small>TAREAS</small>
              <h3>Tu día se ordena solo.</h3>
              <p>Entregas, recursos y fechas importantes en una vista que sí se entiende.</p>
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
              <h3>Avanzar se siente.</h3>
            </div>
            <div className="lp-ring" aria-label="92 por ciento de progreso">
              <div><strong>92</strong><span>%</span></div>
            </div>
            <span className="lp-progress-note"><Sparkles size={14} /> Gran semana</span>
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
              <h3>Lo bueno se comparte.</h3>
              <p>Foros, historias y logros que nos mantienen conectados.</p>
            </div>
          </Reveal>

          <Reveal className="lp-bento-card lp-bento-calendar" delay={0.12}>
            <div className="lp-bento-copy">
              <span className="lp-card-icon"><CalendarDays size={19} /></span>
              <small>CALENDARIO</small>
              <h3>Siempre sabes qué sigue.</h3>
              <p>Cada fecha importante, justo a tiempo.</p>
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
            <span className="lp-section-kicker is-on-dark">Diseñado para acompañarte</span>
            <h2>Una mirada.<br />Todo claro.</h2>
            <div className="lp-story-points">
              <article>
                <span>01</span>
                <div><strong>Empieza con foco</strong><p>Ve lo importante sin perderte entre pendientes.</p></div>
              </article>
              <article>
                <span>02</span>
                <div><strong>Aprende a tu ritmo</strong><p>Recursos y repasos disponibles cuando los necesitas.</p></div>
              </article>
              <article>
                <span>03</span>
                <div><strong>Celebra el avance</strong><p>Tu progreso se vuelve visible, semana a semana.</p></div>
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
                <div><small>NUEVO LOGRO</small><strong>Semana completa</strong></div>
              </motion.div>
              <motion.div
                className="lp-float-card lp-float-message"
                style={reduceMotion ? undefined : { y: messageY }}
              >
                <span><MessageCircle size={17} /></span>
                <div><small>COMUNIDAD</small><strong>¡Gran trabajo, Ana!</strong></div>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-roles" id="familias">
        <Reveal className="lp-section-heading is-centered">
          <span className="lp-section-kicker">Un campus. Cada perspectiva.</span>
          <h2>Hecho para todos.</h2>
          <p>Cada persona encuentra justo lo que necesita para hacer mejor su parte.</p>
        </Reveal>

        <div className="lp-role-grid">
          <Reveal className="lp-role-card is-student">
            <span className="lp-role-number">01</span>
            <div className="lp-role-icon"><GraduationCap size={25} /></div>
            <h3>Estudiantes</h3>
            <p>Aprender, entregar y ver cada logro con claridad.</p>
            <span className="lp-role-link">Mi camino <ArrowRight size={15} /></span>
          </Reveal>
          <Reveal className="lp-role-card is-teacher" delay={0.06}>
            <span className="lp-role-number">02</span>
            <div className="lp-role-icon"><BookOpen size={25} /></div>
            <h3>Maestros</h3>
            <p>Acompañar el avance y dar contexto a cada aprendizaje.</p>
            <span className="lp-role-link">Mi grupo <ArrowRight size={15} /></span>
          </Reveal>
          <Reveal className="lp-role-card is-family" delay={0.12}>
            <span className="lp-role-number">03</span>
            <div className="lp-role-icon"><Users size={25} /></div>
            <h3>Familias</h3>
            <p>Estar cerca de la experiencia escolar, sin complicaciones.</p>
            <span className="lp-role-link">Nuestra comunidad <ArrowRight size={15} /></span>
          </Reveal>
        </div>
      </section>

      <section className="lp-quote-section">
        <Reveal className="lp-quote-card">
          <div className="lp-quote-mark">“</div>
          <blockquote>
            Aquí encuentro lo que necesito y puedo ver todo lo que voy logrando.
          </blockquote>
          <p>Una experiencia pensada desde la comunidad CEHF.</p>
          <div className="lp-quote-metrics">
            <span><strong>1</strong><small>campus</small></span>
            <i />
            <span><strong>3</strong><small>perspectivas</small></span>
            <i />
            <span><strong>∞</strong><small>momentos para crecer</small></span>
          </div>
        </Reveal>
      </section>

      <section className="lp-final-cta">
        <div className="lp-final-orbit orbit-one" aria-hidden="true" />
        <div className="lp-final-orbit orbit-two" aria-hidden="true" />
        <Reveal className="lp-final-inner">
          <span className="lp-section-kicker is-on-dark"><Clock3 size={14} /> Tu campus te espera</span>
          <h2>Hoy es un buen día<br />para avanzar.</h2>
          <p>Entra y descubre todo lo que está pasando en tu comunidad.</p>
          <a className="lp-button-light" href="/login">
            Entrar a Campus CEHF <ArrowRight size={18} />
          </a>
        </Reveal>
      </section>

      <footer className="lp-footer">
        <div className="lp-footer-brand">
          <span className="lp-brand-mark">CE</span>
          <div><strong>Campus CEHF</strong><small>Ideas que crecen.</small></div>
        </div>
        <p>Una experiencia académica para aprender, avanzar y conectar.</p>
        <div className="lp-footer-links">
          <a href="#inicio">Inicio</a>
          <a href="#experiencia">Experiencia</a>
          <a href="/login">Acceso</a>
        </div>
        <small className="lp-footer-legal">© 2026 CEHF · Todos los derechos reservados.</small>
      </footer>
    </main>
  );
}
