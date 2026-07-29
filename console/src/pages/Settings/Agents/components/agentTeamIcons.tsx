/** Digital-employee avatar icons for agent create/edit (replaces Lucide set). */

export type TeamIconOption = {
  key: string;
  /** Public URL under console/public */
  src: string;
  label: string;
};

export const DEFAULT_TEAM_ICON_KEY = "de01";

/** 13 avatars from repo folder「数字员工图标」 */
export const TEAM_ICON_OPTIONS: TeamIconOption[] = [
  { key: "de01", src: "/agent-avatars/de01.jpg", label: "数字员工 01" },
  { key: "de02", src: "/agent-avatars/de02.jpg", label: "数字员工 02" },
  { key: "de03", src: "/agent-avatars/de03.jpg", label: "数字员工 03" },
  { key: "de04", src: "/agent-avatars/de04.jpg", label: "数字员工 04" },
  { key: "de05", src: "/agent-avatars/de05.jpg", label: "数字员工 05" },
  { key: "de06", src: "/agent-avatars/de06.jpg", label: "数字员工 06" },
  { key: "de07", src: "/agent-avatars/de07.jpg", label: "数字员工 07" },
  { key: "de08", src: "/agent-avatars/de08.jpg", label: "数字员工 08" },
  { key: "de09", src: "/agent-avatars/de09.jpg", label: "数字员工 09" },
  { key: "de10", src: "/agent-avatars/de10.jpg", label: "数字员工 10" },
  { key: "de11", src: "/agent-avatars/de11.jpg", label: "数字员工 11" },
  { key: "de12", src: "/agent-avatars/de12.jpg", label: "数字员工 12" },
  { key: "de13", src: "/agent-avatars/de13.jpg", label: "数字员工 13" },
];

/** Map legacy Lucide keys so previously saved agents still resolve. */
const LEGACY_ICON_KEY_MAP: Record<string, string> = {
  briefcase: "de01",
  lightbulb: "de02",
  settings: "de03",
  linechart: "de04",
  share: "de05",
  headphones: "de13",
  robot: "de12",
  globe: "de06",
  database: "de07",
  code: "de08",
  document: "de09",
  mountain: "de10",
};

export function normalizeTeamIconKey(iconKey?: string | null): string {
  if (!iconKey) return DEFAULT_TEAM_ICON_KEY;
  if (TEAM_ICON_OPTIONS.some((o) => o.key === iconKey)) return iconKey;
  return LEGACY_ICON_KEY_MAP[iconKey] ?? DEFAULT_TEAM_ICON_KEY;
}

export function resolveTeamIcon(
  iconKey?: string | null,
): TeamIconOption {
  const key = normalizeTeamIconKey(iconKey);
  return (
    TEAM_ICON_OPTIONS.find((o) => o.key === key) ??
    TEAM_ICON_OPTIONS.find((o) => o.key === DEFAULT_TEAM_ICON_KEY)!
  );
}
