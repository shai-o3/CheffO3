import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { api, auth } from './api.js';
import Home from './pages/Home.jsx';
import RecipePage from './pages/RecipePage.jsx';
import AddRecipe from './pages/AddRecipe.jsx';
import EditRecipe from './pages/EditRecipe.jsx';
import WhatCanICook from './pages/WhatCanICook.jsx';
import ShoppingList from './pages/ShoppingList.jsx';
import Login from './components/Login.jsx';
import UserMenu from './components/UserMenu.jsx';

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

const NAV = [
  { to: '/', label: 'המתכונים שלי', icon: '📖', end: true },
  { to: '/add', label: 'הוספת מתכון', icon: '➕' },
  { to: '/cook', label: 'מה מבשלים?', icon: '🧺' },
  { to: '/shopping', label: 'רשימת קניות', icon: '🛒' },
];

export default function App() {
  const [meta, setMeta] = useState(null);
  const [toast, setToast] = useState(null);
  const [cartCount, setCartCount] = useState(0);
  const [needLogin, setNeedLogin] = useState(false);
  // undefined = loading; null = server without accounts (local server / demo); object = accounts enabled
  const [session, setSession] = useState(undefined);
  const [user, setUser] = useState(null);

  const [sessionError, setSessionError] = useState('');

  const loadSession = useCallback(() => {
    setSessionError('');
    auth.session().then((s) => {
      // Only skip the login screen when the server explicitly says it has no accounts.
      if (s && s.authRequired === false) { setSession(null); return; }
      if (!s || s.authRequired !== true) throw new Error('תשובה לא צפויה מהשרת');
      setSession(s);
      setUser(s.user || null);
    }).catch((e) => setSessionError(e.message));
  }, []);
  useEffect(() => { loadSession(); }, [loadSession]);
  const ready = session === null || !!user;

  useEffect(() => {
    const onAuth = () => setNeedLogin(true);
    window.addEventListener('cheffo3-auth', onAuth);
    return () => window.removeEventListener('cheffo3-auth', onAuth);
  }, []);

  const refreshMeta = useCallback(() => api.meta().then(setMeta).catch(() => {}), []);
  const refreshCart = useCallback(
    () => api.shopping().then((items) => setCartCount(items.filter((i) => !i.checked).length)).catch(() => {}),
    [],
  );
  useEffect(() => {
    if (ready) { refreshMeta(); refreshCart(); }
  }, [ready, user?.id, refreshMeta, refreshCart]);

  const notify = useCallback((msg, kind = 'ok') => {
    setToast({ msg, kind, id: Date.now() });
  }, []);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const onLoggedIn = useCallback((u) => {
    setUser(u);
    setNeedLogin(false);
  }, []);

  if (sessionError) {
    return (
      <div className="login">
        <div className="card login-card">
          <div className="brand-logo login-logo">👨‍🍳</div>
          <h1>CheffO3</h1>
          <div className="alert alert-error">לא ניתן להתחבר לשרת: {sessionError}</div>
          <button type="button" className="btn btn-primary" onClick={loadSession}>ניסיון חוזר</button>
        </div>
      </div>
    );
  }
  if (session === undefined) return <div className="loading splash">👨‍🍳</div>;
  if ((session && !user) || needLogin) return <Login session={session} onLoggedIn={onLoggedIn} />;

  return (
    <AppCtx.Provider value={{ meta, refreshMeta, notify, refreshCart }}>
      <header className="topbar">
        <NavLink to="/" className="brand">
          <span className="brand-logo">👨‍🍳</span>
          <span>
            <strong>CheffO3</strong>
            <small>ספר המתכונים החכם</small>
          </span>
        </NavLink>
        <nav className="nav">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className="nav-link">
              <span className="nav-icon">{n.icon}</span>
              <span className="nav-label">{n.label}</span>
              {n.to === '/shopping' && cartCount > 0 && <span className="badge">{cartCount}</span>}
            </NavLink>
          ))}
        </nav>
        {user && <UserMenu user={user} onUser={setUser} notify={notify} googleClientId={session?.googleClientId} />}
      </header>
      <main className="container">
        {meta?.demo && (
          <div className="demo-banner">
            <b>גרסת הדגמה.</b> המתכונים ורשימת הקניות נשמרים רק בדפדפן שלך. קריאת מתכון מצילום מסך, הצעות השף ותמונות המוצרים משופרסל עובדים בגרסה המלאה, כשהשרת רץ עם מפתח API.
          </div>
        )}
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/recipes/:id" element={<RecipePage />} />
          <Route path="/recipes/:id/edit" element={<EditRecipe />} />
          <Route path="/add" element={<AddRecipe />} />
          <Route path="/cook" element={<WhatCanICook />} />
          <Route path="/shopping" element={<ShoppingList />} />
          <Route path="*" element={<div className="empty">העמוד לא נמצא 🤷</div>} />
        </Routes>
      </main>
      {toast && <div key={toast.id} className={`toast toast-${toast.kind}`}>{toast.msg}</div>}
    </AppCtx.Provider>
  );
}
