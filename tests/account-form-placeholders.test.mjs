import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);

test("account form placeholders use regular font weight", () => {
  assert.match(
    css,
    /\.account-registration-form input::placeholder,\s*\.account-editor-modal input::placeholder\s*\{[^}]*font-weight:\s*400;/s,
  );
});
