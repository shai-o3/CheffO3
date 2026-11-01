import { useEffect, useRef, useState } from 'react';
import { api, shufersalLink } from '../api.js';

// Shared cache across the app: term -> Promise<{url}>
const cache = new Map();
function load(name, term) {
  const key = term || name;
  if (!cache.has(key)) cache.set(key, api.ingredientImage(name, key).catch(() => ({ url: null })));
  return cache.get(key);
}

/**
 * Product photo for an ingredient (looked up on Shufersal/Wikipedia by the server),
 * falling back to an emoji. Click (when editable) to replace the image.
 */
export default function IngredientImage({ name, term, emoji = '🥄', size = 52, editable = true }) {
  const key = term || name;
  const [img, setImg] = useState(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const fileRef = useRef();

  useEffect(() => {
    let alive = true;
    setFailed(false);
    load(name, key).then((r) => alive && setImg(r));
    return () => { alive = false; };
  }, [name, key]);

  const update = (p) => p.then((r) => {
    cache.set(key, Promise.resolve(r || { url: null }));
    setImg(r || { url: null });
    setFailed(false);
    setOpen(false);
  });

  const showImg = img?.url && !failed;
  return (
    <span className="ing-img-wrap" style={{ width: size, height: size }}>
      <button
        type="button"
        className="ing-img"
        style={{ width: size, height: size, fontSize: size * 0.55 }}
        onClick={() => editable && setOpen((o) => !o)}
        title={img?.product ? `${img.product}${img.source ? ` · ${img.source}` : ''}` : name}
      >
        {showImg ? <img src={img.url} alt={name} loading="lazy" onError={() => setFailed(true)} /> : <span>{emoji}</span>}
      </button>
      {open && (
        <div className="ing-pop" onClick={(e) => e.stopPropagation()}>
          <strong>{name}</strong>
          <a href={shufersalLink(key)} target="_blank" rel="noreferrer">🔎 חיפוש בשופרסל</a>
          <button type="button" onClick={() => fileRef.current.click()}>📷 העלאת תמונה</button>
          <button
            type="button"
            onClick={() => {
              const url = prompt('כתובת URL של תמונה:');
              if (url) update(api.setIngredientImage(key, url));
            }}
          >🔗 הדבקת קישור לתמונה</button>
          <button type="button" onClick={() => api.resetIngredientImage(key).then(() => { cache.delete(key); return update(load(name, key)); })}>
            🔄 חיפוש מחדש
          </button>
          <button type="button" className="muted" onClick={() => setOpen(false)}>סגירה</button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files[0] && update(api.uploadIngredientImage(key, e.target.files[0]))} />
        </div>
      )}
    </span>
  );
}
