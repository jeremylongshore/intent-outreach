import Nav from '../../components/Nav';
import Guard from '../../components/Guard';
import { useEffect, useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import Link from 'next/link';

export default function Campaigns() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => onSnapshot(query(collection(db, 'campaigns'), orderBy('createdAt','desc')), s => setItems(s.docs.map(d=>({id:d.id, ...d.data()})))), []);
  return (
    <main>
      <Nav />
      <Guard>
        <h2>Campaigns</h2>
        <div className="grid">
          {items.map(c => (
            <Link key={c.id} className="card" href={`/campaigns/${c.id}`}>
              <div><strong>{c.name}</strong></div>
              <div>Status: {c.status || '—'}</div>
            </Link>
          ))}
        </div>
      </Guard>
    </main>
  );
}
