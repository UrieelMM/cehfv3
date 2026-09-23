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

test("new realtime notifications play one optional sound without replaying history", async () => {
  const [appSource, soundSource, defaultsSource, firebaseSource] = await Promise.all([
    readFile(new URL("components/cehf-app.tsx", projectRoot), "utf8"),
    readFile(new URL("lib/notification-sound.ts", projectRoot), "utf8"),
    readFile(new URL("lib/portal-defaults.ts", projectRoot), "utf8"),
    readFile(new URL("lib/firebase.ts", projectRoot), "utf8"),
  ]);

  assert.match(appSource, /let knownNotificationIds: Set<string> \| null = null/);
  assert.match(appSource, /const hasNewUnread = previousNotificationIds !== null/);
  assert.match(appSource, /hasNewUnread && state\.settings\.notificationSound/);
  assert.match(appSource, /void playNotificationSound\(\)/);
  assert.match(soundSource, /const notes = \[659\.25, 783\.99, 1046\.5\]/);
  assert.match(soundSource, /context\.state !== "running"/);
  assert.match(defaultsSource, /notificationSound: true/);
  assert.match(firebaseSource, /typeof value\?\.notificationSound === "boolean"/);
});
