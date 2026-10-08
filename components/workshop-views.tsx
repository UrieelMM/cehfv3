"use client";

import { Check, Eye } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { friendlyFirebaseError } from "@/lib/firebase";
import { watchWorkshopViews } from "@/lib/workshops-firebase";
import type { ManagedAccount, WorkshopResource, WorkshopTask, WorkshopView } from "@/lib/types";

function openedAt(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
}

export function WorkshopViews({
  item,
  accounts,
  audienceIds,
}: {
  item: WorkshopResource | WorkshopTask;
  accounts: ManagedAccount[];
  audienceIds: string[];
}) {
  const [views, setViews] = useState<WorkshopView[]>([]);
  const [error, setError] = useState("");
  useEffect(() => watchWorkshopViews(item, setViews, (issue) => setError(friendlyFirebaseError(issue))), [item]);
  const roster = useMemo(() => {
    const accountById = new Map(accounts.map((account) => [account.uid, account]));
    const viewById = new Map(views.map((view) => [view.studentId, view]));
    return audienceIds.map((id) => ({
      id,
      name: accountById.get(id)?.name ?? viewById.get(id)?.studentName ?? "Alumno",
      initials: accountById.get(id)?.initials ?? "·",
      view: viewById.get(id),
    })).sort((first, second) => first.name.localeCompare(second.name, "es"));
  }, [accounts, audienceIds, views]);
  const viewedCount = roster.filter((student) => student.view).length;

  return (
    <section className="material-reading-panel workshop-reading-panel">
      <div><span><Eye size={16} /></span><div><strong>Registro de aperturas</strong><small>{viewedCount} de {roster.length} alumnos abrieron {"audienceStudentIds" in item ? "esta actividad" : "este recurso"}</small></div></div>
      <div className="material-reading-progress"><i style={{ width: `${roster.length ? Math.round(viewedCount / roster.length * 100) : 0}%` }} /></div>
      <div className="material-student-views">
        {roster.map((student) => (
          <span className={student.view ? "has-viewed" : ""} key={student.id}>
            <i>{student.view ? <Check size={12} /> : student.initials}</i>
            <div><strong>{student.name}</strong><small>{student.view ? `Visto ${openedAt(student.view.lastOpenedAt)}${student.view.viewCount > 1 ? ` · ${student.view.viewCount} aperturas` : ""}` : "Aún no lo abre"}</small></div>
          </span>
        ))}
        {!roster.length && <p>No hay alumnos asignados.</p>}
      </div>
      {error && <p className="material-inline-error">{error}</p>}
    </section>
  );
}
