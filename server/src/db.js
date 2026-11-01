import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const dbFile = process.env.DB_FILE || path.join(DATA_DIR, 'cheffo3.db');
export const db = new DatabaseSync(dbFile);

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS recipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  emoji TEXT DEFAULT '🍽️',
  image TEXT,
  category TEXT DEFAULT 'עיקריות',
  cuisine TEXT DEFAULT '',
  prep_minutes INTEGER,
  cook_minutes INTEGER,
  servings INTEGER DEFAULT 4,
  difficulty TEXT DEFAULT 'בינוני',
  tags TEXT DEFAULT '[]',
  source TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  favorite INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  section TEXT DEFAULT '',
  name TEXT NOT NULL,
  quantity REAL,
  unit TEXT DEFAULT '',
  note TEXT DEFAULT '',
  category TEXT DEFAULT 'אחר',
  search_term TEXT DEFAULT '',
  emoji TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS recipe_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  text TEXT NOT NULL,
  tip TEXT DEFAULT '',
  minutes INTEGER
);

CREATE TABLE IF NOT EXISTS ingredient_images (
  key TEXT PRIMARY KEY,
  image_url TEXT,
  source TEXT,
  product_name TEXT,
  manual INTEGER DEFAULT 0,
  fetched_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shopping_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  quantity REAL,
  unit TEXT DEFAULT '',
  category TEXT DEFAULT 'אחר',
  search_term TEXT DEFAULT '',
  emoji TEXT DEFAULT '',
  checked INTEGER DEFAULT 0,
  recipes TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pantry (
  name TEXT PRIMARY KEY,
  added_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ing_recipe ON recipe_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_steps_recipe ON recipe_steps(recipe_id);
`);

/** Run fn inside a transaction. */
export function tx(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
