import assert from "node:assert/strict";
import test from "node:test";
import { scheduledTaskTimingError } from "../lib/task-publication.ts";

const now = Date.parse("2026-10-05T18:00:00Z");

test("scheduled tasks require a full day of student access", () => {
  assert.match(
    scheduledTaskTimingError(
      "2026-10-10T02:00:00Z",
      "2026-10-09T21:22:00Z",
      now,
    ),
    /al menos 24 horas/,
  );
  assert.equal(
    scheduledTaskTimingError(
      "2026-10-10T02:00:00Z",
      "2026-10-09T02:00:00Z",
      now,
    ),
    null,
  );
});

test("scheduled tasks need a valid future publication before delivery", () => {
  assert.match(scheduledTaskTimingError("2026-10-10T02:00:00Z", undefined, now), /fechas válidas/);
  assert.match(scheduledTaskTimingError("2026-10-10T02:00:00Z", "2026-10-05T18:00:00Z", now), /futuro/);
  assert.match(scheduledTaskTimingError("2026-10-10T02:00:00Z", "2026-10-10T02:00:00Z", now), /anterior/);
});
