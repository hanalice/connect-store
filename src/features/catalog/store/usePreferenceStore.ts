import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'dark' | 'light';

interface PreferenceStore {
    theme: Theme;
    toggleTheme: () => void;
    setTheme: (theme: Theme) => void;
}

export const usePreferenceStore = create<PreferenceStore>()(
    persist(
        (set) => ({
            theme: 'dark',
            toggleTheme: () =>
                set((state) => ({
                    theme: state.theme === 'dark' ? 'light' : 'dark',
                })),
            setTheme: (theme) => set({ theme }),
        }),
        {
            name: 'clo-user-preferences',
        },
    ),
);
