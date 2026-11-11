import * as THREE from "../vendor/three.module.js";
import { mergeGeometries } from "../vendor/BufferGeometryUtils.js";
import {
  WORLD_BOUNDS,
  GYM_BREAKOUT_CONFIG,
  KINETIC_PINWHEELS,
  CAMPUS_ROADS,
  CAMPUS_INTERSECTIONS,
  CAMPUS_BUILDING_BLOCKS,
  JUMP_RAMPS,
  BAYVIEW_LANDING_RAMP,
  LANDING_RAMPS,
  MK_BOOST_PADS,
  TPU_SPAWNS,
  WAYMO_ROUTES,
} from "../contract.js";
import {
  createMulberry32,
  getOpenWorldEarthHeight,
  getOpenWorldTerrainHeight,
  getStevensCreekBridgeParam,
  evaluateJumpRampAtPoint,
} from "../rig/kin.js";
import {
  groundObjectToY,
  createOrganicFoliageGeometry,
  buildStanTRexStatue,
  buildAndroidBugdroidStatue,
  buildGiantDonutStatue,
  buildGingerbreadStatue,
  buildKitKatStatue,
  buildCupcakeStatue,
  buildIceCreamSandwichStatue,
  buildLollipopStatue,
  buildBayViewDragonscaleBuilding,
  buildGradientCanopyBuilding,
  buildShorelineAmphitheatre,
} from "./campus_worlds.js";
import {
  createAAAInstancedGrassSystem,
  isCampusGrassAllowedAt,
  buildGraniteCurbCollarRingGeometry,
  auditAndGroundPropsZeroFloat,
  getDefaultCampusSurfaceTopY,
  stevensCreekCenterZ,
  stevensCreekHalfWidthZ,
  OMNI_V5_ENVIRONMENT_TELEMETRY,
} from "./v5_aaa_environment.js";
import {
  createStanEncounterController,
  DEFAULT_COURTYARD_CAFE_SPOTS,
} from "./v5_stan_encounter.js";
import * as MaterialsMod from "./materials.js";

/**
 * Builds a crisp interlocking pale silver-grey hexagonal granite paver material (`#B6B4AE`, roughness `0.86`)
 * for the Google Visitor Experience / Gradient Canopy forecourt (`jay_google_visitor_experience_front.png`).
 */
function createVisitorHexPaversMaterialFallback() {
  if (typeof document === "undefined") {
    return new THREE.MeshStandardMaterial({
      name: "Visitor_Hex_Pavers_V6",
      color: "#B6B4AE",
      roughness: 0.86,
      metalness: 0.0,
      envMapIntensity: 0.35,
    });
  }
  const w = 512;
  const h = 512;
  const albC = document.createElement("canvas");
  albC.width = w;
  albC.height = h;
  const aCtx = albC.getContext("2d");
  const img = aCtx.createImageData(w, h);
  const bumpC = document.createElement("canvas");
  bumpC.width = w;
  bumpC.height = h;
  const bCtx = bumpC.getContext("2d");
  const bImg = bCtx.createImageData(w, h);

  const NX = 10;
  const NY = 6;
  const SQRT3 = 1.7320508;
  const cellHash = (ix, iy) => {
    let n = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + 0x51a7f3) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  for (let y = 0; y < h; y++) {
    const v = (y / h) * NY * SQRT3;
    for (let x = 0; x < w; x++) {
      const u = (x / w) * NX;
      const iA = Math.round(u);
      const jA = Math.round(v / SQRT3);
      const dxA = u - iA;
      const dyA = v - jA * SQRT3;
      const d2A = dxA * dxA + dyA * dyA;

      const iB = Math.round(u - 0.5);
      const jB = Math.round((v - 0.5 * SQRT3) / SQRT3);
      const dxB = u - (iB + 0.5);
      const dyB = v - (jB + 0.5) * SQRT3;
      const d2B = dxB * dxB + dyB * dyB;

      let lx, ly, cxId, cyId;
      if (d2A <= d2B) {
        lx = Math.abs(dxA);
        ly = Math.abs(dyA);
        cxId = ((iA % NX) + NX) % NX;
        cyId = (((jA * 2) % (NY * 2)) + NY * 2) % (NY * 2);
      } else {
        lx = Math.abs(dxB);
        ly = Math.abs(dyB);
        cxId = ((iB % NX) + NX) % NX;
        cyId = (((jB * 2 + 1) % (NY * 2)) + NY * 2) % (NY * 2);
      }
      const hexDist = Math.max(lx, 0.5 * lx + 0.8660254 * ly);
      const edgeDist = Math.max(0.0, 0.5 - hexDist);
      const hTone = cellHash(cxId, cyId);
      const grain = cellHash(x * 3 + 7, y * 5 + 11);

      let base = 176.0 + hTone * 16.0 + (grain - 0.5) * 14.0;
      let bumpV = 186.0 + (grain - 0.5) * 28.0;
      if (edgeDist < 0.026) {
        const jf = 1.0 - edgeDist / 0.026;
        base = base * (1.0 - 0.68 * jf) + 76.0 * (0.68 * jf);
        bumpV = 48.0 + (1.0 - jf) * 42.0;
      } else if (edgeDist < 0.056) {
        const bf = 1.0 - (edgeDist - 0.026) / 0.030;
        base -= bf * 9.0;
        bumpV -= bf * 34.0;
      }
      const p = (y * w + x) * 4;
      img.data[p] = Math.max(54, Math.min(222, Math.round(base + 1.0)));
      img.data[p + 1] = Math.max(52, Math.min(220, Math.round(base - 0.5)));
      img.data[p + 2] = Math.max(48, Math.min(214, Math.round(base - 5.0)));
      img.data[p + 3] = 255;
      const bv = Math.max(16, Math.min(244, Math.round(bumpV)));
      bImg.data[p] = bv;
      bImg.data[p + 1] = bv;
      bImg.data[p + 2] = bv;
      bImg.data[p + 3] = 255;
    }
  }
  aCtx.putImageData(img, 0, 0);
  bCtx.putImageData(bImg, 0, 0);

  const map = new THREE.CanvasTexture(albC);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const bumpMap = new THREE.CanvasTexture(bumpC);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.anisotropy = 8;

  return new THREE.MeshStandardMaterial({
    name: "Visitor_Hex_Pavers_V6",
    color: "#ffffff",
    map,
    bumpMap,
    bumpScale: 0.008,
    roughness: 0.86,
    metalness: 0.0,
    envMapIntensity: 0.36,
  });
}

const _dummy = new THREE.Object3D();
const _mat4 = new THREE.Matrix4();
const _mat4Fade = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _quatCar = new THREE.Quaternion();
const _quatSpin = new THREE.Quaternion();
const _quatSteer = new THREE.Quaternion();
const _axisX = new THREE.Vector3(1, 0, 0);
const _axisY = new THREE.Vector3(0, 1, 0);
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler();
const _color = new THREE.Color();
const _box3Work = new THREE.Box3();
const _v3WorkA = new THREE.Vector3();
const _v3WorkB = new THREE.Vector3();

function createSubPixelRadialMoteTexture(size = 64, corePower = 4.2) {
  const data = new Uint8Array(size * size * 4);
  for (let py = 0; py < size; py++) {
    const ny = ((py + 0.5) / size) * 2.0 - 1.0;
    for (let px = 0; px < size; px++) {
      const nx = ((px + 0.5) / size) * 2.0 - 1.0;
      const r = Math.hypot(nx, ny);
      const idx = (py * size + px) * 4;
      data[idx] = 255;
      data[idx + 1] = 250;
      data[idx + 2] = 238;
      data[idx + 3] = r >= 1.0 ? 0 : Math.round(Math.pow(1.0 - r * r, corePower) * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Safely normalizes attributes (pos, normal, uv) and merges static BufferGeometries
 * into 1 draw call per material across the `480m x 480m` Mountain View Campus.
 */
function mergeCampusStaticGeometries(geoms) {
  if (!geoms || geoms.length === 0) return null;
  const prepared = [];
  let allHaveColor = true;
  for (const raw of geoms) {
    if (!raw) continue;
    const g = raw.index ? raw.toNonIndexed() : raw.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    const count = g.attributes.position.count;
    if (!g.attributes.uv) {
      g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    }
    if (!g.attributes.color) {
      allHaveColor = false;
    }
    for (const key of Object.keys(g.attributes)) {
      if (key !== "position" && key !== "normal" && key !== "uv" && key !== "color") {
        g.deleteAttribute(key);
      }
    }
    prepared.push(g);
  }
  if (prepared.length === 0) return null;
  if (!allHaveColor) {
    for (const g of prepared) {
      if (g.attributes.color) g.deleteAttribute("color");
    }
  }
  const merged = mergeGeometries(prepared, false);
  for (const g of prepared) g.dispose();
  return merged;
}

/**
 * Merges all static child `Mesh` geometries inside a landmark/prop `Group` by
 * `(material.uuid, castShadow, receiveShadow)` so complex sculpted buildings and
 * parked companion bikes render in 4–7 draw calls instead of 60–130!
 */
function bakeStaticGroupByMaterial(group) {
  if (!group || (group.isMesh && group.children.length === 0)) return group;
  group.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map();
  const toRemove = [];

  group.traverse((child) => {
    if (child === group) return;
    if (!child.isMesh || child.isInstancedMesh || !child.geometry || !child.visible) return;
    if (Array.isArray(child.material) || !child.material) return;
    const mat = child.material;

    const hasTexture = Boolean(
      mat.map || mat.normalMap || mat.roughnessMap || mat.metalnessMap || mat.emissiveMap || mat.alphaMap
    );
    const isBrightEmissive = Boolean(
      mat.emissive &&
        (mat.emissiveIntensity ?? 1.0) > 0.22 &&
        mat.emissive.r + mat.emissive.g + mat.emissive.b > 0.12
    );
    const isGlossyFiberglass = (mat.roughness ?? 0.5) < 0.30;
    const canBakeVertexColor =
      !hasTexture &&
      !mat.transparent &&
      !isBrightEmissive &&
      !isGlossyFiberglass &&
      !mat.polygonOffset &&
      Boolean(mat.color) &&
      (mat.isMeshStandardMaterial || mat.isMeshLambertMaterial || mat.isMeshBasicMaterial);

    const isMetallic = (mat.metalness ?? 0.0) >= 0.45;
    const key = canBakeVertexColor
      ? isMetallic
        ? "__VC_METALLIC__"
        : "__VC_DIELECTRIC__"
      : mat.uuid;

    let entry = buckets.get(key);
    if (!entry) {
      entry = {
        isVertexColorBucket: canBakeVertexColor,
        isMetallic,
        mat: canBakeVertexColor ? null : mat,
        roughSum: 0.0,
        metalSum: 0.0,
        weightSum: 0,
        castShadow: Boolean(child.castShadow),
        receiveShadow: Boolean(child.receiveShadow),
        geoms: [],
      };
      buckets.set(key, entry);
    } else {
      if (child.castShadow) entry.castShadow = true;
      if (child.receiveShadow) entry.receiveShadow = true;
    }

    const rawG = child.geometry;
    const g = rawG.index ? rawG.toNonIndexed() : rawG.clone();
    const relMat = new THREE.Matrix4().multiplyMatrices(rootInv, child.matrixWorld);
    g.applyMatrix4(relMat);
    if (!g.attributes.normal) g.computeVertexNormals();
    else g.normalizeNormals();
    if (relMat.determinant() < 0) {
      const pos = g.attributes.position;
      const norm = g.attributes.normal;
      const uv = g.attributes.uv;
      for (let i = 0; i < pos.count; i += 3) {
        for (const attr of [pos, norm, uv]) {
          if (!attr) continue;
          const sz = attr.itemSize;
          for (let c = 0; c < sz; c++) {
            const tmp = attr.array[(i + 1) * sz + c];
            attr.array[(i + 1) * sz + c] = attr.array[(i + 2) * sz + c];
            attr.array[(i + 2) * sz + c] = tmp;
          }
        }
      }
    }

    if (canBakeVertexColor) {
      const vCount = g.attributes.position.count;
      const colArr = new Float32Array(vCount * 3);
      const existingCol = mat.vertexColors ? g.attributes.color : null;
      const cr = mat.color.r;
      const cg = mat.color.g;
      const cb = mat.color.b;
      for (let i = 0; i < vCount; i++) {
        colArr[i * 3] = existingCol ? existingCol.getX(i) * cr : cr;
        colArr[i * 3 + 1] = existingCol ? existingCol.getY(i) * cg : cg;
        colArr[i * 3 + 2] = existingCol ? existingCol.getZ(i) * cb : cb;
      }
      g.setAttribute("color", new THREE.BufferAttribute(colArr, 3));
      entry.roughSum += (mat.roughness ?? 0.5) * vCount;
      entry.metalSum += (mat.metalness ?? 0.05) * vCount;
      entry.weightSum += vCount;
    }

    entry.geoms.push(g);
    toRemove.push(child);
  });

  for (const m of toRemove) {
    if (m.parent) m.parent.remove(m);
  }

  for (const entry of buckets.values()) {
    const merged = mergeCampusStaticGeometries(entry.geoms);
    if (!merged) continue;
    let outMat = entry.mat;
    if (entry.isVertexColorBucket) {
      const w = Math.max(1, entry.weightSum);
      outMat = new THREE.MeshStandardMaterial({
        color: "#ffffff",
        vertexColors: true,
        roughness: THREE.MathUtils.clamp(entry.roughSum / w, 0.16, 0.92),
        metalness: THREE.MathUtils.clamp(entry.metalSum / w, 0.0, 0.94),
      });
    }
    const mesh = new THREE.Mesh(merged, outMat);
    mesh.castShadow = entry.castShadow;
    mesh.receiveShadow = entry.receiveShadow;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.add(mesh);
  }
  return group;
}

// ============================================================================
// EXACT CARRIAGEWAY SDF, ORTHOGONAL 3.60M CORNER FILLETS & CURBSIDE WAYMO BAYS
// ============================================================================
const CORNER_FILLET_RADIUS = 3.60;

/**
 * Active dark-asphalt carriageway segments (clipped at T-intersections & pedestrian plaza
 * gateways so asphalt and plazas meet cleanly at flush granite headers with 0.000m overlap).
 */
const ACTIVE_ASPHALT_SEGMENTS = [
  { id: "charleston_rd", x1: -195.0, z1: 76.0, x2: 164.0, z2: 76.0, halfW: 7.0 },
  { id: "amphitheatre_pkwy", x1: -195.0, z1: -18.0, x2: 164.0, z2: -18.0, halfW: 7.0 },
  { id: "gradient_driveway", x1: -56.0, z1: 116.0, x2: 56.0, z2: 116.0, halfW: 5.25 },
  { id: "north_creek_connector", x1: -7.0, z1: -86.0, x2: 164.0, z2: -86.0, halfW: 5.75 },
  { id: "shoreline_blvd", x1: 0.0, z1: 121.25, x2: 0.0, z2: -86.0, halfW: 7.0 },
  { id: "west_campus_ave", x1: -118.0, z1: 86.60, x2: -118.0, z2: -11.0, halfW: 6.5 },
];

/**
 * 5 Legal Curbside Autonomous Waymo Gen 6 Pickup / Drop-Off Bays recessed smoothly into
 * the curb line along major campus avenues (clear of moving Waymo lanes & bike lanes!).
 */
const CURBSIDE_WAYMO_BAYS = [
  {
    id: "waymo_parked_canopy",
    roadId: "gradient_driveway",
    x: 33.5,
    z: 122.15,
    yaw: -Math.PI * 0.5, // Facing West along Gradient Canopy Drop-Off
    bayHalfLen: 4.8,
    bayDepth: 2.35,
    roadEdgeCoord: 121.25,
    axis: "x",
    sideSign: 1, // +Z side of gradient_driveway (`z in [121.25, 123.60]`)
  },
  {
    id: "waymo_parked_charleston",
    roadId: "charleston_rd",
    x: -44.0,
    z: 84.05,
    yaw: -Math.PI * 0.5, // Facing West on North side of Charleston Rd
    bayHalfLen: 4.8,
    bayDepth: 2.35,
    roadEdgeCoord: 83.0,
    axis: "x",
    sideSign: 1, // +Z side (`z in [83.0, 85.35]`)
  },
  {
    id: "waymo_parked_android_ave",
    roadId: "west_campus_ave",
    x: -125.55,
    z: 42.0,
    yaw: Math.PI, // Facing South on West side of Googleplex West Ave
    bayHalfLen: 4.8,
    bayDepth: 2.35,
    roadEdgeCoord: -124.5,
    axis: "z",
    sideSign: -1, // -X side (`x in [-126.85, -124.5]`)
  },
  {
    id: "waymo_parked_plex_west",
    roadId: "amphitheatre_pkwy",
    x: -64.0,
    z: -26.05,
    yaw: Math.PI * 0.5, // Facing East on South side of Amphitheatre Pkwy
    bayHalfLen: 4.8,
    bayDepth: 2.35,
    roadEdgeCoord: -25.0,
    axis: "x",
    sideSign: -1, // -Z side (`z in [-27.35, -25.0]`)
  },
  {
    id: "waymo_parked_amphitheatre_east",
    roadId: "amphitheatre_pkwy",
    x: 112.0,
    z: -9.95,
    yaw: -Math.PI * 0.5, // Facing West on North side of Amphitheatre Pkwy
    bayHalfLen: 4.8,
    bayDepth: 2.35,
    roadEdgeCoord: -11.0,
    axis: "x",
    sideSign: 1, // +Z side (`z in [-11.0, -8.65]`)
  },
  {
    id: "waymo_parked_bayview_north",
    roadId: "amphitheatre_pkwy",
    x: 141.5,
    z: -9.95,
    yaw: -Math.PI * 0.5, // Facing West beside Bay View Dragonscale North Plaza
    bayHalfLen: 4.8,
    bayDepth: 2.35,
    roadEdgeCoord: -11.0,
    axis: "x",
    sideSign: 1,
  },
  {
    id: "waymo_parked_bayview_south",
    roadId: "charleston_rd",
    x: 138.0,
    z: 67.95,
    yaw: Math.PI * 0.5, // Facing East beside Bay View Dragonscale South Approach
    bayHalfLen: 4.8,
    bayDepth: 2.35,
    roadEdgeCoord: 69.0,
    axis: "x",
    sideSign: -1,
  },
];

/**
 * Exact orthogonal intersection corners (`R = 3.60m` quarter-circle fillet arcs).
 * Every corner connects vertical curb `|x - ix| = halfWV` smoothly to horizontal curb `|z - iz| = halfWH`.
 */
const INTERSECTION_CORNER_FILLETS = (() => {
  const list = [];
  const addCorners = (ix, iz, halfWV, halfWH, quadrants, hasAda = true) => {
    for (const [sx, sz] of quadrants) {
      list.push({
        ix,
        iz,
        halfWV,
        halfWH,
        sx,
        sz,
        rFillet: CORNER_FILLET_RADIUS,
        cx: ix + sx * (halfWV + CORNER_FILLET_RADIUS),
        cz: iz + sz * (halfWH + CORNER_FILLET_RADIUS),
        hasAda,
      });
    }
  };
  // T-intersection: N Shoreline Blvd (`x=0, halfW=7.0`) meets Gradient Driveway (`z=116, halfW=5.25`) on -Z side
  addCorners(0.0, 116.0, 7.0, 5.25, [[-1, -1], [1, -1]], true);
  // 4-way: N Shoreline Blvd (`x=0, 7.0`) x Charleston Rd (`z=76, 7.0`)
  addCorners(0.0, 76.0, 7.0, 7.0, [[-1, -1], [1, -1], [-1, 1], [1, 1]], true);
  // Charleston Rd (`z=76, 7.0`) x West Campus Ave (`x=-118, 6.5` south + Android Plaza gateway north)
  addCorners(-118.0, 76.0, 6.5, 7.0, [[-1, -1], [1, -1], [-1, 1], [1, 1]], true);
  // 4-way: N Shoreline Blvd (`x=0, 7.0`) x Amphitheatre Pkwy (`z=-18, 7.0`)
  addCorners(0.0, -18.0, 7.0, 7.0, [[-1, -1], [1, -1], [-1, 1], [1, 1]], true);
  // North-side T-intersection ONLY: West Campus Ave (`x=-118, 6.5`) terminates cleanly at Amphitheatre Pkwy (`z=-18, 7.0`)
  addCorners(-118.0, -18.0, 6.5, 7.0, [[-1, 1], [1, 1]], true);
  // East-North L/T-corner ONLY: N Shoreline Blvd (`x=0, 7.0`) meets North Bayshore Trail (`z=-86, 5.75`, `x >= -7`)
  addCorners(0.0, -86.0, 7.0, 5.75, [[1, 1]], true);
  return list;
})();

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

/**
 * Exact signed distance to the unified dark-asphalt carriageway network (`< 0` inside asphalt,
 * `0` on asphalt/gutter seam, `> 0` outside), including `R = 3.60m` intersection corner fillets
 * and the 5 recessed curbside Waymo pickup bays.
 */
function signedAsphaltClearance(x, z) {
  let minSd = Infinity;
  for (let i = 0; i < ACTIVE_ASPHALT_SEGMENTS.length; i++) {
    const s = ACTIVE_ASPHALT_SEGMENTS[i];
    const d = sdOrientedSegmentBox(x, z, s.x1, s.z1, s.x2, s.z2, s.halfW);
    if (d < minSd) minSd = d;
  }
  // Smooth `R = 3.60m` concave corner fillet spandrels
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
      const r = Math.hypot(x - c.cx, z - c.cz);
      const sdFillet = c.rFillet - r; // `< 0` inside asphalt spandrel (`r > 3.60m`), `> 0` on sidewalk side
      if (sdFillet < minSd) minSd = sdFillet;
    }
  }
  // 5 Curbside Waymo Gen 6 pickup bays
  for (let i = 0; i < CURBSIDE_WAYMO_BAYS.length; i++) {
    const b = CURBSIDE_WAYMO_BAYS[i];
    if (b.axis === "x") {
      const bz = b.roadEdgeCoord + b.sideSign * (b.bayDepth * 0.5);
      const d = sdOrientedSegmentBox(
        x,
        z,
        b.x - b.bayHalfLen,
        bz,
        b.x + b.bayHalfLen,
        bz,
        b.bayDepth * 0.5
      );
      if (d < minSd) minSd = d;
    } else {
      const bx = b.roadEdgeCoord + b.sideSign * (b.bayDepth * 0.5);
      const d = sdOrientedSegmentBox(
        x,
        z,
        bx,
        b.z - b.bayHalfLen,
        bx,
        b.z + b.bayHalfLen,
        b.bayDepth * 0.5
      );
      if (d < minSd) minSd = d;
    }
  }
  // Eastern waterfront intersections (`x = 156` at `z = 76, -18, -86`)
  for (const iz of [76.0, -18.0, -86.0]) {
    const rHub = iz === -86.0 ? 8.6 : 9.4;
    const dHub = Math.hypot(x - 156.0, z - iz) - rHub;
    if (dHub < minSd) minSd = dHub;
  }
  // Stevens Creek Bridge north plaza hub `(52, -86)`
  {
    const dBridgeHub = Math.hypot(x - 52.0, z - -86.0) - 8.6;
    if (dBridgeHub < minSd) minSd = dBridgeHub;
  }
  return minSd;
}

/**
 * Signed clearance (`m`) to ANY vehicular/promenade carriageway (`asphalt` + `pavers` + `bridge`),
 * `< 0` inside carriageway, `>= 0` outside carriageway!
 */
function signedCarriagewayClearance(x, z) {
  let minSd = signedAsphaltClearance(x, z);
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

/**
 * Subtracts a list of `[cut0, cut1]` 1D intervals from `[minS, maxS]`, returning clean
 * non-overlapping sub-intervals `[a, b]` with `b - a > 0.08m`.
 */
function subtract1DIntervals(minS, maxS, cuts) {
  let spans = [[minS, maxS]];
  for (let i = 0; i < cuts.length; i++) {
    const [c0, c1] = cuts[i];
    if (c1 <= c0) continue;
    const next = [];
    for (let j = 0; j < spans.length; j++) {
      const [a, b] = spans[j];
      if (c1 <= a || c0 >= b) {
        next.push([a, b]);
      } else {
        if (c0 - a > 0.08) next.push([a, c0]);
        if (b - c1 > 0.08) next.push([c1, b]);
      }
    }
    spans = next;
  }
  return spans;
}

/**
 * Builds a terrain-conforming circular/annular plaza disc (`innerR = 0` for full disc)
 * whose vertices hug `getOpenWorldTerrainHeight(wx, wz) + yOffset`, optionally clipping
 * any triangle that intrudes within `minAsphaltClearance` of any asphalt road/crosswalk!
 */
function makeTerrainConformingDisc(
  cx,
  cz,
  outerR,
  rings = 6,
  segs = 36,
  yOffset = 0.007,
  uvScale = 0.24,
  innerR = 0.0,
  recessDisc = null,
  clipFn = null
) {
  const pos = [];
  const uvs = [];
  const indices = [];

  for (let ir = 0; ir <= rings; ir++) {
    const r = innerR + (ir / rings) * (outerR - innerR);
    for (let is = 0; is <= segs; is++) {
      const a = (is / segs) * Math.PI * 2;
      const wx = cx + Math.cos(a) * r;
      const wz = cz + Math.sin(a) * r;
      let wy = getOpenWorldEarthHeight(wx, wz) + yOffset;
      if (recessDisc && Math.hypot(wx - recessDisc.x, wz - recessDisc.z) < recessDisc.r) {
        wy -= 0.035;
      }
      pos.push(wx, wy, wz);
      uvs.push((wx - cx) * uvScale, (wz - cz) * uvScale);

      if (ir < rings && is < segs) {
        const i00 = ir * (segs + 1) + is;
        const i01 = i00 + 1;
        const i10 = (ir + 1) * (segs + 1) + is;
        const i11 = i10 + 1;
        indices.push(i00, i01, i10, i01, i11, i10);
      }
    }
  }

  const finalIndices = [];
  if (clipFn) {
    for (let t = 0; t < indices.length; t += 3) {
      const ia = indices[t];
      const ib = indices[t + 1];
      const ic = indices[t + 2];
      const ax = pos[ia * 3], az = pos[ia * 3 + 2];
      const bx = pos[ib * 3], bz = pos[ib * 3 + 2];
      const gx = pos[ic * 3], gz = pos[ic * 3 + 2];
      const mx = (ax + bx + gx) / 3.0;
      const mz = (az + bz + gz) / 3.0;
      if (clipFn(ax, az) && clipFn(bx, bz) && clipFn(gx, gz) && clipFn(mx, mz)) {
        finalIndices.push(ia, ib, ic);
      }
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(clipFn ? finalIndices : indices);
  geom.computeVertexNormals();
  return geom;
}

function makeRoadQuad(
  x1,
  z1,
  x2,
  z2,
  halfWLeft,
  halfWRight,
  y0,
  y1 = y0,
  uvScaleLen = 0.12,
  vOffset = 0.0,
  yRight0 = y0,
  yRight1 = y1
) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len = Math.hypot(dx, dz) || 1.0;
  const fx = dx / len;
  const fz = dz / len;
  // Right unit vector in (X, Z) when facing (fx, fz): (-fz, fx)
  const rx = -fz;
  const rz = fx;

  const swap = halfWLeft > halfWRight;
  const wL = swap ? halfWRight : halfWLeft;
  const wR = swap ? halfWLeft : halfWRight;
  const yl0 = swap ? yRight0 : y0;
  const yl1 = swap ? yRight1 : y1;
  const yr0 = swap ? y0 : yRight0;
  const yr1 = swap ? y1 : yRight1;

  const p00 = [x1 + rx * wL, yl0, z1 + rz * wL];
  const p10 = [x1 + rx * wR, yr0, z1 + rz * wR];
  const p01 = [x2 + rx * wL, yl1, z2 + rz * wL];
  const p11 = [x2 + rx * wR, yr1, z2 + rz * wR];

  const geom = new THREE.BufferGeometry();
  // CCW (+Y upward) winding: (p10 - p00) x (p01 - p00) = (-fz, 0, fx) x (fx, 0, fz) = (0, +1, 0)
  const pos = new Float32Array([
    ...p00, ...p10, ...p01,
    ...p10, ...p11, ...p01,
  ]);
  const v0 = vOffset * uvScaleLen;
  const v1 = (vOffset + len) * uvScaleLen;
  const uv = new Float32Array([
    0, v0, 1, v0, 0, v1,
    1, v0, 1, v1, 0, v1,
  ]);
  geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geom.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geom.computeVertexNormals();
  return geom;
}

/**
 * Extrudes a 3D beveled Sierra Granite curb segment (`+0.115m` top crown with `45°` top lip
 * chamfer + battered street riser + tucked sidewalk back lip) from `(ax, az)` to `(bx, bz)`.
 * `side > 0` means street/gutter is toward smaller lateral offset (`innerOff < outerOff`);
 * `side < 0` means street/gutter is toward larger lateral offset (`innerOff > outerOff`).
 */
function makeBeveledGraniteCurbSegment(
  ax,
  az,
  bx,
  bz,
  streetOff,
  sidewalkOff,
  baseY0,
  baseY1,
  topY0,
  topY1,
  vOffset = 0.0,
  capStart = false,
  capEnd = false
) {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz) || 1.0;
  const fx = dx / len;
  const fz = dz / len;
  const rx = -fz;
  const rz = fx;

  // Profile stations from `u = 0` (street gutter toe) to `u = 1` (back sidewalk edge)
  const prof = [
    { t: 0.00, hFrac: 0.00, u: 0.00 }, // Gutter toe
    { t: 0.16, hFrac: 0.82, u: 0.34 }, // Battered vertical riser top
    { t: 0.34, hFrac: 1.00, u: 0.52 }, // 45-degree beveled chamfer lip
    { t: 1.00, hFrac: 1.00, u: 0.88 }, // Granite crown back edge
    { t: 1.00, hFrac: 0.72, u: 1.00 }, // Tucked back edge inside sidewalk
  ];

  const swapWinding = streetOff > sidewalkOff;
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

  for (let k = 0; k < prof.length - 1; k++) {
    const pA0 = ptAt(false, prof[k]);
    const pB0 = ptAt(false, prof[k + 1]);
    const pA1 = ptAt(true, prof[k]);
    const pB1 = ptAt(true, prof[k + 1]);
    const uA = prof[k].u;
    const uB = prof[k + 1].u;
    if (!swapWinding) {
      pos.push(...pA0, ...pB0, ...pA1, ...pB0, ...pB1, ...pA1);
      uvs.push(uA, v0, uB, v0, uA, v1, uB, v0, uB, v1, uA, v1);
    } else {
      pos.push(...pB0, ...pA0, ...pB1, ...pA0, ...pA1, ...pB1);
      uvs.push(uB, v0, uA, v0, uB, v1, uA, v0, uA, v1, uB, v1);
    }
  }

  // Optional clean endcaps where a straight curb terminates at a pedestrian threshold
  if (capStart || capEnd) {
    for (const isEnd of [false, true]) {
      if ((!isEnd && !capStart) || (isEnd && !capEnd)) continue;
      const c0 = ptAt(isEnd, { t: 0.0, hFrac: 0.0 });
      const c1 = ptAt(isEnd, { t: 0.22, hFrac: 1.0 });
      const c2 = ptAt(isEnd, { t: 1.0, hFrac: 1.0 });
      const c3 = ptAt(isEnd, { t: 1.0, hFrac: 0.0 });
      const flip = isEnd !== swapWinding;
      if (flip) {
        pos.push(...c0, ...c1, ...c2, ...c0, ...c2, ...c3);
      } else {
        pos.push(...c0, ...c2, ...c1, ...c0, ...c3, ...c2);
      }
      uvs.push(0, 0, 0.3, 0.4, 1, 0.4, 0, 0, 1, 0.4, 1, 0);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.computeVertexNormals();
  return geom;
}

/**
 * Builds a 6-blade curved 3-segment tapered 3D botanical grass tuft (`0.16m–0.31m` height,
 * `18mm` base -> `1.5mm` pointed tip = `36` triangles per tuft) for GPU-instanced campus lawns.
 */
function createBotanicalGrassTuftGeometry(isSoftwareRenderer = false) {
  const rng = createMulberry32(0x67a55b1d);
  const isCpuCapture = Boolean(
    isSoftwareRenderer ||
      (typeof window !== "undefined" && window.__CAPTURE_UNDERLYING_SWIFTSHADER__)
  );
  const bladeCount = isCpuCapture ? 4 : 6;
  const segs = isCpuCapture ? 2 : 3;
  const pos = [];
  const norm = [];
  const uvs = [];
  const indices = [];

  for (let b = 0; b < bladeCount; b++) {
    const phi = (b / bladeCount) * Math.PI * 2.0 + (rng() - 0.5) * 0.42;
    const rad = 0.018 + rng() * 0.115;
    const rootX = Math.cos(phi) * rad;
    const rootZ = Math.sin(phi) * rad;
    const bladeYaw = phi + (rng() - 0.5) * 0.55;
    const bladeH = 0.16 + rng() * 0.15; // 0.16m .. 0.31m natural botanical variation
    const archOut = (0.052 + rng() * 0.085) * (bladeH / 0.24);
    const baseHalfW = 0.01152; // 1.28x wider (~23mm full width at root)
    const tipHalfW = 0.00096; // 1.9mm pointed tip
    const bladeSeed = (b + 0.5) / bladeCount;

    const dirX = Math.cos(bladeYaw);
    const dirZ = Math.sin(bladeYaw);
    const sideX = -dirZ;
    const sideZ = dirX;

    const baseVert = pos.length / 3;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const taper =
        t < 0.7
          ? 1.0 - 0.38 * (t / 0.7)
          : Math.max(tipHalfW / baseHalfW, (1.0 - 0.38) * (1.0 - (t - 0.7) / 0.3));
      const hw = Math.max(tipHalfW, baseHalfW * taper);
      const curve = t * t * archOut;
      const vy = bladeH * (t - 0.10 * t * t * t);
      const cx = rootX + dirX * curve;
      const cz = rootZ + dirZ * curve;

      // Subtle V-midrib camber normal tilt so individual blades catch specular sunlight cleanly
      const ny = Math.max(0.28, 0.72 - 0.35 * t);
      const nOut = Math.sqrt(Math.max(0.05, 1.0 - ny * ny));

      for (const lr of [-1, 1]) {
        pos.push(cx + sideX * (lr * hw), vy, cz + sideZ * (lr * hw));
        const nx = dirX * nOut * 0.82 + sideX * (lr * 0.28);
        const nz = dirZ * nOut * 0.82 + sideZ * (lr * 0.28);
        const nLen = Math.hypot(nx, ny, nz) || 1.0;
        norm.push(nx / nLen, ny / nLen, nz / nLen);
        uvs.push(bladeSeed, t);
      }

      if (s < segs) {
        const r0 = baseVert + s * 2;
        const r1 = r0 + 1;
        const r2 = r0 + 2;
        const r3 = r0 + 3;
        indices.push(r0, r1, r2, r1, r3, r2);
      }
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute("normal", new THREE.Float32BufferAttribute(norm, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  return geom;
}

/**
 * Evaluates signed distance to any road carriageway or intersection so sidewalks,
 * trees, and planters never intrude onto intersecting streets!
 */
function isInsideAnyCarriageway(x, z, margin = -0.15) {
  return signedCarriagewayClearance(x, z) < margin;
}

function isInBayViewPond(x, z) {
  return x >= 166.0 && x <= 238.0 && z >= -60.0 && z <= 92.0;
}

function isInStevensCreekWater(x, z) {
  if (x < -265.0 || x > 265.0) return false;
  const cz = stevensCreekCenterZ(x);
  const halfW = stevensCreekHalfWidthZ(x);
  return Math.abs(z - cz) <= halfW + 2.8;
}

/**
 * Analytical Golden-Hour California Sky Dome (`MeshBasic` / lightweight `ShaderMaterial`,
 * `THREE.BackSide` — SwiftShader CPU Fill-Rate Safe!).
 */
function createAnalyticalCampusSkyDome() {
  const geom = new THREE.SphereGeometry(960, 32, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uSunDir: { value: new THREE.Vector3(-0.55, 0.42, -0.72).normalize() },
      uSunsetBlend: { value: 0.72 },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDir;
      uniform float uSunsetBlend;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);
        // Omni V5 Natural Silicon Valley Clear Afternoon Sky (#A1BDCD zenith -> #E5EBE7 horizon haze)
        vec3 dayZenith = vec3(0.46, 0.63, 0.76);
        vec3 dayHorizon = vec3(0.898, 0.922, 0.906);
        vec3 goldZenith = vec3(0.55, 0.68, 0.78);
        vec3 goldHorizon = vec3(0.918, 0.892, 0.848);

        vec3 zenith = mix(dayZenith, goldZenith, uSunsetBlend * 0.65);
        vec3 horizon = mix(dayHorizon, goldHorizon, uSunsetBlend * 0.65);
        vec3 sky = mix(horizon, zenith, pow(max(h, 1e-5), 0.54));

        float sunDot = max(dot(d, normalize(uSunDir)), 0.0);
        vec3 sunGlow = mix(vec3(1.0, 0.96, 0.86), vec3(1.0, 0.82, 0.58), uSunsetBlend * 0.65);
        sky += sunGlow * pow(max(sunDot, 1e-5), 16.0) * 0.30;
        sky += vec3(1.0, 0.98, 0.90) * smoothstep(0.9968, 0.9995, sunDot) * 0.78;

        gl_FragColor = vec4(sky, 1.0);
      }
    `,
  });
  if (mat.uniforms?.uSunDir?.value && Array.isArray(OMNI_V5_ENVIRONMENT_TELEMETRY?.sunDirection)) {
    const [sx, sy, sz] = OMNI_V5_ENVIRONMENT_TELEMETRY.sunDirection;
    mat.uniforms.uSunDir.value.set(sx, sy, sz).normalize();
  }
  const mesh = new THREE.Mesh(geom, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

/**
 * Lightweight animated Fresnel water shader for Bay View Pond, Stevens Creek & SF Bay.
 */
function createCampusWaterMaterial(deepHex = "#184e68", shallowHex = "#3898a8") {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(-0.55, 0.42, -0.72).normalize() },
      uDeep: { value: new THREE.Color(deepHex) },
      uShallow: { value: new THREE.Color(shallowHex) },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      varying vec2 vUvLocal;
      void main() {
        vUvLocal = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      varying vec3 vWorldPos;
      varying vec2 vUvLocal;
      void main() {
        vec2 p = vWorldPos.xz;
        float r1 = sin(p.x * 1.85 + p.y * 1.15 + uTime * 1.25) * cos(p.y * 2.10 - p.x * 0.85 - uTime * 0.95);
        float r2 = sin(p.x * 4.70 - p.y * 3.90 - uTime * 1.65) * 0.55;
        float r3 = cos(p.x * 9.30 + p.y * 8.10 + uTime * 2.15) * 0.28;
        float rip = r1 + r2 + r3;
        vec3 n = normalize(vec3(rip * 0.011, 1.0, (r1 - r2 + r3) * 0.011));
        vec3 v = normalize(cameraPosition - vWorldPos);
        float fres = pow(max(1.0 - max(dot(n, v), 0.0), 1e-5), 2.75);
        vec3 base = mix(uDeep, uShallow, clamp(0.42 + 0.08 * r1, 0.0, 1.0));
        float sunAlign = clamp(dot(normalize(vec2(-v.x, -v.z)), normalize(uSunDir.xz)) * 0.5 + 0.5, 0.0, 1.0);
        vec3 skyCool = vec3(0.42, 0.56, 0.74);
        vec3 skyWarm = vec3(0.95, 0.75, 0.54);
        vec3 skyRefl = mix(skyCool, skyWarm, 0.38 + 0.52 * sunAlign);
        vec3 col = mix(base, skyRefl, clamp(0.18 + fres * 0.64, 0.0, 0.82));
        vec3 h = normalize(uSunDir + v);
        float spec = pow(max(dot(n, h), 1e-5), 110.0);
        col += vec3(1.0, 0.90, 0.68) * spec * 0.65;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

/**
 * Builds a C2-smooth 360-degree multi-harmonic mountain ridgeline ring (`>= 192` azimuth
 * segments x `9` rounded vertical profile rings, zero point-cone pyramid tips!) with
 * baked atmospheric aerial-perspective vertex colors (`VETO-04`).
 */
function buildSmoothMountainRidgeRing({
  radius = 410.0,
  radialSegs = 208,
  vertRings = 9,
  baseY = -3.2,
  phase = 0.0,
  minBayHeight = 3.2,
  baseRangeHeight = 13.5,
  harmonicAmp = 5.2,
  cValleyHex = "#788468",
  cMidSlopeHex = "#ad9974",
  cSunCrestHex = "#d3b88e",
  cBayHazeHex = "#d6c8be",
  cWestGlowHex = "#eed3b4",
  cHorizonHazeHex = "#e3bf9b",
  hazeBlendMin = 0.75,
  hazeBlendMax = 0.88,
}) {
  const vertCount = (radialSegs + 1) * (vertRings + 1);
  const positions = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const colors = new Float32Array(vertCount * 3);
  const indices = [];

  const cValley = new THREE.Color(cValleyHex);
  const cMidSlope = new THREE.Color(cMidSlopeHex);
  const cSunCrest = new THREE.Color(cSunCrestHex);
  const cBayHaze = new THREE.Color(cBayHazeHex);
  const cWestGlow = new THREE.Color(cWestGlowHex);
  const cHorizonHaze = new THREE.Color(cHorizonHazeHex);
  const tmpA = new THREE.Color();
  const tmpB = new THREE.Color();
  const tmpHaze = new THREE.Color();

  for (let ia = 0; ia <= radialSegs; ia++) {
    const u = ia / radialSegs;
    const a = u * Math.PI * 2.0;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);

    // North (`-Z`, `sinA < -0.25`) opens onto San Francisco Bay with gentle low Marin/East Bay hills;
    // South & West (`+Z, -X`) rise into rolling Santa Cruz Mountains; East (`+X`) rises into Diablo Range!
    const bayT = THREE.MathUtils.smoothstep(-sinA, 0.22, 0.82);
    const santaCruzBoost = THREE.MathUtils.smoothstep(sinA * 0.72 - cosA * 0.48, -0.25, 0.85);
    const diabloBoost = THREE.MathUtils.smoothstep(cosA * 0.82 + sinA * 0.25, 0.05, 0.90);

    // Infinitely differentiable multi-harmonic ridge envelope with visible multi-peak relief in 34°-40° lenses!
    const hWave =
      0.34 * Math.sin(2.0 * a + 0.65 + phase) +
      0.28 * Math.cos(3.0 * a - 0.92 + phase * 1.3) +
      0.26 * Math.sin(5.0 * a + 1.74 - phase * 0.8) +
      0.32 * Math.cos(8.0 * a - 0.48 + phase * 1.7) +
      0.24 * Math.sin(13.0 * a + 1.15 + phase * 2.1) +
      0.16 * Math.cos(19.0 * a - 0.72 + phase * 2.6);

    const rangeH =
      baseRangeHeight * (0.76 + 0.44 * santaCruzBoost + 0.36 * diabloBoost) +
      harmonicAmp * hWave;
    const bayHillRelief =
      minBayHeight +
      0.48 * harmonicAmp * (0.55 + 0.45 * Math.sin(5.0 * a + phase) + 0.38 * Math.cos(11.0 * a - phase * 1.4));
    const crestH = THREE.MathUtils.lerp(Math.max(8.0, rangeH), Math.max(4.0, bayHillRelief), bayT * 0.72);

    // Gentle radial undulation of foothill spurs & valleys (`±14m`, C2-smooth)
    const rSpur =
      radius +
      11.0 * Math.cos(3.0 * a + 0.4 + phase) +
      6.5 * Math.sin(6.0 * a - 1.1 - phase);

    const westSunT = THREE.MathUtils.clamp((-cosA * 0.65 - sinA * 0.35) * 0.5 + 0.5, 0.0, 1.0);

    for (let iv = 0; iv <= vertRings; iv++) {
      const v = iv / vertRings;
      const idx = ia * (vertRings + 1) + iv;

      // Smooth S-bell vertical ridge profile: foothill toe closer (`rSpur - 26m`) rising away to rounded crest (`rSpur + 12m`)
      // so inward face normals point cleanly toward the campus AND upward (+Y) toward the sunlit sky!
      const sCurve = v * v * (3.0 - 2.0 * v);
      const crestRoll = v > 0.84 ? Math.pow((v - 0.84) / 0.16, 2.0) * 0.045 : 0.0;
      const wy = baseY + (crestH - baseY) * (sCurve - crestRoll);
      const rLocal = rSpur - 26.0 + 38.0 * Math.pow(v, 0.88);

      positions[idx * 3] = cosA * rLocal;
      positions[idx * 3 + 1] = wy;
      positions[idx * 3 + 2] = sinA * rLocal;

      uvs[idx * 2] = u * 16.0;
      uvs[idx * 2 + 1] = v;

      if (v < 0.52) {
        tmpA.lerpColors(cValley, cMidSlope, v / 0.52);
      } else {
        tmpA.lerpColors(cMidSlope, cSunCrest, (v - 0.52) / 0.48);
      }
      tmpB.lerpColors(tmpA, cWestGlow, westSunT * (0.22 + 0.28 * v));
      tmpB.lerp(cBayHaze, bayT * 0.65);
      // Blend 75%-88% into warm golden-apricot atmospheric horizon haze (zero opaque Play-Doh wall!)
      tmpHaze.lerpColors(cHorizonHaze, cWestGlow, westSunT * 0.58);
      const hazeAmt = THREE.MathUtils.lerp(hazeBlendMax, hazeBlendMin, v);
      tmpB.lerp(tmpHaze, hazeAmt);

      colors[idx * 3] = tmpB.r;
      colors[idx * 3 + 1] = tmpB.g;
      colors[idx * 3 + 2] = tmpB.b;

      if (ia < radialSegs && iv < vertRings) {
        const i00 = idx;
        const i01 = idx + 1;
        const i10 = idx + (vertRings + 1);
        const i11 = i10 + 1;
        indices.push(i00, i10, i01, i01, i10, i11);
      }
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

/**
 * Builds a sculpted 6-tier California Coastal Redwood (`Sequoia sempervirens`) crown
 * with 16-segment scalloped/fluted drooping evergreen boughs and explicit baked
 * multi-tone vertex colors (`VETO-03`: zero black pixels, zero raw 8-gon cones!).
 */
function createSculptedRedwoodCrownGeometry() {
  const tierGeoms = [];
  const tierCount = 6;
  const radialSegs = 16;
  // Ring 0 = closed inner trunk under-collar, Rings 1..6 = drooping scalloped evergreen bough rising to apex!
  const heightSegs = 6;

  // Calibrated multiplier tint ramp over `foliageRedwoodMap` so final shaded needles span
  // `#1b3b1e` deep interior under-bough shadow -> `#386632..#4c8840` sunlit bough tips!
  const cDeepInterior = new THREE.Color("#52864c");
  const cMidBough = new THREE.Color("#9fd493");
  const cSunlitTip = new THREE.Color("#ecf9d2");
  const tmpCol = new THREE.Color();

  for (let t = 0; t < tierCount; t++) {
    const tierFrac = t / (tierCount - 1);
    const rBase = 2.84 * Math.pow(1.0 - tierFrac * 0.72, 0.82);
    const tierH = 3.10 - tierFrac * 0.68;
    const baseY = 3.35 + t * 1.88;
    const tierPhase = t * 1.27 + 0.35;

    const vCount = (radialSegs + 1) * (heightSegs + 1);
    const pos = new Float32Array(vCount * 3);
    const uvs = new Float32Array(vCount * 2);
    const cols = new Float32Array(vCount * 3);
    const indices = [];

    for (let ih = 0; ih <= heightSegs; ih++) {
      const isUnderCollar = ih === 0;
      const vUpper = isUnderCollar ? 0.0 : (ih - 1) / (heightSegs - 1);
      const bellProfile = isUnderCollar
        ? 0.0
        : Math.pow(Math.max(0.0, 1.0 - Math.pow(vUpper, 1.26)), 0.74);

      for (let ir = 0; ir <= radialSegs; ir++) {
        const u = ir / radialSegs;
        const theta = u * Math.PI * 2.0;
        const idx = ih * (radialSegs + 1) + ir;

        // Organic 7-lobe + 5-lobe scalloped/fluted redwood bough sprays
        const lobe7 = Math.cos(7.0 * theta + tierPhase);
        const lobe5 = Math.sin(5.0 * theta - tierPhase * 1.35);
        const flute = 1.0 + (1.0 - vUpper * 0.68) * (0.19 * lobe7 + 0.10 * lobe5);

        let rad;
        let vy;
        if (isUnderCollar) {
          rad = 0.20 * (1.0 - tierFrac * 0.45);
          vy = baseY + 0.14;
        } else if (ih === heightSegs) {
          rad = 0.0;
          vy = baseY + tierH;
        } else {
          rad = Math.max(0.05, rBase * bellProfile * flute);
          const droopY =
            -0.36 *
            Math.pow(1.0 - vUpper, 1.2) *
            (0.52 + 0.48 * lobe7) *
            (1.0 - tierFrac * 0.35);
          vy = baseY + vUpper * tierH + droopY;
        }

        const vx = Math.cos(theta) * rad;
        const vz = Math.sin(theta) * rad;

        pos[idx * 3] = vx;
        pos[idx * 3 + 1] = vy;
        pos[idx * 3 + 2] = vz;

        uvs[idx * 2] = u * 3.0;
        uvs[idx * 2 + 1] = isUnderCollar ? 0.0 : vUpper * 1.5;

        // Multi-tone evergreen vertex shading: deep shaded under-bough -> sunlit outer spray tips
        const outerExposure = isUnderCollar
          ? 0.06 + 0.10 * tierFrac
          : THREE.MathUtils.clamp(
              0.28 + 0.34 * vUpper + 0.20 * tierFrac + 0.24 * Math.max(0.0, lobe7) * (1.0 - vUpper * 0.5),
              0.0,
              1.0
            );
        if (outerExposure < 0.52) {
          tmpCol.lerpColors(cDeepInterior, cMidBough, outerExposure / 0.52);
        } else {
          tmpCol.lerpColors(cMidBough, cSunlitTip, (outerExposure - 0.52) / 0.48);
        }
        cols[idx * 3] = tmpCol.r;
        cols[idx * 3 + 1] = tmpCol.g;
        cols[idx * 3 + 2] = tmpCol.b;

        if (ih < heightSegs && ir < radialSegs) {
          const i00 = idx;
          const i01 = idx + 1;
          const i10 = idx + (radialSegs + 1);
          const i11 = i10 + 1;
          // Outward CCW winding (`dP_h × dP_r` points -Y on under-bough and +radial/+Y on upper bough!)
          indices.push(i00, i10, i01, i01, i10, i11);
        }
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    tierGeoms.push(g);
  }

  return mergeCampusStaticGeometries(tierGeoms);
}

export class OpenCampusWorld {
  constructor(materials, seed = 0x51a7c0de) {
    this.materials = materials;
    this.rng = createMulberry32(seed);
    this.root = new THREE.Group();
    this.root.name = "OpenCampusWorld";
    this.isSoftwareRenderer = Boolean(
      (typeof document !== "undefined" &&
        document.documentElement?.classList?.contains("is-software-renderer")) ||
        (typeof window !== "undefined" && window.__CAPTURE_UNDERLYING_SWIFTSHADER__)
    );

    // Dynamic update handles
    this.skyDome = null;
    this.waterMaterials = [];
    this.grassFieldMesh = null;
    this.grassUniforms = null;
    this.lawnMaskTexture = null;

    this.intactGymGlassMesh = null;
    this.jaggedGlassFrameGroup = null;
    this.glassShardInstanced = null;
    this.glassShardSpecs = [];
    this.mullionShardInstanced = null;
    this.mullionShardSpecs = [];
    this.gymProceduralEquipmentGroup = null;
    this.gymV4InteriorGroup = null;
    this.shorelineProceduralPodsGroup = null;
    this.propsV4Group = null;
    this._hasWaymoGen6V4 = false;
    this._localShatterTriggerSec = -10.0;
    this._wasGlassShattered = false;

    this.trainerGroup = null;
    this.trainerFallbackGroup = null;
    this.trainerFlywheelPivot = null;
    this._trainerFlywheelAngle = 0.0;

    this.gymLedCanvas = null;
    this.gymLedCtx = null;
    this.gymLedTexture = null;
    this._lastLedTpuCount = -1;
    this._lastLedOnline = null;

    this.pinwheelRotors = [];
    this.pinwheelInstancedByColor = [];
    this.pinwheelBaseMesh = null;
    this.pinwheelV2MastInstanced = null;
    this.pinwheelV2RotorInstanced = null;
    this.pinwheelV2Specs = [];
    this.tpuVisuals = [];
    this.tpuInstancedBatches = [];
    this.tpuHalosInstanced = null;

    this.mkBoostVisuals = [];
    this.mkCartPlacements = [];
    this.mkCartsFallbackGroup = null;
    this.mkCartsV2Group = null;
    this.mkChevronsInstanced = null;
    this.mkSteamInstanced = null;
    this.mkSteamSpecs = [];

    this.proceduralBuildingsGroup = null;
    this.solarCarportGroup = null;
    this.envV3BuildingsGroup = null;
    this.proceduralStreetFurnitureGroup = null;
    this.envV3PropsGroup = null;
    this.signalPlacements = [];
    this.lampPlacements = [];
    this.benchPlacements = [];
    this.planterPlacements = [];
    this.bikeRackPlacements = [];
    this.triBinPlacements = [];

    this.gradientCanopyFallback = null;
    this.gradientCanopyV2Group = null;
    this.bayViewFallback = null;
    this.bayViewV2Group = null;
    this.allRampsFallbackGroup = null;
    this.allRampsV2Group = null;
    this.shorelineFallback = null;
    this.shorelineV2Group = null;
    this.shorelineMonumentGroup = null;
    this.stevensBridgeV2Group = null;

    this.bugdroidHolder = null;
    this.bugdroidBaseY = 0.0;
    this.bugdroidHeadPivot = null;
    this.bugdroidArmRPivot = null;
    this.stanHolder = null;
    this.androidDessertsV2Group = null;

    this.flamingosBodyInstanced = null;
    this.flamingosWingInstanced = null;

    this.waymoVisuals = [];
    this.parkedWaymoSpecs = [];
    this.parkedWaymosFallbackGroup = null;
    this.vehicleContactShadowInstanced = null;
    this.waymoBodyInstanced = null;
    this.waymoDomeInstanced = null;
    this.waymoBodyBatches = [];
    this.waymoDomeBatches = [];
    this.waymoWheelLeftBatches = [];
    this.waymoWheelRightBatches = [];
    this.waymoWheelsLeftInstanced = null;
    this.waymoWheelsRightInstanced = null;
    this.waymoLeftWheelOffsets = [];
    this.waymoRightWheelOffsets = [];
    this.waymoDomeLocalPos = new THREE.Vector3(0, 1.58, 0.12);
    this.waymoGroundLiftY = 0.0;
    this.waymoWheelRadius = 0.375;
    this.waymoModelYawOffset = Math.PI;
    this.waymoWheelSpinSign = 1.0;
    this._hasWaymoGen6V3 = false;
    this._lastGlobalState = null;
    this.tpuTemplateNode = null;

    this.shorelineBeamCones = [];
    this.shorelinePedestalSegments = [];
    this.shorelineStageLight = null;

    // V5 AAA World Overhaul handles
    this.v5Grass = null;
    this.stanEncounter = null;
    this.gymV5PropsGroup = null;
    this.archV5Group = null;
    this.archV5PavilionsGroup = null;
    this.archV5BermsGroup = null;
    this.archV5HorizonGroup = null;
    this.distantCrestMesh = null;
    this.foothillsMesh = null;
    this.courtyardParkedBikesGroup = null;
    this.courtyardCafeFallbackGroup = null;
    this.v5GroundingReport = null;
    this.horizonTreesStaticGroup = null;
    this._botanicalPlacementsAudit = [];
    this._cullForceRebuild = true;
    this._lastCullCamX = NaN;
    this._lastCullCamY = NaN;
    this._lastCullCamZ = NaN;
    this._lastCullFwdX = 0.0;
    this._lastCullFwdY = 0.0;
    this._lastCullFwdZ = -1.0;
    this._lastCullEnclosedInGym = null;
    this._lastCullAllowShadows = null;
    this._lastCullIsTopDown = null;
    this._lastCullFastSw = null;
    this._hadActiveSightlineFade = false;

    // V6 Perfection Pass handles
    this.gymStorefrontFacadeGroup = null;
    this.gymNorthLedBoardGroup = null;
    this.lastGymLedRpm = 36;
    this.gradientCanopyV6Group = null;
    this.bayViewV6Group = null;
    this.mkCartsV6Group = null;
    this.stevensBridgeV6Group = null;
    this.cafeUmbrellasV6Group = null;
    this.allRampsV6Group = null;
    this.botanicalKitV6Group = null;
    this.foothillTreesV6Instanced = null;
    this.v6PinwheelRotors = [];
    this._hideVisitorFrontPinwheelIndices = new Set();
    this._hasV6Planters = false;

    // V7 Perfection & Zero-GC handles
    this.spinStudioChalkMotesInstanced = null;
    this.spinStudioChalkMoteSeeds = [];
    this.shorelineSunlitMotesInstanced = null;
    this.shorelineSunlitMoteSeeds = [];
    this._outdoorCameraObstacles = [];
    this.lastOutdoorObstructionCount = 0;
    this.lastOutdoorAvoidanceHiddenCount = 0;
    this._heroPosScratch = { x: 0, y: 0, z: 0 };
    this._stanUpdateOpts = {
      timeSec: 0,
      pelicanPos: this._heroPosScratch,
      stanRoarSignal: null,
      flamingos: null,
      flamingosBodyInstanced: null,
      flamingosExtraBatches: null,
    };
    this._grassUpdateOpts = {
      heroPos: this._heroPosScratch,
      stanShockwave: null,
      visible: true,
    };

    this._buildSkyHorizonAndTerrain();
    this._buildRoadSidewalkCrosswalkGrid();
    this._buildCampusBuildingBlocks();
    this._buildGradientCanopyAndFitnessGym();
    this._buildKineticPinwheelSpine();
    this._buildLandmarksAndRamps();
    this._buildCollectibleTpusAndMkPads();
    this._buildAutonomousWaymoFleet();
    this._buildInstancedCampusTreesAndProps();
    this._buildInstanced3DGrassField();
  }

  // ============================================================================
  // 1. CONTIGUOUS TERRAIN HEIGHTFIELD, SKY DOME, HORIZON MOUNTAINS & WATER
  // ============================================================================
  _buildSkyHorizonAndTerrain() {
    this.skyDome = createAnalyticalCampusSkyDome();
    this.root.add(this.skyDome);

    // 2 Continuous C2-Smooth 360-Degree Santa Cruz & Diablo Mountain Ridgeline Rings (chaparral-textured + FogExp2 aerial perspective!)
    const distantCrestGeom = buildSmoothMountainRidgeRing({
      radius: 452.0,
      radialSegs: 240,
      vertRings: 16,
      baseY: -4.5,
      phase: 1.85,
      minBayHeight: 12.5,
      baseRangeHeight: 36.0,
      harmonicAmp: 19.5,
      cValleyHex: "#7180a4",
      cMidSlopeHex: "#8d92b6",
      cSunCrestHex: "#b8a8be",
      cBayHazeHex: "#9aa6c2",
      cWestGlowHex: "#e2be9e",
      cHorizonHazeHex: "#beafc0",
      hazeBlendMin: 0.26,
      hazeBlendMax: 0.48,
    });
    const distantCrestMesh = new THREE.Mesh(
      distantCrestGeom,
      this.materials.horizonDistantRange || this.materials.coastalHillGold
    );
    distantCrestMesh.frustumCulled = false;
    distantCrestMesh.renderOrder = -9;
    distantCrestMesh.matrixAutoUpdate = false;
    distantCrestMesh.updateMatrix();
    this.distantCrestMesh = distantCrestMesh;
    this.root.add(distantCrestMesh);

    const foothillsGeom = buildSmoothMountainRidgeRing({
      radius: 408.0,
      radialSegs: 240,
      vertRings: 16,
      baseY: -3.8,
      phase: 0.25,
      minBayHeight: 6.5,
      baseRangeHeight: 20.5,
      harmonicAmp: 13.5,
      cValleyHex: "#5f7454",
      cMidSlopeHex: "#878b6b",
      cSunCrestHex: "#bca882",
      cBayHazeHex: "#829188",
      cWestGlowHex: "#deba92",
      cHorizonHazeHex: "#b8ae9e",
      hazeBlendMin: 0.14,
      hazeBlendMax: 0.32,
    });
    const foothillsMesh = new THREE.Mesh(
      foothillsGeom,
      this.materials.horizonFoothillsRidge || this.materials.coastalHillGold
    );
    foothillsMesh.frustumCulled = false;
    foothillsMesh.renderOrder = -8;
    foothillsMesh.matrixAutoUpdate = false;
    foothillsMesh.updateMatrix();
    this.foothillsMesh = foothillsMesh;
    this.root.add(foothillsMesh);

    // Contiguous `530m x 470m` Terrain Heightfield (`x in [-265, 265], z in [-260, 210]`)
    const segX = 216;
    const segZ = 216;
    const minX = -265;
    const maxX = 265;
    const minZ = -260;
    const maxZ = 210;

    const vertCount = (segX + 1) * (segZ + 1);
    const positions = new Float32Array(vertCount * 3);
    const uvs = new Float32Array(vertCount * 2);
    const colors = new Float32Array(vertCount * 3);
    const indices = [];

    // Cool-olive botanical vertex modulation over the 1024x1024 multi-layered PBR fescue/clover/soil turf map
    // (ZERO neon CG green and ZERO dry yellow-tan bleach — harmonizes 1:1 with V5 3D grass tufts!).
    const cLawn = new THREE.Color("#cfd8be");
    const cLush = new THREE.Color("#b5c2a0");
    const cMeadow = new THREE.Color("#c2cbb0");
    const cBank = new THREE.Color("#bfa77e");
    const cSubRoad = new THREE.Color("#3b3f46");

    for (let iz = 0; iz <= segZ; iz++) {
      const vz = iz / segZ;
      const wz = minZ + vz * (maxZ - minZ);
      for (let ix = 0; ix <= segX; ix++) {
        const ux = ix / segX;
        const wx = minX + ux * (maxX - minX);
        const idx = iz * (segX + 1) + ix;

        let wy = getOpenWorldEarthHeight(wx, wz);
        const macroPatch =
          0.5 + 0.5 * Math.sin(wx * 0.045 + 0.7) * Math.cos(wz * 0.048 - 0.4);
        _color.copy(cLush).lerp(cLawn, macroPatch);
        let col = _color;

        // Sink terrain cleanly (`-0.12m`) strictly beneath vehicular asphalt carriageways,
        // gym floor & solar lot (keeping all sidewalks, Android Plaza & Stan Courtyard at full lush lawn height!)
        const inGymArea = Math.abs(wx) <= 17.5 && wz >= 113.5 && wz <= 153.5;
        const onCarriageway =
          signedCarriagewayClearance(wx, wz) < 0.25 &&
          Math.hypot(wx - -118.0, wz - 96.0) > 12.5;
        const inSolarLot = Math.abs(wx - -162.0) < 20.0 && Math.abs(wz - 28.0) < 22.0;
        const inShorelineConcourse = Math.hypot(wx - 14.0, wz - -188.0) < 20.8;
        const inAndroidPlaza =
          Math.hypot(wx - -118.0, wz - 96.0) < 8.65 ||
          (Math.abs(wx - -118.0) < 4.35 && wz >= 86.75 && wz <= 93.5);

        if (isInBayViewPond(wx, wz)) {
          const edgeDist = Math.min(wx - 166.0, 238.0 - wx, wz - -60.0, 92.0 - wz);
          wy = -0.58 * Math.min(1.0, edgeDist / 5.5);
          col = cBank;
        } else if (isInStevensCreekWater(wx, wz)) {
          const cz = stevensCreekCenterZ(wx);
          const halfW = stevensCreekHalfWidthZ(wx);
          const distZ = Math.abs(wz - cz);
          if (distZ <= halfW) {
            wy = -0.82 - 0.12 * Math.cos(Math.min(distZ / halfW, 1.0) * Math.PI * 0.5);
          } else {
            const slopeT = Math.max(0.0, 1.0 - (distZ - halfW) / 2.8);
            wy = -0.82 * slopeT * slopeT;
          }
          col = cBank;
        } else if (wz < -226.0) {
          wy = -0.65 * Math.min(1.0, (-226.0 - wz) / 8.0);
          col = cBank;
        } else if (
          inGymArea ||
          onCarriageway ||
          inSolarLot ||
          inShorelineConcourse ||
          inAndroidPlaza
        ) {
          wy -= 0.12;
          col = cSubRoad;
        } else {
          if (wz < -100.0 || wx > 142.0) {
            const blend = THREE.MathUtils.clamp((-95.0 - wz) / 62.0, 0.0, 0.65);
            _color.lerp(cMeadow, blend);
            col = _color;
          }
          // Gentle outer foothill toe transition (`r > 218m`, strictly outside all campus roads/props)
          // so the distant lawn perimeter rolls organically into the `R ~ 274m` Santa Cruz foothill skirt!
          const rOuter = Math.hypot(wx, wz);
          if (rOuter > 218.0 && wz > -216.0) {
            const uToe = THREE.MathUtils.clamp((rOuter - 218.0) / 56.0, 0.0, 1.0);
            const sToe = uToe * uToe * (3.0 - 2.0 * uToe);
            wy += sToe * (2.6 + 0.9 * Math.sin(wx * 0.035 + wz * 0.029));
          }
        }

        positions[idx * 3] = wx;
        positions[idx * 3 + 1] = wy;
        positions[idx * 3 + 2] = wz;

        // High-density `~5.5m` world tile size -> `185 texels/meter` crisp PBR turf detail!
        uvs[idx * 2] = ux * 96.0;
        uvs[idx * 2 + 1] = vz * 85.0;

        colors[idx * 3] = col.r;
        colors[idx * 3 + 1] = col.g;
        colors[idx * 3 + 2] = col.b;

        if (iz < segZ && ix < segX) {
          const a = idx;
          const b = idx + 1;
          const c = idx + (segX + 1);
          const d = c + 1;
          indices.push(a, c, b, b, c, d);
        }
      }
    }

    const terrainGeom = new THREE.BufferGeometry();
    terrainGeom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    terrainGeom.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    terrainGeom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    terrainGeom.setIndex(indices);
    terrainGeom.computeVertexNormals();
    const globalNormals = terrainGeom.attributes.normal.array;

    const baseTerrainMat =
      this.materials.turfLawnPbr || this.materials.apronGrassLambert;
    const terrainMat = baseTerrainMat.clone();
    terrainMat.color.set("#ffffff");
    terrainMat.vertexColors = true;

    // Partition terrain into 4x4 static spatial chunks (sharing exact pre-computed seam normals)
    // so Three.js frustum-culls ~75% of off-camera campus ground every frame!
    const chunksX = 4;
    const chunksZ = 4;
    for (let czIdx = 0; czIdx < chunksZ; czIdx++) {
      const iz0 = Math.floor((czIdx * segZ) / chunksZ);
      const iz1 = Math.floor(((czIdx + 1) * segZ) / chunksZ);
      const rows = iz1 - iz0;
      for (let cxIdx = 0; cxIdx < chunksX; cxIdx++) {
        const ix0 = Math.floor((cxIdx * segX) / chunksX);
        const ix1 = Math.floor(((cxIdx + 1) * segX) / chunksX);
        const cols = ix1 - ix0;
        const cVerts = (cols + 1) * (rows + 1);
        const cPos = new Float32Array(cVerts * 3);
        const cNorm = new Float32Array(cVerts * 3);
        const cUv = new Float32Array(cVerts * 2);
        const cCol = new Float32Array(cVerts * 3);
        const cIdx = [];

        for (let dz = 0; dz <= rows; dz++) {
          const gz = iz0 + dz;
          for (let dx = 0; dx <= cols; dx++) {
            const gx = ix0 + dx;
            const gIdx = gz * (segX + 1) + gx;
            const lIdx = dz * (cols + 1) + dx;
            cPos[lIdx * 3] = positions[gIdx * 3];
            cPos[lIdx * 3 + 1] = positions[gIdx * 3 + 1];
            cPos[lIdx * 3 + 2] = positions[gIdx * 3 + 2];
            cNorm[lIdx * 3] = globalNormals[gIdx * 3];
            cNorm[lIdx * 3 + 1] = globalNormals[gIdx * 3 + 1];
            cNorm[lIdx * 3 + 2] = globalNormals[gIdx * 3 + 2];
            cUv[lIdx * 2] = uvs[gIdx * 2];
            cUv[lIdx * 2 + 1] = uvs[gIdx * 2 + 1];
            cCol[lIdx * 3] = colors[gIdx * 3];
            cCol[lIdx * 3 + 1] = colors[gIdx * 3 + 1];
            cCol[lIdx * 3 + 2] = colors[gIdx * 3 + 2];

            if (dz < rows && dx < cols) {
              const a = lIdx;
              const b = lIdx + 1;
              const c = lIdx + (cols + 1);
              const d = c + 1;
              cIdx.push(a, c, b, b, c, d);
            }
          }
        }

        const chunkGeom = new THREE.BufferGeometry();
        chunkGeom.setAttribute("position", new THREE.BufferAttribute(cPos, 3));
        chunkGeom.setAttribute("normal", new THREE.BufferAttribute(cNorm, 3));
        chunkGeom.setAttribute("uv", new THREE.BufferAttribute(cUv, 2));
        chunkGeom.setAttribute("color", new THREE.BufferAttribute(cCol, 3));
        chunkGeom.setIndex(cIdx);
        chunkGeom.computeBoundingSphere();

        const terrainChunk = new THREE.Mesh(chunkGeom, terrainMat);
        terrainChunk.receiveShadow = true;
        terrainChunk.matrixAutoUpdate = false;
        terrainChunk.updateMatrix();
        this.root.add(terrainChunk);
      }
    }
    terrainGeom.dispose();

    // V6 Realistic Animated Fresnel Water Bodies (Bay View Pond + Stevens Creek + North SF Bay)
    // + Chiseled Sierra Granite Basin Coping Curbs (kills flat blue paint rectangle!)
    const pondWaterMat =
      typeof MaterialsMod.createRealisticCampusWaterMaterial === "function"
        ? MaterialsMod.createRealisticCampusWaterMaterial({
            sunsetPreset: false,
            rippleScale: 0.17,
            rippleStrength: 0.088,
          })
        : createCampusWaterMaterial("#2C3E3A", "#8FB2CE");
    const sunsetCreekWaterMat =
      typeof MaterialsMod.createRealisticCampusWaterMaterial === "function"
        ? MaterialsMod.createRealisticCampusWaterMaterial({
            sunsetPreset: true,
            rippleScale: 0.20,
            rippleStrength: 0.095,
          })
        : pondWaterMat;
    if (pondWaterMat?.userData) pondWaterMat.userData.isCampusWaterV6 = true;
    if (sunsetCreekWaterMat?.userData) sunsetCreekWaterMat.userData.isCampusWaterV6 = true;
    this.waterMaterials.push(pondWaterMat);
    if (sunsetCreekWaterMat !== pondWaterMat) {
      this.waterMaterials.push(sunsetCreekWaterMat);
    }

    // 1. Bay View Dragonscale Retention Pond (`x in [165, 239], z in [-61, +93]`)
    const pondG = new THREE.PlaneGeometry(74, 154, 12, 24);
    pondG.rotateX(-Math.PI * 0.5);
    pondG.translate(202.0, -0.14, 16.0);
    const pondMesh = new THREE.Mesh(pondG, pondWaterMat);
    pondMesh.name = "Bay_View_Retention_Pond_Water_V6";
    pondMesh.matrixAutoUpdate = false;
    pondMesh.updateMatrix();
    this.root.add(pondMesh);

    // Chiseled Sierra Granite Coping Curb Wall framing the Bay View Retention Basin
    const pondCopingGeoms = [
      // West promenade coping (`x = 164.78, z in [-61.4, +93.4]`)
      new THREE.BoxGeometry(0.56, 0.34, 154.8).translate(164.78, -0.10, 16.0),
      // East pavilion bank coping (`x = 239.22, z in [-61.4, +93.4]`)
      new THREE.BoxGeometry(0.56, 0.34, 154.8).translate(239.22, -0.10, 16.0),
      // South basin coping (`x in [164.5, 239.5], z = 93.22`)
      new THREE.BoxGeometry(75.0, 0.34, 0.56).translate(202.0, -0.10, 93.22),
      // North basin coping (`x in [164.5, 239.5], z = -61.22`)
      new THREE.BoxGeometry(75.0, 0.34, 0.56).translate(202.0, -0.10, -61.22),
    ];
    // Natural stone bank coping blocks flanking the widened Stevens Creek channel (`x in [-44, +114]`)
    const copingSegs = 32;
    for (let s = 0; s < copingSegs; s++) {
      const xA = -44.0 + (s / copingSegs) * 158.0;
      const xB = -44.0 + ((s + 1) / copingSegs) * 158.0;
      const zA = stevensCreekCenterZ(xA);
      const zB = stevensCreekCenterZ(xB);
      const hw = 0.5 * (stevensCreekHalfWidthZ(xA) + stevensCreekHalfWidthZ(xB));
      pondCopingGeoms.push(
        makeRoadQuad(xA, zA, xB, zB, -(hw + 1.45), -(hw + 0.55), -0.08, -0.08, 0.45),
        makeRoadQuad(xA, zA, xB, zB, hw + 0.55, hw + 1.45, -0.08, -0.08, 0.45)
      );
    }
    const mergedCoping = mergeCampusStaticGeometries(pondCopingGeoms);
    if (mergedCoping) {
      const copingMesh = new THREE.Mesh(
        mergedCoping,
        this.materials.graniteCurb || this.materials.concreteSidewalk
      );
      copingMesh.name = "Campus_Water_Basin_Granite_Coping_V6";
      copingMesh.receiveShadow = true;
      copingMesh.castShadow = false;
      copingMesh.matrixAutoUpdate = false;
      copingMesh.updateMatrix();
      this.root.add(copingMesh);
    }

    // 2. Full-Map Continuous Stevens Creek Water Ribbon (`x in [-265, +265]`, widened `±29.2m` under Corten Bridge!)
    //    + Northern SF Bay Shoreline (`z ~ -282`) — ZERO mid-lawn dead-end cutoff!
    const creekAndBayGeoms = [];
    const creekSegs = 92;
    for (let i = 0; i < creekSegs; i++) {
      const xA = -265.0 + (i / creekSegs) * 530.0;
      const xB = -265.0 + ((i + 1) / creekSegs) * 530.0;
      const hw = 0.5 * (stevensCreekHalfWidthZ(xA) + stevensCreekHalfWidthZ(xB)) + 1.35;
      creekAndBayGeoms.push(
        makeRoadQuad(xA, stevensCreekCenterZ(xA), xB, stevensCreekCenterZ(xB), -hw, hw, -0.16)
      );
    }
    const bayG = new THREE.PlaneGeometry(620, 115, 8, 4);
    bayG.rotateX(-Math.PI * 0.5);
    bayG.translate(0.0, -0.18, -282.0);
    creekAndBayGeoms.push(bayG);

    const waterMesh = new THREE.Mesh(
      mergeCampusStaticGeometries(creekAndBayGeoms),
      sunsetCreekWaterMat
    );
    waterMesh.name = "Stevens_Creek_And_Bay_Water_V6";
    waterMesh.matrixAutoUpdate = false;
    waterMesh.updateMatrix();
    this.root.add(waterMesh);
  }

  // ============================================================================
  // 1B. V5 AAA GPU-INSTANCED 3D CURVED GRASS SYSTEM (`132,000` BLADES, `1` DRAW CALL)
  // ============================================================================
  _buildInstanced3DGrassField() {
    this.v5Grass = createAAAInstancedGrassSystem(THREE, {
      maxDrawRadiusM: 96.0,
    });
    this.grassFieldMesh = this.v5Grass.mesh;
    this.grassUniforms = this.v5Grass.uniforms;
    this.lawnMaskTexture = this.v5Grass.lawnMaskTexture;
    this.root.add(this.v5Grass.mesh);
  }

  // ============================================================================
  // 2. AAA PBR ASPHALT ROAD, GUTTER, 3D GRANITE CURB, GRATES & SIDEWALK NETWORK
  // ============================================================================
  _buildRoadSidewalkCrosswalkGrid() {
    const asphaltGeoms = [];
    const gutterGeoms = [];
    const grateGeoms = [];
    const whiteStripeGeoms = [];
    const yellowStripeGeoms = [];
    const sidewalkGeoms = [];
    const curbGeoms = [];
    const paverGeoms = [];
    const ADA_Geoms = [];

    const pushUpwardQuad = (targetArr, p00, p10, p01, p11, u0, v0, u1, v1) => {
      const dx1 = p10[0] - p00[0];
      const dz1 = p10[2] - p00[2];
      const dx2 = p01[0] - p00[0];
      const dz2 = p01[2] - p00[2];
      const crossY = dz1 * dx2 - dx1 * dz2;
      const g = new THREE.BufferGeometry();
      const pos =
        crossY >= 0
          ? new Float32Array([...p00, ...p10, ...p01, ...p10, ...p11, ...p01])
          : new Float32Array([...p00, ...p01, ...p10, ...p10, ...p01, ...p11]);
      const uv =
        crossY >= 0
          ? new Float32Array([u0, v0, u1, v0, u0, v1, u1, v0, u1, v1, u0, v1])
          : new Float32Array([u0, v0, u0, v1, u1, v0, u1, v0, u0, v1, u1, v1]);
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      g.computeVertexNormals();
      targetArr.push(g);
    };

    const pushOutwardQuad = (targetArr, p00, p10, p01, p11, u0, v0, u1, v1, outX, outY, outZ) => {
      const ax = p10[0] - p00[0], ay = p10[1] - p00[1], az = p10[2] - p00[2];
      const bx = p01[0] - p00[0], by = p01[1] - p00[1], bz = p01[2] - p00[2];
      const cx = ay * bz - az * by;
      const cy = az * bx - ax * bz;
      const cz = ax * by - ay * bx;
      const dot = cx * outX + cy * outY + cz * outZ;
      const g = new THREE.BufferGeometry();
      const pos =
        dot >= 0
          ? new Float32Array([...p00, ...p10, ...p01, ...p10, ...p11, ...p01])
          : new Float32Array([...p00, ...p01, ...p10, ...p10, ...p01, ...p11]);
      const uv =
        dot >= 0
          ? new Float32Array([u0, v0, u1, v0, u0, v1, u1, v0, u1, v1, u0, v1])
          : new Float32Array([u0, v0, u0, v1, u1, v0, u1, v0, u0, v1, u1, v1]);
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      g.computeVertexNormals();
      targetArr.push(g);
    };

    // --------------------------------------------------------------------------
    // A. Edge-to-Edge PBR Dark Asphalt Carriageways (ZERO coplanar overlap!)
    // --------------------------------------------------------------------------
    const ewBoulevards = ACTIVE_ASPHALT_SEGMENTS.filter((s) => Math.abs(s.z1 - s.z2) < 0.01);
    const nsAvenues = ACTIVE_ASPHALT_SEGMENTS.filter((s) => Math.abs(s.x1 - s.x2) < 0.01);

    for (const r of ewBoulevards) {
      asphaltGeoms.push(
        makeRoadQuad(r.x1, r.z1, r.x2, r.z2, -r.halfW, r.halfW, 0.016, 0.016, 1.0 / 14.0)
      );
    }

    for (const r of nsAvenues) {
      const zMin = Math.min(r.z1, r.z2);
      const zMax = Math.max(r.z1, r.z2);
      const cuts = [];
      for (const ew of ewBoulevards) {
        if (r.x1 >= Math.min(ew.x1, ew.x2) - 0.5 && r.x1 <= Math.max(ew.x1, ew.x2) + 0.5) {
          cuts.push([ew.z1 - ew.halfW, ew.z1 + ew.halfW]);
        }
      }
      const spans = subtract1DIntervals(zMin, zMax, cuts);
      for (const [za, zb] of spans) {
        // Orient `-Z -> +Z` or `+Z -> -Z` consistently with `vOffset` so tire wear tracks align seamlessly
        asphaltGeoms.push(
          makeRoadQuad(r.x1, zb, r.x1, za, -r.halfW, r.halfW, 0.016, 0.016, 1.0 / 14.0, zMax - zb)
        );
      }
    }

    // --------------------------------------------------------------------------
    // B. 14-Segment `R = 3.60m` Curved Intersection Corners:
    //    Asphalt Spandrel + 0.32m Concrete Gutter + 3D Beveled Granite Curb +
    //    Rounded Grooved Sidewalk Fan + Grounded Yellow ADA Tactile Mat!
    // --------------------------------------------------------------------------
    const cornerSegs = 14;
    const rAsphalt = CORNER_FILLET_RADIUS; // 3.60m
    const rCurbToe = rAsphalt - 0.32;      // 3.28m (0.32m concrete gutter pan)
    const rCurbBack = rCurbToe - 0.22;     // 3.06m (0.22m 3D beveled Sierra granite curb)

    for (const c of INTERSECTION_CORNER_FILLETS) {
      const { ix, iz, halfWV, halfWH, sx, sz, cx, cz, hasAda } = c;
      const baseE = getOpenWorldEarthHeight(cx, cz);
      const asphaltY = baseE + 0.016;
      const gutterToeY = baseE + 0.013;
      const curbTopY = baseE + 0.115;
      const swY = baseE + 0.094;
      const skirtY = baseE - 0.14;

      const cornerApexX = ix + sx * halfWV;
      const cornerApexZ = iz + sz * halfWH;

      const ptArc = (rad, theta, yVal) => [
        cx - sx * rad * Math.cos(theta),
        yVal,
        cz - sz * rad * Math.sin(theta),
      ];

      for (let s = 0; s < cornerSegs; s++) {
        const th0 = (s / cornerSegs) * (Math.PI * 0.5);
        const th1 = ((s + 1) / cornerSegs) * (Math.PI * 0.5);
        const thMid = 0.5 * (th0 + th1);
        const outX = -sx * Math.cos(thMid);
        const outZ = -sz * Math.sin(thMid);

        // 1. Concave Asphalt Spandrel (`r = 3.60m` arc out to road intersection rectangle edge)
        const rayEdgePt = (theta) => {
          const cosT = Math.cos(theta);
          const sinT = Math.sin(theta);
          // Intersect ray `(cx - sx*t*cosT, cz - sz*t*sinT)` with `x = cornerApexX` or `z = cornerApexZ`
          const tToVert = cosT > 1e-4 ? rAsphalt / cosT : 1e6;
          const tToHoriz = sinT > 1e-4 ? rAsphalt / sinT : 1e6;
          const tEdge = Math.min(tToVert, tToHoriz);
          return [cx - sx * tEdge * cosT, asphaltY, cz - sz * tEdge * sinT];
        };
        const aIn0 = ptArc(rAsphalt, th0, asphaltY);
        const aIn1 = ptArc(rAsphalt, th1, asphaltY);
        const aOut0 = rayEdgePt(th0);
        const aOut1 = rayEdgePt(th1);
        pushUpwardQuad(
          asphaltGeoms,
          aIn0,
          aOut0,
          aIn1,
          aOut1,
          (aIn0[0] - ix) / 14.0,
          (aIn0[2] - iz) / 14.0,
          (aOut1[0] - ix) / 14.0,
          (aOut1[2] - iz) / 14.0
        );

        // 2. Curved 0.32m Concrete Gutter Apron (`r = 3.28m -> 3.60m`)
        pushUpwardQuad(
          gutterGeoms,
          ptArc(rCurbToe, th0, gutterToeY),
          ptArc(rAsphalt, th0, asphaltY),
          ptArc(rCurbToe, th1, gutterToeY),
          ptArc(rAsphalt, th1, asphaltY),
          0.0,
          s * 0.25,
          1.0,
          (s + 1) * 0.25
        );

        // 3. Curved 3D Beveled Sierra Granite Curb (`r = 3.06m -> 3.28m`, +0.115m crown + 45° bevel)
        const rRiserTop = rCurbToe - 0.035;
        const rChamfer = rCurbToe - 0.075;
        const vC0 = s * 0.22;
        const vC1 = (s + 1) * 0.22;
        // Street riser face
        pushOutwardQuad(
          curbGeoms,
          ptArc(rCurbToe, th0, gutterToeY - 0.002),
          ptArc(rRiserTop, th0, curbTopY - 0.018),
          ptArc(rCurbToe, th1, gutterToeY - 0.002),
          ptArc(rRiserTop, th1, curbTopY - 0.018),
          0.0,
          vC0,
          0.35,
          vC1,
          outX,
          0.25,
          outZ
        );
        // 45-degree beveled top lip
        pushOutwardQuad(
          curbGeoms,
          ptArc(rRiserTop, th0, curbTopY - 0.018),
          ptArc(rChamfer, th0, curbTopY),
          ptArc(rRiserTop, th1, curbTopY - 0.018),
          ptArc(rChamfer, th1, curbTopY),
          0.35,
          vC0,
          0.55,
          vC1,
          outX * 0.6,
          0.8,
          outZ * 0.6
        );
        // Flat granite top crown
        pushUpwardQuad(
          curbGeoms,
          ptArc(rCurbBack, th0, curbTopY),
          ptArc(rChamfer, th0, curbTopY),
          ptArc(rCurbBack, th1, curbTopY),
          ptArc(rChamfer, th1, curbTopY),
          0.55,
          vC0,
          0.92,
          vC1
        );
        // Back step tucked cleanly into `+0.094m` concrete sidewalk
        pushOutwardQuad(
          curbGeoms,
          ptArc(rCurbBack, th0, swY - 0.004),
          ptArc(rCurbBack, th0, curbTopY),
          ptArc(rCurbBack, th1, swY - 0.004),
          ptArc(rCurbBack, th1, curbTopY),
          0.92,
          vC0,
          1.0,
          vC1,
          -outX,
          0.2,
          -outZ
        );

        // 4. Rounded Grooved Concrete Sidewalk Corner Fan (`r = 0.00m -> 3.06m` in 2 radial bands)
        const rMidSw = 1.53;
        const pCenter0 = ptArc(0.02, th0, swY);
        const pCenter1 = ptArc(0.02, th1, swY);
        const pMid0 = ptArc(rMidSw, th0, swY);
        const pMid1 = ptArc(rMidSw, th1, swY);
        const pSw0 = ptArc(rCurbBack, th0, swY);
        const pSw1 = ptArc(rCurbBack, th1, swY);

        for (const [q00, q10, q01, q11] of [
          [pCenter0, pMid0, pCenter1, pMid1],
          [pMid0, pSw0, pMid1, pSw1],
        ]) {
          // World-aligned 2.70m UV grid so 1.35m x 1.35m sidewalk control joints continue seamlessly around corners!
          const dxA = q10[0] - q00[0], dzA = q10[2] - q00[2];
          const dxB = q01[0] - q00[0], dzB = q01[2] - q00[2];
          const cross = dzA * dxB - dxA * dzB;
          const g = new THREE.BufferGeometry();
          const verts =
            cross >= 0
              ? [q00, q10, q01, q10, q11, q01]
              : [q00, q01, q10, q10, q01, q11];
          const posArr = new Float32Array(18);
          const uvArr = new Float32Array(12);
          for (let k = 0; k < 6; k++) {
            posArr[k * 3] = verts[k][0];
            posArr[k * 3 + 1] = verts[k][1];
            posArr[k * 3 + 2] = verts[k][2];
            uvArr[k * 2] = verts[k][0] / 2.70;
            uvArr[k * 2 + 1] = verts[k][2] / 2.70;
          }
          g.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
          g.setAttribute("uv", new THREE.BufferAttribute(uvArr, 2));
          g.computeVertexNormals();
          sidewalkGeoms.push(g);
        }
      }

      // Outer corner lawn-edge grounding skirt (`r = 0.36m` back corner drop to `-0.14m`)
      for (const [ax, az, bx, bz, nx, nz] of [
        [cx - sx * 0.36, cz, cx, cz, 0, sz],
        [cx, cz, cx, cz - sz * 0.36, sx, 0],
      ]) {
        pushOutwardQuad(
          curbGeoms,
          [ax, skirtY, az],
          [ax, swY, az],
          [bx, skirtY, bz],
          [bx, swY, bz],
          0,
          0,
          0.3,
          0.3,
          nx,
          0.2,
          nz
        );
      }

      // 5. Yellow Tactile ADA Truncated-Dome Pad ON TOP of the Rounded Concrete Sidewalk (`y = +0.096m`)!
      //    Placed at `r = 2.28m < 3.06m` along the 45° corner bisector so 100% of all 4 pad corners
      //    sit strictly on concrete inside the 3D granite curb — NEVER floating out in the asphalt!
      if (hasAda) {
        const bisec = Math.PI * 0.25;
        const rAda = 2.28;
        const adaX = cx - sx * rAda * Math.cos(bisec);
        const adaZ = cz - sz * rAda * Math.sin(bisec);
        const adaYaw = Math.atan2(-sx, -sz);
        const ada = new THREE.BoxGeometry(1.16, 0.016, 0.70);
        ada.rotateY(adaYaw);
        ada.translate(adaX, swY + 0.008, adaZ);
        ADA_Geoms.push(ada);
      }
    }

    // --------------------------------------------------------------------------
    // C. Continental White Zebra Crosswalks & Crisp White Stop Bars (`0` Green Boxes!)
    // --------------------------------------------------------------------------
    const addCrosswalkBarSet = (cx, cz, alongX, roadWidthM, baseY, stopSideSign = 1) => {
      const halfSpan = roadWidthM * 0.44;
      const barCount = Math.max(5, Math.floor((halfSpan * 2.0) / 1.16));
      for (let b = 0; b < barCount; b++) {
        const lat = -halfSpan + ((b + 0.5) / barCount) * (halfSpan * 2.0);
        const bx = alongX ? cx : cx + lat;
        const bz = alongX ? cz + lat : cz;
        const bar = new THREE.PlaneGeometry(alongX ? 2.55 : 0.52, alongX ? 0.52 : 2.55);
        bar.rotateX(-Math.PI * 0.5);
        bar.translate(bx, baseY + 0.0012, bz);
        whiteStripeGeoms.push(bar);
      }
      // Crisp white 0.40m right-lane stop bar 2.35m upstream of crosswalk
      if (stopSideSign !== 0) {
        const laneSpan = roadWidthM * 0.41;
        const stopOffset = 2.35 * stopSideSign;
        const sx = alongX ? cx + stopOffset : cx + (alongX ? 0 : stopSideSign * (roadWidthM * 0.23));
        const sz = alongX ? cz - stopSideSign * (roadWidthM * 0.23) : cz + stopOffset;
        const stopG = new THREE.PlaneGeometry(alongX ? 0.40 : laneSpan, alongX ? laneSpan : 0.40);
        stopG.rotateX(-Math.PI * 0.5);
        stopG.translate(sx, baseY + 0.0012, sz);
        whiteStripeGeoms.push(stopG);
      }
    };

    // Signalized & major intersection crosswalks aligned cleanly between rounded curb tangent points
    const crosswalkSpecs = [
      // (0, 116) Gradient Driveway T-intersection
      { cx: -9.4, cz: 116.0, alongX: true, w: 10.5, stop: -1 },
      { cx: 9.4, cz: 116.0, alongX: true, w: 10.5, stop: 1 },
      { cx: 0.0, cz: 107.6, alongX: false, w: 14.0, stop: -1 },
      // (0, 76) Shoreline x Charleston 4-way
      { cx: -9.4, cz: 76.0, alongX: true, w: 14.0, stop: -1 },
      { cx: 9.4, cz: 76.0, alongX: true, w: 14.0, stop: 1 },
      { cx: 0.0, cz: 85.4, alongX: false, w: 14.0, stop: 1 },
      { cx: 0.0, cz: 66.6, alongX: false, w: 14.0, stop: -1 },
      // (-118, 76) West Ave / Android Plaza x Charleston
      { cx: -127.0, cz: 76.0, alongX: true, w: 14.0, stop: -1 },
      { cx: -109.0, cz: 76.0, alongX: true, w: 14.0, stop: 1 },
      { cx: -118.0, cz: 66.6, alongX: false, w: 13.0, stop: -1 },
      // (156, 76) Bay View Promenade x Charleston
      { cx: 145.6, cz: 76.0, alongX: true, w: 14.0, stop: -1 },
      // (0, -18) Shoreline x Amphitheatre 4-way
      { cx: -9.4, cz: -18.0, alongX: true, w: 14.0, stop: -1 },
      { cx: 9.4, cz: -18.0, alongX: true, w: 14.0, stop: 1 },
      { cx: 0.0, cz: -8.6, alongX: false, w: 14.0, stop: 1 },
      { cx: 0.0, cz: -27.4, alongX: false, w: 14.0, stop: -1 },
      // (-118, -18) West Ave x Amphitheatre North T-intersection (+ pedestrian gateway on South)
      { cx: -127.0, cz: -18.0, alongX: true, w: 14.0, stop: -1 },
      { cx: -109.0, cz: -18.0, alongX: true, w: 14.0, stop: 1 },
      { cx: -118.0, cz: -8.6, alongX: false, w: 13.0, stop: 1 },
      // (156, -18) Bay View Promenade x Amphitheatre
      { cx: 145.6, cz: -18.0, alongX: true, w: 14.0, stop: -1 },
      // (0, -86) Shoreline x North Bayshore Trail East L/T-intersection
      { cx: 9.4, cz: -86.0, alongX: true, w: 11.5, stop: 1 },
      { cx: 0.0, cz: -77.6, alongX: false, w: 14.0, stop: 1 },
      // (52, -86) Stevens Creek Bridge Crossing
      { cx: 44.0, cz: -86.0, alongX: true, w: 11.5, stop: -1 },
      { cx: 60.0, cz: -86.0, alongX: true, w: 11.5, stop: 1 },
    ];
    for (const cw of crosswalkSpecs) {
      const cy = getOpenWorldEarthHeight(cw.cx, cw.cz) + 0.016;
      addCrosswalkBarSet(cw.cx, cw.cz, cw.alongX, cw.w, cy, cw.stop);
    }

    // --------------------------------------------------------------------------
    // D. 5 Recessed Curbside Waymo Gen 6 Pickup Bays (Asphalt Pocket + Recessed Curb & Walk)
    // --------------------------------------------------------------------------
    for (const b of CURBSIDE_WAYMO_BAYS) {
      const totalHalf = b.bayHalfLen + 1.4; // 6.2m total curb cutout with tapered transitions
      const eY = getOpenWorldEarthHeight(b.x, b.z);
      const aY = eY + 0.016;
      const gY = eY + 0.013;
      const cY = eY + 0.115;
      const sY = eY + 0.094;

      if (b.axis === "x") {
        const zEdge = b.roadEdgeCoord;
        const zOuter = zEdge + b.sideSign * b.bayDepth;
        // Asphalt pull-out bay quad
        pushUpwardQuad(
          asphaltGeoms,
          [b.x - totalHalf, aY, zEdge],
          [b.x + totalHalf, aY, zEdge],
          [b.x - b.bayHalfLen, aY, zOuter],
          [b.x + b.bayHalfLen, aY, zOuter],
          0,
          0,
          (totalHalf * 2) / 14.0,
          b.bayDepth / 14.0
        );
        // White dashed pickup-bay boundary line along carriageway edge
        for (let dx = -b.bayHalfLen + 0.6; dx <= b.bayHalfLen - 0.6; dx += 1.6) {
          const dash = new THREE.PlaneGeometry(0.95, 0.12);
          dash.rotateX(-Math.PI * 0.5);
          dash.translate(b.x + dx, aY + 0.0012, zEdge + b.sideSign * 0.08);
          whiteStripeGeoms.push(dash);
        }
        // Recessed gutter + 3D granite curb + 2.30m passenger boarding sidewalk behind bay
        const ax = b.x - totalHalf;
        const bx = b.x + totalHalf;
        const off0 = b.sideSign * b.bayDepth;
        const offGut = b.sideSign * (b.bayDepth + 0.32);
        const offCurb = b.sideSign * (b.bayDepth + 0.54);
        const offSw = b.sideSign * (b.bayDepth + 2.74);
        gutterGeoms.push(makeRoadQuad(ax, zEdge, bx, zEdge, off0, offGut, aY, aY, 0.35, 0, gY, gY));
        curbGeoms.push(
          makeBeveledGraniteCurbSegment(ax, zEdge, bx, zEdge, offGut, offCurb, gY, gY, cY, cY, 0, true, true)
        );
        sidewalkGeoms.push(
          makeRoadQuad(ax, zEdge, bx, zEdge, offCurb, offSw, sY, sY, 1.0 / 2.70, ax)
        );
      } else {
        const xEdge = b.roadEdgeCoord;
        const xOuter = xEdge + b.sideSign * b.bayDepth;
        pushUpwardQuad(
          asphaltGeoms,
          [xEdge, aY, b.z - totalHalf],
          [xEdge, aY, b.z + totalHalf],
          [xOuter, aY, b.z - b.bayHalfLen],
          [xOuter, aY, b.z + b.bayHalfLen],
          0,
          0,
          (totalHalf * 2) / 14.0,
          b.bayDepth / 14.0
        );
        for (let dz = -b.bayHalfLen + 0.6; dz <= b.bayHalfLen - 0.6; dz += 1.6) {
          const dash = new THREE.PlaneGeometry(0.12, 0.95);
          dash.rotateX(-Math.PI * 0.5);
          dash.translate(xEdge + b.sideSign * 0.08, aY + 0.0012, b.z + dz);
          whiteStripeGeoms.push(dash);
        }
        // Along `(xEdge, z - totalHalf) -> (xEdge, z + totalHalf)`: `fx=0, fz=+1 => rx=-1, rz=0`, so `off = -sideSign * d`
        const az = b.z - totalHalf;
        const bz = b.z + totalHalf;
        const sDir = -b.sideSign;
        const off0 = sDir * b.bayDepth;
        const offGut = sDir * (b.bayDepth + 0.32);
        const offCurb = sDir * (b.bayDepth + 0.54);
        const offSw = sDir * (b.bayDepth + 2.74);
        gutterGeoms.push(makeRoadQuad(xEdge, az, xEdge, bz, off0, offGut, aY, aY, 0.35, 0, gY, gY));
        curbGeoms.push(
          makeBeveledGraniteCurbSegment(xEdge, az, xEdge, bz, offGut, offCurb, gY, gY, cY, cY, 0, true, true)
        );
        sidewalkGeoms.push(
          makeRoadQuad(xEdge, az, xEdge, bz, offCurb, offSw, sY, sY, 1.0 / 2.70, az)
        );
      }
    }

    // --------------------------------------------------------------------------
    // E. Road Markings, Paver Promenades (Strictly Clipped Outside Asphalt!),
    //    `1.0m`-Subdivided Gutters, Storm Drain Grates, 3D Granite Curbs & Grooved Sidewalks
    // --------------------------------------------------------------------------
    for (const r of CAMPUS_ROADS) {
      if (r.isArchedBridge) {
        this._buildStevensCreekArchedBridge(r);
        continue;
      }
      if (r.id === "googleplex_courtyard_walk") {
        // Built explicitly as the Stan T-Rex Circular Courtyard Promenade & Lawn Island below!
        continue;
      }

      if (r.surface === "pavers") {
        // Clip paver promenades strictly outside ALL asphalt carriageways (+0.36m flush granite header)
        // so 0.000m of tan paver EVER overlaps dark asphalt or white crosswalks!
        const dx = r.x2 - r.x1;
        const dz = r.z2 - r.z1;
        const len = Math.hypot(dx, dz) || 1.0;
        const halfW = r.widthM * 0.5;
        const stepSize = 1.0;
        const steps = Math.max(8, Math.ceil(len / stepSize));

        let prevInsideAsphalt = false;
        for (let s = 0; s < steps; s++) {
          const s0 = (s / steps) * len;
          const s1 = ((s + 1) / steps) * len;
          const u0 = s / steps;
          const u1 = (s + 1) / steps;
          const ax = r.x1 + dx * u0;
          const az = r.z1 + dz * u0;
          const bx = r.x1 + dx * u1;
          const bz = r.z1 + dz * u1;

          // Skip `shoreline_meadow_path` flat-cross-slope strips once inside the terrain-conforming `R = 25.2m`
          // Shoreline Concourse disc (`(14, -188)`) & circular Docking Medallion (`(14, -178)`) so zero terracotta
          // triangles ever poke through the circular Shoreline granite collar (`[VETO-RTR-01]`).
          if (
            r.id === "shoreline_meadow_path" &&
            (Math.hypot((ax + bx) * 0.5 - 14.0, (az + bz) * 0.5 - -178.0) < 7.5 ||
              Math.hypot((ax + bx) * 0.5 - 14.0, (az + bz) * 0.5 - -188.0) < 24.2)
          ) {
            continue;
          }

          // Reject any 1.0m paver segment if ANY of its 4 corners or midpoint approaches asphalt (`< 0.36m`)
          const rx = -(dz / len);
          const rz = dx / len;
          const minClear = Math.min(
            signedAsphaltClearance(ax + rx * -halfW, az + rz * -halfW),
            signedAsphaltClearance(ax + rx * halfW, az + rz * halfW),
            signedAsphaltClearance(bx + rx * -halfW, bz + rz * -halfW),
            signedAsphaltClearance(bx + rx * halfW, bz + rz * halfW),
            signedAsphaltClearance((ax + bx) * 0.5, (az + bz) * 0.5)
          );

          if (minClear < 0.36) {
            if (!prevInsideAsphalt && minClear > -0.8) {
              // Crisp flush Sierra granite transition header at the exact promenade/asphalt boundary
              const hy = getOpenWorldEarthHeight(ax, az) + 0.018;
              curbGeoms.push(makeRoadQuad(ax, az, bx, bz, -halfW, halfW, hy, hy, 0.35, s0));
            }
            prevInsideAsphalt = true;
            continue;
          }
          prevInsideAsphalt = false;

          const y0 = getOpenWorldEarthHeight(ax, az) + 0.016;
          const y1 = getOpenWorldEarthHeight(bx, bz) + 0.016;
          paverGeoms.push(makeRoadQuad(ax, az, bx, bz, -halfW, halfW, y0, y1, 0.22, s0));

          // Crisp white pedestrian/cyclist lane divider stripe along Bay View Waterfront Promenade (ZERO green strips!)
          if (r.id === "bay_view_promenade") {
            whiteStripeGeoms.push(
              makeRoadQuad(ax, az, bx, bz, -halfW + 2.40, -halfW + 2.54, y0 + 0.0012, y1 + 0.0012, 0.2, s0)
            );
          }
        }

        // Low chiseled Sierra granite seawall coping along east pond edge of Bay View Promenade (`x = 164.35`)
        if (r.id === "bay_view_promenade") {
          const wallCuts = [
            [76.0 - 7.4, 76.0 + 7.4],
            [-18.0 - 7.4, -18.0 + 7.4],
            [-86.0 - 6.2, -86.0 + 6.2],
          ];
          const zSpans = subtract1DIntervals(Math.min(r.z1, r.z2), Math.max(r.z1, r.z2), wallCuts);
          for (const [za, zb] of zSpans) {
            const segL = zb - za;
            const wall = new THREE.BoxGeometry(0.55, 0.36, segL);
            wall.translate(r.x1 + halfW + 0.35, 0.18, (za + zb) * 0.5);
            curbGeoms.push(wall);
          }
        }
        continue;
      }

      // Match active asphalt segment bounds (`shoreline_blvd` ends at `z=121.25`, `west_campus_ave` ends at `z=83.0`)
      const activeSeg = ACTIVE_ASPHALT_SEGMENTS.find((s) => s.id === r.id);
      if (!activeSeg) continue;

      const x1 = activeSeg.x1;
      const z1 = activeSeg.z1;
      const x2 = activeSeg.x2;
      const z2 = activeSeg.z2;
      const dx = x2 - x1;
      const dz = z2 - z1;
      const len = Math.hypot(dx, dz) || 1.0;
      const fx = dx / len;
      const fz = dz / len;
      const rx = -fz;
      const rz = fx;
      const halfW = activeSeg.halfW;
      const bikeW = Math.min(1.65, (halfW * 2.0) * 0.155);
      const sidewalkW = 2.70; // Exact 2 x 1.35m grooved concrete slabs!

      // 1. Thermoplastic Double-Yellow Centerlines & Crisp White Bike/Shoulder Stripes (ZERO green road strips!)
      //    Analytically clipped via `subtract1DIntervals(0, len, paintCuts)` against ALL intersections, hubs,
      //    crosswalks, and upstream `2.35m` stop-bars (+ `0.25m` clean asphalt gap) so longitudinal lines NEVER cross stop-bars!
      const isHorizontal = Math.abs(dz) < 0.01;
      const toRoadS = (wx, wz) => (wx - x1) * fx + (wz - z1) * fz;
      const paintCuts = [];
      const addPaintCutS = (sa, sb) => {
        let a = Math.min(sa, sb);
        let b = Math.max(sa, sb);
        if (a < 2.5) a = 0.0;
        if (b > len - 2.5) b = len;
        if (b > a) paintCuts.push([a, b]);
      };

      const roadStopCentersS = [];
      for (const it of CAMPUS_INTERSECTIONS) {
        const perpD = Math.abs(isHorizontal ? it.z - z1 : it.x - x1);
        if (perpD < halfW + 2.0) {
          const sIt = toRoadS(it.x, it.z);
          roadStopCentersS.push(sIt);
          addPaintCutS(sIt - (it.radiusM + 1.8), sIt + (it.radiusM + 1.8));
          if (sIt >= -2.0 && sIt <= 16.0) addPaintCutS(0.0, sIt + (it.radiusM + 1.8));
          if (sIt >= len - 16.0 && sIt <= len + 2.0) addPaintCutS(sIt - (it.radiusM + 1.8), len);
        }
      }
      for (const [hx, hz, hr] of [
        [156.0, 76.0, 10.6],
        [156.0, -18.0, 10.6],
        [156.0, -86.0, 9.8],
        [52.0, -86.0, 9.6],
        [-118.0, -50.0, 6.4],
      ]) {
        const perpD = Math.abs(isHorizontal ? hz - z1 : hx - x1);
        if (perpD < halfW + 2.0) {
          const sHub = toRoadS(hx, hz);
          roadStopCentersS.push(sHub);
          addPaintCutS(sHub - hr, sHub + hr);
          if (sHub >= -2.0 && sHub <= 14.0) addPaintCutS(0.0, sHub + hr);
          if (sHub >= len - 14.0 && sHub <= len + 2.0) addPaintCutS(sHub - hr, len);
        }
      }
      for (const cw of crosswalkSpecs) {
        if (cw.alongX !== isHorizontal) continue;
        const perpD = Math.abs(isHorizontal ? cw.cz - z1 : cw.cx - x1);
        if (perpD > 1.5) continue;
        const cCoord = isHorizontal ? cw.cx : cw.cz;
        // Stop-bar (`0.40m` wide) is at `cCoord + 2.35 * cw.stop` (outer edge `2.55m`); leave `0.25m` clean gap (`2.80m`)!
        const wMin = cw.stop < 0 ? cCoord - 2.80 : cCoord - 2.00;
        const wMax = cw.stop > 0 ? cCoord + 2.80 : cCoord + 2.00;
        const sA = isHorizontal ? toRoadS(wMin, z1) : toRoadS(x1, wMin);
        const sB = isHorizontal ? toRoadS(wMax, z1) : toRoadS(x1, wMax);
        let cutMin = Math.min(sA, sB);
        let cutMax = Math.max(sA, sB);
        const sCw = 0.5 * (sA + sB);
        for (let cIdx = 0; cIdx < roadStopCentersS.length; cIdx++) {
          const sNear = roadStopCentersS[cIdx];
          if (Math.abs(sNear - sCw) < 16.5) {
            cutMin = Math.min(cutMin, sNear);
            cutMax = Math.max(cutMax, sNear);
          }
        }
        addPaintCutS(cutMin, cutMax);
      }

      const paintSpans = subtract1DIntervals(0.0, len, paintCuts);
      const markStep = 2.0;
      for (const [spanA, spanB] of paintSpans) {
        const spanLen = spanB - spanA;
        if (spanLen < 0.25) continue;
        const markCount = Math.max(1, Math.ceil(spanLen / markStep));
        for (let m = 0; m < markCount; m++) {
          const s0 = spanA + (m / markCount) * spanLen;
          const s1 = spanA + ((m + 1) / markCount) * spanLen;
          const sm = 0.5 * (s0 + s1);
          const mx = x1 + fx * sm;
          const mz = z1 + fz * sm;
          const ax = x1 + fx * s0;
          const az = z1 + fz * s0;
          const bx = x1 + fx * s1;
          const bz = z1 + fz * s1;
          // Road paint strictly <= +0.0015m above +0.016m asphalt (`0.016 + 0.0012 = 0.0172m`) with polygonOffset!
          const markY = getOpenWorldEarthHeight(mx, mz) + 0.0172;

          // Aged thermoplastic double-yellow centerline
          yellowStripeGeoms.push(makeRoadQuad(ax, az, bx, bz, -0.17, -0.05, markY, markY, 0.25, s0));
          yellowStripeGeoms.push(makeRoadQuad(ax, az, bx, bz, 0.05, 0.17, markY, markY, 0.25, s0));

          // Crisp white bike-lane buffer stripe + subtle outer shoulder fog stripe (pure dark asphalt between!)
          for (const side of [-1, 1]) {
            const bikeLine = side * (halfW - bikeW - 0.24);
            whiteStripeGeoms.push(
              makeRoadQuad(ax, az, bx, bz, bikeLine, bikeLine + side * 0.12, markY, markY, 0.25, s0)
            );
            const fogLine = side * (halfW - 0.18);
            whiteStripeGeoms.push(
              makeRoadQuad(ax, az, bx, bz, fogLine - side * 0.08, fogLine, markY, markY, 0.25, s0)
            );
          }
        }
      }

      // 2. Analytically Clipped + `1.0m`-Subdivided Concrete Gutters, Storm Grates, 3D Granite Curbs & Sidewalks
      for (const side of [-1, 1]) {
        // World side sign along perpendicular axis (`+Z/-Z` for horizontal road, `+X/-X` for vertical road)
        const perpWorldX = rx * side;
        const perpWorldZ = rz * side;
        const cuts = [];

        // Project a world `(wx, wz)` point onto road parameter `s in [0, len]`
        const toS = (wx, wz) => (wx - x1) * fx + (wz - z1) * fz;

        // Cut out exact `[ix/iz ± (halfW_perp + 3.60m)]` spans at every curved corner fillet on this side!
        for (const cf of INTERSECTION_CORNER_FILLETS) {
          if (isHorizontal && Math.abs(cf.iz - z1) < 0.1 && Math.sign(perpWorldZ) === cf.sz) {
            const sCenter = toS(cf.ix, z1);
            const cutHalf = cf.halfWV + cf.rFillet;
            cuts.push([cf.sx < 0 ? sCenter - cutHalf : sCenter - cf.halfWV, cf.sx > 0 ? sCenter + cutHalf : sCenter + cf.halfWV]);
          } else if (!isHorizontal && Math.abs(cf.ix - x1) < 0.1 && Math.sign(perpWorldX) === cf.sx) {
            const sCenter = toS(x1, cf.iz);
            const cutHalf = cf.halfWH + cf.rFillet;
            cuts.push([cf.sz < 0 ? sCenter - cutHalf : sCenter - cf.halfWH, cf.sz > 0 ? sCenter + cutHalf : sCenter + cf.halfWH]);
          }
        }

        // Cut out Bay View Waterfront Promenade (`x = 156, halfW = 8.0`) & Stevens Creek Bridge (`(52, -86)`)
        if (isHorizontal) {
          const sProm = toS(156.0, z1);
          cuts.push([sProm - 8.2, sProm + 8.2]);
          if (Math.abs(z1 - -86.0) < 0.1 && perpWorldZ < 0) {
            const sBr = toS(52.0, z1);
            cuts.push([sBr - 5.2, sBr + 5.2]);
          }
          // Open Gradient Canopy Forecourt threshold (`x in [-16.0, +16.0]`) on +Z side of `gradient_driveway`
          if (r.id === "gradient_driveway" && perpWorldZ > 0) {
            cuts.push([toS(-16.0, z1), toS(16.0, z1)]);
          }
          // Open Googleplex Stan T-Rex Courtyard pedestrian gateway (`x in [-123.6, -112.4]`) on -Z side of `amphitheatre_pkwy`
          if (r.id === "amphitheatre_pkwy" && perpWorldZ < 0) {
            cuts.push([toS(-123.6, z1), toS(-112.4, z1)]);
          }
        }

        // Cut out the 5 recessed curbside Waymo Gen 6 pickup bays (`±6.2m`) on matching road & side
        for (const wb of CURBSIDE_WAYMO_BAYS) {
          if (wb.roadId !== r.id) continue;
          const matchSide = isHorizontal
            ? Math.sign(perpWorldZ) === wb.sideSign
            : Math.sign(perpWorldX) === wb.sideSign;
          if (matchSide) {
            const sBay = toS(wb.x, wb.z);
            cuts.push([sBay - (wb.bayHalfLen + 1.4), sBay + (wb.bayHalfLen + 1.4)]);
          }
        }

        const cleanSpans = subtract1DIntervals(0.0, len, cuts);
        for (const [spanA, spanB] of cleanSpans) {
          const spanLen = spanB - spanA;
          const subCount = Math.max(1, Math.ceil(spanLen / 1.0)); // Strict <= 1.0m subdivision!
          for (let k = 0; k < subCount; k++) {
            const s0 = spanA + (k / subCount) * spanLen;
            const s1 = spanA + ((k + 1) / subCount) * spanLen;
            const ax = x1 + fx * s0;
            const az = z1 + fz * s0;
            const bx = x1 + fx * s1;
            const bz = z1 + fz * s1;
            const mx = 0.5 * (ax + bx);
            const mz = 0.5 * (az + bz);

            const gutIn = side * halfW;
            const gutOut = side * (halfW + 0.32);
            const curbOut = side * (halfW + 0.54);
            const swOut = side * (halfW + 0.54 + sidewalkW);
            const skirtOut = side * (halfW + 0.68 + sidewalkW);

            // Strict 4-corner `signedCarriagewayClearance >= 0.05m` assertion on every curb/sidewalk quad!
            const c00 = signedCarriagewayClearance(ax + rx * gutOut, az + rz * gutOut);
            const c10 = signedCarriagewayClearance(ax + rx * swOut, az + rz * swOut);
            const c01 = signedCarriagewayClearance(bx + rx * gutOut, bz + rz * gutOut);
            const c11 = signedCarriagewayClearance(bx + rx * swOut, bz + rz * swOut);
            if (Math.min(c00, c10, c01, c11) < 0.05) continue;

            // Keep Gradient Gym interior clear
            const testSwX = mx + rx * (side * (halfW + 1.8));
            const testSwZ = mz + rz * (side * (halfW + 1.8));
            if (Math.abs(testSwX) <= 13.5 && testSwZ >= 130.5 && testSwZ <= 153.0) continue;

            const e0 = getOpenWorldEarthHeight(ax, az);
            const e1 = getOpenWorldEarthHeight(bx, bz);
            const aY0 = e0 + 0.016, aY1 = e1 + 0.016;
            const gY0 = e0 + 0.013, gY1 = e1 + 0.013;
            const cY0 = e0 + 0.115, cY1 = e1 + 0.115;
            const sY0 = e0 + 0.094, sY1 = e1 + 0.094;
            const skY0 = e0 - 0.14, skY1 = e1 - 0.14;

            // 1. 0.32m Concrete Gutter Pan
            gutterGeoms.push(
              makeRoadQuad(ax, az, bx, bz, gutIn, gutOut, aY0, aY1, 0.35, s0, gY0, gY1)
            );

            // 2. 3D Beveled Sierra Granite Curb (`+0.115m` crown + 45° chamfer)
            curbGeoms.push(
              makeBeveledGraniteCurbSegment(
                ax,
                az,
                bx,
                bz,
                gutOut,
                curbOut,
                gY0 - 0.002,
                gY1 - 0.002,
                cY0,
                cY1,
                s0,
                k === 0,
                k === subCount - 1
              )
            );

            // 3. 2.70m Grooved Concrete Sidewalk (`1.35m x 1.35m` continuous slab UV grid!)
            sidewalkGeoms.push(
              makeRoadQuad(ax, az, bx, bz, curbOut, swOut, sY0, sY1, 1.0 / 2.70, s0)
            );

            // 4. Outer turf-edge sidewalk foundation skirt (zero floating slab edge!)
            curbGeoms.push(
              makeRoadQuad(ax, az, bx, bz, swOut, skirtOut, sY0, sY1, 0.35, s0, skY0, skY1)
            );

            // 5. Recessed Slotted Cast-Iron Storm Drain Grates every ~28m in the gutter pan!
            if (
              k > 2 &&
              k < subCount - 3 &&
              Math.floor(s0) % 28 === 0 &&
              Math.floor(s0) !== Math.floor(s0 - (s1 - s0))
            ) {
              const grateG = new THREE.PlaneGeometry(0.28, 0.56);
              grateG.rotateX(-Math.PI * 0.5);
              grateG.rotateY(Math.atan2(fx, fz));
              grateG.translate(
                mx + rx * (side * (halfW + 0.16)),
                0.5 * (gY0 + gY1) + 0.0025,
                mz + rz * (side * (halfW + 0.16))
              );
              grateGeoms.push(grateG);
            }
          }
        }
      }
    }

    // --------------------------------------------------------------------------
    // F. Raised Concrete Sidewalk Café Aprons under All 5 MK Espresso Carts
    // --------------------------------------------------------------------------
    for (let i = 0; i < MK_BOOST_PADS.length; i++) {
      const pad = MK_BOOST_PADS[i];
      let bestRoad = null;
      let bestD = Infinity;
      for (const r of CAMPUS_ROADS) {
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
      const apronY = getOpenWorldEarthHeight(pad.x, pad.z) + (isPaverRoad ? 0.018 : 0.094);
      const innerD = isPaverRoad ? halfW + 0.12 : halfW + 0.54;
      const outerD = halfW + 4.25;
      const pA = [pad.x - fx * 6.20, pad.z - fz * 6.20];
      const pB = [pad.x + fx * 4.20, pad.z + fz * 4.20];
      // Verify all 4 apron corners stay strictly outside carriageway (`>= 0.08m`)
      if (
        signedCarriagewayClearance(
          pad.x + rightX * sideSign * innerD,
          pad.z + rightZ * sideSign * innerD
        ) >= 0.08
      ) {
        const g = new THREE.PlaneGeometry(outerD - innerD, 10.40);
        g.rotateX(-Math.PI * 0.5);
        g.rotateY(Math.atan2(fx, fz));
        const midOff = 0.5 * (innerD + outerD);
        g.translate(
          0.5 * (pA[0] + pB[0]) + rightX * sideSign * midOff,
          apronY,
          0.5 * (pA[1] + pB[1]) + rightZ * sideSign * midOff
        );
        sidewalkGeoms.push(g);
      }
    }

    // --------------------------------------------------------------------------
    // G. Strictly Clipped Campus Plazas & Roundabout Collars (`0.000m` Road Overlap!)
    //    V6 FIX (#60 Item 2): Removed the overwide `1B` terrace slab (`x in [+1.05, +15.8], z in [87.2, 106.2]`)
    //    so `shoreline_blvd` (`x in [-7.0m, +7.0m]`) is 100% SYMMETRIC full-width dark-charcoal asphalt with
    //    dead-center double yellow lines (`x = 0.0m`), symmetric bike lanes, and symmetric granite curbs (`|x| = 7.32..7.54m`)!
    // --------------------------------------------------------------------------
    // 1. Google Visitor Experience / Gradient Canopy Interlocking Hexagonal Granite Paver Forecourt (`x in [-24, +28], z in [121.60, 127.00]`)
    //    Starts strictly north of `gradient_driveway` (`z = 121.25`) behind a `0.35m` flush Sierra granite header,
    //    and tapers seamlessly (`0.016m -> 0.003m`) into `Gradient_Canopy_Building_V6`'s `Visitor_Forecourt_HexPavers_Planter_Masts_V6` (`z >= 126.83`, `minY = 0.000m`)!
    curbGeoms.push(makeRoadQuad(-24.0, 121.425, 28.0, 121.425, -0.175, 0.175, 0.022, 0.022, 0.45));
    {
      const hexForecourtGeoms = [];
      const forecourtSteps = 6;
      for (let s = 0; s < forecourtSteps; s++) {
        const uA = s / forecourtSteps;
        const uB = (s + 1) / forecourtSteps;
        const zA = 121.60 + uA * (127.00 - 121.60);
        const zB = 121.60 + uB * (127.00 - 121.60);
        const yA = uA > 0.80 ? THREE.MathUtils.lerp(0.016, 0.003, (uA - 0.80) / 0.20) : 0.016;
        const yB = uB > 0.80 ? THREE.MathUtils.lerp(0.016, 0.003, (uB - 0.80) / 0.20) : 0.016;
        hexForecourtGeoms.push(
          makeRoadQuad(2.0, zA, 2.0, zB, -26.0, 26.0, yA, yB, 1.0 / 2.20, zA)
        );
      }
      const mergedHexForecourt = mergeCampusStaticGeometries(hexForecourtGeoms);
      if (mergedHexForecourt) {
        const hexPaverMat =
          this.materials.visitorHexPavers || createVisitorHexPaversMaterialFallback();
        const hexForecourtMesh = new THREE.Mesh(mergedHexForecourt, hexPaverMat);
        hexForecourtMesh.name = "Visitor_Experience_Hex_Paver_Forecourt_V6";
        hexForecourtMesh.receiveShadow = true;
        hexForecourtMesh.castShadow = false;
        hexForecourtMesh.matrixAutoUpdate = false;
        hexForecourtMesh.updateMatrix();
        this.root.add(hexForecourtMesh);
      }
    }
    // 1C. Bay View Promenade Waymo Drop-Off Beveled Sierra Granite Curb Divider (`x = 159.35, z in [37.0, 46.8]`)
    {
      const bvY0 = getOpenWorldEarthHeight(159.35, 37.0) + 0.018;
      const bvY1 = getOpenWorldEarthHeight(159.35, 46.8) + 0.018;
      curbGeoms.push(
        makeBeveledGraniteCurbSegment(
          159.35,
          37.0,
          159.35,
          46.8,
          -0.24,
          0.24,
          bvY0 - 0.01,
          bvY1 - 0.01,
          bvY0 + 0.105,
          bvY1 + 0.105,
          0.0,
          true,
          true
        )
      );
    }

    // 2. Android Lawn Sculpture Plaza (`(-118, 96)`, full unclipped 360° `R = 8.95m` sandstone disc + straight gateway apron -> ZERO polar sawtooth!)
    //    Flush Sierra granite threshold header across `z in [86.60, 86.95]` between curved curb returns:
    curbGeoms.push(makeRoadQuad(-124.5, 86.775, -111.5, 86.775, -0.175, 0.175, 0.020, 0.020, 0.45));
    paverGeoms.push(
      makeRoadQuad(-118.0, 86.95, -118.0, 93.2, -4.6, 4.6, 0.016, 0.016, 0.25, 0.0)
    );
    // Beveled Sierra granite side curbs flanking the straight `x in [-122.6, -113.4]` South gateway apron (`z = 86.95 -> 88.35`)
    for (const sideS of [-1, 1]) {
      const gx = -118.0 + sideS * 4.6;
      const bY0 = getOpenWorldEarthHeight(gx, 86.95);
      const bY1 = getOpenWorldEarthHeight(gx, 88.35);
      curbGeoms.push(
        makeBeveledGraniteCurbSegment(
          gx,
          86.95,
          gx,
          88.35,
          0.0,
          sideS * 0.42,
          bY0 - 0.04,
          bY1 - 0.04,
          bY0 + 0.036,
          bY1 + 0.036,
          0.0,
          true,
          false
        )
      );
    }
    paverGeoms.push(
      makeTerrainConformingDisc(
        -118.0,
        96.0,
        8.95,
        6,
        64,
        0.016,
        0.24,
        0.0,
        null,
        null
      )
    );
    // Solid 3D chamfered Sierra granite garden curb collar (`R = 8.98m`, open along South approach walkway) grounding Android Plaza flush into turf!
    {
      const androidCollar = new THREE.Mesh(
        buildGraniteCurbCollarRingGeometry(THREE, -118.0, 96.0, 8.98, {
          heightAt: getOpenWorldEarthHeight,
          startThetaRad: -Math.PI * 0.5 + 0.50,
          arcThetaRad: Math.PI * 2.0 - 1.00,
          curbWidthM: 0.34,
          curbHeightM: 0.082,
        }),
        this.materials.graniteCurb || this.materials.concreteCurb
      );
      androidCollar.name = "V5_Android_Lawn_Granite_Collar";
      androidCollar.receiveShadow = true;
      androidCollar.castShadow = false;
      androidCollar.matrixAutoUpdate = false;
      androidCollar.updateMatrix();
      this.root.add(androidCollar);
    }

    // 3. Pedestrian Googleplex Stan T-Rex Courtyard (`x = -118, z = -25 .. -72.5`):
    //    - Flush Sierra granite gateway curb header + architectural pedestrian bollards at `z = -25.0`
    //    - Warm herringbone terracotta/sandstone paver promenade (`z = -25.45 .. -35.8`) splitting into
    //      a circular courtyard ring walk (`R_inner = 13.6m, R_outer = 18.8m` centered at `(-118, -50)`),
    //    - Lush green fescue turf & garden lawn island (`R = 13.6m` around `(-118, -50)`) so Stan T-Rex
    //      AND 100% of all 54 pink lawn flamingos stand on lush green grass + 3D grass blades!
    {
      const gwY = getOpenWorldEarthHeight(-118.0, -25.2) + 0.022;
      // Flush Sierra granite gateway header across `x in [-123.6, -112.4], z in [-25.00, -25.45]`
      curbGeoms.push(
        makeRoadQuad(-123.6, -25.225, -112.4, -25.225, -0.225, 0.225, gwY, gwY, 0.45)
      );
      // Yellow tactile ADA truncated-dome warning pad across gateway center
      const gwAda = new THREE.BoxGeometry(3.2, 0.016, 0.66);
      gwAda.translate(-118.0, gwY + 0.008, -25.85);
      ADA_Geoms.push(gwAda);

      // 4 Architectural Sierra-granite & brushed-steel gateway bollards at `z = -25.25` (leaving 3.2m center bikeway clear!)
      const bollardSteelGeoms = [];
      for (const bx of [-122.4, -119.6, -116.4, -113.6]) {
        const by = getOpenWorldEarthHeight(bx, -25.25);
        const gBase = new THREE.CylinderGeometry(0.18, 0.21, 0.24, 14);
        gBase.translate(bx, by + 0.12, -25.25);
        curbGeoms.push(gBase);
        const sPost = new THREE.CylinderGeometry(0.115, 0.125, 0.72, 14);
        sPost.translate(bx, by + 0.58, -25.25);
        const sCap = new THREE.SphereGeometry(0.115, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
        sCap.translate(bx, by + 0.94, -25.25);
        bollardSteelGeoms.push(sPost, sCap);
      }
      if (bollardSteelGeoms.length > 0) {
        const bollardMesh = new THREE.Mesh(
          mergeCampusStaticGeometries(bollardSteelGeoms),
          this.materials.steelMullion
        );
        bollardMesh.castShadow = true;
        bollardMesh.receiveShadow = true;
        bollardMesh.matrixAutoUpdate = false;
        bollardMesh.updateMatrix();
        this.root.add(bollardMesh);
      }

      // North herringbone terracotta/sandstone paver promenade (`z = -25.45 -> -35.80`)
      const promSteps = 8;
      for (let s = 0; s < promSteps; s++) {
        const zA = -25.45 + (s / promSteps) * (-35.80 - -25.45);
        const zB = -25.45 + ((s + 1) / promSteps) * (-35.80 - -25.45);
        const yA = getOpenWorldEarthHeight(-118.0, zA) + 0.016;
        const yB = getOpenWorldEarthHeight(-118.0, zB) + 0.016;
        paverGeoms.push(
          makeRoadQuad(-118.0, zA, -118.0, zB, -5.4, 5.4, yA, yB, 0.24, Math.abs(zA + 25.45))
        );
      }

      // Circular Courtyard Paver Walk (`R_inner = 13.6m, R_outer = 18.8m` centered at `(-118.0, -50.0)`)
      paverGeoms.push(
        makeTerrainConformingDisc(
          -118.0,
          -50.0,
          18.8,
          10,
          64,
          0.016,
          0.24,
          13.6,
          null,
          (wx, wz) => wz <= -28.4 && signedAsphaltClearance(wx, wz) >= 3.35
        )
      );

      // South Courtyard Garden Paver Terrace (`z = -64.2 -> -72.5`)
      for (let s = 0; s < 6; s++) {
        const zA = -64.2 + (s / 6) * (-72.5 - -64.2);
        const zB = -64.2 + ((s + 1) / 6) * (-72.5 - -64.2);
        const yA = getOpenWorldEarthHeight(-118.0, zA) + 0.016;
        const yB = getOpenWorldEarthHeight(-118.0, zB) + 0.016;
        paverGeoms.push(
          makeRoadQuad(-118.0, zA, -118.0, zB, -4.8, 4.8, yA, yB, 0.24, Math.abs(zA + 64.2))
        );
      }

      // Low flush Sierra granite garden edging collar (`R = 13.52m..13.78m`) framing the lush `R = 13.6m` Flamingo Lawn Island
      const lawnEdgeSegs = 56;
      for (let i = 0; i < lawnEdgeSegs; i++) {
        const a0 = (i / lawnEdgeSegs) * Math.PI * 2.0;
        const a1 = ((i + 1) / lawnEdgeSegs) * Math.PI * 2.0;
        const ax = -118.0 + Math.cos(a0) * 13.65;
        const az = -50.0 + Math.sin(a0) * 13.65;
        const bx = -118.0 + Math.cos(a1) * 13.65;
        const bz = -50.0 + Math.sin(a1) * 13.65;
        const e0 = getOpenWorldEarthHeight(ax, az);
        const e1 = getOpenWorldEarthHeight(bx, bz);
        curbGeoms.push(
          makeRoadQuad(ax, az, bx, bz, -0.14, 0.14, e0 + 0.024, e1 + 0.024, 0.45, i * 0.6)
        );
      }
      // NOTE: Zero circular granite collar around `(-118, -50)` in V5 so lush lawn grows flush up to Stan's `2.26m x 4.12m` rectangular Sierra granite monument plinth!
    }

    // 4. Shoreline Amphitheatre Concourse (`(14, -188)`), recessed strictly inside `r < 6.36m` underneath the `6.14..6.50m` granite collar!
    paverGeoms.push(
      makeTerrainConformingDisc(14.0, -188.0, 25.2, 56, 112, 0.016, 0.24, 0.0, {
        x: 14.0,
        z: -178.0,
        r: 6.36,
      })
    );

    const addStaticBatch = (geoms, mat, receiveShadow = true, castShadow = false) => {
      const merged = mergeCampusStaticGeometries(geoms);
      if (!merged) return;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.receiveShadow = receiveShadow;
      mesh.castShadow = castShadow;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.root.add(mesh);
    };

    const prepRoadPaintMat = (m) => {
      if (!m) return m;
      const cm = m.clone();
      cm.polygonOffset = true;
      cm.polygonOffsetFactor = -2;
      cm.polygonOffsetUnits = -2;
      return cm;
    };

    addStaticBatch(asphaltGeoms, this.materials.roadAsphalt || this.materials.asphaltRoad, true, false);
    addStaticBatch(gutterGeoms, this.materials.concreteGutter || this.materials.concreteSidewalk, true, false);
    addStaticBatch(grateGeoms, this.materials.stormGrateIron || this.materials.steelMullion, false, false);
    addStaticBatch(whiteStripeGeoms, prepRoadPaintMat(this.materials.roadStripeWhite), false, false);
    addStaticBatch(yellowStripeGeoms, prepRoadPaintMat(this.materials.roadStripeYellow), false, false);
    addStaticBatch(sidewalkGeoms, this.materials.concreteSidewalk || this.materials.concretePath, true, false);
    addStaticBatch(curbGeoms, this.materials.graniteCurb || this.materials.concreteCurb, true, true);
    addStaticBatch(paverGeoms, this.materials.brickPath, true, false);
    addStaticBatch(ADA_Geoms, this.materials.tactileAdaYellow, true, false);
  }

  /**
   * Sculpted Cambered Corten-Steel & Timber Warren Truss Bridge (`(52, -86) -> (18, -158)`)
   * matching `getStevensCreekBridgeParam` (`1.18 * sin^2(pi * u)`) to `0.00mm`!
   */
  _buildStevensCreekArchedBridge(r) {
    const bridgeGroup = new THREE.Group();
    const dx = r.x2 - r.x1;
    const dz = r.z2 - r.z1;
    const len = Math.hypot(dx, dz);
    const fx = dx / len;
    const fz = dz / len;
    const rx = -fz;
    const rz = fx;
    const halfW = r.widthM * 0.5;
    const segs = 40;

    const plankGeoms = [];
    const cortenGeoms = [];
    const railGeoms = [];
    const concreteGeoms = [];

    // Cambered timber plank deck (`1.18 * sin^2(pi * u)`)
    for (let i = 0; i < segs; i++) {
      const u0 = i / segs;
      const u1 = (i + 1) / segs;
      const x0 = r.x1 + dx * u0;
      const z0 = r.z1 + dz * u0;
      const x1 = r.x1 + dx * u1;
      const z1 = r.z1 + dz * u1;
      const y0 = r.archHeightM * Math.pow(Math.sin(Math.PI * u0), 2) + 0.004;
      const y1 = r.archHeightM * Math.pow(Math.sin(Math.PI * u1), 2) + 0.004;
      plankGeoms.push(makeRoadQuad(x0, z0, x1, z1, -halfW, halfW, y0, y1, 0.55));
    }

    // Twin Corten-Steel Parabolic Warren Truss Side Girders + Cross-Beams + Cyclist Safety Rails
    const yawSeg = Math.atan2(fx, fz);
    for (const side of [-1, 1]) {
      const lat = side * (halfW + 0.24);
      const lowerPts = [];
      const upperPts = [];
      const handPts = [];
      const trussNodes = 16;

      for (let k = 0; k <= trussNodes; k++) {
        const u = k / trussNodes;
        const bx = r.x1 + dx * u + rx * lat;
        const bz = r.z1 + dz * u + rz * lat;
        const deckY = r.archHeightM * Math.pow(Math.sin(Math.PI * u), 2);
        const archH = 1.35 + 1.45 * Math.sin(Math.PI * u);

        lowerPts.push(new THREE.Vector3(bx, deckY - 0.12, bz));
        upperPts.push(new THREE.Vector3(bx, deckY + archH, bz));
        handPts.push(new THREE.Vector3(r.x1 + dx * u + rx * (side * (halfW - 0.08)), deckY + 1.05, r.z1 + dz * u + rz * (side * (halfW - 0.08))));

        // Vertical post
        const postG = new THREE.BoxGeometry(0.14, archH + 0.22, 0.14);
        postG.rotateY(yawSeg);
        postG.translate(bx, deckY + archH * 0.5 - 0.06, bz);
        cortenGeoms.push(postG);

        // Transverse under-deck floor beam (once from side = 1)
        if (side === 1) {
          const beamG = new THREE.BoxGeometry(r.widthM + 0.65, 0.22, 0.18);
          beamG.rotateY(yawSeg);
          beamG.translate(r.x1 + dx * u, deckY - 0.14, r.z1 + dz * u);
          cortenGeoms.push(beamG);
        }
      }

      // Warren diagonal truss struts
      for (let k = 0; k < trussNodes; k++) {
        const pA = k % 2 === 0 ? lowerPts[k] : upperPts[k];
        const pB = k % 2 === 0 ? upperPts[k + 1] : lowerPts[k + 1];
        cortenGeoms.push(
          new THREE.TubeGeometry(new THREE.LineCurve3(pA, pB), 2, 0.065, 6, false)
        );
      }

      cortenGeoms.push(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lowerPts), 32, 0.11, 8, false),
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(upperPts), 32, 0.12, 8, false)
      );
      railGeoms.push(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(handPts), 32, 0.045, 8, false)
      );
    }

    // North & South Concrete Bridge Abutments + Creek Pier Footings grounded deep below `y = -0.7m`
    for (const uAbut of [0.0, 1.0, 0.36, 0.64]) {
      const ax = r.x1 + dx * uAbut;
      const az = r.z1 + dz * uAbut;
      const topY = r.archHeightM * Math.pow(Math.sin(Math.PI * uAbut), 2) - 0.12;
      const h = topY - -0.85;
      const pier = new THREE.BoxGeometry(r.widthM + 1.1, h, uAbut === 0 || uAbut === 1 ? 2.4 : 1.1);
      pier.rotateY(yawSeg);
      pier.translate(ax, -0.85 + h * 0.5, az);
      concreteGeoms.push(pier);
    }

    const addPart = (geoms, mat, cast = true) => {
      const m = mergeCampusStaticGeometries(geoms);
      if (!m) return;
      const mesh = new THREE.Mesh(m, mat);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      bridgeGroup.add(mesh);
    };

    addPart(plankGeoms, this.materials.bridgePlanks, true);
    addPart(cortenGeoms, this.materials.cortenTruss, true);
    addPart(railGeoms, this.materials.bridgeRailing, false);
    addPart(concreteGeoms, this.materials.concreteCurb, true);
    bakeStaticGroupByMaterial(bridgeGroup);

    bridgeGroup.matrixAutoUpdate = false;
    bridgeGroup.updateMatrix();
    this.stevensBridgeGroup = bridgeGroup;
    this.root.add(bridgeGroup);
  }

  // ============================================================================
  // 3. DENSE ARCHITECTURAL CAMPUS BLOCKS (`CAMPUS_BUILDING_BLOCKS` + AO APRONS)
  // ============================================================================
  _buildCampusBuildingBlocks() {
    this.proceduralBuildingsGroup = new THREE.Group();
    this.proceduralBuildingsGroup.name = "Procedural_Campus_Buildings";
    this.root.add(this.proceduralBuildingsGroup);

    this.solarCarportGroup = new THREE.Group();
    this.solarCarportGroup.name = "Campus_Solar_Carport";
    this.root.add(this.solarCarportGroup);

    const quadrants = Array.from({ length: 4 }, () => ({
      timberGeoms: [],
      glassGeoms: [],
      glowGeoms: [],
      steelGeoms: [],
      concreteGeoms: [],
      accentGeoms: [[], [], [], []],
    }));

    const solarSteelGeoms = [];
    const solarConcreteGeoms = [];
    const solarPanelGeoms = [];
    const buildingAoGeoms = [];

    for (const b of CAMPUS_BUILDING_BLOCKS) {
      // `bldg_gradient_canopy` and `bldg_bayview_canopy` use their hero sculpted shells!
      if (
        b.id === "bldg_gradient_canopy" ||
        b.id === "bldg_bayview_canopy" ||
        b.id === "bldg_bay_view" ||
        b.style === "dragonscale"
      ) {
        continue;
      }

      // Separate `bldg_north_commons` cleanly east of `bldg_plex_41` (`cx = -32`, clear of `shoreline_blvd` sidewalks!)
      const bx = b.id === "bldg_north_commons" ? -32.0 : (b.cx ?? b.x ?? 0.0);
      const bz = b.cz ?? b.z ?? 0.0;
      const gy = getOpenWorldEarthHeight(bx, bz);
      const baseY = gy + 0.06;
      const sx = b.wx ?? (b.halfX ? b.halfX * 2.0 : 28.0);
      const sz = b.wz ?? (b.halfZ ? b.halfZ * 2.0 : 24.0);
      const h = b.hy ?? b.heightM ?? 12.0;

      if (b.style === "solar_carport") {
        // Paved Solar EV Parking Plaza (`(-162, 28)`) + Angled Butterfly PV Canopies!
        const lotPad = new THREE.BoxGeometry(sx + 2.0, 0.24, sz + 2.0);
        lotPad.translate(bx, gy - 0.04, bz);
        solarConcreteGeoms.push(lotPad);

        const rows = 2;
        for (let rIdx = 0; rIdx < rows; rIdx++) {
          const rz = bz + (rIdx - 0.5) * (sz * 0.52);
          for (let col = -2; col <= 2; col++) {
            const cx = bx + col * (sx * 0.20);
            const post = new THREE.CylinderGeometry(0.18, 0.22, h, 14);
            post.translate(cx, gy + h * 0.5, rz);
            solarSteelGeoms.push(post);

            const beam = new THREE.BoxGeometry(0.24, 0.26, sz * 0.42);
            beam.rotateX(0.14);
            beam.translate(cx, gy + h - 0.1, rz);
            solarSteelGeoms.push(beam);
          }
          const pvDeck = new THREE.BoxGeometry(sx * 0.96, 0.12, sz * 0.44);
          pvDeck.rotateX(0.14);
          pvDeck.translate(bx, gy + h + 0.08, rz);
          solarPanelGeoms.push(pvDeck);
        }
        continue;
      }

      // Soft Contact AO Shadow Apron (`gy + 0.018m`) grounding building plinth to turf/pavement!
      const aoApron = new THREE.PlaneGeometry(sx + 5.6, sz + 5.6);
      aoApron.rotateX(-Math.PI * 0.5);
      aoApron.translate(bx, gy + 0.018, bz);
      buildingAoGeoms.push(aoApron);

      const q = quadrants[(bx >= 0 ? 1 : 0) + (bz >= 0 ? 2 : 0)];
      const {
        timberGeoms,
        glassGeoms,
        glowGeoms,
        steelGeoms,
        concreteGeoms,
        accentGeoms,
      } = q;

      // Grounded architectural concrete plinth (`minY <= gy - 0.12m` -> zero floating!)
      const plinth = new THREE.BoxGeometry(sx + 1.4, 0.56, sz + 1.4);
      plinth.translate(bx, gy + 0.16, bz);
      concreteGeoms.push(plinth);

      if (b.style === "timber") {
        // Warm Mass-Timber Cedar Pavilion with Cantilevered Eaves & Clerestory Monitor
        const coreGlass = new THREE.BoxGeometry(sx * 0.92, h * 0.86, sz * 0.92);
        coreGlass.translate(bx, baseY + h * 0.43, bz);
        glassGeoms.push(coreGlass);

        const roofSlab = new THREE.BoxGeometry(sx * 1.06, 0.62, sz * 1.06);
        roofSlab.translate(bx, baseY + h * 0.88, bz);
        timberGeoms.push(roofSlab);

        const midSoffit = new THREE.BoxGeometry(sx * 1.03, 0.44, sz * 1.03);
        midSoffit.translate(bx, baseY + h * 0.46, bz);
        timberGeoms.push(midSoffit);

        const monitor = new THREE.BoxGeometry(sx * 0.58, h * 0.18, sz * 0.54);
        monitor.translate(bx, baseY + h * 0.98, bz);
        glowGeoms.push(monitor);

        const monitorCap = new THREE.BoxGeometry(sx * 0.64, 0.36, sz * 0.60);
        monitorCap.translate(bx, baseY + h * 1.08, bz);
        timberGeoms.push(monitorCap);

        // Perimeter glulam timber columns grounded on plinth
        const colsX = Math.max(3, Math.round(sx / 7.5));
        const colsZ = Math.max(3, Math.round(sz / 7.5));
        for (let ix = 0; ix <= colsX; ix++) {
          const px = bx - sx * 0.48 + (ix / colsX) * (sx * 0.96);
          for (const sideZ of [-1, 1]) {
            const colG = new THREE.BoxGeometry(0.38, h * 0.88, 0.38);
            colG.translate(px, baseY + h * 0.44, bz + sideZ * (sz * 0.48));
            timberGeoms.push(colG);
          }
        }
        for (let iz = 1; iz < colsZ; iz++) {
          const pz = bz - sz * 0.48 + (iz / colsZ) * (sz * 0.96);
          for (const sideX of [-1, 1]) {
            const colG = new THREE.BoxGeometry(0.38, h * 0.88, 0.38);
            colG.translate(bx + sideX * (sx * 0.48), baseY + h * 0.44, pz);
            timberGeoms.push(colG);
          }
        }
      } else {
        // `glass_modern` & `plex_glass` (Googleplex Bldg 40/41/42 & Tech Hubs)
        const lowerWing = new THREE.BoxGeometry(sx * 0.96, h * 0.64, sz * 0.96);
        lowerWing.translate(bx, baseY + h * 0.32, bz);
        glassGeoms.push(lowerWing);

        const upperSetback = new THREE.BoxGeometry(sx * 0.78, h * 0.36, sz * 0.78);
        upperSetback.translate(bx, baseY + h * 0.80, bz);
        glassGeoms.push(upperSetback);

        // Glowing top clerestory band
        const topGlow = new THREE.BoxGeometry(sx * 0.80, 0.85, sz * 0.80);
        topGlow.translate(bx, baseY + h * 0.94, bz);
        glowGeoms.push(topGlow);

        // Horizontal steel sunshade slabs + rooftop mechanical parapet
        for (const frac of [0.34, 0.64, 0.99]) {
          const wScale = frac > 0.7 ? 0.83 : 1.02;
          const slab = new THREE.BoxGeometry(sx * wScale, 0.38, sz * wScale);
          slab.translate(bx, baseY + h * frac, bz);
          steelGeoms.push(slab);
        }

        // Vertical steel curtain-wall mullions
        const mulCountX = Math.max(4, Math.round(sx / 5.5));
        for (let ix = 0; ix <= mulCountX; ix++) {
          const mx = bx - sx * 0.48 + (ix / mulCountX) * (sx * 0.96);
          for (const sideZ of [-1, 1]) {
            const mG = new THREE.BoxGeometry(0.18, h * 0.64, 0.24);
            mG.translate(mx, baseY + h * 0.32, bz + sideZ * (sz * 0.48));
            steelGeoms.push(mG);
          }
        }

        // Iconic 4-Color Google Sun-Fins on `plex_glass` buildings (`Bldg 40/41/42`)!
        if (b.style === "plex_glass") {
          for (let f = 0; f < 8; f++) {
            const u = (f + 0.5) / 8;
            const finZ = bz - sz * 0.42 + u * (sz * 0.84);
            const faceSign = bx < -120 ? 1 : -1;
            const fin = new THREE.BoxGeometry(1.35, h * 0.52, 0.24);
            fin.translate(bx + faceSign * (sx * 0.49), baseY + h * 0.34, finZ);
            accentGeoms[f % 4].push(fin);
          }
        }
      }
    }

    // Permanent Building Contact AO Shadow Aprons (`1` draw call)
    if (buildingAoGeoms.length > 0 && this.materials.buildingContactShadow) {
      const aoMerged = mergeCampusStaticGeometries(buildingAoGeoms);
      if (aoMerged) {
        aoMerged.computeBoundingSphere();
        const aoMesh = new THREE.Mesh(aoMerged, this.materials.buildingContactShadow);
        aoMesh.renderOrder = 1;
        aoMesh.matrixAutoUpdate = false;
        aoMesh.updateMatrix();
        this.root.add(aoMesh);
      }
    }

    // Solar EV Carport (`this.solarCarportGroup`)
    for (const [geoms, mat, cast] of [
      [solarConcreteGeoms, this.materials.concreteSidewalk || this.materials.concreteCurb, false],
      [solarSteelGeoms, this.materials.steelMullion, true],
      [solarPanelGeoms, this.materials.solarPanelBlue, true],
    ]) {
      const m = mergeCampusStaticGeometries(geoms);
      if (!m) continue;
      m.computeBoundingSphere();
      const mesh = new THREE.Mesh(m, mat);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.solarCarportGroup.add(mesh);
    }

    const addBuildingBatch = (geoms, mat) => {
      const m = mergeCampusStaticGeometries(geoms);
      if (!m) return;
      m.computeBoundingSphere();
      const mesh = new THREE.Mesh(m, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.proceduralBuildingsGroup.add(mesh);
    };

    const umbrellaMats = [
      this.materials.umbrellaRed,
      this.materials.umbrellaBlue,
      this.materials.umbrellaGreen,
      this.materials.umbrellaYellow,
    ];

    const allTimber = [];
    const allGlass = [];
    const allGlow = [];
    const allSteel = [];
    const allConc = [];
    const allAccents = [[], [], [], []];
    for (const q of quadrants) {
      allTimber.push(...q.timberGeoms);
      allGlass.push(...q.glassGeoms);
      allGlow.push(...q.glowGeoms);
      allSteel.push(...q.steelGeoms);
      allConc.push(...q.concreteGeoms);
      for (let c = 0; c < 4; c++) allAccents[c].push(...q.accentGeoms[c]);
    }

    addBuildingBatch(allTimber, this.materials.cedarTimber);
    addBuildingBatch(allGlass, this.materials.curtainGlass);
    addBuildingBatch(allGlow, this.materials.clerestoryGlow);

    const solidBldgGroup = new THREE.Group();
    const steelMerged = mergeCampusStaticGeometries(allSteel);
    if (steelMerged) {
      const m = new THREE.Mesh(steelMerged, this.materials.steelMullion);
      m.castShadow = true;
      m.receiveShadow = true;
      solidBldgGroup.add(m);
    }
    const concMerged = mergeCampusStaticGeometries(allConc);
    if (concMerged) {
      const m = new THREE.Mesh(concMerged, this.materials.graniteCurb || this.materials.concreteCurb);
      m.castShadow = false;
      m.receiveShadow = true;
      solidBldgGroup.add(m);
    }
    for (let c = 0; c < 4; c++) {
      const m = mergeCampusStaticGeometries(allAccents[c]);
      if (m) {
        const mesh = new THREE.Mesh(m, umbrellaMats[c]);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        solidBldgGroup.add(mesh);
      }
    }
    if (solidBldgGroup.children.length > 0) {
      bakeStaticGroupByMaterial(solidBldgGroup);
      solidBldgGroup.traverse((ch) => {
        if (ch.isMesh && ch.geometry) ch.geometry.computeBoundingSphere();
      });
      solidBldgGroup.matrixAutoUpdate = false;
      solidBldgGroup.updateMatrix();
      this.proceduralBuildingsGroup.add(solidBldgGroup);
    }
  }

  // ============================================================================
  // 4. ACT 0 GRADIENT CANOPY + INTERIOR FITNESS GYM + SHATTERABLE GLASS WALL
  // ============================================================================
  _buildGradientCanopyAndFitnessGym() {
    const cfg = GYM_BREAKOUT_CONFIG;
    // Scale (1.52, 1.16, 1.85) + rotateY(PI) at z = 138.23 places local zFront (+3.80)
    // at EXACT world z = 138.23 - 3.80 * 1.85 = 131.20m (`cfg.glassPlaneZ`) while enclosing `x in [-11, +11]`!
    const scaleX = 1.52;
    const scaleY = 1.16;
    const scaleZ = 1.85;
    const glassHalfW = cfg.glassPaneHalfWidthM ?? cfg.glassHalfWidthM ?? 2.4;
    const glassH = cfg.glassPaneHeightM ?? cfg.glassHeightM ?? 3.7;
    const localBayHalfW = glassHalfW / scaleX;
    const localBayH = glassH / scaleY;

    const silverDragonscaleMat =
      this.materials.canopySilverDragonscale ||
      (() => {
        const m = (this.materials.dragonscaleTile || this.materials.gradientShell).clone();
        m.name = "V5_Pavilion_SilverDragonscaleShell";
        m.color.set("#cad6dc");
        m.emissive = new THREE.Color("#38444a");
        m.emissiveIntensity = 0.16;
        m.metalness = 0.32;
        m.roughness = 0.30;
        m.envMapIntensity = 0.92;
        return m;
      })();
    this.silverDragonscaleMat = silverDragonscaleMat;

    const palePrecastConcreteMat =
      this.materials.canopyLimestonePier ||
      (() => {
        const m = (this.materials.graniteCurb || this.materials.concreteCurb).clone();
        m.name = "V5_Pavilion_PaleArchitecturalConcrete";
        m.color.set("#dbd6cc");
        m.emissive = new THREE.Color("#33312c");
        m.emissiveIntensity = 0.14;
        m.roughness = 0.66;
        m.metalness = 0.04;
        return m;
      })();

    const warmHoneySoffitMat =
      this.materials.canopyWarmHoneySoffit ||
      (() => {
        const m = (this.materials.cedarTimber || this.materials.champagneDiagridSoffit).clone();
        m.name = "V5_Pavilion_WarmTimberSoffit";
        m.color.set("#b88c5e");
        m.emissive = new THREE.Color("#3d2c1b");
        m.emissiveIntensity = 0.18;
        m.roughness = 0.54;
        return m;
      })();

    const coolCanopyGlassMat =
      this.materials.canopySkyGlass ||
      new THREE.MeshStandardMaterial({
        name: "V5_Pavilion_CanopySilverSlateGlass",
        color: "#7c99ad",
        emissive: "#2b3b47",
        emissiveIntensity: 0.22,
        metalness: 0.24,
        roughness: 0.14,
        envMapIntensity: 0.90,
      });
    const coolCanopyClerestoryMat =
      this.materials.canopyClerestoryGlow ||
      new THREE.MeshStandardMaterial({
        name: "V5_Pavilion_CanopyDaylightAtrium",
        color: "#94aec0",
        emissive: "#344652",
        emissiveIntensity: 0.24,
        metalness: 0.12,
        roughness: 0.28,
      });
    const coolCanopySteelMat =
      this.materials.canopyAnodizedAluminum ||
      new THREE.MeshStandardMaterial({
        name: "V5_Pavilion_CanopyAnodizedAluminum",
        color: "#7b8890",
        emissive: "#1f262a",
        emissiveIntensity: 0.10,
        metalness: 0.48,
        roughness: 0.32,
      });

    const canopyMats = {
      ...this.materials,
      gradientShell: silverDragonscaleMat,
      concreteCurb: palePrecastConcreteMat,
      champagneDiagridSoffit: warmHoneySoffitMat,
      curtainGlass: coolCanopyGlassMat,
      clerestoryGlow: coolCanopyClerestoryMat,
      steelMullion: coolCanopySteelMat,
    };

    const canopy = buildGradientCanopyBuilding(canopyMats, {
      openCenterBay: true,
      bayHalfWidth: localBayHalfW,
      bayHeight: localBayH,
    });

    // Fix downward-facing triangle winding on main canopy `soffitLiner` (`campus_worlds.js` cloned `shellGeom` without reversing indices)
    canopy.traverse((ch) => {
      if (ch.isMesh && ch.material === warmHoneySoffitMat && ch.geometry) {
        const sIdx = ch.geometry.getIndex()?.array;
        if (sIdx) {
          for (let k = 0; k < sIdx.length; k += 3) {
            const tmp = sIdx[k + 1];
            sIdx[k + 1] = sIdx[k + 2];
            sIdx[k + 2] = tmp;
          }
          ch.geometry.index.needsUpdate = true;
          ch.geometry.computeVertexNormals();
        }
      }
    });

    // Add Gradient Canopy's iconic forward-sweeping silver-white dragonscale scalloped front eave (`yWorld = 4.10..8.95m`,
    // arching cleanly above the `3.70m` center breakout bay) + slim flared pale limestone funnel piers!
    {
      const browSegX = 56;
      const browSegZ = 16;
      const bPos = [];
      const bUv = [];
      const bInd = [];
      const frontLipPts = [];
      const evalScallopY = (ux, vz) => {
        const scallop = 0.5 + 0.5 * Math.cos(ux * Math.PI * 2.5);
        const centerLift = Math.exp(-ux * ux * 6.0) * 0.28;
        const frontEaveY = 3.52 + scallop * 1.24 + centerLift;
        const riseZ = vz * 2.85 + Math.sin(vz * Math.PI) * 0.54;
        return frontEaveY * (1.0 - 0.16 * vz) + riseZ;
      };
      for (let iz = 0; iz <= browSegZ; iz++) {
        const vz = iz / browSegZ; // 0 = front overhanging lip (`zLocal = +6.45`), 1 = joins main dome (`zLocal = +2.55`)
        const zL = 6.45 - vz * 3.90;
        for (let ix = 0; ix <= browSegX; ix++) {
          const ux = -1.0 + (ix / browSegX) * 2.0;
          const xL = ux * 16.4;
          const yL = evalScallopY(ux, vz);
          bPos.push(xL, yL, zL);
          bUv.push((ux + 1.0) * 6.5, vz * 3.2);
          if (iz === 0) {
            frontLipPts.push(new THREE.Vector3(xL, yL - 0.04, zL));
          }
          if (iz < browSegZ && ix < browSegX) {
            const a = iz * (browSegX + 1) + ix;
            const b = a + 1;
            const c = (iz + 1) * (browSegX + 1) + ix;
            const d = c + 1;
            // `dx > 0` (`a->b`) and `dz < 0` (`a->c`) => `(b - a) x (c - a)` points strictly `+Y` (upward/outward)!
            bInd.push(a, b, c, b, d, c);
          }
        }
      }
      const browGeom = new THREE.BufferGeometry();
      browGeom.setAttribute("position", new THREE.Float32BufferAttribute(bPos, 3));
      browGeom.setAttribute("uv", new THREE.Float32BufferAttribute(bUv, 2));
      browGeom.setIndex(bInd);
      browGeom.computeVertexNormals();
      const browLipGeom = new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(frontLipPts),
        64,
        0.13,
        10,
        false
      );
      const browTop = new THREE.Mesh(
        mergeCampusStaticGeometries([browGeom, browLipGeom]),
        silverDragonscaleMat
      );
      browTop.castShadow = false;
      browTop.receiveShadow = true;
      canopy.add(browTop);

      const browUnder = browGeom.clone();
      browUnder.translate(0, -0.14, 0);
      // Reverse `+Y` indices to `-Y` downward-facing warm honey timber soffit
      const uIdx = browUnder.getIndex().array;
      for (let k = 0; k < uIdx.length; k += 3) {
        const tmp = uIdx[k + 1];
        uIdx[k + 1] = uIdx[k + 2];
        uIdx[k + 2] = tmp;
      }
      browUnder.computeVertexNormals();
      const browSoffit = new THREE.Mesh(browUnder, warmHoneySoffitMat);
      browSoffit.castShadow = false;
      canopy.add(browSoffit);

      const browPierGeoms = [];
      for (const px of [-15.74, -6.56, 6.56, 15.74]) {
        const ux = px / 16.4;
        const topH = evalScallopY(ux, 0.22) + 0.08;
        const lathePts = [
          new THREE.Vector2(0.26, 0.0),
          new THREE.Vector2(0.22, topH * 0.30),
          new THREE.Vector2(0.25, topH * 0.62),
          new THREE.Vector2(0.36, topH * 0.85),
          new THREE.Vector2(0.52, topH),
        ];
        const pCol = new THREE.LatheGeometry(lathePts, 16);
        pCol.translate(px, 0.0, 5.58);
        const pBench = new THREE.BoxGeometry(1.90, 0.44, 0.72);
        pBench.translate(px, 0.22, 5.82);
        browPierGeoms.push(pCol, pBench);
      }
      const browPiersMesh = new THREE.Mesh(mergeCampusStaticGeometries(browPierGeoms), palePrecastConcreteMat);
      browPiersMesh.castShadow = false;
      browPiersMesh.receiveShadow = true;
      canopy.add(browPiersMesh);
    }
    // Let low-angle golden sunlight stream through the 4x6 storefront mullions across the Spin Studio floor (`(0.76, 141.58)`)!
    canopy.traverse((ch) => {
      if (ch.isMesh && (ch.material === silverDragonscaleMat || ch.material === warmHoneySoffitMat)) {
        ch.castShadow = false;
      }
    });
    canopy.scale.set(scaleX, scaleY, scaleZ);
    canopy.rotation.y = Math.PI;
    canopy.position.set(cfg.canopyCenterX, 0.0, cfg.glassPlaneZ + 3.80 * scaleZ);
    bakeStaticGroupByMaterial(canopy);
    canopy.matrixAutoUpdate = false;
    canopy.updateMatrix();
    this.gradientCanopyFallback = canopy;
    this.root.add(canopy);

    // Permanent Intact Architectural Storefront Curtain-Wall Facade (`V4/V5 Seamless Dark-Bronze Muntin Grid`):
    // Uses the EXACT same `gymArchitecturalGlass` + dark anodized bronze `gymMullionMat` 6-row (`y = 0.70..3.10`) × `~1.20m`
    // muntin grid across BOTH flanking wings AND the breakable center window (`[-2.40, +2.40]`),
    // so the center window looks 100% identical to every adjacent gym window before impact!
    const gymGlassMat =
      this.materials.gymArchitecturalGlass || this.materials.breakableTemperedGlass;
    const gymMullionMat = new THREE.MeshStandardMaterial({
      name: "GymDarkAnodizedBronzeMullion",
      color: "#2b2520",
      metalness: 0.62,
      roughness: 0.36,
      envMapIntensity: 0.78,
    });

    const storefrontGroup = new THREE.Group();
    storefrontGroup.name = "Gym_Permanent_Storefront_Facade";
    const sfGlassGeoms = [];
    const sfMullionGeoms = [];
    const sfCedarGeoms = [];

    const wingInnerX = glassHalfW + 0.04; // 2.44m
    const wingOuterX = 11.02;
    const westTransitionX = -3.28; // Aligns cleanly with inner edge of Gradient Canopy concrete planter wall (`x = -3.35m`)!
    const eastWingW = wingOuterX - wingInnerX; // 8.58m (`+2.44 .. +11.02`)
    const eastWingMidX = (wingInnerX + wingOuterX) * 0.5;
    const westInnerW = Math.abs(westTransitionX) - wingInnerX; // 0.84m (`-3.28 .. -2.44` framing breakable window)
    const westInnerMidX = (-wingInnerX + westTransitionX) * 0.5;
    const westStoreCurtainW = wingOuterX - Math.abs(westTransitionX); // 7.74m (`-11.02 .. -3.28` behind pinwheels!)
    const westStoreCurtainMidX = (-wingOuterX + westTransitionX) * 0.5;
    const lowerGlassBotY = 0.10;
    const lowerGlassTopY = glassH - 0.02; // 3.68m
    const lowerGlassH = lowerGlassTopY - lowerGlassBotY;
    const lowerGlassMidY = (lowerGlassBotY + lowerGlassTopY) * 0.5;
    const transomBotY = glassH + 0.06; // 3.76m
    const transomTopY = 4.92;
    const transomGlassH = transomTopY - transomBotY;
    const transomGlassMidY = (transomBotY + transomTopY) * 0.5;
    const muntinRowYs = [0.70, 1.30, 1.90, 2.50, 3.10];

    // 1A. East Wing (`+2.44 .. +11.02`) + Narrow West Jamb Bay (`-3.28 .. -2.44`): 6-row Spin Studio muntin grid
    sfGlassGeoms.push(
      new THREE.BoxGeometry(eastWingW, lowerGlassH, 0.036).translate(
        eastWingMidX,
        lowerGlassMidY,
        cfg.glassPlaneZ
      ),
      new THREE.BoxGeometry(westInnerW, lowerGlassH, 0.036).translate(
        westInnerMidX,
        lowerGlassMidY,
        cfg.glassPlaneZ
      )
    );
    sfMullionGeoms.push(
      new THREE.BoxGeometry(eastWingW + 0.12, 0.09, 0.16).translate(eastWingMidX, 0.045, cfg.glassPlaneZ),
      new THREE.BoxGeometry(westInnerW + 0.08, 0.09, 0.16).translate(westInnerMidX, 0.045, cfg.glassPlaneZ)
    );
    for (const my of muntinRowYs) {
      sfMullionGeoms.push(
        new THREE.BoxGeometry(eastWingW, 0.052, 0.11).translate(eastWingMidX, my, cfg.glassPlaneZ),
        new THREE.BoxGeometry(westInnerW, 0.052, 0.11).translate(westInnerMidX, my, cfg.glassPlaneZ)
      );
    }
    for (const side of [-1, 1]) {
      // Primary structural portal jamb posts at `x = ±2.445m` framing the breakable center window
      sfMullionGeoms.push(
        new THREE.BoxGeometry(0.105, 4.94, 0.18).translate(
          side * (glassHalfW + 0.045),
          2.47,
          cfg.glassPlaneZ
        )
      );
    }
    for (let m = 1; m <= 6; m++) {
      const mx = wingInnerX + (eastWingW * m) / 7;
      sfMullionGeoms.push(
        new THREE.BoxGeometry(0.062, 4.86, 0.125).translate(mx, 2.47, cfg.glassPlaneZ)
      );
    }
    // East outer corner return jamb pilaster (`x = +10.98`, clear on `2000` vestibule side; ZERO post behind Pinwheel #2 at `-10.56`!)
    sfMullionGeoms.push(
      new THREE.BoxGeometry(0.28, 4.98, 0.72).translate(10.98, 2.49, cfg.glassPlaneZ - 0.10),
      new THREE.BoxGeometry(0.09, 4.94, 0.22).translate(westTransitionX, 2.47, cfg.glassPlaneZ)
    );
    sfCedarGeoms.push(
      new THREE.BoxGeometry(0.46, 4.78, 0.56).translate(10.64, 2.39, cfg.glassPlaneZ + 0.10)
    );

    // 1B. West `Google Store` Curtain-Wall Continuation (`x in [-11.08, -3.28]` behind Pinwheels #1 & #2):
    //     Matches `Visitor_Experience_CurtainWall_And_Wings_V6` (`y = 2.45m` single transom, `1.83m` vertical mullions,
    //     and exterior-only `FrontSide` cool Low-E upper transom + dark retail lower glazing with ZERO warm gym frost!)
    sfMullionGeoms.push(
      new THREE.BoxGeometry(westStoreCurtainW + 0.12, 0.11, 0.22).translate(
        westStoreCurtainMidX - 0.03,
        0.055,
        cfg.glassPlaneZ - 0.02
      ),
      new THREE.BoxGeometry(westStoreCurtainW + 0.12, 0.11, 0.22).translate(
        westStoreCurtainMidX - 0.03,
        2.45,
        cfg.glassPlaneZ - 0.02
      )
    );
    for (const wxm of [-5.11, -6.94, -8.77, -10.60]) {
      sfMullionGeoms.push(
        new THREE.BoxGeometry(0.088, 4.90, 0.21).translate(wxm, 2.48, cfg.glassPlaneZ - 0.02)
      );
    }

    // Upper clerestory glass transom across Spin Studio portal (`x in [-3.28, +11.02], y in [3.76, 4.92]`)
    const studioTransomW = wingOuterX - westTransitionX;
    const studioTransomMidX = (wingOuterX + westTransitionX) * 0.5;
    sfGlassGeoms.push(
      new THREE.BoxGeometry(studioTransomW, transomGlassH, 0.036).translate(
        studioTransomMidX,
        transomGlassMidY,
        cfg.glassPlaneZ
      )
    );
    // Matching upper transom vertical muntins at `x = -1.20, 0.00, +1.20` directly above center bay mullions!
    for (const tx of [-1.20, 0.0, 1.20]) {
      sfMullionGeoms.push(
        new THREE.BoxGeometry(0.062, transomGlassH, 0.125).translate(
          tx,
          transomGlassMidY,
          cfg.glassPlaneZ
        )
      );
    }
    // Structural horizontal transom beam (`x in [-3.28, +11.02]`, `y = 3.725m`) + full-width header cap (`y = 4.94m`)
    sfMullionGeoms.push(
      new THREE.BoxGeometry(studioTransomW + 0.16, 0.105, 0.19).translate(
        studioTransomMidX,
        glassH + 0.025,
        cfg.glassPlaneZ
      ),
      new THREE.BoxGeometry(wingOuterX * 2.0 + 0.28, 0.14, 0.62).translate(
        0.0,
        4.94,
        cfg.glassPlaneZ - 0.12
      )
    );
    // Warm cedar interior soffit closure (`x in [-3.20, +10.80]`)
    sfCedarGeoms.push(
      new THREE.BoxGeometry(14.0, 0.28, 0.54).translate(
        3.80,
        4.70,
        cfg.glassPlaneZ + 0.18
      )
    );

    // Exterior-only (`FrontSide` facing `-Z`) two-band `Google Store` Low-E glazing behind `[-11.08, -3.28]`
    // (100% invisible from inside the Spin Studio via backface culling + `castShadow = false`!)
    const westUpperTransomGeom = new THREE.PlaneGeometry(westStoreCurtainW + 0.10, 2.49);
    westUpperTransomGeom.rotateY(Math.PI);
    westUpperTransomGeom.translate(westStoreCurtainMidX - 0.03, 3.695, cfg.glassPlaneZ + 0.01);
    const westUpperTransomMat = new THREE.MeshStandardMaterial({
      name: "Visitor_GoogleStore_UpperGlazing_V7",
      color: "#4a7597",
      roughness: 0.14,
      metalness: 0.20,
      envMap: this.dayEnvMap || null,
      envMapIntensity: 0.78,
      side: THREE.FrontSide,
    });
    westUpperTransomMat.userData.v7SkipWorldCohesion = true;
    const westUpperTransomMesh = new THREE.Mesh(westUpperTransomGeom, westUpperTransomMat);
    westUpperTransomMesh.castShadow = false;
    westUpperTransomMesh.receiveShadow = false;
    storefrontGroup.add(westUpperTransomMesh);

    const westLowerRetailGeom = new THREE.PlaneGeometry(westStoreCurtainW + 0.10, 2.38);
    westLowerRetailGeom.rotateY(Math.PI);
    westLowerRetailGeom.translate(westStoreCurtainMidX - 0.03, 1.26, cfg.glassPlaneZ + 0.01);
    const westCurtainSpandrelMat = new THREE.MeshStandardMaterial({
      name: "Visitor_GoogleStore_CurtainSpandrel_V7",
      color: "#182633",
      roughness: 0.16,
      metalness: 0.26,
      envMap: this.dayEnvMap || null,
      envMapIntensity: 0.74,
      side: THREE.FrontSide,
    });
    westCurtainSpandrelMat.userData.v7SkipWorldCohesion = true;
    const westCurtainSpandrelMesh = new THREE.Mesh(westLowerRetailGeom, westCurtainSpandrelMat);
    westCurtainSpandrelMesh.castShadow = false;
    westCurtainSpandrelMesh.receiveShadow = false;
    storefrontGroup.add(westCurtainSpandrelMesh);

    const sfGlassMesh = new THREE.Mesh(
      mergeCampusStaticGeometries(sfGlassGeoms),
      gymGlassMat
    );
    const sfMullionMesh = new THREE.Mesh(
      mergeCampusStaticGeometries(sfMullionGeoms),
      gymMullionMat
    );
    sfMullionMesh.castShadow = true;
    sfMullionMesh.receiveShadow = true;
    const sfCedarMesh = new THREE.Mesh(
      mergeCampusStaticGeometries(sfCedarGeoms),
      this.materials.warmWood
    );
    sfCedarMesh.receiveShadow = true;

    storefrontGroup.add(sfGlassMesh, sfMullionMesh, sfCedarMesh);
    storefrontGroup.matrixAutoUpdate = false;
    storefrontGroup.updateMatrix();
    this.gymStorefrontFacadeGroup = storefrontGroup;
    this.root.add(storefrontGroup);

    // Separate Breakable Center Window (`x in [-2.40, +2.40], y in [0.10, 3.68], z = 131.20`):
    // Built with the EXACT SAME `gymGlassMat` + `gymBronzeMullion` 4-column × 6-row muntin grid
    // + flush breakaway bronze sill (`y = 0.045m`), ZERO colored safety dots!
    const glassGroup = new THREE.Group();
    const paneGeom = new THREE.BoxGeometry(glassHalfW * 2.0 - 0.02, lowerGlassH, 0.036);
    paneGeom.translate(0.0, lowerGlassMidY, cfg.glassPlaneZ);
    const paneMesh = new THREE.Mesh(paneGeom, gymGlassMat);
    glassGroup.add(paneMesh);

    const centerMullionGeoms = [
      // Flush breakaway dark-bronze bottom sill continuing the left/right sill line seamlessly
      new THREE.BoxGeometry(glassHalfW * 2.0, 0.09, 0.16).translate(0.0, 0.045, cfg.glassPlaneZ),
    ];
    for (const my of muntinRowYs) {
      centerMullionGeoms.push(
        new THREE.BoxGeometry(glassHalfW * 2.0 - 0.01, 0.052, 0.11).translate(
          0.0,
          my,
          cfg.glassPlaneZ
        )
      );
    }
    for (const vx of [-1.20, 0.0, 1.20]) {
      centerMullionGeoms.push(
        new THREE.BoxGeometry(0.062, lowerGlassH + 0.04, 0.125).translate(
          vx,
          lowerGlassMidY,
          cfg.glassPlaneZ
        )
      );
    }
    const centerMullionMesh = new THREE.Mesh(
      mergeCampusStaticGeometries(centerMullionGeoms),
      gymMullionMat
    );
    centerMullionMesh.castShadow = true;
    centerMullionMesh.receiveShadow = true;
    glassGroup.add(centerMullionMesh);
    glassGroup.matrixAutoUpdate = false;
    glassGroup.updateMatrix();
    this.intactGymGlassMesh = glassGroup;
    this.root.add(glassGroup);

    // Helper: Thin (`0.005m`), sharp angular faceted refractive tempered-glass shard plate
    const buildThinIrregularGlassPlateGeom = (w = 0.092, h = 0.068, thick = 0.005, triMode = false) => {
      const shape = new THREE.Shape();
      if (triMode) {
        shape.moveTo(-w * 0.52, -h * 0.34);
        shape.lineTo(w * 0.54, -h * 0.16);
        shape.lineTo(w * 0.08, h * 0.52);
        shape.lineTo(-w * 0.24, h * 0.18);
      } else {
        shape.moveTo(-w * 0.50, -h * 0.32);
        shape.lineTo(w * 0.38, -h * 0.46);
        shape.lineTo(w * 0.52, h * 0.12);
        shape.lineTo(w * 0.04, h * 0.50);
        shape.lineTo(-w * 0.38, h * 0.22);
      }
      shape.closePath();
      const g = new THREE.ExtrudeGeometry(shape, {
        depth: thick,
        bevelEnabled: true,
        bevelThickness: 0.0020,
        bevelSize: 0.0026,
        bevelSegments: 1,
      });
      g.translate(0.0, 0.0, -thick * 0.5);
      g.computeVertexNormals();
      return g;
    };

    // High-glint pale-cyan architectural tempered-glass shard material (crystal translucent faces + bright Fresnel bevel glints!)
    const refractiveShardMat = new THREE.MeshPhysicalMaterial({
      name: "V7_Refractive_Tempered_Glass_Shard",
      color: "#dcf5ff",
      emissive: "#b8efff",
      emissiveIntensity: 0.12,
      roughness: 0.032,
      metalness: 0.08,
      ior: 1.52,
      reflectivity: 1.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.028,
      envMapIntensity: 1.65,
      transparent: true,
      opacity: 0.52,
      side: THREE.DoubleSide,
    });
    refractiveShardMat.userData.isRefractiveGlassV7 = true;
    refractiveShardMat.userData.v7SkipWorldCohesion = true;
    if (typeof MaterialsMod.applyTemperedGlassShardGlintShader === "function") {
      MaterialsMod.applyTemperedGlassShardGlintShader(refractiveShardMat);
    }
    this.refractiveShardMat = refractiveShardMat;

    // Jagged Perimeter Safety-Glass Teeth + Outward-Bent Dark-Bronze Muntin Stubs anchored on smashed bay (`z = 131.20m`)!
    this.jaggedGlassFrameGroup = new THREE.Group();
    const jagGeoms = [];
    const snappedMullionGeoms = [];
    const jagPlate = buildThinIrregularGlassPlateGeom(0.115, 0.096, 0.006, false);
    const jagSpike = buildThinIrregularGlassPlateGeom(0.135, 0.082, 0.006, true);
    for (let i = 0; i < 18; i++) {
      const jx = -2.24 + (i / 17) * 4.48;
      const g = (i % 2 === 0 ? jagPlate : jagSpike).clone();
      g.scale(0.84 + (i % 3) * 0.26, 0.80 + ((i + 1) % 3) * 0.30, 1.0);
      g.rotateZ(0.35 + i * 0.52);
      g.rotateX(-0.18 - (i % 3) * 0.09);
      g.translate(jx, glassH - 0.06, cfg.glassPlaneZ - 0.02);
      jagGeoms.push(g);

      // Bottom sill jagged tempered-glass teeth
      const gBot = jagSpike.clone();
      gBot.scale(0.76 + (i % 3) * 0.22, 0.72 + ((i + 2) % 3) * 0.24, 1.0);
      gBot.rotateZ(-0.42 + i * 0.47);
      gBot.rotateX(-0.22 - (i % 2) * 0.10);
      gBot.translate(jx, 0.16 + (i % 2) * 0.03, cfg.glassPlaneZ - 0.02);
      jagGeoms.push(gBot);
    }
    for (const side of [-1, 1]) {
      for (let k = 0; k < 12; k++) {
        const jy = 0.22 + (k / 11) * 3.28;
        const g = (k % 2 === 0 ? jagSpike : jagPlate).clone();
        g.scale(0.84 + (k % 2) * 0.32, 0.85 + ((k + 1) % 3) * 0.24, 1.0);
        g.rotateZ(side * 0.65 + k * 0.48);
        g.rotateY(side * -0.26);
        g.translate(side * (glassHalfW - 0.05), jy, cfg.glassPlaneZ - 0.02);
        jagGeoms.push(g);
      }
      // Bent/twisted horizontal bronze muntin stubs blown outward (`-Z`) from left/right jamb posts
      for (let rIdx = 0; rIdx < muntinRowYs.length; rIdx++) {
        const stubLen = 0.22 + (rIdx % 2) * 0.09;
        const stub = new THREE.BoxGeometry(stubLen, 0.048, 0.095);
        stub.rotateZ(side * (0.14 + (rIdx % 3) * 0.08));
        stub.rotateY(side * -0.38);
        stub.translate(
          side * (glassHalfW - stubLen * 0.42),
          muntinRowYs[rIdx] - 0.02,
          cfg.glassPlaneZ - 0.07
        );
        snappedMullionGeoms.push(stub);
      }
    }
    // Outward-bent upper vertical bronze muntin stubs hanging down from the `y = 3.68m` transom beam
    for (const [vIdx, vx] of [[-1, -1.20], [0, 0.0], [1, 1.20]]) {
      const stubH = 0.26 + Math.abs(vIdx) * 0.08;
      const vStub = new THREE.BoxGeometry(0.056, stubH, 0.105);
      vStub.rotateX(-0.42 - Math.abs(vIdx) * 0.08);
      vStub.rotateZ(vIdx * 0.11);
      vStub.translate(vx, lowerGlassTopY - stubH * 0.42, cfg.glassPlaneZ - 0.08);
      snappedMullionGeoms.push(vStub);
    }

    const jagMesh = new THREE.Mesh(
      mergeCampusStaticGeometries(jagGeoms),
      refractiveShardMat
    );
    const snappedStubMesh = new THREE.Mesh(
      mergeCampusStaticGeometries(snappedMullionGeoms),
      gymMullionMat
    );
    snappedStubMesh.castShadow = true;
    this.jaggedGlassFrameGroup.add(jagMesh, snappedStubMesh);
    this.jaggedGlassFrameGroup.visible = false;
    this.root.add(this.jaggedGlassFrameGroup);

    // 64 Thin Angular Refractive Tempered-Glass Primary Shards (`InstancedMesh`)
    const glassShardCount = 64;
    const shardGeom = buildThinIrregularGlassPlateGeom(0.088, 0.064, 0.005, false);
    this.glassShardInstanced = new THREE.InstancedMesh(
      shardGeom,
      refractiveShardMat,
      glassShardCount
    );
    this.glassShardInstanced.frustumCulled = false;
    this.glassShardInstanced.visible = false;
    this.root.add(this.glassShardInstanced);

    const shardRng = createMulberry32(0x91a55b42);
    for (let i = 0; i < glassShardCount; i++) {
      const col = i % 8;
      const row = Math.floor(i / 8);
      const x0 = -2.18 + (col + 0.5) * (4.36 / 8) + (shardRng() - 0.5) * 0.22;
      const y0 = 0.24 + (row + 0.5) * (3.28 / 8) + (shardRng() - 0.5) * 0.20;
      const sideSign = x0 >= 0 ? 1 : -1;
      const lensClearVx = Math.abs(x0) < 0.58 ? sideSign * 1.45 : 0.0;
      this.glassShardSpecs.push({
        x0,
        y0,
        z0: cfg.glassPlaneZ,
        vx: x0 * 1.72 + lensClearVx + (shardRng() - 0.5) * 2.4,
        vy: 1.35 + shardRng() * 3.6,
        vz: -(7.8 + shardRng() * 8.8),
        rx0: shardRng() * Math.PI * 2,
        ry0: shardRng() * Math.PI * 2,
        rz0: shardRng() * Math.PI * 2,
        wx: (shardRng() - 0.5) * 22.0,
        wy: (shardRng() - 0.5) * 22.0,
        wz: (shardRng() - 0.5) * 22.0,
        restTiltX: 0.08 + shardRng() * 0.16,
        restTiltZ: (shardRng() - 0.5) * 0.24,
        scale: 0.48 + shardRng() * 0.68,
      });
    }

    // 32 Razor-Sharp Angular Tempered-Glass Secondary Shards (`this.mullionShardInstanced` — ZERO black logs in crosswalk!)
    const mullionFragCount = 32;
    const mullionFragGeom = buildThinIrregularGlassPlateGeom(0.112, 0.056, 0.005, true);
    this.mullionShardInstanced = new THREE.InstancedMesh(
      mullionFragGeom,
      refractiveShardMat,
      mullionFragCount
    );
    this.mullionShardInstanced.frustumCulled = false;
    this.mullionShardInstanced.visible = false;
    this.root.add(this.mullionShardInstanced);

    for (let m = 0; m < mullionFragCount; m++) {
      const mx0 = -2.05 + ((m % 8) + 0.5) * (4.10 / 8) + (shardRng() - 0.5) * 0.18;
      const my0 = 0.36 + Math.floor(m / 8) * 0.86 + (shardRng() - 0.5) * 0.18;
      const sideSign = mx0 >= 0 ? 1 : -1;
      const clearVx = Math.abs(mx0) < 0.48 ? sideSign * 1.55 : mx0 * 1.32;
      this.mullionShardSpecs.push({
        x0: mx0,
        y0: my0,
        z0: cfg.glassPlaneZ - 0.03,
        vx: clearVx + (shardRng() - 0.5) * 1.9,
        vy: 1.15 + shardRng() * 3.1,
        vz: -(6.8 + shardRng() * 7.4),
        rx0: shardRng() * Math.PI * 2,
        ry0: shardRng() * Math.PI * 2,
        rz0: shardRng() * Math.PI * 2,
        wx: (shardRng() - 0.5) * 18.5,
        wy: (shardRng() - 0.5) * 16.5,
        wz: (shardRng() - 0.5) * 19.5,
        restTiltX: -0.10 - shardRng() * 0.18,
        restTiltZ: (shardRng() - 0.5) * 0.26,
        scale: 0.52 + shardRng() * 0.64,
      });
    }

    // Interior Ground-Floor Luxury Google Spin & Performance Studio (`x in [-10.45, +10.45], y in [0, 4.60], z in [131.25, 148.6]`):
    // Warm honey-maple hardwood studio border + speckled EPDM athletic rubber workout zone + acoustic wood-slat walls!
    const gymGroup = new THREE.Group();
    const gymHardwoodBorder = new THREE.Mesh(
      new THREE.PlaneGeometry(20.9, 17.4),
      this.materials.gymMapleHardwood || this.materials.warmWood
    );
    gymHardwoodBorder.rotation.x = -Math.PI * 0.5;
    gymHardwoodBorder.position.set(0.0, 0.004, 140.0);
    gymHardwoodBorder.receiveShadow = true;
    gymGroup.add(gymHardwoodBorder);

    const gymFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(15.7, 15.2),
      this.materials.gymRubberFloor
    );
    gymFloor.rotation.x = -Math.PI * 0.5;
    gymFloor.position.set(0.0, 0.007, 139.8);
    gymFloor.receiveShadow = true;
    gymGroup.add(gymFloor);

    // Crisp white sprint-lane lines + brushed-brass studio zone inlay guiding the eye straight through the center window!
    const laneGeoms = [];
    for (const lx of [-1.22, 1.22]) {
      const line = new THREE.PlaneGeometry(0.075, 11.8);
      line.rotateX(-Math.PI * 0.5);
      line.translate(lx, 0.009, 137.8);
      laneGeoms.push(line);
    }
    const studioFloorMarkingsMesh = new THREE.Mesh(
      mergeCampusStaticGeometries(laneGeoms),
      this.materials.roadStripeWhite
    );
    gymGroup.add(studioFloorMarkingsMesh);

    // Enclosed Warm Western Red Cedar Acoustic Wood-Slat Rear & Side Walls + Dark Charcoal Felt Backing + Clerestories!
    const gymFeltBackingGeoms = [
      new THREE.BoxGeometry(21.0, 4.55, 0.24).translate(0.0, 2.28, 148.62),
      new THREE.BoxGeometry(0.18, 3.52, 17.3).translate(-10.45, 1.76, 140.0),
      new THREE.BoxGeometry(0.18, 3.52, 17.3).translate(10.45, 1.76, 140.0),
    ];
    const gymCeilingMesh = new THREE.Mesh(
      new THREE.BoxGeometry(21.1, 0.24, 17.4).translate(0.0, 4.56, 140.0),
      this.materials.cedarTimber
    );
    gymCeilingMesh.castShadow = false;
    gymCeilingMesh.receiveShadow = true;
    gymGroup.add(gymCeilingMesh);

    const gymCedarGeoms = [];
    // Architectural vertical cedar acoustic slats along the rear studio wall (`z = 148.45`)
    for (let sx = -10.0; sx <= 10.01; sx += 0.34) {
      gymCedarGeoms.push(
        new THREE.BoxGeometry(0.14, 4.36, 0.08).translate(sx, 2.22, 148.46)
      );
    }
    // Dark smoked architectural studio mirror wall band (`x in [-8.4, +8.4], y in [0.85, 2.80], z = 148.39`)
    const studioMirrorMat = new THREE.MeshStandardMaterial({
      name: "GymStudioSmokedMirrorMat",
      color: "#20262e",
      metalness: 0.86,
      roughness: 0.06,
      envMapIntensity: 0.92,
      transparent: false,
    });
    const studioMirrorMesh = new THREE.Mesh(
      new THREE.BoxGeometry(16.8, 1.95, 0.03),
      studioMirrorMat
    );
    studioMirrorMesh.name = "GymStudioMirrorBand";
    studioMirrorMesh.position.set(0.0, 1.82, 148.39);
    gymGroup.add(studioMirrorMesh);

    const gymGlassGeoms = [];
    const gymGlowGeoms = [];
    const gymBronzeSideMullions = [
      new THREE.BoxGeometry(16.86, 0.055, 0.055).translate(0.0, 0.845, 148.385),
      new THREE.BoxGeometry(16.86, 0.055, 0.055).translate(0.0, 2.795, 148.385),
    ];

    for (const sideX of [-10.36, 10.36]) {
      const inwardSign = sideX < 0 ? 1 : -1;
      // Vertical Western Red Cedar acoustic slats lining West & East Spin Studio walls (`y = 0..3.52m`) + upper clerestory glazing
      for (let sz = 131.8; sz <= 148.1; sz += 0.34) {
        gymCedarGeoms.push(
          new THREE.BoxGeometry(0.08, 3.48, 0.14).translate(sideX + inwardSign * 0.04, 1.74, sz)
        );
      }
      gymBronzeSideMullions.push(
        new THREE.BoxGeometry(0.14, 0.065, 17.2).translate(sideX, 3.52, 140.0)
      );
      gymGlassGeoms.push(new THREE.BoxGeometry(0.05, 0.92, 17.2).translate(sideX, 4.00, 140.0));
      for (let mz = 132.4; mz <= 147.6; mz += 1.90) {
        gymBronzeSideMullions.push(
          new THREE.BoxGeometry(0.14, 0.98, 0.08).translate(sideX, 4.00, mz)
        );
      }
    }
    // 5 Recessed Warm Linear Architectural LED Studio Ceiling Bars + Perimeter Cove Glow
    for (const barX of [-6.4, -3.2, 0.0, 3.2, 6.4]) {
      gymGlowGeoms.push(new THREE.BoxGeometry(0.28, 0.07, 14.4).translate(barX, 4.42, 139.8));
    }
    gymGlowGeoms.push(new THREE.BoxGeometry(17.2, 0.06, 0.10).translate(0.0, 2.84, 148.38));

    // Stationary `Gym_Trainer_Stand` Holder right under Pelican's rear axle `(0, 0, 140.2 + 0.5425)`!
    this.trainerGroup = new THREE.Group();
    this.trainerGroup.name = "Gym_Trainer_Rear_Stand_Holder";
    this.trainerGroup.position.set(cfg.trainerX, 0.0, cfg.trainerZ + 0.5425);
    this.trainerGroup.userData.skipGroundingAudit = true;

    this.trainerFallbackGroup = new THREE.Group();
    const fbBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.04, 0.16),
      this.materials.umbrellaRed
    );
    fbBar.position.set(0.0, 0.02, 0.28);
    this.trainerFallbackGroup.add(fbBar);
    this.trainerGroup.add(this.trainerFallbackGroup);
    gymGroup.add(this.trainerGroup);

    // Companion Molded Front-Wheel Riser Block (`Trainer_Front_Riser_Block_V8`) at `(0, 0, 140.2 - 0.5425)`!
    this.trainerFrontRiserGroup = new THREE.Group();
    this.trainerFrontRiserGroup.name = "Gym_Trainer_Front_Riser_Holder_V8";
    this.trainerFrontRiserGroup.position.set(cfg.trainerX, 0.0, cfg.trainerZ - 0.5425);
    this.trainerFrontRiserGroup.userData.skipGroundingAudit = true;

    this.trainerFrontRiserFallbackGroup = new THREE.Group();
    this.trainerFrontRiserFallbackGroup.name = "Trainer_Front_Riser_Procedural_Fallback_V8";
    {
      const riserRubberMat = new THREE.MeshStandardMaterial({
        name: "TrainerFrontRiserElastomerV8",
        color: "#22262c",
        roughness: 0.78,
        metalness: 0.08,
        envMapIntensity: 0.42,
      });
      const rGeoms = [
        new THREE.BoxGeometry(0.212, 0.052, 0.292).translate(0.0, 0.026, 0.0),
        new THREE.BoxGeometry(0.048, 0.094, 0.272).translate(-0.080, 0.047, 0.0),
        new THREE.BoxGeometry(0.048, 0.094, 0.272).translate(0.080, 0.047, 0.0),
      ];
      const riserMesh = new THREE.Mesh(mergeCampusStaticGeometries(rGeoms), riserRubberMat);
      riserMesh.castShadow = true;
      riserMesh.receiveShadow = true;
      this.trainerFrontRiserFallbackGroup.add(riserMesh);
    }
    this.trainerFrontRiserGroup.add(this.trainerFrontRiserFallbackGroup);
    gymGroup.add(this.trainerFrontRiserGroup);

    // Matte Charcoal Vulcanized Rubber Studio Trainer Mat permanently grounded under `(0, 140.25)` (`receiveShadow: true`!)
    const gymCharcoalMatRubber = new THREE.MeshStandardMaterial({
      name: "GymCharcoalTrainerMatRubber",
      color: "#1d2024",
      roughness: 0.90,
      metalness: 0.04,
      envMapIntensity: 0.35,
    });
    const gColorMats = [
      this.materials.gbikeForkBlue,
      this.materials.gbikeFrameRed,
      this.materials.gbikeYellow,
      this.materials.gbikeGreen,
    ];
    const heroMatGrp = new THREE.Group();
    heroMatGrp.position.set(0.0, 0.0, 140.25);
    const heroSlab = new THREE.Mesh(
      new THREE.BoxGeometry(0.96, 0.010, 2.12),
      gymCharcoalMatRubber
    );
    heroSlab.position.y = 0.005;
    heroSlab.receiveShadow = true;
    heroMatGrp.add(heroSlab);
    const segW = (0.96 - 0.08) / 4;
    for (let c = 0; c < 4; c++) {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(segW - 0.012, 0.012, 0.024),
        gColorMats[c]
      );
      bar.position.set(-0.48 + 0.04 + segW * (c + 0.5), 0.0065, -1.03);
      bar.receiveShadow = true;
      heroMatGrp.add(bar);
    }
    bakeStaticGroupByMaterial(heroMatGrp);
    gymGroup.add(heroMatGrp);

    // Procedural fallback gym equipment (`this.gymProceduralEquipmentGroup` — hidden once `gym_interior_v5.glb` attaches!)
    const gymSolidDecor = new THREE.Group();
    const addBeveledMat = (mx, mz, w, len, yaw = 0.0, accentMat = null) => {
      const matGrp = new THREE.Group();
      matGrp.position.set(mx, 0.0, mz);
      matGrp.rotation.y = yaw;
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.010, len),
        gymCharcoalMatRubber
      );
      slab.position.y = 0.005;
      slab.receiveShadow = true;
      matGrp.add(slab);
      for (const ez of [-len * 0.5, len * 0.5]) {
        const cap = new THREE.Mesh(
          new THREE.CylinderGeometry(0.006, 0.006, w, 10).rotateZ(Math.PI * 0.5),
          accentMat || this.materials.gbikeTireRubber
        );
        cap.position.set(0.0, 0.006, ez);
        matGrp.add(cap);
      }
      gymSolidDecor.add(matGrp);
    };

    const spinSpecs = [
      { x: -3.25, z: 141.4, yaw: 0.16, accent: this.materials.gbikeForkBlue },
      { x: -5.45, z: 142.8, yaw: 0.12, accent: this.materials.gbikeGreen },
      { x: 3.25, z: 141.4, yaw: -0.16, accent: this.materials.gbikeFrameRed },
      { x: 5.45, z: 142.8, yaw: -0.12, accent: this.materials.gbikeYellow },
    ];
    for (const sp of spinSpecs) {
      addBeveledMat(sp.x, sp.z, 0.78, 1.48, sp.yaw, sp.accent);
    }

    this.gymSpareTrainerAnchor = new THREE.Group();
    this.gymSpareTrainerAnchor.position.set(-1.42, 0.372, 144.8);
    this.gymSpareTrainerAnchor.rotation.y = 0.42;
    gymSolidDecor.add(this.gymSpareTrainerAnchor);
    bakeStaticGroupByMaterial(gymSolidDecor);
    this.gymProceduralEquipmentGroup = gymSolidDecor;

    gymGroup.add(
      gymSolidDecor,
      new THREE.Mesh(mergeCampusStaticGeometries(gymFeltBackingGeoms), this.materials.gbikeTireRubber),
      new THREE.Mesh(mergeCampusStaticGeometries(gymCedarGeoms), this.materials.cedarTimber),
      new THREE.Mesh(mergeCampusStaticGeometries(gymBronzeSideMullions), gymMullionMat),
      new THREE.Mesh(mergeCampusStaticGeometries(gymGlassGeoms), gymGlassMat),
      new THREE.Mesh(mergeCampusStaticGeometries(gymGlowGeoms), this.materials.clerestoryGlow)
    );

    // Dual Warm Studio Pendant & Rim Key Lights (parented to `this.root` so toggling
    // `gymInteriorGroup.visible` never triggers mid-video WebGL shader recompiles; active on both GPU and 4K SwiftShader!).
    {
      const gymKeyLight = new THREE.PointLight("#fff2d6", 2.45, 24.0, 1.35);
      gymKeyLight.position.set(0.8, 3.95, 140.8);
      const gymFrontBounce = new THREE.PointLight("#ffe5be", 1.75, 18.0, 1.45);
      gymFrontBounce.position.set(-1.2, 3.25, 134.8);
      this.gymKeyLight = gymKeyLight;
      this.gymFrontBounce = gymFrontBounce;
      this.root.add(gymKeyLight, gymFrontBounce);
    }

    // Diegetic Wall LED Cluster Display (`(-3.35, 2.38, 147.9)`, visible in Beat 2 whip-tilt reveal!)
    this._buildGymLedBoard(gymGroup);

    // Subtle Golden Chalk-Dust Motes (`0.0 - 7.8s`) drifting lazily through the Spin Studio morning sunbeam shaft over `"59 / AA"`!
    {
      const chalkCount = 72;
      const moteTex = createSubPixelRadialMoteTexture(64, 4.35);
      const moteGeom = new THREE.PlaneGeometry(0.018, 0.018);
      const moteMat = new THREE.MeshBasicMaterial({
        name: "SpinStudio_Sunbeam_Chalk_Motes_Mat",
        map: moteTex,
        color: "#ffefd0",
        transparent: true,
        opacity: 0.30,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      });
      const chalkInst = new THREE.InstancedMesh(moteGeom, moteMat, chalkCount);
      chalkInst.name = "SpinStudio_Sunbeam_Dust_Motes";
      chalkInst.userData.skipGroundingAudit = true;
      chalkInst.frustumCulled = false;
      chalkInst.castShadow = false;
      chalkInst.receiveShadow = false;

      const cRng = createMulberry32(0x59aa0071);
      this.spinStudioChalkMoteSeeds = [];
      for (let i = 0; i < chalkCount; i++) {
        // Concentrate 55% of motes directly inside the morning sunbeam shaft over `"59 / AA"` `(0.76, 0.14..1.85, 141.58)`
        const inDumbbellBeam = i < 40;
        const bx = inDumbbellBeam
          ? 0.76 + (cRng() - 0.5) * 1.45
          : (cRng() - 0.5) * 4.4;
        const by = inDumbbellBeam
          ? 0.14 + cRng() * 1.68
          : 0.28 + cRng() * 2.45;
        const bz = inDumbbellBeam
          ? 141.58 + (cRng() - 0.5) * 1.65
          : 133.2 + cRng() * 9.4;
        this.spinStudioChalkMoteSeeds.push({
          bx,
          by,
          bz,
          phase: cRng() * Math.PI * 2,
          freq: 0.42 + cRng() * 0.55,
          ampX: 0.035 + cRng() * 0.055,
          ampY: 0.025 + cRng() * 0.045,
          ampZ: 0.035 + cRng() * 0.055,
          scale: 0.62 + cRng() * 0.86,
        });
        _pos.set(bx, by, bz);
        _quat.identity();
        _scale.setScalar(1.0);
        _mat4.compose(_pos, _quat, _scale);
        chalkInst.setMatrixAt(i, _mat4);
      }
      chalkInst.instanceMatrix.needsUpdate = true;
      this.spinStudioChalkMotesInstanced = chalkInst;
      gymGroup.add(chalkInst);
    }

    this.gymInteriorGroup = gymGroup;
    this.root.add(gymGroup);
  }

  _buildGymLedBoard(parentGroup) {
    let tex = null;
    if (typeof document !== "undefined") {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 256;
      this.gymLedCanvas = canvas;
      this.gymLedCtx = canvas.getContext("2d");
      tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
    } else {
      this.gymLedCanvas = null;
      this.gymLedCtx = null;
      tex = new THREE.DataTexture(new Uint8Array(4 * 4 * 4).fill(24), 4, 4, THREE.RGBAFormat);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
    }
    this.gymLedTexture = tex;

    const screenMat = new THREE.MeshBasicMaterial({ map: tex });

    // 1. South Rear Wall Cluster Board (`z = 147.85`)
    const boardHolder = new THREE.Group();
    boardHolder.name = "SpinStudio_South_LED_Clock";
    boardHolder.position.set(-3.15, 2.46, 147.85);
    boardHolder.rotation.y = Math.PI - 0.14;

    const bezel = new THREE.Mesh(
      new THREE.BoxGeometry(2.72, 1.42, 0.10),
      this.materials.gbikeTireRubber
    );
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.56, 1.26), screenMat);
    screen.position.z = 0.056;

    const strutGeoms = [
      new THREE.CylinderGeometry(0.028, 0.028, 3.8, 8).translate(-1.05, 2.45, 0.0),
      new THREE.CylinderGeometry(0.028, 0.028, 3.8, 8).translate(1.05, 2.45, 0.0),
    ];
    const struts = new THREE.Mesh(
      mergeCampusStaticGeometries(strutGeoms),
      this.materials.steelMullion
    );
    boardHolder.add(bezel, screen, struts);
    this.gymSouthLedBoardGroup = boardHolder;
    parentGroup.add(boardHolder);

    // 2. V6 Spin Studio Live Sprint Telemetry LED Clock (`SpinStudio_North_LED_Clock`)
    //    Mounted cleanly on the North-West interior mullion pier (`x = -3.28, y = 2.26, z = 131.38`,
    //    outside the `[-2.44, +2.44]` breakable center bay!) + West cedar studio wall (`x = -6.82, z = 136.4`)
    //    so live `36 -> 168 RPM` cadence is visible throughout `0.0s -> 7.40s`!
    const northClockGroup = new THREE.Group();
    northClockGroup.name = "SpinStudio_North_LED_Clock";
    northClockGroup.userData.skipGroundingAudit = true;

    const makeStudioMonitor = (px, py, pz, rotY, scale = 1.0) => {
      const mHolder = new THREE.Group();
      mHolder.name = "SpinStudio_North_LED_Monitor";
      mHolder.position.set(px, py, pz);
      mHolder.rotation.y = rotY;
      mHolder.scale.setScalar(scale);
      const mBezel = new THREE.Mesh(
        new THREE.BoxGeometry(1.56, 0.80, 0.07),
        this.materials.steelMullion || this.materials.gbikeTireRubber
      );
      const mScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.44, 0.68), screenMat);
      mScreen.position.z = 0.039;
      const mDropRods = new THREE.Mesh(
        mergeCampusStaticGeometries([
          new THREE.CylinderGeometry(0.018, 0.018, 2.4, 8).translate(-0.56, 1.55, -0.01),
          new THREE.CylinderGeometry(0.018, 0.018, 2.4, 8).translate(0.56, 1.55, -0.01),
        ]),
        this.materials.steelMullion
      );
      mHolder.add(mBezel, mScreen, mDropRods);
      return mHolder;
    };

    northClockGroup.add(
      makeStudioMonitor(-3.26, 2.28, 131.40, 0.18, 0.96),
      makeStudioMonitor(-6.78, 2.18, 136.35, Math.PI * 0.44, 0.92)
    );
    this.gymNorthLedBoardGroup = northClockGroup;
    parentGroup.add(northClockGroup);

    this._updateGymLedCanvas(0, false, null, 0.0);
  }

  _drawLiveDigitalClockFace(rpmVal = 36) {
    if (!this.gymDigitalClockCtx || !this.gymDigitalClockCanvas) return;
    const rpmInt = Math.round(Number(rpmVal) || 36);
    if (this._lastDigitalClockRpm === rpmInt) return;
    this._lastDigitalClockRpm = rpmInt;
    const cv = this.gymDigitalClockCanvas;
    const ctx = this.gymDigitalClockCtx;
    ctx.fillStyle = "#0b0d11";
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, cv.width - 8, cv.height - 8);
    ctx.textAlign = "left";
    ctx.font = "700 62px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ff4d38";
    ctx.shadowColor = "rgba(255, 68, 44, 0.55)";
    ctx.shadowBlur = 10;
    ctx.fillText("04:45", 20, 68);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fillRect(228, 26, 3, cv.height - 52);
    const rpmAccent = rpmInt >= 135 ? "#f97316" : rpmInt >= 85 ? "#fbbf24" : "#38bdf8";
    ctx.fillStyle = rpmAccent;
    ctx.shadowColor = rpmAccent;
    ctx.shadowBlur = 10;
    ctx.textAlign = "right";
    ctx.font = "700 50px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(`${rpmInt} RPM`, cv.width - 20, 68);
    ctx.shadowBlur = 0;
    ctx.textAlign = "left";
    if (this.gymDigitalClockTex) this.gymDigitalClockTex.needsUpdate = true;
  }

  _updateGymLedCanvas(tpusCollected, clusterOnline, snap = null, seqTime = 99.0) {
    if (!this.gymLedCtx) return;

    const inSprintWindow =
      Boolean(snap?.onTrainerStand) || (Number.isFinite(seqTime) && seqTime >= 0.0 && seqTime <= 8.60);

    let liveRpm = 36;
    if (inSprintWindow) {
      if (Number.isFinite(snap?.trainerCadenceRpm) && snap.trainerCadenceRpm > 1.0) {
        liveRpm = Math.round(THREE.MathUtils.clamp(snap.trainerCadenceRpm, 30, 180));
      } else if (Number.isFinite(snap?.cadenceRpm) && snap.cadenceRpm > 1.0) {
        liveRpm = Math.round(THREE.MathUtils.clamp(snap.cadenceRpm, 30, 180));
      } else {
        const u = THREE.MathUtils.clamp((Number(seqTime) || 0.0) / 7.20, 0.0, 1.0);
        const s = u * u * (3.0 - 2.0 * u);
        liveRpm = Math.round(36 + 132 * s);
      }
      this.lastGymLedRpm = liveRpm;
    }

    const modeKey = inSprintWindow
      ? `sprint:${liveRpm}`
      : `tpu:${tpusCollected}:${clusterOnline ? 1 : 0}`;
    if (this._lastGymLedModeKey === modeKey) return;
    this._lastGymLedModeKey = modeKey;

    const ctx = this.gymLedCtx;
    const w = 512;
    const h = 256;
    ctx.fillStyle = "#090d16";
    ctx.fillRect(0, 0, w, h);

    if (inSprintWindow) {
      const frac = THREE.MathUtils.clamp((liveRpm - 36) / (168 - 36), 0.0, 1.0);
      const accent = frac > 0.78 ? "#f97316" : frac > 0.42 ? "#fbbf24" : "#38bdf8";
      const watts = Math.round(140 + frac * frac * 1120);

      ctx.strokeStyle = accent;
      ctx.lineWidth = 5;
      ctx.strokeRect(10, 10, w - 20, h - 20);

      ctx.fillStyle = "#94a3b8";
      ctx.textAlign = "left";
      ctx.font = "bold 19px monospace";
      ctx.fillText("SPIN STUDIO · CADENCE", 28, 46);

      ctx.fillStyle = "#e2e8f0";
      ctx.textAlign = "right";
      ctx.font = "bold 22px monospace";
      ctx.fillText(`${watts} W`, w - 28, 46);

      // Large high-contrast tabular RPM readout (`36 -> 168 RPM`)
      ctx.fillStyle = accent;
      ctx.textAlign = "left";
      ctx.font = "bold 88px monospace";
      ctx.fillText(String(liveRpm).padStart(3, " "), 24, 146);

      ctx.fillStyle = "#cbd5e1";
      ctx.font = "bold 34px monospace";
      ctx.fillText("RPM", 206, 144);

      // 20-segment live tachograph bar
      const bars = 20;
      const barStartX = 28;
      const barY = 176;
      const barW = 19;
      const barGap = 4;
      const barH = 48;
      const litBars = Math.max(1, Math.round(frac * bars));
      for (let i = 0; i < bars; i++) {
        const bx = barStartX + i * (barW + barGap);
        const segFrac = i / (bars - 1);
        const segCol =
          segFrac > 0.78 ? "#ef4444" : segFrac > 0.45 ? "#f59e0b" : "#38bdf8";
        ctx.fillStyle = i < litBars ? segCol : "#1e293b";
        ctx.fillRect(bx, barY, barW, barH);
      }
      ctx.textAlign = "left";
      this._drawLiveDigitalClockFace(liveRpm);
      this.gymLedTexture.needsUpdate = true;
      return;
    }
    this._drawLiveDigitalClockFace(168);

    // Crisp outer status border
    const accent = clusterOnline ? "#34A853" : tpusCollected > 0 ? "#38bdf8" : "#FBBC05";
    ctx.strokeStyle = accent;
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, w - 20, h - 20);

    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "left";
    ctx.font = "bold 20px monospace";
    ctx.fillText("GEMINI 4 CARBON", 30, 52);

    ctx.fillStyle = accent;
    ctx.textAlign = "right";
    ctx.font = "bold 32px monospace";
    ctx.fillText(`${tpusCollected} / 16 TPUs`, w - 30, 55);
    ctx.textAlign = "left";

    const cols = 8;
    const cellW = 50;
    const cellH = 56;
    const gap = 8;
    const startX = 30;
    const startY = 86;

    for (let i = 0; i < 16; i++) {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const x = startX + c * (cellW + gap);
      const y = startY + r * (cellH + gap);
      const lit = i < tpusCollected;

      ctx.fillStyle = lit ? (clusterOnline ? "#22c55e" : "#0ea5e9") : "#1e293b";
      ctx.fillRect(x, y, cellW, cellH);

      ctx.strokeStyle = lit ? "#e0f2fe" : "#334155";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, cellW, cellH);

      if (lit) {
        ctx.fillStyle = "#fde047";
        ctx.fillRect(x + 15, y + 17, 20, 22);
      }
    }

    this.gymLedTexture.needsUpdate = true;
  }

  // ============================================================================
  // 5. 16 SPINNING KINETIC WIND PINWHEELS (`KINETIC_PINWHEELS` — 4 Instanced Draw Calls!)
  // ============================================================================
  _buildKineticPinwheelSpine() {
    const mastGeoms = [];
    const baseGeoms = [];

    const colorKeys = ["#4285F4", "#EA4335", "#FBBC05", "#34A853"];
    const colorMatMap = {
      "#4285F4": this.materials.umbrellaBlue,
      "#EA4335": this.materials.umbrellaRed,
      "#FBBC05": this.materials.umbrellaYellow,
      "#34A853": this.materials.umbrellaGreen,
    };

    const bladeGeoms = [];
    const hub = new THREE.CylinderGeometry(0.18, 0.18, 0.24, 14);
    hub.rotateX(Math.PI * 0.5);
    bladeGeoms.push(hub);

    for (let b = 0; b < 8; b++) {
      const ang = (b / 8) * Math.PI * 2;
      const vane = new THREE.BoxGeometry(0.28, 1.28, 0.045);
      vane.rotateY(0.42);
      vane.translate(0, 0.72, 0);
      vane.rotateZ(ang);
      bladeGeoms.push(vane);

      const tipCup = new THREE.SphereGeometry(0.16, 10, 8, 0, Math.PI);
      tipCup.translate(0, 1.32, 0);
      tipCup.rotateZ(ang);
      bladeGeoms.push(tipCup);
    }
    const sharedRotorGeom = mergeCampusStaticGeometries(bladeGeoms);

    const byColor = new Map();
    for (const ck of colorKeys) byColor.set(ck, []);

    for (let i = 0; i < KINETIC_PINWHEELS.length; i++) {
      const pw = KINETIC_PINWHEELS[i];
      const gy = getOpenWorldTerrainHeight(pw.x, pw.z);
      const h = pw.heightM;

      const plinth = new THREE.CylinderGeometry(0.42, 0.52, 0.36, 12);
      plinth.translate(pw.x, gy + 0.12, pw.z);
      baseGeoms.push(plinth);

      const mast = new THREE.CylinderGeometry(0.085, 0.145, h, 10);
      mast.translate(pw.x, gy + h * 0.5, pw.z);
      mastGeoms.push(mast);

      const arm = new THREE.CylinderGeometry(0.055, 0.055, 0.55, 8);
      arm.rotateX(Math.PI * 0.5);
      arm.translate(pw.x, gy + h - 0.1, pw.z);
      mastGeoms.push(arm);

      const ck = byColor.has(pw.color) ? pw.color : "#4285F4";
      byColor.get(ck).push({
        globalIdx: i,
        x: pw.x,
        y: gy + h - 0.1,
        z: pw.z + (pw.x < 0 ? 0.26 : -0.26),
        yaw: pw.x < 0 ? 0.25 : -0.25,
        baseSpin: pw.phase,
      });
    }

    for (const ck of colorKeys) {
      const items = byColor.get(ck);
      if (!items || items.length === 0) continue;
      const inst = new THREE.InstancedMesh(sharedRotorGeom, colorMatMap[ck], items.length);
      inst.castShadow = true;
      inst.frustumCulled = false;
      this.root.add(inst);
      this.pinwheelInstancedByColor.push({ inst, items });
    }

    const mastMesh = new THREE.Mesh(
      mergeCampusStaticGeometries(mastGeoms),
      this.materials.bridgeRailing
    );
    mastMesh.castShadow = true;
    mastMesh.matrixAutoUpdate = false;
    mastMesh.updateMatrix();
    this.pinwheelMastMesh = mastMesh;
    this.root.add(mastMesh);

    const baseMesh = new THREE.Mesh(
      mergeCampusStaticGeometries(baseGeoms),
      this.materials.concreteCurb
    );
    baseMesh.receiveShadow = true;
    baseMesh.matrixAutoUpdate = false;
    baseMesh.updateMatrix();
    this.pinwheelBaseMesh = baseMesh;
    this.root.add(baseMesh);
  }

  // ============================================================================
  // 6. ALL 5 LANDMARKS, 54 LIVE FLAMINGOS, WOODEN JUMP RAMPS & SHORELINE FINALE
  // ============================================================================
  _buildLandmarksAndRamps() {
    // --- A. Android Lawn Sculpture Park (`(-118, 96)`) ---
    const androidGroup = new THREE.Group();
    const bugY = getOpenWorldTerrainHeight(-118.0, 96.0);

    // Parent concrete plinth directly inside `this.bugdroidHolder` (`MINOR-01`: self-documenting
    // `minY === bugY` (`0.000m` ground clearance) at every frame while `bugdroidBodyPivot` waves/hops on top!)
    this.bugdroidHolder = new THREE.Group();
    this.bugdroidBaseY = bugY;
    this.bugdroidBaseLocalY = 0.308;
    this.bugdroidHolder.position.set(-118.0, bugY, 96.0);

    const bugPlinth = new THREE.Mesh(
      new THREE.CylinderGeometry(2.1, 2.35, 0.31, 24),
      this.materials.concreteCurb
    );
    bugPlinth.position.set(0.0, 0.155, 0.0); // `local Y in [0.000, 0.310]` -> exact ground contact!
    bugPlinth.receiveShadow = true;
    this.bugdroidHolder.add(bugPlinth);

    this.bugdroidBodyPivot = new THREE.Group();
    this.bugdroidBodyPivot.position.set(0.0, this.bugdroidBaseLocalY, 0.0);
    this.bugdroidHolder.add(this.bugdroidBodyPivot);

    // Procedural fallback until `android_statues_v2` GLB attaches
    const bugFallback = buildAndroidBugdroidStatue(this.materials, true);
    bugFallback.scale.setScalar(1.35);
    groundObjectToY(bugFallback, 0.0, 0.002);
    this.bugdroidHolder.userData.fallback = bugFallback;
    this.bugdroidBodyPivot.add(bugFallback);
    androidGroup.add(this.bugdroidHolder);

    const dessertsGroup = new THREE.Group();
    const desserts = [
      { build: () => buildGiantDonutStatue(this.materials, this.rng), x: -127.5, z: 98.5, yaw: 0.45, s: 1.25 },
      { build: () => buildCupcakeStatue(this.materials), x: -108.5, z: 98.0, yaw: -0.35, s: 1.35 },
      { build: () => buildIceCreamSandwichStatue(this.materials), x: -129.0, z: 88.5, yaw: 0.62, s: 1.30 },
      { build: () => buildLollipopStatue(this.materials), x: -107.5, z: 89.0, yaw: -0.52, s: 1.30 },
      { build: () => buildGingerbreadStatue(this.materials), x: -123.5, z: 105.5, yaw: 0.18, s: 1.25 },
      { build: () => buildKitKatStatue(this.materials), x: -112.5, z: 105.5, yaw: -0.22, s: 1.25 },
    ];
    for (const d of desserts) {
      const obj = d.build();
      obj.scale.setScalar(d.s);
      obj.rotation.y = d.yaw;
      const dy = getOpenWorldTerrainHeight(d.x, d.z);
      obj.position.set(d.x, 0, d.z);
      groundObjectToY(obj, dy, 0.004);
      dessertsGroup.add(obj);
    }
    bakeStaticGroupByMaterial(dessertsGroup);
    this.androidDessertsGroup = dessertsGroup;
    androidGroup.add(dessertsGroup);
    this.root.add(androidGroup);

    // --- B. Googleplex Stan T-Rex & 54 Live Pink Flamingos Courtyard (`(-118, -50)`) ---
    const trexY = getDefaultCampusSurfaceTopY(-118.0, -50.0, "stanPlinth");
    this.stanHolder = new THREE.Group();
    this.stanHolder.name = "Stan_Holder_Root";
    this.stanHolder.position.set(-118.0, trexY, -50.0);

    const trexPlinth = new THREE.Mesh(
      new THREE.BoxGeometry(2.26, 0.56, 4.12),
      this.materials.graniteCurb || this.materials.concreteCurb
    );
    trexPlinth.name = "Stan_Fallback_Plinth";
    trexPlinth.position.set(0.0, 0.28, 0.0);
    trexPlinth.castShadow = true;
    trexPlinth.receiveShadow = true;
    this.stanHolder.add(trexPlinth);

    const stanFallback = buildStanTRexStatue(this.materials);
    stanFallback.name = "Stan_Procedural_Fallback";
    stanFallback.scale.setScalar(1.22);
    groundObjectToY(stanFallback, 0.56, 0.0);
    bakeStaticGroupByMaterial(stanFallback);
    this.stanHolder.userData.fallback = stanFallback;
    this.stanHolder.add(stanFallback);
    this.root.add(this.stanHolder);

    // 54 Live Instanced Pink Flamingos (`flamingosBodyInstanced`)
    const flamGeoms = [];
    const fBody = new THREE.SphereGeometry(0.18, 10, 8);
    fBody.scale(0.75, 0.82, 1.35);
    fBody.translate(0, 0.58, 0);
    flamGeoms.push(fBody);

    const fNeck = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.62, -0.16),
        new THREE.Vector3(0, 0.84, -0.22),
        new THREE.Vector3(0, 1.02, -0.14),
        new THREE.Vector3(0, 1.08, -0.24),
      ]),
      10,
      0.042,
      6,
      false
    );
    flamGeoms.push(fNeck);

    const fHead = new THREE.SphereGeometry(0.068, 8, 8);
    fHead.translate(0, 1.08, -0.25);
    flamGeoms.push(fHead);

    const fBeak = new THREE.ConeGeometry(0.036, 0.14, 6);
    fBeak.rotateX(-Math.PI * 0.68);
    fBeak.translate(0, 1.04, -0.33);
    flamGeoms.push(fBeak);

    for (const lx of [-0.055, 0.055]) {
      const leg = new THREE.CylinderGeometry(0.014, 0.012, 0.58, 5);
      leg.translate(lx, 0.29, 0.0);
      flamGeoms.push(leg);
    }

    const mergedFlamingoGeom = mergeCampusStaticGeometries(flamGeoms);
    this.flamingosBodyInstanced = new THREE.InstancedMesh(
      mergedFlamingoGeom,
      this.materials.flamingoPink,
      54
    );
    this.flamingosBodyInstanced.castShadow = true;
    this.flamingosBodyInstanced.frustumCulled = false;
    this.root.add(this.flamingosBodyInstanced);

    // Initialize V5 Articulated Stan T-Rex Roar & Courtyard Cafe Controller
    this.stanEncounter = createStanEncounterController(THREE, {
      stanHolder: this.stanHolder,
      center: { x: -118.0, z: -50.0 },
      baseYawRad: 0.38,
      scale: 1.36,
      groundY: trexY,
      surfaceTopFn: getDefaultCampusSurfaceTopY,
      terrainHeightFn: getOpenWorldTerrainHeight,
      cafeTargetRoot: this.root,
      installCafeSets: true,
      flamingosBodyInstanced: this.flamingosBodyInstanced,
    });

    // Warm golden-hour key/rim highlight on Stan's oxidized cast-bronze skull, ribs & roaring jaws (active on GPU & SwiftShader!)
    this.stanCourtyardKeyLight = new THREE.PointLight("#ffd699", 36.0, 44.0, 1.35);
    this.stanCourtyardKeyLight.position.set(-109.8, 6.8, -40.5);
    this.root.add(this.stanCourtyardKeyLight);

    // Cafe Umbrellas + Bistro Tables around Stan T-Rex Courtyard & Android Plaza
    this._buildCourtyardCafeUmbrellas();

    // --- C. Bay View Dragonscale 3-Tier Canopy (`(202, 24)`) ---
    const bayViewMats = {
      ...this.materials,
      dragonscaleTile: this.silverDragonscaleMat || this.materials.dragonscaleTile,
    };
    const bayView = buildBayViewDragonscaleBuilding(bayViewMats);
    bayView.scale.set(1.42, 1.04, 1.48);
    bayView.rotation.y = -Math.PI * 0.5; // Faces West (-X) across the Fresnel pond toward the ramp!
    bayView.position.set(202.0, 0.0, 24.0);
    groundObjectToY(bayView, 0.0, 0.02);
    bakeStaticGroupByMaterial(bayView);
    bayView.matrixAutoUpdate = false;
    bayView.updateMatrix();
    this.bayViewFallback = bayView;
    this.root.add(bayView);

    // --- D. Wooden Campus Jump Ramps (`JUMP_RAMPS`) + Sloped Landing Ramp (`LANDING_RAMPS`) ---
    const allRampsGroup = new THREE.Group();
    allRampsGroup.name = "Campus_Jump_Ramps_Procedural_Fallback";
    for (const rp of JUMP_RAMPS) {
      allRampsGroup.add(this._buildWoodenJumpRamp(rp));
    }
    bakeStaticGroupByMaterial(allRampsGroup);
    allRampsGroup.matrixAutoUpdate = false;
    allRampsGroup.updateMatrix();
    this.allRampsFallbackGroup = allRampsGroup;
    this.root.add(allRampsGroup);

    const landingFallbackGroup = new THREE.Group();
    landingFallbackGroup.name = "Campus_Landing_Ramps_Procedural_Fallback_V8";
    landingFallbackGroup.userData.skipGroundingAudit = true;
    const landingSpecs =
      Array.isArray(LANDING_RAMPS) && LANDING_RAMPS.length > 0
        ? LANDING_RAMPS
        : [BAYVIEW_LANDING_RAMP || { id: "bayview_landing_ramp", x: 156.0, z: 14.30, widthM: 3.8, lengthM: 6.0, heightM: 1.35, headingYaw: 0.0 }];
    for (const lr of landingSpecs) {
      if (lr) landingFallbackGroup.add(this._buildWoodenLandingRamp(lr));
    }
    bakeStaticGroupByMaterial(landingFallbackGroup);
    landingFallbackGroup.matrixAutoUpdate = false;
    landingFallbackGroup.updateMatrix();
    this.landingRampFallbackGroup = landingFallbackGroup;
    this.root.add(landingFallbackGroup);

    // --- E. Shoreline Amphitheatre (`(12, -206)`) + Supercluster Pedestal (`(14, -178)`) ---
    const shoreline = buildShorelineAmphitheatre(this.materials);
    shoreline.traverse((ch) => {
      if (ch.isMesh && ch.material && ch.material.isMeshStandardMaterial) {
        ch.material = ch.material.clone();
        ch.material.emissive = new THREE.Color("#ffb86b");
        ch.material.emissiveIntensity = 0.22;
      }
    });
    shoreline.scale.setScalar(2.15);
    shoreline.position.set(12.0, 0.22, -208.0);
    groundObjectToY(shoreline, 0.22, 0.02);
    bakeStaticGroupByMaterial(shoreline);
    shoreline.matrixAutoUpdate = false;
    shoreline.updateMatrix();
    this.shorelineFallback = shoreline;
    this.root.add(shoreline);

    this._buildShorelineSuperclusterPedestal();
  }

  _buildCourtyardCafeUmbrellas() {
    const tableGeoms = [];
    const poleGeoms = [];
    const umbGeoms = [[], [], [], []];

    const spots = [
      [-127.6, -37.0], [-103.2, -56.5], [-127.4, -63.2], [-101.8, -50.2],
      [-106.5, -61.8], [-118.0, -66.5], [-124.4, 93.2], [-124.2, 98.8],
    ];
    for (let i = 0; i < spots.length; i++) {
      const [ux, uz] = spots[i];
      const uy = getOpenWorldTerrainHeight(ux, uz);
      tableGeoms.push(
        new THREE.CylinderGeometry(0.85, 0.85, 0.06, 14).translate(ux, uy + 0.76, uz),
        new THREE.CylinderGeometry(0.38, 0.42, 0.05, 12).translate(ux, uy + 0.025, uz)
      );
      poleGeoms.push(
        new THREE.CylinderGeometry(0.04, 0.04, 2.55, 8).translate(ux, uy + 1.28, uz)
      );
      for (let g = 0; g < 8; g++) {
        const gore = new THREE.ConeGeometry(
          1.75,
          0.62,
          4,
          1,
          false,
          (g * Math.PI) / 4,
          Math.PI / 4
        );
        gore.translate(ux, uy + 2.52, uz);
        umbGeoms[(g + i) % 4].push(gore);
      }
    }

    this.courtyardParkedBikesGroup = null;

    // Procedural fallback tables/umbrellas (hidden once `Courtyard_Cafe_Set_V5` attaches via `applyStanTrexV5Glb`!)
    const cafeDecorGroup = new THREE.Group();
    cafeDecorGroup.name = "Courtyard_Cafe_Procedural_Fallback";
    cafeDecorGroup.add(
      new THREE.Mesh(mergeCampusStaticGeometries(tableGeoms), this.materials.reflectorWhite),
      new THREE.Mesh(mergeCampusStaticGeometries(poleGeoms), this.materials.steelMullion)
    );
    const uMats = [
      this.materials.umbrellaBlue,
      this.materials.umbrellaRed,
      this.materials.umbrellaYellow,
      this.materials.umbrellaGreen,
    ];
    for (let c = 0; c < 4; c++) {
      const m = mergeCampusStaticGeometries(umbGeoms[c]);
      if (m) cafeDecorGroup.add(new THREE.Mesh(m, uMats[c]));
    }
    bakeStaticGroupByMaterial(cafeDecorGroup);
    this.courtyardCafeFallbackGroup = cafeDecorGroup;
    this.root.add(cafeDecorGroup);
  }

  /**
   * Builds a sculpted timber kicker ramp whose upper deck surface matches `evaluateJumpRampAtPoint`
   * (`kin.js`) to `0.000mm`, complete with side stringers, trestle posts & 4-color chevron stripes!
   */
  _buildWoodenJumpRamp(rp) {
    const group = new THREE.Group();
    const fwdX = Math.sin(rp.headingYaw);
    const fwdZ = -Math.cos(rp.headingYaw);
    const rightX = Math.cos(rp.headingYaw);
    const rightZ = Math.sin(rp.headingYaw);

    const segU = 22;
    const segV = 8;
    const halfL = rp.lengthM * 0.5;
    const halfW = rp.widthM * 0.5;

    const uLip = 0.88;
    const slopeCoeff = 1.68 / uLip;
    const evalRampH = (u) => {
      if (u <= uLip) {
        const t = u / uLip;
        return rp.heightM * (0.32 * t + 0.68 * t * t);
      }
      return rp.heightM;
    };

    const baseGround =
      getOpenWorldEarthHeight(
        rp.x - fwdX * (halfL + 0.6),
        rp.z - fwdZ * (halfL + 0.6)
      ) + 0.016;

    const pos = [];
    const uvs = [];
    const ind = [];
    for (let iu = 0; iu <= segU; iu++) {
      const u = iu / segU;
      const localFwd = -halfL + u * rp.lengthM;
      const hSurf = baseGround + evalRampH(u) + 0.002;
      for (let iv = 0; iv <= segV; iv++) {
        const v = iv / segV;
        const localRight = -halfW + v * rp.widthM;
        const wx = rp.x + fwdX * localFwd + rightX * localRight;
        const wz = rp.z + fwdZ * localFwd + rightZ * localRight;
        pos.push(wx, hSurf, wz);
        uvs.push(v * 2.0, u * 5.0);

        if (iu < segU && iv < segV) {
          const a = iu * (segV + 1) + iv;
          const b = a + 1;
          const c = (iu + 1) * (segV + 1) + iv;
          const d = c + 1;
          ind.push(a, b, c, b, d, c);
        }
      }
    }

    const deckGeom = new THREE.BufferGeometry();
    deckGeom.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    deckGeom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    deckGeom.setIndex(ind);
    deckGeom.computeVertexNormals();
    const deckMesh = new THREE.Mesh(deckGeom, this.materials.bridgePlanks);
    deckMesh.castShadow = true;
    deckMesh.receiveShadow = true;
    group.add(deckMesh);

    // Timber Trestle Framing & Side Skirts grounded solidly to `baseGround`
    const timberGeoms = [];
    const yawThree = -rp.headingYaw;
    for (const side of [-1, 1]) {
      for (const uPost of [0.28, 0.56, 0.82, 0.98]) {
        const lf = -halfL + uPost * rp.lengthM;
        const lr = side * (halfW - 0.14);
        const hTop = evalRampH(uPost);
        if (hTop < 0.08) continue;
        const post = new THREE.BoxGeometry(0.18, hTop, 0.18);
        post.rotateY(yawThree);
        post.translate(
          rp.x + fwdX * lf + rightX * lr,
          baseGround + hTop * 0.5,
          rp.z + fwdZ * lf + rightZ * lr
        );
        timberGeoms.push(post);
      }
    }
    // Cross-beams under launch lip
    const lipH = rp.heightM;
    const lipWall = new THREE.BoxGeometry(rp.widthM, lipH, 0.18);
    lipWall.rotateY(yawThree);
    lipWall.translate(
      rp.x + fwdX * (halfL - 0.09),
      baseGround + lipH * 0.5,
      rp.z + fwdZ * (halfL - 0.09)
    );
    timberGeoms.push(lipWall);

    const frameMesh = new THREE.Mesh(
      mergeCampusStaticGeometries(timberGeoms),
      this.materials.cedarTimber
    );
    frameMesh.castShadow = true;
    group.add(frameMesh);

    // 4 Painted Google Color Chevron Launch Arrows on Ramp Deck!
    const chevronMats = [
      this.materials.umbrellaBlue,
      this.materials.umbrellaRed,
      this.materials.umbrellaYellow,
      this.materials.umbrellaGreen,
    ];
    for (let c = 0; c < 4; c++) {
      const u = 0.26 + c * 0.20;
      const lf = -halfL + u * rp.lengthM;
      const yDeck = baseGround + evalRampH(u) + 0.014;
      const slope = Math.atan((rp.heightM * slopeCoeff) / rp.lengthM);
      const chevGroup = new THREE.Group();
      for (const side of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.PlaneGeometry(rp.widthM * 0.34, 0.34), chevronMats[c]);
        wing.rotation.x = -Math.PI * 0.5;
        wing.rotation.z = side * 0.42;
        wing.position.set(side * (rp.widthM * 0.14), 0, 0);
        chevGroup.add(wing);
      }
      chevGroup.rotation.order = "YXZ";
      chevGroup.rotation.y = yawThree;
      chevGroup.rotation.x = slope;
      chevGroup.position.set(rp.x + fwdX * lf, yDeck, rp.z + fwdZ * lf);
      group.add(chevGroup);
    }

    bakeStaticGroupByMaterial(group);
    return group;
  }

  /**
   * Builds the companion sloped timber & galvanized-steel landing ramp (`Campus_Landing_Ramp_V8` fallback)
   * matching `evaluateLandingRampAtPoint` (`kin.js`: `w = 1 - u`, `h(u) = H * (0.90 * w + 0.10 * w^2)`) to `0.000mm`!
   */
  _buildWoodenLandingRamp(lr) {
    const group = new THREE.Group();
    const yaw = lr.headingYaw || 0.0;
    const fwdX = Math.sin(yaw);
    const fwdZ = -Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = Math.sin(yaw);

    const segU = 20;
    const segV = 6;
    const lengthM = lr.lengthM || 6.0;
    const widthM = lr.widthM || 3.8;
    const heightM = lr.heightM || lr.peakHeightM || 1.35;
    const halfL = lengthM * 0.5;
    const halfW = widthM * 0.5;
    const baseGround = getOpenWorldEarthHeight(lr.x, lr.z) + 0.016;

    const evalLandingH = (u) => {
      const w = 1.0 - Math.max(0.0, Math.min(1.0, u));
      return heightM * (0.90 * w + 0.10 * w * w);
    };

    const pos = [];
    const uvs = [];
    const ind = [];
    for (let iu = 0; iu <= segU; iu++) {
      const u = iu / segU;
      const localFwd = -halfL + u * lengthM;
      const hSurf = baseGround + evalLandingH(u);
      for (let iv = 0; iv <= segV; iv++) {
        const v = iv / segV;
        const localRight = -halfW + v * widthM;
        const wx = lr.x + fwdX * localFwd + rightX * localRight;
        const wz = lr.z + fwdZ * localFwd + rightZ * localRight;
        pos.push(wx, hSurf, wz);
        uvs.push(v * 2.0, u * 4.5);
        if (iu < segU && iv < segV) {
          const a = iu * (segV + 1) + iv;
          const b = a + 1;
          const c = (iu + 1) * (segV + 1) + iv;
          const d = c + 1;
          ind.push(a, b, c, b, d, c);
        }
      }
    }
    const deckGeom = new THREE.BufferGeometry();
    deckGeom.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    deckGeom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    deckGeom.setIndex(ind);
    deckGeom.computeVertexNormals();
    const deckMesh = new THREE.Mesh(deckGeom, this.materials.bridgePlanks);
    deckMesh.castShadow = true;
    deckMesh.receiveShadow = true;
    group.add(deckMesh);

    const timberGeoms = [];
    const yawThree = -yaw;
    for (const side of [-1, 1]) {
      for (const uPost of [0.02, 0.24, 0.50, 0.74]) {
        const lf = -halfL + uPost * lengthM;
        const lrOff = side * (halfW - 0.14);
        const hTop = evalLandingH(uPost);
        if (hTop < 0.08) continue;
        const post = new THREE.BoxGeometry(0.16, hTop, 0.16);
        post.rotateY(yawThree);
        post.translate(
          lr.x + fwdX * lf + rightX * lrOff,
          baseGround + hTop * 0.5,
          lr.z + fwdZ * lf + rightZ * lrOff
        );
        timberGeoms.push(post);
      }
    }
    const crestWall = new THREE.BoxGeometry(widthM, heightM, 0.18);
    crestWall.rotateY(yawThree);
    crestWall.translate(
      lr.x - fwdX * (halfL - 0.09),
      baseGround + heightM * 0.5,
      lr.z - fwdZ * (halfL - 0.09)
    );
    timberGeoms.push(crestWall);
    const frameMesh = new THREE.Mesh(
      mergeCampusStaticGeometries(timberGeoms),
      this.materials.steelMullion || this.materials.cedarTimber
    );
    frameMesh.castShadow = true;
    frameMesh.receiveShadow = true;
    group.add(frameMesh);
    bakeStaticGroupByMaterial(group);
    return group;
  }

  _buildShorelineSuperclusterPedestal() {
    const px = 14.0;
    const pz = -178.0;

    // Flush Terrain-Conforming Bush-Hammered Sierra Granite & Brushed Dark-Basalt Architectural Plaza Medallion
    // (`MeshStandardMaterial`, `receiveShadow: true` — ZERO flat MS-Paint primary pie-chart wedges!)
    const basaltInlayMat =
      this.materials.shorelineBasaltStone ||
      new THREE.MeshStandardMaterial({
        name: "ShorelineHonedBasaltStone",
        color: "#2a2e36",
        roughness: 0.68,
        metalness: 0.08,
        envMapIntensity: 0.55,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });

    const granitePlazaMat =
      this.materials.shorelineGraniteRing ||
      (this.materials.graniteCurb || this.materials.concreteCurb).clone();
    if (!this.materials.shorelineGraniteRing) {
      granitePlazaMat.name = "ShorelineBushHammeredGranite";
      granitePlazaMat.color.set("#b6afa3");
      granitePlazaMat.roughness = 0.76;
      granitePlazaMat.metalness = 0.05;
      granitePlazaMat.polygonOffset = true;
      granitePlazaMat.polygonOffsetFactor = -3;
      granitePlazaMat.polygonOffsetUnits = -3;
    }

    // Outer honed basalt stone band (`r = 3.92..6.16m`) & bush-hammered granite mid-plaza ring (`r = 2.68..3.72m`)
    const outerBasaltRing = new THREE.Mesh(
      makeTerrainConformingDisc(px, pz, 6.16, 12, 128, 0.0165, 0.22, 3.92),
      basaltInlayMat
    );
    outerBasaltRing.receiveShadow = true;
    outerBasaltRing.matrixAutoUpdate = false;
    outerBasaltRing.updateMatrix();
    this.root.add(outerBasaltRing);

    const midGraniteRing = new THREE.Mesh(
      makeTerrainConformingDisc(px, pz, 3.74, 8, 128, 0.017, 0.25, 2.62),
      granitePlazaMat
    );
    midGraniteRing.receiveShadow = true;
    midGraniteRing.matrixAutoUpdate = false;
    midGraniteRing.updateMatrix();
    this.root.add(midGraniteRing);

    // 3D Chamfered Granite Outer Collar (`R = 6.14..6.50m`, 128 segments + vertical outer skirt) sealing concourse seam with zero sawtooth!
    const collarGeoms = [makeTerrainConformingDisc(px, pz, 6.50, 4, 128, 0.020, 0.2, 6.14)];
    {
      const skPos = [];
      const skUv = [];
      const skInd = [];
      const skSegs = 128;
      for (let is = 0; is <= skSegs; is++) {
        const a = (is / skSegs) * Math.PI * 2;
        const wx = px + Math.cos(a) * 6.50;
        const wz = pz + Math.sin(a) * 6.50;
        const topY = getOpenWorldEarthHeight(wx, wz) + 0.020;
        skPos.push(wx, topY, wz, wx, topY - 0.060, wz);
        skUv.push((is / skSegs) * 8.0, 1.0, (is / skSegs) * 8.0, 0.0);
        if (is < skSegs) {
          const b = is * 2;
          skInd.push(b, b + 1, b + 2, b + 2, b + 1, b + 3);
        }
      }
      const skG = new THREE.BufferGeometry();
      skG.setAttribute("position", new THREE.Float32BufferAttribute(skPos, 3));
      skG.setAttribute("uv", new THREE.Float32BufferAttribute(skUv, 2));
      skG.setIndex(skInd);
      skG.computeVertexNormals();
      collarGeoms.push(skG);
    }
    const collarMat = granitePlazaMat.clone();
    const collarRing = new THREE.Mesh(
      mergeCampusStaticGeometries(collarGeoms),
      collarMat
    );
    collarRing.receiveShadow = true;
    collarRing.matrixAutoUpdate = false;
    collarRing.updateMatrix();
    this.root.add(collarRing);

    // Center honed basalt & warm Sierra granite medallion core (`r = 0..2.62m`) with brushed-bronze trim ring
    const innerCore = new THREE.Mesh(
      makeTerrainConformingDisc(px, pz, 2.62, 10, 96, 0.0175, 0.24, 0.0),
      granitePlazaMat
    );
    innerCore.receiveShadow = true;
    innerCore.matrixAutoUpdate = false;
    innerCore.updateMatrix();
    this.root.add(innerCore);

    const centerBasaltInlay = new THREE.Mesh(
      makeTerrainConformingDisc(px, pz, 1.48, 6, 96, 0.0185, 0.24, 0.0),
      basaltInlayMat
    );
    centerBasaltInlay.receiveShadow = true;
    centerBasaltInlay.matrixAutoUpdate = false;
    centerBasaltInlay.updateMatrix();
    this.root.add(centerBasaltInlay);

    // 16 Recessed Thin (`10cm`) Architectural Glass Seam Arcs (`r = 3.76..3.88m`) — sleek architectural accent!
    const allPos = [];
    const allUvs = [];
    const allCols = [];
    const allInd = [];
    this.shorelinePedestalRanges = [];

    const rIn = 3.76;
    const rOut = 3.88;
    const rRings = 3;
    const segs = 8;
    const aSweep = (Math.PI * 2) / 16 - 0.04;

    for (let i = 0; i < 16; i++) {
      const aStart = (i / 16) * Math.PI * 2 + 0.03;
      const vBase = allPos.length / 3;
      for (let ir = 0; ir <= rRings; ir++) {
        const r = rIn + (ir / rRings) * (rOut - rIn);
        for (let is = 0; is <= segs; is++) {
          const a = aStart + (is / segs) * aSweep;
          const wx = px + Math.cos(a) * r;
          const wz = pz + Math.sin(a) * r;
          const wy = getOpenWorldEarthHeight(wx, wz) + 0.0195;
          allPos.push(wx, wy, wz);
          allUvs.push(is / segs, ir / rRings);
          allCols.push(0.118, 0.161, 0.231); // #1e293b
          if (ir < rRings && is < segs) {
            const i00 = vBase + ir * (segs + 1) + is;
            const i01 = i00 + 1;
            const i10 = vBase + (ir + 1) * (segs + 1) + is;
            const i11 = i10 + 1;
            allInd.push(i00, i01, i10, i01, i11, i10);
          }
        }
      }
      this.shorelinePedestalRanges.push([vBase, allPos.length / 3]);
    }

    const pedGeom = new THREE.BufferGeometry();
    pedGeom.setAttribute("position", new THREE.Float32BufferAttribute(allPos, 3));
    pedGeom.setAttribute("uv", new THREE.Float32BufferAttribute(allUvs, 2));
    pedGeom.setAttribute("color", new THREE.Float32BufferAttribute(allCols, 3));
    pedGeom.setIndex(allInd);
    pedGeom.computeVertexNormals();

    const pedMat =
      this.materials.shorelineKeynotePedestalPbr ||
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.88,
        metalness: 0.05,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      });
    const pedMesh = new THREE.Mesh(pedGeom, pedMat);
    pedMesh.receiveShadow = true;
    pedMesh.matrixAutoUpdate = false;
    pedMesh.updateMatrix();
    this.shorelinePedestalMesh = pedMesh;
    this._lastPedTpuCount = -1;
    this._lastPedPhase = -1;
    this.root.add(pedMesh);

    // =========================================================================
    // V8-09 SHORELINE 12-RACK OPEN-FRAME LIQUID-COOLED TPU SUPERCOMPUTER STAGE
    // Continuous 12-rack row (`10.08m` wide at `0.84m` pitch) flush against the
    // Shoreline Amphitheatre rear stage wall (`x = 18.0, z = -199.5m`, facing `+Z`
    // toward the audience/plaza, ZERO obstructing colonnade posts or plaza pods!)
    // =========================================================================
    const stageCenterX = 11.2;
    const stageCenterZ = -199.5;
    const rackCount = 12;
    const rackPitch = 0.84;
    const stageConcourseY = getOpenWorldEarthHeight(stageCenterX, stageCenterZ) + 0.016;
    const stageDeckY = stageConcourseY + 0.024;
    this._shorelineRackStageSpec = {
      centerX: stageCenterX,
      centerZ: stageCenterZ,
      rackCount,
      rackPitch,
      stageDeckY,
    };

    // Continuous Honed Dark-Basalt Datacenter Stage Pad (`10.68m W x 1.42m D`, embedded `-0.04m` into concourse)
    {
      const stagePad = new THREE.Mesh(
        new THREE.BoxGeometry(rackCount * rackPitch + 0.60, 0.064, 1.42),
        basaltInlayMat
      );
      stagePad.name = "Shoreline_TPU_Stage_Basalt_Plinth_V8";
      stagePad.position.set(stageCenterX, stageDeckY - 0.032, stageCenterZ);
      stagePad.receiveShadow = true;
      stagePad.castShadow = false;
      stagePad.userData.skipGroundingAudit = true;
      stagePad.matrixAutoUpdate = false;
      stagePad.updateMatrix();
      this.root.add(stagePad);
    }

    // Outer Header End-Cap Copper Coolant Loop Manifolds framing the 12-rack `10.08m` continuous header run
    {
      const endCapsGroup = new THREE.Group();
      endCapsGroup.name = "Shoreline_TPU_Overhead_Endcaps_V8";
      endCapsGroup.userData.skipGroundingAudit = true;
      const copperMat = new THREE.MeshStandardMaterial({
        name: "ShorelineCopperCoolantHeaderV8",
        color: "#C97539",
        metalness: 0.88,
        roughness: 0.24,
        envMapIntensity: 0.60,
      });
      const steelSupportMat = this.materials.steelMullion;
      const endCopperGeoms = [];
      const endSteelGeoms = [];
      const halfRowSpan = rackCount * rackPitch * 0.5; // 5.04m
      for (const side of [-1, 1]) {
        const ex = stageCenterX + side * (halfRowSpan + 0.14);
        // End copper header extensions + vertical U-loop return manifold connecting Z = 2.005m & Z = 2.055m headers
        endCopperGeoms.push(
          new THREE.CylinderGeometry(0.028, 0.028, 0.28, 10)
            .rotateZ(Math.PI * 0.5)
            .translate(ex, stageDeckY + 2.005, stageCenterZ + 0.145),
          new THREE.CylinderGeometry(0.028, 0.028, 0.28, 10)
            .rotateZ(Math.PI * 0.5)
            .translate(ex, stageDeckY + 2.055, stageCenterZ + 0.055),
          new THREE.BoxGeometry(0.085, 0.14, 0.18).translate(
            ex + side * 0.12,
            stageDeckY + 2.030,
            stageCenterZ + 0.100
          )
        );
        // Grounded outer steel portal stanchions anchoring the 12-rack overhead raceway
        endSteelGeoms.push(
          new THREE.BoxGeometry(0.068, 2.32, 0.068).translate(
            ex + side * 0.12,
            stageDeckY + 1.16,
            stageCenterZ + 0.100
          ),
          new THREE.BoxGeometry(0.18, 0.024, 0.24).translate(
            ex + side * 0.12,
            stageDeckY + 0.012,
            stageCenterZ + 0.100
          )
        );
      }
      const copperMesh = new THREE.Mesh(mergeCampusStaticGeometries(endCopperGeoms), copperMat);
      copperMesh.castShadow = true;
      copperMesh.receiveShadow = true;
      const steelMesh = new THREE.Mesh(mergeCampusStaticGeometries(endSteelGeoms), steelSupportMat);
      steelMesh.castShadow = true;
      steelMesh.receiveShadow = true;
      endCapsGroup.add(copperMesh, steelMesh);
      endCapsGroup.matrixAutoUpdate = false;
      endCapsGroup.updateMatrix();
      this.shorelineOverheadEndcapsGroup = endCapsGroup;
      this.root.add(endCapsGroup);
    }

    // Procedural 12-Rack Open-Frame Liquid-Cooled TPU Supercomputer Fallback (superseded 1:1 when `TPU_Supercluster_Rack_V4` GLB attaches!)
    {
      const frameGeoms = [];
      const coldPlateGeoms = [];
      const copperGeoms = [];
      const blueTwinaxGeoms = [];
      const yellowFiberGeoms = [];
      const greyBoxGeoms = [];

      for (let r = 0; r < rackCount; r++) {
        const rx = stageCenterX + (r - (rackCount - 1) * 0.5) * rackPitch;
        const rz = stageCenterZ;
        const ry = stageDeckY;

        // Open structural steel frame posts (`0.82m W x 1.94m H x 1.04m D`, ZERO closed doors!)
        for (const sx of [-0.388, 0.388]) {
          for (const sz of [-0.49, 0.49]) {
            frameGeoms.push(
              new THREE.BoxGeometry(0.044, 1.88, 0.050).translate(rx + sx, ry + 0.96, rz + sz)
            );
          }
        }
        frameGeoms.push(
          new THREE.BoxGeometry(0.82, 0.05, 1.04).translate(rx, ry + 0.04, rz),
          new THREE.BoxGeometry(0.82, 0.05, 1.04).translate(rx, ry + 1.92, rz),
          new THREE.BoxGeometry(0.74, 1.80, 0.03).translate(rx, ry + 0.96, rz - 0.50)
        );
        // 8 Horizontally Stacked TPU Compute Tray Shelves + Gold/Copper Coldplates + Blue Twinax Loops
        for (let s = 0; s < 8; s++) {
          const sy = ry + 0.31 + s * 0.175;
          frameGeoms.push(new THREE.BoxGeometry(0.73, 0.024, 0.88).translate(rx, sy, rz + 0.02));
          coldPlateGeoms.push(new THREE.BoxGeometry(0.64, 0.048, 0.34).translate(rx, sy + 0.036, rz + 0.22));
          blueTwinaxGeoms.push(new THREE.BoxGeometry(0.58, 0.026, 0.06).translate(rx, sy + 0.022, rz + 0.47));
        }
        // Central vertical bright-yellow optical fiber spine + overhead yellow fiber raceway tray
        yellowFiberGeoms.push(
          new THREE.BoxGeometry(0.048, 1.56, 0.042).translate(rx, ry + 1.06, rz + 0.50),
          new THREE.BoxGeometry(rackPitch, 0.068, 0.24).translate(rx, ry + 2.22, rz + 0.35)
        );
        // Twin continuous overhead copper liquid-coolant header pipes (`y = 2.005 & 2.055`)
        copperGeoms.push(
          new THREE.CylinderGeometry(0.028, 0.028, rackPitch, 8)
            .rotateZ(Math.PI * 0.5)
            .translate(rx, ry + 2.005, rz + 0.145),
          new THREE.CylinderGeometry(0.028, 0.028, rackPitch, 8)
            .rotateZ(Math.PI * 0.5)
            .translate(rx, ry + 2.055, rz + 0.055)
        );
        // Upper grey industrial rotary power disconnect boxes (`y = 2.36m`)
        for (const dx of [-0.20, 0.20]) {
          greyBoxGeoms.push(
            new THREE.BoxGeometry(0.35, 0.17, 0.20).translate(rx + dx, ry + 2.36, rz + 0.22)
          );
        }
      }

      const procPodsWrapper = new THREE.Group();
      procPodsWrapper.name = "Shoreline_Procedural_Pods_Fallback";
      procPodsWrapper.userData.skipGroundingAudit = true;

      const addFallbackBatch = (geoms, mat, cast = true) => {
        if (!geoms.length) return;
        const m = new THREE.Mesh(mergeCampusStaticGeometries(geoms), mat);
        m.castShadow = cast && !this.isSoftwareRenderer;
        m.receiveShadow = true;
        m.matrixAutoUpdate = false;
        m.updateMatrix();
        procPodsWrapper.add(m);
      };

      const rackFrameMat = new THREE.MeshStandardMaterial({
        color: "#20242B",
        metalness: 0.70,
        roughness: 0.34,
        envMapIntensity: 0.55,
      });
      const yellowTrayMat = new THREE.MeshStandardMaterial({
        color: "#F6B800",
        metalness: 0.10,
        roughness: 0.30,
        envMapIntensity: 0.50,
      });
      const copperPipeMat = new THREE.MeshStandardMaterial({
        color: "#C97539",
        metalness: 0.88,
        roughness: 0.24,
        envMapIntensity: 0.58,
      });
      const twinaxBlueMat = new THREE.MeshStandardMaterial({
        color: "#1565C0",
        metalness: 0.16,
        roughness: 0.30,
        envMapIntensity: 0.48,
      });

      addFallbackBatch(frameGeoms, rackFrameMat, true);
      addFallbackBatch(coldPlateGeoms, this.materials.gbikeChrome, false);
      addFallbackBatch(copperGeoms, copperPipeMat, false);
      addFallbackBatch(blueTwinaxGeoms, twinaxBlueMat, false);
      addFallbackBatch(yellowFiberGeoms, yellowTrayMat, true);
      addFallbackBatch(greyBoxGeoms, this.materials.gbikeAlloy, true);

      this.shorelineProceduralPodsGroup = procPodsWrapper;
      this.shorelinePodsGroup = procPodsWrapper;
      this.shorelineRacksMesh = null;
      this.root.add(procPodsWrapper);
    }

    // Zero-GC GPU-Instanced Optical Transceiver LED Array across all 12 Racks (`12 racks x 28 LEDs = 336` LEDs!)
    // Async emerald/cyan/amber data-center telemetry flicker -> synchronized 4-color + silicon-gold finale wave!
    {
      const ledsPerRack = 28; // 7 shelf rows x 4 optical port clusters
      const totalLeds = rackCount * ledsPerRack;
      const ledGeom = new THREE.BoxGeometry(0.044, 0.014, 0.012);
      const ledMat = new THREE.MeshBasicMaterial({
        name: "Mat_TPU_Rack_Optical_LED_Instanced_V8",
        color: "#ffffff",
        toneMapped: false,
      });
      const ledsInst = new THREE.InstancedMesh(ledGeom, ledMat, totalLeds);
      ledsInst.name = "TPU_Rack_Optical_LED_Instanced";
      ledsInst.castShadow = false;
      ledsInst.receiveShadow = false;
      ledsInst.frustumCulled = false;
      ledsInst.userData.noCastShadow = true;
      ledsInst.userData.skipGroundingAudit = true;

      this.shorelineRackLedSeeds = [];
      this.shorelineRackStatusLedMats = [];
      const ledShelfYs = [0.349, 0.515, 0.681, 0.847, 1.013, 1.345, 1.696];
      const ledPortXs = [-0.275, -0.118, 0.118, 0.275];
      let ledIdx = 0;
      for (let r = 0; r < rackCount; r++) {
        const rx = stageCenterX + (r - (rackCount - 1) * 0.5) * rackPitch;
        for (let s = 0; s < ledShelfYs.length; s++) {
          const ly = stageDeckY + ledShelfYs[s];
          for (let p = 0; p < ledPortXs.length; p++) {
            const lx = rx + ledPortXs[p];
            const lz = stageCenterZ + 0.494;
            _pos.set(lx, ly, lz);
            _quat.identity();
            _scale.set(1.0, 1.0, 1.0);
            _mat4.compose(_pos, _quat, _scale);
            ledsInst.setMatrixAt(ledIdx, _mat4);
            const seedHash = ((r * 73 + s * 31 + p * 17) % 97) / 97.0;
            const palIdx = (r + s + p) % 3;
            ledsInst.setColorAt(
              ledIdx,
              _color.setHex(palIdx === 0 ? 0x10b981 : palIdx === 1 ? 0x38bdf8 : 0xf59e0b)
            );
            this.shorelineRackLedSeeds.push({
              rackIdx: r,
              shelfIdx: s,
              portIdx: p,
              phase: seedHash * Math.PI * 2.0,
              freq: 6.5 + seedHash * 11.5,
              palIdx,
            });
            ledIdx++;
          }
        }
      }
      ledsInst.instanceMatrix.needsUpdate = true;
      if (ledsInst.instanceColor) ledsInst.instanceColor.needsUpdate = true;
      this.shorelineRackLedsInstanced = ledsInst;
      this.root.add(ledsInst);
    }

    // 8 Festive 4-Color Google Concert Sky-Beams + Physical Stage Searchlight Fixtures flanking the 12-Rack TPU Stage!
    const beamColors = ["#4285F4", "#EA4335", "#FBBC05", "#34A853"];
    const beamSpots = [
      [-6.0, -200.5],
      [4.6, -199.8],
      [8.2, -202.8],
      [14.2, -202.8],
      [17.8, -199.8],
      [23.5, -200.5],
      [4.5, -214.0],
      [19.5, -214.0],
    ];

    // Physical grounded dark-anodized concert searchlight housings & glowing Fresnel lenses at all 8 `beamSpots`
    const spotFixturesGroup = new THREE.Group();
    spotFixturesGroup.name = "Shoreline_Stage_Searchlight_Fixtures";
    const fixtureHousingGeoms = [];
    const fixtureLensGeomsByCol = [[], [], [], []];
    for (let i = 0; i < beamSpots.length; i++) {
      const [bx, bz] = beamSpots[i];
      const by = getOpenWorldEarthHeight(bx, bz) + 0.016;
      // Heavy octagonal ballast base pad (`local minY = by`, zero floating geometry!)
      fixtureHousingGeoms.push(
        new THREE.CylinderGeometry(0.56, 0.64, 0.14, 8).translate(bx, by + 0.07, bz)
      );
      // U-yoke support stanchions + horizontal trunnion axle
      fixtureHousingGeoms.push(
        new THREE.BoxGeometry(0.10, 0.56, 0.14).translate(bx - 0.36, by + 0.40, bz),
        new THREE.BoxGeometry(0.10, 0.56, 0.14).translate(bx + 0.36, by + 0.40, bz)
      );
      const trunnion = new THREE.CylinderGeometry(0.055, 0.055, 0.80, 10);
      trunnion.rotateZ(Math.PI * 0.5);
      trunnion.translate(bx, by + 0.58, bz);
      fixtureHousingGeoms.push(trunnion);
      // Ribbed concert searchlight barrel + flared anti-glare snoot collar
      fixtureHousingGeoms.push(
        new THREE.CylinderGeometry(0.28, 0.24, 0.52, 16).translate(bx, by + 0.58, bz),
        new THREE.CylinderGeometry(0.34, 0.28, 0.14, 16).translate(bx, by + 0.84, bz)
      );
      // Glowing Fresnel lens disc seated inside the snoot bezel (`y = by + 0.86`)
      const lensDisc = new THREE.CircleGeometry(0.25, 16);
      lensDisc.rotateX(-Math.PI * 0.5);
      lensDisc.translate(bx, by + 0.86, bz);
      fixtureLensGeomsByCol[i % 4].push(lensDisc);
    }
    const fixtureHousingMesh = new THREE.Mesh(
      mergeCampusStaticGeometries(fixtureHousingGeoms),
      this.materials.steelMullion
    );
    fixtureHousingMesh.castShadow = true;
    fixtureHousingMesh.receiveShadow = true;
    spotFixturesGroup.add(fixtureHousingMesh);
    for (let c = 0; c < 4; c++) {
      if (fixtureLensGeomsByCol[c].length === 0) continue;
      const lensMat = new THREE.MeshBasicMaterial({ color: beamColors[c] });
      spotFixturesGroup.add(
        new THREE.Mesh(mergeCampusStaticGeometries(fixtureLensGeomsByCol[c]), lensMat)
      );
    }
    spotFixturesGroup.matrixAutoUpdate = false;
    spotFixturesGroup.updateMatrix();
    this.shorelineSpotFixturesGroup = spotFixturesGroup;
    this.root.add(spotFixturesGroup);

    // Upward-flaring volumetric searchlight beam (`rBottom = 0.22m` inside lens -> `rTop = 3.10m` aloft)
    // with baked smooth vertical vertex-color intensity decaying to `0.000` at the top (zero hard seams!)
    const beamH = 36.0;
    const coneGeom = new THREE.CylinderGeometry(3.10, 0.22, beamH, 24, 16, true);
    coneGeom.translate(0, beamH * 0.5, 0);
    const beamPosAttr = coneGeom.getAttribute("position");
    const beamColArr = new Float32Array(beamPosAttr.count * 3);
    for (let v = 0; v < beamPosAttr.count; v++) {
      const u = THREE.MathUtils.clamp(beamPosAttr.getY(v) / beamH, 0.0, 1.0);
      const snootEntry = u < 0.03 ? u / 0.03 : 1.0;
      const skyDecay = Math.pow(Math.max(0.0, 1.0 - u), 2.35);
      const lum = snootEntry * skyDecay;
      beamColArr[v * 3] = lum;
      beamColArr[v * 3 + 1] = lum;
      beamColArr[v * 3 + 2] = lum;
    }
    coneGeom.setAttribute("color", new THREE.BufferAttribute(beamColArr, 3));

    const beamMat = new THREE.MeshBasicMaterial({
      color: "#fff0d4",
      vertexColors: true,
      transparent: true,
      opacity: 0.045,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const beamsInst = new THREE.InstancedMesh(coneGeom, beamMat, beamSpots.length);
    beamsInst.frustumCulled = false;
    beamsInst.visible = false;
    for (let i = 0; i < beamSpots.length; i++) {
      const [bx, bz] = beamSpots[i];
      const by = getOpenWorldEarthHeight(bx, bz) + 0.016 + 0.78;
      _pos.set(bx, by, bz);
      _quat.identity();
      _scale.setScalar(1.0);
      _mat4.compose(_pos, _quat, _scale);
      beamsInst.setMatrixAt(i, _mat4);
      beamsInst.setColorAt(i, _color.set(beamColors[i % 4]));
      this.shorelineBeamCones.push({ x: bx, y: by, z: bz, phase: i * 0.85 });
    }
    beamsInst.instanceMatrix.needsUpdate = true;
    if (beamsInst.instanceColor) beamsInst.instanceColor.needsUpdate = true;
    this.shorelineBeamsInstanced = beamsInst;
    this.root.add(beamsInst);

    // NOTE (`V8-09`): `Shoreline_Architectural_Stage_Colonnade` removed completely for an unobstructed wide-angle view of the 12-rack TPU supercomputer stage!

    // Balanced neutral-warm architectural stage key illuminating the 12 open-frame TPU racks + monument bounce
    this.shorelineStageLight = new THREE.PointLight("#fff4e4", 6.2, 48.0, 1.85);
    this.shorelineStageLight.position.set(18.0, 11.2, -193.5);
    this.root.add(this.shorelineStageLight);

    this.shorelineSignBounceLight = new THREE.PointLight("#fff2de", 6.0, 22.0, 2.0);
    this.shorelineSignBounceLight.position.set(2.5, 4.2, -175.0);
    this.root.add(this.shorelineSignBounceLight);

    // Delicate Sub-Pixel Warm Sunlit Atmospheric Motes (`0.016m` world radius, soft radial falloff, `opacity: 0.20`)
    // drifting gently across the Shoreline Amphitheatre stage & `GEMINI 4 CARBON` concourse (ZERO oversized yellow polka-dot spheres!)
    {
      const shMoteCount = 96;
      const shTex = createSubPixelRadialMoteTexture(64, 4.4);
      const shGeom = new THREE.PlaneGeometry(0.016, 0.016);
      const shMat = new THREE.MeshBasicMaterial({
        name: "Shoreline_Sunlit_SubPixel_Motes_Mat",
        map: shTex,
        color: "#ffe9bc",
        transparent: true,
        opacity: 0.20,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      });
      const shInst = new THREE.InstancedMesh(shGeom, shMat, shMoteCount);
      shInst.name = "Shoreline_Sunlit_Dust_Motes";
      shInst.userData.skipGroundingAudit = true;
      shInst.frustumCulled = false;
      shInst.castShadow = false;
      shInst.receiveShadow = false;
      shInst.visible = false;

      const sRng = createMulberry32(0x64ca8b02);
      this.shorelineSunlitMoteSeeds = [];
      for (let i = 0; i < shMoteCount; i++) {
        const bx = -6.0 + sRng() * 34.0;
        const bz = -196.0 + sRng() * 26.0;
        const by = getOpenWorldTerrainHeight(bx, bz) + 0.42 + sRng() * 4.4;
        this.shorelineSunlitMoteSeeds.push({
          bx,
          by,
          bz,
          phase: sRng() * Math.PI * 2,
          freq: 0.36 + sRng() * 0.48,
          ampX: 0.08 + sRng() * 0.14,
          ampY: 0.05 + sRng() * 0.09,
          ampZ: 0.08 + sRng() * 0.14,
          scale: 0.65 + sRng() * 0.85,
        });
        _pos.set(bx, by, bz);
        _quat.identity();
        _scale.setScalar(1.0);
        _mat4.compose(_pos, _quat, _scale);
        shInst.setMatrixAt(i, _mat4);
      }
      shInst.instanceMatrix.needsUpdate = true;
      this.shorelineSunlitMotesInstanced = shInst;
      this.root.add(shInst);
    }
  }

  // ============================================================================
  // 7. 16 COLLECTIBLE `TPU_SPAWNS` & 4 `MK_BOOST_PADS` (MICROKITCHEN CARTS)
  // ============================================================================
  _buildCollectibleTpusAndMkPads() {
    // Subtle `0.28m` warm gold specular ground glint (`opacity: 0.28`) directly beneath each spinning 3D `TPU_Wafer_V2` chip
    // (ZERO `1.3m` neon cyan road puddles, ZERO oversized yellow torus rings!)
    const haloGeom = new THREE.CircleGeometry(0.28, 20);
    haloGeom.rotateX(-Math.PI * 0.5);
    this.tpuHalosInstanced = new THREE.InstancedMesh(
      haloGeom,
      this.materials.tpuHaloGlow,
      TPU_SPAWNS.length
    );
    this.tpuHalosInstanced.frustumCulled = false;
    this.root.add(this.tpuHalosInstanced);

    const fbSlateSubstrateMat = new THREE.MeshStandardMaterial({
      name: "Fallback_TPU_8i_Substrate",
      color: "#1a202b",
      roughness: 0.36,
      metalness: 0.42,
    });
    const fbGoldMat = new THREE.MeshStandardMaterial({
      name: "Fallback_TPU_8i_ChampagneGold",
      color: "#e2be5a",
      emissive: "#d4af37",
      emissiveIntensity: 0.14,
      roughness: 0.18,
      metalness: 0.92,
    });

    this.tpuRingsInstanced = null;
    const fbSubstrateGeom = new THREE.BoxGeometry(0.50, 0.62, 0.036);
    const fbGoldChipGeom = new THREE.BoxGeometry(0.18, 0.21, 0.012);

    for (let i = 0; i < TPU_SPAWNS.length; i++) {
      const sp = TPU_SPAWNS[i];
      const gy = getOpenWorldTerrainHeight(sp.x, sp.z);
      const isIronwood = sp.tier === "ironwood_gold" || sp.value >= 2;
      const hasBeaconRing = false;

      const podRoot = new THREE.Group();
      const baseY = gy + (sp.bonusHeightM ?? 0.56) + 0.06;
      podRoot.position.set(sp.x, baseY, sp.z);

      const fallback = new THREE.Group();
      const board = new THREE.Mesh(fbSubstrateGeom, fbSlateSubstrateMat);
      fallback.add(board);
      for (const [cx, cy] of [[-0.11, 0.12], [0.11, 0.12], [-0.11, -0.10], [0.11, -0.10]]) {
        const chip = new THREE.Mesh(fbGoldChipGeom, fbGoldMat);
        chip.position.set(cx, cy, 0.020);
        fallback.add(chip);
      }
      podRoot.add(fallback);

      this.root.add(podRoot);
      this.tpuVisuals.push({
        index: i,
        spec: sp,
        groundY: gy,
        baseY,
        podScale: isIronwood ? 0.92 : 0.80,
        hasBeaconRing,
        root: podRoot,
        fallback,
        glbClone: null,
        pickupAnim: 0.0,
      });
    }
    if (this.tpuRingsInstanced && this.tpuRingsInstanced.instanceColor) {
      this.tpuRingsInstanced.instanceColor.needsUpdate = true;
    }

    // 5 Microkitchen (`MK`) Sidewalk Espresso Carts + Rising Espresso Steam!
    // (100% ZERO bullseye rugs, ZERO green road rectangles, and ZERO green road chevrons!)
    this.mkChevronsInstanced = null;
    const cartColors = [
      this.materials.umbrellaGreen,
      this.materials.umbrellaBlue,
      this.materials.umbrellaRed,
      this.materials.umbrellaYellow,
    ];
    const cartsGroup = new THREE.Group();

    const puffsPerCart = 4;
    const steamPuffGeom = new THREE.SphereGeometry(0.115, 10, 8);
    this.mkSteamInstanced = new THREE.InstancedMesh(
      steamPuffGeom,
      this.materials.espressoSteamWisp || this.materials.reflectorWhite,
      MK_BOOST_PADS.length * puffsPerCart
    );
    this.mkSteamInstanced.castShadow = false;
    this.mkSteamInstanced.receiveShadow = false;
    this.mkSteamInstanced.frustumCulled = false;
    this.mkSteamInstanced.renderOrder = 4;
    this.root.add(this.mkSteamInstanced);
    this.mkSteamSpecs = [];

    for (let i = 0; i < MK_BOOST_PADS.length; i++) {
      const pad = MK_BOOST_PADS[i];

      let roadYaw = 0.0;
      let roadHalfW = 5.5;
      let isPaverRoad = false;
      let bestD = Infinity;
      for (const r of CAMPUS_ROADS) {
        if (r.isArchedBridge) continue;
        const dx = r.x2 - r.x1;
        const dz = r.z2 - r.z1;
        const lenSq = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((pad.x - r.x1) * dx + (pad.z - r.z1) * dz) / lenSq));
        const d = Math.hypot(pad.x - (r.x1 + t * dx), pad.z - (r.z1 + t * dz));
        if (d < bestD) {
          bestD = d;
          roadYaw = Math.atan2(dx, -dz);
          roadHalfW = r.widthM * 0.5;
          isPaverRoad = r.surface === "pavers";
        }
      }

      const rightX = Math.cos(roadYaw);
      const rightZ = Math.sin(roadYaw);
      const sideSign = pad.x > 140 ? -1 : 1;
      // Place cart cleanly on the raised concrete sidewalk café apron (`roadHalfW + 2.30m`)!
      const cx = pad.x + rightX * sideSign * (roadHalfW + 2.30);
      const cz = pad.z + rightZ * sideSign * (roadHalfW + 2.30);
      const cy = getOpenWorldEarthHeight(cx, cz) + (isPaverRoad ? 0.018 : 0.094);
      const cartRotY = -roadYaw;

      // Steam emitter nozzle above `Campus_Snack_Cart_V6` chrome espresso machine (`local (-0.46, 1.48, -0.06)` facing street via `v6CartYaw`)
      const v6CartYaw = cartRotY + (sideSign > 0 ? -Math.PI * 0.5 : Math.PI * 0.5);
      const cosR = Math.cos(v6CartYaw);
      const sinR = Math.sin(v6CartYaw);
      const localNozX = -0.46;
      const localNozZ = -0.06;
      const steamBaseX = cx + localNozX * cosR + localNozZ * sinR;
      const steamBaseY = cy + 1.48;
      const steamBaseZ = cz - localNozX * sinR + localNozZ * cosR;
      for (let p = 0; p < puffsPerCart; p++) {
        this.mkSteamSpecs.push({
          instanceIdx: i * puffsPerCart + p,
          x: steamBaseX,
          y: steamBaseY,
          z: steamBaseZ,
          phase: i * 1.37 + (p / puffsPerCart),
          driftAngle: i * 1.9 + p * 1.57,
        });
      }
      this.mkBoostVisuals.push({ chevronSlots: [] });

      const cart = new THREE.Group();
      cart.position.set(cx, cy, cz);
      cart.rotation.y = cartRotY;
      this.mkCartPlacements.push({ x: cx, y: cy, z: cz, rotY: cartRotY, roadYaw, sideSign });

      const counter = new THREE.Mesh(
        new THREE.BoxGeometry(1.32, 0.98, 2.18),
        this.materials.cedarTimber
      );
      counter.position.y = 0.54;
      counter.castShadow = true;

      const brassKick = new THREE.Mesh(
        new THREE.BoxGeometry(1.36, 0.08, 2.22),
        this.materials.graniteCurb || this.materials.steelMullion
      );
      brassKick.position.y = 0.04;

      const marbleTop = new THREE.Mesh(
        new THREE.BoxGeometry(1.46, 0.08, 2.34),
        this.materials.reflectorWhite
      );
      marbleTop.position.y = 1.07;

      const espressoMachine = new THREE.Mesh(
        new THREE.BoxGeometry(0.56, 0.46, 0.76),
        this.materials.gbikeChrome
      );
      espressoMachine.position.set(0, 1.34, -0.22);

      const canopyPole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 2.55, 12),
        this.materials.steelMullion
      );
      canopyPole.position.set(0, 1.32, 0.35);

      const awning = new THREE.Group();
      awning.position.set(0, 2.60, 0.35);
      const googleCanopyCols = [
        this.materials.umbrellaBlue,
        this.materials.umbrellaRed,
        this.materials.umbrellaYellow,
        this.materials.umbrellaGreen,
      ];
      for (let g = 0; g < 8; g++) {
        const gore = new THREE.Mesh(
          new THREE.ConeGeometry(1.62, 0.56, 4, 1, false, (g * Math.PI) / 4, Math.PI / 4),
          googleCanopyCols[(g + i) % 4]
        );
        gore.castShadow = true;
        awning.add(gore);
      }

      cart.add(brassKick, counter, marbleTop, espressoMachine, canopyPole, awning);
      cartsGroup.add(cart);
    }

    bakeStaticGroupByMaterial(cartsGroup);
    this.mkCartsFallbackGroup = cartsGroup;
    this.root.add(cartsGroup);
  }

  // ============================================================================
  // 8. AUTONOMOUS WAYMO GEN 6 FLEET, 5 CURBSIDE WAYMOS & CONTACT AO SHADOW DECALS
  // ============================================================================
  _buildAutonomousWaymoFleet() {
    // 1. Moving Autonomous Fleet (`4` Waymos + `1` Google Shuttle)
    for (let i = 0; i < WAYMO_ROUTES.length; i++) {
      const route = WAYMO_ROUTES[i];
      const root = new THREE.Group();
      // Wrapper rotates Blender `+Z` forward -> Three.js `-Z` forward so `root.rotation.y = -w.yaw` matches hero!
      const modelAlign = new THREE.Group();
      modelAlign.rotation.y = Math.PI;
      root.add(modelAlign);

      const fallback = this._createProceduralVehicle(route.vehicleType === "shuttle");
      modelAlign.add(fallback.group);

      // Subtle cyan/amber courtesy yield halo under vehicle when yielding for pelican!
      const yieldRing = new THREE.Mesh(
        new THREE.RingGeometry(2.15, 2.42, 28),
        new THREE.MeshBasicMaterial({
          color: "#38bdf8",
          transparent: true,
          opacity: 0.62,
          side: THREE.DoubleSide,
        })
      );
      yieldRing.rotation.x = -Math.PI * 0.5;
      yieldRing.position.y = 0.03;
      yieldRing.visible = false;
      root.add(yieldRing);

      this.root.add(root);
      this.waymoVisuals.push({
        id: route.id,
        vehicleType: route.vehicleType,
        root,
        modelAlign,
        fallbackGroup: fallback.group,
        lidarDome: fallback.lidarDome,
        wheels: fallback.wheels,
        yieldRing,
        hasGlb: false,
      });
    }

    // 2. 5 Curbside Waymo Gen 6 Pickup Bays + 3 Solar Carport Charging Waymo Gen 6 Slots (ZERO box EVs!)
    this.parkedWaymoSpecs = [];
    const parkedFallbackGroup = new THREE.Group();
    parkedFallbackGroup.name = "Parked_Waymo_Fallback_Group";
    const solarCarportWaymos = [
      { id: "waymo_solar_carport_01", x: -167.8, z: 18.8, yaw: 0.0 },
      { id: "waymo_solar_carport_02", x: -156.2, z: 18.8, yaw: 0.0 },
      { id: "waymo_solar_carport_03", x: -162.0, z: 37.2, yaw: Math.PI },
      { id: "waymo_bayview_waterfront_01", x: 160.2, z: 39.2, yaw: 1.45 },
      { id: "waymo_bayview_waterfront_02", x: 160.8, z: -15.4, yaw: -2.35 },
    ];
    const allParkedList = [...CURBSIDE_WAYMO_BAYS, ...solarCarportWaymos];
    for (let i = 0; i < allParkedList.length; i++) {
      const bay = allParkedList[i];
      const py = getOpenWorldEarthHeight(bay.x, bay.z) + 0.016;
      this.parkedWaymoSpecs.push({
        id: bay.id,
        x: bay.x,
        y: py,
        z: bay.z,
        yaw: bay.yaw,
        phase: i * 1.25,
      });

      const fb = this._createProceduralVehicle(false);
      fb.group.position.set(bay.x, py, bay.z);
      fb.group.rotation.y = Math.PI - bay.yaw;
      parkedFallbackGroup.add(fb.group);
    }
    bakeStaticGroupByMaterial(parkedFallbackGroup);
    parkedFallbackGroup.matrixAutoUpdate = false;
    parkedFallbackGroup.updateMatrix();
    this.parkedWaymosFallbackGroup = parkedFallbackGroup;
    this.root.add(parkedFallbackGroup);

    // 3. Soft Dark Elliptical Contact AO Shadow Decals (`y + 0.021m`, `depthWrite: false`)
    //    planted underneath EVERY moving & parked Waymo Gen 6 and Campus Shuttle (`10` instances, `1` draw call)!
    if (this.materials.vehicleContactShadow) {
      const totalShadowSlots = WAYMO_ROUTES.length + this.parkedWaymoSpecs.length;
      const aoQuad = new THREE.PlaneGeometry(2.65, 5.48);
      aoQuad.rotateX(-Math.PI * 0.5);
      const aoInst = new THREE.InstancedMesh(
        aoQuad,
        this.materials.vehicleContactShadow,
        totalShadowSlots
      );
      aoInst.castShadow = false;
      aoInst.receiveShadow = false;
      aoInst.frustumCulled = false;
      aoInst.renderOrder = 2;

      // Pre-populate all slots (`0..4` updated dynamically per frame; `5..9` parked Waymo bays!)
      for (let i = 0; i < totalShadowSlots; i++) {
        if (i >= WAYMO_ROUTES.length) {
          const pk = this.parkedWaymoSpecs[i - WAYMO_ROUTES.length];
          // `py` is already `+0.016m` asphalt surface -> `pk.y + 0.005 = ground + 0.021m`!
          _pos.set(pk.x, pk.y + 0.005, pk.z);
          _euler.set(0.0, -pk.yaw, 0.0);
          _quat.setFromEuler(_euler);
          _scale.set(1.0, 1.0, 1.0);
        } else {
          const wp0 = WAYMO_ROUTES[i].waypoints[0];
          const gy = getOpenWorldEarthHeight(wp0.x, wp0.z);
          _pos.set(wp0.x, gy + 0.021, wp0.z);
          _quat.identity();
          const isSh = WAYMO_ROUTES[i].vehicleType === "shuttle";
          _scale.set(isSh ? 1.12 : 1.0, 1.0, isSh ? 1.22 : 1.0);
        }
        _mat4.compose(_pos, _quat, _scale);
        aoInst.setMatrixAt(i, _mat4);
      }
      aoInst.instanceMatrix.needsUpdate = true;
      this.vehicleContactShadowInstanced = aoInst;
      this.root.add(aoInst);
    }
  }

  _createProceduralVehicle(isShuttle = false) {
    const group = new THREE.Group();
    const len = isShuttle ? 5.6 : 4.78;
    const wid = isShuttle ? 2.15 : 1.96;
    const h = isShuttle ? 2.35 : 1.62;

    const lowerBody = new THREE.Mesh(
      new THREE.BoxGeometry(wid, h * 0.46, len),
      this.materials.reflectorWhite
    );
    lowerBody.position.y = 0.36 + h * 0.22;
    lowerBody.castShadow = true;

    const bumperSkirt = new THREE.Mesh(
      new THREE.BoxGeometry(wid * 0.98, 0.14, len * 1.01),
      this.materials.gbikeTireRubber
    );
    bumperSkirt.position.y = 0.30;

    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(wid * 0.88, h * 0.44, len * (isShuttle ? 0.88 : 0.68)),
      this.materials.curtainGlass
    );
    cabin.position.y = 0.36 + h * 0.66;
    cabin.castShadow = true;

    const roofCap = new THREE.Mesh(
      new THREE.BoxGeometry(wid * 0.82, 0.08, len * (isShuttle ? 0.84 : 0.60)),
      this.materials.reflectorWhite
    );
    roofCap.position.y = 0.36 + h * 0.89;
    group.add(bumperSkirt, lowerBody, cabin, roofCap);

    if (isShuttle) {
      // 4-Color Google Campus Shuttle Accent Stripe!
      const colors = [
        this.materials.umbrellaBlue,
        this.materials.umbrellaRed,
        this.materials.umbrellaYellow,
        this.materials.umbrellaGreen,
      ];
      for (let c = 0; c < 4; c++) {
        const stripe = new THREE.Mesh(
          new THREE.BoxGeometry(wid + 0.03, 0.14, len * 0.20),
          colors[c]
        );
        stripe.position.set(0, 0.88, -len * 0.32 + c * (len * 0.21));
        group.add(stripe);
      }
    } else {
      // Waymo Gen 6 Ojai signature wrap-around black sensor visor + crimson rear lightbar
      const sensorBar = new THREE.Mesh(
        new THREE.BoxGeometry(wid * 0.84, 0.10, 0.42),
        this.materials.gbikeTireRubber
      );
      sensorBar.position.set(0, 0.36 + h * 0.93, len * 0.24);
      const tailBar = new THREE.Mesh(
        new THREE.BoxGeometry(wid * 0.88, 0.07, 0.06),
        this.materials.umbrellaRed
      );
      tailBar.position.set(0, 0.92, -len * 0.50);
      group.add(sensorBar, tailBar);
    }

    // Bake static chassis shell to 2 draw calls before attaching dynamic LiDAR & axles!
    bakeStaticGroupByMaterial(group);

    const lidarDome = new THREE.Group();
    lidarDome.position.set(0, 0.36 + h * 0.92, isShuttle ? 1.4 : 0.12);
    const puck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.19, 0.21, 0.22, 20),
      this.materials.gbikeTireRubber
    );
    puck.position.y = 0.11;
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.19, 0.06, 20),
      this.materials.reflectorWhite
    );
    cap.position.y = 0.23;
    lidarDome.add(puck, cap);
    bakeStaticGroupByMaterial(lidarDome);
    group.add(lidarDome);

    const wheels = [];
    const wZ = len * 0.32;
    const wX = wid * 0.46;
    const wL = new THREE.CylinderGeometry(0.36, 0.36, 0.24, 20);
    wL.rotateZ(Math.PI * 0.5);
    wL.translate(-wX, 0, 0);
    const wR = new THREE.CylinderGeometry(0.36, 0.36, 0.24, 20);
    wR.rotateZ(Math.PI * 0.5);
    wR.translate(wX, 0, 0);
    const axleGeom = mergeCampusStaticGeometries([wL, wR]);
    for (const sz of [wZ, -wZ]) {
      const wm = new THREE.Mesh(axleGeom, this.materials.gbikeTireRubber);
      wm.position.set(0.0, 0.36, sz);
      group.add(wm);
      wheels.push(wm);
    }

    return { group, lidarDome, wheels };
  }

  // ============================================================================
  // 9. INSTANCED CAMPUS TREES, STREET FURNITURE (`V3`-SWAPPABLE) & PARKED EVs
  // ============================================================================
  _buildInstancedCampusTreesAndProps() {
    // 1. Avenue & Parkland Trees (`110` Deciduous + `65` Coastal Redwoods = ONLY 3 draw calls per quadrant!)
    const trunkGeom = new THREE.CylinderGeometry(0.18, 0.32, 3.8, 10);
    trunkGeom.translate(0, 1.9, 0);

    const decCrownGeoms = [
      createOrganicFoliageGeometry(2.15, 9, 7, 0.2).translate(0, 4.4, 0),
      createOrganicFoliageGeometry(1.55, 8, 6, 1.4).translate(0.9, 5.1, 0.4),
      createOrganicFoliageGeometry(1.45, 8, 6, 2.7).translate(-0.85, 4.9, -0.5),
    ];
    const decCrownMerged = mergeCampusStaticGeometries(decCrownGeoms);

    const redCrownMerged = createSculptedRedwoodCrownGeometry();

    const decTransforms = [];
    const redTransforms = [];

    const tryPlaceTree = (tx, tz, scale, isRedwood = false) => {
      // Keep slow-mo Bay View jump camera sightline (`x in [147, 165], z in [8, 48]`) 100% clear!
      if (tx >= 146.0 && tx <= 166.0 && tz >= 6.0 && tz <= 50.0) return;
      // Keep Shot 7 Stan Courtyard camera-to-Stan sightline (`x in [-124, -88], z in [-52, -22]`) 100% unobstructed!
      if (tx >= -124.0 && tx <= -88.0 && tz >= -52.0 && tz <= -22.0) return;
      // Keep Gradient Canopy Gym, breakout driveway & 16-Pinwheel sunlit lawn (`|x| < 30, z in [86, 155]`) 100% clear!
      if (Math.abs(tx) < 30.0 && tz >= 86.0 && tz <= 155.0) return;
      for (let p = 0; p < KINETIC_PINWHEELS.length; p++) {
        if (Math.hypot(tx - KINETIC_PINWHEELS[p].x, tz - KINETIC_PINWHEELS[p].z) < 7.5) return;
      }
      if (isInBayViewPond(tx, tz) || isInStevensCreekWater(tx, tz) || tz < -218.0) return;
      // Strict clearance outside all carriageways + 3.24m sidewalks + Waymo bays!
      if (signedCarriagewayClearance(tx, tz) < 4.35) return;
      // Keep Stan T-Rex Flamingo Lawn Island & circular courtyard paver ring (`R < 19.6m`) + gateway promenade open!
      if (Math.hypot(tx - -118.0, tz - -50.0) < 19.6) return;
      if (Math.abs(tx - -118.0) < 7.2 && tz >= -74.0 && tz <= -24.0) return;
      // Keep Solar EV Carport interior bays clear
      if (Math.abs(tx - -162.0) < 18.5 && Math.abs(tz - 28.0) < 19.5) return;

      // Avoid MK sidewalk espresso carts
      for (let m = 0; m < this.mkCartPlacements.length; m++) {
        if (Math.hypot(tx - this.mkCartPlacements[m].x, tz - this.mkCartPlacements[m].z) < 4.5) return;
      }

      // Avoid building interiors (including adjusted `cx=-32` for `bldg_north_commons`)
      for (const b of CAMPUS_BUILDING_BLOCKS) {
        const bx = b.id === "bldg_north_commons" ? -32.0 : (b.cx ?? b.x ?? 0.0);
        const bz = b.cz ?? b.z ?? 0.0;
        const hx = b.wx ? b.wx * 0.5 : b.halfX ?? 14.0;
        const hz = b.wz ? b.wz * 0.5 : b.halfZ ?? 12.0;
        if (Math.abs(tx - bx) < hx + 2.8 && Math.abs(tz - bz) < hz + 2.8) return;
      }

      // PRNG-preserving Shoreline Amphitheatre seating bowl & tensile roof clearance (`(12.0, 0.22, -208.0)`):
      // Relocate any tree whose trunk or full crown (`margin >= 6.5m`) overlaps `x in [-20.0, +46.0], z in [-232.0, -183.0]`
      // cleanly behind the terraced seating wall and behind the tensile canopy overhang (relaxing `tz < -218.0` for relocated backdrop trees).
      const shorelineMargin = Math.max(6.5, (isRedwood ? 3.5 : 4.2) * scale);
      if (
        tx >= -20.0 - shorelineMargin &&
        tx <= 46.0 + shorelineMargin &&
        tz >= -232.0 - shorelineMargin &&
        tz <= -183.0
      ) {
        if (tx < 12.0) {
          tx = -26.8;
          tz = -232.4;
        } else if (tx > 46.0) {
          tx = 54.6;
          tz = -230.8;
        } else {
          tx = 45.8;
          tz = -232.8;
        }
      }

      const ty = getOpenWorldEarthHeight(tx, tz);
      const rotY = this.rng() * Math.PI * 2;
      if (isRedwood) {
        redTransforms.push({ x: tx, y: ty, z: tz, s: scale, ry: rotY });
      } else {
        decTransforms.push({ x: tx, y: ty, z: tz, s: scale, ry: rotY });
      }
    };

    // Line active campus avenues & waterfront promenade with lush Coast Live Oaks & Coast Redwoods (`halfW + 5.1m`)
    const treeLinedCorridors = [
      ...ACTIVE_ASPHALT_SEGMENTS.map((s) => ({
        id: s.id,
        x1: s.x1,
        z1: s.z1,
        x2: s.x2,
        z2: s.z2,
        halfW: s.halfW,
      })),
      { id: "bay_view_promenade", x1: 156.0, z1: 90.0, x2: 156.0, z2: -92.0, halfW: 8.0 },
    ];
    for (const r of treeLinedCorridors) {
      const dx = r.x2 - r.x1;
      const dz = r.z2 - r.z1;
      const len = Math.hypot(dx, dz) || 1.0;
      const rx = -(dz / len);
      const rz = dx / len;
      const count = Math.floor(len / 22.0);
      for (let i = 1; i < count; i++) {
        const u = i / count;
        for (const side of [-1, 1]) {
          if (r.id === "bay_view_promenade" && side > 0) continue;
          const lat = side * (r.halfW + 5.1);
          const tx = r.x1 + dx * u + rx * lat;
          const tz = r.z1 + dz * u + rz * lat;
          const isRed = (i + (side > 0 ? 1 : 0)) % 3 === 0;
          tryPlaceTree(tx, tz, 0.85 + this.rng() * 0.35, isRed);
        }
      }
    }

    // Lush Street-End Perimeter Groves of Coast Redwoods & Coast Live Oaks framing West (`x ~ -202..-216`)
    // & East (`x ~ +170..+184` / waterfront shore) ends of Charleston Rd, Amphitheatre Pkwy & North Bayshore!
    const streetEndGroves = [
      // West end of Charleston Rd (`z = 76`, `x = -202..-216`)
      [-202.5, 76.0, 1.18, true], [-206.0, 69.5, 1.08, false], [-206.5, 82.5, 1.14, true],
      [-212.0, 74.0, 1.24, true], [-213.5, 63.5, 1.02, false], [-213.0, 88.0, 1.16, true],
      [-203.0, 61.0, 0.98, false], [-203.5, 91.0, 1.04, false],
      // West end of Amphitheatre Pkwy (`z = -18`, `x = -202..-216`)
      [-202.5, -18.0, 1.20, true], [-206.0, -24.5, 1.06, false], [-206.5, -11.5, 1.15, true],
      [-212.5, -19.5, 1.26, true], [-214.0, -30.0, 1.04, false], [-213.5, -6.5, 1.18, true],
      [-203.0, -33.0, 0.96, false], [-203.5, -3.5, 1.02, false],
      // East end of Charleston Rd & North Pond Headland (`x = 165..184`, `x = 240..248`)
      [165.2, 88.5, 1.12, true], [171.0, 95.0, 1.22, true], [178.0, 96.5, 1.08, false],
      [184.0, 94.0, 1.18, true], [241.0, 76.0, 1.25, true], [243.5, 68.5, 1.10, false],
      [243.0, 83.5, 1.18, true],
      // East end of Amphitheatre Pkwy & South-East Bayshore (`x = 165..184`, `x = 240..248`)
      [165.2, -30.5, 1.06, false], [170.5, -64.5, 1.18, true], [178.0, -66.0, 1.08, false],
      [171.5, -86.0, 1.22, true], [176.5, -79.5, 1.06, false], [177.0, -92.5, 1.16, true],
      [183.5, -85.0, 1.24, true], [241.0, -18.0, 1.24, true], [243.5, -25.0, 1.08, false],
      [243.0, -11.0, 1.16, true],
      // South-West & North-West Stan Courtyard Redwood Spire Cluster (behind Stan's tail) + Low Oak Berm Screen (revealing Santa Cruz Ridgeline on right!)
      [-128.0, -76.5, 1.24, true], [-120.0, -79.5, 1.32, true], [-112.0, -77.0, 1.26, true],
      [-139.0, -72.5, 1.22, true], [-146.5, -78.0, 1.15, false], [-134.5, -85.0, 1.28, true],
      [-124.5, -88.0, 1.22, true], [-103.0, -75.5, 0.82, false], [-94.5, -73.5, 0.80, false],
      [-86.0, -75.0, 0.82, false], [-78.5, -78.0, 0.86, false], [-108.0, -86.5, 0.84, false],
      [-98.5, -88.0, 0.82, false], [-88.0, -90.0, 0.80, false], [-122.0, -102.0, 1.28, true],
      [-136.0, -98.0, 1.16, false], [-150.0, -90.0, 1.26, true], [-158.0, -76.0, 1.18, false],
      [-164.0, -86.0, 1.28, true], [-148.0, -112.0, 1.24, true], [-130.0, -118.0, 1.18, false],
      [-72.0, -96.0, 1.16, true], [-141.0, -34.0, 1.18, true], [-144.0, -26.0, 1.12, false],
      [-15.5, -86.0, 1.18, true], [-21.5, -80.5, 1.04, false], [-21.0, -92.0, 1.12, true],
      // Outer Perimeter Coast Live Oak & Redwood Silhouette Fringe (breaks up distant horizon bands in 04, 05, 06, 08, 09!)
      [212.0, 62.0, 1.24, true], [218.0, 74.0, 1.16, false], [224.0, 86.0, 1.28, true],
      [206.0, 96.0, 1.14, false], [228.0, 102.0, 1.26, true], [216.0, 112.0, 1.18, false],
      [234.0, 52.0, 1.22, true], [236.0, 38.0, 1.15, false], [236.0, 8.0, 1.22, true],
      [-224.0, 98.0, 1.24, true], [-232.0, 84.0, 1.14, false], [-228.0, 48.0, 1.20, true],
      [-152.0, 148.0, 1.22, true], [-136.0, 154.0, 1.16, false], [-118.0, 158.0, 1.26, true],
      [-98.0, 152.0, 1.15, false], [-78.0, 156.0, 1.22, true], [-46.0, 168.0, 1.18, false],
      [48.0, 168.0, 1.22, true], [88.0, 164.0, 1.16, false], [128.0, 158.0, 1.24, true],
      [-156.0, -108.0, 1.22, true], [-142.0, -118.0, 1.14, false], [-92.0, -116.0, 1.20, true],
    ];
    for (const [gx, gz, gs, gRed] of streetEndGroves) {
      tryPlaceTree(gx, gz, gs, gRed);
    }

    // Pond shoreline oaks & parkland groves
    for (let z = -50; z <= 82; z += 18) {
      tryPlaceTree(164.8, z, 1.02, false);
    }
    for (let i = 0; i < 42; i++) {
      const tx = -215 + this.rng() * 430;
      const tz = -205 + this.rng() * 365;
      tryPlaceTree(tx, tz, 0.9 + this.rng() * 0.45, this.rng() > 0.55);
    }

    // Continuous 360° Mid-Distance Perimeter Tree Belt (`R ~ 188-232m`, keeping Shoreline `GEMINI 4 CARBON` & Visitor Forecourt sightlines clear!)
    // Conceals the outer campus lawn-to-foothill transition in stills 04, 05, 06, 08, 09!
    {
      const beltRng = createMulberry32(0x360be17a);
      for (let b = 0; b < 78; b++) {
        const ang = (b / 78) * Math.PI * 2.0 + (beltRng() - 0.5) * 0.05;
        const rad = 190.0 + beltRng() * 40.0;
        const bx = Math.sin(ang) * rad;
        const bz = Math.cos(ang) * rad;
        if (bz > 182.0 || bz < -212.0 || Math.abs(bx) > 234.0) continue;
        // Keep Shoreline Amphitheatre finale monument vista open (`|x| < 38, z < -145`)
        if (Math.abs(bx) < 38.0 && bz < -145.0) continue;
        tryPlaceTree(bx, bz, 1.04 + beltRng() * 0.34, beltRng() > 0.48);
      }
    }

    this.decTreeTransforms = decTransforms;
    this.redTreeTransforms = redTransforms;
    this.proceduralTreesGroup = new THREE.Group();
    this.proceduralTreesGroup.name = "Procedural_Campus_Trees_Fallback";
    this.root.add(this.proceduralTreesGroup);

    // Partition trees into 4 spatial quadrants so camera & shadow frustum cull ~75% of campus trees!
    this.treeQuadrantBatches = [];
    for (let qIdx = 0; qIdx < 4; qIdx++) {
      const wantPosX = (qIdx & 1) !== 0;
      const wantPosZ = (qIdx & 2) !== 0;
      const qDec = decTransforms.filter((t) => (t.x >= 0) === wantPosX && (t.z >= 0) === wantPosZ);
      const qRed = redTransforms.filter((t) => (t.x >= 0) === wantPosX && (t.z >= 0) === wantPosZ);
      const qTotal = qDec.length + qRed.length;
      const shadowCasters = [];

      if (qTotal > 0) {
        const trunksInst = new THREE.InstancedMesh(
          trunkGeom,
          this.materials.redwoodBark,
          qTotal
        );
        trunksInst.castShadow = false;
        let tIdx = 0;
        for (const tr of qDec) {
          _dummy.position.set(tr.x, tr.y, tr.z);
          _dummy.rotation.set(0, tr.ry, 0);
          _dummy.scale.set(tr.s, tr.s, tr.s);
          _dummy.updateMatrix();
          trunksInst.setMatrixAt(tIdx++, _dummy.matrix);
        }
        for (const tr of qRed) {
          _dummy.position.set(tr.x, tr.y, tr.z);
          _dummy.rotation.set(0, tr.ry, 0);
          _dummy.scale.set(tr.s * 1.15, tr.s * 1.55, tr.s * 1.15);
          _dummy.updateMatrix();
          trunksInst.setMatrixAt(tIdx++, _dummy.matrix);
        }
        trunksInst.instanceMatrix.needsUpdate = true;
        trunksInst.computeBoundingSphere();
        this.proceduralTreesGroup.add(trunksInst);
      }

      if (qDec.length > 0) {
        const decInst = new THREE.InstancedMesh(
          decCrownMerged,
          this.materials.foliageDeep,
          qDec.length
        );
        decInst.castShadow = true;
        for (let i = 0; i < qDec.length; i++) {
          const tr = qDec[i];
          _dummy.position.set(tr.x, tr.y, tr.z);
          _dummy.rotation.set(0, tr.ry, 0);
          _dummy.scale.setScalar(tr.s);
          _dummy.updateMatrix();
          decInst.setMatrixAt(i, _dummy.matrix);
        }
        decInst.instanceMatrix.needsUpdate = true;
        decInst.computeBoundingSphere();
        this.proceduralTreesGroup.add(decInst);
        shadowCasters.push(decInst);
      }

      if (qRed.length > 0) {
        const redInst = new THREE.InstancedMesh(
          redCrownMerged,
          this.materials.foliageRedwood,
          qRed.length
        );
        redInst.castShadow = true;
        for (let i = 0; i < qRed.length; i++) {
          const tr = qRed[i];
          _dummy.position.set(tr.x, tr.y, tr.z);
          _dummy.rotation.set(0, tr.ry, 0);
          _dummy.scale.setScalar(tr.s);
          _dummy.updateMatrix();
          redInst.setMatrixAt(i, _dummy.matrix);
        }
        redInst.instanceMatrix.needsUpdate = true;
        redInst.computeBoundingSphere();
        this.proceduralTreesGroup.add(redInst);
        shadowCasters.push(redInst);
      }

      this.treeQuadrantBatches.push({
        wantPosX,
        wantPosZ,
        shadowCasters,
      });
    }

    // 3. Curated Streetscape Furniture Placements (`Campus_Environment_V3` Ready + Procedural Fallbacks!)
    this.proceduralStreetFurnitureGroup = new THREE.Group();
    this.proceduralStreetFurnitureGroup.name = "Procedural_Street_Furniture";
    this.root.add(this.proceduralStreetFurnitureGroup);

    this.signalPlacements = [];
    this.lampPlacements = [];
    this.benchPlacements = [];
    this.planterPlacements = [];
    this.bikeRackPlacements = [];
    this.triBinPlacements = [];

    const propAoGeoms = [];
    const addPropAoPad = (x, y, z, w, d, rotY = 0.0) => {
      const g = new THREE.PlaneGeometry(w, d);
      g.rotateX(-Math.PI * 0.5);
      g.rotateY(rotY);
      g.translate(x, y + 0.004, z);
      propAoGeoms.push(g);
    };

    // A. Signalized Intersection Mast Arms (on outer rounded concrete sidewalk corners, facing carriageway — ZERO signal masts in `z > 105` Visitor Forecourt!)
    const signalIntersections = [
      { ix: 0.0, iz: 76.0, corners: [[-1, -1], [1, 1]] },
      { ix: -118.0, iz: 76.0, corners: [[-1, -1], [1, -1]] },
      { ix: 0.0, iz: -18.0, corners: [[-1, -1], [1, 1]] },
      { ix: -118.0, iz: -18.0, corners: [[-1, 1], [1, 1]] },
      { ix: 0.0, iz: -86.0, corners: [[1, 1]] },
    ];
    for (const si of signalIntersections) {
      for (const [sx, sz] of si.corners) {
        const cf = INTERSECTION_CORNER_FILLETS.find(
          (c) => Math.abs(c.ix - si.ix) < 0.5 && Math.abs(c.iz - si.iz) < 0.5 && c.sx === sx && c.sz === sz
        );
        if (!cf) continue;
        // Place mast base on concrete sidewalk corner (`r = 1.35m` from `(cx, cz)`, well inside `3.06m` curb!)
        const px = cf.cx - sx * 0.95;
        const pz = cf.cz - sz * 0.95;
        const py = getOpenWorldEarthHeight(px, pz) + 0.094;
        // Orient mast so cantilevered arm reaches out over horizontal road (`-sx` direction)
        const rotY = sx > 0 ? -Math.PI * 0.5 : Math.PI * 0.5;
        this.signalPlacements.push({ x: px, y: py, z: pz, rotY, sx, sz });
        addPropAoPad(px, py, pz, 1.1, 1.1, rotY);
      }
    }

    // B. Modern Architectural Campus Streetlamps along Avenues & Waterfront Promenade
    for (const r of ACTIVE_ASPHALT_SEGMENTS) {
      const dx = r.x2 - r.x1;
      const dz = r.z2 - r.z1;
      const len = Math.hypot(dx, dz) || 1.0;
      const fx = dx / len;
      const fz = dz / len;
      const rx = -fz;
      const rz = fx;
      const step = 30.0;
      const count = Math.floor(len / step);
      for (let i = 1; i < count; i++) {
        const s = (i + 0.5) * (len / count);
        for (const side of [-1, 1]) {
          // Place on outer sidewalk edge (`halfW + 3.12m`, grounded on `+0.094m` concrete border)
          const lx = r.x1 + fx * s + rx * (side * (r.halfW + 3.12));
          const lz = r.z1 + fz * s + rz * (side * (r.halfW + 3.12));
          if (signedCarriagewayClearance(lx, lz) < 2.8) continue;
          if (Math.abs(lx) < 28.5 && lz > 118.0 && lz < 160.5) continue;
          if (lx < -143.0 && lz > 84.0) continue;
          let nearCorner = false;
          for (const it of CAMPUS_INTERSECTIONS) {
            if (Math.hypot(lx - it.x, lz - it.z) < 14.5) {
              nearCorner = true;
              break;
            }
          }
          if (nearCorner) continue;
          const ly = getOpenWorldEarthHeight(lx, lz) + 0.094;
          // Face luminaire arm inward toward road centerline (`(-rx * side, -rz * side)`)
          const rotY = Math.atan2(-rx * side, -rz * side);
          this.lampPlacements.push({ x: lx, y: ly, z: lz, rotY });
        }
      }
    }
    // Promenade lamps along west side of Bay View Waterfront
    for (const lz of [96.0, 56.0, 12.0, -42.0, -68.0]) {
      const lx = 147.6;
      const ly = getOpenWorldEarthHeight(lx, lz) + 0.018;
      this.lampPlacements.push({ x: lx, y: ly, z: lz, rotY: Math.PI * 0.5 });
    }

    // C. Benches, Architectural Planters, Hoop Bike Racks & Google 3-Stream Tri-Bins!
    //    (Gradient Canopy Hex-Paver Forecourt `|x| <= 27.2, z in [114.3, 159.5]` kept 100% free of loose clutter!)
    const streetClusters = [
      // Charleston Rd Sidewalks (`z = 76 ± 9.65m`, `yOff = 0.094m`)
      { x: -58.0, z: 66.35, yOff: 0.094, rotY: 0.0, kind: "bench" },
      { x: -54.5, z: 66.35, yOff: 0.094, rotY: 0.0, kind: "planter" },
      { x: -61.2, z: 66.35, yOff: 0.094, rotY: 0.0, kind: "tribins" },
      { x: 64.0, z: 66.35, yOff: 0.094, rotY: 0.0, kind: "bench" },
      { x: 68.0, z: 66.35, yOff: 0.094, rotY: 0.0, kind: "bikerack" },
      { x: 60.5, z: 66.35, yOff: 0.094, rotY: 0.0, kind: "planter" },
      { x: -86.5, z: 85.65, yOff: 0.094, rotY: Math.PI, kind: "bench" },
      { x: -90.0, z: 85.65, yOff: 0.094, rotY: Math.PI, kind: "planter" },
      { x: 42.0, z: 85.65, yOff: 0.094, rotY: Math.PI, kind: "bikerack" },
      { x: 45.2, z: 85.65, yOff: 0.094, rotY: Math.PI, kind: "tribins" },
      // Android Sculpture Plaza Perimeter (`z >= 88.5`, `yOff = 0.016m` — clear of cafe sets & Shot 5 camera track!)
      { x: -103.6, z: 92.5, yOff: 0.016, rotY: -Math.PI * 0.35, kind: "bench" },
      { x: -124.2, z: 88.6, yOff: 0.016, rotY: 0.0, kind: "planter" },
      { x: -104.2, z: 88.6, yOff: 0.016, rotY: 0.0, kind: "planter" },
      { x: -126.4, z: 106.4, yOff: 0.016, rotY: Math.PI * 0.5, kind: "tribins" },
      { x: -103.6, z: 99.5, yOff: 0.016, rotY: -Math.PI * 0.5, kind: "bikerack" },
      // Googleplex Stan Courtyard Outer Ring (`0` benches within `26.0m` of Stan plinth `(-118.0, -50.0)`) & Amphitheatre Pkwy
      { x: -101.2, z: -53.4, yOff: 0.016, rotY: 0.0, kind: "planter" },
      { x: -123.5, z: -33.6, yOff: 0.016, rotY: 0.0, kind: "bikerack" },
      { x: -114.6, z: -66.8, yOff: 0.016, rotY: 0.0, kind: "tribins" },
      { x: -46.0, z: -8.35, yOff: 0.094, rotY: Math.PI, kind: "bench" },
      { x: -42.5, z: -8.35, yOff: 0.094, rotY: Math.PI, kind: "planter" },
      { x: 58.0, z: -27.65, yOff: 0.094, rotY: 0.0, kind: "bench" },
      { x: 61.5, z: -27.65, yOff: 0.094, rotY: 0.0, kind: "bikerack" },
      { x: 54.8, z: -27.65, yOff: 0.094, rotY: 0.0, kind: "tribins" },
      // Bay View Waterfront Promenade & Shoreline Concourse (clear of `Gemini4_Carbon_Monument_V4` & zero duplicate bin at `(149.2, 58.0)`!)
      { x: 162.4, z: 46.0, yOff: 0.016, rotY: -Math.PI * 0.5, kind: "bench" },
      { x: 162.4, z: -4.0, yOff: 0.016, rotY: -Math.PI * 0.5, kind: "bench" },
      { x: 149.2, z: 66.8, yOff: 0.016, rotY: Math.PI * 0.5, kind: "bikerack" },
      { x: 149.2, z: 22.5, yOff: 0.016, rotY: Math.PI * 0.5, kind: "planter" },
      { x: 24.5, z: -182.0, yOff: 0.016, rotY: -Math.PI * 0.65, kind: "bench" },
      { x: 26.5, z: -173.5, yOff: 0.016, rotY: -Math.PI * 0.75, kind: "bench" },
      { x: 22.0, z: -176.0, yOff: 0.016, rotY: 0.0, kind: "planter" },
      { x: 28.0, z: -178.5, yOff: 0.016, rotY: -0.28, kind: "bikerack" },
    ];

    // Place flanking Planters (`3.30m` on A-frame chalkboard side & `-2.75m` on counter end) + outer Tri-Bin (`+5.20m`) on each Snack Cart hardscape apron!
    const rawTriBins = [];
    for (let i = 0; i < this.mkCartPlacements.length; i++) {
      const mk = this.mkCartPlacements[i];
      const fwdX = Math.sin(mk.rotY);
      const fwdZ = Math.cos(mk.rotY);
      const chalkSign = (mk.sideSign ?? 1) >= 0 ? 1.0 : -1.0;
      const offPos = chalkSign > 0 ? 3.30 : 2.75;
      const offNeg = chalkSign > 0 ? 2.75 : 3.30;
      this.planterPlacements.push({
        x: mk.x - fwdX * offNeg,
        y: mk.y,
        z: mk.z - fwdZ * offNeg,
        rotY: mk.rotY,
      });
      this.planterPlacements.push({
        x: mk.x + fwdX * offPos,
        y: mk.y,
        z: mk.z + fwdZ * offPos,
        rotY: mk.rotY,
      });
      rawTriBins.push({
        x: mk.x + fwdX * 5.20,
        y: mk.y,
        z: mk.z + fwdZ * 5.20,
        rotY: mk.rotY + Math.PI * 0.5,
        aoRotY: mk.rotY,
        aoW: 1.15,
        aoD: 0.72,
      });
    }

    for (const sc of streetClusters) {
      if (sc.yOff < 0.05 && signedAsphaltClearance(sc.x, sc.z) < 0.5) continue;
      const py = getOpenWorldEarthHeight(sc.x, sc.z) + sc.yOff;
      const item = { x: sc.x, y: py, z: sc.z, rotY: sc.rotY };
      if (sc.kind === "bench") {
        if (Math.hypot(sc.x - -118.0, sc.z - -50.0) < 26.0) continue;
        this.benchPlacements.push(item);
      } else if (sc.kind === "planter") {
        this.planterPlacements.push(item);
      } else if (sc.kind === "bikerack") {
        this.bikeRackPlacements.push(item);
      } else if (sc.kind === "tribins") {
        rawTriBins.push({
          ...item,
          aoRotY: sc.rotY,
          aoW: 1.2,
          aoD: 0.75,
        });
      }
    }

    // Global `>= 18.0m` separation filter across ALL `triBinPlacements` (`mk_tribins` + `streetClusters`)!
    for (let i = 0; i < rawTriBins.length; i++) {
      const cand = rawTriBins[i];
      let tooClose = false;
      for (let j = 0; j < this.triBinPlacements.length; j++) {
        const prev = this.triBinPlacements[j];
        if (Math.hypot(cand.x - prev.x, cand.z - prev.z) < 18.0) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) {
        this.triBinPlacements.push({
          x: cand.x,
          y: cand.y,
          z: cand.z,
          rotY: cand.rotY,
          _aoRotY: cand.aoRotY,
          _aoW: cand.aoW,
          _aoD: cand.aoD,
        });
      }
    }

    // Also deduplicate `planterPlacements` (`>= 2.05m`) BEFORE generating AO shadow pads so V6 batching & AO pads match 1:1!
    const dedupedPlanters = [];
    for (let i = 0; i < this.planterPlacements.length; i++) {
      const p = this.planterPlacements[i];
      if (dedupedPlanters.every((q) => Math.hypot(q.x - p.x, q.z - p.z) >= 2.05)) {
        dedupedPlanters.push(p);
      }
    }
    this.planterPlacements = dedupedPlanters;

    // Emit `propAoGeoms` (`addPropAoPad`) strictly AFTER all deduplication, wall-clearance, and removal filters
    // so ZERO orphan dark AO shadow rectangles ever remain on empty pavement!
    for (const lp of this.lampPlacements) {
      addPropAoPad(lp.x, lp.y, lp.z, 0.85, 0.85, lp.rotY);
    }
    for (const bp of this.benchPlacements) {
      addPropAoPad(bp.x, bp.y, bp.z, 2.1, 0.9, bp.rotY);
    }
    for (const pp of this.planterPlacements) {
      addPropAoPad(pp.x, pp.y, pp.z, 1.30, 1.30, pp.rotY);
    }
    for (const rp of this.bikeRackPlacements) {
      addPropAoPad(rp.x, rp.y, rp.z, 1.8, 1.0, rp.rotY);
    }
    for (const tp of this.triBinPlacements) {
      addPropAoPad(tp.x, tp.y, tp.z, tp._aoW ?? 1.2, tp._aoD ?? 0.75, tp._aoRotY ?? tp.rotY);
    }

    // Permanent Contact AO Shadow Pads underneath all streetscape furniture (`1` draw call)
    if (propAoGeoms.length > 0 && this.materials.buildingContactShadow) {
      const mAo = mergeCampusStaticGeometries(propAoGeoms);
      if (mAo) {
        mAo.computeBoundingSphere();
        const aoM = new THREE.Mesh(mAo, this.materials.buildingContactShadow);
        aoM.renderOrder = 2;
        aoM.matrixAutoUpdate = false;
        aoM.updateMatrix();
        this.root.add(aoM);
      }
    }

    // Build Clean Enhanced Procedural Fallbacks inside `this.proceduralStreetFurnitureGroup`
    // (automatically hidden when `applyCampusEnvironmentV3Glb(envV3Scene)` attaches V3 GLBs!)
    const fbSteelGeoms = [];
    const fbTimberGeoms = [];
    const fbGraniteGeoms = [];
    const fbFoliageGeoms = [];
    const fbGlowGeoms = [];
    const fbBlueGeoms = [];
    const fbGreenGeoms = [];
    const fbDarkGeoms = [];

    for (const s of this.signalPlacements) {
      const gMast = new THREE.CylinderGeometry(0.11, 0.16, 5.8, 12);
      gMast.translate(0, 2.9, 0);
      const gArm = new THREE.CylinderGeometry(0.065, 0.095, 4.4, 10);
      gArm.rotateX(Math.PI * 0.5);
      gArm.translate(0, 5.55, 2.15);
      const gHead = new THREE.BoxGeometry(0.26, 0.92, 0.30);
      gHead.translate(0, 5.18, 3.85);
      for (const g of [gMast, gArm]) {
        g.rotateY(s.rotY);
        g.translate(s.x, s.y, s.z);
        fbSteelGeoms.push(g);
      }
      gHead.rotateY(s.rotY);
      gHead.translate(s.x, s.y, s.z);
      fbDarkGeoms.push(gHead);

      for (const lx of [-0.13, 0.13]) {
        const gLens = new THREE.SphereGeometry(0.085, 8, 8);
        gLens.translate(lx, 4.92, 3.85);
        gLens.rotateY(s.rotY);
        gLens.translate(s.x, s.y, s.z);
        fbGlowGeoms.push(gLens);
      }
    }

    for (const lp of this.lampPlacements) {
      const pole = new THREE.CylinderGeometry(0.065, 0.105, 4.8, 10);
      pole.translate(0, 2.4, 0);
      const arm = new THREE.BoxGeometry(0.09, 0.07, 1.05);
      arm.translate(0, 4.76, 0.46);
      for (const g of [pole, arm]) {
        g.rotateY(lp.rotY);
        g.translate(lp.x, lp.y, lp.z);
        fbSteelGeoms.push(g);
      }
      const led = new THREE.BoxGeometry(0.22, 0.04, 0.46);
      led.translate(0, 4.72, 0.78);
      led.rotateY(lp.rotY);
      led.translate(lp.x, lp.y, lp.z);
      fbGlowGeoms.push(led);
    }

    for (const bn of this.benchPlacements) {
      const seat = new THREE.BoxGeometry(1.76, 0.08, 0.52);
      seat.translate(0, 0.46, 0);
      const back = new THREE.BoxGeometry(1.76, 0.36, 0.07);
      back.rotateX(-0.16);
      back.translate(0, 0.72, -0.22);
      for (const g of [seat, back]) {
        g.rotateY(bn.rotY);
        g.translate(bn.x, bn.y, bn.z);
        fbTimberGeoms.push(g);
      }
      for (const lx of [-0.72, 0.72]) {
        const leg = new THREE.BoxGeometry(0.08, 0.44, 0.48);
        leg.translate(lx, 0.22, 0);
        leg.rotateY(bn.rotY);
        leg.translate(bn.x, bn.y, bn.z);
        fbSteelGeoms.push(leg);
      }
    }

    for (const pl of this.planterPlacements) {
      const tub = new THREE.BoxGeometry(1.06, 0.58, 1.06);
      tub.translate(0, 0.29, 0);
      tub.rotateY(pl.rotY);
      tub.translate(pl.x, pl.y, pl.z);
      fbGraniteGeoms.push(tub);
    }

    for (const br of this.bikeRackPlacements) {
      const rail = new THREE.BoxGeometry(1.48, 0.04, 0.22);
      rail.translate(0, 0.02, 0);
      rail.rotateY(br.rotY);
      rail.translate(br.x, br.y, br.z);
      fbSteelGeoms.push(rail);
      for (const hx of [-0.52, 0.0, 0.52]) {
        const hoop = new THREE.TorusGeometry(0.36, 0.032, 8, 16, Math.PI);
        hoop.rotateY(Math.PI * 0.5);
        hoop.translate(hx, 0.44, 0);
        hoop.rotateY(br.rotY);
        hoop.translate(br.x, br.y, br.z);
        fbSteelGeoms.push(hoop);
      }
    }

    for (const tb of this.triBinPlacements) {
      const body = new THREE.BoxGeometry(0.96, 0.78, 0.46);
      body.translate(0, 0.39, 0);
      body.rotateY(tb.rotY);
      body.translate(tb.x, tb.y, tb.z);
      fbSteelGeoms.push(body);
      const lids = [
        [-0.31, fbBlueGeoms],
        [0.0, fbGreenGeoms],
        [0.31, fbDarkGeoms],
      ];
      for (const [lx, arr] of lids) {
        const lid = new THREE.BoxGeometry(0.28, 0.08, 0.44);
        lid.translate(lx, 0.82, 0);
        lid.rotateY(tb.rotY);
        lid.translate(tb.x, tb.y, tb.z);
        arr.push(lid);
      }
    }

    const addFurnitureBatch = (geoms, mat, cast = true) => {
      const m = mergeCampusStaticGeometries(geoms);
      if (!m) return;
      m.computeBoundingSphere();
      const mesh = new THREE.Mesh(m, mat);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.proceduralStreetFurnitureGroup.add(mesh);
    };

    addFurnitureBatch(fbSteelGeoms, this.materials.steelMullion, true);
    addFurnitureBatch(fbTimberGeoms, this.materials.cedarTimber, true);
    addFurnitureBatch(fbGraniteGeoms, this.materials.graniteCurb || this.materials.concreteCurb, true);
    addFurnitureBatch(fbFoliageGeoms, this.materials.foliageDeep, true);
    addFurnitureBatch(fbGlowGeoms, this.materials.clerestoryGlow, false);
    addFurnitureBatch(fbBlueGeoms, this.materials.umbrellaBlue, false);
    addFurnitureBatch(fbGreenGeoms, this.materials.umbrellaGreen, false);
    addFurnitureBatch(fbDarkGeoms, this.materials.gbikeTireRubber, true);
  }

  // ============================================================================
  // 10. ATTACH VERIFIED BLENDER 5.2 V2 GLB SUITES (`stan` + 4 V2 CAMPUS SUITES)
  // ============================================================================
  attachLandmarkAndGamePropGlbs({
    stanScene,
    vehiclesV2Scene,
    collectiblesV2Scene,
    androidStatuesV2Scene,
    landmarksV2Scene,
    waymoGen6Scene,
    waymoGen6V3Scene,
    envV3Scene,
    campusEnvironmentV3Scene,
    bugdroidScene,
    campusPropsScene,
  } = {}) {
    const clampV2EnvIntensity = (rootObj) => {
      if (!rootObj) return;
      rootObj.traverse((ch) => {
        if (!ch.isMesh) return;
        ch.castShadow = true;
        ch.receiveShadow = true;
        const mats = Array.isArray(ch.material) ? ch.material : [ch.material];
        for (const m of mats) {
          if (m && (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial)) {
            const name = m.name || "";
            if (
              name.includes("Pinwheel") ||
              name.includes("Android_Glossy") ||
              name.includes("Waymo") ||
              (m.metalness ?? 0.0) > 0.12 ||
              (m.roughness ?? 1.0) < 0.35
            ) {
              m.envMapIntensity = Math.min(m.envMapIntensity ?? 1.0, 0.55);
            } else {
              m.envMapIntensity = Math.min(m.envMapIntensity ?? 1.0, 0.68);
            }
          }
        }
      });
    };

    const findInScene = (sceneRoot, names) => {
      if (!sceneRoot) return null;
      const list = Array.isArray(names) ? names : [names];
      for (const nm of list) {
        const exact = sceneRoot.getObjectByName(nm);
        if (exact) return exact;
      }
      for (const nm of list) {
        let hit = null;
        sceneRoot.traverse((n) => {
          if (!hit && n.name && n.name.startsWith(nm)) hit = n;
        });
        if (hit) return hit;
      }
      return null;
    };

    // `MINOR-02` Multi-Asset Showcase Origin Reset: `campus_landmarks_v2.glb`, `android_statues_v2.glb`,
    // and `campus_collectibles_v2.glb` space showcase roots apart along X/Z for 4-view Blender ortho inspection
    // (explaining the 130.60m overall showcase span in `campus_landmarks_v2_glb_audit.json`, with 0 studio floor planes).
    // `cloneShowcaseRootAtOrigin` resets each extracted root's local transform to `(0, 0, 0)` before world placement!
    const cloneShowcaseRootAtOrigin = (srcNode) => {
      const clone = srcNode.clone(true);
      clone.position.set(0, 0, 0);
      clone.rotation.set(0, 0, 0);
      clone.scale.set(1, 1, 1);
      clone.traverse((ch) => {
        if (ch.isMesh && ch.material) {
          ch.material = Array.isArray(ch.material)
            ? ch.material.map((m) => (m ? m.clone() : m))
            : ch.material.clone();
        }
      });
      clampV2EnvIntensity(clone);
      return clone;
    };

    // --------------------------------------------------------------------------
    // 1. Bronze Stan T-Rex GLB (`(-118, -50)`, seated on `0.48m` plinth inside `stanHolder`)
    // --------------------------------------------------------------------------
    if (stanScene && this.stanHolder) {
      const clone = stanScene.clone(true);
      clone.scale.setScalar(1.32);
      groundObjectToY(clone, 0.48, 0.004);
      clampV2EnvIntensity(clone);
      bakeStaticGroupByMaterial(clone);
      if (this.stanHolder.userData.fallback) {
        this.stanHolder.userData.fallback.visible = false;
      }
      this.stanHolder.add(clone);
    }

    // --------------------------------------------------------------------------
    // 2. `campus_landmarks_v2.glb`: Gradient Canopy, Bay View, Shoreline & Bridge
    // --------------------------------------------------------------------------
    if (landmarksV2Scene) {
      // A. Keep sculpted silver-white dragonscale `this.gradientCanopyFallback` (`silverDragonscaleMat` + pale precast concrete + warm honey cedar soffit)
      //    instead of overriding with dark-brown corrugated `Gradient_Canopy_Roof_V2` blockout!
      if (this.gradientCanopyFallback) {
        this.gradientCanopyFallback.visible = true;
      }

      // B. Keep sculpted double-curved catenary `this.bayViewFallback` (`silverDragonscaleMat` shingles + `curtainGlass` + `clerestoryGlow`)
      //    instead of overriding with coarse boxy `BayView_Dragonscale_Canopy_V2` blockout!
      if (this.bayViewFallback) {
        this.bayViewFallback.visible = true;
      }

      const remapMaterialTexturePixels = (meshRoot, pixelMutatorFn) => {
        const remappedTexByUuid = new Map();
        meshRoot.traverse((ch) => {
          if (!ch.isMesh || !ch.material) return;
          const mats = Array.isArray(ch.material) ? ch.material : [ch.material];
          for (const m of mats) {
            if (!m || !m.map || !m.map.image) continue;
            let nextTex = remappedTexByUuid.get(m.map.uuid);
            if (!nextTex) {
              const img = m.map.image;
              const w = img.width || img.videoWidth || 0;
              const h = img.height || img.videoHeight || 0;
              if (w > 0 && h > 0 && typeof document !== "undefined") {
                const cvs = document.createElement("canvas");
                cvs.width = w;
                cvs.height = h;
                const ctx = cvs.getContext("2d");
                ctx.drawImage(img, 0, 0, w, h);
                const imgData = ctx.getImageData(0, 0, w, h);
                const d = imgData.data;
                let changed = false;
                for (let p = 0; p < d.length; p += 4) {
                  if (pixelMutatorFn(d, p)) changed = true;
                }
                if (changed) {
                  ctx.putImageData(imgData, 0, 0);
                  nextTex = new THREE.CanvasTexture(cvs);
                  nextTex.colorSpace = m.map.colorSpace || THREE.SRGBColorSpace;
                  nextTex.flipY = m.map.flipY;
                  nextTex.wrapS = m.map.wrapS;
                  nextTex.wrapT = m.map.wrapT;
                  nextTex.needsUpdate = true;
                }
              }
              remappedTexByUuid.set(m.map.uuid, nextTex || m.map);
            }
            if (nextTex && nextTex !== m.map) {
              m.map = nextTex;
              m.needsUpdate = true;
            }
          }
        });
      };

      // C. `Shoreline_Tensile_Bowl_V2` (`(12, 0.22, -208)`) + Dimensional `Shoreline_Monument_Sign_V2`
      //    with warm amber dusk interior fabric glow, architectural slate acoustic backwall (`RGB ~ 34,38,48`), & warm front bounce!
      const bowlSrc = findInScene(landmarksV2Scene, [
        "Shoreline_Tensile_Bowl_V2",
        "Shoreline_Amphitheatre_V2",
      ]);
      if (bowlSrc) {
        const bowlClone = cloneShowcaseRootAtOrigin(bowlSrc);
        remapMaterialTexturePixels(bowlClone, (d, p) => {
          if (d[p] < 42 && d[p + 1] < 42 && d[p + 2] < 48) {
            d[p] = 52;
            d[p + 1] = 56;
            d[p + 2] = 70;
            return true;
          }
          return false;
        });
        bowlClone.traverse((ch) => {
          if (!ch.isMesh || !ch.material) return;
          const mats = Array.isArray(ch.material) ? ch.material : [ch.material];
          for (const m of mats) {
            if (m && (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial)) {
              m.emissiveMap = null;
              m.emissive = new THREE.Color("#ffd099");
              m.emissiveIntensity = 0.05;
              m.needsUpdate = true;
            }
          }
        });
        bowlClone.scale.setScalar(1.12);
        bowlClone.position.set(12.0, 0.22, -208.0);
        bowlClone.updateMatrixWorld(true);
        // Depress any flat base-plaza vertices of `Shoreline_Tensile_Bowl_V2` that extend forward into the
        // terrain-conforming Shoreline Concourse (`wz > -192.0`) or circular Docking Medallion (`r < 9.5m` of `(14, -178)`)
        // strictly below `getOpenWorldTerrainHeight(wx, wz) - 0.08m` so zero amphitheatre base polygons ever poke through!
        bowlClone.traverse((ch) => {
          if (!ch.isMesh || !ch.geometry || !ch.geometry.attributes?.position) return;
          const g = ch.geometry.clone();
          const posAttr = g.attributes.position;
          const mw = ch.matrixWorld;
          const invMw = new THREE.Matrix4().copy(mw).invert();
          const v = new THREE.Vector3();
          let touched = false;
          for (let i = 0; i < posAttr.count; i++) {
            v.fromBufferAttribute(posAttr, i).applyMatrix4(mw);
            const inConcourse =
              v.z > -192.0 ||
              (Math.hypot(v.x - 14.0, v.z - -188.0) < 24.4 && v.z > -200.5) ||
              Math.hypot(v.x - 14.0, v.z - -178.0) < 9.5;
            if (inConcourse && v.y < 0.72) {
              const maxAllowedY = getOpenWorldEarthHeight(v.x, v.z) + 0.016 - 0.08;
              if (v.y > maxAllowedY) {
                v.y = maxAllowedY;
                v.applyMatrix4(invMw);
                posAttr.setXYZ(i, v.x, v.y, v.z);
                touched = true;
              }
            }
          }
          if (touched) {
            posAttr.needsUpdate = true;
            g.computeBoundingBox();
            g.computeBoundingSphere();
            ch.geometry = g;
          }
        });
        bowlClone.matrixAutoUpdate = false;
        bowlClone.updateMatrix();
        if (this.shorelineFallback) this.shorelineFallback.visible = false;
        this.shorelineV2Group = bowlClone;
        this.root.add(bowlClone);
      }

      const signSrc = findInScene(landmarksV2Scene, ["Shoreline_Monument_Sign_V2"]);
      if (signSrc) {
        // `SHORELINE` reads left-to-right when viewed from `+Z` looking `-Z`; placed on the open
        // West esplanade flank of `(14, -178)` with warm golden dusk front bounce so zero letters crush to black!
        const signClone = cloneShowcaseRootAtOrigin(signSrc);
        signClone.traverse((ch) => {
          if (!ch.isMesh || !ch.material) return;
          const mats = Array.isArray(ch.material) ? ch.material : [ch.material];
          for (const m of mats) {
            if (m && (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial)) {
              m.emissive = new THREE.Color("#ffd29d");
              m.emissiveIntensity = Math.max(m.emissiveIntensity || 0.0, 0.24);
            }
          }
        });
        const signX = 3.6;
        const signZ = -179.8;
        const signY = getOpenWorldTerrainHeight(signX, signZ);
        signClone.scale.setScalar(0.76);
        signClone.rotation.y = 0.28;
        signClone.position.set(signX, signY, signZ);
        signClone.matrixAutoUpdate = false;
        signClone.updateMatrix();
        this.shorelineMonumentGroup = signClone;
        this.root.add(signClone);
      }

      // D. `Stevens_Creek_Bridge_Arch_V2` (`(52,-86) -> (18,-158)`, midpoint `(35.0, -0.328, -122.0)`, `0.000mm` deck alignment!)
      const bridgeSrc = findInScene(landmarksV2Scene, ["Stevens_Creek_Bridge_Arch_V2"]);
      if (bridgeSrc) {
        const brClone = cloneShowcaseRootAtOrigin(bridgeSrc);
        brClone.rotation.y = Math.atan2(34.0, 72.0);
        brClone.position.set(35.0, -0.328, -122.0);
        brClone.matrixAutoUpdate = false;
        brClone.updateMatrix();
        if (this.stevensBridgeGroup) this.stevensBridgeGroup.visible = false;
        this.stevensBridgeV2Group = brClone;
        this.root.add(brClone);
      }
    }

    // --------------------------------------------------------------------------
    // 3. `android_statues_v2.glb`: Articulated `Bugdroid_V2` + All 6 Dessert Statues!
    // --------------------------------------------------------------------------
    if (androidStatuesV2Scene) {
      const bugV2Src = findInScene(androidStatuesV2Scene, ["Bugdroid_V2"]);
      if (bugV2Src && this.bugdroidHolder) {
        const bugClone = cloneShowcaseRootAtOrigin(bugV2Src);
        bugClone.scale.setScalar(1.22);
        let headNode = null;
        let armRNode = null;
        bugClone.traverse((ch) => {
          if (ch.name === "Bugdroid_Head_V2") headNode = ch;
          else if (ch.name === "Bugdroid_Arm_R_V2") armRNode = ch;
        });

        if (headNode) {
          headNode.userData.baseRot = headNode.rotation.clone();
          this.bugdroidHeadPivot = headNode;
        }
        if (armRNode) {
          armRNode.userData.baseRot = armRNode.rotation.clone();
          this.bugdroidArmRPivot = armRNode;
        }

        if (this.bugdroidHolder.userData.fallback) {
          this.bugdroidHolder.userData.fallback.visible = false;
        }
        (this.bugdroidBodyPivot || this.bugdroidHolder).add(bugClone);
      }

      // All 6 Sculpted Android Dessert Statues grounded at `minY = 0` in a scenic semicircle around `(-118, 96)`
      // (Kept as 6 individual child statue groups & positioned clear of Shot 5's `[-116..-108]` camera->Pelican sightline!)
      const v2DessertSpecs = [
        { name: "Statue_Donut_V2", x: -127.5, z: 98.5, yaw: 0.45, s: 1.18 },
        { name: "Statue_Cupcake_V2", x: -104.6, z: 98.5, yaw: -0.35, s: 1.22 },
        { name: "Statue_IceCreamSandwich_V2", x: -129.0, z: 88.5, yaw: 0.62, s: 1.20 },
        { name: "Statue_Lollipop_V2", x: -104.8, z: 89.2, yaw: -0.52, s: 1.20 },
        { name: "Statue_Gingerbread_V2", x: -125.2, z: 105.5, yaw: 0.18, s: 1.18 },
        { name: "Statue_KitKat_V2", x: -121.6, z: 104.8, yaw: 0.12, s: 1.18 },
      ];
      const v2DessertsGroup = new THREE.Group();
      let placedDesserts = 0;
      for (const spec of v2DessertSpecs) {
        const src = findInScene(androidStatuesV2Scene, [spec.name]);
        if (!src) continue;
        const dClone = cloneShowcaseRootAtOrigin(src);
        // Brand Hygiene (`Statue_KitKat_V2`): recolor any red foil wrapper (`r > 0.55 && g < 0.25` or UV palette red) to Google Blue (`#4285F4`)!
        if (spec.name === "Statue_KitKat_V2") {
          const gBlue = new THREE.Color("#4285F4");
          dClone.traverse((ch) => {
            if (!ch.isMesh) return;
            const mats = Array.isArray(ch.material) ? ch.material : [ch.material];
            for (const m of mats) {
              if (m && m.color && m.color.r > 0.55 && m.color.g < 0.25) {
                m.color.copy(gBlue);
              }
              if (m && m.map && m.map.image && typeof document !== "undefined") {
                const img = m.map.image;
                const w = img.width || img.videoWidth || 0;
                const h = img.height || img.videoHeight || 0;
                if (w > 0 && h > 0) {
                  const cvs = document.createElement("canvas");
                  cvs.width = w;
                  cvs.height = h;
                  const ctx = cvs.getContext("2d");
                  ctx.drawImage(img, 0, 0, w, h);
                  const imgData = ctx.getImageData(0, 0, w, h);
                  const d = imgData.data;
                  let changed = false;
                  for (let p = 0; p < d.length; p += 4) {
                    if (d[p] > 150 && d[p + 1] < 80 && d[p + 2] < 80) {
                      d[p] = 66;
                      d[p + 1] = 133;
                      d[p + 2] = 244;
                      changed = true;
                    }
                  }
                  if (changed) {
                    ctx.putImageData(imgData, 0, 0);
                    const nextTex = new THREE.CanvasTexture(cvs);
                    nextTex.colorSpace = m.map.colorSpace || THREE.SRGBColorSpace;
                    nextTex.flipY = m.map.flipY;
                    nextTex.wrapS = m.map.wrapS;
                    nextTex.wrapT = m.map.wrapT;
                    nextTex.needsUpdate = true;
                    const clonedMat = m.clone();
                    clonedMat.map = nextTex;
                    clonedMat.needsUpdate = true;
                    ch.material = clonedMat;
                  }
                }
              }
            }
            const colAttr = ch.geometry && ch.geometry.getAttribute("color");
            if (colAttr) {
              const gCloned = ch.geometry.clone();
              const cAttr = gCloned.getAttribute("color");
              for (let vi = 0; vi < cAttr.count; vi++) {
                if (cAttr.getX(vi) > 0.55 && cAttr.getY(vi) < 0.25) {
                  cAttr.setXYZ(vi, gBlue.r, gBlue.g, gBlue.b);
                }
              }
              cAttr.needsUpdate = true;
              ch.geometry = gCloned;
            }
          });
        }
        const gy = getOpenWorldTerrainHeight(spec.x, spec.z);
        bakeStaticGroupByMaterial(dClone);
        dClone.name = spec.name;
        dClone.scale.setScalar(spec.s);
        dClone.rotation.y = spec.yaw;
        dClone.position.set(spec.x, gy, spec.z);
        dClone.userData.x = spec.x;
        dClone.userData.z = spec.z;
        dClone.userData.baseScale = spec.s;
        dClone.userData.explicitSurfaceY = gy;
        v2DessertsGroup.add(dClone);
        placedDesserts++;
      }
      if (placedDesserts > 0) {
        v2DessertsGroup.name = "Android_Dessert_Statues_V2_Group";
        if (this.androidDessertsGroup) this.androidDessertsGroup.visible = false;
        this.androidDessertsV2Group = v2DessertsGroup;
        this.root.add(v2DessertsGroup);
      }
    } else if (bugdroidScene && this.bugdroidHolder) {
      const clone = bugdroidScene.clone(true);
      clone.scale.setScalar(1.35);
      groundObjectToY(clone, 0.0, 0.002);
      clampV2EnvIntensity(clone);
      bakeStaticGroupByMaterial(clone);
      if (this.bugdroidHolder.userData.fallback) {
        this.bugdroidHolder.userData.fallback.visible = false;
      }
      (this.bugdroidBodyPivot || this.bugdroidHolder).add(clone);
    }

    // --------------------------------------------------------------------------
    // 4. `campus_collectibles_v2.glb`: TPUs, Pinwheels, 54 Flamingos, MK Carts & Wood Ramps
    // --------------------------------------------------------------------------
    const propsSource = collectiblesV2Scene || campusPropsScene;
    if (propsSource) {
      // A. Legacy `TPU_Wafer_V2` fallback ONLY if `tpu_8i_glb.js` (`this._hasTpu8iV7`) has not been attached yet
      const tpuGroupNode = !this._hasTpu8iV7
        ? findInScene(propsSource, ["TPU_Wafer_V2", "TPU_Wafer_Pod_Mesh", "TPU_Wafer_Pod"])
        : null;
      if (tpuGroupNode) {
        const cleanTpu = new THREE.Group();
        const rawClone = cloneShowcaseRootAtOrigin(tpuGroupNode);
        cleanTpu.add(rawClone);
        if (!rawClone.isMesh || rawClone.children.length > 0) {
          bakeStaticGroupByMaterial(cleanTpu);
        }
        this.tpuTemplateNode = cleanTpu;

        for (const ch of cleanTpu.children) {
          if (!ch.isMesh || !ch.geometry || !ch.material) continue;
          const inst = new THREE.InstancedMesh(ch.geometry, ch.material, this.tpuVisuals.length);
          inst.castShadow = false;
          inst.receiveShadow = true;
          inst.frustumCulled = false;
          this.root.add(inst);
          this.tpuInstancedBatches.push(inst);
        }

        for (const tv of this.tpuVisuals) {
          tv.fallback.visible = false;
          tv.root.visible = false;
        }
      }

      // B. `Pinwheel_Mast_V2` (`Pinwheel_Stand_V2`) + `Pinwheel_Rotor_V2` -> 2 `InstancedMesh`es for all 16 pinwheels!
      const pwMastSrc = findInScene(propsSource, ["Pinwheel_Stand_V2", "Pinwheel_Mast_V2"]);
      const pwRotorSrc = findInScene(propsSource, ["Pinwheel_Rotor_V2"]);
      if (pwMastSrc && pwRotorSrc) {
        const mastClone = cloneShowcaseRootAtOrigin(pwMastSrc);
        // Strip child `Pinwheel_Rotor_V2` from `mastClone` so stationary mast NEVER merges a second static 4-blade rotor!
        const childRotors = [];
        mastClone.traverse((ch) => {
          if (ch !== mastClone && ch.name && ch.name.includes("Rotor")) {
            childRotors.push(ch);
          }
        });
        for (const cr of childRotors) {
          if (cr.parent) cr.parent.remove(cr);
        }
        let mastMeshNode = mastClone.isMesh && mastClone.children.length === 0 ? mastClone : null;
        if (!mastMeshNode) {
          const mastWrap = new THREE.Group();
          mastWrap.add(mastClone);
          bakeStaticGroupByMaterial(mastWrap);
          mastMeshNode = mastWrap.children.find((c) => c.isMesh) || null;
        }

        const rotorClone = cloneShowcaseRootAtOrigin(pwRotorSrc);
        let sharedRotorMat = null;
        rotorClone.traverse((ch) => {
          if (ch.isMesh && ch.material && !Array.isArray(ch.material)) {
            if (!sharedRotorMat) {
              sharedRotorMat = ch.material;
            } else {
              ch.material = sharedRotorMat;
            }
          }
        });
        let rotorMeshNodes = rotorClone.isMesh && rotorClone.children.length === 0 ? [rotorClone] : [];
        if (rotorMeshNodes.length === 0) {
          const rotorWrap = new THREE.Group();
          rotorWrap.add(rotorClone);
          bakeStaticGroupByMaterial(rotorWrap);
          rotorMeshNodes = rotorWrap.children.filter((c) => c.isMesh);
        }

        if (mastMeshNode && rotorMeshNodes.length > 0) {
          const count = KINETIC_PINWHEELS.length;
          const mastInst = new THREE.InstancedMesh(
            mastMeshNode.geometry,
            mastMeshNode.material,
            count
          );
          mastInst.castShadow = true;
          mastInst.receiveShadow = true;
          mastInst.frustumCulled = false;

          this.pinwheelV2RotorBatches = [];
          for (const rNode of rotorMeshNodes) {
            const rotorInst = new THREE.InstancedMesh(rNode.geometry, rNode.material, count);
            rotorInst.castShadow = true;
            rotorInst.receiveShadow = true;
            rotorInst.frustumCulled = false;
            this.pinwheelV2RotorBatches.push(rotorInst);
            this.root.add(rotorInst);
          }

          this.pinwheelV2Specs = [];
          for (let i = 0; i < count; i++) {
            const pw = KINETIC_PINWHEELS[i];
            const gy = getOpenWorldTerrainHeight(pw.x, pw.z);
            const s = pw.heightM / 3.18;
            const yaw = pw.x < 0 ? 0.25 : -0.25;

            _pos.set(pw.x, gy, pw.z);
            _euler.set(0.0, yaw, 0.0);
            _quat.setFromEuler(_euler);
            _scale.setScalar(s);
            _mat4.compose(_pos, _quat, _scale);
            mastInst.setMatrixAt(i, _mat4);

            // Rotor local pivot `(0, +3.180, +0.260)` rotated by `yaw` and scaled by `s`
            const rx = pw.x + Math.sin(yaw) * (0.26 * s);
            const ry = gy + 3.18 * s;
            const rz = pw.z + Math.cos(yaw) * (0.26 * s);
            this.pinwheelV2Specs.push({
              x: rx,
              y: ry,
              z: rz,
              yaw,
              scale: s,
              baseSpin: pw.phase,
            });
          }
          mastInst.instanceMatrix.needsUpdate = true;

          if (this.pinwheelMastMesh) this.pinwheelMastMesh.visible = false;
          if (this.pinwheelBaseMesh) this.pinwheelBaseMesh.visible = false;
          for (const batch of this.pinwheelInstancedByColor) {
            batch.inst.visible = false;
          }

          this.pinwheelV2MastInstanced = mastInst;
          this.pinwheelV2RotorInstanced = this.pinwheelV2RotorBatches[0];
          this.root.add(mastInst);
        }
      }

      // C. `Pink_Flamingo_V2` -> Upgrade all 54 live scattering flamingos!
      const flamSrc = findInScene(propsSource, ["Pink_Flamingo_V2"]);
      if (flamSrc && this.flamingosBodyInstanced) {
        const flamClone = cloneShowcaseRootAtOrigin(flamSrc);
        let flamNodes = flamClone.isMesh && flamClone.children.length === 0 ? [flamClone] : [];
        if (flamNodes.length === 0) {
          const flamWrap = new THREE.Group();
          flamWrap.add(flamClone);
          bakeStaticGroupByMaterial(flamWrap);
          flamNodes = flamWrap.children.filter((c) => c.isMesh);
        }
        if (flamNodes.length > 0) {
          this.flamingosBodyInstanced.geometry.dispose();
          this.flamingosBodyInstanced.geometry = flamNodes[0].geometry;
          this.flamingosBodyInstanced.material = flamNodes[0].material;
          this.flamingosExtraBatches = [];
          for (let k = 1; k < flamNodes.length; k++) {
            const extraInst = new THREE.InstancedMesh(
              flamNodes[k].geometry,
              flamNodes[k].material,
              54
            );
            extraInst.castShadow = true;
            extraInst.frustumCulled = false;
            this.flamingosExtraBatches.push(extraInst);
            this.root.add(extraInst);
          }
        }
      }

      // D. `MK_Espresso_Cart_V2` -> Place at all 4 `MK_BOOST_PADS` sidewalk aprons (cullable per-cart groups!)
      const mkCartSrc = findInScene(propsSource, ["MK_Espresso_Cart_V2"]);
      if (mkCartSrc && this.mkCartPlacements.length > 0) {
        const mkV2Group = new THREE.Group();
        for (const pl of this.mkCartPlacements) {
          const cartClone = cloneShowcaseRootAtOrigin(mkCartSrc);
          bakeStaticGroupByMaterial(cartClone);
          cartClone.traverse((ch) => {
            if (ch.isMesh) ch.castShadow = !this.isSoftwareRenderer;
          });
          cartClone.position.set(pl.x, pl.y, pl.z);
          cartClone.rotation.y = pl.rotY;
          cartClone.updateMatrix();
          cartClone.matrixAutoUpdate = false;
          cartClone.userData = { x: pl.x, z: pl.z };
          mkV2Group.add(cartClone);
        }
        mkV2Group.matrixAutoUpdate = false;
        mkV2Group.updateMatrix();
        if (this.mkCartsFallbackGroup) this.mkCartsFallbackGroup.visible = false;
        this.mkCartsV2Group = mkV2Group;
        this.root.add(mkV2Group);
      }

      // E. `BayView_Wood_Ramp_V2` -> Exact `0.000mm` tire-to-plank alignment with `kin.js` `evaluateJumpRampAtPoint`!
      const rampSrc = findInScene(propsSource, ["BayView_Wood_Ramp_V2"]);
      if (rampSrc) {
        const rampsV2Group = new THREE.Group();
        rampsV2Group.userData.skipGroundingAudit = true;
        for (const rp of JUMP_RAMPS) {
          const fwdX = Math.sin(rp.headingYaw);
          const fwdZ = -Math.cos(rp.headingYaw);
          const halfL = rp.lengthM * 0.5;
          const baseGround =
            getOpenWorldEarthHeight(
              rp.x - fwdX * (halfL + 0.6),
              rp.z - fwdZ * (halfL + 0.6)
            ) + 0.016;
          const rClone = cloneShowcaseRootAtOrigin(rampSrc);
          rClone.scale.set(rp.widthM / 4.4, rp.heightM / 1.28, rp.lengthM / 6.5);
          rClone.rotation.y = -rp.headingYaw;
          rClone.position.set(rp.x, baseGround, rp.z);
          rampsV2Group.add(rClone);
        }
        bakeStaticGroupByMaterial(rampsV2Group);
        rampsV2Group.matrixAutoUpdate = false;
        rampsV2Group.updateMatrix();
        if (this.allRampsFallbackGroup) this.allRampsFallbackGroup.visible = false;
        this.allRampsV2Group = rampsV2Group;
        this.root.add(rampsV2Group);
      }
    }

    // --------------------------------------------------------------------------
    // 5. `gbike_and_vehicles_v2.glb`: `Gym_Trainer_Stand_V2` + `Trainer_Front_Riser_Block_V8` + `Waymo_Cruiser_V2`
    // --------------------------------------------------------------------------
    const vehiclesSource = vehiclesV2Scene || campusPropsScene;
    if (vehiclesSource) {
      // A. `Gym_Trainer_Stand_V2` + spinning `Gym_Trainer_Flywheel_V2` at `(0, 0, 140.7425)` (`rotation.y = Math.PI`)
      const trainerNode = findInScene(vehiclesSource, [
        "Gym_Trainer_Stand_V2",
        "Gym_Trainer_Stand",
        "Fitness_Trainer_Stand",
      ]);
      if (trainerNode && this.trainerGroup) {
        const cleanTr = cloneShowcaseRootAtOrigin(trainerNode);
        cleanTr.rotation.set(0, Math.PI, 0);
        // `V8-10`: Open-front horseshoe U-frame clamp cups sit at local `z = 0.000m`, `y = 0.387m`, `|x| = 0.102m`
        // matching the GBike's extended chrome skewer nuts at `(0, 0.386, 140.7425)` to `0.000mm`!
        cleanTr.position.set(0.0, 0.0, 0.0);
        cleanTr.traverse((ch) => {
          if (ch.isMesh) {
            ch.castShadow = !this.isSoftwareRenderer;
            ch.receiveShadow = true;
          }
        });
        let fw = null;
        cleanTr.traverse((ch) => {
          if (ch.name && ch.name.includes("Flywheel")) {
            fw = ch;
          }
        });
        if (fw) {
          fw.position.z = -0.252;
        }
        if (this.trainerFallbackGroup) this.trainerFallbackGroup.visible = false;
        this.trainerFlywheelPivot = fw;
        this.trainerGroup.add(cleanTr);

        if (this.gymSpareTrainerAnchor) {
          const spareTr = cloneShowcaseRootAtOrigin(trainerNode);
          spareTr.scale.setScalar(0.88);
          groundObjectToY(spareTr, 0.0, 0.0);
          bakeStaticGroupByMaterial(spareTr);
          this.gymSpareTrainerAnchor.add(spareTr);
        }
      }

      // A2. `Trainer_Front_Riser_Block_V8` at `(0, 0, 140.2 - 0.5425)` under the GBike's front wheel (`+0.052m` tire cradle!)
      const frontRiserNode = findInScene(vehiclesSource, [
        "Trainer_Front_Riser_Block_V8",
        "Gym_Trainer_Front_Riser_V8",
        "Trainer_Front_Riser_Block",
      ]);
      if (frontRiserNode && this.trainerFrontRiserGroup) {
        const cleanRiser = cloneShowcaseRootAtOrigin(frontRiserNode);
        cleanRiser.position.set(0.0, 0.0, 0.0);
        cleanRiser.rotation.set(0.0, 0.0, 0.0);
        cleanRiser.scale.set(1.0, 1.0, 1.0);
        cleanRiser.userData.skipGroundingAudit = true;
        cleanRiser.traverse((ch) => {
          if (ch.isMesh) {
            ch.castShadow = !this.isSoftwareRenderer;
            ch.receiveShadow = true;
          }
        });
        if (this.trainerFrontRiserFallbackGroup) {
          this.trainerFrontRiserFallbackGroup.visible = false;
        }
        this.trainerFrontRiserGroup.add(cleanRiser);
      }

      // B. `Waymo_Cruiser_V2` fallback -> 4 moving + 5 parked Waymos (superseded whenever `Waymo_Gen6_V3` attaches!)
      const waymoNode = findInScene(vehiclesSource, ["Waymo_Cruiser_V2", "Waymo_Cruiser"]);
      if (waymoNode && !this._hasWaymoGen6V3) {
        clampV2EnvIntensity(waymoNode);
        let bodyMesh = null;
        let domeMesh = null;
        let leftWheelMesh = null;
        let rightWheelMesh = null;
        const leftOffsets = [];
        const rightOffsets = [];

        waymoNode.traverse((ch) => {
          if (!ch.isMesh) return;
          if (ch.name && ch.name.includes("Waymo_Body")) bodyMesh = ch;
          else if (ch.name && ch.name.includes("Lidar_Dome")) domeMesh = ch;
          else if (ch.name && ch.name.includes("Waymo_Wheel_")) {
            if (ch.position.x <= 0) {
              if (!leftWheelMesh) leftWheelMesh = ch;
              leftOffsets.push(ch.position.clone());
            } else {
              if (!rightWheelMesh) rightWheelMesh = ch;
              rightOffsets.push(ch.position.clone());
            }
          }
        });

        if (bodyMesh && domeMesh && leftWheelMesh && rightWheelMesh) {
          this._clearWaymoInstancedBatches();
          this._installWaymoFleetBatches({
            bodyPrims: [{ geometry: bodyMesh.geometry, material: bodyMesh.material }],
            domePrims: [{ geometry: domeMesh.geometry, material: domeMesh.material }],
            leftWheelPrims: [{ geometry: leftWheelMesh.geometry, material: leftWheelMesh.material }],
            rightWheelPrims: [{ geometry: rightWheelMesh.geometry, material: rightWheelMesh.material }],
            domeLocalPos: domeMesh.position.clone(),
            leftOffsets,
            rightOffsets,
            wheelRadius: 0.388,
            modelYawOffset: Math.PI,
            wheelSpinSign: 1.0,
          });
        }
      }
    }

    // --------------------------------------------------------------------------
    // 6. Optional V3 Showroom Upgrades (`Waymo_Gen6_V3` + `Campus_Environment_V3`)
    // --------------------------------------------------------------------------
    const v3WaymoSrc = waymoGen6Scene || waymoGen6V3Scene;
    if (v3WaymoSrc) {
      this.applyWaymoGen6V3Glb(v3WaymoSrc);
    }
    const v3EnvSrc = envV3Scene || campusEnvironmentV3Scene;
    if (v3EnvSrc) {
      this.applyCampusEnvironmentV3Glb(v3EnvSrc);
    }

    return this.tpuTemplateNode;
  }

  // ============================================================================
  // 10B. V3 WAYMO GEN 6 OJAI MPV FLEET (`4` MOVING + `5` CURBSIDE PICKUP BAYS)
  // ============================================================================
  _clearWaymoInstancedBatches() {
    const allBatches = [
      ...(this.waymoBodyBatches || []),
      ...(this.waymoDomeBatches || []),
      ...(this.waymoWheelLeftBatches || []),
      ...(this.waymoWheelRightBatches || []),
    ];
    for (const inst of allBatches) {
      if (!inst) continue;
      if (inst.parent) inst.parent.remove(inst);
      if (typeof inst.dispose === "function") inst.dispose();
    }
    this.waymoBodyBatches = [];
    this.waymoDomeBatches = [];
    this.waymoWheelLeftBatches = [];
    this.waymoWheelRightBatches = [];
    this.waymoBodyInstanced = null;
    this.waymoDomeInstanced = null;
    this.waymoWheelsLeftInstanced = null;
    this.waymoWheelsRightInstanced = null;
  }

  _installWaymoFleetBatches({
    bodyPrims,
    domePrims,
    leftWheelPrims,
    rightWheelPrims,
    domeLocalPos,
    leftOffsets,
    rightOffsets,
    wheelRadius = 0.375,
    modelYawOffset = Math.PI,
    wheelSpinSign = 1.0,
  }) {
    // Every autonomous campus vehicle (`5` moving + `11` curbside/carport bays) uses the sculpted `Waymo_Gen6_V4` Ojai robotaxi (`ZERO` procedural box vans!)
    const waymoFleetItems = [...this.waymoVisuals];

    const totalVehicles = waymoFleetItems.length + this.parkedWaymoSpecs.length;
    if (
      totalVehicles === 0 ||
      !bodyPrims?.length ||
      !domePrims?.length ||
      !leftWheelPrims?.length ||
      !rightWheelPrims?.length ||
      !leftOffsets?.length ||
      !rightOffsets?.length
    ) {
      return false;
    }

    this.waymoDomeLocalPos = domeLocalPos.clone();
    this.waymoLeftWheelOffsets = leftOffsets.map((v) => v.clone());
    this.waymoRightWheelOffsets = rightOffsets.map((v) => v.clone());
    this.waymoWheelRadius = Math.max(0.22, Number(wheelRadius) || 0.375);
    this.waymoModelYawOffset = modelYawOffset;
    this.waymoWheelSpinSign = wheelSpinSign;

    const makeBatch = (prim, capacity, receiveShadow = true, batchName = "") => {
      const inst = new THREE.InstancedMesh(prim.geometry, prim.material, capacity);
      if (batchName) inst.name = batchName;
      inst.castShadow = false;
      inst.receiveShadow = receiveShadow;
      inst.frustumCulled = false;
      this.root.add(inst);
      return inst;
    };

    // Disable `receiveShadow` on glossy curved Waymo body & LiDAR dome (`castShadow` toggled in `update`
    // + `vehicleContactShadowInstanced` underneath) so shadow-map quantization NEVER stripes white doors!
    this.waymoBodyBatches = bodyPrims.map((p, idx) =>
      makeBatch(p, totalVehicles, false, `Waymo_Gen6_V4_Body_Batch_${idx}`)
    );
    this.waymoDomeBatches = domePrims.map((p, idx) =>
      makeBatch(p, totalVehicles, false, `Waymo_Gen6_V4_Dome_Batch_${idx}`)
    );
    this.waymoWheelLeftBatches = leftWheelPrims.map((p, idx) =>
      makeBatch(p, totalVehicles * leftOffsets.length, true, `Waymo_Gen6_V4_WheelL_Batch_${idx}`)
    );
    this.waymoWheelRightBatches = rightWheelPrims.map((p, idx) =>
      makeBatch(p, totalVehicles * rightOffsets.length, true, `Waymo_Gen6_V4_WheelR_Batch_${idx}`)
    );

    this.waymoBodyInstanced = this.waymoBodyBatches[0] || null;
    this.waymoDomeInstanced = this.waymoDomeBatches[0] || null;
    this.waymoWheelsLeftInstanced = this.waymoWheelLeftBatches[0] || null;
    this.waymoWheelsRightInstanced = this.waymoWheelRightBatches[0] || null;

    for (let k = 0; k < waymoFleetItems.length; k++) {
      const wv = waymoFleetItems[k];
      wv.fallbackGroup.visible = false;
      wv.instancedIndex = k;
      wv.hasGlb = true;
    }
    if (this.parkedWaymosFallbackGroup) {
      this.parkedWaymosFallbackGroup.visible = false;
    }

    // Seed initial Frame-0 transforms across all moving + parked Waymos
    let seedIdx = 0;
    const poseSlot = (wx, wy, wz, yaw, domeSpin, wSpin) => {
      const k = seedIdx++;
      const carYawThree = this.waymoModelYawOffset - yaw;
      _euler.set(0.0, carYawThree, 0.0);
      _quatCar.setFromEuler(_euler);
      _scale.setScalar(1.0);

      _pos.set(wx, wy, wz);
      _mat4.compose(_pos, _quatCar, _scale);
      for (const bInst of this.waymoBodyBatches) bInst.setMatrixAt(k, _mat4);

      _pos.copy(this.waymoDomeLocalPos).applyQuaternion(_quatCar);
      _pos.x += wx;
      _pos.y += wy;
      _pos.z += wz;
      _euler.set(0.0, carYawThree + domeSpin, 0.0);
      _quat.setFromEuler(_euler);
      _mat4.compose(_pos, _quat, _scale);
      for (const dInst of this.waymoDomeBatches) dInst.setMatrixAt(k, _mat4);

      _quatSpin.setFromAxisAngle(_axisX, wSpin);
      _quat.multiplyQuaternions(_quatCar, _quatSpin);

      const lLen = this.waymoLeftWheelOffsets.length;
      for (let wIdx = 0; wIdx < lLen; wIdx++) {
        _pos.copy(this.waymoLeftWheelOffsets[wIdx]).applyQuaternion(_quatCar);
        _pos.x += wx;
        _pos.y += wy;
        _pos.z += wz;
        _mat4.compose(_pos, _quat, _scale);
        for (const lwInst of this.waymoWheelLeftBatches) {
          lwInst.setMatrixAt(k * lLen + wIdx, _mat4);
        }
      }

      const rLen = this.waymoRightWheelOffsets.length;
      for (let wIdx = 0; wIdx < rLen; wIdx++) {
        _pos.copy(this.waymoRightWheelOffsets[wIdx]).applyQuaternion(_quatCar);
        _pos.x += wx;
        _pos.y += wy;
        _pos.z += wz;
        _mat4.compose(_pos, _quat, _scale);
        for (const rwInst of this.waymoWheelRightBatches) {
          rwInst.setMatrixAt(k * rLen + wIdx, _mat4);
        }
      }
    };

    for (let i = 0; i < waymoFleetItems.length; i++) {
      const wp0 = WAYMO_ROUTES[i]?.waypoints?.[0] || { x: 0, z: 76 };
      poseSlot(wp0.x, getOpenWorldTerrainHeight(wp0.x, wp0.z), wp0.z, 0.0, 0.0, 0.0);
    }
    for (let p = 0; p < this.parkedWaymoSpecs.length; p++) {
      const pk = this.parkedWaymoSpecs[p];
      poseSlot(pk.x, pk.y, pk.z, pk.yaw, pk.phase, pk.phase * 0.5);
    }
    for (const inst of [
      ...this.waymoBodyBatches,
      ...this.waymoDomeBatches,
      ...this.waymoWheelLeftBatches,
      ...this.waymoWheelRightBatches,
    ]) {
      inst.count = inst === this.waymoWheelsLeftInstanced || this.waymoWheelLeftBatches.includes(inst)
        ? seedIdx * this.waymoLeftWheelOffsets.length
        : this.waymoWheelRightBatches.includes(inst)
          ? seedIdx * this.waymoRightWheelOffsets.length
          : seedIdx;
      inst.instanceMatrix.needsUpdate = true;
    }

    return true;
  }

  /**
   * Attaches showroom-grade `Waymo_Gen6_V3` Ojai MPV (`Waymo_Body_V3`, `Waymo_Lidar_Dome_V3`,
   * `Waymo_Wheel_FL/FR/RL/RR_V3`), automatically measuring wheel tire radius (`0.5 * (maxY - minY)`)
   * and preserving local axle origins across all 4 moving + 5 parked curbside Waymos.
   */
  applyWaymoGen6V3Glb(waymoGen6Scene) {
    if (!waymoGen6Scene) return false;

    const findSub = (root, patterns) => {
      for (const pat of patterns) {
        const exact = root.getObjectByName(pat);
        if (exact) return exact;
      }
      for (const pat of patterns) {
        let hit = null;
        root.traverse((n) => {
          if (!hit && n !== root && n.name && n.name.startsWith(pat)) hit = n;
        });
        if (hit) return hit;
      }
      return null;
    };

    const srcRoot =
      findSub(waymoGen6Scene, ["Waymo_Gen6_V4", "Waymo_Gen6_V3", "Waymo_Gen6"]) || waymoGen6Scene;
    let hasV4Nodes = /V4|V9/i.test(srcRoot.name || "");
    srcRoot.traverse((n) => {
      if (n.name && /V4|V9/i.test(n.name)) hasV4Nodes = true;
    });
    const matMap = new Map();
    const waymoClone = srcRoot.clone(true);
    waymoClone.position.set(0, 0, 0);
    waymoClone.rotation.set(0, 0, 0);
    waymoClone.scale.set(1, 1, 1);

    waymoClone.traverse((ch) => {
      if (!ch.isMesh || !ch.material) return;
      const cloneMat = (m) => {
        if (!m) return m;
        if (matMap.has(m.uuid)) return matMap.get(m.uuid);
        const cm = m.clone();
        const isV4Mat = hasV4Nodes || /V4|V9/i.test(cm.name || "");
        if (cm.isMeshStandardMaterial || cm.isMeshPhysicalMaterial) {
          cm.envMapIntensity = Math.min(cm.envMapIntensity ?? 1.0, isV4Mat ? 0.68 : 0.56);
        }
        // Harmonize `UV_SW_WHITE` (`(166,172,181)` -> `COL_PEARL_MID (190,196,204)`) ONLY on legacy `Waymo_Gen6_V3`
        // base & ORM maps (never overwrite V4/V9 baked Waymo Ojai textures!)
        if (!isV4Mat && cm.map && cm.map.image && typeof document !== "undefined") {
          const img = cm.map.image;
          const w = img.width || img.videoWidth || 0;
          const h = img.height || img.videoHeight || 0;
          if (w > 0 && h > 0) {
            const cvs = document.createElement("canvas");
            cvs.width = w;
            cvs.height = h;
            const ctx = cvs.getContext("2d");
            ctx.drawImage(img, 0, 0, w, h);
            const x0 = Math.floor(0.498 * w);
            const x1 = Math.ceil(0.592 * w);
            const y0 = Math.floor((1.0 - 0.982) * h);
            const y1 = Math.ceil((1.0 - 0.898) * h);
            ctx.fillStyle = "rgb(190, 196, 204)";
            ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
            const nextTex = new THREE.CanvasTexture(cvs);
            nextTex.colorSpace = cm.map.colorSpace || THREE.SRGBColorSpace;
            nextTex.flipY = cm.map.flipY;
            nextTex.wrapS = cm.map.wrapS;
            nextTex.wrapT = cm.map.wrapT;
            nextTex.needsUpdate = true;
            cm.map = nextTex;
          }
        }
        if (!isV4Mat && cm.roughnessMap && cm.roughnessMap.image && typeof document !== "undefined") {
          const rImg = cm.roughnessMap.image;
          const rw = rImg.width || rImg.videoWidth || 0;
          const rh = rImg.height || rImg.videoHeight || 0;
          if (rw > 0 && rh > 0) {
            const rCvs = document.createElement("canvas");
            rCvs.width = rw;
            rCvs.height = rh;
            const rCtx = rCvs.getContext("2d");
            rCtx.drawImage(rImg, 0, 0, rw, rh);
            const rx0 = Math.floor(0.498 * rw);
            const rx1 = Math.ceil(0.592 * rw);
            const ry0 = Math.floor((1.0 - 0.982) * rh);
            const ry1 = Math.ceil((1.0 - 0.898) * rh);
            rCtx.fillStyle = "rgb(255, 134, 4)";
            rCtx.fillRect(rx0, ry0, rx1 - rx0, ry1 - ry0);
            const nextOrm = new THREE.CanvasTexture(rCvs);
            nextOrm.colorSpace = cm.roughnessMap.colorSpace || THREE.NoColorSpace;
            nextOrm.flipY = cm.roughnessMap.flipY;
            nextOrm.wrapS = cm.roughnessMap.wrapS;
            nextOrm.wrapT = cm.roughnessMap.wrapT;
            nextOrm.needsUpdate = true;
            cm.roughnessMap = nextOrm;
            if (cm.metalnessMap) cm.metalnessMap = nextOrm;
            if (cm.aoMap) cm.aoMap = nextOrm;
          }
        }
        cm.needsUpdate = true;
        matMap.set(m.uuid, cm);
        return cm;
      };
      ch.material = Array.isArray(ch.material)
        ? ch.material.map(cloneMat)
        : cloneMat(ch.material);
      ch.castShadow = true;
      ch.receiveShadow = true;
    });

    waymoClone.updateMatrixWorld(true);
    const rootInv = new THREE.Matrix4().copy(waymoClone.matrixWorld).invert();
    const fullBox = new THREE.Box3().setFromObject(waymoClone);
    const groundShiftY = Number.isFinite(fullBox.min.y) ? -fullBox.min.y : 0.0;

    const domeNode = findSub(waymoClone, ["Waymo_Lidar_Dome_V3", "Waymo_Lidar_Dome", "Lidar_Dome"]);
    let flNode = findSub(waymoClone, ["Waymo_Wheel_FL_V3", "Waymo_Wheel_FL", "Wheel_FL"]);
    let frNode = findSub(waymoClone, ["Waymo_Wheel_FR_V3", "Waymo_Wheel_FR", "Wheel_FR"]);
    let rlNode = findSub(waymoClone, ["Waymo_Wheel_RL_V3", "Waymo_Wheel_RL", "Wheel_RL"]);
    let rrNode = findSub(waymoClone, ["Waymo_Wheel_RR_V3", "Waymo_Wheel_RR", "Wheel_RR"]);

    // Fallback scan if wheels were named generically
    if (!flNode || !frNode || !rlNode || !rrNode) {
      const wheelCandidates = [];
      waymoClone.traverse((n) => {
        if (n !== waymoClone && n.name && /Wheel/i.test(n.name) && (!n.parent || !/Wheel/i.test(n.parent.name || ""))) {
          const b = new THREE.Box3().setFromObject(n);
          const c = new THREE.Vector3();
          b.getCenter(c);
          wheelCandidates.push({ node: n, cx: c.x, cz: c.z });
        }
      });
      if (wheelCandidates.length >= 4) {
        const lefts = wheelCandidates.filter((w) => w.cx <= 0).sort((a, b) => b.cz - a.cz);
        const rights = wheelCandidates.filter((w) => w.cx > 0).sort((a, b) => b.cz - a.cz);
        if (lefts.length >= 2 && rights.length >= 2) {
          flNode = flNode || lefts[0].node;
          rlNode = rlNode || lefts[lefts.length - 1].node;
          frNode = frNode || rights[0].node;
          rrNode = rrNode || rights[rights.length - 1].node;
        }
      }
    }

    const extractPartSubtree = (partNode, isDome = false) => {
      if (!partNode) return null;
      const rawMeshes = [];
      partNode.traverse((ch) => {
        if (ch.isMesh && ch.geometry && ch.material && !Array.isArray(ch.material)) {
          const relM = new THREE.Matrix4().multiplyMatrices(rootInv, ch.matrixWorld);
          const g = ch.geometry.clone();
          g.applyMatrix4(relM);
          g.translate(0.0, groundShiftY, 0.0);
          g.computeBoundingBox();
          rawMeshes.push({ geom: g, mat: ch.material });
        }
      });
      if (partNode.parent) {
        partNode.parent.remove(partNode);
      }
      if (rawMeshes.length === 0) return null;

      const box = new THREE.Box3();
      for (const rm of rawMeshes) {
        if (rm.geom.boundingBox) box.union(rm.geom.boundingBox);
      }
      const pivot = new THREE.Vector3(
        0.5 * (box.min.x + box.max.x),
        isDome ? box.min.y : 0.5 * (box.min.y + box.max.y),
        0.5 * (box.min.z + box.max.z)
      );
      const tireRadius = 0.5 * Math.max(0.05, box.max.y - box.min.y);

      const wrap = new THREE.Group();
      for (const rm of rawMeshes) {
        rm.geom.translate(-pivot.x, -pivot.y, -pivot.z);
        if (!rm.geom.attributes.normal) rm.geom.computeVertexNormals();
        else rm.geom.normalizeNormals();
        wrap.add(new THREE.Mesh(rm.geom, rm.mat));
      }
      bakeStaticGroupByMaterial(wrap);
      const prims = wrap.children
        .filter((c) => c.isMesh && c.geometry && c.material)
        .map((c) => ({ geometry: c.geometry, material: c.material }));

      return prims.length > 0 ? { prims, pivot, box, tireRadius } : null;
    };

    const domeInfo = extractPartSubtree(domeNode, true);
    const flInfo = extractPartSubtree(flNode, false);
    const frInfo = extractPartSubtree(frNode, false);
    const rlInfo = extractPartSubtree(rlNode, false);
    const rrInfo = extractPartSubtree(rrNode, false);

    const smoothCreasedBodyNormals = (geom, cosCrease = Math.cos((54 * Math.PI) / 180)) => {
      const nonIdx = geom.index ? geom.toNonIndexed() : geom.clone();
      const posAttr = nonIdx.getAttribute("position");
      const uvAttr = nonIdx.getAttribute("uv");
      if (!posAttr || posAttr.count < 3) return nonIdx;

      const triCount = Math.floor(posAttr.count / 3);
      const faceWeightedN = new Float32Array(triCount * 3);
      const faceUnitN = new Float32Array(triCount * 3);
      const buckets = new Map();

      const ax = new THREE.Vector3();
      const bx = new THREE.Vector3();
      const cx = new THREE.Vector3();
      const e1 = new THREE.Vector3();
      const e2 = new THREE.Vector3();
      const fn = new THREE.Vector3();

      for (let t = 0; t < triCount; t++) {
        const i0 = t * 3;
        ax.fromBufferAttribute(posAttr, i0);
        bx.fromBufferAttribute(posAttr, i0 + 1);
        cx.fromBufferAttribute(posAttr, i0 + 2);
        e1.subVectors(bx, ax);
        e2.subVectors(cx, ax);
        fn.crossVectors(e1, e2);
        const len = fn.length();
        faceWeightedN[t * 3] = fn.x;
        faceWeightedN[t * 3 + 1] = fn.y;
        faceWeightedN[t * 3 + 2] = fn.z;
        if (len > 1e-10) {
          faceUnitN[t * 3] = fn.x / len;
          faceUnitN[t * 3 + 1] = fn.y / len;
          faceUnitN[t * 3 + 2] = fn.z / len;
        }
        for (let k = 0; k < 3; k++) {
          const vi = i0 + k;
          const key = `${Math.round(posAttr.getX(vi) * 2000)}_${Math.round(posAttr.getY(vi) * 2000)}_${Math.round(posAttr.getZ(vi) * 2000)}`;
          let list = buckets.get(key);
          if (!list) {
            list = [];
            buckets.set(key, list);
          }
          list.push(vi);
        }
      }

      const outNormals = new Float32Array(posAttr.count * 3);
      for (const list of buckets.values()) {
        for (let a = 0; a < list.length; a++) {
          const vi = list[a];
          const ti = Math.floor(vi / 3);
          const ux = faceUnitN[ti * 3];
          const uy = faceUnitN[ti * 3 + 1];
          const uz = faceUnitN[ti * 3 + 2];
          const vx = posAttr.getX(vi);
          const vy = posAttr.getY(vi);
          const vz = posAttr.getZ(vi);

          // Continuous C^infinity analytical surface normal across the curved front white stub bonnet
          // (`vy in [0.81, 1.085], |vz| in [1.80, 2.31], |vx| < 0.78`) so the 4 longitudinal hood strips
          // interpolate with zero planar facet banding (`MAJOR-W2-01`)!
          if (!hasV4Nodes && vy >= 0.81 && vy <= 1.085 && Math.abs(vz) >= 1.80 && Math.abs(vz) <= 2.31 && Math.abs(vx) <= 0.78 && uy > 0.35) {
            const zSign = vz >= 0 ? 1.0 : -1.0;
            const noseT = THREE.MathUtils.clamp((Math.abs(vz) - 1.80) / 0.48, 0.0, 1.0);
            const nx = vx * 0.34;
            const ny = 1.0;
            const nz = zSign * (0.36 + 0.52 * noseT * noseT);
            const nLen = Math.hypot(nx, ny, nz) || 1.0;
            outNormals[vi * 3] = nx / nLen;
            outNormals[vi * 3 + 1] = ny / nLen;
            outNormals[vi * 3 + 2] = nz / nLen;
            continue;
          }

          let sx = 0;
          let sy = 0;
          let sz = 0;
          for (let b = 0; b < list.length; b++) {
            const vj = list[b];
            const tj = Math.floor(vj / 3);
            const dot =
              ux * faceUnitN[tj * 3] +
              uy * faceUnitN[tj * 3 + 1] +
              uz * faceUnitN[tj * 3 + 2];
            if (dot >= cosCrease) {
              sx += faceWeightedN[tj * 3];
              sy += faceWeightedN[tj * 3 + 1];
              sz += faceWeightedN[tj * 3 + 2];
            }
          }
          const slen = Math.hypot(sx, sy, sz);
          if (slen > 1e-10) {
            outNormals[vi * 3] = sx / slen;
            outNormals[vi * 3 + 1] = sy / slen;
            outNormals[vi * 3 + 2] = sz / slen;
          } else {
            outNormals[vi * 3] = ux;
            outNormals[vi * 3 + 1] = uy;
            outNormals[vi * 3 + 2] = uz;
          }
        }
      }
      nonIdx.setAttribute("normal", new THREE.BufferAttribute(outNormals, 3));
      return nonIdx;
    };

    // Remaining subtree in `waymoClone` is `Waymo_Body_V3` + static sensors/trim (0 duplicate wheels/dome!)
    const bodyWrap = new THREE.Group();
    waymoClone.updateMatrixWorld(true);
    const bodyRootInv = new THREE.Matrix4().copy(waymoClone.matrixWorld).invert();
    waymoClone.traverse((ch) => {
      if (ch.isMesh && ch.geometry && ch.material && !Array.isArray(ch.material)) {
        const relM = new THREE.Matrix4().multiplyMatrices(bodyRootInv, ch.matrixWorld);
        const gRaw = ch.geometry.clone();
        gRaw.applyMatrix4(relM);
        gRaw.translate(0.0, groundShiftY, 0.0);
        const g = smoothCreasedBodyNormals(gRaw);
        bodyWrap.add(new THREE.Mesh(g, ch.material));
      }
    });
    bakeStaticGroupByMaterial(bodyWrap);
    const bodyPrims = bodyWrap.children
      .filter((c) => c.isMesh && c.geometry && c.material)
      .map((c) => ({ geometry: c.geometry, material: c.material }));

    const leftWheelSource = flInfo || rlInfo;
    const rightWheelSource = frInfo || rrInfo;
    if (!bodyPrims.length || !domeInfo || !leftWheelSource || !rightWheelSource) {
      return false;
    }

    const leftOffsets = [flInfo?.pivot, rlInfo?.pivot].filter(Boolean);
    const rightOffsets = [frInfo?.pivot, rrInfo?.pivot].filter(Boolean);
    const radii = [flInfo, frInfo, rlInfo, rrInfo]
      .filter(Boolean)
      .map((w) => w.tireRadius);
    const measuredTireRadius =
      radii.length > 0
        ? THREE.MathUtils.clamp(
            radii.reduce((acc, v) => acc + v, 0.0) / radii.length,
            0.24,
            0.52
          )
        : 0.375;

    // Auto-detect whether `Waymo_Gen6_V3` faces `+Z` (`FL.z >= RL.z`) or `-Z` (`FL.z < RL.z`)
    const frontMeanZ =
      ((flInfo ? flInfo.pivot.z : 0) + (frInfo ? frInfo.pivot.z : 0)) * 0.5;
    const rearMeanZ =
      ((rlInfo ? rlInfo.pivot.z : 0) + (rrInfo ? rrInfo.pivot.z : 0)) * 0.5;
    const facesPosZ = flInfo && rlInfo ? frontMeanZ >= rearMeanZ : true;

    this._clearWaymoInstancedBatches();
    const ok = this._installWaymoFleetBatches({
      bodyPrims,
      domePrims: domeInfo.prims,
      leftWheelPrims: leftWheelSource.prims,
      rightWheelPrims: rightWheelSource.prims,
      domeLocalPos: domeInfo.pivot,
      leftOffsets,
      rightOffsets,
      wheelRadius: measuredTireRadius,
      modelYawOffset: facesPosZ ? Math.PI : 0.0,
      wheelSpinSign: facesPosZ ? 1.0 : -1.0,
    });

    if (ok) {
      this._hasWaymoGen6V3 = true;
      if (this._lastHeroSnap) {
        this.update(0.0, this._lastHeroSnap, this._lastGlobalState || { elapsedTime: 0.0, tpuLedger: [] });
      }
    }
    return ok;
  }

  // ============================================================================
  // 10C. V3 ARCHITECTURAL BUILDINGS & STREETSCAPE FURNITURE (`Campus_Environment_V3`)
  // ============================================================================
  applyCampusEnvironmentV3Glb(envV3Scene) {
    if (!envV3Scene && !this._propsV4Scene) return false;
    if (envV3Scene) this._envV3Scene = envV3Scene;

    const searchRoots = [this._propsV4Scene, this._envV3Scene].filter(Boolean);
    const findEnvNode = (names) => {
      for (const nm of names) {
        for (const sr of searchRoots) {
          const exact = sr.getObjectByName(nm);
          if (exact) return exact;
        }
      }
      for (const nm of names) {
        for (const sr of searchRoots) {
          let hit = null;
          sr.traverse((n) => {
            if (!hit && n !== sr && n.name && n.name.startsWith(nm)) hit = n;
          });
          if (hit) return hit;
        }
      }
      return null;
    };

    const sharedMatClones = new Map();
    const cloneEnvMat = (m, isBotanicalTree = false) => {
      if (!m) return m;
      const cacheKey = `${m.uuid}_${isBotanicalTree ? "tree" : "env"}`;
      if (sharedMatClones.has(cacheKey)) return sharedMatClones.get(cacheKey);
      const cm = m.clone();
      if (cm.isMeshStandardMaterial || cm.isMeshPhysicalMaterial) {
        if (isBotanicalTree || (cm.name && cm.name.includes("Botanical_Trees"))) {
          cm.roughness = 0.78;
          cm.envMapIntensity = 0.45;
        } else {
          cm.envMapIntensity = Math.min(cm.envMapIntensity ?? 1.0, 0.58);
        }
      }
      sharedMatClones.set(cacheKey, cm);
      return cm;
    };

    const extractNormalizedTemplate = (
      srcNode,
      mode = "centered",
      nominalHeightRange = null,
      isBotanicalTree = false
    ) => {
      if (!srcNode) return null;
      const clone = srcNode.clone(true);
      clone.position.set(0, 0, 0);
      clone.rotation.set(0, 0, 0);
      clone.scale.set(1, 1, 1);
      clone.updateMatrixWorld(true);
      const rootInv = new THREE.Matrix4().copy(clone.matrixWorld).invert();

      const items = [];
      const box = new THREE.Box3();
      clone.traverse((ch) => {
        if (!ch.isMesh || !ch.geometry || !ch.material) return;
        const relM = new THREE.Matrix4().multiplyMatrices(rootInv, ch.matrixWorld);
        if (Array.isArray(ch.material)) {
          const groups = ch.geometry.groups || [];
          const baseNonIdx = ch.geometry.index ? ch.geometry.toNonIndexed() : ch.geometry.clone();
          baseNonIdx.applyMatrix4(relM);
          if (groups.length === 0) {
            baseNonIdx.computeBoundingBox();
            if (baseNonIdx.boundingBox) box.union(baseNonIdx.boundingBox);
            items.push({ geom: baseNonIdx, mat: cloneEnvMat(ch.material[0], isBotanicalTree) });
          } else {
            const srcIdx = ch.geometry.index;
            for (const grp of groups) {
              const mSlot = ch.material[grp.materialIndex];
              if (!mSlot || grp.count <= 0) continue;
              const subGeom = new THREE.BufferGeometry();
              for (const attrName of Object.keys(ch.geometry.attributes)) {
                const srcAttr = ch.geometry.attributes[attrName];
                const itemSize = srcAttr.itemSize;
                const outArr = new Float32Array(grp.count * itemSize);
                for (let k = 0; k < grp.count; k++) {
                  const vi = srcIdx ? srcIdx.getX(grp.start + k) : grp.start + k;
                  for (let c = 0; c < itemSize; c++) {
                    outArr[k * itemSize + c] = srcAttr.array[vi * itemSize + c];
                  }
                }
                subGeom.setAttribute(attrName, new THREE.BufferAttribute(outArr, itemSize));
              }
              subGeom.applyMatrix4(relM);
              subGeom.computeBoundingBox();
              if (subGeom.boundingBox) box.union(subGeom.boundingBox);
              items.push({ geom: subGeom, mat: cloneEnvMat(mSlot, isBotanicalTree) });
            }
          }
          return;
        }
        const g = ch.geometry.clone();
        g.applyMatrix4(relM);
        g.computeBoundingBox();
        if (g.boundingBox) box.union(g.boundingBox);
        items.push({ geom: g, mat: cloneEnvMat(ch.material, isBotanicalTree) });
      });
      if (items.length === 0 || box.isEmpty()) return null;

      const minY = box.min.y;
      const rawH = Math.max(0.05, box.max.y - box.min.y);
      let anchorX = 0.5 * (box.min.x + box.max.x);
      let anchorZ = 0.5 * (box.min.z + box.max.z);
      let alignRotY = 0.0;

      if (mode === "cantilever") {
        // Anchor `(0, 0, 0)` to the physical base plate on the sidewalk (`y - minY <= 0.42m`),
        // and rotate cantilevered arm to point along `+Z`!
        let bSumX = 0.0;
        let bSumZ = 0.0;
        let bCnt = 0;
        let tSumX = 0.0;
        let tSumZ = 0.0;
        let tCnt = 0;
        for (const it of items) {
          const pos = it.geom.attributes.position;
          for (let i = 0; i < pos.count; i++) {
            const vx = pos.getX(i);
            const vy = pos.getY(i) - minY;
            const vz = pos.getZ(i);
            if (vy <= Math.min(0.42, rawH * 0.14)) {
              bSumX += vx;
              bSumZ += vz;
              bCnt++;
            } else if (vy >= rawH * 0.65) {
              tSumX += vx;
              tSumZ += vz;
              tCnt++;
            }
          }
        }
        if (bCnt > 0) {
          anchorX = bSumX / bCnt;
          anchorZ = bSumZ / bCnt;
        }
        if (tCnt > 0) {
          const armDX = tSumX / tCnt - anchorX;
          const armDZ = tSumZ / tCnt - anchorZ;
          if (Math.hypot(armDX, armDZ) > 0.16) {
            alignRotY = -Math.atan2(armDX, armDZ);
          }
        }
      } else if (mode === "longX" || mode === "bench") {
        const wX = box.max.x - box.min.x;
        const dZ = box.max.z - box.min.z;
        if (dZ > wX * 1.18) {
          alignRotY = Math.PI * 0.5;
        }
      }

      let uniformScale = 1.0;
      if (nominalHeightRange && nominalHeightRange.length === 2) {
        const [minH, maxH] = nominalHeightRange;
        if (rawH < minH) uniformScale = minH / rawH;
        else if (rawH > maxH) uniformScale = maxH / rawH;
      }

      const normBox = new THREE.Box3();
      const wrap = new THREE.Group();
      for (const it of items) {
        it.geom.translate(-anchorX, -minY, -anchorZ);
        if (Math.abs(alignRotY) > 1e-4) {
          it.geom.rotateY(alignRotY);
        }
        if (Math.abs(uniformScale - 1.0) > 1e-4) {
          it.geom.scale(uniformScale, uniformScale, uniformScale);
        }
        it.geom.computeBoundingBox();
        if (it.geom.boundingBox) normBox.union(it.geom.boundingBox);
        // Preserve smooth Class-A / botanical Blender normals — NEVER overwrite existing GLB normals!
        if (!it.geom.attributes.normal) it.geom.computeVertexNormals();
        else it.geom.normalizeNormals();
        const m = new THREE.Mesh(it.geom, it.mat);
        m.castShadow = true;
        m.receiveShadow = true;
        wrap.add(m);
      }

      // Ensure bench backrest sits at `-Z` so seat faces `+Z` walkway!
      if (mode === "bench") {
        const hNorm = Math.max(0.05, normBox.max.y - normBox.min.y);
        let hiZSum = 0.0;
        let hiCnt = 0;
        for (const ch of wrap.children) {
          const pos = ch.geometry.attributes.position;
          for (let i = 0; i < pos.count; i++) {
            if (pos.getY(i) >= hNorm * 0.62) {
              hiZSum += pos.getZ(i);
              hiCnt++;
            }
          }
        }
        if (hiCnt > 0 && hiZSum / hiCnt > 0.03) {
          normBox.makeEmpty();
          for (const ch of wrap.children) {
            ch.geometry.rotateY(Math.PI);
            ch.geometry.computeBoundingBox();
            if (ch.geometry.boundingBox) normBox.union(ch.geometry.boundingBox);
          }
        }
      }

      bakeStaticGroupByMaterial(wrap);
      const prims = wrap.children
        .filter((c) => c.isMesh && c.geometry && c.material)
        .map((c) => ({ geometry: c.geometry, material: c.material }));

      return prims.length > 0
        ? {
            prims,
            srcW: Math.max(0.1, normBox.max.x - normBox.min.x),
            srcH: Math.max(0.1, normBox.max.y - normBox.min.y),
            srcD: Math.max(0.1, normBox.max.z - normBox.min.z),
          }
        : null;
    };

    // 1. Replace Procedural `CAMPUS_BUILDING_BLOCKS` with `Bldg_MassTimber_Pavilion_V3` & `Bldg_ModernGlass_Wing_V3`
    const timberBldgTpl = extractNormalizedTemplate(
      findEnvNode(["Bldg_MassTimber_Pavilion_V3", "Bldg_MassTimber_Pavilion"]),
      "centered"
    );
    const glassBldgTpl = extractNormalizedTemplate(
      findEnvNode(["Bldg_ModernGlass_Wing_V3", "Bldg_ModernGlass_Wing"]),
      "centered"
    );

    let installedBuildings = false;
    if (timberBldgTpl || glassBldgTpl) {
      if (this.envV3BuildingsGroup && this.envV3BuildingsGroup.parent) {
        this.envV3BuildingsGroup.parent.remove(this.envV3BuildingsGroup);
      }
      const v3BldgRoot = new THREE.Group();
      v3BldgRoot.name = "Campus_Environment_V3_Buildings";

      for (const b of CAMPUS_BUILDING_BLOCKS) {
        if (
          b.id === "bldg_gradient_canopy" ||
          b.id === "bldg_bayview_canopy" ||
          b.id === "bldg_bay_view" ||
          b.style === "dragonscale" ||
          b.style === "solar_carport"
        ) {
          continue;
        }
        const tpl =
          b.style === "timber"
            ? timberBldgTpl || glassBldgTpl
            : glassBldgTpl || timberBldgTpl;
        if (!tpl) continue;

        const bx = b.id === "bldg_north_commons" ? -32.0 : (b.cx ?? b.x ?? 0.0);
        const bz = b.cz ?? b.z ?? 0.0;
        const gy = getOpenWorldEarthHeight(bx, bz);
        const sx = b.wx ?? (b.halfX ? b.halfX * 2.0 : 28.0);
        const sz = b.wz ?? (b.halfZ ? b.halfZ * 2.0 : 24.0);
        const h = b.hy ?? b.heightM ?? 12.0;

        // Align template's longer horizontal axis along `X` (matching all 8 campus setbacks)
        const needQuarterTurn = tpl.srcD > tpl.srcW * 1.05;
        const baseYaw = needQuarterTurn ? Math.PI * 0.5 : 0.0;
        const avenueFlip = bz > 30.0 || (bz < -30.0 && bx < -100.0) ? 0.0 : Math.PI;
        const rotY = baseYaw + avenueFlip;

        const effW = needQuarterTurn ? tpl.srcD : tpl.srcW;
        const effD = needQuarterTurn ? tpl.srcW : tpl.srcD;
        const scaleX = (sx * 0.94) / Math.max(1.0, effW);
        const scaleZ = (sz * 0.94) / Math.max(1.0, effD);
        const scaleY = THREE.MathUtils.clamp(h / Math.max(1.0, tpl.srcH), 0.72, 1.48);

        const blockWrap = new THREE.Group();
        for (const pr of tpl.prims) {
          const m = new THREE.Mesh(pr.geometry.clone(), pr.material);
          m.castShadow = true;
          m.receiveShadow = true;
          blockWrap.add(m);
        }
        blockWrap.scale.set(scaleX, scaleY, scaleZ);
        blockWrap.rotation.y = rotY;
        blockWrap.position.set(bx, gy, bz);
        blockWrap.updateMatrixWorld(true);
        bakeStaticGroupByMaterial(blockWrap);
        blockWrap.traverse((ch) => {
          if (ch.isMesh && ch.geometry) ch.geometry.computeBoundingSphere();
        });
        blockWrap.userData.buildingId = b.id;
        blockWrap.userData.bx = bx;
        blockWrap.userData.bz = bz;
        v3BldgRoot.add(blockWrap);
      }

      if (v3BldgRoot.children.length > 0) {
        v3BldgRoot.matrixAutoUpdate = false;
        v3BldgRoot.updateMatrix();
        this.envV3BuildingsGroup = v3BldgRoot;
        this.root.add(v3BldgRoot);
        if (this.proceduralBuildingsGroup) {
          this.proceduralBuildingsGroup.visible = false;
        }
        installedBuildings = true;
      }
    }

    // 2. GPU-Instance V3 Streetscape Furniture (`Signals`, `Lamps`, `Benches`, `Planters`, `BikeRacks`, `TriBins`)
    const propConfigs = [
      {
        names: ["Traffic_Mast_V4", "Street_Signal_Mast_V3", "Street_Signal_Mast"],
        mode: "cantilever",
        range: [4.2, 7.8],
        placements: this.signalPlacements,
        castShadow: true,
      },
      {
        names: ["Street_Lamp_Modern_V3", "Street_Lamp_Modern"],
        mode: "cantilever",
        range: [3.6, 6.8],
        placements: this.lampPlacements,
        castShadow: true,
      },
      {
        names: ["Campus_Bench_V4", "Campus_Bench_V3", "Campus_Bench"],
        mode: "bench",
        range: [0.65, 1.18],
        placements: this.benchPlacements,
        castShadow: true,
      },
      ...(this._hasV6Planters
        ? []
        : [
            {
              names: ["Campus_Planter_V3", "Campus_Planter"],
              mode: "centered",
              range: [0.55, 1.65],
              placements: this.planterPlacements,
              castShadow: true,
            },
          ]),
      {
        names: ["Campus_Bike_Rack_V4", "Campus_BikeRack_V3", "Campus_BikeRack"],
        mode: "longX",
        range: [0.65, 1.15],
        placements: this.bikeRackPlacements,
        castShadow: false,
      },
      {
        names: ["Campus_TriBin_V3", "Campus_TriBin"],
        mode: "longX",
        range: [0.70, 1.25],
        placements: this.triBinPlacements,
        castShadow: false,
      },
    ];

    let installedPropsCount = 0;
    const v3PropsRoot = new THREE.Group();
    v3PropsRoot.name = "Campus_V3_Furniture_Batches";
    const newPropDynamicBatches = [];

    for (const cfg of propConfigs) {
      if (!cfg.placements || cfg.placements.length === 0) continue;
      const tpl = extractNormalizedTemplate(findEnvNode(cfg.names), cfg.mode, cfg.range);
      if (!tpl) continue;
      installedPropsCount++;

      for (let i = 0; i < cfg.placements.length; i++) {
        const pl = cfg.placements[i];
        if (!pl.mat4) {
          _pos.set(pl.x, pl.y, pl.z);
          _euler.set(0.0, pl.rotY || 0.0, 0.0);
          _quat.setFromEuler(_euler);
          _scale.setScalar(pl.scale || 1.0);
          pl.mat4 = new THREE.Matrix4().compose(_pos, _quat, _scale);
        }
      }

      let baseMeshIndex = 0;
      let lowestMinY = Infinity;
      for (let pIdx = 0; pIdx < tpl.prims.length; pIdx++) {
        const g = tpl.prims[pIdx].geometry;
        if (g && !g.boundingBox) g.computeBoundingBox();
        const minY = g?.boundingBox ? g.boundingBox.min.y : 0.0;
        if (minY < lowestMinY) {
          lowestMinY = minY;
          baseMeshIndex = pIdx;
        }
      }

      const meshes = [];
      for (let pIdx = 0; pIdx < tpl.prims.length; pIdx++) {
        const pr = tpl.prims[pIdx];
        const inst = new THREE.InstancedMesh(pr.geometry, pr.material, cfg.placements.length);
        // Only ground non-cantilevered base meshes (`Traffic_Mast` / `Street_Lamp` cantilever arms extend over asphalt!)
        inst.name =
          cfg.mode !== "cantilever" && pIdx === baseMeshIndex
            ? `${cfg.names[0]}_Base`
            : `${cfg.names[0]}_SubPart_ShadowLinked`;
        inst.castShadow = Boolean(cfg.castShadow) && !this.isSoftwareRenderer;
        inst.receiveShadow = true;
        inst.frustumCulled = false;
        for (let i = 0; i < cfg.placements.length; i++) {
          inst.setMatrixAt(i, cfg.placements[i].mat4);
        }
        inst.instanceMatrix.needsUpdate = true;
        v3PropsRoot.add(inst);
        meshes.push(inst);
      }
      newPropDynamicBatches.push({
        placements: cfg.placements,
        meshes,
        baseMeshIndex,
        mode: cfg.mode,
        castShadow: Boolean(cfg.castShadow) && !this.isSoftwareRenderer,
      });
    }

    if (installedPropsCount > 0) {
      if (this.envV3PropsGroup && this.envV3PropsGroup.parent) {
        this.envV3PropsGroup.parent.remove(this.envV3PropsGroup);
      }
      v3PropsRoot.matrixAutoUpdate = false;
      v3PropsRoot.updateMatrix();
      this.envV3PropsGroup = v3PropsRoot;
      this.propDynamicBatches = newPropDynamicBatches;
      this._cullForceRebuild = true;
      this.root.add(v3PropsRoot);
      if (this.proceduralStreetFurnitureGroup && installedPropsCount >= 4) {
        this.proceduralStreetFurnitureGroup.visible = false;
      }
    }

    // 3. GPU-Instance Blender 5.2 `Tree_CoastLiveOak_V3` & `Tree_CoastRedwood_V3` with Camera View-Cone Compaction!
    const liveOakTpl = extractNormalizedTemplate(
      findEnvNode(["Tree_CoastLiveOak_V3", "Tree_CoastLiveOak"]),
      "centered",
      null,
      true
    );
    const redwoodTpl = extractNormalizedTemplate(
      findEnvNode(["Tree_CoastRedwood_V3", "Tree_CoastRedwood"]),
      "centered",
      null,
      true
    );

    let installedTrees = false;
    if (!this._hasTreesV4 && (liveOakTpl || redwoodTpl) && (this.decTreeTransforms?.length || this.redTreeTransforms?.length)) {
      if (this.envV3TreesGroup && this.envV3TreesGroup.parent) {
        this.envV3TreesGroup.parent.remove(this.envV3TreesGroup);
      }
      const v3TreesRoot = new THREE.Group();
      v3TreesRoot.name = "Campus_Environment_V3_Botanical_Trees";
      const newTreeDynamicBatches = [];

      const buildTreeSpeciesBatch = (sourceTpl, transforms) => {
        if (!sourceTpl || !transforms || transforms.length === 0) return;
        for (let i = 0; i < transforms.length; i++) {
          const tr = transforms[i];
          if (!tr.mat4) {
            _pos.set(tr.x, tr.y, tr.z);
            _euler.set(0.0, tr.ry || 0.0, 0.0);
            _quat.setFromEuler(_euler);
            _scale.setScalar(tr.s || 1.0);
            tr.mat4 = new THREE.Matrix4().compose(_pos, _quat, _scale);
          }
        }
        const meshes = [];
        for (const pr of sourceTpl.prims) {
          const inst = new THREE.InstancedMesh(pr.geometry, pr.material, transforms.length);
          inst.castShadow = !this.isSoftwareRenderer;
          inst.receiveShadow = true;
          inst.frustumCulled = false;
          for (let i = 0; i < transforms.length; i++) {
            inst.setMatrixAt(i, transforms[i].mat4);
          }
          inst.instanceMatrix.needsUpdate = true;
          v3TreesRoot.add(inst);
          meshes.push(inst);
        }
        newTreeDynamicBatches.push({ transforms, meshes });
      };

      buildTreeSpeciesBatch(liveOakTpl || redwoodTpl, this.decTreeTransforms || []);
      buildTreeSpeciesBatch(redwoodTpl || liveOakTpl, this.redTreeTransforms || []);

      if (v3TreesRoot.children.length > 0) {
        v3TreesRoot.matrixAutoUpdate = false;
        v3TreesRoot.updateMatrix();
        this.envV3TreesGroup = v3TreesRoot;
        this.root.add(v3TreesRoot);
        this.treeDynamicBatches = newTreeDynamicBatches;
        this.treeQuadrantBatches = null;
        this._cullForceRebuild = true;
        if (this.proceduralTreesGroup) {
          this.proceduralTreesGroup.visible = false;
        }
        installedTrees = true;
      }
    }

    return installedBuildings || installedPropsCount > 0 || installedTrees;
  }

  // ============================================================================
  // 10D. V4 SHOWROOM SUITES (`props_and_finale_v4`, `trees_v4`, `waymo_gen6_v4`, `gym_interior_v4`)
  // ============================================================================
  applyPropsAndFinaleV4Glb(propsV4Scene) {
    if (!propsV4Scene) return false;
    this._propsV4Scene = propsV4Scene;

    const findNode = (names) => {
      for (const nm of names) {
        const exact = propsV4Scene.getObjectByName(nm);
        if (exact) return exact;
      }
      for (const nm of names) {
        let hit = null;
        propsV4Scene.traverse((n) => {
          if (!hit && n !== propsV4Scene && n.name && n.name.startsWith(nm)) hit = n;
        });
        if (hit) return hit;
      }
      return null;
    };

    const cloneV4NodeAtOrigin = (srcNode) => {
      const cl = srcNode.clone(true);
      cl.position.set(0, 0, 0);
      cl.rotation.set(0, 0, 0);
      cl.scale.set(1, 1, 1);
      const mCache = new Map();
      cl.traverse((ch) => {
        if (!ch.isMesh || !ch.material) return;
        const prepMat = (m) => {
          if (!m) return m;
          if (mCache.has(m.uuid)) return mCache.get(m.uuid);
          const cm = m.clone();
          if (cm.isMeshStandardMaterial || cm.isMeshPhysicalMaterial) {
            cm.envMapIntensity = Math.min(cm.envMapIntensity ?? 1.0, 0.62);
          }
          mCache.set(m.uuid, cm);
          return cm;
        };
        ch.material = Array.isArray(ch.material) ? ch.material.map(prepMat) : prepMat(ch.material);
        ch.castShadow = !this.isSoftwareRenderer;
        ch.receiveShadow = true;
      });
      return cl;
    };

    let installedAny = false;

    // 1. Replace `SHORELINE` with Dimensional `Gemini4_Carbon_Monument_V4` (`1:1:1` uniform Google Sans Flex Bold!)
    const monSrc = findNode(["Gemini4_Carbon_Monument_V4"]);
    if (monSrc) {
      if (this.shorelineMonumentGroup && this.shorelineMonumentGroup.parent) {
        this.shorelineMonumentGroup.parent.remove(this.shorelineMonumentGroup);
      }
      const monClone = cloneV4NodeAtOrigin(monSrc);
      monClone.traverse((ch) => {
        if (!ch.isMesh || !ch.material) return;
        const mats = Array.isArray(ch.material) ? ch.material : [ch.material];
        for (const m of mats) {
          if (!m || !(m.isMeshStandardMaterial || m.isMeshPhysicalMaterial)) continue;
          const mName = m.name || "";
          // Gentle warm dusk bounce on pearl titanium & granite so front faces stay luminous at golden hour
          if (mName.includes("PearlTitanium") || mName.includes("Aluminum") || mName.includes("Pearl")) {
            m.emissive = new THREE.Color("#ffdcad");
            m.emissiveIntensity = Math.max(m.emissiveIntensity || 0.0, 0.16);
          } else if (mName.includes("SierraGranite") || mName.includes("Granite")) {
            m.emissive = new THREE.Color("#cfa87c");
            m.emissiveIntensity = Math.max(m.emissiveIntensity || 0.0, 0.07);
          }
        }
      });
      monClone.updateMatrixWorld(true);
      const monBox = new THREE.Box3().setFromObject(monClone);
      const monWidth = monBox.isEmpty() ? 14.0 : monBox.max.x - monBox.min.x;
      // Keep strict uniform `1:1:1` world scale (`0%` horizontal squish!); position wide 18.6m plinth clear of the R=6.5m medallion!
      const signX = monWidth > 15.0 ? -1.2 : 1.5;
      const signZ = monWidth > 15.0 ? -182.5 : -180.2;
      const signY = getOpenWorldEarthHeight(signX, signZ) + 0.016;
      monClone.scale.set(1.0, 1.0, 1.0);
      monClone.rotation.y = monWidth > 15.0 ? 0.20 : 0.24;
      monClone.position.set(signX, signY - 0.005, signZ);
      monClone.userData.skipGroundingAudit = true;
      monClone.updateMatrixWorld(true);
      monClone.matrixAutoUpdate = false;
      monClone.updateMatrix();
      this.shorelineMonumentGroup = monClone;
      this.root.add(monClone);
      installedAny = true;
    }

    // 2. Line `12` Open-Frame Liquid-Cooled `TPU_Supercluster_Rack_V4` Units Shoulder-to-Shoulder on Shoreline Stage (`x = 18.0, z = -199.5`, facing `+Z`!)
    const rackSrc = findNode(["TPU_Supercluster_Rack_V4", "TPU_Supercluster_Rack_V8", "TPU_Supercluster_Rack"]);
    if (rackSrc) {
      if (this.shorelineProceduralPodsGroup) {
        this.shorelineProceduralPodsGroup.visible = false;
      }
      if (this.shorelinePodsV4Group && this.shorelinePodsV4Group.parent) {
        this.shorelinePodsV4Group.parent.remove(this.shorelinePodsV4Group);
      }
      const v4PodsGroup = new THREE.Group();
      v4PodsGroup.name = "Shoreline_TPU_Supercluster_Racks_V4";
      v4PodsGroup.userData.skipGroundingAudit = true;
      v4PodsGroup.userData.isOpenFrameStageRowV8 = true;

      const probeClone = rackSrc.clone(true);
      probeClone.position.set(0, 0, 0);
      probeClone.rotation.set(0, 0, 0);
      probeClone.scale.set(1, 1, 1);
      probeClone.updateMatrixWorld(true);
      const rackBox = new THREE.Box3().setFromObject(probeClone);
      const rawWidth = rackBox.isEmpty() ? 0.84 : rackBox.max.x - rackBox.min.x;

      const stageSpec = this._shorelineRackStageSpec || {
        centerX: 11.2,
        centerZ: -199.5,
        rackCount: 12,
        rackPitch: 0.84,
        stageDeckY: getOpenWorldEarthHeight(11.2, -199.5) + 0.040,
      };
      const rackCount = stageSpec.rackCount || 12;
      const rackPitch = Math.max(0.80, Math.min(0.88, Number.isFinite(rawWidth) ? rawWidth : 0.84));
      const stageDeckY = stageSpec.stageDeckY;
      this.shorelineRackStatusLedMats = [];

      for (let r = 0; r < rackCount; r++) {
        const rx = stageSpec.centerX + (r - (rackCount - 1) * 0.5) * rackPitch;
        const rz = stageSpec.centerZ;
        const rClone = cloneV4NodeAtOrigin(rackSrc);
        rClone.name = `TPU_Supercluster_Rack_V4_${r + 1}`;
        rClone.userData.skipGroundingAudit = true;
        rClone.userData.hasOpenFrameTrays = true;

        rClone.traverse((ch) => {
          if (!ch.isMesh || !ch.material) return;
          const isStatusLedMesh = /Status_LED|StatusLED/i.test(ch.name || "");
          if (isStatusLedMesh) {
            ch.castShadow = false;
            ch.userData.noCastShadow = true;
          }
          const mats = Array.isArray(ch.material) ? ch.material : [ch.material];
          for (let mIdx = 0; mIdx < mats.length; mIdx++) {
            const m = mats[mIdx];
            if (!m) continue;
            const nm = m.name || "";
            if (nm.includes("SmokedGlass") || ch.name.includes("SmokedGlass")) {
              m.transparent = true;
              m.opacity = 0.08;
              m.depthWrite = false;
              ch.castShadow = false;
            } else if (isStatusLedMesh || /StatusLED/i.test(nm)) {
              ch.castShadow = false;
              ch.userData.noCastShadow = true;
              const ledCloneMat = m.clone();
              ledCloneMat.userData = { ...(ledCloneMat.userData || {}), v7SkipWorldCohesion: true };
              mats[mIdx] = ledCloneMat;
              this.shorelineRackStatusLedMats.push({
                mat: ledCloneMat,
                rackIdx: r,
                slotIdx: mIdx,
                baseHex: ledCloneMat.emissive ? ledCloneMat.emissive.getHex() : 0x00e676,
              });
            }
          }
          if (Array.isArray(ch.material)) {
            ch.material = mats;
          } else if (mats[0]) {
            ch.material = mats[0];
          }
        });

        rClone.scale.set(1.0, 1.0, 1.0);
        rClone.rotation.y = 0.0; // Open-frame TPU bay faces `+Z` toward Shoreline audience & plaza!
        rClone.position.set(rx, stageDeckY, rz);
        v4PodsGroup.add(rClone);
      }

      v4PodsGroup.updateMatrixWorld(true);
      v4PodsGroup.matrixAutoUpdate = false;
      v4PodsGroup.updateMatrix();
      this.shorelinePodsV4Group = v4PodsGroup;
      this.shorelinePodsGroup = v4PodsGroup;
      this.root.add(v4PodsGroup);
      this._syncTpu8iLandmarkShowcase();
      installedAny = true;
    }

    // 3. Upgrade All `JUMP_RAMPS` to `Campus_Jump_Ramp_V4` (`3.80m W × 1.15m H × 6.00m L`, launch `-Z`)
    const rampV4Src = findNode(["Campus_Jump_Ramp_V4"]);
    if (rampV4Src) {
      if (this.allRampsFallbackGroup) this.allRampsFallbackGroup.visible = false;
      if (this.allRampsV2Group) this.allRampsV2Group.visible = false;
      if (this.allRampsV4Group && this.allRampsV4Group.parent) {
        this.allRampsV4Group.parent.remove(this.allRampsV4Group);
      }
      const rampsV4Group = new THREE.Group();
      rampsV4Group.name = "Campus_Jump_Ramps_V4";
      for (const rp of JUMP_RAMPS) {
        const fwdX = Math.sin(rp.headingYaw);
        const fwdZ = -Math.cos(rp.headingYaw);
        const halfL = rp.lengthM * 0.5;
        const baseGround =
          getOpenWorldEarthHeight(
            rp.x - fwdX * (halfL + 0.6),
            rp.z - fwdZ * (halfL + 0.6)
          ) + 0.016;
        const rClone = cloneV4NodeAtOrigin(rampV4Src);
        rClone.scale.set(rp.widthM / 3.80, rp.heightM / 1.15, rp.lengthM / 6.00);
        rClone.rotation.y = -rp.headingYaw;
        rClone.position.set(rp.x, baseGround, rp.z);
        rampsV4Group.add(rClone);
      }
      bakeStaticGroupByMaterial(rampsV4Group);
      rampsV4Group.matrixAutoUpdate = false;
      rampsV4Group.updateMatrix();
      this.allRampsV4Group = rampsV4Group;
      this.root.add(rampsV4Group);
      installedAny = true;
    }

    // 4. Refresh GPU-Instanced Streetscape Props (`Traffic_Mast_V4`, `Campus_Bench_V4`, `Campus_Bike_Rack_V4`)
    if (this._envV3Scene) {
      this.applyCampusEnvironmentV3Glb(this._envV3Scene);
    } else {
      this.applyCampusEnvironmentV3Glb(null);
    }

    return installedAny;
  }

  /**
   * Attaches Botanical `trees_v4.glb` (`Tree_CoastLiveOak_V4` & `Tree_CoastRedwood_V4`) with gnarled
   * root flares and dilated RGBA `MASK` branchlet/needle foliage cards across the 480m × 480m campus.
   */
  applyTreesV4Glb(treesV4Scene) {
    if (!treesV4Scene) return false;

    const findTreeNode = (names) => {
      for (const nm of names) {
        const exact = treesV4Scene.getObjectByName(nm);
        if (exact) return exact;
      }
      for (const nm of names) {
        let hit = null;
        treesV4Scene.traverse((n) => {
          if (!hit && n !== treesV4Scene && n.name && n.name.startsWith(nm)) hit = n;
        });
        if (hit) return hit;
      }
      return null;
    };

    const matMap = new Map();
    const prepTreeMat = (m, meshName = "") => {
      if (!m) return m;
      if (matMap.has(m.uuid)) return matMap.get(m.uuid);
      const cm = m.clone();
      const nm = `${cm.name || ""} ${meshName}`;
      const isFoliage =
        /Foliage|Leaf|Crown|Spray|Needle/i.test(nm) ||
        (cm.alphaTest ?? 0) > 0.01 ||
        Boolean(cm.transparent);
      if (cm.isMeshStandardMaterial || cm.isMeshPhysicalMaterial) {
        if (isFoliage) {
          cm.alphaTest = 0.42;
          cm.transparent = false;
          cm.depthWrite = true;
          cm.side = THREE.DoubleSide;
          cm.roughness = 0.68;
          cm.metalness = 0.0;
          cm.envMapIntensity = 0.54;
          cm.emissive = new THREE.Color("#1e3015");
          cm.emissiveIntensity = 0.14;
        } else {
          cm.roughness = 0.88;
          cm.metalness = 0.0;
          cm.envMapIntensity = 0.42;
        }
        cm.needsUpdate = true;
      }
      matMap.set(m.uuid, cm);
      return cm;
    };

    const extractTreeSpecies = (srcNode) => {
      if (!srcNode) return null;
      const cl = srcNode.clone(true);
      cl.position.set(0, 0, 0);
      cl.rotation.set(0, 0, 0);
      cl.scale.set(1, 1, 1);
      cl.updateMatrixWorld(true);
      const rootInv = new THREE.Matrix4().copy(cl.matrixWorld).invert();
      const box = new THREE.Box3();
      const items = [];
      cl.traverse((ch) => {
        if (!ch.isMesh || !ch.geometry || !ch.material || Array.isArray(ch.material)) return;
        const relM = new THREE.Matrix4().multiplyMatrices(rootInv, ch.matrixWorld);
        const g = ch.geometry.clone();
        g.applyMatrix4(relM);
        g.computeBoundingBox();
        if (g.boundingBox) box.union(g.boundingBox);
        items.push({ geom: g, mat: prepTreeMat(ch.material, ch.name) });
      });
      if (!items.length || box.isEmpty()) return null;

      const anchorX = 0.5 * (box.min.x + box.max.x);
      const anchorZ = 0.5 * (box.min.z + box.max.z);
      const minY = box.min.y;
      const wrap = new THREE.Group();
      for (const it of items) {
        // Embed buttress roots -3.5cm into terrain for seamless grounding on gentle hills
        it.geom.translate(-anchorX, -minY - 0.035, -anchorZ);
        if (!it.geom.attributes.normal) it.geom.computeVertexNormals();
        else it.geom.normalizeNormals();
        wrap.add(new THREE.Mesh(it.geom, it.mat));
      }
      bakeStaticGroupByMaterial(wrap);
      const prims = wrap.children
        .filter((c) => c.isMesh && c.geometry && c.material)
        .map((c) => ({ geometry: c.geometry, material: c.material }));
      return prims.length ? { prims } : null;
    };

    const oakTpl = extractTreeSpecies(findTreeNode(["Tree_CoastLiveOak_V4", "Oak_TrunkAndLimbs_V4"]));
    const redwoodTpl = extractTreeSpecies(findTreeNode(["Tree_CoastRedwood_V4", "Redwood_TrunkAndBoughs_V4"]));
    if (!oakTpl && !redwoodTpl) return false;

    if (this.envV3TreesGroup && this.envV3TreesGroup.parent) {
      this.envV3TreesGroup.parent.remove(this.envV3TreesGroup);
    }
    const v4TreesRoot = new THREE.Group();
    v4TreesRoot.name = "Campus_Arboretum_Container";
    const newTreeDynamicBatches = [];

    const buildBatch = (tpl, transforms, speciesTag) => {
      if (!tpl || !transforms || !transforms.length) return;
      for (let i = 0; i < transforms.length; i++) {
        const tr = transforms[i];
        if (!tr.mat4) {
          _pos.set(tr.x, tr.y, tr.z);
          _euler.set(0.0, tr.ry || 0.0, 0.0);
          _quat.setFromEuler(_euler);
          _scale.setScalar(tr.s || 1.0);
          tr.mat4 = new THREE.Matrix4().compose(_pos, _quat, _scale);
        }
      }
      let baseMeshIndex = 0;
      let lowestMinY = Infinity;
      for (let pIdx = 0; pIdx < tpl.prims.length; pIdx++) {
        const g = tpl.prims[pIdx].geometry;
        if (g && !g.boundingBox) g.computeBoundingBox();
        const minY = g?.boundingBox ? g.boundingBox.min.y : 0.0;
        if (minY < lowestMinY) {
          lowestMinY = minY;
          baseMeshIndex = pIdx;
        }
      }
      const meshes = [];
      const farMeshes = [];
      for (let pIdx = 0; pIdx < tpl.prims.length; pIdx++) {
        const pr = tpl.prims[pIdx];
        const inst = new THREE.InstancedMesh(pr.geometry, pr.material, transforms.length);
        inst.name =
          pIdx === baseMeshIndex
            ? `${speciesTag}_TrunkBase`
            : `${speciesTag}_Canopy_ShadowLinked`;
        inst.castShadow = true;
        inst.receiveShadow = true;
        inst.frustumCulled = false;
        for (let i = 0; i < transforms.length; i++) {
          inst.setMatrixAt(i, transforms[i].mat4);
        }
        inst.instanceMatrix.needsUpdate = true;
        v4TreesRoot.add(inst);
        meshes.push(inst);

        // Paired far-view (>60m outside sun shadow frustum) non-shadow InstancedMesh — saves ~750k wasted shadow-map triangles!
        const farInst = new THREE.InstancedMesh(pr.geometry, pr.material, transforms.length);
        farInst.name = `${speciesTag}_FarView_${pIdx}`;
        farInst.userData.skipGroundingAudit = true;
        farInst.castShadow = false;
        farInst.receiveShadow = false;
        farInst.frustumCulled = false;
        farInst.count = 0;
        farInst.visible = false;
        v4TreesRoot.add(farInst);
        farMeshes.push(farInst);
      }
      newTreeDynamicBatches.push({ transforms, meshes, farMeshes, baseMeshIndex });
    };

    buildBatch(oakTpl || redwoodTpl, this.decTreeTransforms || [], "Tree_CoastLiveOak_V4");
    buildBatch(redwoodTpl || oakTpl, this.redTreeTransforms || [], "Tree_CoastRedwood_V4");

    if (v4TreesRoot.children.length > 0) {
      v4TreesRoot.matrixAutoUpdate = false;
      v4TreesRoot.updateMatrix();
      this.envV3TreesGroup = v4TreesRoot;
      this.root.add(v4TreesRoot);
      this.treeDynamicBatches = newTreeDynamicBatches;
      this.treeQuadrantBatches = null;
      this._cullForceRebuild = true;
      if (this.proceduralTreesGroup) {
        this.proceduralTreesGroup.visible = false;
      }
      this._hasTreesV4 = true;
      return true;
    }
    return false;
  }

  /**
   * Attaches `Waymo_Gen6_V4` Ojai (Zeekr CM1e) in Waymo's icy sky-blue metallic clearcoat (`#A4C7DF`)
   * with translucent smoked cabin glass (`alphaMode: BLEND`) revealing the 4-seat passenger lounge,
   * 3D wraparound Stargate visor, 6th-gen LiDAR/camera pods, and 10-spoke alloy wheels.
   */
  applyWaymoGen6V4Glb(waymoV4Scene) {
    if (!waymoV4Scene) return false;

    const findSub = (root, patterns) => {
      for (const pat of patterns) {
        const exact = root.getObjectByName(pat);
        if (exact) return exact;
      }
      for (const pat of patterns) {
        let hit = null;
        root.traverse((n) => {
          if (!hit && n !== root && n.name && n.name.startsWith(pat)) hit = n;
        });
        if (hit) return hit;
      }
      return null;
    };

    const srcRoot = findSub(waymoV4Scene, ["Waymo_Gen6_V4", "Waymo_Gen6"]) || waymoV4Scene;
    const matMap = new Map();
    const waymoClone = srcRoot.clone(true);
    waymoClone.position.set(0, 0, 0);
    waymoClone.rotation.set(0, 0, 0);
    waymoClone.scale.set(1, 1, 1);

    waymoClone.traverse((ch) => {
      if (!ch.isMesh || !ch.material) return;
      const cloneMat = (m) => {
        if (!m) return m;
        if (matMap.has(m.uuid)) return matMap.get(m.uuid);
        const cm = m.clone();
        const nm = `${cm.name || ""} ${ch.name || ""}`;
        const isCabinGlass =
          Boolean(cm.transparent) || /Cabin_Glass|Window_Glass|SmokedGlass|CabinGlass/i.test(nm);
        if (cm.isMeshStandardMaterial || cm.isMeshPhysicalMaterial) {
          if (isCabinGlass) {
            // Neutral smoked automotive glass (`opacity = 0.30`) preserving the warm saddle-tan (`#A57554`) 4-seat lounge!
            cm.map = null;
            cm.alphaMap = null;
            cm.roughnessMap = null;
            cm.metalnessMap = null;
            cm.emissiveMap = null;
            cm.color.setHex(0x1c242e);
            if (cm.emissive) cm.emissive.setHex(0x070c12);
            cm.emissiveIntensity = 0.06;
            cm.transparent = true;
            cm.opacity = 0.30;
            cm.depthWrite = false;
            cm.roughness = 0.06;
            cm.metalness = 0.14;
            cm.envMapIntensity = 1.15;
          } else {
            // Preserve crisp Waymo Gen 6 Ojai icy sky-blue metallic clearcoat (`#A4C7DF`) under warm golden-hour campus sun
            cm.color.setHex(0xc2e4fb);
            cm.roughness = Math.min(cm.roughness ?? 0.34, 0.30);
            cm.envMapIntensity = 0.92;
          }
          cm.needsUpdate = true;
        }
        matMap.set(m.uuid, cm);
        return cm;
      };
      ch.material = Array.isArray(ch.material) ? ch.material.map(cloneMat) : cloneMat(ch.material);
      ch.castShadow = true;
      ch.receiveShadow = true;
    });

    waymoClone.updateMatrixWorld(true);
    const rootInv = new THREE.Matrix4().copy(waymoClone.matrixWorld).invert();
    const fullBox = new THREE.Box3().setFromObject(waymoClone);
    const groundShiftY = Number.isFinite(fullBox.min.y) ? -fullBox.min.y : 0.0;

    const domeNode = findSub(waymoClone, [
      "Waymo_Lidar_Dome_V4",
      "Waymo_Lidar_Dome_V3",
      "Waymo_Lidar_Dome",
      "Lidar_Dome",
    ]);
    let flNode = findSub(waymoClone, ["Waymo_Wheel_FL_V4", "Waymo_Wheel_FL", "Wheel_FL"]);
    let frNode = findSub(waymoClone, ["Waymo_Wheel_FR_V4", "Waymo_Wheel_FR", "Wheel_FR"]);
    let rlNode = findSub(waymoClone, ["Waymo_Wheel_RL_V4", "Waymo_Wheel_RL", "Wheel_RL"]);
    let rrNode = findSub(waymoClone, ["Waymo_Wheel_RR_V4", "Waymo_Wheel_RR", "Wheel_RR"]);

    if (!flNode || !frNode || !rlNode || !rrNode) {
      const wheelCandidates = [];
      waymoClone.traverse((n) => {
        if (n !== waymoClone && n.name && /Wheel/i.test(n.name) && (!n.parent || !/Wheel/i.test(n.parent.name || ""))) {
          const b = new THREE.Box3().setFromObject(n);
          const c = new THREE.Vector3();
          b.getCenter(c);
          wheelCandidates.push({ node: n, cx: c.x, cz: c.z });
        }
      });
      if (wheelCandidates.length >= 4) {
        const lefts = wheelCandidates.filter((w) => w.cx <= 0).sort((a, b) => b.cz - a.cz);
        const rights = wheelCandidates.filter((w) => w.cx > 0).sort((a, b) => b.cz - a.cz);
        if (lefts.length >= 2 && rights.length >= 2) {
          flNode = flNode || lefts[0].node;
          rlNode = rlNode || lefts[lefts.length - 1].node;
          frNode = frNode || rights[0].node;
          rrNode = rrNode || rights[rights.length - 1].node;
        }
      }
    }

    const extractPartSubtree = (partNode, isDome = false) => {
      if (!partNode) return null;
      const rawMeshes = [];
      partNode.traverse((ch) => {
        if (!ch.isMesh || !ch.geometry || !ch.material) return;
        const relM = new THREE.Matrix4().multiplyMatrices(rootInv, ch.matrixWorld);
        if (Array.isArray(ch.material)) return;
        const g = ch.geometry.clone();
        g.applyMatrix4(relM);
        g.translate(0.0, groundShiftY, 0.0);
        g.computeBoundingBox();
        rawMeshes.push({ geom: g, mat: ch.material });
      });
      if (partNode.parent) partNode.parent.remove(partNode);
      if (rawMeshes.length === 0) return null;

      const box = new THREE.Box3();
      for (const rm of rawMeshes) {
        if (rm.geom.boundingBox) box.union(rm.geom.boundingBox);
      }
      const pivot = new THREE.Vector3(
        0.5 * (box.min.x + box.max.x),
        isDome ? box.min.y : 0.5 * (box.min.y + box.max.y),
        0.5 * (box.min.z + box.max.z)
      );
      const tireRadius = 0.5 * Math.max(0.05, box.max.y - box.min.y);

      const wrap = new THREE.Group();
      for (const rm of rawMeshes) {
        rm.geom.translate(-pivot.x, -pivot.y, -pivot.z);
        if (!rm.geom.attributes.normal) rm.geom.computeVertexNormals();
        else rm.geom.normalizeNormals();
        wrap.add(new THREE.Mesh(rm.geom, rm.mat));
      }
      bakeStaticGroupByMaterial(wrap);
      const prims = wrap.children
        .filter((c) => c.isMesh && c.geometry && c.material)
        .map((c) => ({ geometry: c.geometry, material: c.material }));

      return prims.length > 0 ? { prims, pivot, box, tireRadius } : null;
    };

    const domeInfo = extractPartSubtree(domeNode, true);
    const flInfo = extractPartSubtree(flNode, false);
    const frInfo = extractPartSubtree(frNode, false);
    const rlInfo = extractPartSubtree(rlNode, false);
    const rrInfo = extractPartSubtree(rrNode, false);

    // Separate opaque chassis/interior meshes from translucent cabin glass so glass renders AFTER interior!
    const opaqueWrap = new THREE.Group();
    const glassWrap = new THREE.Group();
    waymoClone.updateMatrixWorld(true);
    const bodyRootInv = new THREE.Matrix4().copy(waymoClone.matrixWorld).invert();
    waymoClone.traverse((ch) => {
      if (!ch.isMesh || !ch.geometry || !ch.material || Array.isArray(ch.material)) return;
      const relM = new THREE.Matrix4().multiplyMatrices(bodyRootInv, ch.matrixWorld);
      const g = ch.geometry.clone();
      g.applyMatrix4(relM);
      g.translate(0.0, groundShiftY, 0.0);
      if (!g.attributes.normal) g.computeVertexNormals();
      else g.normalizeNormals();
      const targetWrap = ch.material.transparent ? glassWrap : opaqueWrap;
      targetWrap.add(new THREE.Mesh(g, ch.material));
    });
    bakeStaticGroupByMaterial(opaqueWrap);
    bakeStaticGroupByMaterial(glassWrap);

    const bodyPrims = [
      ...opaqueWrap.children
        .filter((c) => c.isMesh && c.geometry && c.material)
        .map((c) => ({ geometry: c.geometry, material: c.material, isGlass: false })),
      ...glassWrap.children
        .filter((c) => c.isMesh && c.geometry && c.material)
        .map((c) => ({ geometry: c.geometry, material: c.material, isGlass: true })),
    ];

    const leftWheelSource = flInfo || rlInfo;
    const rightWheelSource = frInfo || rrInfo;
    if (!bodyPrims.length || !domeInfo || !leftWheelSource || !rightWheelSource) {
      return false;
    }

    const leftOffsets = [flInfo?.pivot, rlInfo?.pivot].filter(Boolean);
    const rightOffsets = [frInfo?.pivot, rrInfo?.pivot].filter(Boolean);
    const radii = [flInfo, frInfo, rlInfo, rrInfo].filter(Boolean).map((w) => w.tireRadius);
    const measuredTireRadius =
      radii.length > 0
        ? THREE.MathUtils.clamp(radii.reduce((acc, v) => acc + v, 0.0) / radii.length, 0.24, 0.52)
        : 0.375;

    const frontMeanZ = ((flInfo ? flInfo.pivot.z : 0) + (frInfo ? frInfo.pivot.z : 0)) * 0.5;
    const rearMeanZ = ((rlInfo ? rlInfo.pivot.z : 0) + (rrInfo ? rrInfo.pivot.z : 0)) * 0.5;
    const facesPosZ = flInfo && rlInfo ? frontMeanZ >= rearMeanZ : true;

    this._clearWaymoInstancedBatches();
    const ok = this._installWaymoFleetBatches({
      bodyPrims,
      domePrims: domeInfo.prims,
      leftWheelPrims: leftWheelSource.prims,
      rightWheelPrims: rightWheelSource.prims,
      domeLocalPos: domeInfo.pivot,
      leftOffsets,
      rightOffsets,
      wheelRadius: measuredTireRadius,
      modelYawOffset: facesPosZ ? Math.PI : 0.0,
      wheelSpinSign: facesPosZ ? 1.0 : -1.0,
    });

    if (ok) {
      for (const bInst of this.waymoBodyBatches) {
        if (bInst && bInst.material && bInst.material.transparent) {
          bInst.renderOrder = 5;
          bInst.castShadow = false;
        }
      }
      this._hasWaymoGen6V4 = true;
      this._hasWaymoGen6V3 = true;
      if (this._lastHeroSnap) {
        this.update(0.0, this._lastHeroSnap, this._lastGlobalState || { elapsedTime: 0.0, tpuLedger: [] });
      }
    }
    return ok;
  }

  /**
   * Attaches Luxury Google Spin & Fitness Studio `gym_interior_v4.glb` (`Gym_Foreground_Weights_V4`,
   * `Gym_Studio_Spin_Bike_V4`, `Gym_Dumbbell_Rack_V4`, `Gym_Power_Squat_Rack_V4`, `Gym_Wall_Clock_V4`).
   */
  applyGymInteriorV4Glb(gymV4Scene) {
    if (!gymV4Scene || !this.gymInteriorGroup) return false;

    const findGymNode = (names) => {
      for (const nm of names) {
        const exact = gymV4Scene.getObjectByName(nm);
        if (exact) return exact;
      }
      for (const nm of names) {
        let hit = null;
        gymV4Scene.traverse((n) => {
          if (!hit && n !== gymV4Scene && n.name && n.name.startsWith(nm)) hit = n;
        });
        if (hit) return hit;
      }
      return null;
    };

    const mCache = new Map();
    const cloneGymProp = (srcNode) => {
      if (!srcNode) return null;
      const cl = srcNode.clone(true);
      cl.position.set(0, 0, 0);
      cl.rotation.set(0, 0, 0);
      cl.scale.set(1, 1, 1);
      cl.traverse((ch) => {
        if (!ch.isMesh || !ch.material) return;
        const prep = (m) => {
          if (!m) return m;
          if (mCache.has(m.uuid)) return mCache.get(m.uuid);
          const cm = m.clone();
          if (cm.isMeshStandardMaterial || cm.isMeshPhysicalMaterial) {
            cm.envMapIntensity = Math.min(cm.envMapIntensity ?? 1.0, 0.58);
          }
          mCache.set(m.uuid, cm);
          return cm;
        };
        ch.material = Array.isArray(ch.material) ? ch.material.map(prep) : prep(ch.material);
        ch.castShadow = !this.isSoftwareRenderer;
        ch.receiveShadow = true;
      });
      return cl;
    };

    const weightsSrc = findGymNode(["Gym_Foreground_Weights_V4"]);
    const spinBikeSrc = findGymNode(["Gym_Studio_Spin_Bike_V4"]);
    const dbRackSrc = findGymNode(["Gym_Dumbbell_Rack_V4"]);
    const squatRackSrc = findGymNode(["Gym_Power_Squat_Rack_V4"]);
    const clockSrc = findGymNode(["Gym_Wall_Clock_V4"]);
    if (!weightsSrc && !spinBikeSrc && !dbRackSrc && !squatRackSrc && !clockSrc) return false;

    if (this.gymProceduralEquipmentGroup) {
      this.gymProceduralEquipmentGroup.visible = false;
    }
    if (this.gymSpareTrainerAnchor) {
      this.gymSpareTrainerAnchor.visible = false;
    }
    if (this.gymV4PropsGroup && this.gymV4PropsGroup.parent) {
      this.gymV4PropsGroup.parent.remove(this.gymV4PropsGroup);
    }

    const v4GymGroup = new THREE.Group();
    v4GymGroup.name = "Fitness_Gym_Studio_Props_V4";
    const placeProp = (src, x, y, z, rotY = 0.0, scale = 1.0, groundToY = true) => {
      if (!src) return;
      const cl = cloneGymProp(src);
      if (!cl) return;
      cl.scale.setScalar(scale);
      cl.rotation.y = rotY;
      cl.position.set(x, y, z);
      if (groundToY) {
        groundObjectToY(cl, y, 0.0);
      }
      v4GymGroup.add(cl);
    };

    // 1. Beat 1 Spin-Ad Floor Macro Foreground Kettlebells + Hex Dumbbells + Shaker flanking lower-left & lower-right thirds
    // so the smoking rear tire, red trainer roller, chainstay, and pumping webbed foot have a 100% clear center sightline!
    placeProp(weightsSrc, 0.48, 0.008, 141.66, 0.68, 0.84, true);
    placeProp(weightsSrc, 1.72, 0.008, 141.22, -0.78, 0.80, true);
    placeProp(weightsSrc, -1.55, 0.008, 139.25, 0.52, 0.94, true);

    // 2. 6 Luxury Studio Spin Bikes flanking Pelican (`(0, 140.5)`) facing North (`-Z` -> `rotY = Math.PI ± fan`)
    const spinPlacements = [
      [-2.35, 140.85, Math.PI - 0.06],
      [2.35, 140.85, Math.PI + 0.06],
      [-4.15, 142.05, Math.PI - 0.10],
      [4.15, 142.05, Math.PI + 0.10],
      [-2.95, 143.45, Math.PI - 0.05],
      [2.95, 143.45, Math.PI + 0.05],
    ];
    for (const [sx, sz, sRot] of spinPlacements) {
      placeProp(spinBikeSrc, sx, 0.008, sz, sRot, 1.0, true);
    }

    // 3. 2 Olympic Power Squat Cages with Colorful Bumper Plates in SW & SE Studio Corners
    placeProp(squatRackSrc, -5.85, 0.008, 145.55, Math.PI - 0.16, 1.0, true);
    placeProp(squatRackSrc, 5.85, 0.008, 145.55, Math.PI + 0.16, 1.0, true);

    // 4. 2 Two-Tier Commercial Hex Dumbbell Racks along West & East Acoustic Cedar Walls
    placeProp(dbRackSrc, -6.82, 0.008, 137.40, Math.PI * 0.5, 1.0, true);
    placeProp(dbRackSrc, 6.82, 0.008, 137.40, -Math.PI * 0.5, 1.0, true);

    // 5. Glowing Digital Interval Wall Clocks (`04:45` + `52 RPM`) above North Window & on South Wall
    const makeCleanClockOverlay = () => {
      if (typeof document === "undefined") return null;
      const cv = document.createElement("canvas");
      cv.width = 512;
      cv.height = 144;
      const ctx = cv.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = "#0b0d11";
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 3;
      ctx.strokeRect(4, 4, cv.width - 8, cv.height - 8);
      ctx.font = "700 84px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#ff4d38";
      ctx.shadowColor = "rgba(255, 68, 44, 0.55)";
      ctx.shadowBlur = 12;
      ctx.fillText("04:45", 32, 74);
      ctx.fillStyle = "#fbbf24";
      ctx.shadowColor = "rgba(251, 191, 36, 0.50)";
      ctx.font = "700 58px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillText("52 RPM", 304, 76);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.872, 0.232), m);
      plane.position.set(0.0, 0.14, 0.036);
      plane.name = "GymClockCleanFaceOverlay";
      return plane;
    };
    const placeClockWithCleanFace = (x, y, z, rotY) => {
      if (!clockSrc) return;
      const cl = cloneGymProp(clockSrc);
      if (!cl) return;
      const overlay = makeCleanClockOverlay();
      if (overlay) cl.add(overlay);
      cl.rotation.y = rotY;
      cl.position.set(x, y, z);
      v4GymGroup.add(cl);
    };
    placeClockWithCleanFace(0.0, 4.16, 131.36, 0.0);
    placeClockWithCleanFace(3.35, 2.58, 148.22, Math.PI);

    bakeStaticGroupByMaterial(v4GymGroup);
    v4GymGroup.matrixAutoUpdate = false;
    v4GymGroup.updateMatrix();
    this.gymV4PropsGroup = v4GymGroup;
    this.gymInteriorGroup.add(v4GymGroup);
    return true;
  }

  // ============================================================================
  // 10B. V5 LUXURY SPIN STUDIO, ARTICULATED STAN T-REX, OFFICE PAVILIONS & SANTA CRUZ HORIZON
  // ============================================================================
  applyGymInteriorV5Glb(gymV5Scene) {
    if (!gymV5Scene || !this.gymInteriorGroup) return false;
    if (this.gymProceduralEquipmentGroup) {
      this.gymProceduralEquipmentGroup.visible = false;
    }
    if (this.gymV4PropsGroup) {
      this.gymV4PropsGroup.visible = false;
      this.gymInteriorGroup.remove(this.gymV4PropsGroup);
      this.gymV4PropsGroup = null;
    }
    if (this.gymV5PropsGroup) {
      this.gymInteriorGroup.remove(this.gymV5PropsGroup);
    }

    const v5GymGroup = new THREE.Group();
    v5GymGroup.name = "Fitness_Gym_Studio_Props_V5";
    const floorTopY = 0.007; // Exact EPDM gym floor topY matching getDefaultCampusSurfaceTopY

    const findProto = (name) => {
      let hit = null;
      gymV5Scene.traverse((ch) => {
        if (!hit && ch.name === name) hit = ch;
      });
      return hit;
    };

    const spawnProp = (proto, instName, px, py, pz, rotY = 0.0, scale = 1.0, groundToFloor = true) => {
      if (!proto) return null;
      const clone = proto.clone(true);
      clone.name = instName;
      clone.position.set(px, py, pz);
      clone.rotation.set(0.0, rotY, 0.0);
      clone.scale.setScalar(scale);
      clone.traverse((ch) => {
        if (ch.isMesh) {
          ch.castShadow = true;
          ch.receiveShadow = true;
          if (ch.material && ch.material.isMeshStandardMaterial) {
            ch.material.envMapIntensity = Math.max(ch.material.envMapIntensity ?? 1.0, 1.15);
          }
        }
      });
      if (groundToFloor) {
        groundObjectToY(clone, floorTopY, 0.0);
      }
      v5GymGroup.add(clone);
      return clone;
    };

    const dumbbell59Proto = findProto("Gym_Hex_Dumbbell_59AA_Flat_V5");
    const kettlebellProto = findProto("Gym_Kettlebell_Set_V5");
    const spinBikeProto = findProto("Gym_Studio_Spin_Bike_V5");
    const rackProto = findProto("Gym_Dumbbell_Rack_V5");
    const squatRackProto = findProto("Gym_Power_Squat_Rack_V5");
    const clockProto = findProto("Gym_Wall_Clock_V5");

    // 1. Hero Flat Hex Dumbbell `59 / AA` in lower-right foreground of Shot 1 (`0.0-3.2s`, `0.0mm` float, neutral `#181A1D` charcoal urethane!)
    const dbHeroInst = spawnProp(
      dumbbell59Proto,
      "Gym_Hex_Dumbbell_59AA_Flat_V5",
      0.76,
      floorTopY,
      141.58,
      0.26,
      1.0,
      true
    );
    if (dbHeroInst) {
      dbHeroInst.traverse((ch) => {
        if (!ch.isMesh || !ch.material) return;
        const cloneDbMat = (m) => {
          if (!m) return m;
          const cm = m.clone();
          cm.userData = cm.userData || {};
          cm.userData.v7SkipWorldCohesion = true;
          if (this.dayEnvMap) cm.envMap = this.dayEnvMap;
          cm.envMapIntensity = 0.95;
          if (cm.map) {
            cm.emissiveMap = cm.map;
            cm.emissive = new THREE.Color("#e8eef6");
            cm.emissiveIntensity = 0.34;
          }
          return cm;
        };
        ch.material = Array.isArray(ch.material) ? ch.material.map(cloneDbMat) : cloneDbMat(ch.material);
      });
    }

    // 2. Cast-iron Competition Kettlebell Pairs
    spawnProp(kettlebellProto, "Gym_Kettlebell_Set_V5_Left", -1.55, floorTopY, 139.25, 0.52, 1.0, true);
    spawnProp(kettlebellProto, "Gym_Kettlebell_Set_V5_Right", 1.82, floorTopY, 141.18, -0.78, 1.0, true);

    // 3. 6 Boutique Studio Spin Bikes flanking Pelican (`|x| >= 2.85m` so window breakout corridor stays 100% clear)
    const bikePlacements = [
      [-3.25, 141.4, Math.PI + 0.16],
      [-5.45, 142.8, Math.PI + 0.12],
      [-2.85, 136.4, Math.PI + 0.08],
      [3.25, 141.4, Math.PI - 0.16],
      [5.45, 142.8, Math.PI - 0.12],
      [2.85, 136.4, Math.PI - 0.08],
    ];
    for (let i = 0; i < bikePlacements.length; i++) {
      const [bx, bz, byaw] = bikePlacements[i];
      spawnProp(spinBikeProto, `Gym_Studio_Spin_Bike_V5_${i}`, bx, floorTopY, bz, byaw, 1.0, true);
    }

    // 4. Power Squat Racks & 2-Tier Hex Dumbbell Racks along studio perimeter
    spawnProp(squatRackProto, "Gym_Power_Squat_Rack_V5_West", -4.65, floorTopY, 145.6, Math.PI * 0.5, 1.0, true);
    spawnProp(squatRackProto, "Gym_Power_Squat_Rack_V5_East", 4.65, floorTopY, 145.6, -Math.PI * 0.5, 1.0, true);
    spawnProp(rackProto, "Gym_Dumbbell_Rack_V5_West", -6.65, floorTopY, 139.5, Math.PI * 0.5, 1.0, true);
    spawnProp(rackProto, "Gym_Dumbbell_Rack_V5_East", 6.65, floorTopY, 139.5, -Math.PI * 0.5, 1.0, true);

    // 5. Brushed-Aluminum Digital Studio Wall Clocks (with live V6 `04:45 | 36 -> 168 RPM` dynamic LED face!)
    if (!this.gymDigitalClockCanvas && typeof document !== "undefined") {
      const cv = document.createElement("canvas");
      cv.width = 512;
      cv.height = 144;
      this.gymDigitalClockCanvas = cv;
      this.gymDigitalClockCtx = cv.getContext("2d");
      this.gymDigitalClockTex = new THREE.CanvasTexture(cv);
      this.gymDigitalClockTex.colorSpace = THREE.SRGBColorSpace;
      this.gymDigitalClockFaceMat = new THREE.MeshBasicMaterial({
        map: this.gymDigitalClockTex,
        toneMapped: false,
      });
      this._lastDigitalClockRpm = -1;
    }
    this.gymClockOverlays = [];
    const attachLiveDigitalClockOverlay = (clNode) => {
      if (!clNode || !this.gymDigitalClockFaceMat) return;
      const facePlane = new THREE.Mesh(
        new THREE.PlaneGeometry(0.876, 0.236),
        this.gymDigitalClockFaceMat
      );
      facePlane.position.set(0.0, 0.14, 0.0425);
      facePlane.name = "GymClockCleanFaceOverlay";
      clNode.add(facePlane);
      this.gymClockOverlays.push(facePlane);
    };
    const clEast = spawnProp(clockProto, "WallMounted_Studio_Clock_East", 3.85, 3.22, 148.34, Math.PI, 1.0, false);
    const clWest = spawnProp(clockProto, "WallMounted_Studio_Clock_West", -6.85, 3.22, 148.34, Math.PI, 1.0, false);
    const clNorth = spawnProp(clockProto, "WallMounted_Studio_Clock_North", -3.26, 2.86, 131.34, 0.0, 1.0, false);
    attachLiveDigitalClockOverlay(clEast);
    attachLiveDigitalClockOverlay(clWest);
    attachLiveDigitalClockOverlay(clNorth);
    this._drawLiveDigitalClockFace?.(36);

    // 6. Dedicated Soft Gaussian Contact AO Shadow Pads (`Gym_ContactShadow_Decal`) under `59/AA` Flat Hex Dumbbell,
    //    Kettlebells, and Spin Bikes so every prop has grounded micro-contact occlusion on BOTH WebGL2 shadow maps & SwiftShader!
    {
      const aoRes = 64;
      const aoData = new Uint8Array(aoRes * aoRes * 4);
      for (let py = 0; py < aoRes; py++) {
        const ny = (py + 0.5) / aoRes * 2.0 - 1.0;
        for (let px = 0; px < aoRes; px++) {
          const nx = (px + 0.5) / aoRes * 2.0 - 1.0;
          const r2 = nx * nx + ny * ny;
          const falloff = r2 >= 1.0 ? 0.0 : Math.pow(1.0 - r2, 1.85);
          const idx = (py * aoRes + px) * 4;
          aoData[idx] = 8;
          aoData[idx + 1] = 10;
          aoData[idx + 2] = 14;
          aoData[idx + 3] = Math.round(falloff * 212);
        }
      }
      const gymAoTex = new THREE.DataTexture(aoData, aoRes, aoRes, THREE.RGBAFormat);
      gymAoTex.needsUpdate = true;
      const gymAoMat = new THREE.MeshBasicMaterial({
        map: gymAoTex,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      const aoGeoms = [];
      const pushGymAo = (ax, az, w, d, rotY = 0.0) => {
        const g = new THREE.PlaneGeometry(w, d);
        g.rotateX(-Math.PI * 0.5);
        g.rotateY(rotY);
        g.translate(ax, floorTopY + 0.0012, az);
        aoGeoms.push(g);
      };
      // Twin hex-head contact ovals + center knurled handle shadow right under `Gym_Hex_Dumbbell_59AA_Flat_V5` (`(0.76, 141.58, rotY=0.26)`)!
      const dbCos = Math.cos(0.26);
      const dbSin = Math.sin(0.26);
      pushGymAo(0.76, 141.58, 0.52, 0.25, 0.26);
      pushGymAo(0.76 - dbCos * 0.135, 141.58 + dbSin * 0.135, 0.24, 0.27, 0.26);
      pushGymAo(0.76 + dbCos * 0.135, 141.58 - dbSin * 0.135, 0.24, 0.27, 0.26);
      // Kettlebell sets & 6 Spin Bikes + Squat/Dumbbell Racks
      pushGymAo(-1.55, 139.25, 0.74, 0.46, 0.52);
      pushGymAo(1.82, 141.18, 0.74, 0.46, -0.78);
      for (const [bx, bz, byaw] of bikePlacements) {
        pushGymAo(bx, bz, 0.78, 1.42, byaw);
      }
      pushGymAo(-4.65, 145.6, 1.65, 1.65, 0.0);
      pushGymAo(4.65, 145.6, 1.65, 1.65, 0.0);
      pushGymAo(-6.65, 139.5, 0.95, 2.35, 0.0);
      pushGymAo(6.65, 139.5, 0.95, 2.35, 0.0);
      const mergedGymAo = mergeCampusStaticGeometries(aoGeoms);
      if (mergedGymAo) {
        const aoMesh = new THREE.Mesh(mergedGymAo, gymAoMat);
        aoMesh.name = "Gym_ContactShadow_Decal";
        aoMesh.renderOrder = 2;
        aoMesh.castShadow = false;
        aoMesh.receiveShadow = false;
        v5GymGroup.add(aoMesh);
      }
    }

    this.gymV5PropsGroup = v5GymGroup;
    this.gymInteriorGroup.add(v5GymGroup);
    return v5GymGroup.children.length > 0;
  }

  applyStanTrexV5Glb(stanV5Scene) {
    if (!stanV5Scene || !this.stanEncounter) return false;
    const res = this.stanEncounter.attachGlbScene(stanV5Scene);
    if (res === true || res?.attached) {
      if (this.courtyardCafeFallbackGroup) {
        this.courtyardCafeFallbackGroup.visible = false;
      }
      if (this.stanHolder) {
        for (const ch of [...this.stanHolder.children]) {
          if (ch.name === "Stan_Fallback_Plinth" || ch.name === "Stan_Procedural_Fallback") {
            ch.visible = false;
            this.stanHolder.remove(ch);
          }
        }
        // Clamp Stan oxidized museum bronze so skull & spine never blow out to pure white under direct sun
        this.stanHolder.traverse((n) => {
          if (!n.isMesh || !n.material) return;
          const mats = Array.isArray(n.material) ? n.material : [n.material];
          for (const m of mats) {
            if (m && /Stan_Bronze|Stan_Body/i.test(`${m.name || ""} ${n.name || ""}`)) {
              m.roughness = Math.max(m.roughness ?? 0.48, 0.48);
              m.envMapIntensity = Math.min(m.envMapIntensity ?? 0.58, 0.58);
              m.needsUpdate = true;
            }
          }
        });
      }
      return true;
    }
    return false;
  }

  applyCampusHorizonArchV5Glb(archV5Scene) {
    if (!archV5Scene) return false;
    let pavilionProto = null;
    let bermProto = null;
    let ridgeProto = null;
    archV5Scene.traverse((ch) => {
      if (!pavilionProto && ch.name === "Campus_Office_Pavilion_V5") pavilionProto = ch;
      if (!bermProto && ch.name === "Courtyard_Landscape_Berm_V5") bermProto = ch;
      if (!ridgeProto && ch.name === "Santa_Cruz_Ridgeline_Arc_V5") ridgeProto = ch;
    });

    // 1. Replace boxy Googleplex, Android Visitor & Charleston office blocks + seal North-West Stan Courtyard background void!
    if (pavilionProto) {
      if (this.archV5PavilionsGroup) this.root.remove(this.archV5PavilionsGroup);
      const pavGroup = new THREE.Group();
      pavGroup.name = "Campus_V5_Container";

      const replaceIds = new Set([
        "bldg_plex_40",
        "bldg_plex_41",
        "bldg_plex_42",
        "bldg_visitor_timber",
        "bldg_charleston_sw",
        "bldg_charleston_se",
        "bldg_north_commons",
        "bldg_ai_compute_hub",
      ]);
      if (this.envV3BuildingsGroup) {
        for (const ch of this.envV3BuildingsGroup.children) {
          if (replaceIds.has(ch.userData?.buildingId)) {
            ch.userData.replacedByV5 = true;
            ch.visible = false;
          }
        }
      }

      const pavilionSpecs = [
        // Flanking Stan Courtyard (`(-118, -50)`) with 5-bay limestone colonnade & warm-lit 3D parallax rooms (left wing matches Omni Zone 3!)
        { id: "bldg_plex_40", x: -151.0, z: -58.0, sx: 0.86, sy: 1.04, sz: 1.08, rotY: 1.12 },
        { id: "bldg_plex_41", x: -72.0, z: -50.0, sx: 0.70, sy: 1.00, sz: 1.00, rotY: -Math.PI * 0.5 },
        // Courtyard NW Wings framing left & far-right while opening the center-right mountain window (`x = -114..-76`) to `Santa_Cruz_Ridgeline_Arc_V5`!
        { id: "bldg_plex_43_nw_center", x: -146.0, z: -96.0, sx: 0.96, sy: 1.02, sz: 0.98, rotY: 0.48 },
        { id: "bldg_plex_44_nw_east", x: -58.0, z: -88.0, sx: 0.96, sy: 0.98, sz: 0.94, rotY: -0.58 },
        // Android Lawn & Campus Avenue Tech Pavilions (`bldg_visitor_timber` replaces boxy V3 timber block right behind Android Lawn!)
        { id: "bldg_visitor_timber", x: -156.0, z: 104.0, sx: 0.94, sy: 0.92, sz: 0.88, rotY: Math.PI * 0.5 },
        { id: "bldg_plex_42", x: -60.0, z: 12.0, sx: 1.30, sy: 0.97, sz: 0.88, rotY: Math.PI },
        { id: "bldg_charleston_sw", x: -60.0, z: 46.0, sx: 1.38, sy: 0.95, sz: 0.94, rotY: 0.0 },
        { id: "bldg_charleston_se", x: 76.0, z: 46.0, sx: 1.62, sy: 0.98, sz: 0.94, rotY: 0.0 },
        { id: "bldg_north_commons", x: -32.0, z: -54.0, sx: 0.95, sy: 0.88, sz: 0.82, rotY: 0.0 },
        { id: "bldg_ai_compute_hub", x: 76.0, z: 12.0, sx: 1.54, sy: 1.04, sz: 0.94, rotY: Math.PI },
      ];

      // V6 De-Salmonize `Campus_Office_Pavilion`: remap cartoon salmon-peach spandrel texels (`#D9824B`)
      // to architectural warm limestone/travertine (`#B99B82`, roughness `0.80`, metalness `0.02`)!
      const pavilionMatMap = new Map();
      const upgradePavilionMaterial = (m) => {
        if (!m || (!m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial)) return m;
        if (pavilionMatMap.has(m.uuid)) return pavilionMatMap.get(m.uuid);
        const cm = m.clone();
        const isGlass = /Glass/i.test(cm.name || "") || cm.transparent || (cm.roughness ?? 1) < 0.25;
        if (!isGlass) {
          cm.name = "V6_Campus_Pavilion_Limestone_Travertine";
          cm.roughness = Math.max(cm.roughness ?? 0.78, 0.78);
          cm.metalness = Math.min(cm.metalness ?? 0.02, 0.03);
          cm.envMapIntensity = Math.min(cm.envMapIntensity ?? 0.45, 0.42);
          if (cm.map && cm.map.image && typeof document !== "undefined") {
            const img = cm.map.image;
            const w = img.width || img.videoWidth || 0;
            const h = img.height || img.videoHeight || 0;
            if (w > 0 && h > 0) {
              const cvs = document.createElement("canvas");
              cvs.width = w;
              cvs.height = h;
              const ctx = cvs.getContext("2d");
              ctx.drawImage(img, 0, 0, w, h);
              const imData = ctx.getImageData(0, 0, w, h);
              const d = imData.data;
              for (let p = 0; p < d.length; p += 4) {
                const r = d[p];
                const g = d[p + 1];
                const b = d[p + 2];
                // Detect orange/salmon-peach spandrel band and convert to warm limestone/sandstone (#B99B82)
                if (r > 125 && r - b > 36 && r > g * 1.12) {
                  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
                  const scaleL = THREE.MathUtils.clamp(luma / 158.0, 0.55, 1.28);
                  d[p] = Math.min(232, Math.round(185 * scaleL));
                  d[p + 1] = Math.min(220, Math.round(162 * scaleL));
                  d[p + 2] = Math.min(204, Math.round(136 * scaleL));
                }
              }
              ctx.putImageData(imData, 0, 0);
              const nextTex = new THREE.CanvasTexture(cvs);
              nextTex.colorSpace = cm.map.colorSpace || THREE.SRGBColorSpace;
              nextTex.wrapS = cm.map.wrapS;
              nextTex.wrapT = cm.map.wrapT;
              nextTex.flipY = cm.map.flipY;
              nextTex.anisotropy = 8;
              cm.map = nextTex;
            }
          }
        }
        pavilionMatMap.set(m.uuid, cm);
        return cm;
      };

      this._pavilionSpecsV6 = pavilionSpecs;
      for (const sp of pavilionSpecs) {
        const pav = pavilionProto.clone(true);
        pav.name = `Campus_Office_Pavilion_V5_${sp.id}`;
        const gy = getDefaultCampusSurfaceTopY(sp.x, sp.z, "pavilion");
        pav.scale.set(sp.sx, sp.sy, sp.sz);
        pav.rotation.set(0.0, sp.rotY, 0.0);
        pav.position.set(sp.x, gy, sp.z);
        pav.traverse((ch) => {
          if (ch.isMesh) {
            ch.material = Array.isArray(ch.material)
              ? ch.material.map(upgradePavilionMaterial)
              : upgradePavilionMaterial(ch.material);
            ch.castShadow = true;
            ch.receiveShadow = true;
          }
        });
        groundObjectToY(pav, gy, 0.0);
        pav.userData.bx = sp.x;
        pav.userData.bz = sp.z;
        pavGroup.add(pav);
      }
      this.archV5PavilionsGroup = pavGroup;
      this.root.add(pavGroup);
    }

    // 2. Sculpted Landscaped Grassy Earthwork Berms framing Stan Courtyard & Android Lawn
    //    V6 FIX: Replaces `Courtyard_Landscape_Berm_V5` (which baked low-poly tan icosahedron rocks & faceted bushes)
    //    with smooth subdivided turf mounds (`turfLawnPbr`), dressed by `Campus_Botanical_Kit_V6` boulders & shrubs!
    if (bermProto) {
      if (this.archV5BermsGroup) this.root.remove(this.archV5BermsGroup);
      const bermGroup = new THREE.Group();
      bermGroup.name = "Campus_Earthworks_Container";
      const bermSpecs = [
        { x: -136.5, z: -70.5, rotY: 0.52, sx: 1.22, sy: 1.15, sz: 1.15 },
        { x: -120.5, z: -76.8, rotY: 0.08, sx: 1.28, sy: 1.18, sz: 1.18 },
        { x: -102.0, z: -72.0, rotY: -0.32, sx: 1.30, sy: 1.20, sz: 1.20 },
        { x: -86.5, z: -73.5, rotY: -0.46, sx: 1.26, sy: 1.18, sz: 1.18 },
        { x: -143.5, z: -54.0, rotY: 1.38, sx: 1.08, sy: 1.04, sz: 1.05 },
        { x: -91.5, z: -54.0, rotY: -1.38, sx: 1.08, sy: 1.04, sz: 1.05 },
        { x: -142.0, z: 88.0, rotY: Math.PI * 0.5, sx: 1.08, sy: 1.04, sz: 1.06 },
      ];
      this._bermSpecsV6 = bermSpecs;
      const moundBaseGeom = new THREE.SphereGeometry(4.4, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.5);
      const mPos = moundBaseGeom.attributes.position;
      for (let vi = 0; vi < mPos.count; vi++) {
        const vx = mPos.getX(vi) * 1.52;
        const vy = Math.max(0.0, mPos.getY(vi) * 0.24);
        const vz = mPos.getZ(vi) * 0.88;
        const ripple = 1.0 + 0.08 * Math.sin(vx * 0.48 + vz * 0.62);
        mPos.setXYZ(vi, vx * ripple, vy, vz * ripple);
      }
      moundBaseGeom.computeVertexNormals();
      moundBaseGeom.computeBoundingBox();
      const bermTurfMat = this.materials.turfLawnPbr || this.materials.grassMeadow;

      for (let i = 0; i < bermSpecs.length; i++) {
        const bs = bermSpecs[i];
        const berm = new THREE.Group();
        berm.name = `Courtyard_Landscape_Berm_V6_${i}`;
        const moundMesh = new THREE.Mesh(moundBaseGeom, bermTurfMat);
        moundMesh.name = `Courtyard_Turf_Mound_V6_${i}`;
        moundMesh.castShadow = false;
        moundMesh.receiveShadow = true;
        berm.add(moundMesh);
        const gy = getDefaultCampusSurfaceTopY(bs.x, bs.z, "berm");
        berm.scale.set(bs.sx, bs.sy, bs.sz);
        berm.rotation.set(0.0, bs.rotY, 0.0);
        berm.position.set(bs.x, gy, bs.z);
        groundObjectToY(berm, gy, 0.0);
        berm.userData.bx = bs.x;
        berm.userData.bz = bs.z;
        bermGroup.add(berm);
      }
      this.archV5BermsGroup = bermGroup;
      this.root.add(bermGroup);
    }

    // 3. Full `360°` Panoramic Sculpted Santa Cruz & Diablo Mountain Ridgeline Arc (`Santa_Cruz_Ridgeline_Arc_V5`)
    //    V6 FIX: Kills "Play-Doh Green Hills" (`roughness = 0.96`, `metalness = 0.0`, `envMap = null`) with
    //    world-space California chaparral scrub, sedimentary sandstone strata, ravine AO, coastal blue haze,
    //    AND `Horizon_Foothill_Tree_Silhouettes_V6` (`InstancedMesh` of dark Coast Live Oak & Redwood ridge clusters)!
    if (ridgeProto) {
      if (this.archV5HorizonGroup) this.root.remove(this.archV5HorizonGroup);
      const ridgeGroup = new THREE.Group();
      ridgeGroup.name = "Horizon_Santa_Cruz_Mountains_V5";
      if (this.distantCrestMesh) this.distantCrestMesh.visible = false;
      if (this.foothillsMesh) this.foothillsMesh.visible = false;

      if (!OpenCampusWorld._scRidgeLutPair) {
        const LUT_N = 512;
        const maskData = new Uint8Array(LUT_N * LUT_N * 4);
        const gradData = new Uint8Array(LUT_N * LUT_N * 4);
        const hField = new Float32Array(LUT_N * LUT_N);

        const hashTile = (ix, iy, period, seed) => {
          const px = ((ix % period) + period) % period;
          const py = ((iy % period) + period) % period;
          let h = (Math.imul(px + 37, 374761393) ^ Math.imul(py + 91, 668265263) ^ Math.imul(seed, 1274126177)) >>> 0;
          h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
          return ((h ^ (h >>> 16)) >>> 0) / 4294967295.0;
        };
        const noiseTile = (u, v, period, seed) => {
          const x = u * period;
          const y = v * period;
          const ix = Math.floor(x);
          const iy = Math.floor(y);
          const fx = x - ix;
          const fy = y - iy;
          const ux = fx * fx * (3.0 - 2.0 * fx);
          const uy = fy * fy * (3.0 - 2.0 * fy);
          const a = hashTile(ix, iy, period, seed);
          const b = hashTile(ix + 1, iy, period, seed);
          const c = hashTile(ix, iy + 1, period, seed);
          const d = hashTile(ix + 1, iy + 1, period, seed);
          return (a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uy;
        };
        const fbmTile = (u, v, baseCycles, seedBase) => {
          let sum = 0.0;
          let amp = 0.52;
          let cyc = baseCycles;
          for (let o = 0; o < 4; o++) {
            const uOff = u + o * 0.173;
            const vOff = v + o * 0.291;
            sum += amp * noiseTile(uOff, vOff, cyc, seedBase + o * 97);
            cyc *= 2;
            amp *= 0.5;
          }
          return Math.max(0.0, Math.min(1.0, sum));
        };
        const ridgedTile = (u, v, baseCycles, seedBase) => {
          let sum = 0.0;
          let amp = 0.54;
          let cyc = baseCycles;
          for (let o = 0; o < 3; o++) {
            const n = 1.0 - Math.abs(2.0 * noiseTile(u + o * 0.317, v - o * 0.193, cyc, seedBase + o * 131) - 1.0);
            sum += amp * (n * n);
            cyc *= 2;
            amp *= 0.5;
          }
          return Math.max(0.0, Math.min(1.0, sum));
        };

        for (let y = 0; y < LUT_N; y++) {
          const v = y / LUT_N;
          for (let x = 0; x < LUT_N; x++) {
            const u = x / LUT_N;
            // Subtle domain warp across [0,1)^2 so zero axis alignment exists while remaining 100% seamless
            const wx = (noiseTile(u, v, 5, 11) - 0.5) * 0.045;
            const wy = (noiseTile(u, v, 5, 29) - 0.5) * 0.045;
            const uw = u + wx;
            const vw = v + wy;

            const macroPatch = fbmTile(uw, vw, 6, 101);
            const chapClump = fbmTile(uw + 0.13, vw - 0.21, 32, 211);
            const fineScrub = noiseTile(u * 1.0 + wx * 0.5, v * 1.0 + wy * 0.5, 118, 307);
            const canyonRidge = ridgedTile(uw - 0.07, vw + 0.19, 10, 409);
            const canyonFine = ridgedTile(uw * 1.0 + 0.23, vw * 1.0 - 0.17, 24, 613);
            const hummock = fbmTile(uw + 0.29, vw + 0.11, 28, 503);

            const idx = y * LUT_N + x;
            const compositeRidge = Math.max(0.0, Math.min(1.0, canyonRidge * 0.72 + canyonFine * 0.34));
            hField[idx] = compositeRidge * 3.15 + hummock * 1.25 + fineScrub * 0.34;

            const p4 = idx * 4;
            maskData[p4] = Math.round(macroPatch * 255);
            maskData[p4 + 1] = Math.round(chapClump * 255);
            maskData[p4 + 2] = Math.round(fineScrub * 255);
            maskData[p4 + 3] = Math.round(compositeRidge * 255);
          }
        }

        const worldTileM = 320.0;
        const cellM = worldTileM / LUT_N;
        for (let y = 0; y < LUT_N; y++) {
          const ym = (y - 1 + LUT_N) % LUT_N;
          const yp = (y + 1) % LUT_N;
          for (let x = 0; x < LUT_N; x++) {
            const xm = (x - 1 + LUT_N) % LUT_N;
            const xp = (x + 1) % LUT_N;
            const idx = y * LUT_N + x;
            const dHdx = (hField[y * LUT_N + xp] - hField[y * LUT_N + xm]) / (2.0 * cellM);
            const dHdz = (hField[yp * LUT_N + x] - hField[ym * LUT_N + x]) / (2.0 * cellM);
            const p4 = idx * 4;
            gradData[p4] = Math.round(Math.max(0.0, Math.min(1.0, 0.5 + dHdx / 4.2)) * 255);
            gradData[p4 + 1] = Math.round(Math.max(0.0, Math.min(1.0, 0.5 + dHdz / 4.2)) * 255);
            gradData[p4 + 2] = Math.round(Math.max(0.0, Math.min(1.0, hField[idx] / 4.8)) * 255);
            gradData[p4 + 3] = 255;
          }
        }

        const makeLutTex = (arr) => {
          const tex = new THREE.DataTexture(arr, LUT_N, LUT_N, THREE.RGBAFormat);
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.RepeatWrapping;
          tex.minFilter = THREE.LinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.generateMipmaps = false;
          tex.needsUpdate = true;
          return tex;
        };
        OpenCampusWorld._scRidgeLutPair = {
          maskTex: makeLutTex(maskData),
          gradTex: makeLutTex(gradData),
        };
      }

      const { maskTex: scMaskTex, gradTex: scGradTex } = OpenCampusWorld._scRidgeLutPair;
      const tier1MatCache = new Map();
      const tier2MatCache = new Map();
      const getRidgeTierMaterial = (m, isTier2) => {
        if (!m || (!m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial)) return m;
        const cache = isTier2 ? tier2MatCache : tier1MatCache;
        const key = isTier2 ? "tier2" : "tier1";
        if (cache.has(key)) return cache.get(key);
        // Clean world-space triplanar/planar MeshStandardMaterial (`map: null`) so ZERO stretched GLB UV seams ever survive!
        const cm = new THREE.MeshStandardMaterial({
          name: isTier2 ? "V7_Santa_Cruz_Ridgeline_Tier2" : "V7_Santa_Cruz_Ridgeline_Tier1",
          color: "#ffffff",
          roughness: 0.95,
          metalness: 0.0,
          envMap: null,
          envMapIntensity: 0.0,
        });
        cm.userData.v5AerialShaderInstalled = true;
        cm.userData.isCustomRidgeShaderV7 = true;
        cm.userData.scMaskTex = scMaskTex;
        cm.userData.scGradTex = scGradTex;
        cm.userData.isTier2 = Boolean(isTier2);
        cm.customProgramCacheKey = () =>
          isTier2 ? "v7_santa_cruz_chaparral_tier2_lut" : "v7_santa_cruz_chaparral_tier1_lut";
        cm.onBeforeCompile = (shader) => {
          shader.uniforms.uIsTier2 = { value: isTier2 ? 1.0 : 0.0 };
          shader.uniforms.uScMaskTex = { value: scMaskTex };
          shader.uniforms.uScGradTex = { value: scGradTex };
          shader.vertexShader = shader.vertexShader
            .replace(
              "#include <common>",
              `#include <common>
              varying vec3 vScWorldPos;
              varying vec3 vScWorldNorm;`
            )
            .replace(
              "#include <worldpos_vertex>",
              `#include <worldpos_vertex>
              vec4 scWp = modelMatrix * vec4(transformed, 1.0);
              vScWorldPos = scWp.xyz;
              vScWorldNorm = normalize(mat3(modelMatrix) * objectNormal);`
            );
          shader.fragmentShader = shader.fragmentShader
            .replace(
              "#include <common>",
              `#include <common>
              uniform float uIsTier2;
              uniform sampler2D uScMaskTex;
              uniform sampler2D uScGradTex;
              varying vec3 vScWorldPos;
              varying vec3 vScWorldNorm;`
            )
            .replace(
              "#include <map_fragment>",
              `#include <map_fragment>
              float scCanyonSaved = 0.5;
              {
                vec2 wpXZ = vScWorldPos.xz;
                mat2 scRot = mat2(0.80, -0.60, 0.60, 0.80);
                mat2 scRotFine = mat2(0.54, 0.84, -0.84, 0.54);
                vec2 uvPrimary = (wpXZ + vec2(vScWorldPos.y * 0.62, -vScWorldPos.y * 0.41)) * (1.0 / 320.0);
                vec2 uvDetail = (scRot * wpXZ + vec2(-vScWorldPos.y * 0.92, vScWorldPos.y * 0.68)) * (1.0 / 118.0);
                vec2 uvMicro = (scRotFine * wpXZ + vec2(vScWorldPos.y * 1.35, vScWorldPos.y * 0.95)) * (1.0 / 49.0);
                vec4 mA = texture2D(uScMaskTex, uvPrimary);
                vec4 mB = texture2D(uScMaskTex, uvDetail);
                vec4 mC = texture2D(uScMaskTex, uvMicro);

                float macroPatch = mix(mA.r, mB.r, 0.34);
                float chapClump = mix(mix(mA.g, mB.g, 0.48), mC.g, 0.28);
                float fineScrub = mix(mB.b, mC.b, 0.58);
                float canyonRidge = mix(mix(mA.a, mB.a, 0.40), mC.a, 0.22);
                scCanyonSaved = canyonRidge;
                float ravineAO = smoothstep(0.14, 0.76, canyonRidge * 0.82 + macroPatch * 0.24);

                // Steepness & sun-cured ridge crest exposure
                vec3 wN = normalize(vScWorldNorm + 1e-6);
                float steepness = clamp(1.0 - abs(wN.y), 0.0, 1.0);
                float heightFrac = clamp((vScWorldPos.y - 2.0) / (uIsTier2 > 0.5 ? 78.0 : 52.0), 0.0, 1.0);

                // Crisp Eroded California Santa Cruz Chaparral & Monterey Sandstone Palette (linear RGB):
                vec3 deepOak = vec3(0.032, 0.049, 0.020);
                vec3 chaparralOlive = vec3(0.095, 0.112, 0.064);
                vec3 goldenOat = vec3(0.355, 0.278, 0.124);
                vec3 ochreSandstone = vec3(0.335, 0.242, 0.152);
                vec3 paleStrataLedge = vec3(0.455, 0.365, 0.248);

                float oatMix = smoothstep(0.34, 0.74, macroPatch * 0.62 + heightFrac * 0.36 + ravineAO * 0.22);
                vec3 hillBase = mix(chaparralOlive, goldenOat, oatMix);
                // Dendritic Coast Live Oak & chaparral scrub tucked into moisture-holding V-ravines
                float oakCanopyMask = smoothstep(0.40, 0.70, chapClump * 0.68 + fineScrub * 0.32 + (1.0 - ravineAO) * 0.34);
                hillBase = mix(hillBase, deepOak, oakCanopyMask * 0.88);

                // Tilted, canyon-warped sedimentary Monterey sandstone bedding (ZERO horizontal sin(y) zebra rings!)
                float strataPhase = vScWorldPos.y * 0.22 + wpXZ.x * 0.032 - wpXZ.y * 0.024 + canyonRidge * 5.5 + macroPatch * 3.8;
                float strataCoarse = 0.5 + 0.5 * sin(strataPhase);
                float strataFine = 0.5 + 0.5 * sin(strataPhase * 2.3 - chapClump * 3.6);
                float strataBench = smoothstep(0.58, 0.88, strataCoarse * 0.68 + strataFine * 0.32);
                float rockMask = smoothstep(0.62, 0.86, steepness) * (1.0 - oakCanopyMask);
                vec3 rockCol = mix(ochreSandstone, paleStrataLedge, strataBench);
                hillBase = mix(hillBase, rockCol, rockMask * 0.26);

                // High-contrast eroded V-canyon & ravine crevice ambient occlusion
                hillBase *= mix(0.30, 1.16, ravineAO);

                diffuseColor.rgb = hillBase;

                // Crisp warm-gold / coastal-slate aerial perspective (preserving ridge relief contrast!)
                float camDist = length(vScWorldPos.xz - cameraPosition.xz);
                float distHaze = smoothstep(245.0, 540.0, camDist);
                float hazeFactor = uIsTier2 > 0.5
                  ? clamp(0.30 + 0.16 * distHaze - heightFrac * 0.05, 0.24, 0.48)
                  : clamp(0.10 + 0.15 * distHaze - heightFrac * 0.04, 0.07, 0.26);
                vec3 coastalHaze = mix(vec3(0.285, 0.348, 0.372), vec3(0.545, 0.578, 0.565), clamp(heightFrac * 0.85, 0.0, 1.0));
                diffuseColor.rgb = mix(diffuseColor.rgb, coastalHaze, hazeFactor);
              }`
            )
            .replace(
              "#include <normal_fragment_maps>",
              `#include <normal_fragment_maps>
              {
                // Multi-octave Riemannian tangent-plane canyon & strata normal relief
                vec3 scWn = normalize(vScWorldNorm + vec3(0.0, 1e-5, 0.0));
                mat2 scRotN = mat2(0.80, -0.60, 0.60, 0.80);
                mat2 scRotF = mat2(0.54, 0.84, -0.84, 0.54);
                vec2 uvG1 = (vScWorldPos.xz + vec2(vScWorldPos.y * 0.62, -vScWorldPos.y * 0.41)) * (1.0 / 320.0);
                vec2 uvG2 = (scRotN * vScWorldPos.xz + vec2(-vScWorldPos.y * 0.92, vScWorldPos.y * 0.68)) * (1.0 / 118.0);
                vec2 uvG3 = (scRotF * vScWorldPos.xz + vec2(vScWorldPos.y * 1.35, vScWorldPos.y * 0.95)) * (1.0 / 49.0);
                vec2 g1 = (texture2D(uScGradTex, uvG1).rg - 0.5) * 4.2;
                vec2 g2 = mat2(0.80, 0.60, -0.60, 0.80) * ((texture2D(uScGradTex, uvG2).rg - 0.5) * 4.2);
                vec2 g3 = mat2(0.54, -0.84, 0.84, 0.54) * ((texture2D(uScGradTex, uvG3).rg - 0.5) * 4.2);
                vec2 gXZ = g1 * 0.58 + g2 * 0.48 + g3 * 0.28;
                vec3 gradH = vec3(gXZ.x, 0.0, gXZ.y);
                vec3 surfGrad = gradH - scWn * dot(gradH, scWn);
                float bumpAmp = uIsTier2 > 0.5 ? 3.15 : 4.25;
                vec3 pertWn = normalize(scWn - surfGrad * bumpAmp);
                normal = normalize((viewMatrix * vec4(pertWn, 0.0)).xyz);
              }`
            )
            .replace(
              "#include <roughnessmap_fragment>",
              `#include <roughnessmap_fragment>
              roughnessFactor = 0.95;`
            );
        };
        cm.needsUpdate = true;
        cache.set(key, cm);
        return cm;
      };

      // Full `360°` Two-Tier Sculpted Foothills (`R ~ 282-292m`, front toe `> 252m` strictly behind all campus trees!)
      // + High Santa Cruz & Diablo Skyline (`R ~ 384-398m`, 12 overlapping segments = ZERO horizon gaps & ZERO tree intersections!)
      const ridgeArcSpecs = [
        // Tier 1: Mid-Horizon Foothills (`12` overlapping segments every `30°` at `R = 284-292m` — strictly outside all `<= 244m` perimeter groves!)
        { azDeg: 0, r: 284, sx: 2.66, sy: 1.82, sz: 1.72, y: -0.55 },
        { azDeg: 30, r: 286, sx: 2.66, sy: 1.80, sz: 1.72, y: -0.55 },
        { azDeg: 60, r: 288, sx: 2.68, sy: 1.80, sz: 1.72, y: -0.55 },
        { azDeg: 90, r: 290, sx: 2.68, sy: 1.82, sz: 1.72, y: -0.55 },
        { azDeg: 120, r: 288, sx: 2.66, sy: 1.82, sz: 1.72, y: -0.55 },
        { azDeg: 150, r: 286, sx: 2.66, sy: 1.84, sz: 1.72, y: -0.55 },
        { azDeg: 180, r: 282, sx: 2.66, sy: 1.92, sz: 1.74, y: -0.50 },
        { azDeg: 210, r: 280, sx: 2.68, sy: 1.98, sz: 1.76, y: -0.48 },
        { azDeg: 240, r: 284, sx: 2.68, sy: 1.94, sz: 1.74, y: -0.50 },
        { azDeg: 270, r: 286, sx: 2.66, sy: 1.88, sz: 1.72, y: -0.52 },
        { azDeg: 300, r: 286, sx: 2.66, sy: 1.86, sz: 1.72, y: -0.52 },
        { azDeg: 330, r: 284, sx: 2.66, sy: 1.84, sz: 1.72, y: -0.55 },
        // Tier 2: High Santa Cruz & Diablo Skyline (`12` overlapping segments every `30°` at `R = 384-398m` — zero gaps, natural aspect!)
        { azDeg: 0, r: 390, sx: 3.76, sy: 2.74, sz: 2.54, y: -1.30, tier2: true },
        { azDeg: 30, r: 394, sx: 3.78, sy: 2.76, sz: 2.54, y: -1.30, tier2: true },
        { azDeg: 60, r: 396, sx: 3.80, sy: 2.80, sz: 2.56, y: -1.30, tier2: true },
        { azDeg: 90, r: 396, sx: 3.80, sy: 2.82, sz: 2.56, y: -1.30, tier2: true },
        { azDeg: 120, r: 394, sx: 3.78, sy: 2.78, sz: 2.54, y: -1.30, tier2: true },
        { azDeg: 150, r: 392, sx: 3.76, sy: 2.74, sz: 2.54, y: -1.30, tier2: true },
        { azDeg: 180, r: 386, sx: 3.76, sy: 2.74, sz: 2.54, y: -1.28, tier2: true },
        { azDeg: 210, r: 382, sx: 3.76, sy: 2.82, sz: 2.56, y: -1.25, tier2: true },
        { azDeg: 240, r: 382, sx: 3.78, sy: 2.90, sz: 2.58, y: -1.25, tier2: true },
        { azDeg: 270, r: 386, sx: 3.78, sy: 2.92, sz: 2.58, y: -1.25, tier2: true },
        { azDeg: 300, r: 388, sx: 3.78, sy: 2.84, sz: 2.56, y: -1.26, tier2: true },
        { azDeg: 330, r: 390, sx: 3.76, sy: 2.78, sz: 2.54, y: -1.28, tier2: true },
      ];
      for (let i = 0; i < ridgeArcSpecs.length; i++) {
        const rs = ridgeArcSpecs[i];
        const mx = rs.x !== undefined ? rs.x : Math.sin((rs.azDeg * Math.PI) / 180.0) * rs.r;
        const mz = rs.z !== undefined ? rs.z : Math.cos((rs.azDeg * Math.PI) / 180.0) * rs.r;
        const isTier2 = Boolean(rs.tier2);
        const seg = ridgeProto.clone(true);
        seg.name = `Horizon_Mountain_Segment_${i}`;
        seg.scale.set(rs.sx, rs.sy, rs.sz);
        seg.position.set(mx, rs.y, mz);
        seg.rotation.set(0.0, Math.atan2(-mx, -mz), 0.0);
        seg.userData.mx = mx;
        seg.userData.mz = mz;
        seg.traverse((ch) => {
          if (ch.isMesh) {
            ch.name = `Horizon_Mountain_Mesh_${i}`;
            ch.material = Array.isArray(ch.material)
              ? ch.material.map((m) => getRidgeTierMaterial(m, isTier2))
              : getRidgeTierMaterial(ch.material, isTier2);
            ch.castShadow = false;
            ch.receiveShadow = false;
            if (ch.geometry && !ch.geometry.boundingSphere) {
              ch.geometry.computeBoundingSphere();
            }
            ch.frustumCulled = true;
          }
        });
        ridgeGroup.add(seg);
      }

      // Scatter `Horizon_Foothill_Tree_Silhouettes_V6`: Real Blender 5.2 `Tree_CoastLiveOak_V4` & `Tree_CoastRedwood_V4`
      // groves (with organic multi-lobe Coast Live Oak broadleaf fallback — ZERO sphere+cone onion domes!)
      // rooted deeply into gentle upper/mid Santa Cruz foothill slopes (`wnTmp.y >= 0.72`) with coastal blue aerial haze!
      ridgeGroup.updateMatrixWorld(true);
      {
        const rng = createMulberry32(0x5ca17a06);
        const applyFoothillHazeMat = (() => {
          const cache = new Map();
          return (srcMat, keySuffix) => {
            if (!srcMat) return srcMat;
            if (cache.has(srcMat.uuid)) return cache.get(srcMat.uuid);
            const m = srcMat.clone();
            m.name = `V6_Horizon_Foothill_Tree_Silhouettes_Mat_${keySuffix}`;
            m.roughness = 0.95;
            m.metalness = 0.0;
            m.envMap = null;
            m.envMapIntensity = 0.0;
            if (m.alphaTest && m.alphaTest > 0.01) {
              m.transparent = false;
              m.depthWrite = true;
              m.side = THREE.DoubleSide;
            }
            m.customProgramCacheKey = () => `v6_foothill_tree_haze_${keySuffix}`;
            m.onBeforeCompile = (shader) => {
              shader.vertexShader = shader.vertexShader
                .replace("#include <common>", `#include <common>\nvarying vec3 vFtWorldPos;`)
                .replace(
                  "#include <worldpos_vertex>",
                  `#include <worldpos_vertex>
                  vec4 ftWp = vec4(transformed, 1.0);
                  #ifdef USE_INSTANCING
                    ftWp = instanceMatrix * ftWp;
                  #endif
                  ftWp = modelMatrix * ftWp;
                  vFtWorldPos = ftWp.xyz;`
                );
              shader.fragmentShader = shader.fragmentShader
                .replace("#include <common>", `#include <common>\nvarying vec3 vFtWorldPos;`)
                .replace(
                  "#include <map_fragment>",
                  `#include <map_fragment>
                  {
                    diffuseColor.rgb *= 0.64;
                    float ftDist = length(vFtWorldPos.xz - cameraPosition.xz);
                    float ftHeightFrac = clamp((vFtWorldPos.y - 2.0) / 52.0, 0.0, 1.0);
                    float ftDistHaze = smoothstep(230.0, 520.0, ftDist);
                    float ftHaze = clamp(0.16 + 0.22 * ftDistHaze - ftHeightFrac * 0.04, 0.12, 0.38);
                    vec3 ftCoastalHaze = mix(vec3(0.265, 0.345, 0.380), vec3(0.520, 0.585, 0.595), clamp(ftHeightFrac * 0.85, 0.0, 1.0));
                    diffuseColor.rgb = mix(diffuseColor.rgb, ftCoastalHaze, ftHaze);
                  }`
                );
            };
            cache.set(srcMat.uuid, m);
            return m;
          };
        })();

        const oakMatrices = [];
        const redwoodMatrices = [];
        const wpTmp = new THREE.Vector3();
        const wnTmp = new THREE.Vector3();
        const dummyTree = new THREE.Object3D();

        // Collect all Tier 1 mountain meshes (`sIdx < 12`) for 5-ray downward footprint verification (ZERO sky floaters!)
        const tier1RidgeMeshes = [];
        for (let sIdx = 0; sIdx < Math.min(12, ridgeGroup.children.length); sIdx++) {
          ridgeGroup.children[sIdx].updateMatrixWorld(true);
          ridgeGroup.children[sIdx].traverse((m) => {
            if (m.isMesh && m.geometry?.attributes?.position) tier1RidgeMeshes.push(m);
          });
        }
        const treeRaycaster = new THREE.Raycaster();
        const downDir = new THREE.Vector3(0.0, -1.0, 0.0);
        const rayOrig = new THREE.Vector3();
        const footprintOffsets = [
          [1.8, 0.0],
          [-1.8, 0.0],
          [0.0, 1.8],
          [0.0, -1.8],
        ];

        // Place silhouette groves ONLY on Tier 1 foothill benches (`sIdx < 12`, `0` Redwoods on Tier 2!)
        for (let sIdx = 0; sIdx < Math.min(12, ridgeGroup.children.length); sIdx++) {
          const seg = ridgeGroup.children[sIdx];
          const targetPerSeg = 26;
          let meshHit = null;
          seg.traverse((m) => {
            if (!meshHit && m.isMesh && m.geometry?.attributes?.position) meshHit = m;
          });
          if (!meshHit) continue;
          const posAttr = meshHit.geometry.attributes.position;
          const normAttr = meshHit.geometry.attributes.normal;
          const vCount = posAttr.count;
          const nMat = new THREE.Matrix3().getNormalMatrix(meshHit.matrixWorld);
          let placed = 0;
          for (let attempt = 0; attempt < targetPerSeg * 28 && placed < targetPerSeg; attempt++) {
            const vi = Math.floor(rng() * vCount);
            wpTmp.fromBufferAttribute(posAttr, vi).applyMatrix4(meshHit.matrixWorld);
            if (wpTmp.y < 7.5 || wpTmp.y > 33.0) continue;
            const rDist = Math.hypot(wpTmp.x, wpTmp.z);
            if (rDist < 266.0) continue;
            if (normAttr) {
              wnTmp.fromBufferAttribute(normAttr, vi).applyMatrix3(nMat).normalize();
              // Seat strictly on gentle upper/mid ridge benches (`wnTmp.y >= 0.80`) so ZERO trees cling to steep cliffs!
              if (wnTmp.y < 0.80) continue;
            }
            // Exact 5-ray downward surface verification against `Horizon_Mountain_Mesh_*` -> ZERO floating or overhanging trees!
            rayOrig.set(wpTmp.x, wpTmp.y + 40.0, wpTmp.z);
            treeRaycaster.set(rayOrig, downDir);
            const centerHits = treeRaycaster.intersectObjects(tier1RidgeMeshes, false);
            if (centerHits.length === 0) continue;
            const surfY = centerHits[0].point.y;
            if (Math.abs(surfY - wpTmp.y) > 0.30) continue;
            let footprintSolid = true;
            for (let f = 0; f < footprintOffsets.length; f++) {
              rayOrig.set(
                wpTmp.x + footprintOffsets[f][0],
                surfY + 40.0,
                wpTmp.z + footprintOffsets[f][1]
              );
              treeRaycaster.set(rayOrig, downDir);
              const fHits = treeRaycaster.intersectObjects(tier1RidgeMeshes, false);
              if (fHits.length === 0 || fHits[0].point.y < surfY - 1.15) {
                footprintSolid = false;
                break;
              }
            }
            if (!footprintSolid) continue;

            const isRedwood = rng() < 0.22 && surfY < 25.0;
            const sc = 0.30 + rng() * 0.16;
            // Sink trunk `-1.95m * sc` deeply into the verified mountain surface!
            dummyTree.position.set(wpTmp.x, surfY - 1.95 * sc, wpTmp.z);
            dummyTree.rotation.set(0.0, rng() * Math.PI * 2.0, 0.0);
            dummyTree.scale.set(
              sc * (0.94 + rng() * 0.18),
              sc * (isRedwood ? 0.82 + rng() * 0.24 : 0.78 + rng() * 0.22),
              sc * (0.94 + rng() * 0.18)
            );
            dummyTree.updateMatrix();
            if (isRedwood) redwoodMatrices.push(dummyTree.matrix.clone());
            else oakMatrices.push(dummyTree.matrix.clone());
            placed++;
          }
        }

        let primarySilInst = null;
        this.horizonTreeDynamicBatches = [];
        this.horizonTreesStaticGroup = null;
        {
          // PRIORITY 0.3A: Partition distant R=266-360m foothill trees into 8 static azimuthal quadrant
          // `InstancedMesh`es with exact precomputed world `boundingBox` & `boundingSphere` and `frustumCulled = true`!
          // Matrices upload ONCE at creation (`0` per-frame JS matrix loops, `0` per-frame GPU buffer uploads!).
          const allMats = [...oakMatrices, ...redwoodMatrices];
          if (allMats.length > 0) {
            const oakParts = [];
            const pushOakLobe = (rx, ry, rz, ox, oy, oz, hex) => {
              const g = new THREE.SphereGeometry(1.0, 9, 7).toNonIndexed();
              g.scale(rx, ry, rz);
              g.translate(ox, oy, oz);
              const cnt = g.attributes.position.count;
              const cols = new Float32Array(cnt * 3);
              const c = new THREE.Color(hex);
              for (let k = 0; k < cnt; k++) {
                cols[k * 3] = c.r;
                cols[k * 3 + 1] = c.g;
                cols[k * 3 + 2] = c.b;
              }
              g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
              oakParts.push(g);
            };
            pushOakLobe(4.2, 2.1, 3.8, 0.0, 2.8, 0.0, "#25331f");
            pushOakLobe(3.1, 1.8, 2.9, 2.4, 2.3, 1.1, "#2d3c25");
            pushOakLobe(2.9, 1.7, 3.1, -2.3, 2.2, -0.9, "#1f2c1a");
            const fbGeom = mergeGeometries(oakParts, false);
            for (const p of oakParts) p.dispose();
            fbGeom.computeVertexNormals();
            fbGeom.computeBoundingBox();
            const localProtoBox = fbGeom.boundingBox
              ? fbGeom.boundingBox.clone()
              : new THREE.Box3(new THREE.Vector3(-6, -1, -6), new THREE.Vector3(6, 6, 6));
            const fbMat = applyFoothillHazeMat(
              new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0.0 }),
              "oak_fb"
            );

            const NUM_SECTORS = 8;
            const sectorBuckets = Array.from({ length: NUM_SECTORS }, () => []);
            for (let i = 0; i < allMats.length; i++) {
              const m4 = allMats[i];
              const mx = m4.elements[12];
              const mz = m4.elements[14];
              const ang = Math.atan2(mz, mx) + Math.PI; // [0, 2*PI]
              const sIdx = Math.min(NUM_SECTORS - 1, Math.max(0, Math.floor((ang / (Math.PI * 2.0)) * NUM_SECTORS)));
              sectorBuckets[sIdx].push(m4);
            }

            const horizonStaticGroup = new THREE.Group();
            horizonStaticGroup.name = "Horizon_Foothill_Tree_Quadrants_V9";
            horizonStaticGroup.userData.skipGroundingAudit = true;
            horizonStaticGroup.matrixAutoUpdate = false;
            horizonStaticGroup.updateMatrix();
            ridgeGroup.add(horizonStaticGroup);
            this.horizonTreesStaticGroup = horizonStaticGroup;

            const tmpWorldBox = new THREE.Box3();
            for (let sIdx = 0; sIdx < NUM_SECTORS; sIdx++) {
              const sMats = sectorBuckets[sIdx];
              if (sMats.length === 0) continue;
              const secGeom = fbGeom.clone();
              const secBox = new THREE.Box3();
              const secInst = new THREE.InstancedMesh(secGeom, fbMat, sMats.length);
              secInst.name = "Horizon_Foothill_Tree_Silhouettes_V6";
              secInst.userData.sectorIndex = sIdx;
              secInst.userData.skipGroundingAudit = true;
              secInst.userData.staticHorizonQuadrant = true;
              secInst.castShadow = false;
              secInst.receiveShadow = false;
              secInst.frustumCulled = true;
              secInst.count = sMats.length;

              for (let i = 0; i < sMats.length; i++) {
                secInst.setMatrixAt(i, sMats[i]);
                tmpWorldBox.copy(localProtoBox).applyMatrix4(sMats[i]);
                secBox.union(tmpWorldBox);
              }
              const secSphere = new THREE.Sphere();
              secBox.getBoundingSphere(secSphere);
              secSphere.radius += 1.5;

              secGeom.boundingBox = secBox.clone();
              secGeom.boundingSphere = secSphere.clone();
              secInst.boundingBox = secBox.clone();
              secInst.boundingSphere = secSphere.clone();
              secInst.matrixAutoUpdate = false;
              secInst.updateMatrix();
              secInst.instanceMatrix.needsUpdate = true;

              if (!primarySilInst) primarySilInst = secInst;
              horizonStaticGroup.add(secInst);
              this.horizonTreeDynamicBatches.push({
                sectorIndex: sIdx,
                staticQuadrant: true,
                count: sMats.length,
                boundingBox: secBox,
                boundingSphere: secSphere,
                meshes: [secInst],
              });
            }
            fbGeom.dispose();
          }
        }
        this.foothillTreesV6Instanced = primarySilInst;
      }

      this.archV5HorizonGroup = ridgeGroup;
      this.root.add(ridgeGroup);
    }

    return Boolean(pavilionProto || bermProto || ridgeProto);
  }

  /**
   * V6 Integration (`gradient_canopy_v6_glb.js` from `@blender-canopy-v6`):
   * - Replaces `this.gradientCanopyFallback` with authentic `Gradient_Canopy_Building_V6`
   *   (Google Visitor Experience front entrance: `2000` cedar vestibule, curved silver bullnose canopy fascia,
   *   white steel V-columns & soffit trusses, multi-peaked diamond dragonscale solar roof + smile clerestory windows,
   *   `Google Store` / `Cafe` curtain wall, board-formed planter wall, stainless bollards, and 3 white-mast 4-color origami pinwheels),
   *   preserving the seamless `4x6` breakable Spin Studio bay at `z = 131.20m` (`x in [-2.40, +2.40], y in [0.10, 3.68]`)!
   * - Replaces `this.bayViewFallback` with `Bay_View_Canopy_Pavilion_V6` at `(202, 0, 24)`.
   * - Optionally upgrades `Campus_Office_Pavilion` instances if `Campus_Office_Pavilion_V6` is included.
   */
  applyGradientCanopyV6Glb(canopyV6Scene) {
    if (!canopyV6Scene) return false;
    let gradProto = null;
    let bayProto = null;
    let pavV6Proto = null;
    canopyV6Scene.traverse((ch) => {
      if (!gradProto && /^Gradient_Canopy_Building_V6$/i.test(ch.name || "")) gradProto = ch;
      if (!bayProto && /^Bay_View_Canopy_Pavilion_V6$/i.test(ch.name || "")) bayProto = ch;
      if (!pavV6Proto && /^Campus_Office_Pavilion_V6$/i.test(ch.name || "")) pavV6Proto = ch;
    });
    if (!gradProto) {
      canopyV6Scene.traverse((ch) => {
        if (!gradProto && /Gradient_Canopy/i.test(ch.name || "") && ch !== canopyV6Scene) gradProto = ch;
        if (!bayProto && /Bay_View_Canopy/i.test(ch.name || "") && ch !== canopyV6Scene) bayProto = ch;
      });
    }

    const tuneArchMat = (() => {
      const cache = new Map();
      return (m) => {
        if (!m || (!m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial)) return m;
        if (cache.has(m.uuid)) return cache.get(m.uuid);
        const cm = m.clone();
        cm.envMapIntensity = Math.min(cm.envMapIntensity ?? 0.65, 0.72);
        if (/Visitor_Glazing_And_PoppyMural/i.test(cm.name || "")) {
          cm.userData = cm.userData || {};
          cm.userData.v7SkipWorldCohesion = true;
          if (this.dayEnvMap) cm.envMap = this.dayEnvMap;
          cm.envMapIntensity = 0.78;
          // Preserve exact baked glyph `emissiveMap` from `gradient_canopy_v6_glb.js` for crisp satin-white `Google Store`!
          if (cm.emissiveMap) {
            cm.emissive = new THREE.Color("#ffffff");
            cm.emissiveIntensity = 0.90;
          }
          // Replace the 3 cartoon purple/blue/green 2nd-story daisy decals (`x = 8..642, y = 1717..1908` in 2048 atlas)
          // with clean Low-E sky-reflective curtain-wall glazing + dark anodized pane dividers (`#121` MAJOR-2.3)!
          if (cm.map && cm.map.image && typeof document !== "undefined") {
            const img = cm.map.image;
            const w = img.width || img.videoWidth || 0;
            const h = img.height || img.videoHeight || 0;
            if (w > 0 && h > 0) {
              const cvs = document.createElement("canvas");
              cvs.width = w;
              cvs.height = h;
              const ctx = cvs.getContext("2d");
              ctx.drawImage(img, 0, 0, w, h);
              const sx = w / 2048.0;
              const sy = h / 2048.0;
              const x0 = Math.round(8 * sx);
              const xw = Math.round((642 - 8) * sx);
              const y0 = Math.round(1717 * sy);
              const y1 = Math.round(1908 * sy);
              const grad = ctx.createLinearGradient(0, y0, 0, y1);
              grad.addColorStop(0.0, "rgb(96, 146, 190)");
              grad.addColorStop(1.0, "rgb(50, 84, 116)");
              ctx.fillStyle = grad;
              ctx.fillRect(x0, y0, xw, Math.max(1, y1 - y0));
              ctx.fillStyle = "rgb(26, 28, 30)";
              const divW = Math.max(2, Math.round(4 * sx));
              for (const mx of [116, 232, 348, 464, 580]) {
                ctx.fillRect(Math.round(mx * sx - divW * 0.5), y0, divW, Math.max(1, y1 - y0));
              }
              const cleanMap = new THREE.CanvasTexture(cvs);
              cleanMap.colorSpace = THREE.SRGBColorSpace;
              cleanMap.flipY = cm.map.flipY;
              cleanMap.wrapS = cm.map.wrapS;
              cleanMap.wrapT = cm.map.wrapT;
              cleanMap.anisotropy = cm.map.anisotropy || 4;
              cleanMap.needsUpdate = true;
              cm.map = cleanMap;
            }
          }
        }
        cache.set(m.uuid, cm);
        return cm;
      };
    })();

    let installedAny = false;

    // 1. Authentic Google Visitor Experience / `Gradient_Canopy_Building_V6`
    //    `#66` Exact Spec: child meshes are centered around local `(0,0,0)` with `minY === 0.0000m`;
    //    `position.set(0.0, 0.0, 145.0)` + `rotation.set(0.0, Math.PI, 0.0)` lands the front curtain wall (`z_local = +13.80m`)
    //    at exact `Z_world = 131.20m` (`GYM_BREAKOUT_CONFIG.glassPlaneZ`) with `x in [-11.08, +11.08], y in [0.00, 4.98], z in [130.68, 148.85]`
    //    100% open for `this.gymStorefrontFacadeGroup` + `this.intactGymGlassMesh` (`4x6` Spin Studio breakable bay)!
    if (gradProto) {
      if (this.gradientCanopyV6Group) this.root.remove(this.gradientCanopyV6Group);
      const gClone = gradProto.clone(true);
      gClone.name = "Gradient_Canopy_Building_V6";
      gClone.scale.set(1.0, 1.0, 1.0);
      gClone.rotation.set(0.0, Math.PI, 0.0);
      gClone.position.set(0.0, 0.0, 145.0);
      gClone.updateMatrixWorld(true);

      // Collect the 3 animated pinwheel rotors (`Visitor_Origami_Pinwheel_Rotor_1..3_V6`) inside `Gradient_Canopy_Building_V6`
      // and enforce Contract 5B `Visitor_Mast_YawMount_1..3_V6` (`[-16 deg, +2 deg, +38 deg]`) so Mast #3 displays its white rear bearing nacelle!
      this.v6PinwheelRotors = [];
      let hasV6Pinwheels = false;
      const nearFrontalYawByMast = {
        Visitor_Mast_YawMount_1_V6: THREE.MathUtils.degToRad(-16.0),
        Visitor_Mast_YawMount_2_V6: THREE.MathUtils.degToRad(2.0),
        Visitor_Mast_YawMount_3_V6: THREE.MathUtils.degToRad(38.0),
      };
      gClone.traverse((ch) => {
        if (ch.name && Object.prototype.hasOwnProperty.call(nearFrontalYawByMast, ch.name)) {
          ch.rotation.set(0.0, nearFrontalYawByMast[ch.name], 0.0);
        }
        if (/Pinwheel/i.test(ch.name || "")) {
          hasV6Pinwheels = true;
          let insideExistingRotor = false;
          let p = ch.parent;
          while (p && p !== gClone) {
            if (this.v6PinwheelRotors.includes(p)) {
              insideExistingRotor = true;
              break;
            }
            p = p.parent;
          }
          if (!insideExistingRotor && /Rotor|Blades|Wheel|Head|Vane/i.test(ch.name || "")) {
            this.v6PinwheelRotors.push(ch);
          } else if (insideExistingRotor && /Pinwheel.*Rotor|Origami.*Rotor|Pinwheel_Blades/i.test(ch.name || "")) {
            ch.name = ch.name.replace(/Rotor|Blades/gi, "SailMesh");
          }
        }
        if (ch.isMesh) {
          ch.material = Array.isArray(ch.material)
            ? ch.material.map(tuneArchMat)
            : tuneArchMat(ch.material);
          const mb = new THREE.Box3().setFromObject(ch);
          // Let golden sunlight stream through the Spin Studio roof (`(0.76, 141.58)`)
          const overlapsSpinStudioRoof =
            mb.max.y > 4.2 && mb.min.x < 8.0 && mb.max.x > -8.0 && mb.min.z < 149.0 && mb.max.z > 130.0;
          ch.castShadow = !overlapsSpinStudioRoof && !this.isSoftwareRenderer;
          ch.receiveShadow = true;
        }
      });

      // Hide legacy `KINETIC_PINWHEELS` in `z > 88` (`|x| < 28m`) so the Visitor Experience forecourt keeps ONLY its 3 authentic white-mast 4-color origami pinwheels!
      this._hideVisitorFrontPinwheelIndices.clear();
      if (hasV6Pinwheels) {
        for (let i = 0; i < KINETIC_PINWHEELS.length; i++) {
          if (KINETIC_PINWHEELS[i].z > 88.0 && Math.abs(KINETIC_PINWHEELS[i].x) < 28.0) {
            this._hideVisitorFrontPinwheelIndices.add(i);
          }
        }
        if (this.pinwheelV2MastInstanced && this._hideVisitorFrontPinwheelIndices.size > 0) {
          let keptMasts = 0;
          for (let i = 0; i < KINETIC_PINWHEELS.length; i++) {
            if (this._hideVisitorFrontPinwheelIndices.has(i)) continue;
            const pw = KINETIC_PINWHEELS[i];
            const gy = getOpenWorldTerrainHeight(pw.x, pw.z);
            const s = pw.heightM / 3.18;
            const yaw = pw.x < 0 ? 0.25 : -0.25;
            _pos.set(pw.x, gy, pw.z);
            _euler.set(0.0, yaw, 0.0);
            _quat.setFromEuler(_euler);
            _scale.setScalar(s);
            _mat4.compose(_pos, _quat, _scale);
            this.pinwheelV2MastInstanced.setMatrixAt(keptMasts, _mat4);
            keptMasts++;
          }
          this.pinwheelV2MastInstanced.count = keptMasts;
          this.pinwheelV2MastInstanced.instanceMatrix.needsUpdate = true;
        }
      }

      if (this.gradientCanopyFallback) {
        this.gradientCanopyFallback.visible = false;
        this.gradientCanopyFallback.userData.replacedByV6 = true;
      }
      if (this.gradientCanopyV2Group) {
        this.gradientCanopyV2Group.visible = false;
        this.gradientCanopyV2Group.userData.replacedByV6 = true;
      }
      gClone.userData.explicitSurfaceY = 0.0;
      gClone.userData.groundAsSingleUnit = true;
      this.gradientCanopyV6Group = gClone;
      this.root.add(gClone);
      installedAny = true;
    }

    // 2. `Bay_View_Canopy_Pavilion_V6` replacing the brown truss building along the Bay View Retention Basin
    //    `#66` Exact Spec: `position.set(202.0, 0.0, 38.0)`, `rotation.set(0.0, -Math.PI * 0.5, 0.0)`, `scale.set(1,1,1)`
    //    seated on a crisp Sierra granite waterfront terrace island rising out of the `-0.14m` Fresnel pond!
    if (bayProto) {
      if (this.bayViewV6Group) this.root.remove(this.bayViewV6Group);
      const bayContainer = new THREE.Group();
      bayContainer.name = "Bay_View_Canopy_Pavilion_V6";
      bayContainer.userData.skipGroundingAudit = true;

      const islandMat = this.materials.graniteCurb || this.materials.concreteSidewalk;
      const addBayWing = (wingName, wx, wz, rotY, sc = 1.0) => {
        const bClone = bayProto.clone(true);
        bClone.name = wingName;
        bClone.scale.setScalar(sc);
        bClone.rotation.set(0.0, rotY, 0.0);
        bClone.position.set(wx, 0.0, wz);
        bClone.traverse((ch) => {
          if (ch.isMesh) {
            ch.material = Array.isArray(ch.material)
              ? ch.material.map(tuneArchMat)
              : tuneArchMat(ch.material);
            ch.castShadow = !this.isSoftwareRenderer;
            ch.receiveShadow = true;
          }
        });
        bayContainer.add(bClone);

        // Grounded granite waterfront island plinth (`y in [-0.30, 0.002]`) so zero gap shows above `-0.14m` water!
        const islG = new THREE.BoxGeometry(38.0 * sc, 0.302, 54.0 * sc);
        const islM = new THREE.Mesh(islG, islandMat);
        islM.name = `${wingName}_Waterfront_Terrace_Plinth`;
        islM.position.set(wx, -0.149, wz);
        islM.rotation.y = rotY + Math.PI * 0.5;
        islM.receiveShadow = true;
        islM.castShadow = false;
        bayContainer.add(islM);
      };

      addBayWing("Bay_View_Canopy_Pavilion_V6_Main", 202.0, 38.0, -Math.PI * 0.5, 1.0);
      addBayWing("Bay_View_Canopy_Pavilion_V6_North", 205.0, -20.0, -Math.PI * 0.5, 0.84);

      if (this.bayViewFallback) {
        this.bayViewFallback.visible = false;
        this.bayViewFallback.userData.replacedByV6 = true;
      }
      if (this.bayViewV2Group) {
        this.bayViewV2Group.visible = false;
        this.bayViewV2Group.userData.replacedByV6 = true;
      }
      this.bayViewV6Group = bayContainer;
      this.root.add(bayContainer);
      installedAny = true;
    }

    // 3. `Campus_Office_Pavilion_V6` swap across all 10 campus office pavilions (warm limestone + brushed terracotta louvers)
    if (pavV6Proto && this._pavilionSpecsV6?.length) {
      if (this.archV5PavilionsGroup) this.root.remove(this.archV5PavilionsGroup);
      const pavGroup = new THREE.Group();
      pavGroup.name = "Campus_V6_Pavilions_Container";
      for (const sp of this._pavilionSpecsV6) {
        const pav = pavV6Proto.clone(true);
        pav.name = `Campus_Office_Pavilion_V6_${sp.id}`;
        const gy = getDefaultCampusSurfaceTopY(sp.x, sp.z, "pavilion");
        pav.scale.set(sp.sx, sp.sy, sp.sz);
        pav.rotation.set(0.0, sp.rotY, 0.0);
        pav.position.set(sp.x, gy, sp.z);
        pav.traverse((ch) => {
          if (ch.isMesh) {
            ch.material = Array.isArray(ch.material)
              ? ch.material.map(tuneArchMat)
              : tuneArchMat(ch.material);
            ch.castShadow = true;
            ch.receiveShadow = true;
          }
        });
        groundObjectToY(pav, gy, 0.0);
        pav.userData.bx = sp.x;
        pav.userData.bz = sp.z;
        pavGroup.add(pav);
      }
      this.archV5PavilionsGroup = pavGroup;
      this.root.add(pavGroup);
      installedAny = true;
    }

    this._syncTpu8iLandmarkShowcase();
    return installedAny;
  }

  /**
   * V7 Integration (`tpu_8i_glb.js` from `@blender-pinwheels-tpu8i`):
   * Swaps 100% of 16 campus collectibles, GBike basket template, Bay View architectural wall plaques,
   * and Shoreline Supercluster rack compute blades to portrait `TPU 8i` (`0.50m x 0.62m = 1:1.24`,
   * dark slate substrate + 2x2 champagne-gold compute chiplets catching golden-hour sun glints).
   */
  applyTpu8iV7Glb(tpu8iScene) {
    if (!tpu8iScene) return null;

    let srcNode = null;
    tpu8iScene.traverse((n) => {
      if (!srcNode && n !== tpu8iScene && /TPU_8i/i.test(n.name || "")) {
        srcNode = n;
      }
    });
    if (!srcNode && tpu8iScene.children.length > 0) {
      srcNode = tpu8iScene.children[0];
    }
    if (!srcNode) return null;

    // Dispose any superseded `TPU_Wafer_V2` collectible batches
    if (Array.isArray(this.tpuInstancedBatches)) {
      for (const oldInst of this.tpuInstancedBatches) {
        if (!oldInst) continue;
        if (oldInst.parent) oldInst.parent.remove(oldInst);
        if (typeof oldInst.dispose === "function") oldInst.dispose();
      }
    }
    this.tpuInstancedBatches = [];

    const cleanTpu = new THREE.Group();
    cleanTpu.name = "TPU_8i_Package_V7_Template";
    const rawClone = srcNode.clone(true);
    rawClone.position.set(0, 0, 0);
    rawClone.rotation.set(0, 0, 0);
    rawClone.scale.set(1, 1, 1);
    rawClone.updateMatrixWorld(true);

    const bb = new THREE.Box3().setFromObject(rawClone);
    const center = bb.getCenter(new THREE.Vector3());
    const invRoot = rawClone.matrixWorld.clone().invert();

    rawClone.traverse((ch) => {
      if (!ch.isMesh || !ch.geometry || !ch.material) return;
      const relMat = invRoot.clone().multiply(ch.matrixWorld);
      const geom = ch.geometry.clone();
      geom.applyMatrix4(relMat);
      geom.translate(-center.x, -center.y, -center.z);
      geom.computeBoundingBox();
      geom.computeBoundingSphere();

      const tuneTpuMat = (m) => {
        if (!m) return m;
        const cm = m.clone();
        cm.name = cm.name || "Mat_TPU_8i_Package_V7";
        if (cm.normalMap && cm.bumpMap) cm.bumpMap = null;
        if (cm.emissive) {
          cm.emissive.setHex(0x000000);
          cm.emissiveIntensity = 0.0;
        }
        cm.userData = cm.userData || {};
        cm.userData.v7SkipWorldCohesion = true;
        if (this.dayEnvMap) {
          cm.envMap = this.dayEnvMap;
        }
        cm.envMapIntensity = 0.96;
        // Preserve crisp 3-material chromatic separation (`#C8CFD6` cool silver / `#0F353C` deep teal / `#E8BE63` gold dies) under warm Golden-Hour sun!
        const prevKey = typeof cm.customProgramCacheKey === "function" ? cm.customProgramCacheKey.bind(cm) : null;
        cm.customProgramCacheKey = () => `${prevKey ? prevKey() : ""}|v7_tpu8i_tri_chromatic_v2`;
        cm.onBeforeCompile = (shader) => {
          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <opaque_fragment>",
            `{
              float dMax = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b));
              float dMin = min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
              float dChroma = dMax - dMin;
              // 1) Cool brushed-silver aluminum stiffener (#C8CFD6..#D2DAE6, bright cool-neutral grey where r <= b): counteract warm #ffd19b sun tint
              float silverMask = smoothstep(0.26, 0.46, dMax) * (1.0 - smoothstep(-0.02, 0.06, diffuseColor.r - diffuseColor.b));
              outgoingLight = mix(outgoingLight, outgoingLight * vec3(0.80, 0.96, 1.24), silverMask * 0.90);
              // 2) Deep cyan-teal package substrate (#0A3640..#0F353C, b >= g > r, low r): preserve rich cool cyan-teal in shadow & direct sun
              float tealMask = smoothstep(0.004, 0.028, diffuseColor.b - diffuseColor.r) * (1.0 - smoothstep(0.08, 0.22, diffuseColor.r));
              outgoingLight = mix(outgoingLight, outgoingLight * vec3(0.68, 0.98, 1.26) + diffuseColor.rgb * 0.11, tealMask * 0.92);
              // 3) 2+8 Champagne-gold compute & HBM dies (r > g > b): crisp metallic gold presence without bleeding onto silver/teal
              float goldMask = smoothstep(0.05, 0.18, diffuseColor.r - diffuseColor.b) * smoothstep(0.18, 0.42, diffuseColor.r);
              outgoingLight += diffuseColor.rgb * (goldMask * 0.12);
            }
            #include <opaque_fragment>`
          );
        };
        cm.needsUpdate = true;
        return cm;
      };
      const tunedMat = Array.isArray(ch.material)
        ? ch.material.map(tuneTpuMat)
        : tuneTpuMat(ch.material);

      const templateMesh = new THREE.Mesh(geom, tunedMat);
      templateMesh.name = "TPU_8i_Package_V7_Mesh";
      cleanTpu.add(templateMesh);
    });

    if (cleanTpu.children.length === 0) return null;

    this.tpuTemplateNode = cleanTpu;
    this.tpuMeshTemplate = cleanTpu;
    this._hasTpu8iV7 = true;

    for (let idx = 0; idx < cleanTpu.children.length; idx++) {
      const ch = cleanTpu.children[idx];
      if (!ch.isMesh || !ch.geometry || !ch.material) continue;
      const inst = new THREE.InstancedMesh(ch.geometry, ch.material, this.tpuVisuals.length);
      inst.name = `TPU_8i_Collectible_Instanced_V7_${idx}`;
      inst.castShadow = false;
      inst.receiveShadow = true;
      inst.frustumCulled = false;
      this.root.add(inst);
      this.tpuInstancedBatches.push(inst);
    }
    this.tpuGlbBatches = this.tpuInstancedBatches;

    for (const tv of this.tpuVisuals) {
      const isIronwood = tv.spec?.tier === "ironwood_gold" || (tv.spec?.value ?? 1) >= 2;
      tv.podScale = isIronwood ? 0.66 : 0.58;
      tv.baseY = tv.groundY + (tv.spec?.bonusHeightM ?? 0.56) + 0.06;
      tv.fallback.visible = false;
      tv.root.visible = false;
    }

    this._syncTpu8iLandmarkShowcase();
    return this.tpuTemplateNode;
  }

  /**
   * Mounts gleaming portrait `TPU 8i` architectural wall plaques along the Bay View waterfront promenade
   * and portrait `TPU 8i` compute blades inside all 5 Shoreline Supercluster smoked-glass racks!
   */
  _syncTpu8iLandmarkShowcase() {
    if (!this._hasTpu8iV7 || !this.tpuTemplateNode) return;
    const baseMesh = this.tpuTemplateNode.children.find((c) => c.isMesh && c.geometry && c.material);
    if (!baseMesh) return;
    if (this.dayEnvMap && baseMesh.material && baseMesh.material.envMap !== this.dayEnvMap) {
      baseMesh.material.envMap = this.dayEnvMap;
      baseMesh.material.envMapIntensity = 0.96;
      baseMesh.material.needsUpdate = true;
    }

    // 1. Bay View Waterfront Promenade Architectural `TPU 8i` Wall Plaques
    //    Mounted FLUSH & DEAD-PLUMB (`0.0` tilt!) on `Bay_View_Canopy_Pavilion_V6_Main`'s `x = 189.60m` curtain-wall facade!
    if (this.bayViewV6Group) {
      if (this._bayViewTpu8iPlaquesGroup && this._bayViewTpu8iPlaquesGroup.parent) {
        this._bayViewTpu8iPlaquesGroup.parent.remove(this._bayViewTpu8iPlaquesGroup);
      }
      const plaqueGroup = new THREE.Group();
      plaqueGroup.name = "Bay_View_TPU_8i_Wall_Plaques_V7";
      plaqueGroup.userData.skipGroundingAudit = true;

      const mountFrameMat = new THREE.MeshStandardMaterial({
        name: "BayView_TPU_8i_Bronze_WallMount_V7",
        color: "#1e2228",
        roughness: 0.42,
        metalness: 0.65,
        envMapIntensity: 0.55,
      });
      mountFrameMat.userData.v7SkipWorldCohesion = true;
      const mountFrameGeom = new THREE.BoxGeometry(0.06, 0.96, 0.78);

      const plaqueZSlots = [20.1, 27.8, 48.2, 55.9];
      for (let p = 0; p < plaqueZSlots.length; p++) {
        const zSlot = plaqueZSlots[p];
        const backing = new THREE.Mesh(mountFrameGeom, mountFrameMat);
        backing.position.set(189.47, 2.48, zSlot);
        backing.castShadow = false;
        backing.receiveShadow = true;
        plaqueGroup.add(backing);

        const plaque = new THREE.Mesh(baseMesh.geometry, baseMesh.material);
        plaque.name = `TPU_8i_BayView_Wall_Plaque_V7_${p + 1}`;
        plaque.position.set(189.41, 2.48, zSlot);
        // Face `-X` dead-plumb (`0.0` pitch/roll tilt) flush on the curtain-wall bronze mullion plane!
        plaque.rotation.set(0.0, -Math.PI * 0.5, 0.0);
        plaque.scale.setScalar(1.36);
        plaque.castShadow = false;
        plaque.receiveShadow = true;
        plaqueGroup.add(plaque);
      }
      this._bayViewTpu8iPlaquesGroup = plaqueGroup;
      this.bayViewV6Group.add(plaqueGroup);
    }

    // 2. Legacy closed-pod blade fallback ONLY (skipped on V8 open-frame horizontal liquid-cooled 12-rack stage row!)
    if (this.shorelinePodsV4Group && !this.shorelinePodsV4Group.userData?.isOpenFrameStageRowV8) {
      let podIdx = 0;
      for (const pod of this.shorelinePodsV4Group.children) {
        if (!pod || pod.isMesh) continue;
        const oldBlades = pod.getObjectByName("Shoreline_Rack_TPU_8i_Blades_V7");
        if (oldBlades) pod.remove(oldBlades);

        const bladesWrap = new THREE.Group();
        bladesWrap.name = "Shoreline_Rack_TPU_8i_Blades_V7";
        bladesWrap.userData.skipGroundingAudit = true;

        for (const [slotIdx, ySlot] of [
          [1, 0.96],
          [2, 1.72],
        ]) {
          const blade = new THREE.Mesh(baseMesh.geometry, baseMesh.material);
          blade.name = `TPU_8i_Shoreline_Supercluster_Blade_V7_R${podIdx + 1}_S${slotIdx}`;
          blade.position.set(0.0, ySlot, 0.44);
          blade.rotation.set(0.0, 0.0, 0.0);
          blade.scale.setScalar(1.06);
          blade.castShadow = false;
          blade.receiveShadow = true;
          bladesWrap.add(blade);
        }
        pod.add(bladesWrap);
        podIdx++;
      }
      this.shorelinePodsV4Group.updateMatrixWorld(true);
    }
  }

  /**
   * V6 Integration (`props_and_bridge_v6_glb.js` from `@blender-props-bridge-v6`):
   * - Replaces all snack carts with `Campus_Snack_Cart_V6`
   * - Replaces Stevens Creek bridge with weathered Corten steel `Stevens_Creek_Bridge_V6` (`t = 61s-63s`, `0.0mm` deck fit)
   * - Replaces all courtyard/patio cone umbrellas with `Campus_Umbrella_Cafe_Set_V6`
   * - Replaces jump ramps with `Campus_Jump_Ramp_V6` (`0.0mm` kinematic deck fit)
   * - Replaces EVERY brown planter box, faceted green bush & low-poly rock with `Campus_Botanical_Kit_V6`
   *   (`Campus_Planter_Box_V6`, `Shrub_Coastal_Cluster_V6`, `Shrub_Manicured_Hedge_V6`, `Ornamental_Grass_Plume_V6`, `Sierra_Granite_Boulder_V6`)!
   */
  applyPropsAndBridgeV6Glb(propsBridgeV6Scene) {
    if (!propsBridgeV6Scene) return false;

    const findV6Node = (patterns) => {
      for (const pat of patterns) {
        let exact = null;
        propsBridgeV6Scene.traverse((n) => {
          if (!exact && n !== propsBridgeV6Scene && n.name === pat) exact = n;
        });
        if (exact) return exact;
      }
      for (const pat of patterns) {
        const re = new RegExp(pat, "i");
        let fuzzy = null;
        propsBridgeV6Scene.traverse((n) => {
          if (!fuzzy && n !== propsBridgeV6Scene && re.test(n.name || "")) fuzzy = n;
        });
        if (fuzzy) return fuzzy;
      }
      return null;
    };

    // `#65` Exact Spec: all 12 root nodes sit at `(0, 0, 0)` with `minY === 0.00000m`!
    // Never recenter XZ by AABB midpoint (which would shift asymmetric props like `Campus_Snack_Cart_V6`'s A-frame chalkboard!).
    const tunedV6Mats = new Map();
    const tuneV6PropMat = (mat) => {
      if (!mat || (!mat.isMeshStandardMaterial && !mat.isMeshPhysicalMaterial)) return mat;
      if (tunedV6Mats.has(mat.uuid)) return tunedV6Mats.get(mat.uuid);
      const cm = mat.clone();
      cm.envMapIntensity = Math.min(cm.envMapIntensity ?? 0.55, 0.62);
      // Preserve crisp `MASK` botanical cutout foliage (`alphaTest >= 0.45`, `DoubleSide`, `depthWrite = true`)
      if ((cm.alphaTest && cm.alphaTest > 0.01) || /Leaf|Foliage|Grass|Plume|Fern|Frond/i.test(cm.name || "")) {
        if (cm.alphaTest > 0.01 || cm.alphaMap || (cm.map && cm.transparent)) {
          cm.alphaTest = Math.max(cm.alphaTest || 0.0, 0.45);
          cm.transparent = false;
          cm.depthWrite = true;
          cm.side = THREE.DoubleSide;
        }
      }
      tunedV6Mats.set(mat.uuid, cm);
      return cm;
    };

    const cloneV6PropDirect = (srcNode) => {
      const c = srcNode.clone(true);
      c.position.set(0.0, 0.0, 0.0);
      c.rotation.set(0.0, 0.0, 0.0);
      c.scale.set(1.0, 1.0, 1.0);
      c.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(c);
      const wrap = new THREE.Group();
      wrap.name = srcNode.name || "V6_Prop";
      // V8 Item 11: NEVER vertically recenter authored `Z = 0.000m` kinematic ramp or bridge decks by `-b.min.y`!
      const preserveAuthoredOriginY =
        /Campus_Wooden_Ramp|Campus_Jump_Ramp|Campus_Landing_Ramp|Landing_Ramp|Stevens_Creek_Bridge|Creek_Bridge|Corten_Bridge/i.test(
          srcNode.name || ""
        );
      if (!preserveAuthoredOriginY && Number.isFinite(b.min.y) && Math.abs(b.min.y) > 1e-5) {
        c.position.y = -b.min.y;
      }
      c.traverse((m) => {
        if (m.isMesh) {
          m.castShadow = !this.isSoftwareRenderer;
          m.receiveShadow = true;
          m.material = Array.isArray(m.material)
            ? m.material.map(tuneV6PropMat)
            : tuneV6PropMat(m.material);
        }
      });
      wrap.add(c);
      wrap.updateMatrixWorld(true);
      return { wrap, size: b.getSize(new THREE.Vector3()), rawBox: b };
    };

    let installedAny = false;

    // 1. `Campus_Snack_Cart_V6` across all `mkCartPlacements` (customer `+Z` facade facing street!)
    const cartSrc = findV6Node(["Campus_Snack_Cart_V6", "Snack_Cart_V6", "Espresso_Cart_V6"]);
    if (cartSrc && this.mkCartPlacements.length > 0) {
      if (this.mkCartsV6Group) this.root.remove(this.mkCartsV6Group);
      const cartsGroup = new THREE.Group();
      cartsGroup.name = "Campus_Snack_Cart_V6_Group";
      for (let i = 0; i < this.mkCartPlacements.length; i++) {
        const pl = this.mkCartPlacements[i];
        const { wrap } = cloneV6PropDirect(cartSrc);
        wrap.name = i === 0 ? "Campus_Snack_Cart_V6" : `Campus_Snack_Cart_V6_${i}`;
        const surfY = getDefaultCampusSurfaceTopY(pl.x, pl.z, "snack_cart");
        const sideSign = pl.sideSign ?? 1;
        wrap.position.set(pl.x, surfY, pl.z);
        wrap.rotation.y = pl.rotY + (sideSign > 0 ? -Math.PI * 0.5 : Math.PI * 0.5);
        wrap.userData.x = pl.x;
        wrap.userData.z = pl.z;
        wrap.userData.explicitSurfaceY = surfY;
        cartsGroup.add(wrap);
      }
      if (this.mkCartsFallbackGroup) {
        this.mkCartsFallbackGroup.visible = false;
        this.mkCartsFallbackGroup.userData.replacedByV6 = true;
      }
      if (this.mkCartsV2Group) {
        this.mkCartsV2Group.visible = false;
        this.mkCartsV2Group.userData.replacedByV6 = true;
      }
      this.mkCartsV6Group = cartsGroup;
      this.root.add(cartsGroup);
      installedAny = true;
    }

    // 2. Weathered Corten Steel `Stevens_Creek_Bridge_V6` (`#65` Exact `0.000mm` `kin.js` `1.18 * sin^2(pi * u)` deck fit!)
    const bridgeSrc = findV6Node(["Stevens_Creek_Bridge_V6", "Creek_Bridge_V6", "Corten_Bridge_V6"]);
    if (bridgeSrc) {
      if (this.stevensBridgeV6Group) this.root.remove(this.stevensBridgeV6Group);
      const brClone = bridgeSrc.clone(true);
      brClone.name = "Stevens_Creek_Bridge_V6";
      brClone.scale.set(1.0, 1.0, 1.0);
      brClone.rotation.set(0.0, Math.atan2(34.0, 72.0), 0.0);
      brClone.position.set(35.0, -0.420, -122.0);
      brClone.traverse((m) => {
        if (m.isMesh) {
          m.castShadow = !this.isSoftwareRenderer;
          m.receiveShadow = true;
          m.material = Array.isArray(m.material)
            ? m.material.map(tuneV6PropMat)
            : tuneV6PropMat(m.material);
        }
      });
      brClone.userData.skipGroundingAudit = true;

      if (this.stevensBridgeGroup) {
        this.stevensBridgeGroup.visible = false;
        this.stevensBridgeGroup.userData.replacedByV6 = true;
        if (this.stevensBridgeGroup.parent) this.stevensBridgeGroup.parent.remove(this.stevensBridgeGroup);
      }
      if (this.stevensBridgeV2Group) {
        this.stevensBridgeV2Group.visible = false;
        this.stevensBridgeV2Group.userData.replacedByV6 = true;
        if (this.stevensBridgeV2Group.parent) this.stevensBridgeV2Group.parent.remove(this.stevensBridgeV2Group);
      }
      this.stevensBridgeV6Group = brClone;
      this.root.add(brClone);
      installedAny = true;
    }

    // 3. `Campus_Umbrella_Cafe_Set_V6` + `Campus_Market_Umbrella_Solo_V6` across Stan Courtyard, Android Lawn & Bay View
    //    (Note: `Gradient_Canopy_Building_V6` already carries the 3 cream `Cafe` wing umbrellas on the Visitor Forecourt!)
    const cafeSrc = findV6Node([
      "Campus_Umbrella_Cafe_Set_V6",
      "Umbrella_Cafe_Set_V6",
      "Courtyard_Cafe_Set_V6",
    ]);
    const soloUmbSrc = findV6Node(["Campus_Market_Umbrella_Solo_V6", "Market_Umbrella_Solo_V6"]);
    if (cafeSrc) {
      if (this.cafeUmbrellasV6Group) this.root.remove(this.cafeUmbrellasV6Group);
      const cafeGroup = new THREE.Group();
      cafeGroup.name = "Campus_Umbrella_Cafe_Set_V6_Group";

      // Remap Stan Courtyard spots strictly onto the sandstone paver ring (`rStan in [16.1m, 16.5m]`, `>= 2.3m` clear of `bldg_plex_40/41`!)
      const stanRingSpotRemap = [
        [-127.6, -37.0],
        [-103.2, -56.5],
        [-127.4, -63.2],
        [-101.8, -50.2],
        [-106.5, -61.8],
        [-118.0, -66.5],
      ];
      const allCafeSpots = [
        ...(DEFAULT_COURTYARD_CAFE_SPOTS || []).map((pt, idx) =>
          idx < stanRingSpotRemap.length ? stanRingSpotRemap[idx] : pt
        ),
        // Android Lawn terrace & Bay View waterfront promenade cafe seating (100% clear of Bay View ramp jump `[18..44]`!)
        { x: -129.2, z: 102.5, rotY: 0.62, scale: 0.98 },
        { x: 158.8, z: 55.5, rotY: -0.28, scale: 0.96 },
        { x: 161.4, z: 63.5, rotY: 0.34, scale: 0.96 },
      ];
      for (let i = 0; i < allCafeSpots.length; i++) {
        const sp = allCafeSpots[i];
        const sx = Array.isArray(sp) ? sp[0] : sp?.x;
        const sz = Array.isArray(sp) ? sp[1] : sp?.z;
        if (!Number.isFinite(sx) || !Number.isFinite(sz)) continue;
        const sScale = !Array.isArray(sp) && Number.isFinite(sp?.scale) ? sp.scale : 1.0;
        const sRotY = !Array.isArray(sp) && Number.isFinite(sp?.rotY) ? sp.rotY : (i * 0.785398);
        const { wrap } = cloneV6PropDirect(cafeSrc);
        wrap.name = i === 0 ? "Campus_Umbrella_Cafe_Set_V6" : `Campus_Umbrella_Cafe_Set_V6_${i}`;
        const surfY = getDefaultCampusSurfaceTopY(sx, sz, "cafe_set");
        wrap.scale.setScalar(sScale);
        wrap.rotation.y = sRotY;
        wrap.position.set(sx, surfY, sz);
        wrap.userData.x = sx;
        wrap.userData.z = sz;
        wrap.userData.baseScale = sScale;
        wrap.userData.explicitSurfaceY = surfY;
        cafeGroup.add(wrap);
      }
      if (soloUmbSrc) {
        const soloSpots = [
          { x: -111.5, z: -65.2, rotY: 0.4, scale: 1.0 },
          { x: -123.2, z: -65.6, rotY: -0.5, scale: 1.0 },
          // Flanking outer Shoreline concourse seating benches (100% on Shoreline granite concourse & clear of `GEMINI 4 CARBON` monument!)
          { x: 32.5, z: -174.5, rotY: 0.3, scale: 1.0 },
          { x: -3.5, z: -173.2, rotY: -0.35, scale: 1.0 },
        ];
        for (let s = 0; s < soloSpots.length; s++) {
          const sp = soloSpots[s];
          const { wrap } = cloneV6PropDirect(soloUmbSrc);
          wrap.name = `Campus_Market_Umbrella_Solo_V6_${s}`;
          const surfY = getDefaultCampusSurfaceTopY(sp.x, sp.z, "cafe_set");
          const uScale = sp.scale || 1.0;
          wrap.scale.setScalar(uScale);
          wrap.rotation.y = sp.rotY || 0.0;
          wrap.position.set(sp.x, surfY, sp.z);
          wrap.userData.x = sp.x;
          wrap.userData.z = sp.z;
          wrap.userData.baseScale = uScale;
          wrap.userData.explicitSurfaceY = surfY;
          cafeGroup.add(wrap);
        }
      }
      if (this.courtyardCafeFallbackGroup) {
        this.courtyardCafeFallbackGroup.visible = false;
        this.courtyardCafeFallbackGroup.userData.replacedByV6 = true;
      }
      if (this.stanEncounter?.cafeSetsGroup) {
        this.stanEncounter.cafeSetsGroup.visible = false;
        this.stanEncounter.cafeSetsGroup.userData.replacedByV6 = true;
      }
      this.cafeUmbrellasV6Group = cafeGroup;
      this.root.add(cafeGroup);
      installedAny = true;
    }

    // 4. `Campus_Jump_Ramp_V6` across all `JUMP_RAMPS` (`#65` Exact `4.20m x 1.42m x 7.40m` -> `0.000mm` kinematic deck fit!)
    const rampSrc = findV6Node(["Campus_Jump_Ramp_V6", "Jump_Ramp_V6"]);
    if (rampSrc) {
      if (this.allRampsV6Group) this.root.remove(this.allRampsV6Group);
      const rampsGroup = new THREE.Group();
      rampsGroup.name = "Campus_Jump_Ramp_V6_Group";

      for (let i = 0; i < JUMP_RAMPS.length; i++) {
        const rp = JUMP_RAMPS[i];
        const fwdX = Math.sin(rp.headingYaw);
        const fwdZ = -Math.cos(rp.headingYaw);
        const halfL = rp.lengthM * 0.5;
        const baseGround =
          getOpenWorldEarthHeight(
            rp.x - fwdX * (halfL + 0.6),
            rp.z - fwdZ * (halfL + 0.6)
          ) + 0.016;

        const { wrap: rWrap } = cloneV6PropDirect(rampSrc);
        rWrap.name = i === 0 ? "Campus_Jump_Ramp_V6" : `Campus_Jump_Ramp_V6_${i}`;
        rWrap.scale.set(rp.widthM / 4.20, rp.heightM / 1.42, rp.lengthM / 7.40);
        rWrap.rotation.y = -rp.headingYaw;
        rWrap.position.set(rp.x, baseGround, rp.z);
        rWrap.traverse((m) => {
          if (m.isMesh) {
            m.castShadow = true;
            m.receiveShadow = true;
          }
        });
        rWrap.userData.explicitSurfaceY = baseGround;
        rWrap.userData.skipGroundingAudit = true;
        rampsGroup.add(rWrap);
      }

      if (this.allRampsFallbackGroup) {
        this.allRampsFallbackGroup.visible = false;
        this.allRampsFallbackGroup.userData.replacedByV6 = true;
      }
      if (this.allRampsV2Group) {
        this.allRampsV2Group.visible = false;
        this.allRampsV2Group.userData.replacedByV6 = true;
      }
      if (this.allRampsV4Group) {
        this.allRampsV4Group.visible = false;
        this.allRampsV4Group.userData.replacedByV6 = true;
      }
      this.allRampsV6Group = rampsGroup;
      this.root.add(rampsGroup);
      installedAny = true;
    }

    // 4A. `Campus_Landing_Ramp_V8` across `LANDING_RAMPS` (`3.80m W x 1.35m H x 6.00m L` at `(156.00, 0.016, 14.30)`, `0.000mm` `kin.js` fit!)
    const landingRampSrc = findV6Node([
      "Campus_Landing_Ramp_V8",
      "BayView_Landing_Ramp_V8",
      "Landing_Ramp_V8",
    ]);
    const landingSpecs =
      Array.isArray(LANDING_RAMPS) && LANDING_RAMPS.length > 0
        ? LANDING_RAMPS
        : BAYVIEW_LANDING_RAMP
          ? [BAYVIEW_LANDING_RAMP]
          : [];
    if (landingRampSrc && landingSpecs.length > 0) {
      if (this.landingRampsV8Group) this.root.remove(this.landingRampsV8Group);
      const landingGroup = new THREE.Group();
      landingGroup.name = "Campus_Landing_Ramp_V8_Group";

      // Verify local `+Z` vs `-Z` crest height once so South `z = +3.00m` (`z = 17.30m` world) ALWAYS has the `1.35m` entry crest!
      let posZMaxY = -Infinity;
      let negZMaxY = -Infinity;
      const tmpV = new THREE.Vector3();
      const probeLr = landingRampSrc.clone(true);
      probeLr.position.set(0, 0, 0);
      probeLr.rotation.set(0, 0, 0);
      probeLr.scale.set(1, 1, 1);
      probeLr.updateMatrixWorld(true);
      probeLr.traverse((m) => {
        if (!m.isMesh || !m.geometry?.attributes?.position) return;
        const pa = m.geometry.attributes.position;
        const step = Math.max(1, Math.floor(pa.count / 256));
        for (let vi = 0; vi < pa.count; vi += step) {
          tmpV.fromBufferAttribute(pa, vi).applyMatrix4(m.matrixWorld);
          if (tmpV.z > 0.25 && tmpV.y > posZMaxY) posZMaxY = tmpV.y;
          if (tmpV.z < -0.25 && tmpV.y > negZMaxY) negZMaxY = tmpV.y;
        }
      });
      const highEndAtLocalPosZ = posZMaxY >= negZMaxY;

      for (let i = 0; i < landingSpecs.length; i++) {
        const lr = landingSpecs[i];
        // IMPORTANT: Use `getOpenWorldEarthHeight(lr.x, lr.z) + 0.016` (NOT `getOpenWorldTerrainHeight`, which includes the ramp height!)
        const baseAsphaltY = getOpenWorldEarthHeight(lr.x, lr.z) + 0.016;
        const { wrap: lrWrap } = cloneV6PropDirect(landingRampSrc);
        lrWrap.name = i === 0 ? "Campus_Landing_Ramp_V8" : `Campus_Landing_Ramp_V8_${i}`;
        lrWrap.scale.set(
          (lr.widthM || 3.80) / 3.80,
          (lr.heightM || 1.35) / 1.35,
          (lr.lengthM || 6.00) / 6.00
        );
        const headingYaw = lr.headingYaw ?? 0.0;
        lrWrap.rotation.y = -headingYaw + (highEndAtLocalPosZ ? 0.0 : Math.PI);
        lrWrap.position.set(lr.x, baseAsphaltY, lr.z);
        lrWrap.traverse((m) => {
          if (m.isMesh) {
            m.castShadow = true;
            m.receiveShadow = true;
          }
        });
        lrWrap.userData.explicitSurfaceY = baseAsphaltY;
        lrWrap.userData.skipGroundingAudit = true;
        landingGroup.add(lrWrap);
      }

      if (this.landingRampFallbackGroup) {
        this.landingRampFallbackGroup.visible = false;
        this.landingRampFallbackGroup.userData.replacedByV8 = true;
      }
      this.landingRampsV8Group = landingGroup;
      this.root.add(landingGroup);
      installedAny = true;
    }

    // 4B. `Courtyard_Landscape_Berm_V6` replacing `this.archV5BermsGroup` across all 7 courtyard earthwork berms!
    const bermV6Src = findV6Node(["Courtyard_Landscape_Berm_V6", "Landscape_Berm_V6"]);
    if (bermV6Src && this._bermSpecsV6?.length) {
      if (this.archV5BermsGroup) this.root.remove(this.archV5BermsGroup);
      const bermGroup = new THREE.Group();
      bermGroup.name = "Campus_Berms_V6_Container";
      for (let i = 0; i < this._bermSpecsV6.length; i++) {
        const bs = this._bermSpecsV6[i];
        const { wrap: berm } = cloneV6PropDirect(bermV6Src);
        berm.name = `Courtyard_Landscape_Berm_V6_${i}`;
        const gy = getDefaultCampusSurfaceTopY(bs.x, bs.z, "berm");
        berm.scale.set(0.68 * bs.sx, 0.85 * bs.sy, 0.68 * bs.sz);
        berm.rotation.set(0.0, bs.rotY, 0.0);
        berm.position.set(bs.x, gy, bs.z);
        groundObjectToY(berm, gy, 0.0);
        berm.userData.bx = bs.x;
        berm.userData.bz = bs.z;
        bermGroup.add(berm);
      }
      this.archV5BermsGroup = bermGroup;
      this.root.add(bermGroup);
      installedAny = true;
    }

    // 5. `Campus_Botanical_Kit_V6`: Replace EVERY `Campus_Planter_V3` box/bush + dress berms, forecourt & water banks!
    const planterBoxSrc = findV6Node(["Campus_Planter_Box_V6", "Planter_Box_V6"]);
    const shrubClusterSrc = findV6Node(["Shrub_Coastal_Cluster_V6", "Coastal_Cluster_V6", "Shrub_Cluster_V6"]);
    const hedgeSrc = findV6Node(["Shrub_Manicured_Hedge_V6", "Manicured_Hedge_V6", "Hedge_V6"]);
    const grassPlumeSrc = findV6Node(["Ornamental_Grass_Plume_V6", "Grass_Plume_V6", "Bunchgrass_V6"]);
    const boulderSrcA = findV6Node(["Sierra_Granite_Boulder_V6_A", "Sierra_Granite_Boulder_V6", "Granite_Boulder_V6"]);
    const boulderSrcB = findV6Node(["Sierra_Granite_Boulder_V6_B"]);

    if (planterBoxSrc || shrubClusterSrc || hedgeSrc || grassPlumeSrc || boulderSrcA) {
      if (this.botanicalKitV6Group) this.root.remove(this.botanicalKitV6Group);
      const botGroup = new THREE.Group();
      botGroup.name = "Campus_Botanical_Kit_V6";

      // Remove `Campus_Planter_V3` from `propDynamicBatches` so ZERO brown V3 boxes or faceted green icosahedron bushes render!
      this._hasV6Planters = true;
      if (this.propDynamicBatches) {
        this.propDynamicBatches = this.propDynamicBatches.filter((batch) => {
          const isOldPlanter = batch.meshes?.some((m) => /Campus_Planter/i.test(m.name || ""));
          if (isOldPlanter) {
            for (const m of batch.meshes) {
              m.visible = false;
              m.count = 0;
              if (m.parent) m.parent.remove(m);
            }
          }
          return !isOldPlanter;
        });
      }

      const buildV6InstancedBatch = (
        srcNode,
        batchName,
        placements,
        category = "shrub",
        explicitSurfaceY = null
      ) => {
        if (!srcNode || !placements || placements.length === 0) return;
        const { wrap } = cloneV6PropDirect(srcNode);
        const prims = [];
        wrap.updateMatrixWorld(true);
        wrap.traverse((m) => {
          if (m.isMesh && m.geometry) {
            const g = m.geometry.clone();
            g.applyMatrix4(m.matrixWorld);
            g.computeBoundingBox();
            prims.push({ geometry: g, material: m.material });
          }
        });
        if (prims.length === 0) return;

        let baseIdx = 0;
        let minBottom = Infinity;
        for (let p = 0; p < prims.length; p++) {
          const by = prims[p].geometry.boundingBox?.min?.y ?? 0;
          if (by < minBottom) {
            minBottom = by;
            baseIdx = p;
          }
        }

        const shouldCastV6PropShadow = category === "planter" || category === "boulder";
        const meshes = [];
        for (let p = 0; p < prims.length; p++) {
          const inst = new THREE.InstancedMesh(
            prims[p].geometry,
            prims[p].material,
            placements.length
          );
          inst.name = p === baseIdx ? batchName : `${batchName}_SubPart_ShadowLinked`;
          if (Number.isFinite(explicitSurfaceY)) {
            inst.userData.explicitSurfaceY = explicitSurfaceY;
          }
          inst.castShadow = shouldCastV6PropShadow;
          inst.receiveShadow = true;
          inst.frustumCulled = false;
          for (let i = 0; i < placements.length; i++) {
            const pl = placements[i];
            _pos.set(pl.x, pl.y, pl.z);
            _euler.set(0.0, pl.rotY || 0.0, 0.0);
            _quat.setFromEuler(_euler);
            _scale.set(pl.sx || pl.scale || 1.0, pl.sy || pl.scale || 1.0, pl.sz || pl.scale || 1.0);
            if (!pl.mat4) pl.mat4 = new THREE.Matrix4();
            pl.mat4.compose(_pos, _quat, _scale);
            inst.setMatrixAt(i, pl.mat4);
          }
          inst.instanceMatrix.needsUpdate = true;
          botGroup.add(inst);
          meshes.push(inst);
        }
        if (this.propDynamicBatches) {
          this.propDynamicBatches.push({
            name: batchName,
            category,
            placements,
            meshes,
            baseMeshIndex: baseIdx,
            mode: "centered",
            castShadow: shouldCastV6PropShadow,
          });
          this._cullForceRebuild = true;
        }
      };

      const rngBot = createMulberry32(0x607a21ca);

      // A. Architectural Planter Boxes (`Campus_Planter_Box_V6` — `1.06m` tall, ALREADY planted with shrubs & grasses!)
      //    Includes deduplicated flanking sidewalk planter boxes on BOTH sides of every `Campus_Snack_Cart_V6`!
      if (planterBoxSrc) {
        const planterPls = [];
        for (const p of this.planterPlacements || []) {
          if (planterPls.every((q) => Math.hypot(q.x - p.x, q.z - p.z) >= 2.05)) {
            planterPls.push({
              x: p.x,
              y: getDefaultCampusSurfaceTopY(p.x, p.z, "planter"),
              z: p.z,
              rotY: p.rotY || 0.0,
              scale: 1.0,
            });
          }
        }
        if (planterPls.length > 0) {
          buildV6InstancedBatch(planterBoxSrc, "Campus_Planter_Box_V6", planterPls, "planter");
        }
      }

      // B. Multi-Clump Botanical Shrubs, Manicured Hedges, Ornamental Grass Plumes & Sierra Granite Boulders (`_A` + `_B`)
      //    100% strictly gated on `isCampusGrassAllowedAt(x, z, { minCarriagewayClearanceM: 4.15 })` AND
      //    completely excluded from Stan Courtyard (`rStan <= 19.85` & N/S paver walkways) and Gradient Hex Forecourt!
      const shrubPlacements = [];
      const hedgePlacements = [];
      const plumePlacements = [];
      const boulderPlacementsA = [];
      const boulderPlacementsB = [];
      const botanicalAuditRecords = [];

      const isGroundBotanicalAllowedAt = (x, z) => {
        if (Math.hypot(x + 118.0, z + 50.0) <= 19.85) return false;
        if (Math.abs(x + 118.0) <= 6.2 && z >= -82.0 && z <= -18.0) return false;
        if (Math.abs(x) <= 27.2 && z >= 114.3 && z <= 159.5) return false;
        if (Math.abs(x) < 5.2 && z > 113.5 && z < 136.0) return false;
        return isCampusGrassAllowedAt(x, z, { minCarriagewayClearanceM: 4.15 });
      };

      const pushGroundedBotanical = (arr, x, z, scaleMin, scaleMax, kindLabel = "botanical") => {
        if (!isGroundBotanicalAllowedAt(x, z)) return;
        const sc = scaleMin + rngBot() * (scaleMax - scaleMin);
        const y = getOpenWorldSurfaceForBotanical(x, z);
        const entry = {
          x,
          y,
          z,
          rotY: rngBot() * Math.PI * 2.0,
          sx: sc * (0.92 + rngBot() * 0.18),
          sy: sc * (0.88 + rngBot() * 0.24),
          sz: sc * (0.92 + rngBot() * 0.18),
        };
        arr.push(entry);
        botanicalAuditRecords.push({ x, y, z, kind: kindLabel });
      };
      const getOpenWorldSurfaceForBotanical = (x, z) => getDefaultCampusSurfaceTopY(x, z, "shrub");

      let bIdxToggle = 0;
      const pushBoulder = (x, z, sMin, sMax) => {
        const targetArr = boulderSrcB && (bIdxToggle++ & 1) === 1 ? boulderPlacementsB : boulderPlacementsA;
        pushGroundedBotanical(targetArr, x, z, sMin, sMax, "boulder");
      };

      // 0. Lush multi-clump coastal shrubs & bunchgrasses framing the lawn BEHIND every `Campus_Snack_Cart_V6` hardscape apron!
      for (const cartPl of this.mkCartPlacements || []) {
        const rYaw = Number.isFinite(cartPl.roadYaw) ? cartPl.roadYaw : -cartPl.rotY;
        const tanX = Math.sin(rYaw);
        const tanZ = -Math.cos(rYaw);
        const outX = Math.cos(rYaw) * (cartPl.sideSign ?? 1);
        const outZ = Math.sin(rYaw) * (cartPl.sideSign ?? 1);
        for (const side of [-1, 1]) {
          pushGroundedBotanical(
            shrubPlacements,
            cartPl.x + tanX * side * 3.85 + outX * 2.85,
            cartPl.z + tanZ * side * 3.85 + outZ * 2.85,
            0.95,
            1.34,
            "shrub"
          );
          pushGroundedBotanical(
            plumePlacements,
            cartPl.x + tanX * side * 2.65 + outX * 2.75,
            cartPl.z + tanZ * side * 2.65 + outZ * 2.75,
            0.95,
            1.35,
            "grass_plume"
          );
        }
        pushGroundedBotanical(
          shrubPlacements,
          cartPl.x + outX * 2.95,
          cartPl.z + outZ * 2.95,
          0.92,
          1.26,
          "shrub"
        );
      }

      // 1. Outer Garden Lawn Berms (`rStan > 19.85m` & Android Lawn Berms)
      for (const bs of this._bermSpecsV6 || []) {
        const c = Math.cos(bs.rotY);
        const s = Math.sin(bs.rotY);
        pushBoulder(bs.x + c * 3.8 - s * 1.6, bs.z + s * 3.8 + c * 1.6, 0.85, 1.35);
        pushBoulder(bs.x - c * 3.9 + s * 1.8, bs.z - s * 3.9 - c * 1.8, 0.68, 1.08);
        pushGroundedBotanical(shrubPlacements, bs.x + c * 2.6 + s * 2.2, bs.z + s * 2.6 - c * 2.2, 0.90, 1.30, "shrub");
        pushGroundedBotanical(shrubPlacements, bs.x - c * 2.8 - s * 2.0, bs.z - s * 2.8 + c * 2.0, 0.85, 1.25, "shrub");
        pushGroundedBotanical(plumePlacements, bs.x + c * 4.2, bs.z + s * 4.2, 0.90, 1.35, "grass_plume");
        pushGroundedBotanical(plumePlacements, bs.x - c * 4.1, bs.z - s * 4.1, 0.90, 1.35, "grass_plume");
      }

      // 2. Lawn Beds along Pinwheel Spine & Charleston Blvd (`>= 4.15m` outside carriageways, 0 plants on Gradient Hex Pavers!)
      for (const [vx, vz] of [
        [-11.8, 108.5], [11.8, 108.5], [-11.8, 94.0], [11.8, 90.5],
        [-28.0, 82.5], [-52.0, 82.5], [-78.0, 82.5], [-98.0, 82.5],
        [28.0, 62.5], [58.0, 62.5], [92.0, 62.5], [124.0, 62.5],
      ]) {
        pushGroundedBotanical(shrubPlacements, vx, vz, 0.88, 1.25, "shrub");
        pushGroundedBotanical(plumePlacements, vx + 1.35, vz + 0.45, 0.90, 1.28, "grass_plume");
      }

      // 3. Manicured Hedges flanking Android Lawn North Perimeter (`0` hedges in Stan Courtyard or Gradient Hex Forecourt!)
      for (const [hx, hz, hRot] of [
        [-126.0, 109.2, 0.0], [-110.0, 109.2, 0.0],
      ]) {
        if (isGroundBotanicalAllowedAt(hx, hz)) {
          const hy = getDefaultCampusSurfaceTopY(hx, hz, "hedge");
          hedgePlacements.push({
            x: hx,
            y: hy,
            z: hz,
            rotY: hRot,
            scale: 1.0,
          });
          botanicalAuditRecords.push({ x: hx, y: hy, z: hz, kind: "hedge" });
        }
      }

      // 4. Bay View Lawn Bank & Stevens Creek Riparian Boulders + Reeds (strictly on valid turf banks!)
      for (let pz = -48.0; pz <= 72.0; pz += 14.5) {
        pushBoulder(142.8, pz + (rngBot() - 0.5) * 3.0, 0.72, 1.28);
        pushGroundedBotanical(plumePlacements, 143.2, pz + 2.2, 0.95, 1.42, "grass_plume");
        pushGroundedBotanical(shrubPlacements, 142.2, pz - 2.6, 0.82, 1.18, "shrub");
      }
      for (let cx = -168.0; cx <= 176.0; cx += 9.5) {
        const cz = stevensCreekCenterZ(cx);
        const hw = stevensCreekHalfWidthZ(cx);
        for (const side of [-1, 1]) {
          const bz = cz + side * (hw + 3.2);
          // Keep bridge north/south portals (`(52, -86)` & `(18, -158)`) clear!
          if (Math.hypot(cx - 52.0, bz - -86.0) < 11.5 || Math.hypot(cx - 18.0, bz - -158.0) < 11.5) {
            continue;
          }
          pushBoulder(cx + (rngBot() - 0.5) * 2.2, bz, 0.82, 1.44);
          pushGroundedBotanical(plumePlacements, cx + 1.6, cz + side * (hw + 3.0), 1.0, 1.46, "grass_plume");
          if (Math.abs(cx) < 110.0) {
            pushGroundedBotanical(shrubPlacements, cx - 1.8, cz + side * (hw + 3.8), 0.86, 1.24, "shrub");
          }
        }
      }
      // Zone 4 Foothill / Android Climb Sierra Granite Boulders along lawn edge
      for (const [bx, bz] of [
        [-42.0, 88.2], [-68.0, 88.4], [-92.0, 88.0], [-134.5, 96.5], [-132.0, 106.0],
      ]) {
        pushBoulder(bx, bz, 0.90, 1.48);
        pushGroundedBotanical(plumePlacements, bx + 1.5, bz + 0.6, 0.95, 1.32, "grass_plume");
      }

      this._botanicalPlacementsAudit = botanicalAuditRecords;

      if (shrubPlacements.length > 0) {
        buildV6InstancedBatch(shrubClusterSrc, "Shrub_Coastal_Cluster_V6", shrubPlacements, "shrub");
      }
      if (hedgePlacements.length > 0) {
        buildV6InstancedBatch(hedgeSrc, "Shrub_Manicured_Hedge_V6", hedgePlacements, "hedge");
      }
      if (plumePlacements.length > 0) {
        buildV6InstancedBatch(grassPlumeSrc, "Ornamental_Grass_Plume_V6", plumePlacements, "grass_plume");
      }
      if (boulderPlacementsA.length > 0) {
        buildV6InstancedBatch(boulderSrcA, "Sierra_Granite_Boulder_V6", boulderPlacementsA, "boulder");
      }
      if (boulderPlacementsB && boulderSrcB && boulderPlacementsB.length > 0) {
        buildV6InstancedBatch(boulderSrcB, "Sierra_Granite_Boulder_V6_B", boulderPlacementsB, "boulder");
      }

      this.botanicalKitV6Group = botGroup;
      this.root.add(botGroup);
      installedAny = true;
    }

    return installedAny;
  }

  finalizeV5PropGrounding() {
    // 0. V6 De-Plasticization Pass (`[VETO-OMNI-3D-01]`): Strip glossy baked glTF ORM `roughnessMap` (`G ~ 0.22` vinyl!)
    //    & toy-balloon clearcoat on all legacy V2 statues, Bugdroid, Android desserts, Pink Flamingos, and kinetic pinwheels!
    //    (Scoped strictly away from V6 `props_and_bridge_v6` & `gradient_canopy_v6` so satin stainless & weathered Corten stay intact.)
    if (typeof MaterialsMod.deplasticizeCampusPropMaterials === "function") {
      MaterialsMod.deplasticizeCampusPropMaterials([
        this.bugdroidHolder,
        this.androidDessertsV2Group,
        this.androidDessertsGroup,
        this.flamingosBodyInstanced,
        this.flamingosExtraBatches,
        this.pinwheelV2MastInstanced,
        this.pinwheelV2RotorBatches,
        this.proceduralStreetFurnitureGroup,
      ]);
    }

    // 1. Temporarily un-cull all campus zones & restore full InstancedMesh buffers so every prop across the 480m x 480m campus is audited & grounded to <= 0.5mm!
    if (this.stanHolder) this.stanHolder.visible = true;
    if (this.gymInteriorGroup) this.gymInteriorGroup.visible = true;
    if (this.archV5PavilionsGroup) {
      this.archV5PavilionsGroup.visible = true;
      for (const ch of this.archV5PavilionsGroup.children) ch.visible = true;
    }
    if (this.archV5BermsGroup) {
      this.archV5BermsGroup.visible = true;
      for (const ch of this.archV5BermsGroup.children) ch.visible = true;
    }
    if (this.envV3BuildingsGroup) {
      for (const ch of this.envV3BuildingsGroup.children) {
        ch.visible = !ch.userData?.replacedByV5;
      }
    }
    if (this.allRampsV6Group) {
      this.allRampsV6Group.visible = true;
      for (const ch of this.allRampsV6Group.children) ch.visible = true;
    } else if (this.allRampsV4Group) {
      this.allRampsV4Group.visible = true;
    } else if (this.allRampsV2Group) {
      this.allRampsV2Group.visible = true;
    } else if (this.allRampsFallbackGroup) {
      this.allRampsFallbackGroup.visible = true;
    }
    if (this.landingRampsV8Group) {
      this.landingRampsV8Group.visible = true;
      for (const ch of this.landingRampsV8Group.children) ch.visible = true;
    }
    if (this.gradientCanopyV6Group) this.gradientCanopyV6Group.visible = true;
    if (this.bayViewV6Group) this.bayViewV6Group.visible = true;
    if (this.mkCartsV6Group) {
      this.mkCartsV6Group.visible = true;
      for (const ch of this.mkCartsV6Group.children) ch.visible = true;
    }
    if (this.cafeUmbrellasV6Group) {
      this.cafeUmbrellasV6Group.visible = true;
      for (const ch of this.cafeUmbrellasV6Group.children) ch.visible = true;
    }
    if (this.stevensBridgeV6Group) this.stevensBridgeV6Group.visible = true;
    if (this.botanicalKitV6Group) this.botanicalKitV6Group.visible = true;
    if (this.shorelinePodsV4Group) this.shorelinePodsV4Group.visible = true;
    if (this.stanEncounter?.cafeSetsGroup && !this.stanEncounter.cafeSetsGroup.userData?.replacedByV6) {
      this.stanEncounter.cafeSetsGroup.visible = true;
      for (const ch of this.stanEncounter.cafeSetsGroup.children) ch.visible = true;
    }

    if (this.propDynamicBatches) {
      for (const batch of this.propDynamicBatches) {
        const pls = batch.placements || [];
        for (let m = 0; m < batch.meshes.length; m++) {
          const inst = batch.meshes[m];
          inst.count = pls.length;
          inst.visible = pls.length > 0;
          for (let i = 0; i < pls.length; i++) {
            inst.setMatrixAt(i, pls[i].mat4);
          }
          inst.instanceMatrix.needsUpdate = true;
        }
      }
    }

    if (this.treeDynamicBatches) {
      for (const batch of this.treeDynamicBatches) {
        const trs = batch.transforms || [];
        for (let m = 0; m < batch.meshes.length; m++) {
          const inst = batch.meshes[m];
          inst.count = trs.length;
          inst.visible = trs.length > 0;
          for (let i = 0; i < trs.length; i++) {
            inst.setMatrixAt(i, trs[i].mat4);
          }
          inst.instanceMatrix.needsUpdate = true;
        }
      }
    }

    const stanPlinthNodes = this.stanEncounter?.monumentRig
      ? [this.stanEncounter.monumentRig]
      : this.stanHolder
        ? [this.stanHolder]
        : [];

    this.root.updateMatrixWorld(true);
    this.v5GroundingReport = auditAndGroundPropsZeroFloat(THREE, this.root, {
      getSurfaceTopY: getDefaultCampusSurfaceTopY,
      maxFloatMm: 0.5,
      autoSnap: true,
      addContactAO: true,
      categories: {
        stanPlinth: stanPlinthNodes,
      },
    });

    // 2. Write 0.0mm-grounded base instance matrices back into `placements[i].mat4` / `transforms[i].mat4` and sibling sub-meshes!
    if (this.propDynamicBatches) {
      for (const batch of this.propDynamicBatches) {
        if (batch.mode === "cantilever") continue;
        const baseIdx = batch.baseMeshIndex ?? 0;
        const baseInst = batch.meshes[baseIdx];
        const pls = batch.placements || [];
        if (!baseInst || pls.length === 0) continue;
        for (let i = 0; i < pls.length; i++) {
          baseInst.getMatrixAt(i, pls[i].mat4);
          for (let m = 0; m < batch.meshes.length; m++) {
            if (m !== baseIdx) batch.meshes[m].setMatrixAt(i, pls[i].mat4);
          }
        }
        for (let m = 0; m < batch.meshes.length; m++) {
          batch.meshes[m].instanceMatrix.needsUpdate = true;
        }
      }
    }

    if (this.treeDynamicBatches) {
      for (const batch of this.treeDynamicBatches) {
        const baseIdx = batch.baseMeshIndex ?? 0;
        const baseInst = batch.meshes[baseIdx];
        const trs = batch.transforms || [];
        if (!baseInst || trs.length === 0) continue;
        for (let i = 0; i < trs.length; i++) {
          baseInst.getMatrixAt(i, trs[i].mat4);
          for (let m = 0; m < batch.meshes.length; m++) {
            if (m !== baseIdx) batch.meshes[m].setMatrixAt(i, trs[i].mat4);
          }
        }
        for (let m = 0; m < batch.meshes.length; m++) {
          batch.meshes[m].instanceMatrix.needsUpdate = true;
        }
      }
    }

    // 2B. Pre-compute zero-GC world AABB / cylinder sightline bounds on all outdoor roadside props & trunks (`t > 9.5s` Section 8B)
    this._outdoorCameraObstacles = [];
    const localUnionBox = new THREE.Box3();
    if (this.propDynamicBatches) {
      for (const batch of this.propDynamicBatches) {
        localUnionBox.makeEmpty();
        for (const inst of batch.meshes || []) {
          if (inst?.geometry) {
            if (!inst.geometry.boundingBox) inst.geometry.computeBoundingBox();
            if (inst.geometry.boundingBox) localUnionBox.union(inst.geometry.boundingBox);
          }
        }
        if (localUnionBox.isEmpty()) continue;
        const pls = batch.placements || [];
        for (let i = 0; i < pls.length; i++) {
          const pl = pls[i];
          _box3Work.copy(localUnionBox).applyMatrix4(pl.mat4);
          const cx = (_box3Work.min.x + _box3Work.max.x) * 0.5;
          const cz = (_box3Work.min.z + _box3Work.max.z) * 0.5;
          const hx = (_box3Work.max.x - _box3Work.min.x) * 0.5;
          const hz = (_box3Work.max.z - _box3Work.min.z) * 0.5;
          const rad = Math.min(2.6, Math.hypot(hx, hz));
          const height = _box3Work.max.y - _box3Work.min.y;
          pl.obsCx = cx;
          pl.obsCz = cz;
          pl.obsMinY = _box3Work.min.y;
          pl.obsMaxY = _box3Work.max.y;
          pl.obsRad = rad;
          if (height >= 0.68 && _box3Work.max.y >= 0.55) {
            this._outdoorCameraObstacles.push({
              x: cx,
              z: cz,
              minY: _box3Work.min.y,
              maxY: _box3Work.max.y,
              radius: Math.min(1.65, rad),
              solidBox: batch.mode !== "cantilever" && height >= 0.85 && height <= 4.2,
            });
          }
        }
      }
    }
    if (this.treeDynamicBatches) {
      for (const batch of this.treeDynamicBatches) {
        const trs = batch.transforms || [];
        for (let i = 0; i < trs.length; i++) {
          const tr = trs[i];
          const gy = getOpenWorldTerrainHeight(tr.x, tr.z);
          tr.obsCx = tr.x;
          tr.obsCz = tr.z;
          tr.obsMinY = gy;
          tr.obsMaxY = gy + 6.5;
          tr.obsRad = 0.58;
          this._outdoorCameraObstacles.push({
            x: tr.x,
            z: tr.z,
            minY: gy,
            maxY: gy + 4.8,
            radius: 0.52,
            solidBox: false,
          });
        }
      }
    }
    for (const grp of [this.mkCartsV6Group, this.cafeUmbrellasV6Group, this.androidDessertsV2Group]) {
      if (!grp) continue;
      for (const ch of grp.children) {
        if (!Number.isFinite(ch.userData.baseScale)) {
          ch.userData.baseScale = ch.scale?.x || 1.0;
        }
        _box3Work.setFromObject(ch);
        if (_box3Work.isEmpty()) continue;
        const cx = (_box3Work.min.x + _box3Work.max.x) * 0.5;
        const cz = (_box3Work.min.z + _box3Work.max.z) * 0.5;
        const rad = Math.min(2.6, Math.hypot(_box3Work.max.x - _box3Work.min.x, _box3Work.max.z - _box3Work.min.z) * 0.5);
        ch.userData.obsCx = cx;
        ch.userData.obsCz = cz;
        ch.userData.obsMinY = _box3Work.min.y;
        ch.userData.obsMaxY = _box3Work.max.y;
        ch.userData.obsRad = rad;
        this._outdoorCameraObstacles.push({
          x: cx,
          z: cz,
          minY: _box3Work.min.y,
          maxY: _box3Work.max.y,
          radius: Math.min(1.85, rad),
          solidBox: true,
        });
      }
    }

    // 2B. Tag indoor/distance-gated static shadow groups with `v7StaticShadowCaster = true` + `layers.enable(1)`
    //     so `syncTwoTierShadowLayers` NEVER drops outdoor static shadow casters when booting at `t = 0s` inside Spin Studio!
    const staticShadowRoots = [
      this.archV5BermsGroup,
      this.archV5PavilionsGroup,
      this.stevensBridgeV6Group,
      this.shorelineMonumentGroup,
      this.shorelinePodsGroup,
      this.shorelinePodsV4Group,
      this.shorelineOverheadEndcapsGroup,
      this.stanHolder,
      this.bugdroidHolder,
      this.androidDessertsV2Group,
      this.pinwheelV2MastInstanced,
      this.mkCartsV6Group,
      this.cafeUmbrellasV6Group,
      this.allRampsV4Group,
      this.allRampsV6Group,
      this.landingRampsV8Group,
      this.landingRampFallbackGroup,
      this.bayViewV6Group,
    ];
    for (const sr of staticShadowRoots) {
      if (!sr) continue;
      sr.traverse((m) => {
        if (!m.isMesh) return;
        const mLabel = `${m.name || ""} ${m.material?.name || ""}`;
        if (
          m.material?.transparent ||
          m.userData?.noCastShadow ||
          /Dust|Breath|Motes|Shockwave|Steam|Shadow|Decal|Water|Plaque_V7|Blade_V7|SmokedGlass|Horizon|Ridgeline|Optical_LED|Status_LED|StatusLED/i.test(
            mLabel
          )
        ) {
          return;
        }
        m.userData = m.userData || {};
        m.userData.v7StaticShadowCaster = true;
        m.layers?.enable?.(1);
      });
    }
    for (const batch of this.propDynamicBatches || []) {
      if (!batch?.castShadow) continue;
      for (const inst of batch.meshes || []) {
        if (!inst || inst.material?.transparent) continue;
        inst.userData = inst.userData || {};
        inst.userData.v7StaticShadowCaster = true;
        inst.layers?.enable?.(1);
      }
    }
    for (const batch of this.treeDynamicBatches || []) {
      for (const inst of batch.meshes || []) {
        if (!inst) continue;
        inst.userData = inst.userData || {};
        inst.userData.v7StaticShadowCaster = true;
        inst.layers?.enable?.(1);
      }
    }

    // 3. Restore active camera/hero sightline culling cleanly
    this._cullForceRebuild = true;
    if (this._lastHeroSnap) {
      this.update(0, this._lastHeroSnap, this._lastGlobalState || {});
    }
    return this.v5GroundingReport;
  }

  /**
   * Zero-GC Outdoor Camera Spring-Arm Clearance Solver (`t > 9.5s` ONLY; called from `core._updateCameraForMode`).
   * Smoothly nudges camera elevation & lateral clearance when a solid roadside utility/tri-bin box,
   * planter, snack cart, or trunk intersects the camera-to-Pelican sightline cone.
   */
  computeOutdoorCameraClearanceOffset(camPos, _lookPos, heroPos, outVec) {
    outVec.set(0, 0, 0);
    const obsList = this._outdoorCameraObstacles;
    if (!obsList || obsList.length === 0) return outVec;

    const ax = camPos.x;
    const ay = camPos.y;
    const az = camPos.z;
    const bx = heroPos.x;
    const by = heroPos.y + 0.72;
    const bz = heroPos.z;
    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const abXZLenSq = abx * abx + abz * abz;
    if (abXZLenSq < 0.25) return outVec;
    const invAbXZLenSq = 1.0 / abXZLenSq;
    const abXZLen = Math.sqrt(abXZLenSq);
    // Camera-right horizontal unit vector `(perpX, perpZ)`
    const perpX = -abz / abXZLen;
    const perpZ = abx / abXZLen;

    let bestLiftY = 0.0;
    let bestLat = 0.0;

    for (let i = 0; i < obsList.length; i++) {
      const ob = obsList[i];
      const dx = ob.x - ax;
      const dz = ob.z - az;
      if (Math.abs(dx) > 16.0 || Math.abs(dz) > 16.0) continue;
      const u = (dx * abx + dz * abz) * invAbXZLenSq;
      if (u < -0.08 || u > 0.90) continue;
      const uClamped = u < 0.0 ? 0.0 : u;
      const rayX = ax + abx * uClamped;
      const rayY = ay + aby * uClamped;
      const rayZ = az + abz * uClamped;
      if (rayY > ob.maxY + 0.55 || rayY < ob.minY - 0.35) continue;

      const clearRad = ob.radius + 0.92;
      const rx = ob.x - rayX;
      const rz = ob.z - rayZ;
      const distXZ = Math.hypot(rx, rz);
      if (distXZ >= clearRad) continue;

      const pen = 1.0 - distXZ / clearRad;
      const smoothPen = pen * pen * (3.0 - 2.0 * pen);
      // Elevate spring arm cleanly above roadside utility/recycling boxes (`+0.38m..+0.88m`)
      const neededLift = ob.solidBox
        ? Math.min(0.88, Math.max(0.36, ob.maxY + 0.34 - rayY)) * smoothPen
        : 0.34 * smoothPen;
      if (neededLift > bestLiftY) bestLiftY = neededLift;

      // Lateral nudge away from the roadside box toward the open street centerline
      const sideDot = rx * perpX + rz * perpZ;
      const pushDir = sideDot >= 0 ? -1.0 : 1.0;
      const latMag = (ob.solidBox ? 0.72 : 0.48) * smoothPen;
      if (Math.abs(latMag) > Math.abs(bestLat)) {
        bestLat = pushDir * latMag;
      }
    }

    outVec.set(perpX * bestLat, bestLiftY, perpZ * bestLat);
    return outVec;
  }

  // ============================================================================
  // 11. PER-FRAME DETERMINISTIC WORLD ANIMATION & STATE SYNC
  // ============================================================================
  _syncGrassFocusFromCamera(cam, snapFallback = null) {
    if (!this.grassUniforms) return;
    let fx = snapFallback && Number.isFinite(snapFallback.x) ? snapFallback.x : 0.0;
    let fz = snapFallback && Number.isFinite(snapFallback.z) ? snapFallback.z : 140.0;

    const activeCam =
      cam ||
      (typeof window !== "undefined" && window.__pelicanCore && window.__pelicanCore.camera) ||
      null;

    if (activeCam && activeCam.matrixWorld) {
      const e = activeCam.matrixWorld.elements;
      const camX = e[12];
      const camY = e[13];
      const camZ = e[14];
      const fwdX = -e[8];
      const fwdY = -e[9];
      const fwdZ = -e[10];

      if (Number.isFinite(camX) && Number.isFinite(camZ)) {
        if (camY > 36.0 && snapFallback && Number.isFinite(snapFallback.x)) {
          fx = snapFallback.x;
          fz = snapFallback.z;
        } else {
          const hLen = Math.hypot(fwdX, fwdZ);
          const aheadDist =
            camY > 14.0 && fwdY < -0.28
              ? Math.min(22.0, Math.max(11.5, (camY - 1.5) * 0.58)) * Math.min(1.0, hLen / 0.25)
              : 11.5 * (hLen > 1e-4 ? Math.min(1.0, hLen / 0.20) : 0.0);
          const dirHX = hLen > 1e-4 ? fwdX / hLen : 0.0;
          const dirHZ = hLen > 1e-4 ? fwdZ / hLen : 0.0;
          fx = camX + dirHX * aheadDist;
          fz = camZ + dirHZ * aheadDist;
        }
      }
    }

    const clampedX = THREE.MathUtils.clamp(fx, WORLD_BOUNDS.minX + 4.0, WORLD_BOUNDS.maxX - 4.0);
    const clampedZ = THREE.MathUtils.clamp(fz, WORLD_BOUNDS.minZ + 4.0, WORLD_BOUNDS.maxZ - 4.0);
    this.grassUniforms.uFocusXZ.value.set(clampedX, clampedZ);
  }

  syncFromSnapshot(snap, elapsedSec = 0.0, cameraOpt = null) {
    const baseState =
      (typeof window !== "undefined" && window.__demoState) ||
      this._lastGlobalState || {
        elapsedTime: elapsedSec,
        tpusCollected: 0,
        clusterOnline: false,
        glassShattered: false,
        tpuLedger: [],
      };
    const mergedState =
      Number.isFinite(elapsedSec) && baseState.elapsedTime !== elapsedSec
        ? { ...baseState, elapsedTime: elapsedSec }
        : baseState;
    this.update(1 / 60, snap, mergedState, cameraOpt);
  }

  update(dt, snap, globalState = {}, cameraOpt = null) {
    if (!snap) return;
    this._lastHeroSnap = snap;
    this._lastGlobalState = globalState;
    const simTime = globalState.elapsedTime || 0.0;

    // 0. Hero-Proximity Shadow-Frustum & Camera View-Cone Sightline Culling
    const enclosedInGym = Boolean(
      snap.inGym && !globalState.glassShattered && snap.z > 132.5 && Math.abs(snap.x) < 12.0
    );
    if (this.grassFieldMesh) {
      this.grassFieldMesh.visible = !enclosedInGym;
    }

    const activeCam =
      cameraOpt ||
      (typeof window !== "undefined" && window.__pelicanCore && window.__pelicanCore.camera) ||
      null;
    let camX = snap.x;
    let camY = (snap.y ?? 0.0) + 1.45;
    let camZ = snap.z;
    let camFwdX = snap.forwardX ?? 0.0;
    let camFwdZ = snap.forwardZ ?? -1.0;
    let camFwd3X = camFwdX;
    let camFwd3Y = 0.0;
    let camFwd3Z = camFwdZ;
    let isTopDownCam = false;
    let topDownRadius = 36.0;
    if (activeCam && activeCam.matrixWorld) {
      const e = activeCam.matrixWorld.elements;
      if (Number.isFinite(e[12]) && Number.isFinite(e[14])) {
        camX = e[12];
        camZ = e[14];
        camY = Number.isFinite(e[13]) ? e[13] : camY;
        const fx = -e[8];
        const fy = -e[9];
        const fz = -e[10];
        isTopDownCam = fy < -0.68 && camY > 18.0;
        topDownRadius = Math.max(32.0, camY * 0.95);
        const fl = Math.hypot(fx, fz);
        if (fl > 1e-4) {
          camFwdX = fx / fl;
          camFwdZ = fz / fl;
        }
        const fl3 = Math.hypot(fx, fy, fz);
        if (fl3 > 1e-4) {
          camFwd3X = fx / fl3;
          camFwd3Y = fy / fl3;
          camFwd3Z = fz / fl3;
        }
      }
    }

    // STRICT Section 8B Guard: `0.00s - 9.50s` inside Spin Studio is 100.00% UNTOUCHED!
    const isOutdoorAvoidanceActive =
      !isTopDownCam &&
      !enclosedInGym &&
      ((globalState.gameMode === "story_autopilot" && globalState.sequenceTime > 9.5) ||
        (globalState.gameMode !== "story_autopilot" && Boolean(globalState.glassShattered) && snap.z < 130.2));
    const heroRayX = snap.x;
    const heroRayY = (snap.y ?? 0.0) + 0.72;
    const heroRayZ = snap.z;
    const segDx = heroRayX - camX;
    const segDy = heroRayY - camY;
    const segDz = heroRayZ - camZ;
    const segXZLenSq = segDx * segDx + segDz * segDz;
    const canTestSightline = isOutdoorAvoidanceActive && segXZLenSq > 0.20;
    let fadedForegroundCount = 0;
    let unblockedObstructionCount = 0;

    // Returns `0.0..1.0` C^1-continuous clear factor across BOTH ray distance AND segment `u` (`0` 1-frame blink-pops!)
    const evalSightlineClearFactor = (ox, oz, minY, maxY, rad) => {
      if (!canTestSightline) return 1.0;
      const dx = ox - camX;
      const dz = oz - camZ;
      if (Math.abs(dx) > 18.0 || Math.abs(dz) > 18.0) return 1.0;
      const u = (dx * segDx + dz * segDz) / segXZLenSq;
      if (u <= -0.28 || u >= 1.04) return 1.0;
      const uClamp = u < 0.0 ? 0.0 : u > 0.94 ? 0.94 : u;
      const ry = camY + segDy * uClamp;
      if (ry > maxY + 0.55 || ry < minY - 0.35) return 1.0;
      // Smooth longitudinal envelope at `u` entry (`[-0.28, -0.02]`) and hero approach (`[0.82, 1.04]`)
      let uWeight = 1.0;
      if (u < -0.02) {
        const tu = (u + 0.28) / 0.26;
        uWeight = tu * tu * (3.0 - 2.0 * tu);
      } else if (u > 0.82) {
        const tu = (1.04 - u) / 0.22;
        uWeight = tu * tu * (3.0 - 2.0 * tu);
      }
      const px = camX + segDx * uClamp;
      const pz = camZ + segDz * uClamp;
      const dRay = Math.hypot(ox - px, oz - pz);
      const rBlock = Math.min(1.85, rad) + 1.55;
      if (dRay >= rBlock) return 1.0;
      const rHide = Math.min(1.25, rad * 0.72) + 0.72;
      let radialClear = 0.0;
      if (dRay > rHide) {
        const t = (dRay - rHide) / Math.max(0.12, rBlock - rHide);
        radialClear = t * t * (3.0 - 2.0 * t);
      }
      return 1.0 - (1.0 - radialClear) * uWeight;
    };

    const isLowQuality = globalState.qualityTier === "low";
    const inViewCone = (tx, tz, maxDist, closeRad = 28.0, minDot = 0.20) => {
      const dHero = Math.hypot(tx - snap.x, tz - snap.z);
      const dCam = Math.hypot(tx - camX, tz - camZ);
      if (isTopDownCam) {
        return dHero <= topDownRadius || dCam <= topDownRadius;
      }
      const effClose = isLowQuality ? Math.min(closeRad, 14.0) : closeRad;
      const effMax = isLowQuality ? Math.min(maxDist, 110.0) : maxDist;
      const effMinDot = isLowQuality ? Math.max(minDot, 0.35) : minDot;
      if (dCam <= 8.5 || dHero <= effClose * 0.5) return true;
      if (dCam > effMax && dHero > effMax) return false;
      const dot = ((tx - camX) * camFwdX + (tz - camZ) * camFwdZ) / (dCam + 1e-4);
      if (dHero <= effClose && dot >= -0.08) return true;
      return dot >= effMinDot;
    };

    // V8-01: Swept Sun-Shadow Segment Culling (`P + s * (-sunDir)` for `s in [0 .. 48m]` at `s = 0, 16, 32, 48m`)!
    // Keeps off-screen / beside-camera / behind-camera trees & landmarks casting shadows into the view cone with ZERO 1-frame pops!
    let shadDirX = 0.65772;
    let shadDirZ = 0.75326;
    const activeSun =
      typeof window !== "undefined" && window.__pelicanCore && window.__pelicanCore.sunLight;
    if (activeSun && activeSun.position) {
      const stx = activeSun.target?.position?.x ?? 0.0;
      const stz = activeSun.target?.position?.z ?? 0.0;
      const sdx = stx - activeSun.position.x;
      const sdz = stz - activeSun.position.z;
      const sdl = Math.hypot(sdx, sdz);
      if (sdl > 1e-4 && Number.isFinite(sdl)) {
        shadDirX = sdx / sdl;
        shadDirZ = sdz / sdl;
      }
    }
    const sweptShadowInCone = (px, pz, maxDist, closeRad = 36.0, minDot = 0.16) =>
      inViewCone(px, pz, maxDist, closeRad, minDot) ||
      inViewCone(px + shadDirX * 16.0, pz + shadDirZ * 16.0, maxDist, closeRad, minDot) ||
      inViewCone(px + shadDirX * 32.0, pz + shadDirZ * 32.0, maxDist, closeRad, minDot) ||
      inViewCone(px + shadDirX * 48.0, pz + shadDirZ * 48.0, maxDist, closeRad, minDot);

    const allowWorldShadows = !isLowQuality;
    const nearGymAndPinwheels = Math.abs(snap.x) < 68.0 && snap.z > 58.0 && snap.z < 164.0;
    const nearBridge = Math.hypot(snap.x - 35.0, snap.z + 122.0) < 80.0;
    const nearAndroid = Math.hypot(snap.x + 118.0, snap.z - 96.0) < 80.0;
    const nearStan = Math.hypot(snap.x + 118.0, snap.z + 50.0) < 80.0;
    const nearShoreline = Math.hypot(snap.x - 14.0, snap.z + 188.0) < 80.0;

    const visPinwheels = sweptShadowInCone(0.0, 109.0, 165.0, 44.0, 0.12);
    const visFlamingos = !enclosedInGym && sweptShadowInCone(-118.0, -50.0, 150.0, 40.0, 0.14);
    const visStan = !enclosedInGym && (nearStan || sweptShadowInCone(-118.0, -50.0, 175.0, 46.0, 0.08));
    const visAndroid = !enclosedInGym && (nearAndroid || sweptShadowInCone(-118.0, 96.0, 175.0, 46.0, 0.08));
    const visBridge = !enclosedInGym && (nearBridge || sweptShadowInCone(35.0, -122.0, 200.0, 62.0, 0.04));
    const visBayView = !enclosedInGym && sweptShadowInCone(202.0, 22.0, 255.0, 72.0, -0.05);
    const visShoreline = !enclosedInGym && (nearShoreline || sweptShadowInCone(16.0, -198.0, 280.0, 76.0, -0.05));
    const visGradientCanopy = sweptShadowInCone(0.0, 145.6, 220.0, 68.0, -0.02);

    // PRIORITY 0.3A: Static spatial-quadrant horizon trees — ONLY toggle group visibility (`0` per-frame matrix loops/uploads!)
    if (this.horizonTreesStaticGroup) {
      this.horizonTreesStaticGroup.visible = !enclosedInGym;
    }

    // PRIORITY 0.3A: Dirty-Check Gate on `treeDynamicBatches` and `propDynamicBatches`!
    // Recompute `inViewCone` / `sweptShadowInCone` / `evalSightlineClearFactor` and upload `instanceMatrix` ONLY when:
    //   1) camera moves `> 0.35m`, OR
    //   2) camera forward rotates `> 1.2 deg` (`dot < cos(1.2 deg)`), OR
    //   3) `enclosedInGym` or `allowWorldShadows` (or `isTopDownCam` / `_isFast1080pSw`) flips, OR
    //   4) an active foreground sightline fade factor transitions by `> 0.01`, OR
    //   5) `forceRebuild` (`this._cullForceRebuild` / `globalState.forceCullRebuild`) is true!
    const fastSwTrees = Boolean(this._isFast1080pSw);
    const COS_1P2_DEG = 0.99978068; // Math.cos(1.2 * Math.PI / 180)
    const camMoved =
      !Number.isFinite(this._lastCullCamX) ||
      Math.hypot(
        camX - this._lastCullCamX,
        camY - this._lastCullCamY,
        camZ - this._lastCullCamZ
      ) > 0.35;
    const camRotated =
      camFwd3X * this._lastCullFwdX +
        camFwd3Y * this._lastCullFwdY +
        camFwd3Z * this._lastCullFwdZ <
      COS_1P2_DEG;
    const stateFlipped =
      enclosedInGym !== this._lastCullEnclosedInGym ||
      allowWorldShadows !== this._lastCullAllowShadows ||
      isTopDownCam !== this._lastCullIsTopDown ||
      fastSwTrees !== this._lastCullFastSw;
    const forceRebuild = Boolean(this._cullForceRebuild || globalState?.forceCullRebuild);

    let sightlineTransitioning = false;
    if (!camMoved && !camRotated && !stateFlipped && !forceRebuild && (canTestSightline || this._hadActiveSightlineFade)) {
      if (this.treeDynamicBatches) {
        for (let b = 0; b < this.treeDynamicBatches.length && !sightlineTransitioning; b++) {
          const trs = this.treeDynamicBatches[b].transforms;
          for (let i = 0; i < trs.length; i++) {
            const tr = trs[i];
            const prevCf = tr._lastSightCf ?? 1.0;
            if (!canTestSightline && prevCf >= 0.999) continue;
            if (Math.abs((tr.obsCx ?? tr.x) - camX) > 19.0 && prevCf >= 0.999) continue;
            if (Math.abs((tr.obsCz ?? tr.z) - camZ) > 19.0 && prevCf >= 0.999) continue;
            const cf = canTestSightline
              ? evalSightlineClearFactor(
                  tr.obsCx ?? tr.x,
                  tr.obsCz ?? tr.z,
                  tr.obsMinY ?? 0.0,
                  tr.obsMaxY ?? 5.5,
                  tr.obsRad ?? 0.58
                )
              : 1.0;
            if (Math.abs(cf - prevCf) > 0.01) {
              sightlineTransitioning = true;
              break;
            }
          }
        }
      }
      if (!sightlineTransitioning && this.propDynamicBatches) {
        for (let b = 0; b < this.propDynamicBatches.length && !sightlineTransitioning; b++) {
          const pls = this.propDynamicBatches[b].placements;
          for (let i = 0; i < pls.length; i++) {
            const pl = pls[i];
            const prevCf = pl._lastSightCf ?? 1.0;
            if (!canTestSightline && prevCf >= 0.999) continue;
            if (Math.abs((pl.obsCx ?? pl.x) - camX) > 19.0 && prevCf >= 0.999) continue;
            if (Math.abs((pl.obsCz ?? pl.z) - camZ) > 19.0 && prevCf >= 0.999) continue;
            const cf = canTestSightline
              ? evalSightlineClearFactor(
                  pl.obsCx ?? pl.x,
                  pl.obsCz ?? pl.z,
                  pl.obsMinY ?? 0.0,
                  pl.obsMaxY ?? 1.8,
                  pl.obsRad ?? 0.65
                )
              : 1.0;
            if (Math.abs(cf - prevCf) > 0.01) {
              sightlineTransitioning = true;
              break;
            }
          }
        }
      }
    }

    const cullDirty = camMoved || camRotated || stateFlipped || sightlineTransitioning || forceRebuild;
    if (cullDirty) {
      this._cullForceRebuild = false;
      this._lastCullCamX = camX;
      this._lastCullCamY = camY;
      this._lastCullCamZ = camZ;
      this._lastCullFwdX = camFwd3X;
      this._lastCullFwdY = camFwd3Y;
      this._lastCullFwdZ = camFwd3Z;
      this._lastCullEnclosedInGym = enclosedInGym;
      this._lastCullAllowShadows = allowWorldShadows;
      this._lastCullIsTopDown = isTopDownCam;
      this._lastCullFastSw = fastSwTrees;
      let anyActiveFade = false;

      if (this.treeDynamicBatches) {
        const heroShadowRad = fastSwTrees ? 40.0 : 80.0;
        const swSweptMaxRad = 68.0;
        const treeConeMax = fastSwTrees ? 132.0 : 315.0;
        const treeConeClose = fastSwTrees ? 28.0 : 38.0;
        for (const batch of this.treeDynamicBatches) {
          let nearCount = 0;
          let farCount = 0;
          const trs = batch.transforms;
          const hasFar = Array.isArray(batch.farMeshes) && batch.farMeshes.length === batch.meshes.length;
          for (let i = 0; i < trs.length; i++) {
            const tr = trs[i];
            if (enclosedInGym && (tr.z < 72.0 || Math.abs(tr.x) > 54.0)) {
              tr._lastSightCf = 1.0;
              continue;
            }
            const dHeroTree = Math.hypot(tr.x - snap.x, tr.z - snap.z);
            // V8-01: Keep 100% of swept sun-shadow segment (`P + s * (-sunDir)`, `s = 0, 16, 32, 48m`) tree shadow-caster logic intact!
            const castShadowCandidate =
              !enclosedInGym &&
              (dHeroTree <= heroShadowRad ||
                (fastSwTrees
                  ? dHeroTree <= swSweptMaxRad &&
                    sweptShadowInCone(tr.x, tr.z, treeConeMax, treeConeClose, 0.18)
                  : sweptShadowInCone(tr.x, tr.z, 155.0, 42.0, 0.16)));
            const directFarVisible =
              !castShadowCandidate && inViewCone(tr.x, tr.z, treeConeMax, treeConeClose, 0.30);
            if (!castShadowCandidate && !directFarVisible) {
              tr._lastSightCf = 1.0;
              continue;
            }
            if (canTestSightline) {
              const cf = evalSightlineClearFactor(
                tr.obsCx ?? tr.x,
                tr.obsCz ?? tr.z,
                tr.obsMinY ?? 0.0,
                tr.obsMaxY ?? 5.5,
                tr.obsRad ?? 0.58
              );
              tr._lastSightCf = cf;
              if (cf < 0.999) anyActiveFade = true;
              if (cf < 0.35) {
                fadedForegroundCount++;
                continue;
              }
            } else {
              tr._lastSightCf = 1.0;
            }
            const inShadowBox = allowWorldShadows ? castShadowCandidate : true;
            if (inShadowBox || !hasFar) {
              for (let m = 0; m < batch.meshes.length; m++) {
                batch.meshes[m].setMatrixAt(nearCount, tr.mat4);
              }
              nearCount++;
            } else {
              for (let m = 0; m < batch.farMeshes.length; m++) {
                batch.farMeshes[m].setMatrixAt(farCount, tr.mat4);
              }
              farCount++;
            }
          }
          for (let m = 0; m < batch.meshes.length; m++) {
            const inst = batch.meshes[m];
            inst.count = nearCount;
            inst.visible = nearCount > 0;
            inst.castShadow = allowWorldShadows;
            if (nearCount > 0) inst.instanceMatrix.needsUpdate = true;
          }
          if (hasFar) {
            for (let m = 0; m < batch.farMeshes.length; m++) {
              const fInst = batch.farMeshes[m];
              fInst.count = farCount;
              fInst.visible = farCount > 0;
              if (farCount > 0) fInst.instanceMatrix.needsUpdate = true;
            }
          }
        }
      }

      if (this.propDynamicBatches) {
        for (const batch of this.propDynamicBatches) {
          let activeCount = 0;
          const pls = batch.placements;
          if (!enclosedInGym) {
            for (let i = 0; i < pls.length; i++) {
              const pl = pls[i];
              if (!inViewCone(pl.x, pl.z, 195.0, 32.0, 0.28)) {
                pl._lastSightCf = 1.0;
                continue;
              }
              let useMat = pl.mat4;
              if (canTestSightline) {
                const cf = evalSightlineClearFactor(
                  pl.obsCx ?? pl.x,
                  pl.obsCz ?? pl.z,
                  pl.obsMinY ?? 0.0,
                  pl.obsMaxY ?? 1.8,
                  pl.obsRad ?? 0.65
                );
                pl._lastSightCf = cf;
                if (cf < 0.999) anyActiveFade = true;
                if (cf <= 0.08) {
                  fadedForegroundCount++;
                  continue;
                }
                if (cf < 0.995) {
                  fadedForegroundCount++;
                  _mat4Fade.copy(pl.mat4);
                  const me = _mat4Fade.elements;
                  me[0] *= cf;
                  me[1] *= cf;
                  me[2] *= cf;
                  me[4] *= cf;
                  me[5] *= cf;
                  me[6] *= cf;
                  me[8] *= cf;
                  me[9] *= cf;
                  me[10] *= cf;
                  useMat = _mat4Fade;
                }
              } else {
                pl._lastSightCf = 1.0;
              }
              for (let m = 0; m < batch.meshes.length; m++) {
                batch.meshes[m].setMatrixAt(activeCount, useMat);
              }
              activeCount++;
            }
          }
          for (let m = 0; m < batch.meshes.length; m++) {
            const inst = batch.meshes[m];
            inst.count = activeCount;
            inst.visible = activeCount > 0;
            inst.castShadow = allowWorldShadows && batch.castShadow;
            if (activeCount > 0) inst.instanceMatrix.needsUpdate = true;
          }
        }
      }
      this._hadActiveSightlineFade = anyActiveFade;
      this._lastBatchFadedCount = fadedForegroundCount;
    } else {
      fadedForegroundCount = this._lastBatchFadedCount || 0;
    }
    if (this.envV3BuildingsGroup) {
      for (const ch of this.envV3BuildingsGroup.children) {
        if (ch.userData?.replacedByV5) {
          ch.visible = false;
          continue;
        }
        const bx = ch.userData?.bx ?? 0.0;
        const bz = ch.userData?.bz ?? 0.0;
        const visB =
          (!enclosedInGym || bz > 60.0) &&
          (Math.hypot(bx - snap.x, bz - snap.z) <= 74.0 || inViewCone(bx, bz, 235.0, 62.0, -0.05));
        ch.visible = visB;
      }
    }
    if (this.archV5PavilionsGroup) {
      for (const ch of this.archV5PavilionsGroup.children) {
        const bx = ch.userData?.bx ?? 0.0;
        const bz = ch.userData?.bz ?? 0.0;
        const visPav =
          (!enclosedInGym || bz > 60.0) &&
          (Math.hypot(bx - snap.x, bz - snap.z) <= 76.0 || inViewCone(bx, bz, 245.0, 64.0, -0.08));
        ch.visible = visPav;
        if (ch.userData._lastCastShadow !== allowWorldShadows) {
          ch.userData._lastCastShadow = allowWorldShadows;
          ch.traverse((m) => {
            if (m.isMesh) m.castShadow = allowWorldShadows;
          });
        }
      }
    }
    if (this.archV5BermsGroup) {
      this.archV5BermsGroup.visible = !enclosedInGym;
      if (!enclosedInGym) {
        for (const berm of this.archV5BermsGroup.children) {
          const bx = berm.userData?.bx ?? 0.0;
          const bz = berm.userData?.bz ?? 0.0;
          berm.visible =
            Math.hypot(bx - snap.x, bz - snap.z) <= 72.0 ||
            inViewCone(bx, bz, 220.0, 48.0, 0.10);
          if (berm.userData._lastCastShadow !== allowWorldShadows) {
            berm.userData._lastCastShadow = allowWorldShadows;
            berm.traverse((m) => {
              if (m.isMesh) m.castShadow = allowWorldShadows;
            });
          }
        }
      }
    }
    if (this.archV5HorizonGroup) {
      const showHorizon = !(enclosedInGym && camFwdZ > 0.35);
      for (const seg of this.archV5HorizonGroup.children) {
        if (seg.isInstancedMesh) continue;
        if (seg.userData?.mx !== undefined && seg.userData?.mz !== undefined) {
          if (!showHorizon) {
            seg.visible = false;
          } else if (isTopDownCam) {
            seg.visible = false;
          } else {
            const mdx = seg.userData.mx - camX;
            const mdz = seg.userData.mz - camZ;
            const md = Math.hypot(mdx, mdz) + 1e-4;
            seg.visible = (mdx * camFwdX + mdz * camFwdZ) / md >= 0.28;
          }
        } else {
          seg.visible = showHorizon;
        }
      }
    }
    if (this.mkCartsV6Group) {
      this.mkCartsV6Group.visible = !enclosedInGym;
      for (const ch of this.mkCartsV6Group.children) {
        const cx = ch.userData?.x ?? 0.0;
        const cz = ch.userData?.z ?? 0.0;
        const baseSc = ch.userData?.baseScale || 1.0;
        let visCart = !enclosedInGym && inViewCone(cx, cz, 175.0, 32.0, -0.10);
        let cf = 1.0;
        if (visCart && canTestSightline) {
          cf = evalSightlineClearFactor(
            ch.userData.obsCx ?? cx,
            ch.userData.obsCz ?? cz,
            ch.userData.obsMinY ?? 0.0,
            ch.userData.obsMaxY ?? 2.5,
            ch.userData.obsRad ?? 1.25
          );
          if (cf < 0.995) fadedForegroundCount++;
          if (cf <= 0.03) visCart = false;
        }
        ch.visible = visCart;
        if (visCart) ch.scale.setScalar(baseSc * cf);
      }
    } else if (this.mkCartsV2Group) {
      for (const ch of this.mkCartsV2Group.children) {
        const cx = ch.userData?.x ?? 0.0;
        const cz = ch.userData?.z ?? 0.0;
        ch.visible = !enclosedInGym && inViewCone(cx, cz, 145.0, 28.0, 0.0);
      }
    }
    if (this.cafeUmbrellasV6Group) {
      this.cafeUmbrellasV6Group.visible = !enclosedInGym;
      for (const ch of this.cafeUmbrellasV6Group.children) {
        const cx = ch.userData?.x ?? 0.0;
        const cz = ch.userData?.z ?? 0.0;
        const baseSc = ch.userData?.baseScale || 1.0;
        let visUmb = !enclosedInGym && inViewCone(cx, cz, 185.0, 36.0, -0.10);
        let cf = 1.0;
        if (visUmb && canTestSightline) {
          cf = evalSightlineClearFactor(
            ch.userData.obsCx ?? cx,
            ch.userData.obsCz ?? cz,
            ch.userData.obsMinY ?? 0.0,
            ch.userData.obsMaxY ?? 2.6,
            ch.userData.obsRad ?? 1.35
          );
          if (cf < 0.995) fadedForegroundCount++;
          if (cf <= 0.03) visUmb = false;
        }
        ch.visible = visUmb;
        if (visUmb) ch.scale.setScalar(baseSc * cf);
      }
    }
    this.lastOutdoorAvoidanceHiddenCount = fadedForegroundCount;
    this.lastFadedForegroundPropCount = fadedForegroundCount;
    this.lastOutdoorObstructionCount = unblockedObstructionCount;

    if (this.gymInteriorGroup) {
      this.gymInteriorGroup.visible = Math.abs(snap.x) < 62.0 && snap.z > 65.0;
      const activeSeqTime = Number.isFinite(globalState.sequenceTime)
        ? globalState.sequenceTime
        : Number.isFinite(globalState.currentTimeSec)
          ? globalState.currentTimeSec
          : simTime;
      const effCamZ = Number.isFinite(globalState.cameraPos?.z) ? globalState.cameraPos.z : camZ;
      const showInteriorGymLed =
        Boolean(snap?.onTrainerStand) ||
        (Number.isFinite(activeSeqTime) && activeSeqTime <= 10.2) ||
        (snap.z >= 129.5 && effCamZ >= 129.5);
      if (this.gymSouthLedBoardGroup) this.gymSouthLedBoardGroup.visible = showInteriorGymLed;
      if (this.gymNorthLedBoardGroup) this.gymNorthLedBoardGroup.visible = showInteriorGymLed;
      if (this.gymClockOverlays) {
        for (const ov of this.gymClockOverlays) ov.visible = showInteriorGymLed;
      }
      if (this.spinStudioChalkMotesInstanced) {
        const showChalk =
          !Boolean(globalState.glassShattered || snap?.glassShattered) && activeSeqTime <= 8.4;
        this.spinStudioChalkMotesInstanced.visible = showChalk;
        if (showChalk) {
          const fadeOut =
            activeSeqTime <= 7.2
              ? 1.0
              : Math.max(0.0, Math.min(1.0, (8.4 - activeSeqTime) / 1.2));
          this.spinStudioChalkMotesInstanced.material.opacity = 0.30 * fadeOut;
          const camQuat = activeCam?.quaternion || _quat.identity();
          for (let i = 0; i < this.spinStudioChalkMoteSeeds.length; i++) {
            const ms = this.spinStudioChalkMoteSeeds[i];
            const ph = simTime * ms.freq + ms.phase;
            _pos.set(
              ms.bx + Math.sin(ph) * ms.ampX,
              ms.by + Math.cos(ph * 0.82 + 0.7) * ms.ampY + ((simTime * 0.018 + i * 0.03) % 0.14),
              ms.bz + Math.cos(ph * 1.13) * ms.ampZ
            );
            const sc = ms.scale * (0.86 + 0.14 * Math.sin(ph * 1.9));
            _scale.setScalar(sc);
            _mat4.compose(_pos, camQuat, _scale);
            this.spinStudioChalkMotesInstanced.setMatrixAt(i, _mat4);
          }
          this.spinStudioChalkMotesInstanced.instanceMatrix.needsUpdate = true;
        }
      }
    }
    if (this.gradientCanopyV6Group) {
      this.gradientCanopyV6Group.visible = visGradientCanopy;
      if (this.gradientCanopyFallback) this.gradientCanopyFallback.visible = false;
      if (this.gradientCanopyV2Group) this.gradientCanopyV2Group.visible = false;
    } else {
      if (this.gradientCanopyFallback && !this.gradientCanopyV2Group) {
        this.gradientCanopyFallback.visible = visGradientCanopy;
      }
      if (this.gradientCanopyV2Group) {
        this.gradientCanopyV2Group.visible = visGradientCanopy;
      }
    }
    if (this.bayViewV6Group) {
      this.bayViewV6Group.visible = visBayView;
      if (this.bayViewFallback) this.bayViewFallback.visible = false;
      if (this.bayViewV2Group) this.bayViewV2Group.visible = false;
    } else {
      if (this.bayViewFallback) {
        this.bayViewFallback.visible = visBayView;
      }
      if (this.bayViewV2Group) {
        this.bayViewV2Group.visible = visBayView;
      }
    }
    if (this.shorelineV2Group) {
      this.shorelineV2Group.visible = visShoreline;
    }
    if (this.shorelineMonumentGroup) {
      this.shorelineMonumentGroup.visible = visShoreline;
      const wantMonCast = allowWorldShadows && nearShoreline;
      if (this.shorelineMonumentGroup.userData._lastCastShadow !== wantMonCast) {
        this.shorelineMonumentGroup.userData._lastCastShadow = wantMonCast;
        this.shorelineMonumentGroup.traverse((ch) => {
          if (ch.isMesh && !ch.material?.transparent) ch.castShadow = wantMonCast;
        });
      }
    }
    if (this.stevensBridgeV6Group) {
      this.stevensBridgeV6Group.visible = visBridge;
      if (this.stevensBridgeGroup) this.stevensBridgeGroup.visible = false;
      if (this.stevensBridgeV2Group) this.stevensBridgeV2Group.visible = false;
      const wantBrCast = allowWorldShadows && nearBridge;
      if (this.stevensBridgeV6Group.userData._lastCastShadow !== wantBrCast) {
        this.stevensBridgeV6Group.userData._lastCastShadow = wantBrCast;
        this.stevensBridgeV6Group.traverse((ch) => {
          if (ch.isMesh && !ch.material?.transparent) ch.castShadow = wantBrCast;
        });
      }
    } else {
      if (this.stevensBridgeGroup && !this.stevensBridgeV2Group) {
        this.stevensBridgeGroup.visible = visBridge;
        for (const ch of this.stevensBridgeGroup.children) {
          if (ch.isMesh) ch.castShadow = allowWorldShadows && nearBridge;
        }
      }
      if (this.stevensBridgeV2Group) {
        this.stevensBridgeV2Group.visible = visBridge;
        for (const ch of this.stevensBridgeV2Group.children) {
          if (ch.isMesh) ch.castShadow = allowWorldShadows && nearBridge;
        }
      }
    }

    if (this.pinwheelV2MastInstanced) {
      this.pinwheelV2MastInstanced.visible = visPinwheels;
      this.pinwheelV2MastInstanced.castShadow = allowWorldShadows && nearGymAndPinwheels;
    }
    if (this.pinwheelV2RotorBatches) {
      const nearPinwheelHeroShadow = !enclosedInGym && Math.hypot(snap.x, snap.z - 109.0) <= 18.0;
      for (const rInst of this.pinwheelV2RotorBatches) {
        rInst.visible = visPinwheels;
        rInst.castShadow = allowWorldShadows && nearPinwheelHeroShadow;
      }
    }
    if (this.flamingosBodyInstanced) {
      this.flamingosBodyInstanced.visible = visFlamingos;
      this.flamingosBodyInstanced.castShadow = allowWorldShadows && nearStan;
    }
    if (this.flamingosExtraBatches) {
      for (const exInst of this.flamingosExtraBatches) {
        exInst.visible = visFlamingos;
        exInst.castShadow = allowWorldShadows && nearStan;
      }
    }
    if (this.stanHolder) {
      this.stanHolder.visible = visStan;
      if (visStan) {
        const wantStanCast = allowWorldShadows && nearStan;
        if (this.stanHolder.userData._lastCastShadow !== wantStanCast) {
          this.stanHolder.userData._lastCastShadow = wantStanCast;
          this.stanHolder.traverse((ch) => {
            if (!ch.isMesh) return;
            if (
              ch.material?.transparent ||
              /Dust|Breath|Motes|Shockwave|Steam|Shadow/i.test(ch.name || "")
            ) {
              ch.castShadow = false;
              return;
            }
            ch.castShadow = wantStanCast;
          });
        }
      }
    }
    if (this.bugdroidHolder) {
      this.bugdroidHolder.visible = visAndroid;
      if (visAndroid) {
        const wantBugCast = allowWorldShadows && nearAndroid;
        if (this.bugdroidHolder.userData._lastCastShadow !== wantBugCast) {
          this.bugdroidHolder.userData._lastCastShadow = wantBugCast;
          this.bugdroidHolder.traverse((ch) => {
            if (ch.isMesh && !ch.material?.transparent) ch.castShadow = wantBugCast;
          });
        }
      }
    }
    if (this.androidDessertsV2Group) {
      this.androidDessertsV2Group.visible = visAndroid;
      if (visAndroid) {
        const castDes = allowWorldShadows && nearAndroid;
        for (const ch of this.androidDessertsV2Group.children) {
          const dx = ch.userData?.x ?? ch.position.x;
          const dz = ch.userData?.z ?? ch.position.z;
          const baseSc = ch.userData?.baseScale || 1.18;
          let cf = 1.0;
          if (canTestSightline) {
            cf = evalSightlineClearFactor(
              ch.userData.obsCx ?? dx,
              ch.userData.obsCz ?? dz,
              ch.userData.obsMinY ?? 0.0,
              ch.userData.obsMaxY ?? 2.8,
              ch.userData.obsRad ?? 1.45
            );
            if (cf < 0.995) {
              fadedForegroundCount++;
              this.lastOutdoorAvoidanceHiddenCount = fadedForegroundCount;
              this.lastFadedForegroundPropCount = fadedForegroundCount;
            }
          }
          const visChild = cf > 0.03;
          ch.visible = visChild;
          if (visChild) {
            ch.scale.setScalar(baseSc * cf);
            if (ch.userData._lastCastShadow !== castDes) {
              ch.userData._lastCastShadow = castDes;
              ch.traverse((m) => {
                if (m.isMesh) m.castShadow = castDes;
              });
            }
          }
        }
      }
    } else if (this.androidDessertsGroup) {
      this.androidDessertsGroup.visible = visAndroid;
      if (visAndroid) {
        for (const ch of this.androidDessertsGroup.children) {
          if (ch.isMesh) ch.castShadow = allowWorldShadows && nearAndroid;
        }
      }
    }
    if (this.shorelinePodsGroup) {
      this.shorelinePodsGroup.visible = visShoreline;
      const wantPodsCast = allowWorldShadows && nearShoreline;
      if (this.shorelinePodsGroup.userData._lastCastShadow !== wantPodsCast) {
        this.shorelinePodsGroup.userData._lastCastShadow = wantPodsCast;
        this.shorelinePodsGroup.traverse((ch) => {
          if (
            ch.isMesh &&
            !ch.material?.transparent &&
            !/Blade_V7|SmokedGlass|Glow/i.test(`${ch.name || ""} ${ch.material?.name || ""}`)
          ) {
            ch.castShadow = wantPodsCast;
          }
        });
      }
    } else if (this.shorelineRacksMesh) {
      this.shorelineRacksMesh.visible = visShoreline;
      this.shorelineRacksMesh.castShadow = allowWorldShadows && nearShoreline;
    }

    // 1. Global Sky Uniform, V5 Stan T-Rex Articulated Roar & 132k Toroidal 3D Grass Sync!
    const sunsetT = THREE.MathUtils.lerp(
      0.72,
      1.0,
      THREE.MathUtils.clamp((130.0 - snap.z) / 310.0, 0.0, 1.0)
    );
    if (this.skyDome && this.skyDome.material?.uniforms) {
      this.skyDome.material.uniforms.uSunsetBlend.value = sunsetT;
    }

    let stanOut = null;
    const storyTimeSec = Number.isFinite(globalState.sequenceTime)
      ? globalState.sequenceTime
      : simTime;
    this._heroPosScratch.x = snap.x;
    this._heroPosScratch.y = snap.y;
    this._heroPosScratch.z = snap.z;
    if (this.stanEncounter) {
      const suo = this._stanUpdateOpts;
      suo.timeSec = storyTimeSec;
      suo.stanRoarSignal = snap;
      suo.flamingos = null;
      suo.flamingosBodyInstanced = null;
      suo.flamingosExtraBatches = null;
      stanOut = this.stanEncounter.update(suo);
    }

    if (this.v5Grass) {
      const guo = this._grassUpdateOpts;
      guo.stanShockwave = stanOut?.stanShockwave || null;
      guo.visible = !enclosedInGym;
      this.v5Grass.update(simTime, guo);
    }

    // 2. Shimmering Fresnel Water (`updateWaterTime` + uniform fallback)
    for (const wm of this.waterMaterials) {
      if (typeof wm.updateWaterTime === "function") {
        wm.updateWaterTime(simTime);
      } else if (wm.uniforms?.uTime) {
        wm.uniforms.uTime.value = simTime;
      }
    }

    // 3. Gym Stationary Trainer Flywheel / Roller Spin (phase-locked to `snap.trainerRollerSpinRad` = `2.85x pedalPhaseRad`!)
    if (this.trainerFlywheelPivot) {
      if (Number.isFinite(snap.trainerRollerSpinRad) && (snap.onTrainerStand || simTime < 8.2)) {
        this._trainerFlywheelAngle = snap.trainerRollerSpinRad;
      } else {
        const spinRate = snap.onTrainerStand ? 28.0 : Math.max(0.0, 14.0 - simTime * 3.5);
        this._trainerFlywheelAngle += dt * spinRate;
      }
      this.trainerFlywheelPivot.rotation.x = this._trainerFlywheelAngle;
    }

    // 4. Diegetic Gym Wall LED Display (Live `36 -> 168 RPM` Spin Studio Cadence during `0.0s -> 7.40s`, then `0 / 16` -> `16 / 16` TPUs!)
    this._updateGymLedCanvas(globalState.tpusCollected, globalState.clusterOnline, snap, storyTimeSec);

    // 5. Shatterable Gradient Canopy Glass Curtain Wall + 48 Voronoi Glass Shards!
    const shattered = Boolean(globalState.glassShattered);
    if (shattered && !this._wasGlassShattered) {
      this._localShatterTriggerSec = simTime;
    } else if (!shattered) {
      this._localShatterTriggerSec = -10.0;
    }
    this._wasGlassShattered = shattered;

    if (this.intactGymGlassMesh) this.intactGymGlassMesh.visible = !shattered;
    if (this.jaggedGlassFrameGroup) this.jaggedGlassFrameGroup.visible = shattered;

    if (this.glassShardInstanced) {
      this.glassShardInstanced.visible = shattered;
      this.glassShardInstanced.castShadow = shattered && nearGymAndPinwheels;
      if (shattered) {
        const tauRaw =
          globalState.gameMode === "story_autopilot" && globalState.sequenceTime >= GYM_BREAKOUT_CONFIG.glassSmashSec
            ? globalState.sequenceTime - GYM_BREAKOUT_CONFIG.glassSmashSec
            : Math.max(0.0, simTime - this._localShatterTriggerSec);
        const tau = Math.min(tauRaw, 6.0);

        for (let i = 0; i < this.glassShardSpecs.length; i++) {
          const s = this.glassShardSpecs[i];
          // Analytical 2-bounce damped Newtonian shard trajectory on `y = 0.015` driveway
          let sx = s.x0 + s.vx * Math.min(tau, 2.4);
          let sz = s.z0 + s.vz * Math.min(tau, 2.4);
          let sy = s.y0 + s.vy * tau - 0.5 * 9.81 * tau * tau;
          let spinT = Math.min(tau, 2.1);

          if (sy < 0.018) {
            const tHit =
              (s.vy + Math.sqrt(s.vy * s.vy + 2.0 * 9.81 * Math.max(0.02, s.y0))) / 9.81;
            const dtAfter = Math.max(0.0, tau - tHit);
            const vImpact = Math.sqrt(s.vy * s.vy + 2.0 * 9.81 * Math.max(0.02, s.y0));
            const vBounce = vImpact * 0.36;
            const bounceDur = (2.0 * vBounce) / 9.81;
            if (dtAfter < bounceDur) {
              sy = 0.018 + Math.max(0.0, vBounce * dtAfter - 0.5 * 9.81 * dtAfter * dtAfter);
            } else {
              sy = 0.018;
              spinT = Math.min(tau, tHit + bounceDur);
            }
          }

          _pos.set(sx, sy, sz);
          if (sy <= 0.02) {
            _euler.set(Math.PI * 0.5 + (s.restTiltX || 0.12), s.ry0 + s.wy * 0.2, s.restTiltZ || 0.0);
          } else {
            _euler.set(
              s.rx0 + s.wx * spinT,
              s.ry0 + s.wy * spinT,
              s.rz0 + s.wz * spinT
            );
          }
          _quat.setFromEuler(_euler);
          _scale.setScalar(s.scale);
          _mat4.compose(_pos, _quat, _scale);
          this.glassShardInstanced.setMatrixAt(i, _mat4);
        }
        this.glassShardInstanced.instanceMatrix.needsUpdate = true;
      }
    }

    if (this.mullionShardInstanced) {
      this.mullionShardInstanced.visible = shattered;
      this.mullionShardInstanced.castShadow = false;
      if (shattered) {
        const tauRaw =
          globalState.gameMode === "story_autopilot" && globalState.sequenceTime >= GYM_BREAKOUT_CONFIG.glassSmashSec
            ? globalState.sequenceTime - GYM_BREAKOUT_CONFIG.glassSmashSec
            : Math.max(0.0, simTime - this._localShatterTriggerSec);
        const tau = Math.min(tauRaw, 6.0);
        for (let i = 0; i < this.mullionShardSpecs.length; i++) {
          const ms = this.mullionShardSpecs[i];
          const sx = ms.x0 + ms.vx * Math.min(tau, 2.2);
          const sz = ms.z0 + ms.vz * Math.min(tau, 2.2);
          let sy = ms.y0 + ms.vy * tau - 0.5 * 9.81 * tau * tau;
          let spinT = Math.min(tau, 1.9);
          if (sy < 0.018) {
            const tHit =
              (ms.vy + Math.sqrt(ms.vy * ms.vy + 2.0 * 9.81 * Math.max(0.02, ms.y0))) / 9.81;
            const dtAfter = Math.max(0.0, tau - tHit);
            const vImpact = Math.sqrt(ms.vy * ms.vy + 2.0 * 9.81 * Math.max(0.02, ms.y0));
            const vBounce = vImpact * 0.34;
            const bounceDur = (2.0 * vBounce) / 9.81;
            if (dtAfter < bounceDur) {
              sy = 0.018 + Math.max(0.0, vBounce * dtAfter - 0.5 * 9.81 * dtAfter * dtAfter);
            } else {
              sy = 0.018;
              spinT = Math.min(tau, tHit + bounceDur);
            }
          }
          _pos.set(sx, sy, sz);
          if (sy <= 0.021) {
            _euler.set(Math.PI * 0.5 + (ms.restTiltX || -0.14), ms.ry0 + ms.wy * 0.22, ms.restTiltZ || 0.0);
          } else {
            _euler.set(
              ms.rx0 + ms.wx * spinT,
              ms.ry0 + ms.wy * spinT,
              ms.rz0 + ms.wz * spinT
            );
          }
          _quat.setFromEuler(_euler);
          _scale.setScalar(ms.scale);
          _mat4.compose(_pos, _quat, _scale);
          this.mullionShardInstanced.setMatrixAt(i, _mat4);
        }
        this.mullionShardInstanced.instanceMatrix.needsUpdate = true;
      }
    }

    // 6. 16 Kinetic Wind Pinwheels + `Gradient_Canopy_Building_V6` 3 front rotors (Omni 1.5 `-0.65 rad/s` clockwise wind cadence!)
    if (this.v6PinwheelRotors && this.v6PinwheelRotors.length > 0) {
      for (let r = 0; r < this.v6PinwheelRotors.length; r++) {
        const rotNode = this.v6PinwheelRotors[r];
        const phaseOff = r === 0 ? 0.0 : r === 1 ? 1.18 : 2.42;
        rotNode.rotation.z = -simTime * 0.65 - phaseOff;
      }
    }
    const pwSnap = snap.pinwheels || [];
    if (this.pinwheelV2RotorBatches && this.pinwheelV2RotorBatches.length > 0 && this.pinwheelV2Specs.length > 0) {
      let activePwCount = 0;
      for (let i = 0; i < this.pinwheelV2Specs.length; i++) {
        if (this._hideVisitorFrontPinwheelIndices?.has(i)) continue;
        const sp = this.pinwheelV2Specs[i];
        if (isLowQuality && !inViewCone(sp.x, sp.z, 98.0, 24.0, 0.28)) continue;
        const rawSpin = pwSnap[i]?.spinRad;
        const spin = Number.isFinite(rawSpin) ? rawSpin : sp.baseSpin + simTime * 2.5;
        _pos.set(sp.x, sp.y, sp.z);
        _euler.set(0.0, sp.yaw, spin, "YXZ");
        _quat.setFromEuler(_euler);
        _scale.setScalar(sp.scale);
        _mat4.compose(_pos, _quat, _scale);
        for (const rInst of this.pinwheelV2RotorBatches) {
          rInst.setMatrixAt(activePwCount, _mat4);
        }
        activePwCount++;
      }
      for (const rInst of this.pinwheelV2RotorBatches) {
        rInst.count = activePwCount;
        rInst.visible = visPinwheels && activePwCount > 0;
        if (activePwCount > 0) rInst.instanceMatrix.needsUpdate = true;
      }
    } else {
      for (const batch of this.pinwheelInstancedByColor) {
        const { inst, items } = batch;
        for (let k = 0; k < items.length; k++) {
          const it = items[k];
          const spin = pwSnap[it.globalIdx]
            ? pwSnap[it.globalIdx].spinRad
            : it.baseSpin + simTime * 2.5;
          _pos.set(it.x, it.y, it.z);
          _euler.set(0.0, it.yaw, spin, "YXZ");
          _quat.setFromEuler(_euler);
          _scale.setScalar(1.0);
          _mat4.compose(_pos, _quat, _scale);
          inst.setMatrixAt(k, _mat4);
        }
        inst.instanceMatrix.needsUpdate = true;
      }
    }

    // 7. Android Bugdroid Cheerful Wave (`(-118, 96)` — `Bugdroid_Arm_R_V2` pre-raised, gentle ±0.12 rad wave;
    // animates `bugdroidBodyPivot` on top of `bugPlinth` so `bugdroidHolder` plinth stays grounded at `minY === bugY`!)
    if (this.bugdroidHolder) {
      const bugTarget = this.bugdroidBodyPivot || this.bugdroidHolder;
      const baseLocalY = this.bugdroidBodyPivot ? this.bugdroidBaseLocalY : this.bugdroidBaseY;
      const distBug = Math.hypot(snap.x - -118.0, snap.z - 96.0);
      const excited = globalState.bugdroidWaved || distBug < 18.0;
      const faceHeroYaw = Math.atan2(snap.x - -118.0, snap.z - 96.0);
      bugTarget.rotation.y = distBug < 32.0 ? faceHeroYaw * 0.55 + 0.16 : 0.35;
      if (this.bugdroidArmRPivot) {
        const bRot = this.bugdroidArmRPivot.userData.baseRot;
        const freq = excited ? 8.2 : 3.0;
        const ampZ = excited ? 0.12 : 0.06;
        const ampX = excited ? 0.08 : 0.04;
        this.bugdroidArmRPivot.rotation.set(
          bRot.x + Math.cos(simTime * freq) * ampX,
          bRot.y,
          bRot.z + Math.sin(simTime * freq) * ampZ
        );
      }
      if (this.bugdroidHeadPivot) {
        const hRot = this.bugdroidHeadPivot.userData.baseRot;
        const headTurn = distBug < 32.0 ? THREE.MathUtils.clamp(faceHeroYaw * 0.35, -0.28, 0.28) : Math.sin(simTime * 1.4) * 0.12;
        this.bugdroidHeadPivot.rotation.set(
          hRot.x + (excited ? Math.sin(simTime * 6.5) * 0.05 : 0.0),
          hRot.y + headTurn,
          hRot.z
        );
      }
      if (excited) {
        bugTarget.position.y =
          baseLocalY + Math.abs(Math.sin(simTime * 7.5)) * 0.14;
        bugTarget.rotation.z = Math.sin(simTime * 7.5) * 0.045;
      } else {
        bugTarget.position.y = baseLocalY;
        bugTarget.rotation.z = 0.0;
      }
    }

    // 8. 54 Live Pink Flamingos (`snap.flamingos`)
    if (this.flamingosBodyInstanced && snap.flamingos) {
      const flList = snap.flamingos;
      if (this._isFast1080pSw && !visFlamingos) {
        this.flamingosBodyInstanced.count = 0;
        if (this.flamingosExtraBatches) {
          for (const exInst of this.flamingosExtraBatches) exInst.count = 0;
        }
      } else if (this._isFast1080pSw) {
        let activeFl = 0;
        let anyFlNearHero = false;
        for (let i = 0; i < flList.length; i++) {
          const fl = flList[i];
          if (!inViewCone(fl.x, fl.z, 74.0, 12.0, 0.20)) continue;
          if (Math.hypot(fl.x - snap.x, fl.z - snap.z) <= 13.5) anyFlNearHero = true;
          _pos.set(fl.x, fl.y, fl.z);
          _euler.set(
            fl.wingFlap * 0.18 * Math.sin(simTime * 18.0 + fl.phase),
            -fl.yaw,
            Math.sin(simTime * 14.0 + fl.phase) * fl.wingFlap * 0.14
          );
          _quat.setFromEuler(_euler);
          const flapW = 1.0 + fl.wingFlap * 0.22 * Math.abs(Math.sin(simTime * 22.0 + fl.phase));
          _scale.set(flapW, 1.0, 1.0);
          _mat4.compose(_pos, _quat, _scale);
          this.flamingosBodyInstanced.setMatrixAt(activeFl, _mat4);
          if (this.flamingosExtraBatches) {
            for (const exInst of this.flamingosExtraBatches) {
              exInst.setMatrixAt(activeFl, _mat4);
            }
          }
          activeFl++;
        }
        this.flamingosBodyInstanced.count = activeFl;
        this.flamingosBodyInstanced.visible = activeFl > 0;
        this.flamingosBodyInstanced.castShadow = allowWorldShadows && anyFlNearHero && activeFl > 0;
        if (activeFl > 0) this.flamingosBodyInstanced.instanceMatrix.needsUpdate = true;
        if (this.flamingosExtraBatches) {
          for (const exInst of this.flamingosExtraBatches) {
            exInst.count = activeFl;
            exInst.visible = activeFl > 0;
            exInst.castShadow = allowWorldShadows && anyFlNearHero && activeFl > 0;
            if (activeFl > 0) exInst.instanceMatrix.needsUpdate = true;
          }
        }
        if (this.stanEncounter) {
          const suo = this._stanUpdateOpts;
          suo.timeSec = storyTimeSec;
          suo.stanRoarSignal = snap;
          suo.flamingos = null;
          suo.flamingosBodyInstanced = null;
          suo.flamingosExtraBatches = null;
          this.stanEncounter.update(suo);
        }
      } else {
        this.flamingosBodyInstanced.count = flList.length;
        for (let i = 0; i < flList.length; i++) {
          const fl = flList[i];
          _pos.set(fl.x, fl.y, fl.z);
          _euler.set(
            fl.wingFlap * 0.18 * Math.sin(simTime * 18.0 + fl.phase),
            -fl.yaw,
            Math.sin(simTime * 14.0 + fl.phase) * fl.wingFlap * 0.14
          );
          _quat.setFromEuler(_euler);
          const flapW = 1.0 + fl.wingFlap * 0.22 * Math.abs(Math.sin(simTime * 22.0 + fl.phase));
          _scale.set(flapW, 1.0, 1.0);
          _mat4.compose(_pos, _quat, _scale);
          this.flamingosBodyInstanced.setMatrixAt(i, _mat4);
          if (this.flamingosExtraBatches) {
            for (const exInst of this.flamingosExtraBatches) {
              exInst.setMatrixAt(i, _mat4);
            }
          }
        }
        this.flamingosBodyInstanced.instanceMatrix.needsUpdate = true;
        if (this.flamingosExtraBatches) {
          for (const exInst of this.flamingosExtraBatches) {
            exInst.count = flList.length;
            exInst.instanceMatrix.needsUpdate = true;
          }
        }
        if (this.stanEncounter) {
          const suo = this._stanUpdateOpts;
          suo.timeSec = storyTimeSec;
          suo.stanRoarSignal = snap;
          suo.flamingos = snap.flamingos;
          suo.flamingosBodyInstanced = this.flamingosBodyInstanced;
          suo.flamingosExtraBatches = this.flamingosExtraBatches;
          this.stanEncounter.update(suo);
        }
      }
    }

    // 9. 16 Collectible `TPU_SPAWNS` (Active-Distance Compacted Instanced GLB + Beacon Rings + Ground Halos)
    const hasTpuGlb = this.tpuInstancedBatches.length > 0;
    let activeTpuGlbCount = 0;
    for (let i = 0; i < this.tpuVisuals.length; i++) {
      const tv = this.tpuVisuals[i];
      const ledgerItem = globalState.tpuLedger?.[i];
      const collected = Boolean(ledgerItem && ledgerItem.collected);

      if (collected) {
        tv.root.visible = false;
        _pos.set(tv.spec.x, -25.0, tv.spec.z);
        _quat.identity();
        _scale.setScalar(0.001);
        _mat4.compose(_pos, _quat, _scale);
        this.tpuHalosInstanced.setMatrixAt(i, _mat4);
        if (this.tpuRingsInstanced) this.tpuRingsInstanced.setMatrixAt(i, _mat4);
      } else {
        const bob = Math.sin(simTime * 3.2 + i * 0.7) * 0.065;
        const py = tv.baseY + bob;
        const rotY = simTime * 1.85 + i * 0.45;
        const isHighApexChip = (tv.spec?.bonusHeightM ?? 0) >= 2.0;
        const tpuInSight =
          (!enclosedInGym || (Math.abs(tv.spec.x) < 48.0 && tv.spec.z > 62.0)) &&
          inViewCone(
            tv.spec.x,
            tv.spec.z,
            isHighApexChip ? 168.0 : 135.0,
            isHighApexChip ? 46.0 : 26.0,
            isHighApexChip ? -0.35 : 0.20
          );

        if (!hasTpuGlb) {
          tv.root.visible = tpuInSight;
          if (tpuInSight) {
            tv.root.position.set(tv.spec.x, py, tv.spec.z);
            tv.root.rotation.y = rotY;
          }
        }

        _pos.set(tv.spec.x, py, tv.spec.z);
        // Upright plumb portrait `TPU 8i` Y-axis rotation (`0.0` pitch/roll wobble so airborne pickups never look like tilted plaques!)
        _euler.set(0.0, rotY, 0.0);
        _quat.setFromEuler(_euler);
        if (hasTpuGlb && tpuInSight) {
          _scale.setScalar(tv.podScale || 1.1);
          _mat4.compose(_pos, _quat, _scale);
          for (const inst of this.tpuInstancedBatches) {
            inst.setMatrixAt(activeTpuGlbCount, _mat4);
          }
          activeTpuGlbCount++;
        }
        if (this.tpuRingsInstanced) {
          _scale.setScalar(tv.hasBeaconRing ? 1.0 : 0.0001);
          _mat4.compose(_pos, _quat, _scale);
          this.tpuRingsInstanced.setMatrixAt(i, _mat4);
        }

        const pulse = 0.92 + 0.16 * Math.sin(simTime * 4.4 + i);
        _pos.set(tv.spec.x, tv.groundY + 0.025, tv.spec.z);
        _quat.identity();
        _scale.set(pulse, 1.0, pulse);
        _mat4.compose(_pos, _quat, _scale);
        this.tpuHalosInstanced.setMatrixAt(i, _mat4);
      }
    }
    this.tpuHalosInstanced.instanceMatrix.needsUpdate = true;
    if (this.tpuRingsInstanced) this.tpuRingsInstanced.instanceMatrix.needsUpdate = true;
    for (const inst of this.tpuInstancedBatches) {
      inst.count = activeTpuGlbCount;
      inst.visible = activeTpuGlbCount > 0;
      if (activeTpuGlbCount > 0) {
        inst.instanceMatrix.needsUpdate = true;
      }
    }

    // 10. Sidewalk Microkitchen Espresso Steam Wisps (`20` puffs, `0` green road boxes!)
    if (this.mkChevronsInstanced) {
      for (let i = 0; i < this.mkBoostVisuals.length; i++) {
        const slots = this.mkBoostVisuals[i].chevronSlots || [];
        for (let c = 0; c < slots.length; c++) {
          const sl = slots[c];
          const wave = 0.45 + 0.55 * Math.sin(simTime * 7.5 - c * 1.1 + i);
          const sc = 0.94 + 0.10 * wave;
          _pos.set(sl.x, sl.y, sl.z);
          _euler.set(0.0, sl.rotY, 0.0);
          _quat.setFromEuler(_euler);
          _scale.set(sc, 1.0, sc);
          _mat4.compose(_pos, _quat, _scale);
          this.mkChevronsInstanced.setMatrixAt(sl.idx, _mat4);
        }
      }
      this.mkChevronsInstanced.instanceMatrix.needsUpdate = true;
    }

    if (this.mkSteamInstanced && this.mkSteamSpecs.length > 0) {
      this.mkSteamInstanced.visible = !enclosedInGym;
      if (!enclosedInGym) {
        for (let i = 0; i < this.mkSteamSpecs.length; i++) {
          const sp = this.mkSteamSpecs[i];
          const u = (((simTime * 0.58 + sp.phase) % 1.0) + 1.0) % 1.0;
          const swirl = simTime * 1.7 + sp.driftAngle;
          const sx = sp.x + Math.cos(swirl) * (0.03 + u * 0.14);
          const sy = sp.y + u * 0.88;
          const sz = sp.z + Math.sin(swirl) * (0.03 + u * 0.14);
          const env = Math.sin(u * Math.PI) * (0.52 + 0.72 * u);
          _pos.set(sx, sy, sz);
          _euler.set(0.0, swirl * 0.5, 0.0);
          _quat.setFromEuler(_euler);
          _scale.set(Math.max(0.001, env * 1.12), Math.max(0.001, env * 0.92), Math.max(0.001, env * 1.12));
          _mat4.compose(_pos, _quat, _scale);
          this.mkSteamInstanced.setMatrixAt(sp.instanceIdx, _mat4);
        }
        this.mkSteamInstanced.instanceMatrix.needsUpdate = true;
      }
    }

    // 11. Autonomous `Waymo_Gen6_V4` Fleet (`5` C^2 Spline Loops + `11` Curbside Pickup) + Ackermann Steer + Roll/Pitch + Amber Turn Signals!
    const waymos = snap.waymos || snap.waymoPositions || globalState.waymoPositions || [];
    const hasWaymoBatches = this.waymoBodyBatches && this.waymoBodyBatches.length > 0;
    let anyInstancedWaymoNearHero = false;
    let activeWaymoCount = 0;
    let activeShadowDecals = 0;
    const lCount = this.waymoLeftWheelOffsets.length;
    const rCount = this.waymoRightWheelOffsets.length;
    const wheelR = Math.max(0.22, this.waymoWheelRadius || 0.375);
    const yawOff = this.waymoModelYawOffset ?? Math.PI;
    const spinSign = this.waymoWheelSpinSign ?? 1.0;

    const pushWaymoInstancePose = (
      wx,
      wy,
      wz,
      yaw,
      domeSpinRad,
      wheelSpinRad,
      steerFL = 0.0,
      steerFR = 0.0,
      rollRad = 0.0,
      pitchRad = 0.0
    ) => {
      const k = activeWaymoCount++;
      const carYawThree = yawOff - yaw;
      // On `+Z`-forward, `+X`-left `Waymo_Gen6_V4` chassis (`#102`): `rotation.x = +pitchRad`, `rotation.z = -rollRad`
      _euler.set(pitchRad * spinSign, carYawThree, -rollRad * spinSign, "YXZ");
      _quatCar.setFromEuler(_euler);
      _scale.setScalar(1.0);

      // Chassis body (with damped outward cornering roll + braking/accel suspension pitch)
      _pos.set(wx, wy, wz);
      _mat4.compose(_pos, _quatCar, _scale);
      for (let b = 0; b < this.waymoBodyBatches.length; b++) {
        this.waymoBodyBatches[b].setMatrixAt(k, _mat4);
      }

      // Spinning Rooftop LiDAR Dome (rides pitched/rolled roof mount)
      _pos.copy(this.waymoDomeLocalPos).applyQuaternion(_quatCar);
      _pos.x += wx;
      _pos.y += wy;
      _pos.z += wz;
      _quatSteer.setFromAxisAngle(_axisY, domeSpinRad);
      _quat.multiplyQuaternions(_quatCar, _quatSteer);
      _mat4.compose(_pos, _quat, _scale);
      for (let b = 0; b < this.waymoDomeBatches.length; b++) {
        this.waymoDomeBatches[b].setMatrixAt(k, _mat4);
      }

      // 4 Rolling Outward-Hubcap Wheels with Exact Inner/Outer Ackermann Front Steering (`wIdx === 0` is FL / FR!)
      _quatSpin.setFromAxisAngle(_axisX, wheelSpinRad);

      for (let wIdx = 0; wIdx < lCount; wIdx++) {
        _pos.copy(this.waymoLeftWheelOffsets[wIdx]).applyQuaternion(_quatCar);
        _pos.x += wx;
        _pos.y += wy;
        _pos.z += wz;
        if (wIdx === 0 && Math.abs(steerFL) > 1e-5) {
          _quatSteer.setFromAxisAngle(_axisY, -steerFL);
          _quat.multiplyQuaternions(_quatCar, _quatSteer).multiply(_quatSpin);
        } else {
          _quat.multiplyQuaternions(_quatCar, _quatSpin);
        }
        _mat4.compose(_pos, _quat, _scale);
        for (let b = 0; b < this.waymoWheelLeftBatches.length; b++) {
          this.waymoWheelLeftBatches[b].setMatrixAt(k * lCount + wIdx, _mat4);
        }
      }

      for (let wIdx = 0; wIdx < rCount; wIdx++) {
        _pos.copy(this.waymoRightWheelOffsets[wIdx]).applyQuaternion(_quatCar);
        _pos.x += wx;
        _pos.y += wy;
        _pos.z += wz;
        if (wIdx === 0 && Math.abs(steerFR) > 1e-5) {
          _quatSteer.setFromAxisAngle(_axisY, -steerFR);
          _quat.multiplyQuaternions(_quatCar, _quatSteer).multiply(_quatSpin);
        } else {
          _quat.multiplyQuaternions(_quatCar, _quatSpin);
        }
        _mat4.compose(_pos, _quat, _scale);
        for (let b = 0; b < this.waymoWheelRightBatches.length; b++) {
          this.waymoWheelRightBatches[b].setMatrixAt(k * rCount + wIdx, _mat4);
        }
      }
    };

    const pushVehicleShadowDecal = (wx, groundY, wz, yaw, isShuttle = false) => {
      if (!this.vehicleContactShadowInstanced) return;
      const sIdx = activeShadowDecals++;
      _pos.set(wx, groundY + 0.021, wz);
      _euler.set(0.0, -yaw, 0.0);
      _quat.setFromEuler(_euler);
      _scale.set(isShuttle ? 1.14 : 1.0, 1.0, isShuttle ? 1.24 : 1.0);
      _mat4.compose(_pos, _quat, _scale);
      this.vehicleContactShadowInstanced.setMatrixAt(sIdx, _mat4);
    };

    // A. Moving Autonomous Waymo Fleet (`5` C^2 Quintic-Bezier Campus Loops)
    for (let i = 0; i < this.waymoVisuals.length; i++) {
      const wv = this.waymoVisuals[i];
      const ws = waymos[i];
      if (!ws) continue;
      const wy = Number.isFinite(ws.y) ? ws.y : getOpenWorldTerrainHeight(ws.x, ws.z);
      const distWaymo = Math.hypot(ws.x - snap.x, ws.z - snap.z);
      const waymoInSight =
        (!enclosedInGym || (Math.abs(ws.x) < 52.0 && ws.z > 58.0)) &&
        inViewCone(ws.x, ws.z, 155.0, 28.0, 0.18);

      const useInstancedWaymo = wv.instancedIndex !== undefined && hasWaymoBatches;
      wv.root.visible = waymoInSight && !useInstancedWaymo;
      if (waymoInSight) {
        wv.root.position.set(ws.x, wy, ws.z);
        wv.root.rotation.y = -ws.yaw;
        pushVehicleShadowDecal(
          ws.x,
          getOpenWorldEarthHeight(ws.x, ws.z),
          ws.z,
          ws.yaw,
          false
        );
      }

      const nearHeroWaymo = waymoInSight && distWaymo < 28.0;
      if (wv.yieldRing) {
        wv.yieldRing.visible = Boolean(waymoInSight && ws.yielding && globalState.xrayActive);
      }

      if (wv.instancedIndex !== undefined && hasWaymoBatches) {
        if (!waymoInSight) continue;
        if (nearHeroWaymo) anyInstancedWaymoNearHero = true;
        const wSpin =
          ws.wheelSpinRad !== undefined
            ? spinSign * ws.wheelSpinRad
            : ws.wheelRad !== undefined
              ? spinSign * ws.wheelRad
              : spinSign * ((simTime * 5.4) / wheelR);
        pushWaymoInstancePose(
          ws.x,
          wy,
          ws.z,
          ws.yaw,
          ws.lidarSpinRad ?? simTime * 12.0,
          wSpin,
          ws.steerFL ?? 0.0,
          ws.steerFR ?? 0.0,
          ws.rollRad ?? 0.0,
          ws.pitchRad ?? 0.0
        );
      } else if (waymoInSight) {
        if (wv.shadowMeshes) {
          for (const sm of wv.shadowMeshes) sm.castShadow = nearHeroWaymo;
        }
        if (wv.lidarDome) {
          wv.lidarDome.rotation.y = ws.lidarSpinRad ?? simTime * 12.0;
        }
        const wSpin = ws.wheelSpinRad ?? ws.wheelRad ?? simTime * 6.0;
        for (const wh of wv.wheels) {
          wh.rotation.x = wSpin;
        }
      }
    }

    // B. Parked / Pickup Curbside Waymo Gen 6 Robotaxis in Legal Recessed Bays!
    if (this.parkedWaymosFallbackGroup) {
      this.parkedWaymosFallbackGroup.visible = !hasWaymoBatches && !enclosedInGym;
    }
    for (let p = 0; p < this.parkedWaymoSpecs.length; p++) {
      const pk = this.parkedWaymoSpecs[p];
      const distPk = Math.hypot(pk.x - snap.x, pk.z - snap.z);
      const pkInSight =
        (!enclosedInGym || (Math.abs(pk.x) < 52.0 && pk.z > 58.0)) &&
        inViewCone(
          pk.x,
          pk.z,
          isLowQuality ? 56.0 : 155.0,
          isLowQuality ? 14.0 : 28.0,
          0.18
        );
      if (!pkInSight) continue;

      pushVehicleShadowDecal(pk.x, getOpenWorldEarthHeight(pk.x, pk.z), pk.z, pk.yaw, false);
      if (hasWaymoBatches) {
        if (allowWorldShadows && distPk < 28.0) anyInstancedWaymoNearHero = true;
        pushWaymoInstancePose(
          pk.x,
          pk.y,
          pk.z,
          pk.yaw,
          simTime * 10.5 + pk.phase,
          pk.phase * 0.4,
          0.0,
          0.0,
          0.0,
          0.0
        );
      }
    }

    if (this.vehicleContactShadowInstanced) {
      this.vehicleContactShadowInstanced.count = activeShadowDecals;
      this.vehicleContactShadowInstanced.visible = activeShadowDecals > 0;
      if (activeShadowDecals > 0) {
        this.vehicleContactShadowInstanced.instanceMatrix.needsUpdate = true;
      }
    }

    if (hasWaymoBatches) {
      const waymoCast = allowWorldShadows && anyInstancedWaymoNearHero;
      for (const bInst of this.waymoBodyBatches) {
        bInst.count = activeWaymoCount;
        bInst.visible = activeWaymoCount > 0;
        bInst.castShadow = !bInst.material?.transparent && waymoCast;
        if (activeWaymoCount > 0) bInst.instanceMatrix.needsUpdate = true;
      }
      for (const dInst of this.waymoDomeBatches) {
        dInst.count = activeWaymoCount;
        dInst.visible = activeWaymoCount > 0;
        dInst.castShadow = !dInst.material?.transparent && waymoCast;
        if (activeWaymoCount > 0) dInst.instanceMatrix.needsUpdate = true;
      }
      for (const lwInst of this.waymoWheelLeftBatches) {
        lwInst.count = activeWaymoCount * lCount;
        lwInst.visible = activeWaymoCount > 0;
        lwInst.castShadow = !lwInst.material?.transparent && waymoCast;
        if (activeWaymoCount > 0) lwInst.instanceMatrix.needsUpdate = true;
      }
      for (const rwInst of this.waymoWheelRightBatches) {
        rwInst.count = activeWaymoCount * rCount;
        rwInst.visible = activeWaymoCount > 0;
        rwInst.castShadow = !rwInst.material?.transparent && waymoCast;
        if (activeWaymoCount > 0) rwInst.instanceMatrix.needsUpdate = true;
      }
    }

    // 12. Shoreline Supercluster Docking Pedestal (`1` vertex-color Mesh) & Concert Sky-Beams (`1` InstancedMesh)!
    const tpuCount = globalState.tpusCollected || 0;
    const online = Boolean(globalState.clusterOnline);
    const pedPhase = online ? Math.floor(simTime * 6) % 4 : -1;
    if (
      this.shorelinePedestalMesh &&
      (tpuCount !== this._lastPedTpuCount || pedPhase !== this._lastPedPhase)
    ) {
      this._lastPedTpuCount = tpuCount;
      this._lastPedPhase = pedPhase;
      const colAttr = this.shorelinePedestalMesh.geometry.getAttribute("color");
      const onlineCols = [0x4285f4, 0xea4335, 0xfbbc05, 0x34a853];
      for (let i = 0; i < this.shorelinePedestalRanges.length; i++) {
        const [v0, v1] = this.shorelinePedestalRanges[i];
        if (online) {
          _color.setHex(onlineCols[(i + pedPhase) % 4]);
        } else if (i < tpuCount) {
          _color.setHex(0x38bdf8);
        } else {
          _color.setHex(0x1e293b);
        }
        for (let v = v0; v < v1; v++) {
          colAttr.setXYZ(v, _color.r, _color.g, _color.b);
        }
      }
      colAttr.needsUpdate = true;
    }

    if (this.shorelineBeamsInstanced) {
      this.shorelineBeamsInstanced.visible = online;
      if (online) {
        for (let i = 0; i < this.shorelineBeamCones.length; i++) {
          const bc = this.shorelineBeamCones[i];
          _pos.set(bc.x, bc.y, bc.z);
          _euler.set(
            Math.cos(simTime * 1.3 + bc.phase) * 0.11,
            0.0,
            Math.sin(simTime * 1.8 + bc.phase) * 0.16
          );
          _quat.setFromEuler(_euler);
          _scale.setScalar(1.0);
          _mat4.compose(_pos, _quat, _scale);
          this.shorelineBeamsInstanced.setMatrixAt(i, _mat4);
        }
        this.shorelineBeamsInstanced.instanceMatrix.needsUpdate = true;
      }
    }
    if (this.shorelineStageLight) {
      this.shorelineStageLight.visible = visShoreline;
      this.shorelineStageLight.intensity = !visShoreline
        ? 0.0
        : online
          ? 8.5 + Math.sin(simTime * 4.5) * 0.8
          : 5.5 + Math.sin(simTime * 1.8) * 0.4;
    }
    if (this.shorelineSignBounceLight) {
      this.shorelineSignBounceLight.visible = visShoreline;
      this.shorelineSignBounceLight.intensity = visShoreline ? 6.0 : 0.0;
    }
    // V8-09C: 12-Rack Open-Frame TPU Supercomputer Optical LED Telemetry & 16/16 4-Color + Silicon-Gold Finale Wave (`0` heap allocs!)
    if (this.shorelineRackLedsInstanced && this.shorelineRackLedSeeds?.length > 0) {
      this.shorelineRackLedsInstanced.visible = visShoreline;
      if (visShoreline) {
        const seeds = this.shorelineRackLedSeeds;
        for (let i = 0; i < seeds.length; i++) {
          const sd = seeds[i];
          if (online) {
            // Synchronized 4-color Google (`#4285F4`, `#EA4335`, `#FBBC05`, `#34A853`) + `#F6BD41` silicon-gold celebration wave!
            const wavePhase = simTime * 7.5 - sd.rackIdx * 0.52 - sd.shelfIdx * 0.18;
            const band = ((Math.floor(wavePhase) % 5) + 5) % 5;
            const pulse = 0.72 + 0.48 * (0.5 + 0.5 * Math.sin(wavePhase * Math.PI));
            const hex =
              band === 0
                ? 0x4285f4
                : band === 1
                  ? 0xea4335
                  : band === 2
                    ? 0xfbbc05
                    : band === 3
                      ? 0x34a853
                      : 0xf6bd41;
            _color.setHex(hex).multiplyScalar(pulse);
          } else {
            // Async flickering emerald / cyan / amber optical transceiver link-activity telemetry!
            const flick =
              0.24 +
              0.76 *
                Math.max(
                  0.0,
                  Math.sin(simTime * sd.freq + sd.phase) *
                    Math.cos(simTime * (sd.freq * 0.37) + sd.phase * 1.7)
                );
            const hex =
              sd.basePalette === 0 ? 0x10b981 : sd.basePalette === 1 ? 0x38bdf8 : 0xf59e0b;
            _color.setHex(hex).multiplyScalar(flick);
          }
          this.shorelineRackLedsInstanced.setColorAt(i, _color);
        }
        if (this.shorelineRackLedsInstanced.instanceColor) {
          this.shorelineRackLedsInstanced.instanceColor.needsUpdate = true;
        }
      }
    }
    if (visShoreline && this.shorelineRackStatusLedMats?.length > 0) {
      for (let i = 0; i < this.shorelineRackStatusLedMats.length; i++) {
        const entry = this.shorelineRackStatusLedMats[i];
        const m = entry.mat;
        if (!m || !m.emissive) continue;
        if (online) {
          const wave = simTime * 6.8 - entry.rackIdx * 0.55 - entry.slotIdx * 0.45;
          const idx = ((Math.floor(wave) % 5) + 5) % 5;
          const hex =
            idx === 0
              ? 0x4285f4
              : idx === 1
                ? 0xea4335
                : idx === 2
                  ? 0xfbbc05
                  : idx === 3
                    ? 0x34a853
                    : 0xf6bd41;
          m.emissive.setHex(hex);
          m.emissiveIntensity = 2.6 + 0.9 * Math.sin(wave * Math.PI);
        } else {
          const flick =
            0.9 +
            1.45 *
              Math.max(
                0.0,
                Math.sin(simTime * (7.2 + entry.slotIdx * 2.1) + entry.rackIdx * 1.17)
              );
          m.emissive.setHex(entry.baseHex);
          m.emissiveIntensity = flick;
        }
      }
    }

    if (this.shorelineSunlitMotesInstanced) {
      this.shorelineSunlitMotesInstanced.visible = visShoreline;
      if (visShoreline) {
        const camQuat = activeCam?.quaternion || _quat.identity();
        for (let i = 0; i < this.shorelineSunlitMoteSeeds.length; i++) {
          const ms = this.shorelineSunlitMoteSeeds[i];
          const ph = simTime * ms.freq + ms.phase;
          _pos.set(
            ms.bx + Math.sin(ph) * ms.ampX,
            ms.by + Math.cos(ph * 0.76 + 0.5) * ms.ampY,
            ms.bz + Math.cos(ph * 1.07) * ms.ampZ
          );
          _scale.setScalar(ms.scale * (0.88 + 0.12 * Math.sin(ph * 1.6)));
          _mat4.compose(_pos, camQuat, _scale);
          this.shorelineSunlitMotesInstanced.setMatrixAt(i, _mat4);
        }
        this.shorelineSunlitMotesInstanced.instanceMatrix.needsUpdate = true;
      }
    }
  }

  /**
   * ITEM 7.4 — Campus-Wide `Box3` Clearance & Hardscape Hygiene Audit.
   * Audits all placed umbrellas (`Campus_Umbrella_Cafe_Set_V6`, `Campus_Market_Umbrella_Solo_V6`),
   * benches, planters, bike racks, snack carts, trash bin trios, and streetlamps against ALL
   * building/column/monument/ramp/bridge `Box3` bounds (`>= 0.75m`) and prop-vs-prop overlaps,
   * plus verifies `minTriBinSeparationM >= 18.0`, `stanCourtyardBotanicalCount === 0`,
   * `stanParkedBikesCount === 0`, `gradientHexGrassCount === 0`, and `0` Waymo turn signals.
   */
  verifyCampusPropClearances() {
    this.root.updateMatrixWorld(true);
    const violations = [];
    const tmpBox = new THREE.Box3();
    const childBox = new THREE.Box3();

    const isReplacedFallback = (obj) => {
      let cur = obj;
      while (cur && cur !== this.root) {
        if (cur.userData?.replacedByV5 || cur.userData?.replacedByV6) return true;
        cur = cur.parent;
      }
      return false;
    };

    // 1. Gather structural `Box3` obstacles (buildings, canopies, Shoreline stage/arch/monument, Corten bridge, ramps)
    const structures = [];
    const pushStructuralGroupBoxes = (grp, labelPrefix) => {
      if (!grp || isReplacedFallback(grp)) return;
      grp.updateMatrixWorld(true);
      grp.traverse((m) => {
        if (!m.isMesh || !m.geometry || isReplacedFallback(m)) return;
        const mName = `${m.name || ""} ${m.parent?.name || ""}`;
        if (/HexPavers|Concourse|Medallion|Shadow|AO|Water|Shard|Particle|Motes|Grass|Lawn|Apron|Plaza_Disc/i.test(mName)) {
          return;
        }
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        if (!m.geometry.boundingBox) return;
        tmpBox.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld);
        if (!Number.isFinite(tmpBox.min.x) || tmpBox.max.y - tmpBox.min.y <= 0.38) return;
        structures.push({
          name: `${labelPrefix}:${m.name || "mesh"}`,
          minX: tmpBox.min.x,
          maxX: tmpBox.max.x,
          minY: tmpBox.min.y,
          maxY: tmpBox.max.y,
          minZ: tmpBox.min.z,
          maxZ: tmpBox.max.z,
        });
      });
    };

    pushStructuralGroupBoxes(this.gradientCanopyV6Group || this.gradientCanopyFallback, "GradientCanopy");
    pushStructuralGroupBoxes(this.bayViewV6Group || this.bayViewFallback, "BayViewCanopy");
    pushStructuralGroupBoxes(this.archV5PavilionsGroup, "OfficePavilionV6");
    if (this.envV3BuildingsGroup) {
      for (const ch of this.envV3BuildingsGroup.children) {
        if (!ch.userData?.replacedByV5) pushStructuralGroupBoxes(ch, `CampusBldg:${ch.name || "bldg"}`);
      }
    }
    if (this.shorelineV2Group) {
      pushStructuralGroupBoxes(this.shorelineV2Group, "Shoreline");
    } else if (this.shorelineFallback) {
      structures.push({
        name: "Shoreline:StageAndBowl",
        minX: -18.5,
        maxX: 42.5,
        minY: 0.22,
        maxY: 26.0,
        minZ: -228.0,
        maxZ: -186.15,
      });
    }
    pushStructuralGroupBoxes(this.shorelineMonumentGroup, "ShorelineMonument");
    pushStructuralGroupBoxes(this.shorelinePodsV4Group || this.shorelinePodsGroup, "ShorelineStageRacks");
    pushStructuralGroupBoxes(this.shorelineOverheadEndcapsGroup, "ShorelineStageEndcaps");
    pushStructuralGroupBoxes(this.stevensBridgeV6Group || this.stevensBridgeGroup, "StevensCreekBridge");

    if (structures.length === 0) {
      // Pure procedural fallback structural bounds when GLBs are not yet loaded
      for (const b of CAMPUS_BUILDING_BLOCKS) {
        const bx = b.id === "bldg_north_commons" ? -32.0 : (b.cx ?? b.x ?? 0.0);
        const bz = b.cz ?? b.z ?? 0.0;
        const hx = (b.wx ?? 28.0) * 0.5;
        const hz = (b.wz ?? 24.0) * 0.5;
        structures.push({
          name: `FallbackBldg:${b.id}`,
          minX: bx - hx,
          maxX: bx + hx,
          minY: 0.0,
          maxY: b.hy ?? 12.0,
          minZ: bz - hz,
          maxZ: bz + hz,
        });
      }
      structures.push({
        name: "GradientCanopy:Facade",
        minX: -19.2,
        maxX: 19.2,
        minY: 0.0,
        maxY: 11.5,
        minZ: 128.8,
        maxZ: 158.5,
      });
    }

    for (const rp of [...JUMP_RAMPS, ...LANDING_RAMPS]) {
      const c = Math.abs(Math.cos(rp.headingYaw || 0));
      const s = Math.abs(Math.sin(rp.headingYaw || 0));
      const hl = (rp.lengthM || 6.4) * 0.5;
      const hw = (rp.widthM || 3.8) * 0.5;
      const rx = s * hl + c * hw;
      const rz = c * hl + s * hw;
      structures.push({
        name: `Ramp:${rp.id}`,
        minX: rp.x - rx,
        maxX: rp.x + rx,
        minY: 0.0,
        maxY: rp.heightM || 1.4,
        minZ: rp.z - rz,
        maxZ: rp.z + rz,
      });
    }

    // 2. Gather ALL placed audited props across the entire 480m x 480m campus
    const props = [];
    const pushNodePropBox = (node, kind, fallbackName) => {
      if (!node || isReplacedFallback(node)) return;
      node.updateMatrixWorld(true);
      tmpBox.makeEmpty();
      node.traverse((m) => {
        if (!m.isMesh || !m.geometry) return;
        if (/Shadow|AO|Steam/i.test(m.name || "")) return;
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        if (m.geometry.boundingBox) {
          childBox.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld);
          tmpBox.union(childBox);
        }
      });
      if (tmpBox.isEmpty() || !Number.isFinite(tmpBox.min.x)) return;
      props.push({
        name: node.name || fallbackName,
        kind,
        cx: 0.5 * (tmpBox.min.x + tmpBox.max.x),
        cz: 0.5 * (tmpBox.min.z + tmpBox.max.z),
        minX: tmpBox.min.x,
        maxX: tmpBox.max.x,
        minY: tmpBox.min.y,
        maxY: tmpBox.max.y,
        minZ: tmpBox.min.z,
        maxZ: tmpBox.max.z,
      });
    };

    if (this.cafeUmbrellasV6Group) {
      for (let i = 0; i < this.cafeUmbrellasV6Group.children.length; i++) {
        pushNodePropBox(this.cafeUmbrellasV6Group.children[i], "umbrella", `Umbrella_${i}`);
      }
    }
    if (this.mkCartsV6Group) {
      for (let i = 0; i < this.mkCartsV6Group.children.length; i++) {
        pushNodePropBox(this.mkCartsV6Group.children[i], "snack_cart", `MK_Cart_V6_${i}`);
      }
    } else {
      for (let i = 0; i < (this.mkCartPlacements || []).length; i++) {
        const mk = this.mkCartPlacements[i];
        props.push({
          name: `MK_Cart_${i}`,
          kind: "snack_cart",
          cx: mk.x,
          cz: mk.z,
          minX: mk.x - 1.15,
          maxX: mk.x + 1.15,
          minY: mk.y,
          maxY: mk.y + 2.35,
          minZ: mk.z - 1.15,
          maxZ: mk.z + 1.15,
        });
      }
    }

    const batchProtoBox = new THREE.Box3();
    let usedDynamicFurnitureBatches = false;
    for (const batch of this.propDynamicBatches || []) {
      const bIdent = `${batch.name || ""} ${batch.category || ""} ${batch.meshes?.[0]?.name || ""}`;
      if (/Shrub|Hedge|Plume|Boulder|Planter_Wall/i.test(bIdent)) continue;
      let kind = null;
      if (/Bench/i.test(bIdent)) kind = "bench";
      else if (/Planter/i.test(bIdent)) kind = "planter";
      else if (/Bike_?Rack|BikeRack/i.test(bIdent)) kind = "bikerack";
      else if (/Trash|TriBin/i.test(bIdent)) kind = "tribins";
      else if (/Lamp/i.test(bIdent)) kind = "lamp";
      if (!kind && batch.placements === this.benchPlacements) kind = "bench";
      if (!kind && batch.placements === this.planterPlacements) kind = "planter";
      if (!kind && batch.placements === this.bikeRackPlacements) kind = "bikerack";
      if (!kind && batch.placements === this.triBinPlacements) kind = "tribins";
      if (!kind && batch.placements === this.lampPlacements) kind = "lamp";
      if (!kind) continue;

      batchProtoBox.makeEmpty();
      for (const inst of batch.meshes || []) {
        if (inst?.geometry) {
          if (!inst.geometry.boundingBox) inst.geometry.computeBoundingBox();
          if (inst.geometry.boundingBox) batchProtoBox.union(inst.geometry.boundingBox);
        }
      }
      if (batchProtoBox.isEmpty()) continue;
      usedDynamicFurnitureBatches = true;
      const pls = batch.placements || [];
      for (let i = 0; i < pls.length; i++) {
        const pl = pls[i];
        if (!pl.mat4) continue;
        tmpBox.copy(batchProtoBox).applyMatrix4(pl.mat4);
        props.push({
          name: `${kind}_${i}`,
          kind,
          cx: 0.5 * (tmpBox.min.x + tmpBox.max.x),
          cz: 0.5 * (tmpBox.min.z + tmpBox.max.z),
          minX: tmpBox.min.x,
          maxX: tmpBox.max.x,
          minY: tmpBox.min.y,
          maxY: tmpBox.max.y,
          minZ: tmpBox.min.z,
          maxZ: tmpBox.max.z,
        });
      }
    }

    if (!usedDynamicFurnitureBatches) {
      const pushAnalyticList = (list, kind, hx, hz, h) => {
        for (let i = 0; i < (list || []).length; i++) {
          const p = list[i];
          const c = Math.abs(Math.cos(p.rotY || 0));
          const s = Math.abs(Math.sin(p.rotY || 0));
          const ex = c * hx + s * hz;
          const ez = s * hx + c * hz;
          props.push({
            name: `${kind}_${i}`,
            kind,
            cx: p.x,
            cz: p.z,
            minX: p.x - ex,
            maxX: p.x + ex,
            minY: p.y ?? 0.0,
            maxY: (p.y ?? 0.0) + h,
            minZ: p.z - ez,
            maxZ: p.z + ez,
          });
        }
      };
      pushAnalyticList(this.benchPlacements, "bench", 0.98, 0.36, 0.85);
      pushAnalyticList(this.planterPlacements, "planter", 0.62, 0.62, 1.06);
      pushAnalyticList(this.bikeRackPlacements, "bikerack", 0.85, 0.42, 0.88);
      pushAnalyticList(this.triBinPlacements, "tribins", 0.58, 0.34, 0.98);
      pushAnalyticList(this.lampPlacements, "lamp", 0.35, 0.35, 5.20);
    }

    // 3. Evaluate Structure Clearances (`>= 0.75m`) & Prop-vs-Prop Overlaps
    let minClearanceM = Infinity;
    for (let i = 0; i < props.length; i++) {
      const p = props[i];
      for (let j = 0; j < structures.length; j++) {
        const s = structures[j];
        const dx = Math.max(0.0, p.minX - s.maxX, s.minX - p.maxX);
        const dz = Math.max(0.0, p.minZ - s.maxZ, s.minZ - p.maxZ);
        const distXZ = Math.hypot(dx, dz);
        if (distXZ < minClearanceM) minClearanceM = distXZ;
        if (distXZ < 0.75) {
          violations.push({
            type: "structure_clearance",
            prop: p.name,
            structure: s.name,
            clearanceM: Number(distXZ.toFixed(3)),
            x: Number(p.cx.toFixed(2)),
            z: Number(p.cz.toFixed(2)),
          });
        }
      }
    }

    for (let i = 0; i < props.length; i++) {
      const a = props[i];
      for (let j = i + 1; j < props.length; j++) {
        const b = props[j];
        const dx = Math.max(0.0, a.minX - b.maxX, b.minX - a.maxX);
        const dz = Math.max(0.0, a.minZ - b.maxZ, b.minZ - a.maxZ);
        const distXZ = Math.hypot(dx, dz);
        if (distXZ < 0.15) {
          violations.push({
            type: "prop_overlap",
            propA: a.name,
            propB: b.name,
            clearanceM: Number(distXZ.toFixed(3)),
            x: Number(a.cx.toFixed(2)),
            z: Number(a.cz.toFixed(2)),
          });
        }
      }
    }

    // 4. Global Tri-Bin Minimum Separation (`>= 18.0m`) & Duplicate Bin Check
    let minTriBinSeparationM = Infinity;
    const tbs = this.triBinPlacements || [];
    for (let i = 0; i < tbs.length; i++) {
      if (Math.hypot(tbs[i].x - 149.2, tbs[i].z - 58.0) < 2.0) {
        violations.push({
          type: "duplicate_tribin_bayview",
          x: tbs[i].x,
          z: tbs[i].z,
        });
      }
      for (let j = i + 1; j < tbs.length; j++) {
        const d = Math.hypot(tbs[i].x - tbs[j].x, tbs[i].z - tbs[j].z);
        if (d < minTriBinSeparationM) minTriBinSeparationM = d;
        if (d < 18.0) {
          violations.push({
            type: "tribin_separation",
            indexA: i,
            indexB: j,
            separationM: Number(d.toFixed(3)),
          });
        }
      }
    }

    // 5. Stan Courtyard De-Clutter & Gradient Forecourt Hex-Paver Grass/Botanical Checks
    let stanParkedBikesCount = 0;
    let waymoTurnSignalsCount = 0;
    this.root.traverse((obj) => {
      if (obj.name === "Courtyard_Parked_GBikes") stanParkedBikesCount++;
      if (obj.name === "Waymo_Gen6_V4_Amber_TurnSignals" || /Amber_TurnSignal/i.test(obj.name || "")) {
        waymoTurnSignalsCount++;
      }
    });
    if (stanParkedBikesCount > 0) {
      violations.push({ type: "stan_parked_gbikes_present", count: stanParkedBikesCount });
    }
    if (waymoTurnSignalsCount > 0) {
      violations.push({ type: "waymo_turn_signals_present", count: waymoTurnSignalsCount });
    }

    let stanCourtyardBotanicalCount = 0;
    let gradientHexBotanicalCount = 0;
    for (const bot of this._botanicalPlacementsAudit || []) {
      const rStan = Math.hypot(bot.x + 118.0, bot.z + 50.0);
      if (
        rStan <= 19.8 ||
        (Math.abs(bot.x + 118.0) <= 6.2 && bot.z >= -82.0 && bot.z <= -18.0)
      ) {
        stanCourtyardBotanicalCount++;
      }
      if (Math.abs(bot.x) <= 27.2 && bot.z >= 114.3 && bot.z <= 159.5) {
        gradientHexBotanicalCount++;
      }
    }
    if (stanCourtyardBotanicalCount > 0) {
      violations.push({ type: "stan_courtyard_botanicals", count: stanCourtyardBotanicalCount });
    }

    let gradientHexGrassTufts = 0;
    if (this.v5Grass?.mesh) {
      for (const ch of this.v5Grass.mesh.children) {
        if (!ch.isInstancedMesh || !ch.instanceMatrix?.array) continue;
        const arr = ch.instanceMatrix.array;
        const cnt = ch.userData?.fullCount ?? (arr.length >> 4);
        for (let j = 0; j < cnt; j++) {
          const wx = arr[j * 16 + 12];
          const wz = arr[j * 16 + 14];
          if (Math.abs(wx) <= 27.2 && wz >= 114.3 && wz <= 159.5) {
            gradientHexGrassTufts++;
          }
        }
      }
    }
    const gradientHexGrassCount = gradientHexGrassTufts + gradientHexBotanicalCount;
    if (gradientHexGrassCount > 0) {
      violations.push({
        type: "gradient_hex_grass_or_botanical",
        grassTufts: gradientHexGrassTufts,
        botanicals: gradientHexBotanicalCount,
      });
    }

    return {
      ok: violations.length === 0,
      totalPropsChecked: props.length,
      minClearanceM: Number((Number.isFinite(minClearanceM) ? minClearanceM : 0).toFixed(3)),
      minTriBinSeparationM: Number(
        (Number.isFinite(minTriBinSeparationM) ? minTriBinSeparationM : 0).toFixed(3)
      ),
      stanCourtyardBotanicalCount,
      stanParkedBikesCount,
      gradientHexGrassCount,
      waymoTurnSignalsCount,
      violations,
    };
  }
}
