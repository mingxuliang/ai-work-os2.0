import { Layout, Menu, Button, Tooltip, type MenuProps } from "antd";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useIsAdmin } from "../hooks/useCurrentUserRoles";
import {
  SparkWifiLine,
  SparkUserGroupLine,
  SparkDateLine,
  SparkVoiceChat01Line,
  SparkMagicWandLine,
  SparkLocalFileLine,
  SparkModePlazaLine,
  SparkInternetLine,
  SparkModifyLine,
  SparkBrowseLine,
  SparkMcpMcpLine,
  SparkScanLine,
  SparkToolLine,
  SparkMicLine,
  SparkAgentLine,
  SparkSearchUserLine,
  SparkMenuExpandLine,
  SparkMenuFoldLine,
  SparkOtherLine,
  SparkBarChartLine,
  SparkDebugLine,
  SparkSaveLine,
  SparkAdvancedMonitoringLine,
} from "@agentscope-ai/icons";
import { usePlugins } from "../plugins/PluginContext";
import styles from "./index.module.less";
import { useTheme } from "../contexts/ThemeContext";
import { KEY_TO_PATH, DEFAULT_OPEN_KEYS, HIDDEN_NAV_KEYS } from "./constants";
import { Bot } from "lucide-react";

const ADMIN_ONLY_NAV_KEYS = new Set([
  "acp",
  "agent-config",
  "agent-stats",
  "users",
  "org-builder",
  "environments",
  "security",
  "voice-transcription",
  "backups",
  "debug",
]);

// ── Layout ────────────────────────────────────────────────────────────────

const { Sider } = Layout;

// ── Types ─────────────────────────────────────────────────────────────────

interface SidebarProps {
  selectedKey: string;
}

function filterMenuItems(
  items: MenuProps["items"],
  hidden: Set<string>,
): NonNullable<MenuProps["items"]> {
  if (!items) return [];
  return items
    .filter((item) => item && "key" in item && !hidden.has(String(item.key)))
    .map((item) => {
      if (!item || !("children" in item) || !item.children) return item;
      return {
        ...item,
        children: filterMenuItems(item.children, hidden),
      };
    }) as NonNullable<MenuProps["items"]>;
}

// ── Sidebar ───────────────────────────────────────────────────────────────

export default function Sidebar({ selectedKey }: SidebarProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const { pluginRoutes } = usePlugins();
  const [collapsed, setCollapsed] = useState(false);
  const isAdmin = useIsAdmin();
  const hiddenNavKeys = new Set([
    ...HIDDEN_NAV_KEYS,
    ...(!isAdmin ? ADMIN_ONLY_NAV_KEYS : []),
  ]);

  // ── Collapsed nav items (all leaf pages) ──────────────────────────────

  const collapsedNavItems = [
    {
      key: "workbench",
      icon: <SparkAdvancedMonitoringLine size={18} />,
      path: "/workbench",
      label: t("nav.workbench", "岗位工作台"),
    },
    {
      key: "chat",
      icon: <Bot size={18} strokeWidth={1.85} aria-hidden />,
      path: "/chat",
      label: t("nav.chat"),
    },
    {
      key: "my-team",
      icon: <SparkUserGroupLine size={18} />,
      path: "/my-team",
      label: t("nav.myTeam", "我的AI团队"),
    },
    {
      key: "material-center",
      icon: <SparkBrowseLine size={18} />,
      path: "/material-center",
      label: t("nav.materialCenter", "我的文件"),
    },
    {
      key: "org-chart",
      icon: <SparkSearchUserLine size={18} />,
      path: "/org-chart",
      label: t("nav.orgChart", "AI数字化看板"),
    },
    {
      key: "channels",
      icon: <SparkWifiLine size={18} />,
      path: "/channels",
      label: t("nav.channels"),
    },
    {
      key: "sessions",
      icon: <SparkUserGroupLine size={18} />,
      path: "/sessions",
      label: t("nav.sessions"),
    },
    {
      key: "cron-jobs",
      icon: <SparkDateLine size={18} />,
      path: "/cron-jobs",
      label: t("nav.cronJobs"),
    },
    {
      key: "heartbeat",
      icon: <SparkVoiceChat01Line size={18} />,
      path: "/heartbeat",
      label: t("nav.heartbeat"),
    },
    {
      key: "skills",
      icon: <SparkMagicWandLine size={18} />,
      path: "/skills",
      label: t("nav.skills"),
    },
    {
      key: "skill-pool",
      icon: <SparkOtherLine size={18} />,
      path: "/skill-pool",
      label: t("nav.skillPool", "Skill Pool"),
    },
    {
      key: "skill-store",
      icon: <SparkMagicWandLine size={18} />,
      path: "/skill-store",
      label: t("nav.skillStore", "Skills 商店"),
    },
    {
      key: "tools",
      icon: <SparkToolLine size={18} />,
      path: "/tools",
      label: t("nav.tools"),
    },
    {
      key: "mcp",
      icon: <SparkMcpMcpLine size={18} />,
      path: "/mcp",
      label: t("nav.mcp"),
    },
    {
      key: "acp",
      icon: <SparkScanLine size={18} />,
      path: "/acp",
      label: t("nav.acp"),
    },
    {
      key: "agent-config",
      icon: <SparkModifyLine size={18} />,
      path: "/agent-config",
      label: t("nav.agentConfig"),
    },
    {
      key: "agent-stats",
      icon: <SparkBarChartLine size={18} />,
      path: "/agent-stats",
      label: t("nav.agentStats"),
    },
    {
      key: "agents",
      icon: <SparkAgentLine size={18} />,
      path: "/agents",
      label: t("nav.agents"),
    },
    {
      key: "models",
      icon: <SparkModePlazaLine size={18} />,
      path: "/models",
      label: t("nav.models"),
    },
    {
      key: "environments",
      icon: <SparkInternetLine size={18} />,
      path: "/environments",
      label: t("nav.environments"),
    },
    {
      key: "security",
      icon: <SparkBrowseLine size={18} />,
      path: "/security",
      label: t("nav.security"),
    },
    {
      key: "backups",
      icon: <SparkSaveLine size={18} />,
      path: "/backups",
      label: t("nav.backups"),
    },
    {
      key: "voice-transcription",
      icon: <SparkMicLine size={18} />,
      path: "/voice-transcription",
      label: t("nav.voiceTranscription"),
    },
    {
      key: "users",
      icon: <SparkUserGroupLine size={18} />,
      path: "/users",
      label: t("nav.users", "用户管理"),
    },
    {
      key: "org-builder",
      icon: <SparkModifyLine size={18} />,
      path: "/org-builder",
      label: t("nav.orgBuilder", "组织架构"),
    },
    {
      key: "debug",
      icon: <SparkDebugLine size={18} />,
      path: "/debug",
      label: t("nav.debug", "Debug"),
    },
    // Append plugin nav items dynamically
    ...pluginRoutes.map((route) => ({
      key: route.path.replace(/^\//, ""),
      icon: <span style={{ fontSize: 18 }}>{route.icon}</span>,
      path: route.path,
      label: route.label,
    })),
  ].filter((item) => !hiddenNavKeys.has(item.key));

  // ── Menu items — agent-scoped (Chat + Control + Workspace) ──────────────

  const agentMenuItems: MenuProps["items"] = filterMenuItems(
    [
    {
      key: "workbench",
      label: collapsed ? null : t("nav.workbench", "岗位工作台"),
      icon: <SparkAdvancedMonitoringLine size={16} />,
    },
    {
      key: "news",
      label: collapsed ? null : t("nav.news", "新闻中心"),
      icon: <SparkBarChartLine size={16} />,
    },
    {
      key: "knowledge-base",
      label: collapsed ? null : t("nav.knowledgeBase", "知识库"),
      icon: <SparkBrowseLine size={16} />,
    },
    {
      key: "org-chart",
      label: collapsed ? null : t("nav.orgChart", "AI数字化看板"),
      icon: <SparkSearchUserLine size={16} />,
    },
    {
      key: "ai-okr",
      label: collapsed ? null : t("nav.aiOkr", "AI-OKR 考核"),
      icon: <SparkBarChartLine size={16} />,
    },
    {
      key: "chat",
      label: collapsed ? null : t("nav.chat"),
      icon: <Bot size={16} strokeWidth={1.85} aria-hidden />,
    },
    {
      key: "my-team",
      label: collapsed ? null : t("nav.myTeam", "我的AI团队"),
      icon: <SparkUserGroupLine size={16} />,
    },
    {
      key: "material-center",
      label: collapsed ? null : t("nav.materialCenter", "我的文件"),
      icon: <SparkBrowseLine size={16} />,
    },
    {
      key: "control-group",
      label: collapsed ? null : t("nav.control"),
      children: [
        {
          key: "channels",
          label: collapsed ? null : t("nav.channels"),
          icon: <SparkWifiLine size={16} />,
        },
        {
          key: "sessions",
          label: collapsed ? null : t("nav.sessions"),
          icon: <SparkUserGroupLine size={16} />,
        },
        {
          key: "cron-jobs",
          label: collapsed ? null : t("nav.cronJobs"),
          icon: <SparkDateLine size={16} />,
        },
        {
          key: "heartbeat",
          label: collapsed ? null : t("nav.heartbeat"),
          icon: <SparkVoiceChat01Line size={16} />,
        },
      ],
    },
    {
      key: "agent-group",
      label: collapsed ? null : t("nav.agent"),
      children: [
        {
          key: "workspace",
          label: collapsed ? null : t("nav.workspace"),
          icon: <SparkLocalFileLine size={16} />,
        },
        {
          key: "skills",
          label: collapsed ? null : t("nav.skills"),
          icon: <SparkMagicWandLine size={16} />,
        },
        {
          key: "tools",
          label: collapsed ? null : t("nav.tools"),
          icon: <SparkToolLine size={16} />,
        },
        {
          key: "mcp",
          label: collapsed ? null : t("nav.mcp"),
          icon: <SparkMcpMcpLine size={16} />,
        },
        {
          key: "acp",
          label: collapsed ? null : t("nav.acp"),
          icon: <SparkScanLine size={16} />,
        },
        {
          key: "agent-config",
          label: collapsed ? null : t("nav.agentConfig"),
          icon: <SparkModifyLine size={16} />,
        },
        {
          key: "agent-stats",
          label: collapsed ? null : t("nav.agentStats"),
          icon: <SparkBarChartLine size={16} />,
        },
      ],
    },
  ],
    hiddenNavKeys,
  );

  // ── Menu items — global settings ──────────────────────────────────────

  let settingsMenuItems: MenuProps["items"] = filterMenuItems(
    [
    {
      key: "settings-group",
      label: collapsed ? null : t("nav.settings"),
      children: [
        {
          key: "users",
          label: collapsed ? null : t("nav.users", "用户管理"),
          icon: <SparkUserGroupLine size={16} />,
        },
        {
          key: "org-builder",
          label: collapsed ? null : t("nav.orgBuilder", "组织架构"),
          icon: <SparkModifyLine size={16} />,
        },
        {
          key: "agents",
          label: collapsed ? null : t("nav.agents"),
          icon: <SparkAgentLine size={16} />,
        },
        {
          key: "models",
          label: collapsed ? null : t("nav.models"),
          icon: <SparkModePlazaLine size={16} />,
        },
        {
          key: "skill-pool",
          label: collapsed ? null : t("nav.skillPool", "Skill Pool"),
          icon: <SparkOtherLine size={16} />,
        },
        {
          key: "skill-store",
          label: collapsed ? null : t("nav.skillStore", "Skills 商店"),
          icon: <SparkMagicWandLine size={16} />,
        },
        {
          key: "environments",
          label: collapsed ? null : t("nav.environments"),
          icon: <SparkInternetLine size={16} />,
        },
        {
          key: "security",
          label: collapsed ? null : t("nav.security"),
          icon: <SparkBrowseLine size={16} />,
        },
        {
          key: "backups",
          label: collapsed ? null : t("nav.backups"),
          icon: <SparkSaveLine size={16} />,
        },
        {
          key: "voice-transcription",
          label: collapsed ? null : t("nav.voiceTranscription"),
          icon: <SparkMicLine size={16} />,
        },
        {
          key: "debug",
          label: collapsed ? null : t("nav.debug", "Debug"),
          icon: <SparkDebugLine size={16} />,
        },
      ],
    },
  ],
    hiddenNavKeys,
  );

  // Append plugin menu items as a group (only when there are plugins)
  if (pluginRoutes.length > 0) {
    settingsMenuItems.push({
      key: "plugins-group",
      label: collapsed ? null : t("nav.plugins"),
      children: pluginRoutes.map((route) => ({
        key: route.path.replace(/^\//, ""),
        label: collapsed ? null : route.label,
        icon: <span style={{ fontSize: 16 }}>{route.icon}</span>,
      })),
    } as any);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Sider
      width={collapsed ? 72 : 240}
      className={`${styles.sider}${
        collapsed ? ` ${styles.siderCollapsed}` : ""
      }${isDark ? ` ${styles.siderDark}` : ""}`}
    >
      <span className={styles.siderAmbientOrbA} aria-hidden />
      <span className={styles.siderAmbientOrbB} aria-hidden />
      {collapsed ? (
        <nav className={styles.collapsedNav}>
          {collapsedNavItems.map((item) => {
            const isActive = selectedKey === item.key;
            return (
              <Tooltip
                key={item.key}
                title={item.label}
                placement="right"
                overlayInnerStyle={{
                  background: "rgba(0,0,0,0.75)",
                  color: "#fff",
                }}
              >
                <button
                  className={`${styles.collapsedNavItem} ${
                    isActive ? styles.collapsedNavItemActive : ""
                  }`}
                  onClick={() => navigate(item.path)}
                >
                  {item.icon}
                </button>
              </Tooltip>
            );
          })}
        </nav>
      ) : (
        <div className={styles.sidebarNavCard}>
          <Menu
            mode="inline"
            selectedKeys={[selectedKey]}
            openKeys={DEFAULT_OPEN_KEYS}
            onClick={({ key }) => {
              const path = KEY_TO_PATH[String(key)];
              if (path) navigate(path);
            }}
            items={agentMenuItems}
            theme={isDark ? "dark" : "light"}
            className={styles.sideMenu}
          />
          <Menu
            mode="inline"
            selectedKeys={[selectedKey]}
            openKeys={[
              ...DEFAULT_OPEN_KEYS,
              ...(pluginRoutes.length > 0 ? ["plugins-group"] : []),
            ]}
            onClick={({ key }) => {
              const path = KEY_TO_PATH[String(key)] ?? `/${String(key)}`;
              navigate(path);
            }}
            items={settingsMenuItems}
            theme={isDark ? "dark" : "light"}
            className={styles.sideMenu}
          />
        </div>
      )}

      <div className={styles.collapseToggleContainer}>
        <Button
          type="text"
          icon={
            collapsed ? (
              <SparkMenuExpandLine size={20} />
            ) : (
              <SparkMenuFoldLine size={20} />
            )
          }
          onClick={() => setCollapsed(!collapsed)}
          className={styles.collapseToggle}
        />
      </div>

    </Sider>
  );
}
