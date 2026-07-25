# CEHF Primaria

MVP funcional del portal académico descrito en [`SPEC.md`](./SPEC.md). Incluye:

- acceso con Firebase Authentication y primer arranque guiado;
- navegación y permisos visuales para Dirección, Docente y Estudiante;
- semana académica, objetivos, repasos, tareas, entregas y materiales;
- avance configurable, reportes versionados y notificaciones internas;
- Periódico Mural con flujo editorial y Foro moderado;
- configuración institucional, preferencias, modo oscuro y PWA;
- modo demo local para recorrer todos los flujos sin credenciales;
- reglas de Firestore y Storage e índices iniciales.

## Arranque

1. Abre [`.env`](./.env) y pega los seis valores de la configuración web de tu proyecto Firebase.
2. En Firebase Authentication, habilita **Correo electrónico/contraseña**.
3. Crea una base de Cloud Firestore y un bucket de Storage.
4. Publica [`firestore.rules`](./firestore.rules), [`storage.rules`](./storage.rules) y [`firestore.indexes.json`](./firestore.indexes.json) desde Firebase Console o con `npm run firebase:deploy`.
5. Ejecuta:

```bash
npm run dev
```

Abre `http://localhost:3000`. En el primer acceso, usa **Activar portal** para crear la cuenta inicial de Dirección y cargar el espacio de muestra.

> Las claves `NEXT_PUBLIC_FIREBASE_*` identifican la aplicación web y no son secretos. Las credenciales administrativas y de WhatsApp nunca deben llevar el prefijo `NEXT_PUBLIC_`.

## Modo demo

Si `.env` no tiene credenciales, la pantalla de acceso permite abrir una demostración persistida en el navegador. Dentro del demo puedes cambiar entre los tres roles desde el pie de la barra lateral.

## Estructura principal

- [`components/cehf-app.tsx`](./components/cehf-app.tsx): experiencia completa y flujos por rol.
- [`lib/firebase.ts`](./lib/firebase.ts): Authentication, perfil y persistencia.
- [`lib/demo-data.ts`](./lib/demo-data.ts): datos sintéticos del piloto.
- [`firestore.rules`](./firestore.rules): aislamiento por rol, propiedad e institución.
- [`storage.rules`](./storage.rules): archivos privados, tipos y tamaños permitidos.

## WhatsApp

El panel y el modelo de preferencias están incluidos. El envío real requiere Cloud Functions y secretos del proveedor; deliberadamente no se colocan tokens de WhatsApp en el cliente. El portal conserva las notificaciones internas aunque WhatsApp esté deshabilitado o falle.
