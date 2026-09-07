import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const source = await readFile(new URL("../lib/dashboard.ts", import.meta.url), "utf8");
const { dashboardProgressTone } = await import(
  `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString("base64")}`
);

test("dashboard progress moves from red to white in five stable ranges", () => {
  assert.equal(dashboardProgressTone(0), "critical");
  assert.equal(dashboardProgressTone(20), "critical");
  assert.equal(dashboardProgressTone(21), "low");
  assert.equal(dashboardProgressTone(40), "low");
  assert.equal(dashboardProgressTone(41), "medium");
  assert.equal(dashboardProgressTone(60), "medium");
  assert.equal(dashboardProgressTone(61), "high");
  assert.equal(dashboardProgressTone(79), "high");
  assert.equal(dashboardProgressTone(80), "complete");
  assert.equal(dashboardProgressTone(100), "complete");
});

test("dashboard progress clamps values outside the percentage range", () => {
  assert.equal(dashboardProgressTone(-8), "critical");
  assert.equal(dashboardProgressTone(130), "complete");
});
