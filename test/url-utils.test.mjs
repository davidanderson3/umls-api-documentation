import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUmlsUrl, parseHash } from '../assets/js/url-utils.js';

// Setup a minimal window object for the tests
if (!global.window) {
  global.window = { location: { href: 'https://example.com/', hash: '' } };
} else {
  global.window.location.href = 'https://example.com/';
  global.window.location.hash = '';
}

function setHash(h) {
  global.window.location.hash = h;
  return parseHash();
}

test('parseUmlsUrl concept base', () => {
  const url = 'https://uts.nlm.nih.gov/rest/content/current/CUI/C0000005';
  assert.deepStrictEqual(parseUmlsUrl(url), { type: 'concept', cui: 'C0000005', detail: '' });
});

test('parseUmlsUrl concept with detail', () => {
  const url = 'https://uts.nlm.nih.gov/rest/content/current/CUI/C0000005/atoms';
  assert.deepStrictEqual(parseUmlsUrl(url), { type: 'concept', cui: 'C0000005', detail: 'atoms' });
});

test('parseUmlsUrl concept detail "concept" normalizes to empty', () => {
  const url = 'https://uts.nlm.nih.gov/rest/content/current/CUI/C0000005/concept';
  assert.deepStrictEqual(parseUmlsUrl(url), { type: 'concept', cui: 'C0000005', detail: '' });
});

test('parseUmlsUrl code base', () => {
  const url = 'https://uts.nlm.nih.gov/rest/content/current/source/MSH/D012345';
  assert.deepStrictEqual(parseUmlsUrl(url), { type: 'code', sab: 'MSH', code: 'D012345', detail: '' });
});

test('parseUmlsUrl code with detail', () => {
  const url = 'https://uts.nlm.nih.gov/rest/content/current/source/MSH/D012345/relations';
  assert.deepStrictEqual(parseUmlsUrl(url), { type: 'code', sab: 'MSH', code: 'D012345', detail: 'relations' });
});

test('parseUmlsUrl aui base', () => {
  const url = 'https://uts.nlm.nih.gov/rest/content/current/AUI/A1234567';
  assert.deepStrictEqual(parseUmlsUrl(url), { type: 'aui', aui: 'A1234567', detail: '' });
});

test('parseUmlsUrl aui with detail', () => {
  const url = 'https://uts.nlm.nih.gov/rest/content/current/AUI/A1234567/attributes';
  assert.deepStrictEqual(parseUmlsUrl(url), { type: 'aui', aui: 'A1234567', detail: 'attributes' });
});

test('parseUmlsUrl semantic type with release', () => {
  const url = 'https://uts.nlm.nih.gov/rest/semantic-network/202AB/TUI/T123';
  assert.deepStrictEqual(parseUmlsUrl(url), { type: 'semanticType', release: '202AB', tui: 'T123' });
});

test('parseUmlsUrl semantic type default path', () => {
  const url = 'https://uts.nlm.nih.gov/rest/semantic-network/semantic-types/T123';
  assert.deepStrictEqual(parseUmlsUrl(url), { type: 'semanticType', tui: 'T123' });
});

test('parseUmlsUrl search with query', () => {
  const url = 'https://uts.nlm.nih.gov/rest/search/current?string=heart';
  const res = parseUmlsUrl(url);
  assert.strictEqual(res.type, 'search');
  assert.strictEqual(res.release, 'current');
  assert.strictEqual(res.params.get('string'), 'heart');
});

// Tests for parseHash

test('parseHash concept base', () => {
  const res = setHash('#content/current/CUI/C0000005');
  assert.strictEqual(res.cui, 'C0000005');
  assert.strictEqual(res.detail, undefined);
});

test('parseHash concept with detail', () => {
  const res = setHash('#content/current/CUI/C0000005/atoms');
  assert.deepStrictEqual(res, { cui: 'C0000005', detail: 'atoms' });
});

test('parseHash code with detail', () => {
  const res = setHash('#content/current/source/MSH/D012345/relations');
  assert.deepStrictEqual(res, { sab: 'MSH', code: 'D012345', detail: 'relations', returnIdType: 'code' });
});

test('parseHash aui base', () => {
  const res = setHash('#content/current/AUI/A1234567');
  assert.strictEqual(res.aui, 'A1234567');
  assert.strictEqual(res.detail, undefined);
});

test('parseHash aui with detail', () => {
  const res = setHash('#content/current/AUI/A1234567/relations');
  assert.deepStrictEqual(res, { aui: 'A1234567', detail: 'relations' });
});

test('parseHash semantic type', () => {
  const res = setHash('#semantic-network/202AB/TUI/T123');
  assert.deepStrictEqual(res, { searchRelease: '202AB', tui: 'T123' });
});

test('parseHash search with query', () => {
  const res = setHash('#search/current?string=heart&searchType=words');
  assert.strictEqual(res.searchRelease, 'current');
  assert.strictEqual(res.params.get('string'), 'heart');
  assert.strictEqual(res.params.get('searchType'), 'words');
});
