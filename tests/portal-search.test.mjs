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

test("search results stay fully opaque and use the animated Siri-style orb", async () => {
  const [source, styles] = await Promise.all([
    readFile(new URL("components/portal-search.tsx", projectRoot), "utf8"),
    readFile(new URL("app/globals.css", projectRoot), "utf8"),
  ]);

  assert.match(source, /import \{ AnimatedOrb \}/);
  assert.match(source, /<AnimatedOrb size="compact" busy=\{loading\}/);
  assert.match(source, /className="portal-search-panel"/);
  assert.doesNotMatch(source, /className="portal-search-panel"[\s\S]{0,180}initial=\{\{ opacity:/);
  assert.match(styles, /\.portal-search-panel\s*\{[^}]*opacity:\s*1;[^}]*background:\s*var\(--surface\);/s);
  assert.match(styles, /@keyframes portal-orb-ring/);
  assert.match(styles, /::-webkit-search-cancel-button/);
  assert.doesNotMatch(styles, /@keyframes portal-search-filter-flow/);
  assert.match(styles, /@media \(prefers-reduced-motion: no-preference\)/);
});

test("primary loading states share the optimized animated orb without changing the weather greeting", async () => {
  const component = await readFile(
    new URL("components/animated-orb.tsx", projectRoot),
    "utf8",
  );
  const greeting = await readFile(
    new URL("components/cehf-app.tsx", projectRoot),
    "utf8",
  );
  const loadingSurfaces = await Promise.all([
    "components/tasks-workflow.tsx",
    "components/materials-page.tsx",
    "components/workshops-page.tsx",
    "components/academic-grades.tsx",
    "components/academic-reports.tsx",
    "components/weekly-grades.tsx",
    "components/wall-newspaper-page.tsx",
  ].map((path) => readFile(new URL(path, projectRoot), "utf8")));

  assert.match(component, /export function AnimatedOrb/);
  assert.match(component, /export function SectionOrbLoader/);
  assert.match(component, /role="status"/);
  assert.match(greeting, /<GreetingIcon size=\{27\}/);
  assert.doesNotMatch(greeting, /<AnimatedOrb[\s\S]{0,160}tone=\{phase\.key\}/);
  loadingSurfaces.forEach((source) => assert.match(source, /SectionOrbLoader/));
});
