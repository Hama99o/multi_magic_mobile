/**
 * Personal API keys, Connect Claude / MCP connections, and AI usage — the
 * web's `/profile/me/api-keys` page (`pages/profile/api_keys/Index.tsx`,
 * `ConnectClaude.tsx`, `McpConnections.tsx`, `AiUsagePanel.tsx`).
 *
 * ── A NEW KEY'S TOKEN EXISTS ONCE ────────────────────────────────────────
 * `POST /api/v1/api_keys` is the ONLY answer that carries the raw token
 * (`fa_` + 64 hex); every later read sends `masked_token`. So `createApiKey`
 * returns it to the screen that shows it, and nothing else: it is never put
 * in React Query's cache (the list is refetched instead), never stored, never
 * logged. `logApiFailure` in http.ts logs a method and a path, never a body.
 */
import { http } from "./http";
import { arr, id as parseId, obj, optStr, readableRows, str } from "./parse";

export type ApiScope = "read" | "write";

export interface ApiKey {
  id: number;
  name: string;
  scopes: ApiScope[];
  /** `fa_••••1a2b` — never the token. */
  masked: string | null;
  active: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string | null;
}

export interface NewApiKey {
  key: ApiKey;
  /** Shown once by the screen that asked for it, and then dropped. */
  token: string;
}

function parseScopes(value: unknown): ApiScope[] {
  return (Array.isArray(value) ? value : []).filter((s): s is ApiScope => s === "read" || s === "write");
}

function parseApiKey(raw: unknown): ApiKey {
  const r = obj(raw, "api_key");
  return {
    id: parseId(r.id, "api_key.id"),
    name: str(r.name, "api_key.name"),
    scopes: parseScopes(r.scopes),
    masked: optStr(r.token),
    active: r.active !== false,
    lastUsedAt: optStr(r.last_used_at),
    expiresAt: optStr(r.expires_at),
    createdAt: optStr(r.created_at),
  };
}

export interface McpConnection {
  /** The OAuth client's id — what `DELETE /mcp/connections/:id` takes. */
  id: number;
  name: string;
  scopes: string[];
  connectedAt: string | null;
  lastUsedAt: string | null;
}

export interface McpCall {
  id: number;
  tool: string;
  status: string | null;
  via: string | null;
  createdAt: string | null;
}

export interface McpOverview {
  connections: McpConnection[];
  activity: McpCall[];
  /** `https://<host>/mcp`, from the server so it is right on every host. */
  endpoint: string | null;
}

function parseConnection(raw: unknown): McpConnection {
  const r = obj(raw, "connection");
  return {
    id: parseId(r.id, "connection.id"),
    name: optStr(r.name) ?? "MCP client",
    scopes: (Array.isArray(r.scopes) ? r.scopes : []).filter((s): s is string => typeof s === "string"),
    connectedAt: optStr(r.connected_at),
    lastUsedAt: optStr(r.last_used_at),
  };
}

function parseCall(raw: unknown): McpCall {
  const r = obj(raw, "activity");
  return {
    id: parseId(r.id, "activity.id"),
    tool: str(r.tool, "activity.tool"),
    status: optStr(r.status),
    via: optStr(r.via),
    createdAt: optStr(r.created_at),
  };
}

export const USAGE_PERIODS = [
  "this_month",
  "last_month",
  "last_30_days",
  "last_7_days",
  "this_year",
  "last_year",
  "all",
] as const;
export type UsagePeriod = (typeof USAGE_PERIODS)[number];

export interface UsageSummary {
  calls: number;
  credits: number;
  tokens: number;
  byProvider: { provider: string; calls: number; credits: number }[];
}

export interface AiUsage {
  period: UsagePeriod;
  mine: UsageSummary;
  /** Only when the person lent a key: what borrowers spent on it. */
  lent: (UsageSummary & { byBorrower: { name: string; calls: number; credits: number }[] }) | null;
}

const n = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);

function parseSummary(raw: unknown): UsageSummary {
  const r = (raw ?? {}) as Record<string, unknown>;
  const groups = (r.by_provider ?? {}) as Record<string, { calls?: unknown; credits?: unknown }>;
  return {
    calls: n(r.calls),
    credits: n(r.credits),
    tokens: n(r.tokens),
    byProvider: Object.entries(groups).map(([provider, g]) => ({ provider, calls: n(g?.calls), credits: n(g?.credits) })),
  };
}

export const developerApi = {
  /** Newest first (`order(created_at: :desc)`). */
  apiKeys: async (): Promise<ApiKey[]> => {
    const res = await http.get("/api/v1/api_keys");
    return readableRows(arr(obj(res.data, "api_keys").api_keys, "api_keys"), parseApiKey).rows;
  },

  createApiKey: async (name: string, scopes: ApiScope[], expiresAt: string | null): Promise<NewApiKey> => {
    const res = await http.post("/api/v1/api_keys", {
      api_key: { name, scopes, ...(expiresAt ? { expires_at: expiresAt } : {}) },
    });
    const raw = obj(obj(res.data, "api_key").api_key, "api_key");
    return { key: parseApiKey(raw), token: str(raw.token, "api_key.token") };
  },

  deleteApiKey: async (keyId: number): Promise<void> => {
    await http.delete(`/api/v1/api_keys/${keyId}`);
  },

  mcp: async (): Promise<McpOverview> => {
    const res = await http.get("/api/v1/mcp/connections");
    const body = obj(res.data, "mcp");
    return {
      connections: readableRows(arr(body.connections, "connections"), parseConnection).rows,
      activity: readableRows(Array.isArray(body.activity) ? body.activity : [], parseCall).rows,
      endpoint: optStr(body.endpoint),
    };
  },

  disconnectMcp: async (clientId: number): Promise<void> => {
    await http.delete(`/api/v1/mcp/connections/${clientId}`);
  },

  aiUsage: async (period: UsagePeriod): Promise<AiUsage> => {
    const res = await http.get("/api/v1/ai_usage", { params: { period } });
    const body = obj(res.data, "ai_usage");
    const lent = body.lent as Record<string, unknown> | undefined;
    return {
      period: (USAGE_PERIODS as readonly string[]).includes(String(body.period)) ? (body.period as UsagePeriod) : period,
      mine: parseSummary(body.mine),
      lent: lent
        ? {
            ...parseSummary(lent),
            byBorrower: (Array.isArray(lent.by_borrower) ? lent.by_borrower : []).map((b) => {
              const row = (b ?? {}) as Record<string, unknown>;
              return { name: optStr(row.name) ?? "—", calls: n(row.calls), credits: n(row.credits) };
            }),
          }
        : null,
    };
  },
};

/** The command the web shows, word for word (`ConnectClaude.tsx:16`). */
export function claudeCodeCommand(endpoint: string): string {
  return `claude mcp add --transport http multimagic ${endpoint} \\\n  --header "Authorization: Bearer YOUR_KEY"`;
}
