import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

test("notification clicks mark one item as read and open its deep link", async () => {
  const [appSource, tasksSource] = await Promise.all([
    readFile(new URL("components/cehf-app.tsx", projectRoot), "utf8"),
    readFile(new URL("lib/tasks-firebase.ts", projectRoot), "utf8"),
  ]);

  assert.match(appSource, /onClick=\{\(\) => onOpen\(item\)\}/);
  assert.match(appSource, /markTaskNotificationRead\(profile\.uid, notification\.id\)/);
  assert.match(appSource, /openInternalRoute\(routeForNotification\(notification\)\)/);
  assert.match(tasksSource, /export async function markTaskNotificationRead/);
  assert.match(
    tasksSource,
    /doc\(firebase\.db, "notifications", userId, "items", notificationId\)/,
  );
});

test("notification routes resolve to the concrete resource", async () => {
  const appSource = await readFile(
    new URL("components/cehf-app.tsx", projectRoot),
    "utf8",
  );

  assert.match(appSource, /`\/tasks\/\$\{encode\(notification\.taskId\)\}`/);
  assert.match(
    appSource,
    /`\/weekly-materials\/\$\{encode\(notification\.materialId\)\}`/,
  );
  assert.match(
    appSource,
    /`\/weekly-review\/\$\{encode\(notification\.reviewId\)\}`/,
  );
  assert.match(appSource, /`\/reports\/\$\{encode\(notification\.reportId\)\}`/);
  assert.match(
    appSource,
    /`\/forum\/topic\/\$\{encode\(notification\.topicId\)\}\$\{post\}`/,
  );
  assert.match(
    appSource,
    /`\/workshops\/\$\{encode\(notification\.workshopId\)\}\$\{query\}`/,
  );
});
