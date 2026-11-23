type ScopedStorage = {
 getItem(key: string, account?: string): string | null;
 setItem(key: string, value: string, account?: string): void;
 removeItem(key: string, account?: string): void;
};
export function setStorageOwner(id: string): void;
export function scopedKey(key: string, account?: string): string;
export const localState: ScopedStorage;
export const sessionState: ScopedStorage;
