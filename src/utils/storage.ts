import { Storage } from "@google-cloud/storage";

let storageInstance: Storage | null = null;

export function getStorage(): Storage {
  if (!storageInstance) {
    storageInstance = new Storage({
      projectId: process.env.GCP_PROJECT_ID
    });
  }
  return storageInstance;
}

export function initializeStorage(projectId?: string): Storage {
  storageInstance = new Storage({
    projectId: projectId || process.env.GCP_PROJECT_ID
  });
  return storageInstance;
}
