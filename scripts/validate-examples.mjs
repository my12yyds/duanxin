import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateMessage } from '../src/validate-message.js';

const directory = fileURLToPath(new URL('../examples/', import.meta.url));
const files = (await readdir(directory)).filter((name) => name.endsWith('.json')).sort();
if (!files.some((name) => name.startsWith('valid-')) || !files.some((name) => name.startsWith('invalid-'))) {
  throw new Error('At least one valid and one invalid example are required.');
}

let failed = false;
for (const name of files) {
  let message;
  try { message = JSON.parse(await readFile(join(directory, name), 'utf8')); }
  catch (error) { console.error(`FAIL ${name}: invalid JSON (${error.message})`); failed = true; continue; }
  const result = validateMessage(message);
  const expectsInvalid = name.startsWith('invalid-');
  if (expectsInvalid && !result.valid) console.log(`PASS ${name}: rejected as expected`);
  else if (!expectsInvalid && result.valid) console.log(`PASS ${name}`);
  else {
    console.error(`FAIL ${name}: ${expectsInvalid ? 'invalid example was accepted' : result.errors.join('; ')}`);
    failed = true;
  }
}
if (failed) process.exitCode = 1;
