import { z } from "zod";

export const muralCategories = [
  "Ciencia y curiosidades",
  "Comunidad",
  "Lecturas",
  "Arte y creatividad",
  "Deportes",
  "Medio ambiente",
  "Historia",
  "Vida escolar",
  "Salud y bienestar",
  "Música",
  "Proyectos",
  "Opinión",
  "Entrevistas",
] as const;

export const muralLimits = {
  title: 120,
  section: 60,
  lead: 180,
  body: 8_000,
  quote: 240,
  reviewNote: 500,
} as const;

export const muralSubmissionSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(8, "Escribe un título de al menos 8 caracteres.")
      .max(muralLimits.title, `El título puede tener hasta ${muralLimits.title} caracteres.`),
    category: z.enum(muralCategories),
    section: z
      .string()
      .trim()
      .min(3, "Indica una sección de al menos 3 caracteres.")
      .max(muralLimits.section, `La sección puede tener hasta ${muralLimits.section} caracteres.`),
    lead: z
      .string()
      .trim()
      .min(20, "La entrada necesita al menos 20 caracteres.")
      .max(muralLimits.lead, `La entrada puede tener hasta ${muralLimits.lead} caracteres.`),
    body: z
      .string()
      .trim()
      .min(180, "La historia necesita al menos 180 caracteres.")
      .max(muralLimits.body, `La historia puede tener hasta ${muralLimits.body.toLocaleString("es-MX")} caracteres.`),
    quote: z
      .string()
      .trim()
      .min(10, "La frase destacada necesita al menos 10 caracteres.")
      .max(muralLimits.quote, `La frase destacada puede tener hasta ${muralLimits.quote} caracteres.`),
    authorshipConfirmed: z
      .boolean()
      .refine((value) => value, "Confirma que la historia es tuya y puede compartirse en CEHF."),
  })
  .superRefine((input, context) => {
    const paragraphs = input.body
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);
    if (paragraphs.length < 2) {
      context.addIssue({
        code: "custom",
        path: ["body"],
        message: "Separa la historia en al menos dos párrafos con una línea en blanco.",
      });
    }
  });

export type MuralSubmissionInput = z.infer<typeof muralSubmissionSchema>;
