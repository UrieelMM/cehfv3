"use client";

import { httpsCallable } from "firebase/functions";
import { firebase } from "./firebase";

export type DemoSeedCounts = {
  students: number;
  teachers: number;
  weeks: number;
  nonWorkingDays: number;
  dailyGrades: number;
  weeklyReports: number;
  tasks: number;
  materials: number;
  reviews: number;
  wallPosts: number;
  forumTopics: number;
  forumPosts: number;
  workshopResources: number;
  workshopTasks: number;
  notifications: number;
  guardianContacts: number;
  whatsappHistory: number;
};

export async function loadInstitutionDemoData() {
  if (!firebase.functions) {
    throw new Error("Firebase Functions no está configurado para esta carga.");
  }
  const callable = httpsCallable<
    { confirmation: string },
    { ok: true; seedTag: string; counts: DemoSeedCounts }
  >(firebase.functions, "seedInstitutionDemoData");
  const result = await callable({ confirmation: "CARGAR DEMO" });
  return result.data;
}

export async function clearInstitutionDemoData() {
  if (!firebase.functions) {
    throw new Error("Firebase Functions no está configurado para esta limpieza.");
  }
  const callable = httpsCallable<
    { confirmation: string },
    { ok: true; seedTag: string; deleted: number; alreadyClean: boolean }
  >(firebase.functions, "clearInstitutionDemoData");
  const result = await callable({ confirmation: "ELIMINAR DEMO" });
  return result.data;
}
