import { useEffect, useState } from 'react';
import { formatQty } from '../api.js';

/** Full-screen step-by-step cooking view with timers; keeps the screen awake. */
export default function CookMode({ recipe, factor, onClose }) {
  const [step, setStep] = useState(-1); // -1 = ingredients overview
  const [timer, setTimer] = useState(null); // seconds left
  const total = recipe.steps.length;

  useEffect(() => {
    let lock;
    navigator.wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => {});
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setStep((s) => Math.min(total - 1, s + 1));
      if (e.key === 'ArrowRight') setStep((s) => Math.max(-1, s - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => { lock?.release?.(); window.removeEventListener('keydown', onKey); };
  }, [onClose, total]);

  useEffect(() => {
    if (timer == null) return undefined;
    if (timer <= 0) {
      try { navigator.vibrate?.([300, 200, 300]); } catch { /* ignore */ }
      alert('⏰ הטיימר הסתיים!');
      setTimer(null);
      return undefined;
    }
    const t = setTimeout(() => setTimer((x) => x - 1), 1000);
    return () => clearTimeout(t);
  }, [timer]);

  const cur = recipe.steps[step];
  const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="cook-mode">
      <div className="cook-top">
        <strong>{recipe.emoji} {recipe.title}</strong>
        {timer != null && <span className="cook-timer" onClick={() => setTimer(null)}>⏰ {mmss(timer)}</span>}
        <button type="button" className="btn btn-icon" onClick={onClose}>✕</button>
      </div>
      <div className="cook-progress"><div style={{ width: `${((step + 1) / total) * 100}%` }} /></div>
      <div className="cook-content">
        {step === -1 ? (
          <>
            <h2>מכינים את המצרכים</h2>
            <ul className="cook-ings">
              {recipe.ingredients.map((i) => (
                <li key={i.id}>
                  <span>{i.emoji}</span> <b>{[formatQty(i.quantity != null ? i.quantity * factor : null), i.unit].filter(Boolean).join(' ')}</b> {i.name}
                  {i.note && <small> · {i.note}</small>}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <div className="cook-step-num">שלב {step + 1} מתוך {total}</div>
            <p className="cook-step-text">{cur.text}</p>
            {cur.tip && <p className="tip">💡 {cur.tip}</p>}
            {cur.minutes ? (
              <button type="button" className="btn" onClick={() => setTimer(cur.minutes * 60)}>⏲️ הפעלת טיימר {cur.minutes} דק'</button>
            ) : null}
          </>
        )}
      </div>
      <div className="cook-nav">
        <button type="button" className="btn" disabled={step <= -1} onClick={() => setStep((s) => s - 1)}>→ הקודם</button>
        {step < total - 1 ? (
          <button type="button" className="btn btn-primary" onClick={() => setStep((s) => s + 1)}>{step === -1 ? 'מתחילים!' : 'הבא'} ←</button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={onClose}>🎉 סיימתי! בתאבון</button>
        )}
      </div>
    </div>
  );
}
