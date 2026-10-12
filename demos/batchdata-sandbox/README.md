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

Run `python3 -m unittest discover -s demos/batchdata-sandbox -p 'test_*.py' -v`. Four offline boundary tests cover disabled/unconfirmed credentials, preview isolation, cross-origin rejection, the request cap, secret redaction, invalid inputs and provider-error sanitization without retries. Desktop and 390px mobile browser checks rendered three sandbox records, with no JavaScript errors or horizontal overflow.
