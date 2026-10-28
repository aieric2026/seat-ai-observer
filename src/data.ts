import type { Article, NewsData, Run, Schedule } from "./types";

const domains = ["整椅", "骨架", "核心件", "电机", "执行器", "发泡", "面套", "线束", "开关", "控制器"];
const nonempty = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const validDate = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v));
function sourceUrl(v: unknown): v is string {
  if (!nonempty(v)) return false;
  try { const url = new URL(v); return url.protocol === "https:" && !url.username && !/^https:\/\/[^/?#]*@/i.test(v); }
  catch { return false; }
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
