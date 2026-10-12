#!/usr/bin/env python3
"""Exercise the public workflow UI locally without credentials or provider calls.

Requires Python Playwright and Chromium. Set PLAYWRIGHT_CHROMIUM_EXECUTABLE
to use an existing browser installation; otherwise Playwright uses its default.
"""

import os
import threading
from http.server import ThreadingHTTPServer

from playwright.sync_api import expect, sync_playwright

from server import make_handler


def main():
    server = ThreadingHTTPServer(('127.0.0.1', 0), make_handler('', False))
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    base = f'http://127.0.0.1:{server.server_port}/'
    try:
        with sync_playwright() as playwright:
            options = {'headless': True}
            if executable := os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE'):
                options['executable_path'] = executable
            browser = playwright.chromium.launch(**options)
            for width in (1440, 768, 390):
                context = browser.new_context(
                    viewport={'width': width, 'height': 1000},
                    permissions=['clipboard-read', 'clipboard-write'],
                )
                page = context.new_page()
                errors, requests = [], []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.on('request', lambda request: requests.append(request.url))
                page.goto(base, wait_until='networkidle')
                page.locator('#marketInput').fill('Example market <img src=x onerror=alert(1)>')
                page.locator('#criteriaInput').fill('My own criteria')
                page.locator('#customWorkflow').fill('Weekly client packs from my approved records')
                titles = set()
                for persona in ('coastal', 'metro', 'buybox', 'prospector', 'relationships', 'commercial'):
                    page.locator('#personaSelect').select_option(persona)
                    titles.add(page.locator('#sampleTitle').inner_text())
                    expect(page.locator('#criteriaInput')).to_have_value('My own criteria')
                    expect(page.locator('#scopePreview')).to_contain_text('Weekly client packs')
                    assert page.locator('#scopePreview img').count() == 0
                assert len(titles) == 6
                page.locator('#destinationSelect').select_option('crm')
                assert 'Weekly client packs' in page.locator('#inquiryBrief').input_value()
                page.locator('#inquiryBrief').fill('Keep my handwritten scope')
                page.locator('#destinationSelect').select_option('intro')
                expect(page.locator('#inquiryBrief')).to_have_value('Keep my handwritten scope')
                page.locator('#copyBrief').click()
                expect(page.locator('#copyStatus')).to_contain_text('copied')
                assert page.evaluate('navigator.clipboard.readText()') == 'Keep my handwritten scope'
                page.locator('#refreshBrief').click()
                assert 'Weekly client packs' in page.locator('#inquiryBrief').input_value()

                expect(page.locator('[data-fixture-id]')).to_have_count(2)
                assert page.locator('[data-fixture-id]').evaluate_all(
                    'els => els.map(el => el.dataset.fixtureId)'
                ) == ['demo-01', 'demo-02']
                page.locator('#maxPrice').fill('640000')
                expect(page.locator('[data-fixture-id]')).to_have_count(1)
                page.locator('#maxPrice').fill('639999')
                expect(page.locator('[data-fixture-id]')).to_have_count(0)
                page.locator('#assetType').select_option('all')
                page.locator('#maxPrice').fill('1000000000')
                expect(page.locator('[data-fixture-id]')).to_have_count(5)
                assert page.locator('[data-fixture-id="demo-06"]').count() == 0
                expect(page.locator('#excludedProperties')).to_contain_text('asking price is unknown')
                page.locator('#maxPrice').fill('')
                expect(page.locator('#maxPrice')).to_have_attribute('aria-invalid', 'true')
                expect(page.locator('[data-fixture-id]')).to_have_count(0)
                page.locator('#maxPrice').fill('-1')
                expect(page.locator('#maxPrice')).to_have_attribute('aria-invalid', 'true')

                page.locator('#preview').click()
                expect(page.locator('#request')).to_contain_text('POST https://api.batchdata.com')
                assert all(url.startswith(base) for url in requests), requests
                assert not any('/api/search' in url for url in requests)
                assert page.locator('#contactCta').get_attribute('href') == 'https://intentsolutions.io/contact/?door=outcome'
                for path in ('mandy-design-audition/', 'scott-porter-automation/'):
                    assert page.locator(f'a[href$="/{path}"]').count() > 0
                page.locator('#personaSelect').focus()
                page.locator('#personaSelect').press('ArrowUp')
                assert page.evaluate('document.activeElement.id') == 'personaSelect'
                assert page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth')
                assert not errors, errors
                context.close()
                print(f'PASS {width}px: six workflows, preserved edits, clipboard, buy-box boundaries, local-only inputs, layout')
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
        worker.join()


if __name__ == '__main__':
    main()
