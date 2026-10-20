#!/usr/bin/env bash
# Install the committed sandbox demo on the existing Intent Demos host.
set -euo pipefail
umask 077
demo_source="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(git -C "$demo_source" rev-parse --show-toplevel)"
revision="$(git -C "$repo_root" rev-parse HEAD)"
git -C "$repo_root" diff --quiet HEAD -- demos/batchdata-sandbox || {
  echo 'Commit the reviewed demo sources before deploying.' >&2; exit 1;
}
install_root="$HOME/.local/lib/intentsolutions/batchdata-demo"
state_root="$HOME/.local/state/intentsolutions/batchdata-demo"
release="$install_root/releases/$revision"
mkdir -p "$release" "$state_root" "$HOME/.config/systemd/user"
for file in server.py index.html; do
  install -m 600 "$demo_source/$file" "$release/$file"
done
ln -sfn "$release" "$install_root/current.next"
mv -fT "$install_root/current.next" "$install_root/current"
cat > "$HOME/.config/systemd/user/intent-batchdata-demo.service" <<EOF
[Unit]
Description=Intent Demos bounded BatchData sandbox proxy
After=network-online.target

[Service]
Type=simple
Environment=PATH=$HOME/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=/usr/bin/python3 $install_root/current/server.py --port 8767 --sops-file $HOME/.config/intentsolutions/api-providers.sops.json --key-path batchdata.sandbox_key --confirmed-sandbox --public-origin https://demos.intentsolutions.io --counter-file $state_root/admissions.sqlite --daily-limit 40
Restart=on-failure
RestartSec=5
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=$state_root
MemoryMax=256M
TasksMax=128

[Install]
WantedBy=default.target
EOF
systemctl --user daemon-reload
systemctl --user enable intent-batchdata-demo.service
systemctl --user restart intent-batchdata-demo.service
for ((startup_attempt=0; startup_attempt<15; startup_attempt++)); do
  if curl --silent --fail http://127.0.0.1:8767/api/status | python3 -c 'import sys,json; sys.exit(0 if json.load(sys.stdin)["ready"] else 1)' 2>/dev/null; then
    break
  fi
  sleep 1
done
curl --silent --fail http://127.0.0.1:8767/api/status | python3 -c 'import sys,json; assert json.load(sys.stdin)["ready"]'

# Only this new static route is copied; the rest of the demo host is preserved.
mkdir -p "$HOME/demos/intentoutreach"
chmod 755 "$HOME/demos/intentoutreach"
install -m 644 "$demo_source/index.html" "$HOME/demos/intentoutreach/index.html"

candidate="$(mktemp)"
trap 'rm -f "$candidate"' EXIT
python3 - "$candidate" <<'PY'
from pathlib import Path
import sys
path = Path('/etc/caddy/Caddyfile')
text = path.read_text()
marker = '    # BEGIN Intent BatchData sandbox demo\n'
legacy_block = '''    # BEGIN Intent BatchData sandbox demo
    redir /batchdata /batchdata/ 308
    handle_path /batchdata/* {
        reverse_proxy 127.0.0.1:8767 {
            header_up Host 127.0.0.1:8767
        }
    }
    # END Intent BatchData sandbox demo

'''
block = legacy_block.replace(
    '    redir /batchdata /batchdata/ 308\n',
    '    redir /intentoutreach /intentoutreach/ 308\n'
    '    redir /batchdata /intentoutreach/ 308\n'
    '    redir /batchdata/ /intentoutreach/ 308\n'
    '    handle_path /intentoutreach/* {\n'
    '        reverse_proxy 127.0.0.1:8767 {\n'
    '            header_up Host 127.0.0.1:8767\n'
    '        }\n'
    '    }\n'
)
anchor = '    # Contact/lead forms on demo pages ping Slack the same way the main site does:\n'
if marker not in text:
    if text.count(anchor) != 1:
        raise SystemExit('Expected Caddy insertion point missing or ambiguous; no configuration changed.')
    text = text.replace(anchor, block + anchor, 1)
elif legacy_block in text:
    text = text.replace(legacy_block, block, 1)
elif block not in text:
    raise SystemExit('Existing BatchData route differs; reconcile before deployment.')
Path(sys.argv[1]).write_text(text)
PY
sudo -n caddy validate --config "$candidate" --adapter caddyfile
if ! cmp -s "$candidate" /etc/caddy/Caddyfile; then
  sudo -n cp -f /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.before-batchdata-$(date -u +%Y%m%dT%H%M%SZ)"
  sudo -n install -m 644 "$candidate" /etc/caddy/Caddyfile
  sudo -n systemctl reload caddy
fi
echo "Published https://demos.intentsolutions.io/intentoutreach/ from $revision"
