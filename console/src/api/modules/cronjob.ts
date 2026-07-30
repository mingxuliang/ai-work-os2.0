import { request } from "../request";
import type {
  CronJobSpecInput,
  CronJobSpecOutput,
  CronTarget,
  CronJobView,
  ExecutionRecord,
  CronExecutionHistoryItem,
} from "../types";

const cronPath = (path: string, agentId?: string) =>
  agentId
    ? `/agents/${encodeURIComponent(agentId)}/cron${path}`
    : `/cron${path}`;

export const cronJobApi = {
  listCronJobs: (agentId?: string) =>
    request<CronJobSpecOutput[]>(cronPath("/jobs", agentId)),

  createCronJob: (spec: CronJobSpecInput, agentId?: string) =>
    request<CronJobSpecOutput>(cronPath("/jobs", agentId), {
      method: "POST",
      body: JSON.stringify(spec),
    }),

  getCronJob: (jobId: string, agentId?: string) =>
    request<CronJobView>(cronPath(`/jobs/${encodeURIComponent(jobId)}`, agentId)),

  replaceCronJob: (jobId: string, spec: CronJobSpecInput, agentId?: string) =>
    request<CronJobSpecOutput>(cronPath(`/jobs/${encodeURIComponent(jobId)}`, agentId), {
      method: "PUT",
      body: JSON.stringify(spec),
    }),

  deleteCronJob: (jobId: string, agentId?: string) =>
    request<void>(cronPath(`/jobs/${encodeURIComponent(jobId)}`, agentId), {
      method: "DELETE",
    }),

  pauseCronJob: (jobId: string, agentId?: string) =>
    request<void>(cronPath(`/jobs/${encodeURIComponent(jobId)}/pause`, agentId), {
      method: "POST",
    }),

  resumeCronJob: (jobId: string, agentId?: string) =>
    request<void>(cronPath(`/jobs/${encodeURIComponent(jobId)}/resume`, agentId), {
      method: "POST",
    }),

  runCronJob: (jobId: string, agentId?: string) =>
    request<void>(cronPath(`/jobs/${encodeURIComponent(jobId)}/run`, agentId), {
      method: "POST",
    }),

  triggerCronJob: (jobId: string, agentId?: string) =>
    request<void>(cronPath(`/jobs/${encodeURIComponent(jobId)}/run`, agentId), {
      method: "POST",
    }),

  getCronJobState: (jobId: string, agentId?: string) =>
    request<unknown>(cronPath(`/jobs/${encodeURIComponent(jobId)}/state`, agentId)),

  listCronTargets: (agentId?: string) =>
    request<CronTarget[]>(cronPath("/targets", agentId)),

  /** Real backend history endpoint (prefer this over listJobRecords). */
  listJobHistory: (jobId: string, agentId?: string) =>
    request<CronExecutionHistoryItem[]>(
      cronPath(`/jobs/${encodeURIComponent(jobId)}/history`, agentId),
    ),

  listJobRecords: (
    jobId: string,
    params?: { limit?: number; offset?: number },
    agentId?: string,
  ) => {
    const query = new URLSearchParams();
    if (params?.limit != null) query.set("limit", String(params.limit));
    if (params?.offset != null) query.set("offset", String(params.offset));
    const qs = query.toString();
    return request<ExecutionRecord[]>(
      cronPath(`/jobs/${encodeURIComponent(jobId)}/records${qs ? `?${qs}` : ""}`, agentId),
    );
  },

  getRecordOutput: (recordId: string, agentId?: string) =>
    request<string>(cronPath(`/records/${encodeURIComponent(recordId)}/output`, agentId)),

  deleteRecord: (recordId: string, agentId?: string) =>
    request<{ deleted: boolean }>(cronPath(`/records/${encodeURIComponent(recordId)}`, agentId), {
      method: "DELETE",
    }),

  deleteJobRecords: (jobId: string, agentId?: string) =>
    request<{ deleted: number }>(cronPath(`/jobs/${encodeURIComponent(jobId)}/records`, agentId), {
      method: "DELETE",
    }),
};
