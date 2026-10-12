# BatchData sandbox property desk

A local browser demo that builds a property search, displays actual returned records and lets you inspect each record. No fictional lead results, model inference, sending, CRM writes or production qualification are introduced. Contact enrichment is optional and uses the search endpoint's documented `options.skipTrace` flag.

## Run

```sh
python3 demos/batchdata-sandbox/server.py
```

Open http://127.0.0.1:8765. Request previews work without a key; provider searches remain disabled.

The credential must be confirmed as a sandbox token in the BatchData account. This code cannot verify token mode from its name or value. Once its storage location and sandbox permissions are known:

```sh
python3 demos/batchdata-sandbox/server.py \
  --sops-file /absolute/path/to/providers.sops.json \
  --key-path batchdata.sandbox_key --confirmed-sandbox
```

The shared workstation now has the encrypted credential at `/home/jeremy/.config/intentsolutions/api-providers.sops.json`, field `batchdata.sandbox_key`; use that file in the command above. Credentials are not included in this repository. Alternatively supply `BATCHDATA_SANDBOX_KEY` through an existing secure launcher, then run with `--confirmed-sandbox`. Never paste keys into the browser, shell arguments or source. SOPS decryption goes directly to server memory.

The demo forwards only to `https://api.batchdata.com/api/v1/property/search`, using the detailed endpoint contract (`searchCriteria`, `options.take`, `options.skip`, `options.datasets`). Five records per request and ten admitted requests per process. No retries or redirects, saved provider payloads, billing purchases, monitoring subscriptions or async callbacks. A sandbox token does not necessarily expose every dataset or prove real-world match rates. Nothing here treats DNC data as consent or approves outreach.

## Official references

- [LLM overview](https://developer.batchdata.com/docs/batchdata/llms-overview#quick-api-examples)
- [Detailed Property Search contract](https://developer.batchdata.com/docs/batchdata/batchdata-v1/operations/create-a-property-search)
- [Capabilities and monitoring](https://developer.batchdata.com/docs/batchdata/welcome-to-batchdata)
- [Official MCP tools, including comparables and phone checks](https://github.com/batchdataco/batchdata-mcp-server#available-tools)

The LLM overview abbreviates paths and pagination. The detailed operation specifies the versioned path and `options` wrapper used here. The broader API includes lookup, comps, skip/reverse tracing, address services, phone/DNC/TCPA checks, search sessions and property monitoring; this demo calls only property search. A bounded sandbox search returned HTTP 200 with three property records and `dataset_not_allowed` warnings. The response contained synthetic placeholder warning text; do not interpret returned records as verified Daphne leads. MCP initialization also returned HTTP 200, and `tools/list` discovered 21 tools without invoking property tools. OAuth dataset settings in the account UI govern OAuth MCP tokens, and do not prove this sandbox token has the same permissions.

## MCP connection

BatchData hosts a Streamable HTTP MCP server at `https://mcp.batchdata.com`. It supports OAuth or an `Authorization: Bearer` header supplied by a secure credential launcher. The official setup guide linked above covers client configuration. The demo uses REST property search; MCP initialization and tool discovery are separate checks, not calls to paid property tools. Do not put the token into a committed MCP configuration.

## Validation

Run `python3 -m unittest discover -s demos/batchdata-sandbox -p 'test_*.py' -v`. Seven offline boundary tests cover disabled/unconfirmed credentials, preview isolation, cross-origin rejection, the request cap, secret redaction, invalid inputs and provider-error sanitization without retries, cached responses, atomic admission and a restart-safe public budget. Desktop and 390px mobile browser checks rendered three sandbox records, with no JavaScript errors or horizontal overflow.

## Public deployment

Run `bash demos/batchdata-sandbox/deploy_public.sh` on the existing Intent Demos workstation after committing and reviewing the demo sources. It installs an immutable revision under `~/.local/lib/intentsolutions/batchdata-demo/releases/`, enables the `intent-batchdata-demo` user service on loopback port 8767, copies only `/batchdata/index.html`, and adds one scoped reverse-proxy handler to the existing Caddy demo host. The script validates Caddy before replacing its configuration, saves a timestamped prior configuration, and preserves every other demo directory and host route. It requires the existing SOPS sandbox field and noninteractive sudo for Caddy operations.

The public route is https://demos.intentsolutions.io/batchdata/. The key is decrypted into service memory. Same-origin POSTs are required, property search remains limited to five records, and a private SQLite admission counter caps all visitors together at 40 upstream requests per UTC day, including failures and across service restarts. Successful responses are cached in memory for ten minutes for identical requests, with explicit cached-response labels. No model calls or provider responses are persisted; SQLite stores only dates and request counts. Other origins, redirects, arbitrary destinations and extra API routes are refused.

Verify `systemctl --user status intent-batchdata-demo`, the public `/batchdata/api/status` route and an actual browser search. For rollback, stop the new service and restore the saved `Caddyfile.before-batchdata-*` after validation, or repoint the private `current` symlink to the prior reviewed release and restart the service. Never delete the admission counter to bypass the quota. User services require the host's existing user-manager startup/linger configuration to run after reboot.

## MCP alternatives assessed

The official hosted server is not the only possible integration. [Zellerhaus](https://github.com/zellerhaus/batchdata-mcp-real-estate) is an MIT-licensed, self-hosted stdio wrapper with eight registered tools, including boundary searches and address autocomplete. Its source uses `/property/search/sync`; compatibility with the current endpoint contract needs validation before adopting it. [Pipeworx](https://github.com/pipeworx-io/mcp-batchdata) is an MIT-licensed three-tool adapter for lookup, search and skip tracing; its `_apiKey` argument should be replaced with server-side credential injection in this environment. Neither was executed with our credential.

The official [MIT-licensed MCP demo app](https://github.com/batchdataco/batchdata-mcp-demo) adds chat, streaming progress, investment analysis and property comparison on top of the hosted MCP. It is a client/workflow layer, not a replacement server. The hosted MCP exposed 21 tools in our authenticated discovery check; no wrapper can grant datasets or permissions the BatchData account does not have.
