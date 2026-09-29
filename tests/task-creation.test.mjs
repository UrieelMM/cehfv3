import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const source = await readFile(new URL("../lib/task-creation.ts", import.meta.url), "utf8");
const { createTaskCreationSequence, TASK_CREATION_DELAY_MS } = await import(
  `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString("base64")}`
);

test("espera 1.5 segundos antes de crear y bloquea envíos repetidos hasta terminar", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const sequence = createTaskCreationSequence();
  const stages = [];
  let finish;
  const saving = new Promise((resolve) => { finish = resolve; });
  const run = sequence.run(async () => { stages.push("create"); await saving; }, () => stages.push("saving"));
  assert.equal(TASK_CREATION_DELAY_MS, 1500);
  assert.equal(sequence.pending, true);
  assert.equal(await sequence.run(async () => stages.push("duplicate"), () => {}), false);
  context.mock.timers.tick(1499);
  await Promise.resolve();
  assert.deepEqual(stages, []);
  context.mock.timers.tick(1);
  await Promise.resolve();
  assert.deepEqual(stages, ["saving", "create"]);
  assert.equal(sequence.pending, true);
  assert.equal(await sequence.run(async () => stages.push("duplicate"), () => {}), false);
  finish();
  assert.equal(await run, true);
  assert.equal(sequence.pending, false);
});

test("cerrar o desmontar durante la pausa cancela la creación antes de guardar", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const sequence = createTaskCreationSequence();
  let writes = 0;
  const run = sequence.run(async () => { writes++; }, () => assert.fail("No debe iniciar el guardado"));
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
  const run = sequence.run(async () => { throw error; }, () => {});
  context.mock.timers.tick(1500);
  await assert.rejects(run, (actual) => actual === error);
  assert.equal(sequence.pending, false);
  let writes = 0;
  const retry = sequence.run(async () => { writes++; }, () => {});
  context.mock.timers.tick(1500);
  assert.equal(await retry, true);
  assert.equal(writes, 1);
});
