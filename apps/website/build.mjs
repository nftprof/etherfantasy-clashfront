// Build the static site — one module per page, all wrapped in the shared
// header/footer. Run `node build.mjs` after editing content; commits contain
// both the source (pages/*.js) and the generated .html files so the deploy
// agent has zero-tooling static output.
import { writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { wrapHtml } from './_shared.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGES = join(HERE, 'pages');
const files = readdirSync(PAGES).filter((f) => f.endsWith('.js'));

for (const f of files) {
  const mod = await import(pathToFileURL(join(PAGES, f)).href); // file:// — required on Windows
  const out = wrapHtml({
    title: mod.title,
    description: mod.description,
    body: mod.body,
    page: f.replace(/\.js$/, ''),
  });
  const slug = f.replace(/\.js$/, '.html');
  writeFileSync(join(HERE, slug), out, 'utf-8');
  console.log(`  ${slug}  (${(out.length / 1024).toFixed(1)}k)`);
}
console.log(`\nBuilt ${files.length} pages.`);
