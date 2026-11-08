/**
 * The inline <head> script that applies the saved theme before first paint
 * (no flash). Kept apart from the React provider so the Content-Security-Policy
 * can allow exactly this script by its hash (`src/lib/security-headers.ts`); a
 * unit test fails if the script changes without the hash.
 */
export const THEME_STORAGE_KEY = 'theme';

export const NO_FLASH_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var c=document.documentElement.classList;d?c.add('dark'):c.remove('dark');document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})();`;
