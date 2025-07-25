import test from 'node:test';
import assert from 'node:assert/strict';
import { displayApiKeyError, hideApiKeyError } from '../assets/js/dom.js';

const el = {
  textContent: '',
  classList: {
    _classes: new Set(['hidden']),
    add(c) { this._classes.add(c); },
    remove(c) { this._classes.delete(c); },
    contains(c) { return this._classes.has(c); }
  }
};

global.document = {
  getElementById(id) {
    return id === 'api-key-error' ? el : null;
  }
};

test('displayApiKeyError shows message and removes hidden', () => {
  displayApiKeyError('bad key');
  assert.equal(el.textContent, 'bad key');
  assert.ok(!el.classList.contains('hidden'));
});

test('hideApiKeyError clears message and adds hidden', () => {
  hideApiKeyError();
  assert.equal(el.textContent, '');
  assert.ok(el.classList.contains('hidden'));
});
