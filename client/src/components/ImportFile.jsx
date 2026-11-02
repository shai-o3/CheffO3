import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import { fileToText, recipesFromJson } from '../fileText.js';

const ACCEPT = '.docx,.pdf,.txt,.md,.json,text/plain,application/pdf,application/json,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const STATUS = {
  pending: { label: 'ממתין', cls: '' },
  working: { label: 'מפענח...', cls: 'working' },
  done: { label: 'נשמר ✓', cls: 'done' },
  error: { label: 'נכשל', cls: 'error' },
};

/**
 * Bulk import: one file with many recipes (Word, PDF, text or JSON).
 * The file is split into recipes, the user reviews the list, then each recipe is
 * parsed with AI (one request each, so long files never hit the server time limit) and saved.
 */
export default function ImportFile() {
  const { meta, notify, refreshMeta } = useApp();
  const [phase, setPhase] = useState('pick'); // pick | reading | review | importing | finished
  const [fileName, setFileName] = useState('');
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [engine, setEngine] = useState('');
  const [open, setOpen] = useState(null);
  const stopRef = useRef(false);
  const fileRef = useRef(null);

  const update = (i, patch) => setItems((list) => list.map((it, k) => (k === i ? { ...it, ...patch } : it)));

  const onFile = async (file) => {
    if (!file) return;
    setError('');
    setFileName(file.name);
    setPhase('reading');
    try {
      const text = await fileToText(file);
      const json = file.name.toLowerCase().endsWith('.json') ? recipesFromJson(text) : null;
      let list;
      if (json) {
        list = json.map((r) => ({ title: r.title, data: r }));
        setEngine('json');
      } else {
        const res = await api.split(text);
        list = res.recipes.map((r) => ({ title: r.title || r.text.split('\n')[0], text: r.text }));
        setEngine(res.engine);
      }
      if (!list.length) throw new Error('לא נמצאו מתכונים בקובץ');
      setItems(list.map((it) => ({ ...it, selected: true, status: 'pending' })));
      setPhase('review');
    } catch (e) {
      setError(e.message);
      setPhase('pick');
    }
  };

  const run = async () => {
    stopRef.current = false;
    setPhase('importing');
    let saved = 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.selected || it.status === 'done') continue;
      if (stopRef.current) break;
      update(i, { status: 'working', error: '' });
      try {
        const data = it.data || (await api.extract({ text: it.text }));
        const recipe = await api.createRecipe({ ...data, source: data.source || `ייבוא מ-${fileName}` });
        update(i, { status: 'done', recipeId: recipe.id, title: recipe.title });
        saved++;
      } catch (e) {
        update(i, { status: 'error', error: e.message });
      }
    }
    refreshMeta();
    setPhase('finished');
    if (saved) notify(`✅ נשמרו ${saved} מתכונים`);
  };

  const selected = items.filter((it) => it.selected && it.status !== 'done');
  const done = items.filter((it) => it.status === 'done').length;
  const failed = items.filter((it) => it.status === 'error').length;
  const progress = items.length ? Math.round(((done + failed) / Math.max(1, items.filter((it) => it.selected).length)) * 100) : 0;

  if (phase === 'pick' || phase === 'reading') {
    return (
      <section className="card import-card">
        <p className="muted">
          העלו קובץ אחד שמכיל הרבה מתכונים: <b>Word (.docx)</b>, <b>PDF</b>, <b>קובץ טקסט</b> או <b>JSON</b>.
          האפליקציה תזהה כל מתכון בנפרד, תציג לכם רשימה לאישור, ואז תפרק כל מתכון למצרכים והוראות ותשמור אותו.
        </p>
        <div
          className="dropzone"
          onClick={() => phase === 'pick' && fileRef.current.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); if (phase === 'pick') onFile(e.dataTransfer.files[0]); }}
        >
          {phase === 'reading' ? (
            <div className="loading">📖 קורא את "{fileName}" ומזהה את המתכונים... (בקובץ גדול זה יכול לקחת עד דקה)</div>
          ) : (
            <><div className="empty-icon">📚</div><b>לחצו לבחירת קובץ או גררו לכאן</b><small className="muted">docx · pdf · txt · json</small></>
          )}
        </div>
        <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={(e) => { onFile(e.target.files[0]); e.target.value = ''; }} />
        {!meta?.aiEnabled && <div className="alert">⚠️ בלי מפתח AI, הזיהוי מבוסס על כותרות "מצרכים:" ו"אופן ההכנה:" בכל מתכון.</div>}
        {error && <div className="alert alert-error">{error}</div>}
      </section>
    );
  }

  return (
    <section className="card import-card">
      <div className="import-head">
        <div>
          <h2>📚 {fileName}</h2>
          <p className="muted">
            נמצאו {items.length} מתכונים
            {engine === 'heuristic' && ' (זיהוי בסיסי – כדאי לעבור על הרשימה)'}
            {engine === 'json' && ' (קובץ JSON – יישמרו כמו שהם)'}
          </p>
        </div>
        {phase === 'review' && (
          <div className="row">
            <button type="button" className="btn btn-sm" onClick={() => setItems((l) => l.map((it) => ({ ...it, selected: true })))}>סימון הכל</button>
            <button type="button" className="btn btn-sm" onClick={() => setItems((l) => l.map((it) => ({ ...it, selected: false })))}>ניקוי</button>
          </div>
        )}
      </div>

      {phase !== 'review' && (
        <div className="import-progress">
          <div className="match-bar"><div style={{ width: `${progress}%` }} /></div>
          <span>{done} נשמרו{failed ? ` · ${failed} נכשלו` : ''}</span>
        </div>
      )}
      {phase === 'importing' && <div className="alert">⏳ מייבא... אל תסגרו את הדף עד שהייבוא יסתיים.</div>}

      <ol className="import-list">
        {items.map((it, i) => (
          <li key={i} className={`import-item ${STATUS[it.status].cls}`}>
            <label className="import-row">
              <input
                type="checkbox" checked={it.selected} disabled={phase !== 'review'}
                onChange={(e) => update(i, { selected: e.target.checked })}
              />
              <span className="import-title">{it.title || `מתכון ${i + 1}`}</span>
              <span className={`import-status ${STATUS[it.status].cls}`}>{STATUS[it.status].label}</span>
              {it.recipeId && <Link to={`/recipes/${it.recipeId}`} className="btn btn-sm">פתיחה</Link>}
              {it.text && (
                <button type="button" className="btn btn-sm" onClick={(e) => { e.preventDefault(); setOpen(open === i ? null : i); }}>
                  {open === i ? 'הסתרה' : 'הצגת הטקסט'}
                </button>
              )}
            </label>
            {it.error && <div className="import-error">{it.error}</div>}
            {open === i && <pre className="import-text">{it.text}</pre>}
          </li>
        ))}
      </ol>

      <div className="row import-actions">
        {phase === 'review' && (
          <>
            <button type="button" className="btn btn-primary btn-lg" disabled={!selected.length} onClick={run}>
              ✨ ייבוא {selected.length} מתכונים
            </button>
            <button type="button" className="btn" onClick={() => { setItems([]); setPhase('pick'); }}>קובץ אחר</button>
          </>
        )}
        {phase === 'importing' && (
          <button type="button" className="btn" onClick={() => { stopRef.current = true; }}>⏸ עצירה אחרי המתכון הנוכחי</button>
        )}
        {phase === 'finished' && (
          <>
            {items.some((it) => it.selected && it.status !== 'done') && (
              <button type="button" className="btn btn-primary" onClick={run}>🔁 ניסיון חוזר ל-{items.filter((it) => it.selected && it.status !== 'done').length} שנותרו</button>
            )}
            <Link to="/" className="btn btn-primary">📖 למתכונים שלי</Link>
            <button type="button" className="btn" onClick={() => { setItems([]); setPhase('pick'); }}>ייבוא קובץ נוסף</button>
          </>
        )}
      </div>
      {phase === 'review' && engine !== 'json' && meta?.aiEnabled && (
        <small className="muted">כל מתכון מפוענח בנפרד עם AI (כמה שניות לכל אחד). אפשר לעצור באמצע ולהמשיך אחר כך.</small>
      )}
    </section>
  );
}
