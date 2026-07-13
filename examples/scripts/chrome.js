/**
 * chrome.js — shared header, footer, theme toggle, and the instrument-card head.
 *
 * Contract (CONTRACTS.md §3):
 *   mountChrome({ title, kicker }): void
 *
 * Guarantees after it runs:
 *   - <html data-theme="light|dark">
 *   - <button data-testid="theme-toggle"> in the header (two-position segmented
 *     switch, keyboard-focusable, aria-pressed=true when dark)
 *   - a <canvas class="frame-rail" data-testid="frame-rail"> pinned to the top of
 *     the first .controls panel, ready for mountFrameRail() — unless the page
 *     already supplied one
 *   - the `kicker` printed in mono in the control-panel header
 */

import { initialTheme, setTheme, currentTheme, toggleTheme } from "./theme.js";

export { THEME_HEAD_SNIPPET } from "./theme.js";

const REPO = "https://github.com/popkinj/maplibre-transition";
const NPM = "https://www.npmjs.com/package/maplibre-transition";

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function mountHeader() {
  if (document.querySelector(".site-header")) {
    return document.querySelector('[data-testid="theme-toggle"]');
  }

  const header = el(`
    <header class="site-header">
      <div class="header-content">
        <a class="brand" href="./" data-testid="brand-link">
          <span class="brand-mark" aria-hidden="true">mT</span>
          <span class="brand-name">maplibre-transition</span>
        </a>
        <nav class="site-nav">
          <a href="./" data-testid="nav-examples">examples</a>
          <a href="${REPO}" target="_blank" rel="noopener" data-testid="nav-github">github</a>
          <a href="${NPM}" target="_blank" rel="noopener" data-testid="nav-npm">npm</a>
          <button
            class="seg"
            type="button"
            data-testid="theme-toggle"
            aria-pressed="false"
            aria-label="Toggle dark theme"
            title="Toggle dark theme">
            <span class="seg-knob" aria-hidden="true"></span>
            <span aria-hidden="true">LGT</span>
            <span aria-hidden="true">DRK</span>
          </button>
        </nav>
      </div>
    </header>
  `);

  document.body.insertBefore(header, document.body.firstChild);
  return header.querySelector('[data-testid="theme-toggle"]');
}

function mountFooter() {
  if (document.querySelector(".site-footer")) return;

  const footer = el(`
    <footer class="site-footer">
      <div class="footer-content">
        <span>maplibre-transition — feature-state paint transitions for MapLibre GL JS</span>
        <span>
          <a href="${REPO}" target="_blank" rel="noopener">source</a> ·
          <a href="${NPM}" target="_blank" rel="noopener">npm</a> ·
          basemap © <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>,
          © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>
        </span>
      </div>
    </footer>
  `);

  document.body.appendChild(footer);
}

/**
 * The frame-budget rail + the mono API kicker, at the top of the instrument card.
 * The page still owns mounting the rail: mountFrameRail(document.querySelector('.frame-rail'), meter)
 */
function mountPanelHead(kicker) {
  const controls = document.querySelector(".controls");
  if (!controls) return;

  if (!controls.querySelector(".frame-rail")) {
    const head = el(`
      <div class="panel-head">
        <canvas class="frame-rail" data-testid="frame-rail" aria-hidden="true"></canvas>
        <div class="rail-legend">
          <span>120f · budget 16.7ms</span>
          <span class="spacer"></span>
          <span class="metric" data-rail-fps data-testid="rail-fps">--</span>
          <span>fps</span>
          <span class="metric" data-rail-p95 data-testid="rail-p95">--</span>
          <span>p95</span>
        </div>
      </div>
    `);
    controls.insertBefore(head, controls.firstChild);
  }

  if (kicker && !controls.querySelector(".kicker")) {
    const line = el(
      `<code class="kicker" data-testid="kicker"></code>`
    );
    line.textContent = kicker;
    const h2 = controls.querySelector("h2");
    if (h2 && h2.nextSibling) {
      h2.parentNode.insertBefore(line, h2.nextSibling);
    } else if (h2) {
      h2.parentNode.appendChild(line);
    } else {
      const head = controls.querySelector(".panel-head");
      controls.insertBefore(line, head ? head.nextSibling : controls.firstChild);
    }
  }
}

function wireToggle(btn) {
  if (!btn || btn.__wired) return;
  btn.__wired = true;

  const sync = () => {
    btn.setAttribute("aria-pressed", String(currentTheme() === "dark"));
  };

  btn.addEventListener("click", () => {
    toggleTheme();
  });

  window.addEventListener("themechange", sync);
  sync();
}

/**
 * @param {{title?: string, kicker?: string}} [opts]
 */
export function mountChrome(opts) {
  const { title, kicker } = opts || {};

  // The inline head snippet should already have done this before first paint. If a
  // page forgot it, do not persist — we must keep following prefers-color-scheme.
  if (!document.documentElement.getAttribute("data-theme")) {
    setTheme(initialTheme(), { persist: false });
  }

  if (title) document.title = `${title} — maplibre-transition`;

  const toggle = mountHeader();
  mountPanelHead(kicker);
  mountFooter();
  wireToggle(toggle);
}

export default mountChrome;
