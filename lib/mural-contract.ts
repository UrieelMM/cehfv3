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

export const muralCoverLayouts = ["split", "editorial", "immersive"] as const;
export const muralCoverFonts = ["modern", "editorial", "classic"] as const;
export const muralCoverGradients = ["campus", "aurora", "coral", "cobalt"] as const;
export const muralGalleryLayouts = ["focus", "split", "cinematic"] as const;
export const muralCoverMotifs = [
  "orbits",
  "grid",
  "confetti",
  "waves",
  "rays",
  "frames",
  "dots",
  "ribbons",
  "stars",
  "geometry",
  "arches",
  "checkerboard",
  "sprinkles",
  "bubbles",
  "crosses",
  "leaves",
  "pixels",
  "halftone",
  "corners",
  "spiral",
] as const;

export const muralCoverLimits = {
  kicker: 48,
  title: 90,
  description: 240,
  badge: 32,
  ctaLabel: 32,
  seasonName: 50,
} as const;

export const muralGalleryLimits = {
  slides: 10,
  kicker: 42,
  title: 84,
  caption: 220,
  contentKicker: 42,
  contentTitle: 90,
  contentSubtitle: 180,
  body: 1_600,
} as const;

const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, "Selecciona un color válido.");

export const muralEditionSchema = z.object({
  id: z.string().max(180).optional(),
  periodType: z.enum(["month", "season"]),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Selecciona el mes de la edición."),
  seasonName: z.string().trim().max(muralCoverLimits.seasonName),
  group: z.string().trim().min(2, "Selecciona el grupo responsable.").max(40),
  teacherId: z.string().trim().min(1, "Selecciona la maestra responsable.").max(128),
  teacherName: z.string().trim().min(2).max(120),
  cover: z.object({
    kicker: z.string().trim().min(2, "Escribe el antetítulo de la portada.").max(muralCoverLimits.kicker),
    title: z.string().trim().min(4, "Escribe el título de la portada.").max(muralCoverLimits.title),
    description: z.string().trim().min(12, "Agrega una breve presentación de la edición.").max(muralCoverLimits.description),
    badge: z.string().trim().max(muralCoverLimits.badge),
    ctaLabel: z.string().trim().min(2).max(muralCoverLimits.ctaLabel),
    backgroundColor: hexColor,
    accentColor: hexColor,
    textColor: hexColor,
    gradientPreset: z.enum(muralCoverGradients),
    useTitleGradient: z.boolean(),
    useBackgroundGradient: z.boolean(),
    layout: z.enum(muralCoverLayouts),
    font: z.enum(muralCoverFonts),
    motif: z.enum(muralCoverMotifs),
    showBadge: z.boolean(),
    showManager: z.boolean(),
    imagePath: z.string().max(500),
    imagePositionX: z.number().min(0).max(100),
    imagePositionY: z.number().min(0).max(100),
    overlayOpacity: z.number().min(0).max(85),
  }),
  gallerySlides: z.array(z.object({
    id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/, "La diapositiva no es válida."),
    kicker: z.string().trim().max(muralGalleryLimits.kicker),
    title: z.string().trim().min(2, "Agrega un título a cada diapositiva.").max(muralGalleryLimits.title),
    caption: z.string().trim().max(muralGalleryLimits.caption),
    contentKicker: z.string().trim().max(muralGalleryLimits.contentKicker),
    contentTitle: z.string().trim().max(muralGalleryLimits.contentTitle),
    contentSubtitle: z.string().trim().max(muralGalleryLimits.contentSubtitle),
    body: z.string().trim().max(muralGalleryLimits.body),
    imagePath: z.string().max(500),
    accentColor: hexColor,
    layout: z.enum(muralGalleryLayouts),
    depth: z.number().int().min(1).max(3),
    imagePositionX: z.number().min(0).max(100),
    imagePositionY: z.number().min(0).max(100),
  })).min(1, "Agrega al menos una diapositiva a la galería.").max(muralGalleryLimits.slides),
}).superRefine((input, context) => {
  if (input.periodType === "season" && input.seasonName.trim().length < 3) {
    context.addIssue({
      code: "custom",
      path: ["seasonName"],
      message: "Escribe el nombre de la temporada.",
    });
  }
});

export type MuralEditionInput = z.infer<typeof muralEditionSchema>;

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
