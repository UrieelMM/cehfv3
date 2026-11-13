import {
  runTransaction,
  serverTimestamp,
  type DocumentData,
  type DocumentReference,
} from "firebase/firestore";

export async function recordFirstOpening(reference: DocumentReference, data: DocumentData) {
  await runTransaction(reference.firestore, async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (snapshot.exists()) return;

    transaction.set(reference, {
      ...data,
      firstOpenedAt: serverTimestamp(),
      // Keep the stored format compatible with existing readers.
      lastOpenedAt: serverTimestamp(),
      viewCount: 1,
    });
  });
}
