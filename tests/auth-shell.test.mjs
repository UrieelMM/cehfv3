import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

test("login removes accidental outer spaces from email and password", async () => {
  const [app, firebase] = await Promise.all([
    readFile(new URL("components/cehf-app.tsx", projectRoot), "utf8"),
    readFile(new URL("lib/firebase.ts", projectRoot), "utf8"),
  ]);

  assert.match(app, /const normalizedEmail = email\.trim\(\)\.toLowerCase\(\)/);
  assert.match(app, /const normalizedPassword = password\.trim\(\)/);
  assert.match(app, /loginWithEmail\(normalizedEmail, normalizedPassword, remember\)/);
  assert.match(firebase, /email\.trim\(\)\.toLowerCase\(\)/);
  assert.match(firebase, /password\.trim\(\)/);
});

test("navbar displays the stored profile photo with initials as fallback", async () => {
  const [app, styles] = await Promise.all([
    readFile(new URL("components/cehf-app.tsx", projectRoot), "utf8"),
    readFile(new URL("app/globals.css", projectRoot), "utf8"),
  ]);

  assert.match(app, /currentProfile\.photoURL \? \(/);
  assert.match(app, /src=\{currentProfile\.photoURL\}/);
  assert.match(app, /\) : currentProfile\.initials/);
  assert.match(styles, /\.avatar\.has-photo/);
  assert.match(styles, /\.avatar\.has-photo img\s*{[^}]*object-fit:\s*cover/s);
});

test("installed clients request and apply service worker updates without signing out", async () => {
  const [app, serviceWorker] = await Promise.all([
    readFile(new URL("components/cehf-app.tsx", projectRoot), "utf8"),
    readFile(new URL("public/sw.js", projectRoot), "utf8"),
  ]);

  assert.match(app, /register\("\/sw\.js", \{ updateViaCache: "none" \}\)/);
  assert.match(app, /registration\.update\(\)/);
  assert.match(app, /addEventListener\("controllerchange", applyUpdatedClient\)/);
  assert.match(app, /window\.location\.reload\(\)/);
  assert.doesNotMatch(serviceWorker, /cehf-primaria-v1["']/);
});
