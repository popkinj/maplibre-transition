#!/usr/bin/env node
/**
 * Fetch downtown Vancouver building footprints from OpenStreetMap via Overpass and
 * write examples/public/data/vancouver-buildings.geojson.
 *
 * Data © OpenStreetMap contributors, ODbL.
 *
 *   node scripts/fetch-buildings.mjs
 *
 * Conversion rules (must stay in sync with what rising-city.html expects):
 *   - height = tags.height, else tags["building:levels"] * 3.3, else random 6-12m.
 *   - ways -> Polygon (outer ring only); relations -> outer members, one Polygon each.
 *   - degenerate rings (< 4 coords, or unclosed) are skipped.
 *   - properties = { height } ONLY. Payload size matters.
 *   - coordinates rounded to 6 decimal places.
 *   - Feature-level `id` is a sequential integer 0..N-1. The demo builds fake feature
 *     objects by id and adds the source WITHOUT generateId. This is load-bearing.
 *   - If more than MAX_FEATURES buildings come back, keep the tallest MAX_FEATURES.
 *   - Output is minified JSON.
 *
 * No dependencies: uses global fetch (Node >= 18).
 */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "../examples/public/data/vancouver-buildings.geojson");

// Downtown peninsula + West End + Yaletown + Coal Harbour.
const BBOX = { south: 49.262, west: -123.155, north: 49.3, east: -123.093 };

const MAX_FEATURES = 5000;

// Downtown Vancouver really does have thousands of buildings. If an endpoint answers with
// far fewer, it is lying to us (regional-extract mirrors like overpass.osm.ch happily
// return HTTP 200 with `elements: []` for a bbox they do not cover). Treat that as a
// failure rather than writing an empty city.
const MIN_ELEMENTS = 1000;
const MIN_FEATURES = 1000;

// Full-planet instances only. Do NOT add regional extracts here.
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const QUERY = `[out:json][timeout:180];
(
  way["building"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
  relation["building"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});
);
out geom;`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass() {
  const attempts = 4;
  let lastErr;
  for (let attempt = 0; attempt < attempts; attempt++) {
    for (const url of ENDPOINTS) {
      try {
        process.stderr.write(`→ POST ${url} (attempt ${attempt + 1})\n`);
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "maplibre-transition-examples/1.0 (build script)",
          },
          body: new URLSearchParams({ data: QUERY }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
        const json = await res.json();
        if (!Array.isArray(json.elements)) throw new Error("no elements array in response");
        if (json.elements.length < MIN_ELEMENTS) {
          throw new Error(
            `only ${json.elements.length} elements (expected >= ${MIN_ELEMENTS}) — ` +
              `endpoint probably does not cover this bbox`,
          );
        }
        process.stderr.write(`  ok: ${json.elements.length} elements\n`);
        return json;
      } catch (err) {
        lastErr = err;
        process.stderr.write(`  failed: ${err.message}\n`);
      }
    }
    const backoff = 5000 * 2 ** attempt;
    process.stderr.write(`  all endpoints failed; backing off ${backoff}ms\n`);
    await sleep(backoff);
  }
  throw new Error(
    `Could not reach any Overpass instance after ${attempts} rounds. Last error: ${lastErr?.message}`,
  );
}

const round6 = (n) => Math.round(n * 1e6) / 1e6;

function ring(geometry) {
  if (!Array.isArray(geometry) || geometry.length < 4) return null;
  const coords = geometry.map((p) => [round6(p.lon), round6(p.lat)]);
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) return null; // unclosed
  if (coords.length < 4) return null;
  return coords;
}

// One decimal place is well under the accuracy of the underlying OSM tags and keeps the
// payload small (heights appear once per feature).
const round1 = (n) => Math.round(n * 10) / 10;

function heightOf(tags = {}) {
  const h = parseFloat(tags.height);
  if (Number.isFinite(h) && h > 0) return round1(h);
  const levels = parseFloat(tags["building:levels"]);
  if (Number.isFinite(levels) && levels > 0) return round1(levels * 3.3);
  return round1(6 + Math.random() * 6); // low-rise fabric
}

function toPolygons(el) {
  const out = [];
  if (el.type === "way") {
    const r = ring(el.geometry);
    if (r) out.push(r);
  } else if (el.type === "relation") {
    for (const m of el.members ?? []) {
      if (m.role !== "outer") continue;
      const r = ring(m.geometry);
      if (r) out.push(r);
    }
  }
  return out;
}

async function main() {
  const data = await overpass();

  let features = [];
  for (const el of data.elements) {
    const height = heightOf(el.tags);
    for (const r of toPolygons(el)) {
      features.push({
        type: "Feature",
        id: 0, // reassigned below
        properties: { height },
        geometry: { type: "Polygon", coordinates: [r] },
      });
    }
  }

  // Never overwrite a good file with a degenerate one.
  if (features.length < MIN_FEATURES) {
    throw new Error(
      `only ${features.length} usable polygons (expected >= ${MIN_FEATURES}); refusing to write`,
    );
  }

  if (features.length > MAX_FEATURES) {
    process.stderr.write(
      `→ ${features.length} polygons; keeping the ${MAX_FEATURES} tallest\n`,
    );
    // Rank by height, keep the top MAX_FEATURES, then restore the original OSM order so
    // that `id` does NOT correlate with height — a prefix slice (rising-city's
    // setBuildings(n)) must stay a representative sample of the city, not a pile of towers.
    features.forEach((f, i) => {
      f.__i = i;
    });
    features.sort((a, b) => b.properties.height - a.properties.height);
    features = features.slice(0, MAX_FEATURES);
    features.sort((a, b) => a.__i - b.__i);
    features.forEach((f) => {
      delete f.__i;
    });
  }

  features.forEach((f, i) => {
    f.id = i;
  });

  const fc = { type: "FeatureCollection", features };
  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(fc));

  const heights = features.map((f) => f.properties.height).sort((a, b) => a - b);
  process.stderr.write(
    `✓ wrote ${OUT_PATH}\n` +
      `  features: ${features.length}\n` +
      `  height min/median/max: ${heights[0]} / ${heights[heights.length >> 1]} / ${heights[heights.length - 1]}\n`,
  );
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  console.error("No data written. Do NOT fabricate buildings; re-run when Overpass is up.");
  process.exit(1);
});
