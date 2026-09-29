import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

const root = new URL("../../", import.meta.url);
let harnessId = 0;
const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;

export async function loadFirebaseTransactions(path) {
  const firestoreUrl = moduleUrl(`
    export const state = { id: ${++harnessId}, documents: new Map(), commits: [], reads: [], rounds: 1 };
    export class Timestamp {
      constructor(value) { this.value = value; }
      toDate() { return new Date(this.value); }
    }
    export const doc = (parent, ...segments) => ({ path: [parent.path, ...segments].filter(Boolean).join("/") });
    export const collection = (parent, ...segments) => ({ ...doc(parent, ...segments), kind: "collection" });
    const snapshot = (path) => ({ id: path.split("/").at(-1), exists: () => state.documents.has(path), data: () => state.documents.get(path) });
    export async function getDoc(reference) { state.reads.push(reference.path); return snapshot(reference.path); }
    export function onSnapshot(reference, callback) { callback(snapshot(reference.path)); return () => {}; }
    export function writeBatch() {
      const writes = [];
      return {
        set(reference, data) { writes.push({ type: "set", path: reference.path, data }); },
        async commit() {
          if (state.batchError) throw state.batchError;
          state.commits.push(...writes);
          for (const write of writes) state.documents.set(write.path, write.data);
        },
      };
    }
    export const serverTimestamp = () => "server-timestamp";
    export async function runTransaction(_db, callback) {
      let writes;
      for (let round = 0; round < state.rounds; round++) {
        writes = [];
        await callback({
          async get(reference) {
            state.reads.push(reference.path);
            const data = state.readDocument ? state.readDocument(reference.path, round) : state.documents.get(reference.path);
            return { exists: () => Boolean(data), data: () => data };
          },
          delete(reference) { writes.push({ type: "delete", path: reference.path }); },
          update(reference, data) { writes.push({ type: "update", path: reference.path, data }); },
        });
      }
      state.commits.push(...writes);
      for (const write of writes) {
        if (write.type === "delete") state.documents.delete(write.path);
        else state.documents.set(write.path, { ...state.documents.get(write.path), ...write.data });
      }
    }
    const unused = () => { throw new Error("Unexpected Firebase operation outside transaction"); };
    export const query = unused, setDoc = unused, updateDoc = unused, where = unused;
  `);
  const mock = await import(firestoreUrl);
  const firebaseUrl = moduleUrl(`export const firebase = { db: {}, storage: {} }; // ${harnessId}`);
  const unusedUrl = moduleUrl("export const httpsCallable = () => {}; export const deleteObject = () => {}; export const ref = () => {}; export const uploadBytes = () => {};");
  const imports = {
    "firebase/firestore": firestoreUrl,
    "firebase/functions": unusedUrl,
    "firebase/storage": unusedUrl,
    "./firebase": firebaseUrl,
  };
  for (const dependency of ["academic-subjects", "grade-scale", "forum-rich-text"]) {
    const source = await readFile(new URL(`lib/${dependency}.ts`, root), "utf8");
    imports[`./${dependency}`] = moduleUrl(stripTypeScriptTypes(source));
  }
  const source = stripTypeScriptTypes(await readFile(new URL(path, root), "utf8"));
  const replaced = source.replace(/from "([^"]+)"/g, (_match, name) => {
    if (!imports[name]) throw new Error(`Unexpected dependency: ${name}`);
    return `from "${imports[name]}"`;
  });
  return { ...mock, api: await import(moduleUrl(replaced)) };
}
