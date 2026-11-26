import { useEffect, useState } from 'react';

export const rupee = (n) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;
export const kg = (n) => `${Math.round(n || 0).toLocaleString('en-IN')} kg`;
export const pretty = (s) => String(s || '').replace(/_/g, ' ');
export const fmtDate = (d) => (d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

export function fmtMinutes(m) {
  if (m == null) return '—';
  if (m < 1) return 'now';
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

export const tripCode = (id) => `LL${String(id).slice(-4).toUpperCase()}`;

export function Pill({ tone = 'grey', children }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

const STATUS_TONE = {
  planned: 'blue',
  in_transit: 'cyan',
  completed: 'green',
  cancelled: 'grey',
  open: 'blue',
  requested: 'amber',
  offered: 'amber',
  accepted: 'green',
  booked: 'green',
  picked_up: 'cyan',
  delivered: 'green',
  rejected: 'red',
  waiting: 'amber',
  loaded: 'cyan'
};
export const StatusPill = ({ status }) => <Pill tone={STATUS_TONE[status] || 'grey'}>{pretty(status)}</Pill>;

export function MatchBadge({ label }) {
  const map = { recommended: ['green', '🟢 Recommended'], consider: ['amber', '🟡 Consider'], avoid: ['red', '🔴 Avoid'] };
  const [tone, text] = map[label] || ['grey', label];
  return <Pill tone={tone}>{text}</Pill>;
}

// Total capacity split into: already on board, this shipment (optional), still free.
export function CapacityBar({ total, onboard, extra = 0 }) {
  const pct = (v) => `${Math.max(0, Math.min(100, (v / total) * 100))}%`;
  const free = Math.max(0, total - onboard - extra);
  return (
    <div>
      <div className="capbar" role="img" aria-label={`${kg(onboard)} on board, ${kg(free)} free`}>
        <div className="seg onboard" style={{ width: pct(onboard) }} />
        {extra > 0 && <div className="seg extra" style={{ width: pct(extra) }} />}
        <div className="seg free" style={{ width: pct(free) }} />
      </div>
      <div className="caplegend">
        <span><i className="dot onboard" /> On board {kg(onboard)}</span>
        {extra > 0 && <span><i className="dot extra" /> Your shipment {kg(extra)}</span>}
        <span><i className="dot free" /> Free {kg(free)}</span>
      </div>
    </div>
  );
}

export function Alert({ kind = 'error', children, onClose }) {
  if (!children) return null;
  return (
    <div className={`alert ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <span>{children}</span>
      {onClose && <button className="x" onClick={onClose} aria-label="Dismiss">×</button>}
    </div>
  );
}

// Loads data with loading/error state; optional polling for live pages.
export function useLoad(fn, deps = [], pollMs = 0) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    fn()
      .then((d) => alive && (setData(d), setError('')))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  useEffect(() => {
    if (!pollMs) return undefined;
    const id = setInterval(() => setTick((t) => t + 1), pollMs);
    return () => clearInterval(id);
  }, [pollMs]);

  return { data, error, loading, reload: () => setTick((t) => t + 1), setData };
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}
