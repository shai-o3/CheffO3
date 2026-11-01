import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import RecipeEditor from '../components/RecipeEditor.jsx';

export default function EditRecipe() {
  const { id } = useParams();
  const nav = useNavigate();
  const { notify, refreshMeta } = useApp();
  const [recipe, setRecipe] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.recipe(id).then(setRecipe).catch((e) => notify(e.message, 'error')); }, [id, notify]);

  const save = async (r) => {
    setSaving(true);
    try {
      await api.updateRecipe(id, r);
      notify('✅ השינויים נשמרו');
      refreshMeta();
      nav(`/recipes/${id}`);
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!recipe) return <div className="loading">טוען...</div>;
  return (
    <>
      <div className="page-head">
        <h1>✏️ עריכת "{recipe.title}"</h1>
        <button type="button" className="btn" onClick={() => nav(-1)}>→ ביטול</button>
      </div>
      <RecipeEditor initial={recipe} onSave={save} saving={saving} submitLabel="שמירת שינויים" />
    </>
  );
}
