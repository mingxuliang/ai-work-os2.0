import { useTranslation } from "react-i18next";
import { PlusOutlined } from "@ant-design/icons";
import { Button } from "@agentscope-ai/design";
import {
  SkillCard,
  SkillCreationModal,
  PoolTransferModal,
  ImportHubModal,
  HeaderActions,
  SkillsToolbar,
  SkillListItem,
} from "./components";
import { PageHeader } from "@/components/PageHeader";
import { CopawWorkbenchShell } from "@/components/CopawWorkbenchShell";
import { useSkillsPage } from "./useSkillsPage";
import styles from "./index.module.less";

function SkillsPage() {
  const { t } = useTranslation();
  const {
    skills,
    visibleSkills,
    hasMore,
    sentinelRef,
    poolSkills,
    allTags,
    sortedSkills,
    conflictRenameModal,
    loading,
    uploading,
    importing,
    createModalOpen,
    importModalOpen,
    setImportModalOpen,
    editingSkill,
    fileInputRef,
    poolModal,
    setPoolModal,
    selectedSkills,
    batchModeEnabled,
    viewMode,
    setViewMode,
    filterOpen,
    setFilterOpen,
    searchQuery,
    setSearchQuery,
    searchTags,
    setSearchTags,
    handleCreate,
    handleCreateModalClose,
    handleCreated,
    handleEdit,
    handleToggleEnabled,
    handleDelete,
    handleUploadToPool,
    handleDownloadFromPool,
    handleBatchEnable,
    handleBatchDisable,
    handleBatchDelete,
    handleUploadClick,
    handleFileChange,
    handleConfirmImport,
    closeImportModal,
    closePoolModal,
    toggleSelect,
    selectAll,
    clearSelection,
    toggleBatchMode,
    toggleEnabled,
    refreshSkills,
    hardRefresh,
    cancelImport,
  } = useSkillsPage();

  return (
    <CopawWorkbenchShell>
      <div className={styles.skillsPage}>
        <PageHeader
          items={[{ title: t("nav.agent") }, { title: t("skills.title") }]}
          subRow={
            <p className="copaw-bench-page-desc">{t("skills.description")}</p>
          }
          extra={
            <HeaderActions
              batchModeEnabled={batchModeEnabled}
              selectedSkills={selectedSkills}
              loading={loading}
              uploading={uploading}
              fileInputRef={fileInputRef}
              onSelectAll={selectAll}
              onClearSelection={clearSelection}
              onUploadToPool={handleUploadToPool}
              onBatchEnable={handleBatchEnable}
              onBatchDisable={handleBatchDisable}
              onBatchDelete={handleBatchDelete}
              onToggleBatchMode={toggleBatchMode}
              onHardRefresh={hardRefresh}
              onOpenDownloadPool={() => setPoolModal("download")}
              onOpenUploadPool={() => setPoolModal("upload")}
              onUploadClick={handleUploadClick}
              onImportHub={() => setImportModalOpen(true)}
              onCreate={handleCreate}
              onFileChange={handleFileChange}
            />
          }
        />

        <ImportHubModal
          open={importModalOpen}
          importing={importing}
          onCancel={closeImportModal}
          onConfirm={handleConfirmImport}
          cancelImport={cancelImport}
          hint={t("skillPool.externalHubHint")}
        />

        <div className="copaw-bench-main-section copaw-bench-main-section--scroll">
          {!loading && skills.length > 0 && (
            <SkillsToolbar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              searchTags={searchTags}
              onTagsChange={setSearchTags}
              allTags={allTags}
              filterOpen={filterOpen}
              onFilterOpenChange={setFilterOpen}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
            />
          )}

          {loading ? (
            <div className={styles.loading}>
              <span className={styles.loadingText}>{t("common.loading")}</span>
            </div>
          ) : skills.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyStateBadge}>
                {t("skills.emptyStateBadge")}
              </div>
              <h2 className={styles.emptyStateTitle}>
                {t("skills.emptyStateTitle")}
              </h2>
              <p className={styles.emptyStateText}>{t("skills.emptyStateText")}</p>
              <div className={styles.emptyStateActions}>
                <Button
                  type="primary"
                  className={styles.primaryActionButton}
                  onClick={handleCreate}
                  icon={<PlusOutlined />}
                >
                  {t("skills.emptyStateCreate")}
                </Button>
              </div>
            </div>
          ) : sortedSkills.length === 0 ? (
            <div className={styles.noSearchResults}>
              <span className={styles.noSearchResultsIcon}>🔍</span>
              <span className={styles.noSearchResultsText}>
                {t("skills.noSearchResults")}
              </span>
            </div>
          ) : viewMode === "card" ? (
            <div className={styles.skillsGrid}>
              {visibleSkills.map((skill, index) => (
                <SkillCard
                  key={skill.name}
                  cardIndex={index}
                  skill={skill}
                  selected={
                    batchModeEnabled ? selectedSkills.has(skill.name) : undefined
                  }
                  onSelect={() => toggleSelect(skill.name)}
                  onClick={() => handleEdit(skill)}
                  onMouseEnter={() => {}}
                  onMouseLeave={() => {}}
                  onToggleEnabled={(e) => handleToggleEnabled(skill, e)}
                  onDelete={(e) => handleDelete(skill, e)}
                />
              ))}
              {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
            </div>
          ) : (
            <div className={styles.skillsList}>
              {visibleSkills.map((skill) => (
                <SkillListItem
                  key={skill.name}
                  skill={skill}
                  batchModeEnabled={batchModeEnabled}
                  isSelected={selectedSkills.has(skill.name)}
                  onSelect={() => toggleSelect(skill.name)}
                  onClick={() => handleEdit(skill)}
                  onToggleEnabled={async () => {
                    await toggleEnabled(skill);
                    await refreshSkills();
                  }}
                  onDelete={() => handleDelete(skill)}
                />
              ))}
              {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
            </div>
          )}
        </div>

        <PoolTransferModal
          mode={poolModal}
          skills={skills}
          poolSkills={poolSkills}
          onCancel={closePoolModal}
          onUpload={handleUploadToPool}
          onDownload={handleDownloadFromPool}
        />

        {conflictRenameModal}

        <SkillCreationModal
          open={createModalOpen}
          target="workspace"
          editingSkill={
            editingSkill
              ? {
                  name: editingSkill.name,
                  description: editingSkill.description,
                  content: editingSkill.content,
                  sourceName: editingSkill.name,
                  source: editingSkill.source,
                }
              : null
          }
          onClose={handleCreateModalClose}
          onCreated={() => void handleCreated()}
          onSaved={() => void handleCreated()}
        />
      </div>
    </CopawWorkbenchShell>
  );
}

export default SkillsPage;
