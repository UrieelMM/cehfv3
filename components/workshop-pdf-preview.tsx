"use client";

import { FileWarning } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask } from "pdfjs-dist";
import { AnimatedOrb } from "@/components/animated-orb";

export function WorkshopPdfPreview({ url, name }: { url: string; name: string }) {
  const pagesRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const pages = pagesRef.current;
    if (!pages || !url) return;
    let active = true;
    let loadingTask: PDFDocumentLoadingTask | null = null;

    void (async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("No pudimos abrir el PDF.");
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        loadingTask = pdfjs.getDocument({ data: await response.arrayBuffer() });
        const pdfDocument = await loadingTask.promise;
        if (!active) return;
        pages.replaceChildren();

        for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
          const page = await pdfDocument.getPage(pageNumber);
          if (!active) return;
          const baseViewport = page.getViewport({ scale: 1 });
          const availableWidth = Math.max(320, pages.clientWidth - 36);
          const displayScale = Math.min(1.7, availableWidth / baseViewport.width);
          const outputScale = Math.min(window.devicePixelRatio || 1, 2);
          const viewport = page.getViewport({ scale: displayScale * outputScale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          canvas.style.width = `${Math.ceil(viewport.width / outputScale)}px`;
          canvas.style.height = `${Math.ceil(viewport.height / outputScale)}px`;
          canvas.setAttribute("role", "img");
          canvas.setAttribute("aria-label", `${name}, página ${pageNumber}`);

          const pageShell = document.createElement("section");
          pageShell.className = "workshop-pdf-page";
          const label = document.createElement("span");
          label.textContent = `Página ${pageNumber} de ${pdfDocument.numPages}`;
          pageShell.append(canvas, label);
          pages.append(pageShell);
          await page.render({ canvas, viewport }).promise;
        }
        if (active) setStatus("ready");
      } catch (error) {
        console.error("No pudimos renderizar el PDF del taller.", error);
        if (active) setStatus("error");
      }
    })();

    return () => {
      active = false;
      pages.replaceChildren();
      void loadingTask?.destroy();
    };
  }, [name, url]);

  return (
    <div className="workshop-pdf-preview" onClick={(event) => event.stopPropagation()}>
      <div className="workshop-pdf-pages" ref={pagesRef} />
      {status === "loading" && (
        <div className="workshop-pdf-status">
          <AnimatedOrb busy tone="mint" />
          <strong>Preparando las páginas del PDF…</strong>
        </div>
      )}
      {status === "error" && (
        <div className="workshop-pdf-status is-error">
          <FileWarning size={45} />
          <strong>No pudimos mostrar este PDF.</strong>
          <p>La descarga sigue disponible en la parte superior.</p>
        </div>
      )}
    </div>
  );
}
