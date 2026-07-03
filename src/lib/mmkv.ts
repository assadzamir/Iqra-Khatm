import { MMKV } from 'react-native-mmkv';
import { StateStorage } from 'zustand/middleware';

const storage = new MMKV();

// `satisfies` keeps the StateStorage compatibility check while exposing the
// narrow synchronous types — MMKV is sync, so getItem callers get `string |
// null`, not the `Promise` side of StateStorage's union.
export const mmkvStorage = {
  getItem: (name: string): string | null => storage.getString(name) ?? null,
  setItem: (name: string, value: string): void => {
    storage.set(name, value);
  },
  removeItem: (name: string): void => {
    storage.delete(name);
  },
} satisfies StateStorage;
