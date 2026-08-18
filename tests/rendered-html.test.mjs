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

test("server-renders the Campus CEHF entry experience", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Campus CEHF<\/title>/i);
  assert.match(html, /Una semana clara para aprender mejor/i);
  assert.match(html, /Preparando tu experiencia/i);
  assert.match(html, /manifest\.webmanifest/i);
  assert.match(html, /og-campus\.png/i);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview/i);
});

test("supports the documented application routes", async () => {
  for (const pathname of [
    "/dashboard",
    "/tasks",
    "/tasks/task-bitacora",
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
  const [
    envExample,
    firestoreRules,
    storageRules,
    indexes,
    manifest,
    css,
    firebaseSource,
    appSource,
    taskSource,
    taskUiSource,
    functionsSource,
    taskCss,
  ] =
    await Promise.all([
      readFile(new URL(".env.example", projectRoot), "utf8"),
      readFile(new URL("firestore.rules", projectRoot), "utf8"),
      readFile(new URL("storage.rules", projectRoot), "utf8"),
      readFile(new URL("firestore.indexes.json", projectRoot), "utf8"),
      readFile(new URL("public/manifest.webmanifest", projectRoot), "utf8"),
      readFile(new URL("app/globals.css", projectRoot), "utf8"),
      readFile(new URL("lib/firebase.ts", projectRoot), "utf8"),
      readFile(new URL("components/cehf-app.tsx", projectRoot), "utf8"),
      readFile(new URL("lib/tasks-firebase.ts", projectRoot), "utf8"),
      readFile(new URL("components/tasks-workflow.tsx", projectRoot), "utf8"),
      readFile(new URL("functions/src/index.ts", projectRoot), "utf8"),
      readFile(new URL("app/tasks.css", projectRoot), "utf8"),
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
  assert.match(firestoreRules, /function roleIs\(role\)/);
  assert.match(firestoreRules, /request\.auth\.token\.role == "director"/);
  assert.match(firestoreRules, /request\.auth\.token\.allPermissions == true/);
  assert.match(
    firestoreRules,
    /match \/system\/bootstrap\s*{\s*allow read: if isDirector\(\);\s*allow write: if false;/,
  );
  assert.match(storageRules, /safeUpload/);
  assert.match(storageRules, /canUploadTaskSubmission/);
  assert.match(storageRules, /function canManageProfilePhoto/);
  assert.match(storageRules, /function sameInstitutionToken/);
  assert.match(
    storageRules,
    /allow read: if sameInstitutionToken\(institutionId\)/,
  );
  assert.match(
    storageRules,
    /allow create, update: if canManageProfilePhoto\(institutionId, userId\)/,
  );
  assert.match(storageRules, /image\/\(jpeg\|jpg\|pjpeg\|png\|webp\)/);
  assert.match(storageRules, /function isDirector/);
  assert.match(storageRules, /request\.auth\.token\.role == "director"/);
  assert.match(indexes, /weeklyMaterials/);
  assert.match(indexes, /"collectionGroup": "tareas"/);
  assert.match(firestoreRules, /ciclosEscolares\/\{schoolYearId\}/);
  assert.match(firestoreRules, /function canStudentSubmit/);
  assert.match(firestoreRules, /function canReadTaskInstitution/);
  assert.match(firestoreRules, /function canQueryAcademicTask/);
  assert.match(
    firestoreRules,
    /match \/\{taskPath=\*\*\}\/tareas\/\{taskId\}\s*\{\s*allow list: if canQueryAcademicTask\(resource\.data\);/,
  );
  assert.match(
    firestoreRules,
    /allow read: if canReadTaskInstitution\(resource\.data\)/,
  );
  assert.match(
    firestoreRules,
    /allow create: if taskBelongsToInstitution\(request\.resource\.data\)/,
  );
  assert.match(firestoreRules, /function validCurrentTaskScope/);
  assert.match(firestoreRules, /function validCalendarScope/);
  assert.match(firestoreRules, /match \/semanas\/\{weekId\}/);
  assert.match(firestoreRules, /match \/calendarioHistorial\/\{eventId\}/);
  assert.match(firestoreRules, /match \/prorrogas\/\{studentId\}/);
  assert.match(manifest, /Campus CEHF/);
  assert.match(css, /--brand-primary:\s*#1f2985/i);
  assert.match(css, /--violet:\s*#1f2985/i);
  assert.match(css, /--coral:\s*#c62e45/i);
  assert.match(css, /url\("\/login-campus\.jpg"\)/i);
  assert.match(firebaseSource, /createManagedAccount/);
  assert.match(firebaseSource, /PROFILE_PHOTO_MIME_TYPES/);
  assert.match(firebaseSource, /await refreshPortalAccess\(director\)/);
  assert.match(firebaseSource, /contentType: photoMetadata\.contentType/);
  assert.match(firebaseSource, /deleteObject\(uploadedPhotoReference\)/);
  assert.match(firebaseSource, /schoolLevel/);
  assert.match(firebaseSource, /gradesBySchoolLevel/);
  assert.match(firebaseSource, /cehf-account-creator/);
  assert.match(firebaseSource, /refreshPortalAccess/);
  assert.match(firebaseSource, /await user\.getIdToken\(true\)/);
  assert.match(firebaseSource, /sharedStateRef\(profile\.institutionId\)/);
  assert.match(appSource, /account-registration-modal/);
  assert.match(appSource, /Nivel escolar/);
  assert.match(appSource, /Alumno · \$\{schoolLevelLabels\[schoolLevel\]\}/);
  assert.match(appSource, /registration-summary-avatar/);
  assert.match(appSource, /backgroundImage: `url\(\$\{photoPreview\}\)`/);
  assert.match(appSource, /Contraseña temporal/);
  assert.match(appSource, /setAuthReady\(false\)/);
  assert.match(appSource, /No pudimos cargar tu acceso/);
  assert.match(appSource, /Operación: \$\{operation\}/);
  assert.doesNotMatch(appSource, /Activar portal/);
  assert.match(taskSource, /createTaskAssignment/);
  assert.match(taskSource, /isFirebaseTaskAssignment/);
  assert.match(taskSource, /watchTaskAssignments/);
  assert.match(taskSource, /watchAcademicCalendar/);
  assert.match(taskSource, /resolveAcademicConfig/);
  assert.match(taskSource, /saveAcademicCalendar/);
  assert.match(taskSource, /submitTaskResponse/);
  assert.match(taskUiSource, /TaskCreateModal/);
  assert.match(taskUiSource, /TaskDetailModal/);
  assert.match(taskUiSource, /liveFirebaseTask/);
  assert.match(taskUiSource, /Prórroga individual/);
  assert.match(taskUiSource, /Calendario académico/);
  assert.match(taskUiSource, /Agregar semana/);
  assert.match(taskUiSource, /Agregar trimestre/);
  assert.match(taskUiSource, /ACADEMIC_WEEKS_PAGE_SIZE = 5/);
  assert.match(taskUiSource, /academic-week-pagination/);
  assert.match(functionsSource, /publishScheduledTasks/);
  assert.match(functionsSource, /onTaskConversationEvent/);
  assert.match(functionsSource, /export const saveAcademicCalendar/);
  assert.match(functionsSource, /export const syncAcademicCalendar/);
  assert.match(functionsSource, /export const refreshPortalAccess/);
  assert.match(functionsSource, /setCustomUserClaims/);
  assert.match(functionsSource, /claimsChanged: changed/);
  assert.match(functionsSource, /Cada semana sólo puede pertenecer a un trimestre/);
  assert.match(taskCss, /task-modern-grid/);
  await access(new URL("public/og-campus.png", projectRoot));
  await access(new URL("public/login-campus.jpg", projectRoot));
  await access(new URL("public/sw.js", projectRoot));
});
