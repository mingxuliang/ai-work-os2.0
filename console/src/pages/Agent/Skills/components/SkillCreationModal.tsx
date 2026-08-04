import { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { CloseOutlined, PlusOutlined, SendOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { api } from "../../../../api";
import type { PoolSkillSpec, SkillSpec } from "../../../../api";
import { toolsApi } from "../../../../api/modules/tools";
import { useAppMessage } from "../../../../hooks/useAppMessage";
import { isSkillBuiltin } from "@/utils/skill";
import s from "./SkillCreationModal.module.less";

export type SkillCreationTarget = "workspace" | "pool";

export interface SkillCreationResult {
  name: string;
  content: string;
  tags: string[];
  target: SkillCreationTarget;
}

/** Existing skill to edit in the creation modal. */
export interface SkillEditSource {
  name: string;
  description?: string;
  content: string;
  /** Original name for rename/save (defaults to `name`). */
  sourceName?: string;
  /** Skill source — builtin/system skills cannot be saved. */
  source?: string;
}

interface SkillCreationModalProps {
  open: boolean;
  target?: SkillCreationTarget;
  /** When set, modal opens in edit mode with this skill prefilled. */
  editingSkill?: SkillEditSource | null;
  onClose: () => void;
  onCreated?: (result: SkillCreationResult) => void;
  onSaved?: (result: SkillCreationResult) => void;
}

interface ChatMessage {
  id: string;
  role: "user" | "ai" | "system";
  content: string;
  timestamp: number;
  type?: "chat" | "edit-result";
}

interface RefSkillItem {
  name: string;
  description?: string;
  source?: string;
  content?: string;
}

function uid() {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function ensureFrontmatter(name: string, desc: string, md: string) {
  const t = md.trim();
  if (t.startsWith("---") && /^name\s*:/m.test(t)) return t;
  const safeDesc = (desc || `Use when working with ${name}`).replace(/"/g, '\\"');
  return `---\nname: ${name}\ndescription: "${safeDesc}"\n---\n\n${t || `# ${name}\n\n## 适用场景\n${desc || name}\n\n## 步骤\n1. 理解用户目标\n2. 执行核心任务\n3. 输出可核对结果\n`}`;
}

function parseFmName(content: string) {
  const m = content.match(/^name\s*:\s*(.+)$/m);
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
}

function parseFmDescription(content: string) {
  const m = content.match(/^description\s*:\s*(.+)$/m);
  if (!m) return "";
  return m[1].trim().replace(/^["']|["']$/g, "");
}

/** Pull dependency skill/tool names from generated SKILL.md sections. */
function parseDepsFromMd(content: string): { skills: string[]; tools: string[] } {
  const skills: string[] = [];
  const tools: string[] = [];
  const skillSec = content.match(
    /##\s*(?:依赖\s*Skills|Required Skills)\s*\n([\s\S]*?)(?=\n##\s|\n---|\s*$)/i,
  );
  const toolSec = content.match(
    /##\s*(?:推荐内置工具|Recommended Builtin Tools)\s*\n([\s\S]*?)(?=\n##\s|\n---|\s*$)/i,
  );
  const pull = (block: string | undefined, into: string[]) => {
    if (!block) return;
    for (const m of block.matchAll(/`([^`]+)`/g)) {
      const name = m[1].trim();
      if (name && !into.includes(name)) into.push(name);
    }
  };
  pull(skillSec?.[1], skills);
  pull(toolSec?.[1], tools);
  // Also catch common tool backticks anywhere in body
  for (const m of content.matchAll(
    /`(browser_use|web_search|web_fetch|write_file|read_file|browser_[a-z0-9_]+)`/gi,
  )) {
    const name = m[1];
    if (!tools.includes(name)) tools.push(name);
  }
  return { skills, tools };
}

function applyMdToForm(
  content: string,
  setName: (v: string) => void,
  setDescription: (v: string) => void,
  setSkillsMd: (v: string) => void,
) {
  setSkillsMd(content);
  const n = parseFmName(content);
  const d = parseFmDescription(content);
  if (n) setName(n);
  if (d) setDescription(d);
}

export function SkillCreationModal({
  open,
  target = "pool",
  editingSkill = null,
  onClose,
  onCreated,
  onSaved,
}: SkillCreationModalProps) {
  const { t } = useTranslation();
  const { message } = useAppMessage();
  const isEdit = !!editingSkill;
  const isBuiltinReadonly =
    isEdit && isSkillBuiltin(editingSkill?.source);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [skillsMd, setSkillsMd] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [sopSummary, setSopSummary] = useState("");
  const [sopSteps, setSopSteps] = useState<string[]>([]);
  const [sopText, setSopText] = useState("");
  const [parsingSop, setParsingSop] = useState(false);
  const [refSkills, setRefSkills] = useState<RefSkillItem[]>([]);
  const [recommendedTools, setRecommendedTools] = useState<string[]>([]);
  const [systemSkills, setSystemSkills] = useState<RefSkillItem[]>([]);
  const [loadingSkills, setLoadingSkills] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [skillQuery, setSkillQuery] = useState("");
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [syncingMd, setSyncingMd] = useState(false);
  const [streamLog, setStreamLog] = useState("");
  const [generated, setGenerated] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isAiTyping, setIsAiTyping] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const tags = useMemo(() => [], []);
  const refNameSet = useMemo(() => new Set(refSkills.map((x) => x.name)), [refSkills]);
  const filteredSystemSkills = useMemo(() => {
    const q = skillQuery.trim().toLowerCase();
    if (!q) return systemSkills;
    return systemSkills.filter(
      (sk) =>
        sk.name.toLowerCase().includes(q) ||
        (sk.description || "").toLowerCase().includes(q),
    );
  }, [skillQuery, systemSkills]);

  useEffect(() => {
    if (!open) return;
    setUploadedFile(null);
    setSopSummary("");
    setSopSteps([]);
    setSopText("");
    setRefSkills([]);
    setRecommendedTools([]);
    setPickerOpen(false);
    setSkillQuery("");
    setGenerating(false);
    setPublishing(false);
    setSyncingMd(false);
    setStreamLog("");
    setChatInput("");
    setIsAiTyping(false);
    abortRef.current?.abort();
    abortRef.current = null;

    if (editingSkill) {
      const content = editingSkill.content || "";
      const skillName = editingSkill.name || parseFmName(content) || "";
      const skillDesc =
        editingSkill.description || parseFmDescription(content) || "";
      setName(skillName);
      setDescription(skillDesc);
      setSkillsMd(content);
      setGenerated(true);
      const deps = parseDepsFromMd(content);
      setRecommendedTools(deps.tools);
      setChatMessages([
        {
          id: uid(),
          role: "system",
          timestamp: Date.now(),
          type: "chat",
          content: `正在编辑 Skill「${skillName}」。可在右侧对话优化，修改会同步到左侧 skills-md；确认后点击「保存」。`,
        },
      ]);
    } else {
      setName("");
      setDescription("");
      setSkillsMd("");
      setGenerated(false);
      setChatMessages([]);
    }
  }, [open, editingSkill?.name, editingSkill?.content, editingSkill?.description]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isAiTyping]);

  // Resolve Skills 引用 chips after catalog loads (edit mode).
  useEffect(() => {
    if (!open || !isEdit || !skillsMd.trim() || !systemSkills.length) return;
    const deps = parseDepsFromMd(skillsMd);
    if (!deps.skills.length) return;
    setRefSkills((prev) => {
      if (prev.length > 0) return prev;
      const byLower = new Map(
        systemSkills.map((sk) => [sk.name.toLowerCase(), sk]),
      );
      const next: RefSkillItem[] = [];
      for (const raw of deps.skills) {
        const hit = byLower.get(raw.toLowerCase());
        next.push(
          hit || {
            name: raw,
            description: "已记录依赖",
            source: "recommended",
          },
        );
      }
      return next;
    });
  }, [open, isEdit, systemSkills, skillsMd]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingSkills(true);
    Promise.all([
      api.listSkillPoolSkills().catch(() => [] as PoolSkillSpec[]),
      api.listSkills().catch(() => [] as SkillSpec[]),
    ])
      .then(([pool, workspace]) => {
        if (cancelled) return;
        const map = new Map<string, RefSkillItem>();
        for (const sk of pool) {
          map.set(sk.name, {
            name: sk.name,
            description: sk.description,
            source: sk.source || "pool",
            content: sk.content,
          });
        }
        for (const sk of workspace) {
          if (!map.has(sk.name)) {
            map.set(sk.name, {
              name: sk.name,
              description: sk.description,
              source: sk.source || "workspace",
              content: sk.content,
            });
          }
        }
        setSystemSkills(
          Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name)),
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingSkills(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [pickerOpen]);

  if (!open) return null;

  const toggleRefSkill = (item: RefSkillItem) => {
    setRefSkills((prev) => {
      if (prev.some((x) => x.name === item.name)) {
        return prev.filter((x) => x.name !== item.name);
      }
      return [...prev, item];
    });
  };

  const removeRefSkill = (skillName: string) => {
    setRefSkills((prev) => prev.filter((x) => x.name !== skillName));
  };

  const buildRefContext = () => {
    if (refSkills.length === 0) return "";
    const blocks = refSkills.map((sk, idx) => {
      const preview = (sk.content || sk.description || "").trim().slice(0, 800);
      return [
        `### 引用技能 ${idx + 1}: ${sk.name}`,
        sk.description ? `描述: ${sk.description}` : "",
        preview ? `内容摘录:\n${preview}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    });
    return ["参考以下系统内已有 Skills，复用其结构、步骤与最佳实践：", ...blocks].join(
      "\n\n",
    );
  };

  const handleSopUpload = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      message.warning("SOP 文件不能超过 10MB");
      return;
    }
    setUploadedFile(file);
    setParsingSop(true);
    setSopSummary("");
    setSopSteps([]);
    setSopText("");
    try {
      const res = await api.parseSopDocument(file, "zh");
      setSopText(res.text || "");
      setSopSummary(res.summary || "");
      setSopSteps(res.process_steps || []);
      if (!description.trim() && res.summary) {
        setDescription(
          `基于 SOP《${file.name}》生成技能：${res.summary}\n流程要点：\n${(res.process_steps || [])
            .slice(0, 8)
            .map((step, i) => `${i + 1}. ${step}`)
            .join("\n")}`,
        );
      }
      message.success(`SOP 已解析，提炼 ${res.process_steps?.length || 0} 步流程`);
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "SOP 解析失败");
    } finally {
      setParsingSop(false);
    }
  };

  const handleAiGenerate = async () => {
    const brief = description.trim() || name.trim();
    if (!brief && !name.trim()) {
      message.warning("请先填写技能名称或需求描述");
      return;
    }
    if (uploadedFile && !sopText && parsingSop) {
      message.warning("SOP 正在解析，请稍候再生成");
      return;
    }
    setGenerating(true);
    setStreamLog("准备开始生成…");
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const tools = await toolsApi.listTools().catch(() => []);
      const sopBlock =
        sopText ||
        (sopSteps.length
          ? `摘要：${sopSummary}\n步骤：\n${sopSteps.map((x, i) => `${i + 1}. ${x}`).join("\n")}`
          : "");

      await api.streamGenerateSkillWithAI(
        {
          brief: [brief, buildRefContext()].filter(Boolean).join("\n\n"),
          name: name.trim() || undefined,
          sop_text: sopBlock || undefined,
          available_skills: systemSkills.map((sk) => ({
            name: sk.name,
            description: sk.description,
          })),
          available_tools: tools.map((t) => ({
            name: t.name,
            description: t.description,
            enabled: t.enabled,
          })),
        },
        {
          onStage: (_stage, msg) => {
            setStreamLog((prev) => (prev ? `${prev}\n${msg}` : msg));
          },
          onDone: (res) => {
            setStreamLog((prev) =>
              prev ? `${prev}\nSkill 生成完成！` : "Skill 生成完成！",
            );
            if (res.name) setName(res.name);
            if (res.description) setDescription(res.description);
            setSkillsMd(res.content);

            const fromMd = parseDepsFromMd(res.content);
            const recSkills = Array.from(
              new Set([
                ...(res.recommended_skills || []),
                ...fromMd.skills,
              ]),
            );
            const recTools = Array.from(
              new Set([
                ...(res.recommended_tools || []),
                ...fromMd.tools,
              ]),
            );
            setRecommendedTools(recTools);

            if (recSkills.length) {
              const byLower = new Map(
                systemSkills.map((sk) => [sk.name.toLowerCase(), sk]),
              );
              setRefSkills((prev) => {
                const map = new Map(prev.map((x) => [x.name, x]));
                for (const raw of recSkills) {
                  const hit = byLower.get(raw.toLowerCase());
                  if (hit) {
                    map.set(hit.name, hit);
                  } else if (!map.has(raw)) {
                    map.set(raw, {
                      name: raw,
                      description: "AI 推荐依赖",
                      source: "recommended",
                    });
                  }
                }
                return Array.from(map.values());
              });
            }

            const skillName = res.name || name.trim() || "未命名 Skill";
            setGenerated(true);

            const depLine = [
              recSkills.length ? `• 依赖 Skills：${recSkills.join("、")}` : "",
              recTools.length ? `• 推荐工具：${recTools.join("、")}` : "",
              res.dependency_rationale
                ? `• 说明：${res.dependency_rationale}`
                : "",
            ]
              .filter(Boolean)
              .join("\n");

            setChatMessages([
              {
                id: uid(),
                role: "system",
                timestamp: Date.now(),
                type: "chat",
                content: `🎉 Skill「${skillName}」已自动生成完成！\n\n📋 基本信息\n• 名称：${skillName}\n${depLine}\n\n✏️ 可在右侧通过对话编辑优化，修改会同步到左侧 skills-md。确认无误后点击「发布」。`,
              },
            ]);
            message.success("技能已生成，请确认后发布");
          },
        },
        abortRef.current.signal,
      );
    } catch (err: unknown) {
      const aborted = err instanceof DOMException && err.name === "AbortError";
      if (!aborted) {
        message.error(err instanceof Error ? err.message : "AI 生成失败");
      }
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  };

  const handlePublish = async () => {
    if (isBuiltinReadonly) {
      message.warning(t("skills.builtinNotEditable"));
      return;
    }
    const skillName = name.trim() || parseFmName(skillsMd);
    if (!skillName) {
      message.warning("请输入技能名称");
      return;
    }
    const content = ensureFrontmatter(skillName, description.trim(), skillsMd);
    setPublishing(true);
    try {
      const result: SkillCreationResult = {
        name: skillName,
        content,
        tags,
        target,
      };

      if (isEdit && editingSkill) {
        const sourceName = editingSkill.sourceName || editingSkill.name;
        if (target === "workspace") {
          await api.saveSkill({
            name: skillName,
            content,
            source_name: sourceName,
            config: {},
          });
        } else {
          await api.saveSkillPoolSkill({
            name: skillName,
            content,
            source_name: sourceName,
            config: {},
          });
        }
        message.success("保存成功");
        onSaved?.(result);
        onCreated?.(result);
      } else if (target === "workspace") {
        const r = await api.createSkill(skillName, content, {}, true);
        message.success("创建成功");
        onCreated?.({
          name: (r as { name?: string })?.name || skillName,
          content,
          tags,
          target,
        });
      } else {
        await api.createSkillPoolSkill({ name: skillName, content, config: {} });
        message.success("创建成功");
        onCreated?.({ name: skillName, content, tags, target });
      }
      onClose();
    } catch (err: unknown) {
      message.error(
        err instanceof Error
          ? err.message
          : isEdit
            ? "保存失败"
            : "创建失败",
      );
    } finally {
      setPublishing(false);
    }
  };

  const runOptimizeToMd = async (instruction: string, showBubble = true) => {
    const base = skillsMd.trim()
      ? skillsMd
      : ensureFrontmatter(name.trim() || "untitled", description.trim(), "");
    const wrapped = [
      "请按用户修改意见更新完整 SKILL.md（保留 YAML frontmatter，输出完整文档）。",
      "",
      `用户修改意见：${instruction}`,
      "",
      "当前 SKILL.md：",
      base,
    ].join("\n");

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    let accumulated = "";
    setIsAiTyping(true);

    try {
      await api.streamOptimizeSkill(
        wrapped,
        (chunk) => {
          accumulated += chunk;
          setSkillsMd(accumulated);
        },
        abortRef.current.signal,
        "zh",
        (replaced) => {
          accumulated = replaced;
          applyMdToForm(replaced, setName, setDescription, setSkillsMd);
        },
      );
      const finalMd = accumulated.trim() || skillsMd;
      applyMdToForm(finalMd, setName, setDescription, setSkillsMd);
      if (showBubble) {
        setChatMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "ai",
            content: "✅ 已根据你的意见更新 skills-md，并同步名称/描述字段。",
            timestamp: Date.now(),
            type: "edit-result",
          },
        ]);
      }
      return true;
    } catch (err: unknown) {
      const aborted = err instanceof DOMException && err.name === "AbortError";
      if (!aborted) {
        message.error(err instanceof Error ? err.message : "优化失败");
        if (showBubble) {
          setChatMessages((prev) => [
            ...prev,
            {
              id: uid(),
              role: "ai",
              content: `❌ 更新失败：${err instanceof Error ? err.message : "未知错误"}`,
              timestamp: Date.now(),
              type: "edit-result",
            },
          ]);
        }
      }
      return false;
    } finally {
      setIsAiTyping(false);
      abortRef.current = null;
    }
  };

  const handleSyncDescriptionToMd = async () => {
    if (!description.trim()) {
      message.warning("请先填写需求描述");
      return;
    }
    setSyncingMd(true);
    await runOptimizeToMd(
      `根据新的需求描述更新适用场景与执行流程，保留其余结构。新需求：${description.trim()}`,
      true,
    );
    setSyncingMd(false);
    setGenerated(true);
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || isAiTyping || !generated) return;
    const input = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [
      ...prev,
      { id: uid(), role: "user", content: input, timestamp: Date.now(), type: "chat" },
    ]);
    await runOptimizeToMd(input, true);
  };

  const handleQuickAction = (action: string) => {
    const editMap: Record<string, string> = {
      name: "请把 Skill 名称改得更专业，并同步 frontmatter",
      desc: "请优化描述，突出核心竞争力和应用场景",
      instruction: "请补充更实用的执行步骤与质检要点",
    };
    if (editMap[action]) setChatInput(editMap[action]);
  };

  const modal = (
    <div
      className={s.overlay}
      onClick={generating || publishing || isAiTyping ? undefined : onClose}
    >
      <div className={`${s.dialog} ${s.root}`} onClick={(e) => e.stopPropagation()}>
        <div className={s.topBar}>
          <h3 className={s.title}>{isEdit ? "编辑 Skills" : "新建 Skills"}</h3>
          <div className={s.topActions}>
            <button
              type="button"
              className={s.publishBtn}
              disabled={
                isBuiltinReadonly ||
                (!name.trim() && !skillsMd.trim()) ||
                generating ||
                publishing ||
                isAiTyping
              }
              onClick={() => void handlePublish()}
            >
              <i className={isEdit ? "ri-save-line" : "ri-rocket-line"} />
              {publishing
                ? isEdit
                  ? "保存中..."
                  : "发布中..."
                : isEdit
                  ? "保存"
                  : "发布"}
            </button>
            <button
              type="button"
              className={s.closeBtn}
              disabled={generating || publishing}
              onClick={onClose}
              aria-label="关闭"
              title="关闭"
            >
              <span className={s.closeIcon} aria-hidden>
                ×
              </span>
            </button>
          </div>
        </div>

        <div className={s.body}>
          <div className={s.left}>
            <div className={s.field}>
              <label className={s.label}>名称</label>
              <input
                type="text"
                className={s.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="给你的 Skill 起个名字"
              />
            </div>

            <div className={s.field}>
              <div className={s.labelRow}>
                <label className={s.label} style={{ marginBottom: 0 }}>
                  需求描述
                </label>
                <button
                  type="button"
                  className={s.linkBtn}
                  disabled={syncingMd || isAiTyping || !description.trim()}
                  onClick={() => void handleSyncDescriptionToMd()}
                >
                  {syncingMd ? "同步中..." : "同步到 skills-md"}
                </button>
              </div>
              <textarea
                className={s.textarea}
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="在这里写你的需求描述，输入 {{ 插入变量、输入 / 插入提示内容块"
              />
            </div>

            <div className={s.field}>
              <div className={s.labelRow}>
                <label className={s.label} style={{ marginBottom: 0 }}>
                  skills-md
                </label>
              </div>
              <textarea
                className={`${s.textarea} ${s.monoTextarea}`}
                rows={10}
                value={skillsMd}
                onChange={(e) => setSkillsMd(e.target.value)}
                placeholder="完整的 skills.md 内容将在此显示..."
              />
              <div className={s.charCount}>{skillsMd.length} 字符</div>
            </div>

            <div className={s.panel}>
              <div className={s.panelHead}>
                <div className={s.panelTitleWrap}>
                  <span className={s.panelTitle}>SOP 文档</span>
                </div>
                <button
                  type="button"
                  className={s.linkBtn}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <PlusOutlined />
                  上传
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.txt,.md,.json,.yaml,.yml"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleSopUpload(f);
                }}
              />
              <p className={s.panelHint}>上传 SOP 文档，自动提炼流程后生成 Skill</p>
              {uploadedFile && (
                <div className={s.fileChip}>
                  <i className="ri-file-text-line" />
                  <span>{uploadedFile.name}</span>
                  <span className={s.fileChipSize}>
                    {parsingSop
                      ? "解析中..."
                      : `${(uploadedFile.size / 1024).toFixed(1)} KB`}
                  </span>
                  <button
                    type="button"
                    className={s.miniCloseBtn}
                    aria-label="移除文件"
                    onClick={() => {
                      setUploadedFile(null);
                      setSopSummary("");
                      setSopSteps([]);
                      setSopText("");
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                  >
                    <CloseOutlined />
                  </button>
                </div>
              )}
              {sopSteps.length > 0 && (
                <div className={s.sopOutline}>
                  <div className={s.sopOutlineTitle}>
                    已提炼 {sopSteps.length} 步
                    {sopSummary ? ` · ${sopSummary}` : ""}
                  </div>
                  <ol className={s.sopOutlineList}>
                    {sopSteps.slice(0, 8).map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </div>
              )}
            </div>

            <div className={s.panel} ref={pickerRef}>
              <div className={s.panelHead}>
                <div className={s.panelTitleWrap}>
                  <span className={s.panelTitle}>Skills 引用</span>
                  {refSkills.length > 0 && (
                    <span className={s.refCount}>{refSkills.length}</span>
                  )}
                </div>
                <button
                  type="button"
                  className={s.linkBtn}
                  onClick={() => setPickerOpen((v) => !v)}
                >
                  <PlusOutlined />
                  添加
                </button>
              </div>
              <p className={s.panelHint}>
                引用系统内已有 Skills；AI 生成时会自动推荐并勾选依赖
              </p>
              {recommendedTools.length > 0 && (
                <div className={s.toolChips}>
                  {recommendedTools.map((t) => (
                    <span key={t} className={s.toolChip}>
                      <i className="ri-tools-line" />
                      {t}
                    </span>
                  ))}
                </div>
              )}
              {refSkills.map((sk) => (
                <div key={sk.name} className={s.kbChip}>
                  <i
                    className="ri-sparkling-2-line"
                    style={{ color: "var(--blue-600)", fontSize: 14 }}
                  />
                  <span title={sk.description || sk.name}>{sk.name}</span>
                  <button
                    type="button"
                    className={s.miniCloseBtn}
                    aria-label={`移除 ${sk.name}`}
                    onClick={() => removeRefSkill(sk.name)}
                  >
                    <CloseOutlined />
                  </button>
                </div>
              ))}
              {pickerOpen && (
                <div className={s.skillPicker}>
                  <div className={s.skillPickerSearch}>
                    <i className="ri-search-line" />
                    <input
                      type="text"
                      value={skillQuery}
                      onChange={(e) => setSkillQuery(e.target.value)}
                      placeholder="搜索系统 Skills..."
                      autoFocus
                    />
                  </div>
                  <div className={s.skillPickerList}>
                    {loadingSkills ? (
                      <div className={s.skillPickerEmpty}>加载中...</div>
                    ) : filteredSystemSkills.length === 0 ? (
                      <div className={s.skillPickerEmpty}>暂无可用 Skills</div>
                    ) : (
                      filteredSystemSkills.map((sk) => {
                        const checked = refNameSet.has(sk.name);
                        return (
                          <button
                            key={sk.name}
                            type="button"
                            className={`${s.skillPickerItem} ${checked ? s.skillPickerItemActive : ""}`}
                            onClick={() => toggleRefSkill(sk)}
                          >
                            <span
                              className={`${s.skillCheck} ${checked ? s.skillCheckOn : ""}`}
                            >
                              {checked && <i className="ri-check-line" />}
                            </span>
                            <span className={s.skillPickerMeta}>
                              <span className={s.skillPickerName}>{sk.name}</span>
                              {sk.description && (
                                <span className={s.skillPickerDesc}>
                                  {sk.description}
                                </span>
                              )}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              className={s.generateBtn}
              disabled={
                generating ||
                parsingSop ||
                (!name.trim() && !description.trim() && !sopText)
              }
              onClick={() => void handleAiGenerate()}
            >
              <i
                className={
                  generating
                    ? `ri-loader-4-line ${s.spinIcon}`
                    : "ri-sparkling-line"
                }
              />
              {generating ? "生成中..." : "AI 全量生成"}
            </button>

            {generating && streamLog && (
              <div className={s.streamLog}>
                {streamLog
                  .split("\n")
                  .filter(Boolean)
                  .map((line, idx) => (
                    <div
                      key={idx}
                      className={`${s.streamLine} ${line.includes("完成") ? s.streamLineDone : ""}`}
                    >
                      <i
                        className={
                          line.includes("完成")
                            ? "ri-checkbox-circle-fill"
                            : "ri-loader-4-line"
                        }
                      />
                      <span>{line}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <div className={s.right}>
            <div className={s.rightHead}>
              <span className={s.rightTitle}>编辑优化</span>
            </div>

            {generated && (
              <div className={s.statsBar}>
                <div className={s.statsGrid2}>
                  <div className={s.statCard}>
                    <div className={s.statLabel}>字符数</div>
                    <div className={s.statValue}>{skillsMd.length}</div>
                  </div>
                  <div className={s.statCard}>
                    <div className={s.statLabel}>依赖</div>
                    <div className={s.statValue}>
                      {refSkills.length + recommendedTools.length}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className={s.chatArea}>
              {!generated ? (
                <div className={s.emptyState}>
                  <div className={s.emptyIcon}>
                    <i className="ri-edit-circle-line" />
                  </div>
                  <p className={s.emptyTitle}>编辑优化</p>
                  <p className={s.emptyHint}>
                    填写信息并点击「AI 全量生成」后，可通过对话修改 Skill，并同步更新左侧
                    skills-md。
                  </p>
                </div>
              ) : (
                chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`${s.msgRow} ${msg.role === "user" ? s.msgRowUser : s.msgRowAi}`}
                  >
                    <div
                      className={`${s.msgInner} ${msg.role === "user" ? s.msgInnerUser : ""}`}
                    >
                      <div
                        className={`${s.msgAvatar} ${msg.role !== "user" ? s.msgAvatarAi : s.msgAvatarUser}`}
                      >
                        <i
                          className={
                            msg.role === "user" ? "ri-user-line" : "ri-robot-line"
                          }
                        />
                      </div>
                      <div
                        className={`${s.bubble} ${msg.role === "user" ? s.bubbleUser : msg.role === "system" ? s.bubbleSystem : s.bubbleAi}`}
                      >
                        {msg.type === "edit-result" && (
                          <div className={`${s.msgTag} ${s.msgTagAi}`}>
                            <i className="ri-edit-line" /> 编辑结果
                          </div>
                        )}
                        {msg.content.split("\n").map((line, i, arr) => (
                          <span key={i}>
                            {line}
                            {i < arr.length - 1 && <br />}
                          </span>
                        ))}
                        <span
                          className={`${s.msgTime} ${msg.role === "user" ? s.msgTimeUser : s.msgTimeAi}`}
                        >
                          {new Date(msg.timestamp).toLocaleTimeString("zh-CN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}

              {isAiTyping && (
                <div className={s.typing}>
                  <div className={`${s.msgAvatar} ${s.msgAvatarAi}`}>
                    <i className="ri-robot-line" />
                  </div>
                  <div className={s.typingBubble}>
                    <span className={s.dot} />
                    <span className={s.dot} />
                    <span className={s.dot} />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className={s.chatFooter}>
              {generated && (
                <>
                  <div className={s.quickRow}>
                    <button
                      type="button"
                      className={s.quickBtn}
                      onClick={() => handleQuickAction("name")}
                    >
                      名称
                    </button>
                    <button
                      type="button"
                      className={s.quickBtn}
                      onClick={() => handleQuickAction("desc")}
                    >
                      描述
                    </button>
                    <button
                      type="button"
                      className={s.quickBtn}
                      onClick={() => handleQuickAction("instruction")}
                    >
                      指令
                    </button>
                  </div>
                  <div className={s.inputWrap}>
                    <input
                      type="text"
                      className={s.chatInput}
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void handleSendMessage();
                        }
                      }}
                      placeholder="输入修改意见，同步更新 skills-md..."
                      disabled={isAiTyping}
                    />
                    <button
                      type="button"
                      className={s.sendBtn}
                      disabled={!chatInput.trim() || isAiTyping}
                      onClick={() => void handleSendMessage()}
                      aria-label="发送"
                      title="发送"
                    >
                      <SendOutlined className={s.sendIcon} />
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
}

export default SkillCreationModal;
