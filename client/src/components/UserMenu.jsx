import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { auth } from '../api.js';
import GoogleButton from './GoogleButton.jsx';

/** Round profile picture, falling back to the first letter of the name. */
export function Avatar({ user, size = 40 }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [user.picture]);
  const initial = (user.name || user.email || '?').trim().charAt(0).toUpperCase();
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {user.picture && !broken
        ? <img src={user.picture} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
        : <span>{initial}</span>}
    </span>
  );
}

/** Avatar button in the header: account settings (name, WhatsApp phone, password) and logout. */
export default function UserMenu({ user, onUser, notify, googleClientId }) {
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

  return (
    <div className="user-menu" ref={ref}>
      <button type="button" className="avatar-btn" onClick={() => setOpen((o) => !o)} aria-label="החשבון שלי" aria-expanded={open}>
        <Avatar user={user} />
      </button>
      {open && (
        <div className="user-pop">
          <div className="user-pop-head">
            <b>{user.name}</b>
            <small dir="ltr">{user.email}</small>
          </div>
          <button type="button" onClick={() => { setSettings(true); setOpen(false); }}>⚙️ הגדרות</button>
          <Link to="/about" onClick={() => setOpen(false)}>ℹ️ אודות</Link>
          <button type="button" onClick={logout}>🚪 התנתקות</button>
        </div>
      )}
      {settings && <Settings user={user} onUser={onUser} notify={notify} googleClientId={googleClientId} onClose={() => setSettings(false)} />}
    </div>
  );
}

function Settings({ user, onUser, notify, googleClientId, onClose }) {
  const [name, setName] = useState(user.name || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [grokEmail, setGrokEmail] = useState(user.grokEmail || '');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const pictureAction = async (fn, message) => {
    setError('');
    try {
      onUser(await fn());
      notify(message);
    } catch (err) {
      setError(err.message);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const updated = await auth.updateMe({ name, phone, grokEmail });
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

  // Rendered into <body>: the sticky header's backdrop-filter would otherwise clip it.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <form className="card modal" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <h2>⚙️ הגדרות חשבון</h2>
        <div className="profile-picture">
          <Avatar user={user} size={72} />
          <div className="profile-picture-actions">
            <button type="button" className="btn btn-sm" onClick={() => fileRef.current.click()}>📷 העלאת תמונה</button>
            {user.hasUploadedPicture && (
              <button type="button" className="btn btn-sm" onClick={() => pictureAction(auth.removePicture, 'התמונה הוסרה')}>
                {user.googleLinked ? 'חזרה לתמונה מ-Google' : 'הסרת התמונה'}
              </button>
            )}
            <input
              ref={fileRef} type="file" accept="image/*" hidden
              onChange={(e) => e.target.files[0] && pictureAction(() => auth.uploadPicture(e.target.files[0]), '📷 התמונה עודכנה')}
            />
          </div>
        </div>
        {googleClientId && !user.googleLinked && (
          <div className="link-google">
            <small className="muted">חיבור חשבון Google מוסיף את תמונת הפרופיל שלך, ומאפשר כניסה גם עם Google.</small>
            <GoogleButton clientId={googleClientId} text="signin_with" onCredential={(c) => pictureAction(() => auth.linkGoogle(c), '✅ חשבון Google חובר')} />
          </div>
        )}
        {user.googleLinked && <small className="muted">✓ מחובר לחשבון Google</small>}
        <label htmlFor="set-name">שם</label>
        <input id="set-name" value={name} onChange={(e) => setName(e.target.value)} />
        <label htmlFor="set-grok">מייל לגרוק</label>
        <input id="set-grok" type="email" dir="ltr" value={grokEmail} onChange={(e) => setGrokEmail(e.target.value)} placeholder="name@example.com" />
        <small className="muted">לשם תישלח רשימת הקניות בלחיצה על כפתור גרוק ברשימת הקניות.</small>
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
    </div>,
    document.body,
  );
}
