import { request } from "../request";
import type { AgentStatsSummary } from "../types/agentStats";

export interface GetAgentStatsParams {
  start_date: string;
  end_date: string;
}

export const agentStatsApi = {
  getAgentStats: (params: GetAgentStatsParams, agentId?: string) => {
    const opts: RequestInit = {};
    if (agentId) opts.headers = new Headers({ "X-Agent-Id": agentId });
    return request<AgentStatsSummary>(
      `/agent-stats?start_date=${encodeURIComponent(
        params.start_date,
      )}&end_date=${encodeURIComponent(params.end_date)}`,
      opts,
    );
  },
};
