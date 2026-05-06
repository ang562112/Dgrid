/**
 * Browser-side persistence for chat sessions and long-term memory.
 * All data is stored in localStorage — no backend required.
 */

export type StoredMessagePart = {
  type: string;
  text?: string;
  [k: string]: unknown;
};

export type StoredMessage = {
  id: string;
  role: string;
  parts: StoredMessagePart[];
};

export type Session = {
  id: string;
  title: string;
  messages: StoredMessage[];
  createdAt: number;
  updatedAt: number;
};

export type MemoryEntry = {
  id: string;
  fact: string;
  createdAt: number;
};

const KEY_SESSIONS = 'aa.sessions.v1';
const KEY_ACTIVE = 'aa.activeSessionId.v1';
const KEY_MEMORY = 'aa.memory.v1';

const isBrowser = () => typeof window !== 'undefined' && typeof localStorage !== 'undefined';

function loadJSON<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveJSON(key: string, value: unknown): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`save ${key}`, err);
  }
}

export function loadSessions(): Session[] {
  const arr = loadJSON<Session[]>(KEY_SESSIONS, []);
  return Array.isArray(arr) ? arr : [];
}

export function saveSessions(sessions: Session[]): void {
  saveJSON(KEY_SESSIONS, sessions);
}

export function loadActiveSessionId(): string | null {
  if (!isBrowser()) return null;
  return localStorage.getItem(KEY_ACTIVE);
}

export function saveActiveSessionId(id: string): void {
  if (!isBrowser()) return;
  localStorage.setItem(KEY_ACTIVE, id);
}

export function loadMemory(): MemoryEntry[] {
  const arr = loadJSON<MemoryEntry[]>(KEY_MEMORY, []);
  return Array.isArray(arr) ? arr : [];
}

export function saveMemory(memory: MemoryEntry[]): void {
  saveJSON(KEY_MEMORY, memory);
}

export function generateId(prefix = 's'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function deriveTitle(messages: StoredMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return '새 의뢰';
  for (const part of firstUser.parts) {
    if (part.type === 'text' && typeof part.text === 'string' && part.text.trim()) {
      const t = part.text.trim();
      return t.length > 40 ? `${t.slice(0, 40)}…` : t;
    }
  }
  return '새 의뢰';
}

export function makeNewSession(): Session {
  const now = Date.now();
  return {
    id: generateId('s'),
    title: '새 의뢰',
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}
