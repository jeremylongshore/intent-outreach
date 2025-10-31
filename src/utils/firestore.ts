import { Firestore } from "@google-cloud/firestore";

let firestoreInstance: Firestore | null = null;

export function getFirestore(): Firestore {
  if (!firestoreInstance) {
    firestoreInstance = new Firestore({
      projectId: process.env.GCP_PROJECT_ID,
      databaseId: "(default)"
    });
  }
  return firestoreInstance;
}

export function initializeFirestore(projectId?: string): Firestore {
  firestoreInstance = new Firestore({
    projectId: projectId || process.env.GCP_PROJECT_ID,
    databaseId: "(default)"
  });
  return firestoreInstance;
}
