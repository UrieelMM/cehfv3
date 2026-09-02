"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Filter,
  MessageCircle,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { friendlyFirebaseError } from "@/lib/firebase";
import type {
  GuardianContact,
  ManagedAccount,
  Role,
  WhatsAppConfiguration,
  WhatsAppLogFilters,
  WhatsAppOutboxMessage,
} from "@/lib/types";
import {
  defaultWhatsAppConfiguration,
  listWhatsAppMessageLog,
  queueDailyWhatsAppSummaries,
  saveGuardianContact,
  saveWhatsAppConfiguration,
  sendWhatsAppTest,
  setGuardianContactStatus,
  watchGuardianContacts,
  watchWhatsAppConfiguration,
} from "@/lib/whatsapp-firebase";

type Props = {
  institutionId: string;
  accounts: ManagedAccount[];
  firebaseReady: boolean;
  role: Role;
};

const EMPTY_LOG_FILTERS: WhatsAppLogFilters = {
  search: "",
  status: "all",
  messageType: "all",
  dateFrom: "",
  dateTo: "",
};

const contactStatusLabels: Record<GuardianContact["status"], string> = {
  active: "Activo",
  paused: "Pausado",
  opted_out: "Baja solicitada",
  invalid: "Teléfono inválido",
};

const messageStatusLabels: Record<WhatsAppOutboxMessage["status"], string> = {
  queued: "En cola",
  sending: "Enviando",
  sent: "Enviado",
  delivered: "Entregado",
  read: "Leído",
  failed: "Falló",
  cancelled: "Cancelado",
};

function displayDate(value?: string) {
  if (!value || value.startsWith("1970-")) return "—";
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function currentMexicoDate() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Mexico_City",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function WhatsAppAdminPanel({
  institutionId,
  accounts,
  firebaseReady,
  role,
}: Props) {
  const isDirector = role === "director";
  const [configuration, setConfiguration] = useState<WhatsAppConfiguration>({
    ...defaultWhatsAppConfiguration,
    institutionId,
  });
  const [contacts, setContacts] = useState<GuardianContact[]>([]);
  const [messages, setMessages] = useState<WhatsAppOutboxMessage[]>([]);
  const [loading, setLoading] = useState(firebaseReady);
  const [logLoading, setLogLoading] = useState(firebaseReady);
  const [logFilters, setLogFilters] = useState<WhatsAppLogFilters>({
    ...EMPTY_LOG_FILTERS,
  });
  const [appliedLogFilters, setAppliedLogFilters] =
    useState<WhatsAppLogFilters>({ ...EMPTY_LOG_FILTERS });
  const [pageTokens, setPageTokens] = useState<string[]>([""]);
  const [pageIndex, setPageIndex] = useState(0);
  const [nextPageToken, setNextPageToken] = useState<string>();
  const [busy, setBusy] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [relationship, setRelationship] = useState("Madre");
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [consentConfirmed, setConsentConfirmed] = useState(false);

  const students = useMemo(
    () =>
      accounts
        .filter((account) => account.role === "student" && account.active)
        .sort((first, second) => first.name.localeCompare(second.name, "es")),
    [accounts],
  );

  async function loadLog(
    filters: WhatsAppLogFilters,
    pageToken?: string,
  ) {
    setLogLoading(true);
    try {
      const page = await listWhatsAppMessageLog(filters, pageToken, 15);
      setMessages(page.messages);
      setNextPageToken(page.nextPageToken);
    } catch (error) {
      toast.error(friendlyFirebaseError(error));
    } finally {
      setLogLoading(false);
    }
  }

  useEffect(() => {
    if (!firebaseReady) return;
    let readySources = 0;
    const expectedSources = isDirector ? 2 : 1;
    const markReady = () => {
      readySources += 1;
      if (readySources >= expectedSources) setLoading(false);
    };
    const report = (error: Error) => {
      console.error("[Campus CEHF] WhatsApp", error);
      toast.error(friendlyFirebaseError(error));
      markReady();
    };
    const stopConfiguration = watchWhatsAppConfiguration(
      institutionId,
      (next) => {
        setConfiguration(next);
        markReady();
      },
      report,
    );
    const stopContacts = isDirector
      ? watchGuardianContacts(
          institutionId,
          (next) => {
            setContacts(next);
            markReady();
          },
          report,
        )
      : () => undefined;
    void loadLog(EMPTY_LOG_FILTERS);
    return () => {
      stopConfiguration();
      stopContacts();
    };
  }, [firebaseReady, institutionId, isDirector]);

  function applyLogFilters() {
    const next = { ...logFilters };
    setAppliedLogFilters(next);
    setPageTokens([""]);
    setPageIndex(0);
    void loadLog(next);
  }

  function resetLogFilters() {
    const next = { ...EMPTY_LOG_FILTERS };
    setLogFilters(next);
    setAppliedLogFilters(next);
    setPageTokens([""]);
    setPageIndex(0);
    void loadLog(next);
  }

  function openNextLogPage() {
    if (!nextPageToken || logLoading) return;
    setPageTokens((current) => [...current.slice(0, pageIndex + 1), nextPageToken]);
    setPageIndex((current) => current + 1);
    void loadLog(appliedLogFilters, nextPageToken);
  }

  function openPreviousLogPage() {
    if (pageIndex === 0 || logLoading) return;
    const previousIndex = pageIndex - 1;
    const previousToken = pageTokens[previousIndex] || undefined;
    setPageIndex(previousIndex);
    void loadLog(appliedLogFilters, previousToken);
  }

  function resetContactForm() {
    setEditingId(undefined);
    setName("");
    setPhone("");
    setRelationship("Madre");
    setStudentIds([]);
    setConsentConfirmed(false);
  }

  function editContact(contact: GuardianContact) {
    setEditingId(contact.id);
    setName(contact.name);
    setPhone(contact.phoneE164);
    setRelationship(contact.relationship);
    setStudentIds(contact.studentIds);
    setConsentConfirmed(false);
    document
      .getElementById("whatsapp-contact-form")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function run(
    key: string,
    operation: () => Promise<unknown>,
    success: string,
  ) {
    setBusy(key);
    try {
      await operation();
      toast.success(success);
    } catch (error) {
      toast.error(friendlyFirebaseError(error));
      throw error;
    } finally {
      setBusy(null);
    }
  }

  if (!firebaseReady) {
    return (
      <section className="panel settings-section whatsapp-admin-panel">
        <div className="settings-heading">
          <span className="settings-icon">
            <MessageCircle size={20} />
          </span>
          <div>
            <h2>WhatsApp para familias</h2>
            <p>Disponible para Dirección y docentes al iniciar sesión con Firebase.</p>
          </div>
        </div>
        <div className="setup-note">
          <ShieldCheck size={19} />
          <p>El modo demostración no envía mensajes ni guarda teléfonos reales.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="panel settings-section whatsapp-admin-panel">
      <div className="settings-heading whatsapp-heading">
        <span className="settings-icon">
          <MessageCircle size={20} />
        </span>
        <div>
          <h2>WhatsApp para familias</h2>
          <p>
            {isDirector
              ? "Horario, contactos, pruebas e historial de entregabilidad."
              : "Consulta el historial de reportes enviados a las familias."}
          </p>
        </div>
        <span
          className={`whatsapp-provider-state ${configuration.enabled ? "active" : "paused"}`}
        >
          {configuration.enabled ? <CheckCircle2 size={15} /> : <Pause size={15} />}
          {configuration.enabled ? "Automatización activa" : "Automatización pausada"}
        </span>
      </div>

      {loading ? (
        <div className="whatsapp-loading">
          <RefreshCw size={18} className="spin" /> Cargando configuración…
        </div>
      ) : (
        <>
          {isDirector ? (
            <>
              <div className="whatsapp-config-grid">
            <label className="whatsapp-check-card">
              <input
                type="checkbox"
                checked={configuration.enabled}
                onChange={(event) =>
                  setConfiguration((current) => ({
                    ...current,
                    enabled: event.target.checked,
                  }))
                }
              />
              <span>
                <strong>Habilitar envíos</strong>
                <small>El portal sigue funcionando si está pausado.</small>
              </span>
            </label>
            <label className="whatsapp-time-field">
              <span>Hora del resumen</span>
              <input
                type="time"
                step="900"
                value={configuration.sendTime}
                onChange={(event) =>
                  setConfiguration((current) => ({
                    ...current,
                    sendTime: event.target.value,
                  }))
                }
              />
              <small>Hora de Ciudad de México, de lunes a viernes. Inicialmente 23:00.</small>
            </label>
              </div>
              <div className="whatsapp-actions-row">
            <button
              className="primary-button"
              type="button"
              disabled={Boolean(busy)}
              onClick={() =>
                void run(
                  "save-config",
                  () =>
                    saveWhatsAppConfiguration({
                      enabled: configuration.enabled,
                      dailySummaryEnabled: true,
                      sendTime: configuration.sendTime,
                      sendOnNoTaskDays: configuration.sendOnNoTaskDays,
                      templateName: configuration.templateName,
                    }),
                  "Configuración de WhatsApp guardada",
                ).catch(() => undefined)
              }
            >
              {busy === "save-config" ? <RefreshCw size={16} className="spin" /> : <ShieldCheck size={16} />}
              Guardar configuración
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={Boolean(busy) || !configuration.enabled}
              onClick={() =>
                void run(
                  "queue-today",
                  async () => {
                    const result = await queueDailyWhatsAppSummaries(
                      currentMexicoDate(),
                    );
                    toast.info(
                      `${result.queued} en cola · ${result.skipped} omitidos`,
                    );
                  },
                  "Resumen de hoy preparado",
                ).catch(() => undefined)
              }
            >
              {busy === "queue-today" ? <RefreshCw size={16} className="spin" /> : <Send size={16} />}
              Preparar resumen de hoy
            </button>
            <span className="whatsapp-last-send">
              <Clock3 size={15} /> Último envío correcto: {displayDate(configuration.lastSuccessfulSendAt)}
            </span>
              </div>

              <div className="whatsapp-template-preview">
            <strong>Plantilla requerida en Meta: {configuration.templateName}</strong>
            <code>
              {"Hola {{1}}, te enviamos el reporte de {{2}} del día {{3}}.\n\nAsistencia: {{4}}\nParticipación: {{5}}\nTarea: {{6}}\n\nCentro Educativo Héroes de la Fe\nEste es un mensaje informativo. Favor de no responder."}
            </code>
              </div>

              <div className="whatsapp-admin-columns">
            <form
              id="whatsapp-contact-form"
              className="whatsapp-contact-form"
              onSubmit={(event) => {
                event.preventDefault();
                void run(
                  "save-contact",
                  () =>
                    saveGuardianContact({
                      id: editingId,
                      name,
                      phone,
                      relationship,
                      studentIds,
                      consentConfirmed,
                    }),
                  editingId ? "Contacto actualizado" : "Contacto agregado",
                )
                  .then(resetContactForm)
                  .catch(() => undefined);
              }}
            >
              <div className="whatsapp-subheading">
                <div>
                  <h3>{editingId ? "Editar contacto" : "Nuevo contacto familiar"}</h3>
                  <p>El número sólo será visible para Dirección.</p>
                </div>
                {editingId && (
                  <button className="text-button" type="button" onClick={resetContactForm}>
                    Cancelar
                  </button>
                )}
              </div>
              <label>
                Nombre del tutor
                <input
                  required
                  minLength={2}
                  maxLength={100}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ej. Laura Hernández"
                />
              </label>
              <div className="whatsapp-two-fields">
                <label>
                  Teléfono de México
                  <input
                    required
                    inputMode="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="55 1234 5678"
                  />
                </label>
                <label>
                  Parentesco
                  <select
                    value={relationship}
                    onChange={(event) => setRelationship(event.target.value)}
                  >
                    <option>Madre</option>
                    <option>Padre</option>
                    <option>Tutor</option>
                    <option>Abuela</option>
                    <option>Abuelo</option>
                  </select>
                </label>
              </div>
              <fieldset className="whatsapp-student-picker">
                <legend>Estudiantes vinculados</legend>
                {students.length ? (
                  students.map((student) => (
                    <label key={student.uid}>
                      <input
                        type="checkbox"
                        checked={studentIds.includes(student.uid)}
                        onChange={(event) =>
                          setStudentIds((current) =>
                            event.target.checked
                              ? [...new Set([...current, student.uid])]
                              : current.filter((id) => id !== student.uid),
                          )
                        }
                      />
                      <span>
                        {student.name}
                        <small>{student.grade} {student.group}</small>
                      </span>
                    </label>
                  ))
                ) : (
                  <p className="empty-inline">Primero registra alumnos activos.</p>
                )}
              </fieldset>
              <label className="whatsapp-consent">
                <input
                  required
                  type="checkbox"
                  checked={consentConfirmed}
                  onChange={(event) => setConsentConfirmed(event.target.checked)}
                />
                <span>
                  Confirmo que este tutor proporcionó su teléfono y autorizó recibir
                  resúmenes académicos por WhatsApp.
                </span>
              </label>
              <button
                className="primary-button"
                type="submit"
                disabled={
                  Boolean(busy) ||
                  !name.trim() ||
                  !phone.trim() ||
                  !studentIds.length ||
                  !consentConfirmed
                }
              >
                {busy === "save-contact" ? <RefreshCw size={16} className="spin" /> : editingId ? <Pencil size={16} /> : <Plus size={16} />}
                {editingId ? "Guardar cambios" : "Agregar contacto"}
              </button>
            </form>

            <div className="whatsapp-contact-list">
              <div className="whatsapp-subheading">
                <div>
                  <h3>Contactos autorizados</h3>
                  <p>{contacts.filter((contact) => contact.status === "active").length} activos de {contacts.length}</p>
                </div>
              </div>
              {contacts.length ? (
                contacts.map((contact) => (
                  <article className="whatsapp-contact-card" key={contact.id}>
                    <div className="whatsapp-contact-main">
                      <span className="whatsapp-contact-icon">
                        <UserRoundCheck size={18} />
                      </span>
                      <div>
                        <strong>{contact.name}</strong>
                        <span>{contact.relationship} · {contact.phoneMasked}</span>
                        <small>{contact.studentNames.join(", ") || "Sin alumno activo"}</small>
                      </div>
                      <span className={`whatsapp-status ${contact.status}`}>
                        {contactStatusLabels[contact.status]}
                      </span>
                    </div>
                    <div className="whatsapp-contact-actions">
                      <button type="button" onClick={() => editContact(contact)} disabled={Boolean(busy)}>
                        <Pencil size={14} /> Editar
                      </button>
                      {contact.status === "active" ? (
                        <button
                          type="button"
                          disabled={Boolean(busy)}
                          onClick={() =>
                            void run(
                              `pause-${contact.id}`,
                              () => setGuardianContactStatus(contact.id, "paused"),
                              "Contacto pausado",
                            ).catch(() => undefined)
                          }
                        >
                          <Pause size={14} /> Pausar
                        </button>
                      ) : contact.status === "paused" ? (
                        <button
                          type="button"
                          disabled={Boolean(busy)}
                          onClick={() =>
                            void run(
                              `activate-${contact.id}`,
                              () => setGuardianContactStatus(contact.id, "active"),
                              "Contacto reactivado",
                            ).catch(() => undefined)
                          }
                        >
                          <Play size={14} /> Reactivar
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={Boolean(busy) || contact.status !== "active"}
                        onClick={() =>
                          void run(
                            `test-${contact.id}`,
                            () => sendWhatsAppTest(contact.id),
                            "Mensaje de prueba enviado a Meta",
                          ).catch(() => undefined)
                        }
                      >
                        {busy === `test-${contact.id}` ? <RefreshCw size={14} className="spin" /> : <Send size={14} />} Probar
                      </button>
                    </div>
                    {contact.status === "opted_out" && (
                      <div className="whatsapp-optout-note">
                        <AlertTriangle size={14} /> Para reactivar una baja se debe editar el contacto y registrar un nuevo consentimiento.
                      </div>
                    )}
                  </article>
                ))
              ) : (
                <div className="empty-state whatsapp-empty">
                  <MessageCircle size={24} />
                  <strong>Aún no hay contactos</strong>
                  <span>Agrega un tutor para realizar la primera prueba.</span>
                </div>
              )}
            </div>
              </div>
            </>
          ) : (
            <div className="whatsapp-readonly-summary">
              <span><Clock3 size={18} /></span>
              <div>
                <strong>Envío programado: {configuration.sendTime}</strong>
                <p>
                  Hora de Ciudad de México, de lunes a viernes. Sólo Dirección
                  puede cambiar el horario, administrar contactos o hacer envíos
                  manuales.
                </p>
              </div>
            </div>
          )}

          <div className="whatsapp-delivery">
            <div className="whatsapp-subheading">
              <div>
                <h3>Historial de WhatsApp</h3>
                <p>Consulta envíos, entregas, lecturas y errores; los teléfonos permanecen enmascarados.</p>
              </div>
              <button
                className="secondary-button whatsapp-log-refresh"
                disabled={logLoading}
                onClick={() =>
                  void loadLog(
                    appliedLogFilters,
                    pageTokens[pageIndex] || undefined,
                  )
                }
                type="button"
              >
                <RefreshCw size={15} className={logLoading ? "spin" : undefined} />
                Actualizar
              </button>
            </div>
            <form
              className="whatsapp-log-filters"
              onSubmit={(event) => {
                event.preventDefault();
                applyLogFilters();
              }}
            >
              <label className="whatsapp-log-search">
                <span>Buscar</span>
                <div>
                  <Search size={16} />
                  <input
                    maxLength={80}
                    onChange={(event) =>
                      setLogFilters((current) => ({
                        ...current,
                        search: event.target.value,
                      }))
                    }
                    placeholder="Tutor, alumno, fecha o error"
                    value={logFilters.search}
                  />
                </div>
              </label>
              <label>
                <span>Estado</span>
                <select
                  onChange={(event) =>
                    setLogFilters((current) => ({
                      ...current,
                      status: event.target.value as WhatsAppLogFilters["status"],
                    }))
                  }
                  value={logFilters.status}
                >
                  <option value="all">Todos</option>
                  <option value="queued">En cola</option>
                  <option value="sending">Enviando</option>
                  <option value="sent">Enviado</option>
                  <option value="delivered">Entregado</option>
                  <option value="read">Leído</option>
                  <option value="failed">Falló</option>
                  <option value="cancelled">Cancelado</option>
                </select>
              </label>
              <label>
                <span>Tipo</span>
                <select
                  onChange={(event) =>
                    setLogFilters((current) => ({
                      ...current,
                      messageType: event.target.value as WhatsAppLogFilters["messageType"],
                    }))
                  }
                  value={logFilters.messageType}
                >
                  <option value="all">Todos</option>
                  <option value="automatic">Automáticos</option>
                  <option value="test">Pruebas</option>
                </select>
              </label>
              <label>
                <span>Desde</span>
                <input
                  onChange={(event) =>
                    setLogFilters((current) => ({
                      ...current,
                      dateFrom: event.target.value,
                    }))
                  }
                  type="date"
                  value={logFilters.dateFrom}
                />
              </label>
              <label>
                <span>Hasta</span>
                <input
                  onChange={(event) =>
                    setLogFilters((current) => ({
                      ...current,
                      dateTo: event.target.value,
                    }))
                  }
                  type="date"
                  value={logFilters.dateTo}
                />
              </label>
              <div className="whatsapp-log-filter-actions">
                <button className="primary-button" disabled={logLoading} type="submit">
                  <Filter size={15} /> Aplicar
                </button>
                <button
                  className="text-button"
                  disabled={logLoading}
                  onClick={resetLogFilters}
                  type="button"
                >
                  Limpiar
                </button>
              </div>
            </form>
            {logLoading ? (
              <div className="whatsapp-loading whatsapp-log-loading">
                <RefreshCw size={18} className="spin" /> Cargando historial…
              </div>
            ) : messages.length ? (
              <div className="whatsapp-message-table-wrap">
                <table className="whatsapp-message-table">
                  <thead>
                    <tr>
                      <th>Contacto</th>
                      <th>Alumno y reporte</th>
                      <th>Fecha escolar</th>
                      <th>Estado</th>
                      <th>Intentos</th>
                      <th>Creado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {messages.map((message) => {
                      const indicators = message.dailyIndicators;
                      const scores = message.dailyScores;
                      return (
                        <tr key={message.id}>
                          <td>
                            <strong>{message.recipientName}</strong>
                            <small>{message.toMasked}{message.test ? " · prueba" : ""}</small>
                          </td>
                          <td>
                            <strong>{message.studentNames.join(", ") || "Alumno"}</strong>
                            <small className="whatsapp-log-indicators">
                              A {indicators?.attendance === "present" ? "✅" : "❌"}
                              {" · "}P {indicators?.participation === "positive" ? "😊" : indicators?.participation === "neutral" ? "😐" : "😟"}
                              {" · "}T {indicators?.homework === "complete" ? "✅" : "❌"}
                            </small>
                            {scores && (
                              <small>
                                Calificaciones: {scores.attendance ?? "—"} / {scores.participation ?? "—"} / {scores.homework ?? "—"}
                              </small>
                            )}
                          </td>
                          <td>
                            {message.businessDate}
                            <small>{message.test ? "Prueba" : "Automático"}</small>
                          </td>
                          <td>
                            <span className={`whatsapp-status ${message.status}`}>
                              {messageStatusLabels[message.status]}
                            </span>
                            {message.lastErrorMessage && (
                              <small className="whatsapp-error">{message.lastErrorMessage}</small>
                            )}
                          </td>
                          <td>{message.attemptCount}</td>
                          <td>{displayDate(message.createdAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty-inline">No hay mensajes que coincidan con los filtros.</p>
            )}
            <div className="whatsapp-log-pagination" aria-label="Paginación del historial">
              <button
                disabled={pageIndex === 0 || logLoading}
                onClick={openPreviousLogPage}
                type="button"
              >
                <ChevronLeft size={16} /> Anterior
              </button>
              <span>Página {pageIndex + 1}</span>
              <button
                disabled={!nextPageToken || logLoading}
                onClick={openNextLogPage}
                type="button"
              >
                Siguiente <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
