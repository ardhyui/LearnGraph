/**
 * The theme context shared by the provider and `useTheme`.
 *
 * Split out so `theme.tsx` keeps exporting only hooks/constants and
 * `ThemeProvider.tsx` only the component (fast refresh).
 */
import { createContext } from 'react';

export type Theme = 'light' | 'dark' | 'system';

export interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: 'system',
  resolvedTheme: 'light',
  setTheme: () => {},
});
