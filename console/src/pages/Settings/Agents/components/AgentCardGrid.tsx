import type { CSSProperties, SyntheticEvent } from "react";
import { useState } from "react";
import { Button, Popconfirm, Space, Spin, Tag, Tooltip } from "antd";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  EditOutlined,
  DeleteOutlined,
  ThunderboltOutlined,
  SendOutlined,
} from "@ant-design/icons";
import { EyeOff, Eye, GripVertical } from "lucide-react";
import type { AgentSummary } from "@/api/types/agents";
import { getAgentDisplayName } from "@/utils/agentDisplayName";
import {
  loadAgentPresentation,
  toggleSummoned,
} from "@/utils/agentPresentationStorage";
import { resolveTeamIcon } from "./agentTeamIcons";
import { categoryLabelKey } from "./agentCategories";
import { cbcCardStripeClass } from "@/utils/cbcCardTheme";
import styles from "../index.module.less";

export type AgentCardVariant = "team" | "myTeam";

type SortableHandle = Pick<
  ReturnType<typeof useSortable>,
  "listeners" | "attributes"
>;

interface AgentCardGridProps {
  agents: AgentSummary[];
  loading: boolean;
  reordering: boolean;
  onEdit: (agent: AgentSummary) => void;
  onDelete: (agentId: string) => void;
  onToggle: (agentId: string, currentEnabled: boolean) => void;
  onReorder: (activeId: string, overId: string) => void;
  /** "team" = Agent 团队（默认）；"myTeam" = 我的AI团队 */
  variant?: AgentCardVariant;
  /**
   * "team" 变体下：是否具备管理权限（新建/编辑/禁用/删除）。管理员为 true，
   * 普通用户为 false（只能召唤使用）。"myTeam" 变体下此项被忽略——是否可管理
   * 由每张卡片自己是否为「我的AI团队」创建的 agent 决定。
   */
  isAdmin?: boolean;
  /** "myTeam" 变体下，取消召唤（非本人创建的 agent 使用）的回调 */
  onRemoveFromTeam?: (agentId: string) => void;
  /** 点击卡片主体打开详情 */
  onCardClick?: (agent: AgentSummary) => void;
}

interface SortableAgentCardProps {
  agent: AgentSummary;
  index: number;
  reordering: boolean;
  loading: boolean;
  onEdit: (agent: AgentSummary) => void;
  onDelete: (agentId: string) => void;
  onToggle: (agentId: string, currentEnabled: boolean) => void;
  onRemoveFromTeam?: (agentId: string) => void;
  onCardClick?: (agent: AgentSummary) => void;
  variant: AgentCardVariant;
  isAdmin: boolean;
}

function CardDragGrip({
  disabled,
  listeners,
  attributes,
  title,
}: { disabled: boolean; title: string } & SortableHandle) {
  return (
    <button
      type="button"
      className={styles.cardDragGrip}
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label={title}
      onClick={(e: SyntheticEvent) => e.stopPropagation()}
      {...(disabled ? {} : { ...listeners, ...attributes })}
    >
      <GripVertical size={18} strokeWidth={2} />
    </button>
  );
}

function SortableAgentCard({
  agent,
  index,
  reordering,
  loading,
  onEdit,
  onDelete,
  onToggle,
  onRemoveFromTeam,
  onCardClick,
  variant,
  isAdmin,
}: SortableAgentCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dragDisabled = reordering || loading || (variant === "team" && !isAdmin);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: agent.id });

  const sortableStyle: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.82 : undefined,
    zIndex: isDragging ? 20 : undefined,
    position: "relative",
  };

  const themeCls = cbcCardStripeClass(index);
  const name = getAgentDisplayName(agent, t);
  const defaultAgent = agent.id === "default";
  const presentation = loadAgentPresentation(agent.id);
  const teamIconPresentation = resolveTeamIcon(presentation.iconKey);
  const [summoned, setSummoned] = useState<boolean>(presentation.summoned);
  const isMyTeam = variant === "myTeam";
  const isOwnMyTeamAgent = isMyTeam && presentation.origin === "myTeam";
  // Full CRUD permission for this specific card: admins on the Agent Team
  // page, or the owner of a self-created My AI Team agent.
  const canManage = isMyTeam ? isOwnMyTeamAgent : isAdmin;

  function handleSummon(e: SyntheticEvent) {
    e.stopPropagation();
    const next = toggleSummoned(agent.id);
    setSummoned(next);
  }

  function handleAssignTask(e: SyntheticEvent) {
    e.stopPropagation();
    navigate(`/chat?agent=${encodeURIComponent(agent.id)}`);
  }

  return (
    <div ref={setNodeRef} style={sortableStyle} className={`cbc-card ${themeCls}`}>
      <div className="cbc-glow-layer" aria-hidden />
      {agent.enabled ? (
        <>
          <div className="cbc-enabled-ring" aria-hidden />
          <div className="cbc-spectrum" aria-hidden>
            <span />
          </div>
        </>
      ) : null}
      <div
        className="cbc-card-inner"
        role={onCardClick ? "button" : undefined}
        tabIndex={onCardClick ? 0 : undefined}
        onClick={() => onCardClick?.(agent)}
        onKeyDown={(e) => {
          if (!onCardClick) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onCardClick(agent);
          }
        }}
        style={onCardClick ? { cursor: "pointer" } : undefined}
      >
        <div className={styles.agentCardGripRow}>
          <CardDragGrip
            disabled={dragDisabled}
            listeners={listeners}
            attributes={attributes}
            title={t("agent.dragHandleTooltip")}
          />
        </div>

        <div className={styles.agentCardHero}>
          <div className={styles.agentCardAvatar}>
            <img
              src={teamIconPresentation.src}
              alt={teamIconPresentation.label}
              className={styles.agentCardAvatarImg}
            />
          </div>
          <div className={styles.agentCardTitles}>
            <div className={`card-title ${styles.agentCardName}`} title={name}>
              {name}
            </div>
            <div className={styles.agentCardIdLine} title={agent.id}>
              {agent.id}
            </div>
            <div className={styles.agentCardStatusLine}>
              <span
                className={`${styles.statusDot} ${
                  agent.enabled ? styles.statusDotOn : styles.statusDotOff
                }`}
                aria-hidden
              />
              <span className={styles.statusText}>
                {agent.enabled ? t("common.enabled") : t("agent.disabled")}
              </span>
              {!defaultAgent && !isMyTeam ? (
                <span className={styles.agentCategoryBadge}>
                  {t(categoryLabelKey(presentation.category))}
                </span>
              ) : null}
              {defaultAgent ? (
                <span className={`cbc-tag ${styles.agentCardTagSpacer}`}>
                  {t("agent.defaultDisplayName")}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {presentation.tags.length > 0 ? (
          <div className={styles.agentCardCustomTags}>
            <Space size={[4, 4]} wrap>
              {presentation.tags.map((tg) => (
                <Tag key={tg}>{tg}</Tag>
              ))}
            </Space>
          </div>
        ) : null}

        <div
          className={styles.agentCardDesc}
          title={agent.description?.trim() || undefined}
        >
          {agent.description?.trim() || ""}
        </div>

        <div className={styles.agentCardModelLine}>
          {t("agent.modelColumn")}:{" "}
          {agent.active_model ? (
            <Tooltip title={agent.active_model.model}>
              <span>{agent.active_model.model}</span>
            </Tooltip>
          ) : (
            <span style={{ opacity: 0.5 }}>{t("agent.modelPlaceholder")}</span>
          )}
        </div>

        <div
          className={`cbc-agent-card-actions ${styles.agentCardActionsCompact}`}
          onClick={(e: SyntheticEvent) => e.stopPropagation()}
          onKeyDown={(e: SyntheticEvent) => e.stopPropagation()}
        >
          <Space className={styles.agentCardActionSpace} size={4}>
            {isMyTeam && (
              <Button
                type="primary"
                size="small"
                icon={<SendOutlined />}
                onClick={handleAssignTask}
                disabled={!agent.enabled}
              >
                {t("myTeam.assignTask")}
              </Button>
            )}

            {!isMyTeam && !defaultAgent && (
              <Tooltip
                title={summoned ? t("agent.summonedTip") : t("agent.summonTip")}
              >
                <Button
                  size="small"
                  icon={<ThunderboltOutlined />}
                  className={
                    summoned ? styles.summonBtnActive : styles.summonBtn
                  }
                  onClick={handleSummon}
                >
                  {summoned ? t("agent.summoned") : t("agent.summon")}
                </Button>
              </Tooltip>
            )}

            {canManage && (
              <Button
                type="primary"
                size="small"
                icon={<EditOutlined />}
                onClick={() => onEdit(agent)}
                disabled={defaultAgent}
                title={
                  defaultAgent ? t("agent.defaultNotEditable") : undefined
                }
              >
                {t("agent.edit")}
              </Button>
            )}

            {canManage && (
              <Popconfirm
                title={
                  agent.enabled
                    ? t("agent.disableConfirm")
                    : t("agent.enableConfirm")
                }
                description={
                  agent.enabled
                    ? t("agent.disableConfirmDesc")
                    : t("agent.enableConfirmDesc")
                }
                onConfirm={() => onToggle(agent.id, agent.enabled)}
                disabled={defaultAgent}
                okText={t("common.confirm")}
                cancelText={t("common.cancel")}
              >
                <Button
                  type="primary"
                  size="small"
                  icon={agent.enabled ? <EyeOff size={14} /> : <Eye size={14} />}
                  disabled={defaultAgent}
                  title={
                    defaultAgent ? t("agent.defaultNotDisablable") : undefined
                  }
                >
                  {agent.enabled ? t("common.disable") : t("common.enable")}
                </Button>
              </Popconfirm>
            )}

            {isMyTeam && !isOwnMyTeamAgent && !defaultAgent && (
              <Popconfirm
                title={t("myTeam.removeConfirm")}
                description={t("myTeam.removeConfirmDesc")}
                onConfirm={() => onRemoveFromTeam?.(agent.id)}
                okText={t("common.confirm")}
                cancelText={t("common.cancel")}
              >
                <Button danger size="small" icon={<DeleteOutlined />}>
                  {t("common.delete")}
                </Button>
              </Popconfirm>
            )}

            {canManage && (
              <Popconfirm
                title={t("agent.deleteConfirm")}
                description={t("agent.deleteConfirmDesc")}
                onConfirm={() => onDelete(agent.id)}
                disabled={defaultAgent}
                okText={t("common.confirm")}
                cancelText={t("common.cancel")}
              >
                <Button
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  disabled={defaultAgent}
                  title={
                    defaultAgent ? t("agent.defaultNotDeletable") : undefined
                  }
                >
                  {t("common.delete")}
                </Button>
              </Popconfirm>
            )}
          </Space>
        </div>
      </div>
    </div>
  );
}

export function AgentCardGrid({
  agents,
  loading,
  reordering,
  onEdit,
  onDelete,
  onToggle,
  onReorder,
  onRemoveFromTeam,
  onCardClick,
  variant = "team",
  isAdmin = true,
}: AgentCardGridProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    onReorder(String(active.id), String(over.id));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={agents.map((a) => a.id)}
        strategy={rectSortingStrategy}
      >
        <Spin spinning={loading || reordering}>
          <div className="cbc-agent-grid">
            {agents.map((agent, idx) => (
              <SortableAgentCard
                key={agent.id}
                agent={agent}
                index={idx}
                reordering={reordering}
                loading={loading}
                onEdit={onEdit}
                onDelete={onDelete}
                onToggle={onToggle}
                onRemoveFromTeam={onRemoveFromTeam}
                onCardClick={onCardClick}
                variant={variant}
                isAdmin={isAdmin}
              />
            ))}
          </div>
        </Spin>
      </SortableContext>
    </DndContext>
  );
}
