export type Role = "director" | "teacher" | "student";
export type SchoolLevel = "primary" | "secondary";

export type UserProfile = {
  uid: string;
  institutionId: string;
  name: string;
  email: string;
  role: Role;
  schoolLevel?: SchoolLevel;
  grade?: string;
  group?: string;
  subjects?: string[];
  initials: string;
};

export type ManagedAccount = {
  uid: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  role: "student" | "teacher";
  initials: string;
  active: boolean;
  schoolLevel?: SchoolLevel;
  grade?: string;
  group?: string;
  subjects: string[];
  teacherIds: string[];
  photoURL?: string;
  createdAt: string;
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

export type WeeklyVerse = {
  text: string;
  reference: string;
  updatedBy: string;
  updatedAt: string;
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

export type AcademicConfig = {
  institutionId: string;
  schoolYearId: string;
  schoolYearLabel: string;
  termId: string;
  termLabel: string;
  weekId: string;
  weekLabel: string;
  timezone: string;
  calendarStatus: "active" | "gap" | "unconfigured";
  weekStartDate?: string;
  weekEndDate?: string;
  nextWeekLabel?: string;
  nextWeekStartDate?: string;
};

export type AcademicWeek = {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  startAt: string;
  endAt: string;
  order: number;
  active: boolean;
};

export type AcademicTerm = {
  id: string;
  label: string;
  weekIds: string[];
  startDate: string;
  endDate: string;
  order: number;
  active: boolean;
};

export type AcademicCalendar = {
  schoolYearId: string;
  weeks: AcademicWeek[];
  terms: AcademicTerm[];
  configured: boolean;
};

export type AcademicCalendarInput = {
  schoolYearId: string;
  schoolYearLabel: string;
  timezone: string;
  weeks: Array<Pick<AcademicWeek, "id" | "label" | "startDate" | "endDate">>;
  terms: Array<Pick<AcademicTerm, "id" | "label" | "weekIds">>;
};

export type TaskPublicationStatus =
  | "draft"
  | "scheduled"
  | "published"
  | "closed"
  | "archived";

export type TaskLink = {
  id: string;
  label: string;
  url: string;
};

export type TaskAttachment = {
  id: string;
  name: string;
  storagePath: string;
  contentType: string;
  size: number;
};

export type TaskAssignment = {
  id: string;
  firestorePath: string;
  institutionId: string;
  schoolYearId: string;
  schoolYearLabel: string;
  termId: string;
  termLabel: string;
  weekId: string;
  weekLabel: string;
  subjectId: string;
  subject: string;
  title: string;
  description: string;
  dueAt: string;
  publishAt?: string;
  publishedAt?: string;
  closedAt?: string;
  status: TaskPublicationStatus;
  publicationMode: "draft" | "now" | "scheduled";
  targetGroup: string;
  links: TaskLink[];
  attachments: TaskAttachment[];
  createdBy: string;
  teacherName: string;
  createdAt: string;
  updatedAt: string;
};

export type TaskSubmissionStatus =
  | "draft"
  | "submitted"
  | "feedback"
  | "reviewed";

export type TaskSubmission = {
  id: string;
  studentId: string;
  studentName: string;
  teacherId: string;
  taskId: string;
  content: string;
  attachments: TaskAttachment[];
  status: TaskSubmissionStatus;
  version: number;
  submittedAt?: string;
  updatedAt: string;
  teacherFeedback?: string;
  feedbackAt?: string;
  reviewedAt?: string;
};

export type TaskHistoryEventType =
  | "created"
  | "published"
  | "scheduled"
  | "closed"
  | "reopened"
  | "group_extension"
  | "individual_extension"
  | "submitted"
  | "resubmitted"
  | "feedback"
  | "reviewed";

export type TaskHistoryEvent = {
  id: string;
  type: TaskHistoryEventType;
  authorId: string;
  authorName: string;
  authorRole: Role;
  message: string;
  createdAt: string;
  version?: number;
  attachments?: TaskAttachment[];
  studentId?: string;
  studentName?: string;
  dueAt?: string;
};

export type TaskExtension = {
  studentId: string;
  studentName: string;
  dueAt: string;
  grantedBy: string;
  grantedByName: string;
  createdAt: string;
};

export type TaskCreateInput = {
  title: string;
  description: string;
  subject: string;
  subjectId: string;
  weekId: string;
  weekLabel: string;
  dueAt: string;
  targetGroup: string;
  links: Array<{ label: string; url: string }>;
  files: File[];
  publicationMode: "draft" | "now" | "scheduled";
  publishAt?: string;
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
  status: "draft" | "submitted" | "changes_requested" | "published" | "archived";
  favorite: boolean;
  section?: string;
  lead?: string;
  paragraphs?: string[];
  quote?: string;
  readingTime?: string;
  institutionId?: string;
  authorId?: string;
  version?: number;
  reviewNote?: string;
  reviewedById?: string;
  reviewedByName?: string;
  reviewedByRole?: "director" | "teacher";
  reviewedAt?: string;
  approvedById?: string;
  approvedByName?: string;
  approvedByRole?: "director" | "teacher";
  approvedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  submittedAt?: string;
};

export type ForumReactionKind = "helpful" | "interesting" | "celebrate";

export type ForumAttachment = {
  id: string;
  name: string;
  type: "image" | "document" | "link";
  sizeLabel?: string;
  storagePath?: string;
  contentType?: string;
  size?: number;
};

export type ForumParticipant = {
  uid: string;
  name: string;
  initials: string;
};

export type ForumReply = {
  id: string;
  authorId?: string;
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
  reportedByMe?: boolean;
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
  creatorId?: string;
  creatorRole?: "director" | "teacher";
  forumId: string;
  forumName: string;
  title: string;
  prompt: string;
  kind: ForumTopicKind;
  subject: string;
  group: string;
  responsible: string;
  participants: string[];
  participantProfiles?: ForumParticipant[];
  opensAt?: string;
  closesAt: string;
  status: "open" | "scheduled" | "closed" | "archived";
  allowReplies: boolean;
  allowAttachments: boolean;
  pinned?: boolean;
  unreadCount?: number;
  lastActivity: string;
  lastActivityAt?: string;
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
  resolvedAt?: string;
  originalBody?: string;
  reportCount?: number;
};

export type ForumBan = {
  userId: string;
  userName: string;
  active: boolean;
  reason: string;
  bannedBy: string;
  bannedAt: string;
  restoredBy?: string;
  restoredAt?: string;
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
    | "workshop"
    | "system";
  createdAt: string;
  read: boolean;
};

export type WorkshopKind = "tics" | "reading";

export type WorkshopResource = {
  id: string;
  workshopId: string;
  institutionId: string;
  title: string;
  description: string;
  fileName: string;
  storagePath: string;
  contentType: string;
  size: number;
  uploadedBy: string;
  uploadedByName: string;
  createdAt: string;
};

export type Workshop = {
  id: string;
  institutionId: string;
  kind: WorkshopKind;
  title: string;
  shortTitle: string;
  description: string;
  studentIds: string[];
  teacherIds: string[];
  managerIds: string[];
  teacherStudentIds: Record<string, string[]>;
  memberIds: string[];
  resources: WorkshopResource[];
  updatedAt: string;
};

export type WorkshopAccessInput = {
  studentIds: string[];
  teacherIds: string[];
  managerIds: string[];
  teacherStudentIds: Record<string, string[]>;
};

export type WorkshopTaskStatus = "draft" | "published" | "closed";

export type WorkshopTaskAttachment = {
  id: string;
  name: string;
  storagePath: string;
  contentType: string;
  size: number;
};

export type WorkshopTask = {
  id: string;
  workshopId: string;
  institutionId: string;
  title: string;
  description: string;
  dueAt: string;
  status: WorkshopTaskStatus;
  audienceStudentIds: string[];
  attachments: WorkshopTaskAttachment[];
  createdBy: string;
  teacherName: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkshopSubmissionStatus =
  | "submitted"
  | "feedback"
  | "reviewed";

export type WorkshopSubmission = {
  id: string;
  taskId: string;
  workshopId: string;
  institutionId: string;
  studentId: string;
  studentName: string;
  content: string;
  attachments: WorkshopTaskAttachment[];
  version: number;
  status: WorkshopSubmissionStatus;
  teacherFeedback: string;
  submittedAt: string;
  feedbackAt?: string;
  reviewedAt?: string;
  updatedAt: string;
};

export type PortalSettings = {
  theme: "light" | "dark" | "system";
  reducedMotion: boolean;
  whatsappEnabled: boolean;
  quietHours: string;
};

export type PortalState = {
  week: WeekPlan;
  weeklyVerse: WeeklyVerse;
  reviews: Review[];
  tasks: Task[];
  materials: Material[];
  progress: ProgressCriterion[];
  reports: WeeklyReport[];
  wallPosts: WallPost[];
  forumTopics: ForumTopic[];
  forumModeration: ForumModerationCase[];
  forumBans: ForumBan[];
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
  | "workshops"
  | "users"
  | "settings"
  | "profile";
