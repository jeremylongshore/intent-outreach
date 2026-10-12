#!/usr/bin/env python3
"""Local BatchData sandbox demo. Key stays in server memory; no saved responses."""
import argparse
import json
import os
import subprocess
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ENDPOINT = 'https://api.batchdata.com/api/v1/property/search'
PAGE = Path(__file__).with_name('index.html')


def payload(query, quicklist='', enrich=False):
    if not isinstance(query, str) or not 2 <= len(query.strip()) <= 120:
        raise ValueError('Enter a city and state, ZIP code, or property address.')
    allowed = ('', 'absentee-owner', 'high-equity', 'vacant', 'owner-occupied', 'active-listing')
    if quicklist not in allowed or not isinstance(enrich, bool):
        raise ValueError('Invalid search option.')
    criteria = {'query': query.strip()}
    if quicklist:
        criteria['quickList'] = quicklist
    datasets = ['basic', 'owner', 'valuation']
    if enrich:
        datasets.append('contact')
    return {'searchCriteria': criteria, 'options': {
        'take': 5, 'skip': 0, 'datasets': datasets, 'skipTrace': enrich,
    }}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def load_key(args):
    if args.sops_file:
        if not args.key_path:
            raise SystemExit('--key-path is required with --sops-file')
        parts = args.key_path.split('.')
        if any(not part or not part.replace('_', '').replace('-', '').isalnum() for part in parts):
            raise SystemExit('Invalid SOPS key path')
        extract = ''.join('[' + json.dumps(part) + ']' for part in parts)
        result = subprocess.run(['sops', '--decrypt', '--extract', extract, args.sops_file],
                                capture_output=True, text=True, timeout=20)
        if result.returncode:
            raise SystemExit('Cannot read the requested SOPS field; no secret output logged.')
        key = result.stdout.strip()
        try:
            decoded = json.loads(key)
            if isinstance(decoded, str):
                key = decoded
        except json.JSONDecodeError:
            pass
        return key
    return os.environ.get('BATCHDATA_SANDBOX_KEY', '').strip()


def make_handler(key, sandbox_confirmed, transport=None):
    opener = urllib.request.build_opener(NoRedirect())
    transport = transport or opener.open
    lock = threading.Lock()
    admitted = 0

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def reply(self, status, body):
            raw = json.dumps(body).encode()
            if key:
                raw = raw.replace(key.encode(), b'[redacted]')
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.end_headers()
            self.wfile.write(raw)

        def valid_host(self):
            return self.headers.get('Host') == f'127.0.0.1:{self.server.server_port}'

        def do_GET(self):
            if not self.valid_host():
                return self.reply(403, {'error': 'Use the local 127.0.0.1 URL.'})
            if self.path == '/api/status':
                return self.reply(200, {'keyLoaded': bool(key), 'sandboxConfirmed': sandbox_confirmed,
                    'ready': bool(key) and sandbox_confirmed, 'maxRequests': 10, 'maxRecordsPerRequest': 5})
            if self.path != '/':
                return self.reply(404, {'error': 'Unknown route.'})
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'")
            self.end_headers()
            self.wfile.write(PAGE.read_bytes())

        def do_POST(self):
            nonlocal admitted
            origin = f'http://127.0.0.1:{self.server.server_port}'
            if not self.valid_host() or self.headers.get('Origin') != origin:
                return self.reply(403, {'error': 'Local same-origin requests only.'})
            if self.path not in ('/api/preview', '/api/search'):
                return self.reply(404, {'error': 'Unknown route.'})
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 2048:
                    raise ValueError('Request size is invalid.')
                data = json.loads(self.rfile.read(length))
                request_body = payload(data.get('query'), data.get('quicklist', ''), data.get('enrich', False))
            except (ValueError, AttributeError, TypeError):
                return self.reply(400, {'error': 'Enter a valid search and supported filter.'})
            if self.path == '/api/preview':
                return self.reply(200, {'endpoint': ENDPOINT, 'method': 'POST', 'body': request_body, 'apiCalls': 0})
            if not key or not sandbox_confirmed:
                return self.reply(503, {'error': 'Sandbox key is not configured and verified. Request preview is available; no provider call was made.'})
            with lock:
                if admitted >= 10:
                    return self.reply(429, {'error': 'Demo limit of 10 requests reached. No provider call was made.'})
                admitted += 1
            req = urllib.request.Request(ENDPOINT, data=json.dumps(request_body).encode(), method='POST',
                headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'})
            try:
                with transport(req, timeout=25) as response:
                    raw = response.read(2_000_001)
                    if len(raw) > 2_000_000:
                        raise ValueError('Response too large.')
                    result = json.loads(raw)
                return self.reply(200, {'source': 'BatchData API', 'credentialMode': 'operator-confirmed sandbox key',
                    'requestNumber': admitted, 'data': result})
            except urllib.error.HTTPError as error:
                return self.reply(502, {'error': f'BatchData returned HTTP {error.code}. Check sandbox permissions. No retry was made.'})
            except Exception:
                return self.reply(502, {'error': 'Provider response unavailable or invalid. No retry was made.'})
    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--sops-file')
    parser.add_argument('--key-path', help='Dot-separated SOPS field, e.g. batchdata.sandbox_key')
    parser.add_argument('--confirmed-sandbox', action='store_true', help='Use only after verifying that the credential is a sandbox token.')
    args = parser.parse_args()
    key = load_key(args)
    server = ThreadingHTTPServer(('127.0.0.1', args.port), make_handler(key, args.confirmed_sandbox))
    print(f'BatchData demo: http://127.0.0.1:{server.server_port}', flush=True)
    print('Sandbox calls enabled.' if key and args.confirmed_sandbox else 'Request preview only; sandbox key not configured/confirmed.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
