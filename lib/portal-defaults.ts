import type { PortalState, Role, UserProfile } from "./types";

export const pendingProfile: UserProfile = {
  uid: "",
  institutionId: "",
  name: "",
  email: "",
  role: "student",
  initials: "",
};

export const createInitialPortalState = (): PortalState => ({
  week: {
    id: "",
    label: "Sin semana activa",
    range: "",
    status: "draft",
    title: "Configura la semana académica",
    welcomeMessage: "",
    objectives: [],
    completion: 0,
  },
  weeklyVerse: {
    text: "",
    reference: "",
    updatedBy: "",
    updatedAt: "",
  },
  reviews: [],
  tasks: [],
  materials: [],
  progress: [],
  reports: [],
  wallPosts: [],
  forumTopics: [],
  forumModeration: [],
  forumBans: [],
  notifications: [],
  settings: {
    theme: "light",
    reducedMotion: false,
    notificationSound: true,
    whatsappEnabled: true,
    quietHours: "20:00–07:00",
  },
});

export const roleLabel: Record<Role, string> = {
  student: "Estudiante",
  teacher: "Docente",
  director: "Dirección",
};
