// components/NotificationBell.tsx
"use client";
import { useState, useEffect, useRef } from "react";
import { Bell, CheckCheck, User } from "lucide-react";
import * as api from "@/lib/api";

interface Props { teamLeadId: number }

export default function NotificationBell({ teamLeadId }: Props) {
  const [open,    setOpen]    = useState(false);
  const [data,    setData]    = useState<any>({ notifications: [], unreadCount: 0 });
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.getNotifications(teamLeadId);
      setData(res);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 60_000);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamLeadId]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const markAll = async () => { await api.markAllNotificationsRead(teamLeadId); load(); };
  const markOne = async (id: number) => { await api.markNotificationRead(id); load(); };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors border border-slate-200"
      >
        <Bell size={18} className={data.unreadCount > 0 ? "text-blue-600" : "text-slate-500"} />
        {data.unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4.5 h-4.5 min-w-[18px] rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center pulse-dot px-1">
            {data.unreadCount > 9 ? "9+" : data.unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 w-80 bg-white border border-slate-200 rounded-2xl shadow-lg z-50 slide-up overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="font-semibold text-slate-800 text-sm">Notifications</span>
            {data.unreadCount > 0 && (
              <button
                onClick={markAll}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors"
              >
                <CheckCheck size={13} /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading && (
              <div className="p-4 text-center text-slate-400 text-sm">Loading…</div>
            )}
            {!loading && data.notifications.length === 0 && (
              <div className="p-6 text-center text-slate-400 text-sm">
                <Bell size={24} className="mx-auto mb-2 opacity-30" />
                All caught up!
              </div>
            )}
            {data.notifications.map((n: any) => (
              <div
                key={n.id}
                onClick={() => !n.is_read && markOne(n.id)}
                className={`px-4 py-3 border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors ${
                  !n.is_read ? "bg-blue-50/60" : ""
                }`}
              >
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                    <User size={13} className="text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${!n.is_read ? "text-slate-900" : "text-slate-500"}`}>
                      {n.title}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{n.message}</p>
                    <p className="text-[10px] text-slate-300 mt-1">
                      {new Date(n.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  {!n.is_read && (
                    <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
