import {useSyncExternalStore} from 'react';
import {paletteDetails, type PaletteId} from './palettes';
export type {PaletteId} from './palettes';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = Exclude<ThemePreference, 'system'>;


type Appearance = {preference: ThemePreference; resolved: ResolvedTheme; palette: PaletteId};

declare global {
  interface Window {
    // Installed synchronously by public/theme-init.js.
    csAppearance: {
      paletteIds: readonly PaletteId[];
      getSnapshot: () => Appearance;
      subscribe: (listener: () => void) => () => void;
      setTheme: (value: ThemePreference) => boolean;
      setPalette: (value: PaletteId) => boolean;
    };
  }
}

const {subscribe, getSnapshot, setTheme, setPalette, paletteIds} = window.csAppearance;
export {setTheme, setPalette};
export const PALETTES: readonly {id: PaletteId; name: string; detail: string; badge?: string}[] =
  paletteIds.map(id => ({id, ...paletteDetails[id]}));

export function useTheme() {
  const appearance = useSyncExternalStore(subscribe, getSnapshot);
  return {...appearance, setTheme, setPalette, palettes: PALETTES};
}
