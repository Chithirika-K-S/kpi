// components/MemberCard.tsx
"use client";
import { useState } from "react";
import { Pencil, Check, X, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import * as api from "@/lib/api";

interface Props {
  member: any;
  teamLeadId: number;
  onEvaluate: (member: any) => void;
  onUpdated: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; Icon: any }> = {
  finalized: { label: "Finalized", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", Icon: CheckCircle },
  draft:     { label: "Draft",     color: "text-amber-700",   bg: "bg-amber-50 border-amber-200",     Icon: Clock },
  pending:   { label: "Pending",   color: "text-red-600",     bg: "bg-red-50 border-red-200",         Icon: AlertTriangle },
};

export default function MemberCard({ member, teamLeadId, onEvaluate, onUpdated }: Props) {
  const [editing, setEditing] = useState(false);
  const [name,    setName]    = useState(member.name);
  const [email,   setEmail]   = useState(member.email);
  const [saving,  setSaving]  = useState(false);

  // Normalise to lowercase. If the DB still has stale 'pending' but final_score
  // exists the effective status is 'finalized' — the backend migration will fix
  // the DB on next restart, but this guards the UI immediately.
  const rawStatus = (member.kpi_status ?? "pending").toLowerCase();
  const statusKey =
    rawStatus === "finalized" ? "finalized"
    : rawStatus === "draft"   ? "draft"
    : parseFloat(member.final_score ?? 0) > 0 ? "finalized"  // stale-pending guard
    : "pending";
  const { label, color, bg, Icon } = STATUS_CONFIG[statusKey] ?? STATUS_CONFIG.pending;

  const completionRatio = parseInt(member.submitted_criteria ?? 0) / parseInt(member.total_criteria ?? 1);
  const completionPct   = Math.round(completionRatio * 100);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateMember(teamLeadId, member.id, { name, email });
      onUpdated();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  /* Avatar initial colour based on name */
  const avatarColors = [
    "bg-blue-100 text-blue-700",
    "bg-indigo-100 text-indigo-700",
    "bg-violet-100 text-violet-700",
    "bg-sky-100 text-sky-700",
  ];
  const avatarCls = avatarColors[(name.charCodeAt(0) ?? 0) % avatarColors.length];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-blue-300 hover:shadow-md transition-all duration-200 slide-up group shadow-sm">

      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className={`w-10 h-10 rounded-full ${avatarCls} flex items-center justify-center font-bold text-base shrink-0`}>
            {member.avatar_url
              ? <img src={member.avatar_url} alt={name} className="w-full h-full rounded-full object-cover" />
              : name.charAt(0).toUpperCase()
            }
          </div>

          {/* Name / email */}
          {editing ? (
            <div className="space-y-1">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-white border border-slate-300 rounded-lg px-3 py-1 text-slate-900 text-sm w-44
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-white border border-slate-300 rounded-lg px-3 py-1 text-slate-500 text-xs w-44
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          ) : (
            <div>
              <p className="text-slate-900 text-sm font-semibold">{name}</p>
              <p className="text-slate-400 text-xs">{email}</p>
            </div>
          )}
        </div>

        {/* Edit controls */}
        <div className="flex gap-1 shrink-0">
          {editing ? (
            <>
              <button
                onClick={handleSave}
                disabled={saving}
                className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 transition-colors"
              >
                <Check size={14} />
              </button>
              <button
                onClick={() => { setEditing(false); setName(member.name); setEmail(member.email); }}
                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors"
              >
                <X size={14} />
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 bg-slate-100 hover:bg-slate-200 text-slate-500 transition-all"
            >
              <Pencil size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Status + department badges */}
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {member.department && (
          <span className="text-[10px] font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
            {member.department}
          </span>
        )}
        <span className={`flex items-center gap-1 text-[10px] font-medium border px-2 py-0.5 rounded-full ${bg} ${color}`}>
          <Icon size={9} /> {label}
        </span>
      </div>

      {/* Scores */}
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="bg-slate-50 rounded-lg py-2">
          <p className="text-[10px] text-slate-400 font-medium mb-0.5">System</p>
          <p className="text-blue-600 font-bold text-sm">{parseFloat(member.system_score ?? 0).toFixed(1)}</p>
        </div>
        <div className="bg-slate-50 rounded-lg py-2">
          <p className="text-[10px] text-slate-400 font-medium mb-0.5">TL Score</p>
          <p className="text-amber-600 font-bold text-sm">{parseFloat(member.tl_score ?? 0).toFixed(1)}</p>
        </div>
        <div className="bg-slate-50 rounded-lg py-2">
          <p className="text-[10px] text-slate-400 font-medium mb-0.5">Final</p>
          <p className="text-slate-900 font-bold text-sm">
            {member.final_score != null ? parseFloat(member.final_score).toFixed(1) : "—"}
          </p>
        </div>
      </div>

      {/* Criteria completion bar */}
      <div className="mt-3">
        <div className="flex justify-between text-[10px] text-slate-400 font-medium mb-1">
          <span>Criteria filled</span>
          <span>{member.submitted_criteria ?? 0}/{member.total_criteria ?? 0}</span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${completionPct}%`,
              background:
                completionPct === 100 ? "#059669"
                : completionPct > 50  ? "#d97706"
                : "#dc2626",
            }}
          />
        </div>
      </div>

      {/* Evaluate button – matches login's blue primary button */}
      <button
        onClick={() => onEvaluate(member)}
        className={`mt-4 w-full py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm ${
          statusKey === "finalized"
            ? "bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200"
            : "bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98]"
        }`}
      >
        {statusKey === "finalized" ? "Edit KPI" : "Assign KPI (20%)"}
      </button>
    </div>
  );
}
