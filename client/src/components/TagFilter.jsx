/**
 * Tag filter grouped by the standard vocabulary (course, kashrut, diet, main ingredient,
 * style) plus the user's other tags. Selected tags combine (recipe must have all).
 */
export default function TagFilter({ meta, selected, onChange, open = true }) {
  const counts = new Map((meta?.tags || []).map((t) => [t.name, t.count]));
  const groups = (meta?.tagGroups || [])
    .map((g) => ({ name: g.name, tags: g.tags.filter((t) => counts.has(t)) }))
    .filter((g) => g.tags.length);
  const standard = new Set((meta?.tagGroups || []).flatMap((g) => g.tags));
  const others = (meta?.tags || []).filter((t) => !standard.has(t.name)).slice(0, 24).map((t) => t.name);
  if (others.length) groups.push({ name: 'עוד', tags: others });

  const toggle = (t) => onChange(selected.includes(t) ? selected.filter((x) => x !== t) : [...selected, t]);

  return (
    <div className="tag-filter">
      {selected.length > 0 && (
      <div className="tag-filter-bar">
        {selected.map((t) => (
          <button type="button" key={t} className="chip chip-sm active" onClick={() => toggle(t)}>{t} ✕</button>
        ))}
        <button type="button" className="chip chip-sm" onClick={() => onChange([])}>ניקוי</button>
      </div>
      )}
      {open && (
        <div className="tag-groups">
          {groups.map((g) => (
            <div key={g.name} className="tag-group">
              <span className="tag-group-name">{g.name}</span>
              <div className="chips">
                {g.tags.map((t) => (
                  <button type="button" key={t} className={`chip chip-sm ${selected.includes(t) ? 'active' : ''}`} onClick={() => toggle(t)}>
                    {t} <small>{counts.get(t)}</small>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
