import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth, homeFor } from '../auth.jsx';
import { Alert } from '../components/ui.jsx';

const DEMO = [
  ['Customer', 'anitha@loadloop.in'],
  ['Driver', 'ravi@loadloop.in'],
  ['Admin', 'admin@loadloop.in']
];

export default function Login() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState(params.get('mode') === 'register' ? 'register' : 'login');
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', company: '', role: params.get('role') === 'driver' ? 'driver' : 'customer' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const user = mode === 'login' ? await login(form.email, form.password) : await register(form);
      navigate(homeFor(user));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page narrow">
      <div className="card">
        <div className="tabs">
          <button className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>Log in</button>
          <button className={mode === 'register' ? 'on' : ''} onClick={() => setMode('register')}>Create account</button>
        </div>
        <form className="form" onSubmit={submit}>
          {mode === 'register' && (
            <>
              <div className="roles">
                {['customer', 'driver'].map((r) => (
                  <label key={r} className={`rolecard ${form.role === r ? 'on' : ''}`}>
                    <input type="radio" name="role" checked={form.role === r} onChange={() => setForm({ ...form, role: r })} />
                    <span>{r === 'customer' ? '📦 I have goods to send' : '🚚 I drive / own a truck'}</span>
                  </label>
                ))}
              </div>
              <label>Full name<input required value={form.name} onChange={set('name')} /></label>
              <label>Phone<input value={form.phone} onChange={set('phone')} /></label>
              {form.role === 'customer' && <label>Company (optional)<input value={form.company} onChange={set('company')} /></label>}
            </>
          )}
          <label>Email<input required type="email" value={form.email} onChange={set('email')} /></label>
          <label>Password<input required type="password" minLength={mode === 'register' ? 6 : undefined} value={form.password} onChange={set('password')} /></label>
          <Alert onClose={() => setError('')}>{error}</Alert>
          <button className="btn primary" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}</button>
          {mode === 'register' && form.role === 'driver' && (
            <p className="hint">New drivers are listed publicly after an admin verifies them. You can create trips straight away.</p>
          )}
        </form>
      </div>

      {mode === 'login' && (
        <div className="card demo">
          <h4>Demo accounts</h4>
          <p className="muted small">Password for all: <code>password123</code> (demo data is loaded when the server starts without MONGO_URI or after <code>npm run seed</code>)</p>
          <div className="chips">
            {DEMO.map(([label, email]) => (
              <button key={email} className="chip" onClick={() => setForm({ ...form, email, password: 'password123' })}>{label}: {email}</button>
            ))}
          </div>
        </div>
      )}
      <p className="center muted small"><Link to="/">← Back to search</Link></p>
    </div>
  );
}
