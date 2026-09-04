"use client";

import { countWorkspaceWords } from "@/lib/staff-workspace-content";
import { filterSuggestionItems } from "@blocknote/core/extensions";
import { es } from "@blocknote/core/locales";
import type { PartialBlock } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/mantine";
import {
  SuggestionMenuController,
  useCreateBlockNote,
  useEditorChange,
  useEditorSelectionChange,
  type DefaultReactSuggestionItem,
} from "@blocknote/react";
import { AtSign, Bold, Italic, Underline, List, ListChecks, Heading2, Undo2, Redo2 } from "lucide-react";
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

  const [activeStyles, setActiveStyles] = useState(() => editor.getActiveStyles());
  const [wordCount, setWordCount] = useState(() => countWorkspaceWords(editor.document));
  useEditorSelectionChange(() => setActiveStyles(editor.getActiveStyles()), editor);
  useEditorChange(() => {
    setActiveStyles(editor.getActiveStyles());
    setWordCount(countWorkspaceWords(editor.document));
  }, editor);

  const formatBlock = (type: "heading" | "bulletListItem" | "checkListItem") => {
    editor.focus();
    const blocks = editor.getSelection()?.blocks ?? [editor.getTextCursorPosition().block];
    for (const block of blocks) {
      if (block.content && Array.isArray(block.content)) {
        editor.updateBlock(block, block.type === type ? { type: "paragraph" } : type === "heading" ? { type, props: { level: 2 } } : { type });
      }
    }
  };

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
    <div className="staff-workspace-writing-surface">
      {editable && <div className="staff-workspace-format-bar" role="group" aria-label="Formato de texto">
        <div role="group" aria-label="Historial de edición">
          <button aria-label="Deshacer" title="Deshacer (Ctrl/⌘ Z)" onMouseDown={(event) => event.preventDefault()} onClick={() => { editor.focus(); editor.undo(); }} type="button"><Undo2 size={17} /></button>
          <button aria-label="Rehacer" title="Rehacer (Ctrl/⌘ Shift Z)" onMouseDown={(event) => event.preventDefault()} onClick={() => { editor.focus(); editor.redo(); }} type="button"><Redo2 size={17} /></button>
        </div>
        <div role="group" aria-label="Estilo de texto">
          {([{ style: "bold", label: "Negrita", icon: Bold }, { style: "italic", label: "Cursiva", icon: Italic }, { style: "underline", label: "Subrayado", icon: Underline }] as const).map(({ style, label, icon: Icon }) => <button key={style} aria-label={label} aria-pressed={!!activeStyles[style]} title={label} onMouseDown={(event) => event.preventDefault()} onClick={() => { editor.focus(); editor.toggleStyles({ [style]: true }); }} type="button"><Icon size={17} /></button>)}
        </div>
        <div role="group" aria-label="Estructura del documento">
          <button title="Encabezado" aria-label="Encabezado" onMouseDown={(event) => event.preventDefault()} onClick={() => formatBlock("heading")} type="button"><Heading2 size={19} /></button>
          <button title="Lista con viñetas" aria-label="Lista con viñetas" onMouseDown={(event) => event.preventDefault()} onClick={() => formatBlock("bulletListItem")} type="button"><List size={18} /></button>
          <button title="Lista de tareas" aria-label="Lista de tareas" onMouseDown={(event) => event.preventDefault()} onClick={() => formatBlock("checkListItem")} type="button"><ListChecks size={18} /></button>
        </div>
        <span className="staff-workspace-word-count">{wordCount} {wordCount === 1 ? "palabra" : "palabras"}</span>
      </div>}
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
    </div>
  );
}

export function StaffWorkspaceRichEditor(props: Props) {
  return <MountedWorkspaceEditor key={props.documentKey} {...props} />;
}

export function WorkspaceEditorHint() {
  return (
    <details className="staff-workspace-editor-help"><summary>Ayuda del editor</summary><div className="staff-workspace-editor-hint">
      <span><strong>/</strong> Inserta bloques, tablas y archivos</span>
      <span><AtSign size={13} /> Menciona a alguien del equipo</span>
      <span>Ctrl/⌘ + B: negrita · Ctrl/⌘ + Z: deshacer</span>
    </div></details>
  );
}
