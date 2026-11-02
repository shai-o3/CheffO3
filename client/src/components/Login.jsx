import { useEffect, useRef, useState } from 'react';
import { auth } from '../api.js';

const GSI_SRC = 'https://accounts.google.com/gsi/client';

function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GSI_SRC}"]`);
    const s = existing || Object.assign(document.createElement('script'), { src: GSI_SRC, async: true });
    s.addEventListener('load', () => resolve());
    s.addEventListener('error', () => reject(new Error('Google script failed')));
    if (!existing) document.head.appendChild(s);
  });
}

/** Login / registration screen: email + password, and "Continue with Google". */
export default function Login({ session, onLoggedIn }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const googleRef = useRef(null);

  useEffect(() => {
    if (!session?.googleClientId) return undefined;
    let cancelled = false;
    loadGoogleScript().then(() => {
      if (cancelled || !googleRef.current) return;
      window.google.accounts.id.initialize({
        client_id: session.googleClientId,
        callback: async ({ credential }) => {
          setBusy(true);
          setError('');
          try {
            const { user } = await auth.google(credential);
            onLoggedIn(user);
          } catch (e) {
            setError(e.message);
            setBusy(false);
          }
        },
      });
      window.google.accounts.id.renderButton(googleRef.current, {
        theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill', locale: 'he',
        width: Math.min(320, googleRef.current.offsetWidth || 320),
      });
    }).catch(() => setError('לא ניתן לטעון את הכניסה עם Google כרגע'));
    return () => { cancelled = true; };
  }, [session?.googleClientId, onLoggedIn]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { user } = mode === 'login' ? await auth.login(email, password) : await auth.register({ name, email, password });
      onLoggedIn(user);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="card login-card">
        <div className="brand-logo login-logo">👨‍🍳</div>
        <h1>CheffO3</h1>
        <p className="muted">ספר המתכונים החכם שלך</p>

        <div className="tabs login-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'login'} className={`tab ${mode === 'login' ? 'active' : ''}`} onClick={() => { setMode('login'); setError(''); }}>כניסה</button>
          <button type="button" role="tab" aria-selected={mode === 'register'} className={`tab ${mode === 'register' ? 'active' : ''}`} onClick={() => { setMode('register'); setError(''); }}>הרשמה</button>
        </div>

        {session?.googleClientId && (
          <>
            <div ref={googleRef} className="google-btn" />
            <div className="or"><span>או</span></div>
          </>
        )}

        <form className="login-form" onSubmit={submit}>
          {mode === 'register' && (
            <>
              <label htmlFor="name">שם</label>
              <input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="איך לקרוא לך?" />
            </>
          )}
          <label htmlFor="email">אימייל</label>
          <input id="email" type="email" dir="ltr" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <label htmlFor="password">סיסמה</label>
          <input
            id="password" type="password" dir="ltr" required minLength={mode === 'register' ? 8 : undefined}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password} onChange={(e) => setPassword(e.target.value)}
          />
          {mode === 'register' && <small className="muted">לפחות 8 תווים</small>}
          {error && <div className="alert alert-error">{error}</div>}
          <button className="btn btn-primary btn-lg" disabled={busy}>
            {busy ? 'רק רגע...' : mode === 'login' ? 'כניסה' : 'יצירת חשבון'}
          </button>
        </form>
        {mode === 'register' && session?.signupRestricted && (
          <small className="muted">ההרשמה פתוחה רק לכתובות שאושרו על ידי מנהל האפליקציה.</small>
        )}
      </div>
    </div>
  );
}
