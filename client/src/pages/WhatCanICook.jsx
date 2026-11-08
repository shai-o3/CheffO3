import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import RecipeCard from '../components/RecipeCard.jsx';
import IngredientImage from '../components/IngredientImage.jsx';

const hostOf = (u) => { try { return new URL(u).hostname; } catch { return u; } };

const QUICK = ['ביצים', 'עגבניות', 'בצל', 'שום', 'עוף', 'אורז', 'פסטה', 'תפוחי אדמה', 'גבינה צהובה', 'חלב', 'קמח', 'לימון', 'מלפפון', 'פלפל אדום', 'טחינה'];

export default function WhatCanICook() {
  const { meta, notify, refreshCart, refreshMeta } = useApp();
  const nav = useNavigate();
  const [pantry, setPantry] = useState([]);
  const [input, setInput] = useState('');
  const [ignoreStaples, setIgnoreStaples] = useState(true);
  const [matches, setMatches] = useState(null);
  const [prefs, setPrefs] = useState('');
  const [ideas, setIdeas] = useState(null);
  const [busy, setBusy] = useState('');

  useEffect(() => { api.pantry().then(setPantry); }, []);
  useEffect(() => {
    if (!pantry.length) { setMatches([]); return; }
    api.match(pantry, ignoreStaples).then(setMatches);
  }, [pantry, ignoreStaples]);

  const add = async (raw) => {
    const names = String(raw).split(/[,،\n]/).map((s) => s.trim()).filter(Boolean);
    if (!names.length) return;
    setPantry(await api.addPantry(names));
    setInput('');
  };
  const remove = async (n) => setPantry(await api.removePantry(n));

  const addMissing = async (m) => {
    await api.addShopping(m.missing.map((i) => ({ ...i, recipe: { id: m.recipe.id, title: m.recipe.title } })));
    notify(`🛒 ${m.missing.length} מצרכים חסרים נוספו לרשימה`);
    refreshCart();
  };

  const getIdeas = async (mode) => {
    setBusy(mode);
    setIdeas(null);
    try {
      setIdeas(await api.suggest({ pantry, preferences: prefs, count: mode === 'web' ? 2 : 3, mode, allowStaples: ignoreStaples }));
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const saveIdea = async (idea) => {
    const saved = await api.createRecipe({ ...idea, source: idea.source || 'הצעת השף (AI)' });
    refreshMeta();
    notify('✅ המתכון נשמר לספר המתכונים');
    nav(`/recipes/${saved.id}`);
  };

  const suggestions = (meta?.knownIngredients || []).filter((k) => !pantry.includes(k));

  return (
    <>
      <div className="page-head"><h1>🧺 מה אפשר להכין ממה שיש?</h1></div>
      <section className="card">
        <h2>מה יש לי בבית</h2>
        <form className="row" onSubmit={(e) => { e.preventDefault(); add(input); }}>
          <input list="known-ings" value={input} onChange={(e) => setInput(e.target.value)} placeholder="הקלידו מצרך (אפשר כמה, מופרדים בפסיק)" />
          <button className="btn btn-primary">הוספה</button>
        </form>
        <datalist id="known-ings">{suggestions.slice(0, 200).map((s) => <option key={s} value={s} />)}</datalist>
        <div className="chips pantry">
          {pantry.map((p) => (
            <span key={p} className="chip active static">
              {p} <button type="button" onClick={() => remove(p)} aria-label="הסרה">✕</button>
            </span>
          ))}
          {pantry.length > 0 && <button type="button" className="chip chip-sm" onClick={async () => setPantry(await api.clearPantry())}>ניקוי הכל</button>}
        </div>
        <div className="quick-add">
          <small>הוספה מהירה:</small>
          {QUICK.filter((q) => !pantry.includes(q)).map((q) => <button key={q} type="button" className="chip chip-sm" onClick={() => add(q)}>+ {q}</button>)}
        </div>
        <label className="check-label">
          <input type="checkbox" checked={ignoreStaples} onChange={(e) => setIgnoreStaples(e.target.checked)} />
          להניח שיש בבית מוצרי יסוד (מלח, פלפל, שמן, סוכר, מים)
        </label>
      </section>

      <section className="card ai-ideas">
        <h2>✨ מתכונים רק ממה שיש לך</h2>
        <p className="muted">מתכונים שמשתמשים אך ורק במצרכים שסימנת{ignoreStaples ? ' (ובמלח, פלפל, שמן ומים)' : ''}.</p>
        {meta?.aiEnabled ? (
          <>
            <input value={prefs} onChange={(e) => setPrefs(e.target.value)} placeholder="העדפות (לא חובה): לילדים, עד 30 דקות, חריף..." />
            <div className="ai-buttons">
              <button type="button" className="btn btn-primary" disabled={!pantry.length || !!busy} onClick={() => getIdeas('invent')}>
                {busy === 'invent' ? 'השף ממציא...' : '👩‍🍳 השף ימציא מתכון'}
              </button>
              <button type="button" className="btn" disabled={!pantry.length || !!busy} onClick={() => getIdeas('web')}>
                {busy === 'web' ? 'מחפש ברשת...' : '🌐 חיפוש מתכון ברשת'}
              </button>
            </div>
            {!pantry.length && <small className="muted">הוסיפו קודם מצרכים למעלה.</small>}
            {busy && <div className="loading">{busy === 'web' ? 'מחפש ברשת מתכונים שמתאימים בדיוק למה שיש לכם (עד דקה)...' : 'השף מרכיב מתכונים ממה שיש לכם...'}</div>}
            {ideas && (
              <div className="ideas">
                {ideas.map((idea, i) => (
                  <article key={i} className="idea card">
                    <h3>{idea.emoji} {idea.title}</h3>
                    <p>{idea.description}</p>
                    <p className="muted">💡 {idea.why}</p>
                    {idea.source && (
                      <p className="idea-source">🌐 מקור: <a href={idea.source} target="_blank" rel="noreferrer">{idea.source_name || hostOf(idea.source)}</a></p>
                    )}
                    <div className="meta-row">
                      {(idea.prep_minutes || idea.cook_minutes) ? <span>⏱️ {(idea.prep_minutes || 0) + (idea.cook_minutes || 0)} דק'</span> : null}
                      <span>🧺 {idea.ingredients.length} מצרכים</span>
                    </div>
                    {idea.missing?.length > 0 && <p className="missing">חסר: {idea.missing.join(', ')}</p>}
                    <details>
                      <summary>הצגת המתכון</summary>
                      <ul>{idea.ingredients.map((g, j) => <li key={j}>{[g.quantity, g.unit, g.name].filter((x) => x != null && x !== '').join(' ')}</li>)}</ul>
                      <ol>{idea.steps.map((st, j) => <li key={j}>{st.text}</li>)}</ol>
                    </details>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => saveIdea(idea)}>💾 שמירה לספר המתכונים</button>
                  </article>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="alert">⚠️ הצעות חכמות דורשות הגדרת ANTHROPIC_API_KEY בשרת.</div>
        )}
      </section>

      <h2 className="section-title">📖 מתכונים מהספר שלי</h2>
      {!pantry.length ? (
        <div className="empty small">הוסיפו מצרכים כדי לראות מה אפשר להכין.</div>
      ) : matches === null ? (
        <div className="loading">מחפש...</div>
      ) : matches.length === 0 ? (
        <div className="empty small">אף מתכון שמור לא משתמש במצרכים האלה.</div>
      ) : (
        <div className="grid">
          {matches.map((m) => (
            <RecipeCard
              key={m.recipe.id}
              recipe={m.recipe}
              onImageChange={(u) => setMatches((list) => list.map((x) => (x.recipe.id === u.id ? { ...x, recipe: { ...x.recipe, image: u.image } } : x)))}
              extra={(
                <div className="match-info">
                  <div className="match-bar"><div style={{ width: `${Math.round(m.score * 100)}%` }} /></div>
                  <div className="match-text">
                    <b>{Math.round(m.score * 100)}% התאמה</b>
                    {m.missing.length === 0 ? ' · יש לך הכל! 🎉' : ` · חסרים ${m.missing.length}`}
                  </div>
                  {m.missing.length > 0 && (
                    <>
                      <div className="missing-list">
                        {m.missing.slice(0, 6).map((x) => (
                          <span key={x.name} className="missing-item"><IngredientImage name={x.name} term={x.search_term} emoji={x.emoji} size={26} editable={false} />{x.name}</span>
                        ))}
                      </div>
                      <button type="button" className="btn btn-sm" onClick={() => addMissing(m)}>🛒 הוספת החסרים לרשימה</button>
                    </>
                  )}
                </div>
              )}
            />
          ))}
        </div>
      )}

    </>
  );
}
