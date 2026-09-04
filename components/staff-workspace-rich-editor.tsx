"use client";

import { filterSuggestionItems } from "@blocknote/core/extensions";
import { es } from "@blocknote/core/locales";
import type { PartialBlock } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/mantine";
import {
  SuggestionMenuController,
  useCreateBlockNote,
  type DefaultReactSuggestionItem,
} from "@blocknote/react";
import { AtSign } from "lucide-react";
import { useEffect, useState } from "react";

export type WorkspaceMentionMember = {
  id: string;
  name: string;
  initials: string;
};

type Props = {
  content: string;
  documentKey: string;
  editable?: boolean;
  members: WorkspaceMentionMember[];
  onChange?: (content: string) => void;
  onMention?: (memberId: string) => void;
  onUploadFile?: (file: File) => Promise<string>;
};

function parseInitialContent(content: string): PartialBlock[] {
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

function useAppTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const syncTheme = () => {
      const selected = document.documentElement.dataset.theme;
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      setTheme(selected === "dark" || (selected === "system" && prefersDark) ? "dark" : "light");
    };
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", syncTheme);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", syncTheme);
    };
  }, []);

  return theme;
}

function MountedWorkspaceEditor({
  content,
  documentKey,
  editable = true,
  members,
  onChange,
  onMention,
  onUploadFile,
}: Props) {
  const theme = useAppTheme();
  const editor = useCreateBlockNote(
    {
      dictionary: es,
      initialContent: parseInitialContent(content),
      uploadFile: onUploadFile,
    },
    [documentKey],
  );

  const mentionItems = async (query: string): Promise<DefaultReactSuggestionItem[]> =>
    filterSuggestionItems(
      members.map((member) => ({
        title: member.name,
        subtext: "Miembro del equipo",
        aliases: [member.name, member.initials],
        icon: (
          <span className="staff-workspace-mention-avatar" aria-hidden="true">
            {member.initials}
          </span>
        ),
        onItemClick: () => {
          onMention?.(member.id);
          editor.insertInlineContent([
            {
              type: "text",
              text: `@${member.name}`,
              styles: { bold: true },
            },
            " ",
          ]);
        },
      })),
      query,
    );

  return (
    <BlockNoteView
      className={`staff-workspace-blocknote ${editable ? "is-editable" : "is-reader"}`}
      editable={editable}
      editor={editor}
      onChange={editable && onChange
        ? () => onChange(JSON.stringify(editor.document))
        : undefined}
      theme={theme}
    >
      {editable && members.length > 0 && (
        <SuggestionMenuController
          getItems={mentionItems}
          triggerCharacter="@"
        />
      )}
    </BlockNoteView>
  );
}

export function StaffWorkspaceRichEditor(props: Props) {
  return <MountedWorkspaceEditor {...props} />;
}

export function WorkspaceEditorHint() {
  return (
    <div className="staff-workspace-editor-hint">
      <span><strong>/</strong> Inserta bloques, tablas y archivos</span>
      <span><AtSign size={13} /> Menciona a alguien del equipo</span>
    </div>
  );
}
