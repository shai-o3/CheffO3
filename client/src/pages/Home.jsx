import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import RecipeCard from '../components/RecipeCard.jsx';

export default function Home() {
  const { meta } = useApp();
  const [recipes, setRecipes] = useState(null);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [tag, setTag] = useState('');
  const [favorite, setFavorite] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      api.recipes({ q, category, tag, favorite }).then(setRecipes).catch(() => setRecipes([]));
    }, 200);
    return () => clearTimeout(t);
  }, [q, category, tag, favorite]);

  const toggleFav = async (r) => {
    const updated = await api.setFavorite(r.id, !r.favorite);
    setRecipes((list) => list.map((x) => (x.id === r.id ? { ...x, favorite: updated.favorite } : x)));
  };

  const categories = meta?.recipeCategories || [];
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

      <div className="chips scroll-x">
        <button type="button" className={`chip ${!category ? 'active' : ''}`} onClick={() => setCategory('')}>הכל</button>
        {categories.map((c) => (
          <button type="button" key={c} className={`chip ${category === c ? 'active' : ''}`} onClick={() => setCategory(category === c ? '' : c)}>
            {c}
          </button>
        ))}
      </div>
      {meta?.tags?.length > 0 && (
        <div className="chips scroll-x tags-row">
          {meta.tags.slice(0, 20).map((t) => (
            <button type="button" key={t.name} className={`chip chip-sm ${tag === t.name ? 'active' : ''}`} onClick={() => setTag(tag === t.name ? '' : t.name)}>
              #{t.name}
            </button>
          ))}
        </div>
      )}

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
          {recipes.map((r) => <RecipeCard key={r.id} recipe={r} onFavorite={toggleFav} />)}
        </div>
      )}
    </>
  );
}
