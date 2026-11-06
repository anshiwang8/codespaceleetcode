import { APPLIED_KEY } from "./runtime";

/**
 * Inlined in <head> by app/layout.tsx and run before the first paint. It reads the cached,
 * already-resolved theme from localStorage and sets its custom properties on <html>, so a dark or
 * custom theme doesn't flash light first. It's a fixed string with no user data in it. It applies
 * only `--name` properties whose values are `#rrggbb` or `rgb(r g b / n%)`, so a tampered cache
 * can't inject any other CSS. Without a cache (or without JavaScript) the CSS default applies.
 */
export const PREPAINT_SCRIPT = `(function(){try{var e=JSON.parse(localStorage.getItem(${JSON.stringify(APPLIED_KEY)})||"null");if(!e||e.v!==1||!e.preference)return;var t=e.preference.mode==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?e.dark:e.light):e.theme;if(!t||!t.vars)return;var d=document.documentElement,k,v,ok=/^(#[0-9a-f]{6}|rgb\\(\\d{1,3} \\d{1,3} \\d{1,3} \\/ \\d{1,3}%\\))$/;for(k in t.vars){v=t.vars[k];if(/^[a-z0-9-]{1,32}$/.test(k)&&typeof v==="string"&&ok.test(v))d.style.setProperty("--"+k,v)}var s=t.scheme==="dark"?"dark":"light";d.style.colorScheme=s;d.setAttribute("data-scheme",s)}catch(x){}})();`;
