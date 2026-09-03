# Campus CEHF

Portal académico unificado para la comunidad CEHF. Incluye:

- acceso institucional con Firebase Authentication;
- navegación y permisos visuales para Dirección, Docente y Estudiante;
- semana académica, objetivos, repasos y tareas con entregas versionadas;
- avance configurable, reportes versionados y notificaciones internas;
- Periódico Mural con flujo editorial y Foro moderado;
- configuración institucional, preferencias, modo oscuro y PWA;
- modo demo local para recorrer todos los flujos sin credenciales;
- notificaciones de tareas en tiempo real y publicación programada con Cloud Functions;
- reglas de Firestore y Storage e índices de producción.

## Arranque

1. Abre [`.env`](./.env) y pega los seis valores de la configuración web de tu proyecto Firebase.
2. En Firebase Authentication, habilita **Correo electrónico/contraseña**.
3. Crea una base de Cloud Firestore y un bucket de Storage.
4. Asegúrate de usar el plan de Firebase que permite Cloud Functions y Cloud Scheduler.
5. Publica reglas, índices, Storage y Functions con `npm run firebase:deploy`.
6. Ejecuta:

```bash
npm run dev
```

Abre `http://localhost:3000`. Las cuentas de Dirección se provisionan de forma administrativa con perfil y custom claims; el alta pública inicial permanece deshabilitada.

> Las claves `NEXT_PUBLIC_FIREBASE_*` identifican la aplicación web y no son secretos. Las credenciales administrativas y de WhatsApp nunca deben llevar el prefijo `NEXT_PUBLIC_`.

## Modo demo

Si `.env` no tiene credenciales, la pantalla de acceso permite abrir una demostración persistida en el navegador. Dentro del demo puedes cambiar entre los tres roles desde el pie de la barra lateral.

## Estructura principal

- [`components/cehf-app.tsx`](./components/cehf-app.tsx): experiencia completa y flujos por rol.
- [`lib/firebase.ts`](./lib/firebase.ts): Authentication, perfil y persistencia.
- [`lib/tasks-firebase.ts`](./lib/tasks-firebase.ts): tareas, entregas, archivos, historial y prórrogas.
- [`components/tasks-workflow.tsx`](./components/tasks-workflow.tsx): interfaz completa por rol.
- [`functions/src/index.ts`](./functions/src/index.ts): calendario seguro, publicación programada y notificaciones automáticas.
- [`lib/demo-data.ts`](./lib/demo-data.ts): datos sintéticos del piloto.
- [`firestore.rules`](./firestore.rules): aislamiento por rol, propiedad e institución.
- [`storage.rules`](./storage.rules): archivos privados, tipos y tamaños permitidos.

## Organización académica de tareas

Dirección define desde **Configuración → Calendario académico** las semanas con su rango de fechas, asigna cada una a un bimestre y registra suspensiones o días no laborales. La fecha de cada excepción determina automáticamente su semana y bimestre. El servidor valida traslapes, semanas sin bimestre, fechas duplicadas y permisos; además sincroniza la semana vigente según `America/Mexico_City`.

El catálogo reutilizable queda separado de los datos operativos:

```text
institutions/cehf-primaria/ciclosEscolares/{ciclo}/
  semanas/{semanaId}
  bimestres/{bimestreId}
  diasNoLaborales/{AAAA-MM-DD}
  calendarioHistorial/{eventoId}
```

Las tareas conservan el ciclo, bimestre y semana resueltos por calendario y se guardan con esta jerarquía:

```text
institutions/cehf-primaria/
  ciclosEscolares/cicloescolar26-27/
    bimestres/bimestre1/
      semanas/semana1/
        materias/{materia}/tareas/{taskId}
```

Cada tarea conserva sus subcolecciones `entregas`, `historial` y `prorrogas`. Las reglas comprueban que una tarea nueva use la semana actual y un bimestre válido; también rechazan entregas fuera de fecha o cerradas, salvo que exista una prórroga individual vigente. Los futuros documentos de avance y reportes deben incluir `schoolYearId`, `termId`, `termLabel`, `weekId` y `weekLabel`, que se validan contra el mismo catálogo. El detalle siempre puede abrirse en `/tasks/{taskId}`.

## Calificaciones y reportes

El maestro captura una calificación por alumno, materia y día en
`institutions/{institutionId}/dailyGrades`. La fecha debe pertenecer a una de
las semanas configuradas y no puede ser fin de semana ni un día no laboral.
La aplicación calcula sin recaptura:

- el promedio semanal a partir de sus días hábiles (por ejemplo, cuatro si hay
  una suspensión y cinco en una semana ordinaria);
- el promedio bimestral a partir de las semanas del bimestre;
- la calificación final a partir de los bimestres del ciclo.

Los reportes de `studentWeeklyReports` usan el mismo ciclo, bimestre y semana.
Cada reporte pertenece a un alumno y una materia, muestra el promedio semanal
como evidencia y guarda **Un logro para reconocer**, **Área de acompañamiento**
y **Próximo paso**. Los borradores sólo son visibles para personal autorizado;
el alumno únicamente puede consultar reportes publicados.

## WhatsApp

La integración usa directamente WhatsApp Cloud API de Meta y está aislada del
flujo académico: una falla del proveedor no bloquea tareas ni entregas. Dirección
puede administrar la hora de envío, autorización de destinatarios, pruebas y
entregabilidad desde **Configuración → WhatsApp para familias**. Los
destinatarios se toman exclusivamente del campo obligatorio **WhatsApp del
padre o tutor** del alumno en **Gestión de accesos**; los teléfonos mexicanos
se guardan en formato internacional `+52` y nacen autorizados.

El reporte se ejecuta de lunes a viernes y sólo se prepara cuando existen
calificaciones diarias capturadas por el docente. Antes de encolar y justo antes
de enviar, el backend vuelve a validar que el alumno siga activo, que el número
sea válido y que `guardianWhatsAppAuthorized` no sea `false`. La cola
`messageOutbox` usa una clave determinista por fecha y alumno para evitar
duplicados; el webhook registra envío, entrega, lectura, fallos y la palabra
`BAJA`, que desactiva futuros mensajes.

### Plantilla de Meta

Crea y aprueba en WhatsApp Manager una plantilla de **utilidad** con idioma
`Spanish (MEX)` y nombre `cehf_reporte_diario_alumno_v1`:

```text
Hola {{1}}, te enviamos el reporte de {{2}} del día {{3}}.
Asistencia: {{4}}
Participación: {{5}}
Tarea: {{6}}
```

Ejemplos de variables para la revisión:

```text
{{1}} = Patricia Hernández
{{2}} = Mateo García
{{3}} = miércoles, 19 de agosto de 2026
{{4}} = ✅ Asistió
{{5}} = 😊 Participación positiva
{{6}} = ✅ Cumplió
```

### Secretos y webhook

Los cuatro valores viven exclusivamente en Secret Manager de Firebase:

```bash
npx firebase-tools functions:secrets:set WHATSAPP_ACCESS_TOKEN
npx firebase-tools functions:secrets:set WHATSAPP_PHONE_NUMBER_ID
npx firebase-tools functions:secrets:set WHATSAPP_WEBHOOK_VERIFY_TOKEN
npx firebase-tools functions:secrets:set WHATSAPP_APP_SECRET
```

Para el proyecto configurado en `.firebaserc`, registra en Meta:

```text
Callback URL: https://us-central1-cehfv3.cloudfunctions.net/whatsappWebhook
Verify token: el mismo valor guardado en WHATSAPP_WEBHOOK_VERIFY_TOKEN
Campo de webhook: messages
```

Después publica índices, reglas y funciones con
`npm run firebase:deploy`. Las credenciales nunca deben copiarse a `.env`,
Firestore, el cliente web ni variables con prefijo `NEXT_PUBLIC_`.
