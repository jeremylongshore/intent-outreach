export default function Stat({label, value}:{label:string, value:number|string}) {
  return <div className="card"><div style={{fontSize:12,opacity:.7}}>{label}</div><div style={{fontSize:24}}>{value}</div></div>;
}
