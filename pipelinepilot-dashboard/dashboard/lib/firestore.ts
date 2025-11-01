import { db } from './firebase';
import { collection, addDoc, serverTimestamp, doc, onSnapshot, setDoc } from 'firebase/firestore';

export type Campaign = {
  name: string;
  icp: string;
  domains: string[];
  createdAt?: any;
  status?: 'QUEUED'|'RUNNING'|'DONE'|'ERROR';
};

export async function createCampaign(data: Campaign) {
  const ref = await addDoc(collection(db, 'campaigns'), {
    ...data,
    createdAt: serverTimestamp(),
    status: 'QUEUED'
  });
  // also drop a queue signal for the backend
  await setDoc(doc(db, 'queues', ref.id), { campaignId: ref.id, createdAt: serverTimestamp() });
  return ref.id;
}

export function watchCampaign(id: string, cb: (data: any)=>void) {
  return onSnapshot(doc(db, 'campaigns', id), (snap) => cb({ id: snap.id, ...snap.data() }));
}
