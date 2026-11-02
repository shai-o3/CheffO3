import './env.js';
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { UPLOADS_DIR } from './db.js';
import * as recipes from './recipes.js';
import * as shopping from './shopping.js';
import { getIngredientImage, setManualImage, resetImage } from './images.js';
import { aiEnabled, extractRecipe, suggestRecipes, adaptRecipe, askChef, splitRecipes } from './ai.js';
import { imageGenEnabled, generateDishImage } from './imageGen.js';
import { INGREDIENT_CATEGORIES, RECIPE_CATEGORIES, DIFFICULTIES, STAPLES, splitRecipesHeuristic } from './hebrew.js';
import * as wa from './whatsapp.js';
import { seedIfEmpty } from './seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.join(__dirname, '..', '..', 'client', 'dist');
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 6 },
  fileFilter: (_req, file, cb) => cb(null, IMAGE_TYPES.includes(file.mimetype)),
});

function saveUpload(file) {
  const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' }[file.mimetype] || '.img';
  const name = crypto.randomBytes(10).toString('hex') + ext;
  fs.writeFileSync(path.join(UPLOADS_DIR, name), file.buffer);
  return `/uploads/${name}`;
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const notFound = () => Object.assign(new Error('לא נמצא'), { status: 404 });

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));
  app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '30d' }));

  const api = express.Router();

  // The local server has no accounts (single user).
  api.get('/session', (_req, res) => res.json({ authRequired: false }));

  api.get('/meta', (_req, res) => res.json({
    aiEnabled: aiEnabled(), imageGen: imageGenEnabled(), whatsappBot: wa.whatsappConfigured(),
    ingredientCategories: INGREDIENT_CATEGORIES, recipeCategories: RECIPE_CATEGORIES, difficulties: DIFFICULTIES,
    staples: STAPLES, tags: recipes.allTags(), knownIngredients: recipes.knownIngredients(),
  }));

  // ---- recipes
  api.get('/recipes', (req, res) => res.json(recipes.listRecipes({
    q: req.query.q, category: req.query.category, tag: req.query.tag, favorite: req.query.favorite === '1',
  })));
  api.get('/recipes/:id', (req, res) => {
    const r = recipes.getRecipe(Number(req.params.id));
    if (!r) throw notFound();
    res.json(r);
  });
  api.post('/recipes', (req, res) => res.status(201).json(recipes.createRecipe(req.body)));
  api.put('/recipes/:id', (req, res) => {
    const r = recipes.updateRecipe(Number(req.params.id), req.body);
    if (!r) throw notFound();
    res.json(r);
  });
  api.patch('/recipes/:id/favorite', (req, res) => res.json(recipes.setFavorite(Number(req.params.id), !!req.body.favorite)));
  api.delete('/recipes/:id', (req, res) => {
    if (!recipes.deleteRecipe(Number(req.params.id))) throw notFound();
    res.status(204).end();
  });
  api.post('/recipes/:id/image', upload.single('image'), (req, res) => {
    if (!req.file) throw Object.assign(new Error('יש להעלות קובץ תמונה'), { status: 400 });
    const r = recipes.updateRecipe(Number(req.params.id), { image: saveUpload(req.file) });
    if (!r) throw notFound();
    res.json(r);
  });
  api.post('/recipes/:id/generate-image', wrap(async (req, res) => {
    const r = recipes.getRecipe(Number(req.params.id));
    if (!r) throw notFound();
    const img = await generateDishImage(r);
    const image = saveUpload({ mimetype: img.mimeType, buffer: Buffer.from(img.data, 'base64') });
    res.json(recipes.updateRecipe(r.id, { image }));
  }));
  api.get('/recipes/:id/whatsapp', (req, res) => {
    const r = recipes.getRecipe(Number(req.params.id));
    if (!r) throw notFound();
    const base = process.env.APP_PUBLIC_URL?.replace(/\/$/, '');
    res.json({ text: wa.recipeToWhatsApp(r, { servings: Number(req.query.servings) || undefined, url: base && `${base}/recipes/${r.id}` }) });
  });

  // ---- AI
  // Extract a recipe from text and/or uploaded images (multipart: text, images[]).
  api.post('/ai/extract', upload.array('images', 6), wrap(async (req, res) => {
    const files = req.files || [];
    const text = wa.cleanWhatsAppText(req.body.text || '');
    if (!text.trim() && !files.length) throw Object.assign(new Error('יש להזין טקסט או להעלות תמונה'), { status: 400 });
    const recipe = await extractRecipe({
      text, images: files.map((f) => ({ media_type: f.mimetype, data: f.buffer.toString('base64') })),
    });
    // Keep the first uploaded photo as a candidate cover image.
    if (files.length && req.body.keepImage === '1') recipe.image = saveUpload(files[0]);
    res.json(recipe);
  }));
  api.post('/ai/split', wrap(async (req, res) => {
    const text = wa.cleanWhatsAppText(String(req.body.text || ''));
    if (!text.trim()) throw Object.assign(new Error('הקובץ ריק או שלא נמצא בו טקסט'), { status: 400 });
    if (text.length > 400_000) throw Object.assign(new Error('הקובץ ארוך מדי (מעל 400,000 תווים). חלקו אותו לכמה קבצים.'), { status: 413 });
    res.json({ engine: aiEnabled() ? 'ai' : 'heuristic', recipes: aiEnabled() ? await splitRecipes(text) : splitRecipesHeuristic(text) });
  }));
  api.post('/ai/suggest', wrap(async (req, res) => {
    const pantry = req.body.pantry?.length ? req.body.pantry : shopping.listPantry();
    if (!pantry.length) throw Object.assign(new Error('הוסיפו מצרכים שיש לכם בבית'), { status: 400 });
    const existingTitles = recipes.listRecipes().map((r) => r.title);
    res.json(await suggestRecipes({ pantry, preferences: req.body.preferences, count: Math.min(Number(req.body.count) || 3, 5), existingTitles }));
  }));
  api.post('/recipes/:id/adapt', wrap(async (req, res) => {
    const r = recipes.getRecipe(Number(req.params.id));
    if (!r) throw notFound();
    res.json(await adaptRecipe(r, String(req.body.instruction || '')));
  }));
  api.post('/recipes/:id/ask', wrap(async (req, res) => {
    const r = recipes.getRecipe(Number(req.params.id));
    if (!r) throw notFound();
    res.json({ answer: await askChef(r, String(req.body.question || ''), req.body.history || []) });
  }));

  // ---- match by ingredients
  api.post('/match', (req, res) => {
    const have = req.body.have?.length ? req.body.have : shopping.listPantry();
    res.json(recipes.matchByIngredients(have, { ignoreStaples: req.body.ignoreStaples !== false }));
  });

  // ---- pantry
  api.get('/pantry', (_req, res) => res.json(shopping.listPantry()));
  api.post('/pantry', (req, res) => res.json(shopping.addPantry([].concat(req.body.names || req.body.name || []))));
  api.delete('/pantry', (_req, res) => res.json(shopping.clearPantry()));
  api.delete('/pantry/:name', (req, res) => res.json(shopping.removePantry(req.params.name)));

  // ---- shopping list
  api.get('/shopping', (_req, res) => res.json(shopping.listItems()));
  api.get('/shopping/whatsapp', (_req, res) => res.json({ text: wa.shoppingListToWhatsApp(shopping.listItems()) }));
  api.post('/shopping', (req, res) => {
    const items = Array.isArray(req.body) ? req.body : [req.body];
    items.forEach((i) => shopping.addItem(i));
    res.status(201).json(shopping.listItems());
  });
  api.post('/shopping/from-recipe/:id', (req, res) => {
    const out = shopping.addFromRecipe(Number(req.params.id), req.body || {});
    if (!out) throw notFound();
    res.json(out);
  });
  api.patch('/shopping/:id', (req, res) => {
    const item = shopping.updateItem(Number(req.params.id), req.body);
    if (!item) throw notFound();
    res.json(item);
  });
  api.delete('/shopping/:id', (req, res) => { shopping.deleteItem(Number(req.params.id)); res.status(204).end(); });
  api.delete('/shopping', (req, res) => { shopping.clearItems({ onlyChecked: req.query.checked === '1' }); res.json(shopping.listItems()); });

  // ---- ingredient images
  api.get('/ingredient-image', wrap(async (req, res) => {
    const name = String(req.query.name || '');
    res.set('Cache-Control', 'public, max-age=3600');
    res.json(await getIngredientImage(name, String(req.query.q || name)));
  }));
  api.put('/ingredient-image', (req, res) => res.json(setManualImage(String(req.body.term || ''), req.body.url)));
  api.post('/ingredient-image/upload', upload.single('image'), (req, res) => {
    if (!req.file) throw Object.assign(new Error('יש להעלות קובץ תמונה'), { status: 400 });
    res.json(setManualImage(String(req.body.term || ''), saveUpload(req.file)));
  });
  api.delete('/ingredient-image', (req, res) => { resetImage(String(req.query.term || '')); res.status(204).end(); });

  // ---- WhatsApp Cloud API webhook
  api.get('/whatsapp/webhook', (req, res) => {
    const challenge = wa.verifyWebhook(req.query);
    if (challenge == null) return res.sendStatus(403);
    res.send(challenge);
  });
  api.post('/whatsapp/webhook', (req, res) => {
    res.sendStatus(200); // acknowledge fast; WhatsApp retries otherwise
    if (wa.whatsappConfigured()) wa.handleWebhook(req.body);
  });

  app.use('/api', api);

  // Web Share Target (PWA): sharing from WhatsApp / gallery on Android posts here.
  app.post('/share-target', upload.array('images', 6), (req, res) => {
    const text = [req.body.title, req.body.text, req.body.url].filter(Boolean).join('\n');
    const imgs = (req.files || []).map(saveUpload);
    const params = new URLSearchParams({ text });
    if (imgs.length) params.set('images', imgs.join(','));
    res.redirect(303, `/add?${params}`);
  });

  if (fs.existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST));
    app.get(/^\/(?!api|uploads).*/, (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status || (err instanceof multer.MulterError ? 400 : 500);
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 && !err.status ? 'שגיאת שרת' : err.message });
  });
  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedIfEmpty();
  const port = Number(process.env.PORT) || 3001;
  createApp().listen(port, () => {
    console.log(`CheffO3 server on http://localhost:${port}  (AI: ${aiEnabled() ? 'on' : 'off'}, WhatsApp bot: ${wa.whatsappConfigured() ? 'on' : 'off'})`);
  });
}
