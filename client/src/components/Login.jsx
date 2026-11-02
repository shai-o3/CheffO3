import { useState } from 'react';
import { auth } from '../api.js';
import GoogleButton from './GoogleButton.jsx';

/** Login / registration screen: email + password, and "Continue with Google". */
export default function Login({ session, onLoggedIn }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onGoogle = async (credential) => {
    setBusy(true);
    setError('');
    try {
      const { user } = await auth.google(credential);
      onLoggedIn(user);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

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
            <GoogleButton clientId={session.googleClientId} onCredential={onGoogle} />
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
