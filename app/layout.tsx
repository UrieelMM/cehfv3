import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

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
    "Semana académica, tareas, repasos, materiales, avances y comunidad escolar en un solo lugar.";

  return {
    title: {
      default: "CEHF Primaria",
      template: "%s · CEHF Primaria",
    },
    description,
    applicationName: "CEHF Primaria",
    manifest: "/manifest.webmanifest",
    openGraph: {
      title: "CEHF Primaria",
      description: "Una semana clara para aprender mejor.",
      type: "website",
      locale: "es_MX",
      url: origin,
      images: [
        {
          url: `${origin}/og.png`,
          width: 1746,
          height: 909,
          alt: "CEHF Primaria — Una semana clara para aprender mejor",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "CEHF Primaria",
      description: "Una semana clara para aprender mejor.",
      images: [`${origin}/og.png`],
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
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
