// Load ../.env (repo root) or server/.env if present. Must be imported before other modules.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
for (const f of [path.join(here, '..', '.env'), path.join(here, '..', '..', '.env')]) {
  if (fs.existsSync(f)) process.loadEnvFile(f);
}
