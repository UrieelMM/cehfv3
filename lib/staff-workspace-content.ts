import type { StaffWorkspaceItemInput, StaffWorkspaceItemType } from "./types";

export const WORKSPACE_TAG_OPTIONS = [
  "Planeación",
  "Evaluación",
  "Reunión",
  "Seguimiento",
  "Recursos",
  "Pendiente",
  "Urgente",
  "Familias",
  "Inclusión",
  "Proyecto",
] as const;

/** Useful starter structures for each workspace document type. */
export function workspaceDefaultContent(type: StaffWorkspaceItemType): string {
  const paragraph = (content: string) => ({ type: "paragraph", content });
  const heading = (content: string, level: 2 | 3 = 2) => ({
    type: "heading",
    props: { level },
    content,
  });
  const bullet = (content: string) => ({ type: "bulletListItem", content });
  const task = (content: string) => ({
    type: "checkListItem",
    props: { checked: false },
    content,
  });
  const scheduleTable = {
    type: "table",
    content: {
      type: "tableContent",
      headerRows: 1,
      columnWidths: [110, 240, 130, 170, 170],
      rows: [
        { cells: ["Hora", "Actividad o clase", "Grupo", "Responsable", "Espacio / enlace"] },
        { cells: ["08:00–08:50", "", "", "", ""] },
        { cells: ["09:00–09:50", "", "", "", ""] },
        { cells: ["10:00–10:50", "", "", "", ""] },
        { cells: ["11:00–11:50", "", "", "", ""] },
        { cells: ["12:00–12:50", "", "", "", ""] },
      ],
    },
  };
  const templates: Record<StaffWorkspaceItemType, object[]> = {
    planning: [
      heading("Propósito de aprendizaje"),
      paragraph("Describe el aprendizaje esperado y la evidencia que permitirá comprobarlo."),
      heading("Preparación"),
      bullet("Materiales y recursos:"),
      bullet("Conocimientos previos:"),
      bullet("Adecuaciones o apoyos:"),
      heading("Secuencia didáctica"),
      heading("Inicio", 3),
      task("Actividad de apertura y recuperación de saberes previos."),
      heading("Desarrollo", 3),
      task("Actividad central, acompañamiento y preguntas guía."),
      heading("Cierre", 3),
      task("Síntesis, producto o reflexión final."),
      heading("Evaluación"),
      paragraph("Criterios, instrumento y retroalimentación prevista."),
    ],
    resource: [
      heading("Descripción del recurso"),
      paragraph("Explica brevemente qué contiene y qué necesidad resuelve."),
      heading("Uso sugerido"),
      bullet("Materia o área:"),
      bullet("Grado o grupo recomendado:"),
      bullet("Momento de la clase:"),
      heading("Indicaciones"),
      paragraph("Agrega pasos, recomendaciones o adaptaciones para aprovechar el archivo."),
    ],
    schedule: [
      heading("Horario de actividades"),
      paragraph("Ajusta las horas y completa una fila por cada clase, reunión o actividad."),
      scheduleTable,
      heading("Notas y seguimiento"),
      task("Registrar acuerdos, materiales o pendientes del día."),
    ],
    note: [
      heading("Idea principal"),
      paragraph("Escribe aquí el contexto o la idea que quieres conservar."),
      heading("Puntos clave"),
      bullet("Dato, hallazgo o acuerdo importante."),
      bullet("Referencia o persona relacionada."),
      heading("Próximos pasos"),
      task("Acción pendiente."),
    ],
  };
  return JSON.stringify(templates[type]);
}

/** Preserve inline word boundaries across formatting and separate blocks/cells. */
export function countWorkspaceWords(document: unknown): number {
  const inlineText = (value: unknown): string => {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.map(inlineText).join("");
    if (!value || typeof value !== "object") return "";
    const node = value as Record<string, unknown>;
    if (typeof node.text === "string") return node.text;
    return inlineText(node.content);
  };
  const chunks: string[] = [];
  const visitBlocks = (value: unknown) => {
    if (!Array.isArray(value)) return;
    for (const block of value) {
      if (!block || typeof block !== "object") continue;
      const content = block.content;
      if (content?.type === "tableContent" && Array.isArray(content.rows)) {
        for (const row of content.rows) {
          if (Array.isArray(row.cells)) chunks.push(...row.cells.map(inlineText));
        }
      } else {
        chunks.push(inlineText(content));
      }
      visitBlocks(block.children);
    }
  };
  visitBlocks(document);
  return chunks.join(" ").trim().split(/\s+/u).filter(Boolean).length;
}

/** Uploaded files belong to their source document; copies get empty upload slots. */
export function workspaceTemplateContent(content: string): string {
  try {
    const parsed: unknown = JSON.parse(content);
    if (!Array.isArray(parsed)) return content;
    const copyBlocks = (blocks: unknown[]): unknown[] => blocks.map((value) => {
      if (!value || typeof value !== "object") return value;
      const block = value as Record<string, unknown>;
      const props = block.props && typeof block.props === "object" ? block.props : {};
      return {
        ...block,
        ...(["image", "video", "audio", "file"].includes(String(block.type)) ? { props: { ...props, url: "" } } : {}),
        ...(Array.isArray(block.children) ? { children: copyBlocks(block.children) } : {}),
      };
    });
    return JSON.stringify(copyBlocks(parsed));
  } catch {
    return content;
  }
}

/** A reusable snapshot starts private, without dates or assigned people. */
export function workspaceTemplateDraft(input: StaffWorkspaceItemInput): StaffWorkspaceItemInput {
  return {
    ...input,
    content: workspaceTemplateContent(input.content),
    title: input.title.trim().replace(/ · copia$/, ""),
    visibility: "private",
    sharedWithIds: [],
    mentionedUserIds: [],
    assigneeIds: [],
    archived: false,
    isTemplate: true,
    eventAt: "",
    attachments: [],
  };
}
