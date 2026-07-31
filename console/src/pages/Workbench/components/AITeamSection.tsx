import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../../contexts/ThemeContext";
import { loadAgentPresentation } from "../../../utils/agentPresentationStorage";
import { resolveTeamIcon } from "../../Settings/Agents/components/agentTeamIcons";
import type { AgentWithStatus } from "../useWorkbench";

interface Props {
  agents: AgentWithStatus[];
}

function getStatusDot(agent: AgentWithStatus): { color: string; glow: boolean } {
  if (!agent.enabled) return { color: "#475569", glow: false };
  if (agent.runtimeStatus?.status === "running") return { color: "#4ade80", glow: true };
  return { color: "#f59e0b", glow: false };
}

export default function AITeamSection({ agents }: Props) {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const { t } = useTranslation();

  const cardBg = isDark ? "#111827" : "#f8fafc";
  const cardBorder = isDark ? "rgba(255,255,255,0.06)" : "#e2e8f0";

  return (
    <div style={{ padding: "0 24px 24px", flexShrink: 0 }}>
      <div
        style={{
          borderRadius: 12,
          padding: 20,
          border: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "#e2e8f0"}`,
          background: isDark ? "#1a2235" : "#ffffff",
          transition: "background 0.3s",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: isDark ? "#ffffff" : "#0f172a" }}>
              {t("workbench.team.title", "我的 AI 团队")}
            </div>
            <div style={{ fontSize: 12, marginTop: 2, color: isDark ? "#475569" : "#94a3b8" }}>
              {t("workbench.team.sub", { count: agents.length, defaultValue: `当前配置 ${agents.length} 名 Agent` })}
            </div>
          </div>
          <button
            onClick={() => navigate("/my-team")}
            style={{
              fontSize: 12,
              color: "#22d3ee",
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
              whiteSpace: "nowrap",
            }}
          >
            {t("workbench.team.manage", "管理团队")}
            <i className="ri-arrow-right-line" style={{ fontSize: 12 }} />
          </button>
        </div>

        <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4 }}>
          {agents.map((agent) => {
            const presentation = loadAgentPresentation(agent.id);
            const teamIcon = resolveTeamIcon(presentation.iconKey);
            const dot = getStatusDot(agent);

            return (
              <div
                key={agent.id}
                onClick={() => navigate("/agent-config")}
                style={{
                  flexShrink: 0,
                  width: 200,
                  borderRadius: 12,
                  padding: 16,
                  cursor: "pointer",
                  border: `1px solid ${cardBorder}`,
                  background: cardBg,
                  transition: "all 0.2s",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div style={{ position: "relative", width: 48, height: 48, marginBottom: 12 }}>
                  <img
                    src={teamIcon.src}
                    alt={teamIcon.label}
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      objectFit: "cover",
                      display: "block",
                      border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "#e2e8f0"}`,
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      top: -2,
                      right: -2,
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: dot.color,
                      border: `2px solid ${cardBg}`,
                      boxShadow: dot.glow ? `0 0 6px ${dot.color}` : "none",
                    }}
                  />
                </div>

                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    marginBottom: 4,
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
                    fontSize: 11,
                    lineHeight: 1.6,
                    marginBottom: 12,
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    color: isDark ? "#475569" : "#94a3b8",
                    flex: 1,
                  }}
                >
                  {agent.description || agent.id}
                </div>

                {agent.active_model && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
                    <span
                      style={{
                        padding: "2px 6px",
                        fontSize: 10,
                        borderRadius: 4,
                        background: isDark ? "rgba(255,255,255,0.04)" : "#f1f5f9",
                        color: isDark ? "#64748b" : "#64748b",
                      }}
                    >
                      {String(agent.active_model.model ?? "")}
                    </span>
                  </div>
                )}

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/chat?agent=${encodeURIComponent(agent.id)}`);
                  }}
                  style={{
                    marginTop: "auto",
                    width: "100%",
                    padding: "6px 0",
                    borderRadius: 8,
                    border: "1px solid rgba(34,211,238,0.35)",
                    background: "rgba(34,211,238,0.10)",
                    color: "#0891b2",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 5,
                    transition: "all 0.18s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(34,211,238,0.20)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(34,211,238,0.10)";
                  }}
                >
                  <i className="ri-send-plane-line" style={{ fontSize: 12 }} />
                  {t("workbench.team.assignTask", "分配任务")}
                </button>
              </div>
            );
          })}

          {agents.length === 0 && (
            <div
              style={{
                padding: "20px 0",
                fontSize: 13,
                color: isDark ? "#475569" : "#94a3b8",
              }}
            >
              {t("workbench.team.empty", "暂无 Agent，前往管理页面创建")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
