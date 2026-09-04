import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

test("ships the organized and reusable Mi espacio workflow", async () => {
  const [source, firebaseSource, typeSource, css] = await Promise.all([
    readFile(new URL("components/staff-workspace-page.tsx", projectRoot), "utf8"),
    readFile(new URL("lib/staff-workspace-firebase.ts", projectRoot), "utf8"),
    readFile(new URL("lib/types.ts", projectRoot), "utf8"),
    readFile(new URL("app/staff-workspace.css", projectRoot), "utf8"),
  ]);

  assert.match(source, /Compartido conmigo/);
  assert.match(source, /Borrador guardado/);
  assert.match(source, /workspaceDraftKey/);
  assert.match(source, /Vistas guardadas/);
  assert.match(source, /Filtrar por materia/);
  assert.match(source, /Filtrar por grupo/);
  assert.match(source, /Filtrar por autor/);
  assert.match(source, /Filtrar por carpeta/);
  assert.match(source, /Filtrar por etiqueta/);
  assert.match(source, /Guardar como plantilla/);
  assert.match(source, /createFromTemplate/);
  assert.match(source, /toggleArchived/);
  assert.match(typeSource, /assigneeIds: string\[\]/);
  assert.match(typeSource, /archived: boolean/);
  assert.match(typeSource, /isTemplate: boolean/);
  assert.match(typeSource, /tags: string\[\]/);
  assert.match(firebaseSource, /setStaffWorkspaceItemArchived/);
  assert.match(css, /\.staff-workspace-view-tabs/);
  assert.match(css, /\.staff-workspace-advanced-filters/);
  assert.match(css, /\.staff-workspace-draft-banner/);
  assert.match(css, /\.staff-workspace-page input:focus,[\s\S]*?box-shadow: none;/);
  assert.match(css, /\.staff-workspace-page select:focus-visible/);
  assert.doesNotMatch(css, /\.staff-workspace-search:focus-within\s*\{[^}]*box-shadow:/);
  assert.doesNotMatch(css, /\.bn-container\.staff-workspace-blocknote:focus-within\s*\{[^}]*box-shadow:/);
});

test("ships collaborative workspace records with scoped Firestore rules", async () => {
  const [source, firebaseSource, firestoreRules] = await Promise.all([
    readFile(new URL("components/staff-workspace-page.tsx", projectRoot), "utf8"),
    readFile(new URL("lib/staff-workspace-firebase.ts", projectRoot), "utf8"),
    readFile(new URL("firestore.rules", projectRoot), "utf8"),
  ]);

  assert.match(source, /Confirmaciones de lectura/);
  assert.match(source, /Transferir propiedad/);
  assert.match(source, /Comentarios/);
  assert.match(source, /Historial del bloque/);
  assert.match(source, /Responsables/);
  assert.match(firebaseSource, /watchStaffWorkspaceReads/);
  assert.match(firebaseSource, /markStaffWorkspaceItemRead/);
  assert.match(firebaseSource, /watchStaffWorkspaceComments/);
  assert.match(firebaseSource, /createStaffWorkspaceComment/);
  assert.match(firebaseSource, /watchStaffWorkspaceActivity/);
  assert.match(firebaseSource, /transferStaffWorkspaceItem/);
  assert.match(firestoreRules, /match \/staffWorkspaceReads\/\{receiptId\}/);
  assert.match(firestoreRules, /match \/staffWorkspaceComments\/\{commentId\}/);
  assert.match(firestoreRules, /match \/staffWorkspaceActivity\/\{activityId\}/);
  assert.match(firestoreRules, /canReadWorkspaceRecord/);
  assert.match(firestoreRules, /activeWorkspaceStaff/);
});
