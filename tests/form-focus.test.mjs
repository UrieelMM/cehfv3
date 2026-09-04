import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

test("removes focus halos from form controls across the app", async () => {
  const [layout, css] = await Promise.all([
    readFile(new URL("app/layout.tsx", projectRoot), "utf8"),
    readFile(new URL("app/form-focus.css", projectRoot), "utf8"),
  ]);

  assert.match(layout, /import "\.\/form-focus\.css"/);
  assert.match(css, /input, textarea, select, \[contenteditable="true"\]/);
  assert.match(css, /box-shadow: none !important/);
  assert.match(css, /outline: none !important/);
  assert.match(css, /\.login-input-wrap/);
  assert.match(css, /\.forum-composer-body/);
  assert.match(css, /\.staff-workspace-blocknote/);
  assert.doesNotMatch(css, /button|a:focus/);
});
