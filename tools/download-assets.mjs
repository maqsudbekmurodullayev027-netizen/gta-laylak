import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GSTATIC_ORIGIN = 'https://www.gstatic.com/';
const GSTATIC_STARTER_PREFIX = 'aistudio/starter-apps/pelican-campus/';
const EXPECTED_GYM_V5_SHA256 = 'de3a2d6df9c6255973a15b20af3ad6f4649855b7d1a909ef5296b31797411491';

const GLB_SLUGS = [
  "android_statues_v2",
  "campus_collectibles_v2",
  "campus_environment_v3",
  "campus_horizon_arch_v5",
  "campus_landmarks_v2",
  "gbike_and_vehicles_v2",
  "gradient_canopy_v6",
  "gym_interior_v5",
  "pelican_hero_v3",
  "priority_gbike_v9",
  "props_and_bridge_v6",
  "props_and_finale_v4",
  "stan_trex_v5",
  "tpu_8i",
  "trees_v4",
  "waymo_gen6_v4"
];

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function decodeLocalGymV5Fallback() {
  const wrapperPath = path.join(ROOT_DIR, 'assets', 'glb', 'gym_interior_v5_glb.js');
  const src = await fs.readFile(wrapperPath, 'utf-8');
  const match = src.match(/GLB_GZ_BASE64\s*=\s*"([A-Za-z0-9+/=]+)"/);
  if (!match) {
    throw new Error('Could not locate GLB_GZ_BASE64 fallback payload in gym_interior_v5_glb.js');
  }
  const gzBuf = Buffer.from(match[1], 'base64');
  return zlib.gunzipSync(gzBuf);
}

async function ensureSingleGlb(slug) {
  const destDir = path.join(ROOT_DIR, 'public', 'assets', 'glb');
  const destPath = path.join(destDir, `${slug}.glb`);
  try {
    const st = await fs.stat(destPath);
    if (st.size > 16) {
      if (slug !== 'gym_interior_v5') return;
      const existing = await fs.readFile(destPath);
      if (sha256Hex(existing) === EXPECTED_GYM_V5_SHA256) return;
    }
  } catch {
    // Proceed to fetch from GStatic.
  }

  await fs.mkdir(destDir, { recursive: true });
  const gstaticUrl = new URL(`${slug}.glb`, GSTATIC_ORIGIN + GSTATIC_STARTER_PREFIX).href;

  let buffer = null;
  try {
    const res = await fetch(gstaticUrl);
    if (res.ok) {
      const fetched = Buffer.from(await res.arrayBuffer());
      if (slug === 'gym_interior_v5' && sha256Hex(fetched) !== EXPECTED_GYM_V5_SHA256) {
        buffer = await decodeLocalGymV5Fallback();
      } else if (fetched.length > 16) {
        buffer = fetched;
      }
    }
  } catch (err) {
    if (slug === 'gym_interior_v5') {
      buffer = await decodeLocalGymV5Fallback();
    } else {
      throw err;
    }
  }

  if (!buffer && slug === 'gym_interior_v5') {
    buffer = await decodeLocalGymV5Fallback();
  }
  if (!buffer) {
    throw new Error(`Failed to download ${gstaticUrl}`);
  }

  await fs.writeFile(destPath, buffer);
  console.log(`[download-assets] Ready assets/glb/${slug}.glb (${buffer.length} bytes)`);
}

async function main() {
  await Promise.all(GLB_SLUGS.map((slug) => ensureSingleGlb(slug)));
}

main().catch((err) => {
  console.error('[download-assets] Error:', err);
  process.exit(1);
});
