// Sprint-6 §2 polar mesh screenshot capture (advisory input for the lead).
// Drives the threejs-app headless: loads page, waits for WASM + tiles,
// fires CALC at default sliders, captures top-down + oblique views.
import { chromium } from 'playwright';

const URL = 'http://localhost:8011/threejs-app/index.html';
const OUT = '/home/popkinj/data/viewshed/doc/sprint-6/screenshots';
const W = 1600, H = 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const page = await ctx.newPage();

const logs = [];
page.on('console', (m) => { logs.push(m.text()); });
page.on('pageerror', (e) => { logs.push('PAGEERROR: ' + e.message); });

await page.goto(URL, { waitUntil: 'load', timeout: 60000 });

// Wait for app + WASM ready.
await page.waitForFunction(() => window.app && window.app.wasmReady, { timeout: 90000 }).catch(() => {});
console.log('[shot] app.wasmReady reached (or timed out)');

// Give terrain tiles time to load.
await sleep(8000);

// Fire calc directly (skip the Death-Star ring animation) on the selected observer.
const calcResult = await page.evaluate(async () => {
  const app = window.app;
  if (!app) return 'no app';
  const obs = app.registry.getSelected() || app.registry.list?.()?.[0];
  if (!obs) return 'no observer';
  try {
    // _runCalcDispatch fires WASM immediately without the 900ms ring.
    await app._runCalcDispatch(obs.id);
    return 'calc done for ' + obs.id;
  } catch (e) {
    return 'calc error: ' + (e && e.message);
  }
});
console.log('[shot] calc:', calcResult);

await sleep(2000);

// Helper to position the camera and render a couple frames.
async function frame(view) {
  await page.evaluate((v) => {
    const app = window.app;
    const THREE = app.scene.camera.constructor.prototype.isCamera ? null : null;
    const cam = app.scene.camera;
    const ctrls = app.controls;
    // Find the visible mesh to frame.
    const obs = app.registry.getSelected() || app.registry.list?.()?.[0];
    const mesh = obs && obs.visibleMesh;
    let cx = 0, cy = 0, cz = 0;
    if (mesh) {
      mesh.geometry.computeBoundingSphere();
      const c = mesh.localToWorld(mesh.geometry.boundingSphere.center.clone());
      cx = c.x; cy = c.y; cz = c.z;
    }
    ctrls.target.set(cx, cy, cz);
    const R = 9000;
    if (v === 'top') {
      cam.position.set(cx + 1, cy + R, cz + 1);
    } else {
      // oblique ~30° elevation looking NE
      cam.position.set(cx + R * 0.7, cy + R * 0.55, cz + R * 0.7);
    }
    cam.lookAt(cx, cy, cz);
    ctrls.update();
  }, view);
  await sleep(800);
}

await frame('top');
await page.screenshot({ path: `${OUT}/sprint6-s2-top.png` });
console.log('[shot] saved top');

await frame('oblique');
await page.screenshot({ path: `${OUT}/sprint6-s2-oblique.png` });
console.log('[shot] saved oblique');

// Dump the key coordinator log lines for perf.
const perf = logs.filter((l) => /Viewshed complete|Visible:|Shadow:|POLAR mesh|BVH build|Phase 3|columns merged/.test(l));
console.log('=== PERF LOG ===');
for (const l of perf) console.log(l);
console.log('=== END PERF ===');

await browser.close();
