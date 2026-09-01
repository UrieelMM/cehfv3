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
    "/qualifications",
    "/tasks",
    "/tasks/task-bitacora",
    "/weekly-progress",
    "/wall-newspaper",
    "/forum",
    "/forum/science-5a/topic-cambios",
    "/workshops",
    "/workshops/tics",
    "/workshops/club-lectura",
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
    usersSource,
    taskSource,
    taskUiSource,
    taskResourceViewerSource,
    functionsSource,
    taskCss,
    workshopSource,
    workshopFirebaseSource,
    workshopCss,
    workshopTaskUiSource,
    workshopFileViewerSource,
    gradesSource,
    gradesUiSource,
    gradesCss,
    gradeReportPdfSource,
    reportsSource,
    reportsFirebaseSource,
    reportsCss,
    reviewFirebaseSource,
    calendarImageSource,
    calendarModalSource,
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
      readFile(new URL("components/users-page.tsx", projectRoot), "utf8"),
      readFile(new URL("lib/tasks-firebase.ts", projectRoot), "utf8"),
      readFile(new URL("components/tasks-workflow.tsx", projectRoot), "utf8"),
      readFile(new URL("components/task-resource-viewer.tsx", projectRoot), "utf8"),
      readFile(new URL("functions/src/index.ts", projectRoot), "utf8"),
      readFile(new URL("app/tasks.css", projectRoot), "utf8"),
      readFile(new URL("components/workshops-page.tsx", projectRoot), "utf8"),
      readFile(new URL("lib/workshops-firebase.ts", projectRoot), "utf8"),
      readFile(new URL("app/workshops.css", projectRoot), "utf8"),
      readFile(new URL("components/workshop-tasks.tsx", projectRoot), "utf8"),
      readFile(new URL("components/workshop-file-viewer.tsx", projectRoot), "utf8"),
      readFile(new URL("lib/grades-firebase.ts", projectRoot), "utf8"),
      readFile(new URL("components/academic-grades.tsx", projectRoot), "utf8"),
      readFile(new URL("app/academic-grades.css", projectRoot), "utf8"),
      readFile(new URL("lib/grade-report-pdf.ts", projectRoot), "utf8"),
      readFile(new URL("components/academic-reports.tsx", projectRoot), "utf8"),
      readFile(new URL("lib/reports-firebase.ts", projectRoot), "utf8"),
      readFile(new URL("app/academic-reports.css", projectRoot), "utf8"),
      readFile(new URL("lib/reviews-firebase.ts", projectRoot), "utf8"),
      readFile(new URL("lib/academic-calendar-image-firebase.ts", projectRoot), "utf8"),
      readFile(new URL("components/academic-calendar-modal.tsx", projectRoot), "utf8"),
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
  assert.match(firestoreRules, /match \/gradingConfigs/);
  assert.match(firestoreRules, /match \/weeklyGrades/);
  assert.match(firestoreRules, /function teacherCanGrade\(data\)/);
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
  assert.match(
    css,
    /\.whatsapp-admin-panel\s*\{[^}]*display:\s*grid;[^}]*grid-column:\s*1\s*\/\s*-1;/s,
  );
  assert.match(css, /\.whatsapp-message-table-wrap\s*\{[^}]*max-width:\s*100%;/s);
  assert.match(firebaseSource, /createManagedAccount/);
  assert.match(firebaseSource, /PROFILE_PHOTO_MIME_TYPES/);
  assert.match(firebaseSource, /await refreshPortalAccess\(director\)/);
  assert.match(firebaseSource, /contentType: photoMetadata\.contentType/);
  assert.match(firebaseSource, /deleteObject\(uploadedPhotoReference\)/);
  assert.match(firebaseSource, /creationStage = "save-profile"/);
  assert.match(firebaseSource, /Firestore no pudo guardar el perfil/);
  assert.match(firebaseSource, /firebaseErrorDetails/);
  assert.match(firebaseSource, /setManagedAccountActive/);
  assert.match(firebaseSource, /deleteManagedAccount/);
  assert.match(firebaseSource, /updateManagedAccount/);
  assert.doesNotMatch(firebaseSource, /\.\.\.account,\s*institutionId/);
  assert.match(firebaseSource, /schoolLevel/);
  assert.match(firebaseSource, /gradesBySchoolLevel/);
  assert.match(firebaseSource, /cehf-account-creator/);
  assert.match(firebaseSource, /refreshPortalAccess/);
  assert.match(firebaseSource, /await user\.getIdToken\(true\)/);
  assert.match(firebaseSource, /sharedStateRef\(profile\.institutionId\)/);
  assert.match(appSource, /const canEdit = role === "director"/);
  assert.doesNotMatch(appSource, /Establecido por/);
  assert.match(firestoreRules, /hasAny\(\["weeklyVerse"\]\)/);
  assert.match(appSource, /account-registration-modal/);
  assert.match(appSource, /Nivel escolar/);
  assert.match(appSource, /Alumno · \$\{schoolLevelLabels\[schoolLevel\]\}/);
  assert.match(appSource, /registration-summary-avatar/);
  assert.match(appSource, /backgroundImage: `url\(\$\{photoPreview\}\)`/);
  assert.match(appSource, /Contraseña temporal/);
  assert.match(appSource, /setAuthReady\(false\)/);
  assert.match(appSource, /No pudimos cargar tu acceso/);
  assert.match(appSource, /\[Campus CEHF\] registrar cuenta/);
  assert.match(usersSource, /Editar cuenta/);
  assert.match(usersSource, /Editar cuenta de \$\{account\.name\}/);
  assert.match(usersSource, /Desactivar acceso/);
  assert.match(usersSource, /Eliminar cuenta definitivamente/);
  assert.match(functionsSource, /Sólo Dirección puede administrar cuentas/);
  assert.match(functionsSource, /revokeRefreshTokens/);
  assert.match(functionsSource, /recursiveDelete/);
  assert.match(functionsSource, /accountAudit/);
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
  assert.match(taskUiSource, /Agregar bimestre/);
  assert.match(taskUiSource, /ACADEMIC_WEEKS_PAGE_SIZE = 5/);
  assert.match(taskUiSource, /academic-week-pagination/);
  assert.doesNotMatch(appSource, /key: "weekly-materials", label: "Materiales"/);
  assert.match(appSource, /name === "weekly-materials"\) return "tasks"/);
  assert.match(taskUiSource, /TaskResourceViewer/);
  assert.match(taskUiSource, /PDF, Office, imagen, audio o vídeo/);
  assert.match(taskResourceViewerSource, /Registro de aperturas/);
  assert.match(taskResourceViewerSource, /material-pdf-frame/);
  assert.match(taskResourceViewerSource, /material-audio-player/);
  assert.match(taskResourceViewerSource, /material-video-player/);
  assert.match(taskResourceViewerSource, /task-resource-loading/);
  assert.match(taskResourceViewerSource, /Cargando las páginas del documento/);
  assert.match(taskCss, /\.task-resource-loading\s*\{/);
  assert.match(taskSource, /markTaskResourceViewed/);
  assert.match(taskSource, /watchTaskResourceViews/);
  assert.match(taskSource, /loadViewedTaskResourceIds/);
  assert.match(firestoreRules, /match \/resourceViews\/\{resourceId\}\/students\/\{studentId\}/);
  assert.match(storageRules, /function taskResourceSafeUpload\(\)/);
  assert.match(appSource, /setAcademicCalendarOpen\(true\)/);
  assert.match(appSource, /AcademicCalendarModal/);
  assert.match(appSource, /publishAcademicCalendarImage/);
  assert.match(calendarImageSource, /watchAcademicCalendarImage/);
  assert.match(calendarImageSource, /MAX_ACADEMIC_CALENDAR_IMAGE_SIZE/);
  assert.match(calendarImageSource, /academic-calendar\/\$\{crypto\.randomUUID\(\)\}/);
  assert.match(calendarModalSource, /Sólo Dirección puede publicar|Publica la imagen/);
  assert.match(calendarModalSource, /Seleccionar imagen del calendario/);
  assert.match(css, /\.academic-calendar-modal\s*\{/);
  assert.match(css, /\.week-switcher:hover\s*\{/);
  assert.match(firestoreRules, /match \/configuracion\/calendarioVisual/);
  assert.match(firestoreRules, /function validVisualCalendar\(data\)/);
  assert.match(storageRules, /function academicCalendarImageUpload\(\)/);
  assert.match(storageRules, /academic-calendar\/\{assetId\}/);
  assert.match(functionsSource, /publishScheduledTasks/);
  assert.match(functionsSource, /onTaskConversationEvent/);
  assert.match(functionsSource, /export const saveAcademicCalendar/);
  assert.match(functionsSource, /export const syncAcademicCalendar/);
  assert.match(functionsSource, /export const refreshPortalAccess/);
  assert.match(functionsSource, /setCustomUserClaims/);
  assert.match(functionsSource, /claimsChanged: changed/);
  assert.match(functionsSource, /Cada semana sólo puede pertenecer a un bimestre/);
  assert.match(appSource, /WhatsApp del padre o tutor/);
  assert.match(appSource, /Nombre del padre o tutor/);
  assert.match(appSource, /guardianName/);
  assert.match(appSource, /aria-label="Secciones de configuración"/);
  assert.match(appSource, /role="tablist"/);
  assert.match(appSource, /settings-tab-whatsapp/);
  assert.match(appSource, /settings-tab-grading/);
  assert.match(css, /\.settings-tabs\s*\{/);
  assert.match(css, /\.settings-tab-panel\[hidden\]\s*\{[^}]*display:\s*none;/s);
  assert.match(firebaseSource, /normalizeGuardianWhatsApp/);
  assert.match(firebaseSource, /savePortalSettings/);
  assert.match(usersSource, /guardianWhatsApp/);
  assert.match(usersSource, /guardianName/);
  assert.match(functionsSource, /guardianWhatsApp/);
  assert.match(functionsSource, /guardianName/);
  assert.match(gradesSource, /watchGradeReportDirectors/);
  assert.match(firestoreRules, /roleIs\("student"\)[\s\S]*resource\.data\.role == "director"/);
  assert.match(functionsSource, /export const listStudentMaterials/);
  assert.match(functionsSource, /export const listStaffMaterials/);
  assert.match(functionsSource, /export const listStudentWeeklyReviews/);
  assert.match(functionsSource, /export const listStaffWeeklyReviews/);
  assert.match(reviewFirebaseSource, /profile\.role === "student"[\s\S]*"listStudentWeeklyReviews"/);
  assert.match(functionsSource, /notificationRecipients\(data\.managerIds\)\.includes\(actor\.uid\)/);
  assert.match(firestoreRules, /function canReadMaterial\(data\)/);
  assert.match(firestoreRules, /request\.auth\.uid in data\.audienceStudentIds/);
  assert.match(taskCss, /task-modern-grid/);
  assert.match(appSource, /workshops: "\/workshops"/);
  assert.match(workshopSource, /Club de lectura/);
  assert.match(workshopSource, /Administrar acceso/);
  assert.match(workshopSource, /Subir recurso/);
  assert.match(workshopSource, /workshop-immersive-shell/);
  assert.match(gradesSource, /DEFAULT_GRADING_WEIGHTS/);
  assert.match(gradesSource, /saveTeacherGradingConfig/);
  assert.match(gradesSource, /saveDailyGrade/);
  assert.match(gradesSource, /aggregateDailyGradesByWeek/);
  assert.match(gradesSource, /buildGradePeriodSummaries/);
  assert.match(appSource, /"my-week": "\/qualifications"/);
  assert.match(appSource, /label: "Calificaciones", icon: GraduationCap/);
  assert.doesNotMatch(appSource, /"my-week": "\/my-week"/);
  assert.match(gradesUiSource, /Día de captura/);
  assert.match(gradesUiSource, /Diarias/);
  assert.match(gradesUiSource, /Semanales/);
  assert.match(gradesUiSource, /Bimestrales/);
  assert.match(gradesUiSource, /Ciclo \/ finales/);
  assert.match(gradesUiSource, /PAGE_SIZE = 10/);
  assert.match(gradesUiSource, /Buscar alumno, grupo o materia/);
  assert.match(gradesUiSource, /Todas las materias/);
  assert.match(gradesUiSource, /downloadGradeReportPdf/);
  assert.match(gradesUiSource, /profile\.guardianName/);
  assert.match(gradesCss, /\.academic-level-tabs/);
  assert.match(gradesCss, /\.academic-capture-row/);
  assert.match(gradesCss, /\.academic-results-table/);
  assert.match(reportsSource, /Un logro para reconocer/);
  assert.match(reportsSource, /Área de acompañamiento/);
  assert.match(reportsSource, /Próximo paso/);
  assert.match(reportsSource, /WeeklyEvidence/);
  assert.match(reportsSource, /PAGE_SIZE = 10/);
  assert.match(reportsFirebaseSource, /studentWeeklyReports/);
  assert.match(reportsFirebaseSource, /saveStudentWeeklyReport/);
  assert.match(reportsCss, /\.report-field-grid/);
  assert.match(firestoreRules, /match \/dailyGrades\/\{gradeId\}/);
  assert.match(firestoreRules, /match \/studentWeeklyReports\/\{reportId\}/);
  assert.match(appSource, /className="qualifications-page"/);
  assert.match(gradesCss, /\.academic-metrics/);
  assert.match(gradeReportPdfSource, /Reporte institucional de calificaciones/);
  assert.match(gradeReportPdfSource, /Padre, madre o tutor/);
  assert.match(gradeReportPdfSource, /Docente responsable/);
  assert.match(gradeReportPdfSource, /Vo\. Bo\. Dirección/);
  assert.match(gradeReportPdfSource, /directorNames/);
  assert.match(gradeReportPdfSource, /teacherNames\[0\]/);
  assert.match(gradeReportPdfSource, /Página \$\{page\} de/);
  assert.match(workshopSource, /Biblioteca creativa/);
  assert.match(workshopSource, /Laboratorio digital/);
  assert.match(workshopFirebaseSource, /ensureDefaultWorkshops/);
  assert.match(workshopFirebaseSource, /uploadWorkshopResource/);
  assert.match(workshopFirebaseSource, /watchWorkshopResources/);
  assert.match(workshopFirebaseSource, /teacherStudentIds/);
  assert.match(workshopFirebaseSource, /createWorkshopTask/);
  assert.match(workshopFirebaseSource, /submitWorkshopTask/);
  assert.match(workshopFirebaseSource, /saveWorkshopFeedback/);
  assert.doesNotMatch(workshopFirebaseSource, /demoWorkshops|demoWorkshopTasks/);
  assert.doesNotMatch(workshopSource, /cehf-demo-workshops/);
  assert.doesNotMatch(workshopTaskUiSource, /demoSubmissions/);
  assert.match(workshopTaskUiSource, /Trabajos y entregas/);
  assert.match(workshopTaskUiSource, /Enviar nueva versión/);
  assert.match(workshopTaskUiSource, /Finalizar revisión/);
  assert.match(workshopTaskUiSource, /WorkshopFileViewer/);
  assert.match(workshopTaskUiSource, /createPortal/);
  assert.match(workshopTaskUiSource, /workshop-task-detail-backdrop/);
  assert.match(workshopSource, /WorkshopFileViewer/);
  assert.match(workshopFileViewerSource, /Haz clic fuera del recurso/);
  assert.match(workshopFileViewerSource, /createPortal/);
  assert.match(firestoreRules, /match \/workshops\/\{workshopId\}/);
  assert.match(firestoreRules, /match \/tasks\/\{taskId\}/);
  assert.match(firestoreRules, /validWorkshopTaskAudience/);
  assert.match(firestoreRules, /match \/submissions\/\{studentId\}/);
  assert.match(firestoreRules, /function canManageWorkshop/);
  assert.match(storageRules, /workshopSafeUpload/);
  assert.match(storageRules, /workshops\/\{workshopId\}\/resources/);
  assert.match(functionsSource, /onWorkshopAccessChanged/);
  assert.match(functionsSource, /onWorkshopResourceCreated/);
  assert.match(functionsSource, /onWorkshopTaskChanged/);
  assert.match(functionsSource, /onWorkshopSubmissionChanged/);
  assert.match(workshopCss, /workshop-cover-card\.is-tics/);
  assert.match(workshopCss, /workshop-cover-card\.is-reading/);
  assert.match(workshopCss, /position: fixed;[\s\S]*workshop-immersive-header/);
  assert.match(workshopCss, /immersive-library-window/);
  assert.match(workshopCss, /immersive-tech-horizon/);
  assert.match(workshopCss, /workshop-attachment-viewer-backdrop/);
  assert.match(workshopCss, /workshop-task-detail-backdrop/);
  await access(new URL("public/og-campus.png", projectRoot));
  await access(new URL("public/login-campus.jpg", projectRoot));
  await access(new URL("public/sw.js", projectRoot));
});
