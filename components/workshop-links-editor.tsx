"use client";

import { Plus, Trash2 } from "lucide-react";
import type { WorkshopLink } from "@/lib/types";

export function WorkshopLinksEditor({
  links,
  onChange,
  title = "Enlaces de apoyo",
  disabled = false,
}: {
  links: WorkshopLink[];
  onChange: (links: WorkshopLink[]) => void;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <div className="workshop-links-editor">
      <div className="workshop-links-heading">
        <span>{title} <small>Opcional · máximo 10</small></span>
        <button type="button" disabled={disabled || links.length >= 10} onClick={() => onChange([...links, { label: "", url: "" }])}>
          <Plus size={15} /> Agregar enlace
        </button>
      </div>
      {links.map((link, index) => (
        <div className="workshop-link-row" key={index}>
          <label>
            <span>Nombre</span>
            <input value={link.label} aria-label={`${title}: nombre del enlace ${index + 1}`} disabled={disabled} maxLength={100} required placeholder="Ej. Video explicativo" onChange={(event) => onChange(links.map((item, position) => position === index ? { ...item, label: event.target.value } : item))} />
          </label>
          <label>
            <span>URL</span>
            <input type="url" value={link.url} aria-label={`${title}: URL del enlace ${index + 1}`} disabled={disabled} maxLength={2000} required placeholder="https://…" onChange={(event) => onChange(links.map((item, position) => position === index ? { ...item, url: event.target.value } : item))} />
          </label>
          <button type="button" disabled={disabled} aria-label={`Quitar enlace ${index + 1}`} onClick={() => onChange(links.filter((_, position) => position !== index))}><Trash2 size={16} /></button>
        </div>
      ))}
    </div>
  );
}
