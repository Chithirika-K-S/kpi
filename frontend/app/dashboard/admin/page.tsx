'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { api, AdminMetric, AdminUser, AdminTeam, AdminStats } from '@/lib/api';

// ── Local type aliases ────────────────────────────────────────────
type Metric = AdminMetric;
type Team = AdminTeam;
type Stats = AdminStats;

type Tab = 'overview' | 'metrics' | 'users' | 'teams';
const ROLES = ['Team Member', 'Team Lead', 'Manager', 'Admin'] as const;

// ── Small helpers ─────────────────────────────────────────────────
function Badge({ label, color }: { label: string; color: string }) {
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${color}`}>{label}</span>;
}
function RoleBadge({ role }: { role: string }) {
  const c =
    role === 'Admin'       ? 'bg-rose-50   text-rose-700   border-rose-200'   :
    role === 'Manager'     ? 'bg-violet-50 text-violet-700 border-violet-200' :
    role === 'Team Lead'   ? 'bg-sky-50    text-sky-700    border-sky-200'    :
                             'bg-slate-50  text-slate-600  border-slate-200';
  return <Badge label={role} color={c} />;
}
function StatusBadge({ status }: { status: string }) {
  return <Badge label={status}
    color={status === 'Active'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : 'bg-red-50 text-red-600 border-red-200'} />;
}

// ── Stat card ─────────────────────────────────────────────────────
function StatCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: string }) {
  return (
    <div className={`${color} rounded-2xl p-5 flex flex-col gap-1 border border-white/60 shadow-sm`}>
      <span className="text-2xl">{icon}</span>
      <span className="text-3xl font-extrabold text-slate-800">{value}</span>
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  );
}

// ── Modal shell ───────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-slate-800">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">&times;</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300";

// ─────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const router = useRouter();
  const [user,    setUser]    = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState<Tab>('overview');

  const [stats,   setStats]   = useState<Stats | null>(null);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [users,   setUsers]   = useState<AdminUser[]>([]);
  const [teams,   setTeams]   = useState<Team[]>([]);

  // search states
  const [userSearch, setUserSearch] = useState('');
  const [userRole,   setUserRole]   = useState('All');
  const [teamSearch, setTeamSearch] = useState('');
  const [teamStatus, setTeamStatus] = useState<'All' | 'Active' | 'Inactive'>('All');

  // modal states
  const [metricModal, setMetricModal] = useState<Partial<Metric> | null>(null);
  const [userModal,   setUserModal]   = useState<Partial<AdminUser & { password: string; team_id: number | null }> | null>(null);
  const [teamModal,   setTeamModal]   = useState<Partial<Team> | null>(null);
  const [err,         setErr]         = useState('');
  const [saving,      setSaving]      = useState(false);
  const [dataVer,     setDataVer]     = useState(0);
  const [teamsError,  setTeamsError]  = useState('');
  const refresh = () => setDataVer(v => v + 1);

  // ── Auth ──────────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { router.replace('/login'); return; }
    api.getMe()
      .then(({ user: me }) => {
        if (me.role !== 'Admin') { router.replace('/login'); return; }
        setUser(me);
      })
      .catch(() => { localStorage.removeItem('token'); router.replace('/login'); })
      .finally(() => setLoading(false));
  }, [router]);

  // ── Data ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    Promise.allSettled([
      api.getAdminStats(),
      api.getAdminMetrics(),
      api.getAdminUsers(),
      api.getAdminTeams(),
    ]).then(([s, m, u, t]) => {
      if (s.status === 'fulfilled') setStats(s.value);
      if (m.status === 'fulfilled') setMetrics(m.value.metrics);
      if (u.status === 'fulfilled') setUsers(u.value.users);
      if (t.status === 'fulfilled') {
        setTeams(t.value.teams ?? []);
        setTeamsError('');
      } else {
        const reason = (t as PromiseRejectedResult).reason;
        console.error('[Teams] fetch failed:', reason);
        setTeamsError(reason?.message ?? 'Failed to load teams from server.');
      }
    });
  }, [user, dataVer]);

  // ── Filtered lists ────────────────────────────────────────────
  const filteredUsers = useMemo(() => users.filter(u => {
    if (u.id === user?.id) return false; // hide the logged-in admin's own row
    const q = userSearch.toLowerCase();
    const matchQ = u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    const matchR = userRole === 'All' || u.role === userRole;
    return matchQ && matchR;
  }), [users, userSearch, userRole, user]);

  const filteredTeams = useMemo(() => teams.filter(t => {
    const matchName = t.name.toLowerCase().includes(teamSearch.toLowerCase());
    const matchStatus = teamStatus === 'All' || (t.status ?? 'Active') === teamStatus;
    return matchName && matchStatus;
  }), [teams, teamSearch, teamStatus]);

  const teamLeads = users.filter(u => u.role === 'Team Lead');

  // ── Active metrics count (for toggle guard) ───────────────────
  const activeMetricCount = useMemo(() => metrics.filter(m => m.is_active).length, [metrics]);

  // ── Metric CRUD ───────────────────────────────────────────────
  const saveMetric = async () => {
    if (!metricModal?.metric_name?.trim()) { setErr('Name is required'); return; }
    setSaving(true); setErr('');
    try {
      if (metricModal.id) {
        await api.updateAdminMetric(metricModal.id, {
          metric_name: metricModal.metric_name,
          max_score: metricModal.max_score ?? 5,
          is_active: metricModal.is_active ?? 1,
        });
      } else {
        await api.createAdminMetric({ metric_name: metricModal.metric_name, max_score: metricModal.max_score ?? 5 });
      }
      setMetricModal(null); refresh();
    } catch (e: any) { setErr(e.message); }
    finally { setSaving(false); }
  };

  // Toggle: Active→Inactive only allowed when >4 active metrics.
  // Inactive→Active always allowed.
  const toggleMetric = async (m: Metric) => {
    const goingInactive = m.is_active === 1;
    if (goingInactive && activeMetricCount <= 4) {
      alert('You need more than 4 active metrics before you can deactivate one. Add a new metric first.');
      return;
    }
    await api.updateAdminMetric(m.id, {
      metric_name: m.metric_name,
      max_score: m.max_score,
      is_active: goingInactive ? 0 : 1,
    });
    refresh();
  };

  // ── User CRUD ─────────────────────────────────────────────────
  const saveUser = async () => {
    if (!userModal?.name?.trim() || !userModal?.email?.trim() || !userModal?.role) {
      setErr('Name, email and role are required'); return;
    }
    if (!userModal.id && !userModal.password) { setErr('Password is required for new users'); return; }
    setSaving(true); setErr('');
    try {
      if (userModal.id) {
        await api.updateAdminUser(userModal.id, {
          name:    userModal.name,
          email:   userModal.email,
          role:    userModal.role,
          team_id: userModal.team_id !== undefined ? userModal.team_id : null,
        });
      } else {
        await api.createAdminUser({
          name:     userModal.name,
          email:    userModal.email,
          password: userModal.password!,
          role:     userModal.role,
          team_id:  userModal.team_id !== undefined ? userModal.team_id : null,
        });
      }
      setUserModal(null); refresh();
    } catch (e: any) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const toggleUserStatus = async (u: AdminUser) => {
    const next = u.status === 'Active' ? 'Inactive' : 'Active';
    try {
      await api.setAdminUserStatus(u.id, next);
      refresh();
    } catch (e: any) { alert(e.message); }
  };

  // ── Team CRUD ─────────────────────────────────────────────────
  const saveTeam = async () => {
    if (!teamModal?.name?.trim()) { setErr('Team name is required'); return; }
    setSaving(true); setErr('');
    try {
      if (teamModal.id) {
        await api.updateAdminTeam(teamModal.id, { name: teamModal.name, lead_id: teamModal.lead_id ?? null });
      } else {
        await api.createAdminTeam({ name: teamModal.name, lead_id: teamModal.lead_id ?? null });
      }
      setTeamModal(null); refresh();
    } catch (e: any) { setErr(e.message); }
    finally { setSaving(false); }
  };

  // ── Team status toggle (cascades to all members) ───────────────
  const toggleTeamStatus = async (t: Team) => {
    const next = (t.status ?? 'Active') === 'Active' ? 'Inactive' : 'Active';
    const msg = next === 'Inactive'
      ? `Deactivate "${t.name}"? All team members will also be set to Inactive.`
      : `Activate "${t.name}"? All team members will also be set to Active.`;
    if (!confirm(msg)) return;
    try {
      await api.setAdminTeamStatus(t.id, next);
      refresh();
    } catch (e: any) { alert(e.message); }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.replace('/login');
  };

  // ── Guards ────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
    </div>
  );

  const initials = user?.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() ?? '?';

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: 'overview', label: 'Overview',    icon: '🏠' },
    { key: 'metrics',  label: 'KPI Metrics', icon: '📐' },
    { key: 'users',    label: 'Users',       icon: '👥' },
    { key: 'teams',    label: 'Teams',       icon: '🏢' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 font-sans">

      {/* ── Navbar ────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-6 h-14 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <span className="text-sm font-bold text-slate-800">StackPulse</span>
          <span className="hidden sm:inline text-[11px] font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">Admin</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-bold">{initials}</div>
          <span className="hidden sm:block text-sm text-slate-600">{user?.name}</span>
          <button onClick={logout} className="text-xs text-slate-500 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg transition font-medium">Sign out</button>
        </div>
      </header>

      {/* Gradient accent bar */}
      <div className="h-0.5 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── Welcome banner ──────────────────────────────────────── */}
        <div className="bg-gradient-to-br from-indigo-600 to-violet-600 rounded-2xl px-6 py-5 flex items-center justify-between shadow-md overflow-hidden relative">
          <div className="absolute -top-8 -right-8 w-40 h-40 bg-white/10 rounded-full" />
          <div className="absolute -bottom-10 -right-20 w-52 h-52 bg-white/5 rounded-full" />
          <div className="relative">
            <p className="text-indigo-200 text-xs font-medium mb-1 uppercase tracking-wider">Admin Control Panel</p>
            <h1 className="text-2xl font-bold text-white">Welcome, {user?.name?.split(' ')[0]} 👋</h1>
            <p className="text-indigo-200 text-sm mt-1">
              {stats?.totalMembers ?? 0} members · {stats?.totalTeams ?? 0} teams · {stats?.activeMetrics ?? 0} active KPI metrics
            </p>
          </div>
          <div className="hidden md:flex flex-col items-center bg-white/20 backdrop-blur-sm rounded-xl px-5 py-3 text-white relative">
            <span className="text-3xl font-bold">
              {(stats?.totalMembers ?? 0) + (stats?.totalLeads ?? 0) + (stats?.totalManagers ?? 0)}
            </span>
            <span className="text-xs text-indigo-200 mt-0.5">Total Users</span>
          </div>
        </div>

        {/* ── Tabs ────────────────────────────────────────────────── */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit flex-wrap">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
                tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* ══ OVERVIEW ════════════════════════════════════════════════ */}
        {tab === 'overview' && (
          <section className="space-y-5">
            {stats && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatCard label="Team Members"   value={stats.totalMembers}  color="bg-indigo-50"  icon="👤" />
                <StatCard label="Team Leads"     value={stats.totalLeads}    color="bg-sky-50"     icon="🧑‍💼" />
                <StatCard label="Managers"       value={stats.totalManagers} color="bg-violet-50"  icon="💼" />
                <StatCard label="Admins"         value={stats.totalAdmins}   color="bg-rose-50"    icon="🔑" />
                <StatCard label="Teams"          value={stats.totalTeams}    color="bg-amber-50"   icon="🏢" />
                <StatCard label="Active Metrics" value={stats.activeMetrics} color="bg-emerald-50" icon="📐" />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { title: 'KPI Metrics', desc: 'Add, edit, enable or disable evaluation metrics. Changes reflect immediately for all evaluators.', tab: 'metrics' as Tab, gradient: 'from-emerald-500 to-teal-600', icon: '📐' },
                { title: 'User Management', desc: 'Create accounts for any role, edit details, and activate or deactivate user access.', tab: 'users' as Tab, gradient: 'from-indigo-500 to-violet-600', icon: '👥' },
                { title: 'Team Management', desc: 'Create teams, assign Team Leads, and organise your organisation structure.', tab: 'teams' as Tab, gradient: 'from-sky-500 to-indigo-500', icon: '🏢' },
              ].map(c => (
                <button key={c.tab} onClick={() => setTab(c.tab)}
                  className="text-left bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-slate-300 transition-all group">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${c.gradient} flex items-center justify-center text-xl mb-3 group-hover:scale-105 transition-transform`}>
                    {c.icon}
                  </div>
                  <p className="font-semibold text-slate-800 mb-1">{c.title}</p>
                  <p className="text-xs text-slate-500 leading-relaxed">{c.desc}</p>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ══ KPI METRICS ═════════════════════════════════════════════ */}
        {tab === 'metrics' && (
          <section className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-800">KPI Metrics Configuration</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Manage evaluation metrics. You must have more than 4 active metrics to deactivate one.
                  Currently <span className="font-semibold text-slate-600">{activeMetricCount} active</span>.
                </p>
              </div>
              <button
                onClick={() => { setErr(''); setMetricModal({ metric_name: '', max_score: 5, is_active: 1 }); }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition shadow-sm">
                + Add Metric
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">#</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Metric Name</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">Max Score</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {metrics.map((m, i) => {
                    const canDeactivate = activeMetricCount > 4;
                    return (
                      <tr key={m.id} className="hover:bg-slate-50/60 transition">
                        <td className="px-4 py-3 text-slate-400 text-xs">{i + 1}</td>
                        <td className="px-4 py-3 font-medium text-slate-800">{m.metric_name}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded-lg text-sm">{m.max_score}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {m.is_active ? (
                            <button
                              onClick={() => canDeactivate ? toggleMetric(m) : alert('Add more than 4 active metrics before deactivating one.')}
                              title={canDeactivate ? 'Click to deactivate' : 'Need more than 4 active metrics to deactivate'}
                              className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border transition ${
                                canDeactivate
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 cursor-pointer'
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200 cursor-not-allowed opacity-70'
                              }`}>
                              Active {!canDeactivate && '🔒'}
                            </button>
                          ) : (
                            <button
                              onClick={() => toggleMetric(m)}
                              title="Click to activate"
                              className="text-[10px] font-semibold px-2.5 py-1 rounded-full border transition bg-slate-50 text-slate-500 border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 cursor-pointer">
                              Inactive
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => { setErr(''); setMetricModal({ ...m }); }}
                            className="text-xs px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-semibold transition">
                            Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {metrics.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400 text-sm">No metrics yet. Add one above.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
              <strong>ℹ️ Note:</strong> Inactive metrics are hidden from evaluation forms. You need more than 4 active metrics to deactivate one — add a new metric first, then deactivate the old one.
            </div>
          </section>
        )}

        {/* ══ USERS ═══════════════════════════════════════════════════ */}
        {tab === 'users' && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 justify-between">
              <div className="flex flex-wrap gap-3 items-center">
                <input value={userSearch} onChange={e => setUserSearch(e.target.value)}
                  placeholder="Search name or email…"
                  className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                <select value={userRole} onChange={e => setUserRole(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200">
                  <option value="All">All Roles</option>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <span className="text-xs text-slate-400">{filteredUsers.length} results</span>
              </div>
              <button onClick={() => { setErr(''); setUserModal({ name: '', email: '', password: '', role: 'Team Member', team_id: null }); }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition shadow-sm">
                + Add User
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">User</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase hidden sm:table-cell">Role</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase hidden md:table-cell">Team</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredUsers.map(u => {
                    const teamId: number | null = (u as any).team_id ?? null;
                    return (
                      <tr key={u.id} className={`hover:bg-slate-50/60 transition ${u.status === 'Inactive' ? 'opacity-60' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-bold shrink-0">
                              {u.name.charAt(0)}
                            </div>
                            <div>
                              <p className="font-medium text-slate-800">{u.name}</p>
                              <p className="text-[11px] text-slate-400">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell"><RoleBadge role={u.role} /></td>
                        <td className="px-4 py-3 text-slate-500 text-xs hidden md:table-cell">{u.team_name ?? '—'}</td>
                        <td className="px-4 py-3 text-center"><StatusBadge status={u.status ?? 'Active'} /></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                            <button
                              onClick={() => {
                                setErr('');
                                setUserModal({
                                  id:      u.id,
                                  name:    u.name,
                                  email:   u.email,
                                  role:    u.role,
                                  status:  u.status,
                                  team_id: teamId,
                                });
                              }}
                              className="text-[11px] px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-semibold transition">
                              Edit
                            </button>
                            <button onClick={() => toggleUserStatus(u)}
                              className={`text-[11px] px-2 py-1 rounded-lg font-semibold transition ${
                                u.status === 'Active'
                                  ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              }`}>
                              {u.status === 'Active' ? 'Deactivate' : 'Activate'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredUsers.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400 text-sm">No users found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ══ TEAMS ═══════════════════════════════════════════════════ */}
        {tab === 'teams' && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 justify-between">
              <div className="flex flex-wrap gap-3 items-center">
                <input value={teamSearch} onChange={e => setTeamSearch(e.target.value)}
                  placeholder="Search teams…"
                  className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-amber-200" />
                {(['All', 'Active', 'Inactive'] as const).map(s => (
                  <button key={s} onClick={() => setTeamStatus(s)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
                      teamStatus === s ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                    }`}>{s}</button>
                ))}
                <span className="text-xs text-slate-400">{filteredTeams.length} results</span>
              </div>
              <button onClick={() => { setErr(''); setTeamModal({ name: '', lead_id: undefined }); }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition shadow-sm">
                + Add Team
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {teamsError && (
                <div className="col-span-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700">
                  <strong>⚠️ Could not load teams:</strong> {teamsError}
                </div>
              )}
              {filteredTeams.map(t => (
                <div key={t.id} className={`bg-white rounded-2xl border shadow-sm p-5 flex flex-col gap-3 transition ${
                  (t.status ?? 'Active') === 'Inactive' ? 'border-slate-200 opacity-60' : 'border-slate-200'
                }`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-slate-800">{t.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">Lead: {t.lead_name ?? 'Unassigned'}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <StatusBadge status={t.status ?? 'Active'} />
                      <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                        {t.member_count} members
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => { setErr(''); setTeamModal({ ...t }); }}
                      className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition">
                      Edit
                    </button>
                    <button onClick={() => toggleTeamStatus(t)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition ${
                        (t.status ?? 'Active') === 'Active'
                          ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                          : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      }`}>
                      {(t.status ?? 'Active') === 'Active' ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </div>
              ))}
              {filteredTeams.length === 0 && (
                <div className="col-span-3 text-center py-10 text-slate-400 text-sm">No teams yet. Add one above.</div>
              )}
            </div>
          </section>
        )}
      </main>

      {/* ══ METRIC MODAL ══════════════════════════════════════════════ */}
      {metricModal && (
        <Modal title={metricModal.id ? 'Edit Metric' : 'Add Metric'} onClose={() => setMetricModal(null)}>
          <div className="space-y-4">
            <Field label="Metric Name">
              <input value={metricModal.metric_name ?? ''} onChange={e => setMetricModal(p => ({ ...p!, metric_name: e.target.value }))}
                placeholder="e.g. Communication" className={inputCls} />
            </Field>
            <Field label="Max Score (per evaluator)">
              <input type="number" min={1} max={100}
                value={metricModal.max_score ?? 5}
                onChange={e => setMetricModal(p => ({ ...p!, max_score: Number(e.target.value) }))}
                className={inputCls} />
            </Field>
            {metricModal.id && (
              <Field label="Status">
                <select value={metricModal.is_active ?? 1}
                  onChange={e => setMetricModal(p => ({ ...p!, is_active: Number(e.target.value) }))}
                  className={inputCls}>
                  <option value={1}>Active</option>
                  <option value={0}>Inactive</option>
                </select>
              </Field>
            )}
            {err && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{err}</p>}
            <div className="flex gap-3 pt-1">
              <button onClick={() => setMetricModal(null)} className="flex-1 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition">Cancel</button>
              <button onClick={saveMetric} disabled={saving}
                className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition disabled:opacity-50">
                {saving ? 'Saving…' : (metricModal.id ? 'Update' : 'Create')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ══ USER MODAL ════════════════════════════════════════════════ */}
      {userModal && (
        <Modal title={userModal.id ? 'Edit User' : 'Add User'} onClose={() => { setUserModal(null); setErr(''); }}>
          <div className="space-y-4">
            <Field label="Full Name">
              <input value={userModal.name ?? ''} onChange={e => setUserModal(p => ({ ...p!, name: e.target.value }))}
                placeholder="Jane Doe" className={inputCls} />
            </Field>
            <Field label="Email">
              <input type="email" value={userModal.email ?? ''} onChange={e => setUserModal(p => ({ ...p!, email: e.target.value }))}
                placeholder="jane@company.com" className={inputCls} />
            </Field>
            {!userModal.id && (
              <Field label="Password">
                <input type="password" value={(userModal as any).password ?? ''}
                  onChange={e => setUserModal(p => ({ ...p!, password: e.target.value } as any))}
                  placeholder="••••••••" className={inputCls} />
              </Field>
            )}
            <Field label="Role">
              <select value={userModal.role ?? 'Team Member'} onChange={e => setUserModal(p => ({ ...p!, role: e.target.value }))}
                className={inputCls}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Team (optional)">
              <select
                value={userModal.team_id ?? ''}
                onChange={e => setUserModal(p => ({ ...p!, team_id: e.target.value ? Number(e.target.value) : null }))}
                className={inputCls}>
                <option value="">— No Team —</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            {err && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{err}</p>}
            <div className="flex gap-3 pt-1">
              <button onClick={() => { setUserModal(null); setErr(''); }} className="flex-1 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition">Cancel</button>
              <button onClick={saveUser} disabled={saving}
                className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition disabled:opacity-50">
                {saving ? 'Saving…' : (userModal.id ? 'Update' : 'Create')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ══ TEAM MODAL ════════════════════════════════════════════════ */}
      {teamModal && (
        <Modal title={teamModal.id ? 'Edit Team' : 'Add Team'} onClose={() => { setTeamModal(null); setErr(''); }}>
          <div className="space-y-4">
            <Field label="Team Name">
              <input value={teamModal.name ?? ''} onChange={e => setTeamModal(p => ({ ...p!, name: e.target.value }))}
                placeholder="e.g. Alpha Squad" className={inputCls} />
            </Field>
            <Field label="Team Lead (optional)">
              <select value={teamModal.lead_id ?? ''}
                onChange={e => setTeamModal(p => ({ ...p!, lead_id: e.target.value ? Number(e.target.value) : undefined }))}
                className={inputCls}>
                <option value="">— No Lead —</option>
                {teamLeads.map(tl => <option key={tl.id} value={tl.id}>{tl.name}</option>)}
              </select>
            </Field>
            {err && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{err}</p>}
            <div className="flex gap-3 pt-1">
              <button onClick={() => { setTeamModal(null); setErr(''); }} className="flex-1 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition">Cancel</button>
              <button onClick={saveTeam} disabled={saving}
                className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition disabled:opacity-50">
                {saving ? 'Saving…' : (teamModal.id ? 'Update' : 'Create')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
