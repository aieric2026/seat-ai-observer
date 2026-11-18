import { readFile, writeFile } from 'node:fs/promises';

// The old public archive also drove the Windows updater. Pages only needs its articles.
const path = new URL('../dist/data/news.json', import.meta.url);
const archive = JSON.parse(await readFile(path, 'utf8'));
const fields = ['id','title','summary','category','relatedCategories','aiRelation',
  'sourceName','url','publishedAt','collectedAt','evidenceNote','tags'];
const articles = archive.articles.map(article =>
  Object.fromEntries(fields.map(key => [key, article[key]])));
await writeFile(path, JSON.stringify({ articles, runs: [], settings: {} }) + '\n');
