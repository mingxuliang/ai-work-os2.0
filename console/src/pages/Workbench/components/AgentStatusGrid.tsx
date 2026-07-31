import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../../contexts/ThemeContext";
import { loadAgentPresentation } from "../../../utils/agentPresentationStorage";
import { resolveTeamIcon } from "../../Settings/Agents/components/agentTeamIcons";
import type { AgentWithStatus } from "../useWorkbench";
import dayjs from "dayjs";

type Filter = "all" | "running" | "idle" | "disabled";

interface Props {
  agents: AgentWithStatus[];
}

const statusConfig = {
  running: {
    label: "运行中",
    dot: "#4ade80",
    dotGlow: true,
    textColor: "#4ade80",
    barColor: "#4ade80",
  },
  idle: {
    label: "待机",
    dot: "#64748b",
    dotGlow: false,
    textColor: "#94a3b8",
    barColor: "#64748b",
  },
  disabled: {
    label: "已禁用",
    dot: "#475569",
    dotGlow: false,
    textColor: "#475569",
    barColor: "#475569",
  },
};

function getAgentStatus(agent: AgentWithStatus): "running" | "idle" | "disabled" {
  if (!agent.enabled) return "disabled";
  if (agent.runtimeStatus?.status === "running") return "running";
  return "idle";
}

function timeAgo(iso: string | null): string {
  if (!iso) return "从未";
  return dayjs(iso).fromNow();
}

export default function AgentStatusGrid({ agents }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const { isDark } = useTheme();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const filterLabels: { key: Filter; label: string }[] = [
    { key: "all", label: t("workbench.filter.all", "全部") },
    { key: "running", label: t("workbench.filter.running", "运行中") },
    { key: "idle", label: t("workbench.filter.idle", "待机") },
    { key: "disabled", label: t("workbench.filter.disabled", "已禁用") },
  ];

  const counts = {
    running: agents.filter((a) => getAgentStatus(a) === "running").length,
    idle: agents.filter((a) => getAgentStatus(a) === "idle").length,
    disabled: agents.filter((a) => getAgentStatus(a) === "disabled").length,
  };

  const filtered = agents.filter((a) =>
    filter === "all" ? true : getAgentStatus(a) === filter,
  );

  const cardBg = isDark ? "#111827" : "#f8fafc";
  const cardBorder = isDark ? "rgba(255,255,255,0.05)" : "#e2e8f0";

  return (
    <div
      style={{
        borderRadius: 12,
        padding: 20,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        border: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "#e2e8f0"}`,
        background: isDark ? "#1a2235" : "#ffffff",
        transition: "background 0.3s",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: isDark ? "#ffffff" : "#0f172a" }}>
            {t("workbench.agentStatus.title", "AI 员工状态")}
          </div>
          <div style={{ fontSize: 12, marginTop: 2, color: isDark ? "#475569" : "#94a3b8" }}>
            {t("workbench.agentStatus.sub", { count: agents.length, defaultValue: `共 ${agents.length} 名 · 实时监控` })}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            borderRadius: 10,
            padding: "2px",
            background: isDark ? "#111827" : "#f1f5f9",
          }}
        >
          {filterLabels.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: "4px 10px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 500,
                border: "none",
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.15s",
                background:
                  filter === f.key
                    ? isDark ? "rgba(6,182,212,0.2)" : "#ffffff"
                    : "transparent",
                color:
                  filter === f.key
                    ? isDark ? "#22d3ee" : "#0891b2"
                    : isDark ? "#64748b" : "#94a3b8",
              }}
            >
              {f.label}
              {f.key !== "all" && (
                <span style={{ marginLeft: 4, opacity: 0.6 }}>
                  {counts[f.key as keyof typeof counts]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          alignContent: "start",
          paddingRight: 2,
        }}
      >
        {filtered.map((agent) => {
          const st = getAgentStatus(agent);
          const sc = statusConfig[st];
          const runningTasks = agent.runtimeStatus?.running_task_count ?? 0;
          const lastActive = timeAgo(
            agent.runtimeStatus?.last_finish_at ?? agent.runtimeStatus?.last_run_at ?? null,
          );
          const teamIcon = resolveTeamIcon(loadAgentPresentation(agent.id).iconKey);

          return (
            <div
              key={agent.id}
              onClick={() => navigate("/agent-config")}
              style={{
                borderRadius: 12,
                padding: 12,
                display: "flex",
                flexDirection: "column",
                gap: 8,
                cursor: "pointer",
                border: `1px solid ${cardBorder}`,
                background: cardBg,
                transition: "all 0.2s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <img
                    src={teamIcon.src}
                    alt={teamIcon.label}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      objectFit: "cover",
                      display: "block",
                      border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "#e2e8f0"}`,
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      bottom: -2,
                      right: -2,
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: sc.dot,
                      border: `2px solid ${cardBg}`,
                      boxShadow: sc.dotGlow ? `0 0 6px ${sc.dot}` : "none",
                    }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      color: isDark ? "#cbd5e1" : "#334155",
                    }}
                  >
                    {agent.name}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      color: isDark ? "#475569" : "#94a3b8",
                    }}
                  >
                    {agent.description || agent.id}
                  </div>
                </div>
                <div style={{ fontSize: 10, fontWeight: 500, color: sc.textColor, flexShrink: 0 }}>
                  {sc.label}
                </div>
              </div>

              <div
                style={{
                  fontSize: 11,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  minHeight: 16,
                  color: isDark ? "#475569" : "#94a3b8",
                }}
              >
                {st === "running"
                  ? t("workbench.agent.tasksRunning", { count: runningTasks, defaultValue: `执行中 ${runningTasks} 个任务` })
                  : t("workbench.agent.idle", "暂无任务")}
              </div>

              {st === "running" && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    style={{
                      flex: 1,
                      height: 4,
                      borderRadius: 2,
                      overflow: "hidden",
                      background: isDark ? "rgba(255,255,255,0.06)" : "#e2e8f0",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.min(100, runningTasks * 20 + 40)}%`,
                        borderRadius: 2,
                        background: "linear-gradient(90deg, #06b6d4, #4ade80)",
                        transition: "width 0.5s",
                      }}
                    />
                  </div>
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  paddingTop: 4,
                  borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.04)" : "#f1f5f9"}`,
                }}
              >
                <span style={{ fontSize: 10, color: isDark ? "#475569" : "#94a3b8" }}>
                  {t("workbench.agent.lastActive", "最后活跃")}{" "}
                  <span style={{ color: isDark ? "#94a3b8" : "#475569" }}>{lastActive}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
