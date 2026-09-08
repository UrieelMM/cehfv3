import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

test("global search only runs after clicking Buscar or pressing Enter", async () => {
  const source = await readFile(
    new URL("components/portal-search.tsx", projectRoot),
    "utf8",
  );
  const clientSource = await readFile(
    new URL("lib/portal-search.ts", projectRoot),
    "utf8",
  );

  const inputChange = source.match(/onChange=\{\(event\) => \{([\s\S]*?)\n        \}\}/)?.[1] ?? "";

  assert.match(source, /className="portal-search-submit"/);
  assert.match(source, /onClick=\{\(\) => void runSearch\(\)\}/);
  assert.match(source, /event\.key === "Enter"[\s\S]*?void runSearch\(\)/);
  assert.doesNotMatch(inputChange, /runSearch|searchPortal|searchLocalPortal/);
  assert.doesNotMatch(source, /\}, 250\);/);
  assert.match(source, /await searchPortal\(profile\.uid, term\)/);
  assert.match(clientSource, /client\.searchForHits<PortalSearchHit>/);
  assert.doesNotMatch(clientSource, /client\.searchSingleIndex/);
});
