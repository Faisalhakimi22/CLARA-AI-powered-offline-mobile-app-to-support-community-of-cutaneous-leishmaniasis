import { expect, Page, test } from '@playwright/test';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { AppData } from '../../src/domain/types';

const storageKey = '@cl-triage/workspace/v3';
const screenshotDirectory = join(process.cwd(), 'artifacts/feasibility');
mkdirSync(screenshotDirectory, { recursive: true });
const images = join(process.cwd(), 'training/prepared/segmentation/images/test');
const photoName = readdirSync(images).find((name) => name.startsWith('cl_test_'))!;
const photo = `data:image/jpeg;base64,${readFileSync(join(images, photoName)).toString('base64')}`;
const uncertainPhoto = `data:image/jpeg;base64,${readFileSync('training/prepared/segmentation/images/val/mimic_valid_atopi-126-_jpg.rf.7647695bc3d1107b7319a2fe4eac89b9.jpg').toString('base64')}`;
const modelId = JSON.parse(readFileSync('assets/models/manifest.json', 'utf8')).id;
const profile = { name: 'QA study operator', role: 'Technician', facility: 'Test site' };

async function seed(page: Page, caseId: string, uncertain = false) {
  const stamp = new Date().toISOString();
  const data: AppData = {
    version: 3,
    consentAt: stamp,
    profile,
    cases: [],
    draft: {
      id: caseId,
      workflow: 'feasibility-v1',
      recorder: profile,
      patient: { caseId, age: '35', sex: 'Female' },
      clinical: { pain: 'No' },
      collectionConsentAt: stamp,
      image: {
        uri: uncertain ? uncertainPhoto : photo,
        width: uncertain ? 640 : 624,
        height: uncertain ? 640 : 624,
        source: 'gallery',
      },
      createdAt: stamp,
      updatedAt: stamp,
      status: 'Pending Review',
      step: 'Quality',
    },
  };
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    },
    { key: storageKey, value: JSON.stringify(data) },
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Resume current assessment', exact: true }).click();
}
async function readData(page: Page): Promise<AppData> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), storageKey);
}
async function acceptPhoto(page: Page) {
  for (const name of [
    'Lesion details are in focus',
    'Lighting is even and adequate',
    'The entire lesion is clearly framed',
    'I have reviewed this photograph',
  ])
    await page.getByRole('checkbox', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Continue to Assessment', exact: true }).click();
}

test('real local models save directly, microscopy remains separate, history and CSV persist', async ({
  page,
}) => {
  const errors: string[] = [];
  const external: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (/^https?:/.test(r.url()) && !['localhost', '127.0.0.1'].includes(new URL(r.url()).hostname))
      external.push(r.url());
  });
  await seed(page, 'CL-STUDY-001');
  await acceptPhoto(page);
  await expect(page.getByRole('heading', { name: 'Image assessment', exact: true })).toBeVisible({
    timeout: 120000,
  });
  const analyzed = (await readData(page)).draft!;
  expect(analyzed.initial?.modelVersion).toBe(modelId);
  expect(analyzed.segmentation?.lesions.length).toBeGreaterThan(0);
  expect(analyzed.analysisRun?.status).toBe('completed');
  expect(analyzed.analysisRun!.durationMs).toBeGreaterThanOrEqual(0);
  await expect(
    page.getByRole('button', { name: /Referral|Clinical Review|Questions/ }),
  ).toHaveCount(0);
  await page.screenshot({ path: join(screenshotDirectory, 'model-result.png'), fullPage: true });
  await page.getByRole('button', { name: 'Save Case', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Record microscopy result', exact: true }),
  ).toBeVisible();
  let saved = (await readData(page)).cases[0];
  expect(saved.initial).toEqual(analyzed.initial);
  expect(saved.review).toBeUndefined();
  expect(saved.referral).toBeUndefined();
  expect(saved.microscopy).toBeUndefined();
  await page.getByRole('button', { name: 'Record microscopy result', exact: true }).click();
  await page.getByRole('radio', { name: 'Positive', exact: true }).click();
  await page.getByRole('textbox', { name: 'Specimen / report ID', exact: true }).fill('LAB-001');
  await page
    .getByRole('checkbox', { name: 'I checked the case ID and laboratory report', exact: true })
    .click();
  await page.getByRole('button', { name: 'Save microscopy result', exact: true }).click();
  await expect(page.getByRole('button', { name: 'View History', exact: true })).toBeVisible();
  saved = (await readData(page)).cases[0];
  expect(saved.initial).toEqual(analyzed.initial);
  expect(saved.analysisRun).toEqual(analyzed.analysisRun);
  expect(saved.microscopy?.result).toBe('POSITIVE');
  expect(saved.microscopy?.recordedBy.name).toBe(profile.name);
  await expect(
    page.getByRole('button', { name: 'Record microscopy result', exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Open CL-STUDY-001', exact: true }).click();
  expect((await readData(page)).cases[0].microscopy?.specimenId).toBe('LAB-001');
  await page.getByRole('button', { name: 'Study results', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Study results', exact: true })).toBeVisible();
  await page.getByRole('heading', { name: 'Study results', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(screenshotDirectory, 'study-overview.png') });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export all study data (CSV)', exact: true }).click();
  const download = await downloadPromise;
  const csvPath = await download.path();
  expect(readFileSync(csvPath!, 'utf8')).toContain('LAB-001');
  await page.screenshot({ path: join(screenshotDirectory, 'study-results.png'), fullPage: true });
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('new case validates patient details, accepts a gallery photo and saves the model result', async ({ page }) => {
  await page.addInitScript(({ profile }) => { if (!localStorage.getItem('@cl-triage/workspace/v3')) localStorage.setItem('@cl-triage/workspace/v3', JSON.stringify({ version: 3, consentAt: new Date().toISOString(), profile, cases: [], draft: null })); }, { profile });
  await page.goto('/');
  await page.getByRole('button', { name: 'New assessment', exact: true }).click();
  await page.getByRole('textbox', { name: 'Patient ID / Case ID', exact: true }).fill('CL-STUDY-UPLOAD');
  await page.getByRole('textbox', { name: 'Age in years', exact: true }).fill('999');
  await page.getByRole('button', { name: 'Continue to Photo', exact: true }).click();
  await expect(page.getByText('Enter a whole number from 0 to 120, or leave blank.', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Age in years', exact: true }).fill('34');
  await page.getByRole('checkbox', { name: 'Permission to record this case is confirmed', exact: true }).click();
  await page.getByRole('button', { name: 'Continue to Photo', exact: true }).click();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Upload from gallery', exact: true }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(join(images, photoName));
  await page.getByRole('button', { name: 'Use Photo', exact: true }).click();
  await acceptPhoto(page);
  await expect(page.getByRole('heading', { name: 'Image assessment', exact: true })).toBeVisible({ timeout: 120000 });
  await page.getByRole('button', { name: 'Save Case', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Record microscopy result', exact: true })).toBeVisible();
  const saved = (await readData(page)).cases[0];
  expect(saved.patient.caseId).toBe('CL-STUDY-UPLOAD');
  expect(saved.recorder).toEqual(profile);
  expect(saved.image?.source).toBe('gallery');
  expect(saved.analysisRun?.status).toBe('completed');
  expect(saved.initial?.modelVersion).toBe(modelId);
});

test('inconclusive real model result saves without follow-up questionnaire', async ({ page }) => {
  await seed(page, 'CL-STUDY-002', true);
  await acceptPhoto(page);
  await expect(page.getByRole('heading', { name: 'Image assessment', exact: true })).toBeVisible({
    timeout: 120000,
  });
  expect((await readData(page)).draft?.initial?.prediction).toBe('UNCERTAIN');
  await expect(page.getByRole('button', { name: /Question|Review|Referral/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Save Case', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Record microscopy result', exact: true }),
  ).toBeVisible();
  const saved = (await readData(page)).cases[0];
  expect(saved.initial?.prediction).toBe('UNCERTAIN');
  expect(saved.clinical).toEqual({ pain: 'No' });
  expect(saved.updated).toBeUndefined();
});

test('failed analysis is saved explicitly without inventing a negative result', async ({
  page,
}) => {
  await page.route(/\.onnx(?:\?|$)/i, (route) => route.abort('failed'));
  await seed(page, 'CL-STUDY-003');
  await acceptPhoto(page);
  await expect(
    page.getByRole('heading', { name: 'Analysis unavailable', exact: true }),
  ).toBeVisible({ timeout: 120000 });
  await page.getByRole('button', { name: 'Save without model result', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Record microscopy result', exact: true }),
  ).toBeVisible();
  const saved = (await readData(page)).cases[0];
  expect(saved.status).toBe('Completed');
  expect(saved.initial).toBeUndefined();
  expect(saved.analysisRun?.status).toBe('failed');
  expect(saved.review).toBeUndefined();
  expect(saved.clinical).toEqual({ pain: 'No' });
});

test('previous workflow records migrate and remain excluded from the study', async ({ page }) => {
  await page.addInitScript(
    ({ profile, photo }) =>
      localStorage.setItem(
        '@cl-triage/workspace/v2',
        JSON.stringify({
          version: 2,
          consentAt: '2026-10-01',
          profile,
          draft: null,
          cases: [
            {
              id: 'old-case',
              patient: { caseId: 'OLD-001', age: '30', sex: '' },
              clinical: {},
              image: { uri: photo, width: 624, height: 624, source: 'gallery' },
              initial: { prediction: 'CL', confidence: 0.9, message: 'Historical result' },
              createdAt: '2026-10-01',
              updatedAt: '2026-10-01',
              completedAt: '2026-10-01',
              status: 'Referred',
              step: 'Referral',
              referral: { destination: 'Original clinic', status: 'Referred' },
            },
          ],
        }),
      ),
    { profile, photo },
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Assessment history', exact: true }).click();
  await page.getByRole('button', { name: 'Open OLD-001', exact: true }).click();
  await expect(
    page.getByText(
      'This record was created before the feasibility-study workflow. It is retained for reference and excluded from study calculations.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Record microscopy|Resume Assessment|Create Referral/ }),
  ).toHaveCount(0);
  const migrated = await readData(page);
  expect(migrated.cases[0].workflow).toBe('legacy-triage');
  expect(migrated.cases[0].referral?.destination).toBe('Original clinic');
});
