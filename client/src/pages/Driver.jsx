import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Alert, CapacityBar, Empty, Pill, StatusPill, useLoad, kg, rupee, pretty, tripCode, fmtDate } from '../components/ui.jsx';

const TYPES = ['container', 'closed', 'open', 'refrigerated', 'flatbed', 'tanker'];

function VehicleForm({ onDone }) {
  const [f, setF] = useState({ regNo: '', label: '', type: 'container', capacityKg: '', capacityCbm: '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await api('/vehicles', { method: 'POST', body: f });
      setF({ regNo: '', label: '', type: 'container', capacityKg: '', capacityCbm: '' });
      onDone();
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <form className="form grid-form" onSubmit={submit}>
      <label>Registration no.<input required placeholder="AP39TX1024" value={f.regNo} onChange={set('regNo')} /></label>
      <label>Name<input placeholder="14-ft container" value={f.label} onChange={set('label')} /></label>
      <label>Type<select value={f.type} onChange={set('type')}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
      <label>Capacity (kg)<input required type="number" min="1" value={f.capacityKg} onChange={set('capacityKg')} /></label>
      <label>Volume (m³, optional)<input type="number" min="0" value={f.capacityCbm} onChange={set('capacityCbm')} /></label>
      <div className="wide"><Alert onClose={() => setError('')}>{error}</Alert><button className="btn primary">Add vehicle</button></div>
    </form>
  );
}

export default function Driver() {
  const { user } = useAuth();
  const trips = useLoad(() => api('/trips/mine'), [], 8000);
  const vehicles = useLoad(() => api('/vehicles'));
  const bookings = useLoad(() => api('/bookings/mine'), [], 8000);
  const [msg, setMsg] = useState({ kind: 'error', text: '' });
  const [busy, setBusy] = useState(false);
  const [showVehicle, setShowVehicle] = useState(false);

  async function act(path) {
    setBusy(true);
    try {
      await api(path, { method: 'POST' });
      setMsg({ kind: 'ok', text: 'Updated.' });
      bookings.reload();
      trips.reload();
    } catch (e) {
      setMsg({ kind: 'error', text: e.message });
    } finally {
      setBusy(false);
    }
  }

  const requests = (bookings.data || []).filter((b) => b.status === 'requested');
  const offers = (bookings.data || []).filter((b) => b.status === 'offered');
  const earnings = (trips.data || []).reduce((s, t) => s + (t.additionalEarnings || 0), 0);

  return (
    <div className="page">
      <div className="pagehead">
        <h1>Driver dashboard</h1>
        <Link className="btn accent" to="/driver/new-trip">＋ Plan a new trip</Link>
      </div>

      {!user.verified && (
        <Alert kind="warn">
          Your account is waiting for admin verification. You can plan trips now – customers will see your trucks in search once you are verified.
        </Alert>
      )}
      <Alert kind={msg.kind} onClose={() => setMsg({ ...msg, text: '' })}>{msg.text}</Alert>

      <div className="stats">
        <div className="stat"><b>{trips.data?.filter((t) => ['planned', 'in_transit'].includes(t.status)).length ?? '–'}</b><span>active trips</span></div>
        <div className="stat"><b>{requests.length}</b><span>booking requests</span></div>
        <div className="stat"><b>{rupee(earnings)}</b><span>extra earned via LoadLoop</span></div>
        <div className="stat"><b>{vehicles.data?.length ?? '–'}</b><span>vehicles</span></div>
      </div>

      {requests.length > 0 && (
        <section>
          <h2>Booking requests</h2>
          <div className="stack tight">
            {requests.map((b) => (
              <div className="card" key={b.id}>
                <header className="truck-head">
                  <div>
                    <h3>{b.shipment.pickup.name} → {b.shipment.drop.name}</h3>
                    <p className="muted">
                      {kg(b.shipment.weightKg)} · {pretty(b.shipment.category)} · <b>{rupee(b.price)}</b> · from {b.customer?.name} · match {b.matchScore}%
                    </p>
                  </div>
                  <Pill tone="amber">needs your answer</Pill>
                </header>
                <div className="row">
                  <button className="btn accent" disabled={busy} onClick={() => act(`/bookings/${b.id}/accept`)}>Accept</button>
                  <button className="btn ghost" disabled={busy} onClick={() => act(`/bookings/${b.id}/reject`)}>Reject</button>
                  <Link className="muted small" to={`/driver/trips/${b.trip.id}`}>View trip</Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {offers.length > 0 && (
        <section>
          <h2>Offers waiting for the customer</h2>
          {offers.map((b) => (
            <div className="card row between" key={b.id}>
              <span>{b.shipment.pickup.name} → {b.shipment.drop.name} · {kg(b.shipment.weightKg)} · {rupee(b.price)}</span>
              <button className="btn ghost" disabled={busy} onClick={() => act(`/bookings/${b.id}/reject`)}>Withdraw</button>
            </div>
          ))}
        </section>
      )}

      <section>
        <h2>My trips</h2>
        {trips.error && <Alert>{trips.error}</Alert>}
        {trips.data?.length === 0 && <Empty>No trips yet. Add a vehicle, then plan your first trip.</Empty>}
        <div className="stack tight">
          {trips.data?.map((t) => (
            <Link to={`/driver/trips/${t.id}`} className="card tripcard" key={t.id}>
              <header className="truck-head">
                <div>
                  <h3>
                    {t.stops[0].name} → {t.stops[t.stops.length - 1].name}
                    {t.isReturn && <Pill tone="amber">return trip</Pill>}
                  </h3>
                  <p className="muted">
                    #{tripCode(t.id)} · {t.stops.map((s) => s.name).join(' → ')} · {Math.round(t.totalKm)} km · {fmtDate(t.departureTime)}
                  </p>
                </div>
                <StatusPill status={t.status} />
              </header>
              <CapacityBar total={t.capacity.totalKg} onboard={t.capacity.onboardKg} />
              <p className="small"><b>{kg(t.capacity.availableKg)}</b> available now</p>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="pagehead">
          <h2>My vehicles</h2>
          <button className="btn ghost" onClick={() => setShowVehicle((v) => !v)}>{showVehicle ? 'Close' : '＋ Add vehicle'}</button>
        </div>
        {showVehicle && <div className="card"><VehicleForm onDone={() => { vehicles.reload(); setShowVehicle(false); }} /></div>}
        {vehicles.data?.length === 0 && <Empty>No vehicles yet.</Empty>}
        <div className="chips">
          {vehicles.data?.map((v) => (
            <div className="card vehicle" key={v._id}>
              <b>{v.label || pretty(v.type)}</b>
              <span className="muted small">{v.regNo} · {pretty(v.type)} · {kg(v.capacityKg)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
