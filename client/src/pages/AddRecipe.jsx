import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import RecipeEditor, { blankRecipe } from '../components/RecipeEditor.jsx';
import ImportFile from '../components/ImportFile.jsx';

const TABS = [
  { id: 'text', label: '📝 טקסט / וואטסאפ' },
  { id: 'image', label: '📸 צילום מסך / תמונה' },
  { id: 'file', label: '📚 ייבוא קובץ מתכונים' },
  { id: 'manual', label: '✍️ הזנה ידנית' },
];

export default function AddRecipe() {
  const { meta, notify, refreshMeta } = useApp();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState('text');
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [keepImage, setKeepImage] = useState(true);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef();

  // Arrived from the share sheet (WhatsApp → CheffO3) via /share-target.
  useEffect(() => {
    const sharedText = params.get('text');
    const sharedImages = params.get('images');
    if (!sharedText && !sharedImages) return;
    if (sharedText) setText(sharedText);
    if (sharedImages) {
      Promise.all(sharedImages.split(',').map(async (url) => {
        const blob = await (await fetch(url)).blob();
        return new File([blob], url.split('/').pop(), { type: blob.type });
      })).then((fs) => { setFiles(fs); setTab('image'); });
    }
    setParams({}, { replace: true });
  }, [params, setParams]);

  // Paste screenshots directly (Ctrl+V).
  useEffect(() => {
    const onPaste = (e) => {
      const imgs = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
      if (imgs.length) {
        setFiles((f) => [...f, ...imgs].slice(0, 6));
        setTab('image');
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  const extract = async () => {
    setError('');
    setBusy(true);
    try {
      const r = await api.extract({ text, files: tab === 'image' ? files : [], keepImage: tab === 'image' && keepImage });
      setDraft(r);
      if (r._engine === 'heuristic') notify('המתכון פוענח בפענוח בסיסי – כדאי לעבור עליו (להפעלת AI יש להגדיר מפתח API)', 'warn');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const save = async (recipe) => {
    setSaving(true);
    try {
      const saved = await api.createRecipe(recipe);
      notify('✅ המתכון נשמר!');
      refreshMeta();
      nav(`/recipes/${saved.id}`);
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (draft || tab === 'manual') {
    return (
      <>
        <div className="page-head">
          <h1>{draft ? '✨ בדקו את המתכון ושמרו' : '✍️ מתכון חדש'}</h1>
          <button type="button" className="btn" onClick={() => { setDraft(null); if (tab === 'manual') setTab('text'); }}>→ חזרה</button>
        </div>
        {draft && <p className="muted">המתכון פורק למצרכים ולשלבים. אפשר לתקן כל שדה לפני השמירה.</p>}
        <RecipeEditor initial={draft || blankRecipe()} onSave={save} saving={saving} />
      </>
    );
  }

  return (
    <>
      <div className="page-head"><h1>➕ הוספת מתכון</h1></div>
      <div className="tabs">
        {TABS.map((t) => (
          <button type="button" key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {tab === 'file' ? <ImportFile /> : (
      <section className="card import-card">
        {tab === 'text' && (
          <>
            <p className="muted">
              הדביקו מתכון מכל מקום – אתר, פוסט, מסמך, או <b>הודעת וואטסאפ שהועברה</b> (כולל ייצוא צ'אט). אפשר גם לכתוב תיאור חופשי
              כמו "פסטה עם שמנת ופטריות לארבעה" והשף ישלים את המתכון.
            </p>
            <textarea
              className="big-input"
              rows={12}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'עוגת גבינה פירורים\n\nמצרכים:\n2 כוסות קמח\n200 גרם חמאה\n...\n\nאופן ההכנה:\n1. מחממים תנור ל-180 מעלות...'}
            />
          </>
        )}
        {tab === 'image' && (
          <>
            <p className="muted">העלו צילומי מסך של מתכון (מאינסטגרם, אתר, וואטסאפ, ספר בישול) – עד 6 תמונות. אפשר גם להדביק עם Ctrl+V, או לצלם מנה מוכנה והשף ישחזר מתכון.</p>
            <div
              className="dropzone"
              onClick={() => fileRef.current.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); setFiles((f) => [...f, ...[...e.dataTransfer.files].filter((x) => x.type.startsWith('image/'))].slice(0, 6)); }}
            >
              {files.length ? (
                <div className="thumbs">
                  {files.map((f, i) => (
                    <div key={i} className="thumb" style={{ backgroundImage: `url(${URL.createObjectURL(f)})` }}>
                      <button type="button" onClick={(e) => { e.stopPropagation(); setFiles(files.filter((_, j) => j !== i)); }}>✕</button>
                    </div>
                  ))}
                  <div className="thumb add">+</div>
                </div>
              ) : (
                <><div className="empty-icon">📸</div><b>לחצו לבחירת תמונות או גררו לכאן</b></>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" multiple capture="environment" hidden onChange={(e) => setFiles((f) => [...f, ...e.target.files].slice(0, 6))} />
            <label className="check-label"><input type="checkbox" checked={keepImage} onChange={(e) => setKeepImage(e.target.checked)} /> להשתמש בתמונה הראשונה כתמונת המתכון</label>
            <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="הערות נוספות (לא חובה), למשל: תרגם לעברית, להכפיל כמויות..." />
            {!meta?.aiEnabled && <div className="alert">⚠️ קריאת מתכון מתמונה דורשת הגדרת ANTHROPIC_API_KEY בשרת.</div>}
          </>
        )}
        {error && <div className="alert alert-error">{error}</div>}
        <button
          type="button"
          className="btn btn-primary btn-lg"
          disabled={busy || (tab === 'text' ? !text.trim() : !files.length)}
          onClick={extract}
        >
          {busy ? '✨ מפענח את המתכון...' : '✨ פענוח המתכון'}
        </button>
        {busy && <div className="loading">הבינה המלאכותית קוראת את המתכון ומפרקת אותו למצרכים ושלבים...</div>}
      </section>
      )}

      <section className="card whatsapp-help">
        <h2>🟢 מתכונים מוואטסאפ</h2>
        <ul>
          <li><b>העתק-הדבק:</b> לוחצים לחיצה ארוכה על ההודעה בוואטסאפ ← העתקה ← מדביקים בלשונית "טקסט / וואטסאפ".</li>
          <li><b>שיתוף ישיר (אנדרואיד):</b> מתקינים את האפליקציה למסך הבית (תפריט הדפדפן ← "הוספה למסך הבית"), ואז בוואטסאפ: שיתוף ← CheffO3.</li>
          <li><b>בוט וואטסאפ:</b> {meta?.whatsappBot ? 'הבוט פעיל – ' : 'אחרי הגדרת WhatsApp Business API בשרת, '}שולחים לבוט מתכון כטקסט או צילום מסך והוא שומר אותו כאן ומחזיר קישור. כתבו לו "רשימה" לקבלת רשימת הקניות.</li>
          <li><b>שליחה:</b> בכל מתכון ובכל רשימת קניות יש כפתור "שליחה בוואטסאפ".</li>
        </ul>
      </section>
    </>
  );
}
