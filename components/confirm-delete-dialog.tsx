"use client";

import { AlertTriangle, LoaderCircle, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export function ConfirmDeleteDialog({
  open,
  title,
  description,
  confirmLabel = "Eliminar definitivamente",
  busy = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => cancelRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [busy, onCancel, open]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="delete-confirm-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) onCancel();
          }}
        >
          <motion.section
            className="delete-confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-confirm-title"
            aria-describedby="delete-confirm-description"
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            onKeyDown={(event) => {
              if (event.key !== "Tab") return;
              if (event.shiftKey && document.activeElement === cancelRef.current) {
                event.preventDefault();
                confirmRef.current?.focus();
              } else if (!event.shiftKey && document.activeElement === confirmRef.current) {
                event.preventDefault();
                cancelRef.current?.focus();
              }
            }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button className="delete-confirm-close" type="button" onClick={onCancel} disabled={busy} aria-label="Cerrar confirmación"><X size={18} /></button>
            <span className="delete-confirm-icon"><AlertTriangle size={25} /></span>
            <small>Acción irreversible</small>
            <h2 id="delete-confirm-title">{title}</h2>
            <p id="delete-confirm-description">{description}</p>
            <footer>
              <button className="secondary-button" type="button" onClick={onCancel} disabled={busy} ref={cancelRef}>Cancelar</button>
              <button className="danger-button" type="button" onClick={onConfirm} disabled={busy} ref={confirmRef}>
                {busy ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={16} />}
                {busy ? "Eliminando…" : confirmLabel}
              </button>
            </footer>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
