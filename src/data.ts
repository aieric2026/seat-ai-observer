import type { Article, NewsData, Run, Schedule } from "./types";

const domains = ["整椅", "骨架", "核心件", "电机", "执行器", "发泡", "面套", "线束", "开关", "控制器"];
const nonempty = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const validDate = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v));
function sourceUrl(v: unknown): v is string {
  if (!nonempty(v)) return false;
  try { const url = new URL(v); return url.protocol === "https:" && !url.username && !/^https:\/\/[^/?#]*@/i.test(v); }
  catch { return false; }
}

const publicFields = ["title", "summary", "category", "relatedCategories", "aiRelation", "sourceName", "url", "publishedAt", "evidenceNote"] as const;
export function parsePublicFeed(input: unknown): Article[] {
  if (!Array.isArray(input)) throw Error("公开资讯应为文章数组。");
  const seen = new Set<string>();
  return input.map((row: unknown) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw Error("公开资讯格式错误。");
    const a = row as Record<string, unknown>;
    if (Object.keys(a).length !== publicFields.length || !publicFields.every(k => Object.hasOwn(a, k))) {
      throw Error("公开资讯字段与发布范围不符。");
    }
    if (!sourceUrl(a.url)) throw Error("原文链接须为公开 HTTPS 地址。");
    const url = new URL(a.url);
    if (url.hash || url.password || [...url.searchParams.keys()].some(k => /^(?:utm_.*|fbclid|gclid|token|access_token|signature|sig|key|api_key|x-amz-.*)$/i.test(k))) {
      throw Error("请使用原文的规范链接。");
    }
    if (seen.has(url.href)) throw Error("公开资讯存在重复链接。");
    seen.add(url.href);
    const validPublicationDate = typeof a.publishedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(a.publishedAt)
      && validDate(a.publishedAt) && new Date(a.publishedAt).toISOString().slice(0, 10) === a.publishedAt;
    if (!validPublicationDate || ![a.title, a.summary, a.sourceName, a.evidenceNote].every(nonempty)
      || !domains.includes(String(a.category)) || !["direct","enabling","adjacent"].includes(String(a.aiRelation))
      || !Array.isArray(a.relatedCategories) || new Set(a.relatedCategories).size !== a.relatedCategories.length
      || !a.relatedCategories.every(c => domains.includes(c) && c !== a.category)) {
      throw Error("公开资讯缺少有效日期、分类、署名或证据。");
    }
    return { ...(row as Pick<Article, typeof publicFields[number]>), id: url.href, tags: [], collectedAt: "" };
  });
}

export function mergePublicFeed(archive: Article[], additions: Article[]): Article[] {
  const byUrl = new Map(archive.map(a => [a.url, a]));
  for (const article of additions) {
    if (!byUrl.has(article.url)) byUrl.set(article.url, article);
  }
  return [...byUrl.values()];
}
function article(v: unknown): v is Article {
  if (!v || typeof v !== "object") return false;
  const a = v as Record<string, unknown>;
  return [a.id, a.title, a.summary, a.sourceName, a.evidenceNote].every(nonempty)
    && domains.includes(String(a.category)) && ["direct", "enabling", "adjacent"].includes(String(a.aiRelation))
    && sourceUrl(a.url) && (a.publishedAt === null || validDate(a.publishedAt)) && validDate(a.collectedAt)
    && Array.isArray(a.tags) && a.tags.every(nonempty)
    && Array.isArray(a.relatedCategories) && a.relatedCategories.every(c => domains.includes(String(c)));
}
function run(v: unknown): v is Run {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return nonempty(r.runId) && validDate(r.completedAt) && ["success", "partial", "failed"].includes(String(r.status))
    && Number.isInteger(r.addedCount) && Number(r.addedCount) >= 0
    && Number.isInteger(r.checkedSources) && Number(r.checkedSources) >= 0
    && typeof r.note === "string" && Array.isArray(r.failures) && r.failures.every(nonempty);
}
export function parseNewsData(v: unknown): NewsData {
  if (!v || typeof v !== "object") throw Error("资讯文件格式不正确，请稍后重试。");
  const d = v as Record<string, unknown>;
  if (!Array.isArray(d.articles) || !d.articles.every(article) || !Array.isArray(d.runs) || !d.runs.every(run)) {
    throw Error("资讯文件校验失败，未用不完整内容替换已显示的数据。");
  }
  const settings = d.settings && typeof d.settings === "object" ? d.settings as NewsData["settings"] : {};
  if (settings.lastSuccessfulCollectionAt != null && !validDate(settings.lastSuccessfulCollectionAt)) throw Error("最后成功采集时间格式不正确。");
  if (settings.schedule !== undefined) {
    const s = settings.schedule as Schedule;
    if (!s || typeof s !== "object" || (s.enabled !== undefined && typeof s.enabled !== "boolean") || (s.mode === "local" && s.enabled && (s.time !== "10:00" || s.timezone !== "Asia/Shanghai"))) throw Error("更新计划格式不正确。");
  }
  return { articles: d.articles, runs: d.runs, settings,
    ...(validDate(d.generatedAt) ? { generatedAt: d.generatedAt } : {}) };
}
