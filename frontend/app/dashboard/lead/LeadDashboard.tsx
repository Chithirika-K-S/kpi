// app/dashboard/lead/LeadDashboard.tsx
"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, RefreshCw } from "lucide-react";
import { api, TlKPI } from "@/lib/api";
import NotificationBell from "@/components/NotificationBell";
import StatBar from "@/components/StatBar";
import EvalModal from "@/components/EvalModal";
import MemberCard from "@/components/MemberCard";
import ChatBot from "@/components/dashboard/ChatBot";

type Filter = "all" | "pending" | "draft" | "finalized";
type Tab = "team" | "mykpi" | "chat";

// ─── Status pill ────────────────────────────────────────────────────────────────────────────
function KpiStatusPill({ status }: { status: string }) {
  const s = (status ?? "").toLowerCase();
  const cfg =
    s === "finalized"
      ? { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: "✅", label: "Finalized" }
      : s === "draft"
      ? { cls: "bg-amber-50  text-amber-700  border-amber-200",   icon: "⏳", label: "Draft"     }
      : { cls: "bg-slate-50  text-slate-500  border-slate-200",   icon: "⏳", label: "Pending"   };
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${cfg.cls}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

// ─── Score ring ────────────────────────────────────────────────────────────────────────────
function ScoreCircle({ score, max, label, color }: { score: number; max: number; label: string; color: string }) {
  const pct = Math.min(100, Math.round((score / max) * 100));
  const r = 30, cx = 40, cy = 40;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={80} height={80} viewBox="0 0 80 80">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={8} />
        <circle
          cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={8}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 40 40)"
        />
        <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" fontSize={15} fontWeight={700} fill="#1e293b">
          {score}
        </text>
      </svg>
      <span className="text-[11px] text-slate-500 font-medium">{label}<br />
        <span className="text-[10px] text-slate-400">out of {max}</span>
      </span>
    </div>
  );
}

export default function LeadDashboard() {
  const router = useRouter();

  const [authReady, setAuthReady] = useState(false);
  const [tlId,      setTlId]      = useState<number>(0);
  const [tlName,    setTlName]    = useState<string>("");

  const [members,  setMembers]  = useState<any[]>([]);
  const [tlKpi,    setTlKpi]    = useState<TlKPI | null>(null);
  const [tlKpiLoading, setTlKpiLoading] = useState(true);
  const [periodId, setPeriodId] = useState<number | undefined>();
  const [search,   setSearch]   = useState("");
  const [filter,   setFilter]   = useState<Filter>("all");
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState<any | null>(null);
  const [tab,      setTab]      = useState<Tab>("team");

  const resolvedPeriod = useRef<number | undefined>(undefined);

  /* ── Auth guard ─────────────────────────────────────────────── */
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.replace("/login"); return; }

    api.getMe()
      .then(({ user }) => {
        if (user.role !== "Team Lead") { router.replace("/login"); return; }
        setTlId(user.id);
        setTlName(user.name);
        setAuthReady(true);
      })
      .catch(() => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        router.replace("/login");
      });
  }, [router]);

  /* ── Data load ──────────────────────────────────────────────── */
  const loadMembers = async () => {
    setLoading(true);
    try {
      const res = await api.getTeamMembers();
      setMembers(res.members ?? []);
      if (!resolvedPeriod.current && res.periodId) {
        resolvedPeriod.current = res.periodId;
        setPeriodId(res.periodId);
      }
    } catch (err) {
      console.error("Failed to load team members:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authReady) {
      loadMembers();
      loadTlKpi();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady]);

  const loadTlKpi = async () => {
    setTlKpiLoading(true);
    try {
      const res = await api.getTlKpi();
      setTlKpi(res.kpi);
    } catch (err) {
      console.error("Failed to load TL KPI:", err);
    } finally {
      setTlKpiLoading(false);
    }
  };

  /* ── Logout ─────────────────────────────────────────────────── */
  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.replace("/login");
  };

  /* ── Filter / search ────────────────────────────────────────── */
  const filtered = members.filter((m) => {
    const matchSearch =
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.email.toLowerCase().includes(search.toLowerCase()) ||
      (m.department ?? "").toLowerCase().includes(search.toLowerCase());

    const dbStatus = (m.kpi_status ?? "pending").toLowerCase();
    const matchFilter =
      filter === "all" ? true
      : dbStatus === filter.toLowerCase();

    return matchSearch && matchFilter;
  });

  /* ── Auth spinner ───────────────────────────────────────────── */
  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  /* ── Render ─────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-slate-50 font-sans">

      {/* ── Top nav ──────────────────────────────────────────────── */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-3.5 flex items-center justify-between">

          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shadow-sm">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800 leading-none">StackPulse</p>
              <p className="text-xs text-slate-400 mt-0.5">TL Dashboard</p>
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <p className="text-sm font-medium text-slate-700">{tlName}</p>
              <p className="text-xs text-slate-400">Team Lead</p>
            </div>
            <NotificationBell teamLeadId={tlId} />
            <button
              onClick={logout}
              className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition px-3.5 py-2 rounded-lg shadow-sm"
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Gradient accent bar */}
        <div className="h-0.5 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500" />
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">

        {/* Page heading */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Team Overview</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage and evaluate your team's KPI performance</p>
        </div>

        {/* Stats */}
        <StatBar members={members} />

        {/* ── Tabs ─────────────────────────────────────────────── */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
          <button
            onClick={() => setTab("team")}
            className={`px-5 py-1.5 rounded-lg text-sm font-medium transition ${
              tab === "team" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            👥 My Team
          </button>
          <button
            onClick={() => setTab("mykpi")}
            className={`px-5 py-1.5 rounded-lg text-sm font-medium transition ${
              tab === "mykpi" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            🏆 My KPI
          </button>
          <button
            onClick={() => setTab("chat")}
            className={`px-5 py-1.5 rounded-lg text-sm font-medium transition ${
              tab === "chat" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            🤖 AI Assistant
          </button>
        </div>

        {/* ══ TEAM TAB ══════════════════════════════════════════ */}
        {tab === "team" && (
          <>
            {/* Search & filter bar */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by name, email or department…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg pl-10 pr-4 py-2.5 text-sm text-slate-900
                             placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition shadow-sm"
                />
              </div>

              <div className="flex gap-2 flex-wrap">
                {(["all", "pending", "draft", "finalized"] as Filter[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3.5 py-2.5 rounded-lg text-xs font-semibold capitalize transition-all shadow-sm ${
                      filter === f
                        ? "bg-blue-600 text-white"
                        : "bg-white border border-slate-300 text-slate-600 hover:border-blue-400 hover:text-blue-600"
                    }`}
                  >
                    {f}
                  </button>
                ))}
                <button
                  onClick={loadMembers}
                  className="p-2.5 bg-white border border-slate-300 rounded-lg text-slate-500 hover:text-blue-600 hover:border-blue-400 transition shadow-sm"
                  aria-label="Refresh"
                >
                  <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                </button>
              </div>
            </div>

            {/* Member grid */}
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="bg-white border border-slate-200 rounded-2xl p-5 h-56 animate-pulse" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-2xl font-bold text-slate-800 mb-2">No members found</p>
                <p className="text-sm text-slate-500">Try adjusting your search or filter</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtered.map((m, i) => (
                  <div key={m.id} style={{ animationDelay: `${i * 40}ms` }}>
                    <MemberCard
                      member={m}
                      teamLeadId={tlId}
                      onEvaluate={setSelected}
                      onUpdated={loadMembers}
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ══ AI ASSISTANT TAB ══════════════════════════════════ */}
        {/* ══ MY KPI TAB ═══════════════════════════════════════════════════ */}
        {tab === "mykpi" && (
          <section>
            {tlKpiLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
              </div>
            ) : !tlKpi ? (
              <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-14 text-center shadow-sm">
                <div className="text-4xl mb-3">📊</div>
                <h3 className="text-base font-semibold text-slate-800 mb-1">KPI Not Yet Evaluated</h3>
                <p className="text-sm text-slate-500">
                  Your KPI hasn’t been evaluated by the Manager yet. Check back later.
                </p>
              </div>
            ) : (
              <div className="space-y-5">

                {/* Header card */}
                <div className="bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl px-6 py-5 flex items-center justify-between shadow-md overflow-hidden relative">
                  <div className="absolute -top-8 -right-8 w-40 h-40 bg-white/10 rounded-full" />
                  <div className="absolute -bottom-10 -right-20 w-52 h-52 bg-white/5 rounded-full" />
                  <div className="relative">
                    <p className="text-blue-200 text-xs font-medium uppercase tracking-wider mb-1">My KPI — Evaluated by Manager</p>
                    <h2 className="text-xl font-bold text-white">{tlName}</h2>
                    <div className="mt-2">
                      <KpiStatusPill status={tlKpi.status} />
                    </div>
                    {tlKpi.finalized_at && (
                      <p className="text-blue-200 text-xs mt-1">
                        Finalized on {new Date(tlKpi.finalized_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                      </p>
                    )}
                  </div>
                  <div className="hidden md:flex flex-col items-center bg-white/20 backdrop-blur-sm rounded-xl px-6 py-4 text-white relative">
                    <span className="text-4xl font-extrabold">{tlKpi.finalScore}</span>
                    <span className="text-xs text-blue-200 mt-0.5">Final KPI / 100</span>
                  </div>
                </div>

                {/* Score circles */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col items-center gap-3">
                    <ScoreCircle score={tlKpi.autoScore} max={80} label="System Score" color="#6366f1" />
                    <p className="text-xs text-slate-400 text-center">Auto-generated performance score</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col items-center gap-3">
                    <ScoreCircle
                      score={tlKpi.manualScore}
                      max={tlKpi.metricBreakdown.reduce((s, m) => s + m.max_score, 0) || 20}
                      label="Manager Score"
                      color="#10b981"
                    />
                    <p className="text-xs text-slate-400 text-center">Evaluated by your Manager</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-indigo-200 shadow-sm p-5 flex flex-col items-center gap-3">
                    <ScoreCircle score={tlKpi.finalScore} max={100} label="Final KPI" color="#3b82f6" />
                    <p className="text-xs text-slate-400 text-center">System + Manager combined</p>
                  </div>
                </div>

                {/* Metric breakdown */}
                {tlKpi.metricBreakdown.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                    <h3 className="text-sm font-semibold text-slate-800 mb-4">Manager Evaluation — Metric Breakdown</h3>
                    <div className="space-y-4">
                      {tlKpi.metricBreakdown.map((m) => {
                        const pct = Math.min(100, Math.round((m.score / m.max_score) * 100));
                        const barColor = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-blue-500" : "bg-rose-400";
                        return (
                          <div key={m.id}>
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-sm text-slate-700 font-medium">{m.name}</span>
                              <span className="text-sm font-bold text-slate-800">
                                {m.score}<span className="text-slate-400 font-normal">/{m.max_score}</span>
                              </span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-2.5">
                              <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {tab === "chat" && (
          <section className="h-[600px]">
            <ChatBot role="lead" />
          </section>
        )}
      </main>

      {selected && periodId && (
        <EvalModal
          member={selected}
          teamLeadId={tlId}
          periodId={periodId}
          onClose={() => setSelected(null)}
          onSaved={loadMembers}
        />
      )}
    </div>
  );
}
