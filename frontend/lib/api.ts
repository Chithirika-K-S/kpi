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

  // ─── Notifications ────────────────────────────────────────────
  getNotifications: (tlId: number) =>
    apiFetch<any>(`/api/notifications/${tlId}`),

  markNotificationRead: (id: number) =>
    apiFetch<any>(`/api/notifications/${id}/read`, { method: 'PATCH' }),

  markAllNotificationsRead: (tlId: number) =>
    apiFetch<any>(`/api/notifications/${tlId}/read-all`, { method: 'PATCH' }),

};


// ─── Named exports so `import * as api` resolves each function ──────────────
// EvalModal, MemberCard, NotificationBell all use:  import * as api from "@/lib/api"
// They then call e.g. api.finalizeKPI(...)  — these named exports satisfy that.
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
  leadScore: number;
  finalScore: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
