import { getApiUrl, clearAuthToken, getApiToken } from "../config";
import { buildAuthHeaders } from "../authHeaders";
import { request } from "../request";
import { isJwtToken } from "../../utils/authUsername";

export interface LoginResponse {
  token: string;
  username: string;
  message?: string;
}

export interface AuthStatusResponse {
  enabled: boolean;
  has_users: boolean;
  mode?: "legacy" | "jwt" | string;
}

async function fetchJwtAuthEnabled(): Promise<boolean> {
  try {
    const res = await fetch(getApiUrl("/auth/jwt/status"));
    if (res.ok) {
      const data = (await res.json()) as { enabled?: boolean; mode?: string };
      return data.enabled !== false && data.mode !== "legacy";
    }
  } catch {
    /* fall through */
  }
  try {
    const res = await fetch(getApiUrl("/auth/status"));
    if (res.ok) {
      const data = (await res.json()) as {
        enabled?: boolean;
        mode?: string;
      };
      if (data.mode === "jwt") return true;
      return Boolean(data.enabled);
    }
  } catch {
    /* fall through */
  }
  // QwenPaw 2.0 + enterprise overlay always uses JWT when status endpoints fail.
  return true;
}

export const authApi = {
  /** 远端 JWT 模式（如 101.36.143.21:8088） */
  jwtLogin: async (
    username: string,
    password: string,
  ): Promise<LoginResponse> => {
    const res = await fetch(getApiUrl("/auth/jwt/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        typeof err.detail === "string" ? err.detail : "Login failed",
      );
    }
    const data = (await res.json()) as LoginResponse & { roles?: string[] };
    return { token: data.token, username: data.username };
  },

  login: async (username: string, password: string): Promise<LoginResponse> => {
    const jwtEnabled = await fetchJwtAuthEnabled();
    if (jwtEnabled) {
      return authApi.jwtLogin(username, password);
    }

    try {
      const res = await fetch(getApiUrl("/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        const data = (await res.json()) as LoginResponse;
        if (data.token) return data;
      }
    } catch {
      /* fall through to JWT */
    }
    return authApi.jwtLogin(username, password);
  },

  register: async (
    username: string,
    password: string,
  ): Promise<LoginResponse> => {
    const jwtEnabled = await fetchJwtAuthEnabled();
    if (jwtEnabled) {
      const res = await fetch(getApiUrl("/auth/jwt/register"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          typeof err.detail === "string" ? err.detail : "Registration failed",
        );
      }
      const data = (await res.json()) as LoginResponse & { roles?: string[] };
      return { token: data.token, username: data.username };
    }

    const res = await fetch(getApiUrl("/auth/register"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        typeof err.detail === "string" ? err.detail : "Registration failed",
      );
    }
    return res.json();
  },

  /**
   * Unified status for the login page.
   * Works for both legacy (QWENPAW_AUTH_ENABLED) and JWT (QWENPAW_AUTH_MODE=jwt) modes.
   * The backend /auth/status endpoint handles both cases automatically.
   */
  getStatus: async (): Promise<AuthStatusResponse> => {
    const res = await fetch(getApiUrl("/auth/status"));
    if (!res.ok) throw new Error("Failed to check auth status");
    return res.json();
  },

  verifyToken: async (token: string): Promise<boolean> => {
    if (!token) return false;
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };

    const jwtRes = await fetch(getApiUrl("/auth/jwt/verify"), {
      method: "POST",
      headers,
    });
    if (jwtRes.ok) {
      const data = (await jwtRes.json().catch(() => ({}))) as {
        valid?: boolean;
      };
      return data.valid !== false;
    }

    const legacyRes = await fetch(getApiUrl("/auth/verify-token"), {
      method: "POST",
      headers,
      body: JSON.stringify({ token }),
    });
    return legacyRes.ok;
  },

  updateProfile: async (
    currentPassword: string,
    newUsername?: string,
    newPassword?: string,
  ): Promise<LoginResponse> => {
    const token = localStorage.getItem("qwenpaw_auth_token") || "";
    const res = await fetch(getApiUrl("/auth/update-profile"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        current_password: currentPassword,
        new_username: newUsername || null,
        new_password: newPassword || null,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Update failed");
    }
    return res.json();
  },

  /** JWT：修改当前用户密码 */
  changePassword: async (
    newPassword: string,
    newPasswordRepeat: string,
  ): Promise<{ message: string }> => {
    return request<{ message: string }>("/auth/jwt/change-password", {
      method: "POST",
      body: JSON.stringify({
        new_password: newPassword,
        new_password_repeat: newPasswordRepeat,
      }),
    });
  },

  /**
   * 退出登录：优先 JWT 注销（Redis 黑名单），失败则尝试 legacy revoke-token，最后清除本地 token。
   */
  logout: async (): Promise<void> => {
    const token = getApiToken();
    if (!token) {
      clearAuthToken();
      return;
    }
    if (isJwtToken(token)) {
      try {
        await request<{ message: string }>("/auth/jwt/logout", {
          method: "POST",
        });
        clearAuthToken();
        return;
      } catch {
        /* fall through */
      }
    }
    try {
      const res = await fetch(getApiUrl("/auth/revoke-token"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildAuthHeaders(),
        },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        /* still clear local session */
      }
    } catch {
      /* ignore */
    }
    clearAuthToken();
  },
};
