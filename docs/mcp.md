# Connecting an agent: MCP server and skill

Every okinvo instance serves an [MCP](https://modelcontextprotocol.io) server at
`POST /api/mcp` (Streamable HTTP, stateless, JSON responses). It authenticates with an API key
from Settings → API, and the key's scopes decide which tools the agent sees: a read-only key lists
`list_invoices`, `get_invoice`, `list_clients`, … and never `create_invoice`. There are no delete,
void, payment or settings tools, for any key.

## Claude Code

Add a `.mcp.json` to the project (or `claude mcp add --transport http okinvo https://<host>/api/mcp --header "Authorization: Bearer okv_…"`):

```json
{
  "mcpServers": {
    "okinvo": {
      "type": "http",
      "url": "https://invoices.example.com/api/mcp",
      "headers": { "Authorization": "Bearer okv_…" }
    }
  }
}
```

Keep the key out of version control: reference an environment variable instead
(`"Authorization": "Bearer ${OKINVO_KEY}"`) where the client supports expansion.

## Claude Desktop

Claude Desktop launches local servers; bridge the remote endpoint with `mcp-remote` in
`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "okinvo": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote", "https://invoices.example.com/api/mcp",
        "--header", "Authorization: Bearer ${OKINVO_KEY}"
      ],
      "env": { "OKINVO_KEY": "okv_…" }
    }
  }
}
```

Any MCP client that speaks Streamable HTTP with a static bearer header works the same way.

## The skill

`skills/okinvo-invoicing/` is an [Agent Skill](https://agentskills.io): `SKILL.md` tells an
agent when and how to use the API or the MCP tools (ids first, create then issue, decimal strings,
the hard limits) and `reference.md` lists every endpoint, tool and resource. Install it by copying
the folder into the agent's skills directory - for Claude Code, `.claude/skills/okinvo-invoicing/`
in a project or `~/.claude/skills/okinvo-invoicing/` for every project.

## Tools and resources

| Tool | Scope |
|---|---|
| `list_invoices`, `get_invoice` | `invoices:read` |
| `create_invoice`, `issue_invoice` | `invoices:create` |
| `list_credit_notes`, `get_credit_note` | `credit_notes:read` |
| `create_credit_note`, `issue_credit_note` | `credit_notes:create` |
| `list_clients`, `list_profiles`, `list_catalogue` | `catalogue:read` |
| `get_status` | `status:read` |
| resources `okinvo://invoices/{id}/pdf`, `okinvo://credit-notes/{id}/pdf` | `documents:read` |

Tool inputs are the REST request bodies; outputs are the REST DTOs (also returned as
`structuredContent`). Validation and lookup failures come back as in-band tool errors with the
same codes as the REST error envelope. Requests are rate-limited per key (120/min), bodies are
capped at 1 MB and checked against the keyboard-character rule, and `GET`/`DELETE` on `/api/mcp`
answer 405 - there is no session to open or close.

## Trying it by hand

```bash
curl -s https://invoices.example.com/api/mcp \
  -H "Authorization: Bearer $OKINVO_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```
