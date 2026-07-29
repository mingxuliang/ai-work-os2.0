import React, { useMemo, useState, useRef, useCallback, useEffect } from "react";
import {
  ToolCall,
  useProviderContext,
} from "@agentscope-ai/chat";
import { SparkLoadingLine, SparkToolLine, SparkCopyLine, SparkTrueLine, SparkDownloadLine } from "@agentscope-ai/icons";
import { CodeBlock, IconButton } from "@agentscope-ai/design";
import { copyText, toDisplayUrl } from "../utils";
import { Space } from "antd";


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FileInfo {
  url: string;
  name: string;
  size?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Try to extract file info from various output structures. */
function extractFilesFromOutput(output: unknown): FileInfo[] {
  if (!output) return [];

  // During SSE streaming the tool output is often a JSON string rather than
  // a parsed object.  Parse it first so the same extraction logic handles
  // both streaming and history (which returns a pre-parsed object).
  let parsed: unknown = output;
  if (typeof output === "string") {
    try {
      parsed = JSON.parse(output);
    } catch {
      // Not valid JSON — maybe it's a plain-text URL
      if (
        output.startsWith("http://") ||
        output.startsWith("https://") ||
        output.startsWith("/")
      ) {
        return [{ url: output, name: "file" }];
      }
      return [];
    }
  }

  // After (optional) parse, we need an object to look for known fields
  if (!parsed || typeof parsed !== "object") return [];

  // Case 0: parsed is an array of content items (common AgentScope tool output format)
  // Each item has {type, source?, filename?, text?} shape
  if (Array.isArray(parsed)) {
    return (parsed as unknown[]).flatMap((item): FileInfo[] => {
      if (!item || typeof item !== "object") return [];
      const entry = item as Record<string, unknown>;

      // Content-item format: {type: "file"|"data", source: {type: "url", url: "..."}, filename/name: "..."}
      // AgentScope 2.x send_file_to_user returns DataBlock (type: "data"), not type: "file".
      if (entry.type === "file" || entry.type === "data") {
        const source = entry.source as Record<string, unknown> | undefined;
        const url = (typeof source?.url === "string" && source.url) ||
                    (typeof entry.url === "string" && entry.url) ||
                    (typeof entry.file_url === "string" && entry.file_url) ||
                    "";
        if (!url && entry.type === "data") return [];
        const name = (entry.filename as string) ||
                     (entry.file_name as string) ||
                     (entry.name as string) ||
                     "file";
        const size = typeof entry.file_size === "number" ? entry.file_size : undefined;
        return [{ url, name, size }];
      }

      // Recurse for nested structures (e.g. string JSON)
      return extractFilesFromOutput(item);
    });
  }

  const out = parsed as Record<string, unknown>;

  // Case 1: output has a flat file_url + file_name
  if (typeof out.file_url === "string" && out.file_url) {
    return [
      {
        url: out.file_url,
        name: (out.file_name as string) || (out.filename as string) || "file",
        size: typeof out.file_size === "number" ? out.file_size : undefined,
      },
    ];
  }

  // Case 2: output has url + name (alternative field names)
  if (typeof out.url === "string" && out.url && !out.file_url) {
    return [
      {
        url: out.url,
        name: (out.name as string) || (out.file_name as string) || "file",
        size: typeof out.size === "number" ? out.size : undefined,
      },
    ];
  }

  // Case 3: output has a files array — each entry may itself be a JSON string
  if (Array.isArray(out.files)) {
    return (out.files as unknown[]).flatMap((f): FileInfo[] => {
      // Recurse: each entry might be a string, object, etc.
      return extractFilesFromOutput(f);
    });
  }

  // Case 4: output is the file info itself (no wrapper) — check for
  //         fields that look like file metadata and treat it as one file
  if (typeof out.file_name === "string" || typeof out.filename === "string") {
    const name = (out.file_name as string) || (out.filename as string) || "file";
    // Might have a url / file_url field, or might be missing the URL entirely
    const url =
      (typeof out.file_url === "string" && out.file_url) ||
      (typeof out.url === "string" && out.url) ||
      "";
    return [{ url, name, size: typeof out.file_size === "number" ? out.file_size : undefined }];
  }

  return [];
}

// ---------------------------------------------------------------------------
// File size formatter
// ---------------------------------------------------------------------------

function formatFileSize(bytes?: number): string {
  if (bytes === undefined || bytes === null) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

// ---------------------------------------------------------------------------
// File extension → colour mapping (matches the library's FileCard)
// ---------------------------------------------------------------------------

function getFileColor(ext: string): string {
  const map: Record<string, string> = {
    pdf: "#ff4d4f",
    xlsx: "#22b35e", xls: "#22b35e",
    ppt: "#ff6e31", pptx: "#ff6e31",
    doc: "#1677ff", docx: "#1677ff",
    md: "#8c8c8c", mdx: "#8c8c8c",
    zip: "#fab714", rar: "#fab714", "7z": "#fab714", tar: "#fab714", gz: "#fab714",
    mp4: "#ff4d4f", avi: "#ff4d4f", mov: "#ff4d4f", wmv: "#ff4d4f", flv: "#ff4d4f", mkv: "#ff4d4f",
    mp3: "#8c8c8c", wav: "#8c8c8c", flac: "#8c8c8c", ape: "#8c8c8c", aac: "#8c8c8c", ogg: "#8c8c8c",
  };
  return map[ext.toLowerCase()] || "#8c8c8c";
}

// ---------------------------------------------------------------------------
// ToolCallBlock — matches the look of ToolCall's internal Block
// ---------------------------------------------------------------------------

const ToolCallBlock: React.FC<{
  title: string;
  content: string | Record<string, unknown>;
  expandEnabled?: boolean;
  language?: "json" | "text";
}> = ({ title, content, expandEnabled = false, language = "json" }) => {
  const { getPrefixCls } = useProviderContext();
  const prefixCls = getPrefixCls("operate-card");
  const contentString =
    typeof content === "string" ? content : JSON.stringify(content);
  const [expanded, setExpanded] = useState(!expandEnabled);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = async () => {
    try {
      await copyText(contentString);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      console.warn("Copy failed");
    }
  };

  return (
    <div className={`${prefixCls}-tool-call-block`}>
      <div
        className={`${prefixCls}-tool-call-block-header`}
        onClick={() => {
          if (expandEnabled) setExpanded((prev) => !prev);
        }}
        style={{ cursor: expandEnabled ? "pointer" : "default" }}
      >
        <span className={`${prefixCls}-tool-call-block-title`}>{title}</span>
        <div
          className={`${prefixCls}-tool-call-block-extra`}
          onClick={(e) => e.stopPropagation()}
        >
          <IconButton
            size="small"
            style={{ marginRight: "-6px" }}
            icon={copied ? <SparkTrueLine /> : <SparkCopyLine />}
            bordered={false}
            onClick={handleCopy}
          />
        </div>
      </div>
      {expanded && (
        <div className={`${prefixCls}-tool-call-block-content`}>
          <CodeBlock
            language={language}
            value={contentString}
            readOnly
            basicSetup={{ lineNumbers: false, foldGutter: false }}
          />
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// FileDownloadCard — custom file card that does NOT rely on window.open
// ---------------------------------------------------------------------------

/**
 * A standalone file card with a visible download button.
 *
 * Uses a temporary `<a>` element for the download action instead of
 * `window.open`, which can be blocked by popup blockers for cross-origin
 * URLs (e.g. MinIO presigned URLs) during streaming re-renders.
 */
const FileDownloadCard: React.FC<{ file: FileInfo; loading?: boolean }> = ({ file, loading }) => {
  const ext = file.name.includes(".")
    ? file.name.split(".").pop() || ""
    : "";
  const color = ext ? getFileColor(ext) : "#8c8c8c";
  const displayName = file.name || "file";
  const cardRef = useRef<HTMLDivElement>(null);

  // Use a native DOM event listener to bypass React's synthetic event system,
  // which may not properly attach handlers during streaming re-renders.
  useEffect(() => {
    const el = cardRef.current;
    if (!el || !file.url) return;

    const handler = (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

      let safeUrl: string;
      try {
        const parsed = new URL(file.url);
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
          console.warn("Blocked unsafe file URL protocol:", parsed.protocol);
          return;
        }
        safeUrl = file.url;
      } catch {
        if (file.url.startsWith("javascript:") || file.url.startsWith("data:")) {
          return;
        }
        safeUrl = file.url;
      }

      const newWindow = window.open(safeUrl, "_blank", "noopener,noreferrer");
      if (!newWindow) {
        const a = document.createElement("a");
        a.href = safeUrl;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        if (file.name) a.download = file.name;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => document.body.removeChild(a), 150);
      }
    };

    el.addEventListener("click", handler);
    return () => {
      el.removeEventListener("click", handler);
    };
  }, [file.url, file.name]);

  const handleDownload = useCallback(() => {
    // React synthetic handler as fallback — but native handler should handle it
  }, []);

  return (
    <div
      ref={cardRef}
      onClick={file.url ? handleDownload : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        border: "1px solid var(--ant-color-border-secondary, #d9d9d9)",
        borderRadius: 8,
        background: "var(--ant-color-bg-container, #fff)",
        cursor: file.url ? "pointer" : "default",
      }}
    >
      {/* File icon */}
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 6,
          background: color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontSize: 13,
          fontWeight: 600,
          flexShrink: 0,
          textTransform: "uppercase",
        }}
      >
        {ext.slice(0, 3) || "?"}
      </div>

      {/* File name & size */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {displayName}
        </div>
        {file.size !== undefined && (
          <div
            style={{
              fontSize: 12,
              color: "var(--ant-color-text-tertiary, #999)",
            }}
          >
            {formatFileSize(file.size)}
          </div>
        )}
        {loading && (
          <div style={{ fontSize: 12, color: "#1677ff" }}>Generating…</div>
        )}
      </div>

      {/* Download button */}
      {file.url ? (
        <IconButton
          size="small"
          icon={<SparkDownloadLine />}
          bordered={false}
          title="Download"
          style={{ flexShrink: 0 }}
        />
      ) : loading ? (
        <SparkLoadingLine spin style={{ fontSize: 14, flexShrink: 0 }} />
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Custom renderer for the `send_file_to_user` tool.
 *
 * When the tool output contains file information (file_url, files array, etc.),
 * this renderer displays the files as clickable download cards instead of raw
 * JSON text — matching the file attachment UX used elsewhere in the chat.
 *
 * Falls back to the default ToolCall rendering when no files are detected.
 */
const SendFileToUserRenderer: React.FC<{ data: Record<string, unknown> }> = ({
  data,
}) => {
  const content = data.content as Array<{
    type?: string;
    data?: {
      name?: string;
      arguments?: Record<string, unknown>;
      output?: unknown;
    };
    file_url?: string;
    file_name?: string;
    fileName?: string;
    file_size?: number;
  }>;

  const toolName = content?.[0]?.data?.name || "send_file_to_user";
  const toolInput = content?.[0]?.data?.arguments;
  const loading =
    (data.status as string) === "in_progress" ||
    (data.status as string) === "created";

  // Try to extract files from multiple possible locations in the data structure
  const files = useMemo(() => {
    // 1) Standard path: content[1].data.output (merged tool message)
    const toolOutput = content?.[1]?.data?.output;
    const fromOutput = extractFilesFromOutput(toolOutput);
    if (fromOutput.length > 0) return fromOutput;

    // 2) Scan all content items for file data (any item might carry output)
    for (const item of content) {
      if (!item) continue;
      // Check if item.data.output contains file info
      const fromItemOutput = extractFilesFromOutput(item.data?.output);
      if (fromItemOutput.length > 0) return fromItemOutput;
      // Check if the item's data itself is file info
      const fromItemData = extractFilesFromOutput(item.data as unknown);
      if (fromItemData.length > 0) return fromItemData;
    }

    // 3) Check for FILE/DATA-type content items (Message path fallback)
    for (const item of content as Array<Record<string, unknown>>) {
      if (item?.type === "file" || item?.type === "data") {
        const source = item.source as Record<string, unknown> | undefined;
        const url =
          (typeof item.file_url === "string" && item.file_url) ||
          (typeof source?.url === "string" && source.url) ||
          (typeof item.url === "string" && item.url) ||
          "";
        const name =
          (typeof item.file_name === "string" && item.file_name) ||
          (typeof item.fileName === "string" && item.fileName) ||
          (typeof item.name === "string" && item.name) ||
          "file";
        const size = typeof item.file_size === "number" ? item.file_size : undefined;
        if (url) return [{ url, name, size }];
        if (item?.type === "file") return [{ url: "", name, size }];
      }
    }

    return [];
  }, [content]);

  const fileCards = useMemo(() => {
    const inputPath =
      typeof toolInput?.file_path === "string" ? toolInput.file_path : "";
    const fallbackName = (() => {
      const candidate = inputPath || files.find((f) => f.url)?.url || "";
      try {
        const decoded = decodeURIComponent(candidate);
        return decoded.split(/[\\/]/).filter(Boolean).pop() || "file";
      } catch {
        return candidate.split(/[\\/]/).filter(Boolean).pop() || "file";
      }
    })();

    return files.map((f, idx) => {
      const name = !f.name || f.name === "file" ? fallbackName : f.name;
      return {
        id: `${f.url}-${name}-${idx}`,
        url: toDisplayUrl(f.url),
        name,
        size: f.size,
      };
    });
  }, [files, toolInput]);

  const hasFiles = fileCards.length > 0;


  // When no files are found, fall back to the default ToolCall rendering
  if (!hasFiles) {
    return (
      <ToolCall
        loading={loading}
        defaultOpen={false}
        title={toolName}
        input={toolInput ?? {}}
        output={content?.[1]?.data?.output ?? (loading ? "Generating…" : "")}
      />
    );
  }

  // When files are present, render them as clickable cards directly
  // (without OperateCard) to avoid any click-blocking during streaming.
  return (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          border: "1px solid var(--ant-color-border-secondary, #d9d9d9)",
          borderBottom: "none",
          borderRadius: "8px 8px 0 0",
          background: "var(--ant-color-bg-container, #fff)",
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        {loading ? <SparkLoadingLine spin /> : <SparkToolLine />}
        <span>{toolName}</span>
      </div>
      <div
        style={{
          padding: "12px",
          border: "1px solid var(--ant-color-border-secondary, #d9d9d9)",
          borderTop: "none",
          borderRadius: "0 0 8px 8px",
          background: "var(--ant-color-bg-container, #fff)",
        }}
      >
        <ToolCallBlock title="Input" content={toolInput ?? {}} />
        <div style={{ marginTop: 8 }}>
          <ToolCallBlock
            title="Output (Files)"
            content={
              files.length === 1
                ? `File: ${files[0].name}`
                : `${files.length} files`
            }
            language="text"
          />
          <Space
            direction="vertical"
            size={8}
            style={{ width: "100%", marginTop: 12 }}
          >
            {fileCards.map((file) => (
              <FileDownloadCard
                key={file.id}
                file={file}
                loading={loading}
              />
            ))}
          </Space>
        </div>
      </div>
    </div>
  );
};

export default SendFileToUserRenderer;
