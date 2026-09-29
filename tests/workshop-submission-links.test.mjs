import assert from "node:assert/strict";
import test from "node:test";
import { loadFirebaseTransactions } from "./helpers/firebase-transactions.mjs";

const task = { id: "activity-a", workshopId: "reading", institutionId: "school-a" };
const profile = { uid: "student-a", role: "student", name: "Alumno de prueba" };
const path = "institutions/school-a/workshops/reading/tasks/activity-a/submissions/student-a";
const input = (links) => ({ content: "", contentRich: "", links, files: [] });
const link = (label = "Presentación", url = "https://example.com/actividad") => ({ label, url });

test("una entrega de sólo enlaces guarda los nombres y URLs en la entrega y su historial", async () => {
  const { api, state } = await loadFirebaseTransactions("lib/workshops-firebase.ts");
  await api.submitWorkshopTask(task, profile, input([link("  Presentación  ", "  https://example.com/actividad  "), link("Video", "http://example.org")]));
  const current = state.documents.get(path);
  assert.deepEqual(current.links, [link(), link("Video", "http://example.org/")]);
  assert.equal(current.link, current.links[0].url);
  assert.equal(current.content, "");
  assert.equal(current.version, 1);
  assert.equal(current.studentId, profile.uid);
  assert.deepEqual(state.documents.get(`${path}/history/version-1`), current);
});

test("una nueva versión puede cambiar o quitar enlaces sin alterar el historial anterior", async () => {
  const { api, state } = await loadFirebaseTransactions("lib/workshops-firebase.ts");
  await api.submitWorkshopTask(task, profile, input([link()]));
  await api.submitWorkshopTask(task, profile, { ...input([]), content: "Ahora entrego una respuesta escrita." });
  assert.equal(state.documents.get(path).version, 2);
  assert.deepEqual(state.documents.get(path).links, []);
  assert.equal(state.documents.get(path).link, "");
  assert.deepEqual(state.documents.get(`${path}/history/version-1`).links, [link()]);
  assert.deepEqual(state.documents.get(`${path}/history/version-2`), state.documents.get(path));
});

test("los enlaces antiguos siguen siendo visibles y el formato individual sigue siendo aceptado", async () => {
  const { api, state } = await loadFirebaseTransactions("lib/workshops-firebase.ts");
  state.documents.set(path, { studentId: profile.uid, link: "https://example.com/legacy", version: 1 });
  let submission;
  api.watchWorkshopSubmissions(task, profile, (items) => { [submission] = items; });
  assert.deepEqual(submission.links, [link("Enlace entregado", "https://example.com/legacy")]);
  await api.submitWorkshopTask(task, profile, { content: "", contentRich: "", link: "https://example.com/new", files: [] });
  assert.deepEqual(state.documents.get(path).links, [link("Enlace entregado", "https://example.com/new")]);
});

test("la lectura no duplica el primer enlace y descarta protocolos peligrosos", async () => {
  const { api, state } = await loadFirebaseTransactions("lib/workshops-firebase.ts");
  state.documents.set(path, { studentId: profile.uid, link: link().url, links: [link(), link("Peligroso", "javascript:alert(1)")] });
  let submission;
  api.watchWorkshopSubmissions(task, profile, (items) => { [submission] = items; });
  assert.deepEqual(submission.links, [link()]);
  state.documents.set(path, { studentId: profile.uid, link: "javascript:alert(1)" });
  api.watchWorkshopSubmissions(task, profile, (items) => { [submission] = items; });
  assert.deepEqual(submission.links, []);
});

test("rechaza enlaces inválidos y más de diez antes de leer o guardar datos", async () => {
  const { api, state } = await loadFirebaseTransactions("lib/workshops-firebase.ts");
  for (const links of [
    [link("Presentación", "javascript:alert(1)")],
    [link("Presentación", "ftp://example.com/file")],
    [link("Presentación", "sin-url")],
    [link("", "https://example.com")],
    [link("x".repeat(101))],
    [link("Presentación", `https://example.com/${"x".repeat(2000)}`)],
    [link("Presentación", `https://example.com/${"漢".repeat(300)}`)],
    Array.from({ length: 11 }, () => link()),
  ]) {
    await assert.rejects(api.submitWorkshopTask(task, profile, input(links)));
  }
  assert.deepEqual(state.reads, []);
  assert.deepEqual(state.commits, []);
});

test("admite diez enlaces, rechaza una entrega vacía y conserva los permisos del alumno", async () => {
  const { api, state } = await loadFirebaseTransactions("lib/workshops-firebase.ts");
  await assert.rejects(api.submitWorkshopTask(task, profile, input([])), /Escribe una respuesta/);
  await assert.rejects(api.submitWorkshopTask(task, { ...profile, role: "teacher" }, input([link()])), /Sólo los alumnos/);
  await api.submitWorkshopTask(task, profile, input(Array.from({ length: 10 }, (_, index) => link(`Enlace ${index + 1}`))));
  assert.equal(state.documents.get(path).links.length, 10);
});

test("si falla el envío, ni la entrega ni el historial se guardan parcialmente", async () => {
  const { api, state } = await loadFirebaseTransactions("lib/workshops-firebase.ts");
  state.batchError = new Error("Permiso denegado");
  await assert.rejects(api.submitWorkshopTask(task, profile, input([link()])), /Permiso denegado/);
  assert.equal(state.documents.size, 0);
  assert.deepEqual(state.commits, []);
});
