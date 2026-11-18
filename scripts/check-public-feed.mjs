import { readFile } from 'node:fs/promises';
import { parsePublicFeed } from '../src/data.ts';

const feed = JSON.parse(await readFile(new URL('../public/data/verified.json', import.meta.url), 'utf8'));
const archive = JSON.parse(await readFile(new URL('../public/data/news.json', import.meta.url), 'utf8'));
const existing = new Set(archive.articles.map(a => new URL(a.url).href));
for (const article of parsePublicFeed(feed)) {
  if (existing.has(new URL(article.url).href)) throw Error('Article already in public archive: ' + article.url);
}
console.log('Public feed verified:', feed.length, 'articles');
