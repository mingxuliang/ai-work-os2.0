import { useEffect, useState } from "react";
import { Button, Drawer, Form, Input, Select } from "@agentscope-ai/design";
import { ThunderboltOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { api } from "../../../../api";
import type { PoolSkillSpec } from "../../../../api/types";
import { useAppMessage } from "../../../../hooks/useAppMessage";
import {
  getPoolBuiltinStatusLabel,
  getPoolBuiltinStatusTone,
  isSkillBuiltin,
} from "@/utils/skill";
import {
  MAX_TAGS,
  MAX_TAG_LENGTH,
  parseFrontmatter,
} from "../../../Agent/Skills/components";
import { MarkdownCopy } from "../../../../components/MarkdownCopy/MarkdownCopy";
import type { PoolMode } from "../useSkillPool";
import styles from "../index.module.less";

type FormInstance = ReturnType<typeof Form.useForm>[0];

interface PoolSkillDrawerProps {
  mode: PoolMode | null;
  activeSkill: PoolSkillSpec | null;
  form: FormInstance;
  drawerContent: string;
  showMarkdown: boolean;
  configText: string;
  availableTags?: string[];
  onClose: () => void;
  onSave: () => void;
  onContentChange: (content: string) => void;
  onShowMarkdownChange: (value: boolean) => void;
  onConfigTextChange: (text: string) => void;
  onChangeBuiltinLanguage?: (skill: PoolSkillSpec, language: string) => void;
  validateFrontmatter: (_: unknown, value: string) => Promise<void>;
}

export function PoolSkillDrawer({
  mode,
  activeSkill,
  form,
  drawerContent,
  showMarkdown,
  configText,
  availableTags = [],
  onClose,
  onSave,
  onContentChange,
  onShowMarkdownChange,
  onConfigTextChange,
  onChangeBuiltinLanguage,
  validateFrontmatter,
}: PoolSkillDrawerProps) {
  const { t, i18n } = useTranslation();
  const { message } = useAppMessage();
  const [aiBrief, setAiBrief] = useState("");
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (mode === "create") {
      setAiBrief("");
      setGenerating(false);
    }
  }, [mode]);

  const handleGenerate = async () => {
    const brief =
      aiBrief.trim() ||
      String(form.getFieldValue("name") || "").trim() ||
      drawerContent.trim();
    if (!brief) {
      message.warning(t("skills.generateBriefRequired"));
      return;
    }
    setGenerating(true);
    try {
      const preferredName = String(form.getFieldValue("name") || "").trim();
      const res = await api.generateSkillWithAI({
        brief,
        name: preferredName || undefined,
        language: i18n.language,
      });
      onContentChange(res.content);
      form.setFieldsValue({ content: res.content });
      const fm = parseFrontmatter(res.content);
      const nextName = (res.name || fm?.name || "").trim();
      if (nextName) {
        form.setFieldsValue({ name: nextName });
      }
      form.validateFields(["content"]).catch(() => {});
      message.success(t("skills.generateSuccess"));
    } catch (error: unknown) {
      message.error(
        error instanceof Error ? error.message : t("skills.generateFailed"),
      );
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Drawer
      rootClassName="copaw-ported-drawer"
      width={520}
      placement="right"
      title={
        mode === "edit"
          ? t("skillPool.editTitle", { name: activeSkill?.name || "" })
          : t("skillPool.createTitle")
      }
      open={mode === "create" || mode === "edit"}
      onClose={onClose}
      destroyOnClose
      footer={
        <div
          style={{
            display: "flex",
            justifyContent: mode === "create" ? "space-between" : "flex-end",
            width: "100%",
            gap: 8,
          }}
        >
          {mode === "create" ? (
            <Button
              type="default"
              icon={<ThunderboltOutlined />}
              onClick={handleGenerate}
              loading={generating}
            >
              {t("skills.generateWithAI")}
            </Button>
          ) : (
            <span />
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={onClose} disabled={generating}>
              {t("common.cancel")}
            </Button>
            <Button type="primary" onClick={onSave} disabled={generating}>
              {mode === "edit" ? t("common.save") : t("common.create")}
            </Button>
          </div>
        </div>
      }
    >
      {mode === "edit" && activeSkill && (
        <div className={styles.metaStack} style={{ marginBottom: 16 }}>
          <div className={styles.infoSection}>
            <div className={styles.infoLabel}>{t("skillPool.status")}</div>
            <div
              className={`${styles.infoBlock} ${
                styles[getPoolBuiltinStatusTone(activeSkill.sync_status)]
              }`}
            >
              {getPoolBuiltinStatusLabel(activeSkill.sync_status, t)}
            </div>
          </div>
          {isSkillBuiltin(activeSkill.source) &&
            (activeSkill.available_builtin_languages?.length ?? 0) > 1 &&
            onChangeBuiltinLanguage && (
              <div className={styles.infoSection}>
                <div className={styles.infoLabel}>
                  {t("skillPool.builtinLanguage")}
                </div>
                <div className={styles.languageToggle}>
                  {activeSkill.available_builtin_languages?.map((lang) => (
                    <Button
                      key={lang}
                      size="small"
                      type={
                        activeSkill.builtin_language === lang
                          ? "primary"
                          : "default"
                      }
                      onClick={() =>
                        void onChangeBuiltinLanguage(activeSkill, lang)
                      }
                    >
                      {lang === "zh" ? "中文" : "English"}
                    </Button>
                  ))}
                </div>
              </div>
            )}
        </div>
      )}
      <Form form={form} layout="vertical">
        <Form.Item
          name="name"
          label={t("skillPool.skillName")}
          rules={[{ required: true, message: t("skills.pleaseInputName") }]}
        >
          <Input placeholder={t("skillPool.skillNamePlaceholder")} />
        </Form.Item>

        {mode === "create" && (
          <Form.Item
            label={t("skills.generateBriefLabel")}
            tooltip={t("skills.generateBriefHint")}
          >
            <Input.TextArea
              rows={3}
              value={aiBrief}
              onChange={(e) => setAiBrief(e.target.value)}
              placeholder={t("skills.generateBriefPlaceholder")}
              disabled={generating}
            />
          </Form.Item>
        )}

        <Form.Item
          name="content"
          rules={[{ required: true, validator: validateFrontmatter }]}
        >
          <MarkdownCopy
            content={drawerContent}
            showMarkdown={showMarkdown}
            onShowMarkdownChange={onShowMarkdownChange}
            editable={true}
            onContentChange={onContentChange}
            textareaProps={{
              placeholder: t("skillPool.contentPlaceholder"),
              rows: 12,
            }}
          />
        </Form.Item>

        <Form.Item
          name="tags"
          label={t("skillPool.tags")}
          rules={[
            {
              validator: (_, value: string[] | undefined) => {
                const bad = (value || []).find(
                  (v) => v.length > MAX_TAG_LENGTH,
                );
                if (bad)
                  return Promise.reject(
                    t("skillPool.tagTooLong", { max: MAX_TAG_LENGTH }),
                  );
                return Promise.resolve();
              },
            },
          ]}
        >
          <Select
            mode="tags"
            options={availableTags.map((tag) => ({
              label: tag,
              value: tag,
            }))}
            placeholder={t("skillPool.tagsPlaceholder")}
            maxCount={MAX_TAGS}
          />
        </Form.Item>

        <Form.Item label={t("skills.config")}>
          <Input.TextArea
            rows={4}
            value={configText}
            onChange={(e) => {
              onConfigTextChange(e.target.value);
            }}
            placeholder={t("skills.configPlaceholder")}
          />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
