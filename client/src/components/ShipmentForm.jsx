import { useEffect, useState } from 'react';
import { api, qs } from '../api.js';
import { pretty, rupee } from './ui.jsx';

export function useMeta() {
  const [cities, setCities] = useState([]);
  const [categories, setCategories] = useState([]);
  useEffect(() => {
    api('/shipments/meta/cities').then(setCities).catch(() => {});
    api('/shipments/meta/categories').then(setCategories).catch(() => {});
  }, []);
  return { cities, categories };
}

export const emptyShipment = { pickup: '', drop: '', weightKg: '', volumeCbm: '', category: 'general', offeredPrice: '', description: '' };

// Shared by the home-page search and the "post a shipment" form.
export default function ShipmentForm({ value, onChange, onSubmit, submitLabel, busy, showDescription = true }) {
  const { cities, categories } = useMeta();
  const [quote, setQuote] = useState(null);
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });

  useEffect(() => {
    if (!value.pickup || !value.drop || !(Number(value.weightKg) > 0) || value.pickup === value.drop) {
      setQuote(null);
      return;
    }
    let alive = true;
    api(`/shipments/quote?${qs({ pickup: value.pickup, drop: value.drop, weight: value.weightKg })}`)
      .then((q) => alive && setQuote(q))
      .catch(() => alive && setQuote(null));
    return () => {
      alive = false;
    };
  }, [value.pickup, value.drop, value.weightKg]);

  return (
    <form
      className="form grid-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label>
        Pickup city
        <select required value={value.pickup} onChange={set('pickup')}>
          <option value="">Select…</option>
          {cities.map((c) => <option key={c.name}>{c.name}</option>)}
        </select>
      </label>
      <label>
        Drop city
        <select required value={value.drop} onChange={set('drop')}>
          <option value="">Select…</option>
          {cities.filter((c) => c.name !== value.pickup).map((c) => <option key={c.name}>{c.name}</option>)}
        </select>
      </label>
      <label>
        Weight (kg)
        <input required type="number" min="1" placeholder="e.g. 500" value={value.weightKg} onChange={set('weightKg')} />
      </label>
      <label>
        Cargo type
        <select value={value.category} onChange={set('category')}>
          {categories.map((c) => <option key={c} value={c}>{pretty(c)}</option>)}
        </select>
      </label>
      <label>
        Volume (m³, optional)
        <input type="number" min="0" step="0.1" value={value.volumeCbm} onChange={set('volumeCbm')} />
      </label>
      <label>
        Your offer (₹)
        <input type="number" min="0" placeholder={quote ? `Suggested ${rupee(quote.suggestedPrice)}` : 'Leave blank for suggested price'} value={value.offeredPrice} onChange={set('offeredPrice')} />
      </label>
      {showDescription && (
        <label className="wide">
          Cargo details <span className="muted">(private – only the driver you book will see this)</span>
          <input placeholder="e.g. 40 boxed LED TVs, handle with care" value={value.description} onChange={set('description')} />
        </label>
      )}
      {quote && (
        <p className="hint wide">
          Distance ≈ <b>{quote.distanceKm} km</b> · suggested price <b>{rupee(quote.suggestedPrice)}</b>
        </p>
      )}
      <div className="wide">
        <button className="btn primary" disabled={busy}>{busy ? 'Please wait…' : submitLabel}</button>
      </div>
    </form>
  );
}
