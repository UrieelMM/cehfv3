import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createWorkspacePdfBlob,
  createWorkspaceWordBlob,
  parseWorkspaceExportContent,
  workspaceExportFileName,
} from "../lib/staff-workspace-export.ts";

const projectRoot = new URL("../", import.meta.url);

test("workspace exports preserve rich text, lists, tables and linked resources", () => {
  const content = JSON.stringify([
    {
      type: "heading",
      props: { level: 2 },
      content: [{ type: "text", text: "Propósito", styles: { bold: true } }],
    },
    {
      type: "bulletListItem",
      content: [
        { type: "text", text: "Consultar ", styles: {} },
        {
          type: "link",
          href: "https://example.com/guia",
          content: [{ type: "text", text: "la guía", styles: { underline: true } }],
        },
      ],
      children: [{ type: "checkListItem", props: { checked: true }, content: "Listo" }],
    },
    {
      type: "table",
      content: {
        type: "tableContent",
        headerRows: 1,
        rows: [
          { cells: ["Hora", "Actividad"] },
          { cells: ["08:00", [{ type: "text", text: "Lectura", styles: { italic: true } }]] },
        ],
      },
    },
    { type: "file", props: { name: "Material.pdf", url: "https://example.com/material.pdf" } },
  ]);

  const blocks = parseWorkspaceExportContent(content);
  assert.equal(blocks[0].kind, "heading");
  assert.equal(blocks[1].kind, "bullet");
  assert.equal(blocks[1].inlines[1].link, "https://example.com/guia");
  assert.equal(blocks[2].kind, "check");
  assert.equal(blocks[2].indent, 1);
  assert.equal(blocks[2].checked, true);
  assert.equal(blocks[3].kind, "table");
  assert.equal(blocks[3].rows[1][1][0].italic, true);
  assert.equal(blocks[4].kind, "resource");
  assert.equal(blocks[4].url, "https://example.com/material.pdf");
});

test("workspace export filenames are safe and keep the selected format", () => {
  assert.equal(
    workspaceExportFileName("Planeación: Geografía 4.º A", "docx"),
    "planeacion-geografia-4-a.docx",
  );
  assert.equal(workspaceExportFileName("", "pdf"), "documento.pdf");
});

test("generates valid Word and PDF file payloads", async () => {
  const input = {
    title: "Planeación semanal",
    content: JSON.stringify([
      { type: "heading", props: { level: 2 }, content: "Propósito" },
      { type: "paragraph", content: "Reconocer las regiones de México." },
      {
        type: "table",
        content: {
          type: "tableContent",
          headerRows: 1,
          rows: [
            { cells: ["Región", "Características"] },
            { cells: ["Norte", "Clima seco"] },
          ],
        },
      },
    ]),
    type: "planning",
    ownerName: "Docente CEHF",
    subject: "Geografía",
    group: "4.º A",
    tags: ["Planeación"],
    attachments: [],
  };

  const [word, pdf] = await Promise.all([
    createWorkspaceWordBlob(input),
    createWorkspacePdfBlob(input),
  ]);
  const wordHeader = new Uint8Array(await word.slice(0, 2).arrayBuffer());
  const pdfHeader = new TextDecoder().decode(await pdf.slice(0, 5).arrayBuffer());

  assert.deepEqual([...wordHeader], [0x50, 0x4b]);
  assert.equal(pdfHeader, "%PDF-");
  assert.ok(word.size > 1_000);
  assert.ok(pdf.size > 1_000);
});

test("Mis documentos exposes Word and PDF downloads from cards and the editor", async () => {
  const source = await readFile(
    new URL("components/staff-workspace-page.tsx", projectRoot),
    "utf8",
  );

  assert.match(source, /downloadWorkspaceDocument\(source, format\)/);
  assert.ok((source.match(/Descargar Word/g) ?? []).length >= 2);
  assert.ok((source.match(/Descargar PDF/g) ?? []).length >= 2);
});
