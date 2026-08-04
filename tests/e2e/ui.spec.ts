import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EXPECTED_CONTROLS } from './control-inventory';

function localRecord(overrides: Record<string, unknown> = {}) {
  const signal = Array.from({ length: 500 }, (_, index) => Math.sin(index / 12) * 0.5);
  return {
    signal: {
      sampleRate: 500,
      duration: 1,
      units: 'mV',
      leads: { I: signal, II: signal.map((value) => value * 0.8) },
    },
    patient: {
      name: 'TEST, LOCAL',
      mrn: 'LOCAL-001',
      age: '8 yr',
      sex: 'U',
      testDateTime: '2026-08-04 12:00:00',
      orderId: 'local-001',
    },
    diagnosis: { statements: ['Source label only'] },
    ...overrides,
  };
}

async function openApp(page: Page) {
  await page.goto('/demo.html');
  await expect(page.getByRole('heading', { name: 'ECG worklist' })).toBeVisible();
  await expect(page.locator('#dataset-summary')).not.toContainText('Loading');
}

async function uploadJson(page: Page, content: unknown, name = 'record.json') {
  await page.getByRole('button', { name: 'Viewer' }).click();
  await page.locator('#file-input').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(content)),
  });
}

async function visibleControlInventory(page: Page) {
  return page.locator('button, input, select, a[href], [tabindex]:not([tabindex="-1"])').evaluateAll((elements) => elements
    .filter((element) => {
      const style = getComputedStyle(element);
      return !element.hasAttribute('hidden') && style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
    })
    .map((element) => ({
      control: element.getAttribute('data-control'),
      disabled: element.matches(':disabled'),
      reason: element.getAttribute('data-disabled-reason'),
      tag: element.tagName,
      text: element.textContent?.trim() || element.getAttribute('aria-label') || '',
    })));
}

async function installSameOriginGuard(page: Page) {
  const expectedOrigin = 'http://127.0.0.1:4173';
  const audit = { requests: [] as string[], blocked: [] as string[] };
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    audit.requests.push(url);
    if (new URL(url).origin !== expectedOrigin) {
      audit.blocked.push(url);
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
  return audit;
}

async function expectDisabledControlReason(page: Page, control: string) {
  const button = page.locator(`[data-control="${control}"]`);
  await expect(button).toBeDisabled();

  const [dataReason, title, reasonId] = await Promise.all([
    button.getAttribute('data-disabled-reason'),
    button.getAttribute('title'),
    button.getAttribute('aria-describedby'),
  ]);
  expect(dataReason, `${control} needs a disabled reason`).toBeTruthy();
  const reason = dataReason!.trim();
  expect(dataReason, `${control} reason must be trimmed`).toBe(reason);
  expect(reason.length, `${control} reason must be meaningful`).toBeGreaterThanOrEqual(20);
  expect(title, `${control} title must match its disabled reason`).toBe(reason);
  expect(reasonId, `${control} needs an aria description`).toBeTruthy();
  const description = page.locator(`#${reasonId}`);
  await expect(description, `${control} needs exactly one aria description`).toHaveCount(1);
  expect(await description.textContent(), `${control} description must match its disabled reason`).toBe(reason);
}

const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9J8uYAAAAASUVORK5CYII=', 'base64');

test('shows an unambiguous research boundary and never contains external analysis networking', async ({ page }) => {
  const networkAudit = await installSameOriginGuard(page);
  await openApp(page);

  await expect(page.getByRole('heading', { name: /Research use only/ })).toBeVisible();
  await expect(page.getByText(/does not provide a clinical interpretation/)).toBeVisible();
  await page.getByRole('button', { name: 'Viewer' }).click();
  await expect(page.getByText(/No waveform or patient field is sent to an AI or ML service/)).toBeVisible();

  for (const control of ['clinical-signing', 'experimental-ml', 'image-digitization']) {
    await expectDisabledControlReason(page, control);
  }

  await page.getByRole('button', { name: 'Worklist' }).click();
  const datasetRequest = page.waitForResponse((response) => response.url().includes('/json_ecgs/') && response.url().endsWith('.json'));
  await page.getByRole('button', { name: /Load ECG/ }).first().click();
  await datasetRequest;
  await expect(page.locator('#status-region')).toContainText('No data was transmitted externally');

  const requestsBeforeLocalLoad = networkAudit.requests.length;
  await page.locator('#file-input').setInputFiles({
    name: 'local-network-audit.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(localRecord())),
  });
  await expect(page.locator('#patient-id')).toHaveText('LOCAL-001');
  expect(networkAudit.requests).toHaveLength(requestsBeforeLocalLoad);
  expect(networkAudit.blocked).toEqual([]);
  expect(networkAudit.requests.length).toBeGreaterThan(2);
  expect(networkAudit.requests.every((url) => new URL(url).origin === 'http://127.0.0.1:4173')).toBe(true);
  expect(networkAudit.requests.some((url) => url.endsWith('/json_ecgs/index.json'))).toBe(true);
  expect(networkAudit.requests.some((url) => /\/json_ecgs\/[^/]+\.json$/.test(url))).toBe(true);

  const source = readFileSync(resolve(process.cwd(), 'demo.html'), 'utf8');
  expect(source).not.toMatch(/localhost:5050|\/predict\b|\/api\/anthropic|checkMLService|getMLPredictions|analyzeWithML/);
  expect(source).not.toMatch(/(?:local|session)Storage|indexedDB/);
  expect(source).not.toMatch(/\.innerHTML\s*=|insertAdjacentHTML|\.outerHTML\s*=/);
  expect(source).not.toContain('pixel-perfect replica');
});

test('keeps a local screenshot in page memory and reports manual caliper geometry without interpretation', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Viewer' }).click();

  await page.locator('#reference-image-input').setInputFiles({
    name: 'reference.png',
    mimeType: 'image/png',
    buffer: TINY_PNG,
  });
  await expect(page.locator('#reference-image-status')).toContainText('reference.png is shown locally');
  const preview = page.locator('#reference-image-preview');
  await expect(preview).toHaveAttribute('src', /^blob:/);
  await preview.evaluate((element) => { (element as HTMLImageElement).style.width = '240px'; });

  // Keyboard placement is deterministic across the three browser engines.
  // The app also supports direct pointer placement on ordinary screenshots.
  const caliperStage = page.locator('#reference-image-stage');
  await caliperStage.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(page.locator('#manual-measurement')).toContainText('Manual interval:');
  await expect(page.locator('#manual-measurement')).toContainText('Manual amplitude:');
  await expect(page.locator('#manual-measurement')).toContainText('Derived rate:');
  await expect(page.locator('#manual-measurement')).toContainText('not a diagnosis or rhythm conclusion');

  // The explicit local action must safely refuse an image too small for the
  // deterministic grid and trace checks, while leaving manual calipers usable.
  await page.getByRole('button', { name: 'Auto-trace local screenshot' }).click();
  await expect(page.locator('#auto-trace-result')).toBeVisible();
  await expect(page.locator('#auto-trace-status')).toContainText('rejected');
  await expect(page.locator('#auto-trace-reasons')).toContainText(/at least|manual calipers/i);

  await page.locator('#speed-select').selectOption('50');
  await page.locator('#gain-select').selectOption('20');
  await expect(page.locator('#manual-measurement')).toContainText('Derived rate:');

  await page.locator('#reference-image-input').setInputFiles({
    name: 'not-an-image.png',
    mimeType: 'image/png',
    buffer: Buffer.from('{"not":"an image"}'),
  });
  await expect(page.locator('#status-region')).toContainText('could not be displayed as a supported image');
  await page.getByRole('button', { name: 'Clear screenshot' }).click();
  await expect(page.locator('#reference-image-frame')).toBeHidden();
  await expect(page.locator('#reference-image-status')).toContainText('Nothing is retained outside this page');
});

test('classifies every visible control and gives every disabled control a reason', async ({ page }) => {
  await openApp(page);
  const inventories = [await visibleControlInventory(page)];

  await page.getByRole('button', { name: 'Viewer' }).click();
  inventories.push(await visibleControlInventory(page));
  await page.getByRole('button', { name: 'Help' }).click();
  inventories.push(await visibleControlInventory(page));

  const all = inventories.flat();
  const unclassified = all.filter((item) => !item.control);
  expect(unclassified, `Unclassified visible controls: ${JSON.stringify(unclassified)}`).toEqual([]);
  const missingReasons = all.filter((item) => item.disabled && !item.reason);
  expect(missingReasons, `Disabled controls without reasons: ${JSON.stringify(missingReasons)}`).toEqual([]);

  const actual = new Set(all.map((item) => item.control).filter(Boolean) as string[]);
  expect([...actual].sort()).toEqual([...EXPECTED_CONTROLS].sort());
});

test('exercises worklist search, category filter, refresh, load, and record navigation', async ({ page }) => {
  await openApp(page);
  const totalText = await page.locator('#dataset-summary').textContent();
  expect(totalText).toMatch(/\d+ of \d+ local records shown/);

  const firstLoad = page.locator('[data-control="dataset-load"]').first();
  await expect(firstLoad).toBeVisible();
  const firstLabel = await firstLoad.getAttribute('aria-label');
  await firstLoad.click();
  await expect(page.getByRole('heading', { name: 'Current ECG' })).toBeVisible();
  await expect(page.locator('#status-region')).toContainText('No data was transmitted externally');
  await expect(page.locator('#patient-id')).not.toHaveText('Unavailable');

  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('#status-region')).toContainText('Loaded');
  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(page.locator('#status-region')).toContainText('Loaded');

  await page.getByRole('button', { name: 'Worklist' }).click();
  await page.locator('#dataset-search').fill('Normal');
  await expect(page.locator('[data-control="dataset-load"]').first()).toBeVisible();
  await page.locator('#category-filter').selectOption({ index: 1 });
  await expect(page.locator('#dataset-summary')).toContainText('local records shown');
  await page.locator('#dataset-search').fill('definitely-no-such-record');
  await expect(page.getByText('No matching records.')).toBeVisible();
  await page.locator('#dataset-search').fill('');
  await page.locator('#category-filter').selectOption('');
  await page.getByRole('button', { name: 'Refresh dataset' }).click();
  await expect(page.locator('#status-region')).toContainText('Loaded');
  expect(firstLabel).toContain('Load ECG');
});

test('renders measurement nulls as Unavailable and exercises all waveform display actions', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Viewer' }).click();
  await page.getByRole('button', { name: 'Load synthetic sample' }).click();
  await expect(page.locator('#patient-name')).toHaveText('SYNTHETIC, SAMPLE');
  await expect(page.locator('.measurement-value')).toHaveCount(9);
  await expect(page.locator('.measurement-value')).toHaveText(Array(9).fill(/Unavailable/));
  await expect(page.locator('.measurement-provenance').first()).toContainText('no validated source value');
  await expect(page.locator('#waveform-provenance')).toContainText('without automated interpretation');
  await expect(page.locator('#waveform-title')).toHaveText('12-lead waveform');
  await expect(page.locator('#ecg-canvas')).toHaveAttribute('data-grid-pixels-per-mm', '8');
  await expect(page.locator('#ecg-canvas')).toHaveAttribute('data-pixels-per-second', '200');
  await expect(page.locator('#ecg-canvas')).toHaveAttribute('data-pixels-per-mv', '80');
  await expect(page.locator('#ecg-canvas')).toHaveAttribute('data-small-box-ms', '40');
  await expect(page.locator('#ecg-canvas')).toHaveAttribute('width', '2112');
  await expect(page.locator('#calibration-readout')).toHaveText('25 mm/s · 10 mm/mV · 8 px/mm · 200 px/s · 80 px/mV · 1 mm = 40 ms');

  await page.locator('#speed-select').selectOption('50');
  await expect(page.locator('#ecg-canvas')).toHaveAttribute('data-pixels-per-second', '400');
  await expect(page.locator('#ecg-canvas')).toHaveAttribute('data-small-box-ms', '20');
  await expect(page.locator('#ecg-canvas')).toHaveAttribute('width', '4112');
  await page.locator('#gain-select').selectOption('20');
  await expect(page.locator('#ecg-canvas')).toHaveAttribute('data-pixels-per-mv', '160');
  await expect(page.locator('#calibration-readout')).toHaveText('50 mm/s · 20 mm/mV · 8 px/mm · 400 px/s · 160 px/mV · 1 mm = 20 ms');
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(page.locator('#zoom-readout')).toHaveText('Zoom 110%');
  await page.getByRole('button', { name: 'Zoom out' }).click();
  await page.getByRole('button', { name: 'Fit' }).click();
  await expect(page.locator('#zoom-readout')).toHaveText('Zoom 100%');
  await page.getByRole('button', { name: 'Grid' }).click();
  await expect(page.getByRole('button', { name: 'Grid' })).toHaveAttribute('aria-pressed', 'false');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PNG' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('synthetic-sample.png');

  await page.evaluate(() => {
    Object.defineProperty(window, '__printCalled', { value: false, writable: true });
    window.print = () => { (window as Window & { __printCalled?: boolean }).__printCalled = true; };
  });
  await page.getByRole('button', { name: 'Print' }).click();
  await expect.poll(() => page.evaluate(() => (window as Window & { __printCalled?: boolean }).__printCalled)).toBe(true);
});

test('uses calibrated time and amplitude geometry in the rendered waveform', async ({ page }) => {
  await openApp(page);
  const calibrationLead = Array.from({ length: 250 }, (_, index) => index < 20 ? 0 : 1);
  await uploadJson(page, localRecord({
    signal: { sampleRate: 100, duration: 2.5, units: 'mV', leads: { I: calibrationLead } },
  }), 'calibration.json');
  await expect(page.locator('#waveform-title')).toHaveText('1-lead waveform');
  await page.getByRole('button', { name: 'Grid' }).click();

  const traceY = async (x: number) => page.locator('#ecg-canvas').evaluate((element, column) => {
    const canvas = element as HTMLCanvasElement;
    const pixels = canvas.getContext('2d')!.getImageData(column, 0, 1, canvas.height).data;
    const darkRows: number[] = [];
    for (let y = 65; y < 180; y += 1) {
      const offset = y * 4;
      if (pixels[offset] < 80 && pixels[offset + 1] < 80 && pixels[offset + 2] < 80 && pixels[offset + 3] > 0) darkRows.push(y);
    }
    return darkRows[Math.floor(darkRows.length / 2)] ?? null;
  }, x);

  const baselineAt25 = await traceY(90);
  const oneMvAt25 = await traceY(120);
  expect(baselineAt25).not.toBeNull();
  expect(oneMvAt25).not.toBeNull();
  expect(Math.abs((baselineAt25 as number) - (oneMvAt25 as number) - 80)).toBeLessThanOrEqual(2);

  await page.locator('#speed-select').selectOption('50');
  const baselineAt50 = await traceY(120);
  const oneMvAt50 = await traceY(160);
  expect(Math.abs((baselineAt50 as number) - (baselineAt25 as number))).toBeLessThanOrEqual(1);
  expect(Math.abs((baselineAt50 as number) - (oneMvAt50 as number) - 80)).toBeLessThanOrEqual(2);
});

test('loads hostile local text safely and restores the exact memory-only patient-waveform snapshot', async ({ page }) => {
  await openApp(page);
  const hostile = '<img src=x onerror="window.__xss=true">PATIENT';
  const record = localRecord({
    patient: {
      name: hostile,
      mrn: 'MRN-<svg/onload=window.__xss=true>',
      age: '8 yr',
      sex: 'U',
      testDateTime: '2026-08-04',
      orderId: 'xss-identity',
    },
    diagnosis: { statements: [hostile, 'Second exact source annotation'] },
  });

  await uploadJson(page, record, 'hostile.json');
  await expect(page.locator('#patient-name')).toHaveText(hostile);
  await expect(page.locator('#annotation-list li')).toHaveText([hostile, 'Second exact source annotation']);
  await expect(page.locator('#patient-name img, #annotation-list img, #patient-id svg')).toHaveCount(0);
  expect(await page.evaluate(() => (window as Window & { __xss?: boolean }).__xss)).toBeUndefined();

  const patientSelectors = ['#patient-name', '#patient-id', '#patient-age', '#patient-sex', '#patient-datetime', '#waveform-summary'];
  const displayedBefore = await Promise.all(patientSelectors.map((selector) => page.locator(selector).textContent()));
  const annotationsBefore = await page.locator('#annotation-list li').allTextContents();
  const sourceBefore = await page.locator('#record-source').textContent();
  const provenanceBefore = await page.locator('#waveform-provenance').textContent();
  const titleBefore = await page.locator('#waveform-title').textContent();
  const measurementsBefore = await page.locator('#measurements-list').textContent();
  const waveformIdentityBefore = await page.locator('#ecg-canvas').getAttribute('data-waveform-identity');
  const waveformSamplesBefore = await page.locator('#ecg-canvas').getAttribute('data-waveform-samples');
  const pixelsBefore = await page.locator('#ecg-canvas').evaluate((element) => (element as HTMLCanvasElement).toDataURL());
  expect(waveformIdentityBefore).toMatch(/^fnv1a32-[0-9a-f]{8}$/);
  expect(waveformSamplesBefore).toBe('1000');
  await page.getByRole('button', { name: 'Save in-memory snapshot' }).click();
  await expect(page.locator('#status-region')).toContainText('page memory only');
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);

  const alteredRecord = structuredClone(record) as ReturnType<typeof localRecord>;
  const alteredSignal = alteredRecord.signal as { leads: { I: number[] } };
  alteredSignal.leads.I[alteredSignal.leads.I.length - 1] += 0.125;
  await page.locator('#file-input').setInputFiles({
    name: 'altered-last-sample.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(alteredRecord)),
  });
  await expect(page.locator('#ecg-canvas')).not.toHaveAttribute('data-waveform-identity', waveformIdentityBefore as string);
  await page.getByRole('button', { name: 'Restore snapshot' }).click();
  for (const [index, selector] of patientSelectors.entries()) {
    await expect(page.locator(selector)).toHaveText(displayedBefore[index] as string);
  }
  await expect(page.locator('#annotation-list li')).toHaveText(annotationsBefore);
  await expect(page.locator('#record-source')).toHaveText(sourceBefore as string);
  await expect(page.locator('#waveform-provenance')).toHaveText(provenanceBefore as string);
  await expect(page.locator('#waveform-title')).toHaveText(titleBefore as string);
  await expect(page.locator('#measurements-list')).toHaveText(measurementsBefore as string);
  await expect(page.locator('#ecg-canvas')).toHaveAttribute('data-waveform-identity', waveformIdentityBefore as string);
  await expect(page.locator('#ecg-canvas')).toHaveAttribute('data-waveform-samples', waveformSamplesBefore as string);
  expect(await page.locator('#ecg-canvas').evaluate((element) => (element as HTMLCanvasElement).toDataURL())).toBe(pixelsBefore);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);

  await page.getByRole('button', { name: 'Clear snapshot' }).click();
  await page.getByRole('button', { name: 'Restore snapshot' }).click();
  await expect(page.locator('#status-region')).toContainText('No in-memory snapshot');
});

test('opens local JSON through the visible action and rejects invalid signal data without replacement defaults', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Viewer' }).click();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open local JSON' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ signal: { sampleRate: 500, leads: { II: [0, null, 1] } } })),
  });
  await expect(page.locator('#status-region')).toContainText('invalid');
  await expect(page.locator('#patient-name')).toHaveText('Unavailable');
  await expect(page.locator('.measurement-value')).toHaveText(Array(9).fill(/Unavailable/));

  await page.locator('#file-input').setInputFiles({
    name: 'unknown-units.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(localRecord({
      signal: { sampleRate: 500, duration: 1, units: 'volts', leads: { II: [0, 1, 0] } },
    }))),
  });
  await expect(page.locator('#status-region')).toContainText('Signal units must be exactly "mV" or "uV"');
  await expect(page.locator('#patient-name')).toHaveText('Unavailable');

  await page.locator('#file-input').setInputFiles({
    name: 'missing-units.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(localRecord({
      signal: { sampleRate: 500, duration: 1, leads: { II: [0, 1, 0] } },
    }))),
  });
  await expect(page.locator('#status-region')).toContainText('Signal units are required');
  await expect(page.locator('#patient-name')).toHaveText('Unavailable');
});

test('displays only finite source measurements that carry explicit provenance', async ({ page }) => {
  await openApp(page);
  await uploadJson(page, localRecord({
    measurements: {
      hr: { value: 88, provenance: 'Device header field VentricularRate' },
      rr: { value: 681.8, provenance: 'Device header field RRInterval' },
      qrs: { value: 82 },
      qt: { value: Number.POSITIVE_INFINITY, provenance: 'Invalid non-finite test value' },
    },
  }), 'measurements.json');

  await expect(page.locator('[data-measurement="hr"]')).toContainText('88 bpm');
  await expect(page.locator('[data-measurement="hr"] .measurement-provenance')).toHaveText('Device header field VentricularRate');
  await expect(page.locator('[data-measurement="rr"]')).toContainText('681.8 ms');
  await expect(page.locator('[data-measurement="rr"] .measurement-provenance')).toHaveText('Device header field RRInterval');
  await expect(page.locator('[data-measurement="qrs"]')).toContainText('Unavailable');
  await expect(page.locator('[data-measurement="qt"]')).toContainText('Unavailable');
  await expect(page.locator('[data-measurement="pr"]')).toContainText('Unavailable');
});

test('supports keyboard focus, Escape, and both help close actions', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main-content$/);
  await expect(page.locator('#main-content')).toBeFocused();

  const worklistScroller = page.locator('[data-control="worklist-scroll-region"]');
  await worklistScroller.focus();
  await expect(worklistScroller).toBeFocused();
  expect(await worklistScroller.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await worklistScroller.evaluate((element) => { element.scrollTop = 0; });
  await page.keyboard.press('PageDown');
  await expect.poll(() => worklistScroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Viewer' }).click();
  await page.getByRole('button', { name: 'Load synthetic sample' }).click();
  const waveformScroller = page.locator('[data-control="waveform-scroll-region"]');
  await waveformScroller.focus();
  await expect(waveformScroller).toBeFocused();
  expect(await waveformScroller.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await waveformScroller.evaluate((element) => { element.scrollLeft = 0; });
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => waveformScroller.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Help' }).click();
  await expect(page.locator('#help-dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close help' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Help' })).toBeFocused();

  await page.getByRole('button', { name: 'Help' }).click();
  await page.getByRole('button', { name: 'I understand' }).click();
  await expect(page.locator('#help-dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Help' }).click();
  await page.getByRole('button', { name: 'Close help' }).click();
  await expect(page.locator('#help-dialog')).not.toBeVisible();
});

test('has no serious or critical automated accessibility violations in each UI state', async ({ page }) => {
  await openApp(page);
  let results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((item) => ['serious', 'critical'].includes(item.impact || ''))).toEqual([]);

  await page.getByRole('button', { name: 'Viewer' }).click();
  await page.getByRole('button', { name: 'Load synthetic sample' }).click();
  results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((item) => ['serious', 'critical'].includes(item.impact || ''))).toEqual([]);

  await page.getByRole('button', { name: 'Help' }).click();
  results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((item) => ['serious', 'critical'].includes(item.impact || ''))).toEqual([]);
});
