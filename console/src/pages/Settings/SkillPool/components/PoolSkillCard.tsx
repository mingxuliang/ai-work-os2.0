import { useState } from "react";
import { Button, Checkbox, Tooltip } from "@agentscope-ai/design";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import type { PoolSkillSpec } from "../../../../api/types";
import {
  getPoolBuiltinStatusLabel,
  getPoolBuiltinStatusTone,
  isSkillBuiltin,
} from "@/utils/skill";
import { cbcCardStripeClass } from "@/utils/cbcCardTheme";
import { getSkillVisual } from "../../../Agent/Skills/components";
import styles from "../index.module.less";

dayjs.extend(relativeTime);

interface PoolSkillCardProps {
  skill: PoolSkillSpec;
  /** Rotating accent stripe — 与工作区技能卡片一致 */
  cardIndex?: number;
  isSelected: boolean;
  isHighlighted?: boolean;
  batchModeEnabled: boolean;
  onToggleSelect: (name: string) => void;
  onEdit: (skill: PoolSkillSpec) => void;
  onBroadcast: (skill: PoolSkillSpec) => void;
  onDelete: (skill: PoolSkillSpec) => void;
}

export function PoolSkillCard({
  skill,
  cardIndex = 0,
  isSelected,
  isHighlighted = false,
  batchModeEnabled,
  onToggleSelect,
  onEdit,
  onBroadcast,
  onDelete,
}: PoolSkillCardProps) {
  const { t } = useTranslation();
  const [, setIsHover] = useState(false);
  const syncTone = getPoolBuiltinStatusTone(skill.sync_status);
  const isBuiltin = isSkillBuiltin(skill.source);
  const showSyncedGlow = skill.sync_status === "synced";
  const themeCls = cbcCardStripeClass(cardIndex);
  const selectedCls = isSelected ? "cbc-card--selected" : "";
  const highlightCls = isHighlighted ? styles.poolSkillHighlight : "";

  const statusDotClass =
    syncTone === "synced"
      ? "cbc-status-dot"
      : syncTone === "outdated"
        ? `cbc-status-dot ${styles.poolSyncDotOutdated}`
        : "cbc-status-dot cbc-status-dot--off";

  const statusTextClass =
    syncTone === "synced"
      ? "cbc-status-text-on"
      : syncTone === "outdated"
        ? styles.poolSyncTextOutdated
        : "cbc-status-text-off";

  const handleCardClick = () => {
    if (batchModeEnabled) {
      onToggleSelect(skill.name);
    } else {
      onEdit(skill);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      data-skill-name={skill.name}
      className={`cbc-card ${themeCls} ${selectedCls} ${highlightCls}`}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (batchModeEnabled) {
            onToggleSelect(skill.name);
          } else {
            onEdit(skill);
          }
        }
      }}
      onMouseEnter={() => setIsHover(true)}
      onMouseLeave={() => setIsHover(false)}
      style={{
        cursor: isBuiltin && !batchModeEnabled ? "default" : "pointer",
      }}
      title={
        isBuiltin && !batchModeEnabled
          ? t("skills.builtinNotEditable")
          : undefined
      }
    >
      <div className="cbc-glow-layer" aria-hidden />
      {showSyncedGlow ? (
        <>
          <div className="cbc-enabled-ring" aria-hidden />
          <div className="cbc-spectrum" aria-hidden>
            <span />
          </div>
        </>
      ) : null}
      <div className="cbc-card-inner">
        {/* Batch-mode checkbox — top-right corner */}
        {batchModeEnabled && (
          <div className={styles.cardSelectRow}>
            <Checkbox
              checked={isSelected}
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect(skill.name);
              }}
            />
          </div>
        )}

        {/* ── Hero: icon cube + name/type (Agent Team layout) ── */}
        <div className={styles.skillCardHero}>
          <div className={`cbc-icon3d cbc-icon3d--plain ${styles.skillIconCube}`}>
            <span className={styles.fileIcon}>
              {getSkillVisual(skill.name, skill.emoji)}
            </span>
          </div>
          <div className={styles.skillCardTitles}>
            <Tooltip title={skill.name}>
              <div className={`card-title ${styles.skillCardName}`}>{skill.name}</div>
            </Tooltip>
            <span className="cbc-meta" style={{ fontSize: 12 }}>
              {isBuiltin ? (
                <span className="cbc-tag">{t("skillPool.builtin")}</span>
              ) : (
                <span className="cbc-tag">{t("skillPool.custom")}</span>
              )}
            </span>
          </div>
        </div>

        {/* ── Sync status pill ── */}
        <div style={{ marginTop: 10 }} className="cbc-meta">
          <div className="cbc-status-pill">
            <span className={statusDotClass} />
            <span className={statusTextClass}>
              {getPoolBuiltinStatusLabel(skill.sync_status, t)}
            </span>
          </div>
        </div>

        {/* ── Meta + description lines ── */}
        <div className={`cbc-meta ${styles.skillCardLines}`}>
          {skill.last_updated && (
            <div className={styles.skillCardLine}>
              {t("skills.lastUpdated")}:{" "}
              <span>{dayjs(skill.last_updated).fromNow()}</span>
            </div>
          )}
          {!!skill.tags?.length && (
            <div className={styles.tagChips} style={{ marginTop: 4 }}>
              {skill.tags.map((tag) => (
                <span key={tag} className={styles.tagChip}>{tag}</span>
              ))}
            </div>
          )}
          <div className={styles.skillCardLine}>{skill.description || "—"}</div>
        </div>

        {/* ── Actions — always visible (Agent Team style) ── */}
        <div className="cbc-agent-card-actions">
          <Button
            type="primary"
            size="small"
            disabled={batchModeEnabled}
            onClick={(e) => {
              e.stopPropagation();
              onBroadcast(skill);
            }}
          >
            {t("skillPool.broadcast")}
          </Button>
          <Button
            danger
            size="small"
            disabled={batchModeEnabled}
            onClick={(e) => {
              e.stopPropagation();
              void onDelete(skill);
            }}
          >
            {t("skillPool.delete")}
          </Button>
        </div>
      </div>
    </div>
  );
}
