import { useMemo, useState, useRef, useCallback } from "react";
import { Alert, Button, Form } from "antd";
import { useAppMessage } from "../../../hooks/useAppMessage";
import { PlusOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useIsAdmin } from "../../../hooks/useCurrentUserRoles";
import { agentsApi } from "../../../api/modules/agents";
import { invalidateSkillCache, skillApi } from "../../../api/modules/skill";
import type {
  AgentProfileConfig,
  AgentSummary,
  CreateAgentRequest,
} from "../../../api/types/agents";
import { useAgentStore } from "../../../stores/agentStore";
import { useAgents } from "./useAgents";
import { AgentCardGrid, AgentModal, AgentDetailModal } from "./components";
import { PageHeader } from "@/components/PageHeader";
import { CopawWorkbenchShell } from "@/components/CopawWorkbenchShell";
import { reorderAgents } from "./reorder";
import {
  loadAgentPresentation,
  removeAgentPresentation,
  saveAgentPresentation,
} from "@/utils/agentPresentationStorage";
import {
  appendAgentEditHistory,
  removeAgentEditHistory,
} from "@/utils/agentEditHistoryStorage";
import { DEFAULT_TEAM_ICON_KEY } from "./components/agentTeamIcons";
import {
  ALL_CATEGORY_KEY,
  CATEGORY_OPTIONS,
  DEFAULT_CATEGORY_KEY,
} from "./components/agentCategories";
import { workspaceApi } from "../../../api/modules/workspace";
import {
  buildProfileMarkdown,
  buildSoulMarkdown,
  extractProfileBody,
  extractSoulBody,
} from "@/utils/agentPersona";
import styles from "./index.module.less";

export default function AgentsPage() {
  const { t, i18n } = useTranslation();
  const isAdmin = useIsAdmin();
  const {
    agents,
    loading,
    error: agentsLoadError,
    deleteAgent,
    toggleAgent,
    loadAgents,
    setAgents,
  } = useAgents();
  const { selectedAgent, setSelectedAgent } = useAgentStore();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentSummary | null>(null);
  const [detailAgent, setDetailAgent] = useState<AgentSummary | null>(null);
  const [summonTick, setSummonTick] = useState(0);
  const [reordering, setReordering] = useState(false);
  const [form] = Form.useForm();
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const installedSkillsRef = useRef<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>(ALL_CATEGORY_KEY);
  const { message } = useAppMessage();

  // Agents created via "我的AI团队" belong to that page only, never shown here.
  const visibleAgents = useMemo(
    () => agents.filter((a) => loadAgentPresentation(a.id).origin !== "myTeam"),
    [agents],
  );

  const filteredAgents = useMemo(() => {
    if (activeCategory === ALL_CATEGORY_KEY) return visibleAgents;
    return visibleAgents.filter(
      (agent) => loadAgentPresentation(agent.id).category === activeCategory,
    );
  }, [visibleAgents, activeCategory]);

  const handleCreate = () => {
    setEditingAgent(null);
    form.resetFields();
    form.setFieldsValue({
      workspace_dir: "",
      active_model_provider: undefined,
      active_model_model: undefined,
      team_icon: DEFAULT_TEAM_ICON_KEY,
      team_tags: [],
      team_category: DEFAULT_CATEGORY_KEY,
      soul: "",
      profile: "",
    });
    setSelectedSkills([]);
    installedSkillsRef.current = [];
    setModalVisible(true);
  };

  const handleEdit = async (agent: AgentSummary) => {
    try {
      setSelectedSkills([]);
      installedSkillsRef.current = [];
      invalidateSkillCache({ agentId: agent.id });
      const config = await agentsApi.getAgent(agent.id);
      const preset = loadAgentPresentation(agent.id);
      let soul = "";
      let profile = "";
      try {
        const soulFile = await workspaceApi.loadFile("SOUL.md", agent.id);
        soul = extractSoulBody(soulFile.content ?? "");
      } catch {
        /* optional */
      }
      try {
        const profileFile = await workspaceApi.loadFile("PROFILE.md", agent.id);
        profile = extractProfileBody(profileFile.content ?? "");
      } catch {
        /* optional */
      }
      setEditingAgent(agent);
      form.setFieldsValue({
        ...config,
        active_model_provider: config.active_model?.provider_id || undefined,
        active_model_model: config.active_model?.model || undefined,
        team_icon: preset.iconKey,
        team_tags: preset.tags,
        team_category: preset.category,
        soul,
        profile,
      });
      setModalVisible(true);
    } catch (error) {
      console.error("Failed to load agent config:", error);
      message.error(t("agent.loadConfigFailed"));
    }
  };

  const handleDelete = async (agentId: string) => {
    try {
      await deleteAgent(agentId);
      removeAgentPresentation(agentId);
      removeAgentEditHistory(agentId);

      if (selectedAgent === agentId) {
        setSelectedAgent("default");
        message.info(t("agent.switchedToDefault"));
      }
    } catch {
      message.error(t("agent.deleteFailed"));
    }
  };

  const handleToggle = async (agentId: string, currentEnabled: boolean) => {
    const newEnabled = !currentEnabled;
    try {
      await toggleAgent(agentId, newEnabled);

      if (!newEnabled && selectedAgent === agentId) {
        setSelectedAgent("default");
        message.info(t("agent.switchedToDefault"));
      }
    } catch {
      // Error already handled in hook
    }
  };

  const handleInstalledSkillsLoaded = useCallback((skills: string[]) => {
    installedSkillsRef.current = skills;
  }, []);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const workspaceRaw = values.workspace_dir;
      const workspace_dir =
        typeof workspaceRaw === "string"
          ? workspaceRaw.trim() || undefined
          : workspaceRaw;

      const providerId = values.active_model_provider;
      const modelId = values.active_model_model;
      const active_model =
        providerId && modelId
          ? { provider_id: providerId, model: modelId }
          : null;

      const {
        active_model_provider,
        active_model_model,
        team_icon,
        team_tags,
        team_category,
        soul,
        profile,
        ...rest
      } = values;
      const soulText = typeof soul === "string" ? soul.trim() : "";
      const profileText = typeof profile === "string" ? profile.trim() : "";
      let payload = {
        ...rest,
        workspace_dir,
        active_model,
      } as AgentProfileConfig;

      if (!editingAgent) {
        const rawId = payload.id;
        const idTrim =
          typeof rawId === "string" ? rawId.trim() : "";
        if (idTrim) {
          payload = { ...payload, id: idTrim };
        } else {
          const { id: _omitId, ...noIdPayload } = payload;
          payload = noIdPayload as AgentProfileConfig;
        }
      }

      if (editingAgent) {
        const previousInstalledSkills = installedSkillsRef.current;
        const newSkills = selectedSkills.filter(
          (skill) => !previousInstalledSkills.includes(skill),
        );

        for (const skill of newSkills) {
          await skillApi.downloadSkillPoolSkill({
            skill_name: skill,
            targets: [{ workspace_id: editingAgent.id }],
          });
        }
        await agentsApi.updateAgent(editingAgent.id, payload);
        const agentName =
          typeof payload.name === "string" ? payload.name : editingAgent.id;
        if (soulText) {
          await workspaceApi.saveFile(
            "SOUL.md",
            buildSoulMarkdown(soulText, agentName, i18n.language),
            editingAgent.id,
          );
        }
        if (profileText) {
          await workspaceApi.saveFile(
            "PROFILE.md",
            buildProfileMarkdown(profileText, agentName, i18n.language),
            editingAgent.id,
          );
        }
        saveAgentPresentation(editingAgent.id, {
          iconKey:
            typeof team_icon === "string" ? team_icon : DEFAULT_TEAM_ICON_KEY,
          tags: Array.isArray(team_tags) ? team_tags : [],
          category:
            typeof team_category === "string"
              ? team_category
              : DEFAULT_CATEGORY_KEY,
          origin: "team",
        });
        appendAgentEditHistory(editingAgent.id, {
          kind: "profile_updated",
          title: t("agentDetail.historyUpdated"),
          description: agentName,
        });
        if (newSkills.length > 0) {
          appendAgentEditHistory(editingAgent.id, {
            kind: "skills_added",
            title: t("agentDetail.historySkillsAdded"),
            description: newSkills.join(", "),
          });
        }
        installedSkillsRef.current = [
          ...previousInstalledSkills,
          ...newSkills.filter(
            (skill) => !previousInstalledSkills.includes(skill),
          ),
        ];
        invalidateSkillCache({ agentId: editingAgent.id });
        message.success(t("agent.updateSuccess"));
      } else {
        const body: CreateAgentRequest = {
          ...payload,
          language: i18n.language,
          skill_names: selectedSkills,
          ...(soulText ? { soul: soulText } : {}),
          ...(profileText ? { profile: profileText } : {}),
        };
        const result = await agentsApi.createAgent(body);
        saveAgentPresentation(result.id, {
          iconKey:
            typeof team_icon === "string" ? team_icon : DEFAULT_TEAM_ICON_KEY,
          tags: Array.isArray(team_tags) ? team_tags : [],
          category:
            typeof team_category === "string"
              ? team_category
              : DEFAULT_CATEGORY_KEY,
          origin: "team",
        });
        appendAgentEditHistory(result.id, {
          kind: "created",
          title: t("agentDetail.historyCreated"),
          description:
            typeof payload.name === "string" ? payload.name : result.id,
        });
        if (selectedSkills.length > 0) {
          appendAgentEditHistory(result.id, {
            kind: "skills_added",
            title: t("agentDetail.historySkillsAdded"),
            description: selectedSkills.join(", "),
          });
        }
        message.success(`${t("agent.createSuccess")} (ID: ${result.id})`);
      }

      setModalVisible(false);
      await loadAgents();
    } catch (error: any) {
      console.error("Failed to save agent:", error);
      if (editingAgent) {
        invalidateSkillCache({ agentId: editingAgent.id });
      }
      message.error(error.message || t("agent.saveFailed"));
    }
  };

  const handleReorder = async (activeId: string, overId: string) => {
    const nextAgents = reorderAgents(agents, activeId, overId);
    if (nextAgents === agents) {
      return;
    }

    const previousAgents = agents;
    setAgents(nextAgents);
    setReordering(true);

    try {
      await agentsApi.reorderAgents(nextAgents.map((agent) => agent.id));
      message.success(t("agent.reorderSuccess"));
    } catch (error) {
      console.error("Failed to reorder agents:", error);
      setAgents(previousAgents);
      message.error(t("agent.reorderFailed"));
    } finally {
      setReordering(false);
    }
  };

  return (
    <CopawWorkbenchShell>
      <div className={styles.agentsPage}>
        <PageHeader
          current={t("agent.agents")}
          className={styles.agentsHeader}
          subRow={
            <p className={styles.pageDescription}>{t("agent.pageDescription")}</p>
          }
          extra={
            isAdmin ? (
              <div className={styles.headerRight}>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={handleCreate}
                >
                  {t("agent.create")}
                </Button>
              </div>
            ) : undefined
          }
        />

        <div className={styles.categoryTabBar}>
          <button
            type="button"
            className={`${styles.categoryTab} ${
              activeCategory === ALL_CATEGORY_KEY ? styles.categoryTabActive : ""
            }`}
            onClick={() => setActiveCategory(ALL_CATEGORY_KEY)}
          >
            {t("agent.categoryAll")}
          </button>
          {CATEGORY_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className={`${styles.categoryTab} ${
                activeCategory === opt.key ? styles.categoryTabActive : ""
              }`}
              onClick={() => setActiveCategory(opt.key)}
            >
              {t(opt.labelKey)}
            </button>
          ))}
        </div>

        <div className={styles.agentGridSection}>
          {agentsLoadError ? (
            <Alert
              className={styles.listLoadAlert}
              type="error"
              showIcon
              message={t("agent.loadFailed")}
              description={
                <>
                  {agentsLoadError.message ? (
                    <p className={styles.listLoadDetail}>
                      {agentsLoadError.message}
                    </p>
                  ) : null}
                  <p className={styles.listLoadHint}>
                    {t("agent.loadListHint")}
                  </p>
                  <Button
                    size="small"
                    type="primary"
                    loading={loading}
                    onClick={() => void loadAgents()}
                  >
                    {t("agent.listRetry")}
                  </Button>
                </>
              }
            />
          ) : null}
          <AgentCardGrid
            key={summonTick}
            agents={filteredAgents}
            loading={loading}
            reordering={reordering}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onToggle={handleToggle}
            onReorder={handleReorder}
            onCardClick={setDetailAgent}
            variant="team"
            isAdmin={isAdmin}
          />
        </div>

        <AgentDetailModal
          open={!!detailAgent}
          agent={detailAgent}
          variant="team"
          isAdmin={isAdmin}
          onClose={() => setDetailAgent(null)}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onSummonChange={() => setSummonTick((n) => n + 1)}
        />

        <AgentModal
          open={modalVisible}
          editingAgent={editingAgent}
          form={form}
          selectedSkills={selectedSkills}
          onSelectedSkillsChange={setSelectedSkills}
          onInstalledSkillsLoaded={handleInstalledSkillsLoaded}
          onSave={handleSubmit}
          onCancel={() => setModalVisible(false)}
        />
      </div>
    </CopawWorkbenchShell>
  );
}
