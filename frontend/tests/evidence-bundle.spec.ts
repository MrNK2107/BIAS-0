import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';

// Evidence bundle end to end: a small run through the project API, the bundle
// downloaded from Compliance, checked by the "Verify an evidence bundle" panel
// and by POST /api/evidence/verify, then a tampered pack that must fail.
// Needs a DEMO_MODE API (see playwright.config.ts for API_PORT / VITE_PORT).

/** Entries of a ZIP with stored (uncompressed) members, as the bundle writer makes. */
function unzipStored(buf: Buffer): Record<string, Buffer> {
  const out: Record<string, Buffer> = {};
  let off = 0;
  while (buf.readUInt32LE(off) === 0x04034b50) {
    const size = buf.readUInt32LE(off + 18);
    const nameLen = buf.readUInt16LE(off + 26);
    const extraLen = buf.readUInt16LE(off + 28);
    const name = buf.subarray(off + 30, off + 30 + nameLen).toString('utf8');
    const start = off + 30 + nameLen + extraLen;
    out[name] = buf.subarray(start, start + size);
    off = start + size;
  }
  return out;
}

test('evidence bundle verifies, keeps the original file name, and a tampered pack fails', async ({ page }) => {
  test.setTimeout(240_000);

  await page.goto('/dashboard');
  await page.waitForURL(/\/(login|dashboard)/);
  if (page.url().includes('/login')) {
    await page.locator('text=Continue as demo user').click();
    await page.waitForURL('**/dashboard');
  }

  const create = await page.request.post('/api/project/create', {
    multipart: { name: `Bundle ${Date.now()}`, domain: 'loan', sensitive_cols: 'gender', target_col: 'approved' },
  });
  expect(create.ok()).toBeTruthy();
  const { project_id: projectId } = (await create.json()) as { project_id: string };

  const lines = readFileSync(path.resolve('../data/demo_loan.csv'), 'utf8').split(/\r?\n/).slice(0, 401);
  const upload = await page.request.post(`/api/project/${projectId}/upload`, {
    multipart: {
      dataset: { name: 'Q3 loans (final).csv', mimeType: 'text/csv', buffer: Buffer.from(lines.join('\n') + '\n') },
    },
  });
  expect(upload.ok()).toBeTruthy();
  const run = await page.request.post(`/api/project/${projectId}/run`, { multipart: { metric_priority: 'balanced' } });
  const { task_id: taskId } = (await run.json()) as { task_id: string };
  await expect
    .poll(async () => ((await (await page.request.get(`/api/pipeline/status/${taskId}`)).json()) as { status: string }).status, {
      timeout: 180_000,
      intervals: [2000],
    })
    .toBe('complete');

  await page.evaluate((id) => localStorage.setItem('active_project_id', id), projectId);
  await page.goto('/compliance');
  const verifyInput = page.locator('input[type="file"][accept*=".zip"]');
  await verifyInput.waitFor({ state: 'attached', timeout: 60_000 });

  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: /Evidence Bundle/ }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^bias0-evidence-\d{4}-\d{2}-\d{2}-[0-9a-f]{8}\.zip$/);
  const zipPath = await download.path();
  const zip = readFileSync(zipPath);

  const files = unzipStored(zip);
  expect(Object.keys(files).sort()).toEqual(['evidence-pack.json', 'evidence.csv', 'manifest.json', 'report.html']);
  const pack = JSON.parse(files['evidence-pack.json'].toString('utf8'));
  expect(pack.provenance.input.filename).toBe('Q3 loans (final).csv');
  expect(pack.provenance.input.stored_name).toMatch(/^[0-9a-f]{32}_Q3 loans \(final\)\.csv$/);
  expect(files['report.html'].toString('utf8')).toContain('Q3 loans (final).csv');

  // The panel on the page.
  await verifyInput.setInputFiles(zipPath);
  await expect(page.getByText(/all 8 checks passed/)).toBeVisible({ timeout: 20_000 });

  // The API directly.
  const api = await page.request.post('/api/evidence/verify', {
    multipart: { file: { name: 'bundle.zip', mimeType: 'application/zip', buffer: zip } },
  });
  expect(((await api.json()) as { ok: boolean }).ok).toBe(true);

  // Make the model look fairer: the pack's self-hash no longer matches.
  pack.summary.fairness_score = 99;
  await verifyInput.setInputFiles({
    name: 'evidence-pack.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(pack, null, 2)),
  });
  await expect(page.getByText(/1 of 1 checks failed/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('FAIL pack self-hash')).toBeVisible();
});
