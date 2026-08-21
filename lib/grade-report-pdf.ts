import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import type { Role, WeeklyGradeRecord } from "@/lib/types";

const BRAND_BLUE: [number, number, number] = [31, 41, 133];
const BRAND_SKY: [number, number, number] = [232, 239, 255];
const INK: [number, number, number] = [25, 39, 68];
const MUTED: [number, number, number] = [92, 105, 128];
const BORDER: [number, number, number] = [219, 226, 238];
const TOTAL_PAGES = "{total_pages_count_string}";

export type GradeReportInput = {
  role: Role;
  generatedBy: string;
  records: WeeklyGradeRecord[];
  weekLabel: string;
  weekRange?: string;
  termLabel?: string;
  schoolYearLabel: string;
  filters?: string[];
  institutionName?: string;
  directorName?: string;
  guardianName?: string;
};

function score(value: number) {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}

function reportTitle(role: Role) {
  if (role === "director") return "Reporte institucional de calificaciones";
  if (role === "teacher") return "Reporte docente de calificaciones";
  return "Boleta semanal de calificaciones";
}

function reportFileName(input: GradeReportInput) {
  const subject = input.role === "student"
    ? input.records[0]?.studentName ?? "alumno"
    : input.weekLabel;
  const safe = subject
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `calificaciones-${safe || "reporte"}.pdf`;
}

function recordGroup(record: WeeklyGradeRecord) {
  return [record.studentGrade, record.studentGroup].filter(Boolean).join(" ") || "Sin grupo";
}

function formattedDate() {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date());
}

function uniqueCount(records: WeeklyGradeRecord[], field: "studentId" | "teacherId" | "subject") {
  return new Set(records.map((record) => record[field])).size;
}

function average(records: WeeklyGradeRecord[]) {
  if (!records.length) return 0;
  return records.reduce((sum, record) => sum + record.weightedScore, 0) / records.length;
}

function addHeader(doc: jsPDF, input: GradeReportInput, pageWidth: number) {
  doc.setFillColor(...BRAND_BLUE);
  doc.rect(0, 0, pageWidth, 31, "F");
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(14, 9, 16, 13, 3, 3, "F");
  doc.setTextColor(...BRAND_BLUE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text("CEHF", 22, 17.5, { align: "center" });
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13.5);
  doc.text(input.institutionName ?? "Campus CEHF", 35, 13.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text(reportTitle(input.role), 35, 19.2);
  doc.text(`${input.weekLabel}${input.weekRange ? ` · ${input.weekRange}` : ""}`, pageWidth - 14, 14, {
    align: "right",
  });
  doc.text(input.schoolYearLabel, pageWidth - 14, 20, { align: "right" });
}

function addFooter(doc: jsPDF, input: GradeReportInput, pageWidth: number, pageHeight: number) {
  const page = doc.getCurrentPageInfo().pageNumber;
  doc.setDrawColor(...BORDER);
  doc.line(14, pageHeight - 13, pageWidth - 14, pageHeight - 13);
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.8);
  doc.text(`${input.institutionName ?? "Campus CEHF"} · ${input.weekLabel} · Documento generado el ${formattedDate()}`, 14, pageHeight - 7.5);
  doc.text(`Página ${page} de ${TOTAL_PAGES}`, pageWidth - 14, pageHeight - 7.5, { align: "right" });
}

function addReportContext(doc: jsPDF, input: GradeReportInput, pageWidth: number) {
  const studentNames = Array.from(new Set(input.records.map((record) => record.studentName)));
  const teacherNames = Array.from(new Set(input.records.map((record) => record.teacherName)));
  const identity = input.role === "student" && studentNames.length === 1
    ? `Alumno: ${studentNames[0]}`
    : input.role === "teacher" && teacherNames.length === 1
      ? `Maestro: ${teacherNames[0]}`
      : input.role === "director" && input.directorName
        ? `Dirección: ${input.directorName}`
        : undefined;
  const items = [
    input.termLabel,
    `Ciclo ${input.schoolYearLabel}`,
    identity,
    ...(input.filters ?? []),
  ].filter(Boolean) as string[];
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(reportTitle(input.role), 14, 42);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  doc.setFontSize(7.8);
  doc.text(`Generado por ${input.generatedBy} · ${formattedDate()}`, 14, 48.5);
  const context = items.join(" · ");
  doc.text(context || "Sin filtros adicionales", 14, 54.5, { maxWidth: pageWidth - 28 });
}

function addMetrics(doc: jsPDF, input: GradeReportInput, pageWidth: number) {
  const records = input.records;
  const metrics = input.role === "student"
    ? [
        ["Promedio", records.length ? score(average(records)) : "—"],
        ["Materias", String(uniqueCount(records, "subject"))],
        ["Mejor resultado", records.length ? score(Math.max(...records.map((record) => record.weightedScore))) : "—"],
        ["Semana", input.weekLabel],
      ]
    : [
        ["Promedio general", records.length ? score(average(records)) : "—"],
        ["Alumnos", String(uniqueCount(records, "studentId"))],
        ["Materias", String(uniqueCount(records, "subject"))],
        [input.role === "director" ? "Docentes" : "Registros", input.role === "director"
          ? String(uniqueCount(records, "teacherId"))
          : String(records.length)],
      ];
  const gap = 3;
  const cardWidth = (pageWidth - 28 - gap * 3) / 4;
  metrics.forEach(([label, value], index) => {
    const x = 14 + index * (cardWidth + gap);
    doc.setFillColor(...BRAND_SKY);
    doc.roundedRect(x, 60, cardWidth, 18, 2.3, 2.3, "F");
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.4);
    doc.text(label, x + 3.5, 66);
    doc.setTextColor(...BRAND_BLUE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.text(value, x + 3.5, 73.2, { maxWidth: cardWidth - 7 });
  });
}

function addSignatures(doc: jsPDF, input: GradeReportInput, pageWidth: number, startY: number) {
  const teacherNames = Array.from(new Set(input.records.map((record) => record.teacherName)));
  const directorName = input.directorName ?? (input.role === "director" ? input.generatedBy : undefined);
  const signatures = [
    { label: "Padre, madre o tutor", name: input.guardianName },
    {
      label: teacherNames.length === 1 ? "Docente responsable" : "Docentes responsables",
      name: teacherNames.length === 1
        ? teacherNames[0]
        : teacherNames.length
          ? `${teacherNames.length} docentes incluidos`
          : undefined,
    },
    { label: "Vo. Bo. Dirección", name: directorName },
  ];
  const gap = 11;
  const width = (pageWidth - 28 - gap * 2) / 3;
  signatures.forEach((signature, index) => {
    const x = 14 + index * (width + gap);
    doc.setDrawColor(146, 157, 176);
    doc.line(x, startY, x + width, startY);
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text(signature.label, x + width / 2, startY + 5, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    doc.setFontSize(6.3);
    doc.text(signature.name ?? "Nombre y firma", x + width / 2, startY + 9, {
      align: "center",
      maxWidth: width,
    });
  });
}

export function buildGradeReportPdf(input: GradeReportInput) {
  const staff = input.role !== "student";
  const doc = new jsPDF({
    orientation: staff ? "landscape" : "portrait",
    unit: "mm",
    format: "a4",
  });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const sortedRecords = [...input.records].sort((first, second) => (
    recordGroup(first).localeCompare(recordGroup(second), "es") ||
    first.studentName.localeCompare(second.studentName, "es") ||
    first.subject.localeCompare(second.subject, "es")
  ));

  addReportContext(doc, input, pageWidth);
  addMetrics(doc, input, pageWidth);

  const studentHead = [["Materia", "Maestro", "Clase", "Tareas", "Particip.", "Asist.", "Evaluación", "Final"]];
  const staffHead = [[
    "Alumno", "Grupo", "Materia", ...(input.role === "director" ? ["Maestro"] : []),
    "Clase", "Tareas", "Particip.", "Asist.", "Evaluación", "Final",
  ]];
  const body = sortedRecords.map((record) => (
    input.role === "student"
      ? [
          record.subject,
          record.teacherName,
          score(record.scores.classWork),
          score(record.scores.homework),
          score(record.scores.participation),
          score(record.scores.attendance),
          score(record.scores.exam),
          score(record.weightedScore),
        ]
      : [
          record.studentName,
          recordGroup(record),
          record.subject,
          ...(input.role === "director" ? [record.teacherName] : []),
          score(record.scores.classWork),
          score(record.scores.homework),
          score(record.scores.participation),
          score(record.scores.attendance),
          score(record.scores.exam),
          score(record.weightedScore),
        ]
  ));

  autoTable(doc, {
    startY: 84,
    margin: { top: 40, right: 14, bottom: 20, left: 14 },
    head: input.role === "student" ? studentHead : staffHead,
    body,
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: staff ? 6.4 : 6.8,
      cellPadding: staff ? 2.1 : 2.3,
      lineColor: BORDER,
      lineWidth: 0.18,
      textColor: INK,
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fillColor: BRAND_BLUE,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      minCellHeight: 8,
    },
    alternateRowStyles: { fillColor: [247, 249, 253] },
    columnStyles: input.role === "student"
      ? {
          0: { cellWidth: 27 },
          1: { cellWidth: 33 },
          7: { fontStyle: "bold", textColor: BRAND_BLUE },
        }
      : {
          0: { cellWidth: 36 },
          1: { cellWidth: 18 },
          2: { cellWidth: 27 },
          [input.role === "director" ? 3 : 9]: input.role === "director"
            ? { cellWidth: 33 }
            : { fontStyle: "bold", textColor: BRAND_BLUE },
          [input.role === "director" ? 9 : 8]: { fontStyle: "bold", textColor: BRAND_BLUE },
        },
  });

  const tableDoc = doc as jsPDF & { lastAutoTable?: { finalY: number } };
  let signatureY = (tableDoc.lastAutoTable?.finalY ?? 84) + 24;
  if (signatureY > pageHeight - 34) {
    doc.addPage();
    signatureY = 72;
  }
  addSignatures(doc, input, pageWidth, signatureY);
  for (let page = 1; page <= doc.getNumberOfPages(); page += 1) {
    doc.setPage(page);
    addHeader(doc, input, pageWidth);
    addFooter(doc, input, pageWidth, pageHeight);
  }
  if (typeof doc.putTotalPages === "function") doc.putTotalPages(TOTAL_PAGES);
  return doc;
}

export function downloadGradeReportPdf(input: GradeReportInput) {
  const doc = buildGradeReportPdf(input);
  doc.save(reportFileName(input));
}
