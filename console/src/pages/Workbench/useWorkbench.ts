import { useEffect, useRef, useState } from "react";
import dayjs from "dayjs";
import { agentsApi } from "../../api/modules/agents";
import { agentStatsApi } from "../../api/modules/agentStats";
import { chatApi } from "../../api/modules/chat";
import type { AgentSummary } from "../../api/types/agents";
import type { ChatSpec } from "../../api/types/chat";
import type { AgentStatsSummary } from "../../api/types/agentStats";
import { getEffectiveUserId } from "../../utils/authUsername";

export interface AgentStatus {
  status: "idle" | "running" | "disabled";
  running_task_count: number;
  last_run_at: string | null;
  last_finish_at: string | null;
}

export interface AgentWithStatus extends AgentSummary {
  runtimeStatus: AgentStatus | null;
}

export interface WorkbenchData {
  agents: AgentWithStatus[];
  todayStats: AgentStatsSummary | null;
  recentChats: ChatSpec[];
  loading: boolean;
}

const todayStr = () => dayjs().format("YYYY-MM-DD");

/** 优先取今日有 updated_at 的 chats，若不足 8 条则回退到全部最近 20 条 */
function buildRecentChats(chats: ChatSpec[]): ChatSpec[] {
  const today = todayStr();
  const sorted = [...chats].sort((a, b) =>
    (b.updated_at ?? "").localeCompare(a.updated_at ?? ""),
  );
  const todayChats = sorted.filter(
    (c) => c.updated_at && c.updated_at.startsWith(today),
  );
  return (todayChats.length >= 4 ? todayChats : sorted).slice(0, 20);
}

export function useWorkbench(): WorkbenchData {
  const [agents, setAgents] = useState<AgentWithStatus[]>([]);
  const [todayStats, setTodayStats] = useState<AgentStatsSummary | null>(null);
  const [recentChats, setRecentChats] = useState<ChatSpec[]>([]);
  const [loading, setLoading] = useState(true);

  const chatsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch chats ────────────────────────────────────────────────────────
  const refreshChats = async () => {
    try {
      const chats = await chatApi.listChats({ user_id: getEffectiveUserId() });
      setRecentChats(buildRecentChats(chats));
    } catch {
      // keep previous value
    }
  };

  // ── Fetch today's stats ────────────────────────────────────────────────
  const refreshStats = async () => {
    try {
      const td = todayStr();
      const stats = await agentStatsApi.getAgentStats({
        start_date: td,
        end_date: td,
      });
      setTodayStats(stats);
    } catch {
      // keep previous value
    }
  };

  // ── Initial full fetch ─────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [agentRes, statsRes, chatsRes] = await Promise.allSettled([
          agentsApi.listAgents(),
          agentStatsApi.getAgentStats({ start_date: todayStr(), end_date: todayStr() }),
          chatApi.listChats({ user_id: getEffectiveUserId() }),
        ]);

        const agentList =
          agentRes.status === "fulfilled" ? agentRes.value.agents : [];

        setAgents(agentList.map((a) => ({ ...a, runtimeStatus: null })));
        if (statsRes.status === "fulfilled") setTodayStats(statsRes.value);
        if (chatsRes.status === "fulfilled") {
          setRecentChats(buildRecentChats(chatsRes.value));
        }
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Polling: chats every 60s ───────────────────────────────────────────
  useEffect(() => {
    chatsTimerRef.current = setInterval(refreshChats, 60_000);
    return () => {
      if (chatsTimerRef.current) clearInterval(chatsTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Polling: stats every 5 min ─────────────────────────────────────────
  useEffect(() => {
    statsTimerRef.current = setInterval(refreshStats, 5 * 60_000);
    return () => {
      if (statsTimerRef.current) clearInterval(statsTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { agents, todayStats, recentChats, loading };
}
