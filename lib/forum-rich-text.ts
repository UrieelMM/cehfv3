import type { PartialBlock } from "@blocknote/core";

export function parseForumRichText(content: string): PartialBlock[] {
  if (content.trim()) {
    try {
      const parsed: unknown = JSON.parse(content);
      if (Array.isArray(parsed) && parsed.length) return parsed as PartialBlock[];
    } catch {
      return [{ type: "paragraph", content }];
    }
  }
  return [{ type: "paragraph", content: "" }];
}

export function normalizeForumRichText(content: string): string {
  return JSON.stringify(parseForumRichText(content));
}

function inlineText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(inlineText).join("");
  if (!value || typeof value !== "object") return "";
  const node = value as Record<string, unknown>;
  if (typeof node.text === "string") return node.text;
  if (node.type === "tableContent" && Array.isArray(node.rows)) {
    return node.rows.map((row) => {
      if (!row || typeof row !== "object") return "";
      const cells = (row as Record<string, unknown>).cells;
      return Array.isArray(cells) ? cells.map(inlineText).join(" ") : "";
    }).join(" ");
  }
  return inlineText(node.content);
}

/** Plain text is kept beside the BlockNote document for search, alerts and moderation. */
export function forumRichTextToPlainText(content: string | unknown[]): string {
  let blocks: unknown = content;
  if (typeof content === "string") {
    if (!content.trim()) return "";
    try {
      blocks = JSON.parse(content);
    } catch {
      return content.replace(/\s+/gu, " ").trim();
    }
  }
  if (!Array.isArray(blocks)) return "";
  const chunks: string[] = [];
  const visit = (values: unknown[]) => {
    for (const value of values) {
      if (!value || typeof value !== "object") continue;
      const block = value as Record<string, unknown>;
      chunks.push(inlineText(block.content));
      if (Array.isArray(block.children)) visit(block.children);
    }
  };
  visit(blocks);
  return chunks.join(" ").replace(/\s+/gu, " ").trim();
}
