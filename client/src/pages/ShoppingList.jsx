import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatQty, shufersalLink, whatsappLink } from '../api.js';
import { useApp } from '../App.jsx';
import IngredientImage from '../components/IngredientImage.jsx';
import { WhatsAppIcon, CopyIcon, PrintIcon } from '../components/Icons.jsx';
import { shufersalQuickList, SHUFERSAL_QUICK_ORDER_URL } from '../shufersalList.js';

export default function ShoppingList() {
  const { notify, refreshCart } = useApp();
  const [items, setItems] = useState(null);
  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('');
  const [waText, setWaText] = useState('');

  const load = () => api.shopping().then((x) => { setItems(x); refreshCart(); });
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (items) api.shoppingWhatsApp().then((r) => setWaText(r.text)).catch(() => {});
  }, [items]);

  const groups = useMemo(() => {
    const g = new Map();
    for (const i of (items || []).filter((x) => !x.checked)) {
      if (!g.has(i.category)) g.set(i.category, []);
      g.get(i.category).push(i);
    }
    return [...g.entries()];
  }, [items]);
  const done = (items || []).filter((x) => x.checked);

  const toggle = async (item) => {
    setItems((list) => list.map((x) => (x.id === item.id ? { ...x, checked: !x.checked } : x)));
    await api.updateShopping(item.id, { checked: !item.checked });
    refreshCart();
  };
  const add = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setItems(await api.addShopping({ name, quantity: qty || null, unit }));
    setName(''); setQty(''); setUnit('');
    refreshCart();
  };
  const del = async (id) => { await api.deleteShopping(id); load(); };
  const [showQuick, setShowQuick] = useState(false);
  const quickList = useMemo(() => shufersalQuickList(items || []), [items]);

  // Copy the list in Shufersal's quick-order format and let the link open Shufersal.
  const toShufersal = () => {
    navigator.clipboard.writeText(quickList)
      .then(() => notify('📋 הרשימה הועתקה. בשופרסל: הזמנה מהירה ← הדבקה ← "צרו לי רשימה"'))
      .catch(() => { setShowQuick(true); notify('לא ניתן להעתיק אוטומטית – העתיקו את הרשימה מהתיבה', 'warn'); });
  };

  const copy = () => {
    navigator.clipboard.writeText(waText.replace(/\*/g, ''))
      .then(() => notify('📋 הרשימה הועתקה'))
      .catch(() => notify('לא ניתן להעתיק בדפדפן הזה', 'error'));
  };

  if (!items) return <div className="loading">טוען...</div>;
  const recipes = [...new Map(items.flatMap((i) => i.recipes).map((r) => [r.id, r])).values()];

  return (
    <>
      <div className="page-head">
        <h1>🛒 רשימת קניות</h1>
      </div>
      {items.length > 0 && (
        <div className="icon-actions shop-actions">
          <a className="icon-btn wa" href={whatsappLink(waText)} target="_blank" rel="noreferrer" title="שליחה בוואטסאפ" aria-label="שליחה בוואטסאפ"><WhatsAppIcon /></a>
          <button type="button" className="icon-btn print-btn" onClick={() => window.print()} title="הדפסה" aria-label="הדפסה"><PrintIcon /></button>
          <button type="button" className="icon-btn" onClick={copy} title="העתקת הרשימה" aria-label="העתקת הרשימה"><CopyIcon /></button>
        </div>
      )}
      {quickList && (
        <section className="shufersal-box">
          <a className="btn shufersal-btn" href={SHUFERSAL_QUICK_ORDER_URL} target="_blank" rel="noreferrer" onClick={toShufersal}>
            🛍️ העברה לשופרסל – הזמנה מהירה
          </a>
          <ol className="shufersal-steps">
            <li>הכפתור מעתיק את הרשימה ופותח את שופרסל (באפליקציה, אם היא מותקנת).</li>
            <li>בתפריט של שופרסל בוחרים <b>הזמנה מהירה</b>.</li>
            <li>לוחצים לחיצה ארוכה בתיבה ← <b>הדבקה</b> ← <b>צרו לי רשימה</b>, ומשלמים בשופרסל.</li>
          </ol>
          <button type="button" className="link-btn" onClick={() => setShowQuick((v) => !v)}>
            {showQuick ? 'הסתרת הרשימה' : `הצגת הרשימה שתועתק (${quickList.split('\n').length} מוצרים)`}
          </button>
          {showQuick && <textarea className="shufersal-text" readOnly rows={Math.min(12, quickList.split('\n').length)} value={quickList} onFocus={(e) => e.target.select()} />}
        </section>
      )}

      <form className="card row add-item" onSubmit={add}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="הוספת מוצר..." />
        <input className="narrow" type="number" step="any" min="0" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="כמות" />
        <input className="narrow" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="יחידה" />
        <button className="btn btn-primary">+</button>
      </form>

      {recipes.length > 0 && (
        <div className="chips from-recipes">
          <small>מתוך:</small>
          {recipes.map((r) => <Link key={r.id} to={`/recipes/${r.id}`} className="chip chip-sm">{r.title}</Link>)}
        </div>
      )}

      {items.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">🛒</div>
          <p>הרשימה ריקה. הוסיפו מצרכים ממתכון בלחיצה על "לרשימת הקניות".</p>
          <Link to="/" className="btn btn-primary">למתכונים</Link>
        </div>
      ) : (
        <div className="shopping">
          {groups.map(([cat, list]) => (
            <section key={cat} className="card shop-group">
              <h2>{cat} <small>({list.length})</small></h2>
              <ul>
                {list.map((i) => <ShopItem key={i.id} item={i} onToggle={toggle} onDelete={del} />)}
              </ul>
            </section>
          ))}
          {done.length > 0 && (
            <section className="card shop-group done">
              <h2>✓ נאסף ({done.length}) <button type="button" className="btn btn-sm" onClick={async () => { setItems(await api.clearShopping(true)); refreshCart(); }}>ניקוי</button></h2>
              <ul>{done.map((i) => <ShopItem key={i.id} item={i} onToggle={toggle} onDelete={del} />)}</ul>
            </section>
          )}
          <button
            type="button"
            className="btn danger"
            onClick={async () => { if (confirm('לנקות את כל הרשימה?')) { setItems(await api.clearShopping(false)); refreshCart(); } }}
          >🗑️ ניקוי כל הרשימה</button>
        </div>
      )}
    </>
  );
}

function ShopItem({ item, onToggle, onDelete }) {
  return (
    <li className={`shop-item ${item.checked ? 'checked' : ''}`}>
      <input type="checkbox" checked={item.checked} onChange={() => onToggle(item)} />
      <IngredientImage name={item.name} term={item.search_term} emoji={item.emoji} size={44} />
      <div className="shop-text" onClick={() => onToggle(item)}>
        <span className="ing-name">{item.name}</span>
        {(item.quantity != null || item.unit) && <span className="ing-qty">{[formatQty(item.quantity), item.unit].filter(Boolean).join(' ')}</span>}
      </div>
      <a className="btn btn-icon btn-sm" href={shufersalLink(item.search_term || item.name)} target="_blank" rel="noreferrer" title="חיפוש בשופרסל">🔎</a>
      <button type="button" className="btn btn-icon btn-sm" onClick={() => onDelete(item.id)} title="הסרה">✕</button>
    </li>
  );
}
