import { useEffect, useMemo, useState, type SyntheticEvent } from "react";
import { Popconfirm, Spin } from "antd";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import dayjs, { type Dayjs } from "dayjs";
import {
  X,
  MessageSquare,
  Pencil,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Sprout,
  FolderOpen,
  Zap,
  Wrench,
  Clock,
  MessageCircle,
  BarChart3,
  Brain,
  ArrowUpRight,
  Trash2,
  ListChecks,
  History,
  MoreHorizontal,
} from "lucide-react";
import type { AgentSummary } from "@/api/types/agents";
import { getAgentDisplayName } from "@/utils/agentDisplayName";
import {
  loadAgentPresentation,
  toggleSummoned,
} from "@/utils/agentPresentationStorage";
import {
  appendAgentEditHistory,
  formatEditHistoryDate,
} from "@/utils/agentEditHistoryStorage";
import { resolveTeamIcon } from "./agentTeamIcons";
import { categoryLabelKey } from "./agentCategories";
import type { AgentCardVariant } from "./AgentCardGrid";
import {
  useAgentDetailData,
  type StatsRange,
} from "./useAgentDetailData";
import styles from "./AgentDetailModal.module.less";

export interface AgentDetailModalProps {
  agent: AgentSummary | null;
  open: boolean;
  variant: AgentCardVariant;
  isAdmin?: boolean;
  onClose: () => void;
  onEdit: (agent: AgentSummary) => void;
  onDelete: (agentId: string) => void;
  onRemoveFromTeam?: (agentId: string) => void;
  onSummonChange?: (agentId: string, summoned: boolean) => void;
}

type DetailTab = "work" | "schedule" | "memory" | "chat";
type TaskFilter = "all" | "pending" | "completed" | "paused";
type RecordFilter = "all" | "pending" | "completed" | "failed";

function statusBadgeClass(status: string): string {
  if (status === "pending" || status === "启用") return styles.badgePrimary;
  if (status === "completed" || status === "success") return styles.badgeAccent;
  if (status === "paused") return styles.badgeSecondary;
  if (status === "failed" || status === "error") return styles.badgeDanger;
  if (status === "skipped" || status === "cancelled") return styles.badgeMuted;
  return styles.badgeMuted;
}

function AgentScheduleTab({
  agentId,
  rows,
  records,
  loading,
}: {
  agentId: string;
  rows: ReturnType<typeof useAgentDetailData>["scheduleRows"];
  records: ReturnType<typeof useAgentDetailData>["scheduleRecords"];
  loading: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");
  const [recordFilter, setRecordFilter] = useState<RecordFilter>("all");

  const pendingCount = rows.filter((r) => r.status === "pending").length;
  const completedCount = rows.filter((r) => r.status === "completed").length;

  const filteredTasks = rows.filter((r) => {
    if (taskFilter === "all") return true;
    return r.status === taskFilter;
  });

  const filteredRecords = records.filter((r) => {
    if (recordFilter === "all") return true;
    if (recordFilter === "failed")
      return r.status === "error" || r.status === "skipped" || r.status === "failed";
    if (recordFilter === "completed") return r.status === "success" || r.status === "completed";
    if (recordFilter === "pending") return r.status === "running" || r.status === "pending";
    return r.status === recordFilter;
  });

  const taskFilters: { key: TaskFilter; label: string }[] = [
    { key: "all", label: t("agentDetail.filterAll") },
    { key: "pending", label: t("agentDetail.filterPending") },
    { key: "completed", label: t("agentDetail.filterCompleted") },
    { key: "paused", label: t("agentDetail.filterPaused") },
  ];

  const recordFilters: { key: RecordFilter; label: string }[] = [
    { key: "all", label: t("agentDetail.filterAll") },
    { key: "pending", label: t("agentDetail.filterPending") },
    { key: "completed", label: t("agentDetail.filterCompleted") },
    { key: "failed", label: t("agentDetail.filterFailedSkipped") },
  ];

  const taskStatusLabel = (status: string) => {
    if (status === "pending") return t("agentDetail.statusEnabled");
    if (status === "completed") return t("agentDetail.statusSuccess");
    if (status === "paused") return t("agentDetail.filterPaused");
    return status;
  };

  const resultLabel = (result: string | null) => {
    if (!result) return "—";
    if (result === "success") return t("agentDetail.statusSuccess");
    if (result === "error") return t("agentDetail.statusFailed");
    if (result === "skipped") return t("agentDetail.statusSkipped");
    return result;
  };

  return (
    <div className={styles.scheduleWrap}>
      <div className={styles.scheduleStatsRow}>
        <div className={styles.scheduleStatCard}>
          <span className={styles.scheduleStatValue}>{pendingCount}</span>
          <span className={styles.scheduleStatLabel}>
            {t("agentDetail.taskPending")}
          </span>
        </div>
        <div className={styles.scheduleStatCard}>
          <span className={styles.scheduleStatValue}>{completedCount}</span>
          <span className={styles.scheduleStatLabel}>
            {t("agentDetail.taskCompleted")}
          </span>
        </div>
        <div className={styles.scheduleStatCard}>
          <span className={styles.scheduleStatValue}>{records.length}</span>
          <span className={styles.scheduleStatLabel}>
            {t("agentDetail.taskRecords")}
          </span>
        </div>
      </div>

      <div className={styles.scheduleAddRow}>
        <button
          type="button"
          className={styles.scheduleAddBtn}
          onClick={() => navigate(`/cron-jobs?agent=${encodeURIComponent(agentId)}`)}
        >
          <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>
            +
          </span>
          <span>{t("agentDetail.addTask")}</span>
        </button>
      </div>

      <div className={styles.scheduleCard}>
        <div className={styles.scheduleCardHeader}>
          <ListChecks size={16} />
          <span className={styles.scheduleCardHeaderTitle}>
            {t("agentDetail.taskListTitle")}
          </span>
          {loading ? <Spin size="small" style={{ marginLeft: 8 }} /> : null}
        </div>
        <div className={styles.scheduleFilterRow}>
          {taskFilters.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTaskFilter(item.key)}
              className={`${styles.scheduleFilterBtn} ${
                taskFilter === item.key ? styles.scheduleFilterBtnActive : ""
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className={styles.scheduleTableWrap}>
          <table className={styles.scheduleTable}>
            <thead>
              <tr className={styles.scheduleTheadRow}>
                {[
                  t("agentDetail.colTask"),
                  t("agentDetail.colPlan"),
                  t("agentDetail.colStatus"),
                  t("agentDetail.colNextExec"),
                  t("agentDetail.colExecuted"),
                  t("agentDetail.colLatestResult"),
                  t("agentDetail.colActions"),
                ].map((h) => (
                  <th key={h} className={styles.scheduleTh}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredTasks.length > 0 ? (
                filteredTasks.map((task) => (
                  <tr key={task.id} className={styles.scheduleBodyRow}>
                    <td className={styles.scheduleTd}>
                      <div className={styles.scheduleTaskName}>{task.name}</div>
                      {task.description ? (
                        <div className={styles.scheduleTaskDesc}>
                          {task.description}
                        </div>
                      ) : null}
                    </td>
                    <td className={styles.scheduleTdMuted}>{task.plan}</td>
                    <td className={styles.scheduleTd}>
                      <span
                        className={`${styles.badge} ${statusBadgeClass(task.status)}`}
                      >
                        {taskStatusLabel(task.status)}
                      </span>
                    </td>
                    <td className={styles.scheduleTdMuted}>{task.nextExec}</td>
                    <td className={styles.scheduleTdMuted}>
                      {task.executedCount} {t("agentDetail.times")}
                    </td>
                    <td className={styles.scheduleTd}>
                      <span
                        className={`${styles.badge} ${statusBadgeClass(task.latestResult || "")}`}
                      >
                        {resultLabel(task.latestResult)}
                      </span>
                    </td>
                    <td className={styles.scheduleTd}>
                      <button type="button" className={styles.iconGhostBtn}>
                        <MoreHorizontal size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr className={styles.scheduleEmptyRow}>
                  <td colSpan={7}>{t("agentDetail.noScheduledTasks")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className={styles.scheduleCard}>
        <div className={styles.scheduleCardHeader}>
          <History size={16} />
          <span className={styles.scheduleCardHeaderTitle}>
            {t("agentDetail.executionRecordTitle")}
          </span>
        </div>
        <div className={styles.scheduleFilterRow}>
          {recordFilters.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setRecordFilter(item.key)}
              className={`${styles.scheduleFilterBtn} ${
                recordFilter === item.key ? styles.scheduleFilterBtnActive : ""
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className={styles.scheduleTableWrap}>
          <table className={styles.scheduleTable}>
            <thead>
              <tr className={styles.scheduleTheadRow}>
                {[
                  t("agentDetail.colTask"),
                  t("agentDetail.colStatus"),
                  t("agentDetail.colPlannedTime"),
                  t("agentDetail.colCompletedTime"),
                  t("agentDetail.colResult"),
                  t("agentDetail.colActions"),
                ].map((h) => (
                  <th key={h} className={styles.scheduleTh}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRecords.length > 0 ? (
                filteredRecords.map((record) => (
                  <tr key={record.id} className={styles.scheduleBodyRow}>
                    <td className={styles.scheduleTd}>{record.taskName}</td>
                    <td className={styles.scheduleTd}>
                      <span
                        className={`${styles.badge} ${statusBadgeClass(record.status)}`}
                      >
                        {resultLabel(record.status)}
                      </span>
                    </td>
                    <td className={styles.scheduleTdMuted}>
                      {record.plannedTime}
                    </td>
                    <td className={styles.scheduleTdMuted}>
                      {record.completedTime}
                    </td>
                    <td className={styles.scheduleTdMuted}>{record.result}</td>
                    <td className={styles.scheduleTd}>
                      <button
                        type="button"
                        className={styles.linkBtn}
                        onClick={() =>
                          navigate(
                            `/cron-jobs?agent=${encodeURIComponent(agentId)}`,
                          )
                        }
                      >
                        {t("agentDetail.viewSession")}
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr className={styles.scheduleEmptyRow}>
                  <td colSpan={6}>{t("agentDetail.noExecutionRecords")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function AgentDetailModal({
  agent,
  open,
  variant,
  isAdmin = true,
  onClose,
  onEdit,
  onDelete,
  onRemoveFromTeam,
  onSummonChange,
}: AgentDetailModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<DetailTab>("work");
  const [showSummonModal, setShowSummonModal] = useState(false);
  const [summoned, setSummoned] = useState(false);
  const [statsRange, setStatsRange] = useState<StatsRange>("day");
  const [anchorDate, setAnchorDate] = useState<Dayjs>(() => dayjs());

  const detail = useAgentDetailData(
    open && agent ? agent.id : null,
    open,
    statsRange,
    anchorDate,
  );

  useEffect(() => {
    if (open && agent) {
      document.body.style.overflow = "hidden";
      setActiveTab("work");
      setShowSummonModal(false);
      setStatsRange("day");
      setAnchorDate(dayjs());
      setSummoned(loadAgentPresentation(agent.id).summoned);
      detail.refreshHistory();
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, agent?.id]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showSummonModal) setShowSummonModal(false);
        else onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose, showSummonModal]);

  const name = agent ? getAgentDisplayName(agent, t) : "";
  const presentation = agent
    ? loadAgentPresentation(agent.id)
    : loadAgentPresentation("");
  const icon = resolveTeamIcon(presentation.iconKey);
  const isMyTeam = variant === "myTeam";
  const isOwnMyTeamAgent = isMyTeam && presentation.origin === "myTeam";
  const canManage = isMyTeam ? isOwnMyTeamAgent : isAdmin;
  const defaultAgent = agent?.id === "default";
  const todayLabel = anchorDate.format("YYYY/M/D");

  const activitySummary = useMemo(() => {
    if (!detail.dailyStats.length) return null;
    const chats = detail.rangeChats;
    const messages = detail.dailyStats.reduce(
      (s, d) => s + (d.total_messages || 0),
      0,
    );
    const tools = detail.dailyStats.reduce(
      (s, d) => s + (d.tool_calls || 0),
      0,
    );
    return { chats, messages, tools };
  }, [detail.dailyStats, detail.rangeChats]);

  if (!open || !agent) return null;

  const tabs: { id: DetailTab; label: string; Icon: typeof BarChart3 }[] = [
    { id: "work", label: t("agentDetail.tabWork"), Icon: BarChart3 },
    { id: "schedule", label: t("agentDetail.tabSchedule"), Icon: Clock },
    { id: "memory", label: t("agentDetail.tabMemory"), Icon: Brain },
    { id: "chat", label: t("agentDetail.tabChat"), Icon: MessageCircle },
  ];

  const statPills = [
    {
      label: t("agentDetail.pillData"),
      count: detail.generatedFiles.length,
    },
    { label: t("agentDetail.pillSkills"), count: detail.skills.length },
    {
      label: t("agentDetail.pillSchedule"),
      count: detail.cronJobs.length,
    },
  ];

  const handleChat = (e?: SyntheticEvent) => {
    e?.stopPropagation();
    onClose();
    navigate(`/chat?agent=${encodeURIComponent(agent.id)}`);
  };

  const handleEdit = (e?: SyntheticEvent) => {
    e?.stopPropagation();
    onClose();
    onEdit(agent);
  };

  const handleSummon = () => {
    const next = toggleSummoned(agent.id);
    setSummoned(next);
    onSummonChange?.(agent.id, next);
    appendAgentEditHistory(agent.id, {
      kind: next ? "summoned" : "unsummoned",
      title: next
        ? t("agentDetail.historySummoned")
        : t("agentDetail.historyUnsummoned"),
      description: name,
    });
    detail.refreshHistory();
    if (next) setShowSummonModal(true);
  };

  const handleDeleteConfirm = () => {
    onClose();
    onDelete(agent.id);
  };

  const handleRemoveConfirm = () => {
    onClose();
    onRemoveFromTeam?.(agent.id);
  };

  const shiftAnchor = (dir: -1 | 1) => {
    if (statsRange === "week") setAnchorDate((d) => d.add(dir, "week"));
    else if (statsRange === "month") setAnchorDate((d) => d.add(dir, "month"));
    else setAnchorDate((d) => d.add(dir, "day"));
  };

  const capabilityCards = [
    {
      key: "data",
      title: t("agentDetail.pillData"),
      count: detail.generatedFiles.length,
      Icon: FolderOpen,
      dark: false,
      items: detail.generatedFiles
        .slice(0, 3)
        .map((f) => f.original_filename),
      empty: t("agentDetail.emptyData"),
    },
    {
      key: "skills",
      title: t("agentDetail.pillSkills"),
      count: detail.skills.length,
      Icon: Zap,
      dark: false,
      items: detail.skills.slice(0, 3).map((s) => s.name),
      empty: t("agentDetail.emptySkills"),
    },
    {
      key: "tools",
      title: t("agentDetail.capTools"),
      count: detail.tools.length,
      Icon: Wrench,
      dark: true,
      items: detail.tools.slice(0, 3).map((tool) => tool.name),
      empty: t("agentDetail.emptyTools"),
    },
    {
      key: "schedule",
      title: t("agentDetail.pillSchedule"),
      count: detail.cronJobs.length,
      Icon: Clock,
      dark: true,
      items: detail.cronJobs.slice(0, 3).map((j) => j.name || j.id),
      empty: t("agentDetail.emptySchedule"),
    },
    {
      key: "chat",
      title: t("agentDetail.capChatLogs"),
      count: detail.chats.length,
      Icon: MessageSquare,
      dark: true,
      items: detail.chats
        .slice(0, 3)
        .map((c) => c.name || c.id.slice(0, 8)),
      empty: t("agentDetail.emptyChat"),
    },
  ];

  const renderTabContent = () => {
    if (activeTab === "work") {
      return (
        <>
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{detail.todayChats}</div>
              <div className={styles.statLabel}>
                {t("agentDetail.todayChats")}
              </div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{detail.totalChats}</div>
              <div className={styles.statLabel}>
                {t("agentDetail.totalChats")}
              </div>
            </div>
            <div className={`${styles.statCard} ${styles.statAccent}`}>
              <div className={styles.statValue}>—</div>
              <div className={styles.statLabel}>
                {t("agentDetail.positiveRate")}
              </div>
            </div>
            <div className={`${styles.statCard} ${styles.statWarn}`}>
              <div className={styles.statValue}>—</div>
              <div className={styles.statLabel}>
                {t("agentDetail.negativeRate")}
              </div>
            </div>
          </div>

          <div className={styles.dateBar}>
            <div className={styles.dateLeft}>
              <CalendarDays size={16} />
              <span>{todayLabel}</span>
            </div>
            <div className={styles.dateNav}>
              <button
                type="button"
                className={styles.dateNavBtn}
                onClick={() => shiftAnchor(-1)}
              >
                <ChevronLeft size={16} />
              </button>
              <span className={styles.dateLabel}>{todayLabel}</span>
              <button
                type="button"
                className={styles.dateNavBtn}
                onClick={() => shiftAnchor(1)}
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <div className={styles.rangeBtns}>
              {(
                [
                  ["day", "Day"],
                  ["week", "Week"],
                  ["month", "Month"],
                ] as const
              ).map(([key, suffix]) => (
                <button
                  key={key}
                  type="button"
                  className={`${styles.rangeBtn} ${
                    statsRange === key ? styles.rangeBtnActive : ""
                  }`}
                  onClick={() => setStatsRange(key)}
                >
                  {t(`agentDetail.range${suffix}`)}
                </button>
              ))}
            </div>
          </div>

          {activitySummary &&
          (activitySummary.chats > 0 ||
            activitySummary.messages > 0 ||
            activitySummary.tools > 0) ? (
            <div className={styles.activityBox}>
              <div className={styles.activityItem}>
                <strong>{activitySummary.chats}</strong>
                <span>{t("agentDetail.activityChats")}</span>
              </div>
              <div className={styles.activityItem}>
                <strong>{activitySummary.messages}</strong>
                <span>{t("agentDetail.activityMessages")}</span>
              </div>
              <div className={styles.activityItem}>
                <strong>{activitySummary.tools}</strong>
                <span>{t("agentDetail.activityTools")}</span>
              </div>
            </div>
          ) : (
            <div className={styles.emptyBox}>
              <CalendarDays size={40} />
              <p>{t("agentDetail.noActivity")}</p>
            </div>
          )}

          <div className={styles.growthSection}>
            <div className={styles.growthTitle}>
              <Sprout size={16} />
              <span>{t("agentDetail.editHistoryTitle")}</span>
            </div>
            <div className={styles.growthList}>
              {detail.editHistory.length > 0 ? (
                detail.editHistory.map((ev) => (
                  <div key={ev.id} className={styles.growthItem}>
                    <span className={styles.growthDate}>
                      {formatEditHistoryDate(ev.at)}
                    </span>
                    <div className={styles.growthDot} />
                    <div className={styles.growthCard}>
                      <div className={styles.growthCardTitle}>{ev.title}</div>
                      {ev.description ? (
                        <div className={styles.growthCardDesc}>
                          {ev.description}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <div className={styles.growthItem}>
                  <span className={styles.growthDate}>—</span>
                  <div className={styles.growthDot} />
                  <div className={styles.growthCard}>
                    <div className={styles.growthCardTitle}>
                      {t("agentDetail.editHistoryEmpty")}
                    </div>
                    <div className={styles.growthCardDesc}>
                      {t("agentDetail.editHistoryEmptyDesc")}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      );
    }

    if (activeTab === "schedule") {
      return (
        <AgentScheduleTab
          agentId={agent.id}
          rows={detail.scheduleRows}
          records={detail.scheduleRecords}
          loading={detail.loading}
        />
      );
    }

    if (activeTab === "memory") {
      return (
        <div className={styles.panelCard}>
          {detail.memories.length > 0 ? (
            <div className={styles.chatLogList}>
              {detail.memories.map((m) => (
                <div key={m.filename} className={styles.chatLogRow}>
                  <Brain size={16} />
                  <span>
                    {m.date || m.filename}
                    {m.updated_at
                      ? ` · ${dayjs(m.updated_at).format("YYYY/M/D HH:mm")}`
                      : ""}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.panelEmptyInner}>
              <Brain size={40} />
              <p>{t("agentDetail.emptyMemory")}</p>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className={styles.panelCard}>
        {detail.chats.length > 0 ? (
          <div className={styles.chatLogList}>
            {detail.chats.slice(0, 30).map((c) => (
              <button
                key={c.id}
                type="button"
                className={styles.chatLogRowBtn}
                onClick={() => {
                  onClose();
                  navigate(
                    `/chat?agent=${encodeURIComponent(agent.id)}&session=${encodeURIComponent(c.id)}`,
                  );
                }}
              >
                <MessageCircle size={16} />
                <span>
                  {c.name || c.id}
                  {c.updated_at
                    ? ` · ${dayjs(c.updated_at).format("YYYY/M/D HH:mm")}`
                    : ""}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className={styles.panelEmptyInner}>
            <MessageCircle size={40} />
            <p>{t("agentDetail.emptyChat")}</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={styles.themeRoot}>
      <div
        className={styles.overlay}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className={styles.dialog} role="dialog" aria-modal="true">
          <div className={styles.closeRow}>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={onClose}
              aria-label={t("common.close", "关闭")}
            >
              <X size={20} />
            </button>
          </div>

          <div className={styles.scrollBody}>
            {detail.loading ? (
              <div className={styles.loadingBar}>
                <Spin size="small" />
                <span>{t("common.loading")}</span>
              </div>
            ) : null}

            <div className={styles.topSection}>
              <div className={styles.avatarCol}>
                <img
                  src={icon.src}
                  alt={icon.label}
                  className={styles.avatar}
                />
                <div className={styles.sideActions}>
                  <button
                    type="button"
                    className={styles.sideBtn}
                    onClick={handleChat}
                    disabled={!agent.enabled}
                  >
                    <MessageSquare size={14} />
                    <span>{t("agentDetail.goChat")}</span>
                  </button>
                  {canManage ? (
                    <button
                      type="button"
                      className={styles.sideBtn}
                      onClick={handleEdit}
                      disabled={defaultAgent}
                    >
                      <Pencil size={14} />
                      <span>{t("agentDetail.editProfile")}</span>
                    </button>
                  ) : null}
                </div>
              </div>

              <div className={styles.infoCol}>
                <div className={styles.nameRow}>
                  <h2 className={styles.name}>{name}</h2>
                  {!isMyTeam ? (
                    <span className={styles.role}>
                      {t(categoryLabelKey(presentation.category))}
                    </span>
                  ) : null}
                </div>

                <div className={styles.metaRow}>
                  <span className={styles.statusItem}>
                    <span
                      className={`${styles.statusDot} ${
                        agent.enabled ? styles.statusOn : styles.statusOff
                      }`}
                    />
                    <span
                      className={
                        agent.enabled
                          ? styles.statusOnText
                          : styles.statusOffText
                      }
                    >
                      {agent.enabled
                        ? t("common.enabled")
                        : t("agent.disabled")}
                    </span>
                  </span>
                  <span>
                    {t("agentDetail.agentId")}: {agent.id}
                  </span>
                  {agent.active_model?.model ? (
                    <span>
                      {t("agent.modelColumn")}: {agent.active_model.model}
                    </span>
                  ) : null}
                </div>

                <p className={styles.desc}>
                  {agent.description?.trim() || t("agentDetail.noDescription")}
                </p>

                <div className={styles.pills}>
                  {statPills.map((pill) => (
                    <div key={pill.label} className={styles.pill}>
                      <span className={styles.pillCount}>{pill.count}</span>
                      <span className={styles.pillLabel}>{pill.label}</span>
                    </div>
                  ))}
                </div>

                {presentation.tags.length > 0 ? (
                  <div className={styles.pills}>
                    {presentation.tags.map((tg) => (
                      <div key={tg} className={styles.pill}>
                        <span className={styles.pillLabel}>{tg}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className={styles.tabs}>
              {tabs.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  className={`${styles.tab} ${
                    activeTab === id ? styles.tabActive : ""
                  }`}
                  onClick={() => setActiveTab(id)}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            {renderTabContent()}

            {activeTab === "work" ? (
              <div className={styles.capabilityGrid}>
                {capabilityCards.map(
                  ({ key, title, count, Icon, dark, items, empty }) => (
                    <div
                      key={key}
                      className={`${styles.capCard} ${
                        dark ? styles.capCardDark : ""
                      }`}
                    >
                      <div className={styles.capHeader}>
                        <div className={styles.capTitle}>
                          <Icon size={16} />
                          <span>{title}</span>
                        </div>
                        <span className={styles.capCount}>{count}</span>
                      </div>
                      <div className={styles.capList}>
                        {items.length > 0 ? (
                          items.map((item) => (
                            <div key={item} className={styles.capItem}>
                              {item}
                            </div>
                          ))
                        ) : (
                          <p className={styles.capEmpty}>{empty}</p>
                        )}
                      </div>
                      <div className={styles.capArrow}>
                        <ArrowUpRight size={14} />
                      </div>
                      {dark ? (
                        <div className={styles.capWatermark}>
                          <Icon size={64} />
                        </div>
                      ) : null}
                    </div>
                  ),
                )}
              </div>
            ) : null}

            <div className={styles.footer}>
              {isMyTeam && !isOwnMyTeamAgent && !defaultAgent ? (
                <Popconfirm
                  title={t("myTeam.removeConfirm")}
                  description={t("myTeam.removeConfirmDesc")}
                  onConfirm={handleRemoveConfirm}
                  okText={t("common.confirm")}
                  cancelText={t("common.cancel")}
                >
                  <button type="button" className={styles.footerBtn}>
                    <Trash2 size={14} />
                    <span>{t("myTeam.unsummon")}</span>
                  </button>
                </Popconfirm>
              ) : null}

              {canManage && !defaultAgent ? (
                <Popconfirm
                  title={t("agent.deleteConfirm")}
                  description={t("agent.deleteConfirmDesc")}
                  onConfirm={handleDeleteConfirm}
                  okText={t("common.confirm")}
                  cancelText={t("common.cancel")}
                >
                  <button type="button" className={styles.footerBtn}>
                    <Trash2 size={14} />
                    <span>{t("common.delete")}</span>
                  </button>
                </Popconfirm>
              ) : null}

              {!isMyTeam && !defaultAgent ? (
                <button
                  type="button"
                  className={`${styles.footerBtn} ${styles.footerPrimary}`}
                  onClick={handleSummon}
                >
                  <i className="ri-sparkling-line" aria-hidden />
                  <span>
                    {summoned ? t("agent.summoned") : t("agent.summon")}
                  </span>
                </button>
              ) : null}

              {isMyTeam ? (
                <button
                  type="button"
                  className={`${styles.footerBtn} ${styles.footerPrimary}`}
                  onClick={handleChat}
                  disabled={!agent.enabled}
                >
                  <MessageSquare size={14} />
                  <span>{t("myTeam.assignTask")}</span>
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {showSummonModal ? (
        <div
          className={styles.summonOverlay}
          onClick={() => setShowSummonModal(false)}
        >
          <div
            className={styles.summonDialog}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.summonHero}>
              <i
                className={`ri-sparkling-2-line ${styles.summonHeroIcon}`}
                aria-hidden
              />
              <button
                type="button"
                className={styles.summonClose}
                onClick={() => setShowSummonModal(false)}
              >
                <X size={16} />
              </button>
            </div>
            <div className={styles.summonBody}>
              <h3 className={styles.summonTitle}>
                {t("agentDetail.summonSuccessTitle", { name })}
              </h3>
              <p className={styles.summonDesc}>
                {t("agentDetail.summonSuccessDesc")}
              </p>
              <button
                type="button"
                className={styles.summonConfirm}
                onClick={() => setShowSummonModal(false)}
              >
                {t("common.confirm")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
