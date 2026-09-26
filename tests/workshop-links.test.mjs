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
  assert.match(firebase, /input: \{ title: string; description: string; files: File\[\]/);
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
