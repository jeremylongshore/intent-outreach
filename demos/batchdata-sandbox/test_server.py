"""Verify credential and request boundaries without contacting BatchData."""
import io
import json
import sqlite3
import threading
import tempfile
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

from server import DailyBudget, ENDPOINT, make_handler


class BoundaryTests(unittest.TestCase):
    def start(self, key='', confirmed=False, transport=None, **options):
        server = ThreadingHTTPServer(('127.0.0.1', 0), make_handler(key, confirmed, transport, **options))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        self.url = f'http://127.0.0.1:{server.server_port}'

    def post(self, body, route='/api/search', origin=None):
        request = urllib.request.Request(self.url + route, data=json.dumps(body).encode(),
            headers={'Content-Type': 'application/json', 'Origin': origin or self.url})
        try:
            response = urllib.request.urlopen(request, timeout=3)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.code, json.load(response)

    def test_preview_never_calls_provider(self):
        def forbidden(*args, **kwargs):
            self.fail('Preview contacted provider')
        self.start('test-secret', True, forbidden)
        code, result = self.post({'query': 'Daphne, AL'}, '/api/preview')
        self.assertEqual(code, 200)
        self.assertEqual(result['apiCalls'], 0)
        self.assertEqual(result['body']['options']['take'], 5)
        self.assertEqual(self.post({'query': 'Daphne, AL'}, origin='https://other.example')[0], 403)

    def test_missing_key_and_unconfirmed_key_block_network(self):
        for key, confirmed in [('', True), ('test-secret', False)]:
            with self.subTest(key_present=bool(key), confirmed=confirmed):
                self.start(key, confirmed, lambda *args, **kwargs: self.fail('Network called'))
                self.assertEqual(self.post({'query': 'Daphne, AL'})[0], 503)

    def test_fixed_destination_redaction_and_request_cap(self):
        calls = []
        def fake(request, timeout):
            calls.append(request)
            self.assertEqual(request.full_url, ENDPOINT)
            self.assertEqual(request.get_header('Authorization'), 'Bearer test-secret')
            return io.BytesIO(b'{"results":{},"echo":"test-secret"}')
        self.start('test-secret', True, fake)
        for _ in range(10):
            code, result = self.post({'query': 'Daphne, AL'})
            self.assertEqual(code, 200)
            self.assertNotIn('test-secret', json.dumps(result))
        self.assertEqual(self.post({'query': 'Daphne, AL'})[0], 429)
        self.assertEqual(len(calls), 10)

    def test_provider_failure_is_sanitized_and_not_retried(self):
        calls = []
        def failure(request, timeout):
            calls.append(request)
            raise urllib.error.HTTPError(ENDPOINT, 403, 'test-secret', {}, io.BytesIO(b'test-secret'))
        self.start('test-secret', True, failure)
        code, result = self.post({'query': 'Daphne, AL'})
        self.assertEqual(code, 502)
        self.assertNotIn('test-secret', json.dumps(result))
        self.assertEqual(len(calls), 1)
        for invalid in [[], None, {'query': 'x'}, {'query': 'Daphne', 'quicklist': []}]:
            self.assertEqual(self.post(invalid)[0], 400)
        self.assertEqual(len(calls), 1)

    def test_public_origin_cache_and_restart_safe_budget(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        path = temp.name + '/counts.sqlite'
        calls = []
        def fake(request, timeout):
            calls.append(request)
            return io.BytesIO(b'{"results":{"properties":[]}}')
        origin = 'https://demos.intentsolutions.io'
        self.start('test-secret', True, fake, public_origin=origin, budget=DailyBudget(path, 1))
        self.assertEqual(self.post({'query': 'Daphne, AL'})[0], 403)
        code, first = self.post({'query': 'Daphne, AL'}, origin=origin)
        self.assertEqual(code, 200)
        self.assertFalse(first['cached'])
        code, second = self.post({'query': 'Daphne, AL'}, origin=origin)
        self.assertEqual(code, 200)
        self.assertTrue(second['cached'])
        self.assertEqual(len(calls), 1)
        self.assertEqual(self.post({'query': 'Mobile, AL'}, origin=origin)[0], 429)
        self.assertFalse(DailyBudget(path, 1).admit())

    def test_budget_admission_is_atomic_across_workers(self):
        with tempfile.TemporaryDirectory() as temp:
            budget = DailyBudget(temp + '/counts.sqlite', 3)
            results = []
            workers = [threading.Thread(target=lambda: results.append(budget.admit())) for _ in range(12)]
            for worker in workers:
                worker.start()
            for worker in workers:
                worker.join()
            self.assertEqual(sum(results), 3)

    def test_public_budget_failure_blocks_network(self):
        class BrokenBudget:
            limit = 40
            def admit(self):
                raise sqlite3.OperationalError('private-state-location')
        origin = 'https://demos.intentsolutions.io'
        self.start('test-secret', True, lambda *args, **kwargs: self.fail('Network called'),
                   public_origin=origin, budget=BrokenBudget())
        code, result = self.post({'query': 'Daphne, AL'}, origin=origin)
        self.assertEqual(code, 503)
        self.assertNotIn('private-state-location', json.dumps(result))


if __name__ == '__main__':
    unittest.main()
