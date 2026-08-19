"use client";

import {
  deleteApp,
  FirebaseApp,
  getApp,
  getApps,
  initializeApp,
} from "firebase/app";
import {
  Auth,
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import {
  collection,
  Firestore,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { Functions, getFunctions, httpsCallable } from "firebase/functions";
import {
  deleteObject,
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes,
  type FirebaseStorage,
  type StorageReference,
} from "firebase/storage";
import { createDemoState } from "./demo-data";
import type {
  ManagedAccount,
  PortalState,
  Role,
  SchoolLevel,
  UserProfile,
} from "./types";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseConfigured =
  process.env.NEXT_PUBLIC_DATA_PROVIDER !== "demo" &&
  Object.values(firebaseConfig).every(Boolean);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;
let functions: Functions | null = null;

if (firebaseConfigured && typeof window !== "undefined") {
  app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
  functions = getFunctions(app, "us-central1");
}

export const firebase = { app, auth, db, storage, functions };

export const PROFILE_PHOTO_MIME_TYPES: readonly string[] = [
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/png",
  "image/webp",
];

export type ManagedAccountInput = {
  firstName: string;
  lastName: string;
  email: string;
  role: "student" | "teacher";
  schoolLevel?: SchoolLevel;
  grade?: string;
  group?: string;
  subjects: string[];
  teacherIds: string[];
  photo: File;
};

export type ManagedAccountUpdateInput = {
  uid: string;
  firstName: string;
  lastName: string;
  email: string;
  role: "student" | "teacher";
  schoolLevel?: SchoolLevel;
  grade?: string;
  group?: string;
  subjects: string[];
  teacherIds: string[];
  photo?: File;
  currentPhotoURL?: string;
};

export function generateTemporaryPassword() {
  const groups = [
    "ABCDEFGHJKLMNPQRSTUVWXYZ",
    "abcdefghijkmnopqrstuvwxyz",
    "23456789",
    "!@#$%",
  ];
  const all = groups.join("");
  const bytes = crypto.getRandomValues(new Uint32Array(12));
  const characters = groups.map(
    (group, index) => group[bytes[index] % group.length],
  );
  for (let index = characters.length; index < 12; index += 1) {
    characters.push(all[bytes[index] % all.length]);
  }
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = bytes[index] % (index + 1);
    [characters[index], characters[swapIndex]] = [
      characters[swapIndex],
      characters[index],
    ];
  }
  return characters.join("");
}

const gradesBySchoolLevel: Record<SchoolLevel, readonly string[]> = {
  primary: ["1.º", "2.º", "3.º", "4.º", "5.º", "6.º"],
  secondary: ["1.º", "2.º", "3.º"],
};

function readSchoolLevel(value: unknown): SchoolLevel {
  return value === "secondary" ? "secondary" : "primary";
}

function profilePhotoMetadata(type: string) {
  if (["image/jpeg", "image/jpg", "image/pjpeg"].includes(type)) {
    return { extension: "jpg", contentType: "image/jpeg" };
  }
  if (type === "image/png") return { extension: "png", contentType: type };
  if (type === "image/webp") return { extension: "webp", contentType: type };
  return null;
}

type ManagedAccountCreationStage =
  | "validate"
  | "refresh-access"
  | "create-auth-user"
  | "upload-photo"
  | "read-photo"
  | "save-profile";

function firebaseErrorCode(error: unknown) {
  return typeof error === "object" && error && "code" in error
    ? String(error.code)
    : "";
}

class ManagedAccountCreationError extends Error {
  readonly code: string;
  readonly stage: ManagedAccountCreationStage;
  readonly causeCode: string;
  readonly originalError: unknown;
  readonly userMessage?: string;

  constructor(
    stage: ManagedAccountCreationStage,
    originalError: unknown,
    userMessage?: string,
  ) {
    super(
      originalError instanceof Error
        ? originalError.message
        : "No pudimos crear la cuenta.",
    );
    this.name = "ManagedAccountCreationError";
    this.code = `account/${stage}`;
    this.stage = stage;
    this.causeCode = firebaseErrorCode(originalError);
    this.originalError = originalError;
    this.userMessage = userMessage;
  }
}

function accountValidationError(message: string) {
  return new ManagedAccountCreationError("validate", new Error(message), message);
}

function accountDate(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    return value.toDate().toISOString();
  }
  return typeof value === "string" ? value : new Date().toISOString();
}

export async function listManagedAccounts(
  institutionId: string,
  callerRole: Role = "director",
): Promise<ManagedAccount[]> {
  if (!db) return [];
  const snapshot = await getDocs(
    callerRole === "teacher"
      ? query(
          collection(db, "users"),
          where("institutionId", "==", institutionId),
          where("role", "==", "student"),
        )
      : query(
          collection(db, "users"),
          where("institutionId", "==", institutionId),
        ),
  );
  const accounts: ManagedAccount[] = [];
  for (const entry of snapshot.docs) {
    const data = entry.data();
    const name = String(data.name ?? "Cuenta CEHF");
    const nameParts = name.trim().split(/\s+/);
    const role = data.role;
    if (role !== "student" && role !== "teacher") continue;
    accounts.push({
      uid: entry.id,
      firstName: String(data.firstName ?? nameParts[0] ?? ""),
      lastName: String(data.lastName ?? nameParts.slice(1).join(" ")),
      name,
      email: String(data.email ?? ""),
      role,
      initials: String(data.initials ?? "CE"),
      active: data.active !== false,
      schoolLevel: role === "student" ? readSchoolLevel(data.schoolLevel) : undefined,
      grade: data.grade ? String(data.grade) : undefined,
      group: data.group ? String(data.group) : undefined,
      subjects: Array.isArray(data.subjects) ? data.subjects.map(String) : [],
      teacherIds: Array.isArray(data.teacherIds)
        ? data.teacherIds.map(String)
        : [],
      photoURL: data.photoURL ? String(data.photoURL) : undefined,
      createdAt: accountDate(data.createdAt),
    });
  }
  return accounts.sort((first, second) =>
    first.name.localeCompare(second.name, "es"),
  );
}

export async function createManagedAccount(
  input: ManagedAccountInput,
  institutionId: string,
) {
  if (!app || !auth || !db || !storage) {
    throw new Error("Firebase no está configurado.");
  }
  const director = auth.currentUser;
  if (!director) throw accountValidationError("Inicia sesión como Dirección.");
  const photoMetadata = profilePhotoMetadata(input.photo.type);
  if (!photoMetadata || input.photo.size >= 4 * 1024 * 1024) {
    throw accountValidationError(
      "Selecciona una fotografía JPG, JPEG, PNG o WEBP menor a 4 MB.",
    );
  }

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const name = `${firstName} ${lastName}`.trim();
  const email = input.email.trim().toLowerCase();
  const schoolLevel =
    input.role === "student" &&
    (input.schoolLevel === "primary" || input.schoolLevel === "secondary")
      ? input.schoolLevel
      : undefined;
  const grade = input.grade?.trim();
  const group = input.group?.trim();
  if (
    input.role === "student" &&
    (!schoolLevel || !grade || !gradesBySchoolLevel[schoolLevel].includes(grade))
  ) {
    throw accountValidationError(
      "Selecciona un nivel y un grado válidos para el alumno.",
    );
  }
  if (input.role === "student" && (!group || !["A", "B", "C"].includes(group))) {
    throw accountValidationError("Selecciona el grupo del alumno.");
  }
  if (input.subjects.length === 0) {
    throw accountValidationError("Selecciona al menos una materia.");
  }
  if (input.role === "student" && input.teacherIds.length === 0) {
    throw accountValidationError("Asigna al menos un maestro al alumno.");
  }
  const password = generateTemporaryPassword();
  const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
  const creatorApp = initializeApp(
    firebaseConfig,
    `cehf-account-creator-${crypto.randomUUID()}`,
  );
  const creatorAuth = getAuth(creatorApp);
  let createdUser: User | null = null;
  let uploadedPhotoReference: StorageReference | null = null;
  let creationStage: ManagedAccountCreationStage = "refresh-access";

  try {
    const access = await refreshPortalAccess(director);
    if (access.role !== "director" || access.institutionId !== institutionId) {
      throw new Error("La sesión no corresponde a Dirección de esta institución.");
    }
    creationStage = "create-auth-user";
    const credential = await createUserWithEmailAndPassword(
      creatorAuth,
      email,
      password,
    );
    createdUser = credential.user;
    await updateProfile(createdUser, { displayName: name });
    creationStage = "upload-photo";
    const photoReference = ref(
      storage,
      `institutions/${institutionId}/profiles/${createdUser.uid}/profile.${photoMetadata.extension}`,
    );
    uploadedPhotoReference = photoReference;
    await uploadBytes(photoReference, input.photo, {
      contentType: photoMetadata.contentType,
    });
    creationStage = "read-photo";
    const photoURL = await getDownloadURL(photoReference);
    const account: ManagedAccount = {
      uid: createdUser.uid,
      firstName,
      lastName,
      name,
      email,
      role: input.role,
      initials,
      active: true,
      schoolLevel,
      grade: input.role === "student" ? grade : undefined,
      group: input.role === "student" ? group : undefined,
      subjects: input.subjects,
      teacherIds: input.role === "student" ? input.teacherIds : [],
      photoURL,
      createdAt: new Date().toISOString(),
    };
    creationStage = "save-profile";
    await setDoc(doc(db, "users", createdUser.uid), {
      uid: account.uid,
      firstName: account.firstName,
      lastName: account.lastName,
      name: account.name,
      email: account.email,
      role: account.role,
      initials: account.initials,
      active: account.active,
      subjects: account.subjects,
      teacherIds: account.teacherIds,
      photoURL: account.photoURL,
      institutionId,
      createdBy: director.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ...(input.role === "student"
        ? { schoolLevel, grade, group }
        : {}),
    });
    return { account, password };
  } catch (error) {
    if (uploadedPhotoReference) {
      await deleteObject(uploadedPhotoReference).catch(() => undefined);
    }
    if (createdUser) await deleteUser(createdUser).catch(() => undefined);
    throw error instanceof ManagedAccountCreationError
      ? error
      : new ManagedAccountCreationError(creationStage, error);
  } finally {
    await signOut(creatorAuth).catch(() => undefined);
    await deleteApp(creatorApp).catch(() => undefined);
  }
}

async function requireManagedAccountAdmin() {
  if (!auth?.currentUser || !functions) {
    throw accountValidationError("Inicia sesión como Dirección.");
  }
  await refreshPortalAccess(auth.currentUser);
  return functions;
}

export async function updateManagedAccount(
  input: ManagedAccountUpdateInput,
  institutionId: string,
) {
  if (!storage) throw new Error("Firebase Storage no está configurado.");
  const callableFunctions = await requireManagedAccountAdmin();
  let uploadedPhotoReference: StorageReference | null = null;
  let photoURL: string | undefined;
  if (input.photo) {
    const metadata = profilePhotoMetadata(input.photo.type);
    if (!metadata || input.photo.size >= 4 * 1024 * 1024) {
      throw accountValidationError(
        "Selecciona una fotografía JPG, JPEG, PNG o WEBP menor a 4 MB.",
      );
    }
    uploadedPhotoReference = ref(
      storage,
      `institutions/${institutionId}/profiles/${input.uid}/profile-${crypto.randomUUID()}.${metadata.extension}`,
    );
    await uploadBytes(uploadedPhotoReference, input.photo, {
      contentType: metadata.contentType,
    });
    photoURL = await getDownloadURL(uploadedPhotoReference);
  }
  const callable = httpsCallable<
    Omit<ManagedAccountUpdateInput, "photo" | "currentPhotoURL"> & {
      photoURL?: string;
    },
    { account: ManagedAccount }
  >(callableFunctions, "updateManagedAccount");
  try {
    const result = await callable({
      uid: input.uid,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      role: input.role,
      subjects: input.subjects,
      teacherIds: input.teacherIds,
      ...(input.role === "student"
        ? {
            schoolLevel: input.schoolLevel,
            grade: input.grade,
            group: input.group,
          }
        : {}),
      ...(photoURL ? { photoURL } : {}),
    });
    if (photoURL && input.currentPhotoURL && input.currentPhotoURL !== photoURL) {
      try {
        await deleteObject(ref(storage, input.currentPhotoURL));
      } catch {
        // La foto nueva ya quedó vinculada; una imagen histórica no debe
        // convertir una edición exitosa en un error para Dirección.
      }
    }
    return result.data.account;
  } catch (error) {
    if (uploadedPhotoReference) {
      await deleteObject(uploadedPhotoReference).catch(() => undefined);
    }
    throw error;
  }
}

export async function setManagedAccountActive(uid: string, active: boolean) {
  const callableFunctions = await requireManagedAccountAdmin();
  const callable = httpsCallable<
    { uid: string; active: boolean },
    { account: ManagedAccount }
  >(callableFunctions, "setManagedAccountActive");
  const result = await callable({ uid, active });
  return result.data.account;
}

export async function deleteManagedAccount(uid: string) {
  const callableFunctions = await requireManagedAccountAdmin();
  const callable = httpsCallable<{ uid: string }, { uid: string }>(
    callableFunctions,
    "deleteManagedAccount",
  );
  const result = await callable({ uid });
  return result.data.uid;
}

export function watchAuth(callback: (user: User | null) => void) {
  if (!auth) return () => undefined;
  return onAuthStateChanged(auth, callback);
}

export async function loginWithEmail(
  email: string,
  password: string,
  remember: boolean,
) {
  if (!auth) throw new Error("Firebase no está configurado.");
  await setPersistence(
    auth,
    remember ? browserLocalPersistence : browserSessionPersistence,
  );
  return signInWithEmailAndPassword(auth, email, password);
}

export async function resetPassword(email: string) {
  if (!auth) throw new Error("Firebase no está configurado.");
  return sendPasswordResetEmail(auth, email);
}

export async function logoutFirebase() {
  if (auth) await signOut(auth);
}

export async function getProfile(user: User): Promise<UserProfile | null> {
  if (!db) return null;
  const snapshot = await getDoc(doc(db, "users", user.uid));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  return {
    uid: user.uid,
    institutionId: String(data.institutionId ?? ""),
    name: String(data.name ?? user.displayName ?? "Usuario"),
    email: String(data.email ?? user.email ?? ""),
    role: (data.role ?? "student") as Role,
    schoolLevel:
      data.role === "student" || !data.role
        ? readSchoolLevel(data.schoolLevel)
        : undefined,
    grade: data.grade ? String(data.grade) : undefined,
    group: data.group ? String(data.group) : undefined,
    subjects: Array.isArray(data.subjects)
      ? data.subjects.map(String)
      : undefined,
    initials: String(data.initials ?? "CE"),
  };
}

export async function refreshPortalAccess(user: User) {
  if (!functions) throw new Error("Firebase Functions no está configurado.");
  const callable = httpsCallable<
    Record<string, never>,
    { changed: boolean; role: Role; institutionId: string }
  >(functions, "refreshPortalAccess");
  const result = await callable({});
  // Aunque Admin ya tenga las claims correctas, la sesión abierta puede
  // conservar un ID token anterior. Siempre se fuerza su renovación antes
  // de iniciar listeners protegidos de Firestore y Storage.
  await user.getIdToken(true);
  return result.data;
}

const sharedStateRef = (institutionId: string) =>
  db ? doc(db, "institutions", institutionId, "portal", "shared") : null;
const privateStateRef = (uid: string) =>
  db ? doc(db, "users", uid, "privateState", "portal") : null;

export async function loadPortalState(
  profile: UserProfile,
): Promise<PortalState> {
  const sharedRef = sharedStateRef(profile.institutionId);
  if (!db || !sharedRef) return createDemoState();
  const initial = createDemoState();
  const sharedSnapshot = await getDoc(sharedRef);
  const sharedState = sharedSnapshot.exists()
    ? ({
        ...initial,
        ...sharedSnapshot.data(),
        weeklyVerse:
          sharedSnapshot.data().weeklyVerse ?? initial.weeklyVerse,
      } as PortalState)
    : initial;

  if (profile.role !== "director") {
    const privateRef = privateStateRef(profile.uid);
    if (privateRef) {
      const privateSnapshot = await getDoc(privateRef);
      if (privateSnapshot.exists()) {
        return {
          ...sharedState,
          ...privateSnapshot.data(),
          // El versículo es institucional: siempre prevalece la versión del
          // estado compartido sobre cualquier copia privada del usuario.
          weeklyVerse: sharedState.weeklyVerse,
        } as PortalState;
      }
    }
    return sharedState;
  }

  if (sharedSnapshot.exists()) return sharedState;
  if (profile.role === "director") await savePortalState(initial, profile);
  return initial;
}

export async function savePortalState(
  state: PortalState,
  profile: UserProfile,
) {
  if (!db) return;
  const target =
    profile.role === "director"
      ? sharedStateRef(profile.institutionId)
      : privateStateRef(profile.uid);
  if (!target) return;
  await setDoc(target, {
    ...state,
    institutionId: profile.institutionId,
    updatedAt: new Date().toISOString(),
    updatedBy: profile.uid,
  });
}

export function friendlyFirebaseError(error: unknown) {
  const code = firebaseErrorCode(error);
  const messages: Record<string, string> = {
    "auth/invalid-credential":
      "El correo o la contraseña no coinciden. Revisa e intenta de nuevo.",
    "auth/email-already-in-use":
      "Ese correo ya tiene una cuenta. Usa la opción de iniciar sesión.",
    "auth/weak-password": "Usa una contraseña de al menos 8 caracteres.",
    "auth/invalid-email": "Escribe un correo válido.",
    "auth/too-many-requests":
      "Hiciste varios intentos. Espera un momento y vuelve a probar.",
    "auth/operation-not-allowed":
      "Activa el proveedor Correo/Contraseña en Firebase Authentication.",
    "auth/network-request-failed":
      "No pudimos conectar con Firebase. Revisa la red e intenta nuevamente.",
    "storage/unauthorized":
      "Firebase Storage rechazó la fotografía. Publica las reglas incluidas en el proyecto.",
    "storage/object-not-found":
      "La fotografía ya no está disponible en Storage. Selecciónala nuevamente.",
    "functions/unauthenticated":
      "Tu sesión venció. Cierra sesión y vuelve a ingresar.",
    "functions/permission-denied":
      "Tu cuenta no tiene permisos de Dirección para realizar este registro.",
    "functions/already-exists":
      "Ese correo ya pertenece a otra cuenta.",
    "functions/not-found":
      "La cuenta ya no existe o no pertenece a esta institución.",
    "functions/failed-precondition":
      "La cuenta tiene datos relacionados que debes corregir antes de continuar.",
    "functions/invalid-argument":
      "Revisa los datos de la cuenta e intenta nuevamente.",
    "functions/internal":
      "Firebase no pudo completar la administración de la cuenta.",
    "invalid-argument":
      "Firebase recibió datos inválidos. Revisa los campos del formulario.",
    "permission-denied":
      "Firebase rechazó la operación. Revisa que hayas publicado las reglas incluidas.",
  };
  if (error instanceof ManagedAccountCreationError) {
    if (error.userMessage) return error.userMessage;
    if (
      error.stage === "create-auth-user" &&
      messages[error.causeCode]
    ) {
      return messages[error.causeCode];
    }
    const stageMessages: Record<ManagedAccountCreationStage, string> = {
      validate: "Revisa los datos del formulario e intenta nuevamente.",
      "refresh-access":
        "No pudimos validar tu sesión de Dirección. Cierra sesión y vuelve a ingresar.",
      "create-auth-user":
        "Firebase Authentication no pudo crear el acceso. Revisa el correo e intenta nuevamente.",
      "upload-photo":
        "No pudimos subir la fotografía a Storage. Revisa el archivo y los permisos de carga.",
      "read-photo":
        "La fotografía se subió, pero Storage no permitió obtener su URL.",
      "save-profile":
        "Firestore no pudo guardar el perfil. La cuenta temporal y su fotografía fueron eliminadas.",
    };
    return stageMessages[error.stage];
  }
  if (
    code.startsWith("functions/") &&
    error instanceof Error &&
    error.message.trim()
  ) {
    return error.message.replace(/^Firebase:\s*/i, "").trim();
  }
  return messages[code] ?? "No pudimos completar la acción. Intenta nuevamente.";
}

export function firebaseErrorDetails(error: unknown) {
  if (error instanceof ManagedAccountCreationError) {
    return {
      name: error.name,
      code: error.code,
      stage: error.stage,
      causeCode: error.causeCode || undefined,
      message: error.message,
      originalError: error.originalError,
    };
  }
  return {
    code: firebaseErrorCode(error) || undefined,
    message: error instanceof Error ? error.message : String(error),
    originalError: error,
  };
}
