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
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import {
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes,
  type FirebaseStorage,
} from "firebase/storage";
import { createDemoState } from "./demo-data";
import type {
  ManagedAccount,
  PortalState,
  Role,
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

if (firebaseConfigured && typeof window !== "undefined") {
  app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
}

export const firebase = { app, auth, db, storage };

export type ManagedAccountInput = {
  firstName: string;
  lastName: string;
  email: string;
  role: "student" | "teacher";
  grade?: string;
  group?: string;
  subjects: string[];
  teacherIds: string[];
  photo: File;
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

export async function listManagedAccounts(): Promise<ManagedAccount[]> {
  if (!db) return [];
  const snapshot = await getDocs(collection(db, "users"));
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

export async function createManagedAccount(input: ManagedAccountInput) {
  if (!app || !auth || !db || !storage) {
    throw new Error("Firebase no está configurado.");
  }
  const director = auth.currentUser;
  if (!director) throw new Error("Inicia sesión como Dirección.");

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const name = `${firstName} ${lastName}`.trim();
  const email = input.email.trim().toLowerCase();
  const password = generateTemporaryPassword();
  const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
  const creatorApp = initializeApp(
    firebaseConfig,
    `cehf-account-creator-${crypto.randomUUID()}`,
  );
  const creatorAuth = getAuth(creatorApp);
  let createdUser: User | null = null;

  try {
    const credential = await createUserWithEmailAndPassword(
      creatorAuth,
      email,
      password,
    );
    createdUser = credential.user;
    await updateProfile(createdUser, { displayName: name });
    const extension = input.photo.type.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
    const photoReference = ref(
      storage,
      `institutions/cehf-primaria/profiles/${createdUser.uid}/profile.${extension}`,
    );
    await uploadBytes(photoReference, input.photo, {
      contentType: input.photo.type,
    });
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
      grade: input.role === "student" ? input.grade : undefined,
      group: input.role === "student" ? input.group : undefined,
      subjects: input.subjects,
      teacherIds: input.role === "student" ? input.teacherIds : [],
      photoURL,
      createdAt: new Date().toISOString(),
    };
    await setDoc(doc(db, "users", createdUser.uid), {
      ...account,
      institutionId: "cehf-primaria",
      createdBy: director.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { account, password };
  } catch (error) {
    if (createdUser) await deleteUser(createdUser).catch(() => undefined);
    throw error;
  } finally {
    await signOut(creatorAuth).catch(() => undefined);
    await deleteApp(creatorApp).catch(() => undefined);
  }
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

export async function createFirstDirector(
  name: string,
  email: string,
  password: string,
) {
  if (!auth || !db) throw new Error("Firebase no está configurado.");
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  const profile: UserProfile = {
    uid: credential.user.uid,
    name,
    email,
    role: "director",
    initials,
  };

  await setDoc(doc(db, "users", credential.user.uid), {
    ...profile,
    active: true,
    institutionId: "cehf-primaria",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await setDoc(doc(db, "system", "bootstrap"), {
    institutionId: "cehf-primaria",
    createdBy: credential.user.uid,
    createdAt: serverTimestamp(),
    version: 1,
  });
  await savePortalState(createDemoState(), profile);
  return credential;
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
    name: String(data.name ?? user.displayName ?? "Usuario"),
    email: String(data.email ?? user.email ?? ""),
    role: (data.role ?? "student") as Role,
    grade: data.grade ? String(data.grade) : undefined,
    group: data.group ? String(data.group) : undefined,
    subjects: Array.isArray(data.subjects)
      ? data.subjects.map(String)
      : undefined,
    initials: String(data.initials ?? "CE"),
  };
}

const sharedStateRef = () =>
  db ? doc(db, "institutions", "cehf-primaria", "portal", "shared") : null;
const privateStateRef = (uid: string) =>
  db ? doc(db, "users", uid, "privateState", "portal") : null;

export async function loadPortalState(
  profile: UserProfile,
): Promise<PortalState> {
  const sharedRef = sharedStateRef();
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

  if (profile.role === "student") {
    const privateRef = privateStateRef(profile.uid);
    if (privateRef) {
      const privateSnapshot = await getDoc(privateRef);
      if (privateSnapshot.exists()) {
        return {
          ...sharedState,
          ...privateSnapshot.data(),
          // El versículo es institucional: siempre prevalece la versión del
          // estado compartido sobre cualquier copia privada del estudiante.
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
    profile.role === "student"
      ? privateStateRef(profile.uid)
      : sharedStateRef();
  if (!target) return;
  await setDoc(target, {
    ...state,
    updatedAt: new Date().toISOString(),
    updatedBy: profile.uid,
  });
}

export function friendlyFirebaseError(error: unknown) {
  const code =
    typeof error === "object" && error && "code" in error
      ? String(error.code)
      : "";
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
    "permission-denied":
      "Firebase rechazó la operación. Revisa que hayas publicado las reglas incluidas.",
  };
  return messages[code] ?? "No pudimos completar la acción. Intenta nuevamente.";
}
