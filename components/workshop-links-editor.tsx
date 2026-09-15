"use client";

import { Plus, Trash2 } from "lucide-react";
import type { WorkshopLink } from "@/lib/types";

export function WorkshopLinksEditor({
  links,
  onChange,
}: {
  links: WorkshopLink[];
  onChange: (links: WorkshopLink[]) => void;
}) {
  return (
    <div className="workshop-links-editor">
      <div className="workshop-links-heading">
        <span>Enlaces de apoyo <small>Opcional · máximo 10</small></span>
        <button type="button" disabled={links.length >= 10} onClick={() => onChange([...links, { label: "", url: "" }])}>
          <Plus size={15} /> Agregar enlace
        </button>
      </div>
      {links.map((link, index) => (
        <div className="workshop-link-row" key={index}>
          <label>
            <span>Nombre</span>
            <input value={link.label} maxLength={100} required placeholder="Ej. Video explicativo" onChange={(event) => onChange(links.map((item, position) => position === index ? { ...item, label: event.target.value } : item))} />
          </label>
          <label>
            <span>URL</span>
            <input type="url" value={link.url} maxLength={2000} required placeholder="https://…" onChange={(event) => onChange(links.map((item, position) => position === index ? { ...item, url: event.target.value } : item))} />
          </label>
          <button type="button" aria-label={`Quitar enlace ${index + 1}`} onClick={() => onChange(links.filter((_, position) => position !== index))}><Trash2 size={16} /></button>
        </div>
      ))}
    </div>
  );
}
