"use client";

import { Pencil, Save, ShieldCheck, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, type FormEvent, type ReactNode } from "react";

export function ContentEditDialog({
  open,
  eyebrow,
  title,
  description,
  note,
  busy,
  children,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  eyebrow: string;
  title: string;
  description: string;
  note?: string;
  busy: boolean;
  children: ReactNode;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onCancel, open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="content-edit-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) onCancel();
          }}
        >
          <motion.form
            className="content-edit-dialog"
            initial={{ opacity: 0, y: 18, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.985 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="content-edit-title"
            onSubmit={onSubmit}
          >
            <header>
              <span className="content-edit-icon"><Pencil size={20} /></span>
              <div>
                <small>{eyebrow}</small>
                <h2 id="content-edit-title">{title}</h2>
                <p>{description}</p>
              </div>
              <button type="button" className="plain-icon" onClick={onCancel} disabled={busy} aria-label="Cerrar edición">
                <X size={19} />
              </button>
            </header>
            <div className="content-edit-fields">{children}</div>
            {note && <p className="content-edit-note"><ShieldCheck size={16} /> {note}</p>}
            <footer>
              <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>Cancelar</button>
              <button type="submit" className="primary-button" disabled={busy}>
                {busy ? <span className="button-spinner" /> : <Save size={16} />}
                {busy ? "Guardando…" : "Guardar cambios"}
              </button>
            </footer>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
