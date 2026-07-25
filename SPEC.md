# CEHF Primaria — Especificación funcional y técnica

> Estado: propuesta inicial para validación
> Versión: 1.0
> Fecha: 24 de julio de 2026
> Producto: **CEHF Primaria**
> Referencia visual y técnica: **CEHF Secundaria**
> Backend: **Firebase**
> Audiencia: dirección, docentes, estudiantes de primaria y familias/tutores
> Idioma inicial: español (México)
> Alcance del documento: producto, experiencia, módulos, permisos, arquitectura, datos, seguridad, notificaciones, fases, pruebas y criterios de aceptación.

## Índice rápido

- [Visión, decisiones y alcance](#1-resumen-ejecutivo)
- [Roles y permisos](#5-roles-identidad-y-permisos)
- [Navegación y rutas](#6-arquitectura-de-información)
- [La semana como núcleo](#7-la-semana-como-núcleo-del-producto)
- [Los once módulos funcionales](#8-especificación-funcional-por-módulo)
- [Sistema visual y experiencia](#9-sistema-visual-y-experiencia)
- [Arquitectura Firebase](#10-arquitectura-técnica)
- [Modelo de datos](#11-modelo-de-datos-conceptual)
- [Seguridad y privacidad](#13-seguridad-y-privacidad)
- [Cloud Functions y eventos](#14-cloud-functions-y-eventos)
- [Pruebas](#20-estrategia-de-pruebas)
- [Plan de implementación](#21-plan-de-implementación)
- [Reutilización de Secundaria](#22-estrategia-de-reutilización-del-código-actual)
- [Criterios de aceptación](#26-criterios-de-aceptación-del-producto)
- [Decisiones pendientes](#27-decisiones-pendientes)

---

## 1. Resumen ejecutivo

CEHF Primaria será una nueva plataforma académica basada en la identidad, componentes y experiencia de CEHF Secundaria. No deberá sentirse como un sistema distinto ni como una versión infantilizada: conservará la interfaz editorial, clara y contemporánea del portal actual, adaptando el lenguaje, la densidad de información y los flujos a estudiantes de primaria, docentes y familias.

El producto se organizará alrededor de una **semana académica configurable**. Cada docente podrá preparar objetivos, repasos, tareas, materiales, criterios de avance y reportes dentro de un mismo espacio semanal. Los estudiantes encontrarán una ruta sencilla para saber:

1. Qué aprenderán esta semana.
2. Qué deben repasar.
3. Qué tareas tienen pendientes.
4. Qué materiales necesitan.
5. Cómo avanzaron.
6. Qué observaciones publicó su docente.

La plataforma incluirá:

1. Login.
2. Perfil de usuario.
3. Sistema de repaso semanal.
4. Tareas.
5. Avance semanal configurable por docentes.
6. Reportes semanales.
7. Periódico mural.
8. Foro.
9. Notificaciones por WhatsApp.
10. Configuración.
11. Materiales de la semana.

La arquitectura recomendada utiliza:

- **Firebase Authentication** para identidad y estado de las cuentas.
- **Cloud Firestore** para semanas, grupos, tareas, repasos, avances, reportes, materiales, periódico, foros y notificaciones.
- **Cloud Storage for Firebase** para documentos, imágenes, audios, videos cortos y entregas.
- **Cloud Functions 2nd gen** para operaciones privilegiadas, publicación, agregados, recordatorios, WhatsApp, auditoría y procesos programados.
- **Cloud Scheduler** para apertura/cierre de semanas y recordatorios.
- **Firebase App Check** para reducir el abuso de los servicios desde clientes no autorizados.
- **Firebase Cloud Messaging**, opcional, para notificaciones push posteriores.

Firebase Realtime Database no es necesaria para el MVP porque ninguno de los módulos requiere señales de alta frecuencia como un examen supervisado. El foro, el periódico y el avance pueden actualizarse mediante listeners acotados de Firestore. RTDB quedará reservada para una fase futura de presencia o actividades simultáneas.

---

## 2. Decisiones principales

### 2.1 Qué se conserva de Secundaria

- Sistema de diseño: colores, superficies, bordes, tipografía, radios, sombras e iconografía.
- Sidebar de escritorio y navegación inferior móvil.
- Temas claro y oscuro.
- Componentes de formularios, tarjetas, modales, filtros, paginación, estados vacíos y notificaciones.
- Inicio de sesión con Firebase Authentication.
- Gestión administrativa de cuentas con Firebase Admin.
- Patrón de rutas, protección de sesiones y control por rol.
- Centro interno de notificaciones.
- Fundamentos de tareas, archivos, perfiles, configuración y reportes.
- Patrones de accesibilidad y reducción de movimiento.
- Stack de Next.js/Vinext, React, TypeScript, Tailwind CSS, Motion, Lucide, Zod, React Hook Form, Zustand y Sonner.

### 2.2 Qué se adapta para Primaria

- Copys más breves, concretos y orientados a una sola acción.
- Menor densidad visual en las vistas del estudiante.
- Objetivos semanales visibles y explicados en lenguaje comprensible.
- Estados de avance descriptivos antes que comparaciones o rankings.
- Participación familiar por notificaciones controladas.
- Navegación estudiantil centrada en “Mi semana”.
- Acciones táctiles de al menos 44 × 44 px.
- Más confirmaciones visuales para entregas, lectura de materiales y finalización de repasos.
- Ayudas contextuales, ejemplos y estados guiados.

### 2.3 Qué se construye como capacidad nueva

- Planeación y configuración de semana.
- Repasos semanales.
- Motor de avance semanal configurable y versionado.
- Materiales de la semana.
- Periódico mural con aprobación.
- Foro moderado por grupo o tema.
- Integración oficial con WhatsApp Business Platform.

### 2.4 Separación entre Primaria y Secundaria

CEHF Primaria será un producto independiente aunque comparta base visual y componentes.

Se recomienda:

- Un proyecto Firebase distinto para Primaria en cada entorno.
- Datos, reglas, Storage, funciones, secretos y métricas separados.
- Reutilizar código mediante componentes o paquetes compartidos, no mediante acceso cruzado a las mismas colecciones.
- Mantener despliegues y variables de entorno independientes.
- Evitar que una actualización de Primaria pueda afectar usuarios o datos de Secundaria.

Estructura objetivo si se evoluciona a monorepo:

```text
apps/
  secundaria/
  primaria/
packages/
  ui/
  firebase-core/
  auth/
  notifications/
  shared-types/
```

La primera implementación puede partir de una copia controlada del portal actual, pero deberá documentarse qué componentes son compartidos y evitar dos versiones divergentes del sistema de diseño.

---

## 3. Objetivos del producto

### 3.1 Objetivos principales

1. Dar a cada estudiante una vista simple y confiable de su semana.
2. Permitir que docentes configuren repasos, tareas, materiales y criterios de avance sin cambiar código.
3. Unificar evidencias semanales y convertirlas en reportes claros.
4. Mantener informadas a las familias sin enviar datos sensibles por WhatsApp.
5. Crear espacios escolares seguros para publicación y conversación.
6. Reducir trabajo repetitivo mediante plantillas, duplicación y automatizaciones controladas.
7. Mantener aislamiento estricto entre estudiantes, grupos y ciclos.
8. Conservar la identidad y calidad de experiencia de CEHF Secundaria.

### 3.2 Indicadores de éxito sugeridos

- 90% de las semanas activas tienen objetivos, materiales y criterios publicados antes de iniciar.
- 85% de los estudiantes consultan “Mi semana” al menos dos veces por semana.
- 90% de los repasos objetivos se califican sin intervención manual.
- 95% de las tareas entregadas generan confirmación y sello de tiempo.
- 100% de los reportes publicados conservan autor, fecha y versión.
- Menos de 1% de mensajes de WhatsApp duplicados.
- Cero lecturas cruzadas de reportes, avances o entregas en pruebas de reglas.
- Las vistas críticas cargan en menos de 2.5 segundos bajo las condiciones objetivo definidas por QA.

### 3.3 Principios

- **La semana es la unidad principal:** contenido y avance deben relacionarse con una semana explícita.
- **Una acción principal por región:** evitar pantallas con demasiadas decisiones simultáneas.
- **Progreso con contexto:** mostrar qué se logró y qué sigue, no rankings.
- **Docente al control:** cualquier configuración que afecte el avance debe ser visible y versionada.
- **Familias informadas, datos protegidos:** WhatsApp avisa; el portal autenticado contiene el detalle.
- **Moderación por defecto:** estudiantes no publican directamente al periódico ni crean espacios abiertos sin supervisión.
- **Privacidad de menores:** recopilar y mostrar únicamente los datos necesarios.
- **Tiempo real con propósito:** listeners limitados al contexto visible.
- **Accesibilidad desde el diseño:** WCAG 2.2 AA como objetivo.

---

## 4. Alcance

### 4.1 Incluido

- Aplicación web responsiva y preparada como PWA.
- Cuentas de dirección, docentes y estudiantes.
- Contactos familiares asociados a estudiantes para notificaciones.
- Grados, grupos, materias, ciclos y asignaciones.
- Planeación de semanas.
- Repasos semanales con calificación objetiva y revisión manual cuando corresponda.
- Tareas, recursos, entregas y retroalimentación.
- Avance semanal con criterios configurables.
- Reportes semanales versionados.
- Periódico mural moderado.
- Foros moderados por grupo, grado o tema.
- Notificaciones internas y por WhatsApp.
- Materiales de la semana.
- Configuración institucional y personal.
- Búsqueda, filtros, paginación y auditoría en módulos crecientes.

### 4.2 Fuera del MVP

- Pagos, colegiaturas, facturación y contabilidad.
- Inscripciones oficiales y expediente administrativo completo.
- Videoconferencia propia.
- Chat privado entre estudiantes.
- Grupos de WhatsApp administrados desde la plataforma.
- Envío de calificaciones, observaciones privadas o datos médicos dentro del cuerpo de WhatsApp.
- Aplicaciones móviles nativas.
- IA generativa para calificar estudiantes.
- Rankings públicos, tablas de popularidad o comparación pública entre estudiantes.
- Publicación pública en internet de contenido estudiantil.
- Exámenes supervisados en tiempo real.

### 4.3 Supuestos iniciales por validar

- La institución trabaja con semanas académicas identificables por fecha.
- Cada grupo tiene uno o más docentes y materias asignadas.
- Los estudiantes usarán cuentas institucionales administradas.
- En el MVP, las familias recibirán WhatsApp, pero no tendrán una cuenta completa en el portal.
- Una familia puede tener más de un contacto y un contacto puede estar vinculado a más de un estudiante.
- La escala de avance será principalmente descriptiva.
- El periódico y el foro solo serán visibles para la comunidad autenticada.
- La zona horaria institucional inicial será `America/Mexico_City`.

---

## 5. Roles, identidad y permisos

### 5.1 Roles base

| Rol | Responsabilidad |
|---|---|
| Dirección | Configuración global, usuarios, supervisión, moderación, reportes y auditoría |
| Docente | Configuración semanal, repasos, tareas, materiales, avance, reportes y moderación de sus grupos |
| Estudiante | Consulta de su semana, realización de repasos, tareas, materiales, periódico y participación autorizada en foros |
| Contacto familiar | Recibe notificaciones autorizadas; no inicia sesión en el MVP |

Un perfil administrativo técnico puede existir como `superadmin`, limitado a configuración, soporte y recuperación.

### 5.2 Estrategia de autorización

- Los custom claims de Firebase contendrán únicamente roles globales compactos: `director`, `teacher`, `student` o `superadmin`.
- Las asignaciones a institución, grado, grupo y materia vivirán en Firestore.
- Los datos de perfil no se almacenarán dentro de custom claims.
- Las operaciones administrativas usarán Firebase Admin desde servidor.
- Después de cambiar un rol, el cliente deberá forzar la actualización del ID token.
- La interfaz ocultará acciones sin permiso, pero Firestore Rules y las funciones serán la autoridad real.

### 5.3 Matriz resumida

| Acción | Dirección | Docente | Estudiante |
|---|---:|---:|---:|
| Configurar ciclo, grados y grupos | Sí | No | No |
| Crear semana institucional | Sí | Según política | No |
| Configurar semana de un curso | Sí | Sus cursos | No |
| Crear repaso | Sí | Sus cursos | No |
| Resolver repaso | Vista autorizada | Vista previa | Propio |
| Crear tarea | Sí | Sus cursos | No |
| Entregar tarea | No | Vista | Propia |
| Definir criterios de avance | Sí | Sus cursos | No |
| Capturar/publicar avance | Sí | Sus cursos | No |
| Crear/publicar reporte | Sí | Sus estudiantes | No |
| Proponer periódico mural | Sí | Sí | Si se habilita |
| Aprobar periódico mural | Sí | Con permiso editorial | No |
| Crear foro | Sí | Sus grupos | No |
| Publicar en foro | Sí | Sí | En espacios asignados |
| Moderar foro | Sí | Sus espacios | No |
| Configurar WhatsApp | Sí | No | No |
| Ver su propio perfil y progreso | Sí | Sí | Sí |

### 5.4 Reglas obligatorias

- Un docente solo accede a grupos y materias asignados.
- Un estudiante solo accede a sus entregas, intentos, avance y reportes.
- El nombre de otros estudiantes no debe aparecer en consultas que no lo requieran.
- Los contactos familiares no serán usuarios autenticados durante el MVP.
- Un estudiante no puede cambiar su grupo, rol, avance, resultado o estado final de una tarea.
- Las publicaciones y correcciones sensibles dejan registro de auditoría.
- Desactivar una cuenta en Firebase Auth revoca su acceso al portal.

---

## 6. Arquitectura de información

### 6.1 Rutas principales propuestas

| Sección | Ruta |
|---|---|
| Login | `/login` |
| Inicio | `/dashboard` |
| Perfil | `/profile` |
| Repaso semanal | `/weekly-review` |
| Tareas | `/tasks` |
| Avance semanal | `/weekly-progress` |
| Reportes semanales | `/reports` |
| Periódico mural | `/wall-newspaper` |
| Foro | `/forum` |
| Materiales de la semana | `/weekly-materials` |
| Configuración | `/settings` |

Los detalles usarán rutas de recurso:

```text
/weekly-review/{reviewId}
/tasks/{taskId}
/weekly-progress/{weekId}
/reports/{reportId}
/wall-newspaper/{postId}
/forum/{forumId}
/forum/{forumId}/{topicId}
/weekly-materials/{materialId}
```

### 6.2 Navegación del estudiante

- **Inicio:** saludo, semana actual, pendientes y accesos rápidos.
- **Repaso:** sesiones activas, progreso y resultados publicados.
- **Tareas:** pendientes, próximas, entregadas y revisadas.
- **Mi avance:** criterios de la semana y retroalimentación.
- **Materiales:** recursos organizados por día o materia.
- **Reportes:** reportes publicados.
- **Periódico:** publicaciones escolares.
- **Foro:** conversaciones autorizadas.
- **Perfil:** datos y preferencias permitidas.

En móvil, la barra inferior mostrará cinco accesos esenciales:

1. Inicio.
2. Repaso.
3. Tareas.
4. Mi semana.
5. Más.

“Más” abrirá Materiales, Reportes, Periódico, Foro, Perfil y Configuración disponible.

### 6.3 Navegación docente

- **Inicio:** semana activa, pendientes por revisar, estudiantes con faltantes y publicaciones recientes.
- **Mi semana:** objetivos, criterios, repasos, tareas y materiales.
- **Tareas:** creación, entregas y revisión.
- **Avance:** captura, cálculo, observaciones y publicación.
- **Reportes:** borradores, revisión, publicación y correcciones.
- **Materiales:** biblioteca y programación semanal.
- **Periódico:** propuestas y publicaciones.
- **Foro:** espacios y moderación.
- **Perfil/configuración personal.**

### 6.4 Navegación de dirección

- Resumen institucional.
- Semanas, ciclos y calendario.
- Usuarios, grupos, materias y asignaciones.
- Plantillas de avance y reporte.
- Periódico y moderación.
- Foros y casos reportados.
- Centro de WhatsApp y entregabilidad.
- Auditoría.
- Configuración institucional.

---

## 7. La semana como núcleo del producto

### 7.1 Entidad de semana

Cada semana deberá incluir:

- Institución y ciclo escolar.
- Número o clave de semana.
- Fecha de inicio y fin.
- Etiqueta visible, por ejemplo “Semana 7”.
- Estado: `draft`, `scheduled`, `active`, `closed`, `archived`.
- Días lectivos y excepciones.
- Grados/grupos incluidos.
- Fecha y hora de publicación.
- Zona horaria.
- Plantilla utilizada.
- Autor y versión.

### 7.2 Configuración semanal por curso

El docente configurará una instancia por curso, grupo y semana:

- Título o tema.
- Mensaje de bienvenida.
- Objetivos de aprendizaje.
- Materias o campos formativos.
- Repasos vinculados.
- Tareas vinculadas.
- Materiales vinculados.
- Criterios de avance.
- Fechas y orden sugerido.
- Mensaje o indicaciones para familias.
- Estado de preparación.

### 7.3 Flujo docente

1. Elegir semana y curso.
2. Duplicar la semana anterior o usar una plantilla.
3. Escribir objetivos.
4. Añadir repasos, tareas y materiales.
5. Definir criterios de avance.
6. Previsualizar como estudiante.
7. Validar faltantes.
8. Publicar o programar.
9. Capturar evidencias durante la semana.
10. Cerrar, revisar y publicar avances/reportes.

### 7.4 Flujo del estudiante

1. Abrir “Mi semana”.
2. Leer objetivos e indicaciones.
3. Consultar materiales.
4. Completar repasos.
5. Resolver o entregar tareas.
6. Revisar estados y retroalimentación.
7. Consultar avance y reporte cuando sean publicados.

### 7.5 Validaciones

- Una semana no puede publicarse sin rango de fechas, curso y al menos un objetivo.
- El sistema advertirá si no existen repasos, tareas, materiales o criterios, pero estos elementos podrán ser opcionales según plantilla.
- Los cambios posteriores a la publicación incrementan versión.
- Un criterio de avance utilizado en reportes no se elimina físicamente.
- Las fechas se guardan en UTC y se presentan en la zona institucional.

---

## 8. Especificación funcional por módulo

## 8.1 Login

### Objetivo

Dar acceso seguro y claro sin introducir pasos innecesarios.

### Funciones

- Correo institucional y contraseña.
- Mostrar/ocultar contraseña.
- Recuperación de contraseña.
- Persistencia de sesión configurable: este dispositivo o solo esta sesión.
- Cierre de sesión.
- Pantalla para cuenta desactivada.
- Pantalla para cuenta sin perfil, sin asignación o con configuración incompleta.
- Redirección a la ruta solicitada después de iniciar sesión.
- Sesión compatible con pestañas múltiples.
- Actualización de claims después de cambios administrativos.

### Adaptación para primaria

- Texto breve y amable.
- Botón principal claramente visible.
- Mensajes de error accionables sin códigos técnicos.
- Ayuda para identificar el correo institucional.
- El estudiante no podrá crear su propia cuenta.
- Dirección creará/importará cuentas y podrá restablecer accesos mediante flujos seguros.

### Seguridad

- No guardar contraseñas en Firestore.
- No revelar si un correo existe durante recuperación.
- MFA obligatorio para dirección y superadministración cuando la operación institucional lo permita.
- App Check en clientes compatibles.
- Rate limiting para endpoints administrativos.
- Revocación de tokens al desactivar una cuenta o ante un incidente.

### Criterios de aceptación

- Un usuario válido llega al inicio correspondiente a su rol.
- Una cuenta desactivada no puede cargar datos aunque conserve un token anterior.
- Una cuenta sin asignación muestra un estado guiado y no falla en blanco.
- Los mensajes nunca muestran credenciales, tokens o configuración interna.

---

## 8.2 Perfil de usuario

### Perfil común

- Nombre institucional.
- Nombre preferido, si la política lo permite.
- Apellidos.
- Avatar o iniciales.
- Rol.
- Grado y grupo, o materias asignadas.
- Idioma y tema.
- Preferencia de movimiento.
- Estado de cuenta.
- Último acceso visible solo para roles autorizados.

### Perfil del estudiante

- Semana actual.
- Racha de semanas consultadas, solo si se utiliza de manera pedagógica y privada.
- Repasos completados.
- Tareas próximas.
- Materiales recientes.
- Avance semanal publicado.
- Reportes disponibles.
- Participaciones propias en el periódico y foro.

### Perfil docente

- Grupos y materias asignadas.
- Semanas activas.
- Tareas por revisar.
- Reportes pendientes.
- Preferencias de notificación.
- Plantillas personales autorizadas.

### Privacidad y edición

- Dirección controla nombre institucional, rol, grado, grupo y asignaciones.
- El usuario solo modifica campos permitidos.
- No mostrar correo, teléfono familiar, avance o reportes en el foro/periódico.
- La fotografía de perfil estudiantil requiere política institucional; las iniciales serán el valor por defecto.
- Las vistas sociales usarán identidad mínima.

### Criterios de aceptación

- Un estudiante no puede modificar su rol o grupo desde el cliente.
- Un docente no ve información privada de estudiantes ajenos.
- Los cambios permitidos muestran confirmación y persisten entre sesiones.

---

## 8.3 Sistema de repaso semanal

### Propósito

Ofrecer práctica breve, guiada y vinculada a los objetivos de la semana. No debe sentirse como un examen de alta presión.

### Tipos de repaso

- Opción única.
- Opción múltiple.
- Verdadero/falso.
- Relacionar pares.
- Ordenar pasos.
- Completar palabra o frase breve.
- Respuesta corta con revisión docente.
- Tarjetas de memoria.
- Lectura con pregunta de comprensión.
- Imagen con zonas o etiquetas, en una fase posterior.

### Datos del repaso

- Título, instrucciones y materia.
- Semana, curso y objetivos vinculados.
- Preguntas y orden.
- Nivel o propósito: recordar, practicar, reforzar.
- Tiempo estimado, sin cronómetro obligatorio.
- Número de intentos.
- Permitir pistas.
- Retroalimentación por opción.
- Política para mostrar respuesta correcta.
- Puntaje o escala descriptiva.
- Disponibilidad y fecha de cierre.
- Estado: `draft`, `scheduled`, `published`, `closed`, `archived`.
- Adaptaciones individuales.

### Flujo docente

1. Crear desde cero, duplicar o usar plantilla.
2. Añadir preguntas.
3. Marcar respuesta y explicación.
4. Elegir intentos y retroalimentación.
5. Vincular objetivos y semana.
6. Previsualizar como estudiante.
7. Publicar o programar.
8. Revisar resultados agregados.
9. Revisar manualmente respuestas abiertas.
10. Marcar temas que necesitan refuerzo.

### Flujo estudiante

1. Abrir el repaso desde “Mi semana”.
2. Ver duración estimada y propósito.
3. Responder una actividad a la vez.
4. Guardar progreso automáticamente.
5. Recibir retroalimentación según configuración.
6. Reintentar cuando esté permitido.
7. Ver resultado publicado y siguiente recomendación.

### Calificación

- Las preguntas objetivas se califican automáticamente.
- Las abiertas quedan en estado `needs_review`.
- Un intento nunca se considera definitivo hasta confirmar entrega.
- El avance puede usar mejor intento, último intento, promedio o solo finalización; la política debe quedar guardada.
- Los resultados agregados de grupo no mostrarán rankings.

### Accesibilidad y pedagogía

- No depender de tiempo para evaluar el aprendizaje.
- Lectura clara y bloques cortos.
- Opción de audio solo con transcripción.
- Navegación completa por teclado.
- Mensajes neutrales: “Revisa esta idea” en vez de “Fallaste”.
- Permitir adaptaciones sin hacerlas visibles a otros estudiantes.

### Criterios de aceptación

- Una recarga recupera respuestas guardadas.
- Dos envíos del mismo intento son idempotentes.
- No se exponen respuestas correctas antes de lo configurado.
- El estudiante solo consulta sus propios intentos.
- El docente ve avance agregado y detalle solo de sus grupos.
- El resultado objetivo coincide con la versión de preguntas asignada.

---

## 8.4 Tareas

### Datos

- Título y descripción.
- Semana, materia, grupo y docente.
- Objetivo relacionado.
- Tipo: práctica, lectura, actividad, entrega, proyecto breve o aviso.
- Estado: `draft`, `scheduled`, `published`, `closed`, `archived`.
- Fecha de publicación y vencimiento.
- Instrucciones de entrega.
- Texto, enlace o archivo permitido.
- Archivos y recursos.
- Puntaje o criterio de avance opcional.
- Permitir entrega tardía y reentrega.
- Notificaciones configurables.

### Flujo docente

1. Crear o duplicar.
2. Añadir instrucciones y recursos.
3. Seleccionar audiencia y semana.
4. Definir entrega y fechas.
5. Previsualizar.
6. Publicar o programar.
7. Filtrar entregas por estado.
8. Retroalimentar y, si aplica, evaluar.
9. Publicar resultado.

### Flujo estudiante

1. Ver la tarea en Inicio, Mi semana y Tareas.
2. Consultar instrucciones.
3. Descargar o abrir recursos.
4. Guardar borrador local temporal.
5. Entregar texto, enlace o archivo.
6. Recibir confirmación y sello de tiempo.
7. Reemplazar la entrega cuando la política lo permita.
8. Consultar retroalimentación.

### Búsqueda y filtros

Ambos roles tendrán:

- Búsqueda por título.
- Materia.
- Semana/fecha.
- Estado.

El docente también filtrará por estudiante y estado de entrega. Las listas usarán paginación por cursor.

### Estados de entrega

```text
not_started
draft
submitted
submitted_late
under_review
changes_requested
reviewed
```

### Criterios de aceptación

- Una tarea programada no es legible antes de su publicación.
- La carga de archivo muestra progreso y error recuperable.
- Un estudiante no puede entregar por otro.
- Las versiones de entrega conservan autor y fecha.
- Publicar una tarea genera una notificación única por destinatario.

---

## 8.5 Avance semanal configurable

### Propósito

Dar a docentes una herramienta flexible para definir qué significa avanzar durante una semana, sin codificar una fórmula única para todos los grados o materias.

### Plantilla de avance

Dirección o docente autorizado podrá definir:

- Nombre de la plantilla.
- Grado, materia o curso aplicable.
- Criterios.
- Tipo de escala.
- Peso de cada criterio.
- Fuente automática o captura manual.
- Regla para datos faltantes.
- Texto visible para estudiante/familia.
- Estado y versión.

### Criterios sugeridos

- Repaso semanal.
- Tareas completadas.
- Comprensión de objetivos.
- Participación.
- Uso de materiales.
- Organización.
- Trabajo en equipo.
- Asistencia, si se integra como fuente institucional.
- Criterio personalizado.

No se usarán etiquetas médicas, diagnósticas o permanentes.

### Escalas permitidas

Escala recomendada:

```text
achieved        = Logrado
in_progress     = En proceso
needs_support   = Necesita acompañamiento
not_observed    = Aún no observado
```

También podrán existir:

- Porcentaje.
- Puntos.
- Sí/no.
- Rúbrica breve.

La interfaz siempre conservará la etiqueta pedagógica original. Cualquier valor normalizado se usará únicamente para cálculos internos.

### Pesos y cálculo

Ejemplo configurable:

```text
avance semanal =
  repaso × 30% +
  tareas × 35% +
  comprensión × 25% +
  participación × 10%
```

Reglas:

- Los pesos deben sumar 100% cuando la plantilla sea ponderada.
- La política de dato faltante será explícita: excluir, marcar incompleto o contar como cero.
- El resultado calculado será una propuesta revisable por el docente.
- Un docente puede añadir contexto, pero no alterar silenciosamente la evidencia fuente.
- La publicación guarda `policyVersion` y `sourceSnapshot`.

### Flujo docente

1. Elegir semana y grupo.
2. Seleccionar o crear plantilla.
3. Revisar evidencias automáticas.
4. Capturar criterios manuales.
5. Detectar faltantes.
6. Añadir observación privada o publicable.
7. Previsualizar.
8. Publicar individualmente o en lote.
9. Corregir con motivo si es necesario.

### Flujo estudiante

- Ver objetivos.
- Ver criterios publicados.
- Consultar estado y explicación.
- Abrir evidencia asociada cuando tenga permiso.
- Identificar un siguiente paso concreto.
- No ver comparaciones con otros estudiantes.

### Estados

```text
draft → ready_for_review → published → corrected → archived
```

### Criterios de aceptación

- Cambiar una plantilla utilizada crea una nueva versión.
- Una corrección exige motivo.
- El estudiante no ve borradores.
- El cálculo puede reconstruirse con la versión y fuentes guardadas.
- La vista agregada del grupo no se expone a estudiantes.

---

## 8.6 Reportes semanales

### Propósito

Comunicar de forma breve, humana y accionable lo ocurrido durante la semana.

### Fuentes

- Objetivos de la semana.
- Avance publicado o listo para revisión.
- Repasos y tareas.
- Materiales consultados cuando esta señal sea pedagógicamente útil.
- Observaciones autorizadas.
- Faltantes explícitos.

### Contenido

- Semana y periodo.
- Resumen.
- Logros.
- Área de acompañamiento.
- Próximo paso.
- Criterios visibles.
- Observación docente.
- Mensaje para familia opcional.
- Estado y versión.

### Flujo

1. El sistema prepara un borrador estructural con datos deterministas.
2. El docente revisa faltantes.
3. Escribe o completa el resumen.
4. Previsualiza como estudiante.
5. Publica.
6. Se crea notificación interna.
7. Si existe consentimiento, se encola un WhatsApp sin datos sensibles.
8. Una corrección genera versión y auditoría.

### IA

La IA no forma parte del MVP de Primaria. Puede añadirse después como asistente de redacción, nunca como publicador o evaluador. Antes de habilitarla deberá definirse proveedor, minimización de datos, región de procesamiento, retención, revisión humana y pruebas con datos sintéticos.

### Visibilidad

- Borrador: docente y dirección autorizada.
- Publicado: estudiante y docente.
- Familia: recibe aviso; el detalle requiere un acceso autenticado futuro o un canal institucional aprobado.
- Observaciones privadas no se copian automáticamente al reporte.

### Criterios de aceptación

- No se publica si faltan autor, semana o estudiante.
- Un reporte publicado es inmutable; las correcciones crean versión.
- WhatsApp no contiene calificación, diagnóstico ni observaciones privadas.
- La descarga o impresión se añadirá en una fase posterior.

---

## 8.7 Periódico mural

### Visión

El Periódico Mural será un espacio editorial escolar para compartir avisos, celebraciones, trabajos, ciencia, cultura, lectura y vida comunitaria. Mantendrá el enfoque visual de la Revista de Secundaria, pero con publicaciones más breves y una portada tipo mural.

### Categorías iniciales

- Avisos.
- Nuestra comunidad.
- Ciencia y curiosidades.
- Lecturas.
- Arte.
- Medio ambiente.
- Deportes.
- Fechas importantes.
- Trabajos destacados.
- Efemérides.
- Convivencia.

Dirección podrá administrar categorías.

### Estructura de publicación

- Título.
- Entrada o resumen con límite de caracteres.
- Cuerpo por bloques.
- Portada.
- Galería opcional.
- Categoría.
- Autoría visible.
- Créditos.
- Grado/grupo.
- Audiencia.
- Fecha de publicación y expiración.
- Publicación destacada.
- Estado editorial.

### Flujo

```text
draft
submitted
changes_requested
approved
scheduled
published
archived
```

### Permisos

- Dirección publica y retira.
- Docente crea y puede aprobar solo con permiso editorial.
- Estudiante propone contenido si la institución lo habilita.
- Las propuestas estudiantiles nunca se publican automáticamente.

### Interacciones

- Favoritos privados.
- Reacciones pedagógicas opcionales y no competitivas.
- Compartir solo dentro de la plataforma.
- Sin comentarios directos; la conversación deberá ocurrir en un foro moderado vinculado.
- Búsqueda, categoría, fecha, autor visible y favoritos.

### Criterios de aceptación

- Una propuesta no aparece en el mural hasta ser aprobada.
- El contenido retirado deja de ser accesible por URL directa.
- Se conservan créditos y autorización de imágenes.
- Los contadores no se usan para ordenar automáticamente publicaciones destacadas.
- Las tarjetas mantienen la misma identidad editorial de Secundaria.

---

## 8.8 Foro

### Propósito

Crear conversaciones académicas guiadas y seguras. No será una red social ni un sistema de mensajería privada.

### Tipos de foro

- Pregunta de la semana.
- Foro de materia.
- Club de lectura.
- Dudas sobre una tarea.
- Conversación de grupo.
- Foro asociado al periódico mural.
- Foro institucional de avisos con respuestas deshabilitadas.

### Estructura

- Espacio de foro.
- Tema.
- Pregunta o consigna.
- Grupo/grado/materia.
- Docente responsable.
- Fecha de apertura y cierre.
- Participantes autorizados.
- Configuración de respuestas.
- Publicaciones y respuestas.
- Estado de moderación.

### Funciones

- Crear, editar, programar, cerrar y archivar.
- Publicación de texto y un adjunto autorizado.
- Respuestas de un nivel en MVP; evitar hilos profundamente anidados.
- Menciones limitadas a participantes del espacio.
- Reacciones pedagógicas opcionales.
- Marcar respuesta docente.
- Reportar contenido.
- Ocultar, restaurar y cerrar conversación.
- Historial de moderación.
- Búsqueda y filtros por grupo, materia, estado y fecha.
- Paginación por cursor.

### Seguridad y convivencia

- Sin mensajes privados.
- Sin foros creados por estudiantes en el MVP.
- El estudiante solo publica en espacios asignados.
- Rate limits por usuario.
- Filtro preventivo configurable, sin sustituir revisión humana.
- Aviso de convivencia antes de la primera participación.
- Contenido reportado permanece visible u oculto según política; el autor no decide el caso.
- Datos académicos privados no deben compartirse en publicaciones.

### Notificaciones

- Nueva respuesta directa.
- Mención.
- Respuesta marcada.
- Tema cerrado.
- Acción de moderación visible al autor.

No se enviará WhatsApp por cada respuesta. Como máximo se permitirá un resumen configurable para familias o docentes, y estará deshabilitado por defecto.

### Criterios de aceptación

- Un estudiante fuera del grupo no puede leer el foro por URL directa.
- El docente puede cerrar respuestas inmediatamente.
- El contenido oculto no se entrega a estudiantes.
- La eliminación lógica conserva evidencia para moderación.
- Las notificaciones de foro se agrupan para evitar saturación.

---

## 8.9 Notificaciones por WhatsApp

### Objetivo

Avisar a contactos familiares sobre eventos importantes y llevarlos al portal o al canal institucional adecuado. WhatsApp es un canal de notificación, no la fuente de verdad académica.

### Integración

- Usar exclusivamente **WhatsApp Business Platform / Cloud API** o un proveedor oficial autorizado.
- La comunicación saliente se realizará desde Cloud Functions.
- El token, número, identificadores y secretos vivirán en Secret Manager.
- El cliente web nunca tendrá acceso a credenciales de WhatsApp.
- Los mensajes iniciados por la institución utilizarán plantillas aprobadas cuando la plataforma lo requiera.
- Los webhooks actualizarán estados de envío, entrega, lectura y fallo.

### Contactos y consentimiento

Cada contacto incluirá:

- Nombre.
- Teléfono normalizado en formato E.164.
- Relación con el estudiante.
- Estudiantes vinculados.
- Categorías autorizadas.
- Idioma.
- Zona horaria.
- Estado: `pending`, `active`, `paused`, `opted_out`, `invalid`.
- Fecha, fuente y versión del consentimiento.
- Fecha de baja.

Reglas:

- Dirección registra o importa contactos.
- El consentimiento y las bajas deben ser auditables.
- Toda solicitud de dejar de recibir mensajes se respeta.
- Un contacto puede pausar categorías no críticas.
- No asumir que el teléfono del perfil del estudiante pertenece a su tutor.

### Eventos permitidos en MVP

- Nueva tarea.
- Tarea próxima a vencer.
- Nuevo repaso semanal.
- Nuevos materiales.
- Reporte semanal disponible.
- Aviso institucional prioritario.
- Cambio de horario o cierre extraordinario, si dirección lo habilita.

### Contenido seguro

Ejemplo:

```text
CEHF Primaria: el grupo tiene una nueva tarea de esta semana.
Consulta los detalles en el portal institucional: {enlace}
```

No incluir:

- Calificaciones.
- Estado de avance detallado.
- Diagnósticos.
- Observaciones privadas.
- Documentos o imágenes del estudiante.
- Contraseñas.
- Tokens de acceso.
- Nombres completos cuando no sean necesarios.

### Cola y entrega

1. Un evento de dominio crea solicitudes de notificación.
2. Se resuelven destinatarios y preferencias.
3. Se crea un registro `messageOutbox` con clave idempotente.
4. Una función envía el mensaje.
5. Se guarda el ID del proveedor.
6. El webhook actualiza estado.
7. Los fallos transitorios se reintentan con backoff.
8. Los fallos definitivos marcan el contacto o plantilla para revisión.

Estados:

```text
queued
sending
sent
delivered
read
failed
cancelled
```

### Controles

- Horario silencioso configurable.
- Límite de mensajes por contacto y día.
- Agrupación de eventos de la misma categoría.
- Botón de envío de prueba restringido a dirección.
- Panel de entregabilidad y errores.
- Plantillas versionadas.
- Ambiente de prueba con números autorizados.
- Métricas sin mostrar teléfonos completos.
- Sanitización y validación de variables de plantilla.

### Criterios de aceptación

- Publicar dos veces el mismo evento no duplica el mensaje.
- Un contacto sin consentimiento activo no recibe mensajes.
- La baja detiene envíos futuros.
- Los secretos no aparecen en cliente, logs ni Firestore.
- Un fallo de WhatsApp no bloquea la publicación de la tarea o reporte.
- El centro interno de notificaciones continúa funcionando aunque WhatsApp falle.

---

## 8.10 Configuración

### Configuración institucional

- Nombre, logotipo, colores y zona horaria.
- Ciclos escolares.
- Semanas y días no laborables.
- Grados, grupos y materias.
- Docentes y asignaciones.
- Roles y permisos.
- Plantillas semanales.
- Plantillas de avance.
- Escalas y políticas de cálculo.
- Plantillas de reporte.
- Categorías del periódico.
- Políticas de foro y moderación.
- Notificaciones y horarios silenciosos.
- Integración y plantillas de WhatsApp.
- Tipos, tamaños y retención de archivos.
- Privacidad y consentimientos.

### Gestión de cuentas

Secciones separadas:

- Estudiantes.
- Personal.

Funciones:

- Buscar, filtrar y paginar.
- Ver perfil y asignaciones.
- Crear.
- Editar campos autorizados.
- Desactivar y reactivar Firebase Auth.
- Cambiar rol mediante operación privilegiada.
- Restablecer acceso por flujo seguro.
- Importación masiva en una fase posterior.

### Configuración personal

- Tema claro, oscuro o sistema.
- Reducción de movimiento.
- Densidad visual, limitada para estudiantes.
- Preferencias de notificaciones internas.
- Preferencias docentes de vistas y plantillas.

### Reglas

- Cambiar una plantilla en uso genera versión.
- Cambios de asignaciones invalidan cachés de permisos.
- Una cuenta desactivada no se elimina automáticamente.
- Las acciones sensibles exigen confirmación y auditoría.
- No permitir que un director se desactive a sí mismo si es la última cuenta administrativa activa.

---

## 8.11 Materiales de la semana

### Propósito

Reunir en un solo lugar los recursos necesarios para aprender durante la semana, separados de las instrucciones de una tarea.

### Tipos

- PDF.
- Documento.
- Imagen.
- Audio con transcripción.
- Video externo autorizado.
- Enlace.
- Presentación.
- Texto breve.
- Ficha imprimible.
- Material físico con indicaciones.

### Datos

- Título y descripción.
- Semana.
- Materia y curso.
- Tipo.
- Archivo o URL.
- Autor/fuente.
- Accesibilidad: transcripción, texto alternativo o descripción.
- Orden.
- Día sugerido.
- Obligatorio u opcional.
- Audiencia.
- Fecha de publicación.
- Estado y versión.

### Flujo docente

1. Subir o seleccionar de biblioteca.
2. Añadir descripción y fuente.
3. Vincular semana, materia y objetivo.
4. Definir orden y obligatoriedad.
5. Revisar accesibilidad.
6. Previsualizar.
7. Publicar o programar.

### Flujo estudiante

1. Abrir materiales desde Mi semana.
2. Filtrar por materia o día.
3. Visualizar o descargar.
4. Marcar como revisado cuando se habilite.
5. Volver a la tarea o repaso relacionado.

“Revisado” indica interacción, no comprensión. Nunca deberá convertirse automáticamente en una calificación sin una política explícita.

### Criterios de aceptación

- Un archivo privado no es accesible mediante URL pública permanente.
- El material programado no se lee antes de tiempo.
- La interfaz diferencia recurso obligatorio y opcional sin depender solo de color.
- Reemplazar un archivo crea una nueva versión o mantiene trazabilidad.
- Los archivos muestran estado de carga y error recuperable.

---

## 8.12 Inicio y centro de notificaciones

Aunque no aparece como módulo independiente en la lista inicial, Inicio es necesario para conectar toda la experiencia.

### Inicio estudiante

- Semana actual.
- Mensaje del docente.
- Repaso recomendado.
- Próxima tarea.
- Material nuevo.
- Avance publicado.
- Último reporte.
- Publicación destacada del periódico.

### Inicio docente

- Estado de preparación de la semana.
- Tareas por revisar.
- Repasos con respuestas abiertas.
- Avances incompletos.
- Reportes pendientes.
- Casos de moderación.
- Estado de notificaciones importantes.

### Centro interno de notificaciones

Categorías:

```text
task
review
progress
report
material
wall
forum
system
```

Funciones:

- Leído/no leído.
- Marcar todas.
- Agrupación.
- Vínculo profundo.
- Paginación.
- Punto visible y accesible en la campana.
- Eliminación o archivo según política.

---

## 9. Sistema visual y experiencia

### 9.1 Continuidad con Secundaria

La plataforma deberá reutilizar:

- Tokens semánticos.
- Fondos neutros cálidos.
- Color primario violeta.
- Colores auxiliares por materia.
- Tipografía de interfaz y editorial.
- Tarjetas, paneles y bordes finos.
- Sidebar, topbar, command palette y navegación móvil.
- Iconos Lucide.
- Motion para cambios de estado y transiciones.
- Sonner para confirmaciones breves.

### 9.2 Adaptaciones de Primaria

- Texto base nunca inferior al mínimo definido por el sistema de diseño.
- Etiquetas auxiliares legibles; evitar tamaños cercanos a `.55rem`.
- Instrucciones de una o dos oraciones por bloque.
- Más separación entre acciones.
- Icono acompañado de texto en acciones importantes.
- Estados ilustrados con iconos y formas CSS existentes, sin saturación.
- Máximo una acción primaria por tarjeta.
- Lenguaje por edades, revisado con docentes.
- Confirmaciones positivas, sobrias y no excesivamente gamificadas.

### 9.3 Responsive

- Diseño desde 360 px.
- Objetivos táctiles mínimos de 44 px.
- Tablas docentes se convierten en tarjetas o vistas horizontales controladas.
- Formularios largos por pasos o secciones.
- Navegación inferior segura respecto a `safe-area-inset-bottom`.
- El contenido no queda oculto detrás de la navegación.

### 9.4 Movimiento

- Transiciones suaves entre semana, tarea y detalle.
- Progreso animado sin bloquear lectura.
- Confirmación visual al completar repaso o entregar tarea.
- Sin `hover: scale()` decorativo.
- Respetar `prefers-reduced-motion`.
- Ninguna animación será necesaria para comprender una acción.

### 9.5 Accesibilidad

- Objetivo WCAG 2.2 AA.
- Foco visible.
- Navegación completa por teclado.
- Contraste en claro y oscuro.
- Mensajes no dependientes solo del color.
- Lectores de pantalla con etiquetas claras.
- Texto alternativo y transcripciones.
- Formularios con errores junto al campo y resumen cuando corresponda.
- Tiempo flexible y adaptaciones en repasos.

---

## 10. Arquitectura técnica

### 10.1 Frontend

- Next.js App Router sobre la estructura Vinext actual.
- React y TypeScript estricto.
- Tailwind CSS y tokens existentes.
- Motion.
- Lucide React.
- React Hook Form + Zod.
- Zustand solo para estado efímero de interfaz.
- Sonner.
- Day.js para presentación de fechas.

No duplicar en Zustand datos remotos de Firestore. Los listeners o consultas paginadas serán la fuente del estado persistente.

### 10.2 Servicios Firebase

| Servicio | Uso |
|---|---|
| Authentication | Identidad, sesión y bloqueo |
| Firestore | Datos académicos, editoriales y notificaciones |
| Storage | Archivos y multimedia |
| Functions 2nd gen | Backend privilegiado e integraciones |
| Scheduler | Procesos de semana y recordatorios |
| App Check | Protección adicional del cliente |
| Cloud Messaging | Push futuro |
| Realtime Database | No requerida en MVP |

### 10.3 Entornos

- `development`: Firebase Emulator Suite y datos sintéticos.
- `staging`: proyecto Firebase separado.
- `production`: proyecto Firebase separado y monitoreado.

Primaria y Secundaria no compartirán proyectos de staging o producción.

### 10.4 Variables públicas

```text
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_DATA_PROVIDER
```

### 10.5 Secretos de servidor

Nombres finales por definir, por ejemplo:

```text
FIREBASE_ADMIN_PROJECT_ID
FIREBASE_ADMIN_CLIENT_EMAIL
FIREBASE_ADMIN_PRIVATE_KEY
WHATSAPP_ACCESS_TOKEN
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_BUSINESS_ACCOUNT_ID
WHATSAPP_WEBHOOK_VERIFY_TOKEN
WHATSAPP_APP_SECRET
```

Nunca usar variables `NEXT_PUBLIC_*` para secretos.

---

## 11. Modelo de datos conceptual

Los nombres de colección se mantendrán en inglés para ser consistentes con el proyecto actual.

```text
institutions/{institutionId}
  settings/{settingId}
  academicYears/{yearId}
  weeks/{weekId}
  gradeLevels/{gradeLevelId}
  groups/{groupId}
  subjects/{subjectId}
  memberships/{membershipId}

users/{userId}
  preferences/default

guardianContacts/{contactId}
  studentLinks/{studentId}
  consents/{consentId}

courses/{courseId}
  members/{userId}

weeklyPlans/{planId}
  objectives/{objectiveId}

weeklyReviews/{reviewId}
  versions/{versionId}
  questions/{questionId}
  assignments/{assignmentId}
  attempts/{attemptId}
    answers/{answerId}

tasks/{taskId}
  resources/{resourceId}
  submissions/{submissionId}
    versions/{versionId}

progressTemplates/{templateId}
  versions/{versionId}
    criteria/{criterionId}

weeklyProgress/{progressId}
  entries/{entryId}
  versions/{versionId}

weeklyReports/{reportId}
  versions/{versionId}

weeklyMaterials/{materialId}
  versions/{versionId}

wallPosts/{postId}
  versions/{versionId}
  reactions/{reactionId}
  favorites/{userId}

forums/{forumId}
  topics/{topicId}
    posts/{postId}
      reactions/{reactionId}

moderationCases/{caseId}

notifications/{userId}
  items/{notificationId}

messageTemplates/{templateId}
messageOutbox/{messageId}
messageDeliveryEvents/{eventId}

fileAssets/{assetId}
auditEvents/{eventId}
```

### 11.1 Campos comunes

Según aplique:

```text
institutionId
academicYearId
weekId
courseId
groupId
subjectId
studentId
status
visibility
version
createdAt
createdBy
updatedAt
updatedBy
publishedAt
publishedBy
deletedAt
deletedBy
```

Todos los timestamps sensibles usarán hora de servidor.

### 11.2 Documentos clave

#### `weeklyPlans/{planId}`

```ts
{
  institutionId: string;
  academicYearId: string;
  weekId: string;
  courseId: string;
  title: string;
  welcomeMessage: string;
  objectiveIds: string[];
  reviewIds: string[];
  taskIds: string[];
  materialIds: string[];
  progressTemplateVersionId: string;
  status: "draft" | "scheduled" | "published" | "closed";
  version: number;
}
```

Los arrays anteriores son aceptables solo como lista acotada de referencias semanales. Participantes, respuestas y entregas vivirán en subcolecciones.

#### `weeklyProgress/{progressId}`

```ts
{
  institutionId: string;
  weekId: string;
  courseId: string;
  studentId: string;
  policyVersionId: string;
  status: "draft" | "ready_for_review" | "published" | "corrected";
  normalizedResult: number | null;
  displayLevel: "achieved" | "in_progress" | "needs_support" | "not_observed";
  sourceSnapshot: Record<string, unknown>;
  teacherNote: string;
  publishedAt: Timestamp | null;
  version: number;
}
```

#### `messageOutbox/{messageId}`

```ts
{
  institutionId: string;
  contactId: string;
  eventType: string;
  templateId: string;
  templateVersion: number;
  parameters: Record<string, string>;
  idempotencyKey: string;
  status: "queued" | "sending" | "sent" | "delivered" | "read" | "failed" | "cancelled";
  providerMessageId: string | null;
  attemptCount: number;
  nextAttemptAt: Timestamp | null;
  createdAt: Timestamp;
}
```

### 11.3 Índices iniciales

- Tareas por `courseId + status + dueAt`.
- Tareas por `weekId + courseId + status`.
- Entregas por `taskId + studentId`.
- Repasos por `weekId + courseId + status`.
- Intentos por `reviewId + studentId + submittedAt`.
- Avances por `weekId + courseId + status`.
- Reportes por `studentId + publishedAt`.
- Materiales por `weekId + courseId + order`.
- Mural por `status + publishedAt`.
- Mural por `categoryId + status + publishedAt`.
- Foros por `groupId + status + updatedAt`.
- Posts por `topicId + status + createdAt`.
- Outbox por `status + nextAttemptAt`.
- Auditoría por `institutionId + createdAt`.

Los índices se definirán junto con las consultas y se mantendrán como código.

---

## 12. Storage

### 12.1 Rutas

```text
institutions/{institutionId}/tasks/{taskId}/resources/{assetId}
institutions/{institutionId}/submissions/{studentId}/{submissionId}/{assetId}
institutions/{institutionId}/materials/{materialId}/{assetId}
institutions/{institutionId}/wall/{postId}/{assetId}
institutions/{institutionId}/forum/{topicId}/{postId}/{assetId}
institutions/{institutionId}/profiles/{userId}/{assetId}
```

### 12.2 Reglas

- Validar autenticación, institución, propiedad y audiencia.
- Validar tipo MIME y tamaño.
- No usar nombres con datos sensibles.
- Metadatos en `fileAssets`.
- URLs temporales o acceso mediante reglas.
- Miniaturas para imágenes del periódico.
- Escaneo de archivos como requisito antes de ampliar descargas.
- Eliminación lógica en Firestore y limpieza física programada según retención.

---

## 13. Seguridad y privacidad

### 13.1 Reglas Firestore

Toda lectura/escritura comprobará:

1. Usuario autenticado.
2. Cuenta activa.
3. Pertenencia a institución.
4. Rol global.
5. Asignación a grupo/curso o propiedad.
6. Estado y audiencia.
7. Campos modificados permitidos.

Los SDK de servidor omiten Firestore Rules; por eso toda función o ruta con Admin SDK deberá repetir autorización y usar cuentas de servicio con permisos mínimos.

### 13.2 Datos de menores

- Minimización de datos.
- No mostrar teléfonos, correos familiares, reportes o avance en espacios sociales.
- No publicar contenido fuera de la comunidad sin proceso institucional y autorización.
- No guardar secretos o tokens en documentos.
- No enviar datos sensibles a analítica.
- Política de retención por módulo.
- Accesos sensibles auditados.
- Revisión jurídica institucional antes de producción.

### 13.3 Pruebas negativas mínimas

- Estudiante A no lee tareas privadas, intento, avance, reporte o entrega de estudiante B.
- Estudiante fuera del grupo no lee foro o material.
- Docente no asignado no accede a un grupo ajeno.
- Estudiante no publica directamente en el periódico.
- Estudiante no cambia resultado o versión de repaso.
- Cliente no crea eventos de auditoría.
- Contactos familiares no son legibles por docentes sin permiso administrativo.
- Usuario desactivado no conserva acceso.
- Archivo privado no es descargable por URL manipulada.

---

## 14. Cloud Functions y eventos

### 14.1 Funciones HTTP/callable

- Crear, editar, desactivar y reactivar cuentas.
- Asignar roles y refrescar claims.
- Publicar/corregir avance.
- Publicar/corregir reporte.
- Publicar o retirar contenido del periódico.
- Moderar contenido.
- Enviar mensaje de WhatsApp de prueba.
- Procesar webhook de WhatsApp.
- Crear cargas firmadas si la estrategia lo requiere.

### 14.2 Triggers

- `onTaskPublished`.
- `onReviewPublished`.
- `onMaterialPublished`.
- `onProgressPublished`.
- `onReportPublished`.
- `onWallPostSubmitted`.
- `onWallPostPublished`.
- `onForumReplyCreated`.
- `onModerationCaseCreated`.
- `onAccountDisabled`.

Cada trigger:

- Valida transición.
- Genera eventos idempotentes.
- Resuelve destinatarios.
- Crea notificaciones internas.
- Encola WhatsApp solo cuando corresponda.
- Escribe auditoría.

### 14.3 Funciones programadas

- Activar semanas programadas.
- Cerrar semanas vencidas.
- Publicar contenido programado.
- Recordar tareas próximas.
- Recordar reportes pendientes a docentes.
- Procesar reintentos de outbox.
- Limpiar datos efímeros o expirados.
- Archivar contenido según política.

### 14.4 Eventos de dominio

```text
week.published
review.published
review.completed
task.published
task.due_soon
task.submitted
task.reviewed
material.published
progress.published
report.published
wall.submitted
wall.published
forum.reply_created
forum.mention_created
moderation.case_created
account.disabled
```

Cada evento tendrá:

```ts
{
  id: string;
  type: string;
  institutionId: string;
  actorId: string;
  resourceType: string;
  resourceId: string;
  audience: Record<string, unknown>;
  occurredAt: Timestamp;
  idempotencyKey: string;
  schemaVersion: number;
}
```

---

## 15. Matriz de notificaciones

| Evento | App estudiante | App docente | WhatsApp familia | Agrupación |
|---|---:|---:|---:|---|
| Semana publicada | Sí | Opcional | Opcional | Una por semana |
| Repaso publicado | Sí | No | Configurable | Una por repaso |
| Tarea publicada | Sí | No | Sí, configurable | Por curso/día |
| Tarea próxima | Sí | No | Sí, configurable | Resumen diario |
| Entrega confirmada | Sí | Sí | No | No |
| Tarea revisada | Sí | No | No | No |
| Material publicado | Sí | No | Configurable | Por semana |
| Avance publicado | Sí | No | Aviso genérico | Una por semana |
| Reporte publicado | Sí | No | Aviso genérico | Una por semana |
| Periódico publicado | Opcional | Opcional | No | Resumen |
| Respuesta/mención de foro | Sí | Sí | No | Resumen corto |
| Moderación | Autor | Moderador | No | No |

Las preferencias institucionales pueden reducir canales, nunca ampliar una audiencia no autorizada.

---

## 16. Tiempo real, rendimiento y costos

### 16.1 Uso de listeners

Listeners permitidos:

- Notificaciones del usuario autenticado.
- Semana activa del curso visible.
- Tema de foro abierto.
- Cola editorial visible para roles autorizados.

Consultas paginadas:

- Historial de tareas.
- Reportes.
- Periódico mural.
- Temas y posts antiguos.
- Auditoría.
- Mensajes de WhatsApp.

No usar listeners globales ni colecciones completas filtradas en cliente.

### 16.2 Contadores

Contadores de entregas, repasos completados y posts serán agregados mediante transacciones o funciones. No guardar arrays crecientes de participantes.

### 16.3 Presupuestos

- Alertas por lecturas Firestore.
- Alertas de Functions.
- Límites de Storage.
- Alertas de WhatsApp y mensajes fallidos.
- Medición por módulo y entorno.

---

## 17. Estados de interfaz y resiliencia

Cada módulo deberá diseñar:

- Cargando.
- Vacío.
- Sin resultados.
- Sin permiso.
- Error recuperable.
- Configuración incompleta.
- Offline.
- Guardando.
- Guardado.
- Conflicto de versión.
- Cuenta desactivada.

### 17.1 Offline

- Lecturas previamente cargadas podrán usar caché de Firebase cuando sea seguro.
- Borradores locales se identificarán como no enviados.
- Entregas, publicación, avance y reportes requieren confirmación de servidor.
- Al recuperar conexión, evitar doble envío mediante claves idempotentes.
- WhatsApp fallido no revierte la operación académica.

### 17.2 Fechas

- Guardar en UTC.
- Mostrar con zona institucional.
- Funciones programadas declaran zona horaria.
- Semanas abarcan rangos institucionales, no cálculos del reloj local.

---

## 18. Auditoría

Registrar como mínimo:

- Creación, cambio de rol, desactivación y reactivación de cuentas.
- Cambios de asignación.
- Publicación y corrección de avance.
- Publicación y corrección de reporte.
- Cambios de plantillas utilizadas.
- Publicación/retiro del periódico.
- Moderación del foro.
- Cambios de configuración institucional.
- Cambios de consentimiento.
- Envíos manuales o de prueba por WhatsApp.
- Accesos administrativos a información sensible.

`auditEvents` será append-only desde clientes. Solo backend confiable podrá escribir.

---

## 19. Requisitos no funcionales

### Rendimiento

- Carga inicial crítica menor a 2.5 s en condiciones objetivo.
- Imágenes responsivas y miniaturas.
- Carga diferida de editores y módulos pesados.
- Paginación por cursor.
- Virtualización si una lista docente supera el umbral definido en QA.
- Presupuesto de bundle por ruta.

### Disponibilidad

- Operaciones backend idempotentes.
- Reintentos con backoff.
- Monitoreo y alertas.
- Copias de seguridad y restauración probada.
- Modo degradado si WhatsApp no está disponible.

### Compatibilidad

- Últimas dos versiones estables de Chrome, Edge, Firefox y Safari al liberar.
- iOS Safari y Android Chrome.
- Diseño usable desde 360 px.

### Observabilidad

- Errores frontend y backend sin PII innecesaria.
- Correlation ID para publicaciones y mensajes.
- Latencia de Functions.
- Entregabilidad de WhatsApp.
- Lecturas y escrituras Firebase.
- Tasa de error por módulo.

---

## 20. Estrategia de pruebas

### 20.1 Niveles

- Unitarias: cálculos, escalas, fechas, permisos derivados, validación e idempotencia.
- Firestore Rules: permisos positivos y negativos.
- Storage Rules: archivos y audiencias.
- Integración: Functions, Firestore, Storage y WhatsApp simulado.
- E2E: flujos completos por rol.
- Visuales: escritorio, móvil y temas.
- Accesibilidad: automatizada y revisión manual.
- Carga: grupos, tareas, foros, notificaciones y publicación semanal.
- Recuperación: recarga, offline, doble envío y caída del proveedor.
- Seguridad: claims, endpoints administrativos, webhooks y secretos.

### 20.2 Flujos E2E mínimos

1. Dirección crea docente, estudiante, grupo y asignación.
2. Docente prepara y publica una semana.
3. Estudiante completa repaso y recupera progreso después de recargar.
4. Docente publica tarea; estudiante entrega; docente revisa.
5. Docente configura criterios y publica avance.
6. Docente publica reporte y se encola WhatsApp.
7. Webhook actualiza un mensaje a entregado.
8. Estudiante propone contenido; dirección aprueba el periódico.
9. Docente abre foro; estudiante responde; moderador oculta un post reportado.
10. Material privado se consulta solo desde el grupo autorizado.
11. Cuenta desactivada pierde acceso.
12. Estudiante A no puede leer datos de estudiante B.

### 20.3 Pruebas de WhatsApp

- Firma/verificación de webhook.
- Plantilla inválida.
- Contacto sin consentimiento.
- Número inválido.
- Duplicación del mismo evento.
- Rate limit.
- Reintento transitorio.
- Fallo definitivo.
- Baja antes del envío.
- Redacción de teléfonos en logs.

---

## 21. Plan de implementación

### Fase 0 — Descubrimiento y validación

- Confirmar grados, grupos, materias y semanas.
- Definir escalas de avance.
- Definir destinatarios y política de WhatsApp.
- Mapear permisos.
- Revisar privacidad de menores.
- Inventariar componentes reutilizables de Secundaria.
- Definir alcance del MVP.

**Salida:** decisiones pendientes resueltas y prototipo de navegación.

### Fase 1 — Base técnica y visual

- Crear proyecto separado de Primaria.
- Firebase por entornos.
- Auth y cuentas.
- Perfiles y asignaciones.
- Reglas iniciales y pruebas.
- Reutilizar sistema de diseño.
- Rutas y navegación por rol.
- Centro interno de notificaciones.

**Salida:** usuarios de prueba entran y ven contenido seguro por rol.

### Fase 2 — Semana, materiales y tareas

- Ciclos, semanas y planes.
- Objetivos.
- Materiales.
- Tareas y entregas.
- Dashboard de semana.
- Notificaciones internas.

**Salida:** semana completa publicada y consumida por un grupo.

### Fase 3 — Repaso y avance

- Editor de repaso.
- Intentos y autoguardado.
- Calificación objetiva.
- Plantillas de avance.
- Captura y cálculo.
- Publicación y versiones.

**Salida:** evidencia semanal alimenta un avance reproducible.

### Fase 4 — Reportes y WhatsApp

- Reportes semanales.
- Contactos y consentimientos.
- Plantillas.
- Outbox idempotente.
- Webhooks y entregabilidad.
- Horarios y preferencias.
- Modo degradado.

**Salida:** reporte publicado con aviso seguro y trazable.

### Fase 5 — Periódico mural y foro

- Flujo editorial.
- Mural, categorías, búsqueda y favoritos.
- Foros, temas y respuestas.
- Moderación y reportes.
- Pruebas de privacidad.

**Salida:** publicación aprobada y conversación moderada de extremo a extremo.

### Fase 6 — Endurecimiento y piloto

- Accesibilidad integral.
- Rendimiento.
- Costos.
- Seguridad.
- Capacitación.
- Piloto con uno o dos grupos.
- Soporte, métricas y rollback.

**Salida:** lanzamiento gradual aprobado.

### Orden MVP recomendado

1. Login y perfiles.
2. Configuración académica.
3. Semana y materiales.
4. Tareas.
5. Repaso.
6. Avance.
7. Reportes.
8. Notificaciones internas.
9. WhatsApp.
10. Periódico mural.
11. Foro.

WhatsApp debe añadirse después de que los eventos internos sean confiables; así la integración consume eventos estables y no queda acoplada directamente a botones de interfaz.

---

## 22. Estrategia de reutilización del código actual

| Área de Secundaria | Decisión para Primaria |
|---|---|
| Tokens y `globals.css` | Reutilizar y extraer progresivamente |
| Layout, sidebar y topbar | Reutilizar con nuevas secciones |
| Login/Auth | Reutilizar y adaptar mensajes |
| Store de sesión | Reutilizar, ampliar roles |
| Gestión de cuentas | Reutilizar |
| Tareas | Reutilizar contratos y adaptar a semana |
| Archivos de tareas | Reutilizar |
| Centro de notificaciones | Reutilizar y ampliar categorías |
| Reportes | Adaptar a avance de Primaria |
| Revista escolar | Usar como referencia del Periódico Mural |
| Moderación de historias | Reutilizar patrón de aprobación |
| Exámenes en RTDB | No reutilizar para el MVP |
| Museo/Taller | No forman parte del alcance inicial |
| Firebase Admin | Reutilizar con proyecto/secretos separados |
| Rules | Reutilizar patrones, escribir reglas específicas |

### Reglas de implementación

- No copiar datos de demostración de Secundaria como datos productivos.
- No conservar nombres de secciones que no existen en Primaria.
- No compartir `.env.local`.
- No desplegar Primaria sobre el dominio o proyecto de Secundaria.
- No agregar condicionales por producto en un único componente gigante.
- Extraer componentes compartidos cuando hayan sido validados en ambas plataformas.

---

## 23. Backlog técnico transversal

- Convenciones de IDs, timestamps y errores.
- Contratos Zod compartidos entre cliente y servidor.
- Generador de datos sintéticos.
- Índices Firestore documentados.
- Emuladores en CI.
- Pruebas de Rules.
- Idempotency keys.
- Control optimista de versiones.
- Feature flags para foro, propuestas estudiantiles y WhatsApp.
- Procesamiento de imágenes.
- Rate limits.
- Backups.
- Exportación institucional.
- Catálogo de eventos analíticos sin PII.
- Runbooks de cuenta bloqueada, mensaje fallido, publicación accidental y moderación.

---

## 24. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Compartir backend con Secundaria | Afectación cruzada | Proyectos Firebase independientes |
| Semana ambigua | Datos inconsistentes | Calendario institucional y validación |
| Fórmula de avance poco clara | Reportes incorrectos | Plantillas versionadas y ejemplos reales |
| WhatsApp duplicado o invasivo | Desconfianza/costo | Outbox idempotente, límites y preferencias |
| Enviar datos sensibles por WhatsApp | Riesgo de privacidad | Mensajes genéricos y detalle en portal |
| Foro usado como chat | Riesgo de convivencia | Sin privados, moderación y rate limits |
| Publicación no autorizada | Exposición de menores | Aprobación obligatoria y reglas negativas |
| Gamificación competitiva | Efecto pedagógico adverso | Progreso personal, sin rankings |
| Listeners globales | Costo/rendimiento | Consultas acotadas y paginación |
| Plantillas modificadas retroactivamente | Resultados no reproducibles | Versionado y snapshots |
| Cuenta sin claims/asignación | Bloqueo de acceso | Flujo administrativo y estado guiado |
| Alcance excesivo | Retraso | Fases verticales y criterios de salida |

---

## 25. Definición de terminado

Una funcionalidad se considera terminada cuando:

- Cumple criterios funcionales.
- Tiene carga, vacío, error, sin permiso y offline cuando aplica.
- Funciona en móvil y escritorio.
- Tiene pruebas proporcionales al riesgo.
- Sus reglas tienen pruebas negativas.
- Cumple accesibilidad acordada.
- No registra datos sensibles innecesarios.
- Está instrumentada y documentada.
- Conserva la identidad de Secundaria.
- Fue validada en staging por el rol responsable.

---

## 26. Criterios de aceptación del producto

1. Dirección administra cuentas, grupos, materias, semanas y asignaciones sin cambiar código.
2. Cada rol recibe navegación y acciones correctas.
3. Docentes preparan una semana con objetivos, repasos, tareas, materiales y criterios.
4. Estudiantes ven únicamente su semana y datos correspondientes.
5. Un repaso recupera respuestas y califica preguntas objetivas con la versión correcta.
6. El ciclo tarea → entrega → revisión funciona de extremo a extremo.
7. El avance usa una plantilla visible, versionada y reproducible.
8. Los reportes requieren revisión docente y conservan versiones.
9. El periódico aplica aprobación antes de publicar contenido estudiantil.
10. El foro está limitado por grupo/curso, no tiene mensajes privados y permite moderación.
11. WhatsApp usa contactos autorizados, plantillas, idempotencia y mensajes sin datos sensibles.
12. Materiales privados solo son accesibles para su audiencia.
13. La cuenta desactivada pierde acceso.
14. Las operaciones sensibles quedan auditadas.
15. La UI mantiene el lenguaje visual de Secundaria y es adecuada para primaria.
16. Las reglas impiden acceso cruzado entre estudiantes y grupos.
17. El sistema funciona en modo degradado si WhatsApp falla.
18. Costos, errores y entregabilidad pueden monitorearse.

---

## 27. Decisiones pendientes

1. ¿Qué grados y grupos incluirá el primer piloto?
2. ¿Un docente configura toda la semana o cada materia configura una parte?
3. ¿Quién puede crear/cerrar semanas: dirección o docentes?
4. ¿Cuál será la escala oficial de avance?
5. ¿Los criterios tendrán pesos o solo niveles descriptivos?
6. ¿Qué ocurre con evidencias faltantes?
7. ¿Cuántos intentos tendrá un repaso por defecto?
8. ¿Las respuestas correctas se muestran inmediatamente?
9. ¿Los estudiantes podrán proponer contenido al Periódico Mural desde el MVP?
10. ¿Qué docentes tendrán permiso editorial?
11. ¿El foro necesitará aprobación previa de cada publicación en grados menores?
12. ¿Qué eventos exactos deben enviarse por WhatsApp?
13. ¿Quién obtiene y registra el consentimiento?
14. ¿Cuáles serán los horarios silenciosos?
15. ¿Se usará Cloud API directamente o un proveedor oficial?
16. ¿Habrá una cuenta de tutor en una fase posterior?
17. ¿Qué tipos y tamaños de archivo se permitirán?
18. ¿Cuánto tiempo se conservarán tareas, reportes, mensajes y moderación?
19. ¿Cuál será el dominio de Primaria?
20. ¿El código se organizará inmediatamente como monorepo o como proyecto separado?

---

## 28. Referencias oficiales

- [Firebase Authentication: custom claims y control de acceso](https://firebase.google.com/docs/auth/admin/custom-claims)
- [Firebase Admin Authentication](https://firebase.google.com/docs/auth/admin)
- [Firestore: acceso seguro por usuarios y roles](https://firebase.google.com/docs/firestore/solutions/role-based-access)
- [Firebase Security Rules](https://firebase.google.com/docs/rules)
- [WhatsApp Business Platform Developer Hub](https://whatsappbusiness.com/developers/developer-hub/)
- [Repositorio oficial de ejemplos de WhatsApp Cloud API](https://github.com/fbsamples/whatsapp-api-examples)

---

## 29. Recomendación final

La primera versión debe construirse alrededor de una semana confiable y fácil de preparar. Login, perfiles, configuración, materiales, tareas, repaso y avance forman el núcleo. Los reportes deben ser una consecuencia de evidencia estructurada, no un documento aislado.

Periódico Mural y Foro deben compartir moderación, permisos y notificaciones, pero mantener propósitos diferentes: el periódico publica contenido curado; el foro habilita conversación guiada.

WhatsApp debe implementarse como consumidor asíncrono de eventos ya confirmados. Nunca deberá formar parte de la transacción principal ni contener el detalle académico. Si WhatsApp falla, la tarea, material, avance o reporte deben permanecer correctamente publicados dentro de CEHF Primaria.

La mejor estrategia para conservar la experiencia de Secundaria es compartir el sistema de diseño y patrones maduros, mientras Primaria mantiene navegación, datos, Firebase, reglas y despliegue independientes. Esto protege ambos productos y permite evolucionarlos sin romper su identidad común.
