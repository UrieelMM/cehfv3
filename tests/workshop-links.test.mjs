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
  assert.match(firebase, /links: WorkshopLink\[\]/);
  assert.match(functions, /links: workshopLinks\(input\.links\)/);
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
