import Nav from '../../components/Nav';
import Guard from '../../components/Guard';
import { useEffect, useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import Stat from '../../components/Stat';
import { useRouter } from 'next/router';

export default function CampaignDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [campaign, setCampaign] = useState<any>(null);
  const [counts, setCounts] = useState({ leads:0, enriched:0, messages:0 });

  useEffect(() => {
    if (!id) return;
    const unsubA = onSnapshot(doc(db, 'campaigns', String(id)), s => setCampaign({ id: s.id, ...s.data() }));
    const unsubB = onSnapshot(collection(db, 'campaigns', String(id), 'leads'), s => setCounts(c=>({ ...c, leads:s.size })));
    const unsubC = onSnapshot(collection(db, 'campaigns', String(id), 'enriched_leads'), s => setCounts(c=>({ ...c, enriched:s.size })));
    const unsubD = onSnapshot(collection(db, 'campaigns', String(id), 'messages'), s => setCounts(c=>({ ...c, messages:s.size })));
    return () => { unsubA(); unsubB(); unsubC(); unsubD(); };
  }, [id]);

  return (
    <main>
      <Nav />
      <Guard>
        <h2>Campaign</h2>
        {campaign && (
          <>
            <div className="card"><div><strong>{campaign.name}</strong></div><div>Status: {campaign.status}</div></div>
            <div className="grid">
              <Stat label="Leads" value={counts.leads} />
              <Stat label="Enriched" value={counts.enriched} />
              <Stat label="Messages" value={counts.messages} />
            </div>
          </>
        )}
      </Guard>
    </main>
  );
}
