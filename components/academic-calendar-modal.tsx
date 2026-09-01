"use client";

import {
  CalendarDays,
  Download,
  ImagePlus,
  RefreshCw,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ACADEMIC_CALENDAR_IMAGE_TYPES,
  MAX_ACADEMIC_CALENDAR_IMAGE_SIZE,
} from "@/lib/academic-calendar-image-firebase";
import type { AcademicCalendarImage, Role } from "@/lib/types";

type AcademicCalendarModalProps = {
  calendar: AcademicCalendarImage | null;
  loading: boolean;
  saving: boolean;
  role: Role;
  onClose: () => void;
  onPublish: (file: File) => Promise<boolean>;
  onRemove: () => Promise<void>;
};

function formatUpdatedAt(value: string) {
  if (!value) return "Actualizado recientemente";
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Mexico_City",
  }).format(new Date(value));
}

export function AcademicCalendarModal({
  calendar,
  loading,
  saving,
  role,
  onClose,
  onPublish,
  onRemove,
}: AcademicCalendarModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const canManage = role === "director";

  const previewUrl = useMemo(
    () => selectedFile ? URL.createObjectURL(selectedFile) : "",
    [selectedFile],
  );

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function selectFile(file?: File) {
    setValidationError("");
    if (!file) return;
    if (!ACADEMIC_CALENDAR_IMAGE_TYPES.includes(
      file.type as (typeof ACADEMIC_CALENDAR_IMAGE_TYPES)[number],
    )) {
      setValidationError("Selecciona una imagen JPG, PNG o WEBP.");
      return;
    }
    if (file.size <= 0 || file.size > MAX_ACADEMIC_CALENDAR_IMAGE_SIZE) {
      setValidationError("La imagen debe pesar menos de 10 MB.");
      return;
    }
    setSelectedFile(file);
  }

  const visibleImage = previewUrl || calendar?.imageUrl || "";

  return (
    <motion.div
      className="academic-calendar-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <motion.section
        className="academic-calendar-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="academic-calendar-modal-title"
        initial={{ opacity: 0, y: 20, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.985 }}
      >
        <header className="academic-calendar-modal-header">
          <span className="academic-calendar-modal-icon" aria-hidden="true">
            <CalendarDays size={22} />
          </span>
          <div>
            <span className="eyebrow">Información institucional</span>
            <h2 id="academic-calendar-modal-title">Calendario académico</h2>
            <p>
              {canManage
                ? "Publica la imagen que consultarán alumnos y maestros."
                : "Consulta aquí las fechas y actividades importantes del ciclo escolar."}
            </p>
          </div>
          <button
            className="plain-icon"
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Cerrar calendario académico"
          >
            <X size={20} />
          </button>
        </header>

        <div className={`academic-calendar-viewer ${visibleImage ? "has-image" : "is-empty"}`}>
          {loading ? (
            <div className="academic-calendar-loading" role="status">
              <span className="button-spinner" />
              <strong>Cargando calendario…</strong>
            </div>
          ) : visibleImage ? (
            <Image
              src={visibleImage}
              alt={selectedFile?.name || calendar?.fileName || "Calendario académico"}
              width={1600}
              height={1200}
              unoptimized
            />
          ) : (
            <div className="academic-calendar-empty">
              <span><CalendarDays size={34} /></span>
              <strong>Aún no hay un calendario publicado</strong>
              <p>
                {canManage
                  ? "Selecciona una imagen para que toda la comunidad pueda consultarla desde el sidebar."
                  : "Dirección lo publicará próximamente. Cuando esté disponible aparecerá en este espacio."}
              </p>
            </div>
          )}
        </div>

        {calendar && !selectedFile && (
          <div className="academic-calendar-meta">
            <span>
              <strong>Publicado por {calendar.updatedByName}</strong>
              <small>{formatUpdatedAt(calendar.updatedAt)}</small>
            </span>
            <a href={calendar.imageUrl} download={calendar.fileName} target="_blank" rel="noreferrer">
              <Download size={15} /> Descargar
            </a>
          </div>
        )}

        {canManage && (
          <footer className="academic-calendar-manager">
            <input
              ref={inputRef}
              className="academic-calendar-file-input"
              type="file"
              accept={ACADEMIC_CALENDAR_IMAGE_TYPES.join(",")}
              aria-label="Seleccionar imagen del calendario"
              onChange={(event) => selectFile(event.target.files?.[0])}
            />
            <div>
              <span>
                <strong>{selectedFile ? selectedFile.name : "Imagen JPG, PNG o WEBP"}</strong>
                <small>{selectedFile ? `${(selectedFile.size / 1024 / 1024).toFixed(2)} MB` : " Máximo 10 MB"}</small>
              </span>
              {validationError && <p role="alert">{validationError}</p>}
            </div>
            <div className="academic-calendar-manager-actions">
              {calendar && !selectedFile && (
                <button
                  className="academic-calendar-remove"
                  type="button"
                  disabled={saving}
                  onClick={() => void onRemove()}
                >
                  <Trash2 size={15} /> Retirar
                </button>
              )}
              <button
                className="secondary-button"
                type="button"
                disabled={saving}
                onClick={() => inputRef.current?.click()}
              >
                {calendar ? <RefreshCw size={15} /> : <ImagePlus size={15} />}
                {calendar ? "Reemplazar" : "Elegir imagen"}
              </button>
              {selectedFile && (
                <button
                  className="primary-button"
                  type="button"
                  disabled={saving}
                  onClick={async () => {
                    const published = await onPublish(selectedFile);
                    if (!published) return;
                    setSelectedFile(null);
                    if (inputRef.current) inputRef.current.value = "";
                  }}
                >
                  {saving ? <span className="button-spinner" /> : <UploadCloud size={15} />}
                  {saving ? "Publicando…" : "Publicar calendario"}
                </button>
              )}
            </div>
          </footer>
        )}
      </motion.section>
    </motion.div>
  );
}
