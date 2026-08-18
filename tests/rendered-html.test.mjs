import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html", host: "localhost" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the CEHF Primaria entry experience", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>CEHF Primaria<\/title>/i);
  assert.match(html, /Una semana clara para aprender mejor/i);
  assert.match(html, /Qué bueno verte/i);
  assert.match(html, /Explorar la demostración/i);
  assert.match(html, /manifest\.webmanifest/i);
  assert.match(html, /og\.png/i);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview/i);
});

test("supports the documented application routes", async () => {
  for (const pathname of [
    "/dashboard",
    "/tasks",
    "/weekly-progress",
    "/wall-newspaper",
    "/forum",
    "/forum/science-5a/topic-cambios",
  ]) {
    const response = await render(pathname);
    assert.equal(response.status, 200, `${pathname} should render`);
  }
});

test("ships Firebase setup, rules, indexes, storage and PWA assets", async () => {
  const [envExample, firestoreRules, storageRules, indexes, manifest, css] =
    await Promise.all([
      readFile(new URL(".env.example", projectRoot), "utf8"),
      readFile(new URL("firestore.rules", projectRoot), "utf8"),
      readFile(new URL("storage.rules", projectRoot), "utf8"),
      readFile(new URL("firestore.indexes.json", projectRoot), "utf8"),
      readFile(new URL("public/manifest.webmanifest", projectRoot), "utf8"),
      readFile(new URL("app/globals.css", projectRoot), "utf8"),
    ]);

  for (const key of [
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    "NEXT_PUBLIC_FIREBASE_APP_ID",
  ]) {
    assert.match(envExample, new RegExp(key));
  }

  assert.match(firestoreRules, /match \/weeklyProgress/);
  assert.match(firestoreRules, /match \/weeklyReports/);
  assert.match(firestoreRules, /match \/messageOutbox/);
  assert.match(storageRules, /safeUpload/);
  assert.match(indexes, /weeklyMaterials/);
  assert.match(manifest, /CEHF Primaria/);
  assert.match(css, /--brand-primary:\s*#1f2985/i);
  assert.match(css, /--violet:\s*#1f2985/i);
  assert.match(css, /--coral:\s*#c62e45/i);
  assert.match(css, /url\("\/login-campus\.jpg"\)/i);
  await access(new URL("public/og.png", projectRoot));
  await access(new URL("public/login-campus.jpg", projectRoot));
  await access(new URL("public/sw.js", projectRoot));
});
