'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, User, KPI } from '@/lib/api';
import ChatBot from '@/components/dashboard/ChatBot';

type Tab = 'overview' | 'chat';

export default function MemberDashboard() {
  const router = useRouter();
  const [user,    setUser]    = useState<User | null>(null);
  const [kpi, setKpi] = useState<KPI | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState<Tab>('overview');
  const [error,   setError]   = useState('');

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { router.replace('/login'); return; }

    (async () => {
      try {
        const [meRes, kpiRes] = await Promise.all([api.getMe(), api.getKpi()]);

        console.log(meRes);


            console.log('ME RESPONSE:', meRes);
            console.log('KPI RESPONSE:', kpiRes);

        if (meRes.user.role !== 'Team Member') {
          router.replace('/login');
          return;
        }
        
        setUser(meRes.user);
        setKpi(kpiRes.kpi);
      } catch (e: unknown) {
          console.error('ERROR:', e);
        setError(e instanceof Error ? e.message : 'Session expired.');
        localStorage.removeItem('token');
        router.replace('/login');
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.replace('/login');
  };


  

  // ─── Loading screen ───────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          <p className="text-sm text-slate-500">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm text-red-500">{error}</p>
      </div>
    );
  }

  const initials = user?.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?';

  return (
    <div className="min-h-screen bg-slate-50 font-sans">

      {/* ── Top Navbar ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-6 h-14 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <span className="text-sm font-bold text-slate-800">StackPulse</span>
          <span className="hidden sm:inline text-[11px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Team Member</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Notification bell (UI only) */}
          <button className="relative w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 transition">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
          </button>

          {/* User avatar */}
          <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-bold">
          {initials}
          </div>

      </div>

          <button
            onClick={logout}
            className="text-xs text-slate-500 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg transition font-medium"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* ── Main content ───────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Welcome banner */}
        <div className="bg-gradient-to-br from-indigo-600 to-violet-600 rounded-2xl px-6 py-5 flex items-center justify-between shadow-md overflow-hidden relative">
          {/* Decorative circles */}
          <div className="absolute -top-8 -right-8 w-40 h-40 bg-white/10 rounded-full" />
          <div className="absolute -bottom-10 -right-20 w-52 h-52 bg-white/5 rounded-full" />

          <div className="relative">
            <p className="text-indigo-200 text-xs font-medium mb-1 uppercase tracking-wider">
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            <h1 className="text-2xl font-bold text-white">Good {greeting()}, {user?.name?.split(' ')[0]} 👋</h1>
            <p className="text-indigo-200 text-sm mt-1">
              Final KPI Score: {kpi?.finalScore ?? 0}/100
            </p>
          </div>

          <div className="hidden md:flex flex-col items-center bg-white/20 backdrop-blur-sm rounded-xl px-5 py-3 text-white relative">
          <span className="text-3xl font-bold">
            {kpi?.finalScore ?? 0}
          </span>

          <span className="text-xs text-indigo-200 mt-0.5">
          Final KPI
          </span>
          </div>
        </div>

    

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
          {(['overview', 'chat'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-1.5 rounded-lg text-sm font-medium transition capitalize ${
                tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t === 'chat' ? '🤖 AI Assistant' : '📊 My KPIs'}
            </button>
          ))}
        </div>

        {/* ── KPI Overview tab ─────────────────────────────────── */}
        {tab === 'overview' && (
  <section>

    {!kpi ? (
      <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
        <h3 className="text-base font-semibold text-slate-800 mb-1">
          KPI not available
        </h3>

        <p className="text-sm text-slate-500">
          Your KPI has not been assigned yet.
        </p>
      </div>
    ) : (

      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              KPI Overview
            </h2>

            <p className="text-sm text-slate-500 mt-1">
              Performance summary
            </p>
          </div>

          <div className="text-right">
            <p className="text-xs text-slate-500 uppercase tracking-wide">
              Final KPI
            </p>

            <h1 className="text-4xl font-extrabold text-indigo-600">
              {kpi.finalScore}/100
            </h1>
          </div>
        </div>

        {/* Auto Score */}
        <div className="bg-indigo-50 rounded-xl p-4 mb-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-800">
                Generated Score
              </h3>

              <p className="text-sm text-slate-500">
                performance score based on productivity, technical expertise and attendance
              </p>
            </div>

            <div className="text-2xl font-bold text-indigo-700">
              {kpi.autoScore}/80
            </div>
          </div>
        </div>

        {/* Lead Evaluation */}
        <div className="bg-slate-50 rounded-xl p-4">

          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-slate-800">
                Team Lead Evaluation
              </h3>

              <p className="text-sm text-slate-500">
                Evaluation metrics
              </p>
            </div>

            <div className="text-xl font-bold text-emerald-600">
              {kpi.leadScore}/20
            </div>
          </div>

          <div className="space-y-3">

            {(kpi.leadMetricsArr && kpi.leadMetricsArr.length > 0
              ? kpi.leadMetricsArr
              : [
                  { id: 1, name: 'Communication', score: kpi.leadMetrics?.communication ?? 0, max_score: 5 },
                  { id: 2, name: 'Teamwork',       score: kpi.leadMetrics?.teamwork      ?? 0, max_score: 5 },
                  { id: 3, name: 'Discipline',     score: kpi.leadMetrics?.discipline    ?? 0, max_score: 5 },
                  { id: 4, name: 'Initiative',     score: kpi.leadMetrics?.initiative    ?? 0, max_score: 5 },
                ]
            ).map(m => (
              <div key={m.id} className="flex items-center justify-between">
                <span className="text-sm text-slate-700">{m.name}</span>
                <span className="font-semibold text-slate-900">{m.score}/{m.max_score}</span>
              </div>
            ))}

          </div>
        </div>

      </div>
    )}
  </section>
)}

        {/* ── AI Chat tab ───────────────────────────────────────── */}
        {tab === 'chat' && (
          <section className="h-[600px]">
            <ChatBot role="member" />
          </section>
        )}
      </main>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: string; color: string }) {
  return (
    <div className={`${color} rounded-xl p-4 flex items-center gap-3 border border-slate-200`}>
      <span className="text-2xl">{icon}</span>
      <div>
        <p className="text-xl font-bold text-slate-900 leading-none">{value}</p>
        <p className="text-xs text-slate-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}
