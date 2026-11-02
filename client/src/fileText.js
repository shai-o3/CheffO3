// Extract plain text from an uploaded recipe file, in the browser.
// Word (.docx) via mammoth, PDF via pdf.js, everything else as text.
// The parsers are loaded only when needed.

export async function fileToText(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.doc')) {
    throw new Error('קובצי Word ישנים (.doc) לא נתמכים. פתחו את הקובץ ב-Word ושמרו אותו בפורמט .docx');
  }
  if (name.endsWith('.docx')) {
    const mammoth = (await import('mammoth/mammoth.browser.js')).default;
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return value;
  }
  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const content = await (await doc.getPage(p)).getTextContent();
      pages.push(content.items.map((it) => it.str + (it.hasEOL ? '\n' : '')).join(''));
    }
    const text = pages.join('\n\n');
    if (!text.trim()) throw new Error('לא נמצא טקסט ב-PDF (כנראה שזו סריקה). העלו את העמודים כתמונות בלשונית "צילום מסך".');
    return text;
  }
  return file.text();
}

/** Recipes from a JSON file: an array of recipes, or { recipes: [...] } (e.g. a CheffO3 export). */
export function recipesFromJson(text) {
  let data;
  try { data = JSON.parse(text); } catch { return null; }
  const list = Array.isArray(data) ? data : Array.isArray(data?.recipes) ? data.recipes : null;
  if (!list) return null;
  return list.filter((r) => r && typeof r === 'object' && String(r.title || '').trim());
}
