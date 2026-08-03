import { useMemo, useState, useRef, useCallback } from "react";
import { Alert, Button, Empty, Form } from "antd";
import { useAppMessage } from "@/hooks/useAppMessage";
import { PlusOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { agentsApi } from "@/api/modules/agents";
import { invalidateSkillCache, skillApi } from "@/api/modules/skill";
import type {
  AgentProfileConfig,
  AgentSummary,
  CreateAgentRequest,
} from "@/api/types/agents";
import { useAgentStore } from "@/stores/agentStore";
import { useAgents } from "../Settings/Agents/useAgents";
import { AgentCardGrid, AgentModal, AgentDetailModal } from "../Settings/Agents/components";
import { PageHeader } from "@/components/PageHeader";
import { CopawWorkbenchShell } from "@/components/CopawWorkbenchShell";
import { reorderAgents } from "../Settings/Agents/reorder";
import {
  loadAgentPresentation,
  removeAgentPresentation,
  saveAgentPresentation,
} from "@/utils/agentPresentationStorage";
import {
  appendAgentEditHistory,
  removeAgentEditHistory,
} from "@/utils/agentEditHistoryStorage";
import { DEFAULT_TEAM_ICON_KEY } from "../Settings/Agents/components/agentTeamIcons";
import { DEFAULT_CATEGORY_KEY } from "../Settings/Agents/components/agentCategories";
import { workspaceApi } from "@/api/modules/workspace";
import {
  buildProfileMarkdown,
  buildSoulMarkdown,
  extractProfileBody,
  extractSoulBody,
} from "@/utils/agentPersona";
import styles from "../Settings/Agents/index.module.less";

export default function MyTeamPage() {
  const { t, i18n } = useTranslation();
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
  const [reordering, setReordering] = useState(false);
  const [form] = Form.useForm();
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const installedSkillsRef = useRef<string[]>([]);
  const [teamTick, setTeamTick] = useState(0);
  const { message } = useAppMessage();

  // Only show summoned agents (no business-category filter on this page)
  const summonedAgents = useMemo(
    () => agents.filter((a) => loadAgentPresentation(a.id).summoned),
    [agents, teamTick],
  );

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

  /** 取消召唤：适用于非本人创建（他人/共享）的 agent，仅从本页移除，不删除真实 agent */
  const handleRemoveFromTeam = (agentId: string) => {
    saveAgentPresentation(agentId, { summoned: false });
    setTeamTick((n) => n + 1);
    message.success(t("myTeam.removeSuccess"));
  };

  /** 真实删除：仅适用于在「我的AI团队」中自己新建的 agent */
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
        active_model_provider: _p,
        active_model_model: _m,
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
        const idTrim = typeof rawId === "string" ? rawId.trim() : "";
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
          iconKey: typeof team_icon === "string" ? team_icon : DEFAULT_TEAM_ICON_KEY,
          tags: Array.isArray(team_tags) ? team_tags : [],
          category: typeof team_category === "string" ? team_category : DEFAULT_CATEGORY_KEY,
          origin: "myTeam",
          summoned: true,
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
          ...newSkills.filter((s) => !previousInstalledSkills.includes(s)),
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
          iconKey: typeof team_icon === "string" ? team_icon : DEFAULT_TEAM_ICON_KEY,
          tags: Array.isArray(team_tags) ? team_tags : [],
          category: typeof team_category === "string" ? team_category : DEFAULT_CATEGORY_KEY,
          origin: "myTeam",
          summoned: true,
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
      setTeamTick((n) => n + 1);
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
    if (nextAgents === agents) return;
    const previousAgents = agents;
    setAgents(nextAgents);
    setReordering(true);
    try {
      await agentsApi.reorderAgents(nextAgents.map((a) => a.id));
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
          current={t("myTeam.title")}
          className={styles.agentsHeader}
          subRow={
            <p className={styles.pageDescription}>{t("myTeam.description")}</p>
          }
          extra={
            <div className={styles.headerRight}>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleCreate}
              >
                {t("agent.create")}
              </Button>
            </div>
          }
        />

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

          {!agentsLoadError && !loading && summonedAgents.length === 0 ? (
            <div style={{ padding: "60px 0", textAlign: "center" }}>
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <span style={{ fontSize: 14, color: "rgba(15,23,42,0.5)" }}>
                    {t("myTeam.empty")}
                  </span>
                }
              />
            </div>
          ) : (
            <AgentCardGrid
              agents={summonedAgents}
              loading={loading}
              reordering={reordering}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onRemoveFromTeam={handleRemoveFromTeam}
              onToggle={handleToggle}
              onReorder={handleReorder}
              onCardClick={setDetailAgent}
              variant="myTeam"
            />
          )}
        </div>

        <AgentDetailModal
          open={!!detailAgent}
          agent={detailAgent}
          variant="myTeam"
          onClose={() => setDetailAgent(null)}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onRemoveFromTeam={handleRemoveFromTeam}
          onSummonChange={() => setTeamTick((n) => n + 1)}
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
          hideCategory
        />
      </div>
    </CopawWorkbenchShell>
  );
}
