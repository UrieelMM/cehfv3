import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isResizeObserverLoopError } from "../lib/resize-observer-error.ts";

const projectRoot = new URL("../", import.meta.url);

test("recognizes only benign ResizeObserver loop notifications", () => {
  assert.equal(
    isResizeObserverLoopError(
      "ResizeObserver loop completed with undelivered notifications.",
    ),
    true,
  );
  assert.equal(
    isResizeObserverLoopError("ResizeObserver loop limit exceeded"),
    true,
  );
  assert.equal(isResizeObserverLoopError("ResizeObserver failed"), false);
  assert.equal(isResizeObserverLoopError("Network request failed"), false);
});

test("the app prevents only the recognized browser warning from reaching overlays", async () => {
  const appSource = await readFile(
    new URL("components/cehf-app.tsx", projectRoot),
    "utf8",
  );

  assert.match(appSource, /if \(!isResizeObserverLoopError\(event\.message\)\) return/);
  assert.match(appSource, /event\.preventDefault\(\)/);
  assert.match(appSource, /event\.stopImmediatePropagation\(\)/);
  assert.match(
    appSource,
    /addEventListener\("error", ignoreBenignResizeObserverLoop, true\)/,
  );
  assert.match(
    appSource,
    /removeEventListener\("error", ignoreBenignResizeObserverLoop, true\)/,
  );
});
