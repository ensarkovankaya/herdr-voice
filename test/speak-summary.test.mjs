import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { extractLastAssistantText } from '../src/speak-summary.mjs';

const here = dirname(fileURLToPath(import.meta.url));

test('tool_use-only son satırı atlar, metinli son assistant mesajını alır', () => {
  const jsonl = readFileSync(join(here, 'fixtures', 'transcript.jsonl'), 'utf8');
  assert.equal(extractLastAssistantText(jsonl), 'Testleri çalıştırdım ve hepsi geçti.');
});

test('string content ve bozuk satırlar', () => {
  const jsonl = [
    'BOZUK SATIR',
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: 'Düz metin cevap.' } }),
  ].join('\n');
  assert.equal(extractLastAssistantText(jsonl), 'Düz metin cevap.');
});

test('assistant yoksa boş string', () => {
  assert.equal(extractLastAssistantText('{"type":"user","message":{"role":"user","content":[]}}'), '');
});
