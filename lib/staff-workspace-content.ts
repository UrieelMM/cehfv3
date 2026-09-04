import type { StaffWorkspaceItemInput } from "./types";

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
