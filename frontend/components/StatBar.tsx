// components/StatBar.tsx
"use client";
import { Users, CheckCircle, Clock, AlertTriangle, TrendingUp } from "lucide-react";

interface Props { members: any[] }

export default function StatBar({ members }: Props) {
  const total     = members.length;
  // Resolve effective status the same way MemberCard does:
  // if DB has stale 'pending' but final_score > 0, treat as finalized.
  const resolveStatus = (m: any): string => {
    const raw = (m.kpi_status ?? "pending").toLowerCase();
    if (raw === "finalized") return "finalized";
    if (raw === "draft")     return "draft";
    if (parseFloat(m.final_score ?? 0) > 0) return "finalized";
    return "pending";
  };
  const finalized = members.filter((m) => resolveStatus(m) === "finalized").length;
  const draft     = members.filter((m) => resolveStatus(m) === "draft").length;
  const pending   = members.filter((m) => resolveStatus(m) === "pending").length;
  const scores    = members.filter((m) => parseFloat(m.final_score ?? 0) > 0);
  const avg       = scores.length
    ? scores.reduce((s, m) => s + parseFloat(m.final_score), 0) / scores.length
    : null;

  const stats = [
    {
      label: "Team Members",
      value: total,
      icon: Users,
      iconBg: "bg-blue-50",
      iconColor: "text-blue-600",
      valueCls: "text-slate-900",
      border: "border-slate-200",
    },
    {
      label: "Finalized",
      value: finalized,
      icon: CheckCircle,
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-600",
      valueCls: "text-emerald-700",
      border: "border-slate-200",
    },
    {
      label: "Draft",
      value: draft,
      icon: Clock,
      iconBg: "bg-amber-50",
      iconColor: "text-amber-600",
      valueCls: "text-amber-700",
      border: "border-slate-200",
    },
    {
      label: "Pending",
      value: pending,
      icon: AlertTriangle,
      iconBg: "bg-red-50",
      iconColor: "text-red-600",
      valueCls: "text-red-700",
      border: "border-slate-200",
    },
    {
      label: "Avg KPI",
      value: avg != null ? avg.toFixed(1) : "—",
      icon: TrendingUp,
      iconBg: "bg-indigo-50",
      iconColor: "text-indigo-600",
      valueCls: "text-indigo-700",
      border: "border-slate-200",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      {stats.map((s) => (
        <div
          key={s.label}
          className={`bg-white rounded-xl border ${s.border} px-4 py-3.5 shadow-sm`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-6 h-6 rounded-md ${s.iconBg} flex items-center justify-center`}>
              <s.icon size={13} className={s.iconColor} />
            </div>
            <span className="text-xs text-slate-500 font-medium">{s.label}</span>
          </div>
          <p className={`text-2xl font-bold ${s.valueCls}`}>{s.value}</p>
        </div>
      ))}
    </div>
  );
}
