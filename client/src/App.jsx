import { Routes, Route, Navigate, NavLink, Link, useNavigate } from 'react-router-dom';
import { useAuth, homeFor } from './auth.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import Customer from './pages/Customer.jsx';
import Driver from './pages/Driver.jsx';
import NewTrip from './pages/NewTrip.jsx';
import TripDetail from './pages/TripDetail.jsx';
import Admin from './pages/Admin.jsx';

function Protected({ role, children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="page"><p className="muted">Loading…</p></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to={homeFor(user)} replace />;
  return children;
}

function Nav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <header className="nav">
      <Link to="/" className="brand">
        <span className="brand-mark">🚚</span> Load<b>Loop</b>
      </Link>
      <nav>
        <NavLink to="/" end>Find a truck</NavLink>
        {user?.role === 'customer' && <NavLink to="/customer">My shipments</NavLink>}
        {user?.role === 'driver' && <NavLink to="/driver">My trips</NavLink>}
        {user?.role === 'admin' && <NavLink to="/admin">Admin</NavLink>}
      </nav>
      <div className="nav-right">
        {user ? (
          <>
            <span className="who">
              {user.name} <em>{user.role}</em>
            </span>
            <button className="btn ghost light" onClick={() => { logout(); navigate('/'); }}>Log out</button>
          </>
        ) : (
          <>
            <Link className="btn ghost light" to="/login">Log in</Link>
            <Link className="btn accent" to="/login?mode=register">Sign up</Link>
          </>
        )}
      </div>
    </header>
  );
}

export default function App() {
  return (
    <>
      <Nav />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/customer" element={<Protected role="customer"><Customer /></Protected>} />
          <Route path="/driver" element={<Protected role="driver"><Driver /></Protected>} />
          <Route path="/driver/new-trip" element={<Protected role="driver"><NewTrip /></Protected>} />
          <Route path="/driver/trips/:id" element={<Protected role="driver"><TripDetail /></Protected>} />
          <Route path="/admin" element={<Protected role="admin"><Admin /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="footer">LoadLoop · route-aware truck capacity · college project demo</footer>
    </>
  );
}
