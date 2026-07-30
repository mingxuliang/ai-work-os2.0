import { Dropdown, Select, Spin, Tag, Tooltip } from "antd";
import { CheckOutlined, RightOutlined, LoadingOutlined } from "@ant-design/icons";
import { Bot, CheckCircle, EyeOff, ChevronRight } from "lucide-react";
import { SparkDownLine, SparkUpLine } from "@agentscope-ai/icons";
import { useAgentStore } from "../../stores/agentStore";
import { agentsApi } from "../../api/modules/agents";
import { useTranslation } from "react-i18next";
import { getAgentDisplayName } from "../../utils/agentDisplayName";
import { useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppMessage } from "../../hooks/useAppMessage";
import { getSummonedAgentIds } from "../../utils/agentPresentationStorage";
import type { AgentSummary } from "../../api/types/agents";
import modelUi from "../../pages/Chat/ModelSelector/index.module.less";
import styles from "./index.module.less";

const EMPTY_AGENTS: AgentSummary[] = [];

function briefAgentDescription(text: string, maxChars = 64): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxChars) return collapsed;
  return `${collapsed.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

interface AgentSelectorProps {
  variant?: "sidebar" | "chatToolbar";
}

export default function AgentSelector({
  variant = "sidebar",
}: AgentSelectorProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { selectedAgent, agents, setSelectedAgent, setAgents } =
    useAgentStore();
  const { message } = useAppMessage();
  const [loading, setLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const loadAgents = useCallback(async () => {
    try {
      setLoading(true);
      const data = await agentsApi.listAgents();
      const sortedAgents = [...data.agents].sort((a, b) => {
        if (a.enabled === b.enabled) return 0;
        return a.enabled ? -1 : 1;
      });
      setAgents(sortedAgents);
    } catch (error) {
      console.error("Failed to load agents:", error);
      message.error(t("agent.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [message, setAgents, t]);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  /** Chat toolbar: only agents in「我的AI团队」(summoned). Sidebar: all agents. */
  const selectableAgents = useMemo(() => {
    if (!agents?.length) return EMPTY_AGENTS;
    if (variant !== "chatToolbar") return agents;
    const summonedIds = getSummonedAgentIds();
    return agents.filter((a) => summonedIds.has(a.id));
  }, [agents, variant]);

  const selectAgentById = useCallback(
    (agentId: string) => {
      const targetAgent = agents?.find((a) => a.id === agentId);

      if (targetAgent && !targetAgent.enabled) {
        message.warning(t("agent.cannotSwitchToDisabled"));
        return;
      }

      setSelectedAgent(agentId);
      message.success(t("agent.switchSuccess"));
      setDropdownOpen(false);
    },
    [agents, message, setSelectedAgent, t],
  );

  useEffect(() => {
    if (!agents?.length) return;

    if (variant === "chatToolbar") {
      if (!selectableAgents.length) return;
      const currentAgent = selectableAgents.find((a) => a.id === selectedAgent);
      if (!currentAgent) {
        const fallback =
          selectableAgents.find((a) => a.enabled) ?? selectableAgents[0];
        if (fallback) setSelectedAgent(fallback.id);
      } else if (!currentAgent.enabled) {
        const fallback = selectableAgents.find((a) => a.enabled);
        if (fallback) {
          setSelectedAgent(fallback.id);
          message.warning(t("agent.currentAgentDisabled"));
        }
      }
      return;
    }

    if (selectedAgent === "default") return;

    const currentAgent = agents.find((a) => a.id === selectedAgent);

    if (!currentAgent) {
      setSelectedAgent("default");
      message.warning(t("agent.currentAgentDeleted"));
    } else if (!currentAgent.enabled) {
      setSelectedAgent("default");
      message.warning(t("agent.currentAgentDisabled"));
    }
  }, [
    agents,
    selectableAgents,
    selectedAgent,
    setSelectedAgent,
    message,
    t,
    variant,
  ]);

  const agentCount = agents?.filter((a) => a.enabled).length ?? 0;

  const toolbarOpenChange = useCallback(
    (next: boolean) => {
      setDropdownOpen(next);
      if (next) void loadAgents();
    },
    [loadAgents],
  );

  /** Chat header: match ModelSelector — Dropdown + .panel rows (no bulky Select chrome). */
  if (variant === "chatToolbar") {
    const currentAgent =
      selectableAgents.find((a) => a.id === selectedAgent) ??
      agents?.find((a) => a.id === selectedAgent);
    const triggerLabel = currentAgent
      ? getAgentDisplayName(currentAgent, t)
      : t("agent.selectAgent");

    const panel = (
      <div className={modelUi.panel}>
        {loading ? (
          <div className={modelUi.spinWrapper}>
            <Spin size="small" />
          </div>
        ) : !selectableAgents.length ? (
          <div className={modelUi.emptyTip}>{t("myTeam.empty")}</div>
        ) : (
          selectableAgents.map((agent) => {
            const isActive = agent.id === selectedAgent;
            const rowClass = [
              modelUi.modelItem,
              isActive ? modelUi.modelItemActive : "",
              !agent.enabled ? styles.agentToolbarRowDisabled : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <div
                key={agent.id}
                role="button"
                tabIndex={0}
                className={rowClass}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!agent.enabled) {
                    message.warning(t("agent.cannotSwitchToDisabled"));
                    return;
                  }
                  selectAgentById(agent.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (!agent.enabled) {
                      message.warning(t("agent.cannotSwitchToDisabled"));
                      return;
                    }
                    selectAgentById(agent.id);
                  }
                }}
              >
                <span className={styles.agentToolbarRowIcon}>
                  <Bot size={14} strokeWidth={2} />
                </span>
                <span className={modelUi.modelName}>
                  {getAgentDisplayName(agent, t)}
                </span>
                {!agent.enabled ? (
                  <span className={styles.agentToolbarDisabledHint}>
                    {t("agent.disabled")}
                  </span>
                ) : isActive ? (
                  <CheckOutlined className={modelUi.checkIcon} />
                ) : null}
              </div>
            );
          })
        )}
        <div className={styles.agentToolbarFooter}>
          <button
            type="button"
            className={styles.agentToolbarManage}
            onClick={() => {
              setDropdownOpen(false);
              navigate("/my-team");
            }}
          >
            {t("nav.myTeam", "我的AI团队")}
            <RightOutlined />
          </button>
        </div>
      </div>
    );

    return (
      <Dropdown
        open={dropdownOpen}
        onOpenChange={toolbarOpenChange}
        dropdownRender={() => panel}
        trigger={["click"]}
        placement="bottomLeft"
      >
        <Tooltip title={t("agent.selectAgent")} mouseEnterDelay={0.5}>
          <div
            className={[modelUi.trigger, dropdownOpen ? modelUi.triggerActive : ""]
              .filter(Boolean)
              .join(" ")}
          >
            {loading && !agents?.length ? (
              <LoadingOutlined style={{ fontSize: 11, color: "#3b82f6" }} />
            ) : (
              <span className={styles.agentToolbarTriggerIcon}>
                <Bot size={16} strokeWidth={2} />
              </span>
            )}
            <span className={modelUi.triggerName}>{triggerLabel}</span>
            <SparkDownLine
              className={[
                modelUi.triggerArrow,
                dropdownOpen ? modelUi.triggerArrowOpen : "",
              ]
                .filter(Boolean)
                .join(" ")}
            />
          </div>
        </Tooltip>
      </Dropdown>
    );
  }

  // ─── Sidebar card (antd Select + rich rows) ───────────────────────────────
  return (
    <div className={styles.agentSelectorWrapper}>
      <div className={styles.agentSelectorLabel}>
        <span>
          {t("agent.currentWorkspace")}
          {agentCount > 0 && (
            <span className={styles.agentCountBadge}> ({agentCount})</span>
          )}
        </span>
      </div>
      <Select
        value={selectedAgent}
        onChange={(v) => selectAgentById(v)}
        loading={loading}
        className={styles.agentSelector}
        placeholder={t("agent.selectAgent")}
        optionLabelProp="label"
        popupMatchSelectWidth
        popupClassName={styles.agentSelectorDropdown}
        onDropdownVisibleChange={setDropdownOpen}
        suffixIcon={
          dropdownOpen ? <SparkUpLine size={20} /> : <SparkDownLine size={20} />
        }
        dropdownRender={(menu) => (
          <>
            <div className={styles.dropdownHeader}>
              <span className={styles.dropdownHeaderTitle}>
                {t("agent.currentWorkspace")}
              </span>
              <button
                type="button"
                className={styles.managementLink}
                onClick={() => navigate("/agents")}
              >
                {t("agent.management")}
                <ChevronRight size={12} strokeWidth={2.5} />
              </button>
            </div>
            {menu}
          </>
        )}
      >
        {agents?.map((agent) => (
          <Select.Option
            key={agent.id}
            value={agent.id}
            disabled={!agent.enabled}
            label={
              <div className={styles.selectedAgentLabel}>
                <Bot size={14} strokeWidth={2} />
                <span>{getAgentDisplayName(agent, t)}</span>
                {!agent.enabled && <EyeOff size={12} strokeWidth={2} />}
              </div>
            }
          >
            <div
              className={styles.agentOption}
              style={{ opacity: agent.enabled ? 1 : 0.5 }}
            >
              <div className={styles.agentOptionHeader}>
                <div className={styles.agentOptionIcon}>
                  <Bot size={16} strokeWidth={2} />
                </div>
                <div className={styles.agentOptionContent}>
                  <div className={styles.agentOptionName}>
                    <span className={styles.agentOptionNameText}>
                      {getAgentDisplayName(agent, t)}
                    </span>
                    {agent.id === selectedAgent && (
                      <CheckCircle
                        size={14}
                        strokeWidth={2}
                        className={styles.activeIndicator}
                      />
                    )}
                    {!agent.enabled && (
                      <Tag style={{ margin: 0 }}>{t("agent.disabled")}</Tag>
                    )}
                  </div>
                  {agent.description ? (
                    <div
                      className={styles.agentOptionDescription}
                      title={agent.description}
                    >
                      {briefAgentDescription(agent.description)}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </Select.Option>
        ))}
      </Select>
    </div>
  );
}
