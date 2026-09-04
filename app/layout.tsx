import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import "./globals.css";
import "./tasks.css";
import "./workshops.css";
import "./materials.css";
import "./reviews.css";
import "./grades.css";
import "./landing.css";
import "./whatsapp-settings.css";
import "./staff-workspace.css";
import "./form-focus.css";

const themeBootstrapScript = `
  (() => {
    try {
      let theme = window.localStorage.getItem("cehf-theme");
      if (!theme) {
        const savedState = window.localStorage.getItem("cehf-demo-state");
        theme = savedState ? JSON.parse(savedState)?.settings?.theme : null;
      }
      document.documentElement.dataset.theme =
        theme === "dark" || theme === "system" ? theme : "light";
    } catch {
      document.documentElement.dataset.theme = "light";
    }
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
    "Tareas, avances, avisos y tu comunidad en un solo espacio para organizarte, aprender y seguir rompiéndola.";

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
      title: "Campus CEHF · Tu vida escolar, más fácil y más cool",
      description,
      type: "website",
      locale: "es_MX",
      url: origin,
      images: [
        {
          url: `${origin}/og-landing.png`,
          width: 1734,
          height: 907,
          alt: "Campus CEHF — Tu vida escolar, más fácil y más cool",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Campus CEHF · Tu vida escolar, más fácil y más cool",
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
