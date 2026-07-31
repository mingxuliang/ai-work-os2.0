import { useState, useMemo, useEffect, useCallback, type CSSProperties } from "react";
import { Spin } from "antd";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import MaterialSidebar from "./components/MaterialSidebar";
import MaterialFileCard from "./components/MaterialFileCard";
import LlmOutputsPanel from "./components/LlmOutputsPanel";
import UploadModal from "./components/UploadModal";
import FilePreviewModal from "./components/FilePreviewModal";
import { useMaterialCenter } from "./useMaterialCenter";
import { llmOutputsApi, type LlmOutputItem } from "@/api/modules/llmOutputs";
import { chatApi } from "@/api/modules/chat";
import { buildAuthHeaders } from "@/api/authHeaders";
import { usePendingChatFilesStore } from "@/stores/pendingChatFilesStore";
import { useAppMessage } from "@/hooks/useAppMessage";
import "@/styles/migrated-pages.css";

type ViewMode = "grid" | "list";
type SortKey = "updatedAt" | "name" | "size";
type LlmOutputTypeCounts = Record<"doc" | "video" | "image" | "audio", number>;

const SYS = {
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
  bgPage: "#f0f4fa",
  bgCard: "#ffffff",
  borderBase: "#e2e8f0",
  borderLight: "#f1f5f9",
  primary: "#3b82f6",
  textMain: "#0f172a",
  textSub: "#64748b",
  textMuted: "#94a3b8",
  radiusSM: 8,
};

const pageShellStyle: CSSProperties = {
  height: "100%",
  minHeight: 0,
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  fontFamily: SYS.fontFamily,
  background: SYS.bgPage,
};

function parseSizeToBytes(size: string): number {
  const n = parseFloat(size);
  if (size.includes("GB")) return n * 1024 ** 3;
  if (size.includes("MB")) return n * 1024 ** 2;
  if (size.includes("KB")) return n * 1024;
  return n;
}

function getLlmOutputType(mime?: string | null, filename = ""): keyof LlmOutputTypeCounts | null {
  const normalizedMime = (mime ?? "").toLowerCase();
  const ext = filename.split(".").pop()?.trim().toLowerCase() ?? "";
  if (normalizedMime.startsWith("video/") || ["mp4", "mov", "avi", "webm", "mkv"].includes(ext)) return "video";
  if (normalizedMime.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "image";
  if (normalizedMime.startsWith("audio/") || ["mp3", "wav", "aac", "flac", "m4a"].includes(ext)) return "audio";
  if (
    normalizedMime.includes("pdf") ||
    normalizedMime.includes("word") ||
    normalizedMime.includes("docx") ||
    normalizedMime.includes("excel") ||
    normalizedMime.includes("xlsx") ||
    normalizedMime.includes("spreadsheet") ||
    normalizedMime.includes("ppt") ||
    normalizedMime.includes("presentation") ||
    normalizedMime.startsWith("text/") ||
    ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "md", "html", "csv", "json"].includes(ext)
  ) {
    return "doc";
  }
  return null;
}

async function loadAllLlmOutputs(): Promise<{ items: LlmOutputItem[]; total: number }> {
  const pageSize = 200;
  const first = await llmOutputsApi.list({ page: 1, page_size: pageSize });
  if (first.items.length >= first.total) return { items: first.items, total: first.total };

  const totalPages = Math.ceil(first.total / pageSize);
  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, idx) =>
      llmOutputsApi.list({ page: idx + 2, page_size: pageSize }),
    ),
  );
  return {
    items: [...first.items, ...rest.flatMap((res) => res.items)],
    total: first.total,
  };
}

export default function MaterialCenterPage() {
  const { t } = useTranslation();
  const { message } = useAppMessage();
  const {
    loading,
    error,
    filtered,
    sidebarCategories,
    businessCategories,
    totalBytes,
    activeCategory,
    setActiveCategory,
    searchText,
    setSearchText,
    selectedIds,
    toggleSelect,
    selectAll,
    clearSelection,
    handleUpload,
    handleAddBusiness,
    handleDeleteBusiness,
    handleDeleteSelected,
    handleDownload,
    handleDownloadSelected,
    reload,
  } = useMaterialCenter();

  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [showUpload, setShowUpload] = useState(false);
  const [previewFile, setPreviewFile] = useState<import("@/mocks/materialCenter").MaterialFile | null>(null);
  const [llmOutputCount, setLlmOutputCount] = useState<number | undefined>(undefined);
  const [llmOutputTypeCounts, setLlmOutputTypeCounts] = useState<LlmOutputTypeCounts>({
    doc: 0,
    video: 0,
    image: 0,
    audio: 0,
  });
  const [llmSelectedCount, setLlmSelectedCount] = useState(0);
  const [llmAddSelectedRequest, setLlmAddSelectedRequest] = useState(0);
  const navigate = useNavigate();
  const addPendingFile = usePendingChatFilesStore((s) => s.addFile);

  // Load LLM output counts for sidebar badges
  useEffect(() => {
    loadAllLlmOutputs()
      .then(({ items, total }) => {
        const next: LlmOutputTypeCounts = { doc: 0, video: 0, image: 0, audio: 0 };
        for (const item of items) {
          const type = getLlmOutputType(item.mime_type, item.original_filename);
          if (type) next[type] += 1;
        }
        setLlmOutputCount(total);
        setLlmOutputTypeCounts(next);
      })
      .catch(() => {
        setLlmOutputCount(undefined);
        setLlmOutputTypeCounts({ doc: 0, video: 0, image: 0, audio: 0 });
      });
  }, []);

  const prepareMaterialFileForChat = useCallback(async (file: import("@/mocks/materialCenter").MaterialFile) => {
    const mimeMap: Record<string, string> = {
      ppt: 'application/vnd.ms-powerpoint', word: 'application/msword',
      pdf: 'application/pdf', excel: 'application/vnd.ms-excel',
      video: 'video/mp4', image: 'image/jpeg', audio: 'audio/mpeg',
    };
    const mime = mimeMap[file.type] ?? 'application/octet-stream';
    const fileId = Number(file.id);
    const downloadUrl = Number.isFinite(fileId)
      ? `/api/files/${fileId}/download`
      : file.downloadUrl;
    if (!downloadUrl) throw new Error('无效的文件下载地址');
    const downloadRes = await fetch(downloadUrl, { headers: buildAuthHeaders() });
    if (!downloadRes.ok) throw new Error(`下载失败 (${downloadRes.status})`);
    const blob = await downloadRes.blob();
    const fileObj = new File([blob], file.name, { type: mime });

    const uploadRes = await chatApi.uploadFile(fileObj);
    const chatUrl = chatApi.filePreviewUrl(uploadRes.url);

    addPendingFile({
      id: `mat-${file.id}`,
      filename: file.name,
      url: chatUrl,
      mimeType: mime,
      size: blob.size,
    });
  }, [addPendingFile]);

  const handleAddToTask = useCallback(async (file: import("@/mocks/materialCenter").MaterialFile) => {
    const key = `add-to-task-mat-${file.id}`;
    try {
      message.loading({ content: `正在准备 "${file.name}"...`, key, duration: 0 });
      await prepareMaterialFileForChat(file);
      message.destroy(key);
      navigate('/chat');
    } catch (e) {
      message.error({ content: e instanceof Error ? e.message : '添加到任务失败', key });
    }
  }, [navigate, prepareMaterialFileForChat]);

  const isOutputsView = activeCategory === "platform-outputs" || activeCategory.startsWith("platform-outputs:");
  const fileTypeFilter = activeCategory.startsWith("platform-outputs:") ? activeCategory.split(":")[1] : undefined;

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name);
      if (sortKey === "size") return parseSizeToBytes(b.size) - parseSizeToBytes(a.size);
      return b.updatedAt.localeCompare(a.updatedAt);
    });
    return list;
  }, [filtered, sortKey]);

  const allSelected = sorted.length > 0 && selectedIds.length === sorted.length;
  const selectedFileCount = isOutputsView ? llmSelectedCount : selectedIds.length;

  const handleAddSelectedToDialog = useCallback(async () => {
    const files = sorted.filter((file) => selectedIds.includes(file.id));
    if (files.length === 0) {
      message.info("请先勾选要添加到对话中的文件");
      return;
    }

    const key = "add-selected-material-files";
    try {
      message.loading({ content: `正在添加 ${files.length} 个文件到对话中...`, key, duration: 0 });
      await Promise.all(files.map((file) => prepareMaterialFileForChat(file)));
      clearSelection();
      message.success({ content: `已添加 ${files.length} 个文件到对话中`, key, duration: 2 });
      navigate("/chat");
    } catch (e) {
      message.error({ content: e instanceof Error ? e.message : "批量添加到对话失败", key });
    }
  }, [clearSelection, navigate, prepareMaterialFileForChat, selectedIds, sorted]);

  if (loading) {
    return (
      <div className="migrated-page" style={{ ...pageShellStyle, alignItems: "center", justifyContent: "center" }}>
        <Spin tip={t("common.loading", "加载中...")} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="migrated-page" style={{ ...pageShellStyle, alignItems: "center", justifyContent: "center", gap: 12 }}>
        <p style={{ color: SYS.textSub, margin: 0 }}>{error}</p>
        <button
          type="button"
          onClick={() => void reload()}
          style={{ padding: "8px 16px", background: SYS.primary, color: "#fff", border: "none", borderRadius: SYS.radiusSM, cursor: "pointer" }}
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="migrated-page" style={pageShellStyle}>
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 24px",
          background: SYS.bgCard,
          borderBottom: `1px solid ${SYS.borderBase}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13, color: SYS.textMuted }}>{t("nav.workbench", "岗位工作台")}</span>
          <i className="ri-arrow-right-s-line" style={{ fontSize: 14, color: SYS.textMuted }} />
          <span style={{ fontSize: 16, fontWeight: 600, color: SYS.textMain }}>
            {t("nav.materialCenter", "我的文件")}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={() => {
              if (selectedFileCount === 0) {
                message.info("请先勾选要添加到对话中的文件");
                return;
              }
              if (isOutputsView) {
                setLlmAddSelectedRequest((v) => v + 1);
              } else {
                void handleAddSelectedToDialog();
              }
            }}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "7px 16px",
              background: SYS.primary,
              color: "#fff",
              border: "none",
              borderRadius: SYS.radiusSM,
              fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
              boxShadow: "0 2px 8px rgba(59,130,246,0.25)",
              transition: "background 0.2s, color 0.2s, box-shadow 0.2s",
            }}
          >
            {selectedFileCount > 0 && (
              <span style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 18, height: 18, borderRadius: 999,
                background: "rgba(255,255,255,0.28)", fontSize: 11, fontWeight: 700, lineHeight: 1,
              }}>
                {selectedFileCount}
              </span>
            )}
            <i className="ri-chat-upload-line" style={{ fontSize: 14 }} />
            添加到对话中
          </button>
          <button
            type="button"
            onClick={() => setShowUpload(true)}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "7px 16px",
              background: SYS.primary, color: "#fff", border: "none", borderRadius: SYS.radiusSM,
              fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            <i className="ri-upload-cloud-2-line" style={{ fontSize: 14 }} />
            {t("materialCenter.upload", "上传素材")}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
        <MaterialSidebar
          materialCategories={sidebarCategories}
          activeCategory={activeCategory}
          onSelect={setActiveCategory}
          businessCategories={businessCategories}
          onAddBusiness={handleAddBusiness}
          onDeleteBusiness={handleDeleteBusiness}
          totalBytes={totalBytes}
          llmOutputCount={llmOutputCount}
          llmOutputTypeCounts={llmOutputTypeCounts}
        />

        {/* 平台产出物视图 */}
        {isOutputsView ? (
          <LlmOutputsPanel
            viewMode={viewMode}
            fileTypeFilter={fileTypeFilter}
            addSelectedRequest={llmAddSelectedRequest}
            onSelectionCountChange={setLlmSelectedCount}
          />
        ) : null}

        <main style={{ flex: 1, minWidth: 0, display: isOutputsView ? "none" : "flex", flexDirection: "column", overflow: "hidden" }}>
          <div
            style={{
              flexShrink: 0, display: "flex", alignItems: "center", gap: 10,
              padding: "10px 20px", background: SYS.bgCard, borderBottom: `1px solid ${SYS.borderBase}`,
            }}
          >
            <div
              style={{
                display: "flex", alignItems: "center", gap: 6, width: 240,
                background: "#f8fafc", border: `1px solid ${SYS.borderBase}`,
                borderRadius: SYS.radiusSM, padding: "5px 10px",
              }}
            >
              <i className="ri-search-line" style={{ fontSize: 13, color: SYS.textMuted }} />
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder={t("materialCenter.searchPlaceholder", "搜索文件名...")}
                style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 12, color: SYS.textSub, fontFamily: SYS.fontFamily }}
              />
              {searchText && (
                <button type="button" onClick={() => setSearchText("")} style={{ background: "none", border: "none", cursor: "pointer", color: SYS.textMuted }}>
                  <i className="ri-close-line" style={{ fontSize: 13 }} />
                </button>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 12, color: SYS.textMuted }}>排序：</span>
              {([["updatedAt", "最近更新"], ["name", "文件名"], ["size", "文件大小"]] as [SortKey, string][]).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSortKey(key)}
                  style={{
                    padding: "3px 10px", borderRadius: SYS.radiusSM, fontSize: 12, border: "none", cursor: "pointer",
                    background: sortKey === key ? "#eff6ff" : "transparent",
                    color: sortKey === key ? SYS.primary : SYS.textSub,
                    fontWeight: sortKey === key ? 600 : 400, fontFamily: SYS.fontFamily,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <div style={{ flex: 1 }} />

            {selectedIds.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: SYS.primary, fontWeight: 500 }}>已选 {selectedIds.length} 个</span>
                <button
                  type="button"
                  onClick={() => void handleDeleteSelected()}
                  style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 10px", fontSize: 12, background: "#fef2f2", color: "#ef4444", border: "1px solid #fca5a5", borderRadius: SYS.radiusSM, cursor: "pointer" }}
                >
                  <i className="ri-delete-bin-line" />批量删除
                </button>
                <button
                  type="button"
                  onClick={() => void handleDownloadSelected()}
                  style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 10px", fontSize: 12, background: "#f8fafc", color: SYS.textSub, border: `1px solid ${SYS.borderBase}`, borderRadius: SYS.radiusSM, cursor: "pointer" }}
                >
                  <i className="ri-download-line" />批量下载
                </button>
                <button
                  type="button"
                  onClick={() => clearSelection()}
                  style={{ padding: "3px 10px", fontSize: 12, background: "transparent", color: SYS.textSub, border: "none", cursor: "pointer" }}
                >
                  取消选择
                </button>
              </div>
            )}

            <div style={{ display: "flex", background: "#f1f5f9", borderRadius: SYS.radiusSM, padding: 3, gap: 2 }}>
              {(["grid", "list"] as ViewMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setViewMode(m)}
                  style={{
                    width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
                    borderRadius: 6, border: "none", cursor: "pointer",
                    background: viewMode === m ? SYS.bgCard : "transparent",
                    color: viewMode === m ? SYS.primary : SYS.textMuted,
                  }}
                >
                  <i className={m === "grid" ? "ri-grid-fill" : "ri-list-unordered"} style={{ fontSize: 14 }} />
                </button>
              ))}
            </div>
          </div>

          {viewMode === "list" && (
            <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 16, padding: "8px 16px", background: "#f8fafc", borderBottom: `1px solid ${SYS.borderLight}` }}>
              <button
                type="button"
                onClick={() => (allSelected ? clearSelection() : selectAll(sorted.map((f) => f.id)))}
                style={{
                  width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${allSelected ? SYS.primary : "#94a3b8"}`,
                  background: allSelected ? SYS.primary : "#fff", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: allSelected ? "0 0 0 2px rgba(59,130,246,0.14)" : "0 1px 2px rgba(15,23,42,0.10)",
                }}
              >
                {allSelected && <i className="ri-check-line" style={{ fontSize: 10, color: "#fff" }} />}
              </button>
              <div style={{ width: 40 }} />
              <span style={{ flex: 1, fontSize: 11, color: SYS.textMuted, fontWeight: 500 }}>文件名</span>
              <span style={{ fontSize: 11, color: SYS.textMuted, width: 64, textAlign: "right" }}>大小</span>
              <span style={{ fontSize: 11, color: SYS.textMuted, width: 112, textAlign: "right" }}>上传时间</span>
              <div style={{ width: 84 }} />
            </div>
          )}

          <div className="migrated-scroll" style={{ flex: 1, padding: "16px 20px" }}>
            {sorted.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 256, gap: 12, color: SYS.textMuted }}>
                <i className="ri-folder-open-line" style={{ fontSize: 48 }} />
                <p style={{ fontSize: 13, margin: 0 }}>没有找到匹配的文件</p>
              </div>
            ) : viewMode === "grid" ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
                {sorted.map((file) => (
                  <MaterialFileCard
                    key={file.id}
                    file={file}
                    viewMode="grid"
                    selected={selectedIds.includes(file.id)}
                    onSelect={toggleSelect}
                    onPreview={setPreviewFile}
                    onDownload={handleDownload}
                    onAddToTask={handleAddToTask}
                  />
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {sorted.map((file) => (
                  <MaterialFileCard
                    key={file.id}
                    file={file}
                    viewMode="list"
                    selected={selectedIds.includes(file.id)}
                    onSelect={toggleSelect}
                    onPreview={setPreviewFile}
                    onDownload={handleDownload}
                    onAddToTask={handleAddToTask}
                  />
                ))}
              </div>
            )}
          </div>

        </main>
      </div>

      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onUpload={handleUpload}
          businessCategories={businessCategories}
        />
      )}
      {previewFile && (
        <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} onDownload={handleDownload} />
      )}

    </div>
  );
}
