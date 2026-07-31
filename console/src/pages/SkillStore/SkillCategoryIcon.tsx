/**
 * Skill category icon – each entry gets a unique gradient + SVG path.
 * Pure inline SVG, zero external dependencies.
 */
import { useId } from "react";
import type { CSSProperties } from "react";

interface IconDef {
  gradFrom: string;
  gradTo: string;
  shadow: string;
  svg: (id: string) => React.ReactNode;
}

const ICONS: Record<string, IconDef> = {
  开发编程: {
    gradFrom: "#6366f1",
    gradTo: "#8b5cf6",
    shadow: "rgba(99,102,241,0.45)",
    svg: (id) => (
      <>
        <defs>
          <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
        <rect width="44" height="44" rx="13" fill={`url(#${id})`} />
        {/* </> code icon */}
        <polyline
          points="14,16 9,22 14,28"
          fill="none"
          stroke="rgba(255,255,255,0.9)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="30,16 35,22 30,28"
          fill="none"
          stroke="rgba(255,255,255,0.9)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line
          x1="25"
          y1="14"
          x2="19"
          y2="30"
          stroke="rgba(255,255,255,0.65)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </>
    ),
  },

  "AI Agent": {
    gradFrom: "#06b6d4",
    gradTo: "#3b82f6",
    shadow: "rgba(6,182,212,0.45)",
    svg: (id) => (
      <>
        <defs>
          <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
        </defs>
        <rect width="44" height="44" rx="13" fill={`url(#${id})`} />
        {/* Neural spark / robot face */}
        <circle cx="22" cy="19" r="6" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" />
        <line x1="22" y1="13" x2="22" y2="10" stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round" />
        <circle cx="22" cy="9" r="1.5" fill="rgba(255,255,255,0.9)" />
        <rect x="13" y="23" width="18" height="9" rx="4.5" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" />
        <circle cx="18" cy="27.5" r="1.5" fill="rgba(255,255,255,0.9)" />
        <circle cx="26" cy="27.5" r="1.5" fill="rgba(255,255,255,0.9)" />
        <line x1="13" y1="27.5" x2="10" y2="27.5" stroke="rgba(255,255,255,0.7)" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="31" y1="27.5" x2="34" y2="27.5" stroke="rgba(255,255,255,0.7)" strokeWidth="1.8" strokeLinecap="round" />
      </>
    ),
  },

  办公效率: {
    gradFrom: "#10b981",
    gradTo: "#059669",
    shadow: "rgba(16,185,129,0.45)",
    svg: (id) => (
      <>
        <defs>
          <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
        </defs>
        <rect width="44" height="44" rx="13" fill={`url(#${id})`} />
        {/* Document with check lines */}
        <rect x="11" y="8" width="18" height="22" rx="2.5" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.8" />
        <line x1="15" y1="14" x2="25" y2="14" stroke="rgba(255,255,255,0.9)" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="15" y1="18" x2="25" y2="18" stroke="rgba(255,255,255,0.9)" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="15" y1="22" x2="21" y2="22" stroke="rgba(255,255,255,0.9)" strokeWidth="1.8" strokeLinecap="round" />
        {/* Checkmark badge */}
        <circle cx="29" cy="29" r="6" fill="#10b981" stroke="rgba(255,255,255,0.9)" strokeWidth="2" />
        <polyline points="25.5,29 27.5,31 32,26" fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },

  设计多媒体: {
    gradFrom: "#ec4899",
    gradTo: "#f43f5e",
    shadow: "rgba(236,72,153,0.45)",
    svg: (id) => (
      <>
        <defs>
          <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ec4899" />
            <stop offset="100%" stopColor="#f43f5e" />
          </linearGradient>
        </defs>
        <rect width="44" height="44" rx="13" fill={`url(#${id})`} />
        {/* Diamond */}
        <polygon points="22,8 36,18 22,36 8,18" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinejoin="round" />
        <line x1="8" y1="18" x2="36" y2="18" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" />
        <line x1="22" y1="8" x2="8" y2="18" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" />
        <line x1="22" y1="8" x2="36" y2="18" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" />
        <circle cx="22" cy="22" r="3" fill="rgba(255,255,255,0.7)" />
      </>
    ),
  },

  行业专业: {
    gradFrom: "#f59e0b",
    gradTo: "#f97316",
    shadow: "rgba(245,158,11,0.45)",
    svg: (id) => (
      <>
        <defs>
          <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#f97316" />
          </linearGradient>
        </defs>
        <rect width="44" height="44" rx="13" fill={`url(#${id})`} />
        {/* Building */}
        <rect x="10" y="14" width="24" height="20" rx="2" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.8" />
        <polyline points="7,14 22,7 37,14" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.8" strokeLinejoin="round" />
        <rect x="15" y="20" width="5" height="6" rx="1" fill="rgba(255,255,255,0.55)" />
        <rect x="24" y="20" width="5" height="6" rx="1" fill="rgba(255,255,255,0.55)" />
        <rect x="18" y="28" width="8" height="6" fill="rgba(255,255,255,0.55)" />
      </>
    ),
  },

  商业运营: {
    gradFrom: "#3b82f6",
    gradTo: "#1d4ed8",
    shadow: "rgba(59,130,246,0.45)",
    svg: (id) => (
      <>
        <defs>
          <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </linearGradient>
        </defs>
        <rect width="44" height="44" rx="13" fill={`url(#${id})`} />
        {/* Rising chart + arrow */}
        <polyline points="8,30 16,22 22,26 30,16 38,10" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="33,10 38,10 38,15" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="8" y1="34" x2="38" y2="34" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" strokeLinecap="round" />
      </>
    ),
  },

  "IT 运维与安全": {
    gradFrom: "#ef4444",
    gradTo: "#dc2626",
    shadow: "rgba(239,68,68,0.45)",
    svg: (id) => (
      <>
        <defs>
          <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="100%" stopColor="#dc2626" />
          </linearGradient>
        </defs>
        <rect width="44" height="44" rx="13" fill={`url(#${id})`} />
        {/* Shield with lock */}
        <path d="M22 7 L35 12 L35 21 C35 28 29 33 22 36 C15 33 9 28 9 21 L9 12 Z" fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinejoin="round" />
        <rect x="17" y="21" width="10" height="8" rx="2" fill="rgba(255,255,255,0.9)" />
        <path d="M18.5 21 L18.5 18.5 C18.5 16.5 25.5 16.5 25.5 18.5 L25.5 21" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round" />
        <circle cx="22" cy="25" r="1.5" fill="#ef4444" />
      </>
    ),
  },

  内容创作: {
    gradFrom: "#8b5cf6",
    gradTo: "#7c3aed",
    shadow: "rgba(139,92,246,0.45)",
    svg: (id) => (
      <>
        <defs>
          <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#7c3aed" />
          </linearGradient>
        </defs>
        <rect width="44" height="44" rx="13" fill={`url(#${id})`} />
        {/* Pen / feather */}
        <path d="M32 8 C36 8 36 14 32 14 L14 32 L9 35 L12 30 Z" fill="rgba(255,255,255,0.25)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.8" strokeLinejoin="round" />
        <line x1="9" y1="35" x2="15" y2="29" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="28" y1="12" x2="14" y2="26" stroke="rgba(255,255,255,0.6)" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="32" cy="10" r="2.5" fill="rgba(255,255,255,0.85)" />
      </>
    ),
  },

  数据分析: {
    gradFrom: "#0ea5e9",
    gradTo: "#0284c7",
    shadow: "rgba(14,165,233,0.45)",
    svg: (id) => (
      <>
        <defs>
          <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0ea5e9" />
            <stop offset="100%" stopColor="#0284c7" />
          </linearGradient>
        </defs>
        <rect width="44" height="44" rx="13" fill={`url(#${id})`} />
        {/* Bar chart + pie slice */}
        <rect x="9" y="24" width="7" height="10" rx="1.5" fill="rgba(255,255,255,0.6)" />
        <rect x="18.5" y="18" width="7" height="16" rx="1.5" fill="rgba(255,255,255,0.8)" />
        <rect x="28" y="12" width="7" height="22" rx="1.5" fill="rgba(255,255,255,0.95)" />
        <line x1="7" y1="34" x2="37" y2="34" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" strokeLinecap="round" />
      </>
    ),
  },

  教育学习: {
    gradFrom: "#22c55e",
    gradTo: "#16a34a",
    shadow: "rgba(34,197,94,0.45)",
    svg: (id) => (
      <>
        <defs>
          <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#22c55e" />
            <stop offset="100%" stopColor="#16a34a" />
          </linearGradient>
        </defs>
        <rect width="44" height="44" rx="13" fill={`url(#${id})`} />
        {/* Graduation cap */}
        <polygon points="22,9 36,16 22,23 8,16" fill="rgba(255,255,255,0.9)" />
        <line x1="36" y1="16" x2="36" y2="26" stroke="rgba(255,255,255,0.8)" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M13 20 L13 29 C13 29 17 33 22 33 C27 33 31 29 31 29 L31 20" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round" />
      </>
    ),
  },

  知识管理: {
    gradFrom: "#eab308",
    gradTo: "#ca8a04",
    shadow: "rgba(234,179,8,0.45)",
    svg: (id) => (
      <>
        <defs>
          <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#eab308" />
            <stop offset="100%" stopColor="#ca8a04" />
          </linearGradient>
        </defs>
        <rect width="44" height="44" rx="13" fill={`url(#${id})`} />
        {/* Database cylinders */}
        <ellipse cx="22" cy="13" rx="9" ry="3.5" fill="rgba(255,255,255,0.9)" />
        <rect x="13" y="13" width="18" height="6" fill="rgba(255,255,255,0.7)" />
        <ellipse cx="22" cy="19" rx="9" ry="3.5" fill="rgba(255,255,255,0.85)" />
        <rect x="13" y="19" width="18" height="6" fill="rgba(255,255,255,0.55)" />
        <ellipse cx="22" cy="25" rx="9" ry="3.5" fill="rgba(255,255,255,0.75)" />
        <rect x="13" y="25" width="18" height="5" fill="rgba(255,255,255,0.35)" />
        <ellipse cx="22" cy="30" rx="9" ry="3.5" fill="rgba(255,255,255,0.55)" />
      </>
    ),
  },

  其他: {
    gradFrom: "#64748b",
    gradTo: "#475569",
    shadow: "rgba(100,116,139,0.45)",
    svg: (id) => (
      <>
        <defs>
          <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#64748b" />
            <stop offset="100%" stopColor="#475569" />
          </linearGradient>
        </defs>
        <rect width="44" height="44" rx="13" fill={`url(#${id})`} />
        {/* Four-pointed star / sparkle */}
        <path
          d="M22 8 L24.5 19.5 L36 22 L24.5 24.5 L22 36 L19.5 24.5 L8 22 L19.5 19.5 Z"
          fill="rgba(255,255,255,0.9)"
        />
        <circle cx="22" cy="22" r="2.5" fill="rgba(100,116,139,0.8)" />
      </>
    ),
  },
};

const FALLBACK: IconDef = {
  gradFrom: "#6366f1",
  gradTo: "#8b5cf6",
  shadow: "rgba(99,102,241,0.45)",
  svg: (id) => (
    <>
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <rect width="44" height="44" rx="13" fill={`url(#${id})`} />
      <path
        d="M22 8 L24.5 19.5 L36 22 L24.5 24.5 L22 36 L19.5 24.5 L8 22 L19.5 19.5 Z"
        fill="rgba(255,255,255,0.9)"
      />
    </>
  ),
};

/** Returns a CSS linear-gradient string for the given category. */
export function categoryGradient(category: string): string {
  const def = ICONS[category] ?? FALLBACK;
  return `linear-gradient(135deg, ${def.gradFrom}, ${def.gradTo})`;
}

interface Props {
  category: string;
  size?: number;
  style?: CSSProperties;
  className?: string;
}

export function SkillCategoryIcon({ category, size = 44, style, className }: Props) {
  const def = ICONS[category] ?? FALLBACK;
  const reactId = useId();
  const uid = `scig-${reactId.replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 44 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        borderRadius: 13,
        flexShrink: 0,
        filter: `drop-shadow(0 4px 10px ${def.shadow})`,
        ...style,
      }}
      className={className}
      aria-hidden
    >
      {def.svg(uid)}
    </svg>
  );
}
