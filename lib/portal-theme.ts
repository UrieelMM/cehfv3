export const regularPortalThemes = ["light", "dark", "system"] as const;
export const christmasPortalThemes = ["christmas", "christmas-dark"] as const;
export const portalThemes = [...regularPortalThemes, ...christmasPortalThemes] as const;

export type PortalTheme = (typeof portalThemes)[number];
export type ChristmasPortalTheme = (typeof christmasPortalThemes)[number];

export const defaultPortalTheme: PortalTheme = "light";
export const portalThemeStorageKey = "cehf-theme";
export const portalChristmasThemeStorageKey = "cehf-christmas-theme";

export const christmasSeason = {
  timeZone: "America/Mexico_City",
  start: "11/15",
  end: "01/06",
} as const;

const christmasCalendar = new Intl.DateTimeFormat("en-US", {
  timeZone: christmasSeason.timeZone,
  month: "2-digit",
  day: "2-digit",
});

export function isChristmasSeason(date = new Date()): boolean {
  const day = christmasCalendar.format(date);
  return day >= christmasSeason.start || day <= christmasSeason.end;
}

export function isPortalTheme(value: unknown): value is PortalTheme {
  return portalThemes.some((theme) => theme === value);
}

export function isChristmasTheme(theme: unknown): theme is ChristmasPortalTheme {
  return theme === "christmas" || theme === "christmas-dark";
}

export function resolvePortalTheme(
  theme: PortalTheme,
  christmasTheme: ChristmasPortalTheme | undefined,
  inSeason: boolean,
  systemPrefersDark: boolean,
): PortalTheme {
  if (!inSeason) return isChristmasTheme(theme) ? portalThemeColorScheme(theme) : theme;
  if (christmasTheme) return christmasTheme;
  if (isChristmasTheme(theme)) return theme;
  return theme === "dark" || (theme === "system" && systemPrefersDark)
    ? "christmas-dark"
    : "christmas";
}

export function portalThemeColorScheme(theme: string | undefined): "light" | "dark" | "system" {
  if (theme === "system") return "system";
  return theme === "dark" || theme === "christmas-dark" ? "dark" : "light";
}
