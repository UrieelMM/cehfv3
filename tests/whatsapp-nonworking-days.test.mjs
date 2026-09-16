import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../functions/src/index.ts", import.meta.url),
  "utf8",
);

test("WhatsApp consulta las excepciones del ciclo escolar activo", () => {
  assert.match(source, /configuracion\/academica/);
  assert.match(source, /diasNoLaborales\/\$\{businessDate\}/);
  assert.match(source, /day\?\.active === false/);
});

test("los envíos automáticos, manuales y ya encolados respetan días no laborales", () => {
  assert.match(source, /Daily WhatsApp summaries skipped for non-working day/);
  assert.match(source, /No se preparan reportes de WhatsApp en días no laborales/);
  assert.match(source, /business_date_non_working/);
});
