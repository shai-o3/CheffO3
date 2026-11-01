import { useState } from 'react';
import { api } from '../api.js';

const QUICK = ['במה אפשר להחליף את הביצים?', 'אפשר להכין מראש ולהקפיא?', 'איך לדעת שזה מוכן?', 'מה מתאים להגיש לצד זה?'];

export default function AskChef({ recipe }) {
  const [history, setHistory] = useState([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  const ask = async (question) => {
    if (!question.trim() || busy) return;
    const h = [...history, { role: 'user', content: question }];
    setHistory(h);
    setQ('');
    setBusy(true);
    try {
      const { answer } = await api.ask(recipe.id, question, history);
      setHistory([...h, { role: 'assistant', content: answer }]);
    } catch (e) {
      setHistory([...h, { role: 'assistant', content: `😕 ${e.message}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card ask-chef">
      <h2>💬 שאלו את השף</h2>
      <div className="chat">
        {history.length === 0 && (
          <div className="chips">
            {QUICK.map((x) => <button key={x} type="button" className="chip chip-sm" onClick={() => ask(x)}>{x}</button>)}
          </div>
        )}
        {history.map((m, i) => <div key={i} className={`bubble ${m.role}`}>{m.content}</div>)}
        {busy && <div className="bubble assistant typing">השף חושב...</div>}
      </div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="שאלה על המתכון, תחליפים, טכניקה..." />
        <button className="btn btn-primary" disabled={busy}>שליחה</button>
      </form>
    </section>
  );
}
