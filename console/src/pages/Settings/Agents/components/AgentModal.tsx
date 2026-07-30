import { useEffect, useState, useMemo } from "react";
import {
  Modal,
  Form,
  Input,
  Button,
  Select,
  Space,
  Typography,
  Spin,
  Empty,
  Tag,
} from "antd";
import { CheckOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import type { AgentSummary } from "@/api/types/agents";
import type { ProviderInfo } from "@/api/types/provider";
import type { PoolSkillSpec } from "@/api/types/skill";
import { getAgentDisplayName } from "@/utils/agentDisplayName";
import { skillApi } from "@/api/modules/skill";
import { providerApi } from "@/api/modules/provider";
import { providerIcon } from "../../Models/components/providerIcon";
import { DEFAULT_TEAM_ICON_KEY, TEAM_ICON_OPTIONS, resolveTeamIcon } from "./agentTeamIcons";
import {
  CATEGORY_OPTIONS,
  DEFAULT_CATEGORY_KEY,
  categoryLabelKey,
} from "./agentCategories";
import parentStyles from "../index.module.less";
import modalStyles from "./AgentModal.module.less";

interface EligibleProvider {
  id: string;
  name: string;
  models: Array<{ id: string; name: string }>;
}

function TeamIconPicker({
  value,
  onChange,
}: {
  value?: string;
  onChange?: (v: string) => void;
}) {
  const current = value ?? DEFAULT_TEAM_ICON_KEY;
  return (
    <div className={modalStyles.teamIconGrid}>
      {TEAM_ICON_OPTIONS.map(({ key: k, src, label }) => (
        <button
          type="button"
          key={k}
          className={`${modalStyles.teamIconBtn} ${
            k === current ? modalStyles.teamIconBtnActive : ""
          }`}
          onClick={() => onChange?.(k)}
          aria-pressed={k === current}
          title={label}
        >
          <img src={src} alt={label} className={modalStyles.teamIconImg} />
        </button>
      ))}
    </div>
  );
}

function AgentTagsEditor({
  value,
  onChange,
}: {
  value?: string[];
  onChange?: (v: string[]) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const list = Array.isArray(value) ? value : [];
  const commit = () => {
    const tag = draft.trim();
    if (!tag) {
      setDraft("");
      return;
    }
    if (list.includes(tag)) {
      setDraft("");
      return;
    }
    onChange?.([...list, tag]);
    setDraft("");
  };
  return (
    <>
      <Space.Compact style={{ width: "100%" }}>
        <Input
          placeholder={t("agent.tagsPlaceholder")}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPressEnter={commit}
          allowClear
        />
        <Button type="primary" onClick={commit}>
          {t("agent.tagsAdd")}
        </Button>
      </Space.Compact>
      {list.length > 0 ? (
        <div className={modalStyles.tagChips}>
          {list.map((tag) => (
            <Tag
              key={tag}
              closable
              onClose={() => onChange?.(list.filter((x) => x !== tag))}
            >
              {tag}
            </Tag>
          ))}
        </div>
      ) : null}
    </>
  );
}

interface AgentModalProps {
  open: boolean;
  editingAgent: AgentSummary | null;
  form: ReturnType<typeof Form.useForm>[0];
  selectedSkills: string[];
  onSelectedSkillsChange: (skills: string[]) => void;
  onInstalledSkillsLoaded: (skills: string[]) => void;
  onSave: () => Promise<void>;
  onCancel: () => void;
  /** Hide business-category field (e.g. My AI Team create/edit). */
  hideCategory?: boolean;
}

type SkillVisibility = "all" | "builtin";

export function AgentModal({
  open,
  editingAgent,
  form,
  selectedSkills,
  onSelectedSkillsChange,
  onInstalledSkillsLoaded,
  onSave,
  onCancel,
  hideCategory = false,
}: AgentModalProps) {
  const { t } = useTranslation();
  const [poolSkills, setPoolSkills] = useState<PoolSkillSpec[]>([]);
  const [installedSkills, setInstalledSkills] = useState<string[]>([]);
  const [loadingSkills, setLoadingSkills] = useState(false);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [skillVisibility, setSkillVisibility] = useState<SkillVisibility>("all");

  const selectedProviderId = Form.useWatch("active_model_provider", form);
  const selectedModelId = Form.useWatch("active_model_model", form);
  const watchedName = Form.useWatch("name", form);
  const watchedDescription = Form.useWatch("description", form);
  const watchedId = Form.useWatch("id", form);
  const teamIconKeyWatch = Form.useWatch("team_icon", form);
  const teamTagsWatch = Form.useWatch("team_tags", form);
  const teamCategoryWatch = Form.useWatch("team_category", form);

  const previewTeamIconEntry = resolveTeamIcon(
    typeof teamIconKeyWatch === "string"
      ? teamIconKeyWatch
      : DEFAULT_TEAM_ICON_KEY,
  );
  const previewTagsArr = Array.isArray(teamTagsWatch) ? teamTagsWatch : [];
  const previewCategoryKey =
    typeof teamCategoryWatch === "string"
      ? teamCategoryWatch
      : DEFAULT_CATEGORY_KEY;
  const previewCategoryLabel = t(categoryLabelKey(previewCategoryKey));

  const eligibleProviders: EligibleProvider[] = useMemo(() => {
    return providers
      .filter((p) => {
        const hasModels =
          (p.models?.length ?? 0) + (p.extra_models?.length ?? 0) > 0;
        if (!hasModels) return false;
        if (p.require_api_key === false) return !!p.base_url;
        if (p.is_custom) return !!p.base_url;
        if (p.require_api_key ?? true) return !!p.api_key;
        return true;
      })
      .map((p) => ({
        id: p.id,
        name: p.name,
        models: [...(p.models ?? []), ...(p.extra_models ?? [])],
      }));
  }, [providers]);

  const availableModels = useMemo(() => {
    if (!selectedProviderId) return [];
    const provider = eligibleProviders.find((p) => p.id === selectedProviderId);
    return provider?.models ?? [];
  }, [selectedProviderId, eligibleProviders]);

  const filteredPoolSkills = useMemo(() => {
    if (skillVisibility !== "builtin") return poolSkills;
    return poolSkills.filter((s) => s.source === "builtin");
  }, [poolSkills, skillVisibility]);

  const previewName =
    typeof watchedName === "string"
      ? watchedName.trim()
      : editingAgent
        ? getAgentDisplayName(editingAgent, t)
        : "";

  const previewDesc =
    typeof watchedDescription === "string"
      ? watchedDescription.trim().slice(0, 500)
      : "";

  const previewIdStr =
    (typeof watchedId === "string"
      ? watchedId.trim()
      : editingAgent?.id) || "";

  const providerLabel = eligibleProviders.find(
    (p) => p.id === selectedProviderId,
  )?.name;
  const modelLabel = availableModels.find(
    (m) => m.id === selectedModelId,
  )?.name;

  let modelPreviewLine =
    providerLabel || modelLabel
      ? `${providerLabel ?? selectedProviderId ?? ""}${modelLabel || selectedModelId ? ` / ${modelLabel ?? selectedModelId}` : ""}`.trim()
      : "";

  useEffect(() => {
    if (!open) {
      setSkillVisibility("all");
      return;
    }

    setLoadingProviders(true);
    providerApi
      .listProviders()
      .then((data) => {
        if (Array.isArray(data)) setProviders(data);
      })
      .catch((err) => console.error("Failed to load providers:", err))
      .finally(() => setLoadingProviders(false));

    setLoadingSkills(true);

    const fetchPool = skillApi.listSkillPoolSkills();
    const fetchInstalled = editingAgent
      ? skillApi.listSkills(editingAgent.id)
      : Promise.resolve([]);

    Promise.all([fetchPool, fetchInstalled])
      .then(([pool, workspaceSkills]) => {
        const poolSkillNames = new Set(pool.map((skill) => skill.name));
        const installed = workspaceSkills
          .filter((skill) => poolSkillNames.has(skill.name))
          .map((skill) => skill.name);

        setPoolSkills(pool);
        setInstalledSkills(installed);
        onInstalledSkillsLoaded(installed);
        if (editingAgent) {
          onSelectedSkillsChange(installed);
        } else {
          onSelectedSkillsChange([]);
        }
      })
      .finally(() => setLoadingSkills(false));
  }, [editingAgent, onInstalledSkillsLoaded, onSelectedSkillsChange, open]);

  const handleProviderChange = (providerId: string) => {
    form.setFieldsValue({
      active_model_provider: providerId,
      active_model_model: undefined,
    });
  };

  const handleClearModel = () => {
    form.setFieldsValue({
      active_model_provider: undefined,
      active_model_model: undefined,
    });
  };

  const toggleSkill = (name: string) => {
    const isInstalled = editingAgent && installedSkills.includes(name);
    if (isInstalled) return;

    if (selectedSkills.includes(name)) {
      onSelectedSkillsChange(selectedSkills.filter((s) => s !== name));
    } else {
      onSelectedSkillsChange([...selectedSkills, name]);
    }
  };

  const handleSelectAllVisible = () => {
    const names = filteredPoolSkills.map((s) => s.name);
    onSelectedSkillsChange(Array.from(new Set([...installedSkills, ...names])));
  };

  const handleSelectBuiltinVisible = () => {
    const names = filteredPoolSkills
      .filter((s) => s.source === "builtin")
      .map((s) => s.name);
    onSelectedSkillsChange(Array.from(new Set([...installedSkills, ...names])));
  };

  const handleSelectNone = () => {
    onSelectedSkillsChange(editingAgent ? [...installedSkills] : []);
  };

  if (!modelPreviewLine && !selectedProviderId && !selectedModelId) {
    modelPreviewLine = t("agent.modelPlaceholder");
  }

  return (
    <Modal
      title={
        editingAgent
          ? t("agent.editTitle", {
              name: getAgentDisplayName(editingAgent, t),
            })
          : t("agent.createTitle")
      }
      open={open}
      onOk={onSave}
      onCancel={onCancel}
      width={880}
      centered
      destroyOnHidden
      okText={
        editingAgent ? t("common.save") : t("agent.modalCreateSubmit")
      }
      cancelText={t("common.cancel")}
      className={`copaw-agent-modal-shell ${modalStyles.agentModal}`}
    >
      <div className={modalStyles.agentModalBody}>
        <div className={modalStyles.agentModalMain}>
          <Form form={form} layout="vertical" autoComplete="off">
            <Form.Item name="active_model_provider" hidden>
              <Input />
            </Form.Item>
            <Form.Item name="active_model_model" hidden>
              <Input />
            </Form.Item>

            <div className={modalStyles.agentModalSection}>
              <Typography.Text className={modalStyles.agentModalSectionLabel}>
                {t("agent.sectionBasic")}
              </Typography.Text>
              {editingAgent && (
                <Form.Item name="id" label={t("agent.id")}>
                  <Input disabled />
                </Form.Item>
              )}
              {!editingAgent && (
                <Form.Item
                  name="id"
                  label={t("agent.idLabel")}
                  extra={t("agent.idHelp")}
                  rules={[
                    {
                      validator: (_rule, value) => {
                        const raw =
                          typeof value === "string" ? value.trim() : "";
                        if (!raw) return Promise.resolve();
                        const ok =
                          /^[a-zA-Z0-9]$/.test(raw) ||
                          /^[a-zA-Z0-9][a-zA-Z0-9_-]*[a-zA-Z0-9]$/.test(
                            raw,
                          );
                        return ok
                          ? Promise.resolve()
                          : Promise.reject(new Error(t("agent.idPattern")));
                      },
                    },
                  ]}
                >
                  <Input placeholder={t("agent.idPlaceholder")} allowClear />
                </Form.Item>
              )}
              <Form.Item
                name="name"
                label={t("agent.name")}
                rules={[{ required: true, message: t("agent.nameRequired") }]}
              >
                <Input placeholder={t("agent.namePlaceholder")} />
              </Form.Item>
              <Form.Item
                name="description"
                label={t("agent.description")}
                rules={[{ max: 500, message: t("agent.descriptionTooLong") }]}
              >
                <Input.TextArea
                  placeholder={t("agent.descriptionPlaceholder")}
                  rows={3}
                  showCount={{ formatter: ({ count }) => `${count} / 500` }}
                  maxLength={500}
                />
              </Form.Item>
              <Form.Item
                name="team_icon"
                initialValue={DEFAULT_TEAM_ICON_KEY}
                label={t("agent.teamIcon")}
              >
                <TeamIconPicker />
              </Form.Item>
              {!hideCategory ? (
                <Form.Item
                  name="team_category"
                  initialValue={DEFAULT_CATEGORY_KEY}
                  label={t("agent.category")}
                  extra={t("agent.categoryHelp")}
                >
                  <Select
                    options={CATEGORY_OPTIONS.map((opt) => ({
                      value: opt.key,
                      label: t(opt.labelKey),
                    }))}
                  />
                </Form.Item>
              ) : (
                <Form.Item
                  name="team_category"
                  initialValue={DEFAULT_CATEGORY_KEY}
                  hidden
                >
                  <Input type="hidden" />
                </Form.Item>
              )}
            </div>

            <div className={modalStyles.agentModalSection}>
              <Typography.Text className={modalStyles.agentModalSectionLabel}>
                {t("agent.sectionModelWorkspace")}
              </Typography.Text>
              <Form.Item label={t("agent.model")} extra={t("agent.modelHelp")}>
                <Space.Compact style={{ width: "100%" }}>
                  <Select
                    value={selectedProviderId || undefined}
                    onChange={handleProviderChange}
                    placeholder={t("agent.modelPlaceholder")}
                    allowClear
                    onClear={handleClearModel}
                    loading={loadingProviders}
                    style={{ width: "45%" }}
                    showSearch
                    optionFilterProp="label"
                    options={eligibleProviders.map((p) => ({
                      value: p.id,
                      label: p.name,
                    }))}
                    optionRender={({ value }) => {
                      const p = eligibleProviders.find((ep) => ep.id === value);
                      if (!p) return value;
                      return (
                        <Space size={6}>
                          <img
                            src={providerIcon(p.id)}
                            alt=""
                            style={{ width: 16, height: 16 }}
                          />
                          <span>{p.name}</span>
                        </Space>
                      );
                    }}
                    notFoundContent={
                      loadingProviders ? (
                        <Spin size="small" />
                      ) : (
                        t("agent.noConfiguredModels")
                      )
                    }
                  />
                  <Select
                    value={selectedModelId || undefined}
                    onChange={(modelId) =>
                      form.setFieldsValue({ active_model_model: modelId })
                    }
                    placeholder={
                      selectedProviderId
                        ? t("models.model")
                        : t("agent.modelPlaceholder")
                    }
                    disabled={!selectedProviderId}
                    style={{ width: "55%" }}
                    showSearch
                    optionFilterProp="label"
                    options={availableModels.map((m) => ({
                      value: m.id,
                      label: m.name || m.id,
                    }))}
                  />
                </Space.Compact>
              </Form.Item>
              <Form.Item
                name="workspace_dir"
                label={t("agent.workspace")}
                extra={
                  editingAgent
                    ? t("agent.workspaceLockedHelp")
                    : t("agent.workspaceHelp")
                }
              >
                <Input
                  placeholder="~/.qwenpaw/workspaces/my-agent"
                  disabled={!!editingAgent}
                  allowClear={!editingAgent}
                />
              </Form.Item>
            </div>

            <div className={modalStyles.agentModalSection}>
              <Form.Item
                name="team_tags"
                initialValue={[]}
                label={t("agent.tags")}
                extra={t("agent.tagsHelp")}
              >
                <AgentTagsEditor />
              </Form.Item>
            </div>

            <div className={modalStyles.agentModalSection}>
              <Typography.Text strong style={{ fontSize: 13, display: "block", marginBottom: 10 }}>
                {editingAgent
                  ? t("agent.addSkillsToAgent")
                  : t("agent.initialSkills")}
              </Typography.Text>
              <div className={modalStyles.skillToolbar}>
                <Space size={6} wrap className={modalStyles.skillFilterBtns}>
                  <button
                    type="button"
                    className={`${modalStyles.skillFilterBtn} ${
                      skillVisibility === "all"
                        ? modalStyles.skillFilterBtnActive
                        : ""
                    }`}
                    onClick={() => setSkillVisibility("all")}
                  >
                    {t("agent.skillVisibleAll")}
                  </button>
                  <button
                    type="button"
                    className={`${modalStyles.skillFilterBtn} ${
                      skillVisibility === "builtin"
                        ? modalStyles.skillFilterBtnActive
                        : ""
                    }`}
                    onClick={() => setSkillVisibility("builtin")}
                  >
                    {t("agent.skillVisibleBuiltin")}
                  </button>
                </Space>
                <Space size={6} wrap>
                  <Button
                    size="small"
                    type="primary"
                    onClick={handleSelectAllVisible}
                  >
                    {t("agent.selectAll")}
                  </Button>
                  <Button
                    size="small"
                    type="default"
                    onClick={handleSelectBuiltinVisible}
                  >
                    {t("agent.selectBuiltin")}
                  </Button>
                  <Button size="small" type="default" onClick={handleSelectNone}>
                    {t("agent.selectNone")}
                  </Button>
                </Space>
              </div>

              <Typography.Paragraph type="secondary" style={{ marginBottom: 8, fontSize: 12 }}>
                {t("agent.initialSkillsHelp")}
              </Typography.Paragraph>

              {loadingSkills ? (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <Spin size="small" />
                </div>
              ) : filteredPoolSkills.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={t("agent.noPoolSkills")}
                />
              ) : (
                <div className={modalStyles.agentModalSkillGrid}>
                  {filteredPoolSkills.map((skill) => {
                    const selected = selectedSkills.includes(skill.name);
                    const isInstalled =
                      !!editingAgent && installedSkills.includes(skill.name);
                    return (
                      <div
                        key={skill.name}
                        role="button"
                        tabIndex={0}
                        className={`${parentStyles.pickerCard} ${
                          selected ? parentStyles.pickerCardSelected : ""
                        } ${isInstalled ? parentStyles.pickerCardDisabled : ""}`}
                        onClick={() => toggleSkill(skill.name)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleSkill(skill.name);
                          }
                        }}
                      >
                        {selected && (
                          <span className={parentStyles.pickerCheck}>
                            <CheckOutlined />
                          </span>
                        )}
                        <div className={parentStyles.pickerCardTitle}>
                          {skill.name}
                          {skill.source === "builtin" ? (
                            <span
                              style={{
                                fontSize: 10,
                                marginLeft: 6,
                                color: "#94a3b8",
                              }}
                            >
                              {t("skills.builtin")}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className={modalStyles.skillStatLine}>
                {t("agent.selectedSkillCount", {
                  count: selectedSkills.length,
                })}
              </div>
            </div>
          </Form>
        </div>

        <aside className={modalStyles.agentModalPreview}>
          <div className={modalStyles.previewGlow1} aria-hidden />
          <div className={modalStyles.previewGlow2} aria-hidden />
          <div className={modalStyles.previewInner}>
            <p className={modalStyles.previewEyebrow}>
              {t("agent.previewEyebrow")}
            </p>
            <div className={modalStyles.previewCard}>
              <span className={modalStyles.previewStatusDot} aria-hidden />
              <div className={modalStyles.previewIconCube}>
                <img
                  src={previewTeamIconEntry.src}
                  alt={previewTeamIconEntry.label}
                  className={modalStyles.previewIconImg}
                />
              </div>
              <div className={modalStyles.previewName}>
                {previewName || t("agent.previewPlaceholderName")}
              </div>
              {!hideCategory ? (
                <span className={modalStyles.previewCategoryBadge}>
                  {previewCategoryLabel}
                </span>
              ) : null}
              <p className={modalStyles.previewDesc}>
                {previewDesc || t("agent.previewPlaceholderDesc")}
              </p>
              <p className={modalStyles.previewTagsLine}>
                {previewTagsArr.length > 0
                  ? previewTagsArr.join(" · ")
                  : t("agent.previewNoTags")}
              </p>
              <div className={modalStyles.previewMetrics}>
                <span>
                  {t("agent.previewCardSkillsLabel")}{" "}
                  <strong>{selectedSkills.length}</strong>
                </span>
                <span className={modalStyles.previewDivider}>|</span>
                <span>
                  {t("agent.modelColumn")}{" "}
                  <strong style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                    {modelPreviewLine}
                  </strong>
                </span>
              </div>
            </div>
            <div className={modalStyles.previewTiles}>
              <div className={modalStyles.previewTile}>
                <span>{t("agent.previewTileTagCount")}</span>
                <span>{previewTagsArr.length}</span>
              </div>
              <div className={modalStyles.previewTile}>
                <span>{t("agent.previewTileInitialSkills")}</span>
                <span>{selectedSkills.length}</span>
              </div>
            </div>
            {previewIdStr ? (
              <div className={modalStyles.previewIdPanel}>
                <span className={modalStyles.previewIdLabel}>{t("agent.id")}</span>
                <div className={modalStyles.previewIdValue} title={previewIdStr}>
                  {previewIdStr}
                </div>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </Modal>
  );
}
