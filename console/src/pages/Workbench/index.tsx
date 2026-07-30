import { useMemo, useState } from "react";
import { Spin } from "antd";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../contexts/ThemeContext";
import { getSummonedAgentIds } from "../../utils/agentPresentationStorage";
import { useWorkbench } from "./useWorkbench";
import AgentStatusGrid from "./components/AgentStatusGrid";
import ActivityFeed from "./components/ActivityFeed";
import AITeamSection from "./components/AITeamSection";
import WorkbenchStatCards from "./components/WorkbenchStatCards";

export default function WorkbenchPage() {
  const { isDark } = useTheme();
  const { t } = useTranslation();
  const { agents, todayStats, recentChats, loading } = useWorkbench();
  const [searchVal, setSearchVal] = useState("");

  // Only agents in「我的 AI 团队」(summoned), same as chat selector / MyTeam page
  const teamAgents = useMemo(() => {
    const summonedIds = getSummonedAgentIds();
    return agents.filter((a) => summonedIds.has(a.id));
  }, [agents]);

  const filteredAgents = searchVal
    ? teamAgents.filter(
        (a) =>
          a.name.toLowerCase().includes(searchVal.toLowerCase()) ||
          (a.description ?? "").toLowerCase().includes(searchVal.toLowerCase()),
      )
    : teamAgents;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Page header */}
      <div
        style={{
          flexShrink: 0,
          borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "#e2e8f0"}`,
          padding: "12px 24px",
          display: "flex",
          alignItems: "center",
          gap: 16,
          background: isDark ? "rgba(17,24,39,0.8)" : "#ffffff",
          backdropFilter: "blur(8px)",
        }}
      >
        <h1
          style={{
            fontSize: 16,
            fontWeight: 600,
            margin: 0,
            whiteSpace: "nowrap",
            color: isDark ? "#ffffff" : "#0f172a",
          }}
        >
          {t("workbench.title", "岗位工作台")}
        </h1>

        <div style={{ flex: 1, maxWidth: 400, position: "relative" }}>
          <div
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: isDark ? "#475569" : "#94a3b8",
              pointerEvents: "none",
            }}
          >
            <i className="ri-search-line" style={{ fontSize: 14 }} />
          </div>
          <input
            type="text"
            value={searchVal}
            onChange={(e) => setSearchVal(e.target.value)}
            placeholder={t("workbench.search.placeholder", "搜索 Agent...")}
            style={{
              width: "100%",
              border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "#e2e8f0"}`,
              borderRadius: 8,
              paddingLeft: 32,
              paddingRight: 12,
              paddingTop: 6,
              paddingBottom: 6,
              fontSize: 13,
              background: isDark ? "#1a2235" : "#f8fafc",
              color: isDark ? "#cbd5e1" : "#334155",
              outline: "none",
              transition: "border-color 0.2s",
            }}
            onFocus={(e) => {
              e.target.style.borderColor = isDark
                ? "rgba(6,182,212,0.5)"
                : "#0891b2";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = isDark
                ? "rgba(255,255,255,0.08)"
                : "#e2e8f0";
            }}
          />
        </div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 12, color: isDark ? "#475569" : "#94a3b8" }}>
            {t("workbench.header.agentCount", {
              count: filteredAgents.length,
              defaultValue: `${filteredAgents.length} 个 Agent`,
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Spin tip={t("common.loading")} />
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            overflowY: "auto",
            overflowX: "hidden",
          }}
        >
          {/* Stat cards: agent count, sessions, LLM calls */}
          <WorkbenchStatCards agents={filteredAgents} todayStats={todayStats} />

          {/* Middle row: Agent status grid + Activity feed */}
          <div
            style={{
              flexShrink: 0,
              padding: "0 24px 16px",
              display: "grid",
              gridTemplateColumns: "2fr 1fr",
              gap: 16,
              height: 320,
            }}
          >
            <div style={{ height: "100%", minHeight: 0, overflow: "hidden" }}>
              <AgentStatusGrid agents={filteredAgents} />
            </div>
            <div style={{ height: "100%", minHeight: 0, overflow: "hidden" }}>
              <ActivityFeed recentChats={recentChats} />
            </div>
          </div>

          {/* AI Team cards */}
          <AITeamSection agents={filteredAgents} />
        </div>
      )}
    </div>
  );
}
