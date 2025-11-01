import Nav from '../../components/Nav';
import Guard from '../../components/Guard';
import KeyField from '../../components/KeyField';

const KEYS = [
  'CLAY_API_KEY',
  'APOLLO_API_KEY',
  'CLEARBIT_API_KEY',
  'CRUNCHBASE_API_KEY',
  'SALESNAV_COOKIE',
  'SALESNAV_TOKEN',
  'ZOOMINFO_API_KEY'
];

export default function Keys() {
  return (
    <main>
      <Nav />
      <Guard>
        <h2>Provider Keys</h2>
        <div className="grid">
          {KEYS.map(k => <KeyField key={k} name={k} />)}
        </div>
      </Guard>
    </main>
  );
}
