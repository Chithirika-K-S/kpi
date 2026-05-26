const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'API error');
  return data as T;
}

export const api = {

  // ─── Auth ────────────────────────────────────────────────────
  getMe: () =>
    apiFetch<{ user: User }>('/api/auth/me'),

  // ─── KPI (Team Member) ───────────────────────────────────────
  getKpi: () =>
    apiFetch<{ kpi: KPI }>('/api/kpi'),

  // ─── AI Chat ─────────────────────────────────────────────────
  sendChat: (message: string, history: ChatMessage[]) =>
    apiFetch<{ reply: string }>('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message, history }),
    }),

  getChatHistory: () =>
    apiFetch<{ history: ChatMessage[] }>('/api/chat/history'),

  // ─── Team Lead – member list ──────────────────────────────────
  getTeamMembers: () =>
    apiFetch<any>('/api/team/members'),

  // ─── Team Lead – single member detail + KPI criteria ─────────
  getMemberDetail: (tlId: number, empId: number, periodId: number) =>
    apiFetch<any>(`/api/team/${tlId}/members/${empId}?periodId=${periodId}`),

  // ─── Team Lead – inline edit member name/email ────────────────
  updateMember: (tlId: number, empId: number, payload: Record<string, any>) =>
    apiFetch<any>(`/api/team/${tlId}/members/${empId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  // ─── Team Lead – submit evaluation scores (draft) ─────────────
  submitTLEvaluation: (payload: {
    teamLeadId: number;
    employeeId: number;
    periodId: number;
    evaluations: { criteriaId: number; score: number; comments: string }[];
  }) =>
    apiFetch<any>('/api/team/evaluation', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // ─── Team Lead – finalize KPI for an employee ─────────────────
  finalizeKPI: (payload: {
    teamLeadId: number;
    employeeId: number;
    periodId: number;
    tlRemarks: string;
  }) =>
    apiFetch<any>('/api/team/finalize-kpi', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // ─── Manager ───────────────────────────────────────
  getManagerStats: () =>
    apiFetch<ManagerStats>('/api/manager/stats'),

  getManagerMonthly: (teamId: string | number = 'all') =>
    apiFetch<{ monthly: MonthlyKpi[] }>(`/api/manager/analytics/monthly?teamId=${teamId}`),

  getManagerTeamAnalytics: () =>
    apiFetch<{ teams: TeamKpi[] }>('/api/manager/analytics/teams'),

  getManagerEmployees: () =>
    apiFetch<{ employees: EmployeeRow[] }>('/api/manager/employees'),

  getManagerTeamLeads: () =>
    apiFetch<{ teamLeads: TeamLeadRow[] }>('/api/manager/teamleads'),

  getManagerTeams: () =>
    apiFetch<{ teams: TeamOption[] }>('/api/manager/teams'),

  getManagerKpiMetrics: () =>
    apiFetch<{ metrics: KpiMetric[] }>('/api/manager/kpi-metrics'),

  managerAssignKpi: (payload: ManagerKpiPayload) =>
    apiFetch<{ message: string; finalScore: number }>('/api/manager/kpi/assign', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  managerEvaluateTeamLead: (payload: EvaluateLeadPayload) =>
    apiFetch<{ message: string }>('/api/manager/teamlead/evaluate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // ─── Admin – Stats ────────────────────────────────────────────
  getAdminStats: () =>
    apiFetch<AdminStats>('/api/admin/stats'),

  // ─── Admin – Metrics ──────────────────────────────────────────
  getAdminMetrics: () =>
    apiFetch<{ metrics: AdminMetric[] }>('/api/admin/metrics'),

  createAdminMetric: (payload: { metric_name: string; max_score: number }) =>
    apiFetch<{ metric: AdminMetric }>('/api/admin/metrics', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateAdminMetric: (id: number, payload: { metric_name: string; max_score: number; is_active: number }) =>
    apiFetch<{ metric: AdminMetric }>(`/api/admin/metrics/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteAdminMetric: (id: number) =>
    apiFetch<{ message: string }>(`/api/admin/metrics/${id}`, { method: 'DELETE' }),

  // ─── Admin – Users ────────────────────────────────────────────
  getAdminUsers: () =>
    apiFetch<{ users: AdminUser[] }>('/api/admin/users'),

  createAdminUser: (payload: { name: string; email: string; password: string; role: string; team_id?: number | null }) =>
    apiFetch<{ user: AdminUser }>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateAdminUser: (id: number, payload: { name: string; email: string; role: string; team_id?: number | null }) =>
    apiFetch<{ message: string }>(`/api/admin/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  setAdminUserStatus: (id: number, status: 'Active' | 'Inactive') =>
    apiFetch<{ message: string }>(`/api/admin/users/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  deleteAdminUser: (id: number) =>
    apiFetch<{ message: string }>(`/api/admin/users/${id}`, { method: 'DELETE' }),

  // ─── Admin – Teams ────────────────────────────────────────────
  getAdminTeams: () =>
    apiFetch<{ teams: AdminTeam[] }>('/api/admin/teams'),

  createAdminTeam: (payload: { name: string; lead_id?: number | null }) =>
    apiFetch<{ message: string; id: number }>('/api/admin/teams', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateAdminTeam: (id: number, payload: { name: string; lead_id?: number | null }) =>
    apiFetch<{ message: string }>(`/api/admin/teams/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteAdminTeam: (id: number) =>
    apiFetch<{ message: string }>(`/api/admin/teams/${id}`, { method: 'DELETE' }),

  setAdminTeamStatus: (id: number, status: 'Active' | 'Inactive') =>
    apiFetch<{ message: string; membersUpdated: number }>(`/api/admin/teams/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  // ─── Notifications ────────────────────────────────────────────
  getNotifications: (tlId: number) =>
    apiFetch<any>(`/api/notifications/${tlId}`),

  markNotificationRead: (id: number) =>
    apiFetch<any>(`/api/notifications/${id}/read`, { method: 'PATCH' }),

  markAllNotificationsRead: (tlId: number) =>
    apiFetch<any>(`/api/notifications/${tlId}/read-all`, { method: 'PATCH' }),

};


// ─── Named exports ──────────────────────────────────────────────────────────
export const getMe                    = api.getMe;
export const getKpi                   = api.getKpi;
export const sendChat                 = api.sendChat;
export const getChatHistory           = api.getChatHistory;
export const getTeamMembers           = api.getTeamMembers;
export const getMemberDetail          = api.getMemberDetail;
export const updateMember             = api.updateMember;
export const submitTLEvaluation       = api.submitTLEvaluation;
export const finalizeKPI              = api.finalizeKPI;
export const getNotifications         = api.getNotifications;
export const markNotificationRead     = api.markNotificationRead;
export const markAllNotificationsRead = api.markAllNotificationsRead;


// ─── Types ───────────────────────────────────────────────────────────────────
export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

export interface KPI {
  autoScore: number;
  leadMetrics?: {
    communication: number;
    teamwork: number;
    discipline: number;
    initiative: number;
  };
  leadMetricsArr?: { id: number; name: string; score: number; max_score: number }[];
  leadScore: number;
  finalScore: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ─── Manager types ──────────────────────────────────

export interface ManagerStats {
  totalEmployees: number;
  totalTeamLeads: number;
  totalTeams: number;
  avgKpi: number;
  pendingKpis: number;
}

export interface MonthlyKpi {
  month_label: string;
  month_key: string;
  avg_score: number;
  count: number;
}

export interface TeamKpi {
  team_id: number;
  team_name: string;
  avg_score: number;
  member_count: number;
  finalized: number;
}

export interface EmployeeRow {
  id: number;
  name: string;
  email: string;
  team_id: number | null;
  team_name: string | null;
  team_lead_name: string | null;
  auto_score: number;
  final_score: number;
  communication: number;
  teamwork: number;
  discipline: number;
  initiative: number;
  lead_score: number;
  kpi_status: 'pending' | 'draft' | 'finalized';
}

export interface TeamLeadRow {
  id: number;
  name: string;
  email: string;
  team_id: number | null;
  team_name: string | null;
  member_count: number;
  auto_score: number;
  final_score: number;
  communication: number;
  teamwork: number;
  discipline: number;
  initiative: number;
  lead_score: number;
  kpi_status: 'pending' | 'draft' | 'finalized';
}

export interface TeamOption {
  id: number;
  team_name: string;
  lead_name: string | null;
  member_count: number;
}

export interface KpiMetric {
  id: number;
  metric_name: string;
  max_score: number;
}

export interface ManagerKpiPayload {
  userId: number;
  autoScore: number;
  metricScores: { metricId: number; score: number }[];
  saveDraft: boolean;
}

export interface EvaluateLeadPayload {
  teamLeadId: number;
  metricScores: { metricId: number; score: number }[];
  saveDraft: boolean;
}

// ─── Admin types ────────────────────────────────────────────────

export interface AdminStats {
  totalMembers: number;
  totalLeads: number;
  totalManagers: number;
  totalAdmins: number;
  totalTeams: number;
  activeMetrics: number;
}

export interface AdminMetric {
  id: number;
  metric_name: string;
  max_score: number;
  is_active: number;
  created_at: string;
}

// FIX: team_id is now a first-class typed field (was missing before,
// causing the Edit modal to open with team_id = undefined and the
// Team dropdown to appear empty).
export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: string;
  status: string;
  team_id: number | null;   // ← explicitly typed; backend now SELECTs u.team_id
  team_name: string | null;
  created_at: string;
}

export interface AdminTeam {
  id: number;
  name: string;
  status: 'Active' | 'Inactive';
  lead_id: number | null;
  lead_name: string | null;
  member_count: number;
  created_at?: string;
}
