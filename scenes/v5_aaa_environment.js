/**
 * v5_aaa_environment.js — Pelican Campus Quest V5 AAA Game Environment Realism Module.
 *
 * Self-contained deterministic ES module (ZERO Math.random(), Node + Browser + SwiftShader safe):
 *   1. createAAAInstancedGrassSystem(THREE, options):
 *      - 120,000+ (default 132,000) GPU-instanced 3-segment curved, tapered 3D grass blades
 *        concentrated in high-density hero rings around Stan Courtyard (-118, -50), Android Lawn (-118, 96),
 *        Bay View Plaza (142, 22), and Gym / Gradient Canopy Exterior (0, 82..126) + broad campus lawns.
 *      - Closed-form + customizable road/curb/sidewalk/paver/plaza/building/water exclusion mask
 *        guaranteeing ZERO grass blades poke through asphalt or plazas.
 *      - Calibrated to @omni-director's omni_v5_telemetry.json: dark root AO (#1f3a18 -> #3F421A)
 *        to sunlit olive-emerald tips (#7A7123), manicured mowed-lawn stripe variation, golden-hour
 *        backlit subsurface scattering, real 4096 PCFSoftShadowMap reception (receiveShadow = true),
 *        and pure deterministic update(timeSec, opts) wind-ripple waves.
 *   2. upgradeRoadAndCurbRealism(THREE, options):
 *      - Crisp 1024x1024 deterministic Canvas/DataTexture PBR sets & geometry helpers for:
 *        a) Weathered California aggregate asphalt (#544F45, dual polished tire tracks vs rougher
 *           shoulder aggregate, hairline tar-sealed micro-cracks, ZERO green road boxes).
 *        b) Beveled bush-hammered Sierra granite roadside curbs (#918675, 0.15m raised beveled profile,
 *           expansion joints every 1.80m, subtle dark gutter grime AO strip, ZERO tan bleed onto roads).
 *        c) Sandstone courtyard pavers (#8C7C69, deep recessed mortar normal/bump channels) +
 *           dark loam/granite soil-turf edging strips.
 *   3. auditAndGroundPropsZeroFloat(THREE, rootGroup, rules):
 *      - Deterministic world-space bounding-box grounding & contact-AO helper across all campus/studio
 *        prop categories (dumbbell, kettlebells, spinBikes, racks, stanPlinth, cafeSets, trees, benches,
 *        ramps, pavilions, berms), snapping residual float to 0.000m (|minY - surfaceTopY| <= 0.0005m),
 *        adding grounded contact-AO decals beneath bases, and populating window.__V5_GROUNDING_AUDIT__.
 */

import {
  CAMPUS_ROADS,
  CAMPUS_BUILDING_BLOCKS,
  JUMP_RAMPS,
  LANDING_RAMPS,
  MK_BOOST_PADS,
} from "../contract.js";
import {
  createMulberry32,
  getOpenWorldEarthHeight,
  getStevensCreekBridgeParam,
} from "../rig/kin.js";

export const OMNI_V5_ENVIRONMENT_TELEMETRY = Object.freeze({
  version: "5.2.0",
  sunDirectionYup: Object.freeze([-0.62, 0.34, -0.71]),
  sunColorHex: "#FFD28A",
  skyZenithHex: "#A1BDCD",
  horizonHazeHex: "#E5EBE7",
  hemiSkyHex: "#CFE2F7",
  hemiGroundHex: "#7E694E",
  grassRootBaseHex: "#1f3a18",
  grassShadowOliveHex: "#3F421A",
  grassSunlitTipHex: "#726D22",
  grassBacklitGoldHex: "#A4A83C",
  asphaltWeatheredHex: "#3E4044",
  sierraGraniteCurbHex: "#918675",
  sandstonePaversHex: "#8C7C69",
  shorelineBasaltHex: "#2C3036",
  terracottaSpandrelHex: "#D99E69",
  stanBronzePatinaHex: "#5C4528",
  bladesPerTuft: 4,
  defaultTuftCount: 156000,
  curbHeightM: 0.15,
  curbJointSpacingM: 1.8,
  maxAllowedFloatMm: 0.5,
});

// ============================================================================
// DETERMINISTIC PRNG & TILEABLE PROCEDURAL NOISE HELPERS (ZERO Math.random())
// ============================================================================

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function buildNoiseGrid(size, seed) {
  const rng = createMulberry32(seed >>> 0);
  const out = new Float32Array(size * size);
  for (let i = 0; i < out.length; i++) {
    out[i] = rng();
  }
  return out;
}

function sampleTileNoise(grid, size, fx, fy) {
  const mask = size - 1;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const sx = tx * tx * (3.0 - 2.0 * tx);
  const sy = ty * ty * (3.0 - 2.0 * ty);
  const ix0 = x0 & mask;
  const ix1 = (x0 + 1) & mask;
  const iy0 = (y0 & mask) * size;
  const iy1 = ((y0 + 1) & mask) * size;
  const a = grid[iy0 + ix0] + (grid[iy0 + ix1] - grid[iy0 + ix0]) * sx;
  const b = grid[iy1 + ix0] + (grid[iy1 + ix1] - grid[iy1 + ix0]) * sx;
  return a + (b - a) * sy;
}

/**
 * Creates a THREE texture from a raw RGBA Uint8Array buffer (1024x1024 etc.):
 * - In Browser (`typeof document !== "undefined"`), blits to an offscreen `<canvas>`
 *   and wraps in `THREE.CanvasTexture` for optimal GPU mipmap generation & anisotropy.
 * - In headless Node.js (`typeof document === "undefined"`), wraps directly in
 *   `THREE.DataTexture` so automated verification scripts run with zero DOM dependency.
 */
function createRgbaTexture(
  THREE,
  rgba,
  width,
  height,
  {
    repeatX = 1.0,
    repeatY = 1.0,
    srgb = true,
    anisotropy = 12,
    clampEdge = false,
  } = {}
) {
  let tex = null;
  if (typeof document !== "undefined" && typeof document.createElement === "function") {
    const cv = document.createElement("canvas");
    cv.width = width;
    cv.height = height;
    const ctx = cv.getContext("2d");
    if (ctx && typeof ctx.createImageData === "function") {
      const img = ctx.createImageData(width, height);
      img.data.set(rgba);
      ctx.putImageData(img, 0, 0);
      tex = new THREE.CanvasTexture(cv);
    }
  }
  if (!tex) {
    tex = new THREE.DataTexture(rgba, width, height, THREE.RGBAFormat);
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
  }
  tex.wrapS = clampEdge ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  tex.wrapT = clampEdge ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  if (!clampEdge) {
    tex.repeat.set(repeatX, repeatY);
  }
  tex.anisotropy = anisotropy;
  if (srgb && THREE.SRGBColorSpace) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  tex.userData = { width, height, repeatX, repeatY, srgb };
  tex.needsUpdate = true;
  return tex;
}

function grayBufferToRgba(gray, width, height) {
  const n = width * height;
  const rgba = new Uint8Array(n * 4);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const v = gray[i];
    rgba[p] = v;
    rgba[p + 1] = v;
    rgba[p + 2] = v;
    rgba[p + 3] = 255;
  }
  return rgba;
}

/**
 * Packs calibrated PBR channels into a single RGBA ORM+Height map:
 * - R = Ambient Occlusion (derived from cavity/joint relief height so mortar/cracks occlude indirect light)
 * - G = Roughness
 * - B = Metalness
 * - A = Relief Height (available for zero-extra-sampler POM!)
 */
function packOrmFromHeightAndRoughness(heightBuf, roughBuf, width, height, metalByte = 0, aoContrast = 0.65) {
  const n = width * height;
  const rgba = new Uint8Array(n * 4);
  const mByte = clamp(Math.round(metalByte), 0, 255);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const hNorm = (heightBuf ? heightBuf[i] : 180) / 255.0;
    const aoNorm = clamp(1.0 - Math.max(0.0, 0.68 - hNorm) * aoContrast, 0.32, 1.0);
    rgba[p] = Math.round(aoNorm * 255.0);
    rgba[p + 1] = roughBuf ? roughBuf[i] : 204;
    rgba[p + 2] = mByte;
    rgba[p + 3] = heightBuf ? heightBuf[i] : 255;
  }
  return rgba;
}

function heightBufferToNormalRgba(heightBuf, width, height, strength = 2.4) {
  const rgba = new Uint8Array(width * height * 4);
  const wMask = width - 1;
  const hMask = height - 1;
  const scale = strength / 255.0;

  for (let y = 0; y < height; y++) {
    const yUp = ((y - 1) & hMask) * width;
    const yCur = y * width;
    const yDn = ((y + 1) & hMask) * width;
    for (let x = 0; x < width; x++) {
      const hL = heightBuf[yCur + ((x - 1) & wMask)];
      const hR = heightBuf[yCur + ((x + 1) & wMask)];
      const hU = heightBuf[yUp + x];
      const hD = heightBuf[yDn + x];
      const dx = (hL - hR) * scale;
      const dy = (hU - hD) * scale;
      const invLen = 127.5 / Math.sqrt(dx * dx + dy * dy + 1.0);
      const p = (yCur + x) * 4;
      rgba[p] = clamp(Math.round(127.5 + dx * invLen), 0, 255);
      rgba[p + 1] = clamp(Math.round(127.5 + dy * invLen), 0, 255);
      rgba[p + 2] = clamp(Math.round(127.5 + invLen), 0, 255);
      rgba[p + 3] = 255;
    }
  }
  return rgba;
}

// ============================================================================
// EXACT CAMPUS ASPHALT, CURB, SIDEWALK, PLAZA, BUILDING & WATER SDF EXCLUSION
// ============================================================================

const CORNER_FILLET_RADIUS_M = 3.6;

const ACTIVE_ASPHALT_SEGMENTS = Object.freeze([
  { id: "charleston_rd", x1: -195.0, z1: 76.0, x2: 164.0, z2: 76.0, halfW: 7.0 },
  { id: "amphitheatre_pkwy", x1: -195.0, z1: -18.0, x2: 164.0, z2: -18.0, halfW: 7.0 },
  { id: "gradient_driveway", x1: -56.0, z1: 116.0, x2: 56.0, z2: 116.0, halfW: 5.25 },
  { id: "north_creek_connector", x1: -7.0, z1: -86.0, x2: 164.0, z2: -86.0, halfW: 5.75 },
  { id: "shoreline_blvd", x1: 0.0, z1: 121.25, x2: 0.0, z2: -86.0, halfW: 7.0 },
  { id: "west_campus_ave", x1: -118.0, z1: 86.6, x2: -118.0, z2: -11.0, halfW: 6.5 },
]);

const CURBSIDE_WAYMO_BAYS = Object.freeze([
  { x: 33.5, z: 122.15, bayHalfLen: 4.8, bayDepth: 2.35, roadEdgeCoord: 121.25, axis: "x", sideSign: 1 },
  { x: -44.0, z: 84.05, bayHalfLen: 4.8, bayDepth: 2.35, roadEdgeCoord: 83.0, axis: "x", sideSign: 1 },
  { x: -125.55, z: 42.0, bayHalfLen: 4.8, bayDepth: 2.35, roadEdgeCoord: -124.5, axis: "z", sideSign: -1 },
  { x: -64.0, z: -26.05, bayHalfLen: 4.8, bayDepth: 2.35, roadEdgeCoord: -25.0, axis: "x", sideSign: -1 },
  { x: 112.0, z: -9.95, bayHalfLen: 4.8, bayDepth: 2.35, roadEdgeCoord: -11.0, axis: "x", sideSign: 1 },
  { x: 141.5, z: -9.95, bayHalfLen: 4.8, bayDepth: 2.35, roadEdgeCoord: -11.0, axis: "x", sideSign: 1 },
  { x: 138.0, z: 67.95, bayHalfLen: 4.8, bayDepth: 2.35, roadEdgeCoord: 69.0, axis: "x", sideSign: -1 },
]);

const INTERSECTION_CORNER_FILLETS = (() => {
  const list = [];
  const addCorners = (ix, iz, halfWV, halfWH, quadrants) => {
    for (const [sx, sz] of quadrants) {
      list.push({
        ix,
        iz,
        halfWV,
        halfWH,
        sx,
        sz,
        rFillet: CORNER_FILLET_RADIUS_M,
        cx: ix + sx * (halfWV + CORNER_FILLET_RADIUS_M),
        cz: iz + sz * (halfWH + CORNER_FILLET_RADIUS_M),
      });
    }
  };
  addCorners(0.0, 116.0, 7.0, 5.25, [[-1, -1], [1, -1]]);
  addCorners(0.0, 76.0, 7.0, 7.0, [[-1, -1], [1, -1], [-1, 1], [1, 1]]);
  addCorners(-118.0, 76.0, 6.5, 7.0, [[-1, -1], [1, -1], [-1, 1], [1, 1]]);
  addCorners(0.0, -18.0, 7.0, 7.0, [[-1, -1], [1, -1], [-1, 1], [1, 1]]);
  addCorners(-118.0, -18.0, 6.5, 7.0, [[-1, 1], [1, 1]]);
  addCorners(0.0, -86.0, 7.0, 5.75, [[1, 1]]);
  return Object.freeze(list);
})();

const ANDROID_DESSERT_APRON_CENTERS = Object.freeze([
  [-127.5, 98.5],
  [-108.5, 98.0],
  [-129.0, 88.5],
  [-107.5, 89.0],
  [-123.5, 105.5],
  [-112.5, 105.5],
]);

function sdOrientedSegmentBox(x, z, x1, z1, x2, z2, halfW) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len = Math.hypot(dx, dz) || 1.0;
  const fx = dx / len;
  const fz = dz / len;
  const mx = (x1 + x2) * 0.5;
  const mz = (z1 + z2) * 0.5;
  const relX = x - mx;
  const relZ = z - mz;
  const along = Math.abs(relX * fx + relZ * fz) - len * 0.5;
  const perp = Math.abs(-relX * fz + relZ * fx) - halfW;
  const outX = Math.max(along, 0.0);
  const outZ = Math.max(perp, 0.0);
  return Math.hypot(outX, outZ) + Math.min(Math.max(along, perp), 0.0);
}

export function stevensCreekCenterZ(x) {
  const bridgeWave = 0.75 * Math.sin((x - 35.0) * 0.085);
  if (x < 0.0) {
    const uW = clamp(-x / 220.0, 0.0, 1.0);
    const sW = uW * uW * (3.0 - 2.0 * uW);
    return -122.0 + bridgeWave * (1.0 - sW) - 18.0 * sW + 6.5 * Math.sin(x * 0.026) * sW;
  }
  if (x > 70.0) {
    const uE = clamp((x - 70.0) / 185.0, 0.0, 1.0);
    const sE = uE * uE * (3.0 - 2.0 * uE);
    return -122.0 + bridgeWave * (1.0 - sE) - 24.0 * sE + 7.2 * Math.sin((x - 70.0) * 0.025) * sE;
  }
  return -122.0 + bridgeWave;
}

export function stevensCreekHalfWidthZ(x) {
  let wBridge = 1.0;
  if (x < -4.0) {
    const t = clamp((-4.0 - x) / 36.0, 0.0, 1.0);
    wBridge = 0.5 * (1.0 + Math.cos(Math.PI * t));
  } else if (x > 74.0) {
    const t = clamp((x - 74.0) / 36.0, 0.0, 1.0);
    wBridge = 0.5 * (1.0 + Math.cos(Math.PI * t));
  }
  return 16.5 + (29.2 - 16.5) * wBridge;
}

export function signedCampusAsphaltClearance(x, z) {
  let minSd = Infinity;
  for (let i = 0; i < ACTIVE_ASPHALT_SEGMENTS.length; i++) {
    const s = ACTIVE_ASPHALT_SEGMENTS[i];
    const d = sdOrientedSegmentBox(x, z, s.x1, s.z1, s.x2, s.z2, s.halfW);
    if (d < minSd) minSd = d;
  }
  for (let i = 0; i < INTERSECTION_CORNER_FILLETS.length; i++) {
    const c = INTERSECTION_CORNER_FILLETS[i];
    const uV = (x - c.ix) * c.sx;
    const uH = (z - c.iz) * c.sz;
    if (
      uV >= c.halfWV - 0.02 &&
      uV <= c.halfWV + c.rFillet + 0.02 &&
      uH >= c.halfWH - 0.02 &&
      uH <= c.halfWH + c.rFillet + 0.02
    ) {
      const sdFillet = c.rFillet - Math.hypot(x - c.cx, z - c.cz);
      if (sdFillet < minSd) minSd = sdFillet;
    }
  }
  for (let i = 0; i < CURBSIDE_WAYMO_BAYS.length; i++) {
    const b = CURBSIDE_WAYMO_BAYS[i];
    if (b.axis === "x") {
      const bz = b.roadEdgeCoord + b.sideSign * (b.bayDepth * 0.5);
      const d = sdOrientedSegmentBox(x, z, b.x - b.bayHalfLen, bz, b.x + b.bayHalfLen, bz, b.bayDepth * 0.5);
      if (d < minSd) minSd = d;
    } else {
      const bx = b.roadEdgeCoord + b.sideSign * (b.bayDepth * 0.5);
      const d = sdOrientedSegmentBox(x, z, bx, b.z - b.bayHalfLen, bx, b.z + b.bayHalfLen, b.bayDepth * 0.5);
      if (d < minSd) minSd = d;
    }
  }
  for (const iz of [76.0, -18.0, -86.0]) {
    const rHub = iz === -86.0 ? 8.6 : 9.4;
    const dHub = Math.hypot(x - 156.0, z - iz) - rHub;
    if (dHub < minSd) minSd = dHub;
  }
  const dBridgeHub = Math.hypot(x - 52.0, z + 86.0) - 8.6;
  if (dBridgeHub < minSd) minSd = dBridgeHub;
  return minSd;
}

export function signedCampusCarriagewayClearance(x, z) {
  let minSd = signedCampusAsphaltClearance(x, z);
  for (let i = 0; i < CAMPUS_ROADS.length; i++) {
    const r = CAMPUS_ROADS[i];
    if (
      r.surface === "asphalt" ||
      r.id === "gradient_driveway" ||
      r.id === "googleplex_courtyard_walk"
    ) {
      continue;
    }
    const d = sdOrientedSegmentBox(x, z, r.x1, r.z1, r.x2, r.z2, r.widthM * 0.5);
    if (d < minSd) minSd = d;
  }
  return minSd;
}

const MK_HARDSCAPE_APRON_SPECS = (() => {
  const specs = [];
  for (let i = 0; i < MK_BOOST_PADS.length; i++) {
    const pad = MK_BOOST_PADS[i];
    let bestRoad = null;
    let bestD = Infinity;
    for (let j = 0; j < CAMPUS_ROADS.length; j++) {
      const r = CAMPUS_ROADS[j];
      if (r.isArchedBridge) continue;
      const d = sdOrientedSegmentBox(pad.x, pad.z, r.x1, r.z1, r.x2, r.z2, r.widthM * 0.5);
      if (d < bestD) {
        bestD = d;
        bestRoad = r;
      }
    }
    if (!bestRoad) continue;
    const dx = bestRoad.x2 - bestRoad.x1;
    const dz = bestRoad.z2 - bestRoad.z1;
    const len = Math.hypot(dx, dz) || 1.0;
    const fx = dx / len;
    const fz = dz / len;
    const roadYaw = Math.atan2(dx, -dz);
    const rightX = Math.cos(roadYaw);
    const rightZ = Math.sin(roadYaw);
    const sideSign = pad.x > 140 ? -1 : 1;
    const halfW = bestRoad.widthM * 0.5;
    const isPaverRoad = bestRoad.surface === "pavers";
    specs.push({
      id: pad.id,
      px: pad.x,
      pz: pad.z,
      fx,
      fz,
      outX: rightX * sideSign,
      outZ: rightZ * sideSign,
      innerD: isPaverRoad ? halfW + 0.12 : halfW + 0.54,
      outerD: halfW + 4.25,
      minAlong: -6.20,
      maxAlong: 4.20,
      isPaverRoad,
    });
  }
  return Object.freeze(specs);
})();

export function evaluateMkHardscapeApronAt(x, z, margin = 0.0) {
  for (let i = 0; i < MK_HARDSCAPE_APRON_SPECS.length; i++) {
    const s = MK_HARDSCAPE_APRON_SPECS[i];
    const rx = x - s.px;
    const rz = z - s.pz;
    const along = rx * s.fx + rz * s.fz;
    const out = rx * s.outX + rz * s.outZ;
    if (
      along >= s.minAlong - margin &&
      along <= s.maxAlong + margin &&
      out >= s.innerD - margin &&
      out <= s.outerD + margin
    ) {
      return s;
    }
  }
  return null;
}

/**
 * Exact boolean predicate returning `true` ONLY when `(x, z)` lies strictly inside valid
 * campus lawn/meadow turf with full clearance from asphalt roads, gutters, granite curbs,
 * concrete/sandstone sidewalks, courtyard paver rings, building footprints, ramps, and water.
 */
export function isCampusGrassAllowedAt(x, z, options = {}) {
  const minCarriagewayClearance = options.minCarriagewayClearanceM ?? 4.04;
  // 0.32m gutter + 0.22m granite curb + 2.70m sidewalk + 0.80m safety margin = 4.04m
  if (signedCampusCarriagewayClearance(x, z) < minCarriagewayClearance) {
    return false;
  }

  // World bounds safety guard
  if (x < -238.0 || x > 238.0 || z < -220.5 || z > 186.0) {
    return false;
  }

  // Water bodies: Bay View Retention Pond, full-width Stevens Creek channel & North SF Bay
  if (x >= 164.0 && x <= 242.0 && z >= -62.5 && z <= 94.5) return false;
  if (x >= -265.0 && x <= 265.0 && Math.abs(z - stevensCreekCenterZ(x)) < stevensCreekHalfWidthZ(x) + 2.4) {
    return false;
  }

  // Gradient Canopy, Interior Spin Studio Gym & Full Cafe/Store Interlocking Hex-Paver Forecourt
  if (Math.abs(x) <= 27.2 && z >= 114.3 && z <= 159.5) return false;
  if (x >= -24.5 && x <= 28.5 && z >= 121.0 && z <= 159.5) return false;

  // Curbside Waymo Gen 6 pickup bays + recessed 2.30m passenger boarding sidewalks
  for (let i = 0; i < CURBSIDE_WAYMO_BAYS.length; i++) {
    const b = CURBSIDE_WAYMO_BAYS[i];
    const halfSpan = b.bayHalfLen + 1.65;
    const maxDepth = b.bayDepth + 3.05;
    if (b.axis === "x") {
      const dSide = (z - b.roadEdgeCoord) * b.sideSign;
      if (Math.abs(x - b.x) <= halfSpan && dSide >= -0.4 && dSide <= maxDepth) return false;
    } else {
      const dSide = (x - b.roadEdgeCoord) * b.sideSign;
      if (Math.abs(z - b.z) <= halfSpan && dSide >= -0.4 && dSide <= maxDepth) return false;
    }
  }

  // Android Sculpture Plaza Bugdroid central disc, gateway walk & 6 dessert plinths
  if (Math.hypot(x + 118.0, z - 96.0) < 9.85) return false;
  if (Math.abs(x + 118.0) < 5.75 && z >= 81.8 && z <= 96.6) return false;
  for (let i = 0; i < ANDROID_DESSERT_APRON_CENTERS.length; i++) {
    const d = ANDROID_DESSERT_APRON_CENTERS[i];
    if (Math.hypot(x - d[0], z - d[1]) < 2.52) return false;
  }

  // Stan T-Rex Courtyard (-118, -50):
  // Keep lush hero lawn island R in [stanPlinthClearR, 13.25m) AND outer garden lawns R > 19.85m,
  // while strictly excluding the stepped museum plinth, circular sandstone paver ring, and N/S paver gateway walkways!
  const stanPlinthClearR = Math.max(options.stanPlinthClearRadiusM ?? 4.45, 4.45);
  const rStan = Math.hypot(x + 118.0, z + 50.0);
  if (rStan <= stanPlinthClearR) return false;
  if (rStan >= 13.25 && rStan <= 19.85) return false;
  if (rStan >= 13.25 && Math.abs(x + 118.0) <= 6.2 && z >= -82.0 && z <= -18.0) return false;

  // Shoreline Amphitheatre Concourse, Gemini 4 Carbon Monument, Medallion, Meadow Paver Path & Tensile Bowl
  if (Math.hypot(x - 14.0, z + 188.0) < 26.8) return false;
  if (Math.hypot(x - 12.0, z + 208.0) < 25.0) return false;
  if (x >= -12.0 && x <= 10.0 && z >= -186.5 && z <= -178.5) return false;

  // Bay View Waterfront Promenade, Bay View Canopy Pavilion (Main + North islands) & West Solar EV Carport
  if (Math.abs(x - 156.0) <= 8.6 && z >= -88.0 && z <= 112.5) return false;
  if (x >= 176.5 && x <= 233.5 && z >= -48.5 && z <= 70.5) return false;
  if (Math.abs(x + 162.0) < 19.8 && Math.abs(z - 28.0) < 21.8) return false;

  // Campus Building Blocks (+1.80m foundation collar margin)
  for (let i = 0; i < CAMPUS_BUILDING_BLOCKS.length; i++) {
    const b = CAMPUS_BUILDING_BLOCKS[i];
    const bx = b.id === "bldg_north_commons" ? -32.0 : (b.cx ?? b.x ?? 0.0);
    const bz = b.cz ?? b.z ?? 0.0;
    const hx = (b.wx ?? 28.0) * 0.5 + 1.80;
    const hz = (b.wz ?? 24.0) * 0.5 + 1.80;
    if (Math.abs(x - bx) < hx && Math.abs(z - bz) < hz) return false;
  }

  // MK Espresso Cart extended sidewalk/paver cafe aprons, Jump Ramps & Landing Ramps
  if (evaluateMkHardscapeApronAt(x, z, 0.45) !== null) return false;
  for (let i = 0; i < MK_BOOST_PADS.length; i++) {
    const p = MK_BOOST_PADS[i];
    if (Math.hypot(x - p.x, z - p.z) < 3.85) return false;
  }
  for (let i = 0; i < JUMP_RAMPS.length; i++) {
    const rp = JUMP_RAMPS[i];
    if (Math.hypot(x - rp.x, z - rp.z) < rp.lengthM * 0.58 + 1.35) return false;
  }
  for (let i = 0; i < LANDING_RAMPS.length; i++) {
    const lr = LANDING_RAMPS[i];
    if (Math.hypot(x - lr.x, z - lr.z) < lr.lengthM * 0.58 + 1.35) return false;
  }

  // Optional caller-supplied exclusions (V5 pavilions, cafe sets, custom plazas)
  if (Array.isArray(options.extraExclusionCircles)) {
    for (let i = 0; i < options.extraExclusionCircles.length; i++) {
      const c = options.extraExclusionCircles[i];
      if (c && Math.hypot(x - c.x, z - c.z) < c.r) return false;
    }
  }
  if (Array.isArray(options.extraExclusionBoxes)) {
    for (let i = 0; i < options.extraExclusionBoxes.length; i++) {
      const bx = options.extraExclusionBoxes[i];
      if (!bx) continue;
      if (bx.minX !== undefined) {
        if (x >= bx.minX && x <= bx.maxX && z >= bx.minZ && z <= bx.maxZ) return false;
      } else {
        const dx = x - (bx.cx ?? 0.0);
        const dz = z - (bx.cz ?? 0.0);
        const yaw = bx.yaw ?? 0.0;
        const cY = Math.cos(-yaw);
        const sY = Math.sin(-yaw);
        const lx = dx * cY - dz * sY;
        const lz = dx * sY + dz * cY;
        if (Math.abs(lx) <= (bx.hx ?? 4.0) && Math.abs(lz) <= (bx.hz ?? 4.0)) return false;
      }
    }
  }
  if (typeof options.customExcludeFn === "function" && options.customExcludeFn(x, z)) {
    return false;
  }

  return true;
}

function isBladeRootAndSwaySafeAt(x, z, options) {
  if (!isCampusGrassAllowedAt(x, z, options)) return false;
  const pad = 0.20;
  return (
    isCampusGrassAllowedAt(x - pad, z, options) &&
    isCampusGrassAllowedAt(x + pad, z, options) &&
    isCampusGrassAllowedAt(x, z - pad, options) &&
    isCampusGrassAllowedAt(x, z + pad, options)
  );
}

// ============================================================================
// 1. 120,000+ GPU-INSTANCED 3-SEGMENT CURVED, TAPERED 3D GRASS BLADE SYSTEM
// ============================================================================

/**
 * Builds a botanical multi-blade fanned & crossed 3-segment curved, tapered 3D grass tuft
 * BufferGeometry (`bladesPerTuft = 4` by default -> 28 vertices, 20 triangles per GPU instance):
 *   - Every blade in the tuft has 3 vertical segments (`s = 0.0, 0.34, 0.68, 1.0`) -> 7 vertices, 5 tris.
 *   - Fuller botanical fescue blade width (`0.038m` base -> `0.027m` -> `0.015m` -> `0.000m` pointed tip).
 *   - 4 crossed/splayed blades arranged around a tight `0.032m` crown with varied azimuths, natural
 *     outward lean, height variation, and parabolic forward arch (`z = arch * s^2`) so lawns read as a
 *     lush, continuous 3D velvet carpet from every grazing or overhead angle (ZERO sparse cactus spikes!).
 */
export function createCurved3SegmentGrassBladeGeometry(THREE, options = {}) {
  const bladesPerTuft = Math.max(1, Math.min(6, Math.floor(options.bladesPerTuft ?? 4)));
  const baseHalfW = (options.bladeBaseWidthM ?? 0.038) * 0.5;
  const bladeH = options.bladeBaseHeightM ?? 0.255;
  const baseArch = options.bladeBaseArchM ?? 0.062;
  const camberZ = 0.0032;

  const stations = [
    { s: 0.0, wFrac: 1.0 },
    { s: 0.34, wFrac: 0.73 },
    { s: 0.68, wFrac: 0.40 },
    { s: 1.0, wFrac: 0.0 },
  ];

  // Deterministic 4-blade fanned botanical crown specs (or single blade if bladesPerTuft === 1)
  const subBladeSpecs =
    bladesPerTuft === 1
      ? [{ az: 0.0, rootR: 0.0, lean: 0.0, hMul: 1.0, wMul: 1.0, archMul: 1.0 }]
      : [
          { az: 0.08, rootR: 0.018, lean: 0.16, hMul: 1.04, wMul: 1.02, archMul: 1.02 },
          { az: 1.58, rootR: 0.030, lean: 0.24, hMul: 0.89, wMul: 0.96, archMul: 0.92 },
          { az: 3.16, rootR: 0.024, lean: 0.20, hMul: 0.96, wMul: 1.00, archMul: 1.10 },
          { az: 4.72, rootR: 0.034, lean: 0.27, hMul: 0.82, wMul: 0.92, archMul: 0.88 },
          { az: 0.84, rootR: 0.028, lean: 0.22, hMul: 0.91, wMul: 0.94, archMul: 0.96 },
          { az: 3.94, rootR: 0.028, lean: 0.22, hMul: 0.86, wMul: 0.94, archMul: 1.04 },
        ].slice(0, bladesPerTuft);

  const pos = [];
  const norm = [];
  const uvs = [];
  const indices = [];

  for (let b = 0; b < subBladeSpecs.length; b++) {
    const sp = subBladeSpecs[b];
    const cosA = Math.cos(sp.az);
    const sinA = Math.sin(sp.az);
    const cosL = Math.cos(sp.lean);
    const sinL = Math.sin(sp.lean);
    const rootOx = sinA * sp.rootR;
    const rootOz = cosA * sp.rootR;
    const subH = bladeH * sp.hMul;
    const subArch = baseArch * sp.archMul;
    const subHalfW = baseHalfW * sp.wMul;
    const baseVert = pos.length / 3;

    // Transform local blade point/normal: pitch outward by `sp.lean` around local X, then rotate `sp.az` around Y
    const pushTransformed = (lx, ly, lz, nx, ny, nz, u, v) => {
      // Lean pitch around X: y' = ly*cosL - lz*sinL, z' = ly*sinL + lz*cosL
      const py = ly * cosL - lz * sinL;
      const pz = ly * sinL + lz * cosL;
      const wx = rootOx + lx * cosA + pz * sinA;
      const wz = rootOz - lx * sinA + pz * cosA;

      const pny = ny * cosL - nz * sinL;
      const pnz = ny * sinL + nz * cosL;
      const wnx = nx * cosA + pnz * sinA;
      const wnz = -nx * sinA + pnz * cosA;
      const nLen = Math.hypot(wnx, pny, wnz) || 1.0;

      pos.push(wx, py, wz);
      norm.push(wnx / nLen, pny / nLen, wnz / nLen);
      uvs.push(u, v);
    };

    for (let i = 0; i < stations.length; i++) {
      const { s, wFrac } = stations[i];
      const y = s * subH;
      const zCenter = subArch * s * s;
      const tY = subH;
      const tZ = 2.0 * subArch * s;
      const tLen = Math.hypot(tY, tZ) || 1.0;
      const faceNy = tZ / tLen;
      const faceNz = -tY / tLen;

      if (i < 3) {
        const hw = subHalfW * wFrac;
        pushTransformed(-hw, y, zCenter + camberZ * wFrac, -0.28, faceNy, faceNz, 0.0, s);
        pushTransformed(hw, y, zCenter + camberZ * wFrac, 0.28, faceNy, faceNz, 1.0, s);
      } else {
        pushTransformed(0.0, y, zCenter, 0.0, faceNy, faceNz, 0.5, 1.0);
      }
    }

    indices.push(
      baseVert + 0, baseVert + 2, baseVert + 1,
      baseVert + 1, baseVert + 2, baseVert + 3,
      baseVert + 2, baseVert + 4, baseVert + 3,
      baseVert + 3, baseVert + 4, baseVert + 5,
      baseVert + 4, baseVert + 6, baseVert + 5
    );
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute("normal", new THREE.Float32BufferAttribute(norm, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeBoundingSphere();
  geom.userData = {
    bladesPerTuft: subBladeSpecs.length,
    segmentsPerBlade: 3,
    verticesPerTuft: pos.length / 3,
    trianglesPerTuft: indices.length / 3,
  };
  return geom;
}

/**
 * Creates the 156,000-tuft (624,000 curved 3-segment 3D grass blades!) GPU-instanced lawn system
 * with ultra-dense foreground & hero-ring stratification, strict road/paver exclusion, 4096 shadow
 * reception, mowed lawn stripes, golden-hour backlit subsurface scattering, and deterministic
 * `update(timeSec, opts)` wind-ripple waves.
 */
export function createAAAInstancedGrassSystem(THREE, options = {}) {
  const targetBladeCount = Math.max(
    120000,
    Math.floor(options.bladeCount ?? OMNI_V5_ENVIRONMENT_TELEMETRY.defaultTuftCount)
  );
  const seed = (options.seed ?? 0x57a4cb55) >>> 0;
  const rng = createMulberry32(seed);
  const terrainHeightFn =
    typeof options.getGroundHeight === "function"
      ? options.getGroundHeight
      : getOpenWorldEarthHeight;

  const bladeGeom = createCurved3SegmentGrassBladeGeometry(THREE, options);
  const bladesPerTuft = bladeGeom.userData?.bladesPerTuft ?? 4;

  // Stratified sampling budget across hero rings + Shot 05/06/08 foreground approach lawns:
  //   1. Stan Courtyard Hero Island (-118, -50, R in [4.46, 13.26m]): 22% (~137k 3D blades!)
  //   2. Stan Courtyard South/S-Turn Foreground Verge (x in [-148, -88], z in [-44, -22.1]): 20% (~125k 3D blades!)
  //   3. Stan Courtyard Outer Garden Ring (-118, -50, R in [19.26, 38.0m]): 12% (~75k 3D blades!)
  //   4. Android Sculpture Lawn (-118, 96, R in [9.95, 31.8m]): 16% (~100k 3D blades!)
  //   5. Gym / Gradient Canopy Exterior & Pinwheel Spine: 13% (~81k 3D blades!)
  //   6. Bay View Plaza & Waterfront Lawn: 10% (~62k 3D blades!)
  //   7. Campus-Wide Foothill, Creek & Shoreline Lawns: 7% (~44k 3D blades!)
  const q1 = Math.round(targetBladeCount * 0.22);
  const q2 = Math.round(targetBladeCount * 0.20);
  const q3 = Math.round(targetBladeCount * 0.12);
  const q4 = Math.round(targetBladeCount * 0.16);
  const q5 = Math.round(targetBladeCount * 0.13);
  const q6 = Math.round(targetBladeCount * 0.10);
  const q7 = Math.max(0, targetBladeCount - q1 - q2 - q3 - q4 - q5 - q6);

  const zones = [
    {
      id: "stan_courtyard_island",
      quota: q1,
      sample: () => {
        const u = rng();
        const r = Math.sqrt(4.68 * 4.68 + u * (13.02 * 13.02 - 4.68 * 4.68));
        const th = rng() * Math.PI * 2.0;
        return [-118.0 + Math.cos(th) * r, -50.0 + Math.sin(th) * r, 1.08];
      },
    },
    {
      id: "stan_courtyard_south_foreground",
      quota: q2,
      sample: () => {
        const x = -148.0 + rng() * 60.0;
        const z = -44.0 + rng() * 22.0;
        return [x, z, 1.05];
      },
    },
    {
      id: "stan_courtyard_outer_apron",
      quota: q3,
      sample: () => {
        const u = rng();
        const r = Math.sqrt(20.08 * 20.08 + u * (38.0 * 38.0 - 20.08 * 20.08));
        const th = rng() * Math.PI * 2.0;
        return [-118.0 + Math.cos(th) * r, -50.0 + Math.sin(th) * r, 1.02];
      },
    },
    {
      id: "android_lawn_ring",
      quota: q4,
      sample: () => {
        const u = rng();
        const r = Math.sqrt(9.95 * 9.95 + u * (31.8 * 31.8 - 9.95 * 9.95));
        const th = rng() * Math.PI * 2.0;
        return [-118.0 + Math.cos(th) * r, 96.0 + Math.sin(th) * r, 1.0];
      },
    },
    {
      id: "gym_gradient_exterior_lawn",
      quota: q5,
      sample: () => {
        const x = -54.0 + rng() * 108.0;
        const z = 80.0 + rng() * 54.0;
        return [x, z, 0.98];
      },
    },
    {
      id: "bay_view_plaza_lawn",
      quota: q6,
      sample: () => {
        const x = 96.0 + rng() * 51.0;
        const z = -64.0 + rng() * 134.0;
        return [x, z, 1.0];
      },
    },
    {
      id: "campus_meadow_and_shoreline_fill",
      quota: q7,
      sample: () => {
        const x = -196.0 + rng() * 360.0;
        const z = -214.0 + rng() * 340.0;
        return [x, z, 0.96];
      },
    },
  ];

  const bladeStyleArray = new Float32Array(targetBladeCount * 4);
  const zoneCounts = {};
  const dummyMat = new THREE.Matrix4();
  const posVec = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, "YXZ");
  const scaleVec = new THREE.Vector3();

  const initMaxDrawRadius = Math.min(options.maxDrawRadiusM ?? 82.0, 84.0);
  const uniforms = {
    uTime: { value: 0.0 },
    uWindStrength: { value: options.windStrength ?? 1.0 },
    uHeroPos: { value: new THREE.Vector3(0.0, 0.0, 140.2) },
    uFocusXZ: { value: new THREE.Vector2(-118.0, -50.0) },
    uMaxDrawRadius: { value: initMaxDrawRadius },
    uThinStartM: { value: options.thinStartM ?? 28.0 },
    uThinEndM: { value: options.thinEndM ?? 75.0 },
    uThinMinKeep: { value: options.thinMinKeep ?? 0.22 },
    uThinWidthBoost: { value: options.thinWidthBoost ?? 1.45 },
    uStanShockwave: { value: new THREE.Vector4(-118.0, -50.0, 0.0, 0.0) },
    uRootColor: { value: new THREE.Color(options.rootColorHex || "#1b3114") },
    uMidOliveColor: { value: new THREE.Color(options.midColorHex || "#3e5523") },
    uSunlitTipColor: { value: new THREE.Color(options.tipColorHex || "#787129") },
    uDryGoldTipColor: { value: new THREE.Color(options.dryGoldTipHex || "#9e8f42") },
    uBacklightTint: { value: new THREE.Color(options.backlightColorHex || "#a49c3e") },
    uBacklightStrength: { value: options.backlightStrength ?? 0.54 },
  };

  const material = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness: options.roughness ?? 0.78,
    metalness: 0.0,
    side: THREE.DoubleSide,
    envMapIntensity: 0.16,
  });

  material.customProgramCacheKey = () => "v7_aaa_instanced_grass_gpu_thin_28_75m_v1";
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        /* glsl */ `
        #include <common>
        attribute vec4 aBladeStyle;
        uniform float uTime;
        uniform float uWindStrength;
        uniform vec3 uHeroPos;
        uniform vec2 uFocusXZ;
        uniform float uMaxDrawRadius;
        uniform float uThinStartM;
        uniform float uThinEndM;
        uniform float uThinMinKeep;
        uniform float uThinWidthBoost;
        uniform vec4 uStanShockwave;
        varying float vBladeFrac;
        varying float vMowStripe;
        varying float vToneJitter;
        varying vec2 vWorldRootXZ;
        varying vec2 vGrassPatch;
        varying vec3 vUpView;
        `
      )
      .replace(
        "#include <beginnormal_vertex>",
        /* glsl */ `
        #include <beginnormal_vertex>
        vUpView = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz + vec3(0.0, 0.0, 1e-6));
        `
      )
      .replace(
        "#include <begin_vertex>",
        /* glsl */ `
        #include <begin_vertex>
        vBladeFrac = clamp(uv.y, 0.0, 1.0);
        vToneJitter = aBladeStyle.z;
        vMowStripe = aBladeStyle.w;
        vWorldRootXZ = vec2(0.0);
        vGrassPatch = vec2(0.25, 0.95);

        #ifdef USE_INSTANCING
          vec3 bladeRootWorld = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          vWorldRootXZ = bladeRootWorld.xz;

          // V7 Section 1C: Deterministic hash-based GPU vertex-shader distance thinning
          // - 0.0m .. 28.0m: 100% curved 3D grass blades retained (keepProb = 1.0, width = 1.0x)
          // - 28.0m .. 75.0m: keepProb decays smoothly 1.0 -> 0.22; surviving blades widen 1.0x -> 1.45x
          // - Rejected blades collapse transformed = vec3(0.0) in vertex stage -> 0 area -> 0 fragment cost!
          float distCam = length(bladeRootWorld.xz - cameraPosition.xz);
          float thinT = smoothstep(uThinStartM, uThinEndM, distCam);
          float keepProb = mix(1.0, uThinMinKeep, thinT);
          float instHash = fract(
            sin(dot(bladeRootWorld.xz, vec2(127.1, 311.7)) + aBladeStyle.y * 17.13 + aBladeStyle.z * 43.7) *
            43758.5453123
          );
          float farFadeEnd = max(uThinEndM + 4.5, uMaxDrawRadius);
          float lodFade = 1.0 - smoothstep(uThinEndM, farFadeEnd, distCam);

          if (instHash >= keepProb || lodFade <= 0.005) {
            transformed = vec3(0.0);
          } else {
            float vMacroMoistureA = 0.5 + 0.5 * sin(bladeRootWorld.x * 0.085 + bladeRootWorld.z * 0.072 + 0.9);
            float vMacroMoistureB = 0.5 + 0.5 * cos(bladeRootWorld.x * 0.215 - bladeRootWorld.z * 0.178 - 1.4);
            vGrassPatch = vec2(
              smoothstep(0.32, 0.82, vMacroMoistureA * 0.62 + vMacroMoistureB * 0.38),
              0.86 + 0.22 * sin(bladeRootWorld.x * 0.045 - bladeRootWorld.z * 0.052 + 2.1)
            );

            // Smooth entry taper across thinning threshold margin so zero blades pop during forward riding
            float entrySoft = mix(
              1.0,
              clamp((keepProb - instHash) / 0.055, 0.15, 1.0),
              smoothstep(uThinStartM, uThinStartM + 2.8, distCam)
            );
            // Compensating blade width scale (1.0x -> 1.45x on surviving 28m..75m blades)
            transformed.x *= mix(1.0, uThinWidthBoost, thinT);

            float bendCurve = vBladeFrac * vBladeFrac;
            float phase = aBladeStyle.y;
            float archMult = aBladeStyle.x;

            // Extra natural botanical forward arch per blade
            transformed.z += archMult * 0.036 * bendCurve;
            transformed.y *= (lodFade * entrySoft);

            // Deterministic multi-wave travelling golden-hour breeze across campus lawns
            float wPrimary = sin(bladeRootWorld.x * 0.19 + bladeRootWorld.z * 0.13 + uTime * 2.05 + phase * 1.4);
            float wRipple = cos(bladeRootWorld.x * 0.44 - bladeRootWorld.z * 0.37 - uTime * 3.15 + phase * 6.2831853);
            float gustEnv = 0.62 + 0.38 * sin(bladeRootWorld.x * 0.055 - bladeRootWorld.z * 0.048 + uTime * 0.85);
            vec2 windWorldXZ = vec2(
              (wPrimary * 0.068 + wRipple * 0.026) * gustEnv,
              (wPrimary * 0.044 - wRipple * 0.022) * gustEnv
            ) * uWindStrength;

            // Interactive G-Bike & Pelican wake push within 1.15m
            vec2 awayHero = bladeRootWorld.xz - uHeroPos.xz;
            float dHero = length(awayHero);
            if (dHero < 1.15 && dHero > 0.001) {
              float wake = pow(max(1.0 - dHero / 1.15, 1e-4), 1.65);
              windWorldXZ += (awayHero / max(dHero, 1e-4)) * (0.20 * wake);
              transformed.y -= 0.075 * wake * bendCurve;
            }

            // Optional Stan T-Rex roar shockwave ring ripple
            if (uStanShockwave.w > 0.001) {
              vec2 awayStan = bladeRootWorld.xz - uStanShockwave.xy;
              float dStan = length(awayStan);
              float ringDelta = abs(dStan - uStanShockwave.z);
              if (ringDelta < 4.5 && dStan > 0.01) {
                float shock = (1.0 - ringDelta / 4.5) * uStanShockwave.w;
                windWorldXZ += (awayStan / max(dStan, 1e-4)) * (0.18 * shock);
              }
            }

            // Project world XZ wind displacement into local blade axes via inverse instance basis
            vec3 colX = instanceMatrix[0].xyz;
            vec3 colZ = instanceMatrix[2].xyz;
            float invScaleX2 = 1.0 / max(dot(colX, colX), 1e-5);
            float invScaleZ2 = 1.0 / max(dot(colZ, colZ), 1e-5);
            float localPushX = dot(vec3(windWorldXZ.x, 0.0, windWorldXZ.y), colX) * invScaleX2;
            float localPushZ = dot(vec3(windWorldXZ.x, 0.0, windWorldXZ.y), colZ) * invScaleZ2;

            transformed.x += localPushX * bendCurve;
            transformed.z += localPushZ * bendCurve;
            transformed.y -= min(0.045, length(windWorldXZ) * 0.24) * bendCurve;
          }
        #endif
        `
      )
      .replace(
        "#include <shadowmap_vertex>",
        /* glsl */ `
        // Force upward world normal for shadowNormalBias so thin curved blades never self-acne or offset underground
        #if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_SUN_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
          vec3 grassSavedTransformedNormal = transformedNormal;
          transformedNormal = vUpView;
        #endif
        #include <shadowmap_vertex>
        #if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_SUN_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
          transformedNormal = grassSavedTransformedNormal;
        #endif
        `
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        /* glsl */ `
        #include <common>
        uniform vec3 uRootColor;
        uniform vec3 uMidOliveColor;
        uniform vec3 uSunlitTipColor;
        uniform vec3 uDryGoldTipColor;
        uniform vec3 uBacklightTint;
        uniform float uBacklightStrength;
        varying float vBladeFrac;
        varying float vMowStripe;
        varying float vToneJitter;
        varying vec2 vWorldRootXZ;
        varying vec2 vGrassPatch;
        varying vec3 vUpView;
        `
      )
      .replace(
        "#include <color_fragment>",
        /* glsl */ `
        #include <color_fragment>
        // Natural California campus lawn macro-patches: deep olive-emerald roots + dappled cloud/canopy moisture
        // zones + sun-cured golden-dry tips (#9e8f42) — zero uniform neon-green plastic turf!
        float macroDryPatch = vGrassPatch.x;
        float dappledCanopy = vGrassPatch.y;

        float stripeShift = (vMowStripe - 0.5) * 0.14;
        vec3 lushRoot = mix(uRootColor, vec3(0.14, 0.22, 0.09), macroDryPatch * 0.28);
        vec3 midBase = mix(uMidOliveColor, vec3(0.35, 0.42, 0.18), macroDryPatch * 0.42);
        vec3 midTone = midBase * (1.0 + stripeShift + (vToneJitter - 0.5) * 0.15) * dappledCanopy;
        vec3 tipBase = mix(uSunlitTipColor, uDryGoldTipColor, clamp(macroDryPatch * 0.68 + vToneJitter * 0.32, 0.0, 1.0));
        vec3 tipTone = tipBase * (1.0 + stripeShift * 0.75 + (vToneJitter - 0.5) * 0.18) * dappledCanopy;
        vec3 bladeGrad = mix(lushRoot, midTone, smoothstep(0.0, 0.46, vBladeFrac));
        bladeGrad = mix(bladeGrad, tipTone, smoothstep(0.38, 1.0, vBladeFrac));
        diffuseColor.rgb *= bladeGrad;
        `
      )
      .replace(
        "#include <normal_fragment_maps>",
        /* glsl */ `
        #include <normal_fragment_maps>
        // Blend true DoubleSide face normal toward world +Y so turf reads as lush velvet at root and crisp 3D blades at tips
        normal = normalize(mix(normal, normalize(vUpView + vec3(0.0, 0.0, 1e-6)), mix(0.72, 0.36, vBladeFrac)) + vec3(0.0, 0.0, 1e-6));
        `
      )
      .replace(
        "#include <lights_fragment_end>",
        /* glsl */ `
        #include <lights_fragment_end>
        // Deep root-to-tip ambient occlusion grounding blades into soil while preserving real 4096 cast-shadow contrast
        float rootAO = mix(0.28, 1.0, smoothstep(0.0, 0.58, vBladeFrac));
        reflectedLight.indirectDiffuse *= rootAO;
        reflectedLight.indirectSpecular *= rootAO * 0.22;
        reflectedLight.directDiffuse *= mix(0.46, 1.06, smoothstep(0.0, 0.65, vBladeFrac));
        reflectedLight.directSpecular *= vBladeFrac * 0.16;

        // Golden-hour backlit subsurface scattering strictly gated by shadowed directDiffuse (0 glow inside cast shadows!)
        #if ( NUM_DIR_LIGHTS > 0 )
          vec3 sunViewDir = normalize(directionalLights[0].direction + vec3(0.0, 0.0, 1e-6));
          float backDot = max(dot(geometryViewDir, -sunViewDir), 1e-5);
          float sss = (backDot * backDot * sqrt(backDot)) * smoothstep(0.16, 1.0, vBladeFrac);
          float wrapSun = (0.28 + 0.72 * vBladeFrac) * uBacklightStrength * (0.32 + 0.90 * sss);
          reflectedLight.directDiffuse += reflectedLight.directDiffuse * uBacklightTint * wrapSun;
        #endif
        `
      );
  };

  const tuftRecords = [];
  let placed = 0;
  let rejectedByExclusion = 0;

  for (let zIdx = 0; zIdx < zones.length; zIdx++) {
    const zSpec = zones[zIdx];
    const targetForZone =
      zIdx === zones.length - 1 ? targetBladeCount - placed : Math.min(zSpec.quota, targetBladeCount - placed);
    let countInZone = 0;
    let attempts = 0;
    const maxAttempts = Math.max(targetForZone * 28, 50000);

    while (countInZone < targetForZone && attempts < maxAttempts && placed < targetBladeCount) {
      attempts++;
      const [wx, wz, zoneHMult] = zSpec.sample();
      if (!isBladeRootAndSwaySafeAt(wx, wz, options)) {
        rejectedByExclusion++;
        continue;
      }

      const groundY = terrainHeightFn(wx, wz);
      const yaw = rng() * Math.PI * 2.0;
      const patchWave = 0.5 + 0.5 * Math.sin(wx * 0.11 + wz * 0.09);
      const hScale = (0.76 + rng() * 0.62) * zoneHMult * (0.90 + 0.18 * patchWave);
      const wScale = 0.88 + rng() * 0.42;

      // Manicured diagonal mowed lawn stripes (~2.65m mower pass width)
      const stripeCoord = (wx * 0.82 + wz * 0.57) / 2.65;
      const mowStripe = 0.5 + 0.5 * Math.sin(stripeCoord * Math.PI);

      posVec.set(wx, groundY - 0.008, wz);
      euler.set((rng() - 0.5) * 0.12, yaw, (rng() - 0.5) * 0.10);
      quat.setFromEuler(euler);
      scaleVec.set(wScale, hScale, wScale);
      dummyMat.compose(posVec, quat, scaleVec);

      const mElems = new Float32Array(16);
      dummyMat.toArray(mElems, 0);
      tuftRecords.push({
        wx,
        wy: groundY - 0.008,
        wz,
        mElems,
        s0: 0.55 + rng() * 0.95, // archCurvature
        s1: rng(),               // windPhase
        s2: rng(),               // toneJitter
        s3: mowStripe,           // mowStripe
      });

      placed++;
      countInZone++;
    }
    zoneCounts[zSpec.id] = countInZone;
  }

  // Fallback fill on Stan Lawn Island if extreme custom exclusions left tiny remainder
  while (placed < targetBladeCount) {
    const u = rng();
    const r = Math.sqrt(5.2 * 5.2 + u * (12.6 * 12.6 - 5.2 * 5.2));
    const th = rng() * Math.PI * 2.0;
    const wx = -118.0 + Math.cos(th) * r;
    const wz = -1.0 * 50.0 + Math.sin(th) * r;
    const groundY = terrainHeightFn(wx, wz);
    posVec.set(wx, groundY - 0.008, wz);
    euler.set(0, rng() * Math.PI * 2.0, 0);
    quat.setFromEuler(euler);
    scaleVec.set(1.0, 0.9 + rng() * 0.4, 1.0);
    dummyMat.compose(posVec, quat, scaleVec);
    const mElems = new Float32Array(16);
    dummyMat.toArray(mElems, 0);
    tuftRecords.push({
      wx,
      wy: groundY - 0.008,
      wz,
      mElems,
      s0: 0.85,
      s1: rng(),
      s2: rng(),
      s3: 0.5 + 0.5 * Math.sin(((wx * 0.82 + wz * 0.57) / 2.65) * Math.PI),
    });
    placed++;
  }

  // Partition all 156,000 tufts (624,000 curved 3D blades) into 14m x 14m spatial frustum-culled tiles
  const TILE_SIZE_M = 14.0;
  const tileBuckets = new Map();
  for (let i = 0; i < tuftRecords.length; i++) {
    const rec = tuftRecords[i];
    const tx = Math.floor(rec.wx / TILE_SIZE_M);
    const tz = Math.floor(rec.wz / TILE_SIZE_M);
    const key = `${tx}_${tz}`;
    let bucket = tileBuckets.get(key);
    if (!bucket) {
      bucket = [];
      tileBuckets.set(key, bucket);
    }
    bucket.push(rec);
  }

  const grassGroup = new THREE.Group();
  grassGroup.name = "V5_AAA_Instanced_Grass_132k";
  grassGroup.count = placed;
  grassGroup.userData.isV5GrassRoot = true;

  const syncFocusFromCamera = (camera) => {
    if (camera && camera.matrixWorld) {
      const e = camera.matrixWorld.elements;
      if (Number.isFinite(e[12]) && Number.isFinite(e[14])) {
        const fx = -e[8];
        const fz = -e[10];
        const hLen = Math.hypot(fx, fz);
        const lead = hLen > 1e-4 ? 22.0 : 0.0;
        uniforms.uFocusXZ.value.set(
          e[12] + (hLen > 1e-4 ? (fx / hLen) * lead : 0.0),
          e[14] + (hLen > 1e-4 ? (fz / hLen) * lead : 0.0)
        );
      }
    }
  };

  const tileEntries = [];
  for (const [key, list] of tileBuckets.entries()) {
    const n = list.length;
    const tGeom = new THREE.BufferGeometry();
    tGeom.setIndex(bladeGeom.getIndex());
    for (const attrName of Object.keys(bladeGeom.attributes)) {
      if (attrName === "aBladeStyle") continue;
      tGeom.setAttribute(attrName, bladeGeom.attributes[attrName]);
    }
    const tStyle = new Float32Array(n * 4);
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    const tMesh = new THREE.InstancedMesh(tGeom, material, n);
    tMesh.name = `V5_Grass_Tile_${key}`;
    tMesh.castShadow = false;
    tMesh.receiveShadow = true;
    tMesh.frustumCulled = true;
    tMesh.count = n;
    tMesh.userData.isV5GrassTile = true;

    for (let j = 0; j < n; j++) {
      const rec = list[j];
      tMesh.instanceMatrix.array.set(rec.mElems, j * 16);
      const j4 = j * 4;
      tStyle[j4] = rec.s0;
      tStyle[j4 + 1] = rec.s1;
      tStyle[j4 + 2] = rec.s2;
      tStyle[j4 + 3] = rec.s3;
      if (rec.wx < minX) minX = rec.wx;
      if (rec.wx > maxX) maxX = rec.wx;
      if (rec.wy < minY) minY = rec.wy;
      if (rec.wy + 0.25 > maxY) maxY = rec.wy + 0.25;
      if (rec.wz < minZ) minZ = rec.wz;
      if (rec.wz > maxZ) maxZ = rec.wz;
    }

    tGeom.setAttribute("aBladeStyle", new THREE.InstancedBufferAttribute(tStyle, 4));
    tMesh.instanceMatrix.needsUpdate = true;

    const cx = 0.5 * (minX + maxX);
    const cy = 0.5 * (minY + maxY);
    const cz = 0.5 * (minZ + maxZ);
    const rad = Math.hypot(maxX - cx, maxY - cy, maxZ - cz) + 0.55;
    const sphere = new THREE.Sphere(new THREE.Vector3(cx, cy, cz), rad);
    tGeom.boundingSphere = sphere;
    tMesh.boundingSphere = sphere.clone();
    tMesh.onBeforeRender = (_renderer, _scene, camera) => {
      syncFocusFromCamera(camera);
    };

    grassGroup.add(tMesh);
    tileEntries.push({ mesh: tMesh, geom: tGeom, cx, cy, cz, rad, fullCount: n });
  }

  const baseMaxDrawRadius = Math.min(options.maxDrawRadiusM ?? 82.0, 84.0);
  const baseThinMinKeep = options.thinMinKeep ?? 0.22;
  const baseThinWidthBoost = options.thinWidthBoost ?? 1.45;
  function cullForCamera(camera, isFast1080pSoftware = false) {
    if (!camera || !grassGroup.visible) return;
    syncFocusFromCamera(camera);
    // V7 Section 1C: GPU vertex-shader handles smooth 28m..75m thinning (keepProb 1.0 -> 0.22 + 1.45x width)
    // with ZERO per-frame CPU `mesh.count` churn on hardware GPU; on 1080p CPU SwiftShader (`isFast1080pSoftware`),
    // trim `te.mesh.count` directly (prefix of uniform RNG scatter = zero buffer upload) to skip wasted degenerate CPU vertices!
    const maxCamDist = isFast1080pSoftware ? 36.0 : baseMaxDrawRadius;
    uniforms.uThinStartM.value = isFast1080pSoftware ? 0.0 : (options.thinStartM ?? 28.0);
    uniforms.uThinEndM.value = isFast1080pSoftware ? 28.0 : (options.thinEndM ?? 75.0);
    uniforms.uThinMinKeep.value = isFast1080pSoftware ? 1.0 : baseThinMinKeep;
    uniforms.uThinWidthBoost.value = isFast1080pSoftware ? 1.92 : baseThinWidthBoost;
    uniforms.uMaxDrawRadius.value = maxCamDist;
    const camX = camera.position.x;
    const camY = camera.position.y;
    const camZ = camera.position.z;
    const e = camera.matrixWorld.elements;
    const fx = -e[8];
    const fy = -e[9];
    const fz = -e[10];
    const fLen = Math.hypot(fx, fz);
    const dirX = fLen > 1e-4 ? fx / fLen : 0.0;
    const dirZ = fLen > 1e-4 ? fz / fLen : -1.0;
    // Closed-form half-FOV cosine cone pad (generous +18 deg margin; Three.js frustumCulled handles exact clip planes)
    const halfFovRad = ((camera.fov || 40) * Math.PI) / 360.0;
    const aspect = camera.aspect || 16 / 9;
    const halfDiagRad = Math.min(Math.PI * 0.49, Math.atan(Math.tan(halfFovRad) * Math.hypot(1.0, aspect)) + 0.22);
    const cosLimit = Math.cos(halfDiagRad);
    const isTopDown = fy < -0.72 && camY > 16.0;
    const effMaxDist = isTopDown
      ? Math.min(maxCamDist, camY * Math.tan(halfDiagRad) + 8.0)
      : maxCamDist;

    for (let i = 0, len = tileEntries.length; i < len; i++) {
      const te = tileEntries[i];
      const dx = te.cx - camX;
      const dz = te.cz - camZ;
      const dist = Math.hypot(dx, dz);
      if (dist - te.rad > effMaxDist) {
        te.mesh.visible = false;
        continue;
      }
      if (!isTopDown && dist > te.rad + 1.5) {
        const cosAng = (dx * dirX + dz * dirZ) / dist;
        const angSlack = te.rad / dist;
        if (cosAng + angSlack < cosLimit) {
          te.mesh.visible = false;
          continue;
        }
      }
      if (isFast1080pSoftware) {
        const nearEdge = Math.max(0.0, dist - te.rad * 0.5);
        const tKeep = Math.min(1.0, Math.max(0.0, (nearEdge - 6.0) / 26.0));
        const sKeep = tKeep * tKeep * (3.0 - 2.0 * tKeep);
        const frac = 0.28 * (1.0 - 0.78 * sKeep);
        te.mesh.count = Math.max(1, Math.round(te.fullCount * frac));
      } else if (te.mesh.count !== te.fullCount) {
        te.mesh.count = te.fullCount;
      }
      te.mesh.visible = true;
    }
  }

  function update(timeSec = 0.0, stateOpts = null) {
    const safeT = Number.isFinite(timeSec) ? timeSec : 0.0;
    uniforms.uTime.value = safeT;
    if (!stateOpts) return;
    if (stateOpts.heroPos) {
      const hx = stateOpts.heroPos.x ?? 0.0;
      const hy = stateOpts.heroPos.y ?? stateOpts.heroPos.centerY ?? 0.0;
      const hz = stateOpts.heroPos.z ?? 0.0;
      uniforms.uHeroPos.value.set(hx, hy, hz);
    }
    if (stateOpts.focusXZ) {
      uniforms.uFocusXZ.value.set(stateOpts.focusXZ.x ?? 0.0, stateOpts.focusXZ.z ?? stateOpts.focusXZ.y ?? 0.0);
    }
    if (stateOpts.stanShockwave) {
      const sw = stateOpts.stanShockwave;
      uniforms.uStanShockwave.value.set(
        sw.x ?? -118.0,
        sw.z ?? -50.0,
        sw.radiusM ?? 0.0,
        sw.intensity ?? 0.0
      );
    } else if (Number.isFinite(stateOpts.stanRoarIntensity)) {
      uniforms.uStanShockwave.value.set(
        -118.0,
        -50.0,
        stateOpts.stanRoarRadiusM ?? 14.0,
        stateOpts.stanRoarIntensity
      );
    }
    if (typeof stateOpts.visible === "boolean") {
      grassGroup.visible = stateOpts.visible;
    }
  }

  function syncFromSnapshot(snap, elapsedSec = 0.0, camera = null) {
    uniforms.uTime.value = Number.isFinite(elapsedSec) ? elapsedSec : 0.0;
    if (snap) {
      const hx = snap.x ?? 0.0;
      const hy = snap.centerY ?? snap.y ?? 0.0;
      const hz = snap.z ?? 0.0;
      uniforms.uHeroPos.value.set(hx, hy, hz);
      uniforms.uFocusXZ.value.set(hx, hz);
    }
    if (camera && camera.matrixWorld) {
      syncFocusFromCamera(camera);
    }
  }

  function dispose() {
    for (let i = 0; i < tileEntries.length; i++) {
      tileEntries[i].geom.dispose();
    }
    bladeGeom.dispose();
    material.dispose();
  }

  return {
    instancedMesh: grassGroup,
    mesh: grassGroup,
    group: grassGroup,
    tiles: tileEntries,
    geometry: bladeGeom,
    bladeCount: placed,
    tuftCount: placed,
    bladesPerTuft,
    renderedBladeCount: placed * bladesPerTuft,
    zoneCounts,
    rejectedByExclusion,
    material,
    uniforms,
    isPointValidLawn: (x, z) => isCampusGrassAllowedAt(x, z, options),
    cullForCamera,
    update,
    syncFromSnapshot,
    dispose,
  };
}

export const createV5GrassField = createAAAInstancedGrassSystem;

// ============================================================================
// 2. 1024x1024 PBR ASPHALT, BEVELED SIERRA GRANITE CURBS (1.8M JOINTS) & PAVERS
// ============================================================================

function buildV5Asphalt1024PbrSet(THREE, seed = 0xa5fa1705) {
  const w = 1024;
  const h = 1024;
  const rng = createMulberry32(seed);
  const macroGrid = buildNoiseGrid(64, seed ^ 0x1101);
  const mesoGrid = buildNoiseGrid(256, seed ^ 0x2202);
  const gritGrid = buildNoiseGrid(512, seed ^ 0x3303);
  const gritGrid2 = buildNoiseGrid(512, seed ^ 0x4404);

  const albRgba = new Uint8Array(w * h * 4);
  const heightBuf = new Uint8Array(w * h);
  const roughBuf = new Uint8Array(w * h);

  // Dual vehicle lane worn tire-track bands (u = 0.21, 0.35, 0.65, 0.79) vs coarser shoulder aggregate
  const tirePolishU = new Float32Array(w);
  const shoulderRoughU = new Float32Array(w);
  const trackCenters = [0.205, 0.345, 0.655, 0.795];
  for (let x = 0; x < w; x++) {
    const u = x / w;
    let pSum = 0.0;
    for (let k = 0; k < trackCenters.length; k++) {
      const du = (u - trackCenters[k]) / 0.048;
      pSum += Math.exp(-du * du);
    }
    tirePolishU[x] = Math.min(1.0, pSum);
    // Outer shoulders (u < 0.15 or u > 0.85) carry coarser road-edge basalt/quartz aggregate
    const edgeDist = Math.min(u, 1.0 - u);
    shoulderRoughU[x] = edgeDist < 0.15 ? 1.0 - edgeDist / 0.15 : 0.0;
  }

  // Wave 2 VETO-3D-05 Calibration: True neutral-cool dark slate-charcoal #3E4044 = sRGB (62, 64, 68)
  // with matte asphalt micro-roughness (0.865..0.95) & envMapIntensity <= 0.22 so forward-grazing
  // 19.8-deg golden sun NEVER washes roads out into sandy tan!
  for (let y = 0; y < h; y++) {
    const v = y / h;
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const macro = sampleTileNoise(macroGrid, 64, u * 8.0, v * 8.0);
      const meso = sampleTileNoise(mesoGrid, 256, u * 44.0, v * 44.0);
      const g1 = gritGrid[((y & 511) << 9) + (x & 511)];
      const g2 = gritGrid2[(((y * 3 + 29) & 511) << 9) + ((x * 3 + 53) & 511)];

      const polish = tirePolishU[x] * (0.78 + 0.22 * macro);
      const shoulder = shoulderRoughU[x];

      // Salt-and-pepper crushed basalt & grey quartz aggregate chips (strictly neutral-cool R <= G <= B)
      const stoneChip =
        g1 > 0.915 ? (g1 - 0.915) * 185.0 : g1 < 0.12 ? -8.0 : 0.0;
      const fineSpeck = (g2 - 0.5) * 12.0 + (meso - 0.5) * 8.0 + (macro - 0.5) * 6.5;
      const shoulderLift = shoulder * 3.2;
      const polishDark = polish * 5.8;

      const r = 62.0 - polishDark + shoulderLift + fineSpeck + stoneChip * 1.02;
      const g = 64.0 - polishDark + shoulderLift * 1.02 + fineSpeck * 1.02 + stoneChip * 1.04;
      const b = 68.0 - polishDark * 0.96 + shoulderLift * 1.04 + fineSpeck * 1.05 + stoneChip * 1.08;

      const idx = row + x;
      const p = idx * 4;
      albRgba[p] = clamp(Math.round(r), 26, 122);
      albRgba[p + 1] = clamp(Math.round(g), 28, 126);
      albRgba[p + 2] = clamp(Math.round(b), 31, 132);
      albRgba[p + 3] = 255;

      const hRelief =
        128.0 +
        ((g2 - 0.5) * 76.0 + (g1 - 0.5) * 52.0 + (meso - 0.5) * 26.0) *
          (1.0 - polish * 0.30 + shoulder * 0.22);
      heightBuf[idx] = clamp(Math.round(hRelief), 10, 248);

      // Matte diffuse asphalt micro-roughness: 0.865 in tire tracks vs 0.948 on unpolished shoulder aggregate
      const roughFloat =
        0.918 -
        polish * 0.052 +
        shoulder * 0.028 +
        (macro - 0.5) * 0.024 +
        (meso - 0.5) * 0.020 -
        (g1 > 0.92 ? 0.018 : 0.0);
      roughBuf[idx] = Math.round(clamp(roughFloat, 0.86, 0.955) * 255.0);
    }
  }

  // Carve deterministic hairline tar-sealed micro-cracks seamlessly across 1024x1024 tile boundaries
  for (let c = 0; c < 14; c++) {
    let cx = (0.07 + rng() * 0.86) * w;
    let cy = rng() * h;
    let ang = Math.PI * 0.5 + (rng() - 0.5) * 0.68;
    const segs = 9 + Math.floor(rng() * 7);
    for (let s = 0; s < segs; s++) {
      ang += (rng() - 0.5) * 0.62;
      const stepLen = 12.0 + rng() * 19.0;
      const nx = cx + Math.cos(ang) * stepLen;
      const ny = cy + Math.sin(ang) * stepLen;
      const subSteps = Math.max(8, Math.ceil(stepLen * 1.5));
      for (let t = 0; t <= subSteps; t++) {
        const uStep = t / subSteps;
        const px = Math.floor(cx + (nx - cx) * uStep) & (w - 1);
        const py = Math.floor(cy + (ny - cy) * uStep) & (h - 1);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const qx = (px + dx) & (w - 1);
            const qy = (py + dy) & (h - 1);
            const qIdx = qy * w + qx;
            const qp = qIdx * 4;
            const core = dx === 0 && dy === 0;
            const tarDark = core ? 0.54 : 0.80;
            albRgba[qp] = Math.round(albRgba[qp] * tarDark);
            albRgba[qp + 1] = Math.round(albRgba[qp + 1] * tarDark);
            albRgba[qp + 2] = Math.round(albRgba[qp + 2] * tarDark);
            if (core) {
              heightBuf[qIdx] = Math.max(8, heightBuf[qIdx] - 56);
            }
            // Subtle bitumen tar sealant (~0.72..0.78 roughness so cracks catch glint without washing out)
            roughBuf[qIdx] = Math.min(roughBuf[qIdx], core ? 184 : 204);
          }
        }
      }
      cx = nx;
      cy = ny;
    }
  }

  const normalRgba = heightBufferToNormalRgba(heightBuf, w, h, 2.45);
  const ormRgba = packOrmFromHeightAndRoughness(heightBuf, roughBuf, w, h, 0, 0.55);

  const map = createRgbaTexture(THREE, albRgba, w, h, { repeatX: 1, repeatY: 1, srgb: true, anisotropy: 16 });
  const normalMap = createRgbaTexture(THREE, normalRgba, w, h, { repeatX: 1, repeatY: 1, srgb: false, anisotropy: 8 });
  const ormMap = createRgbaTexture(THREE, ormRgba, w, h, { repeatX: 1, repeatY: 1, srgb: false, anisotropy: 8 });

  const material = new THREE.MeshStandardMaterial({
    name: "V5_California_Asphalt_PBR",
    color: "#ffffff",
    map,
    normalMap,
    normalScale: new THREE.Vector2(0.66, 0.66),
    aoMap: ormMap,
    aoMapIntensity: 0.45,
    roughnessMap: ormMap,
    metalnessMap: ormMap,
    roughness: 1.0,
    metalness: 0.0,
    envMapIntensity: 0.18,
  });

  return { width: w, height: h, map, normalMap, roughnessMap: ormMap, ormMap, material };
}

function buildV5SierraGraniteCurb1024PbrSet(THREE, seed = 0x91867505) {
  const w = 1024;
  const h = 1024;
  const mesoGrid = buildNoiseGrid(256, seed ^ 0x5501);
  const crystalA = buildNoiseGrid(512, seed ^ 0x6602);
  const crystalB = buildNoiseGrid(512, seed ^ 0x7703);

  const albRgba = new Uint8Array(w * h * 4);
  const heightBuf = new Uint8Array(w * h);
  const roughBuf = new Uint8Array(w * h);

  const gutAlbRgba = new Uint8Array(w * h * 4);
  const gutRoughBuf = new Uint8Array(w * h);

  // Calibrated to omni_v5_telemetry.json sierra_granite_curb_plinth: #918675 = sRGB (145..158, 134..145, 117..126)
  // Two crisp dressed expansion joints per 1024 V-tile (at y=256 and y=768).
  // Combined with repeatY = 1 / (2 * 1.80 * 0.45) = 0.61728395 on `v = s * 0.45` curbs,
  // joints fall at exact 1.80m world-space intervals!
  for (let y = 0; y < h; y++) {
    const v = y / h;
    const dJointA = Math.abs(y - 256);
    const dJointB = Math.abs(y - 768);
    const dySeam = Math.min(dJointA, dJointB);
    const seamDark = dySeam < 5 ? -62.0 * (1.0 - dySeam / 5.0) : dySeam < 11 ? -10.0 * (1.0 - (dySeam - 5.0) / 6.0) : 0.0;
    const seamDip = dySeam < 6 ? -108.0 * (1.0 - dySeam / 6.0) : 0.0;
    const blockShift = y >= 256 && y < 768 ? 2.8 : -2.2;

    for (let x = 0; x < w; x++) {
      const u = x / w;
      const meso = sampleTileNoise(mesoGrid, 256, u * 30.0, v * 30.0);
      const c1 = crystalA[((y & 511) << 9) + (x & 511)];
      const c2 = crystalB[(((y * 2 + 19) & 511) << 9) + ((x * 2 + 41) & 511)];

      // Bush-hammered Sierra granite biotite/quartz/feldspar crystal speckle
      let mineral = (c2 - 0.5) * 24.0 + (meso - 0.5) * 14.0 + blockShift;
      let micaSpec = 0.0;
      if (c1 > 0.845) {
        mineral += 25.0;
        micaSpec = -0.13;
      } else if (c1 < 0.165) {
        mineral -= 34.0;
        micaSpec = -0.05;
      }

      // Subtle gutter grime AO strip along street toe (`u in [0.00, 0.18]`) + crisp beveled chamfer highlight (`u ~ 0.44`)
      const gutterToeAo = u < 0.18 ? (1.0 - u / 0.18) * (0.28 + 0.10 * meso) : 0.0;
      const bevelHighlight = Math.exp(-Math.pow((u - 0.44) / 0.06, 2)) * 9.5;

      const baseR = (154.0 + mineral + seamDark + bevelHighlight) * (1.0 - gutterToeAo);
      const baseG = (143.0 + mineral * 0.98 + seamDark + bevelHighlight * 0.96) * (1.0 - gutterToeAo);
      const baseB = (126.0 + mineral * 0.94 + seamDark + bevelHighlight * 0.90) * (1.0 - gutterToeAo);

      const idx = y * w + x;
      const p = idx * 4;
      albRgba[p] = clamp(Math.round(baseR), 36, 218);
      albRgba[p + 1] = clamp(Math.round(baseG), 34, 210);
      albRgba[p + 2] = clamp(Math.round(baseB), 30, 198);
      albRgba[p + 3] = 255;

      heightBuf[idx] = clamp(
        Math.round(152.0 + seamDip + (c1 - 0.5) * 62.0 + (meso - 0.5) * 32.0),
        8,
        250
      );
      roughBuf[idx] = Math.round(
        clamp(0.74 + micaSpec + gutterToeAo * 0.12 + (meso - 0.5) * 0.09, 0.52, 0.89) * 255.0
      );

      // Matching 1024x1024 concrete gutter pan with subtle curb-crease grime AO (ZERO tan bleed onto asphalt!)
      const gutCreaseAo =
        (u > 0.72 ? Math.pow((u - 0.72) / 0.28, 1.3) * 0.34 : 0.0) +
        (u < 0.16 ? (1.0 - u / 0.16) * 0.22 : 0.0);
      const gutD = (c2 - 0.5) * 14.0 + (meso - 0.5) * 12.0 + (seamDark * 0.45);
      gutAlbRgba[p] = clamp(Math.round((136.0 + gutD) * (1.0 - gutCreaseAo)), 38, 188);
      gutAlbRgba[p + 1] = clamp(Math.round((130.0 + gutD * 0.98) * (1.0 - gutCreaseAo)), 36, 182);
      gutAlbRgba[p + 2] = clamp(Math.round((120.0 + gutD * 0.95) * (1.0 - gutCreaseAo)), 34, 172);
      gutAlbRgba[p + 3] = 255;
      gutRoughBuf[idx] = Math.round(clamp(0.76 + gutCreaseAo * 0.10 + (meso - 0.5) * 0.08, 0.58, 0.90) * 255.0);
    }
  }

  const normalRgba = heightBufferToNormalRgba(heightBuf, w, h, 2.55);
  const ormRgba = packOrmFromHeightAndRoughness(heightBuf, roughBuf, w, h, 8, 0.68);
  const gutOrmRgba = packOrmFromHeightAndRoughness(heightBuf, gutRoughBuf, w, h, 5, 0.62);

  // Exact 1.80m expansion joint V-repeat for open_campus_world `v = s * 0.45`:
  // 2 joints/tile => period = 1 / (2 * repeatY * 0.45) = 1.80m => repeatY = 1 / 1.62 = 0.61728395
  const jointRepeatY = 1.0 / (2.0 * OMNI_V5_ENVIRONMENT_TELEMETRY.curbJointSpacingM * 0.45);

  const map = createRgbaTexture(THREE, albRgba, w, h, { repeatX: 1.0, repeatY: jointRepeatY, srgb: true, anisotropy: 12 });
  const normalMap = createRgbaTexture(THREE, normalRgba, w, h, { repeatX: 1.0, repeatY: jointRepeatY, srgb: false, anisotropy: 8 });
  const ormMap = createRgbaTexture(THREE, ormRgba, w, h, { repeatX: 1.0, repeatY: jointRepeatY, srgb: false, anisotropy: 8 });

  const gutterMap = createRgbaTexture(THREE, gutAlbRgba, w, h, { repeatX: 1.0, repeatY: 1.0 / (2.0 * 1.80 * 0.35), srgb: true, anisotropy: 12 });
  const gutterOrmMap = createRgbaTexture(THREE, gutOrmRgba, w, h, { repeatX: 1.0, repeatY: 1.0 / (2.0 * 1.80 * 0.35), srgb: false, anisotropy: 8 });

  const material = new THREE.MeshStandardMaterial({
    name: "V5_Sierra_Granite_Curb_PBR",
    color: "#ffffff",
    map,
    normalMap,
    normalScale: new THREE.Vector2(0.78, 0.78),
    aoMap: ormMap,
    aoMapIntensity: 0.55,
    roughnessMap: ormMap,
    metalnessMap: ormMap,
    roughness: 1.0,
    metalness: 0.03,
    envMapIntensity: 0.62,
  });

  const gutterMaterial = new THREE.MeshStandardMaterial({
    name: "V5_Concrete_Gutter_AO_PBR",
    color: "#ffffff",
    map: gutterMap,
    normalMap,
    normalScale: new THREE.Vector2(0.42, 0.42),
    aoMap: gutterOrmMap,
    aoMapIntensity: 0.50,
    roughnessMap: gutterOrmMap,
    metalnessMap: gutterOrmMap,
    roughness: 1.0,
    metalness: 0.02,
    envMapIntensity: 0.52,
  });

  return {
    width: w,
    height: h,
    curbHeightM: OMNI_V5_ENVIRONMENT_TELEMETRY.curbHeightM,
    expansionJointSpacingM: OMNI_V5_ENVIRONMENT_TELEMETRY.curbJointSpacingM,
    jointSpacingM: OMNI_V5_ENVIRONMENT_TELEMETRY.curbJointSpacingM,
    map,
    normalMap,
    roughnessMap: ormMap,
    ormMap,
    gutterMap,
    gutterRoughnessMap: gutterOrmMap,
    gutterOrmMap,
    material,
    gutterMaterial,
  };
}

function buildV5SandstonePaversAndEdging1024PbrSet(THREE, seed = 0x8c7c6905) {
  const w = 1024;
  const h = 1024;
  const macroGrid = buildNoiseGrid(64, seed ^ 0x8801);
  const mesoGrid = buildNoiseGrid(256, seed ^ 0x9902);
  const gritGrid = buildNoiseGrid(512, seed ^ 0xaa03);

  // A. 1024x1024 Running-Bond Sandstone Courtyard Pavers (#8C7C69..#B4A188) with deep mortar channels
  const paverAlbRgba = new Uint8Array(w * h * 4);
  const paverHeightBuf = new Uint8Array(w * h);
  const paverRoughBuf = new Uint8Array(w * h);

  // 8 courses vertically x 4 stretchers horizontally per 1024x1024 tile
  const coursesY = 8;
  const stretchersX = 4;
  const courseH = h / coursesY; // 128px
  const stretcherW = w / stretchersX; // 256px

  for (let y = 0; y < h; y++) {
    const v = y / h;
    const courseIdx = Math.floor(y / courseH);
    const localY = y - courseIdx * courseH;
    const dyMortar = Math.min(localY, courseH - localY);
    const staggerX = (courseIdx & 1) * (stretcherW * 0.5);

    for (let x = 0; x < w; x++) {
      const u = x / w;
      const sx = (x + staggerX) % w;
      const stoneColIdx = Math.floor(sx / stretcherW);
      const localX = sx - stoneColIdx * stretcherW;
      const dxMortar = Math.min(localX, stretcherW - localX);
      const dMortar = Math.min(dxMortar, dyMortar);

      // Deterministic per-stone warm sandstone mineral variation
      const stoneHash = Math.sin((courseIdx * 13 + stoneColIdx * 29 + 7) * 12.9898) * 43758.5453;
      const stoneFrac = stoneHash - Math.floor(stoneHash);
      const stoneWarmth = (stoneFrac - 0.5) * 18.0;

      const macro = sampleTileNoise(macroGrid, 64, u * 6.0, v * 6.0);
      const meso = sampleTileNoise(mesoGrid, 256, u * 28.0, v * 28.0);
      const grit = gritGrid[((y & 511) << 9) + (x & 511)];

      let mortarShade = 0.0;
      let mortarDepth = 0.0;
      if (dMortar < 4.5) {
        const t = 1.0 - dMortar / 4.5;
        mortarShade = -68.0 * t;
        mortarDepth = -132.0 * t;
      } else if (dMortar < 11.0) {
        const t = 1.0 - (dMortar - 4.5) / 6.5;
        mortarShade = -14.0 * t;
        mortarDepth = -24.0 * t;
      }

      const grain = (meso - 0.5) * 14.0 + (grit - 0.5) * 12.0 + (macro - 0.5) * 10.0;
      // Sunlit California buff sandstone (#8C7C69..#AD9B82 -> sRGB ~164, 147, 124 before lighting/albedo multiply)
      const r = 166.0 + stoneWarmth + grain + mortarShade;
      const g = 148.0 + stoneWarmth * 0.90 + grain * 0.95 + mortarShade * 0.96;
      const b = 124.0 + stoneWarmth * 0.76 + grain * 0.88 + mortarShade * 0.92;

      const idx = y * w + x;
      const p = idx * 4;
      paverAlbRgba[p] = clamp(Math.round(r), 44, 224);
      paverAlbRgba[p + 1] = clamp(Math.round(g), 40, 208);
      paverAlbRgba[p + 2] = clamp(Math.round(b), 34, 188);
      paverAlbRgba[p + 3] = 255;

      paverHeightBuf[idx] = clamp(
        Math.round(176.0 + mortarDepth + (meso - 0.5) * 26.0 + (grit - 0.5) * 28.0),
        6,
        252
      );
      paverRoughBuf[idx] = Math.round(
        clamp(0.76 + (dMortar < 5.0 ? 0.12 : 0.0) + (meso - 0.5) * 0.07 + (grit - 0.5) * 0.05, 0.62, 0.93) * 255.0
      );
    }
  }

  // B. 1024x1024 Architectural Warm Sandstone Sidewalk Slabs (2x2 = 1.35m x 1.35m slabs, matching zone4/zone5)
  const swAlbRgba = new Uint8Array(w * h * 4);
  const swHeightBuf = new Uint8Array(w * h);
  const swRoughBuf = new Uint8Array(w * h);
  const slabTones = [3.0, -2.5, -1.8, 2.4];

  for (let y = 0; y < h; y++) {
    const v = y / h;
    const dyJoint = Math.min(y % 512, 512 - (y % 512));
    const broom = Math.sin(y * 1.4) * 2.0 + Math.sin(y * 0.58 + 0.9) * 1.4;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const dxJoint = Math.min(x % 512, 512 - (x % 512));
      const dJoint = Math.min(dxJoint, dyJoint);
      const slabIdx = (y >= 512 ? 2 : 0) + (x >= 512 ? 1 : 0);

      const macro = sampleTileNoise(macroGrid, 64, u * 5.0, v * 5.0);
      const meso = sampleTileNoise(mesoGrid, 256, u * 32.0, v * 32.0);
      const grit = gritGrid[((y & 511) << 9) + (x & 511)];
      const inBroom = dxJoint > 20 && dyJoint > 20 ? 1.0 : 0.0;

      let jShade = 0.0;
      let jDepth = 0.0;
      if (dJoint < 4.0) {
        const t = 1.0 - dJoint / 4.0;
        jShade = -64.0 * t;
        jDepth = -116.0 * t;
      } else if (dJoint < 12.0) {
        const t = 1.0 - (dJoint - 4.0) / 8.0;
        jShade = -12.0 * t;
        jDepth = -20.0 * t;
      }

      const d = slabTones[slabIdx] + (macro - 0.5) * 11.0 + (meso - 0.5) * 9.0 + (grit - 0.5) * 10.0 + broom * inBroom * 0.8 + jShade;
      // Warm sunlit limestone-sandstone sidewalk (#B7A790 = sRGB 183, 167, 144) cleanly framed inside Sierra granite curbs
      const idx = y * w + x;
      const p = idx * 4;
      swAlbRgba[p] = clamp(Math.round(183.0 + d), 56, 228);
      swAlbRgba[p + 1] = clamp(Math.round(168.0 + d * 0.96), 52, 216);
      swAlbRgba[p + 2] = clamp(Math.round(146.0 + d * 0.90), 46, 198);
      swAlbRgba[p + 3] = 255;

      swHeightBuf[idx] = clamp(Math.round(168.0 + jDepth + broom * inBroom * 5.5 + (grit - 0.5) * 26.0), 8, 250);
      swRoughBuf[idx] = Math.round(clamp((inBroom > 0.5 ? 0.80 : 0.68) + (grit - 0.5) * 0.06, 0.62, 0.89) * 255.0);
    }
  }

  // C. 1024x1024 Soil/Turf Courtyard Edging Strip (u in [0..0.42] dressed stone header, u in [0.42..1.0] rich dark loam/mulch edge)
  const edgeAlbRgba = new Uint8Array(w * h * 4);
  const edgeHeightBuf = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const v = y / h;
    const dySeam = Math.min(y % 256, 256 - (y % 256));
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const meso = sampleTileNoise(mesoGrid, 256, u * 36.0, v * 36.0);
      const grit = gritGrid[((y & 511) << 9) + (x & 511)];
      const idx = y * w + x;
      const p = idx * 4;
      if (u < 0.46) {
        const seam = dySeam < 4 ? -48.0 * (1.0 - dySeam / 4.0) : 0.0;
        const d = (meso - 0.5) * 18.0 + (grit - 0.5) * 20.0 + seam;
        edgeAlbRgba[p] = clamp(Math.round(144.0 + d), 42, 204);
        edgeAlbRgba[p + 1] = clamp(Math.round(135.0 + d * 0.96), 40, 196);
        edgeAlbRgba[p + 2] = clamp(Math.round(119.0 + d * 0.92), 36, 182);
        edgeHeightBuf[idx] = clamp(Math.round(176.0 + seam + (grit - 0.5) * 38.0), 16, 248);
      } else {
        // Dark organic soil/bark turf border transition (#33291e -> #28361b)
        const turfBlend = clamp((u - 0.46) / 0.54, 0.0, 1.0);
        const d = (meso - 0.5) * 16.0 + (grit - 0.5) * 18.0;
        edgeAlbRgba[p] = clamp(Math.round(56.0 * (1.0 - turfBlend * 0.28) + d), 20, 96);
        edgeAlbRgba[p + 1] = clamp(Math.round(46.0 + turfBlend * 14.0 + d), 22, 104);
        edgeAlbRgba[p + 2] = clamp(Math.round(32.0 - turfBlend * 4.0 + d * 0.7), 14, 72);
        edgeHeightBuf[idx] = clamp(Math.round(96.0 + (meso - 0.5) * 52.0 + (grit - 0.5) * 48.0), 8, 220);
      }
      edgeAlbRgba[p + 3] = 255;
    }
  }

  const paverNormalRgba = heightBufferToNormalRgba(paverHeightBuf, w, h, 2.95);
  const paverOrmRgba = packOrmFromHeightAndRoughness(paverHeightBuf, paverRoughBuf, w, h, 0, 0.78);

  const swNormalRgba = heightBufferToNormalRgba(swHeightBuf, w, h, 2.45);
  const swOrmRgba = packOrmFromHeightAndRoughness(swHeightBuf, swRoughBuf, w, h, 0, 0.72);

  const edgeNormalRgba = heightBufferToNormalRgba(edgeHeightBuf, w, h, 2.6);

  const map = createRgbaTexture(THREE, paverAlbRgba, w, h, { repeatX: 1, repeatY: 1, srgb: true, anisotropy: 12 });
  const normalMap = createRgbaTexture(THREE, paverNormalRgba, w, h, { repeatX: 1, repeatY: 1, srgb: false, anisotropy: 8 });
  const ormMap = createRgbaTexture(THREE, paverOrmRgba, w, h, { repeatX: 1, repeatY: 1, srgb: false, anisotropy: 8 });

  const sidewalkMap = createRgbaTexture(THREE, swAlbRgba, w, h, { repeatX: 1, repeatY: 1, srgb: true, anisotropy: 12 });
  const sidewalkNormalMap = createRgbaTexture(THREE, swNormalRgba, w, h, { repeatX: 1, repeatY: 1, srgb: false, anisotropy: 8 });
  const sidewalkOrmMap = createRgbaTexture(THREE, swOrmRgba, w, h, { repeatX: 1, repeatY: 1, srgb: false, anisotropy: 8 });

  const edgingMap = createRgbaTexture(THREE, edgeAlbRgba, w, h, { repeatX: 1, repeatY: 2, srgb: true, anisotropy: 8 });
  const edgingNormalMap = createRgbaTexture(THREE, edgeNormalRgba, w, h, { repeatX: 1, repeatY: 2, srgb: false, anisotropy: 8 });

  const material = new THREE.MeshStandardMaterial({
    name: "V5_Sandstone_Courtyard_Pavers_PBR",
    color: "#ffffff",
    map,
    normalMap,
    normalScale: new THREE.Vector2(0.88, 0.88),
    aoMap: ormMap,
    aoMapIntensity: 0.62,
    roughnessMap: ormMap,
    metalnessMap: ormMap,
    roughness: 1.0,
    metalness: 0.0,
    envMapIntensity: 0.56,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  const sidewalkMaterial = new THREE.MeshStandardMaterial({
    name: "V5_Sandstone_Sidewalk_Slab_PBR",
    color: "#ffffff",
    map: sidewalkMap,
    normalMap: sidewalkNormalMap,
    normalScale: new THREE.Vector2(0.70, 0.70),
    aoMap: sidewalkOrmMap,
    aoMapIntensity: 0.56,
    roughnessMap: sidewalkOrmMap,
    metalnessMap: sidewalkOrmMap,
    roughness: 1.0,
    metalness: 0.0,
    envMapIntensity: 0.52,
  });

  const edgingMaterial = new THREE.MeshStandardMaterial({
    name: "V5_Soil_Turf_Edging_PBR",
    color: "#ffffff",
    map: edgingMap,
    normalMap: edgingNormalMap,
    normalScale: new THREE.Vector2(0.75, 0.75),
    roughness: 0.86,
    metalness: 0.0,
    envMapIntensity: 0.42,
  });

  return {
    width: w,
    height: h,
    map,
    normalMap,
    bumpMap: null,
    roughnessMap: ormMap,
    ormMap,
    sidewalkMap,
    sidewalkNormalMap,
    sidewalkBumpMap: null,
    sidewalkRoughnessMap: sidewalkOrmMap,
    sidewalkOrmMap,
    edgingMap,
    edgingNormalMap,
    material,
    sidewalkMaterial,
    edgingMaterial,
  };
}

/**
 * Extrudes a 3D beveled bush-hammered Sierra Granite curb strip (`0.15m` raised profile by default,
 * with `45°` top lip chamfer, battered street riser, tucked sidewalk lip, and exact `1.80m` UV-locked
 * expansion joints) from `(ax, az)` to `(bx, bz)`.
 */
export function buildBeveledGraniteCurbStripGeometry(THREE, ax, az, bx, bz, options = {}) {
  // Support both (THREE, ax, az, bx, bz, options) and (THREE, [{x,z}, {x,z}, ...], options)
  if (Array.isArray(ax)) {
    const pts = ax;
    const polyOpts = (az && typeof az === "object") ? az : {};
    if (pts.length < 2) return new THREE.BufferGeometry();
    if (pts.length === 2) {
      return buildBeveledGraniteCurbStripGeometry(
        THREE,
        pts[0].x,
        pts[0].z,
        pts[1].x,
        pts[1].z,
        polyOpts
      );
    }
    const allPos = [];
    const allNrm = [];
    const allUvs = [];
    let vAcc = polyOpts.vOffsetM ?? 0.0;
    for (let s = 0; s < pts.length - 1; s++) {
      const segLen = Math.hypot(pts[s + 1].x - pts[s].x, pts[s + 1].z - pts[s].z);
      const segG = buildBeveledGraniteCurbStripGeometry(
        THREE,
        pts[s].x,
        pts[s].z,
        pts[s + 1].x,
        pts[s + 1].z,
        { ...polyOpts, vOffsetM: vAcc }
      );
      allPos.push(...segG.attributes.position.array);
      allNrm.push(...segG.attributes.normal.array);
      allUvs.push(...segG.attributes.uv.array);
      segG.dispose();
      vAcc += segLen;
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute("position", new THREE.Float32BufferAttribute(allPos, 3));
    merged.setAttribute("normal", new THREE.Float32BufferAttribute(allNrm, 3));
    merged.setAttribute("uv", new THREE.Float32BufferAttribute(allUvs, 2));
    return merged;
  }

  const heightFn = typeof options.heightAt === "function" ? options.heightAt : getOpenWorldEarthHeight;
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz) || 1.0;
  const fx = dx / len;
  const fz = dz / len;
  const rx = -fz;
  const rz = fx;

  const streetOff = options.streetOffsetM ?? 0.0;
  const curbWidth = options.curbWidthM ?? options.curbWidth ?? 0.22;
  const sideSign = options.sideSign ?? 1.0;
  const sidewalkOff = options.sidewalkOffsetM ?? streetOff + sideSign * curbWidth;
  const curbHeight = options.curbHeightM ?? options.curbHeight ?? OMNI_V5_ENVIRONMENT_TELEMETRY.curbHeightM; // 0.15m
  const basePad = typeof options.heightAt === "function" ? 0.0 : 0.012;
  const baseY0 = options.baseY0 ?? heightFn(ax, az) + basePad;
  const baseY1 = options.baseY1 ?? heightFn(bx, bz) + basePad;
  const topY0 = options.topY0 ?? baseY0 + curbHeight;
  const topY1 = options.topY1 ?? baseY1 + curbHeight;
  const vOffset = options.vOffsetM ?? 0.0;

  const prof = [
    { t: 0.0, hFrac: 0.0, u: 0.0 },    // Gutter grime AO toe
    { t: 0.15, hFrac: 0.80, u: 0.34 }, // Battered street riser
    { t: 0.34, hFrac: 1.0, u: 0.52 },  // 45-degree beveled chamfer lip
    { t: 1.0, hFrac: 1.0, u: 0.88 },   // Bush-hammered granite crown
    { t: 1.0, hFrac: 0.58, u: 1.0 },   // Tucked sidewalk back lip
  ];

  const swap = streetOff > sidewalkOff;
  const v0 = vOffset * 0.45;
  const v1 = (vOffset + len) * 0.45;
  const pos = [];
  const uvs = [];

  const ptAt = (useB, p) => {
    const px = useB ? bx : ax;
    const pz = useB ? bz : az;
    const bY = useB ? baseY1 : baseY0;
    const tY = useB ? topY1 : topY0;
    const off = streetOff + (sidewalkOff - streetOff) * p.t;
    return [px + rx * off, bY + (tY - bY) * p.hFrac, pz + rz * off];
  };

  for (let i = 0; i < prof.length - 1; i++) {
    const pA = prof[i];
    const pB = prof[i + 1];
    const q00 = ptAt(false, pA);
    const q10 = ptAt(false, pB);
    const q01 = ptAt(true, pA);
    const q11 = ptAt(true, pB);
    if (!swap) {
      pos.push(...q00, ...q10, ...q01, ...q10, ...q11, ...q01);
      uvs.push(pA.u, v0, pB.u, v0, pA.u, v1, pB.u, v0, pB.u, v1, pA.u, v1);
    } else {
      pos.push(...q00, ...q01, ...q10, ...q10, ...q01, ...q11);
      uvs.push(pA.u, v0, pA.u, v1, pB.u, v0, pB.u, v0, pA.u, v1, pB.u, v1);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.computeVertexNormals();
  return geom;
}

/**
 * Builds a closed circular beveled Sierra Granite curb collar ring (`segments = 96` by default,
 * exact `1.80m` expansion-joint V mapping) to cleanly frame circular plazas such as Android Lawn
 * (`cx = -118, cz = 96, radius = 9.45m`) and hide low-poly polar terrain disc edges (`[VETO-3D-01]`).
 */
export function buildGraniteCurbCollarRingGeometry(THREE, cx, cz, radius, options = {}) {
  const segments = Math.max(24, Math.floor(options.segments ?? 96));
  const curbWidth = options.curbWidthM ?? 0.28;
  const curbHeight = options.curbHeightM ?? 0.085;
  const innerRadius = radius - curbWidth * 0.45;
  const outerRadius = radius + curbWidth * 0.55;
  const startTheta = options.startThetaRad ?? 0.0;
  const arcTheta = options.arcThetaRad ?? Math.PI * 2.0;
  const closed = Math.abs(arcTheta - Math.PI * 2.0) < 1e-4;
  const heightFn = typeof options.heightAt === "function" ? options.heightAt : getOpenWorldEarthHeight;

  // Profile from inner plaza lip (t = 0) across beveled granite crown to outer lawn riser (t = 1)
  const prof = [
    { rFrac: 0.0, hFrac: 0.16, u: 0.92 },
    { rFrac: 0.16, hFrac: 1.0, u: 0.78 },
    { rFrac: 0.78, hFrac: 1.0, u: 0.48 },
    { rFrac: 0.92, hFrac: 0.78, u: 0.30 },
    { rFrac: 1.0, hFrac: 0.0, u: 0.04 },
  ];

  const pos = [];
  const uvs = [];
  let arcAcc = 0.0;

  for (let s = 0; s < segments; s++) {
    const th0 = startTheta + (s / segments) * arcTheta;
    const th1 = closed && s === segments - 1 ? startTheta : startTheta + ((s + 1) / segments) * arcTheta;
    const segArc = Math.abs((arcTheta / segments) * radius);
    const v0 = arcAcc * 0.45;
    const v1 = (arcAcc + segArc) * 0.45;
    arcAcc += segArc;

    const ptRing = (th, p) => {
      const rr = innerRadius + (outerRadius - innerRadius) * p.rFrac;
      const wx = cx + Math.cos(th) * rr;
      const wz = cz + Math.sin(th) * rr;
      const baseY = (options.baseY !== undefined ? options.baseY : heightFn(wx, wz)) - 0.006;
      return [wx, baseY + curbHeight * p.hFrac, wz];
    };

    for (let i = 0; i < prof.length - 1; i++) {
      const pA = prof[i];
      const pB = prof[i + 1];
      const q00 = ptRing(th0, pA);
      const q10 = ptRing(th0, pB);
      const q01 = ptRing(th1, pA);
      const q11 = ptRing(th1, pB);
      pos.push(...q00, ...q01, ...q10, ...q10, ...q01, ...q11);
      uvs.push(pA.u, v0, pA.u, v1, pB.u, v0, pB.u, v0, pA.u, v1, pB.u, v1);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.computeVertexNormals();
  return geom;
}

/**
 * Generates Zone 6 Shoreline Amphitheatre Keynote Plaza PBR materials (`[VETO-3D-06]`):
 *   - `basaltMaterial`: Dark brushed volcanic basalt concentric stone (`#2C3036`, 1024x1024 ashlar normal/roughness)
 *   - `graniteRingMaterial`: Warm speckled Sierra granite outer plaza ring (`#948979`)
 *   - `keynotePedestalVertexColorPbr`: Drop-in `vertexColors: true` shadowed PBR material to replace
 *     unlit `MeshBasicMaterial` on `shorelinePedestalMesh` in 1 line!
 *   - `inlayGlass`: Recessed 5cm architectural laminated glass/enamel rings (`blue`, `red`, `yellow`, `green`)
 */
export function createShorelineKeynotePlazaMaterials(THREE, existingMaterials = null, seed = 0x2c303606) {
  const w = 512;
  const h = 512;
  const mesoGrid = buildNoiseGrid(128, seed ^ 0x4101);
  const gritGrid = buildNoiseGrid(256, seed ^ 0x4102);

  const basaltAlb = new Uint8Array(w * h * 4);
  const stoneHeight = new Uint8Array(w * h);
  const stoneRough = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    const v = y / h;
    const courseIdx = Math.floor(y / 64);
    const dyJoint = Math.min(y % 64, 64 - (y % 64));
    const stagger = (courseIdx & 1) * 64;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const sx = (x + stagger) & (w - 1);
      const dxJoint = Math.min(sx % 128, 128 - (sx % 128));
      const dJoint = Math.min(dxJoint, dyJoint);
      const meso = sampleTileNoise(mesoGrid, 128, u * 18.0, v * 18.0);
      const grit = gritGrid[((y & 255) << 8) + (x & 255)];
      const brush = Math.sin(x * 1.15 + meso * 2.0) * 1.6;
      const seam = dJoint < 3 ? -18.0 * (1.0 - dJoint / 3.0) : 0.0;
      const seamDip = dJoint < 4 ? -92.0 * (1.0 - dJoint / 4.0) : 0.0;
      const d = (meso - 0.5) * 9.0 + (grit - 0.5) * 10.0 + brush + seam;

      const idx = y * w + x;
      const p = idx * 4;
      basaltAlb[p] = clamp(Math.round(46.0 + d), 20, 86);
      basaltAlb[p + 1] = clamp(Math.round(50.0 + d * 1.02), 22, 90);
      basaltAlb[p + 2] = clamp(Math.round(56.0 + d * 1.05), 25, 98);
      basaltAlb[p + 3] = 255;

      stoneHeight[idx] = clamp(Math.round(162.0 + seamDip + brush * 5.0 + (grit - 0.5) * 32.0), 8, 248);
      stoneRough[idx] = Math.round(clamp(0.71 + (dJoint < 3 ? 0.14 : 0.0) + (meso - 0.5) * 0.08, 0.58, 0.88) * 255.0);
    }
  }

  const normalRgba = heightBufferToNormalRgba(stoneHeight, w, h, 2.35);
  const stoneOrmRgba = packOrmFromHeightAndRoughness(stoneHeight, stoneRough, w, h, 15, 0.70);

  const basaltMap = createRgbaTexture(THREE, basaltAlb, w, h, { repeatX: 4, repeatY: 4, srgb: true, anisotropy: 8 });
  const stoneNormalMap = createRgbaTexture(THREE, normalRgba, w, h, { repeatX: 4, repeatY: 4, srgb: false, anisotropy: 8 });
  const stoneOrmMap = createRgbaTexture(THREE, stoneOrmRgba, w, h, { repeatX: 4, repeatY: 4, srgb: false, anisotropy: 8 });

  const basaltMaterial = new THREE.MeshStandardMaterial({
    name: "V5_Shoreline_Brushed_Basalt_PBR",
    color: "#ffffff",
    map: basaltMap,
    normalMap: stoneNormalMap,
    normalScale: new THREE.Vector2(0.72, 0.72),
    aoMap: stoneOrmMap,
    aoMapIntensity: 0.58,
    roughnessMap: stoneOrmMap,
    metalnessMap: stoneOrmMap,
    roughness: 1.0,
    metalness: 0.06,
    envMapIntensity: 0.48,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  const keynotePedestalVertexColorPbr = new THREE.MeshStandardMaterial({
    name: "V5_Shoreline_Keynote_Pedestal_PBR",
    color: "#d8d4cc",
    vertexColors: true,
    normalMap: stoneNormalMap,
    normalScale: new THREE.Vector2(0.68, 0.68),
    aoMap: stoneOrmMap,
    aoMapIntensity: 0.52,
    roughnessMap: stoneOrmMap,
    metalnessMap: stoneOrmMap,
    roughness: 0.92,
    metalness: 0.05,
    envMapIntensity: 0.44,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });

  const makeInlayMat = (nm, hex, emHex) =>
    new THREE.MeshPhysicalMaterial({
      name: nm,
      color: hex,
      emissive: emHex,
      emissiveIntensity: 0.10,
      roughness: 0.24,
      metalness: 0.08,
      clearcoat: 0.82,
      clearcoatRoughness: 0.14,
      envMapIntensity: 0.85,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });

  const inlayGlass = {
    blue: makeInlayMat("V5_Shoreline_Inlay_Blue", "#3B78E7", "#12295A"),
    red: makeInlayMat("V5_Shoreline_Inlay_Red", "#D93D2E", "#4D120C"),
    yellow: makeInlayMat("V5_Shoreline_Inlay_Yellow", "#E5AB06", "#4F3802"),
    green: makeInlayMat("V5_Shoreline_Inlay_Green", "#2E994B", "#0D3819"),
  };

  if (existingMaterials && typeof existingMaterials === "object") {
    existingMaterials.shorelineBasaltStone = basaltMaterial;
    existingMaterials.shorelineKeynotePedestalPbr = keynotePedestalVertexColorPbr;
    existingMaterials.shorelineInlayGlassBlue = inlayGlass.blue;
    existingMaterials.shorelineInlayGlassRed = inlayGlass.red;
    existingMaterials.shorelineInlayGlassYellow = inlayGlass.yellow;
    existingMaterials.shorelineInlayGlassGreen = inlayGlass.green;
  }

  return {
    basaltMap,
    basaltNormal: stoneNormalMap,
    basaltRoughness: stoneOrmMap,
    stoneNormalMap,
    stoneRoughnessMap: stoneOrmMap,
    stoneOrmMap,
    basaltMaterial,
    keynotePedestalVertexColorPbr,
    inlayGlass,
  };
}

/**
 * Generates crisp 1024x1024 deterministic PBR sets for weathered California dark slate-charcoal asphalt,
 * 0.15m beveled Sierra granite curbs (1.80m expansion joints + gutter grime AO strip),
 * sandstone courtyard pavers + turf edging, and Zone 6 Shoreline basalt/inlay stone,
 * optionally upgrading `options.materials` in-place!
 */
export function upgradeRoadAndCurbRealism(THREE, options = {}) {
  const seed = (options.seed ?? 0x55aa77cc) >>> 0;
  const asphalt = buildV5Asphalt1024PbrSet(THREE, seed ^ 0x101);
  const graniteCurb = buildV5SierraGraniteCurb1024PbrSet(THREE, seed ^ 0x202);
  const sandstonePavers = buildV5SandstonePaversAndEdging1024PbrSet(THREE, seed ^ 0x303);
  const shorelinePlaza = createShorelineKeynotePlazaMaterials(THREE, options.materials || null, seed ^ 0x404);

  // Optional in-place upgrade of an existing createMaterialLibrary() return object
  if (options.materials && typeof options.materials === "object") {
    const m = options.materials;
    const patchStdMat = (target, src) => {
      if (!target || !src) return;
      target.color.copy(src.color);
      target.map = src.map;
      target.normalMap = src.normalMap;
      if (target.normalScale && src.normalScale) target.normalScale.copy(src.normalScale);
      target.bumpMap = src.normalMap ? null : (src.bumpMap || null);
      target.bumpScale = target.bumpMap ? (src.bumpScale ?? 1.0) : 0.0;
      target.aoMap = src.aoMap || null;
      if (src.aoMapIntensity !== undefined) target.aoMapIntensity = src.aoMapIntensity;
      target.roughnessMap = src.roughnessMap || null;
      target.metalnessMap = src.metalnessMap || null;
      target.roughness = src.roughness;
      target.metalness = src.metalness;
      target.envMapIntensity = src.envMapIntensity;
      target.needsUpdate = true;
    };

    patchStdMat(m.roadAsphalt, asphalt.material);
    if (m.asphaltRoad && m.asphaltRoad !== m.roadAsphalt) patchStdMat(m.asphaltRoad, asphalt.material);
    // Guarantee zero green road boxes on legacy bikeLaneGreen key
    m.bikeLaneGreen = m.roadAsphalt || asphalt.material;

    patchStdMat(m.graniteCurb, graniteCurb.material);
    if (m.concreteCurb && m.concreteCurb !== m.graniteCurb) patchStdMat(m.concreteCurb, graniteCurb.material);
    patchStdMat(m.concreteGutter, graniteCurb.gutterMaterial);

    patchStdMat(m.concreteSidewalk, sandstonePavers.sidewalkMaterial);
    if (m.concretePath && m.concretePath !== m.concreteSidewalk) patchStdMat(m.concretePath, sandstonePavers.sidewalkMaterial);

    patchStdMat(m.brickPath, sandstonePavers.material);
    m.sandstonePavers = sandstonePavers.material;
    m.turfEdging = sandstonePavers.edgingMaterial;
    m.shorelineGraniteRing = graniteCurb.material;

    if (m.textures && typeof m.textures === "object") {
      m.textures.roadAsphaltMap = asphalt.map;
      m.textures.roadAsphaltNormal = asphalt.normalMap;
      m.textures.roadAsphaltRoughness = asphalt.roughnessMap;
      m.textures.graniteCurbMap = graniteCurb.map;
      m.textures.concreteSidewalkMap = sandstonePavers.sidewalkMap;
      m.textures.concreteSidewalkNormal = sandstonePavers.sidewalkNormalMap;
      m.textures.sandstonePaversMap = sandstonePavers.map;
      m.textures.sandstonePaversNormal = sandstonePavers.normalMap;
      m.textures.turfEdgingMap = sandstonePavers.edgingMap;
      m.textures.shorelineBasaltMap = shorelinePlaza.basaltMap;
    }
  }

  return {
    asphalt,
    graniteCurb,
    sandstonePavers,
    shorelinePlaza,
    shorelineKeynote: shorelinePlaza,
    turfEdging: {
      map: sandstonePavers.edgingMap,
      normalMap: sandstonePavers.edgingNormalMap,
      material: sandstonePavers.edgingMaterial,
    },
    buildBeveledGraniteCurbStripGeometry: (ax, az, bx, bz, opts) =>
      buildBeveledGraniteCurbStripGeometry(THREE, ax, az, bx, bz, opts),
    buildGraniteCurbCollarRingGeometry: (cx, cz, radius, opts) =>
      buildGraniteCurbCollarRingGeometry(THREE, cx, cz, radius, opts),
  };
}

// ============================================================================
// 3. DETERMINISTIC ZERO-FLOAT PROP GROUNDING & CONTACT-AO AUDIT ENGINE
// ============================================================================

const REQUIRED_GROUNDING_CATEGORIES = Object.freeze([
  "dumbbell",
  "kettlebells",
  "spinBikes",
  "racks",
  "stanPlinth",
  "cafeSets",
  "trees",
  "benches",
  "ramps",
  "pavilions",
  "berms",
]);

const IGNORE_GROUNDING_NODE_RE =
  /ContactAO|ContactShadow|ClockCleanFaceOverlay|Wall_Clock|Studio_Clock|SpinStudio_North_LED_Clock|SpinStudio_Sunbeams|SubPart_ShadowLinked|Shadow|Halo|Glow|Beam|Smoke|Steam|Dust|SkyDome|Vignette|Shard|Grass_Field|Grass_Tile|Grass_132k|Grass_156k|Horizon_Santa_Cruz|Horizon_Mountain|Horizon_Foothill_Tree_Silhouettes/i;

const CONTAINER_GROUP_NAME_RE =
  /Container|Collection|Batches|_Group$|Props_V[23456]|Buildings|Street_Furniture|Furniture_Batches|Botanical_Trees|Botanical_Kit|Snack_Carts|Umbrella_Sets|Jump_Ramps|Arboretum|Pavilions_V[56]|Berms_V[56]|Cafe_Sets|Cafe_Props/i;

// Outdoor prop/landmark groups that may be temporarily view-cone culled (`visible === false`) at t = 0 inside Spin Studio
const AUDIT_EVEN_IF_CULLED_RE =
  /Furniture_Batches|Botanical_Trees|Botanical_Kit|Snack_Cart|Umbrella|Bridge_V6|Canopy_V6|Gradient_Canopy|Bay_View_Canopy|Arboretum|Campus_V[56]_Container|Earthworks_Container|Campus_Environment_V3_Buildings|Jump_Ramps|Stan|Cafe|MK_Espresso|Shoreline_Pods/i;

function isReplacedLegacyNode(obj) {
  if (!obj) return true;
  if (obj.userData?.replacedByV5 || obj.userData?.replacedByV6 || obj.userData?.skipGroundingAudit) {
    return true;
  }
  if (!obj.visible && /Fallback/i.test(obj.name || "")) return true;
  return false;
}

function inferPropCategoryFromName(name = "", userData = {}) {
  if (userData && typeof userData.groundingCategory === "string") {
    return userData.groundingCategory;
  }
  if (userData && typeof userData.buildingId === "string") {
    return "pavilions";
  }
  const n = String(name);
  if (/dumbbell(?!.*rack)|59aa|foreground_weights/i.test(n)) return "dumbbell";
  if (/kettlebell/i.test(n)) return "kettlebells";
  if (/spin[_-]?bike|trainer/i.test(n)) return "spinBikes";
  if (/rack|squat[_-]?cage/i.test(n)) return "racks";
  if (/stan.*plinth|stan.*pedestal|stan.*monument|stantrex|stan[_-]?holder/i.test(n)) return "stanPlinth";
  if (/cafe[_-]?set|cafe.*table|bistro|umbrella|mk[_-]?cart|espresso[_-]?cart|snack[_-]?cart/i.test(n)) return "cafeSets";
  if (/tree|redwood|oak|willow|botanical[_-]?trees/i.test(n)) return "trees";
  if (/bench|street[_-]?furniture|planter|tribin|shrub|hedge|grass[_-]?plume|boulder/i.test(n)) return "benches";
  if (/ramp/i.test(n)) return "ramps";
  if (/pavilion|building[_-]?block|office[_-]?pavilion|canopy[_-]?building|canopy[_-]?pavilion|mass[_-]?timber|modern[_-]?glass|env[_-]?v[3456][_-]?buildings/i.test(n)) return "pavilions";
  if (/berm|mound/i.test(n)) return "berms";
  return null;
}

/**
 * Analytical campus surface top elevation `surfaceTopY(x, z, category)` matching
 * `open_campus_world.js` slab offsets to the sub-millimeter:
 *   - Spin Studio Gym floor (`|x| <= 7.85, z in [131.15, 148.6]`): `0.007m`
 *   - Spin Studio Maple perimeter border (`|x| in (7.85, 10.45], z in [131.15, 148.6]`): `0.004m`
 *   - Gradient Forecourt (`x in [-24.05, 28.05], z in [121.55, 131.22)`): `0.018m`
 *   - Jump Ramps (`category === "ramps"`): road/promenade deck `earthY + 0.016m`
 *   - Asphalt carriageways: `earthY + 0.016m`
 *   - Concrete/sandstone sidewalks (`signedCampusCarriagewayClearance in (0.50, 3.30]`): `earthY + 0.094m`
 *   - Courtyard/promenade pavers: `earthY + 0.016m` (Shoreline concourse `earthY + 0.014m`)
 *   - Pure turf lawns / berms / trees / Stan lawn island: `earthY`
 */
export function getDefaultCampusSurfaceTopY(x, z, category = "") {
  const px = Number(x) || 0.0;
  const pz = Number(z) || 0.0;

  // 1. Interior Spin Studio EPDM rubber floor (`gymFloor.position.y = 0.007`) & maple border (`0.004`)
  if (Math.abs(px) <= 7.85 && pz >= 131.15 && pz <= 148.6) {
    return 0.007;
  }
  if (Math.abs(px) <= 10.45 && pz >= 131.15 && pz <= 148.6) {
    return 0.004;
  }

  const earthY = getOpenWorldEarthHeight(px, pz);

  // 2. Pavilions & landscaped berms sit directly on campus earth grade
  if (category === "pavilions" || category === "pavilion" || category === "berms" || category === "berm") {
    return earthY;
  }

  // 3. Gradient Canopy / Visitor Experience Hex Paver Forecourt slabs (`z in [121.55, 126.90)`)
  if (px >= -24.05 && px <= 28.05 && pz >= 121.55 && pz < 126.90) {
    return 0.016;
  }

  // 4. Jump ramps sit directly on the road/promenade surface (exclude ramp's own elevation!)
  if (category === "ramps") {
    return earthY + 0.016;
  }

  // 5. Stevens Creek Bridge cambered timber deck
  const br = getStevensCreekBridgeParam(px, pz);
  if (br && br.onDeck) {
    return Math.max(earthY, br.elevationM) + 0.004;
  }

  // 6. Asphalt carriageway
  const aspClear = signedCampusAsphaltClearance(px, pz);
  if (aspClear <= 0.04) {
    return earthY + 0.016;
  }

  // 7. Courtyard & waterfront sandstone paver zones
  const rStan = Math.hypot(px + 118.0, pz + 50.0);
  if (
    (rStan >= 13.45 && rStan <= 19.25) ||
    (Math.abs(px + 118.0) <= 5.45 && pz >= -35.85 && pz <= -25.4) ||
    (Math.abs(px + 118.0) <= 4.85 && pz >= -72.55 && pz <= -64.15)
  ) {
    return earthY + 0.016;
  }
  if (
    Math.hypot(px + 118.0, pz - 96.0) <= 9.42 ||
    (Math.abs(px + 118.0) <= 4.62 && pz >= 86.9 && pz <= 96.0)
  ) {
    return earthY + 0.016;
  }
  if (Math.abs(px - 156.0) <= 8.05 && pz >= -86.0 && pz <= 112.0) {
    return earthY + 0.016;
  }
  if (Math.hypot(px - 14.0, pz + 188.0) <= 25.25) {
    const inMedallionRecess = Math.hypot(px - 14.0, pz + 178.0) < 6.36;
    return earthY + 0.014 - (inMedallionRecess ? 0.035 : 0.0);
  }

  // 8. MK Espresso Cart extended hardscape aprons & raised roadside sidewalks (`0.54m .. 3.26m` outside asphalt edge)
  const mkApron = evaluateMkHardscapeApronAt(px, pz, 0.15);
  if (mkApron) {
    return earthY + (mkApron.isPaverRoad ? 0.018 : 0.094);
  }
  if (aspClear >= 0.50 && aspClear <= 3.30) {
    return earthY + 0.094;
  }

  // 9. Campus turf lawns (Stan lawn island, Android lawn, berms, foothills)
  return earthY;
}

function buildSharedContactAoTexture(THREE) {
  const size = 128;
  const rgba = new Uint8Array(size * size * 4);
  const half = (size - 1) * 0.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - half) / half;
      const dy = (y - half) / half;
      const r = Math.min(1.0, Math.hypot(dx, dy));
      const falloff = Math.pow(1.0 - r, 1.95);
      const alpha = Math.round(clamp(falloff * 0.72, 0.0, 1.0) * 255.0);
      const p = (y * size + x) * 4;
      rgba[p] = 10;
      rgba[p + 1] = 12;
      rgba[p + 2] = 10;
      rgba[p + 3] = alpha;
    }
  }
  return createRgbaTexture(THREE, rgba, size, size, {
    srgb: true,
    anisotropy: 4,
    clampEdge: true,
  });
}

function computePhysicalWorldBox(THREE, node, allowCulledSubtree = false) {
  const box = new THREE.Box3();
  const meshBox = new THREE.Box3();
  let hasGeometry = false;

  // For Stan T-Rex monument rig / holder, measure the stone plinth base if present so tail/jaw sway never shifts XZ centroid!
  let measureRoot = node;
  if (node && node.isObject3D) {
    let plinthChild = null;
    node.traverse((ch) => {
      if (!plinthChild && ch !== node && ch.name && /Stan.*Plinth|Plinth_V5/i.test(ch.name) && !/Fallback/i.test(ch.name)) {
        plinthChild = ch;
      }
    });
    if (plinthChild) {
      measureRoot = plinthChild;
    }
  }

  measureRoot.traverse((ch) => {
    if (isReplacedLegacyNode(ch)) return;
    if (!allowCulledSubtree && !ch.visible) return;
    if (ch.userData?.isV5ContactAODecal) return;
    if (ch.name && IGNORE_GROUNDING_NODE_RE.test(ch.name)) return;
    if (!ch.isMesh || ch.isInstancedMesh || !ch.geometry) return;
    if (!ch.geometry.boundingBox) {
      ch.geometry.computeBoundingBox();
    }
    if (!ch.geometry.boundingBox || ch.geometry.boundingBox.isEmpty()) return;
    meshBox.copy(ch.geometry.boundingBox).applyMatrix4(ch.matrixWorld);
    if (
      Number.isFinite(meshBox.min.y) &&
      Number.isFinite(meshBox.max.y)
    ) {
      box.union(meshBox);
      hasGeometry = true;
    }
  });

  return hasGeometry ? box : null;
}

function refreshSubtreeWorldMatrices(node) {
  const chain = [];
  let cur = node;
  while (cur) {
    chain.push(cur);
    cur = cur.parent;
  }
  for (let i = chain.length - 1; i >= 0; i--) {
    const obj = chain[i];
    if (obj === node || obj.matrixAutoUpdate) {
      obj.updateMatrix();
    }
    if (obj.parent) {
      obj.matrixWorld.multiplyMatrices(obj.parent.matrixWorld, obj.matrix);
    } else {
      obj.matrixWorld.copy(obj.matrix);
    }
  }
  node.traverse((ch) => {
    if (ch === node) return;
    if (ch.matrixAutoUpdate) ch.updateMatrix();
    if (ch.parent) {
      ch.matrixWorld.multiplyMatrices(ch.parent.matrixWorld, ch.matrix);
    }
  });
}

/**
 * Splits & grounds a baked static multi-ramp mesh/group (`Campus_Jump_Ramps_V4` where
 * `bakeStaticGroupByMaterial` merged all 4 `JUMP_RAMPS` across the 480m campus into 1 mesh!)
 * by snapping each vertex cluster near `JUMP_RAMPS[k]` individually to `0.000mm`!
 */
function groundBakedMultiRampClusters(THREE, node, surfaceTopFn, pushCategoryDecal, byCategory, items) {
  const meshes = [];
  node.traverse((ch) => {
    if (ch.isMesh && !ch.isInstancedMesh && ch.geometry && ch.geometry.attributes?.position) {
      meshes.push(ch);
    }
  });
  if (meshes.length === 0) {
    return null;
  }

  const vWorld = new THREE.Vector3();
  const invWorld = new THREE.Matrix4();

  // Discover all distinct XZ ramp islands (seeded with canonical `JUMP_RAMPS`, plus automatic
  // 14m spatial clustering for any additional ramp islands merged into the static mesh!)
  const clusterSeeds = [];
  if (Array.isArray(JUMP_RAMPS)) {
    for (let i = 0; i < JUMP_RAMPS.length; i++) {
      const rp = JUMP_RAMPS[i];
      clusterSeeds.push({
        id: rp.id || `ramp_${i}`,
        x: rp.x,
        z: rp.z,
        radius: Math.max(9.5, (rp.lengthM || 6.0) * 1.15),
      });
    }
  }
  for (let m = 0; m < meshes.length; m++) {
    const mesh = meshes[m];
    const posAttr = mesh.geometry.attributes.position;
    for (let vi = 0; vi < posAttr.count; vi++) {
      vWorld.fromBufferAttribute(posAttr, vi).applyMatrix4(mesh.matrixWorld);
      let matched = false;
      for (let c = 0; c < clusterSeeds.length; c++) {
        if (Math.hypot(vWorld.x - clusterSeeds[c].x, vWorld.z - clusterSeeds[c].z) <= clusterSeeds[c].radius) {
          matched = true;
          break;
        }
      }
      if (!matched) {
        clusterSeeds.push({
          id: `extra_${clusterSeeds.length}`,
          x: vWorld.x,
          z: vWorld.z,
          radius: 12.0,
        });
      }
    }
  }

  let worstRampAfterMm = 0.0;
  let groundedRampClusters = 0;

  for (let rIdx = 0; rIdx < clusterSeeds.length; rIdx++) {
    const rp = clusterSeeds[rIdx];
    const searchRadius = rp.radius;
    let minWorldY = Infinity;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let matchVerts = 0;

    for (let m = 0; m < meshes.length; m++) {
      const mesh = meshes[m];
      const posAttr = mesh.geometry.attributes.position;
      for (let vi = 0; vi < posAttr.count; vi++) {
        vWorld.fromBufferAttribute(posAttr, vi).applyMatrix4(mesh.matrixWorld);
        if (Math.hypot(vWorld.x - rp.x, vWorld.z - rp.z) <= searchRadius) {
          matchVerts++;
          if (vWorld.y < minWorldY) minWorldY = vWorld.y;
          if (vWorld.x < minX) minX = vWorld.x;
          if (vWorld.x > maxX) maxX = vWorld.x;
          if (vWorld.z < minZ) minZ = vWorld.z;
          if (vWorld.z > maxZ) maxZ = vWorld.z;
        }
      }
    }

    if (matchVerts === 0 || !Number.isFinite(minWorldY)) continue;

    const cx = 0.5 * (minX + maxX);
    const cz = 0.5 * (minZ + maxZ);
    const targetY = surfaceTopFn(cx, cz, "ramps", node);
    const beforeDeltaM = minWorldY - targetY;
    const beforeMm = Math.abs(beforeDeltaM) * 1000.0;

    if (Math.abs(beforeDeltaM) > 1e-9) {
      for (let m = 0; m < meshes.length; m++) {
        const mesh = meshes[m];
        invWorld.copy(mesh.matrixWorld).invert();
        const posAttr = mesh.geometry.attributes.position;
        let touched = false;
        for (let vi = 0; vi < posAttr.count; vi++) {
          vWorld.fromBufferAttribute(posAttr, vi).applyMatrix4(mesh.matrixWorld);
          if (Math.hypot(vWorld.x - rp.x, vWorld.z - rp.z) <= searchRadius) {
            vWorld.y -= beforeDeltaM;
            vWorld.applyMatrix4(invWorld);
            posAttr.setXYZ(vi, vWorld.x, vWorld.y, vWorld.z);
            touched = true;
          }
        }
        if (touched) {
          posAttr.needsUpdate = true;
          mesh.geometry.computeBoundingBox();
          mesh.geometry.computeBoundingSphere();
        }
      }
    }

    // Re-measure post-snap minWorldY for exact verification telemetry
    let postMinY = Infinity;
    for (let m = 0; m < meshes.length; m++) {
      const mesh = meshes[m];
      const posAttr = mesh.geometry.attributes.position;
      for (let vi = 0; vi < posAttr.count; vi++) {
        vWorld.fromBufferAttribute(posAttr, vi).applyMatrix4(mesh.matrixWorld);
        if (Math.hypot(vWorld.x - rp.x, vWorld.z - rp.z) <= searchRadius) {
          if (vWorld.y < postMinY) postMinY = vWorld.y;
        }
      }
    }

    const postMm = Math.abs(postMinY - targetY) * 1000.0;
    worstRampAfterMm = Math.max(worstRampAfterMm, postMm);
    groundedRampClusters++;

    pushCategoryDecal("ramps", cx, targetY, cz, maxX - minX, maxZ - minZ);

    if (!byCategory.ramps) byCategory.ramps = { count: 0, maxFloatMm: 0.0 };
    byCategory.ramps.count += 1;
    byCategory.ramps.maxFloatMm = Math.max(byCategory.ramps.maxFloatMm, postMm);

    items.push({
      name: `Campus_Jump_Ramp_V4_${rp.id || rIdx}`,
      category: "ramps",
      x: Number(cx.toFixed(3)),
      z: Number(cz.toFixed(3)),
      surfaceTopY: Number(targetY.toFixed(5)),
      minY: Number(postMinY.toFixed(5)),
      beforeFloatMm: Number(beforeMm.toFixed(4)),
      floatMm: Number(postMm.toFixed(4)),
    });
  }

  return groundedRampClusters > 0 ? worstRampAfterMm : null;
}

/**
 * Deterministic world-space bounding-box grounding & contact-AO helper:
 *   - Measures every registered or auto-discovered prop across ALL 11 categories (`dumbbell`,
 *     `kettlebells`, `spinBikes`, `racks`, `stanPlinth`, `cafeSets`, `trees`, `benches`,
 *     `ramps`, `pavilions`, `berms`), unpacking multi-prop container groups and baked ramp islands
 *     so ZERO multi-block bounding boxes or oversized road AO decals ever occur!
 *   - Snaps any residual float to `0.000m` (`|minY - surfaceTopY| <= 0.0005m` -> `maxFloatMm <= 0.5`).
 *   - Attaches right-sized grounded contact-AO decals inside an idempotent `V5_ContactAO_Decals` group.
 *   - Populates `window.__V5_GROUNDING_AUDIT__` and returns `{ pass, maxFloatMm, propCount, items, byCategory }`.
 */
export function auditAndGroundPropsZeroFloat(THREE, rootGroup, rules = {}) {
  if (!THREE || !rootGroup) {
    return {
      pass: false,
      maxFloatMm: Infinity,
      propCount: 0,
      items: [],
      byCategory: {},
    };
  }

  // Ensure even matrixAutoUpdate=false static groups have up-to-date world matrices
  rootGroup.traverse((obj) => {
    if (obj.matrixAutoUpdate) obj.updateMatrix();
  });
  rootGroup.updateMatrixWorld(true);

  // Remove any previous V5 contact-AO decal group idempotently before measuring
  const decalHost = rules.decalParent || rootGroup;
  const existingDecalGroup = decalHost.getObjectByName("V5_ContactAO_Decals");
  if (existingDecalGroup && existingDecalGroup.parent) {
    existingDecalGroup.parent.remove(existingDecalGroup);
  }

  const surfaceTopFn =
    typeof rules.getSurfaceTopY === "function"
      ? rules.getSurfaceTopY
      : getDefaultCampusSurfaceTopY;
  const addContactAO = rules.addContactAO !== false;
  const maxDecals = rules.maxDecals ?? 320;

  const candidates = [];
  const seenUuids = new Set();

  const shouldUnpackContainerGroup = (obj, catHint) => {
    if (!obj || !obj.isGroup || obj.children.length === 0 || obj.userData?.groundAsSingleUnit) {
      return false;
    }
    // Never unpack Stan's rigid monument assembly (plinth + skeleton move together so feet stay on +0.560m plinth!)
    if (catHint === "stanPlinth" || /Stan.*Monument|stanHolder|Stan_TRex/i.test(obj.name || "")) {
      return false;
    }
    if (CONTAINER_GROUP_NAME_RE.test(obj.name || "")) {
      return true;
    }
    if (obj.children.length >= 2) {
      let matchingChildren = 0;
      for (let i = 0; i < obj.children.length; i++) {
        const ch = obj.children[i];
        if (isReplacedLegacyNode(ch)) continue;
        if (inferPropCategoryFromName(ch.name, ch.userData)) matchingChildren++;
      }
      if (matchingChildren >= 2) return true;

      // Also unpack any unnamed multi-object container whose horizontal span exceeds 30m while children are separate placements
      const b = computePhysicalWorldBox(THREE, obj, true);
      if (b && (b.max.x - b.min.x > 30.0 || b.max.z - b.min.z > 30.0)) {
        const nonMeshGroups = obj.children.filter((c) => !isReplacedLegacyNode(c) && (c.isGroup || c.isInstancedMesh));
        if (nonMeshGroups.length >= 2) return true;
      }
    }
    return false;
  };

  const registerCandidate = (
    node,
    category,
    explicitSurfaceY = undefined,
    label = undefined,
    allowCulled = false
  ) => {
    if (!node || seenUuids.has(node.uuid) || isReplacedLegacyNode(node)) return;
    if (node.userData?.isV5ContactAODecal) return;
    if (node.name && IGNORE_GROUNDING_NODE_RE.test(node.name)) return;

    if (shouldUnpackContainerGroup(node, category)) {
      seenUuids.add(node.uuid);
      for (let i = 0; i < node.children.length; i++) {
        const ch = node.children[i];
        if (isReplacedLegacyNode(ch)) continue;
        registerCandidate(
          ch,
          inferPropCategoryFromName(ch.name, ch.userData) || category,
          explicitSurfaceY,
          undefined,
          allowCulled
        );
      }
      return;
    }

    seenUuids.add(node.uuid);
    const resolvedCat = category || inferPropCategoryFromName(node.name, node.userData) || "misc";
    candidates.push({
      node,
      category: resolvedCat,
      explicitSurfaceY,
      allowCulled: allowCulled || resolvedCat === "stanPlinth",
      label:
        label ||
        node.name ||
        node.userData?.buildingId ||
        node.userData?.propId ||
        `${resolvedCat}_${candidates.length}`,
    });
  };

  if (Array.isArray(rules.props)) {
    for (let i = 0; i < rules.props.length; i++) {
      const entry = rules.props[i];
      if (!entry) continue;
      if (entry.isObject3D) {
        registerCandidate(entry, null, undefined, undefined, true);
      } else if (entry.node && entry.node.isObject3D) {
        registerCandidate(entry.node, entry.category, entry.surfaceTopY, entry.id || entry.name, true);
      }
    }
  }

  if (rules.categories && typeof rules.categories === "object") {
    for (const [cat, listOrGroup] of Object.entries(rules.categories)) {
      if (!listOrGroup) continue;
      if (Array.isArray(listOrGroup)) {
        for (const item of listOrGroup) {
          if (item?.isObject3D) registerCandidate(item, cat, undefined, undefined, true);
          else if (item?.node?.isObject3D) registerCandidate(item.node, cat, item.surfaceTopY, item.name, true);
        }
      } else if (listOrGroup.isObject3D) {
        registerCandidate(listOrGroup, cat, undefined, undefined, true);
      }
    }
  }

  if (rules.autoDiscover !== false) {
    const walkDiscover = (obj, inCulledOutdoorBatch = false) => {
      if (!obj || isReplacedLegacyNode(obj)) return;
      if (obj.userData?.isV5ContactAODecal) return;
      if (obj.name && IGNORE_GROUNDING_NODE_RE.test(obj.name)) return;

      const allowHere = inCulledOutdoorBatch || AUDIT_EVEN_IF_CULLED_RE.test(obj.name || "");
      if (!obj.visible && !allowHere) return;

      if (shouldUnpackContainerGroup(obj, null)) {
        const containerCat = inferPropCategoryFromName(obj.name, obj.userData);
        for (let i = 0; i < obj.children.length; i++) {
          const child = obj.children[i];
          if (isReplacedLegacyNode(child)) continue;
          if (child.name && IGNORE_GROUNDING_NODE_RE.test(child.name)) continue;
          const childCat = inferPropCategoryFromName(child.name, child.userData) || containerCat;
          if (childCat && !shouldUnpackContainerGroup(child, childCat)) {
            registerCandidate(child, childCat, undefined, undefined, allowHere);
          } else {
            walkDiscover(child, allowHere);
          }
        }
        return;
      }

      const cat = inferPropCategoryFromName(obj.name, obj.userData);
      if (cat) {
        registerCandidate(obj, cat, undefined, undefined, allowHere);
        return;
      }

      for (let i = 0; i < obj.children.length; i++) {
        walkDiscover(obj.children[i], allowHere);
      }
    };
    walkDiscover(rootGroup, false);
  }

  const decalGroup = new THREE.Group();
  decalGroup.name = "V5_ContactAO_Decals";
  decalGroup.userData.isV5ContactAODecal = true;

  const sharedDecalGeom = new THREE.PlaneGeometry(1.0, 1.0);
  sharedDecalGeom.rotateX(-Math.PI * 0.5);
  const sharedDecalTex = addContactAO ? buildSharedContactAoTexture(THREE) : null;
  const sharedDecalMat = addContactAO
    ? new THREE.MeshBasicMaterial({
        map: sharedDecalTex,
        transparent: true,
        opacity: rules.contactAoOpacity ?? 0.52,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      })
    : null;

  const items = [];
  const byCategory = {};
  for (const cat of REQUIRED_GROUNDING_CATEGORIES) {
    byCategory[cat] = { count: 0, maxFloatMm: 0.0 };
  }

  let maxFloatMm = 0.0;
  let instancedAdjustedCount = 0;
  let decalsAdded = 0;

  const instMat = new THREE.Matrix4();
  const instWorldMat = new THREE.Matrix4();
  const instBox = new THREE.Box3();
  const parentWorldScale = new THREE.Vector3(1, 1, 1);

  const pushCategoryDecal = (cat, cx, ySurf, cz, rawSpanX, rawSpanZ) => {
    if (!addContactAO || decalsAdded >= maxDecals) return;
    if (rawSpanX < 0.04 || rawSpanZ < 0.04) return;
    // Landscaped grass berms are curved mounds on sloped terrain; flat quad decals would clip or float
    if (cat === "berms") return;
    // Safety guard: never emit a decal for any unsplit campus-wide span (> 28m)
    if (rawSpanX > 28.0 || rawSpanZ > 28.0) return;

    let sx = rawSpanX * 1.18;
    let sz = rawSpanZ * 1.18;
    let opacityScale = 0.92;
    let yLift = 0.0018;

    if (cat === "dumbbell" || cat === "kettlebells") {
      sx = clamp(rawSpanX * 1.38, 0.22, 1.6);
      sz = clamp(rawSpanZ * 1.38, 0.22, 1.6);
      opacityScale = 1.46; // Rich grounded contact AO crease under 59AA hex dumbbell on Spin Studio floor!
      yLift = 0.0016;
    } else if (cat === "spinBikes" || cat === "racks") {
      sx = clamp(rawSpanX * 1.24, 0.35, 3.6);
      sz = clamp(rawSpanZ * 1.24, 0.35, 3.6);
      opacityScale = 1.22;
    } else if (cat === "trees") {
      // Trunk-collar root AO rather than wide 14m foliage canopy square
      sx = clamp(rawSpanX * 0.36, 1.35, 4.2);
      sz = clamp(rawSpanZ * 0.36, 1.35, 4.2);
      opacityScale = 0.78;
    } else if (cat === "stanPlinth") {
      sx = clamp(rawSpanX * 1.14, 1.8, 8.8);
      sz = clamp(rawSpanZ * 1.14, 1.8, 8.8);
      opacityScale = 0.95;
    } else if (cat === "pavilions") {
      sx = clamp(rawSpanX * 1.05, 4.0, 26.0);
      sz = clamp(rawSpanZ * 1.05, 4.0, 26.0);
      opacityScale = 0.65;
    } else {
      sx = clamp(sx, 0.18, 8.5);
      sz = clamp(sz, 0.18, 8.5);
    }

    const decal = new THREE.Mesh(
      sharedDecalGeom,
      Math.abs(opacityScale - 1.0) < 1e-3 ? sharedDecalMat : sharedDecalMat.clone()
    );
    if (Math.abs(opacityScale - 1.0) >= 1e-3) {
      decal.material.opacity = clamp(sharedDecalMat.opacity * opacityScale, 0.08, 0.84);
    }
    decal.name = "V5_ContactAO_Decal";
    decal.userData.isV5ContactAODecal = true;
    decal.position.set(cx, ySurf + yLift, cz);
    decal.scale.set(sx, 1.0, sz);
    decal.renderOrder = 2;
    decal.matrixAutoUpdate = false;
    decal.updateMatrix();
    decalGroup.add(decal);
    decalsAdded++;
  };

  for (let i = 0; i < candidates.length; i++) {
    const { node, category, explicitSurfaceY, allowCulled, label } = candidates[i];

    // Case A: GPU InstancedMesh (e.g., instanced trees, benches, racks, planters, tri-bins)
    if (node.isInstancedMesh && node.geometry) {
      if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
      const gBox = node.geometry.boundingBox;
      if (!gBox || gBox.isEmpty()) continue;

      const rawCount = node.count ?? 0;
      const bufCount = node.instanceMatrix?.count ?? 0;
      const count = rawCount > 0 ? Math.min(rawCount, bufCount) : bufCount;
      if (count <= 0) continue;

      let worstBeforeMm = 0.0;
      let worstAfterMm = 0.0;
      for (let idx = 0; idx < count; idx++) {
        node.getMatrixAt(idx, instMat);
        instWorldMat.multiplyMatrices(node.matrixWorld, instMat);
        instBox.copy(gBox).applyMatrix4(instWorldMat);
        const cx = 0.5 * (instBox.min.x + instBox.max.x);
        const cz = 0.5 * (instBox.min.z + instBox.max.z);
        const nodeExplicitY = Number.isFinite(explicitSurfaceY)
          ? explicitSurfaceY
          : node.userData?.explicitSurfaceY;
        const targetY = Number.isFinite(nodeExplicitY)
          ? nodeExplicitY
          : surfaceTopFn(cx, cz, category, node);
        const beforeDelta = instBox.min.y - targetY;
        worstBeforeMm = Math.max(worstBeforeMm, Math.abs(beforeDelta) * 1000.0);

        const nodeScaleY = Math.hypot(
          node.matrixWorld.elements[4],
          node.matrixWorld.elements[5],
          node.matrixWorld.elements[6]
        ) || 1.0;
        instMat.elements[13] -= beforeDelta / nodeScaleY;
        node.setMatrixAt(idx, instMat);

        instWorldMat.multiplyMatrices(node.matrixWorld, instMat);
        instBox.copy(gBox).applyMatrix4(instWorldMat);
        const afterMm = Math.abs(instBox.min.y - targetY) * 1000.0;
        worstAfterMm = Math.max(worstAfterMm, afterMm);
        instancedAdjustedCount++;

        if (idx < 24) {
          pushCategoryDecal(category, cx, targetY, cz, instBox.max.x - instBox.min.x, instBox.max.z - instBox.min.z);
        }
      }
      node.instanceMatrix.needsUpdate = true;

      if (!byCategory[category]) byCategory[category] = { count: 0, maxFloatMm: 0.0 };
      byCategory[category].count += count;
      byCategory[category].maxFloatMm = Math.max(byCategory[category].maxFloatMm, worstAfterMm);
      maxFloatMm = Math.max(maxFloatMm, worstAfterMm);

      items.push({
        name: label,
        category,
        isInstanced: true,
        instanceCount: count,
        beforeFloatMm: Number(worstBeforeMm.toFixed(4)),
        floatMm: Number(worstAfterMm.toFixed(4)),
      });
      continue;
    }

    // Case B: Standard Object3D / Group / Mesh prop
    refreshSubtreeWorldMatrices(node);
    const preBox = computePhysicalWorldBox(THREE, node, allowCulled);
    if (!preBox) continue;

    const spanX = preBox.max.x - preBox.min.x;
    const spanZ = preBox.max.z - preBox.min.z;

    // Special Case B1: Baked static multi-ramp batch (`Campus_Jump_Ramps_V4` spanning multiple JUMP_RAMPS)
    if (category === "ramps" && (spanX > 18.0 || spanZ > 18.0)) {
      const rampClusterMm = groundBakedMultiRampClusters(
        THREE,
        node,
        surfaceTopFn,
        pushCategoryDecal,
        byCategory,
        items
      );
      if (rampClusterMm !== null) {
        maxFloatMm = Math.max(maxFloatMm, rampClusterMm);
        continue;
      }
    }

    const cx = Number.isFinite(node.userData?.bx)
      ? node.userData.bx
      : 0.5 * (preBox.min.x + preBox.max.x);
    const cz = Number.isFinite(node.userData?.bz)
      ? node.userData.bz
      : 0.5 * (preBox.min.z + preBox.max.z);
    const targetSurfaceY = Number.isFinite(explicitSurfaceY)
      ? explicitSurfaceY
      : Number.isFinite(node.userData?.explicitSurfaceY)
        ? node.userData.explicitSurfaceY
        : surfaceTopFn(cx, cz, category, node);

    const beforeDeltaM = preBox.min.y - targetSurfaceY;
    const beforeFloatMm = Math.abs(beforeDeltaM) * 1000.0;

    if (Math.abs(beforeDeltaM) > 1e-9) {
      let parentScaleY = 1.0;
      if (node.parent && node.parent.matrixWorld) {
        node.parent.matrixWorld.decompose(_tmpPos(THREE), _tmpQuat(THREE), parentWorldScale);
        parentScaleY = Math.abs(parentWorldScale.y) > 1e-6 ? parentWorldScale.y : 1.0;
      }
      node.position.y -= beforeDeltaM / parentScaleY;
      refreshSubtreeWorldMatrices(node);
    }

    const postBox = computePhysicalWorldBox(THREE, node, allowCulled) || preBox;
    const postDeltaM = postBox.min.y - targetSurfaceY;
    const postFloatMm = Math.abs(postDeltaM) * 1000.0;

    pushCategoryDecal(
      category,
      0.5 * (postBox.min.x + postBox.max.x),
      targetSurfaceY,
      0.5 * (postBox.min.z + postBox.max.z),
      postBox.max.x - postBox.min.x,
      postBox.max.z - postBox.min.z
    );

    if (!byCategory[category]) byCategory[category] = { count: 0, maxFloatMm: 0.0 };
    byCategory[category].count += 1;
    byCategory[category].maxFloatMm = Math.max(byCategory[category].maxFloatMm, postFloatMm);
    maxFloatMm = Math.max(maxFloatMm, postFloatMm);

    items.push({
      name: label,
      category,
      x: Number(cx.toFixed(3)),
      z: Number(cz.toFixed(3)),
      surfaceTopY: Number(targetSurfaceY.toFixed(5)),
      minY: Number(postBox.min.y.toFixed(5)),
      beforeFloatMm: Number(beforeFloatMm.toFixed(4)),
      floatMm: Number(postFloatMm.toFixed(4)),
    });
  }

  if (addContactAO && decalsAdded > 0) {
    decalGroup.matrixAutoUpdate = false;
    decalGroup.updateMatrix();
    decalHost.add(decalGroup);
    decalGroup.updateMatrixWorld(true);
  }

  const objectPropCount = items.reduce(
    (sum, it) => sum + (it.isInstanced ? it.instanceCount : 1),
    0
  );
  const roundedMaxMm = Number(maxFloatMm.toFixed(4));
  const report = {
    pass: roundedMaxMm <= OMNI_V5_ENVIRONMENT_TELEMETRY.maxAllowedFloatMm,
    maxFloatMm: roundedMaxMm,
    thresholdMm: OMNI_V5_ENVIRONMENT_TELEMETRY.maxAllowedFloatMm,
    propCount: objectPropCount,
    nodeCount: items.length,
    instancedAdjustedCount,
    decalsAdded,
    byCategory,
    items,
  };

  if (typeof window !== "undefined") {
    window.__V5_GROUNDING_AUDIT__ = report;
    window.__V6_GROUNDING_AUDIT__ = report;
  }

  return report;
}

let _cachedTmpPos = null;
let _cachedTmpQuat = null;
function _tmpPos(THREE) {
  if (!_cachedTmpPos) _cachedTmpPos = new THREE.Vector3();
  return _cachedTmpPos;
}
function _tmpQuat(THREE) {
  if (!_cachedTmpQuat) _cachedTmpQuat = new THREE.Quaternion();
  return _cachedTmpQuat;
}
