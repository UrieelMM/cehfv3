import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const source = await readFile(new URL("../lib/staff-workspace-content.ts", import.meta.url), "utf8");
const {
  countWorkspaceWords,
  WORKSPACE_TAG_OPTIONS,
  workspaceDefaultContent,
  workspaceTemplateDraft,
} = await import(
  `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString("base64")}`
);

test("workspace uses a fixed catalog of ten practical labels", () => {
  assert.equal(WORKSPACE_TAG_OPTIONS.length, 10);
  assert.deepEqual([...WORKSPACE_TAG_OPTIONS], [
    "Planeación", "Evaluación", "Reunión", "Seguimiento", "Recursos",
    "Pendiente", "Urgente", "Familias", "Inclusión", "Proyecto",
  ]);
});

test("the schedule starter is a professional table with defined columns", () => {
  const blocks = JSON.parse(workspaceDefaultContent("schedule"));
  const table = blocks.find((block) => block.type === "table");

  assert.equal(table.content.type, "tableContent");
  assert.equal(table.content.headerRows, 1);
  assert.deepEqual(table.content.rows[0].cells, [
    "Hora", "Actividad o clase", "Grupo", "Responsable", "Espacio / enlace",
  ]);
  assert.equal(table.content.rows.length, 6);
});

test("word counts preserve words split by formatting and include nested lists and table cells", () => {
  assert.equal(countWorkspaceWords([
    { content: [{ text: "Apren", styles: { bold: true } }, { text: "dizaje activo" }], children: [{ content: [{ text: "Una tarea" }] }] },
    { content: { type: "tableContent", rows: [{ cells: [[{ text: "Primera celda" }], { content: [{ text: "Segunda celda" }] }] }] } },
  ]), 8);
  assert.equal(countWorkspaceWords([{ content: "Inicio de clase" }]), 3);
  assert.equal(countWorkspaceWords([{ content: [] }]), 0);
});

test("saving a template uses the current draft and leaves its audience and schedule untouched", () => {
  const draft = {
    type: "planning", title: " Lectura · copia ", content: JSON.stringify([{ type: "paragraph", content: "Última edición sin guardar" }]),
    visibility: "selected", sharedWithIds: ["teacher-2"], mentionedUserIds: ["teacher-2"], assigneeIds: ["teacher-2"],
    archived: false, isTemplate: false, eventAt: "2026-09-04", attachments: [], tags: ["lectura"], folder: "Cuarto grado", subject: "Español", group: "4 A",
  };
  const before = structuredClone(draft);
  const template = workspaceTemplateDraft(draft);
  assert.equal(template.content, draft.content);
  assert.equal(template.title, "Lectura");
  assert.equal(template.isTemplate, true);
  assert.equal(template.visibility, "private");
  assert.equal(template.eventAt, "");
  assert.deepEqual(template.sharedWithIds, []);
  assert.deepEqual(template.mentionedUserIds, []);
  assert.deepEqual(template.assigneeIds, []);
  assert.deepEqual(draft, before);
});

test("templates retain file slots without depending on uploads that the original can delete", () => {
  const content = JSON.stringify([{ type: "paragraph", content: "Materiales", children: [{ type: "file", props: { url: "blob:unsaved-upload", name: "Actividad.pdf" } }] }]);
  const template = workspaceTemplateDraft({ title: "Actividad", content, attachments: [{ url: "blob:unsaved-upload" }] });
  const blocks = JSON.parse(template.content);
  assert.equal(blocks[0].content, "Materiales");
  assert.equal(blocks[0].children[0].props.url, "");
  assert.equal(blocks[0].children[0].props.name, "Actividad.pdf");
  assert.deepEqual(template.attachments, []);
});
