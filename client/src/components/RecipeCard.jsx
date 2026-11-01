import { Link } from 'react-router-dom';
import { totalTime } from '../api.js';

export function RecipeCover({ recipe, className = '' }) {
  if (recipe.image) return <div className={`cover ${className}`} style={{ backgroundImage: `url(${recipe.image})` }} />;
  return (
    <div className={`cover cover-emoji ${className}`} data-cat={recipe.category}>
      <span>{recipe.emoji || '🍽️'}</span>
    </div>
  );
}

export default function RecipeCard({ recipe, onFavorite, extra }) {
  const t = totalTime(recipe);
  return (
    <article className="card recipe-card">
      <Link to={`/recipes/${recipe.id}`} className="recipe-card-link">
        <RecipeCover recipe={recipe} />
        <div className="recipe-card-body">
          <div className="recipe-card-cat">{recipe.category}</div>
          <h3>{recipe.title}</h3>
          {recipe.description && <p className="clamp">{recipe.description}</p>}
          <div className="meta-row">
            {t > 0 && <span>⏱️ {t} דק'</span>}
            {recipe.servings && <span>🍽️ {recipe.servings}</span>}
            {recipe.ingredient_count != null && <span>🧺 {recipe.ingredient_count} מצרכים</span>}
            <span>📊 {recipe.difficulty}</span>
          </div>
        </div>
      </Link>
      {extra}
      {onFavorite && (
        <button
          type="button"
          className={`fav-btn ${recipe.favorite ? 'on' : ''}`}
          onClick={() => onFavorite(recipe)}
          aria-label="מועדף"
        >
          {recipe.favorite ? '❤️' : '🤍'}
        </button>
      )}
    </article>
  );
}
