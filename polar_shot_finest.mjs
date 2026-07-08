// Sprint-6 §2 polar mesh FINEST-slider screenshot capture (View C/D).
// Sets Observer Console finest (step=10m, zStep=1m), fires CALC, captures
// top-down + oblique. Confirms the hidden decimation cap engages gracefully.
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
await page.waitForFunction(() => window.app && window.app.wasmReady, { timeout: 90000 }).catch(() => {});
console.log('[finest] wasmReady reached');
await sleep(8000); // terrain tiles

// Set finest sliders on the selected observer, then fire calc directly.
const calcResult = await page.evaluate(async () => {
  const app = window.app;
  if (!app) return 'no app';
  const obs = app.registry.getSelected() || app.registry.list?.()?.[0];
  if (!obs) return 'no observer';
  obs.config.stepDistance = 10; // finest
  obs.config.zStep = 1;         // finest
  try {
    await app._runCalcDispatch(obs.id);
    return `calc done for ${obs.id} at step=${obs.config.stepDistance} zStep=${obs.config.zStep}`;
  } catch (e) {
    return 'calc error: ' + (e && e.message);
  }
});
console.log('[finest] calc:', calcResult);
await sleep(2500);

async function frame(view) {
  await page.evaluate((v) => {
    const app = window.app;
    const cam = app.scene.camera;
    const ctrls = app.controls;
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
    if (v === 'top') cam.position.set(cx + 1, cy + R, cz + 1);
    else cam.position.set(cx + R * 0.7, cy + R * 0.55, cz + R * 0.7);
    cam.lookAt(cx, cy, cz);
    ctrls.update();
  }, view);
  await sleep(900);
}

await frame('top');
await page.screenshot({ path: `${OUT}/sprint6-s2-finest-top.png` });
console.log('[finest] saved finest-top');

await frame('oblique');
await page.screenshot({ path: `${OUT}/sprint6-s2-finest-oblique.png` });
console.log('[finest] saved finest-oblique');

const perf = logs.filter((l) => /Viewshed complete|Visible:|Shadow:|POLAR mesh|BVH build|Phase 3|columns merged|decimat|stride/i.test(l));
console.log('=== FINEST PERF LOG ===');
for (const l of perf) console.log(l);
console.log('=== END ===');

await browser.close();
