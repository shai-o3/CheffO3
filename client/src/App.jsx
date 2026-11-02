import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { api } from './api.js';
import Home from './pages/Home.jsx';
import RecipePage from './pages/RecipePage.jsx';
import AddRecipe from './pages/AddRecipe.jsx';
import EditRecipe from './pages/EditRecipe.jsx';
import WhatCanICook from './pages/WhatCanICook.jsx';
import ShoppingList from './pages/ShoppingList.jsx';

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

  const refreshMeta = useCallback(() => api.meta().then(setMeta).catch(() => {}), []);
  const refreshCart = useCallback(
    () => api.shopping().then((items) => setCartCount(items.filter((i) => !i.checked).length)).catch(() => {}),
    [],
  );
  useEffect(() => { refreshMeta(); refreshCart(); }, [refreshMeta, refreshCart]);

  const notify = useCallback((msg, kind = 'ok') => {
    setToast({ msg, kind, id: Date.now() });
  }, []);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

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
