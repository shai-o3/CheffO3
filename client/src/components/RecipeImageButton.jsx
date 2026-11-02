import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import { RecipeCover } from './RecipeCard.jsx';

/**
 * Small camera button on a recipe image. Opens a dialog to upload a real photo,
 * generate an AI photo of the dish, or remove the image.
 * onUpdated(recipe) receives the updated recipe.
 */
export default function RecipeImageButton({ recipe, onUpdated, className = '' }) {
  const { meta, notify } = useApp();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const run = async (kind, fn, done) => {
    setBusy(kind);
    setError('');
    try {
      const updated = await fn();
      onUpdated?.(updated);
      notify(done);
      setOpen(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };

  return (
    <>
      <button
        type="button"
        className={`image-btn ${className}`}
        onClick={(e) => { stop(e); setError(''); setOpen(true); }}
        aria-label="שינוי תמונת המתכון"
        title="שינוי תמונת המתכון"
      >
        📷
      </button>
      {open && createPortal(
        <div className="modal-backdrop" onClick={() => !busy && setOpen(false)}>
          <div className="card modal image-modal" role="dialog" aria-label="תמונת המתכון" onClick={(e) => e.stopPropagation()}>
            <h2>תמונת המתכון</h2>
            <p className="muted">{recipe.title}</p>
            <RecipeCover recipe={recipe} className="image-modal-preview" generating={busy === 'ai'} />

            <div className="image-options">
              <button type="button" className="image-option" disabled={!!busy} onClick={() => fileRef.current.click()}>
                <span className="image-option-icon">📷</span>
                <span><b>העלאת תמונה אמיתית</b><small>מהגלריה או מהמצלמה</small></span>
              </button>
              {meta?.imageGen ? (
                <button
                  type="button" className="image-option" disabled={!!busy}
                  onClick={() => run('ai', () => api.generateImage(recipe.id, true), '🎨 נוצרה תמונה חדשה')}
                >
                  <span className="image-option-icon">🎨</span>
                  <span>
                    <b>{busy === 'ai' ? 'יוצר תמונה... (כ-20 שניות)' : 'יצירת תמונה עם AI'}</b>
                    <small>תמונה של המנה לפי המתכון</small>
                  </span>
                </button>
              ) : (
                <div className="image-option disabled">
                  <span className="image-option-icon">🎨</span>
                  <span><b>יצירת תמונה עם AI</b><small>לא זמין: יש להגדיר GEMINI_API_KEY בשרת</small></span>
                </div>
              )}
              {recipe.image && (
                <button
                  type="button" className="image-option" disabled={!!busy}
                  onClick={() => run('remove', () => api.updateRecipe(recipe.id, { image: null }), 'התמונה הוסרה')}
                >
                  <span className="image-option-icon">🗑️</span>
                  <span><b>הסרת התמונה</b><small>חזרה לאייקון</small></span>
                </button>
              )}
            </div>
            {busy === 'upload' && <div className="loading">מעלה תמונה...</div>}
            {error && <div className="alert alert-error">{error}</div>}
            <div className="row modal-actions">
              <button type="button" className="btn" disabled={!!busy} onClick={() => setOpen(false)}>סגירה</button>
            </div>
            <input
              ref={fileRef} type="file" accept="image/*" hidden
              onChange={(e) => {
                const file = e.target.files[0];
                e.target.value = '';
                if (file) run('upload', () => api.uploadRecipeImage(recipe.id, file), '📷 התמונה עודכנה');
              }}
            />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
