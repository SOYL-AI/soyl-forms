# MCP Server — Agent-First Soyl Forms

External agents (Claude, ChatGPT, Copilot) talk to Soyl over the
Model Context Protocol on one stateless endpoint:

`POST /api/mcp` — Streamable HTTP, JSON-RPC 2.0, Bearer API key.

No new product path: every tool produces or consumes the same versioned
`FormSchemaV1` JSON the builder and renderer already share
(`docs/15_future_ai.md` §7). AI output is validated, never auto-published
without an explicit confirm flag.

## Auth

Per-workspace API keys (`workspace_api_keys`, migration `0011`).
`Authorization: Bearer soyl_sk_<secret>` → workspace id. Only the
SHA-256 hash is stored; the secret is shown once at mint time.

Mint (needs `SUPABASE_SERVICE_ROLE_KEY` in env):

```bash
node scripts/mint-mcp-key.mjs <workspace-id> [name]
node scripts/mint-mcp-key.mjs <workspace-id> --revoke <key-prefix>
```

Every call checks key validity → workspace scope → plan → AI credits,
same enforcement points as the UI (`getWorkspacePlan`, credit ledger).

## The 10 tools

| # | Tool | Danger | Status |
| --- | --- | --- | --- |
| 1 | `list_forms` | read | live |
| 2 | `get_form_schema` | read | live |
| 3 | `draft_form` | 1 AI credit | live |
| 4 | `update_draft` | write | planned |
| 5 | `publish_form` | write, confirm | planned |
| 6 | `get_brand_kit` | read | planned |
| 7 | `get_share_link_qr` | read | planned |
| 8 | `start_session` | public | planned |
| 9 | `submit_answers` | public write | planned |
| 10 | `summarize_responses` | read + credit | planned |

`tools/list` advertises ONLY live tools. Planned tools are documented
here, not exposed, until their handlers land.

### 1. list_forms (live)

Workspace forms, newest first. Input: `{ limit?: 1–50 (default 20) }`.
Returns: `[{ id, title, slug, status, updatedAt }]` — no owner PII.

### 2. get_form_schema (live)

Input: exactly one of `{ formId: uuid }` (owned draft schema, needs key
scope) or `{ slug: string }` (published schema of a public form).
Returns: `{ id, title, slug, status, schema, theme, settings }`.
Unknown/inaccessible → JSON-RPC `Invalid params`, never owner data.

### 3. draft_form (live)

Same semantics as `POST /api/ai/generate`: prompt → validated draft,
never saved or published here. Input:

```json
{
  "description": "10–10000 chars, required",
  "brandKitId": "uuid, optional",
  "length": "short|medium|long",
  "tone": "string <=80, optional",
  "language": "string <=40, optional"
}
```

Spends `AI_COST_PER_DRAFT` atomically before the provider call, refunds
on failure. Empty balance → `402` mapped to JSON-RPC internal error
with a `topUp` hint (see §Errors).

### 4. update_draft (planned)

`{ formId, title?, schema, theme?, settings?, revision }` — same
server validation + optimistic revision check as `saveDraft`.

### 5. publish_form (planned)

`{ formId, confirm: true }` — `confirm` is REQUIRED true; without it
the call fails closed. Reuses publish RPC + paid-theme gating.

### 6. get_brand_kit (planned)

`{ brandKitId? }` — default kit when omitted. Returns colours, fonts,
voice, style. Feeds `draft_form` for on-brand drafts.

### 7. get_share_link_qr (planned)

`{ formId, format?: "png|svg" }` — canonical public URL + QR data URL.

### 8/9. start_session + submit_answers (planned, respondent side)

Agent-led interviews: fetch safe schema, ask one question at a time,
submit. `submit_answers` reuses the public submission validator,
rate limits, and plan/monthly caps. No key scope beyond the form slug.

### 10. summarize_responses (planned)

`{ formId, since? }` — opt-in open-text summary + theme clusters.
Costs 1 AI credit per call. Returns aggregates, never raw PII dumps.

## Protocol

Stateless JSON-RPC. Supported methods: `initialize`,
`notifications/initialized`, `tools/list`, `tools/call`. Batches
accepted (array body). Anything else → `-32601 Method not found`.

`GET /api/mcp` → `405`: this server has no SSE stream; POST only.

## Errors

JSON-RPC errors with stable `data.code` hints for agents:

| data.code | Meaning |
| --- | --- |
| `auth` | missing/invalid/revoked key (HTTP 401) |
| `rate_limited` | slow down (HTTP 429) |
| `invalid_params` | fix the input (HTTP 200, code -32602) |
| `no_credits` | top up or upgrade (HTTP 200, code -32002) |
| `ai_unavailable` | provider down, retry later |
| `not_found` | id/slug unknown or out of scope |

## Client config

MCP Inspector → Transport `Streamable HTTP` →
URL `https://<host>/api/mcp` → Header
`Authorization: Bearer soyl_sk_…`.

## Rollout

1. Spike (this doc): tools 1–3 + keys + script.
2. Creator writes: 4–7 with confirm gating + audit log.
3. Respondent side: 8–9 with abuse reuse (Turnstile/velocity).
4. Insights: 10, credit-metered. Then OAuth 2.1 for hosted connectors.
