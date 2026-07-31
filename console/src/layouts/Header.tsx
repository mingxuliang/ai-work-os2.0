import { useMemo, useState } from "react";
import { Layout, Space, Dropdown, Avatar, Modal, Form, Input, Button } from "antd";
import type { MenuProps } from "antd";
import LanguageSwitcher from "../components/LanguageSwitcher/index";
import ThemeToggleButton from "../components/ThemeToggleButton";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../contexts/ThemeContext";
import { getDisplayUsernameFromToken } from "../utils/authUsername";
import { useAccountProfile } from "../hooks/useAccountProfile";
import { useLogout } from "../hooks/useLogout";
import styles from "./index.module.less";

const { Header: AntHeader } = Layout;

export default function Header() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const { logout } = useLogout();
  const { loading: accountLoading, jwtMode, handleUpdateProfile } =
    useAccountProfile();

  const displayName = useMemo(() => getDisplayUsernameFromToken(), []);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountForm] = Form.useForm();

  const handleLogout = () => {
    void logout();
  };

  const onAccountFinish = async (values: {
    currentPassword: string;
    newUsername?: string;
    newPassword?: string;
    confirmPassword?: string;
  }) => {
    const ok = await handleUpdateProfile(values);
    if (ok) {
      setAccountModalOpen(false);
      accountForm.resetFields();
    }
  };

  const userMenuItems: MenuProps["items"] = [
    {
      key: "profile",
      icon: <i className="ri-user-line" style={{ fontSize: 14 }} />,
      label: t("account.title", "账号设置"),
      onClick: () => {
        accountForm.resetFields();
        setAccountModalOpen(true);
      },
    },
    {
      key: "users",
      icon: <i className="ri-team-line" style={{ fontSize: 14 }} />,
      label: t("nav.users", "用户管理"),
      onClick: () => navigate("/users"),
    },
    { type: "divider" },
    {
      key: "logout",
      icon: (
        <i
          className="ri-logout-box-r-line"
          style={{ fontSize: 14, color: "#ef4444" }}
        />
      ),
      label: (
        <span style={{ color: "#ef4444" }}>
          {t("login.logout", "退出登录")}
        </span>
      ),
      onClick: handleLogout,
    },
  ];

  return (
    <AntHeader className={styles.header}>
      <div className={styles.logoWrapper} style={{ gap: 10 }}>
        <img
          src="/logo-mark.png?v=5"
          alt=""
          style={{
            height: 28,
            width: "auto",
            maxWidth: 96,
            display: "block",
            objectFit: "contain",
            background: "transparent",
            flexShrink: 0,
          }}
        />
        <span className={styles.brandTitleGradient}>{t("common.systemName")}</span>
      </div>

      <Space size="middle">
        <LanguageSwitcher />
        <ThemeToggleButton />

        <Dropdown
          menu={{ items: userMenuItems }}
          placement="bottomRight"
          trigger={["click"]}
          overlayStyle={{ minWidth: 160 }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
              padding: "4px 8px",
              borderRadius: 8,
              transition: "background 0.2s",
              background: "transparent",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = isDark
                ? "rgba(255,255,255,0.06)"
                : "rgba(0,0,0,0.04)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.background =
                "transparent";
            }}
          >
            <Avatar
              size={28}
              style={{
                background: "linear-gradient(135deg, #06b6d4, #6366f1)",
                fontSize: 12,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {displayName.slice(0, 1).toUpperCase()}
            </Avatar>
            <span
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: isDark ? "#cbd5e1" : "#334155",
                maxWidth: 80,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {displayName}
            </span>
            <i
              className="ri-arrow-down-s-line"
              style={{ fontSize: 14, color: isDark ? "#64748b" : "#94a3b8" }}
            />
          </div>
        </Dropdown>
      </Space>

      <Modal
        open={accountModalOpen}
        onCancel={() => setAccountModalOpen(false)}
        title={t("account.title")}
        footer={null}
        destroyOnHidden
        centered
      >
        <Form
          form={accountForm}
          layout="vertical"
          onFinish={onAccountFinish}
        >
          {!jwtMode && (
            <>
              <Form.Item
                name="currentPassword"
                label={t("account.currentPassword")}
                rules={[
                  {
                    required: true,
                    message: t("account.currentPasswordRequired"),
                  },
                ]}
              >
                <Input.Password />
              </Form.Item>
              <Form.Item name="newUsername" label={t("account.newUsername")}>
                <Input placeholder={t("account.newUsernamePlaceholder")} />
              </Form.Item>
            </>
          )}
          <Form.Item name="newPassword" label={t("account.newPassword")}>
            <Input.Password
              placeholder={t("account.newPasswordPlaceholder")}
            />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label={t("account.confirmPassword")}
            dependencies={["newPassword"]}
            rules={[
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value && !getFieldValue("newPassword")) {
                    return Promise.resolve();
                  }
                  if (value === getFieldValue("newPassword")) {
                    return Promise.resolve();
                  }
                  return Promise.reject(
                    new Error(t("account.passwordMismatch")),
                  );
                },
              }),
            ]}
          >
            <Input.Password
              placeholder={t("account.confirmPasswordPlaceholder")}
            />
          </Form.Item>
          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={accountLoading}
              block
            >
              {t("account.save")}
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </AntHeader>
  );
}
