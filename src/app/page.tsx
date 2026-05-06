'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  loadSessions,
  saveSessions,
  loadActiveSessionId,
  saveActiveSessionId,
  loadMemory,
  saveMemory,
  generateId,
  deriveTitle,
  makeNewSession,
  type Session,
  type MemoryEntry,
  type StoredMessage,
} from '@/lib/storage';

/* ───────── Agent metadata ───────── */

type AgentMeta = {
  emoji: string;
  name: string;
  role: string;
  cssVar: string;
};

const AGENTS: Record<string, AgentMeta> = {
  research: { emoji: '🔬', name: 'Researcher',    role: '벤치마킹 · 사례 조사',   cssVar: '--research' },
  toolbox:  { emoji: '🧰', name: 'Toolbox',       role: '도구 · 라이브러리 추천', cssVar: '--toolbox' },
  execute:  { emoji: '⚡', name: 'Executor',      role: '실행 · 시뮬레이션',     cssVar: '--executor' },
  deploy:   { emoji: '🚀', name: 'Deployer',      role: 'Vercel 배포 관리',       cssVar: '--deployer' },
  video:    { emoji: '🎬', name: 'VideoProducer', role: '영상 · 이미지 생성',    cssVar: '--video' },
  humanize: { emoji: '✍️', name: 'Humanizer',     role: 'AI 티 제거 · 교열',     cssVar: '--humanizer' },
};

const ORCHESTRATOR: AgentMeta = {
  emoji: '🎯', name: 'Orchestrator', role: '조율 · 종합 보고', cssVar: '--orch',
};

function isAgentKey(k: string): k is keyof typeof AGENTS {
  return k in AGENTS;
}

/* ───────── Helpers ───────── */

function accentStyle(cssVar: string): CSSProperties {
  return { color: `var(${cssVar})` };
}

function bgAccentStyle(cssVar: string, alpha: number): CSSProperties {
  return { background: `color-mix(in srgb, var(${cssVar}) ${alpha * 100}%, transparent)` };
}

function borderAccentStyle(cssVar: string, alpha: number, side: 'left' | 'all' = 'left'): CSSProperties {
  const c = `color-mix(in srgb, var(${cssVar}) ${alpha * 100}%, transparent)`;
  return side === 'left'
    ? { borderLeft: `4px solid ${c}` }
    : { border: `1px solid ${c}` };
}

type AnyMessage = { role: string; parts: Array<{ type: string; state?: string }> };

function findActiveAgentKey(messages: AnyMessage[]): string | null {
  for (let mi = messages.length - 1; mi >= 0; mi--) {
    const m = messages[mi];
    if (m.role !== 'assistant') continue;
    for (let pi = m.parts.length - 1; pi >= 0; pi--) {
      const p = m.parts[pi];
      if (p.type.startsWith('tool-') && p.state === 'input-available') {
        return p.type.slice('tool-'.length);
      }
    }
    break;
  }
  return null;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function extractPromptText(input: unknown): string {
  if (!input || typeof input !== 'object') return '';
  return Object.values(input as Record<string, unknown>)
    .filter((v): v is string => typeof v === 'string')
    .join(' ');
}

function readField(output: unknown, key: string): unknown {
  if (!output || typeof output !== 'object') return undefined;
  const o = output as { output?: unknown };
  const inner = o.output;
  if (!inner || typeof inner !== 'object') return undefined;
  return (inner as Record<string, unknown>)[key];
}

function extractAgentOutput(output: unknown): string {
  if (!output || typeof output !== 'object') return '';
  const o = output as { output?: unknown };
  const inner = o.output;
  if (typeof inner === 'string') return inner;
  if (inner && typeof inner === 'object') {
    const t = (inner as { text?: unknown }).text;
    if (typeof t === 'string') return t;
  }
  return JSON.stringify(output);
}

function extractDurationMs(output: unknown): number | null {
  if (!output || typeof output !== 'object') return null;
  const o = output as { durationMs?: unknown };
  return typeof o.durationMs === 'number' ? o.durationMs : null;
}

function extractStringField(output: unknown, key: string): string | null {
  const v = readField(output, key);
  return typeof v === 'string' ? v : null;
}

/* ───────── Main app: shell with sidebar + chat ───────── */

export default function Home() {
  const [hydrated, setHydrated] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [memory, setMemory] = useState<MemoryEntry[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    let nextSessions = loadSessions();
    let active = loadActiveSessionId();
    if (!active || !nextSessions.some((s) => s.id === active)) {
      const fresh = makeNewSession();
      nextSessions = [fresh, ...nextSessions];
      active = fresh.id;
      saveSessions(nextSessions);
      saveActiveSessionId(active);
    }
    setSessions(nextSessions);
    setActiveId(active);
    setMemory(loadMemory());
    setHydrated(true);
  }, []);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeId),
    [sessions, activeId],
  );

  const handleNewSession = () => {
    const fresh = makeNewSession();
    const next = [fresh, ...sessions];
    setSessions(next);
    setActiveId(fresh.id);
    saveSessions(next);
    saveActiveSessionId(fresh.id);
    setSidebarOpen(false);
  };

  const handleSelectSession = (id: string) => {
    setActiveId(id);
    saveActiveSessionId(id);
    setSidebarOpen(false);
  };

  const handleDeleteSession = (id: string) => {
    const next = sessions.filter((s) => s.id !== id);
    if (next.length === 0) {
      const fresh = makeNewSession();
      setSessions([fresh]);
      setActiveId(fresh.id);
      saveSessions([fresh]);
      saveActiveSessionId(fresh.id);
      return;
    }
    setSessions(next);
    saveSessions(next);
    if (activeId === id) {
      setActiveId(next[0].id);
      saveActiveSessionId(next[0].id);
    }
  };

  const handleMessagesChange = (messages: StoredMessage[]) => {
    if (!activeId) return;
    setSessions((prev) => {
      const next = prev.map((s) =>
        s.id === activeId
          ? { ...s, messages, updatedAt: Date.now(), title: deriveTitle(messages) }
          : s,
      );
      saveSessions(next);
      return next;
    });
  };

  const handleMemorize = (fact: string) => {
    if (!fact.trim()) return;
    setMemory((prev) => {
      if (prev.some((m) => m.fact === fact)) return prev;
      const next: MemoryEntry[] = [
        { id: generateId('m'), fact, createdAt: Date.now() },
        ...prev,
      ];
      saveMemory(next);
      return next;
    });
  };

  const handleMemoryDelete = (id: string) => {
    setMemory((prev) => {
      const next = prev.filter((m) => m.id !== id);
      saveMemory(next);
      return next;
    });
  };

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-[10px] tracking-[0.4em] uppercase text-[color:var(--brass)] font-mono brass-pulse">
          Opening the agency …
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        sessions={sessions}
        activeId={activeId}
        memory={memory}
        onNewSession={handleNewSession}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
        onMemoryDelete={handleMemoryDelete}
      />

      <div className="flex-1 min-w-0 lg:ml-72">
        <button
          type="button"
          className="lg:hidden fixed top-3 left-3 z-30 paper-card rounded-sm px-3 py-2 text-xs font-mono tracking-[0.2em] uppercase"
          onClick={() => setSidebarOpen(true)}
        >
          ☰ Files
        </button>
        <ChatArea
          key={activeId}
          sessionTitle={activeSession?.title ?? '새 의뢰'}
          initialMessages={activeSession?.messages ?? []}
          memory={memory}
          onMessagesChange={handleMessagesChange}
          onMemorize={handleMemorize}
        />
      </div>
    </div>
  );
}

/* ───────── Sidebar ───────── */

function Sidebar({
  open,
  onClose,
  sessions,
  activeId,
  memory,
  onNewSession,
  onSelectSession,
  onDeleteSession,
  onMemoryDelete,
}: {
  open: boolean;
  onClose: () => void;
  sessions: Session[];
  activeId: string;
  memory: MemoryEntry[];
  onNewSession: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onMemoryDelete: (id: string) => void;
}) {
  return (
    <>
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-black/30"
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside
        className={`fixed top-0 left-0 bottom-0 w-72 z-40 transition-transform overflow-y-auto ${
          open ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
        style={{
          background: 'color-mix(in srgb, var(--paper) 96%, var(--walnut))',
          borderRight: '1px solid color-mix(in srgb, var(--brass) 30%, transparent)',
        }}
      >
        <div className="px-5 py-5 border-b" style={{ borderBottomColor: 'color-mix(in srgb, var(--brass) 25%, transparent)' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="serif-display text-lg font-semibold">The Agency</span>
            <button
              type="button"
              className="lg:hidden text-[10px] tracking-[0.3em] uppercase font-mono text-[color:var(--ink-soft)]"
              onClick={onClose}
            >
              ✕
            </button>
          </div>
          <button
            type="button"
            onClick={onNewSession}
            className="w-full rounded-sm py-2 text-xs tracking-[0.3em] uppercase font-mono transition-colors hover:opacity-90"
            style={{ background: 'var(--ink)', color: 'var(--paper)' }}
          >
            ＋ New Dispatch
          </button>
        </div>

        {/* Sessions */}
        <div className="px-5 py-4">
          <div className="text-[10px] tracking-[0.4em] uppercase text-[color:var(--brass)] font-mono mb-3">
            ─ Dispatch Log ─
          </div>
          {sessions.length === 0 && (
            <div className="text-xs italic text-[color:var(--ink-mute)]">기록 없음</div>
          )}
          <ul className="space-y-1">
            {sessions.map((s) => {
              const isActive = s.id === activeId;
              return (
                <li key={s.id}>
                  <div
                    className={`group flex items-start gap-2 rounded-sm px-2 py-2 text-sm cursor-pointer transition-colors ${
                      isActive ? '' : 'hover:bg-[color:var(--paper-3)]/40'
                    }`}
                    style={
                      isActive
                        ? {
                            background: 'color-mix(in srgb, var(--brass) 15%, transparent)',
                            borderLeft: '2px solid var(--brass)',
                          }
                        : { borderLeft: '2px solid transparent' }
                    }
                    onClick={() => onSelectSession(s.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{s.title}</div>
                      <div className="text-[10px] text-[color:var(--ink-mute)] font-mono mt-0.5">
                        {new Date(s.updatedAt).toLocaleString('ko-KR', {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-[color:var(--ink-mute)] text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`"${s.title}" 삭제할까요?`)) onDeleteSession(s.id);
                      }}
                      aria-label="Delete session"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Memory */}
        <div className="px-5 py-4 border-t" style={{ borderTopColor: 'color-mix(in srgb, var(--brass) 25%, transparent)' }}>
          <div className="text-[10px] tracking-[0.4em] uppercase text-[color:var(--brass)] font-mono mb-3">
            ─ Long-Term Memory ─
          </div>
          {memory.length === 0 && (
            <div className="text-xs italic text-[color:var(--ink-mute)]">
              에이전트가 중요한 사실을 발견하면 자동으로 여기 기록합니다.
            </div>
          )}
          <ul className="space-y-2">
            {memory.map((m) => (
              <li
                key={m.id}
                className="group flex items-start gap-2 rounded-sm px-2 py-2 text-xs"
                style={{
                  background: 'color-mix(in srgb, var(--paper-3) 60%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--brass) 20%, transparent)',
                }}
              >
                <span className="text-[color:var(--brass)] font-mono text-[10px] mt-0.5">📌</span>
                <span className="flex-1 leading-snug">{m.fact}</span>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('이 기억을 삭제할까요?')) onMemoryDelete(m.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-[color:var(--ink-mute)]"
                  aria-label="Delete memory"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div
          className="px-5 py-4 text-[9px] tracking-[0.3em] uppercase font-mono mt-auto"
          style={{ color: 'var(--ink-mute)' }}
        >
          DGrid × Vercel AI · xAI Grok
        </div>
      </aside>
    </>
  );
}

/* ───────── Chat area ───────── */

function ChatArea({
  sessionTitle,
  initialMessages,
  memory,
  onMessagesChange,
  onMemorize,
}: {
  sessionTitle: string;
  initialMessages: StoredMessage[];
  memory: MemoryEntry[];
  onMessagesChange: (messages: StoredMessage[]) => void;
  onMemorize: (fact: string) => void;
}) {
  const [input, setInput] = useState('');

  const memoryFacts = useMemo(() => memory.map((m) => m.fact), [memory]);
  const memoryRef = useRef(memoryFacts);
  useEffect(() => {
    memoryRef.current = memoryFacts;
  }, [memoryFacts]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        prepareSendMessagesRequest: ({ messages }) => ({
          body: { messages, memory: memoryRef.current },
        }),
      }),
    [],
  );

  const { messages, sendMessage, status } = useChat({
    transport,
    messages: initialMessages as never,
  });

  const busy = status === 'submitted' || status === 'streaming';
  const activeKey = busy ? findActiveAgentKey(messages as AnyMessage[]) : null;

  // Persist messages on every change
  const onMessagesChangeRef = useRef(onMessagesChange);
  useEffect(() => {
    onMessagesChangeRef.current = onMessagesChange;
  }, [onMessagesChange]);
  useEffect(() => {
    if (messages.length === 0) return;
    onMessagesChangeRef.current(messages as unknown as StoredMessage[]);
  }, [messages]);

  // Capture memorize tool calls
  const onMemorizeRef = useRef(onMemorize);
  useEffect(() => {
    onMemorizeRef.current = onMemorize;
  }, [onMemorize]);
  const seenMemorizeRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const msg of messages) {
      if (msg.role !== 'assistant') continue;
      for (const part of msg.parts) {
        if (part.type !== 'tool-memorize') continue;
        const p = part as { state?: string; toolCallId?: string; output?: unknown };
        if (p.state !== 'output-available') continue;
        const key = p.toolCallId ?? `${msg.id}:${JSON.stringify(p.output)}`;
        if (seenMemorizeRef.current.has(key)) continue;
        seenMemorizeRef.current.add(key);
        const fact = readField(p.output, 'fact');
        if (typeof fact === 'string' && fact.trim()) {
          onMemorizeRef.current(fact.trim());
        }
      }
    }
  }, [messages]);

  return (
    <div className="flex flex-col text-[color:var(--ink)]">
      {/* Masthead */}
      <header className="max-w-5xl w-full mx-auto px-6 pt-14 pb-8">
        <div className="flex items-center justify-center gap-4 mb-5">
          <div className="h-px flex-1 max-w-32 brass-line" />
          <div className="text-[10px] tracking-[0.45em] uppercase text-[color:var(--brass)] font-medium font-mono">
            Est. 2026 · Dgrid × Vercel AI · xAI
          </div>
          <div className="h-px flex-1 max-w-32 brass-line" />
        </div>
        <h1 className="serif-display text-center text-5xl md:text-7xl font-medium tracking-tight leading-none">
          The <span className="italic font-normal">Automation</span> Agency
        </h1>
        <p className="serif-display italic text-center text-[color:var(--ink-soft)] text-lg md:text-xl mt-3 tracking-wide">
          오케스트레이터와 6명의 전문가가 당신의 의뢰를 처리합니다
        </p>
        <div className="flex items-center justify-center gap-3 mt-5">
          <div className="h-px w-10 brass-line" />
          <div className="text-[10px] tracking-[0.4em] uppercase text-[color:var(--ink-mute)] font-mono">
            an artisanal multi-agent practice
          </div>
          <div className="h-px w-10 brass-line" />
        </div>
        <div className="text-center mt-4 text-xs text-[color:var(--ink-soft)]">
          현재 의뢰: <span className="serif-display italic">{sessionTitle}</span>
        </div>
      </header>

      {/* Roster */}
      <section className="max-w-5xl w-full mx-auto px-6 pb-10">
        <div className="text-center mb-4">
          <div className="text-[10px] tracking-[0.4em] uppercase text-[color:var(--brass)] font-mono">
            ─ Today&rsquo;s Roster ─
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <Nameplate agent={ORCHESTRATOR} principal active={busy && activeKey === null} />
          {Object.entries(AGENTS).map(([key, a]) => (
            <Nameplate key={a.name} agent={a} active={activeKey === key} />
          ))}
        </div>
      </section>

      {/* Log */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-6 pb-44">
        {messages.length === 0 && (
          <div className="paper-card rounded-sm p-10 text-center mt-2">
            <div className="text-[10px] tracking-[0.4em] uppercase text-[color:var(--brass)] mb-4 font-mono">
              ─ No active dispatches ─
            </div>
            <p className="serif-display italic text-[color:var(--ink-soft)] text-2xl mb-3">
              아래에 자동화 의뢰를 작성하세요
            </p>
            <div className="text-xs text-[color:var(--ink-mute)] mt-4 max-w-md mx-auto leading-relaxed">
              예시: <span className="italic">&ldquo;경쟁사 SEO를 자동으로 모니터링하는 시스템을 만들어 staging에 배포해주세요&rdquo;</span>
            </div>
          </div>
        )}

        <div className="space-y-5 mt-2">
          {messages.map((message) => (
            <div key={message.id}>
              {message.role === 'user' && <DirectorNote parts={message.parts as unknown as MessagePart[]} />}
              {message.role === 'assistant' && (
                <div className="space-y-3">
                  {message.parts.map((part, i) => {
                    if (part.type === 'text') {
                      return part.text ? (
                        <OrchestratorMemo key={i} text={part.text} />
                      ) : null;
                    }
                    if (part.type === 'tool-memorize') {
                      return <MemoryNote key={i} part={part as ToolPart} />;
                    }
                    const m = part.type.match(/^tool-(.+)$/);
                    if (!m) return null;
                    const k = m[1];
                    if (!isAgentKey(k)) return null;
                    return <AgentReport key={i} agent={AGENTS[k]} part={part as ToolPart} />;
                  })}
                </div>
              )}
            </div>
          ))}
          {busy && (
            <div className="flex items-center justify-center gap-3 py-6">
              <div className="h-px w-12 brass-line" />
              <div className="text-[10px] tracking-[0.4em] uppercase text-[color:var(--brass)] font-mono brass-pulse">
                In session · 에이전트 협의 중
              </div>
              <div className="h-px w-12 brass-line" />
            </div>
          )}
        </div>
      </main>

      {/* Dispatch tray */}
      <footer
        className="fixed bottom-0 left-0 right-0 lg:left-72 border-t backdrop-blur-md"
        style={{
          borderTopColor: 'color-mix(in srgb, var(--brass) 35%, transparent)',
          background: 'color-mix(in srgb, var(--paper) 92%, transparent)',
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!input.trim() || busy) return;
            sendMessage({ text: input });
            setInput('');
          }}
          className="max-w-3xl mx-auto px-6 py-5"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="text-[10px] tracking-[0.4em] uppercase text-[color:var(--brass)] font-mono">
              New Dispatch
            </div>
            <div className="h-px flex-1 brass-line" />
          </div>
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-sm px-4 py-3 text-sm focus:outline-none placeholder:italic transition-colors"
              style={{
                background: 'var(--paper-2)',
                border: '1px solid color-mix(in srgb, var(--brass) 35%, transparent)',
                color: 'var(--ink)',
              }}
              value={input}
              placeholder="자동화 의뢰를 작성해주세요..."
              onChange={(e) => setInput(e.currentTarget.value)}
              disabled={busy}
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="px-5 py-3 rounded-sm text-sm tracking-[0.2em] uppercase font-medium disabled:opacity-40 transition-colors font-mono"
              style={{ background: 'var(--ink)', color: 'var(--paper)' }}
            >
              Send
            </button>
          </div>
        </form>
      </footer>
    </div>
  );
}

/* ───────── Sub-components ───────── */

function Nameplate({
  agent,
  principal = false,
  active = false,
}: {
  agent: AgentMeta;
  principal?: boolean;
  active?: boolean;
}) {
  return (
    <div
      className={`nameplate rounded-sm px-3 py-3 text-center relative overflow-hidden transition-all ${
        active ? 'nameplate-active' : ''
      }`}
    >
      {principal && (
        <div
          className="absolute top-1 right-1 text-[10px] tracking-[0.3em] uppercase font-mono"
          style={{ color: 'var(--brass)' }}
        >
          ★
        </div>
      )}
      <div className="text-2xl mb-1" aria-hidden>{agent.emoji}</div>
      <div className="serif-display text-base font-semibold leading-tight" style={accentStyle(agent.cssVar)}>
        {agent.name}
      </div>
      <div className="text-[10px] text-[color:var(--ink-soft)] mt-1 leading-tight">{agent.role}</div>
      <div className="mt-2 h-px" style={bgAccentStyle(agent.cssVar, 0.5)} />
      <div
        className={`text-[9px] tracking-[0.3em] uppercase mt-1.5 font-mono ${active ? 'brass-pulse' : ''}`}
        style={{ color: 'var(--brass)' }}
      >
        {active ? 'In Session' : 'On Duty'}
      </div>
    </div>
  );
}

type MessagePart = { type: string; text?: string };

function DirectorNote({ parts }: { parts: MessagePart[] }) {
  return (
    <div className="paper-card rounded-sm p-5" style={borderAccentStyle('--ink', 1)}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] tracking-[0.4em] uppercase text-[color:var(--ink-soft)] font-mono">
          From the Director
        </div>
        <div className="text-[10px] tracking-[0.3em] uppercase text-[color:var(--brass)] font-mono">
          ✦ Dispatch
        </div>
      </div>
      <div className="serif-display text-lg leading-relaxed text-[color:var(--ink)]">
        {parts.map((p, i) =>
          p.type === 'text' && p.text ? (
            <span key={i} className="whitespace-pre-wrap">{p.text}</span>
          ) : null,
        )}
      </div>
    </div>
  );
}

function OrchestratorMemo({ text }: { text: string }) {
  return (
    <div className="paper-card rounded-sm p-5" style={borderAccentStyle(ORCHESTRATOR.cssVar, 1)}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base" aria-hidden>{ORCHESTRATOR.emoji}</span>
          <span className="serif-display font-semibold text-base" style={accentStyle(ORCHESTRATOR.cssVar)}>
            {ORCHESTRATOR.name}
          </span>
          <span className="text-[10px] text-[color:var(--ink-mute)] font-mono">· {ORCHESTRATOR.role}</span>
        </div>
        <div className="text-[10px] tracking-[0.3em] uppercase text-[color:var(--brass)] font-mono">
          Memorandum
        </div>
      </div>
      <div className="text-sm text-[color:var(--ink)] whitespace-pre-wrap leading-relaxed">{text}</div>
    </div>
  );
}

function MemoryNote({ part }: { part: ToolPart }) {
  if (part.state !== 'output-available') return null;
  const fact = extractStringField(part.output, 'fact');
  if (!fact) return null;
  return (
    <div
      className="rounded-sm px-4 py-2 flex items-center gap-3"
      style={{
        background: 'color-mix(in srgb, var(--brass) 10%, transparent)',
        border: '1px solid color-mix(in srgb, var(--brass) 30%, transparent)',
      }}
    >
      <span className="text-base">📌</span>
      <span className="text-[10px] tracking-[0.3em] uppercase font-mono" style={{ color: 'var(--brass)' }}>
        Memorized
      </span>
      <span className="text-sm text-[color:var(--ink)] flex-1">{fact}</span>
    </div>
  );
}

type ToolPart = {
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

function AgentReport({ agent, part }: { agent: AgentMeta; part: ToolPart }) {
  const promptText = extractPromptText(part.input);
  const durationMs = extractDurationMs(part.output);
  const previewImageUrl = extractStringField(part.output, 'previewImageUrl');
  const imageError = extractStringField(part.output, 'imageError');
  const previewVideoUrl = extractStringField(part.output, 'previewVideoUrl');
  const videoError = extractStringField(part.output, 'videoError');

  return (
    <div className="paper-card rounded-sm overflow-hidden" style={borderAccentStyle(agent.cssVar, 1)}>
      <div className="px-5 py-3 flex items-center justify-between" style={bgAccentStyle(agent.cssVar, 0.07)}>
        <div className="flex items-center gap-2">
          <span className="text-base" aria-hidden>{agent.emoji}</span>
          <span className="serif-display font-semibold text-base" style={accentStyle(agent.cssVar)}>
            {agent.name}
          </span>
          <span className="text-[10px] text-[color:var(--ink-mute)] font-mono">· {agent.role}</span>
        </div>
        <div className="flex items-center gap-3">
          {durationMs !== null && (
            <span className="text-[10px] tracking-wider font-mono text-[color:var(--ink-soft)]">
              {formatDuration(durationMs)}
            </span>
          )}
          <span className="text-[10px] tracking-[0.3em] uppercase text-[color:var(--brass)] font-mono">
            Field Report
          </span>
        </div>
      </div>

      <div className="p-5 space-y-3">
        {promptText && (
          <div
            className="text-xs italic text-[color:var(--ink-soft)] pl-3"
            style={borderAccentStyle(agent.cssVar, 0.4)}
          >
            <span
              className="text-[10px] tracking-[0.3em] uppercase not-italic mr-2 font-mono"
              style={{ color: 'var(--brass)' }}
            >
              Briefing
            </span>
            {promptText}
          </div>
        )}

        {part.state === 'input-streaming' && (
          <div className="text-xs italic text-[color:var(--ink-mute)]">…요청서 작성 중</div>
        )}
        {part.state === 'input-available' && (
          <div className="text-xs italic text-[color:var(--ink-soft)] brass-pulse">
            … {agent.name} 작업 중
          </div>
        )}
        {part.state === 'output-available' && part.output != null && (
          <div className="space-y-3">
            <div className="text-sm text-[color:var(--ink)] whitespace-pre-wrap leading-relaxed">
              {extractAgentOutput(part.output)}
            </div>
            {previewImageUrl && (
              <figure className="mt-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewImageUrl}
                  alt="Storyboard preview"
                  className="w-full rounded-sm border"
                  style={{ borderColor: `color-mix(in srgb, var(${agent.cssVar}) 40%, transparent)` }}
                />
                <figcaption className="text-[10px] tracking-[0.3em] uppercase font-mono mt-1 text-[color:var(--brass)]">
                  ✦ Storyboard preview · X / Grok
                </figcaption>
              </figure>
            )}
            {imageError && (
              <div
                className="mt-2 rounded-sm border px-3 py-2"
                style={{
                  background: 'color-mix(in srgb, #a02d3d 8%, transparent)',
                  borderColor: 'color-mix(in srgb, #a02d3d 40%, transparent)',
                }}
              >
                <div
                  className="text-[10px] tracking-[0.3em] uppercase font-mono mb-1"
                  style={{ color: '#a02d3d' }}
                >
                  ⚠ Image generation failed
                </div>
                <div className="text-xs" style={{ color: '#a02d3d' }}>{imageError}</div>
              </div>
            )}
            {previewVideoUrl && (
              <figure className="mt-2">
                <video
                  src={previewVideoUrl}
                  controls
                  loop
                  muted
                  playsInline
                  className="w-full rounded-sm border"
                  style={{ borderColor: `color-mix(in srgb, var(${agent.cssVar}) 40%, transparent)` }}
                />
                <figcaption className="text-[10px] tracking-[0.3em] uppercase font-mono mt-1 text-[color:var(--brass)]">
                  ✦ Motion clip · X / Grok Imagine
                </figcaption>
              </figure>
            )}
            {videoError && (
              <div
                className="mt-2 rounded-sm border px-3 py-2"
                style={{
                  background: 'color-mix(in srgb, #a02d3d 8%, transparent)',
                  borderColor: 'color-mix(in srgb, #a02d3d 40%, transparent)',
                }}
              >
                <div
                  className="text-[10px] tracking-[0.3em] uppercase font-mono mb-1"
                  style={{ color: '#a02d3d' }}
                >
                  ⚠ Video generation failed
                </div>
                <div className="text-xs" style={{ color: '#a02d3d' }}>{videoError}</div>
              </div>
            )}
          </div>
        )}
        {part.state === 'output-error' && (
          <div className="text-sm" style={{ color: '#a02d3d' }}>
            ⚠ {part.errorText ?? 'Error'}
          </div>
        )}
      </div>
    </div>
  );
}
