import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [packageSource, vercelSource, tsconfigSource, muralSource] =
  await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../vercel.json", import.meta.url), "utf8"),
    readFile(new URL("../tsconfig.json", import.meta.url), "utf8"),
    readFile(new URL("../lib/mural-firebase.ts", import.meta.url), "utf8"),
  ]);

test("Vercel uses the native Next.js build output", () => {
  const packageJson = JSON.parse(packageSource);
  const vercel = JSON.parse(vercelSource);
  const tsconfig = JSON.parse(tsconfigSource);

  assert.equal(packageJson.scripts["build:vercel"], "next build --webpack");
  assert.equal(vercel.framework, "nextjs");
  assert.equal(vercel.buildCommand, "npm run build:vercel");
  assert.ok(tsconfig.exclude.includes("functions"));
  assert.match(muralSource, /snapshot\.data\(\) \?\? \{\}/);
});
