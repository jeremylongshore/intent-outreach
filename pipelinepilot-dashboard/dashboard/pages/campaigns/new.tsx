import Nav from '../../components/Nav';
import Guard from '../../components/Guard';
import { useState } from 'react';
import { createCampaign } from '../../lib/firestore';
import { useRouter } from 'next/router';

export default function NewCampaign() {
  const [name, setName] = useState('');
  const [icp, setIcp] = useState('SaaS companies, 100-500 employees');
  const [domains, setDomains] = useState('example.com');
  const [msg, setMsg] = useState('');
  const router = useRouter();

  async function submit(e: any) {
    e.preventDefault();
    setMsg('Creating…');
    const id = await createCampaign({ name, icp, domains: domains.split(/\s+/).filter(Boolean) });
    setMsg('Queued');
    router.push(`/campaigns/${id}`);
  }

  return (
    <main>
      <Nav />
      <Guard>
        <h2>New Campaign</h2>
        <form onSubmit={submit} className="card">
          <label>Name</label>
          <input value={name} onChange={e=>setName(e.target.value)} required />
          <label>ICP</label>
          <textarea rows={4} value={icp} onChange={e=>setIcp(e.target.value)} />
          <label>Domains (space or newline separated)</label>
          <textarea rows={4} value={domains} onChange={e=>setDomains(e.target.value)} />
          <button type="submit">Create</button>
          <div>{msg}</div>
        </form>
      </Guard>
    </main>
  );
}
