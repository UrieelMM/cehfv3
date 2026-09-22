import type { FileChild, ParagraphChild } from "docx";
import type {
  StaffWorkspaceAttachment,
  StaffWorkspaceItemType,
} from "./types";

export type WorkspaceExportFormat = "docx" | "pdf";

export type WorkspaceExportInput = {
  title: string;
  content: string;
  type: StaffWorkspaceItemType;
  ownerName?: string;
  subject?: string;
  group?: string;
  eventAt?: string;
  location?: string;
  folder?: string;
  tags?: string[];
  attachments?: StaffWorkspaceAttachment[];
  createdAt?: string;
  updatedAt?: string;
};

export type WorkspaceExportInline = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  link?: string;
};

export type WorkspaceExportBlock =
  | {
      kind: "paragraph" | "heading" | "bullet" | "numbered" | "check";
      inlines: WorkspaceExportInline[];
      indent: number;
      level?: number;
      checked?: boolean;
    }
  | {
      kind: "table";
      rows: WorkspaceExportInline[][][];
      headerRows: number;
      indent: number;
    }
  | {
      kind: "resource";
      inlines: WorkspaceExportInline[];
      url?: string;
      indent: number;
    };

const typeLabels: Record<StaffWorkspaceItemType, string> = {
  planning: "Planeación",
  resource: "Recurso",
  schedule: "Horario",
  note: "Nota",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function inlineContent(value: unknown, inheritedLink?: string): WorkspaceExportInline[] {
  if (typeof value === "string") return value ? [{ text: value, link: inheritedLink }] : [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => inlineContent(item, inheritedLink));
  }
  const node = asRecord(value);
  if (!node) return [];
  const props = asRecord(node.props);
  const styles = asRecord(node.styles);
  const link = String(
    node.type === "link"
      ? node.href ?? node.url ?? props?.href ?? props?.url ?? inheritedLink ?? ""
      : inheritedLink ?? "",
  ) || undefined;
  if (typeof node.text === "string") {
    return [{
      text: node.text,
      bold: styles?.bold === true,
      italic: styles?.italic === true,
      underline: styles?.underline === true,
      link,
    }];
  }
  if (node.type === "hardBreak") return [{ text: "\n" }];
  return inlineContent(node.content, link);
}

function tableCellContent(value: unknown) {
  const cell = asRecord(value);
  return inlineContent(cell && "content" in cell ? cell.content : value);
}

export function parseWorkspaceExportContent(content: string): WorkspaceExportBlock[] {
  let document: unknown = [];
  try {
    document = JSON.parse(content);
  } catch {
    document = [{ type: "paragraph", content }];
  }
  const documentBlocks: unknown[] = Array.isArray(document)
    ? document
    : [{ type: "paragraph", content: String(content || "") }];

  const output: WorkspaceExportBlock[] = [];
  const visit = (blocks: unknown[], indent = 0) => {
    for (const value of blocks) {
      const block = asRecord(value);
      if (!block) continue;
      const type = String(block.type ?? "paragraph");
      const props = asRecord(block.props);
      const contentValue = asRecord(block.content);
      if (type === "table" && contentValue?.type === "tableContent") {
        const rows = Array.isArray(contentValue.rows)
          ? contentValue.rows.map((row) => {
              const rowValue = asRecord(row);
              return Array.isArray(rowValue?.cells)
                ? rowValue.cells.map(tableCellContent)
                : [];
            })
          : [];
        if (rows.length) {
          output.push({
            kind: "table",
            rows,
            headerRows: Math.max(0, Number(contentValue.headerRows ?? 0)),
            indent,
          });
        }
      } else if (["image", "video", "audio", "file"].includes(type)) {
        const url = String(props?.url ?? "") || undefined;
        const label = String(
          props?.caption ?? props?.name ?? props?.fileName ??
            (type === "image" ? "Imagen" : type === "file" ? "Archivo" : "Recurso multimedia"),
        );
        output.push({
          kind: "resource",
          inlines: [{ text: label, link: url }],
          url,
          indent,
        });
      } else {
        const inlines = inlineContent(block.content);
        const base = { inlines, indent };
        if (type === "heading") {
          output.push({
            ...base,
            kind: "heading",
            level: Math.min(3, Math.max(1, Number(props?.level ?? 2))),
          });
        } else if (type === "bulletListItem") {
          output.push({ ...base, kind: "bullet" });
        } else if (type === "numberedListItem") {
          output.push({ ...base, kind: "numbered" });
        } else if (type === "checkListItem") {
          output.push({ ...base, kind: "check", checked: props?.checked === true });
        } else {
          output.push({ ...base, kind: "paragraph" });
        }
      }
      if (Array.isArray(block.children) && block.children.length) {
        visit(block.children, indent + 1);
      }
    }
  };
  visit(documentBlocks);
  return output;
}

export function workspaceExportFileName(title: string, extension: WorkspaceExportFormat) {
  const base = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLocaleLowerCase("es-MX")
    .slice(0, 80) || "documento";
  return `${base}.${extension}`;
}

function displayDate(value?: string) {
  if (!value) return "";
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(value.includes("T") ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

function metadata(input: WorkspaceExportInput) {
  return [
    ["Tipo", typeLabels[input.type]],
    ["Autor", input.ownerName],
    ["Materia", input.subject],
    ["Grupo", input.group],
    ["Fecha", displayDate(input.eventAt)],
    ["Ubicación", input.location],
    ["Carpeta", input.folder],
    ["Etiquetas", input.tags?.join(", ")],
    ["Creado", displayDate(input.createdAt)],
    ["Actualizado", displayDate(input.updatedAt)],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
}

function inlineText(inlines: WorkspaceExportInline[]) {
  return inlines.map((inline) => inline.text).join("");
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function createWorkspaceWordBlob(input: WorkspaceExportInput) {
  const docx = await import("docx");
  const blocks = parseWorkspaceExportContent(input.content);
  const children: FileChild[] = [
    new docx.Paragraph({
      children: [new docx.TextRun({ text: input.title.trim() || "Documento", bold: true, color: "5B21B6", size: 34 })],
      heading: docx.HeadingLevel.TITLE,
      spacing: { after: 220 },
    }),
  ];

  for (const [label, value] of metadata(input)) {
    children.push(new docx.Paragraph({
      children: [
        new docx.TextRun({ text: `${label}: `, bold: true, color: "4B5563" }),
        new docx.TextRun({ text: value, color: "374151" }),
      ],
      spacing: { after: 60 },
    }));
  }
  if (metadata(input).length) {
    children.push(new docx.Paragraph({ text: "", spacing: { after: 120 } }));
  }

  const wordRuns = (
    inlines: WorkspaceExportInline[],
    forceBold = false,
  ): ParagraphChild[] => {
    const runs = inlines.map((inline) => {
      const run = new docx.TextRun({
        text: inline.text,
        bold: forceBold || inline.bold,
        italics: inline.italic,
        underline: inline.underline || inline.link ? {} : undefined,
        color: inline.link ? "2563EB" : undefined,
      });
      return inline.link
        ? new docx.ExternalHyperlink({ children: [run], link: inline.link })
        : run;
    });
    return runs.length ? runs : [new docx.TextRun("")];
  };

  const numberedByIndent = new Map<number, number>();
  for (const block of blocks) {
    if (block.kind === "table") {
      children.push(new docx.Table({
        rows: block.rows.map((row, rowIndex) => new docx.TableRow({
          children: row.map((cell) => new docx.TableCell({
            children: [new docx.Paragraph({
              children: wordRuns(cell, rowIndex < block.headerRows),
            })],
            shading: rowIndex < block.headerRows ? { fill: "EDE9FE" } : undefined,
            margins: { top: 90, bottom: 90, left: 110, right: 110 },
          })),
        })),
        width: { size: 100, type: docx.WidthType.PERCENTAGE },
        layout: docx.TableLayoutType.AUTOFIT,
      }));
      children.push(new docx.Paragraph({ text: "", spacing: { after: 100 } }));
      continue;
    }

    if (block.kind !== "numbered") numberedByIndent.delete(block.indent);
    let paragraphChildren = wordRuns(block.inlines);
    let heading: (typeof docx.HeadingLevel)[keyof typeof docx.HeadingLevel] | undefined;
    let bullet: { level: number } | undefined;
    if (block.kind === "heading") {
      heading = block.level === 1
        ? docx.HeadingLevel.HEADING_1
        : block.level === 3
          ? docx.HeadingLevel.HEADING_3
          : docx.HeadingLevel.HEADING_2;
    } else if (block.kind === "bullet") {
      bullet = { level: Math.min(block.indent, 5) };
    } else if (block.kind === "numbered") {
      const number = (numberedByIndent.get(block.indent) ?? 0) + 1;
      numberedByIndent.set(block.indent, number);
      paragraphChildren = [new docx.TextRun(`${number}. `), ...wordRuns(block.inlines)];
    } else if (block.kind === "check") {
      paragraphChildren = [
        new docx.TextRun(block.checked ? "☒ " : "☐ "),
        ...wordRuns(block.inlines),
      ];
    } else if (block.kind === "resource") {
      paragraphChildren = [new docx.TextRun("Recurso: "), ...wordRuns(block.inlines)];
    }
    children.push(new docx.Paragraph({
      children: paragraphChildren,
      heading,
      bullet,
      indent: block.indent ? { left: block.indent * 360 } : undefined,
      spacing: { after: block.kind === "heading" ? 110 : 80, line: 300 },
    }));
  }

  if (input.attachments?.length) {
    children.push(new docx.Paragraph({
      text: "Archivos adjuntos",
      heading: docx.HeadingLevel.HEADING_2,
      spacing: { before: 220, after: 100 },
    }));
    for (const attachment of input.attachments) {
      children.push(new docx.Paragraph({
        bullet: { level: 0 },
        children: [new docx.ExternalHyperlink({
          children: [new docx.TextRun({ text: attachment.name, color: "2563EB", underline: {} })],
          link: attachment.url,
        })],
      }));
    }
  }

  const documentFile = new docx.Document({
    creator: input.ownerName || "Campus CEHF",
    title: input.title,
    description: "Documento exportado desde Mi espacio · Campus CEHF",
    sections: [{
      properties: { page: { margin: { top: 900, right: 900, bottom: 900, left: 900 } } },
      children,
    }],
  });
  return docx.Packer.toBlob(documentFile);
}

export async function createWorkspacePdfBlob(input: WorkspaceExportInput) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 52;
  const contentWidth = pageWidth - margin * 2;
  let y = 58;
  let numbered = 0;

  const ensureSpace = (height: number) => {
    if (y + height <= pageHeight - 54) return;
    pdf.addPage();
    y = 54;
  };
  const addText = (
    text: string,
    options: { size?: number; bold?: boolean; color?: [number, number, number]; indent?: number; prefix?: string } = {},
  ) => {
    const size = options.size ?? 10.5;
    const indent = options.indent ?? 0;
    pdf.setFont("helvetica", options.bold ? "bold" : "normal");
    pdf.setFontSize(size);
    pdf.setTextColor(...(options.color ?? [31, 41, 55]));
    const lines = pdf.splitTextToSize(`${options.prefix ?? ""}${text}` || " ", contentWidth - indent);
    const lineHeight = size * 1.42;
    ensureSpace(lines.length * lineHeight + 7);
    pdf.text(lines, margin + indent, y);
    y += lines.length * lineHeight + 7;
  };

  addText(input.title.trim() || "Documento", {
    size: 21,
    bold: true,
    color: [91, 33, 182],
  });
  for (const [label, value] of metadata(input)) {
    addText(`${label}: ${value}`, { size: 8.5, color: [75, 85, 99] });
  }
  if (metadata(input).length) y += 10;

  for (const block of parseWorkspaceExportContent(input.content)) {
    if (block.kind === "table") {
      ensureSpace(90);
      autoTable(pdf, {
        startY: y,
        head: block.headerRows > 0
          ? block.rows.slice(0, block.headerRows).map((row) => row.map(inlineText))
          : undefined,
        body: block.rows.slice(block.headerRows).map((row) => row.map(inlineText)),
        margin: { left: margin, right: margin },
        theme: "grid",
        styles: { font: "helvetica", fontSize: 8.5, cellPadding: 5, textColor: [31, 41, 55] },
        headStyles: { fillColor: [91, 33, 182], textColor: [255, 255, 255], fontStyle: "bold" },
      });
      const tablePdf = pdf as typeof pdf & { lastAutoTable?: { finalY: number } };
      y = (tablePdf.lastAutoTable?.finalY ?? y + 80) + 14;
      continue;
    }
    if (block.kind !== "numbered") numbered = 0;
    const text = inlineText(block.inlines);
    if (block.kind === "heading") {
      addText(text, {
        size: block.level === 1 ? 16 : block.level === 3 ? 11.5 : 13.5,
        bold: true,
        color: [55, 48, 107],
        indent: block.indent * 14,
      });
    } else if (block.kind === "bullet") {
      addText(text, { indent: block.indent * 14, prefix: "•  " });
    } else if (block.kind === "numbered") {
      numbered += 1;
      addText(text, { indent: block.indent * 14, prefix: `${numbered}.  ` });
    } else if (block.kind === "check") {
      addText(text, { indent: block.indent * 14, prefix: block.checked ? "[x]  " : "[ ]  " });
    } else if (block.kind === "resource") {
      addText(`${text}${block.url ? ` · ${block.url}` : ""}`, { color: [37, 99, 235] });
    } else {
      addText(text, { indent: block.indent * 14 });
    }
  }

  if (input.attachments?.length) {
    addText("Archivos adjuntos", { size: 13.5, bold: true, color: [55, 48, 107] });
    for (const attachment of input.attachments) {
      addText(`${attachment.name} · ${attachment.url}`, {
        size: 9,
        color: [37, 99, 235],
        prefix: "•  ",
      });
    }
  }

  const pageCount = pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    pdf.setDrawColor(226, 232, 240);
    pdf.line(margin, pageHeight - 34, pageWidth - margin, pageHeight - 34);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(107, 114, 128);
    pdf.text("Campus CEHF · Mi espacio", margin, pageHeight - 20);
    pdf.text(`${page} / ${pageCount}`, pageWidth - margin, pageHeight - 20, { align: "right" });
  }
  return pdf.output("blob");
}

export async function downloadWorkspaceDocument(
  input: WorkspaceExportInput,
  format: WorkspaceExportFormat,
) {
  const blob = format === "docx"
    ? await createWorkspaceWordBlob(input)
    : await createWorkspacePdfBlob(input);
  triggerDownload(blob, workspaceExportFileName(input.title, format));
}
