import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import ShipmentForm, { emptyShipment } from '../components/ShipmentForm.jsx';
import TruckCard from '../components/TruckCard.jsx';
import { Alert, Empty } from '../components/ui.jsx';

const IDEAS = [
  ['↩️', 'Return-trip loads', 'A truck delivering to Hyderabad no longer has to drive back empty – its return journey is bookable.'],
  ['📊', 'Live capacity', 'Available capacity = total capacity − cargo on board. It updates at every pickup and delivery.'],
  ['🗺️', 'Route-aware matching', 'Shipments are matched along the whole journey, not just at the final destination.'],
  ['💰', 'Profit estimate', 'Drivers see extra revenue minus fuel, toll and detour cost before they say yes.']
];

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyShipment);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [bookingId, setBookingId] = useState(null);

  async function search() {
    setBusy(true);
    setError('');
    try {
      const r = await api(`/shipments/search/trucks?${qs(form)}`);
      setResult(r);
    } catch (e) {
      setError(e.message);
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  async function book(trip) {
    if (!user) return navigate('/login?mode=register&role=customer');
    if (user.role !== 'customer') return setError('Please use a customer account to book a truck.');
    setBookingId(trip.id);
    setError('');
    try {
      const shipment = await api('/shipments', {
        method: 'POST',
        body: { ...form, offeredPrice: form.offeredPrice || result.shipment.offeredPrice }
      });
      await api('/bookings', { method: 'POST', body: { shipmentId: shipment.id, tripId: trip.id } });
      navigate('/customer');
    } catch (e) {
      setError(e.message);
    } finally {
      setBookingId(null);
    }
  }

  return (
    <div className="page">
      <section className="hero">
        <div>
          <h1>Fill the empty space on every truck.</h1>
          <p>
            LoadLoop shows exactly how much room a truck has <b>right now</b>, where it is going, and which shipments fit along the
            way – including the return trip.
          </p>
        </div>
        <div className="card search">
          <h2>Send something</h2>
          <ShipmentForm value={form} onChange={setForm} onSubmit={search} submitLabel="🔍 Find trucks on my route" busy={busy && !bookingId} />
        </div>
      </section>

      <Alert onClose={() => setError('')}>{error}</Alert>

      {result && (
        <section>
          <h2>
            {result.results.length
              ? `${result.results.length} truck${result.results.length > 1 ? 's' : ''} can carry your shipment`
              : 'No truck on this route has space right now'}
          </h2>
          <p className="muted">
            {result.shipment.pickup.name} → {result.shipment.drop.name} · {result.shipment.weightKg} kg · ≈{result.shipment.distanceKm} km
          </p>
          {result.results.length === 0 && (
            <Empty>
              Try a nearby city or a smaller weight, or log in and post the shipment – drivers whose route matches can send you an offer.
            </Empty>
          )}
          <div className="stack">
            {result.results.map(({ trip, match }) => (
              <TruckCard
                key={trip.id}
                trip={trip}
                match={match}
                shipment={{ ...result.shipment, weightKg: Number(form.weightKg) }}
                onBook={() => book(trip)}
                busy={bookingId === trip.id}
                bookLabel={user ? 'Request this truck' : 'Sign up to book'}
              />
            ))}
          </div>
        </section>
      )}

      {!result && (
        <section className="ideas">
          {IDEAS.map(([icon, title, text]) => (
            <div className="card idea" key={title}>
              <div className="icon">{icon}</div>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
