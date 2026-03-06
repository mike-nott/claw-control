import type {
  Activity,
  ActivityLogEntry,
  ActivityLogEntryDetail,
  ActivityLogFilters,
  Agent,
  AgentConfig,
  Board,
  CreateCommentInput,
  FederationConnection,
  FederationQueueEvent,
  FederationTaskInfo,
  Project,
  ProjectCredential,
  ScheduleDetail,
  ScheduleEntry,
  StatusResponse,
  SyncQueueResult,
  Task,
  TaskAttachment,
  TaskComment,
  TaskCreateInput,
  TaskPatchInput,
  Team,
  TeamMember,
} from "./types";

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${path}`);
  }
  return (await response.json()) as T;
}

async function requestWithBody<T>(path: string, method: "POST", body: object): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${path}`);
  }
  return (await response.json()) as T;
}

async function requestWithPatch<T>(path: string, body: object): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${path}`);
  }
  return (await response.json()) as T;
}

export function getAgents(): Promise<Agent[]> {
  return request<Agent[]>("/api/agents");
}

export function getTasks(limit = 200): Promise<Task[]> {
  const clampedLimit = Math.min(limit, 200);
  return request<Task[]>(`/api/tasks?limit=${clampedLimit}`);
}

export function getActivities(): Promise<Activity[]> {
  return request<Activity[]>("/api/activities?limit=200");
}

export function getTask(taskId: string): Promise<Task> {
  return request<Task>(`/api/tasks/${taskId}`);
}

export function getTaskComments(taskId: string): Promise<TaskComment[]> {
  return request<TaskComment[]>(`/api/tasks/${taskId}/comments`);
}

export function createTaskComment(taskId: string, payload: CreateCommentInput): Promise<TaskComment> {
  return requestWithBody<TaskComment>(`/api/tasks/${taskId}/comments`, "POST", payload);
}

export async function createCommentWithAttachment(
  taskId: string,
  body: string,
  file: File
): Promise<TaskComment> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("body", body);
  formData.append("author_type", "human");
  formData.append("author_id", "user");

  const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}/comments/upload`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
  return (await response.json()) as TaskComment;
}

// Task Attachments
export function getTaskAttachments(taskId: string): Promise<TaskAttachment[]> {
  return request<TaskAttachment[]>(`/api/tasks/${taskId}/attachments`);
}

export async function uploadTaskAttachment(taskId: string, file: File): Promise<TaskAttachment> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}/attachments`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
  return (await response.json()) as TaskAttachment;
}

export async function deleteTaskAttachment(taskId: string, attachmentId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}/attachments/${attachmentId}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error(`Delete failed: ${response.status}`);
}

export function getTaskActivities(taskId: string): Promise<Activity[]> {
  return request<Activity[]>(`/api/activities?task_id=${encodeURIComponent(taskId)}&limit=100`);
}

export async function deleteTask(taskId: string): Promise<{ deleted: boolean; id: string }> {
  const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}`, { method: "DELETE" });
  if (!response.ok) {
    throw new Error(`Delete failed: ${response.status}`);
  }
  return (await response.json()) as { deleted: boolean; id: string };
}

export function createTask(payload: TaskCreateInput): Promise<Task> {
  return requestWithBody<Task>("/api/tasks", "POST", payload);
}

export function patchTask(taskId: string, patch: Partial<TaskPatchInput>): Promise<Task> {
  return requestWithPatch<Task>(`/api/tasks/${taskId}`, patch);
}

export function getSchedules(): Promise<ScheduleEntry[]> {
  return request<ScheduleEntry[]>("/api/schedules");
}

export function getScheduleDetail(id: string): Promise<ScheduleDetail> {
  return request<ScheduleDetail>(`/api/schedules/${encodeURIComponent(id)}`);
}

// Activity Log
export function getActivityLog(params: Record<string, string> = {}): Promise<ActivityLogEntry[]> {
  const qs = new URLSearchParams(params).toString();
  return request<ActivityLogEntry[]>(`/api/activity${qs ? `?${qs}` : ""}`);
}

export function getActivityDetail(activityId: string): Promise<ActivityLogEntryDetail> {
  return request<ActivityLogEntryDetail>(`/api/activity/${encodeURIComponent(activityId)}`);
}

export function getActivityLogFilters(): Promise<ActivityLogFilters> {
  return request<ActivityLogFilters>("/api/activity/filters");
}

// Tokens
export async function getTokenSummary(range: string, agent?: string, model?: string): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({ range });
  if (agent) params.set("agent", agent);
  if (model) params.set("model", model);
  return request<Record<string, unknown>>(`/api/tokens/summary?${params}`);
}

export async function getTokensByAgent(range: string, agent?: string, model?: string): Promise<Record<string, unknown>[]> {
  const params = new URLSearchParams({ range });
  if (agent) params.set("agent", agent);
  if (model) params.set("model", model);
  return request<Record<string, unknown>[]>(`/api/tokens/by-agent?${params}`);
}

export async function getTokensByModel(range: string, agent?: string, model?: string): Promise<Record<string, unknown>[]> {
  const params = new URLSearchParams({ range });
  if (agent) params.set("agent", agent);
  if (model) params.set("model", model);
  return request<Record<string, unknown>[]>(`/api/tokens/by-model?${params}`);
}

export async function getTokensTimeseries(range: string, agent?: string, model?: string): Promise<Record<string, unknown>[]> {
  const params = new URLSearchParams({ range });
  if (agent) params.set("agent", agent);
  if (model) params.set("model", model);
  return request<Record<string, unknown>[]>(`/api/tokens/timeseries?${params}`);
}

export function getStatus(): Promise<StatusResponse> {
  return request<StatusResponse>("/api/status");
}

export function getAgentConfigs(): Promise<AgentConfig[]> {
  return request<AgentConfig[]>("/api/agents");
}

export function getAgentFile(
  agentId: string,
  filename: string
): Promise<{ content: string | null; exists: boolean }> {
  return request<{ content: string | null; exists: boolean }>(
    `/api/agents/${encodeURIComponent(agentId)}/file/${encodeURIComponent(filename)}`
  );
}

// Teams
export function getTeams(): Promise<Team[]> {
  return request<Team[]>("/api/teams");
}

export function getTeam(id: string): Promise<Team & { members: TeamMember[] }> {
  return request<Team & { members: TeamMember[] }>(`/api/teams/${encodeURIComponent(id)}`);
}

export function getTeamMembers(teamId: string): Promise<TeamMember[]> {
  return request<TeamMember[]>(`/api/teams/${encodeURIComponent(teamId)}/members`);
}

export function createTeamMember(teamId: string, data: Partial<TeamMember>): Promise<TeamMember> {
  return requestWithBody<TeamMember>(
    `/api/teams/${encodeURIComponent(teamId)}/members`,
    "POST",
    data
  );
}

export function updateMember(id: string, data: Partial<TeamMember>): Promise<TeamMember> {
  return requestWithPatch<TeamMember>(`/api/members/${encodeURIComponent(id)}`, data);
}

export async function deleteMember(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/members/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error(`Delete failed: ${response.status}`);
}

// Projects
export function getProjects(teamId?: string): Promise<Project[]> {
  const params = teamId ? `?team_id=${encodeURIComponent(teamId)}` : "";
  return request<Project[]>(`/api/projects${params}`);
}

export function createProject(payload: {
  name: string;
  description?: string | null;
  status?: string;
  github_repo?: string | null;
  discord_server?: string | null;
  discord_channel?: string | null;
  team_ids?: string[];
}): Promise<Project> {
  return requestWithBody<Project>("/api/projects", "POST", payload);
}

export function getProject(id: string): Promise<Project & { boards: Board[] }> {
  return request<Project & { boards: Board[] }>(`/api/projects/${encodeURIComponent(id)}`);
}

export function updateProject(id: string, patch: Partial<Project>): Promise<Project> {
  return requestWithPatch<Project>(`/api/projects/${encodeURIComponent(id)}`, patch);
}

export async function deleteProject(id: string): Promise<{ deleted: boolean }> {
  const response = await fetch(`${API_BASE_URL}/api/projects/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error(`Delete failed: ${response.status}`);
  return (await response.json()) as { deleted: boolean };
}

// Project Credentials
export function getProjectCredentials(projectId: string): Promise<ProjectCredential[]> {
  return request<ProjectCredential[]>(`/api/projects/${encodeURIComponent(projectId)}/credentials`);
}

export function createProjectCredential(
  projectId: string,
  payload: { label: string; value: string }
): Promise<ProjectCredential> {
  return requestWithBody<ProjectCredential>(
    `/api/projects/${encodeURIComponent(projectId)}/credentials`,
    "POST",
    payload
  );
}

export function updateProjectCredential(
  projectId: string,
  credentialId: string,
  patch: { label?: string; value?: string }
): Promise<ProjectCredential> {
  return requestWithPatch<ProjectCredential>(
    `/api/projects/${encodeURIComponent(projectId)}/credentials/${encodeURIComponent(credentialId)}`,
    patch
  );
}

export async function deleteProjectCredential(
  projectId: string,
  credentialId: string
): Promise<{ deleted: boolean }> {
  const response = await fetch(
    `${API_BASE_URL}/api/projects/${encodeURIComponent(projectId)}/credentials/${encodeURIComponent(credentialId)}`,
    { method: "DELETE" }
  );
  if (!response.ok) throw new Error(`Delete failed: ${response.status}`);
  return (await response.json()) as { deleted: boolean };
}

// Boards
export function getBoards(projectId: string): Promise<Board[]> {
  return request<Board[]>(`/api/projects/${encodeURIComponent(projectId)}/boards`);
}

export function createBoard(
  projectId: string,
  payload: { name: string; description?: string | null; position?: number }
): Promise<Board> {
  return requestWithBody<Board>(
    `/api/projects/${encodeURIComponent(projectId)}/boards`,
    "POST",
    payload
  );
}

export function getBoard(id: string): Promise<Board> {
  return request<Board>(`/api/boards/${encodeURIComponent(id)}`);
}

export function updateBoard(id: string, patch: Partial<Board>): Promise<Board> {
  return requestWithPatch<Board>(`/api/boards/${encodeURIComponent(id)}`, patch);
}

export async function deleteBoard(id: string): Promise<{ deleted: boolean }> {
  const response = await fetch(`${API_BASE_URL}/api/boards/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error(`Delete failed: ${response.status}`);
  return (await response.json()) as { deleted: boolean };
}

// Federation

export function getFederationConnections(): Promise<FederationConnection[]> {
  return request<FederationConnection[]>("/api/federation/connections");
}

export function patchFederationConnection(id: string, patch: object): Promise<FederationConnection> {
  return requestWithPatch<FederationConnection>(`/api/federation/connections/${encodeURIComponent(id)}`, patch);
}

export async function deleteFederationConnection(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/federation/connections/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok) throw new Error(`Delete failed: ${response.status}`);
}

export function sendFederationInvite(endpoint: string): Promise<FederationConnection> {
  return requestWithBody<FederationConnection>("/api/federation/invite", "POST", { endpoint });
}

export function getFederationQueue(status?: string): Promise<FederationQueueEvent[]> {
  const params = status ? `?status=${encodeURIComponent(status)}` : "";
  return request<FederationQueueEvent[]>(`/api/federation/queue${params}`);
}

export function processFederationQueue(): Promise<SyncQueueResult> {
  return requestWithBody<SyncQueueResult>("/api/federation/queue/process", "POST", {});
}

export async function clearFederationQueue(): Promise<{ deleted: number }> {
  const response = await fetch(`${API_BASE_URL}/api/federation/queue/clear`, { method: "DELETE" });
  if (!response.ok) throw new Error(`Clear failed: ${response.status}`);
  return (await response.json()) as { deleted: number };
}

export function getTaskFederation(taskId: string): Promise<FederationTaskInfo> {
  return request<FederationTaskInfo>(`/api/tasks/${encodeURIComponent(taskId)}/federation`);
}

export function shareTask(taskId: string, connectionId: string): Promise<FederationTaskInfo> {
  return requestWithBody<FederationTaskInfo>(`/api/tasks/${encodeURIComponent(taskId)}/share`, "POST", { connection_id: connectionId });
}

export async function unshareTask(taskId: string, connectionId: string): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/tasks/${encodeURIComponent(taskId)}/share/${encodeURIComponent(connectionId)}`,
    { method: "DELETE" },
  );
  if (!response.ok) throw new Error(`Unshare failed: ${response.status}`);
}

