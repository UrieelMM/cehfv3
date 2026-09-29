"use client";

import { Box, Check, Sparkles, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { AnimatedOrb } from "@/components/animated-orb";
import { createTaskCreationSequence, TASK_CREATION_DELAY_MS } from "@/lib/task-creation";

type CreationPhase = "preview" | "idle" | "forming" | "saving" | "success";

const particlePixel = (value: number) => `${value.toFixed(2)}px`;

// Fixed paths keep the initial render identical on the server and client.
const creationParticles = Array.from({ length: 36 }, (_, index) => {
  const angle = (index / 36) * Math.PI * 2;
  const radius = 158 + (index % 5) * 17;
  const colors = ["var(--creation-cyan)", "var(--creation-violet)", "var(--creation-coral)"];
  return {
    "--particle-x": particlePixel(Math.cos(angle) * radius),
    "--particle-y": particlePixel(Math.sin(angle) * radius * 0.65),
    "--particle-curve-x": particlePixel(Math.cos(angle + 0.5) * radius * 0.52),
    "--particle-curve-y": particlePixel(Math.sin(angle + 0.5) * radius * 0.4),
    "--particle-end-x": particlePixel(Math.cos(angle + 1) * 38),
    "--particle-end-y": particlePixel(Math.sin(angle + 1) * 38),
    "--particle-delay": `${(index % 6) * 0.035}s`,
    "--particle-size": `${3 + (index % 4)}px`,
    "--particle-color": colors[index % colors.length],
  } as CSSProperties;
});

export function useTaskCreationAnimation(formRef: RefObject<HTMLFormElement | null>) {
  const [phase, setPhase] = useState<CreationPhase>("preview");
  const [sequence] = useState(createTaskCreationSequence);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const timer = setTimeout(() => setPhase("idle"), TASK_CREATION_DELAY_MS);
    return () => {
      mounted.current = false;
      clearTimeout(timer);
      sequence.cancel();
    };
  }, [sequence]);

  useEffect(() => {
    if (phase === "idle") {
      formRef.current?.querySelector<HTMLInputElement>("[data-creation-focus]")?.focus({ preventScroll: true });
    }
  }, [phase, formRef]);

  async function create(action: () => Promise<void>) {
    if (phase !== "idle" || sequence.pending) return false;
    setPhase("forming");
    let created = false;
    try {
      created = await sequence.run(action, () => {
        if (mounted.current) setPhase("saving");
      }, () => {
        if (mounted.current) setPhase("success");
      });
      return created;
    } finally {
      if (mounted.current && !created) setPhase("idle");
    }
  }

  return {
    phase,
    active: phase !== "idle",
    busy: phase === "forming" || phase === "saving" || phase === "success",
    isPending: () => sequence.pending,
    create,
  };
}

export function TaskCreationAnimation({ phase, title, context, onClose }: {
  phase: Exclude<CreationPhase, "idle">;
  title: string;
  context: string;
  onClose: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const statusRef = useRef<HTMLDivElement>(null);
  const preview = phase === "preview";
  const success = phase === "success";
  const heading = preview ? "De una idea a una gran tarea."
    : success ? "¡Tarea creada!"
      : phase === "forming" ? "Tu tarea está tomando forma."
        : "Guardando tu tarea.";

  useEffect(() => {
    statusRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <motion.div
      className={`task-creation-animation is-${phase}`}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, filter: reducedMotion ? "none" : "blur(8px)" }}
      transition={{ duration: reducedMotion ? 0.1 : 0.3 }}
      ref={statusRef}
      tabIndex={-1}
      role="status"
      aria-live="polite"
      aria-label={heading}
      onKeyDown={(event) => {
        if (event.key === "Tab") {
          event.preventDefault();
          if (preview) statusRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
          else statusRef.current?.focus();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          if (preview) onClose();
        }
      }}
    >
      <div className="task-creation-aurora" aria-hidden="true"><i /><i /><i /></div>
      <div className="task-creation-topline" aria-hidden="true">{success ? <Check size={14} /> : <Sparkles size={14} />} {preview ? "El comienzo de algo grande" : success ? "Actividad creada correctamente" : "Creando una nueva actividad"}</div>
      {preview && <button className="task-creation-close" type="button" onClick={onClose} aria-label="Cerrar"><X size={19} /></button>}

      <div className="task-creation-scene" aria-hidden="true">
        <div className="task-creation-halo" />
        <div className="task-creation-orbit" />
        <div className="task-creation-orbit is-inner" />
        <div className="task-creation-particles">
          {creationParticles.map((style, index) => <i className="task-creation-particle" style={style} key={index} />)}
        </div>
        <div className="task-creation-orb">
          <AnimatedOrb className="task-creation-core" size="large" busy tone={success ? "mint" : "brand"} />
          {success && <span className="task-creation-orb-check"><Check size={46} strokeWidth={2.5} /></span>}
        </div>
        <span className="task-creation-shape is-cube"><Box size={44} strokeWidth={1.2} /></span>
        <span className="task-creation-shape is-pyramid"><svg viewBox="0 0 48 48" fill="none"><path d="M24 5 44 40H4Z" /><path d="M24 5v27M4 40l20-8 20 8" /></svg></span>
        <span className="task-creation-shape is-ring"><i /></span>
        <span className="task-creation-shape is-diamond"><i /></span>
        <span className="task-creation-shape is-sphere"><i /></span>
        <span className="task-creation-shape is-star"><Sparkles size={23} strokeWidth={1.3} /></span>
        <div className="task-creation-caption"><span>{context}</span><strong>{title.trim() || "Tu próxima gran idea"}</strong></div>
      </div>

      <div className="task-creation-copy">
        <span className="task-creation-eyebrow">{preview ? "Imagina. Comparte. Inspira." : success ? "Todo listo" : "Un momento, por favor"}</span>
        <h3>{heading}</h3>
        <p>{preview ? "Prepara algo extraordinario para tu grupo." : success ? "Tu actividad se guardó correctamente." : phase === "forming" ? "Preparando el contenido y los recursos de tu actividad." : "Estamos guardando el contenido y los archivos adjuntos."}</p>
        <div className="task-creation-progress" aria-hidden="true"><span /></div>
      </div>
    </motion.div>
  );
}
