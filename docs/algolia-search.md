# Buscador global con Algolia

Firestore conserva los documentos originales y sus reglas de acceso. Algolia
solo almacena una proyección para búsqueda. El cliente recibe durante una hora
una clave asegurada con filtros de institución, rol, grupo y usuario; nunca
recibe la clave administrativa ni una clave de búsqueda sin restricciones.

## Configuración inicial

1. Crea una aplicación en Algolia y conserva el índice
   `cehf_portal_search` (Cloud Functions también puede crearlo al primer uso).
2. En Algolia crea una API key con permiso exclusivamente `search` y restringida
   al índice `cehf_portal_search`. No uses la Search-Only API Key compartida si
   también consulta otros índices.
3. Copia `functions/.env.example` a `functions/.env.cehfv3` y agrega el
   Application ID. Ese archivo está excluido de Git.
4. Guarda las claves de forma interactiva, sin escribirlas en el repositorio:

   ```bash
   npx firebase-tools functions:secrets:set ALGOLIA_ADMIN_API_KEY
   npx firebase-tools functions:secrets:set ALGOLIA_SEARCH_API_KEY
   ```

5. Despliega las funciones y el frontend:

   ```bash
   npm run firebase:deploy
   ```

6. Inicia sesión como Dirección, abre **Configuración → Académico → Buscador
   global** y pulsa **Sincronizar ahora**. Esto indexa los documentos existentes;
   a partir de entonces los triggers mantienen altas, cambios y bajas.

## Permisos aplicados

- Tareas: Dirección, docente creador y grupo cuando están publicadas/cerradas.
- Repasos y materiales: Dirección, gestores y alumnos asignados; los borradores
  de repaso no se entregan a alumnos.
- Mi espacio: dueño, usuarios seleccionados o todo el personal según visibilidad.
- Historias: personal, autor y alumnado únicamente cuando están publicadas.
- Foros y talleres: participantes explícitos; Dirección conserva acceso a talleres.
- Reportes: Dirección, docente responsable y alumno solo cuando el reporte está
  publicado.

Los campos `visibleBy`, `institutionId` y `searchableText` son filtrables pero
no recuperables. Al cambiar permisos, el mismo trigger reemplaza el registro en
Algolia. Las eliminaciones retiran el registro.

## Costos y operación

La búsqueda espera 250 ms después de escribir, solicita como máximo 12 resultados
y reutiliza la credencial temporal durante la sesión. No hay lecturas de Firestore
por cada tecla: solo una llamada para obtener la clave y consultas posteriores a
Algolia. El backfill está limitado a 45,000 registros como margen operativo para
el plan gratuito.
