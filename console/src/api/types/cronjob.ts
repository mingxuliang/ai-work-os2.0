export interface CronJobSchedule {
  type: "cron";
  cron: string;
  timezone?: string;
}

export interface CronJobTarget {
  user_id: string;
  session_id: string;
}

export interface CronJobDispatch {
  type: "channel";
  channel?: string;
  target: CronJobTarget;
  mode?: "stream" | "final";
  meta?: Record<string, unknown>;
}

export interface CronJobRuntime {
  max_concurrency?: number;
  timeout_seconds?: number;
  misfire_grace_seconds?: number;
}

export interface CronJobRequest {
  input: unknown;
  session_id?: string | null;
  user_id?: string | null;
  channel?: string | null;
  [key: string]: unknown;
}

export interface CronJobSpecInput {
  id: string;
  name: string;
  enabled?: boolean;
  schedule: CronJobSchedule;
  task_type?: "text" | "agent";
  text?: string;
  request?: CronJobRequest;
  dispatch: CronJobDispatch;
  runtime?: CronJobRuntime;
  meta?: Record<string, unknown>;
  owner_user_id?: string | null;
}

export type CronJobSpecOutput = CronJobSpecInput;

/**
 * Ant Design 表单使用的值类型：在后端 spec 字段基础上，
 * 追加仅用于 UI 的排程字段（cronType / cronTime 等），
 * 并把 request.input 收窄为字符串，便于表单输入框绑定。
 */
export interface CronFormValues
  extends Omit<CronJobSpecInput, "id" | "name" | "schedule" | "dispatch" | "request"> {
  id?: string;
  name?: string;
  schedule?: CronJobSchedule;
  dispatch?: CronJobDispatch;
  request?: {
    input?: string;
    session_id?: string | null;
    user_id?: string | null;
    channel?: string | null;
    [key: string]: unknown;
  };
  cronType?: string;
  cronTime?: unknown;
  cronDaysOfWeek?: string[];
  cronCustom?: string;
  _jobAgentId?: string;
}

export interface CronJobState {
  next_run_at?: string | null;
  last_run_at?: string | null;
  last_status?: "success" | "error" | "running" | "skipped" | "cancelled" | null;
  last_error?: string | null;
}

/** 后端返回的 CronJobView = { spec, state } */
export interface CronJobView {
  spec: CronJobSpecOutput;
  state: CronJobState;
}

// ── Dispatch target (from /cron/targets) ─────────────────────────────────────
export interface CronTarget {
  name: string;
  channel: string;
  session_id: string;
  out_sender_id: string;
  user_id: string;
  chat_type: string;
}

// ── Execution records ─────────────────────────────────────────────────────────
export type ExecutionStatus = "success" | "error" | "cancelled" | "skipped";
export type TriggerType = "scheduled" | "manual";

export interface ExecutionRecord {
  id: string;
  job_id: string;
  job_name: string;
  executed_at: string;
  completed_at: string;
  status: ExecutionStatus;
  error_message?: string | null;
  duration_seconds?: number | null;
  trigger_type: TriggerType;
  owner_user_id?: string | null;
  output_file?: string | null;
}

/** Backend CronExecutionRecord from GET /cron/jobs/{id}/history */
export interface CronExecutionHistoryItem {
  run_at: string;
  status: "success" | "error" | "running" | "skipped" | "cancelled";
  error?: string | null;
  trigger?: TriggerType;
}

export type CronJobSpecInputLegacy = Record<string, unknown>;
export type CronJobSpecOutputLegacy = Record<string, unknown>;
export type CronJobViewLegacy = Record<string, unknown>;
