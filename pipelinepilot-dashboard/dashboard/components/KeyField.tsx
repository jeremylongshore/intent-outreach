import { useState } from 'react';

export default function KeyField({ name }:{ name: string }) {
  const [value, setValue] = useState('');
  const [msg, setMsg] = useState('');

  async function save() {
    setMsg('Saving…');
    const res = await fetch('/api/keys/set', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name, value }) });
    setMsg(res.ok ? 'Saved' : 'Error');
  }
  async function test() {
    setMsg('Testing…');
    const res = await fetch(`/api/keys/test?name=${encodeURIComponent(name)}`);
    const j = await res.json();
    setMsg(j.ok ? 'OK' : 'Missing');
  }

  return (
    <div className="card">
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <strong>{name}</strong>
        <div style={{display:'flex', gap:8}}>
          <button onClick={test}>Test</button>
          <button onClick={save}>Save</button>
        </div>
      </div>
      <input type="password" placeholder="Enter value" value={value} onChange={e=>setValue(e.target.value)} />
      <div style={{fontSize:12, opacity:.7}}>{msg}</div>
    </div>
  );
}
