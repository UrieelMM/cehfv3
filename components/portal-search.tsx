"use client";

import {
  BookOpen,
  ClipboardCheck,
  FileBarChart,
  FileText,
  FolderOpen,
  LoaderCircle,
  MessageCircle,
  Newspaper,
  Search,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { searchLocalPortal, searchPortal } from "@/lib/portal-search";
import type {
  PortalSearchEntityType,
  PortalSearchHit,
  UserProfile,
} from "@/lib/types";

type SearchGroup = "all" | "task" | "resource" | "story" | "conversation" | "report";

const searchGroups: Array<{ id: SearchGroup; label: string }> = [
  { id: "all", label: "Todo" },
  { id: "task", label: "Tareas" },
  { id: "resource", label: "Recursos" },
  { id: "story", label: "Historias" },
  { id: "conversation", label: "Foros" },
  { id: "report", label: "Reportes" },
];

const groupEntities: Partial<Record<SearchGroup, PortalSearchEntityType[]>> = {
  task: ["task", "review", "workshop_task"],
  resource: ["material", "workspace", "workshop", "workshop_resource"],
  story: ["story"],
  conversation: ["forum_topic", "forum_post"],
  report: ["report"],
};

const entityDetails: Record<PortalSearchEntityType, { label: string; icon: LucideIcon }> = {
  task: { label: "Tarea", icon: ClipboardCheck },
  review: { label: "Repaso", icon: BookOpen },
  material: { label: "Recurso", icon: FileText },
  story: { label: "Historia", icon: Newspaper },
  forum_topic: { label: "Tema", icon: MessageCircle },
  forum_post: { label: "Respuesta", icon: MessageCircle },
  workspace: { label: "Mi espacio", icon: FolderOpen },
  workshop: { label: "Taller", icon: Sparkles },
  workshop_resource: { label: "Recurso de taller", icon: FileText },
  workshop_task: { label: "Actividad de taller", icon: ClipboardCheck },
  report: { label: "Reporte", icon: FileBarChart },
};

function matchesGroup(hit: PortalSearchHit, group: SearchGroup) {
  return group === "all" || groupEntities[group]?.includes(hit.entityType);
}

export function PortalSearch({
  profile,
  firebaseReady,
  localRecords,
  onOpen,
}: {
  profile: UserProfile;
  firebaseReady: boolean;
  localRecords: PortalSearchHit[];
  onOpen: (hit: PortalSearchHit) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchedQuery, setSearchedQuery] = useState("");
  const [group, setGroup] = useState<SearchGroup>("all");
  const [hits, setHits] = useState<PortalSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRevision = useRef(0);

  const filteredHits = useMemo(
    () => hits.filter((hit) => matchesGroup(hit, group)),
    [group, hits],
  );

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
        window.setTimeout(() => inputRef.current?.focus(), 0);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", outside);
    return () => window.removeEventListener("pointerdown", outside);
  }, [open]);

  async function runSearch() {
    const term = query.trim();
    if (!term) {
      setHits([]);
      setSearchedQuery("");
      setError("");
      setLoading(false);
      inputRef.current?.focus();
      return;
    }

    const revision = requestRevision.current + 1;
    requestRevision.current = revision;
    setOpen(true);
    setSearchedQuery(term);
    setLoading(true);
    setError("");

    try {
      const next = firebaseReady
        ? await searchPortal(profile.uid, term)
        : searchLocalPortal(localRecords, term);
      if (requestRevision.current === revision) setHits(next);
    } catch {
      if (requestRevision.current === revision) {
        setHits([]);
        setError("No pudimos consultar el índice. Intenta de nuevo.");
      }
    } finally {
      if (requestRevision.current === revision) setLoading(false);
    }
  }

  function openHit(hit: PortalSearchHit) {
    onOpen(hit);
    setOpen(false);
    setQuery("");
    setSearchedQuery("");
    setHits([]);
  }

  const submitted = Boolean(searchedQuery) && query.trim() === searchedQuery;

  return (
    <div className={`search portal-search ${open ? "is-open" : ""}`} ref={rootRef}>
      <Search size={18} aria-hidden="true" />
      <button
        className="portal-search-mobile-trigger"
        type="button"
        aria-label="Abrir búsqueda"
        onClick={() => {
          setOpen(true);
          window.setTimeout(() => inputRef.current?.focus(), 0);
        }}
      />
      <input
        aria-label="Buscar en el portal"
        autoComplete="off"
        placeholder="Buscar tareas, recursos o historias…"
        ref={inputRef}
        type="search"
        value={query}
        onChange={(event) => {
          requestRevision.current += 1;
          setQuery(event.target.value);
          setSearchedQuery("");
          setHits([]);
          setError("");
          setLoading(false);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void runSearch();
          }
        }}
      />
      <button
        className="portal-search-submit"
        type="button"
        disabled={!query.trim() || loading}
        onClick={() => void runSearch()}
      >
        Buscar
      </button>
      {query ? (
        <button
          className="portal-search-clear"
          type="button"
          aria-label="Limpiar búsqueda"
          onClick={() => {
            requestRevision.current += 1;
            setQuery("");
            setSearchedQuery("");
            setHits([]);
            setError("");
            setLoading(false);
            inputRef.current?.focus();
          }}
        >
          <X size={15} />
        </button>
      ) : (
        <kbd>⌘ K</kbd>
      )}

      <AnimatePresence>
        {open && (
          <motion.section
            aria-label="Resultados de búsqueda"
            className="portal-search-panel"
            initial={{ opacity: 0, y: -6, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.99 }}
          >
            <div className="portal-search-filters" role="tablist" aria-label="Tipo de resultado">
              {searchGroups.map((item) => (
                <button
                  className={group === item.id ? "active" : ""}
                  key={item.id}
                  onClick={() => {
                    setGroup(item.id);
                  }}
                  role="tab"
                  type="button"
                  aria-selected={group === item.id}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="portal-search-results" aria-live="polite">
              {!query.trim() ? (
                <div className="portal-search-message">
                  <Search size={24} />
                  <strong>Busca en todo el portal</strong>
                  <span>Escribe lo que quieres encontrar y pulsa Buscar o Enter.</span>
                </div>
              ) : !submitted ? (
                <div className="portal-search-message">
                  <Search size={24} />
                  <strong>Listo para buscar</strong>
                  <span>Escribir no genera consultas. Pulsa Buscar o Enter cuando termines.</span>
                </div>
              ) : loading ? (
                <div className="portal-search-message">
                  <LoaderCircle className="spin" size={24} />
                  <strong>Buscando…</strong>
                </div>
              ) : error ? (
                <div className="portal-search-message is-error">
                  <Search size={24} />
                  <strong>Buscador no disponible</strong>
                  <span>{error}</span>
                </div>
              ) : filteredHits.length ? (
                filteredHits.map((hit) => {
                  const details = entityDetails[hit.entityType];
                  const ResultIcon = details.icon;
                  return (
                    <button
                      className="portal-search-result"
                      key={hit.objectID}
                      onClick={() => openHit(hit)}
                      type="button"
                    >
                      <span className={`portal-search-result-icon is-${hit.entityType}`}>
                        <ResultIcon size={18} />
                      </span>
                      <span className="portal-search-result-copy">
                        <span><em>{details.label}</em>{hit.subject && <small>{hit.subject}</small>}</span>
                        <strong>{hit.title}</strong>
                        <p>{hit.excerpt || hit.context || "Abrir en el portal"}</p>
                      </span>
                      <span className="portal-search-open">Abrir <span>↵</span></span>
                    </button>
                  );
                })
              ) : (
                <div className="portal-search-message">
                  <Search size={24} />
                  <strong>Sin resultados</strong>
                  <span>Prueba con otro título, materia, autor o palabra clave.</span>
                </div>
              )}
            </div>
            <footer className="portal-search-footer">
              <span><kbd>↵</kbd> buscar</span>
              <span><kbd>esc</kbd> cerrar</span>
              <strong>Resultados limitados a tus permisos</strong>
            </footer>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
