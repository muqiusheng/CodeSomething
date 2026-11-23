let owner = '';

export function setStorageOwner(id) {
  owner = id;
}

export function scopedKey(key) {
  return owner ? `cs-account:${owner}:${key}` : key;
}

function storage(name) {
  return {
    getItem: key => globalThis[name].getItem(scopedKey(key)),
    setItem: (key, value) => globalThis[name].setItem(scopedKey(key), value),
    removeItem: key => globalThis[name].removeItem(scopedKey(key)),
  };
}

export const localState = storage('localStorage');
export const sessionState = storage('sessionStorage');
