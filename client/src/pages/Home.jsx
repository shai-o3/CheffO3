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

  return (
    <>
      <section className="hero">
        <div>
          <h1>מה נבשל היום? 🍲</h1>
          <p>כל המתכונים שלך במקום אחד, מסודרים ואחידים. מדביקים טקסט, הודעת וואטסאפ או צילום מסך – והבינה המלאכותית עושה את השאר.</p>
          <div className="hero-actions">
            <Link to="/add" className="btn btn-primary">➕ הוספת מתכון</Link>
            <Link to="/cook" className="btn">🧺 מה אפשר להכין ממה שיש?</Link>
          </div>
        </div>
      </section>

      <div className="search-bar">
        <input
          type="search"
          placeholder="🔍 חיפוש לפי שם, מצרך או תגית..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="button" className={`chip ${favorite ? 'active' : ''}`} onClick={() => setFavorite((f) => !f)}>
          ❤️ מועדפים
        </button>
      </div>

      <TagFilter meta={meta} selected={tags} onChange={setTags} />

      {recipes === null ? (
        <div className="loading">טוען מתכונים...</div>
      ) : recipes.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">🥄</div>
          <p>לא נמצאו מתכונים.</p>
          <Link to="/add" className="btn btn-primary">הוסיפו את המתכון הראשון</Link>
        </div>
      ) : (
        <div className="grid">
          {recipes.map((r) => (
            <RecipeCard
              key={r.id} recipe={r} onFavorite={toggleFav} generating={generatingId === r.id}
              onImageChange={(u) => setRecipes((list) => list.map((x) => (x.id === u.id ? { ...x, image: u.image } : x)))}
            />
          ))}
        </div>
      )}
    </>
  );
}
