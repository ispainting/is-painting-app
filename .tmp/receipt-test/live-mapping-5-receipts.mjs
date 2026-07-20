import fs from 'node:fs';
import path from 'node:path';

if (process.env.ALLOW_LIVE_MANUS_TESTS !== 'true') {
  throw new Error(
    'Live Manus API testing is disabled. Set ALLOW_LIVE_MANUS_TESTS=true only for explicit approved runs.',
  );
}

const preview = process.argv[2];
const fixtureDir = process.argv[3];
if (!preview || !fixtureDir) throw new Error('usage: node live-mapping-5-receipts.mjs <preview> <fixture-dir>');

const files = [
  'expense_us_receipt.jpg',
  'expense_default_sample.jpg',
  'invoice_default_sample.jpg',
  'petrol_default_sample.jpg',
  'items_classifier_default_sample.jpg',
].map((f) => path.join(fixtureDir, f));

const cookieJar = new Map();
function mergeCookies(headers) {
  const cookies = headers.getSetCookie?.() ?? (headers.get('set-cookie') ? [headers.get('set-cookie')] : []);
  for (const raw of cookies) {
    if (!raw) continue;
    const pair = raw.split(';')[0];
    const idx = pair.indexOf('=');
    if (idx > 0) cookieJar.set(pair.slice(0, idx), pair.slice(idx + 1));
  }
}
function cookieHeader() {
  return [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}
async function postTrpc(route, input) {
  const res = await fetch(`${preview}/api/trpc/${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: cookieHeader() },
    body: JSON.stringify({ 0: { json: input } }),
  });
  mergeCookies(res.headers);
  const text = await res.text();
  return { status: res.status, text };
}
function parseTrpc(text) {
  const arr = JSON.parse(text);
  const first = Array.isArray(arr) ? arr[0] : arr;
  if (first?.error) throw new Error(first.error?.json?.message || first.error?.message || 'tRPC error');
  return first?.result?.data?.json ?? first?.result?.json;
}

const login = await postTrpc('auth.login?batch=1', { email: 'admin@ispainting.com', password: 'admin123' });
if (login.status !== 200) throw new Error(`login failed: ${login.text}`);

const results = [];
for (const filePath of files) {
  const fileName = path.basename(filePath);
  const bytes = fs.readFileSync(filePath);
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'image/jpeg' }), fileName);

  const uploadRes = await fetch(`${preview}/api/expenses/uploads`, {
    method: 'POST',
    headers: { cookie: cookieHeader() },
    body: form,
  });
  mergeCookies(uploadRes.headers);
  const uploadText = await uploadRes.text();
  if (uploadRes.status !== 201) {
    results.push({ fileName, error: `upload ${uploadRes.status}`, uploadText });
    continue;
  }

  const attachmentId = JSON.parse(uploadText)?.attachment?.id;
  const extractRes = await postTrpc('expenses.extractReceipt?batch=1', { attachmentId });
  if (extractRes.status !== 200) {
    results.push({ fileName, attachmentId, error: `extract transport ${extractRes.status}`, extractText: extractRes.text });
    continue;
  }

  const extracted = parseTrpc(extractRes.text);
  const mapped = extracted?.data ?? {};

  results.push({
    fileName,
    attachmentId,
    extractionStatus: extracted?.status,
    provider: extracted?.provider,
    model: extracted?.model,
    message: extracted?.message,
    populated: {
      vendor: mapped.vendor?.value ?? null,
      date: mapped.date?.value ?? null,
      subtotal: mapped.subtotal?.value ?? null,
      tax: mapped.tax?.value ?? null,
      total: mapped.total?.value ?? null,
      paymentMethod: mapped.paymentMethod?.value ?? null,
      receiptNumber: mapped.receiptNumber?.value ?? null,
      invoiceNumber: mapped.invoiceNumber?.value ?? null,
      lineItemsCount: Array.isArray(mapped.items) ? mapped.items.length : 0,
      overallConfidence: mapped.overallConfidence ?? null,
    },
    rawStructuredOutput: extracted?.rawStructuredOutput ?? null,
    parsedNormalizedOutput: extracted?.parsedNormalizedOutput ?? null,
  });
}

console.log(JSON.stringify({ preview, results }, null, 2));
