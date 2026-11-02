import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, formatQty, whatsappLink } from '../api.js';
import { useApp } from '../App.jsx';
import IngredientImage from '../components/IngredientImage.jsx';
import { RecipeCover } from '../components/RecipeCard.jsx';
import CookMode from '../components/CookMode.jsx';
import AskChef from '../components/AskChef.jsx';
import { ensureDishImage } from '../dishImages.js';
import RecipeImageButton from '../components/RecipeImageButton.jsx';

const ADAPT_PRESETS = ['טבעוני', 'ללא גלוטן', 'דל פחמימות', 'פרווה (ללא חלב)', 'בריא יותר', 'גרסה מהירה עד 20 דקות'];

export default function RecipePage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { meta, notify, refreshCart, refreshMeta } = useApp();
  const [recipe, setRecipe] = useState(null);
  const [error, setError] = useState('');
  const [servings, setServings] = useState(4);
  const [checked, setChecked] = useState(new Set());
  const [doneSteps, setDoneSteps] = useState(new Set());
  const [cookMode, setCookMode] = useState(false);
  const [adapting, setAdapting] = useState(false);
  const [waText, setWaText] = useState('');
  const [generating, setGenerating] = useState(false);

  // Create a photo of the dish when the recipe has none.
  const makeImage = async (fresh = false) => {
    setGenerating(true);
    try {
      const updated = await ensureDishImage(recipe, { fresh });
      if (updated) setRecipe((r) => (r && r.id === updated.id ? { ...r, image: updated.image } : r));
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setGenerating(false);
    }
  };
  useEffect(() => {
    if (recipe && !recipe.image && meta?.imageGen) makeImage();
  }, [recipe?.id, meta?.imageGen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    api.recipe(id).then((r) => {
      setRecipe(r);
      setServings(r.servings || 4);
      setChecked(new Set());
      setDoneSteps(new Set());
    }).catch((e) => setError(e.message));
  }, [id]);

  // Prepare the WhatsApp message ahead of time so the share button is a plain link.
  useEffect(() => {
    if (!recipe) return;
    api.recipeWhatsApp(recipe.id, servings).then((r) => setWaText(r.text)).catch(() => {});
  }, [recipe, servings]);

  const factor = recipe?.servings ? servings / recipe.servings : 1;
  const sections = useMemo(() => {
    const out = [];
    for (const ing of recipe?.ingredients || []) {
      const last = out[out.length - 1];
      if (!last || last.name !== (ing.section || '')) out.push({ name: ing.section || '', items: [ing] });
      else last.items.push(ing);
    }
    return out;
  }, [recipe]);

  if (error) return <div className="empty">😕 {error}</div>;
  if (!recipe) return <div className="loading">טוען...</div>;

  const toggle = (set, setter, key) => {
    const n = new Set(set);
    if (n.has(key)) n.delete(key); else n.add(key);
    setter(n);
  };

  const addToCart = async (onlyIds) => {
    const res = await api.addFromRecipe(recipe.id, { servings, ingredientIds: onlyIds });
    notify(`🛒 נוספו ${res.added} מצרכים לרשימת הקניות`);
    refreshCart();
  };


  const onDelete = async () => {
    if (!confirm(`למחוק את "${recipe.title}"?`)) return;
    await api.deleteRecipe(recipe.id);
    refreshMeta();
    notify('המתכון נמחק');
    nav('/');
  };

  const onFavorite = async () => {
    const r = await api.setFavorite(recipe.id, !recipe.favorite);
    setRecipe(r);
  };

  const onAdapt = async (instruction) => {
    if (!instruction) return;
    setAdapting(true);
    try {
      const adapted = await api.adapt(recipe.id, instruction);
      const saved = await api.createRecipe({ ...adapted, image: recipe.image, source: `גרסה של "${recipe.title}"` });
      notify('✨ נוצרה גרסה חדשה של המתכון');
      refreshMeta();
      nav(`/recipes/${saved.id}`);
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setAdapting(false);
    }
  };

  return (
    <article className="recipe-page">
      <div className="recipe-hero">
        <div className="recipe-hero-media">
          <RecipeCover recipe={recipe} className="recipe-hero-cover" generating={generating} />
          <RecipeImageButton recipe={recipe} onUpdated={(u) => setRecipe((r) => ({ ...r, image: u.image }))} className="on-hero" />
        </div>
        <div className="recipe-hero-info">
          <div className="recipe-card-cat">{recipe.category}{recipe.cuisine ? ` · ${recipe.cuisine}` : ''}</div>
          <h1>{recipe.emoji} {recipe.title}</h1>
          {recipe.description && <p className="lead">{recipe.description}</p>}
          <div className="stats">
            {recipe.prep_minutes != null && <div><b>{recipe.prep_minutes}</b><span>דק' הכנה</span></div>}
            {recipe.cook_minutes != null && <div><b>{recipe.cook_minutes}</b><span>דק' בישול</span></div>}
            <div><b>{recipe.ingredients.length}</b><span>מצרכים</span></div>
            <div><b>{recipe.difficulty}</b><span>רמת קושי</span></div>
          </div>
          {recipe.tags.length > 0 && (
            <div className="chips">{recipe.tags.map((t) => <span key={t} className="chip chip-sm static">#{t}</span>)}</div>
          )}
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={() => setCookMode(true)}>👩‍🍳 מצב בישול</button>
            <button type="button" className="btn" onClick={() => addToCart()}>🛒 לרשימת הקניות</button>
            <a className="btn btn-wa" href={whatsappLink(waText)} target="_blank" rel="noreferrer">🟢 שליחה בוואטסאפ</a>
            <button type="button" className="btn btn-icon" onClick={onFavorite} title="מועדף">{recipe.favorite ? '❤️' : '🤍'}</button>
            <Link to={`/recipes/${recipe.id}/edit`} className="btn btn-icon" title="עריכה">✏️</Link>
            <button type="button" className="btn btn-icon print-btn" onClick={() => window.print()} title="הדפסה">🖨️</button>
            <button type="button" className="btn btn-icon danger" onClick={onDelete} title="מחיקה">🗑️</button>
          </div>
        </div>
      </div>

      <div className="recipe-body">
        <section className="card ingredients-card">
          <div className="section-head">
            <h2>🧺 מצרכים</h2>
            <div className="servings">
              <button type="button" onClick={() => setServings((s) => Math.max(1, s - 1))}>−</button>
              <span><b>{servings}</b> מנות</span>
              <button type="button" onClick={() => setServings((s) => s + 1)}>+</button>
            </div>
          </div>
          {sections.map((sec) => (
            <div key={sec.name || '_'} className="ing-section">
              {sec.name && <h3>{sec.name}</h3>}
              <ul className="ing-list">
                {sec.items.map((ing) => (
                  <li key={ing.id} className={checked.has(ing.id) ? 'checked' : ''}>
                    <IngredientImage name={ing.name} term={ing.search_term} emoji={ing.emoji} />
                    <label>
                      <input type="checkbox" checked={checked.has(ing.id)} onChange={() => toggle(checked, setChecked, ing.id)} />
                      <span className="ing-text">
                        <span className="ing-qty">{[formatQty(ing.quantity != null ? ing.quantity * factor : null), ing.unit].filter(Boolean).join(' ')}</span>
                        <span className="ing-name">{ing.name}</span>
                        {ing.note && <span className="ing-note">{ing.note}</span>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="ing-footer">
            <small>סמנו מצרכים שכבר יש לכם, והוסיפו לרשימה רק את מה שחסר.</small>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => addToCart(recipe.ingredients.filter((i) => !checked.has(i.id)).map((i) => i.id))}
            >
              🛒 הוספת החסרים ({recipe.ingredients.length - checked.size})
            </button>
          </div>
        </section>

        <section className="card steps-card">
          <h2>👩‍🍳 אופן ההכנה</h2>
          <ol className="steps">
            {recipe.steps.map((s, i) => (
              <li key={s.id} className={doneSteps.has(s.id) ? 'done' : ''} onClick={() => toggle(doneSteps, setDoneSteps, s.id)}>
                <span className="step-num">{doneSteps.has(s.id) ? '✓' : i + 1}</span>
                <div>
                  <p>{s.text}</p>
                  {s.minutes ? <span className="step-time">⏱️ {s.minutes} דק'</span> : null}
                  {s.tip && <p className="tip">💡 {s.tip}</p>}
                </div>
              </li>
            ))}
          </ol>
          {recipe.notes && <div className="notes">📝 {recipe.notes}</div>}
          {recipe.source && <div className="source">מקור: {/^https?:/.test(recipe.source) ? <a href={recipe.source} target="_blank" rel="noreferrer">{recipe.source}</a> : recipe.source}</div>}
        </section>
      </div>

      {meta?.aiEnabled && (
        <div className="recipe-ai">
          <section className="card">
            <h2>✨ התאמת המתכון עם AI</h2>
            <p className="muted">יוצר גרסה חדשה של המתכון ושומר אותה בנפרד.</p>
            <div className="chips">
              {ADAPT_PRESETS.map((p) => (
                <button key={p} type="button" className="chip" disabled={adapting} onClick={() => onAdapt(`הפוך את המתכון ל${p}`)}>{p}</button>
              ))}
              <button type="button" className="chip" disabled={adapting} onClick={() => onAdapt(prompt('איך להתאים את המתכון?'))}>✍️ בקשה אחרת...</button>
            </div>
            {adapting && <div className="loading">✨ יוצר גרסה מותאמת...</div>}
          </section>
          <AskChef recipe={recipe} />
        </div>
      )}

      {cookMode && <CookMode recipe={recipe} factor={factor} onClose={() => setCookMode(false)} />}
    </article>
  );
}
