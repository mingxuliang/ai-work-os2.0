const STORAGE_KEY = "qwenpaw.agentTeamPresentation.v1";

/** Where the agent was created from: the admin-managed "Agent 团队" page,
 * or a regular user's own "我的AI团队" page. Used to keep self-created
 * agents out of the shared Agent Team listing. */
export type AgentOrigin = "team" | "myTeam";

export type AgentTeamPresentation = {
  iconKey: string;
  tags: string[];
  category: string;
  summoned: boolean;
  origin: AgentOrigin;
};

const defaults: AgentTeamPresentation = {
  iconKey: "robot",
  tags: [],
  category: "office",
  summoned: false,
  origin: "team",
};

function readAll(): Record<string, AgentTeamPresentation> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<
      string,
      Partial<AgentTeamPresentation>
    >;
    return Object.fromEntries(
      Object.entries(parsed).map(([k, v]) => [
        k,
        {
          iconKey:
            typeof v?.iconKey === "string" ? v.iconKey : defaults.iconKey,
          tags: Array.isArray(v?.tags)
            ? v.tags.filter((x) => typeof x === "string")
            : [],
          category:
            typeof v?.category === "string" && v.category
              ? v.category
              : defaults.category,
          summoned: v?.summoned === true,
          origin: v?.origin === "myTeam" ? "myTeam" : "team",
        },
      ]),
    );
  } catch {
    return {};
  }
}

function writeAll(data: Record<string, AgentTeamPresentation>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function loadAgentPresentation(
  agentId: string,
): AgentTeamPresentation {
  const row = readAll()[agentId];
  return row ? { ...row } : { ...defaults };
}

export function saveAgentPresentation(
  agentId: string,
  data: Partial<AgentTeamPresentation>,
) {
  const all = readAll();
  const prev = all[agentId] ?? { ...defaults };
  all[agentId] = {
    iconKey: data.iconKey ?? prev.iconKey,
    tags: data.tags ?? prev.tags,
    category: data.category ?? prev.category,
    summoned: data.summoned ?? prev.summoned,
    origin: data.origin ?? prev.origin,
  };
  writeAll(all);
}

export function removeAgentPresentation(agentId: string) {
  const all = readAll();
  delete all[agentId];
  writeAll(all);
}

/** Returns IDs of all agents marked as summoned. */
export function getSummonedAgentIds(): Set<string> {
  const all = readAll();
  return new Set(
    Object.entries(all)
      .filter(([, v]) => v.summoned)
      .map(([id]) => id),
  );
}

/** Toggle the summoned state for an agent. Returns the new state. */
export function toggleSummoned(agentId: string): boolean {
  const all = readAll();
  const prev = all[agentId] ?? { ...defaults };
  const next = !prev.summoned;
  all[agentId] = { ...prev, summoned: next };
  writeAll(all);
  return next;
}
