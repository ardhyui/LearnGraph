/**
 * Theme hook and the inline no-flash script.
 *
 * Provider components live in `ThemeProvider.tsx` so this module exports only a
 * hook and constants, keeping `react-refresh/only-export-components` enabled.
 */
import { useContext } from 'react';
import { ThemeContext, type ThemeContextValue } from './theme-context';
import { NO_FLASH_SCRIPT as NO_FLASH_SCRIPT_SOURCE } from './theme-script';

/**
 * Exported as a local constant (not an `export … from`) so the fast-refresh
 * rule sees a constant; the script text and its CSP hash stay defined only in
 * `theme-script.ts`.
 */
export const NO_FLASH_SCRIPT = `${NO_FLASH_SCRIPT_SOURCE}`;
export type { Theme } from './theme-context';

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
