import { useEffect, useState } from 'react';
import { auth, googleProvider } from '../lib/firebase';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';

export default function Guard({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => onAuthStateChanged(auth, u => { setUser(u); setReady(true); }), []);
  if (!ready) return <p>Loading…</p>;
  if (!user) return <button onClick={() => signInWithPopup(auth, googleProvider)}>Sign in with Google</button>;
  return <>{children}</>;
}
