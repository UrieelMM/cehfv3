import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./tasks.css";
import "./workshops.css";

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
    "Tu experiencia académica, comunidad y progreso en un solo lugar.";

  return {
    title: {
      default: "Campus CEHF",
      template: "%s · Campus CEHF",
    },
    description,
    applicationName: "Campus CEHF",
    manifest: "/manifest.webmanifest",
    openGraph: {
      title: "Campus CEHF",
      description: "Una semana clara para aprender mejor.",
      type: "website",
      locale: "es_MX",
      url: origin,
      images: [
        {
          url: `${origin}/og-campus.png`,
          width: 1739,
          height: 904,
          alt: "Campus CEHF — Una semana clara para aprender mejor",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Campus CEHF",
      description: "Una semana clara para aprender mejor.",
      images: [`${origin}/og-campus.png`],
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
