'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  api, User, ManagerStats, MonthlyKpi, TeamKpi,
  EmployeeRow, TeamLeadRow, TeamOption, ManagerKpiPayload, EvaluateLeadPayload
} from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────
type Tab = 'analytics' | 'employees' | 'teamleads';
type StatusFilter = 'all' | 'finalized' | 'draft' | 'pending';

// ─── SVG Line chart (pure SVG, no deps) ────────────────────────
function LineChart({ data, label }: { data: MonthlyKpi[]; label: string }) {
  const W = 560, H = 140, PL = 32, PR = 8, PT = 12, PB = 24;
  const chartW = W - PL - PR;
  const chartH = H - PT - PB;
  const scores = data.map(d => Number(d.avg_score));
  const max = Math.max(...scores, 1);

  // Compute (x, y) for each data point
  const points = scores.map((s, i) => ({
    x: PL + (scores.length <= 1 ? chartW / 2 : (i / (scores.length - 1)) * chartW),
    y: PT + chartH - (s / 100) * chartH,
    score: s,
    label: data[i]?.month_label ?? '',
  }));

  const polyline = points.map(p => `${p.x},${p.y}`).join(' ');

  // Smooth area fill path
  const areaPath = points.length
    ? `M${points[0].x},${PT + chartH} L${points[0].x},${points[0].y} ` +
      points.slice(1).map(p => `L${p.x},${p.y}`).join(' ') +
      ` L${points[points.length - 1].x},${PT + chartH} Z`
    : '';

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 160 }} overflow="visible">
        <defs>
          <linearGradient id="lineAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#818cf8" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#818cf8" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Grid lines at 0 / 25 / 50 / 75 / 100 */}
        {[0, 25, 50, 75, 100].map(v => {
          const y = PT + chartH - (v / 100) * chartH;
          return (
            <g key={v}>
              <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="#e2e8f0" strokeWidth={1} strokeDasharray="4 3" />
              <text x={PL - 4} y={y + 3.5} textAnchor="end" fontSize={8} fill="#94a3b8">{v}</text>
            </g>
          );
        })}

        {/* Area fill */}
        {areaPath && <path d={areaPath} fill="url(#lineAreaGrad)" />}

        {/* Line */}
        {points.length > 1 && (
          <polyline
            points={polyline}
            fill="none"
            stroke="url(#lineGrad)"
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        <defs>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="#6d28d9" />
            <stop offset="100%" stopColor="#818cf8" />
          </linearGradient>
        </defs>

        {/* Data points + tooltips */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={4} fill="#fff" stroke="#6d28d9" strokeWidth={2} />
            {/* Invisible hover target */}
            <circle cx={p.x} cy={p.y} r={10} fill="transparent">
              <title>{p.label}: {p.score}/100</title>
            </circle>
            {/* X-axis labels */}
            <text x={p.x} y={H - 4} textAnchor="middle" fontSize={7.5} fill="#94a3b8">
              {p.label.split(' ')[0]}
            </text>
            <text x={p.x} y={H + 5} textAnchor="middle" fontSize={6.5} fill="#cbd5e1">
              {p.label.split(' ')[1]}
            </text>
          </g>
        ))}

        {data.length === 0 && (
          <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={12} fill="#94a3b8">No data available yet.</text>
        )}
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-2 mt-1">
        <div className="w-6 h-0.5 rounded-full" style={{ background: 'linear-gradient(to right, #6d28d9, #818cf8)' }} />
        <span className="text-xs text-slate-500">{label}</span>
      </div>
    </div>
  );
}

// ─── Horizontal team bar chart ────────────────────────────────────
function TeamChart({ data }: { data: TeamKpi[] }) {
  const max = Math.max(...data.map(d => d.avg_score ?? 0), 1);
  return (
    <div className="space-y-3">
      {data.map(t => (
        <div key={t.team_id} className="flex items-center gap-3">
          <span className="text-xs text-slate-600 w-28 truncate shrink-0">{t.team_name}</span>
          <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all"
              style={{ width: `${((t.avg_score ?? 0) / max) * 100}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-slate-700 w-10 text-right shrink-0">
            {t.avg_score ?? 0}
          </span>
          <span className="text-[10px] text-slate-400 w-16 text-right shrink-0">
            {t.member_count} members
          </span>
        </div>
      ))}
      {data.length === 0 && <p className="text-slate-400 text-sm">No team data yet.</p>}
    </div>
  );
}

// ─── KPI status badge ──────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const s = (status ?? '').toLowerCase();
  const cls =
    s === 'finalized' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
    s === 'draft'     ? 'bg-amber-50  text-amber-700  border-amber-200'     :
                        'bg-slate-50  text-slate-500  border-slate-200';
  const label = s.charAt(0).toUpperCase() + s.slice(1) || 'Pending';
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
      {label}
    </span>
  );
}

// ─── Metric row inside modal ───────────────────────────────────────
function MetricRow({
  label, value, max, onChange
}: { label: string; value: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-4">
      <span className="text-sm text-slate-700 w-36 shrink-0">{label}</span>
      <input
        type="range" min={0} max={max} step={1} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="flex-1 accent-indigo-600"
      />
      <span className="text-sm font-bold text-indigo-700 w-10 text-right">{value}/{max}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// KPI Modal  (Evaluate KPI = Pending/Draft  |  Edit KPI = Finalized)
// ─────────────────────────────────────────────────────────────────
interface KpiModalProps {
  person: EmployeeRow | TeamLeadRow;
  mode: 'evaluate' | 'edit';       // evaluate = pending/draft, edit = finalized
  onClose: () => void;
  onSaved: () => void;
}

function KpiModal({ person, mode, onClose, onSaved }: KpiModalProps) {
  // Parse everything as integers upfront to avoid float arithmetic issues
  const [autoScore,     setAutoScore]     = useState(Math.round(Number(person.auto_score)      ?? 0));
  const [communication, setCommunication] = useState(Math.round(Number(person.communication)  ?? 0));
  const [teamwork,      setTeamwork]      = useState(Math.round(Number(person.teamwork)        ?? 0));
  const [discipline,    setDiscipline]    = useState(Math.round(Number(person.discipline)      ?? 0));
  const [initiative,    setInitiative]    = useState(Math.round(Number(person.initiative)      ?? 0));
  const [saving,        setSaving]        = useState(false);
  const [err,           setErr]           = useState('');

  // Integer arithmetic only – no floating point surprises
  const leadScore  = communication + teamwork + discipline + initiative;  // 0–20
  const finalScore = Math.min(autoScore + leadScore, 100);                // 0–100

  const handleSave = async (saveDraft: boolean) => {
    setSaving(true); setErr('');
    try {
      await api.managerAssignKpi({
        userId       : person.id,
        autoScore,
        communication,
        teamwork,
        discipline,
        initiative,
        saveDraft,
      });
      onSaved();
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const title     = mode === 'evaluate' ? 'Evaluate KPI' : 'Edit KPI';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-lg font-bold text-indigo-700">{title}</h3>
            <p className="text-sm text-slate-500">{person.name}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">&times;</button>
        </div>

        <div className="space-y-5">

          {/* System score (out of 80) */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">System Score (out of 80)</p>
            <div className="flex items-center gap-4">
              <input
                type="number" min={0} max={80}
                value={autoScore}
                onChange={e => setAutoScore(Math.min(80, Math.max(0, Math.round(Number(e.target.value)))))}
                className="w-24 border border-slate-200 rounded-lg px-3 py-2 text-sm text-center font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
              <span className="text-sm text-slate-400">/ 80</span>
              <div className="flex-1 bg-slate-100 rounded-full h-2">
                <div className="h-full bg-indigo-400 rounded-full transition-all" style={{ width: `${(autoScore / 80) * 100}%` }} />
              </div>
            </div>
          </div>

          {/* Manual metrics (out of 20 total) */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              Manual Evaluation — <span className="text-indigo-600">{leadScore}/20</span>
            </p>
            <div className="space-y-3 bg-slate-50 rounded-xl p-4">
              <MetricRow label="Communication" value={communication} max={5} onChange={v => setCommunication(Math.round(v))} />
              <MetricRow label="Teamwork"      value={teamwork}      max={5} onChange={v => setTeamwork(Math.round(v))}      />
              <MetricRow label="Discipline"    value={discipline}    max={5} onChange={v => setDiscipline(Math.round(v))}    />
              <MetricRow label="Initiative"    value={initiative}    max={5} onChange={v => setInitiative(Math.round(v))}    />
            </div>
          </div>

          {/* Live final score preview */}
          <div className="flex items-center justify-between bg-indigo-50 rounded-xl px-4 py-3">
            <div>
              <p className="text-sm text-slate-600">Calculated Final KPI</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{autoScore} (system) + {leadScore} (manual)</p>
            </div>
            <span className="text-2xl font-extrabold text-indigo-700">
              {finalScore}<span className="text-sm font-normal text-slate-400">/100</span>
            </span>
          </div>

          {err && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{err}</p>}

          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              onClick={() => handleSave(true)}
              disabled={saving}
              className="flex-1 py-2 rounded-xl border border-amber-300 text-sm font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 transition disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Draft'}
            </button>
            <button
              onClick={() => handleSave(false)}
              disabled={saving}
              className="flex-1 py-2 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save KPI'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Team Lead Evaluate Modal
// ─────────────────────────────────────────────────────────────────
interface EvalModalProps {
  lead: TeamLeadRow;
  onClose: () => void;
  onSaved: () => void;
}

function EvalModal({ lead, onClose, onSaved }: EvalModalProps) {
  const [communication,setCommunication] = useState(lead.communication ?? 0);
  const [teamwork,     setTeamwork]      = useState(lead.teamwork      ?? 0);
  const [discipline,   setDiscipline]    = useState(lead.discipline    ?? 0);
  const [initiative,   setInitiative]    = useState(lead.initiative    ?? 0);
  const [saving,       setSaving]        = useState(false);
  const [err,          setErr]           = useState('');

  const totalManual = communication + teamwork + discipline + initiative;

  const handleSave = async (saveDraft: boolean) => {
    setSaving(true); setErr('');
    try {
      await api.managerEvaluateTeamLead({ teamLeadId: lead.id, communication, teamwork, discipline, initiative, saveDraft });
      onSaved(); onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-lg font-bold text-violet-700">Evaluate Team Lead</h3>
            <p className="text-sm text-slate-500">{lead.name} &middot; {lead.team_name ?? 'No Team'}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">&times;</button>
        </div>

        <div className="space-y-4">
          <div className="bg-slate-50 rounded-xl p-4 space-y-3">
            <MetricRow label="Communication" value={communication} max={5} onChange={setCommunication} />
            <MetricRow label="Teamwork"      value={teamwork}      max={5} onChange={setTeamwork}      />
            <MetricRow label="Discipline"    value={discipline}    max={5} onChange={setDiscipline}    />
            <MetricRow label="Initiative"    value={initiative}    max={5} onChange={setInitiative}    />
          </div>

          <div className="flex items-center justify-between bg-violet-50 rounded-xl px-4 py-3">
            <span className="text-sm text-slate-600">Manual Score</span>
            <span className="text-xl font-extrabold text-violet-700">{totalManual}<span className="text-sm font-normal text-slate-400">/20</span></span>
          </div>

          {err && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{err}</p>}

          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition">Cancel</button>
            <button
              onClick={() => handleSave(true)} disabled={saving}
              className="flex-1 py-2 rounded-xl border border-amber-300 text-sm font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 transition disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Draft'}
            </button>
            <button
              onClick={() => handleSave(false)} disabled={saving}
              className="flex-1 py-2 rounded-xl text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 transition disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save KPI'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
// MAIN MANAGER DASHBOARD
// ═════════════════════════════════════════════════════════════════
export default function ManagerDashboard() {
  const router = useRouter();
  const [user,     setUser]     = useState<User | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [tab,      setTab]      = useState<Tab>('analytics');

  // ── data ──────────────────────────────────────────
  const [stats,     setStats]     = useState<ManagerStats | null>(null);
  const [teamKpis,  setTeamKpis]  = useState<TeamKpi[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [teamLeads, setTeamLeads] = useState<TeamLeadRow[]>([]);
  const [teams,     setTeams]     = useState<TeamOption[]>([]);

  // ── filters ───────────────────────────────────────
  const [empSearch,     setEmpSearch]     = useState('');
  const [empTeam,       setEmpTeam]       = useState('All');
  const [empStatus,     setEmpStatus]     = useState<StatusFilter>('all');
  const [tlSearch,      setTlSearch]      = useState('');
  const [tlStatus,      setTlStatus]      = useState<StatusFilter>('all');

  // chart filter: 'all' | team_id as string
  const [chartFilter,   setChartFilter]   = useState<string>('all');
  const [chartLoading,  setChartLoading]  = useState(false);
  const [chartData,     setChartData]     = useState<MonthlyKpi[]>([]);

  // ── modals ────────────────────────────────────────
  const [kpiModal,  setKpiModal]  = useState<{ person: EmployeeRow | TeamLeadRow; mode: 'evaluate' | 'edit' } | null>(null);
  const [evalModal, setEvalModal] = useState<TeamLeadRow | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const refresh = () => setDataVersion(v => v + 1);

  // ── Auth ──────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { router.replace('/login'); return; }
    (async () => {
      try {
        const { user: me } = await api.getMe();
        if (me.role !== 'Manager') { router.replace('/login'); return; }
        setUser(me);
      } catch {
        localStorage.removeItem('token');
        router.replace('/login');
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  // ── Fetch all data ────────────────────────────────
  useEffect(() => {
    if (!user) return;
    (async () => {
      const [s, t, e, tl, teams] = await Promise.allSettled([
        api.getManagerStats(),
        api.getManagerTeamAnalytics(),
        api.getManagerEmployees(),
        api.getManagerTeamLeads(),
        api.getManagerTeams(),
      ]);
      if (s.status     === 'fulfilled') setStats(s.value);
      if (t.status     === 'fulfilled') setTeamKpis(t.value.teams);
      if (e.status     === 'fulfilled') setEmployees(e.value.employees);
      if (tl.status    === 'fulfilled') setTeamLeads(tl.value.teamLeads);
      if (teams.status === 'fulfilled') setTeams(teams.value.teams);
    })();
  }, [user, dataVersion]);

  // ── Fetch chart data whenever filter changes or user loads ──
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setChartLoading(true);
    api.getManagerMonthly(chartFilter)
      .then(res => { if (!cancelled) setChartData(res.monthly); })
      .catch(() => { if (!cancelled) setChartData([]); })
      .finally(() => { if (!cancelled) setChartLoading(false); });
    return () => { cancelled = true; };
  }, [user, chartFilter]);

  // ── Filtered lists ────────────────────────────────
  const filteredEmployees = useMemo(() => employees.filter(e => {
    const matchSearch = e.name.toLowerCase().includes(empSearch.toLowerCase()) ||
                        e.email.toLowerCase().includes(empSearch.toLowerCase());
    const matchTeam   = empTeam === 'All' || e.team_name === empTeam;
    const matchStatus = empStatus === 'all' || (e.kpi_status ?? 'pending').toLowerCase() === empStatus;
    return matchSearch && matchTeam && matchStatus;
  }), [employees, empSearch, empTeam, empStatus]);

  const filteredTeamLeads = useMemo(() => teamLeads.filter(tl => {
    const matchSearch = tl.name.toLowerCase().includes(tlSearch.toLowerCase()) ||
                        tl.email.toLowerCase().includes(tlSearch.toLowerCase());
    const matchStatus = tlStatus === 'all' || (tl.kpi_status ?? 'pending').toLowerCase() === tlStatus;
    return matchSearch && matchStatus;
  }), [teamLeads, tlSearch, tlStatus]);

  const filteredTeamKpis = useMemo(() => {
    if (chartFilter === 'all') return teamKpis;
    return teamKpis.filter(t => String(t.team_id) === chartFilter);
  }, [teamKpis, chartFilter]);

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.replace('/login');
  };

  // ── Loading / error guards ────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
    </div>
  );
  if (error) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <p className="text-sm text-red-500">{error}</p>
    </div>
  );

  const initials = user?.name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase() ?? '?';

  return (
    <div className="min-h-screen bg-slate-50 font-sans">

      {/* ── Navbar ──────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-6 h-14 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          </div>
          <span className="text-sm font-bold text-slate-800">StackPulse</span>
          <span className="hidden sm:inline text-[11px] font-medium text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">Manager</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 text-xs font-bold">{initials}</div>
          <span className="hidden sm:block text-sm text-slate-600">{user?.name}</span>
          <button onClick={logout} className="text-xs text-slate-500 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg transition font-medium">Sign out</button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── Welcome banner ──────────────────────────────── */}
        <div className="bg-gradient-to-br from-violet-600 to-indigo-600 rounded-2xl px-6 py-5 flex items-center justify-between shadow-md overflow-hidden relative">
          <div className="absolute -top-8 -right-8 w-40 h-40 bg-white/10 rounded-full" />
          <div className="absolute -bottom-10 -right-20 w-52 h-52 bg-white/5 rounded-full" />
          <div className="relative">
            <p className="text-violet-200 text-xs font-medium mb-1 uppercase tracking-wider">Manager View · Organization-wide</p>
            <h1 className="text-2xl font-bold text-white">Welcome back, {user?.name?.split(' ')[0]} 👋</h1>
            <p className="text-violet-200 text-sm mt-1">
              {stats?.totalEmployees ?? 0} employees &middot; {stats?.totalTeams ?? 0} teams &middot; {stats?.pendingKpis ?? 0} KPIs pending
            </p>
          </div>
          <div className="hidden md:flex flex-col items-center bg-white/20 backdrop-blur-sm rounded-xl px-5 py-3 text-white relative">
            <span className="text-3xl font-bold">{stats?.avgKpi ?? 0}</span>
            <span className="text-xs text-violet-200 mt-0.5">Org Avg KPI</span>
          </div>
        </div>

        {/* ── Stat cards ──────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Employees',    value: stats?.totalEmployees ?? 0, color: 'text-indigo-600',  bg: 'bg-indigo-50'  },
            { label: 'Team Leads',   value: stats?.totalTeamLeads ?? 0, color: 'text-violet-600',  bg: 'bg-violet-50'  },
            { label: 'Teams',        value: stats?.totalTeams     ?? 0, color: 'text-sky-600',     bg: 'bg-sky-50'     },
            { label: 'Avg KPI',      value: stats?.avgKpi         ?? 0, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Pending KPIs', value: stats?.pendingKpis    ?? 0, color: 'text-rose-600',    bg: 'bg-rose-50'    },
          ].map(c => (
            <div key={c.label} className={`${c.bg} rounded-xl p-4 flex flex-col gap-1 border border-white shadow-sm`}>
              <span className={`text-2xl font-extrabold ${c.color}`}>{c.value}</span>
              <span className="text-xs text-slate-500">{c.label}</span>
            </div>
          ))}
        </div>

        {/* ── Tabs ──────────────────────────────────────────── */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
          {([
            { key: 'analytics',  label: '📊 Analytics'   },
            { key: 'employees',  label: '👥 Employees'   },
            { key: 'teamleads',  label: '🧑‍💼 Team Leads' },
          ] as { key: Tab; label: string }[]).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-5 py-1.5 rounded-lg text-sm font-medium transition ${
                tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ══ ANALYTICS TAB ══════════════════════════════════ */}
        {tab === 'analytics' && (
          <section className="space-y-5">

            {/* Monthly trend card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

              {/* Card header with filter pills */}
              <div className="px-6 pt-5 pb-4 border-b border-slate-100">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-800">Monthly KPI Trend</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Average KPI score over the last 12 months</p>
                  </div>
                  {/* Filter pills */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Organisation-wide pill */}
                    <button
                      onClick={() => setChartFilter('all')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                        chartFilter === 'all'
                          ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300 hover:text-violet-600'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-current opacity-70" />
                      Organisation
                    </button>
                    {/* One pill per team */}
                    {teams.map((t, idx) => {
                      const colors = [
                        { active: 'bg-indigo-600 text-white border-indigo-600', dot: 'bg-white' },
                        { active: 'bg-emerald-600 text-white border-emerald-600', dot: 'bg-white' },
                      ];
                      const c = colors[idx % colors.length];
                      const isActive = chartFilter === String(t.id);
                      return (
                        <button
                          key={t.id}
                          onClick={() => setChartFilter(String(t.id))}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                            isActive
                              ? `${c.active} shadow-sm`
                              : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                          }`}
                        >
                          <span className={`w-2 h-2 rounded-full ${isActive ? c.dot : 'bg-slate-400'}`} />
                          {t.team_name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Chart body */}
              <div className="px-6 py-5">
                {chartLoading ? (
                  <div className="flex items-center justify-center" style={{ height: 180 }}>
                    <div className="w-7 h-7 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
                  </div>
                ) : (
                  <LineChart
                    data={chartData}
                    label={
                      chartFilter === 'all'
                        ? 'Organisation-wide average'
                        : `${teams.find(t => String(t.id) === chartFilter)?.team_name ?? 'Team'} average`
                    }
                  />
                )}
              </div>

              {/* Footer stats row */}
              {!chartLoading && chartData.length > 0 && (() => {
                const scores = chartData.map(d => Number(d.avg_score));
                const peak   = Math.max(...scores);
                const low    = Math.min(...scores);
                const latest = scores[scores.length - 1];
                const prev   = scores[scores.length - 2] ?? latest;
                const trend  = latest >= prev ? '↑' : '↓';
                const trendColor = latest >= prev ? 'text-emerald-600' : 'text-rose-500';
                return (
                  <div className="grid grid-cols-3 border-t border-slate-100">
                    {[
                      { label: 'Latest Month', value: `${latest}`, unit: '/100' },
                      { label: 'Peak Score',   value: `${peak}`,   unit: '/100' },
                      { label: 'Trend',        value: trend,       unit: latest >= prev ? 'Improving' : 'Declining', special: trendColor },
                    ].map(s => (
                      <div key={s.label} className="flex flex-col items-center py-4 gap-0.5">
                        <span className={`text-xl font-extrabold ${s.special ?? 'text-slate-800'}`}>{s.value}</span>
                        <span className="text-[10px] text-slate-400">{s.label}</span>
                        <span className="text-[10px] text-slate-300">{s.unit}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Team comparison + org distribution in a row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

              {/* Team breakdown */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
                <h3 className="text-base font-semibold text-slate-800 mb-1">Team KPI Comparison</h3>
                <p className="text-xs text-slate-400 mb-4">Average finalized KPI per team</p>
                <TeamChart data={filteredTeamKpis} />
              </div>

              {/* Distribution tiles */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
                <h3 className="text-base font-semibold text-slate-800 mb-4">Organisation Performance</h3>
                <div className="space-y-3">
                  {(() => {
                    const highPerformers = employees.filter(e => Number(e.final_score) >= 80);
                    const avgPerformers  = employees.filter(e => Number(e.final_score) >= 50 && Number(e.final_score) < 80);
                    const belowTarget    = employees.filter(e => Number(e.final_score) > 0 && Number(e.final_score) < 50);
                    const notAssigned    = employees.filter(e => !e.final_score || Number(e.final_score) === 0);
                    const highAvg = highPerformers.length
                      ? Math.round(highPerformers.reduce((sum, e) => sum + Number(e.final_score), 0) / highPerformers.length)
                      : null;
                    return [
                    { label: 'High Performers (80+)',  count: highPerformers.length, avg: highAvg,  color: 'bg-emerald-500' },
                    { label: 'Average (50–79)',         count: avgPerformers.length,  avg: null,     color: 'bg-amber-400'  },
                    { label: 'Below Target (<50)',      count: belowTarget.length,    avg: null,     color: 'bg-rose-500'   },
                    { label: 'Not Yet Assigned',        count: notAssigned.length,    avg: null,     color: 'bg-slate-300'  },
                    ];
                  })().map(d => {
                    const total = employees.length || 1;
                    const pct   = Math.round((d.count / total) * 100);
                    return (
                      <div key={d.label}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-slate-600">{d.label}</span>
                          <span className="text-xs font-bold text-slate-700">
                            {d.count}
                            {d.avg !== null && (
                              <span className="text-emerald-600 font-semibold ml-1">(avg {d.avg})</span>
                            )}
                            {' '}<span className="text-slate-400 font-normal">({pct}%)</span>
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2">
                          <div className={`h-full ${d.color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          </section>
        )}

        {/* ══ EMPLOYEES TAB ═══════════════════════════════════ */}
        {tab === 'employees' && (
          <section className="space-y-4">

            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-center">
              <input
                value={empSearch} onChange={e => setEmpSearch(e.target.value)}
                placeholder="Search name or email…"
                className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 w-52"
              />
              <select
                value={empTeam} onChange={e => setEmpTeam(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                <option value="All">All Teams</option>
                {teams.map(t => <option key={t.id} value={t.team_name}>{t.team_name}</option>)}
              </select>
              {(['all','finalized','draft','pending'] as StatusFilter[]).map(s => (
                <button
                  key={s}
                  onClick={() => setEmpStatus(s)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition capitalize ${
                    empStatus === s ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                  }`}
                >{s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}</button>
              ))}
              <span className="ml-auto text-xs text-slate-400">{filteredEmployees.length} results</span>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase hidden sm:table-cell">Team</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase hidden md:table-cell">Team Lead</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">Auto</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">Manual</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">Final</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredEmployees.map(emp => (
                    <tr key={emp.id} className="hover:bg-slate-50/60 transition">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-bold shrink-0">
                            {emp.name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium text-slate-800">{emp.name}</p>
                            <p className="text-[11px] text-slate-400">{emp.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 hidden sm:table-cell">{emp.team_name ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{emp.team_lead_name ?? '—'}</td>
                      <td className="px-4 py-3 text-center font-semibold text-slate-700">{emp.auto_score ?? 0}</td>
                      <td className="px-4 py-3 text-center font-semibold text-slate-700">{emp.lead_score ?? 0}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-bold text-indigo-700">{emp.final_score ?? 0}</span>
                      </td>
                      <td className="px-4 py-3 text-center"><StatusBadge status={emp.kpi_status} /></td>
                      <td className="px-4 py-3 text-center">
                        <ActionBtn
                          label={emp.kpi_status === 'finalized' ? 'Edit KPI' : 'Evaluate KPI'}
                          color="indigo"
                          onClick={() => setKpiModal({
                            person: emp,
                            mode  : emp.kpi_status === 'finalized' ? 'edit' : 'evaluate',
                          })}
                        />
                      </td>
                    </tr>
                  ))}
                  {filteredEmployees.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400 text-sm">No employees found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ══ TEAM LEADS TAB ══════════════════════════════════ */}
        {tab === 'teamleads' && (
          <section className="space-y-4">

            <div className="flex flex-wrap gap-3 items-center">
              <input
                value={tlSearch} onChange={e => setTlSearch(e.target.value)}
                placeholder="Search name or email…"
                className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200 w-52"
              />
              {(['all','finalized','draft','pending'] as StatusFilter[]).map(s => (
                <button
                  key={s}
                  onClick={() => setTlStatus(s)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
                    tlStatus === s ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'
                  }`}
                >{s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}</button>
              ))}
              <span className="ml-auto text-xs text-slate-400">{filteredTeamLeads.length} results</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredTeamLeads.map(tl => (
                <div key={tl.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 text-sm font-bold shrink-0">
                      {tl.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 truncate">{tl.name}</p>
                      <p className="text-[11px] text-slate-400 truncate">{tl.email}</p>
                    </div>
                    <StatusBadge status={tl.kpi_status} />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-slate-50 rounded-lg px-3 py-2">
                      <p className="text-slate-400">Team</p>
                      <p className="font-semibold text-slate-700 truncate">{tl.team_name ?? '—'}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg px-3 py-2">
                      <p className="text-slate-400">Members</p>
                      <p className="font-semibold text-slate-700">{tl.member_count ?? 0}</p>
                    </div>
                    <div className="bg-indigo-50 rounded-lg px-3 py-2">
                      <p className="text-indigo-400">Auto Score</p>
                      <p className="font-semibold text-indigo-700">{tl.auto_score ?? 0}/80</p>
                    </div>
                    <div className="bg-violet-50 rounded-lg px-3 py-2">
                      <p className="text-violet-400">Final KPI</p>
                      <p className="font-semibold text-violet-700">{tl.final_score ?? 0}/100</p>
                    </div>
                  </div>

                  {/* Metric bars */}
                  <div className="space-y-1.5">
                    {[
                      { label: 'Communication', val: tl.communication },
                      { label: 'Teamwork',       val: tl.teamwork       },
                      { label: 'Discipline',     val: tl.discipline     },
                      { label: 'Initiative',     val: tl.initiative     },
                    ].map(m => (
                      <div key={m.label} className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-500 w-24 shrink-0">{m.label}</span>
                        <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                          <div className="h-full bg-violet-400 rounded-full" style={{ width: `${((m.val ?? 0) / 5) * 100}%` }} />
                        </div>
                        <span className="text-[10px] text-slate-500 w-6 text-right">{m.val ?? 0}/5</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setKpiModal({
                        person: tl,
                        mode  : tl.kpi_status === 'finalized' ? 'edit' : 'evaluate',
                      })}
                      className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition"
                    >
                      {tl.kpi_status === 'finalized' ? 'Edit KPI' : 'Evaluate KPI'}
                    </button>
                  </div>
                </div>
              ))}
              {filteredTeamLeads.length === 0 && (
                <p className="text-slate-400 text-sm col-span-3 text-center py-10">No team leads found.</p>
              )}
            </div>
          </section>
        )}

      </main>

      {/* ── Modals ─────────────────────────────────────────── */}
      {kpiModal && (
        <KpiModal
          person={kpiModal.person}
          mode={kpiModal.mode}
          onClose={() => setKpiModal(null)}
          onSaved={refresh}
        />
      )}
      {evalModal && (
        <EvalModal
          lead={evalModal}
          onClose={() => setEvalModal(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}

// ─── Tiny action button ───────────────────────────────────────────
function ActionBtn({ label, color, onClick }: { label: string; color: 'indigo'|'slate'|'rose'; onClick: () => void }) {
  const cls =
    color === 'indigo' ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'  :
    color === 'rose'   ? 'bg-rose-50   text-rose-700   hover:bg-rose-100'    :
                          'bg-slate-50  text-slate-700  hover:bg-slate-100';
  return (
    <button onClick={onClick} className={`${cls} text-[11px] font-semibold px-2.5 py-1 rounded-lg transition`}>
      {label}
    </button>
  );
}
