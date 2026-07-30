export interface FeaturedCollection {
  id: string;
  title: string;
  description: string;
  coverImage: string;
  iconImage: string;
  href: string;
}

/** Decorative hero slides (local PNG under /skill-store/). */
export const FEATURED_COLLECTIONS: FeaturedCollection[] = [
  {
    id: "feat-1",
    title: "开发编程精选",
    description: "从 MinIO skills 桶一键安装到技能池",
    coverImage: "/skill-store/feat-dev-cover.png",
    iconImage: "/skill-store/feat-dev-icon.png",
    href: "/skill-store",
  },
  {
    id: "feat-2",
    title: "办公效率工具",
    description: "文档、汇报、协作类技能合集",
    coverImage: "/skill-store/feat-office-cover.png",
    iconImage: "/skill-store/feat-office-icon.png",
    href: "/skill-pool",
  },
  {
    id: "feat-3",
    title: "AI Agent 能力包",
    description: "多智能体协作与工作流技能",
    coverImage: "/skill-store/feat-agent-cover.png",
    iconImage: "/skill-store/feat-agent-icon.png",
    href: "/skill-store",
  },
];

const CATEGORY_ICONS: Record<string, string> = {
  开发编程: "ri-code-box-line",
  其他: "ri-more-line",
  "AI Agent": "ri-robot-2-line",
  办公效率: "ri-file-list-3-line",
  设计多媒体: "ri-palette-line",
  行业专业: "ri-briefcase-line",
  商业运营: "ri-megaphone-line",
  "IT 运维与安全": "ri-shield-check-line",
  内容创作: "ri-edit-line",
  数据分析: "ri-bar-chart-2-line",
  教育学习: "ri-book-open-line",
  知识管理: "ri-database-2-line",
};

export function categoryIcon(category: string): string {
  return CATEGORY_ICONS[category] || "ri-sparkling-line";
}
