import test from 'node:test';
import assert from 'node:assert/strict';
import {localState, scopedKey, setStorageOwner} from '../../src/api/browser-state.mjs';

test('an account cannot restore a local draft or directory from another account', () => {
  const cached = new Map();
  Object.defineProperty(globalThis, 'localStorage', {configurable: true, value: {
    getItem: key => cached.get(key) ?? null,
    setItem: (key, value) => cached.set(key, value),
  }});
  try {
    localState.setItem('draft', 'daily-local');
    setStorageOwner('student-one');
    assert.equal(localState.getItem('draft'), null);
    localState.setItem('draft', 'private draft');
    const directoryKey = scopedKey('directory');
    setStorageOwner('student-two');
    assert.equal(localState.getItem('draft'), null);
    assert.notEqual(scopedKey('directory'), directoryKey);
    setStorageOwner('student-one');
    assert.equal(localState.getItem('draft'), 'private draft');
    setStorageOwner('');
    assert.equal(localState.getItem('draft'), 'daily-local');
  } finally {
    setStorageOwner('');
    delete globalThis.localStorage;
  }
});
