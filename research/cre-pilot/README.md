# CRE public research evidence

Start with [the pilot brief](../../000-docs/041-RA-DATA-gulf-coast-cre-research-pilot.md).

- `2026-10-17-gulf-coast.json`: three-company evidence packet with source receipts,
  field-level provenance and explicit unknown relationships.
- `2026-10-17-source-checks.json`: packet-bound source-token validation receipt.

These are actual public-source observations, not model outputs, provider API
results, contact records or evidence of space demand. `status` and `qualification`
are deliberately separate. Do not ingest this packet as a qualified campaign.

To check the packet binding without network or provider calls:

```sh
python3 - <<'PY'
import hashlib, json
from pathlib import Path
root = Path('research/cre-pilot')
packet = (root / '2026-10-17-gulf-coast.json').read_bytes()
receipt = json.loads((root / '2026-10-17-source-checks.json').read_text())
assert hashlib.sha256(packet).hexdigest() == receipt['packetSha256']
print('Packet matches the recorded validation receipt.')
PY
```

The HTML digests identify the retrieved responses. A later fetch can differ
because sites contain dynamic content; digest drift alone is not evidence that a
specific claim changed. To refresh, review the relevant visible sections, retain
actual retrieval timestamps/status, and create a new dated packet and receipt.
