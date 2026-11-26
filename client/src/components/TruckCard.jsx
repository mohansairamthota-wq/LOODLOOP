import { useState } from 'react';
import RouteMap from './RouteMap.jsx';
import { CapacityBar, MatchBadge, Pill, StatusPill, kg, fmtMinutes, fmtDate, tripCode, pretty } from './ui.jsx';

// The "Truck Availability Card" - what a customer sees about a truck (public visibility level).
// `shipment` + `match` are optional: when present the card shows how this particular shipment fits.
export default function TruckCard({ trip, shipment, match, onBook, bookLabel = 'Request this truck', busy }) {
  const [showMap, setShowMap] = useState(false);
  const { capacity } = trip;
  const pickupName = shipment?.pickup?.name;
  const dropName = shipment?.drop?.name;
  const here = trip.currentStopIndex;

  const highlights = shipment ? [
    { ...shipment.pickup, label: `Pickup: ${shipment.pickup.name}`, color: '#ff7a1a' },
    { ...shipment.drop, label: `Drop: ${shipment.drop.name}`, color: '#7048e8' }
  ].filter((h) => !trip.stops.some((s) => s.name === h.name)) : [];

  return (
    <article className="card truck">
      <header className="truck-head">
        <div>
          <h3>🚚 Truck #{tripCode(trip.id)}</h3>
          <p className="muted">
            {trip.vehicle.label || pretty(trip.vehicle.type)} · max {kg(trip.vehicle.capacityKg)} · {trip.driver.name}{' '}
            {trip.driver.verified && <Pill tone="green">✔ verified</Pill>}
          </p>
        </div>
        <div className="truck-head-right">
          <StatusPill status={trip.status} />
          {trip.isReturn && <Pill tone="amber">return trip</Pill>}
          {match && (
            <div className="score" title="Overall match score">
              <b>{match.score}%</b>
              <span>match</span>
            </div>
          )}
        </div>
      </header>

      <div className="truck-grid">
        <section>
          <h4>Planned route</h4>
          <ol className="stepper">
            {trip.stops.map((s, i) => {
              const isPick = s.name === pickupName;
              const isDrop = s.name === dropName;
              return (
                <li key={`${s.name}-${i}`} className={i <= here && trip.status === 'in_transit' ? 'done' : ''}>
                  <span className="stepname">{s.name}</span>
                  {i === 0 && <Pill tone="blue">start</Pill>}
                  {i === trip.stops.length - 1 && <Pill tone="green">final destination</Pill>}
                  {isPick && <Pill tone="amber">📦 your pickup</Pill>}
                  {isDrop && <Pill tone="purple">📍 your drop</Pill>}
                  {trip.status === 'in_transit' && i === here && <Pill tone="cyan">🚚 last stop passed</Pill>}
                  {trip.status === 'in_transit' && i === here + 1 && <Pill tone="grey">next stop · {Math.round(trip.distanceToNextStopKm)} km</Pill>}
                </li>
              );
            })}
          </ol>
          <p className="muted small">
            {trip.status === 'in_transit'
              ? `${Math.round(trip.distanceToNextStopKm)} km to ${trip.nextStop} · ETA ${fmtMinutes(trip.etaNextStopMinutes)}`
              : `Departs ${fmtDate(trip.departureTime)} · ${Math.round(trip.totalKm)} km`}
          </p>
        </section>

        <section>
          <h4>Capacity</h4>
          <div className="big-number">
            <b className={capacity.availableKg > 0 ? 'ok' : 'bad'}>{kg(capacity.availableKg)}</b>
            <span>available now</span>
          </div>
          <CapacityBar total={capacity.totalKg} onboard={capacity.onboardKg} extra={shipment && match?.feasible ? shipment.weightKg : 0} />
          <p className="small">
            <b>Cargo on board:</b>{' '}
            {trip.cargoCategories.length ? trip.cargoCategories.map((c) => <Pill key={c}>{pretty(c)}</Pill>) : <span className="muted">empty</span>}
          </p>
        </section>
      </div>

      {match && (
        <div className="matchrow">
          <MatchBadge label={match.label} />
          <span>Route fit <b>{match.route.routeScore}%</b></span>
          <span>Extra distance <b>{match.route.deviationKm} km</b></span>
          <span>Pickup ETA <b>{fmtMinutes(match.route.etaToPickupMinutes)}</b></span>
          <span>After booking free: <b>{kg(match.capacity.freeKg - (shipment?.weightKg || 0))}</b></span>
        </div>
      )}

      {trip.myCargo?.length > 0 && (
        <div className="notice">
          <b>Your cargo on this truck:</b>
          {trip.myCargo.map((c) => (
            <div key={c.id}>{c.label} · {kg(c.weightKg)} · {c.fromName} → {c.toName} · <StatusPill status={c.status} /></div>
          ))}
        </div>
      )}

      <footer className="truck-foot">
        <button className="btn ghost" onClick={() => setShowMap((v) => !v)}>{showMap ? 'Hide map' : '🗺️ View route map'}</button>
        {onBook && (
          <button className="btn accent" disabled={busy} onClick={onBook}>
            {busy ? 'Please wait…' : bookLabel}
          </button>
        )}
      </footer>
      {showMap && (
        <RouteMap stops={trip.stops} truck={trip.status === 'in_transit' ? trip.currentLocation : null} highlights={highlights} />
      )}
    </article>
  );
}
