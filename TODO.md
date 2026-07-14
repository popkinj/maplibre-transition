# TODO

Live items only. Everything that was in here about documenting `[null, target]`,
auto-reversal, hover-between-features, and the API surface is **done** and shipped in
2.0.0 — see `CHANGELOG.md` and the README rather than a stale copy here.

## Still open

- **`poly` and `cubic` are the same curve.** d3's `easePoly` is `easePolyInOut` at its
  default exponent 3 — literally `easeCubicInOut`. So `ease` advertises 9 names but
  yields **8 distinct curves**. Fixing this means exposing the exponent, which is an
  API change. Until then, the docs should not imply 9 distinct curves.

- **Eased values are clamped to `[0, 1]` (`src/index.ts`), so `elastic` never
  overshoots the target.** `d3.easeElastic` naturally peaks at ~`1.373`; the clamp pins
  it at the target, so the characteristic spring-past-and-back is lost. Decide whether to
  unclamp (a real behaviour change — it would let any transition briefly exceed its target
  value, which callers may not expect for e.g. `circle-opacity` or `fill-extrusion-height`)
  or to keep documenting the clamp.
  **`bounce` is unaffected** — `d3.easeBounce` stays within `[0, 1]` by construction
  (verified: range `0.000 → 1.000`), so it behaves exactly as advertised.
  Documented for now in `README.md` → "Two honest caveats", which also gives the
  workaround: express overshoot explicitly as a breakpoint array, `[null, 24, 20]`.

- **The e2e suite is flaky against the Vite dev server**, because HMR broadcasts a
  `full-reload` to every open page on any HTML/JS save, wiping page state mid-assertion.
  Fix properly by running e2e against a built `vite preview`, or by disabling HMR for
  tests, rather than per-spec `page.route` workarounds.

- **`rising-city.spec.ts` is timing-flaky** ("transitions smoothly between their
  endpoints"). Observed failing once and passing on retry in a full local run. CI's
  `retries: 2` absorbs it, so it is not blocking, but it is real. Same class of problem as
  the `engine-perf` window bug fixed in 3.0.0: an assertion whose validity depends on how
  fast the box happens to be.

- **Perf specs are only serial *within* a file.** `engine-perf.spec.ts` and
  `stress.spec.ts` both set `test.describe.configure({ mode: 'default' })`, but
  `fullyParallel: true` still runs *other* spec files alongside them, so a local run
  (8 workers) can starve them and produce spurious failures. CI is unaffected
  (`workers: 1`). Consider a separate perf project in `playwright.config.ts`.

- **`/favicon.ico` 404s on every example page.** Harmless, but noisy.
