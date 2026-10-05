export const MIN_SCHEDULED_TASK_LEAD_MS = 24 * 60 * 60 * 1000;

export function scheduledTaskTimingError(
  dueAt: string,
  publishAt: string | undefined,
  now = Date.now(),
): string | null {
  const dueTime = Date.parse(dueAt);
  const publishTime = publishAt ? Date.parse(publishAt) : Number.NaN;

  if (!Number.isFinite(publishTime) || !Number.isFinite(dueTime)) {
    return "Elige fechas válidas de publicación y entrega.";
  }
  if (publishTime <= now) {
    return "La fecha de publicación debe estar en el futuro.";
  }
  if (publishTime >= dueTime) {
    return "La publicación debe ser anterior a la entrega.";
  }
  if (dueTime - publishTime < MIN_SCHEDULED_TASK_LEAD_MS) {
    return "Los alumnos deben tener al menos 24 horas entre la publicación y la entrega.";
  }
  return null;
}
