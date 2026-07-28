export type Role = "director" | "teacher" | "student";

export type UserProfile = {
  uid: string;
  name: string;
  email: string;
  role: Role;
  grade?: string;
  group?: string;
  subjects?: string[];
  initials: string;
};

export type WeekPlan = {
  id: string;
  label: string;
  range: string;
  status: "draft" | "scheduled" | "active" | "closed";
  title: string;
  welcomeMessage: string;
  objectives: string[];
  completion: number;
};

export type Review = {
  id: string;
  title: string;
  subject: string;
  purpose: string;
  duration: number;
  questions: number;
  progress: number;
  attempts: number;
  status: "draft" | "published" | "completed" | "needs_review";
};

export type Task = {
  id: string;
  title: string;
  subject: string;
  description: string;
  dueLabel: string;
  dueAt: string;
  status: "draft" | "published" | "submitted" | "under_review" | "reviewed";
  type: "Actividad" | "Lectura" | "Entrega" | "Proyecto";
  objective: string;
};

export type Material = {
  id: string;
  title: string;
  subject: string;
  description: string;
  type: "PDF" | "Video" | "Enlace" | "Ficha" | "Audio";
  day: string;
  required: boolean;
  reviewed: boolean;
};

export type ProgressLevel =
  | "achieved"
  | "in_progress"
  | "needs_support"
  | "not_observed";

export type ProgressCriterion = {
  id: string;
  label: string;
  detail: string;
  weight: number;
  level: ProgressLevel;
};

export type WeeklyReport = {
  id: string;
  week: string;
  status: "draft" | "published";
  summary: string;
  achievement: string;
  support: string;
  nextStep: string;
  teacher: string;
  publishedAt?: string;
  version: number;
};

export type WallPost = {
  id: string;
  title: string;
  excerpt: string;
  category: string;
  author: string;
  group: string;
  publishedAt: string;
  accent: "violet" | "coral" | "mint" | "gold";
  status: "draft" | "submitted" | "published";
  favorite: boolean;
};

export type ForumReactionKind = "helpful" | "interesting" | "celebrate";

export type ForumAttachment = {
  id: string;
  name: string;
  type: "image" | "document" | "link";
  sizeLabel?: string;
};

export type ForumReply = {
  id: string;
  author: string;
  initials: string;
  body: string;
  createdAt: string;
  teacher?: boolean;
  parentId?: string;
  attachment?: ForumAttachment;
  reactions?: Partial<Record<ForumReactionKind, number>>;
  reactedByMe?: ForumReactionKind[];
  status?: "visible" | "hidden";
  reports?: number;
  markedAnswer?: boolean;
  edited?: boolean;
};

export type ForumTopicKind =
  | "weekly_question"
  | "subject"
  | "reading_club"
  | "task_help"
  | "group_chat"
  | "wall"
  | "announcement";

export type ForumTopic = {
  id: string;
  forumId: string;
  forumName: string;
  title: string;
  prompt: string;
  kind: ForumTopicKind;
  subject: string;
  group: string;
  responsible: string;
  participants: string[];
  opensAt?: string;
  closesAt: string;
  status: "open" | "scheduled" | "closed" | "archived";
  allowReplies: boolean;
  allowAttachments: boolean;
  pinned?: boolean;
  unreadCount?: number;
  lastActivity: string;
  replies: ForumReply[];
};

export type ForumModerationCase = {
  id: string;
  topicId: string;
  replyId: string;
  author: string;
  excerpt: string;
  reason: string;
  reportedAt: string;
  status: "open" | "hidden" | "dismissed" | "restored";
  resolvedBy?: string;
};

export type AppNotification = {
  id: string;
  title: string;
  detail: string;
  category:
    | "task"
    | "review"
    | "progress"
    | "report"
    | "material"
    | "wall"
    | "forum"
    | "system";
  createdAt: string;
  read: boolean;
};

export type PortalSettings = {
  theme: "light" | "dark" | "system";
  reducedMotion: boolean;
  whatsappEnabled: boolean;
  quietHours: string;
};

export type PortalState = {
  week: WeekPlan;
  reviews: Review[];
  tasks: Task[];
  materials: Material[];
  progress: ProgressCriterion[];
  reports: WeeklyReport[];
  wallPosts: WallPost[];
  forumTopics: ForumTopic[];
  forumModeration: ForumModerationCase[];
  notifications: AppNotification[];
  settings: PortalSettings;
  updatedAt?: string;
};

export type SectionKey =
  | "dashboard"
  | "my-week"
  | "weekly-review"
  | "tasks"
  | "weekly-progress"
  | "reports"
  | "weekly-materials"
  | "wall-newspaper"
  | "forum"
  | "users"
  | "settings"
  | "profile";
