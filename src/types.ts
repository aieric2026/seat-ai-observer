export type Article = {
  id: string;
  title: string;
  summary: string;
  category: string;
  relatedCategories: string[];
  aiRelation: "direct" | "enabling" | "adjacent";
  sourceName: string;
  url: string;
  publishedAt: string | null;
  collectedAt: string;
  evidenceNote: string;
  tags: string[];
};
export type Run = {
  runId: string;
  startedAt?: string;
  completedAt: string;
  status: "success" | "partial" | "failed";
  kind?: "collection" | "bootstrap" | "configuration";
  addedCount: number;
  checkedSources: number;
  note: string;
  failures: string[];
};
export type Schedule = {
  enabled?: boolean;
  time?: string;
  timezone?: string;
  mode?: string;
  verified?: boolean;
};
export type NewsData = {
  articles: Article[];
  runs: Run[];
  settings: {
    schedule?: Schedule;
    lastSuccessfulCollectionAt?: string | null;
    [key: string]: unknown;
  };
  generatedAt?: string;
};
