import { useState } from 'react';
import { useApp } from '../App.jsx';
import IngredientImage from './IngredientImage.jsx';

const emptyIng = () => ({ section: '', name: '', quantity: '', unit: '', note: '', category: '', search_term: '', emoji: '' });
const emptyStep = () => ({ text: '', tip: '', minutes: '' });

export const blankRecipe = () => ({
  title: '', description: '', emoji: '🍽️', category: 'עיקריות', cuisine: '', prep_minutes: '', cook_minutes: '',
  servings: 4, difficulty: 'בינוני', tags: [], notes: '', source: '', image: null,
  ingredients: [emptyIng()], steps: [emptyStep()],
});

/** Full recipe form – used for new (AI-extracted / manual) and existing recipes. */
export default function RecipeEditor({ initial, onSave, saving, submitLabel = 'שמירת המתכון' }) {
  const { meta } = useApp();
  const [r, setR] = useState(() => ({
    ...blankRecipe(),
    ...initial,
    ingredients: initial?.ingredients?.length ? initial.ingredients.map((i) => ({ ...i, quantity: i.quantity ?? '' })) : [emptyIng()],
    steps: initial?.steps?.length ? initial.steps.map((s) => ({ ...s, minutes: s.minutes ?? '' })) : [emptyStep()],
  }));
  const [tagInput, setTagInput] = useState('');

  const set = (k, v) => setR((x) => ({ ...x, [k]: v }));
  const setIng = (i, k, v) => setR((x) => ({ ...x, ingredients: x.ingredients.map((g, j) => (j === i ? { ...g, [k]: v } : g)) }));
  const setStep = (i, k, v) => setR((x) => ({ ...x, steps: x.steps.map((g, j) => (j === i ? { ...g, [k]: v } : g)) }));
  const move = (list, i, d) => {
    const a = [...r[list]];
    const j = i + d;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];
    set(list, a);
  };
  const remove = (list, i) => set(list, r[list].filter((_, j) => j !== i));

  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, '');
    if (t && !r.tags.includes(t)) set('tags', [...r.tags, t]);
    setTagInput('');
  };

  const submit = (e) => {
    e.preventDefault();
    onSave({
      ...r,
      ingredients: r.ingredients.filter((i) => i.name.trim()).map((i) => ({ ...i, search_term: i.search_term || i.name })),
      steps: r.steps.filter((s) => s.text.trim()),
    });
  };

  return (
    <form className="editor" onSubmit={submit}>
      <section className="card">
        <h2>פרטי המתכון</h2>
        {r.image && <div className="editor-image" style={{ backgroundImage: `url(${r.image})` }}><button type="button" className="btn btn-sm" onClick={() => set('image', null)}>הסרת תמונה</button></div>}
        <div className="form-grid">
          <label className="span-2">שם המתכון
            <div className="row">
              <input className="emoji-input" value={r.emoji} onChange={(e) => set('emoji', e.target.value)} maxLength={4} />
              <input required value={r.title} onChange={(e) => set('title', e.target.value)} placeholder="למשל: עוגת גבינה אפויה" />
            </div>
          </label>
          <label className="span-2">תיאור קצר
            <textarea rows={2} value={r.description} onChange={(e) => set('description', e.target.value)} />
          </label>
          <label>קטגוריה
            <select value={r.category} onChange={(e) => set('category', e.target.value)}>
              {(meta?.recipeCategories || [r.category]).map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label>סגנון מטבח
            <input value={r.cuisine} onChange={(e) => set('cuisine', e.target.value)} placeholder="ישראלי, איטלקי..." />
          </label>
          <label>זמן הכנה (דק')
            <input type="number" min="0" value={r.prep_minutes ?? ''} onChange={(e) => set('prep_minutes', e.target.value)} />
          </label>
          <label>זמן בישול/אפייה (דק')
            <input type="number" min="0" value={r.cook_minutes ?? ''} onChange={(e) => set('cook_minutes', e.target.value)} />
          </label>
          <label>מספר מנות
            <input type="number" min="1" value={r.servings ?? ''} onChange={(e) => set('servings', e.target.value)} />
          </label>
          <label>רמת קושי
            <select value={r.difficulty} onChange={(e) => set('difficulty', e.target.value)}>
              {(meta?.difficulties || ['קל', 'בינוני', 'מאתגר']).map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="span-2">תגיות <small className="muted">(סוג מנה, כשרות, תזונה ומרכיב עיקרי מתווספים אוטומטית בשמירה; אפשר למחוק תגית שלא מתאימה)</small>
            <div className="chips">
              {r.tags.map((t) => (
                <span key={t} className="chip chip-sm static">#{t} <button type="button" onClick={() => set('tags', r.tags.filter((x) => x !== t))}>✕</button></span>
              ))}
              <input
                className="tag-input"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }}
                onBlur={addTag}
                placeholder="+ תגית"
              />
            </div>
          </label>
        </div>
      </section>

      <section className="card">
        <h2>🧺 מצרכים ({r.ingredients.filter((i) => i.name).length})</h2>
        <div className="ing-editor">
          <div className="ing-row ing-row-head">
            <span />
            <span>כמות</span><span>יחידה</span><span>מצרך</span><span>הערה</span><span>קבוצה</span><span />
          </div>
          {r.ingredients.map((ing, i) => (
            <div key={i} className="ing-row">
              {ing.name ? <IngredientImage name={ing.name} term={ing.search_term || ing.name} emoji={ing.emoji || '🥄'} size={38} editable={false} /> : <span className="ing-img-placeholder" />}
              <input type="number" step="any" min="0" value={ing.quantity} onChange={(e) => setIng(i, 'quantity', e.target.value)} placeholder="2" />
              <input value={ing.unit} onChange={(e) => setIng(i, 'unit', e.target.value)} placeholder="כוסות" list="units" />
              <input value={ing.name} onChange={(e) => setIng(i, 'name', e.target.value)} placeholder="קמח" />
              <input value={ing.note} onChange={(e) => setIng(i, 'note', e.target.value)} placeholder="מנופה" />
              <input value={ing.section} onChange={(e) => setIng(i, 'section', e.target.value)} placeholder="לבצק" />
              <span className="row-tools">
                <button type="button" onClick={() => move('ingredients', i, -1)} title="למעלה">▲</button>
                <button type="button" onClick={() => move('ingredients', i, 1)} title="למטה">▼</button>
                <button type="button" onClick={() => remove('ingredients', i)} title="מחיקה">✕</button>
              </span>
            </div>
          ))}
          <datalist id="units">
            {['כוס', 'כוסות', 'כף', 'כפות', 'כפית', 'כפיות', 'גרם', 'ק"ג', 'מ"ל', 'ליטר', 'יחידות', 'שיני', 'קורט', 'חבילה', 'קופסה', 'צרור'].map((u) => <option key={u} value={u} />)}
          </datalist>
          <button type="button" className="btn btn-sm" onClick={() => set('ingredients', [...r.ingredients, emptyIng()])}>+ מצרך</button>
        </div>
      </section>

      <section className="card">
        <h2>👩‍🍳 אופן ההכנה</h2>
        {r.steps.map((s, i) => (
          <div key={i} className="step-row">
            <span className="step-num">{i + 1}</span>
            <div className="step-fields">
              <textarea rows={2} value={s.text} onChange={(e) => setStep(i, 'text', e.target.value)} placeholder="מה עושים בשלב הזה?" />
              <div className="row">
                <input value={s.tip || ''} onChange={(e) => setStep(i, 'tip', e.target.value)} placeholder="💡 טיפ (לא חובה)" />
                <input type="number" min="0" className="narrow" value={s.minutes ?? ''} onChange={(e) => setStep(i, 'minutes', e.target.value)} placeholder="דק'" />
              </div>
            </div>
            <span className="row-tools">
              <button type="button" onClick={() => move('steps', i, -1)}>▲</button>
              <button type="button" onClick={() => move('steps', i, 1)}>▼</button>
              <button type="button" onClick={() => remove('steps', i)}>✕</button>
            </span>
          </div>
        ))}
        <button type="button" className="btn btn-sm" onClick={() => set('steps', [...r.steps, emptyStep()])}>+ שלב</button>
      </section>

      <section className="card">
        <h2>📝 הערות ומקור</h2>
        <div className="form-grid">
          <label className="span-2">הערות<textarea rows={3} value={r.notes || ''} onChange={(e) => set('notes', e.target.value)} /></label>
          <label className="span-2">מקור (קישור / שם)<input value={r.source || ''} onChange={(e) => set('source', e.target.value)} /></label>
        </div>
      </section>

      <div className="sticky-save">
        <button className="btn btn-primary btn-lg" disabled={saving}>{saving ? 'שומר...' : `💾 ${submitLabel}`}</button>
      </div>
    </form>
  );
}
