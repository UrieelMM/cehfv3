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

Dirección define desde **Configuración → Calendario académico** las semanas con su rango de fechas y asigna cada una a un trimestre. El servidor valida traslapes, semanas sin trimestre y permisos; además sincroniza automáticamente la semana vigente según `America/Mexico_City`.

El catálogo reutilizable queda separado de los datos operativos:

```text
institutions/cehf-primaria/ciclosEscolares/{ciclo}/
  semanas/{semanaId}
  trimestres/{trimestreId}
  calendarioHistorial/{eventoId}
```

Las tareas conservan el ciclo, trimestre y semana resueltos por calendario y se guardan con esta jerarquía:

```text
institutions/cehf-primaria/
  ciclosEscolares/cicloescolar26-27/
    trimestres/trimestre1/
      semanas/semana1/
        materias/{materia}/tareas/{taskId}
```

Cada tarea conserva sus subcolecciones `entregas`, `historial` y `prorrogas`. Las reglas comprueban que una tarea nueva use la semana actual y un trimestre válido; también rechazan entregas fuera de fecha o cerradas, salvo que exista una prórroga individual vigente. Los futuros documentos de avance y reportes deben incluir `schoolYearId`, `termId`, `termLabel`, `weekId` y `weekLabel`, que se validan contra el mismo catálogo. El detalle siempre puede abrirse en `/tasks/{taskId}`.

## WhatsApp

El panel y el modelo de preferencias están incluidos. El envío real requiere Cloud Functions y secretos del proveedor; deliberadamente no se colocan tokens de WhatsApp en el cliente. El portal conserva las notificaciones internas aunque WhatsApp esté deshabilitado o falle.
