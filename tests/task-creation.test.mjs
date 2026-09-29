import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const source = await readFile(new URL("../lib/task-creation.ts", import.meta.url), "utf8");
const { createTaskCreationSequence, TASK_CREATION_DELAY_MS, TASK_CREATION_SUCCESS_MS } = await import(
  `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString("base64")}`
);

test("espera 2 segundos para crear y confirma durante 1.5 segundos antes de cerrar", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const sequence = createTaskCreationSequence();
  const stages = [];
  let finish;
  const saving = new Promise((resolve) => { finish = resolve; });
  const run = sequence.run(
    async () => { stages.push("create"); await saving; },
    () => stages.push("saving"),
    () => stages.push("success"),
  ).then((created) => {
    if (created) stages.push("close");
    return created;
  });
  assert.equal(TASK_CREATION_DELAY_MS, 2000);
  assert.equal(TASK_CREATION_SUCCESS_MS, 1500);
  assert.equal(sequence.pending, true);
  assert.equal(await sequence.run(async () => stages.push("duplicate"), () => {}, () => {}), false);
  context.mock.timers.tick(1999);
  await Promise.resolve();
  assert.deepEqual(stages, []);
  context.mock.timers.tick(1);
  await Promise.resolve();
  assert.deepEqual(stages, ["saving", "create"]);
  assert.equal(sequence.pending, true);
  assert.equal(await sequence.run(async () => stages.push("duplicate"), () => {}, () => {}), false);
  finish();
  await new Promise(setImmediate);
  assert.deepEqual(stages, ["saving", "create", "success"]);
  assert.equal(sequence.pending, true);
  assert.equal(await sequence.run(async () => stages.push("duplicate"), () => {}, () => {}), false);
  context.mock.timers.tick(1499);
  await Promise.resolve();
  assert.deepEqual(stages, ["saving", "create", "success"]);
  assert.equal(sequence.pending, true);
  context.mock.timers.tick(1);
  assert.equal(await run, true);
  assert.deepEqual(stages, ["saving", "create", "success", "close"]);
  assert.equal(sequence.pending, false);
});

test("cerrar o desmontar durante la pausa cancela la creación antes de guardar", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const sequence = createTaskCreationSequence();
  let writes = 0;
  const run = sequence.run(async () => { writes++; }, () => assert.fail("No debe iniciar el guardado"), () => assert.fail("No debe confirmar"));
  context.mock.timers.tick(800);
  sequence.cancel();
  context.mock.timers.tick(2000);
  assert.equal(await run, false);
  assert.equal(writes, 0);
  assert.equal(sequence.pending, false);
});

test("un error se informa y libera el bloqueo para reintentar una sola vez", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const sequence = createTaskCreationSequence();
  const error = new Error("No hay conexión");
  const run = sequence.run(async () => { throw error; }, () => {}, () => assert.fail("No debe confirmar un error"));
  context.mock.timers.tick(2000);
  await assert.rejects(run, (actual) => actual === error);
  assert.equal(sequence.pending, false);
  let writes = 0;
  const retry = sequence.run(async () => { writes++; }, () => {}, () => {});
  context.mock.timers.tick(2000);
  await new Promise(setImmediate);
  context.mock.timers.tick(1500);
  assert.equal(await retry, true);
  assert.equal(writes, 1);
});

test("desmontar durante la confirmación cancela el cierre pendiente sin repetir la escritura", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const sequence = createTaskCreationSequence();
  let writes = 0;
  let confirmations = 0;
  const run = sequence.run(async () => { writes++; }, () => {}, () => { confirmations++; });
  context.mock.timers.tick(2000);
  await new Promise(setImmediate);
  assert.equal(writes, 1);
  assert.equal(confirmations, 1);
  assert.equal(sequence.pending, true);
  context.mock.timers.tick(1500);
  sequence.cancel();
  assert.equal(await run, false);
  assert.equal(writes, 1);
  assert.equal(sequence.pending, false);
});
