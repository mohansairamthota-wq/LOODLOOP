import { useState } from 'react';
import { api } from '../api.js';
import ShipmentForm, { emptyShipment } from '../components/ShipmentForm.jsx';
import TruckCard from '../components/TruckCard.jsx';
import RouteMap from '../components/RouteMap.jsx';
import { Alert, Empty, Pill, StatusPill, useLoad, rupee, kg, fmtMinutes, pretty, tripCode } from '../components/ui.jsx';

const STEPS = ['requested', 'accepted', 'picked_up', 'delivered'];

function Progress({ status }) {
  const idx = status === 'offered' ? 0 : STEPS.indexOf(status);
  return (
    <ol className="progress">
      {['Requested', 'Confirmed', 'Picked up', 'Delivered'].map((label, i) => (
        <li key={label} className={i <= idx ? 'done' : ''}>{label}</li>
      ))}
    </ol>
  );
}

function BookingCard({ b, onAction, busy }) {
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState('');
  const live = b.trip && b.trip.status === 'in_transit';
  const active = ['requested', 'offered', 'accepted', 'picked_up'].includes(b.status);
  const highlights = [
    { ...b.shipment.pickup, label: `Pickup: ${b.shipment.pickup.name}`, color: '#ff7a1a' },
    { ...b.shipment.drop, label: `Drop: ${b.shipment.drop.name}`, color: '#7048e8' }
  ].filter((h) => !b.trip?.stops.some((s) => s.name === h.name));

  return (
    <article className="card">
      <header className="truck-head">
        <div>
          <h3>{b.shipment.pickup.name} → {b.shipment.drop.name}</h3>
          <p className="muted">
            {kg(b.shipment.weightKg)} · {pretty(b.shipment.category)} · {rupee(b.price)}
            {b.trip && <> · Truck #{tripCode(b.trip.id)} ({b.trip.vehicle.label || pretty(b.trip.vehicle.type)})</>}
          </p>
        </div>
        <StatusPill status={b.status} />
      </header>

      {b.status === 'offered' && (
        <div className="notice">
          🚚 <b>{b.driver.name}</b> offered to carry this shipment for {rupee(b.price)} – their route matches yours.
          <div className="row">
            <button className="btn accent" disabled={busy} onClick={() => onAction(`/bookings/${b.id}/confirm`)}>Confirm offer</button>
            <button className="btn ghost" disabled={busy} onClick={() => onAction(`/bookings/${b.id}/cancel`)}>Decline</button>
          </div>
        </div>
      )}

      {['requested', 'accepted', 'picked_up', 'delivered'].includes(b.status) && <Progress status={b.status} />}

      {b.status === 'rejected' && <p className="muted">The driver could not take this shipment. You can post it again or pick another truck.</p>}

      {b.trip && active && (
        <div className="trackbox">
          {live ? (
            <p>
              📍 Truck is <b>{Math.round(b.trip.distanceToNextStopKm)} km</b> from <b>{b.trip.nextStop}</b> · ETA {fmtMinutes(b.trip.etaNextStopMinutes)}
            </p>
          ) : (
            <p className="muted">Trip has not started yet.</p>
          )}
          <RouteMap stops={b.trip.stops} truck={live ? b.trip.currentLocation : null} highlights={highlights} height={190} />
          {b.driver.phone && <p className="small">Driver: {b.driver.name} · 📞 {b.driver.phone}</p>}
        </div>
      )}

      {b.trip?.myCargo?.length > 0 && (
        <p className="small muted">Your cargo on the truck: {b.trip.myCargo.map((c) => `${c.label} (${c.status})`).join(', ')}</p>
      )}

      <footer className="truck-foot">
        {['requested', 'accepted'].includes(b.status) && (
          <button className="btn ghost" disabled={busy} onClick={() => onAction(`/bookings/${b.id}/cancel`)}>Cancel booking</button>
        )}
        {b.status === 'delivered' && !b.rating && (
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              onAction(`/bookings/${b.id}/rate`, { rating, review });
            }}
          >
            <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
              {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{'★'.repeat(n)}</option>)}
            </select>
            <input placeholder="Short review (optional)" value={review} onChange={(e) => setReview(e.target.value)} />
            <button className="btn primary">Rate driver</button>
          </form>
        )}
        {b.rating && <Pill tone="green">Rated {'★'.repeat(b.rating)}</Pill>}
      </footer>
    </article>
  );
}

export default function Customer() {
  const bookings = useLoad(() => api('/bookings/mine'), [], 8000); // refresh to keep live tracking up to date
  const shipments = useLoad(() => api('/shipments/mine'));
  const [form, setForm] = useState(emptyShipment);
  const [msg, setMsg] = useState({ kind: 'error', text: '' });
  const [busy, setBusy] = useState(false);
  const [matches, setMatches] = useState({}); // shipmentId -> results
  const [bookingTrip, setBookingTrip] = useState(null);

  const flash = (text, kind = 'error') => setMsg({ kind, text });

  async function act(path, body) {
    setBusy(true);
    try {
      await api(path, { method: 'POST', body });
      flash('Done.', 'ok');
      bookings.reload();
      shipments.reload();
    } catch (e) {
      flash(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function post() {
    setBusy(true);
    try {
      await api('/shipments', { method: 'POST', body: form });
      setForm(emptyShipment);
      flash('Shipment posted. Drivers whose route fits can now send you an offer, or find a truck yourself below.', 'ok');
      shipments.reload();
    } catch (e) {
      flash(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function findTrucks(id) {
    try {
      const r = await api(`/shipments/${id}/matches`);
      setMatches((m) => ({ ...m, [id]: r }));
    } catch (e) {
      flash(e.message);
    }
  }

  async function request(shipment, trip) {
    setBookingTrip(trip.id);
    try {
      await api('/bookings', { method: 'POST', body: { shipmentId: shipment.id, tripId: trip.id } });
      setMatches((m) => ({ ...m, [shipment.id]: undefined }));
      flash('Request sent to the driver.', 'ok');
      bookings.reload();
      shipments.reload();
    } catch (e) {
      flash(e.message);
    } finally {
      setBookingTrip(null);
    }
  }

  const openShipments = (shipments.data || []).filter((s) => s.status === 'open');

  return (
    <div className="page">
      <h1>My shipments</h1>
      <Alert kind={msg.kind} onClose={() => setMsg({ ...msg, text: '' })}>{msg.text}</Alert>

      <div className="two-col">
        <section>
          <h2>Bookings</h2>
          {bookings.loading && <p className="muted">Loading…</p>}
          {bookings.error && <Alert>{bookings.error}</Alert>}
          {bookings.data?.length === 0 && <Empty>No bookings yet. Search for a truck on the home page, or post a shipment on the right.</Empty>}
          <div className="stack">
            {bookings.data?.map((b) => <BookingCard key={b.id} b={b} onAction={act} busy={busy} />)}
          </div>
        </section>

        <aside>
          <div className="card">
            <h2>Post a shipment</h2>
            <p className="muted small">Not sure which truck? Post it and drivers with a matching route can offer to carry it.</p>
            <ShipmentForm value={form} onChange={setForm} onSubmit={post} submitLabel="Post shipment" busy={busy} />
          </div>

          <h2>Open shipments</h2>
          {openShipments.length === 0 && <Empty>No open shipments.</Empty>}
          {openShipments.map((s) => (
            <div className="card" key={s.id}>
              <header className="truck-head">
                <div>
                  <h4>{s.pickup.name} → {s.drop.name}</h4>
                  <p className="muted small">{kg(s.weightKg)} · {pretty(s.category)} · {rupee(s.offeredPrice)}</p>
                </div>
                <StatusPill status={s.status} />
              </header>
              <div className="row">
                <button className="btn primary" onClick={() => findTrucks(s.id)}>Find trucks</button>
                <button
                  className="btn ghost"
                  onClick={async () => {
                    try {
                      await api(`/shipments/${s.id}`, { method: 'DELETE' });
                      shipments.reload();
                    } catch (e) {
                      flash(e.message);
                    }
                  }}
                >
                  Cancel
                </button>
              </div>
              {matches[s.id] && (
                <div className="stack tight">
                  {matches[s.id].results.length === 0 && <Empty>No truck fits right now. Drivers can still send you an offer.</Empty>}
                  {matches[s.id].results.map(({ trip, match }) => (
                    <TruckCard key={trip.id} trip={trip} match={match} shipment={matches[s.id].shipment} onBook={() => request(s, trip)} busy={bookingTrip === trip.id} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}
