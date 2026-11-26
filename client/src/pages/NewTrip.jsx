import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api.js';
import { useMeta } from '../components/ShipmentForm.jsx';
import { Alert, useLoad, pretty, kg } from '../components/ui.jsx';

const blankCargo = { label: '', category: 'general', weightKg: '', from: '', to: '' };

export default function NewTrip() {
  const navigate = useNavigate();
  const { cities, categories } = useMeta();
  const vehicles = useLoad(() => api('/vehicles'));
  const [vehicleId, setVehicleId] = useState('');
  const [stops, setStops] = useState([]);
  const [pick, setPick] = useState('');
  const [departure, setDeparture] = useState('');
  const [baseEarnings, setBaseEarnings] = useState('');
  const [cargo, setCargo] = useState([]);
  const [createReturn, setCreateReturn] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const vehicle = vehicles.data?.find((v) => v._id === vehicleId);
  const loadedKg = cargo.reduce((s, c) => s + (Number(c.weightKg) || 0), 0);

  const addStop = () => {
    if (!pick) return;
    if (stops[stops.length - 1] === pick) return setError('Consecutive stops must be different');
    setStops([...stops, pick]);
    setPick('');
    setError('');
  };
  const move = (i, d) => {
    const s = [...stops];
    const j = i + d;
    if (j < 0 || j >= s.length) return;
    [s[i], s[j]] = [s[j], s[i]];
    setStops(s);
  };
  const setC = (i, k, v) => setCargo(cargo.map((c, idx) => (idx === i ? { ...c, [k]: v } : c)));

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (stops.length < 2) return setError('Add at least a source and a destination');
    setBusy(true);
    try {
      const r = await api('/trips', {
        method: 'POST',
        body: {
          vehicleId,
          stops,
          departureTime: departure || undefined,
          baseEarnings,
          createReturn,
          existingCargo: cargo
            .filter((c) => c.weightKg)
            .map((c) => ({ ...c, label: c.label || pretty(c.category), from: c.from || stops[0], to: c.to || stops[stops.length - 1] }))
        }
      });
      navigate(`/driver/trips/${r.trip.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page narrow wide-ok">
      <p><Link to="/driver">← My trips</Link></p>
      <h1>Plan a trip</h1>
      <form className="card form" onSubmit={submit}>
        <label>
          Vehicle
          <select required value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
            <option value="">Select a vehicle…</option>
            {vehicles.data?.map((v) => <option key={v._id} value={v._id}>{v.label || pretty(v.type)} · {v.regNo} · {kg(v.capacityKg)}</option>)}
          </select>
          {vehicles.data?.length === 0 && <span className="hint">You have no vehicles. <Link to="/driver">Add one first.</Link></span>}
        </label>

        <fieldset>
          <legend>Route (in driving order)</legend>
          <p className="muted small">
            Start with the source, add intermediate cities the truck will pass, and finish with the destination. More stops = more accurate matching along the way.
          </p>
          <div className="row">
            <select value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Choose a city…</option>
              {cities.map((c) => <option key={c.name}>{c.name}</option>)}
            </select>
            <button type="button" className="btn ghost" onClick={addStop}>Add stop</button>
          </div>
          <ol className="stoplist">
            {stops.map((s, i) => (
              <li key={`${s}-${i}`}>
                <span>
                  <b>{s}</b> {i === 0 && <em>source</em>} {i === stops.length - 1 && stops.length > 1 && <em>destination</em>}
                </span>
                <span>
                  <button type="button" className="mini" onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                  <button type="button" className="mini" onClick={() => move(i, 1)} aria-label="Move down">↓</button>
                  <button type="button" className="mini" onClick={() => setStops(stops.filter((_, k) => k !== i))} aria-label="Remove">✕</button>
                </span>
              </li>
            ))}
          </ol>
        </fieldset>

        <div className="grid-form">
          <label>Departure time<input type="datetime-local" value={departure} onChange={(e) => setDeparture(e.target.value)} /></label>
          <label>Earnings from original cargo (₹)<input type="number" min="0" value={baseEarnings} onChange={(e) => setBaseEarnings(e.target.value)} /></label>
        </div>

        <fieldset>
          <legend>Cargo already booked on this trip</legend>
          {vehicle && (
            <p className={`small ${loadedKg > vehicle.capacityKg ? 'bad' : 'muted'}`}>
              {kg(loadedKg)} of {kg(vehicle.capacityKg)} · available {kg(Math.max(0, vehicle.capacityKg - loadedKg))}
            </p>
          )}
          {cargo.map((c, i) => (
            <div className="cargo-row" key={i}>
              <input placeholder="Label" value={c.label} onChange={(e) => setC(i, 'label', e.target.value)} />
              <select value={c.category} onChange={(e) => setC(i, 'category', e.target.value)}>
                {categories.map((x) => <option key={x} value={x}>{pretty(x)}</option>)}
              </select>
              <input type="number" min="1" placeholder="kg" value={c.weightKg} onChange={(e) => setC(i, 'weightKg', e.target.value)} />
              <select value={c.from} onChange={(e) => setC(i, 'from', e.target.value)}>
                <option value="">From {stops[0] || 'source'}</option>
                {stops.map((s, k) => <option key={k}>{s}</option>)}
              </select>
              <select value={c.to} onChange={(e) => setC(i, 'to', e.target.value)}>
                <option value="">To {stops[stops.length - 1] || 'destination'}</option>
                {stops.map((s, k) => <option key={k}>{s}</option>)}
              </select>
              <button type="button" className="mini" onClick={() => setCargo(cargo.filter((_, k) => k !== i))} aria-label="Remove cargo">✕</button>
            </div>
          ))}
          <button type="button" className="btn ghost" onClick={() => setCargo([...cargo, { ...blankCargo }])}>＋ Add cargo</button>
        </fieldset>

        <label className="check">
          <input type="checkbox" checked={createReturn} onChange={(e) => setCreateReturn(e.target.checked)} />
          Also create the empty return trip so customers can book return loads
        </label>

        <Alert onClose={() => setError('')}>{error}</Alert>
        <button className="btn primary" disabled={busy || !vehicleId}>{busy ? 'Creating…' : 'Create trip'}</button>
      </form>
    </div>
  );
}
