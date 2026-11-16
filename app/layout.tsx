import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import {
  christmasPortalThemes,
  christmasSeason,
  defaultPortalTheme,
  portalChristmasThemeStorageKey,
  portalThemes,
  portalThemeStorageKey,
} from "@/lib/portal-theme";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import "./globals.css";
import "./tasks.css";
import "./workshops.css";
import "./task-creation.css";
import "./materials.css";
import "./reviews.css";
import "./grades.css";
import "./landing.css";
import "./whatsapp-settings.css";
import "./staff-workspace.css";
import "./form-focus.css";
import "./profile.css";
import "./dashboard-home.css";
import "./portal-theme.css";
import "./christmas.css";

const themeBootstrapScript = `
  (() => {
    let theme = ${JSON.stringify(defaultPortalTheme)};
    let christmasTheme;
    const christmasThemes = ${JSON.stringify(christmasPortalThemes)};
    try {
      const saved = window.localStorage.getItem(${JSON.stringify(portalThemeStorageKey)});
      if (${JSON.stringify(portalThemes)}.includes(saved)) theme = saved;
      const savedChristmas = window.localStorage.getItem(${JSON.stringify(portalChristmasThemeStorageKey)});
      if (christmasThemes.includes(savedChristmas)) christmasTheme = savedChristmas;
    } catch {}
    const season = ${JSON.stringify(christmasSeason)};
    const day = new Intl.DateTimeFormat("en-US", {
      timeZone: season.timeZone, month: "2-digit", day: "2-digit",
    }).format(new Date());
    if (day >= season.start || day <= season.end) {
      const prefersDark = theme === "dark" ||
        (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      theme = christmasTheme ?? (christmasThemes.includes(theme) ? theme : (prefersDark ? "christmas-dark" : "christmas"));
    } else if (christmasThemes.includes(theme)) {
      theme = theme === "christmas-dark" ? "dark" : "light";
    }
    document.documentElement.dataset.theme = theme;
  })();
`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const description =
    "Tareas, avances, avisos y tu comunidad en un solo espacio para organizarte, aprender y seguir avanzando.";

  return {
    title: {
      default: "Campus CEHF",
      template: "%s · Campus CEHF",
    },
    description,
    applicationName: "Campus CEHF",
    manifest: "/manifest.webmanifest",
    icons: {
      icon: [
        { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      ],
      apple: [
        { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      ],
    },
    openGraph: {
      title: "Campus CEHF · Tu vida escolar, más fácil y organizada",
      description,
      type: "website",
      locale: "es_MX",
      url: origin,
      images: [
        {
          url: `${origin}/og-landing.png`,
          width: 1734,
          height: 907,
          alt: "Campus CEHF — Tu vida escolar, más fácil y organizada",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Campus CEHF · Tu vida escolar, más fácil y organizada",
      description,
      images: [`${origin}/og-landing.png`],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-MX" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
