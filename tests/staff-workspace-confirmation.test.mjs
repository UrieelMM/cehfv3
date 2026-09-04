import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

test("Mi espacio uses app modals for every destructive confirmation", async () => {
  const source = await readFile(
    new URL("components/staff-workspace-page.tsx", projectRoot),
    "utf8",
  );

  assert.doesNotMatch(source, /window\.confirm|window\.alert/);
  assert.match(source, /role="alertdialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /¿Reemplazar el borrador guardado\?/);
  assert.match(source, /¿Cerrar con cambios pendientes\?/);
  assert.match(source, /¿Descartar este borrador\?/);
  assert.match(source, /¿Transferir “\$\{item\.title\}”\?/);
  assert.match(source, /¿Eliminar “\$\{item\.title\}”\?/);
});
