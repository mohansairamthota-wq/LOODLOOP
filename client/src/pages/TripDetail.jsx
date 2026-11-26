import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import RouteMap from '../components/RouteMap.jsx';
import { Alert, CapacityBar, Empty, MatchBadge, Pill, StatusPill, useLoad, kg, rupee, pretty, tripCode, fmtDate, fmtMinutes } from '../components/ui.jsx';

const SIM_STEP_KM = 12; // how far the simulated truck moves every tick
const SIM_TICK_MS = 1500;

// Position along the route for a given distance (km) from the start.
function pointAtKm(stops, stopKm, km) {
  for (let i = 0; i < stops.length - 1; i++) {
    if (km <= stopKm[i + 1] || i === stops.length - 2) {
      const span = Math.max(0.0001, stopKm[i + 1] - stopKm[i]);
      const t = Math.max(0, Math.min(1, (km - stopKm[i]) / span));
      return { lat: stops[i].lat + (stops[i + 1].lat - stops[i].lat) * t, lng: stops[i].lng + (stops[i + 1].lng - stops[i].lng) * t };
    }
  }
  return stops[stops.length - 1];
}

// Rough current distance from the start, derived from the truck position between two stops.
function kmFromLocation(trip) {
  const i = Math.min(trip.currentStopIndex, trip.stops.length - 2);
  const a = trip.stops[i];
  const b = trip.stops[i + 1];
  const loc = trip.currentLocation;
  const d = (p, q) => Math.hypot(p.lat - q.lat, (p.lng - q.lng) * Math.cos((p.lat * Math.PI) / 180));
  const frac = Math.min(1, d(a, loc) / Math.max(0.0001, d(a, b)));
  return trip.stopKm[i] + frac * (trip.stopKm[i + 1] - trip.stopKm[i]);
}

function ProfitBreakdown({ p, deviationKm }) {
  return (
    <table className="breakdown">
      <tbody>
        <tr><td>Customer pays</td><td>{rupee(p.revenue)}</td></tr>
        <tr><td>− LoadLoop commission</td><td>{rupee(p.commission)}</td></tr>
        <tr><td>− Route deviation ({deviationKm} km)</td><td>{rupee(p.deviationCost)}</td></tr>
        <tr><td>− Extra fuel for the load</td><td>{rupee(p.fuelCost)}</td></tr>
        <tr><td>− Toll</td><td>{rupee(p.tollCost)}</td></tr>
        <tr><td>− Handling</td><td>{rupee(p.handlingCost)}</td></tr>
        <tr className="total"><td>Expected additional profit</td><td>{rupee(p.netProfit)}</td></tr>
      </tbody>
    </table>
  );
}

export default function TripDetail() {
  const { id } = useParams();
  const tripLoad = useLoad(() => api(`/trips/${id}`), [id], 10000);
  const opps = useLoad(() => api(`/trips/${id}/opportunities`), [id], 15000);
  const trip = tripLoad.data;

  const [msg, setMsg] = useState({ kind: 'error', text: '' });
  const [busy, setBusy] = useState(false);
  const [simOn, setSimOn] = useState(false);
  const [hover, setHover] = useState(null);

  const tripRef = useRef(null);
  tripRef.current = trip;
  const kmRef = useRef(0);
  const inFlight = useRef(false);
  const flash = (text, kind = 'error') => setMsg({ kind, text });

  // ---- GPS simulation: moves the truck along the route and sends the location to the server ----
  useEffect(() => {
    if (!simOn) return undefined;
    kmRef.current = kmFromLocation(tripRef.current);
    const timer = setInterval(async () => {
      const t = tripRef.current;
      if (!t || inFlight.current) return;
      const nextStopKm = t.stopKm.find((k) => k > kmRef.current + 0.5);
      if (nextStopKm === undefined) return setSimOn(false);
      kmRef.current = Math.min(kmRef.current + SIM_STEP_KM, nextStopKm);
      const p = pointAtKm(t.stops, t.stopKm, kmRef.current);
      inFlight.current = true;
      try {
        const updated = await api(`/trips/${t.id}/location`, { method: 'PATCH', body: p });
        tripLoad.setData(updated);
        if (kmRef.current >= nextStopKm - 0.01) {
          setSimOn(false);
          const idx = t.stopKm.indexOf(nextStopKm);
          flash(`Arrived at ${t.stops[idx].name}. Pick up / deliver cargo, then resume driving.`, 'ok');
          opps.reload();
        }
      } catch (e) {
        setSimOn(false);
        flash(e.message);
      } finally {
        inFlight.current = false;
      }
    }, SIM_TICK_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simOn]);

  async function act(path, okText = 'Done.') {
    setBusy(true);
    try {
      const r = await api(path, { method: 'POST' });
      if (r && r.stops) tripLoad.setData(r);
      else if (r && r.trip) tripLoad.setData(r.trip);
      else tripLoad.reload();
      opps.reload();
      flash(okText, 'ok');
    } catch (e) {
      flash(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function offer(shipmentId) {
    setBusy(true);
    try {
      await api('/bookings/offer', { method: 'POST', body: { shipmentId, tripId: id } });
      flash('Offer sent. The customer will see it in their dashboard.', 'ok');
      opps.reload();
    } catch (e) {
      flash(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (tripLoad.loading && !trip) return <div className="page"><p className="muted">Loading…</p></div>;
  if (!trip) return <div className="page"><Alert>{tripLoad.error || 'Trip not found'}</Alert><Link to="/driver">← Back</Link></div>;

  const live = trip.status === 'in_transit';
  const manifest = trip.manifest || [];
  const todo = manifest.filter((c) => c.status !== 'delivered');
  const highlights = hover
    ? [
        { ...hover.pickup, label: `Pickup: ${hover.pickup.name}`, color: '#ff7a1a' },
        { ...hover.drop, label: `Drop: ${hover.drop.name}`, color: '#7048e8' }
      ].filter((h) => !trip.stops.some((s) => s.name === h.name))
    : [];
  const potential = (opps.data || []).filter((o) => o.match.feasible && o.match.label !== 'avoid').reduce((s, o) => s + o.match.profit.netProfit, 0);

  return (
    <div className="page">
      <p><Link to="/driver">← My trips</Link></p>
      <div className="pagehead">
        <div>
          <h1>
            {trip.stops[0].name} → {trip.stops[trip.stops.length - 1].name} <StatusPill status={trip.status} />{' '}
            {trip.isReturn && <Pill tone="amber">return trip</Pill>}
          </h1>
          <p className="muted">Truck #{tripCode(trip.id)} · {trip.vehicle.label || pretty(trip.vehicle.type)} · {trip.vehicle.regNo} · departs {fmtDate(trip.departureTime)}</p>
        </div>
        <div className="row">
          {trip.status === 'planned' && <button className="btn primary" disabled={busy} onClick={() => act(`/trips/${id}/start`, 'Trip started. Your location is now live.')}>▶ Start trip</button>}
          {live && (
            <button className="btn accent" onClick={() => setSimOn((v) => !v)}>{simOn ? '⏸ Pause driving' : '🚚 Simulate driving'}</button>
          )}
          {live && <button className="btn ghost" disabled={busy || todo.length > 0} title={todo.length ? 'Deliver all cargo first' : ''} onClick={() => act(`/trips/${id}/complete`, 'Trip completed.')}>Complete trip</button>}
          {trip.status === 'planned' && <button className="btn ghost" disabled={busy} onClick={() => act(`/trips/${id}/cancel`, 'Trip cancelled.')}>Cancel trip</button>}
          {!trip.isReturn && <button className="btn ghost" disabled={busy} onClick={() => act(`/trips/${id}/return`, 'Return trip created – find it in My trips.')}>↩ Create return trip</button>}
        </div>
      </div>

      <Alert kind={msg.kind} onClose={() => setMsg({ ...msg, text: '' })}>{msg.text}</Alert>

      <div className="stats">
        <div className="stat"><b>{kg(trip.capacity.totalKg)}</b><span>total capacity</span></div>
        <div className="stat"><b>{kg(trip.capacity.onboardKg)}</b><span>loaded now</span></div>
        <div className="stat good"><b>{kg(trip.capacity.availableKg)}</b><span>available now</span></div>
        <div className="stat"><b>{Math.round(trip.remainingKm)} km</b><span>remaining distance</span></div>
        <div className="stat"><b>{rupee(trip.baseEarnings)}</b><span>trip earnings</span></div>
        <div className="stat good"><b>{rupee(trip.additionalEarnings)}</b><span>additional earnings{potential > 0 ? ` · ${rupee(potential)} possible` : ''}</span></div>
      </div>

      <div className="two-col even">
        <section className="card">
          <h2>Live route</h2>
          <RouteMap stops={trip.stops} truck={live ? trip.currentLocation : null} highlights={highlights} height={260} />
          <p className="small">
            {live
              ? <>📍 <b>{Math.round(trip.distanceToNextStopKm)} km</b> to {trip.nextStop} · ETA {fmtMinutes(trip.etaNextStopMinutes)}</>
              : <span className="muted">Start the trip to share your live location.</span>}
          </p>
          <CapacityBar total={trip.capacity.totalKg} onboard={trip.capacity.onboardKg} />
          <h4>Capacity along the route</h4>
          <table className="table small">
            <thead><tr><th>Stop</th><th>km</th><th>Load leaving</th><th>Free</th></tr></thead>
            <tbody>
              {trip.timeline.map((r, i) => (
                <tr key={r.stop + i} className={live && i === trip.currentStopIndex ? 'here' : ''}>
                  <td>{r.stop}{live && i === trip.currentStopIndex ? ' 🚚 last stop passed' : ''}</td><td>{r.km}</td><td>{kg(r.loadKg)}</td><td>{kg(r.freeKg)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card">
          <h2>Cargo manifest</h2>
          <p className="muted small">Full details are visible only to you. Public users see just the general category.</p>
          {manifest.length === 0 && <Empty>No cargo yet.</Empty>}
          <table className="table small">
            <tbody>
              {manifest.map((c) => (
                <tr key={c.id} className={c.status === 'delivered' ? 'faded' : ''}>
                  <td>
                    <b>{c.label}</b> <Pill>{pretty(c.category)}</Pill>
                    <div className="muted">{c.fromName} → {c.toName}{c.notes ? ` · “${c.notes}”` : ''}{c.booking ? ' · LoadLoop booking' : ''}</div>
                  </td>
                  <td>{kg(c.weightKg)}</td>
                  <td><StatusPill status={c.status} /></td>
                  <td>
                    {c.status === 'waiting' && live && <button className="btn mini-btn" disabled={busy} onClick={() => act(`/trips/${id}/cargo/${c.id}/pickup`, 'Picked up – capacity updated.')}>Pick up</button>}
                    {c.status === 'loaded' && <button className="btn mini-btn" disabled={busy} onClick={() => act(`/trips/${id}/cargo/${c.id}/deliver`, 'Delivered – capacity is free again.')}>Deliver</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section>
        <h2>Opportunities on your route</h2>
        <p className="muted">Open shipments checked against your capacity, route, cargo compatibility and estimated profit.</p>
        {opps.error && <Alert>{opps.error}</Alert>}
        {trip.status !== 'planned' && trip.status !== 'in_transit' && <Empty>This trip is {trip.status}.</Empty>}
        {opps.data?.length === 0 && ['planned', 'in_transit'].includes(trip.status) && <Empty>No open shipments right now.</Empty>}
        <div className="opps">
          {opps.data?.map(({ shipment: s, match: m }) => (
            <article
              key={s.id}
              className={`card opp ${m.label}`}
              onMouseEnter={() => setHover(s)}
              onMouseLeave={() => setHover(null)}
            >
              <header className="truck-head">
                <div>
                  <h4>{s.pickup.name} → {s.drop.name}</h4>
                  <p className="muted small">{kg(s.weightKg)} · {pretty(s.category)} · {s.customerName}</p>
                </div>
                <MatchBadge label={m.label} />
              </header>
              <div className="matchrow">
                <span>Pays <b>{rupee(s.offeredPrice)}</b></span>
                <span>Extra distance <b>{m.route.deviationKm} km</b></span>
                {m.feasible && <span>Match <b>{m.score}%</b></span>}
              </div>
              {m.feasible ? (
                <>
                  <p className="profit">Net profit <b>{rupee(m.profit.netProfit)}</b></p>
                  <details>
                    <summary>How is this calculated?</summary>
                    <ProfitBreakdown p={m.profit} deviationKm={m.route.deviationKm} />
                  </details>
                  <button className="btn accent" disabled={busy} onClick={() => offer(s.id)}>Send offer to customer</button>
                </>
              ) : (
                <ul className="reasons">{m.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
