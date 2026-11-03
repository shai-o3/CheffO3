import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import RecipeCard from '../components/RecipeCard.jsx';
import TagFilter from '../components/TagFilter.jsx';
import { ensureDishImage } from '../dishImages.js';

export default function Home() {
  const { meta } = useApp();
  const [recipes, setRecipes] = useState(null);
  const [q, setQ] = useState('');
  const [tags, setTags] = useState([]);
  const [favorite, setFavorite] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      api.recipes({ q, tags: tags.join(','), favorite }).then(setRecipes).catch(() => setRecipes([]));
    }, 200);
    return () => clearTimeout(t);
  }, [q, tags, favorite]);

  // Fill in missing dish photos, one at a time.
  const [generatingId, setGeneratingId] = useState(null);
  useEffect(() => {
    if (!meta?.imageGen || !recipes) return undefined;
    let cancelled = false;
    (async () => {
      for (const r of recipes.filter((x) => !x.image)) {
        if (cancelled) break;
        setGeneratingId(r.id);
        const updated = await ensureDishImage(r).catch(() => null);
        if (updated && !cancelled) setRecipes((list) => list.map((x) => (x.id === r.id ? { ...x, image: updated.image } : x)));
      }
      if (!cancelled) setGeneratingId(null);
    })();
    return () => { cancelled = true; };
  }, [meta?.imageGen, recipes?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleFav = async (r) => {
    const updated = await api.setFavorite(r.id, !r.favorite);
    setRecipes((list) => list.map((x) => (x.id === r.id ? { ...x, favorite: updated.favorite } : x)));
  };

  const [filterOpen, setFilterOpen] = useState(false);

  return (
    <div className="home">
      <input
        type="search"
        className="home-search"
        placeholder="🔍 חיפוש מתכון, מצרך או תגית..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="חיפוש מתכונים"
      />

      <div className="home-actions">
        <button type="button" className={`home-btn ${filterOpen || tags.length ? 'active' : ''}`} onClick={() => setFilterOpen((o) => !o)} aria-expanded={filterOpen}>
          <span className="home-btn-icon">🏷️</span>
          <span>סינון{tags.length ? ` (${tags.length})` : ''}</span>
        </button>
        <button type="button" className={`home-btn ${favorite ? 'active' : ''}`} onClick={() => setFavorite((f) => !f)} aria-pressed={favorite}>
          <span className="home-btn-icon">❤️</span>
          <span>מועדפים</span>
        </button>
        <Link to="/add" className="home-btn primary">
          <span className="home-btn-icon">➕</span>
          <span>הוספה</span>
        </Link>
      </div>

      {(filterOpen || tags.length > 0) && <TagFilter meta={meta} selected={tags} onChange={setTags} open={filterOpen} />}

      <Link to="/cook" className="home-btn home-btn-wide">
        <span className="home-btn-icon">🧺</span>
        <span>מה אפשר להכין ממה שיש?</span>
      </Link>

      {recipes === null ? (
        <div className="loading">טוען מתכונים...</div>
      ) : recipes.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">🥄</div>
          <p>{q || tags.length || favorite ? 'לא נמצאו מתכונים שמתאימים לחיפוש.' : 'עוד אין מתכונים.'}</p>
          <Link to="/add" className="btn btn-primary">➕ הוספת מתכון</Link>
        </div>
      ) : (
        <div className="recipe-grid">
          {recipes.map((r) => (
            <RecipeCard
              key={r.id} recipe={r} compact onFavorite={toggleFav} generating={generatingId === r.id}
              onImageChange={(u) => setRecipes((list) => list.map((x) => (x.id === u.id ? { ...x, image: u.image } : x)))}
            />
          ))}
        </div>
      )}

      <p className="home-footer"><Link to="/about">ℹ️ אודות CheffO3</Link></p>
    </div>
  );
}
