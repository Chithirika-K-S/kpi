// components/EvalModal.tsx
"use client";
import { useState, useEffect } from "react";
import { X, Save, CheckCircle, AlertCircle, Loader2, Pencil } from "lucide-react";
import * as api from "@/lib/api";
import ScoreRing from "./ScoreRing";

interface Props {
  member: any;
  teamLeadId: number;
  periodId: number;
  onClose: () => void;
  onSaved: () => void;
}

export default function EvalModal({ member, teamLeadId, periodId, onClose, onSaved }: Props) {
  const [detail,    setDetail]  = useState<any>(null);
  const [scores,    setScores]  = useState<Record<number, { score: string; comments: string }>>({});
  const [saving,    setSaving]  = useState(false);
  const [finalizing,setFinal]   = useState(false);
  const [remarks,   setRemarks] = useState("");
  const [status,    setStatus]  = useState<"idle" | "saved" | "error">("idle");
  const [errorMsg,  setError]   = useState("");
  const [editMode,  setEditMode] = useState(false);

  useEffect(() => {
    api.getMemberDetail(teamLeadId, member.id, periodId).then((res) => {
      setDetail(res);
      const init: typeof scores = {};
      const kpiStatus = res.finalKpi?.status ?? "pending";
      res.criteria.forEach((c: any) => {
        // Only pre-fill scores if TL has previously saved (draft or finalized).
        // For 'pending' members the DB default is 0 which means "not entered" —
        // show empty fields so the TL must consciously type a value.
        const hasScore = kpiStatus !== "pending" && c.tl_raw_score != null;
        init[c.id] = {
          score:    hasScore ? String(c.tl_raw_score) : "",
          comments: c.tl_comments ?? "",
        };
      });
      setScores(init);
      setRemarks(res.finalKpi?.tl_remarks ?? "");
    });
  }, [member.id, teamLeadId, periodId]);

  const handleSave = async () => {
    setSaving(true); setStatus("idle");
    try {
      const evaluations = Object.entries(scores)
        .filter(([, v]) => v.score !== "")
        .map(([criteriaId, v]) => ({
          criteriaId: parseInt(criteriaId),
          score:      parseFloat(v.score),
          comments:   v.comments,
        }));
      await api.submitTLEvaluation({ teamLeadId, employeeId: member.id, periodId, evaluations });
      setStatus("saved");
      onSaved();
    } catch (e: any) {
      setStatus("error"); setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleFinalize = async () => {
    setFinal(true);
    try {
      // Save scores first (so edits in edit-mode are persisted before finalizing)
      const evaluations = Object.entries(scores)
        .filter(([, v]) => v.score !== "")
        .map(([criteriaId, v]) => ({
          criteriaId: parseInt(criteriaId),
          score:      parseFloat(v.score),
          comments:   v.comments,
        }));
      await api.submitTLEvaluation({ teamLeadId, employeeId: member.id, periodId, evaluations });
      await api.finalizeKPI({ teamLeadId, employeeId: member.id, periodId, tlRemarks: remarks });
      setEditMode(false);
      onSaved(); onClose();
    } catch (e: any) {
      setStatus("error"); setError(e.message);
    } finally {
      setFinal(false);
    }
  };

  const tlTotal = detail?.criteria.reduce((sum: number, c: any) => {
    const raw  = parseFloat(scores[c.id]?.score || "0");
    return sum + (isNaN(raw) ? 0 : raw);
  }, 0) ?? 0;  // raw TL sum, out of 20 (4 criteria × max 5 each)

  // auto_score is out of 80; show it directly
  const sysScore     = parseFloat(detail?.autoScore ?? detail?.finalKpi?.auto_score ?? 0);
  const finalPreview = sysScore + tlTotal;
  const isFinalized  = detail?.finalKpi?.status === "finalized" && !editMode;
  const allFilled    = detail?.criteria.every((c: any) => scores[c.id]?.score !== "");

  const ringColors = { sys: "#2563eb", tl: "#d97706", final: finalPreview >= 80 ? "#059669" : finalPreview >= 60 ? "#d97706" : "#dc2626" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white border border-slate-200 rounded-2xl shadow-xl slide-up">

        {/* Top accent */}
        <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 rounded-t-2xl" />

        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="font-bold text-slate-900 text-lg">{member.name}</h2>
            <p className="text-slate-400 text-sm">{member.department} · {member.email}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        {!detail ? (
          <div className="p-12 flex justify-center">
            <Loader2 className="animate-spin text-slate-300" size={32} />
          </div>
        ) : (
          <div className="p-6 space-y-6">

            {/* Score preview cards */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "System (80%)",   score: Math.min((sysScore / 80) * 100, 100),  display: Math.round(sysScore),   color: ringColors.sys   },
                { label: "TL Score (20%)", score: Math.min((tlTotal / 20) * 100, 100),   display: Math.round(tlTotal),    color: ringColors.tl    },
                { label: "Final KPI",      score: Math.min(finalPreview, 100),            display: Math.round(finalPreview), color: ringColors.final },
              ].map((s) => (
                <div key={s.label} className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
                  <ScoreRing score={s.score} size={72} color={s.color} label={String(s.display)} />
                  <p className="text-xs text-slate-400 mt-2 font-medium">{s.label}</p>
                </div>
              ))}
            </div>

            {detail?.finalKpi?.status === "finalized" && (
              <div className="flex items-center justify-between gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2 text-emerald-700 text-sm font-medium">
                  <CheckCircle size={15} />
                  KPI finalized{detail.finalKpi.finalized_at ? ` on ${new Date(detail.finalKpi.finalized_at).toLocaleDateString()}` : ""}
                </div>
                {!editMode && (
                  <button
                    onClick={() => setEditMode(true)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-900 bg-white border border-emerald-300 hover:border-emerald-500 px-3 py-1.5 rounded-lg transition-all"
                  >
                    <Pencil size={12} /> Edit KPI
                  </button>
                )}
              </div>
            )}

            {/* Criteria */}
            <div>
              <h3 className="font-semibold text-slate-800 text-sm mb-3">
                Evaluation Criteria
                <span className="text-slate-400 font-normal ml-2">— {member.department}</span>
              </h3>
              <div className="space-y-3">
                {detail.criteria.map((c: any) => {
                  const val = scores[c.id] ?? { score: "", comments: "" };
                  const raw = parseFloat(val.score);
                  const pct = isNaN(raw) ? 0 : (raw / c.max_score) * 100;
                  return (
                    <div key={c.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-slate-800 text-sm font-semibold">{c.name}</p>
                          {c.description && <p className="text-slate-400 text-xs mt-0.5">{c.description}</p>}
                        </div>
                        <span className="text-[10px] font-medium text-slate-500 bg-white border border-slate-200 px-2 py-1 rounded-lg shrink-0">
                          Weight: {c.weight_percent}%
                        </span>
                      </div>
                      <div className="flex gap-3 items-center">
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs text-slate-400">
                              System: {c.system_raw_score != null ? `${c.system_raw_score}/${c.max_score}` : "N/A"}
                            </span>
                            {!isNaN(raw) && (
                              <span className="text-xs text-amber-600 font-semibold">{Math.round(pct)}%</span>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <input
                              type="number" min={0} max={c.max_score}
                              disabled={isFinalized}
                              value={val.score}
                              onChange={(e) => setScores((p) => ({ ...p, [c.id]: { ...p[c.id], score: e.target.value } }))}
                              placeholder={`/ ${c.max_score}`}
                              className="w-28 bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-slate-900 text-sm
                                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                                         disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                            <input
                              type="text"
                              disabled={isFinalized}
                              value={val.comments}
                              onChange={(e) => setScores((p) => ({ ...p, [c.id]: { ...p[c.id], comments: e.target.value } }))}
                              placeholder="Optional comment…"
                              className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-slate-900 text-sm
                                         placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                                         disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Remarks */}
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1.5">TL Remarks</label>
              <textarea
                disabled={isFinalized}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={3}
                className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 text-sm
                           placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                           resize-none disabled:opacity-50"
                placeholder="Add overall performance remarks…"
              />
            </div>

            {/* Status messages */}
            {status === "saved" && (
              <div className="flex items-center gap-2 text-emerald-600 text-sm font-medium">
                <CheckCircle size={15} /> Scores saved successfully
              </div>
            )}
            {status === "error" && (
              <div className="flex items-center gap-2 text-red-600 text-sm font-medium">
                <AlertCircle size={15} /> {errorMsg}
              </div>
            )}

            {/* Actions – matches login button style */}
            {(!isFinalized || editMode) && (
              <div className="flex gap-3 pt-1">
                {editMode && (
                  <button
                    onClick={() => { setEditMode(false); }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-300
                               text-slate-500 rounded-xl text-sm font-semibold transition-all shadow-sm"
                  >
                    <X size={15} /> Cancel
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-slate-50 border border-slate-300
                             text-slate-700 rounded-xl text-sm font-semibold transition-all shadow-sm disabled:opacity-50"
                >
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                  Save Draft
                </button>
                <button
                  onClick={handleFinalize}
                  disabled={finalizing || !allFilled}
                  title={!allFilled ? "Fill in all criteria scores first" : ""}
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white
                             rounded-xl text-sm font-semibold transition-all shadow-sm disabled:opacity-50 active:scale-[0.98]"
                >
                  {finalizing ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle size={15} />}
                  {editMode ? "Re-finalize KPI" : "Finalize KPI"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
