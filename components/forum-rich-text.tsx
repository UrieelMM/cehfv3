"use client";

import { filterSuggestionItems } from "@blocknote/core/extensions";
import { es } from "@blocknote/core/locales";
import { BlockNoteView } from "@blocknote/mantine";
import {
  SuggestionMenuController,
  useCreateBlockNote,
  useEditorChange,
  useEditorSelectionChange,
  type DefaultReactSuggestionItem,
} from "@blocknote/react";
import {
  AtSign,
  Bold,
  Heading2,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  Redo2,
  Underline,
  Undo2,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  forumRichTextToPlainText,
  parseForumRichText,
} from "@/lib/forum-rich-text";

export type ForumEditorMember = {
  id: string;
  name: string;
  initials: string;
};

type ForumRichTextProps = {
  content: string;
  editorKey: string;
  editable?: boolean;
  maxLength?: number;
  members?: ForumEditorMember[];
  focusRequest?: number;
  onChange?: (richText: string, plainText: string) => void;
};

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
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", syncTheme);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", syncTheme);
    };
  }, []);

  return theme;
}

function MountedForumRichText({
  content,
  editorKey,
  editable = true,
  maxLength,
  members = [],
  focusRequest = 0,
  onChange,
}: ForumRichTextProps) {
  const theme = useAppTheme();
  const editor = useCreateBlockNote(
    { dictionary: es, initialContent: parseForumRichText(content) },
    [editorKey],
  );
  const [activeStyles, setActiveStyles] = useState(() => editor.getActiveStyles());
  const [characterCount, setCharacterCount] = useState(() =>
    forumRichTextToPlainText(editor.document).length,
  );

  useEditorSelectionChange(() => setActiveStyles(editor.getActiveStyles()), editor);
  useEditorChange(() => {
    setActiveStyles(editor.getActiveStyles());
    setCharacterCount(forumRichTextToPlainText(editor.document).length);
  }, editor);

  useEffect(() => {
    if (editable && focusRequest > 0) editor.focus();
  }, [editable, editor, focusRequest]);

  const formatBlock = (
    type: "heading" | "bulletListItem" | "numberedListItem" | "checkListItem",
  ) => {
    editor.focus();
    const blocks = editor.getSelection()?.blocks ?? [editor.getTextCursorPosition().block];
    for (const block of blocks) {
      if (!block.content || !Array.isArray(block.content)) continue;
      editor.updateBlock(
        block,
        block.type === type
          ? { type: "paragraph" }
          : type === "heading"
            ? { type, props: { level: 2 } }
            : { type },
      );
    }
  };

  const mentionItems = async (query: string): Promise<DefaultReactSuggestionItem[]> =>
    filterSuggestionItems(
      members.map((member) => ({
        title: member.name,
        subtext: "Participante",
        aliases: [member.name, member.initials],
        icon: <span className="forum-editor-mention-avatar">{member.initials}</span>,
        onItemClick: () => editor.insertInlineContent([
          { type: "text", text: `@${member.name}`, styles: { bold: true } },
          " ",
        ]),
      })),
      query,
    );

  return (
    <div className={`forum-rich-text ${editable ? "is-editable" : "is-reader"}`}>
      {editable && (
        <div className="forum-rich-toolbar" role="toolbar" aria-label="Formato de la aportación">
          <div role="group" aria-label="Historial de edición">
            <button type="button" aria-label="Deshacer" title="Deshacer" onMouseDown={(event) => event.preventDefault()} onClick={() => { editor.focus(); editor.undo(); }}><Undo2 size={16} /></button>
            <button type="button" aria-label="Rehacer" title="Rehacer" onMouseDown={(event) => event.preventDefault()} onClick={() => { editor.focus(); editor.redo(); }}><Redo2 size={16} /></button>
          </div>
          <div role="group" aria-label="Estilo de texto">
            {([{ style: "bold", label: "Negrita", icon: Bold }, { style: "italic", label: "Cursiva", icon: Italic }, { style: "underline", label: "Subrayado", icon: Underline }] as const).map(({ style, label, icon: Icon }) => (
              <button key={style} type="button" aria-label={label} aria-pressed={!!activeStyles[style]} title={label} onMouseDown={(event) => event.preventDefault()} onClick={() => { editor.focus(); editor.toggleStyles({ [style]: true }); }}><Icon size={16} /></button>
            ))}
          </div>
          <div role="group" aria-label="Estructura del texto">
            <button type="button" aria-label="Encabezado" title="Encabezado" onMouseDown={(event) => event.preventDefault()} onClick={() => formatBlock("heading")}><Heading2 size={18} /></button>
            <button type="button" aria-label="Lista con viñetas" title="Lista con viñetas" onMouseDown={(event) => event.preventDefault()} onClick={() => formatBlock("bulletListItem")}><List size={17} /></button>
            <button type="button" aria-label="Lista numerada" title="Lista numerada" onMouseDown={(event) => event.preventDefault()} onClick={() => formatBlock("numberedListItem")}><ListOrdered size={17} /></button>
            <button type="button" aria-label="Lista de tareas" title="Lista de tareas" onMouseDown={(event) => event.preventDefault()} onClick={() => formatBlock("checkListItem")}><ListChecks size={17} /></button>
          </div>
          {members.length > 0 && <span className="forum-editor-mention-help"><AtSign size={13} /> escribe @ para mencionar</span>}
          {maxLength && <span className={characterCount > maxLength ? "is-over-limit" : ""}>{characterCount}/{maxLength}</span>}
        </div>
      )}
      <BlockNoteView
        className="forum-blocknote"
        editable={editable}
        editor={editor}
        onChange={editable && onChange
          ? () => onChange(JSON.stringify(editor.document), forumRichTextToPlainText(editor.document))
          : undefined}
        theme={theme}
      >
        {editable && members.length > 0 && (
          <SuggestionMenuController getItems={mentionItems} triggerCharacter="@" />
        )}
      </BlockNoteView>
    </div>
  );
}

export function ForumRichText(props: ForumRichTextProps) {
  return <MountedForumRichText key={props.editorKey} {...props} />;
}
