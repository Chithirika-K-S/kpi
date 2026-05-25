'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { api, ChatMessage } from '@/lib/api';

export default function ChatBot() {
  const [messages, setMessages]   = useState<ChatMessage[]>([]);
  const [input,    setInput]      = useState('');
  const [loading,  setLoading]    = useState(false);
  const [error,    setError]      = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setError('');

    try {
      const { reply } = await api.sendChat(text, [...messages, userMsg]);
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl border border-slate-200 overflow-hidden">

      {/* Chat header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white shrink-0">
        <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">KPI Assistant</p>
          <p className="text-[11px] text-slate-500">Powered by Llama 3 · Knows your KPIs</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[11px] text-slateald-500">Online</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">

        {/* Welcome message */}
        {messages.length === 0 && !loading && (
          <div className="flex gap-3">
            <Avatar role="assistant" />
            <div className="max-w-[80%]">
              <Bubble role="assistant">
                👋 Hi! I&apos;m your KPI assistant. I already know your current KPIs, progress and deadlines. Ask me anything!
                <br /><br />
                <span className="text-slate-500 text-xs">Try: &quot;How am I doing on my KPIs?&quot; or &quot;What should I focus on this week?&quot;</span>
              </Bubble>
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <Avatar role={m.role} />
            <div className="max-w-[80%]">
              <Bubble role={m.role}>{m.content}</Bubble>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <Avatar role="assistant" />
            <Bubble role="assistant">
              <span className="flex gap-1 items-center h-4">
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:300ms]" />
              </span>
            </Bubble>
          </div>
        )}

        {error && (
          <p className="text-xs text-red-500 text-center px-4 py-2 bg-red-50 rounded-lg">{error}</p>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="px-4 py-3 border-t border-slate-100 bg-white shrink-0">
        <div className="flex items-end gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask about your KPIs…"
            rows={1}
            className="flex-1 bg-transparent text-sm text-slate-900 placeholder-slate-400 resize-none outline-none max-h-28 leading-relaxed"
          />
          <button
            onClick={send}
            disabled={!input.trim() || loading}
            className="shrink-0 w-8 h-8 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition"
            aria-label="Send message"
          >
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          </button>
        </div>
        <p className="text-[10px] text-slate-400 text-center mt-1.5">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────
function Avatar({ role }: { role: 'user' | 'assistant' }) {
  return role === 'assistant' ? (
    <div className="w-7 h-7 shrink-0 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold mt-1">
      AI
    </div>
  ) : (
    <div className="w-7 h-7 shrink-0 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 text-xs font-bold mt-1">
      Me
    </div>
  );
}

function Bubble({ role, children }: { role: 'user' | 'assistant'; children: React.ReactNode }) {
  return (
    <div
      className={`text-sm px-4 py-2.5 rounded-2xl leading-relaxed whitespace-pre-wrap ${
        role === 'user'
          ? 'bg-indigo-600 text-white rounded-tr-sm'
          : 'bg-slate-100 text-slate-800 rounded-tl-sm'
      }`}
    >
      {children}
    </div>
  );
}
