import { useEffect, useRef, useState } from 'react';
import { auth } from '../api.js';

/** Avatar button in the header: account settings (name, WhatsApp phone, password) and logout. */
export default function UserMenu({ user, onUser, notify }) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const logout = async () => {
    await auth.logout().catch(() => {});
    window.location.href = '/';
  };

  const initial = (user.name || user.email || '?').trim().charAt(0).toUpperCase();
  return (
    <div className="user-menu" ref={ref}>
      <button type="button" className="avatar" onClick={() => setOpen((o) => !o)} aria-label="החשבון שלי" aria-expanded={open}>
        {user.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" /> : <span>{initial}</span>}
      </button>
      {open && (
        <div className="user-pop">
          <div className="user-pop-head">
            <b>{user.name}</b>
            <small dir="ltr">{user.email}</small>
          </div>
          <button type="button" onClick={() => { setSettings(true); setOpen(false); }}>⚙️ הגדרות</button>
          <button type="button" onClick={logout}>🚪 התנתקות</button>
        </div>
      )}
      {settings && <Settings user={user} onUser={onUser} notify={notify} onClose={() => setSettings(false)} />}
    </div>
  );
}

function Settings({ user, onUser, notify, onClose }) {
  const [name, setName] = useState(user.name || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const updated = await auth.updateMe({ name, phone });
      if (next) await auth.changePassword(current, next);
      onUser(updated);
      notify('✅ ההגדרות נשמרו');
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="card modal" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <h2>⚙️ הגדרות חשבון</h2>
        <label htmlFor="set-name">שם</label>
        <input id="set-name" value={name} onChange={(e) => setName(e.target.value)} />
        <label htmlFor="set-phone">טלפון לוואטסאפ</label>
        <input id="set-phone" type="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="050-1234567" />
        <small className="muted">מתכונים שתשלחו לבוט הוואטסאפ מהמספר הזה יישמרו בחשבון שלכם.</small>
        <h3>{user.hasPassword ? 'שינוי סיסמה' : 'הגדרת סיסמה'}</h3>
        {user.hasPassword && (
          <>
            <label htmlFor="set-current">סיסמה נוכחית</label>
            <input id="set-current" type="password" dir="ltr" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </>
        )}
        <label htmlFor="set-next">סיסמה חדשה</label>
        <input id="set-next" type="password" dir="ltr" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} placeholder="השאירו ריק כדי לא לשנות" />
        {error && <div className="alert alert-error">{error}</div>}
        <div className="row modal-actions">
          <button type="button" className="btn" onClick={onClose}>ביטול</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'שומר...' : 'שמירה'}</button>
        </div>
      </form>
    </div>
  );
}
