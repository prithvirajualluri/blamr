# MCP adapter — blamr proxy for stdio and HTTP MCP servers

Requires blamr ingest running and `BLAMR_API_KEY`. Platform setup: [docs/INSTALL.md](../../docs/INSTALL.md).

## Usage

### Stdio (local MCP server)

```bash
python3 adapters/mcp/blamr_proxy.py run \
  --workflow-id vendor-procurement \
  --api-key "$BLAMR_API_KEY" \
  -- npx @modelcontextprotocol/server-filesystem /tmp
```

The proxy runs two relay threads so JSON-RPC responses are never dropped when multiple messages are in flight.

### HTTP / SSE (remote MCP server)

```bash
python3 adapters/mcp/blamr_proxy.py proxy \
  --workflow-id customer-support \
  --target https://mcp-server.example.com/mcp \
  --message '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search","arguments":{"q":"policy"}}}'
```

## Telemetry

Every `tools/call` emits a CausalEdge with:

- `call_type`: `MCP call`
- `confidence_out` / `intent_delta` derived from tool errors and latency
- Truncated input (arguments) and output previews

Run completion calls `completeRun` with `failed` when any tool returned an error.

## Environment

| Variable | Description |
|----------|-------------|
| `BLAMR_API_KEY` | Ingest key (or pass `--api-key`) |
| `BLAMR_ENDPOINT` | Default `http://localhost:3001/v1` |
