import { useEffect } from 'react';
import { createPortal } from 'react-dom';

// Kitchen conversion table (metric system: 1 measuring cup = 250 ml).
const VOLUME = [
  ['4 כוסות', '1 ליטר'],
  ['1 כוס', '250 מ"ל'],
  ['¾ כוס', '175 מ"ל'],
  ['½ כוס', '125 מ"ל'],
  ['⅓ כוס', '80 מ"ל'],
  ['¼ כוס', '60 מ"ל'],
  ['1 כף', '15 מ"ל'],
  ['1 כפית', '5 מ"ל'],
];

const WEIGHT = [
  ['מים / חלב / מיץ תפוזים', '250 גרם', ''],
  ['שמן', '225 גרם', ''],
  ['קמח', '150 גרם', ''],
  ['סוכר לבן / חום בהיר', '200 גרם', '10 גרם'],
  ['סוכר חום כהה', '240 גרם', '15 גרם'],
  ['קורנפלור / אבקת סוכר', '130 גרם', '10 גרם'],
];

const OTHER = [
  ['1 כפית מלח / אבקת סודה לשתייה', '5 גרם', '1 כף = 15 גרם'],
  ['1 שקית אבקת אפייה', '2 כפיות', '10 גרם'],
];

export default function ConversionTable({ onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal conv-modal" role="dialog" aria-label="טבלת המרות" onClick={(e) => e.stopPropagation()}>
        <div className="conv-head">
          <h2>📏 טבלת המרות</h2>
          <button type="button" className="conv-close" onClick={onClose} aria-label="סגירה">✕</button>
        </div>
        <p className="muted conv-note">כל המתכונים מתייחסים לשיטת המדידה המטרית, שבה 1 כוס מדידה שווה ל-250 מ"ל.</p>

        <h3>נפח</h3>
        <table className="conv-table">
          <tbody>
            {VOLUME.map(([a, b]) => (
              <tr key={a}><td>{a}</td><td className="eq">=</td><td>{b}</td></tr>
            ))}
          </tbody>
        </table>

        <h3>משקל מצרכים שונים</h3>
        <table className="conv-table">
          <thead>
            <tr><th>מצרך</th><th>1 כוס</th><th>1 כף</th></tr>
          </thead>
          <tbody>
            {WEIGHT.map(([name, cup, spoon]) => (
              <tr key={name}><td>{name}</td><td>{cup}</td><td>{spoon || '—'}</td></tr>
            ))}
          </tbody>
        </table>

        <table className="conv-table">
          <tbody>
            {OTHER.map(([a, b, c]) => (
              <tr key={a}><td>{a}</td><td className="eq">=</td><td>{b}</td><td className="muted">{c}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>,
    document.body,
  );
}
