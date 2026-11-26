// A self-contained SVG route map (no map tiles or API keys needed, works offline).
// Shows the planned stops, the truck's live position and optional highlighted points (pickup / drop).
export default function RouteMap({ stops, truck, highlights = [], height = 220 }) {
  const W = 640;
  const H = height;
  const pad = 46;

  const pts = [...stops, ...(truck ? [truck] : []), ...highlights];
  const lat0 = (Math.min(...pts.map((p) => p.lat)) + Math.max(...pts.map((p) => p.lat))) / 2;
  const kx = Math.cos((lat0 * Math.PI) / 180);
  const raw = (p) => ({ x: p.lng * kx, y: -p.lat });
  const rp = pts.map(raw);
  const minX = Math.min(...rp.map((p) => p.x));
  const maxX = Math.max(...rp.map((p) => p.x));
  const minY = Math.min(...rp.map((p) => p.y));
  const maxY = Math.max(...rp.map((p) => p.y));
  const scale = Math.min((W - 2 * pad) / Math.max(0.0001, maxX - minX), (H - 2 * pad) / Math.max(0.0001, maxY - minY));
  const offX = (W - scale * (maxX - minX)) / 2;
  const offY = (H - scale * (maxY - minY)) / 2;
  const P = (p) => {
    const r = raw(p);
    return { x: offX + (r.x - minX) * scale, y: offY + (r.y - minY) * scale };
  };

  const line = stops.map((s) => `${P(s).x},${P(s).y}`).join(' ');
  const last = stops.length - 1;

  return (
    <svg className="routemap" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Route: ${stops.map((s) => s.name).join(' to ')}`}>
      <defs>
        <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
          <path d="M32 0H0V32" fill="none" stroke="#dfe7f3" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="url(#grid)" rx="12" />
      <polyline points={line} fill="none" stroke="#9db8e6" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={line} fill="none" stroke="#0b3d91" strokeWidth="2.5" strokeDasharray="7 6" strokeLinecap="round" strokeLinejoin="round" />

      {stops.map((s, i) => {
        const { x, y } = P(s);
        const above = i % 2 === 0;
        return (
          <g key={`${s.name}-${i}`}>
            <circle cx={x} cy={y} r={i === 0 || i === last ? 8 : 6} fill={i === last ? '#2fb344' : i === 0 ? '#0b3d91' : '#fff'} stroke="#0b3d91" strokeWidth="3" />
            <text x={x} y={above ? y - 15 : y + 26} textAnchor="middle" className="maplabel">
              {s.name}
              {i === last ? ' 🏁' : ''}
            </text>
          </g>
        );
      })}

      {highlights.map((h, i) => {
        const { x, y } = P(h);
        return (
          <g key={`h${i}`}>
            <circle cx={x} cy={y} r="9" fill={h.color || '#ff7a1a'} stroke="#fff" strokeWidth="3" />
            <text x={x} y={y - 14} textAnchor="middle" className="maplabel strong" fill={h.color || '#ff7a1a'}>
              {h.label}
            </text>
          </g>
        );
      })}

      {truck && (() => {
        const { x, y } = P(truck);
        return (
          <g>
            <circle cx={x} cy={y} r="17" fill="#00b4d8" opacity="0.25">
              <animate attributeName="r" values="12;22;12" dur="2.2s" repeatCount="indefinite" />
            </circle>
            <circle cx={x} cy={y} r="11" fill="#00b4d8" stroke="#fff" strokeWidth="3" />
            <text x={x} y={y + 5} textAnchor="middle" fontSize="13">🚚</text>
          </g>
        );
      })()}
    </svg>
  );
}
