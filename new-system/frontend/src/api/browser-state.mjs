let owner = '';

export function setStorageOwner(id) {
  owner = id;
}

export function scopedKey(key, account = owner) {
  return account ? `cs-account:${account}:${key}` : key;
}

function storage(name) {
  return {
    getItem: (key, account) => globalThis[name].getItem(scopedKey(key, account)),
    setItem: (key, value, account) => globalThis[name].setItem(scopedKey(key, account), value),
    removeItem: (key, account) => globalThis[name].removeItem(scopedKey(key, account)),
  };
}

export const localState = storage('localStorage');
export const sessionState = storage('sessionStorage');
