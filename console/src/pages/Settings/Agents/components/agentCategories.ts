export type AgentCategoryKey =
  | "featured"
  | "office"
  | "finance"
  | "content"
  | "data"
  | "productivity"
  | "dev"
  | "learning"
  | "info"
  | "business"
  | "travel"
  | "ai";

export const ALL_CATEGORY_KEY = "all";

export const DEFAULT_CATEGORY_KEY: AgentCategoryKey = "office";

export interface AgentCategoryOption {
  key: AgentCategoryKey;
  labelKey: string;
}

export const CATEGORY_OPTIONS: AgentCategoryOption[] = [
  { key: "featured", labelKey: "agent.categoryFeatured" },
  { key: "office", labelKey: "agent.categoryOffice" },
  { key: "finance", labelKey: "agent.categoryFinance" },
  { key: "content", labelKey: "agent.categoryContent" },
  { key: "data", labelKey: "agent.categoryData" },
  { key: "productivity", labelKey: "agent.categoryProductivity" },
  { key: "dev", labelKey: "agent.categoryDev" },
  { key: "learning", labelKey: "agent.categoryLearning" },
  { key: "info", labelKey: "agent.categoryInfo" },
  { key: "business", labelKey: "agent.categoryBusiness" },
  { key: "travel", labelKey: "agent.categoryTravel" },
  { key: "ai", labelKey: "agent.categoryAI" },
];

export function normalizeCategoryKey(value?: string | null): AgentCategoryKey {
  const found = CATEGORY_OPTIONS.find((o) => o.key === value);
  return found ? found.key : DEFAULT_CATEGORY_KEY;
}

export function categoryLabelKey(value?: string | null): string {
  return (
    CATEGORY_OPTIONS.find((o) => o.key === value)?.labelKey ??
    "agent.categoryOffice"
  );
}
