import { GradesApp } from "@/components/grades-app";
import { redirect } from "next/navigation";

export default async function PortalSection({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (section !== "calificaciones") redirect("/calificaciones");
  return <GradesApp />;
}
