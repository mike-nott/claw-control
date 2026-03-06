export type Agent = {
  id: string;
  name: string;
  kind: string;
  status: string;
  emoji: string | null;
  last_seen_at: string | null;
  updated_at: string;
};

export type TaskStatus =
  | "inbox"
  | "in_progress"
  | "review"
  | "done";

export type Task = {
  id: string;
  title: string;
  summary: string;
  type: string;
  status: TaskStatus;
  priority: string;
  assignee_agent_id: string | null;
  worker_kind: string;
  payload_json: Record<string, unknown>;
  source_event_ids_json: Record<string, unknown> | null;
  created_by: string;
  due_at: string | null;
  claimed_by: string | null;
  claimed_at: string | null;
  claim_token: string | null;
  project_id: string | null;
  board_id: string | null;
  reviewer_agent_id: string | null;
  mm_card_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Activity = {
  id: string;
  task_id: string | null;
  agent_id: string | null;
  activity_type: string;
  summary: string;
  detail_json: Record<string, unknown>;
  created_at: string;
};

export type TaskComment = {
  id: string;
  task_id: string;
  author_type: string;
  author_id: string;
  body: string;
  attachment_json: {
    filename: string;
    path: string;
    content_type: string;
    size_bytes: number;
  } | null;
  created_at: string;
};

export type TaskAttachment = {
  id: string;
  task_id: string;
  filename: string;
  stored_filename: string;
  content_type: string;
  size_bytes: number;
  uploaded_by: string;
  created_at: string;
};

export type CreateCommentInput = {
  author_type: "human";
  author_id: string;
  body: string;
};

export type StreamEvent = {
  type: string;
  ts: string;
  payload: Record<string, unknown>;
};

export type ScheduleEntry = {
  id: string;
  task: string;
  agent: string | null;
  model: string | null;
  schedule: string;
  schedule_human: string;
  last_run_at: string | null;
  last_status: string | null;
  next_run_at: string | null;
  status: "ok" | "late" | "error" | "running" | "idle" | "disabled";
  source: "cron" | "launchd" | "heartbeat";
  detail: Record<string, unknown>;
};

export type ScheduleDetail = ScheduleEntry & {
  config: Record<string, unknown>;
  recent_runs: Array<{ at: string; status: string; duration_ms: number | null }>;
  log_tail: string | null;
  activities: ActivityLogEntry[];
};

export type ActivityLogEntry = {
  id: string;
  type: string;
  priority: string;
  source: string;
  agent_id: string | null;
  title: string;
  summary: string | null;
  created_at: string;
};

export type ActivityLogEntryDetail = ActivityLogEntry & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- payload shape varies by activity type
  payload: Record<string, any>;
};

export type ActivityLogFilters = {
  types: string[];
  sources: string[];
};

export type TaskCreateInput = {
  title: string;
  summary: string;
  type: string;
  status: string;
  priority: string;
  assignee_agent_id: string | null;
  worker_kind: string;
  payload_json: Record<string, unknown>;
  source_event_ids_json: Record<string, unknown> | null;
  created_by: string;
  project_id?: string | null;
  board_id?: string | null;
  reviewer_agent_id?: string | null;
};

export type TaskPatchInput = {
  title: string;
  summary: string;
  status: string;
  priority: string;
  assignee_agent_id: string | null;
  project_id?: string | null;
  board_id?: string | null;
  reviewer_agent_id?: string | null;
  mm_card_id?: string | null;
};

export type MemberType = "agent" | "human" | "external_agent" | "external_human";
export type MemberStatus = "active" | "inactive" | "away";

export type Team = {
  id: string;
  name: string;
  description: string | null;
  mm_team_id: string | null;
  icon: string | null;
  is_local: boolean;
  member_count: number;
  created_at: string;
  updated_at: string;
};

export type TeamMember = {
  id: string;
  team_id: string;
  agent_id: string | null;
  name: string;
  mm_username: string | null;
  mm_user_id: string | null;
  role: string | null;
  bio: string | null;
  type: MemberType;
  category: string | null;
  model_tier: string | null;
  status: MemberStatus;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectStatus = "active" | "paused" | "completed" | "archived";

export type ProjectTeam = {
  id: string;
  name: string;
  icon: string | null;
};

export type Project = {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  owner: string | null;
  team_id: string | null;
  mm_team_id: string | null;
  mm_category_id: string | null;
  github_repo: string | null;
  discord_server: string | null;
  discord_channel: string | null;
  created_at: string;
  updated_at: string;
  board_count?: number;
  task_summary?: Record<string, number>;
  teams?: ProjectTeam[];
};

export type ProjectCredential = {
  id: string;
  project_id: string;
  label: string;
  value: string;
  created_at: string;
  updated_at: string;
};

export type Board = {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  position: number;
  mm_channel_id: string | null;
  mm_board_id: string | null;
  created_at: string;
  updated_at: string;
  task_summary?: Record<string, number>;
};

// Federation

export type FederationConnection = {
  id: string;
  name: string;
  instance_id: string;
  endpoint: string;
  status: string;
  agent_map: Record<string, string>;
  status_map: Record<string, string>;
  created_at: string;
  last_sync_at: string | null;
};

export type FederationQueueEvent = {
  id: string;
  event_type: string;
  attempts: number;
  created_at: string;
  last_attempt_at: string | null;
  status: string;
  connection_name: string;
};

export type FederationTaskInfo = {
  is_shared: boolean;
  direction: string | null;
  connections: Array<{
    connection_id: string;
    connection_name: string;
    remote_task_id: string;
    last_synced_at: string | null;
  }>;
};

export type SyncQueueResult = {
  processed: number;
  delivered: number;
  failed: number;
  skipped: number;
  expired: number;
};

// Status page types

export interface StatusGatewaySession {
  key: string;
  model: string | null;
  context_tokens: number;
  context_max: number;
  context_percent: number;
  compactions: number;
}

export type StatusGateway = {
  status: "ok" | "down";
  active: boolean;
  uptime_seconds: number | null;
  memory_mb: number | null;
  version: string | null;
  pid: number | null;
  session: StatusGatewaySession | null;
};

export type StatusLlmMetrics = {
  gen_tokens_per_sec: number | null;
  prompt_tokens_per_sec?: number | null;
  requests_running: number;
  requests_waiting?: number;
  prompt_tokens_total: number;
  gen_tokens_total: number;
  cache_hits_total?: number;
};

export type StatusGpu = {
  name: string | null;
  proc: number | null;
  mem: number | null;
  temp: number | null;
  fan: number | null;
};

export type StatusGlances = {
  cpu_percent: number | null;
  ram_percent: number | null;
  gpu?: StatusGpu;
};

export type StatusLlmServer = {
  name: string;
  host: string;
  port: number;
  status: "ok" | "down" | "loading";
  active: boolean;
  model: string | null;
  runtime: string;
  response_ms: number | null;
  metrics: StatusLlmMetrics | null;
  glances: StatusGlances | null;
};

export type StatusService = {
  name: string;
  status: "ok" | "down";
  response_ms: number | null;
};

export type StatusAgent = {
  id: string;
  name: string;
  emoji: string | null;
  status: string;
  model: { primary: string; fallbacks: string[] } | null;
  current_provider: string | null;
  last_seen_at: string | null;
};

export type StatusAgents = {
  total: number;
  active: number;
  idle: number;
  error: number;
  agents: StatusAgent[];
};

export type StatusCron = {
  total: number;
  ok: number;
  late: number;
  error: number;
  schedules: ScheduleEntry[];
};

export type StatusResponse = {
  ts: string;
  gateway: StatusGateway;
  llm_servers: StatusLlmServer[];
  services: StatusService[];
  agents: StatusAgents;
  cron: StatusCron;
};

export type AccessLevel = "R" | "W" | "RW" | true;

export interface AgentCronJob {
  id: string;
  name: string;
  schedule_expr: string;
  enabled: boolean;
  last_run_at: string | null;
  last_status: string | null;
  next_run_at: string | null;
}

export interface AgentAccess {
  memory: Record<string, AccessLevel | null>;
  data_stores: Record<string, AccessLevel | null>;
  tools: Record<string, AccessLevel | null>;
  external_tools: Record<string, AccessLevel | null>;
}

export interface AgentConfig {
  id: string;
  name: string;
  emoji: string | null;
  default: boolean;
  team: string;
  title: string;
  bio: string;
  workspace: string | null;
  model: { primary: string; fallbacks: string[] } | null;
  tools: string[] | null; // null = all tools (main agent), [] = none, [...] = listed
  skills: string[];
  heartbeat: { every?: string; [key: string]: unknown } | null;
  cron_jobs: AgentCronJob[];
  access: AgentAccess;
}
