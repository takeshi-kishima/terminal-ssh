export type TerminalColors = {
  foreground: string;
  background: string;
};

type ResolveTerminalColorsParams = {
  targetHost: string;
  isFromConfigFile: boolean;
  defaultColorsInput: unknown;
  hostColorsMap: Record<string, unknown>;
  resolvedHostName?: string;
  resolvedUser?: string;
};

const BUILT_IN_DEFAULT_COLORS: TerminalColors = {
  foreground: "#f0f0f0",
  background: "#1e1e1e",
};

export function parseTerminalColors(
  value: unknown,
  fallback: TerminalColors
): TerminalColors {
  if (!value || typeof value !== "object") {
    return fallback;
  }

  const record = value as Record<string, unknown>;
  const foreground =
    typeof record.foreground === "string" && record.foreground.trim().length > 0
      ? record.foreground.trim()
      : fallback.foreground;
  const background =
    typeof record.background === "string" && record.background.trim().length > 0
      ? record.background.trim()
      : fallback.background;

  return { foreground, background };
}

export function buildHostColorCandidates(
  targetHost: string,
  isFromConfigFile: boolean,
  resolvedHostName?: string,
  resolvedUser?: string
): string[] {
  const candidates: string[] = [];
  const normalizedHost = targetHost.trim();

  const pushCandidate = (value: string | undefined) => {
    if (!value) {
      return;
    }
    const normalizedValue = value.trim();
    if (!normalizedValue || candidates.includes(normalizedValue)) {
      return;
    }
    candidates.push(normalizedValue);
  };

  pushCandidate(normalizedHost);

  if (normalizedHost.includes("@")) {
    const hostPart = normalizedHost.split("@").pop();
    pushCandidate(hostPart);
  }

  if (isFromConfigFile) {
    pushCandidate(resolvedHostName);
    if (resolvedUser && resolvedHostName) {
      pushCandidate(`${resolvedUser}@${resolvedHostName}`);
    }
  }

  return candidates;
}

export function resolveTerminalColors(
  params: ResolveTerminalColorsParams
): TerminalColors {
  const defaultColors = parseTerminalColors(
    params.defaultColorsInput,
    BUILT_IN_DEFAULT_COLORS
  );

  const candidates = buildHostColorCandidates(
    params.targetHost,
    params.isFromConfigFile,
    params.resolvedHostName,
    params.resolvedUser
  );

  for (const candidate of candidates) {
    const hit = params.hostColorsMap[candidate];
    if (hit) {
      return parseTerminalColors(hit, defaultColors);
    }
  }

  return defaultColors;
}
