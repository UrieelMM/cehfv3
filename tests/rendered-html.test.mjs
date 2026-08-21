import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

async function render(pathname = "/calificaciones") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html", host: "localhost" },
    }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the CEHF Calificaciones experience", async () => {
  const response = await render("/calificaciones");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>CEHF Calificaciones<\/title>/i);
  assert.match(html, /Calificaciones semanales, avances y estadísticas/i);
  assert.match(html, /Preparando tus calificaciones/i);
  assert.match(html, /manifest\.webmanifest/i);
  assert.match(html, /og-calificaciones\.png/i);
  assert.doesNotMatch(html, /Campus CEHF|Mi semana|Periódico mural/i);
});

test("redirects legacy entry points to Calificaciones", async () => {
  for (const pathname of ["/", "/dashboard", "/my-week", "/tasks"]) {
    const response = await render(pathname);
    assert.ok([301, 302, 303, 307, 308].includes(response.status));
    assert.equal(new URL(response.headers.get("location")).pathname, "/calificaciones");
  }
});

test("ships a grades-only route, interface and identity", async () => {
  const [page, dynamicPage, layout, app, css, manifest, serviceWorker] = await Promise.all([
    readFile(new URL("app/page.tsx", projectRoot), "utf8"),
    readFile(new URL("app/[section]/[[...slug]]/page.tsx", projectRoot), "utf8"),
    readFile(new URL("app/layout.tsx", projectRoot), "utf8"),
    readFile(new URL("components/grades-app.tsx", projectRoot), "utf8"),
    readFile(new URL("app/grades-app.css", projectRoot), "utf8"),
    readFile(new URL("public/manifest.webmanifest", projectRoot), "utf8"),
    readFile(new URL("public/sw.js", projectRoot), "utf8"),
  ]);

  assert.match(page, /redirect\("\/calificaciones"\)/);
  assert.doesNotMatch(page, /GradesApp|CEHFApp/);
  assert.match(dynamicPage, /GradesApp/);
  assert.doesNotMatch(dynamicPage, /CEHFApp/);
  assert.match(dynamicPage, /section !== "calificaciones"/);
  assert.match(layout, /CEHF Calificaciones/);
  assert.match(layout, /grades-app\.css/);
  assert.doesNotMatch(layout, /tasks\.css|workshops\.css|materials\.css|reviews\.css/);
  assert.match(app, /window\.history\.replaceState\(\{\}, "", "\/calificaciones"\)/);
  assert.match(app, /Resumen/);
  assert.match(app, /Captura/);
  assert.match(app, /Ponderación/);
  assert.match(app, /Promedio por materia/);
  assert.match(app, /Rangos de resultado/);
  assert.match(app, /Promedio por rubro/);
  assert.match(app, /Tendencia semanal/);
  assert.match(app, /watchWeeklyGrades/);
  assert.match(app, /saveWeeklyGrade/);
  assert.match(app, /saveTeacherGradingConfig/);
  assert.match(css, /--g-violet:\s*#6c4dff/i);
  assert.match(css, /--g-lime:\s*#c9ef66/i);
  assert.match(css, /\.distribution-chart/);
  assert.match(css, /\.trend-chart/);
  assert.match(css, /\.capture-table/);
  assert.match(css, /\.weight-editor-grid/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(manifest, /CEHF Calificaciones/);
  assert.match(manifest, /"start_url": "\/calificaciones"/);
  assert.match(serviceWorker, /cehf-calificaciones-v2/);
  assert.match(serviceWorker, /"\/calificaciones"/);
});

test("keeps grading on Firebase with assignment-aware rules", async () => {
  const [envExample, firestoreRules, gradeSource] = await Promise.all([
    readFile(new URL(".env.example", projectRoot), "utf8"),
    readFile(new URL("firestore.rules", projectRoot), "utf8"),
    readFile(new URL("lib/grades-firebase.ts", projectRoot), "utf8"),
  ]);

  for (const key of [
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    "NEXT_PUBLIC_FIREBASE_APP_ID",
  ]) assert.match(envExample, new RegExp(key));

  assert.match(firestoreRules, /match \/gradingConfigs/);
  assert.match(firestoreRules, /match \/weeklyGrades/);
  assert.match(firestoreRules, /function teacherCanGrade\(data\)/);
  assert.match(firestoreRules, /student\.teacherIds\.hasAny\(\[request\.auth\.uid\]\)/);
  assert.match(firestoreRules, /student\.subjects\.hasAny\(\[data\.subject\]\)/);
  assert.match(firestoreRules, /validCalendarScope\(data\)/);
  assert.match(firestoreRules, /validGradingWeights\(data\.weights\)/);
  assert.match(gradeSource, /DEFAULT_GRADING_WEIGHTS/);
  assert.match(gradeSource, /classWork:\s*45/);
  assert.match(gradeSource, /homework:\s*10/);
  assert.match(gradeSource, /participation:\s*15/);
  assert.match(gradeSource, /attendance:\s*10/);
  assert.match(gradeSource, /exam:\s*20/);
  assert.match(gradeSource, /watchTeacherGradingConfig/);
  assert.match(gradeSource, /watchWeeklyGrades/);
});
