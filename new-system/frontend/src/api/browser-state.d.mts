type ScopedStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export function setStorageOwner(id: string): void;
export function scopedKey(key: string): string;
export const localState: ScopedStorage;
export const sessionState: ScopedStorage;
