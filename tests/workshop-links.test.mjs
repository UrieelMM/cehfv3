import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("Talleres guarda enlaces al crear y editar recursos y actividades", async () => {
  const [firebase, functions, rules] = await Promise.all([
    source("lib/workshops-firebase.ts"),
    source("functions/src/index.ts"),
    source("firestore.rules"),
  ]);
  assert.match(firebase, /links: workshopLinksFromData\(data\.links\)/);
  assert.match(firebase, /const links = normalizeWorkshopLinks\(input\.links\)/);
  assert.match(firebase, /return requirePersistedWorkshopLinks\(result, links\)/g);
  assert.match(firebase, /links: WorkshopLink\[\]/);
  assert.match(functions, /links: workshopLinks\(input\.links\)/);
  assert.match(functions, /\? \{ links: updates\.links \}/);
  assert.match(rules, /request\.resource\.data\.links\.size\(\) <= 10/g);
});

test("los formularios permiten agregar enlaces y éstos se muestran a los alumnos", async () => {
  const [resources, tasks] = await Promise.all([
    source("components/workshops-page.tsx"),
    source("components/workshop-tasks.tsx"),
  ]);
  assert.match(resources, /<WorkshopLinksEditor links=\{links\} onChange=\{setLinks\} \/>/);
  assert.match(resources, /resource\.links\.map\(\(link, index\) => <a/);
  assert.match(tasks, /<WorkshopLinksEditor links=\{links\} onChange=\{setLinks\} \/>/);
  assert.match(tasks, /task\.links\.map\(\(link, index\) => <a/);
});

test("Talleres agrupa hasta 10 archivos de una captura en un solo recurso", async () => {
  const [resources, firebase, types, rules, functions, styles] = await Promise.all([
    source("components/workshops-page.tsx"),
    source("lib/workshops-firebase.ts"),
    source("lib/types.ts"),
    source("firestore.rules"),
    source("functions/src/index.ts"),
    source("app/workshops.css"),
  ]);
  assert.match(resources, /type="file"\s+multiple/);
  assert.match(resources, /nextFiles\.length < 10/);
  assert.match(resources, /Puedes agregar hasta 10 archivos/);
  assert.match(resources, /className="workshop-resource-files"/);
  assert.match(resources, /resource\.attachments\.map/);
  assert.match(firebase, /input: \{ title: string; description: string; descriptionRich: string; files: File\[\]/);
  assert.match(firebase, /input\.files\.length > 10/);
  assert.match(firebase, /const reference = doc\(resourceCollection\)/);
  assert.match(firebase, /const attachments = resources\.map/);
  assert.match(firebase, /batch\.set\(reference, \{/);
  assert.match(firebase, /attachments,/);
  assert.match(firebase, /await batch\.commit\(\)/);
  assert.match(types, /export type WorkshopResourceFile/);
  assert.match(types, /attachments: WorkshopResourceFile\[\]/);
  assert.match(rules, /request\.resource\.data\.attachments\.size\(\) <= 10/);
  assert.match(rules, /!\("attachments" in request\.resource\.data\)/);
  assert.match(functions, /resourceContainsFile/);
  assert.match(styles, /\.workshop-resource-files\s*\{[\s\S]*?max-height:\s*156px/);
  assert.match(styles, /\.workshop-resource-card\s*\{[\s\S]*?flex-direction:\s*column/);
  assert.match(styles, /\.workshop-resource-card footer\s*\{[\s\S]*?margin-top:\s*auto/);
});

test("Talleres conserva el formato enriquecido en recursos, trabajos y entregas", async () => {
  const [page, tasks, firebase, types, rules, functions] = await Promise.all([
    source("components/workshops-page.tsx"),
    source("components/workshop-tasks.tsx"),
    source("lib/workshops-firebase.ts"),
    source("lib/types.ts"),
    source("firestore.rules"),
    source("functions/src/index.ts"),
  ]);

  assert.match(page, /editorKey=\{`workshop-resource-create-\$\{workshop\.id\}`\}/);
  assert.match(page, /resource\.descriptionRich \|\| normalizeForumRichText\(resource\.description\)/);
  assert.match(tasks, /editorKey=\{`workshop-task-create-\$\{workshop\.id\}`\}/);
  assert.match(tasks, /editorKey=\{`workshop-submission-\$\{task\.id\}-\$\{contentRevision\}`\}/);
  assert.match(tasks, /editorKey=\{`workshop-feedback-\$\{task\.id\}-\$\{selectedSubmission\.studentId\}`\}/);
  assert.match(firebase, /descriptionRich: normalizeForumRichText/);
  assert.match(firebase, /contentRich: normalizeForumRichText\(input\.contentRich \|\| input\.content\)/);
  assert.match(firebase, /teacherFeedbackRich: normalizeForumRichText\(feedbackRich \|\| feedback\)/);
  assert.match(types, /export type WorkshopSubmission = \{[\s\S]*?contentRich\?: string;[\s\S]*?teacherFeedbackRich\?: string;/);
  assert.match(rules, /function validWorkshopSubmissionRichText\(data\)/);
  assert.match(functions, /descriptionRich: forumRichText\(/);
});

test("las entregas de Talleres aceptan y muestran un enlace del alumno", async () => {
  const [tasks, firebase, rules, types] = await Promise.all([
    source("components/workshop-tasks.tsx"),
    source("lib/workshops-firebase.ts"),
    source("firestore.rules"),
    source("lib/types.ts"),
  ]);
  assert.match(tasks, /className="workshop-delivery-link"/);
  assert.match(tasks, /type="url" value=\{link\}/);
  assert.match(tasks, /Abrir enlace del alumno/);
  assert.match(firebase, /normalizeWorkshopSubmissionLink\(input\.link\)/);
  assert.match(firebase, /link: String\(data\.link \?\? ""\)/);
  assert.match(types, /export type WorkshopSubmission = \{[\s\S]*?link: string;/);
  assert.match(rules, /function validSubmissionLink\(data\)/);
  assert.match(rules, /"content", "link", "attachments"/);
});

test("los archivos del maestro y del alumno conservan vista previa y descarga", async () => {
  const [tasks, viewer, pdfPreview, firebase, functions, styles, packageJson] = await Promise.all([
    source("components/workshop-tasks.tsx"),
    source("components/workshop-file-viewer.tsx"),
    source("components/workshop-pdf-preview.tsx"),
    source("lib/workshops-firebase.ts"),
    source("functions/src/index.ts"),
    source("app/workshops.css"),
    source("package.json"),
  ]);
  assert.match(tasks, /function WorkshopAttachmentRow/);
  assert.match(tasks, /aria-label=\{`Previsualizar \$\{attachment\.name\}`\}/);
  assert.match(tasks, /aria-label=\{`Descargar \$\{attachment\.name\}`\}/);
  assert.match(tasks, /Archivos de tu entrega/);
  assert.match(tasks, /openAttachment\(attachment, mySubmission\.studentId\)/);
  assert.match(tasks, /downloadAttachment\(attachment, selectedSubmission\.studentId\)/);
  assert.match(tasks, /URL\.createObjectURL\(await response\.blob\(\)\)/);
  assert.match(viewer, /<Download size=\{17\} \/><span>Descargar<\/span>/);
  assert.match(viewer, /<WorkshopPdfPreview key=\{url\} url=\{previewSource\} name=\{file\.name\} \/>/);
  assert.match(pdfPreview, /pdfjs\.getDocument/);
  assert.match(pdfPreview, /page\.render\(\{ canvas, viewport \}\)/);
  assert.match(firebase, /getWorkshopTaskAttachmentAccess/);
  assert.match(firebase, /includePreviewData: true/);
  assert.match(functions, /previewBase64: contents\.toString\("base64"\)/);
  assert.match(packageJson, /"pdfjs-dist":/);
  assert.doesNotMatch(styles, /workshop-attachment-viewer-actions a \{ display: none; \}/);
});
