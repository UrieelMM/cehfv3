import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);
const utilitySource = await readFile(new URL("lib/forum-rich-text.ts", projectRoot), "utf8");
const { forumRichTextToPlainText, normalizeForumRichText } = await import(
  `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(utilitySource)).toString("base64")}`
);

test("forum rich text keeps a searchable plain-text representation", () => {
  const richText = JSON.stringify([
    {
      type: "heading",
      props: { level: 2 },
      content: [
        { type: "text", text: "Una ", styles: {} },
        { type: "text", text: "idea", styles: { bold: true } },
      ],
    },
    {
      type: "bulletListItem",
      content: [{ type: "text", text: "con evidencia", styles: {} }],
      children: [{ type: "paragraph", content: "y una conclusión" }],
    },
  ]);

  assert.equal(
    forumRichTextToPlainText(richText),
    "Una idea con evidencia y una conclusión",
  );
});

test("legacy forum text is normalized into an editable BlockNote document", () => {
  const normalized = JSON.parse(normalizeForumRichText("Texto anterior"));
  assert.equal(normalized[0].type, "paragraph");
  assert.equal(normalized[0].content, "Texto anterior");
});

test("forum and report screens wire rich content and explicit report openings", async () => {
  const [forumPage, app, reports, reportsData, rules, functions] = await Promise.all([
    readFile(new URL("components/forum-page.tsx", projectRoot), "utf8"),
    readFile(new URL("components/cehf-app.tsx", projectRoot), "utf8"),
    readFile(new URL("components/academic-reports.tsx", projectRoot), "utf8"),
    readFile(new URL("lib/reports-firebase.ts", projectRoot), "utf8"),
    readFile(new URL("firestore.rules", projectRoot), "utf8"),
    readFile(new URL("functions/src/index.ts", projectRoot), "utf8"),
  ]);

  assert.match(forumPage, /<ForumRichText/);
  assert.match(forumPage, /bodyRich: replyRich/);
  assert.match(app, /promptRich/);
  assert.match(functions, /forumRichText\(input\.bodyRich/);
  assert.match(functions, /forumRichText\(input\.promptRich/);

  assert.match(reports, /Abrir reporte/);
  assert.match(reports, /recordStudentOpening\(report\)/);
  assert.match(reportsData, /markStudentWeeklyReportViewed/);
  assert.match(reportsData, /watchStudentWeeklyReportViews/);
  assert.match(rules, /match \/studentWeeklyReportViews\/\{reportId\}/);
  assert.match(rules, /request\.resource\.data\.viewCount == resource\.data\.viewCount \+ 1/);
});
