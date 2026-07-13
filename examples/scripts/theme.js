/**
 * theme.js — light/dark theme state for the maplibre-transition examples.
 *
 * Contract (CONTRACTS.md §3):
 *   initialTheme(): "light" | "dark"
 *   setTheme(t, { persist = true }): void
 *
 * Sets <html data-theme>, html.style.colorScheme, writes localStorage["mlt-theme"],
 * and fires a window CustomEvent "themechange" with { detail: { theme } }.
 *
 * Until the user explicitly toggles (i.e. until something is written to
 * localStorage), the page keeps following prefers-color-scheme.
 */

export const STORAGE_KEY = "mlt-theme";

/**
 * The three lines every page must inline in <head>, BEFORE any stylesheet, as a
 * plain (non-module, non-defer) <script>. Prevents a flash of the wrong theme.
 * Kept byte-identical to what setTheme() would do.
 */
export const THEME_HEAD_SNIPPET = `(function(){var t=null;try{t=localStorage.getItem("${STORAGE_KEY}")}catch(e){}
if(t!=="light"&&t!=="dark"){t=window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}
var r=document.documentElement;r.setAttribute("data-theme",t);r.style.colorScheme=t})();`;

function normalize(t) {
  return t === "dark" ? "dark" : "light";
}

function read() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null; // private mode / blocked storage
  }
}

function write(t) {
  try {
    localStorage.setItem(STORAGE_KEY, t);
  } catch {
    /* non-fatal */
  }
}

function systemPrefersDark() {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/** localStorage["mlt-theme"] ?? prefers-color-scheme */
export function initialTheme() {
  return read() ?? (systemPrefersDark() ? "dark" : "light");
}

/** The theme currently applied to <html>. */
export function currentTheme() {
  return normalize(document.documentElement.getAttribute("data-theme"));
}

/**
 * Apply a theme.
 * @param {"light"|"dark"} t
 * @param {{persist?: boolean}} [opts] persist:false = follow-the-OS update, not a user choice.
 */
export function setTheme(t, opts) {
  const theme = normalize(t);
  const persist = opts?.persist ?? true;

  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.style.colorScheme = theme;

  if (persist) write(theme);

  window.dispatchEvent(
    new CustomEvent("themechange", { detail: { theme } })
  );
}

/** Flip to the other theme. Always counts as a user choice. */
export function toggleTheme() {
  const next = currentTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}

// Keep following the OS until the user has expressed a preference.
if (typeof window.matchMedia === "function") {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystemChange = (e) => {
    if (read() === null) setTheme(e.matches ? "dark" : "light", { persist: false });
  };
  if (typeof mq.addEventListener === "function") {
    mq.addEventListener("change", onSystemChange);
  } else if (typeof mq.addListener === "function") {
    mq.addListener(onSystemChange); // legacy Safari
  }
}
