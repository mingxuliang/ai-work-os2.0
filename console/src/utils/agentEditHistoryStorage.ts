/** Frontend-only agent edit history (localStorage). Used by Agent Detail Modal timeline. */

const STORAGE_KEY = "qwenpaw.agentEditHistory.v1";
const MAX_EVENTS_PER_AGENT = 50;

export type AgentEditHistoryKind =
  | "created"
  | "profile_updated"
  | "skills_added"
  | "summoned"
  | "unsummoned";

export type AgentEditHistoryEvent = {
  id: string;
  agentId: string;
  kind: AgentEditHistoryKind;
  title: string;
  description?: string;
  /** ISO timestamp */
  at: string;
};

type Store = Record<string, AgentEditHistoryEvent[]>;

function readAll(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Store;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

function writeAll(data: Store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function listAgentEditHistory(agentId: string): AgentEditHistoryEvent[] {
  const list = readAll()[agentId] ?? [];
  return [...list].sort((a, b) => b.at.localeCompare(a.at));
}

export function appendAgentEditHistory(
  agentId: string,
  event: Omit<AgentEditHistoryEvent, "id" | "agentId" | "at"> & {
    at?: string;
  },
): AgentEditHistoryEvent {
  const all = readAll();
  const entry: AgentEditHistoryEvent = {
    id: makeId(),
    agentId,
    kind: event.kind,
    title: event.title,
    description: event.description,
    at: event.at ?? new Date().toISOString(),
  };
  const prev = all[agentId] ?? [];
  all[agentId] = [entry, ...prev].slice(0, MAX_EVENTS_PER_AGENT);
  writeAll(all);
  return entry;
}

export function removeAgentEditHistory(agentId: string) {
  const all = readAll();
  delete all[agentId];
  writeAll(all);
}

/** Format date for timeline chip, e.g. 7.30 */
export function formatEditHistoryDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getMonth() + 1}.${d.getDate()}`;
}
