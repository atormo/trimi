import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/license.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const api = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('activation sends the exact trimmed key from the caller and returns the activation', async t => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.ok(url.endsWith('/activate'));
    assert.equal(options.method, 'POST');
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(JSON.parse(options.body).key, 'test-key');
    return Response.json({ id: 'activation-id', license_key: { status: 'granted' } });
  });
  assert.deepEqual(await api.activateLicense('test-key', 'Test browser'), { activationId: 'activation-id', status: 'granted' });
});

for (const status of [204, 404]) {
  test(`unlink accepts ${status} without parsing an empty response`, async t => {
    t.mock.method(globalThis, 'fetch', async (_url, options) => {
      assert.deepEqual(JSON.parse(options.body).activation_id, 'activation-id');
      assert.ok(options.signal instanceof AbortSignal);
      return new Response(null, { status });
    });
    await api.deactivateLicense('test-key', 'activation-id');
  });
}

test('unlink server failure rejects so the hook can preserve the activation', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 503 }));
  await assert.rejects(api.deactivateLicense('test-key', 'activation-id'), /Couldn't deactivate/);
});

test('unlink network failure rejects with a retryable error', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Offline'); });
  await assert.rejects(api.deactivateLicense('test-key', 'activation-id'), error => error.reason === 'network');
});

for (const [status, reason] of [[404, 'not_found'], [422, 'not_found'], [403, 'limit_reached']]) {
  test(`activation maps ${status} to ${reason}`, async t => {
    t.mock.method(globalThis, 'fetch', async () => new Response(null, { status }));
    await assert.rejects(api.activateLicense('test-key', 'Test browser'), error => error.reason === reason);
  });
}

test('validation keeps the server status authoritative', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ status: 'revoked' }));
  assert.deepEqual(await api.validateLicense('test-key', 'activation-id'), { status: 'revoked' });
});
