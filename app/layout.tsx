import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./grades-app.css";

const themeBootstrapScript = `
  (() => {
    try {
      const theme = window.localStorage.getItem("cehf-grades-theme");
      document.documentElement.dataset.gradeTheme =
        theme === "dark" ? "dark" : "light";
    } catch {
      document.documentElement.dataset.gradeTheme = "light";
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
    "Calificaciones semanales, avances y estadísticas académicas del CEHF.";

  return {
    title: {
      default: "CEHF Calificaciones",
      template: "%s · CEHF Calificaciones",
    },
    description,
    applicationName: "CEHF Calificaciones",
    manifest: "/manifest.webmanifest",
    openGraph: {
      title: "CEHF Calificaciones",
      description: "Resultados claros para acompañar cada aprendizaje.",
      type: "website",
      locale: "es_MX",
      url: origin,
      images: [
        {
          url: `${origin}/og-calificaciones.png`,
          width: 1734,
          height: 907,
          alt: "CEHF Calificaciones — resultados y avance semanal",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "CEHF Calificaciones",
      description: "Resultados claros para acompañar cada aprendizaje.",
      images: [`${origin}/og-calificaciones.png`],
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
