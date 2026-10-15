---
title: MCP and skills
path: mcp-and-skills
order: 15
description: Connect Claude Code, Claude Desktop or any MCP client, and install the okinvo skill
---

# MCP and skills

Every instance serves an MCP server at `POST /api/mcp` (Streamable HTTP, stateless, JSON
responses). It authenticates with an API key from Settings > API, and the key's scopes decide
which tools the agent sees. There are no delete, void, payment or settings tools for any key.

## Claude Code

Add a `.mcp.json` to the project, or run
`claude mcp add --transport http okinvo https://<host>/api/mcp --header "Authorization: Bearer okv_..."`:

```json
{
  "mcpServers": {
    "okinvo": {
      "type": "http",
      "url": "https://invoices.example.com/api/mcp",
      "headers": { "Authorization": "Bearer ${OKINVO_KEY}" }
    }
  }
}
```

Keep the key out of version control: reference an environment variable where the client
expands them.

## Claude Desktop

Claude Desktop launches local servers; bridge the remote endpoint with `mcp-remote` in
`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "okinvo": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://invoices.example.com/api/mcp", "--header", "Authorization: Bearer ${OKINVO_KEY}"],
      "env": { "OKINVO_KEY": "okv_..." }
    }
  }
}
```

Any MCP client that speaks Streamable HTTP with a static bearer header works the same way.

## Tools and resources

| Tool | Scope |
| --- | --- |
| `list_invoices`, `get_invoice` | `invoices:read` |
| `create_invoice`, `issue_invoice` | `invoices:create` |
| `list_credit_notes`, `get_credit_note` | `credit_notes:read` |
| `create_credit_note`, `issue_credit_note` | `credit_notes:create` |
| `list_clients`, `list_profiles`, `list_catalogue` | `catalogue:read` |
| `get_status` | `status:read` |
| Resources `okinvo://invoices/{id}/pdf`, `okinvo://credit-notes/{id}/pdf` | `documents:read` |

Tool inputs are the REST request bodies and outputs the REST records; failures are in-band tool
errors carrying the REST error codes.

## The skill

`skills/okinvo-invoicing/` in the repository is an agent skill: `SKILL.md` tells an agent when
and how to use the API or the tools (ids first, create then issue, decimal strings, the hard
limits) and `reference.md` lists every endpoint, tool and resource. Install it by copying the
folder into the agent's skills directory, for Claude Code `.claude/skills/okinvo-invoicing/` in
a project or `~/.claude/skills/okinvo-invoicing/` for every project.

Related: [API and SDK](api-and-sdk.md).
