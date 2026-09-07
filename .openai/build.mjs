import { mkdirSync, cpSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The existing Netlify site can still serve the repository directly.
// Sites receives an explicit public-only copy; no source credentials or Git data.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'dist');
const pages = ['index.html', 'compressor.html', 'demos.html', 'metrics.html'];
const files = [...pages, 'style.css', 'experience.css', 'site.js', 'experience.js',
  'auth.js', 'compressor.js', 'demos.js', 'metrics.js', 'tokyra.png', 'assets'];
for (const page of pages) {
  const html = readFileSync(resolve(root, page), 'utf8');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  if (new Set(ids).size !== ids.length) throw new Error(`Duplicate IDs in ${page}`);
  for (const [, link] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (/^(https?:|mailto:|data:)/.test(link)) continue;
    const [file, hash] = link.split('#');
    if (file && !existsSync(resolve(root, file))) throw new Error(`Broken reference: ${page} -> ${link}`);
    if (!file && hash && !ids.includes(hash)) throw new Error(`Broken anchor: ${page} -> ${link}`);
  }
}
mkdirSync(output, { recursive: true });
for (const file of files) cpSync(resolve(root, file), resolve(output, file), { recursive: true });
console.log(`Validated ${pages.length} pages. Public site built in dist/.`);
