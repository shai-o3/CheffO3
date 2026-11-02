import { useState } from 'react';
import { login } from '../api.js';

export default function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(password);
      window.location.reload();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="card login-card" onSubmit={submit}>
        <div className="brand-logo login-logo">👨‍🍳</div>
        <h1>CheffO3</h1>
        <p className="muted">ספר המתכונים שלך מוגן בסיסמה.</p>
        <label htmlFor="password">סיסמה</label>
        <input id="password" type="password" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <div className="alert alert-error">{error}</div>}
        <button className="btn btn-primary btn-lg" disabled={busy || !password}>{busy ? 'מתחבר...' : 'כניסה'}</button>
      </form>
    </div>
  );
}
