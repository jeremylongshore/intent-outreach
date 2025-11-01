import Nav from '../components/Nav';
import Link from 'next/link';

export default function Home() {
  return (
    <main>
      <Nav />
      <h1>PipelinePilot</h1>
      <p>Run SDR campaigns and view results in real time.</p>
      <div className="grid">
        <Link className="card" href="/campaigns/new">New Campaign</Link>
        <Link className="card" href="/campaigns">All Campaigns</Link>
        <Link className="card" href="/settings/keys">Provider Keys</Link>
      </div>
    </main>
  );
}
