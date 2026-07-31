import { useId, type CSSProperties } from "react";
import { useTheme } from "../../../contexts/ThemeContext";

/** Geometric vector backdrop — blue/cyan, matches system theme */
function WelcomeVectorArt({ isDark }: { isDark: boolean }) {
  const uid = useId().replace(/:/g, "");
  const gOrb = `wb-orb-${uid}`;
  const gRing = `wb-ring-${uid}`;
  const gGrid = `wb-grid-${uid}`;

  const stroke = isDark ? "rgba(96,165,250,0.35)" : "rgba(59,130,246,0.28)";
  const strokeSoft = isDark ? "rgba(34,211,238,0.22)" : "rgba(14,165,233,0.20)";
  const fillSoft = isDark ? "rgba(59,130,246,0.12)" : "rgba(59,130,246,0.08)";

  return (
    <svg
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
      viewBox="0 0 960 160"
      preserveAspectRatio="xMaxYMid meet"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id={gOrb} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={isDark ? "#38bdf8" : "#3b82f6"} stopOpacity="0.55" />
          <stop offset="100%" stopColor={isDark ? "#6366f1" : "#6366f1"} stopOpacity="0.25" />
        </linearGradient>
        <linearGradient id={gRing} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={isDark ? "#22d3ee" : "#06b6d4"} stopOpacity="0.45" />
          <stop offset="100%" stopColor={isDark ? "#3b82f6" : "#2563eb"} stopOpacity="0.15" />
        </linearGradient>
        <pattern id={gGrid} width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M24 0H0V24" fill="none" stroke={strokeSoft} strokeWidth="0.8" />
        </pattern>
      </defs>

      {/* Soft grid wash on the right */}
      <rect x="520" y="0" width="440" height="160" fill={`url(#${gGrid})`} opacity="0.55" />

      {/* Abstract orbit rings */}
      <g transform="translate(780 80)">
        <circle r="68" fill="none" stroke={stroke} strokeWidth="1.2" strokeDasharray="4 6" />
        <circle r="48" fill="none" stroke={`url(#${gRing})`} strokeWidth="2" />
        <circle r="28" fill={fillSoft} stroke={strokeSoft} strokeWidth="1" />
        <circle r="10" fill={`url(#${gOrb})`} />
        {/* Satellite dots */}
        <circle cx="48" cy="-8" r="3.5" fill={isDark ? "#22d3ee" : "#0ea5e9"} opacity="0.85" />
        <circle cx="-42" cy="22" r="2.5" fill={isDark ? "#60a5fa" : "#3b82f6"} opacity="0.7" />
        <circle cx="18" cy="46" r="2" fill={isDark ? "#a5b4fc" : "#6366f1"} opacity="0.75" />
      </g>

      {/* Floating diamond / chip accents */}
      <g transform="translate(640 36)" fill="none" stroke={stroke} strokeWidth="1.4">
        <rect x="-10" y="-10" width="20" height="20" rx="3" transform="rotate(18)" fill={fillSoft} />
      </g>
      <g transform="translate(700 118)" fill="none" stroke={strokeSoft} strokeWidth="1.2">
        <path d="M0,-9 L8,0 L0,9 L-8,0 Z" fill={fillSoft} />
      </g>

      {/* Flowing wave strip at bottom */}
      <path
        d="M480,148 C560,128 620,152 700,136 C780,120 840,148 960,130 L960,160 L480,160 Z"
        fill={isDark ? "rgba(34,211,238,0.10)" : "rgba(59,130,246,0.10)"}
      />
      <path
        d="M500,156 C590,140 650,158 740,146 C820,136 880,154 960,142"
        fill="none"
        stroke={strokeSoft}
        strokeWidth="1.5"
      />
    </svg>
  );
}

export interface WelcomeBannerProps {
  displayName: string;
  deptName: string;
  positionTitle: string;
  welcomeText: string;
  deptLabel: string;
  positionLabel: string;
  unknownLabel: string;
}

export default function WelcomeBanner({
  displayName,
  deptName,
  positionTitle,
  welcomeText,
  deptLabel,
  positionLabel,
  unknownLabel,
}: WelcomeBannerProps) {
  const { isDark } = useTheme();

  const badgeBase: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "5px 12px",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 500,
    lineHeight: 1.2,
  };

  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        flexShrink: 0,
        margin: "16px 24px 0",
        minHeight: 128,
        padding: "24px 28px",
        borderRadius: 16,
        border: `1px solid ${isDark ? "rgba(96,165,250,0.22)" : "#bfdbfe"}`,
        background: isDark
          ? "linear-gradient(120deg, rgba(30,58,138,0.45) 0%, rgba(15,23,42,0.92) 55%, rgba(8,47,73,0.55) 100%)"
          : "linear-gradient(120deg, #dbeafe 0%, #eff6ff 40%, #f0f9ff 70%, #ffffff 100%)",
        boxShadow: isDark
          ? "0 8px 24px rgba(15,23,42,0.35)"
          : "0 8px 24px rgba(59,130,246,0.10)",
        display: "flex",
        alignItems: "center",
        gap: 18,
      }}
    >
      <WelcomeVectorArt isDark={isDark} />

      {/* Avatar */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: 56,
          height: 56,
          borderRadius: 16,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: isDark
            ? "linear-gradient(135deg, #2563eb, #0891b2)"
            : "linear-gradient(135deg, #3b82f6, #06b6d4)",
          color: "#fff",
          fontSize: 22,
          fontWeight: 700,
          boxShadow: "0 8px 20px rgba(37,99,235,0.35)",
        }}
      >
        {(displayName || "U").slice(0, 1).toUpperCase()}
      </div>

      {/* Text */}
      <div style={{ position: "relative", zIndex: 1, minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: isDark ? "#f8fafc" : "#0f172a",
            lineHeight: 1.35,
            letterSpacing: "-0.01em",
          }}
        >
          {welcomeText}
        </div>

        <div
          style={{
            marginTop: 12,
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {deptName ? (
            <span
              style={{
                ...badgeBase,
                background: isDark ? "rgba(59,130,246,0.22)" : "#dbeafe",
                color: isDark ? "#bfdbfe" : "#1e40af",
                border: `1px solid ${isDark ? "rgba(96,165,250,0.4)" : "rgba(59,130,246,0.35)"}`,
              }}
            >
              <i className="ri-building-4-line" style={{ fontSize: 14 }} />
              {deptLabel}{deptName}
            </span>
          ) : null}
          {positionTitle ? (
            <span
              style={{
                ...badgeBase,
                background: isDark ? "rgba(6,182,212,0.20)" : "#cffafe",
                color: isDark ? "#a5f3fc" : "#0e7490",
                border: `1px solid ${isDark ? "rgba(34,211,238,0.4)" : "rgba(6,182,212,0.35)"}`,
              }}
            >
              <i className="ri-briefcase-4-line" style={{ fontSize: 14 }} />
              {positionLabel}{positionTitle}
            </span>
          ) : null}
          {!deptName && !positionTitle ? (
            <span
              style={{
                ...badgeBase,
                background: isDark ? "rgba(148,163,184,0.15)" : "#f1f5f9",
                color: isDark ? "#94a3b8" : "#64748b",
                border: `1px solid ${isDark ? "rgba(148,163,184,0.25)" : "#e2e8f0"}`,
              }}
            >
              <i className="ri-user-unfollow-line" style={{ fontSize: 14 }} />
              {unknownLabel}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
