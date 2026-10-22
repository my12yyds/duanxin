import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateMessage } from '../src/validate-message.js';

const example = async (name) => JSON.parse(await readFile(new URL(`../examples/${name}`, import.meta.url), 'utf8'));

test('accepts each valid protocol example', async () => {
  for (const name of ['valid-service.json', 'valid-otp.json', 'valid-marketing.json']) {
    assert.deepEqual(validateMessage(await example(name)), { valid: true, errors: [] }, name);
  }
});

test('rejects marketing without explicit consent and an unsubscribe instruction', async () => {
  const result = validateMessage(await example('invalid-marketing-no-consent.json'));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('const')));
  assert.ok(result.errors.some((error) => error.includes('unsubscribe')));
});

test('rejects OTP links and long-lived challenges', async () => {
  const message = await example('valid-otp.json');
  message.links = [{ url: 'https://example.org/login', purpose: '登录' }];
  message.content.text += ' https://example.org/login';
  message.expiresAt = '2026-10-22T09:00:00Z';
  const result = validateMessage(message);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('links')));
  assert.ok(result.errors.some((error) => error.includes('lifetime')));
});

test('rejects links outside the sender allowlist and expired intents', async () => {
  const message = await example('valid-service.json');
  message.links = [{ url: 'https://attacker.example/login', purpose: '详情页' }];
  message.expiresAt = '2026-10-22T07:00:00Z';
  const result = validateMessage(message);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('trustedDomains')));
  assert.ok(result.errors.some((error) => error.includes('later than')));
});

test('rejects phone-like recipient references and evidence created in the future', async () => {
  const message = await example('valid-service.json');
  message.recipient.recipientRef = '+1 202 555 0144';
  message.basis.occurredAt = '2026-10-22T08:30:00Z';
  const result = validateMessage(message);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('phone number')));
  assert.ok(result.errors.some((error) => error.includes('occurredAt')));
});
