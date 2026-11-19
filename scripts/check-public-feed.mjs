import { readFile } from 'node:fs/promises';
import { parsePublicFeed, parseNewsData, mergePublicFeed } from '../src/data.ts';

const feed = JSON.parse(await readFile(new URL('../public/data/verified.json', import.meta.url), 'utf8'));
const archive = JSON.parse(await readFile(new URL('../public/data/news.json', import.meta.url), 'utf8'));
const articles = mergePublicFeed(parseNewsData(archive).articles, parsePublicFeed(feed));
// Both authenticated updaters may discover the same original. The archive takes
// precedence, exactly as in the UI; an overlap must not block future publication.
console.log('Public feed verified:', feed.length, 'supplemental articles;', articles.length, 'unique articles');
