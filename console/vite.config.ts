/// <reference types="vitest" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { compression } from "vite-plugin-compression2";
import path from "path";
import type { ServerResponse } from "http";
import { rssProxyPlugin } from "./vite-plugin-rss-proxy";

// Vitest plugin: transforms .css imports inside node_modules to empty stubs.
// This prevents errors from packages like @agentscope-ai/icons that import CSS.
const cssStubPlugin = {
  name: "css-stub",
  transform(_code: string, id: string) {
    if (id.includes("node_modules") && id.endsWith(".css")) {
      return { code: "export default {}" };
    }
  },
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // Empty + dev: same-origin /api with proxy to VITE_DEV_API_PROXY_TARGET (no CORS setup).
  // Non-empty: browser calls that origin (set QWENPAW_CORS_ORIGINS on backend if needed).
  const apiBaseUrl = env.VITE_API_BASE_URL ?? "";
  // When VITE_API_BASE_URL is empty, API calls hit the dev server as /api/... .
  // Proxy to the real backend so the browser stays same-origin (no CORS; backend
  // does not enable CORSMiddleware unless QWENPAW_CORS_ORIGINS is set).
  const devApiProxyTarget =
    env.VITE_DEV_API_PROXY_TARGET || "http://127.0.0.1:8088";

  return {
    define: {
      VITE_API_BASE_URL: JSON.stringify(apiBaseUrl),
      TOKEN: JSON.stringify(env.TOKEN || ""),
      MOBILE: false,
    },
    plugins: [
      react(),
      cssStubPlugin,
      ...(mode === "development" ? [rssProxyPlugin()] : []),
      ...(mode === "production"
        ? [
            compression({ algorithms: ["gzip"], exclude: [/\.(br)$/, /\.(gz)$/] }),
            compression({ algorithms: ["brotliCompress"], exclude: [/\.(br)$/, /\.(gz)$/] }),
          ]
        : []),
    ],
    css: {
      modules: {
        localsConvention: "camelCase",
        generateScopedName: "[name]__[local]__[hash:base64:5]",
      },
      preprocessorOptions: {
        less: {
          javascriptEnabled: true,
        },
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        // Force single copies so nested deps (@agentscope-ai/chat →
        // use-context-selector) don't get a broken/empty scheduler or a
        // second React instance (runtime: "X is not a function").
        react: path.resolve(__dirname, "node_modules/react"),
        "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
        "react/jsx-runtime": path.resolve(
          __dirname,
          "node_modules/react/jsx-runtime.js",
        ),
        "react/jsx-dev-runtime": path.resolve(
          __dirname,
          "node_modules/react/jsx-dev-runtime.js",
        ),
        scheduler: path.resolve(__dirname, "node_modules/scheduler"),
      },
      dedupe: ["react", "react-dom", "scheduler"],
    },
    server: {
      host: "0.0.0.0",
      port: 5173,
      headers: {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "SAMEORIGIN",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
      },
      ...(mode === "development" && !apiBaseUrl
        ? {
            proxy: {
              // 本地后端（认证、聊天、Agent 等所有内部 API）
              "/api": {
                target: devApiProxyTarget,
                changeOrigin: true,
                configure(proxy) {
                  proxy.on("error", (err, _req, res) => {
                    const r = res as ServerResponse | undefined;
                    if (
                      r &&
                      typeof r.writeHead === "function" &&
                      !r.headersSent
                    ) {
                      const msg =
                        err instanceof Error ? err.message : String(err);
                      r.writeHead(502, {
                        "Content-Type": "application/json",
                      });
                      r.end(
                        JSON.stringify({
                          detail: `Development proxy cannot reach backend at ${devApiProxyTarget}. Start the QwenPaw server or set VITE_DEV_API_PROXY_TARGET in .env.development. (${msg})`,
                        }),
                      );
                    }
                  });
                },
              },
            },
          }
        : {}),
    },
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      css: true,
      // all @agentscope-ai/* packages excluded from inline — they are large / have CSS imports
      // aliases below redirect each to a stub or compiled entry
      deps: {
        inline: [/@agentscope-ai\/(?!icons|chat|design)/],
      },
      alias: {
        // chat is aliased to a tiny stub to avoid OOM from the 2.3MB real package
        // Tests that need specific behavior override with vi.mock('@agentscope-ai/chat', factory)
        "@agentscope-ai/chat": path.resolve(__dirname, "src/test/chat-mock.ts"),
        // design is aliased to a stub to avoid hanging from its 3MB lib
        "@agentscope-ai/design": path.resolve(
          __dirname,
          "src/test/design-mock.ts",
        ),
        "@agentscope-ai/icons": path.resolve(
          __dirname,
          "src/test/icons-mock.ts",
        ),
      },
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        // 旧测试用 node:test，与 vitest 不兼容，待迁移
        "**/testConnectionMessage.test.ts",
        // ChatPage test causes worker crash - pre-existing issue, needs more mock setup
        "**/pages/Chat/ChatPage.test.tsx",
      ],
      coverage: {
        provider: "v8",
        reporter: ["text", "html", "json", "lcov"],
        include: ["src/**/*.{ts,tsx}"],
        exclude: [
          "src/test/**",
          "src/**/*.d.ts",
          "src/main.tsx",
          "src/vite-env.d.ts",
        ],
        // 第一阶段：记录基线，不强制卡点
        // 后续稳定后可开启：thresholds: { statements: 60, functions: 60 }
      },
    },
    optimizeDeps: {
      include: ["diff"],
    },
    build: {
      // Output to QwenPaw's console directory,
      // so we don't need to copy files manually after build.
      // outDir: path.resolve(__dirname, "../src/qwenpaw/console"),
      // emptyOutDir: true,
      cssCodeSplit: true,
      sourcemap: mode !== "production",
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            // React core — safe, no cycles with UI stack
            if (
              id.includes("node_modules/react/") ||
              id.includes("node_modules/react-dom/") ||
              id.includes("node_modules/react-router-dom/") ||
              id.includes("node_modules/scheduler/")
            ) {
              return "react-vendor";
            }

            // Charts / data-viz stay with UI stack — @ant-design/plots would
            // otherwise cycle with ui-vendor (antd / agentscope).
            // Document preview — only needed when user opens a doc
            if (
              id.includes("node_modules/docx-preview/") ||
              id.includes("node_modules/@aiden0z/pptx-renderer/")
            ) {
              return "docview-vendor";
            }

            // Animation & 3D (motion, ogl) — non-critical, load after main UI
            if (
              id.includes("node_modules/motion/") ||
              id.includes("node_modules/ogl/")
            ) {
              return "fx-vendor";
            }

            // UI stack MUST be one chunk. Splitting antd / @ant-design /
            // @agentscope-ai / markdown / mermaid / charts created circular
            // chunks; agentscope-chat then called createGlobalStyle before it
            // was initialized → runtime "Le is not a function" white screen.
            if (
              id.includes("node_modules/antd/") ||
              id.includes("node_modules/antd-style/") ||
              id.includes("node_modules/@ant-design/") ||
              id.includes("node_modules/rc-") ||
              id.includes("node_modules/@agentscope-ai/") ||
              id.includes("node_modules/react-markdown/") ||
              id.includes("node_modules/remark-gfm/") ||
              id.includes("node_modules/rehype") ||
              id.includes("node_modules/remark") ||
              id.includes("node_modules/unified/") ||
              id.includes("node_modules/mdast") ||
              id.includes("node_modules/hast") ||
              id.includes("node_modules/micromark") ||
              id.includes("node_modules/mermaid/") ||
              id.includes("node_modules/recharts/") ||
              id.includes("node_modules/d3") ||
              id.includes("node_modules/@visx/")
            ) {
              return "ui-vendor";
            }

            // i18n
            if (
              id.includes("node_modules/i18next/") ||
              id.includes("node_modules/react-i18next/")
            ) {
              return "i18n-vendor";
            }

            // Drag and drop
            if (id.includes("node_modules/@dnd-kit/")) {
              return "dnd-vendor";
            }

            // Utilities (dayjs, zustand, ahooks, etc.)
            if (
              id.includes("node_modules/dayjs/") ||
              id.includes("node_modules/zustand/") ||
              id.includes("node_modules/ahooks/") ||
              id.includes("node_modules/@vvo/tzdb/") ||
              id.includes("node_modules/lucide-react/")
            ) {
              return "utils-vendor";
            }
          },
        },
      },
    },
  };
});
