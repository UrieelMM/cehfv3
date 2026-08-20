"use client";

import { Download, FileText, Headphones, LoaderCircle, X } from "lucide-react";
import { motion } from "motion/react";
import Image from "next/image";
import { useEffect } from "react";
import { createPortal } from "react-dom";

export type WorkshopViewableFile = {
  name: string;
  size: number;
  contentType: string;
};

function fileSize(value: number) {
  return value < 1_000_000
    ? `${Math.max(1, Math.round(value / 1_000))} KB`
    : `${(value / 1_000_000).toFixed(1)} MB`;
}

function previewKind(file: WorkshopViewableFile) {
  const contentType = file.contentType.toLowerCase();
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (contentType.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(extension ?? "")) return "image";
  if (contentType.startsWith("video/") || ["mp4", "webm", "mov"].includes(extension ?? "")) return "video";
  if (contentType.startsWith("audio/") || ["mp3", "wav", "ogg", "m4a"].includes(extension ?? "")) return "audio";
  if (contentType === "application/pdf" || extension === "pdf") return "document";
  if (contentType.startsWith("text/") || ["txt", "md", "csv"].includes(extension ?? "")) return "document";
  return "download";
}

export function WorkshopFileViewer({
  file,
  url,
  loading,
  onClose,
}: {
  file: WorkshopViewableFile;
  url: string;
  loading: boolean;
  onClose: () => void;
}) {
  const kind = previewKind(file);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <motion.div
      className="workshop-attachment-viewer-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
    >
      <motion.section
        className="workshop-attachment-viewer"
        role="dialog"
        aria-modal="true"
        aria-label={`Vista previa de ${file.name}`}
        initial={{ opacity: 0, scale: 0.985 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.985 }}
        transition={{ duration: 0.22 }}
      >
        <header onClick={(event) => event.stopPropagation()}>
          <span className="workshop-attachment-viewer-icon"><FileText size={20} /></span>
          <div>
            <strong>{file.name}</strong>
            <small>{fileSize(file.size)} · Vista previa del recurso</small>
          </div>
          <div className="workshop-attachment-viewer-actions">
            {url && (
              <a href={url} target="_blank" rel="noopener noreferrer" download>
                <Download size={17} /><span>Descargar</span>
              </a>
            )}
            <button type="button" onClick={onClose} aria-label="Cerrar visor">
              <X size={18} /><span>Cerrar</span>
            </button>
          </div>
        </header>

        <div className={`workshop-attachment-viewer-stage is-${kind}`}>
          {loading ? (
            <div className="workshop-attachment-viewer-loading">
              <LoaderCircle className="spin" size={28} />
              <strong>Preparando el recurso…</strong>
            </div>
          ) : kind === "image" ? (
            <span className="workshop-attachment-image" onClick={(event) => event.stopPropagation()}>
              <Image src={url} alt={file.name} fill unoptimized sizes="100vw" />
            </span>
          ) : kind === "video" ? (
            <video src={url} controls autoPlay onClick={(event) => event.stopPropagation()} />
          ) : kind === "audio" ? (
            <div className="workshop-attachment-audio" onClick={(event) => event.stopPropagation()}>
              <Headphones size={54} />
              <strong>{file.name}</strong>
              <audio src={url} controls autoPlay />
            </div>
          ) : kind === "document" ? (
            <iframe src={url} title={`Vista previa de ${file.name}`} />
          ) : (
            <div className="workshop-attachment-unavailable" onClick={(event) => event.stopPropagation()}>
              <FileText size={52} />
              <h2>Este formato no tiene vista previa</h2>
              <p>Puedes descargar el archivo para abrirlo en tu dispositivo.</p>
              <a href={url} target="_blank" rel="noopener noreferrer" download>
                <Download size={17} /> Descargar recurso
              </a>
            </div>
          )}
        </div>
        <footer>Haz clic fuera del recurso o usa “Cerrar” para volver.</footer>
      </motion.section>
    </motion.div>,
    document.body,
  );
}
