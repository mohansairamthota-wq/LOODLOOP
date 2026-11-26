import { useState } from 'react';
import { api } from '../api.js';
import { Alert, Pill, StatusPill, useLoad, rupee, kg, fmtDate, tripCode, pretty } from '../components/ui.jsx';

const TABS = ['Overview', 'Users', 'Trips', 'Bookings'];

export default function Admin() {
  const [tab, setTab] = useState('Overview');
  const [error, setError] = useState('');
  const stats = useLoad(() => api('/admin/stats'), [], 15000);
  const users = useLoad(() => api('/admin/users'), []);
  const trips = useLoad(() => api('/admin/trips'), []);
  const bookings = useLoad(() => api('/admin/bookings'), []);

  async function post(path, body) {
    try {
      await api(path, { method: 'POST', body });
      users.reload();
      stats.reload();
    } catch (e) {
      setError(e.message);
    }
  }

  const s = stats.data;
  return (
    <div className="page">
      <h1>Admin</h1>
      <div className="tabs">
        {TABS.map((t) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      <Alert onClose={() => setError('')}>{error}</Alert>

      {tab === 'Overview' && s && (
        <>
          <div className="stats">
            <div className="stat"><b>{s.customers}</b><span>customers</span></div>
            <div className="stat"><b>{s.drivers}</b><span>drivers</span></div>
            <div className="stat warn"><b>{s.pendingDrivers}</b><span>drivers awaiting verification</span></div>
            <div className="stat"><b>{s.vehicles}</b><span>vehicles</span></div>
            <div className="stat"><b>{s.activeTrips}/{s.trips}</b><span>active / total trips</span></div>
            <div className="stat"><b>{s.openShipments}</b><span>open shipments</span></div>
            <div className="stat"><b>{s.bookings}</b><span>bookings ({s.deliveredBookings} delivered)</span></div>
            <div className="stat"><b>{rupee(s.grossBookingValue)}</b><span>delivered booking value</span></div>
            <div className="stat good"><b>{rupee(s.platformRevenue)}</b><span>platform revenue (5% commission)</span></div>
          </div>
        </>
      )}

      {tab === 'Users' && (
        <div className="card scroll">
          <table className="table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th /></tr></thead>
            <tbody>
              {users.data?.map((u) => (
                <tr key={u._id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td><Pill tone={u.role === 'admin' ? 'purple' : u.role === 'driver' ? 'cyan' : 'blue'}>{u.role}</Pill></td>
                  <td>
                    {u.suspended ? <Pill tone="red">suspended</Pill> : u.role === 'driver' ? (u.verified ? <Pill tone="green">verified</Pill> : <Pill tone="amber">unverified</Pill>) : <Pill tone="green">active</Pill>}
                  </td>
                  <td className="actions">
                    {u.role === 'driver' && <button className="btn mini-btn" onClick={() => post(`/admin/users/${u._id}/verify`, { verified: !u.verified })}>{u.verified ? 'Unverify' : 'Verify'}</button>}
                    {u.role !== 'admin' && <button className="btn mini-btn danger" onClick={() => post(`/admin/users/${u._id}/suspend`, { suspended: !u.suspended })}>{u.suspended ? 'Reinstate' : 'Suspend'}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'Trips' && (
        <div className="card scroll">
          <table className="table">
            <thead><tr><th>Trip</th><th>Route</th><th>Driver</th><th>Capacity</th><th>Status</th></tr></thead>
            <tbody>
              {trips.data?.map((t) => (
                <tr key={t.id}>
                  <td>#{tripCode(t.id)}{t.isReturn ? ' ↩' : ''}</td>
                  <td>{t.stops.map((x) => x.name).join(' → ')}</td>
                  <td>{t.driver.name} {t.driver.verified ? '' : <Pill tone="amber">unverified</Pill>}</td>
                  <td>{kg(t.capacity.onboardKg)} / {kg(t.capacity.totalKg)}</td>
                  <td><StatusPill status={t.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'Bookings' && (
        <div className="card scroll">
          <table className="table">
            <thead><tr><th>Date</th><th>Shipment</th><th>Customer</th><th>Driver</th><th>Price</th><th>Commission</th><th>Status</th></tr></thead>
            <tbody>
              {bookings.data?.map((b) => (
                <tr key={b._id}>
                  <td>{fmtDate(b.createdAt)}</td>
                  <td>{b.shipment?.pickup?.name} → {b.shipment?.drop?.name} · {kg(b.shipment?.weightKg)} · {pretty(b.shipment?.category)}</td>
                  <td>{b.customer?.name}</td>
                  <td>{b.driver?.name}</td>
                  <td>{rupee(b.price)}</td>
                  <td>{rupee(b.commission)}</td>
                  <td><StatusPill status={b.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
