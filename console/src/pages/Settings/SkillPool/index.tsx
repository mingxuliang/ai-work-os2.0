import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button, Input, Select, Tooltip } from "@agentscope-ai/design";
import { Badge } from "antd";
import {
  AppstoreOutlined,
  CloseOutlined,
  DeleteOutlined,
  ImportOutlined,
  PlusOutlined,
  ReloadOutlined,
  SendOutlined,
  SyncOutlined,
  UnorderedListOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { ImportHubModal } from "../../Agent/Skills/components/ImportHubModal";
import { SkillFilterDropdown } from "../../Agent/Skills/components/SkillFilterDropdown";
import { SkillCreationModal } from "../../Agent/Skills/components";
import {
  BroadcastModal,
  ImportBuiltinModal,
  PoolSkillCard,
  PoolSkillListItem,
} from "./components";
import { getBuiltinNoticeLines } from "./builtinNotice";
import { useSkillPool } from "./useSkillPool";
import { useProgressiveRender } from "../../../hooks/useProgressiveRender";
import { PageHeader } from "@/components/PageHeader";
import { CopawWorkbenchShell } from "@/components/CopawWorkbenchShell";
import { useAppMessage } from "@/hooks/useAppMessage";
import { isSkillBuiltin } from "@/utils/skill";
import type { PoolSkillSpec } from "../../../api/types";
import styles from "./index.module.less";

function SkillPoolPage() {
  const { t } = useTranslation();
  const { message } = useAppMessage();
  const [searchParams, setSearchParams] = useSearchParams();
  const pool = useSkillPool();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingPoolSkill, setEditingPoolSkill] = useState<PoolSkillSpec | null>(
    null,
  );
  const focusHandledRef = useRef<string | null>(null);
  const focusName = searchParams.get("focus")?.trim() || "";

  const handleEditPoolSkill = (skill: PoolSkillSpec) => {
    if (isSkillBuiltin(skill.source)) {
      message.warning(t("skills.builtinNotEditable"));
      return;
    }
    setEditingPoolSkill(skill);
  };

  // Deep-link from Skill Store: /skill-pool?focus=<name>
  useEffect(() => {
    if (!focusName || pool.loading) return;
    if (focusHandledRef.current === focusName) return;
    focusHandledRef.current = focusName;
    void pool.revealSkill(focusName, { refresh: true, toast: true }).then(() => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("focus");
          return next;
        },
        { replace: true },
      );
    });
  }, [focusName, pool.loading, pool.revealSkill, setSearchParams]);

  useEffect(() => {
    if (!pool.highlightName) return;
    const el = document.querySelector(
      `[data-skill-name="${CSS.escape(pool.highlightName)}"]`,
    );
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [pool.highlightName, pool.sortedSkills]);

  const builtinNoticeLines = getBuiltinNoticeLines(pool.builtinNotice, t);
  const {
    visibleItems: visibleSkills,
    hasMore,
    sentinelRef,
  } = useProgressiveRender(pool.sortedSkills);

  return (
    <CopawWorkbenchShell>
      <div className={styles.skillsPage}>
        <PageHeader
          parent={t("nav.settings")}
          current={t("nav.skillPool")}
          subRow={
            <p className="copaw-bench-page-desc">
              {t("skillPool.description")}
            </p>
          }
          extra={
            <div className={styles.headerRight}>
              <input
                type="file"
                accept=".zip"
                ref={pool.zipInputRef}
                onChange={pool.handleZipImport}
                style={{ display: "none" }}
              />
              {pool.batchModeEnabled ? (
                <div className={styles.batchActions}>
                  <span className={styles.batchCount}>
                    {t("skills.selectedCount", {
                      count: pool.selectedPoolSkills.size,
                    })}
                  </span>
                  <Button type="default" onClick={pool.selectAllPool}>
                    {t("skills.selectAll")}
                  </Button>
                  <Button
                    type="default"
                    onClick={pool.clearPoolSelection}
                    icon={<CloseOutlined />}
                  >
                    {t("skills.clearSelection")}
                  </Button>
                  <Button
                    danger
                    icon={<DeleteOutlined />}
                    onClick={pool.handleBatchDeletePool}
                  >
                    {t("common.delete")} ({pool.selectedPoolSkills.size})
                  </Button>
                  <Button type="primary" onClick={pool.toggleBatchMode}>
                    {t("skills.exitBatch")}
                  </Button>
                </div>
              ) : (
                <>
                  <div className={styles.headerActionsLeft}>
                    <Tooltip title={t("skillPool.refreshHint")}>
                      <Button
                        type="default"
                        icon={<ReloadOutlined spin={pool.loading} />}
                        onClick={pool.handleRefresh}
                        disabled={pool.loading}
                      />
                    </Tooltip>
                    <Tooltip title={t("skillPool.broadcastHint")}>
                      <Button
                        type="default"
                        className={styles.primaryTransferButton}
                        icon={<SendOutlined />}
                        onClick={() => pool.openBroadcast()}
                      >
                        {t("skillPool.broadcast")}
                      </Button>
                    </Tooltip>
                    <Tooltip
                      title={
                        pool.hasUnseenBuiltinNotice
                          ? builtinNoticeLines.length > 0
                            ? builtinNoticeLines.map((line) => (
                                <div key={line}>{line}</div>
                              ))
                            : t("skillPool.importBuiltinAlertHint", {
                                count: pool.builtinNoticeTotal,
                              })
                          : t("skillPool.importBuiltinHint")
                      }
                    >
                      <Badge
                        dot={pool.hasUnseenBuiltinNotice}
                        color="rgba(255, 157, 77, 1)"
                        offset={[-4, 4]}
                      >
                        <Button
                          type="default"
                          icon={<SyncOutlined />}
                          onClick={() => void pool.openImportBuiltin()}
                        >
                          {t("skillPool.importBuiltin")}
                        </Button>
                      </Badge>
                    </Tooltip>
                  </div>
                  <div className={styles.headerActionsRight}>
                    <Tooltip title={t("skillPool.uploadZipHint")}>
                      <Button
                        type="default"
                        icon={<UploadOutlined />}
                        onClick={() => pool.zipInputRef.current?.click()}
                      >
                        {t("skills.uploadZip")}
                      </Button>
                    </Tooltip>
                    <Tooltip title={t("skillPool.importHubHint")}>
                      <Button
                        type="default"
                        icon={<ImportOutlined />}
                        onClick={() => pool.setImportModalOpen(true)}
                      >
                        {t("skills.importHub")}
                      </Button>
                    </Tooltip>
                    <Button type="primary" onClick={pool.toggleBatchMode}>
                      {t("skills.batchOperation")}
                    </Button>
                    <Tooltip title={t("skills.createSkillHint")}>
                      <Button
                        type="primary"
                        className={styles.primaryActionButton}
                        icon={<PlusOutlined />}
                        onClick={() => setCreateModalOpen(true)}
                      >
                        {t("skills.createSkill")}
                      </Button>
                    </Tooltip>
                  </div>
                </>
              )}
            </div>
          }
        />

      <div className="copaw-bench-main-section copaw-bench-main-section--scroll">
        {/* ---- Scrollable Content ---- */}
        <div className={styles.content}>
        {/* Toolbar */}
        {!pool.loading && pool.skills.length > 0 && (
          <div className={styles.toolbar}>
            <div className={styles.searchContainer}>
              <Input
                className={styles.searchInput}
                placeholder={t("skills.searchPlaceholder")}
                value={pool.searchQuery}
                onChange={(e) => pool.setSearchQuery(e.target.value)}
                allowClear
              />
              <Select
                mode="multiple"
                className={styles.tagSelect}
                placeholder={t("skills.filterByTag")}
                value={pool.searchTags}
                onChange={pool.setSearchTags}
                open={pool.filterOpen}
                onDropdownVisibleChange={pool.setFilterOpen}
                allowClear
                maxTagCount="responsive"
                notFoundContent={<></>}
                dropdownRender={() =>
                  pool.allTags.length > 0 ? (
                    <SkillFilterDropdown
                      allTags={pool.allTags}
                      searchTags={pool.searchTags}
                      setSearchTags={pool.setSearchTags}
                      styles={styles}
                    />
                  ) : (
                    <div className={styles.tagSelectEmpty}>
                      {t("skills.noTags")}
                    </div>
                  )
                }
              />
            </div>
            <div className={styles.toolbarRight}>
              <div className={styles.viewToggle}>
                <button
                  className={`${styles.viewToggleBtn} ${
                    pool.viewMode === "list" ? styles.viewToggleBtnActive : ""
                  }`}
                  onClick={() => pool.setViewMode("list")}
                  title={t("skills.listView")}
                >
                  <UnorderedListOutlined />
                </button>
                <button
                  className={`${styles.viewToggleBtn} ${
                    pool.viewMode === "card" ? styles.viewToggleBtnActive : ""
                  }`}
                  onClick={() => pool.setViewMode("card")}
                  title={t("skills.gridView")}
                >
                  <AppstoreOutlined />
                </button>
              </div>
            </div>
          </div>
        )}

        {pool.loading ? (
          <div className={styles.loading}>
            <span className={styles.loadingText}>{t("common.loading")}</span>
          </div>
        ) : pool.sortedSkills.length === 0 && pool.skills.length > 0 ? (
          <div className={styles.noSearchResults}>
            <span className={styles.noSearchResultsIcon}>🔍</span>
            <span className={styles.noSearchResultsText}>
              {t("skills.noSearchResults")}
            </span>
          </div>
        ) : pool.viewMode === "card" ? (
          <div className={`cbc-agent-grid ${styles.poolGrid}`}>
            {visibleSkills.map((skill: PoolSkillSpec, index: number) => (
              <PoolSkillCard
                key={skill.name}
                cardIndex={index}
                skill={skill}
                isSelected={pool.selectedPoolSkills.has(skill.name)}
                isHighlighted={pool.highlightName === skill.name}
                batchModeEnabled={pool.batchModeEnabled}
                onToggleSelect={pool.togglePoolSelect}
                onEdit={handleEditPoolSkill}
                onBroadcast={pool.openBroadcast}
                onDelete={pool.handleDelete}
              />
            ))}
            {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
          </div>
        ) : (
          <div className={styles.skillsList}>
            {visibleSkills.map((skill: PoolSkillSpec) => (
              <PoolSkillListItem
                key={skill.name}
                skill={skill}
                isSelected={pool.selectedPoolSkills.has(skill.name)}
                isHighlighted={pool.highlightName === skill.name}
                batchModeEnabled={pool.batchModeEnabled}
                onToggleSelect={pool.togglePoolSelect}
                onEdit={handleEditPoolSkill}
                onBroadcast={pool.openBroadcast}
                onDelete={pool.handleDelete}
              />
            ))}
            {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
          </div>
        )}
      </div>
      </div>

      <ImportHubModal
        open={pool.importModalOpen}
        importing={pool.importing}
        onCancel={pool.closeImportModal}
        onConfirm={pool.handleConfirmImport}
        hint={t("skillPool.externalHubHint")}
      />

      <BroadcastModal
        open={pool.mode === "broadcast"}
        skills={pool.skills}
        workspaces={pool.workspaces}
        initialSkillNames={pool.broadcastInitialNames}
        onCancel={pool.closeModal}
        onConfirm={pool.handleBroadcast}
      />

      <ImportBuiltinModal
        open={pool.importBuiltinModalOpen}
        loading={pool.importBuiltinLoading}
        sources={pool.builtinSources}
        notice={pool.builtinNotice}
        defaultLanguage={pool.builtinLanguage}
        defaultSelectedNames={pool.builtinNotice?.actionable_skill_names}
        onCancel={pool.closeImportBuiltin}
        onConfirm={pool.handleImportBuiltins}
      />

      <SkillCreationModal
        open={createModalOpen || !!editingPoolSkill}
        target="pool"
        editingSkill={
          editingPoolSkill
            ? {
                name: editingPoolSkill.name,
                description: editingPoolSkill.description,
                content: editingPoolSkill.content,
                sourceName: editingPoolSkill.name,
                source: editingPoolSkill.source,
              }
            : null
        }
        onClose={() => {
          setCreateModalOpen(false);
          setEditingPoolSkill(null);
        }}
        onCreated={(result) => {
          setCreateModalOpen(false);
          setEditingPoolSkill(null);
          void pool.revealSkill(result.name, { refresh: true, toast: true });
        }}
        onSaved={(result) => {
          setCreateModalOpen(false);
          setEditingPoolSkill(null);
          void pool.revealSkill(result.name, { refresh: true, toast: true });
        }}
      />

      {pool.conflictRenameModal}
    </div>
    </CopawWorkbenchShell>
  );
}

export default SkillPoolPage;
