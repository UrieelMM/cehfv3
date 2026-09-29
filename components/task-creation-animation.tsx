"use client";

import { BookOpen, Check, FileText, Sparkles, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { createTaskCreationSequence, TASK_CREATION_DELAY_MS } from "@/lib/task-creation";

type CreationPhase = "preview" | "idle" | "forming" | "saving";

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
    try {
      return await sequence.run(action, () => {
        if (mounted.current) setPhase("saving");
      });
    } finally {
      if (mounted.current) setPhase("idle");
    }
  }

  return {
    phase,
    active: phase !== "idle",
    busy: phase === "forming" || phase === "saving",
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
  const heading = preview ? "De una idea a una gran tarea."
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
      <div className="task-creation-grid" aria-hidden="true" />
      <div className="task-creation-topline" aria-hidden="true"><Sparkles size={14} /> {preview ? "El comienzo de algo grande" : "Creando una nueva actividad"}</div>
      {preview && <button className="task-creation-close" type="button" onClick={onClose} aria-label="Cerrar"><X size={19} /></button>}

      <div className="task-creation-scene" aria-hidden="true">
        <div className="task-creation-orbit" />
        <div className="task-creation-orbit is-inner" />
        <div className="task-creation-spark is-one" /><div className="task-creation-spark is-two" /><div className="task-creation-spark is-three" />
        <div className="task-creation-document">
          <div className="task-creation-document-glow" />
          <div className="task-creation-document-content">
            <div className="task-creation-document-top"><span><BookOpen size={19} /></span><i /><i /><i /></div>
            <span className="task-creation-document-label">{context || "Una nueva oportunidad para aprender"}</span>
            <strong>{title.trim() || "Tu próxima gran idea"}</strong>
            <div className="task-creation-document-lines"><i /><i /><i /></div>
            <div className="task-creation-document-bottom"><span><Check size={11} /> Contenido</span><span><FileText size={11} /> Recursos</span></div>
          </div>
          <div className="task-creation-scan" />
        </div>
        <span className="task-creation-tile"><FileText size={22} /><i /><i /></span>
        <span className="task-creation-badge"><Sparkles size={21} /></span>
      </div>

      <div className="task-creation-copy">
        <span className="task-creation-eyebrow">{preview ? "Imagina. Comparte. Inspira." : "Un momento, por favor"}</span>
        <h3>{heading}</h3>
        <p>{preview ? "Prepara algo extraordinario para tu grupo." : phase === "forming" ? "Preparando el contenido y los recursos de tu actividad." : "Estamos guardando el contenido y los archivos adjuntos."}</p>
        <div className="task-creation-progress" aria-hidden="true"><span /></div>
      </div>
    </motion.div>
  );
}
