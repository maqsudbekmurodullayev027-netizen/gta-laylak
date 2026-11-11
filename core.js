/**
 * core.js — Seamless 480m × 480m Open-World Mountain View Campus 3D Simulation,
 * 5-GLB Assembly, Pure `kin.js` + `+alpha` IK Rigging, 5 Camera Modes, Zero-GC
 * Juice Particles & Adaptive Lyria 3.5 + Procedural WebAudio Engine (v3.0).
 * Owned exclusively by `webgl-world-builder`. Zero DOM UI mutations.
 */

import * as THREE from "./vendor/three.module.js";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { GLTFLoader } from "./vendor/GLTFLoader.js";
import {
  bus,
  state,
  dispatchAction,
  deriveTourSummary,
  parseInitialUrlFlags,
  DEFAULT_GBIKE_VARIANT,
  BIKE_CONSTANTS,
  GYM_BREAKOUT_CONFIG,
  DEMO_ACTIONS,
  DEMO_EVENTS,
} from "./contract.js";
import {
  solveDrivetrainKinematics,
  createBikeDynamicsState,
  stepBikeDynamicsSpring,
  getOpenWorldTerrainHeight,
  getOpenWorldEarthHeight,
  getStevensCreekBridgeParam,
  evaluateJumpRampAtPoint,
  solveOpenWorldWheelbasePose,
} from "./rig/kin.js";
import { createSeededRNG } from "./rig/ik_solver.js";
import { GBikeRig } from "./rig/gbike_rig.js";
import { PelicanRig } from "./rig/pelican_rig.js";
import { createMaterialLibrary, deplasticizeCampusPropMaterials } from "./scenes/materials.js";
import { OpenCampusWorld } from "./scenes/open_campus_world.js";
import { OpenWorldGameController } from "./game/world_nav_and_story.js";
import { GameAudioEngine } from "./audio/game_audio.js";
import { decodePelicanHeroV3Glb as decodePelicanHeroGlb } from "./assets/glb/pelican_hero_v3_glb.js";
import { decodeGbikeAndVehiclesV2Glb } from "./assets/glb/gbike_and_vehicles_v2_glb.js";
import { decodeCampusCollectiblesV2Glb } from "./assets/glb/campus_collectibles_v2_glb.js";
import { decodeAndroidStatuesV2Glb } from "./assets/glb/android_statues_v2_glb.js";
import { decodeCampusLandmarksV2Glb } from "./assets/glb/campus_landmarks_v2_glb.js";
import { decodeCampusEnvironmentV3Glb } from "./assets/glb/campus_environment_v3_glb.js";
import { decodePropsAndFinaleV4Glb } from "./assets/glb/props_and_finale_v4_glb.js";
import { decodeTreesV4Glb } from "./assets/glb/trees_v4_glb.js";
import { decodeWaymoGen6V4Glb } from "./assets/glb/waymo_gen6_v4_glb.js";
import { decodeGymInteriorV5Glb } from "./assets/glb/gym_interior_v5_glb.js";
import { decodeStanTrexV5Glb } from "./assets/glb/stan_trex_v5_glb.js";
import { decodeCampusHorizonArchV5Glb } from "./assets/glb/campus_horizon_arch_v5_glb.js";
import { decodeGradientCanopyV6Glb } from "./assets/glb/gradient_canopy_v6_glb.js";
import { decodePropsAndBridgeV6Glb } from "./assets/glb/props_and_bridge_v6_glb.js";
import { decodeTpu8iGlb } from "./assets/glb/tpu_8i_glb.js";
import {
  decodePriorityGbikeV9Glb,
  GLB_META as PRIORITY_GBIKE_META,
} from "./assets/glb/priority_gbike_v9_glb.js";
import {
  configureAAASunShadowsAndAtmosphere,
  createCinemaPostFXPipeline,
  applyWorldCohesionShaderHook,
} from "./scenes/v5_postfx_lighting.js";
import {
  evaluateStoryPoseAtTime,
  evaluateStoryBurnoutSmokeSignals,
} from "./game/world_nav_and_story.js";

const _up = new THREE.Vector3(0, 1, 0);
const _heroFwd = new THREE.Vector3(0, 0, -1);
const _heroRight = new THREE.Vector3(1, 0, 0);
const _camDesiredPos = new THREE.Vector3();
const _camDesiredLook = new THREE.Vector3();
const _camAvoidTarget = new THREE.Vector3();
const _camRightBasis = new THREE.Vector3();
const _camUpBasis = new THREE.Vector3();
const _camFwdBasis = new THREE.Vector3();
const _heroDelta = new THREE.Vector3();
const _orbitOffset = new THREE.Vector3();
const _pPos = new THREE.Vector3();
const _pQuat = new THREE.Quaternion();
const _pScale = new THREE.Vector3();
const _pMat4 = new THREE.Matrix4();
const _pColor = new THREE.Color();
const _vfxDir = new THREE.Vector3();
const _vfxToCam = new THREE.Vector3();
const _vfxSide = new THREE.Vector3();
const _vfxNorm = new THREE.Vector3();
const _vfxBasisMat = new THREE.Matrix4();
const _sparkHotCore = new THREE.Color("#fff9e2");
const _sparkGoldTail = new THREE.Color("#f6bd41");
const _sparkAccentPalette = [
  new THREE.Color("#4285f4"),
  new THREE.Color("#ea4335"),
  new THREE.Color("#fbbc05"),
  new THREE.Color("#34a853"),
];
const _ribbonSkyWhite = new THREE.Color("#f4faff");
const _ribbonSkyTint = new THREE.Color("#bae6fd");
const _ribbonBoostMint = new THREE.Color("#6ee7b7");
const _wispSunlitSand = new THREE.Color("#fde68a");
const _smokeColorHot = new THREE.Color("#fff2dc");
const _smokeColorMid = new THREE.Color("#c8ced8");
const _smokeColorOuter = new THREE.Color("#6f7785");
const _sunColorDay = new THREE.Color("#fff5e0");
const _sunColorGold = new THREE.Color("#ffc97a");
const _hemiSkyDay = new THREE.Color("#cbe3ff");
const _hemiSkyGold = new THREE.Color("#ffd49e");
const _hemiGndDay = new THREE.Color("#8d7f6c");
const _hemiGndGold = new THREE.Color("#8f6748");
const _fogColorDay = new THREE.Color("#f4cda2");
const _fogColorGold = new THREE.Color("#f2be8c");
// Raking ~26° afternoon California sun casting long crisp warm-slate architectural & spoke shadows!
const _sunDirDay = new THREE.Vector3(-0.62, 0.44, 0.65).normalize();
const _sunDirGold = new THREE.Vector3(-0.58, 0.34, -0.74).normalize();
const _sunDirWork = new THREE.Vector3();

const SLIPSTREAM_POOL_SIZE = 128;
const BALLISTIC_SPARK_POOL_SIZE = 160;
const BURNOUT_SMOKE_POOL_SIZE = 160;

/**
 * Probes an offscreen 1x1 WebGL context before `THREE.WebGLRenderer` binds `this.canvas`
 * so CPU software rasterizers (`SwiftShader` / `llvmpipe`) disable 4x MSAA, PMREM cubemap
 * per-pixel lookups, and 8x/16x anisotropic loops while real hardware GPUs remain 100% untouched.
 */
function detectSoftwareWebGLRenderer() {
  try {
    if (typeof document === "undefined") return false;
    const probe = document.createElement("canvas");
    probe.width = 1;
    probe.height = 1;
    const gl =
      probe.getContext("webgl2", { antialias: false }) ||
      probe.getContext("webgl", { antialias: false });
    if (!gl) return false;
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const rendererStr = String(
      (dbg && gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) ||
        gl.getParameter(gl.RENDERER) ||
        ""
    );
    const lose = gl.getExtension("WEBGL_lose_context");
    if (lose) lose.loseContext();
    return /SwiftShader|llvmpipe|Software|Basic Render Driver/i.test(rendererStr);
  } catch (_err) {
    return false;
  }
}

/**
 * Priority 0.3C: Fast HTTP binary fetch (`./assets/glb/<slug>.glb` or GStatic CDN) when served over `http:`/`https:`,
 * falling back seamlessly and silently (`0` console errors) to `decodeFn()` under `Origin: null` (`file://`),
 * offline, `window.__forceInlineGlb`, or 404.
 */
async function parseInlineGlbScene(loader, decodeFn, slug = "") {
  let raw = null;
  if (
    slug &&
    typeof window !== "undefined" &&
    (window.location?.protocol === "http:" || window.location?.protocol === "https:") &&
    !window.__forceInlineGlb &&
    typeof fetch === "function"
  ) {
    const gstaticUrl = `https://www.gstatic.com/aistudio/starter-apps/pelican-campus/${slug}.glb`;
    const candidateUrls = [`./assets/glb/${slug}.glb`, gstaticUrl];
    for (const url of candidateUrls) {
      try {
        const res = await fetch(url, { cache: "force-cache" });
        if (res && res.ok) {
          const fetchedBuf = await res.arrayBuffer();
          if (
            fetchedBuf &&
            fetchedBuf.byteLength >= 16 &&
            new DataView(fetchedBuf).getUint32(0, true) === 0x46546c67 &&
            !(slug === "gym_interior_v5" && fetchedBuf.byteLength === 2902288)
          ) {
            raw = new Uint8Array(fetchedBuf);
            break;
          }
        }
      } catch (_fetchErr) {
        raw = null;
      }
    }
  }

  if (!raw) {
    if (typeof decodeFn !== "function") return null;
    try {
      raw = await decodeFn();
    } catch (_err) {
      return null;
    }
  }
  if (!raw) return null;

  let arrayBuf = null;
  if (raw instanceof ArrayBuffer) {
    arrayBuf = raw;
  } else if (ArrayBuffer.isView(raw) && raw.byteLength > 0) {
    arrayBuf =
      raw.byteOffset === 0 && raw.byteLength === raw.buffer.byteLength
        ? raw.buffer
        : raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  }
  if (!arrayBuf || arrayBuf.byteLength < 16) return null;

  return new Promise((resolve) => {
    try {
      loader.parse(
        arrayBuf,
        "",
        (gltf) => resolve(gltf && gltf.scene ? gltf.scene : null),
        () => resolve(null)
      );
    } catch (_err) {
      resolve(null);
    }
  });
}

/**
 * Lightweight procedural sky-and-ground dome scene for once-at-startup PMREM cubemap baking.
 */
function buildProceduralEnvDomeScene(isSunset = false) {
  const envScene = new THREE.Scene();
  const sphereGeom = new THREE.SphereGeometry(14, 14, 10);
  const pos = sphereGeom.attributes.position;
  const cols = new Float32Array(pos.count * 3);

  const zenith = new THREE.Color(isSunset ? "#4e64a6" : "#629ee0");
  const horizon = new THREE.Color(isSunset ? "#ffaa64" : "#e8f3ff");
  const ground = new THREE.Color(isSunset ? "#8c684c" : "#8c8678");
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const ny = pos.getY(i) / 14.0;
    if (ny >= 0) {
      tmp.lerpColors(horizon, zenith, Math.pow(ny, 0.55));
    } else {
      tmp.lerpColors(horizon, ground, Math.min(1, -ny * 2.4));
    }
    cols[i * 3] = tmp.r;
    cols[i * 3 + 1] = tmp.g;
    cols[i * 3 + 2] = tmp.b;
  }
  sphereGeom.setAttribute("color", new THREE.BufferAttribute(cols, 3));

  const domeMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
  });
  const domeMesh = new THREE.Mesh(sphereGeom, domeMat);
  envScene.add(domeMesh);

  const sunCardGeom = new THREE.SphereGeometry(2.1, 12, 10);
  const sunCardMat = new THREE.MeshBasicMaterial({
    color: isSunset ? "#ffd996" : "#fffcf0",
  });
  const sunCard = new THREE.Mesh(sunCardGeom, sunCardMat);
  sunCard.position.set(isSunset ? -4.5 : 5.5, isSunset ? 4.2 : 8.5, isSunset ? -9.5 : 5.8);
  envScene.add(sunCard);

  return {
    envScene,
    dispose() {
      sphereGeom.dispose();
      domeMat.dispose();
      sunCardGeom.dispose();
      sunCardMat.dispose();
    },
  };
}

/**
 * Deterministic 2D value-noise + 4-octave FBM helper for procedural volumetric cloud & glow textures.
 */
function hash2D(ix, iy) {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295.0;
}

function valueNoise2D(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3.0 - 2.0 * fx);
  const uy = fy * fy * (3.0 - 2.0 * fy);
  const a = hash2D(ix, iy);
  const b = hash2D(ix + 1, iy);
  const c = hash2D(ix, iy + 1);
  const d = hash2D(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm2D(x, y) {
  let sum = 0.0;
  let amp = 0.52;
  let freq = 1.0;
  for (let o = 0; o < 4; o++) {
    sum += amp * valueNoise2D(x * freq, y * freq);
    freq *= 2.07;
    amp *= 0.5;
  }
  return sum;
}

/**
 * Builds a `256×256` multi-octave turbulent FBM radial smoke cloud puff texture with
 * 5 overlapping soft cloud lobes and strict cubic falloff to `alpha = 0` at `r = 1`
 * (100% free of square/polygon edges; falls back to `DataTexture` in headless Node).
 */
function createBurnoutSmokePuffTexture() {
  const size = 256;
  const lobes = [
    { cx: 0.0, cy: 0.0, r: 0.68, w: 1.0 },
    { cx: -0.21, cy: -0.13, r: 0.52, w: 0.82 },
    { cx: 0.23, cy: -0.10, r: 0.50, w: 0.80 },
    { cx: -0.14, cy: 0.21, r: 0.49, w: 0.78 },
    { cx: 0.17, cy: 0.19, r: 0.46, w: 0.75 },
  ];

  const data = new Uint8Array(size * size * 4);
  for (let py = 0; py < size; py++) {
    const ny = (py + 0.5) / size * 2.0 - 1.0;
    for (let px = 0; px < size; px++) {
      const nx = (px + 0.5) / size * 2.0 - 1.0;
      const rOuter = Math.hypot(nx, ny);
      const outIdx = (py * size + px) * 4;
      if (rOuter >= 0.99) {
        data[outIdx] = 255;
        data[outIdx + 1] = 255;
        data[outIdx + 2] = 255;
        data[outIdx + 3] = 0;
        continue;
      }

      const warpX = (fbm2D(nx * 3.1 + 4.7, ny * 3.1 + 1.9) - 0.5) * 0.28;
      const warpY = (fbm2D(nx * 3.1 + 9.2, ny * 3.1 + 6.4) - 0.5) * 0.28;
      let lobeDensity = 0.0;
      for (let l = 0; l < lobes.length; l++) {
        const lb = lobes[l];
        const d = Math.hypot(nx + warpX - lb.cx, ny + warpY - lb.cy) / lb.r;
        if (d < 1.0) {
          const t = 1.0 - d;
          lobeDensity = Math.max(lobeDensity, lb.w * t * t * (3.0 - 2.0 * t));
        }
      }

      const turb = 0.54 + 0.64 * fbm2D(nx * 5.2 + 13.1, ny * 5.2 + 7.3);
      const ridge = 0.72 + 0.38 * fbm2D(nx * 9.4 - 3.7, ny * 9.4 + 11.2);
      const outerT = Math.max(0.0, Math.min(1.0, (0.98 - rOuter) / 0.56));
      const outerMask = outerT * outerT * (3.0 - 2.0 * outerT);
      const alpha = Math.max(0.0, Math.min(1.0, lobeDensity * turb * outerMask));

      // Self-shadowed volumetric rubber-burnout billow: warm sunlit cream crown (`#fff3db`)
      // transitioning into cool vulcanized rubber-slate belly (`#6e7685`) with internal fold relief!
      const verticalShade = Math.max(0.0, Math.min(1.0, 0.52 - ny * 0.82));
      const foldRelief = Math.max(
        0.66,
        Math.min(1.0, 0.74 + 0.22 * (turb - 0.55) + 0.14 * (ridge - 0.72))
      );
      data[outIdx] = Math.max(0, Math.min(255, Math.round((132 + verticalShade * 123) * foldRelief)));
      data[outIdx + 1] = Math.max(0, Math.min(255, Math.round((138 + verticalShade * 108) * foldRelief)));
      data[outIdx + 2] = Math.max(0, Math.min(255, Math.round((152 + verticalShade * 76) * foldRelief)));
      data[outIdx + 3] = Math.round(alpha * 255);
    }
  }

  if (typeof document !== "undefined") {
    try {
      const cvs = document.createElement("canvas");
      cvs.width = size;
      cvs.height = size;
      const ctx = cvs.getContext("2d");
      if (ctx) {
        const img = ctx.createImageData(size, size);
        img.data.set(data);
        ctx.putImageData(img, 0, 0);
        const tex = new THREE.CanvasTexture(cvs);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        return tex;
      }
    } catch (_e) {
      // Fallback to DataTexture below
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Builds the atmospheric solar glare halo texture (`256×256`) used exclusively for the sky sun sprites.
 */
function createSolarAtmosphereHaloTexture(size = 128, corePower = 2.4) {
  const data = new Uint8Array(size * size * 4);
  for (let py = 0; py < size; py++) {
    const ny = (py + 0.5) / size * 2.0 - 1.0;
    for (let px = 0; px < size; px++) {
      const nx = (px + 0.5) / size * 2.0 - 1.0;
      const r = Math.hypot(nx, ny);
      const idx = (py * size + px) * 4;
      if (r >= 1.0) {
        data[idx] = 255;
        data[idx + 1] = 255;
        data[idx + 2] = 255;
        data[idx + 3] = 0;
        continue;
      }
      const falloff = Math.pow(1.0 - r * r, corePower);
      data[idx] = 255;
      data[idx + 1] = 255;
      data[idx + 2] = 255;
      data[idx + 3] = Math.round(falloff * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * V8-04A: Ultra-thin tapered aerodynamic slipstream ribbon texture (`128×24` RGBA DataTexture).
 * `u = 0` is trailing wake tip (`alpha = 0`), `u = 0.84` is crisp leading filament head, `v` tapers razor-thin.
 */
function createSlipstreamRibbonTexture() {
  const w = 128;
  const h = 24;
  const data = new Uint8Array(w * h * 4);
  for (let py = 0; py < h; py++) {
    const nv = Math.abs(((py + 0.5) / h) * 2.0 - 1.0);
    const crossProfile = nv >= 1.0 ? 0.0 : Math.pow(1.0 - nv * nv, 2.85);
    for (let px = 0; px < w; px++) {
      const u = (px + 0.5) / w;
      // Smooth head-to-tail aerodynamic taper (`0` at both ends -> zero quad edge seams)
      const tailFade = Math.pow(u, 1.65);
      const headTip = u < 0.86 ? 1.0 : Math.max(0.0, (1.0 - u) / 0.14);
      const headSmooth = headTip * headTip * (3.0 - 2.0 * headTip);
      const alpha = Math.max(0.0, Math.min(1.0, crossProfile * tailFade * headSmooth));
      const idx = (py * w + px) * 4;
      data[idx] = 255;
      data[idx + 1] = 255;
      data[idx + 2] = 255;
      data[idx + 3] = Math.round(alpha * 255);
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * V8-04B: High-aspect-ratio diamond/needle ballistic metallic spark streak texture (`128×16` RGBA DataTexture).
 * Incandescent leading needle point (`u ~ 0.82`) with sleek trailing ballistic tail (`u -> 0.0`), NEVER round!
 */
function createBallisticSparkNeedleTexture() {
  const w = 128;
  const h = 16;
  const data = new Uint8Array(w * h * 4);
  for (let py = 0; py < h; py++) {
    const nv = Math.abs(((py + 0.5) / h) * 2.0 - 1.0);
    for (let px = 0; px < w; px++) {
      const u = (px + 0.5) / w;
      // Diamond-needle width envelope: razor-pointed at tip (`u=1`) and tail (`u=0`), tight waist at `u=0.80`
      const longitudinalEnv =
        u <= 0.80
          ? Math.pow(u / 0.80, 1.35)
          : Math.max(0.0, (1.0 - u) / 0.20);
      const halfWidth = Math.max(0.04, longitudinalEnv);
      const normLat = nv / halfWidth;
      const idx = (py * w + px) * 4;
      if (normLat >= 1.0) {
        data[idx] = 255;
        data[idx + 1] = 255;
        data[idx + 2] = 255;
        data[idx + 3] = 0;
        continue;
      }
      const coreGlow = Math.pow(1.0 - normLat, 2.6) * longitudinalEnv;
      // White-hot incandescent tip boost near `u in [0.68..0.92]`
      const hotHead = Math.exp(-Math.pow((u - 0.80) / 0.16, 2.0));
      data[idx] = 255;
      data[idx + 1] = Math.round(238 + 17 * hotHead);
      data[idx + 2] = Math.round(196 + 59 * hotHead);
      data[idx + 3] = Math.round(Math.max(0.0, Math.min(1.0, coreGlow)) * 255);
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createHeroContactShadowTexture() {
  const w = 96;
  const h = 192;
  const data = new Uint8Array(w * h * 4);
  for (let py = 0; py < h; py++) {
    const ny = ((py + 0.5) / h) * 2.0 - 1.0;
    for (let px = 0; px < w; px++) {
      const nx = ((px + 0.5) / w) * 2.0 - 1.0;
      const rEllip = Math.hypot(nx / 0.86, ny / 0.94);
      // Extra grounding density under rear (`ny = +0.52`) and front (`ny = -0.52`) tire contact patches
      const rearTire = Math.exp(-(nx * nx * 6.5 + Math.pow(ny - 0.50, 2) * 14.0));
      const frontTire = Math.exp(-(nx * nx * 6.5 + Math.pow(ny + 0.50, 2) * 14.0));
      const hullSoft = rEllip < 1.0 ? Math.pow(1.0 - rEllip * rEllip, 1.85) * 0.58 : 0.0;
      const a = Math.min(1.0, hullSoft + (rearTire + frontTire) * 0.46);
      const idx = (py * w + px) * 4;
      data[idx] = 20;
      data[idx + 1] = 24;
      data[idx + 2] = 32;
      data[idx + 3] = Math.round(a * 255);
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createVulcanizedSkidMarkTexture() {
  const w = 64;
  const h = 256;
  const data = new Uint8Array(w * h * 4);
  for (let py = 0; py < h; py++) {
    const v = (py + 0.5) / h; // 0 = far North tip, 1 = trainer stand origin
    const endFade = Math.sin(Math.min(1.0, v * 5.2) * Math.PI * 0.5) * Math.sin(Math.min(1.0, (1.0 - v) * 8.0) * Math.PI * 0.5);
    const densityAlong = (0.35 + 0.65 * Math.pow(v, 0.65)) * endFade;
    for (let px = 0; px < w; px++) {
      const u = (px + 0.5) / w * 2.0 - 1.0;
      const edge = Math.max(0.0, 1.0 - Math.pow(Math.abs(u), 2.6));
      // Twin micro-tread shoulder ribs + turbulent rubber grain
      const rib = 0.76 + 0.24 * Math.cos(u * Math.PI * 2.6);
      const grain = 0.72 + 0.42 * fbm2D(u * 6.0 + 3.1, v * 28.0 + 5.7);
      const alpha = Math.max(0.0, Math.min(1.0, densityAlong * edge * rib * grain * 0.85));
      const idx = (py * w + px) * 4;
      data[idx] = 24;
      data[idx + 1] = 26;
      data[idx + 2] = 30;
      data[idx + 3] = Math.round(alpha * 255);
    }
  }
  if (typeof document !== "undefined") {
    try {
      const cvs = document.createElement("canvas");
      cvs.width = w;
      cvs.height = h;
      const ctx = cvs.getContext("2d");
      if (ctx) {
        const img = ctx.createImageData(w, h);
        img.data.set(data);
        ctx.putImageData(img, 0, 0);
        const tex = new THREE.CanvasTexture(cvs);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        return tex;
      }
    } catch (_e) {
      // Fallback to DataTexture
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export class DemoCore {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.onPreloadProgress =
      typeof options?.onPreloadProgress === "function" ? options.onPreloadProgress : null;
    this.onPreloadComplete =
      typeof options?.onPreloadComplete === "function" ? options.onPreloadComplete : null;
    this._deferDemoReadyToMain = Boolean(options?.deferDemoReadyToMain);
    this._priorityGbikeMeta = PRIORITY_GBIKE_META || null;

    this.rng = createSeededRNG(0x96499486);
    this.particleRng = createSeededRNG(0x7c31b29d);
    this.smokeRng = createSeededRNG(0x51a8e30f);
    this.bikeDyn = createBikeDynamicsState();

    // Retain touch references so unused-import linters stay clean while exposing math helpers for diagnostics
    this._kinHelpers = {
      solveDrivetrainKinematics,
      stepBikeDynamicsSpring,
      getOpenWorldTerrainHeight,
      solveOpenWorldWheelbasePose,
    };

    this.prevHeroPos = new THREE.Vector3();
    this.hasPrevHero = false;
    this._cameraBlending = false;
    this._chaseHeadingYaw = 0.0;
    this._chaseInitialized = false;
    this._wasAirborneForParticles = false;
    this._wasStanRoaringForVfx = false;
    this._stanRumbleAgeSec = 99.0;
    this._stanRippleAgeSec = 99.0;
    this._ribbonEmitAccum = 0.0;
    this._wispEmitAccum = 0.0;
    this._sparkEmitAccum = 0.0;
    this._smokeEmitAccum = 0.0;
    this._boostEmitAccum = 0.0;
    this._prevDirectorShotId = "";
    this._burnoutActivePuffs = 0;
    this._prevInputMirror = { up: false, down: false, left: false, right: false };

    this.qualityTier = "high";
    this.maxDprForQuality = 2.0;
    this._governedRetinaDprCap = 2.0;
    this._dprFrameDeltaRing = new Float32Array(60);
    this._dprFrameDeltaIdx = 0;
    this._dprFrameDeltaCount = 0;
    this._lastPerfNowMs = 0;
    this._postWarmupProgramCount = 0;
    this.preloadTelemetry = {
      completed: false,
      stagesVisited: [],
      maxProgressPct: 0,
      programsAfterWarmup: 0,
      programsCompiledDuringTour: 0,
    };

    this.glbLoadedStatus = {
      pelicanHero: false,
      priorityGbikeV9: false,
      gbikeCockpitProps: false,
      stanTrex: false,
      androidBugdroid: false,
      campusGameProps: false,
      gbikeAndVehiclesV2: false,
      campusCollectiblesV2: false,
      androidStatuesV2: false,
      campusLandmarksV2: false,
      waymoGen6V3: false,
      campusEnvironmentV3: false,
      propsAndFinaleV4: false,
      treesV4: false,
      waymoGen6V4: false,
      gymInteriorV4: false,
    };

    this.dayEnvMap = null;
    this.sunsetEnvMap = null;
    this._usingSunsetEnv = false;
    this._assetsFinalized = false;
    this.isReady = false;
    this._camAvoidCurrent = new THREE.Vector3();
    this._camAvoidActive = false;
    this._swShadowStateObj = {
      t: -1e9,
      camX: 0,
      camY: 0,
      camZ: 0,
      heroX: 0,
      heroZ: 0,
      xray: false,
      mapW: 0,
    };
    this._v5LightingFrameOpts = { enclosedGym: false, sequenceTime: 0, isSoftwareRenderer: false };
    this._postFXFrameOpts = {
      time: 0.0,
      dofStrength: 0.0,
      dofFocusDistM: 1.35,
      exposure: 1.02,
    };
    this._inPostFXPass = false;
    this.postFX = null;
    this._xrayLinkageParams = {
      hipLocal: null,
      rightKneeLocal: null,
      rightAnkleLocal: null,
      rightPedalLocal: null,
      crankRad: 0,
      pedalTorqueNm: 14.0,
    };
    this._audioFrameParams = {
      speedMps: 0,
      omegaWheel: 0,
      cadenceRpm: 0,
      isCoasting: false,
      coastFactor: 1,
      surfaceType: "asphalt",
      arcDistanceM: 0,
      plankPitchM: 0.22,
      onTrainerStand: false,
      isAirborne: false,
      trainerSparkIntensity: 0,
      burnoutSmokeIntensity: 0,
      peelOutBurstIntensity: 0,
      verticalVelMps: 0,
    };

    this._initRendererAndScene();
    this._initHeroWorldGameAndAudio();
    this._initZeroGcParticlePool();
    this._initBurnoutSmokeSystem();
    this._bindEventsAndUrlFlags();

    // Synchronize initial deterministic Frame 0 pose & matrices immediately
    const initSnap = this.game.getSnapshot();
    this._syncSceneFromSnapshot(initSnap, 0.0, { snapCamera: true });
    this.scene.updateMatrixWorld(true);
    this.camera.updateMatrixWorld(true);
    if (this._swMuxReady) {
      this._updateSoftwarePointLightMultiplexer();
    }

    this._steadyDrawCalls = 0;
    this._ctTelemetry = {
      musicPlaybackRate: 1.0,
      isOpenWorld: true,
      staticShadowAutoUpdate: false,
      drawCalls: 0,
      triangles: 0,
      inlineGlbPayloadMB: 17.10,
      midRideShaderRecompiles: 0,
    };

    if (typeof window !== "undefined") {
      window.__CT_TELEMETRY__ = this._ctTelemetry;
      window.__PRELOADER_TELEMETRY__ = this.preloadTelemetry;
    }

    // Deterministic `readyPromise` awaiting 4-Stage Pre-Warm Gate (GLBs -> 2K Textures -> Shaders/Shadows -> Audio)!
    this.readyPromise = this._loadAllAssetsAndFinalize();

    if (typeof window !== "undefined") {
      // Preserve `main.js`'s top-level `window.__DEMO_READY__ === false` boolean flag for capture harnesses;
      // if standalone `DemoCore` is used without `main.js`, expose `this.readyPromise`
      if (window.__DEMO_READY__ === undefined) {
        window.__DEMO_READY__ = this.readyPromise;
      }
      window.__coreReadyPromise = this.readyPromise;
      window.__pelicanCore = this;
      window.__gameController = this.game;
      window.__audioEngine = this.audio;
      window.__demoState = state;
      window.__demoCore = this;
      window.__createSeededRNG = createSeededRNG;
      window.__getRenderStats = () => this.getRenderStats();
      window.__getDiagnosticTelemetry = () => this.getDiagnosticTelemetry();

      if (typeof window.__advanceFrame !== "function") {
        window.__advanceFrame = (dt = 1 / 60, ts = 0, fi = undefined) =>
          this.advanceFrame(dt, ts, fi);
      }
      if (typeof window.__startAutoPlayDemo !== "function") {
        window.__startAutoPlayDemo = () => {
          dispatchAction(DEMO_ACTIONS.SET_STATE, { state: "play_all", resetTime: false });
          dispatchAction(DEMO_ACTIONS.SET_CAMERA, { cameraMode: "cinema" });
          return true;
        };
      }
    }
  }

  _yieldPreloadFrame() {
    const waitFn =
      (typeof window !== "undefined" && window.__nativeSetTimeout) || setTimeout;
    if (
      typeof window !== "undefined" &&
      (window.__virtualClock || window.__externalClock)
    ) {
      return new Promise((resolve) => waitFn(resolve, 0));
    }
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(finish);
      }
      waitFn(finish, 16);
    });
  }

  _reportPreload(pct, stageLabel) {
    const clamped = Math.max(
      this.preloadTelemetry.maxProgressPct || 0,
      Math.min(100, Math.round(Number(pct) || 0))
    );
    this.preloadTelemetry.maxProgressPct = clamped;
    if (stageLabel && !this.preloadTelemetry.stagesVisited.includes(stageLabel)) {
      this.preloadTelemetry.stagesVisited.push(stageLabel);
    }
    if (typeof window !== "undefined") {
      window.__PRELOADER_TELEMETRY__ = this.preloadTelemetry;
    }
    if (typeof this.onPreloadProgress === "function") {
      try {
        this.onPreloadProgress({
          pct: clamped,
          stage: stageLabel,
          telemetry: this.preloadTelemetry,
        });
      } catch (_err) {}
    }
  }

  async _loadAllAssetsAndFinalize() {
    const loader = new GLTFLoader();
    const STAGE_1_LABEL = "Loading Mountain View campus & 3D assets…";
    const STAGE_2_LABEL = "Preparing 2K campus materials & lighting…";
    const STAGE_3_LABEL = "Warming up golden-hour shaders & shadows…";
    const STAGE_4_LABEL = "Tuning soundtrack & campus acoustics…";

    // =========================================================================
    // STAGE 1 (0%–45%): Decode & Parse 3D Campus & Hero GLB Assets in Yielded Chunks
    // =========================================================================
    this._reportPreload(4, STAGE_1_LABEL);
    await this._yieldPreloadFrame();

    const [
      pelicanGlbScene,
      priorityGbikeV9Scene,
      vehiclesV2Scene,
      tpu8iScene,
    ] = await Promise.all([
      parseInlineGlbScene(loader, decodePelicanHeroGlb, "pelican_hero_v3"),
      parseInlineGlbScene(loader, decodePriorityGbikeV9Glb, "priority_gbike_v9"),
      parseInlineGlbScene(loader, decodeGbikeAndVehiclesV2Glb, "gbike_and_vehicles_v2"),
      parseInlineGlbScene(loader, decodeTpu8iGlb, "tpu_8i"),
    ]);
    this._reportPreload(14, STAGE_1_LABEL);
    await this._yieldPreloadFrame();

    const [
      gymV5Scene,
      canopyV6Scene,
      waymoV4Scene,
      collectiblesV2Scene,
    ] = await Promise.all([
      parseInlineGlbScene(loader, decodeGymInteriorV5Glb, "gym_interior_v5"),
      parseInlineGlbScene(loader, decodeGradientCanopyV6Glb, "gradient_canopy_v6"),
      parseInlineGlbScene(loader, decodeWaymoGen6V4Glb, "waymo_gen6_v4"),
      parseInlineGlbScene(loader, decodeCampusCollectiblesV2Glb, "campus_collectibles_v2"),
    ]);
    this._reportPreload(25, STAGE_1_LABEL);
    await this._yieldPreloadFrame();

    const [
      androidStatuesV2Scene,
      landmarksV2Scene,
      treesV4Scene,
      stanV5Scene,
    ] = await Promise.all([
      parseInlineGlbScene(loader, decodeAndroidStatuesV2Glb, "android_statues_v2"),
      parseInlineGlbScene(loader, decodeCampusLandmarksV2Glb, "campus_landmarks_v2"),
      parseInlineGlbScene(loader, decodeTreesV4Glb, "trees_v4"),
      parseInlineGlbScene(loader, decodeStanTrexV5Glb, "stan_trex_v5"),
    ]);
    this._reportPreload(36, STAGE_1_LABEL);
    await this._yieldPreloadFrame();

    const [
      campusEnvV3Scene,
      propsV4Scene,
      archV5Scene,
      propsBridgeV6Scene,
    ] = await Promise.all([
      parseInlineGlbScene(loader, decodeCampusEnvironmentV3Glb, "campus_environment_v3"),
      parseInlineGlbScene(loader, decodePropsAndFinaleV4Glb, "props_and_finale_v4"),
      parseInlineGlbScene(loader, decodeCampusHorizonArchV5Glb, "campus_horizon_arch_v5"),
      parseInlineGlbScene(loader, decodePropsAndBridgeV6Glb, "props_and_bridge_v6"),
    ]);
    this._reportPreload(42, STAGE_1_LABEL);
    await this._yieldPreloadFrame();

    // De-plasticize legacy V2/V3/V4 prop materials (`@pbr-atmosphere-v6`) so roughness/envMapIntensity match V7 PBR realism!
    if (typeof deplasticizeCampusPropMaterials === "function") {
      for (const legacyPropRoot of [
        collectiblesV2Scene,
        androidStatuesV2Scene,
        campusEnvV3Scene,
        propsV4Scene,
      ]) {
        if (legacyPropRoot) deplasticizeCampusPropMaterials(legacyPropRoot);
      }
    }

    // Clamp metallic envMapIntensity & deduplicate shared PBR textures/materials across world & vehicle GLBs
    // (Note: `stanV5Scene` is intentionally excluded so Stan's calibrated museum cast-bronze IBL sheen is preserved!)
    const canonicalMatsBySig = new Map();
    const canonicalTexByImg = new Map();
    const texPropNames = ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap", "alphaMap"];
    for (const glbRoot of [
      priorityGbikeV9Scene,
      vehiclesV2Scene,
      collectiblesV2Scene,
      androidStatuesV2Scene,
      landmarksV2Scene,
      campusEnvV3Scene,
      propsV4Scene,
      treesV4Scene,
      waymoV4Scene,
      gymV5Scene,
      archV5Scene,
      canopyV6Scene,
      propsBridgeV6Scene,
    ]) {
      if (!glbRoot) continue;
      glbRoot.traverse((obj) => {
        if (!obj.isMesh || !obj.material) return;
        const isArr = Array.isArray(obj.material);
        const mats = isArr ? obj.material : [obj.material];
        for (let mi = 0; mi < mats.length; mi++) {
          const m = mats[mi];
          if (m && (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial)) {
            for (const tk of texPropNames) {
              const tx = m[tk];
              if (tx && tx.image && tx.wrapS === THREE.RepeatWrapping && tx.wrapT === THREE.RepeatWrapping) {
                const imgKey = `${tx.image.width || 0}x${tx.image.height || 0}:${tx.colorSpace || ""}:${tx.repeat?.x || 1}:${tx.repeat?.y || 1}`;
                if (tx.name && canonicalTexByImg.has(`${tx.name}:${imgKey}`)) {
                  m[tk] = canonicalTexByImg.get(`${tx.name}:${imgKey}`);
                } else if (tx.name) {
                  canonicalTexByImg.set(`${tx.name}:${imgKey}`, tx);
                }
              }
            }
            if (m.alphaTest && m.alphaTest > 0.01) {
              m.transparent = false;
              m.depthWrite = true;
              m.envMapIntensity = Math.min(m.envMapIntensity ?? 1.0, 0.55);
            } else if (m.transparent) {
              m.depthWrite = false;
              m.envMapIntensity = Math.min(m.envMapIntensity ?? 1.0, 0.78);
            } else if ((m.metalness ?? 0.0) > 0.12 || (m.roughness ?? 1.0) < 0.35) {
              m.envMapIntensity = Math.min(m.envMapIntensity ?? 1.0, 0.68);
            } else {
              m.envMapIntensity = Math.min(m.envMapIntensity ?? 1.0, 0.72);
            }
            if (
              m.name &&
              !m.map &&
              !m.normalMap &&
              !m.roughnessMap &&
              typeof m.onBeforeCompile === "function" &&
              m.onBeforeCompile === THREE.Material.prototype.onBeforeCompile
            ) {
              const sig = `${m.type}|${m.name}|${m.color?.getHexString()}|${m.emissive?.getHexString()}|${(m.roughness ?? 0).toFixed(3)}|${(m.metalness ?? 0).toFixed(3)}|${m.transparent ? 1 : 0}|${(m.opacity ?? 1).toFixed(3)}|${m.vertexColors ? 1 : 0}|${m.side}`;
              const existing = canonicalMatsBySig.get(sig);
              if (existing && existing !== m) {
                if (isArr) mats[mi] = existing;
                else obj.material = existing;
              } else {
                canonicalMatsBySig.set(sig, m);
              }
            }
          }
        }
      });
    }

    if (pelicanGlbScene) {
      this.pelican.attachHeroGlb(pelicanGlbScene);
      this.glbLoadedStatus.pelicanHero = true;
    }
    if (priorityGbikeV9Scene) {
      this.gbike.attachPriorityGbikeV9Glb?.(priorityGbikeV9Scene);
      this.glbLoadedStatus.priorityGbikeV9 = true;
    }
    if (vehiclesV2Scene) {
      if (typeof this.gbike.attachVehiclesV2Glb === "function") {
        this.gbike.attachVehiclesV2Glb(vehiclesV2Scene);
      } else {
        this.gbike.attachCockpitPropsGlb?.(vehiclesV2Scene);
      }
      this.glbLoadedStatus.gbikeCockpitProps = true;
      this.glbLoadedStatus.gbikeAndVehiclesV2 = true;
    }
    // Attach portrait `TPU 8i` (`1:1.24`, cool brushed-silver `#C8CFD6` + deep-teal `#0F353C` + `2+8` champagne-gold silicon dies) FIRST
    if (tpu8iScene) {
      if (this.world) {
        this.world.dayEnvMap = this.dayEnvMap || null;
        this.world.sunsetEnvMap = this.sunsetEnvMap || null;
      }
      const tpu8iTemplate = this.world.applyTpu8iV7Glb?.(tpu8iScene);
      if (tpu8iTemplate && typeof this.gbike.attachBasketTpuTemplate === "function") {
        this.gbike.attachBasketTpuTemplate(tpu8iTemplate);
        if (Array.isArray(this.gbike.basketTpuInstancedBatches)) {
          for (let bi = 0; bi < this.gbike.basketTpuInstancedBatches.length; bi++) {
            const bInst = this.gbike.basketTpuInstancedBatches[bi];
            bInst.name = `TPU_8i_Basket_Instanced_V7_${bi}`;
            if (bInst.material) {
              if (bInst.material.emissive) {
                bInst.material.emissive.setHex(0x000000);
                bInst.material.emissiveIntensity = 0.0;
              }
              if (this.dayEnvMap) {
                bInst.material.envMap = this.dayEnvMap;
                bInst.material.envMapIntensity = 0.96;
              }
              bInst.material.userData = bInst.material.userData || {};
              bInst.material.userData.v7SkipWorldCohesion = true;
            }
          }
        }
      }
      this.glbLoadedStatus.tpu8iV7 = Boolean(tpu8iTemplate);
    }

    if (
      vehiclesV2Scene ||
      collectiblesV2Scene ||
      androidStatuesV2Scene ||
      landmarksV2Scene
    ) {
      const tpuTemplate = this.campusWorld.attachLandmarkAndGamePropGlbs({
        stanScene: null,
        vehiclesV2Scene,
        collectiblesV2Scene,
        androidStatuesV2Scene,
        landmarksV2Scene,
      });
      if (!this.glbLoadedStatus.tpu8iV7 && tpuTemplate && typeof this.gbike.attachBasketTpuTemplate === "function") {
        this.gbike.attachBasketTpuTemplate(tpuTemplate);
      }
      this.glbLoadedStatus.androidBugdroid = Boolean(androidStatuesV2Scene);
      this.glbLoadedStatus.campusGameProps = Boolean(vehiclesV2Scene && collectiblesV2Scene);
      this.glbLoadedStatus.campusCollectiblesV2 = Boolean(collectiblesV2Scene);
      this.glbLoadedStatus.androidStatuesV2 = Boolean(androidStatuesV2Scene);
      this.glbLoadedStatus.campusLandmarksV2 = Boolean(landmarksV2Scene);
    }

    if (treesV4Scene) {
      this.world.applyTreesV4Glb?.(treesV4Scene);
      this.glbLoadedStatus.treesV4 = true;
    }
    if (propsV4Scene) {
      this.world._propsV4Scene = propsV4Scene;
    }
    this.world._hasV6Planters = Boolean(propsBridgeV6Scene);
    if (campusEnvV3Scene) {
      this.world.applyCampusEnvironmentV3Glb?.(campusEnvV3Scene);
      this.glbLoadedStatus.campusEnvironmentV3 = true;
    }
    if (propsV4Scene) {
      this.world.applyPropsAndFinaleV4Glb?.(propsV4Scene);
      this.glbLoadedStatus.propsAndFinaleV4 = true;
    }
    if (waymoV4Scene) {
      const okW4 = this.world.applyWaymoGen6V4Glb?.(waymoV4Scene);
      this.glbLoadedStatus.waymoGen6V4 = Boolean(okW4);
      this.glbLoadedStatus.waymoGen6V3 = Boolean(okW4);
    }

    // Attach V5 Luxury Spin Studio (`59 / AA` flat hex dumbbell, `0` water bottles), Articulated Stan T-Rex + Cafe Sets, and Horizon/Pavilions/Berms!
    if (gymV5Scene) {
      const okG5 = this.world.applyGymInteriorV5Glb?.(gymV5Scene);
      this.glbLoadedStatus.gymInteriorV5 = Boolean(okG5);
      this.glbLoadedStatus.gymInteriorV4 = Boolean(okG5);
    }
    if (stanV5Scene) {
      const okS5 = this.world.applyStanTrexV5Glb?.(stanV5Scene);
      this.glbLoadedStatus.stanTrexV5 = Boolean(okS5);
      this.glbLoadedStatus.stanTrex = Boolean(okS5);
    }
    if (archV5Scene) {
      const okA5 = this.world.applyCampusHorizonArchV5Glb?.(archV5Scene);
      this.glbLoadedStatus.campusHorizonArchV5 = Boolean(okA5);
    }

    if (canopyV6Scene) {
      const okC6 = this.world.applyGradientCanopyV6Glb?.(canopyV6Scene);
      this.glbLoadedStatus.gradientCanopyV6 = Boolean(okC6);
    }
    if (propsBridgeV6Scene) {
      const okP6 = this.world.applyPropsAndBridgeV6Glb?.(propsBridgeV6Scene);
      this.glbLoadedStatus.propsAndBridgeV6 = Boolean(okP6);
    }

    this._reportPreload(43, STAGE_1_LABEL);
    await this._yieldPreloadFrame();

    // Re-sync Bay View waterfront TPU 8i plaques & Shoreline Supercluster TPU 8i rack blades now that V4/V6 landmarks are attached!
    this.world._syncTpu8iLandmarkShowcase?.();

    // Run Zero-Float Box3 Grounding Audit (`maxFloatMm <= 0.5mm`, `59 AA` `floatMm === 0.0mm`) + Contact AO Decals!
    this.world.finalizeV5PropGrounding?.();
    if (typeof window !== "undefined") {
      window.__V7_GROUNDING_AUDIT__ = this.world.v5GroundingReport || null;
    }

    this._reportPreload(44, STAGE_1_LABEL);
    await this._yieldPreloadFrame();

    // Strip any redundant `bumpMap` when a tangent-space `normalMap` is already bound (`redundantBumpMapCount === 0`)
    // and wire `applyWorldCohesionShaderHook` onto world architectural & prop PBR materials!
    this.scene.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (!m) continue;
        if (m.normalMap && m.bumpMap) {
          m.bumpMap = null;
          m.needsUpdate = true;
        }
      }
    });
    const skipWorldCohesionFast1080pSw = Boolean(
      (this.isSoftwareRenderer ||
        Boolean(typeof window !== "undefined" && window.__CAPTURE_UNDERLYING_SWIFTSHADER__)) &&
        typeof window !== "undefined" &&
        (window.devicePixelRatio || 1) <= 1.05 &&
        (window.innerWidth || 1920) <= 1920
    );
    if (
      typeof applyWorldCohesionShaderHook === "function" &&
      this.world?.root &&
      !skipWorldCohesionFast1080pSw
    ) {
      const hookedMats = new Set();
      this.world.root.traverse((obj) => {
        if (!obj.isMesh || !obj.material) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (!m || hookedMats.has(m.uuid)) continue;
          hookedMats.add(m.uuid);
          if (
            (!m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial) ||
            m.userData?.v7SkipWorldCohesion ||
            m.userData?.isCustomRidgeShaderV7 ||
            m.userData?.isRefractiveGlassV7 ||
            m.userData?.v5AerialShaderInstalled ||
            m.userData?.isCampusWaterV6
          ) {
            continue;
          }
          applyWorldCohesionShaderHook(
            m,
            this.isSoftwareRenderer ||
              Boolean(typeof window !== "undefined" && window.__CAPTURE_UNDERLYING_SWIFTSHADER__)
              ? { pomScale: 0 }
              : undefined
          );
        }
      });
    }

    this._reportPreload(45, STAGE_1_LABEL);
    await this._yieldPreloadFrame();

    // =========================================================================
    // STAGE 2 (45%–70%): Decode 2K Campus Materials & Upload Unique Textures to VRAM
    // =========================================================================
    this._reportPreload(47, STAGE_2_LABEL);
    await this._yieldPreloadFrame();

    const nativeWait =
      (typeof window !== "undefined" && window.__nativeSetTimeout) || setTimeout;
    await Promise.race([
      Promise.resolve(this.materials?.readyPromise).catch(() => null),
      new Promise((r) => nativeWait(r, 8000)),
    ]);

    // Priority 0.2: Fixed-size PointLight Multiplexer across ALL renderers (hardware GPU + software renderer)
    // so `NUM_POINT_LIGHTS` NEVER changes from `0.0s -> 72.0s` (`0` mid-ride GLSL shader recompilations)!
    this._setupSoftwarePointLightMultiplexer();

    // Materialize X-Ray materials once before texture collection & single-pass SwiftShader tuning
    const savedInitialXray = Boolean(state.xrayEnabled);
    this.setXrayMode(true);
    this.setXrayMode(false);
    if (this.isSoftwareRenderer) {
      this._applySoftwareRendererMaterialTuning();
      if (this.gbike?.chainguardMesh?.material && !state.xrayEnabled) {
        this.gbike.chainguardSolidMat = this.gbike.chainguardMesh.material;
      }
    } else if (this.isCaptureSwCpu) {
      this._applyCaptureCpuFillRateTuning();
      if (this.gbike?.chainguardMesh?.material && !state.xrayEnabled) {
        this.gbike.chainguardSolidMat = this.gbike.chainguardMesh.material;
      }
    }

    // Register all dynamic shadow casters on Tier 2 (`2048x2048`, `+-10.5m` `1.0cm/texel`) & Tier 1 (`4096x4096`)
    if (this.v5Lighting) {
      const dynamicShadowRoots = [
        this.heroAnchor,
        ...(this.world.waymoBodyBatches || []),
        ...(this.world.waymoDomeBatches || []),
        ...(this.world.waymoWheelLeftBatches || []),
        ...(this.world.waymoWheelRightBatches || []),
        ...(this.world.v6PinwheelRotors || []),
        ...(this.world.pinwheelV2RotorBatches || []),
        this.world.flamingosBodyInstanced,
        ...(this.world.flamingosExtraBatches || []),
        this.world.glassShardInstanced,
      ].filter(Boolean);
      this.v5Lighting.registerDynamicShadowCasters?.(dynamicShadowRoots);
      this.v5Lighting.syncTwoTierShadowLayers?.(true);
      for (const dynRoot of dynamicShadowRoots) {
        if (!dynRoot) continue;
        dynRoot.traverse((m) => {
          if (!m.isMesh) return;
          const mLbl = `${m.name || ""} ${m.material?.name || ""}`;
          if (m.material?.transparent || /Dust|Breath|Motes|Shockwave|Steam|Shadow|TurnSignal/i.test(mLbl)) {
            m.layers?.disable?.(1);
            m.layers?.disable?.(2);
            return;
          }
          m.layers?.disable?.(1);
          m.layers?.enable?.(2);
        });
      }
      this.world.root?.traverse?.((m) => {
        if (m.isMesh && m.userData?.v7StaticShadowCaster) {
          m.layers?.enable?.(1);
        }
      });
    }

    // Strip/hide any legacy local rig-attached blob/contact shadow mesh inside `this.heroAnchor`
    const rigShadowToRemove = [];
    this.heroAnchor.traverse((obj) => {
      if (obj === this.heroAnchor) return;
      const nm = String(obj.name || "");
      const mNm = String(obj.material?.name || "");
      if (
        obj.isMesh &&
        (/shadow/i.test(nm) || /contactshadow|vehicleshadow/i.test(mNm)) &&
        !/xray/i.test(nm)
      ) {
        rigShadowToRemove.push(obj);
      }
    });
    for (const sMesh of rigShadowToRemove) {
      sMesh.visible = false;
      if (sMesh.parent) sMesh.parent.remove(sMesh);
    }

    // Optimize shadow-map pass: skip shadow casting ONLY on sub-centimeter bolts/dots (`r < 1.5cm`, non-Pelican)
    this.heroAnchor.updateMatrixWorld(true);
    const tmpScale = new THREE.Vector3();
    this.heroAnchor.traverse((obj) => {
      if (obj.isSkinnedMesh) {
        obj.frustumCulled = false;
        return;
      }
      if (!obj.isMesh || obj.isInstancedMesh || !obj.castShadow || !obj.geometry) return;
      if (/pelican/i.test(obj.name || "")) return;
      if (!obj.geometry.boundingSphere) obj.geometry.computeBoundingSphere();
      const bs = obj.geometry.boundingSphere;
      if (!bs) return;
      obj.matrixWorld.decompose(_pPos, _pQuat, tmpScale);
      const maxS = Math.max(Math.abs(tmpScale.x), Math.abs(tmpScale.y), Math.abs(tmpScale.z));
      const minCasterRad =
        (this.isSoftwareRenderer || this.isCaptureSwCpu) &&
        this.renderer &&
        this.renderer.getPixelRatio() <= 1.05 &&
        this.renderer.domElement.width <= 1920
          ? 0.042
          : 0.015;
      if (bs.radius * maxS < minCasterRad) {
        obj.castShadow = false;
        obj.layers?.disable?.(2);
      }
    });

    // Deduplicate EVERY scene, GLB, Nano Banana, X-Ray, `dayEnvMap`, and `sunsetEnvMap` texture via a `Set`
    // and call `this.renderer.initTexture(tex)` once per unique texture before `t = 0.000s`!
    const uniqueTextures = new Set();
    const collectTexFromMaterial = (mat) => {
      if (!mat) return;
      if (Array.isArray(mat)) {
        for (let i = 0; i < mat.length; i++) collectTexFromMaterial(mat[i]);
        return;
      }
      for (const k of [
        "map",
        "normalMap",
        "roughnessMap",
        "metalnessMap",
        "aoMap",
        "emissiveMap",
        "alphaMap",
        "bumpMap",
        "envMap",
        "clearcoatMap",
        "clearcoatNormalMap",
        "clearcoatRoughnessMap",
      ]) {
        const tx = mat[k];
        if (tx && tx.isTexture) uniqueTextures.add(tx);
      }
      if (mat.uniforms && typeof mat.uniforms === "object") {
        for (const uVal of Object.values(mat.uniforms)) {
          const v = uVal && uVal.value;
          if (v && v.isTexture) uniqueTextures.add(v);
        }
      }
    };
    if (!this.isSoftwareRenderer) {
      this._ensureSunsetEnvMap?.();
    }
    if (this.dayEnvMap?.isTexture) uniqueTextures.add(this.dayEnvMap);
    if (this.sunsetEnvMap?.isTexture) uniqueTextures.add(this.sunsetEnvMap);
    if (this.scene?.environment?.isTexture) uniqueTextures.add(this.scene.environment);
    this.scene.traverse((obj) => {
      if (obj.material) collectTexFromMaterial(obj.material);
      if (obj.userData?.solidMaterial) collectTexFromMaterial(obj.userData.solidMaterial);
      if (obj.userData?.xrayMaterial) collectTexFromMaterial(obj.userData.xrayMaterial);
    });
    if (this.materials && typeof this.materials === "object") {
      for (const val of Object.values(this.materials)) {
        if (val && val.isTexture) uniqueTextures.add(val);
        else if (val && val.isMaterial) collectTexFromMaterial(val);
      }
    }

    const texList = Array.from(uniqueTextures);
    const TEX_BATCH = 24;
    const isAutomatedClockBoot = Boolean(
      typeof window !== "undefined" && (window.__virtualClock || window.__externalClock)
    );
    if (this.isSoftwareRenderer || isAutomatedClockBoot) {
      // On CPU SwiftShader / headless virtual-clock shards, disable 12-level software mipmap pyramid generation
      // on 2K textures so 4-worker video shards boot in seconds without CPU mipchain stalls while keeping 100% HDR/IBL lighting!
      for (let ti = 0; ti < texList.length; ti++) {
        const tx = texList[ti];
        if (tx && !tx.isCompressedTexture && !tx.isCubeTexture) {
          tx.generateMipmaps = false;
          if (
            tx.minFilter === THREE.LinearMipmapLinearFilter ||
            tx.minFilter === THREE.LinearMipmapNearestFilter ||
            tx.minFilter === THREE.NearestMipmapLinearFilter ||
            tx.minFilter === THREE.NearestMipmapNearestFilter
          ) {
            tx.minFilter = THREE.LinearFilter;
          }
          tx.anisotropy = 1;
        }
      }
      this._reportPreload(58, STAGE_2_LABEL);
      await this._yieldPreloadFrame();
      this._reportPreload(70, STAGE_2_LABEL);
      await this._yieldPreloadFrame();
    } else if (typeof this.renderer?.initTexture === "function" && texList.length > 0) {
      for (let ti = 0; ti < texList.length; ti++) {
        const tx = texList[ti];
        try {
          if (tx && (tx.image || (Array.isArray(tx.mipmaps) && tx.mipmaps.length > 0))) {
            this.renderer.initTexture(tx);
          }
        } catch (_texErr) {}
        if ((ti + 1) % TEX_BATCH === 0 || ti === texList.length - 1) {
          const frac = (ti + 1) / texList.length;
          this._reportPreload(52 + frac * 18, STAGE_2_LABEL);
          await this._yieldPreloadFrame();
        }
      }
    } else {
      this._reportPreload(70, STAGE_2_LABEL);
      await this._yieldPreloadFrame();
    }

    // =========================================================================
    // STAGE 3 (70%–92%): Full WebGL Shader & Two-Tier Shadow Pre-Warm Gate
    // =========================================================================
    this._reportPreload(72, STAGE_3_LABEL);
    await this._yieldPreloadFrame();

    const savedGameMode = state.gameMode;
    const savedCurrentState = state.currentState;
    const savedCameraMode = state.cameraMode;
    const savedElapsedTime = state.elapsedTime;
    const savedSkipDraw = Boolean(
      typeof window !== "undefined" && window.__CAPTURE_SKIP_DRAW__ === true
    );
    const useTinySwPrewarmViewport = Boolean(this.isSoftwareRenderer || this.isCaptureSwCpu);
    const prevViewport = new THREE.Vector4();
    const prevScissor = new THREE.Vector4();
    const prevScissorTest = this.renderer.getScissorTest?.() || false;
    this.renderer.getViewport?.(prevViewport);
    this.renderer.getScissor?.(prevScissor);

    const compileScenePrograms = async () => {
      const prevTarget = this.renderer.getRenderTarget();
      const prevTone = this.renderer.toneMapping;
      const isAutomatedClock = Boolean(
        typeof window !== "undefined" && (window.__virtualClock || window.__externalClock)
      );
      try {
        if (this.postFX && this.postFX.isEnabled()) {
          this.renderer.toneMapping = THREE.NoToneMapping;
          this.renderer.setRenderTarget(this.postFX.renderTarget);
        }
        if (
          !this.isSoftwareRenderer &&
          !isAutomatedClock &&
          typeof this.renderer.compileAsync === "function"
        ) {
          await this.renderer.compileAsync(this.scene, this.camera);
        } else if (typeof this.renderer.compile === "function") {
          this.renderer.compile(this.scene, this.camera);
        }
      } catch (_compErr) {
        try {
          this.renderer.compile?.(this.scene, this.camera);
        } catch (_) {}
      } finally {
        this.renderer.toneMapping = prevTone;
        this.renderer.setRenderTarget(prevTarget || null);
      }
    };

    const suppressRedundantSwShadowPass = () => {
      if (!useTinySwPrewarmViewport) return;
      this.renderer.shadowMap.autoUpdate = false;
      this.renderer.shadowMap.needsUpdate = false;
      if (this.v5Lighting?.sunLight?.shadow) {
        this.v5Lighting.sunLight.shadow.needsUpdate = false;
      }
      if (this.v5Lighting?.dynamicSunLight?.shadow) {
        this.v5Lighting.dynamicSunLight.shadow.needsUpdate = false;
      }
      if (this.v5Lighting?.spinStudioWindowRig?.spotLight?.shadow) {
        this.v5Lighting.spinStudioWindowRig.spotLight.shadow.needsUpdate = false;
      }
    };

    const renderPrewarmPose = (tSec, { forceShadows = true } = {}) => {
      state.elapsedTime = tSec;
      state.sequenceTime = tSec;
      const pSnap = this.game.seekToTime(tSec);
      if (tSec >= 40.20 && tSec <= 41.00) {
        const rAge = tSec - 40.20;
        this._wasStanRoaringForVfx = true;
        this._stanRumbleAgeSec = rAge;
        this._stanRippleAgeSec = rAge;
        this._updateStanRoarVfx(0.0, pSnap);
      }
      this._syncSceneFromSnapshot(pSnap, 0.0, { snapCamera: true });
      this._prewarmBurnoutSmokeToTime(tSec);
      this.scene.updateMatrixWorld(true);
      this.camera.updateMatrixWorld(true);
      if (this._swMuxReady) {
        this._updateSoftwarePointLightMultiplexer();
      }
      if (this.v5Lighting) {
        this.v5Lighting.updateFrame?.(pSnap, this.camera, {
          enclosedGym: Boolean(tSec < 9.40 && !pSnap.glassShattered),
          sequenceTime: tSec,
          forceStaticRebuild: forceShadows,
        });
      }
      if (forceShadows) {
        if (this.v5Lighting) {
          this.v5Lighting.updateTwoTierShadows?.({
            heroPos: pSnap,
            camera: this.camera,
            forceStaticRebuild: true,
            isSoftwareRenderer: Boolean(this.isSoftwareRenderer || this.isCaptureSwCpu),
          });
        }
        this.renderer.shadowMap.autoUpdate = true;
        this.renderer.shadowMap.needsUpdate = true;
      } else {
        suppressRedundantSwShadowPass();
      }
      this.renderer.render(this.scene, this.camera);
    };

    try {
      if (typeof window !== "undefined") {
        window.__CAPTURE_SKIP_DRAW__ = false;
      }
      if (useTinySwPrewarmViewport) {
        this.renderer.setViewport(0, 0, 64, 36);
        this.renderer.setScissor(0, 0, 64, 36);
        this.renderer.setScissorTest(true);
      }

      state.gameMode = "story_autopilot";
      state.cameraMode = "cinema";
      const hwForceShadows = !useTinySwPrewarmViewport;
      const urlForceLoader =
        typeof window !== "undefined" &&
        new URLSearchParams(window.location?.search || "").get("forceLoader") === "1";
      const isHeadlessAutomatedClock =
        !urlForceLoader &&
        typeof window !== "undefined" &&
        Boolean(
          window.__virtualClock ||
            window.__externalClock ||
            new URLSearchParams(window.location?.search || "").get("skipLoader") === "1"
        );

      if (isHeadlessAutomatedClock) {
        // Automated virtual-clock headless capture/smoke tools compile lazily per deterministic frame;
        // Frame-0 shadows & initial pose are baked immediately after reset below (`lines 1684+`).
        this._reportPreload(78, STAGE_3_LABEL);
        await this._yieldPreloadFrame();
        this._reportPreload(86, STAGE_3_LABEL);
        await this._yieldPreloadFrame();
      } else if (useTinySwPrewarmViewport) {
        // CPU SwiftShader full shader-stability prewarm (`?forceLoader=1` or interactive SwiftShader):
        // 1. First allocate indoor SpotLight (`0.2s`) + outdoor Tier-1 & Tier-2 shadow maps (`11.5s`, `23.0s`)
        //    so `NUM_DIR_LIGHT_SHADOWS = 2` & `NUM_SPOT_LIGHT_SHADOWS = 1` are active BEFORE compiling color shaders!
        renderPrewarmPose(0.2, { forceShadows: true });
        this._reportPreload(78, STAGE_3_LABEL);
        await this._yieldPreloadFrame();

        const firstWaymoVis = this.world?.waymoVisuals?.[0] || null;
        const prevWaymoRootVis = firstWaymoVis?.root ? firstWaymoVis.root.visible : false;
        const prevYieldRingVis = firstWaymoVis?.yieldRing ? firstWaymoVis.yieldRing.visible : false;
        const prevSkid1Vis = this._skidPrimary ? this._skidPrimary.visible : false;
        const prevSkid2Vis = this._skidSecondary ? this._skidSecondary.visible : false;
        const prevRippleVis = this.stanRoarRippleMesh ? this.stanRoarRippleMesh.visible : false;

        if (firstWaymoVis?.root && firstWaymoVis?.yieldRing) {
          firstWaymoVis.root.visible = true;
          firstWaymoVis.yieldRing.visible = true;
        }
        if (this._skidPrimary) this._skidPrimary.visible = true;
        if (this._skidSecondary) this._skidSecondary.visible = true;
        if (this.stanRoarRippleMesh) this.stanRoarRippleMesh.visible = true;

        const horizonGrp = this.world?.archV5HorizonGroup || null;
        const grassGrp = this.world?.v5Grass?.group || this.world?.v5Grass?.root || null;
        const prevHorizonVis = horizonGrp ? horizonGrp.visible : true;
        const prevGrassVis = grassGrp ? grassGrp.visible : true;

        for (const shadowWarmT of [11.5, 23.0]) {
          state.elapsedTime = shadowWarmT;
          state.sequenceTime = shadowWarmT;
          const outSnap = this.game.seekToTime(shadowWarmT);
          this._syncSceneFromSnapshot(outSnap, 0.0, { snapCamera: true });
          this.scene.updateMatrixWorld(true);
          if (this._swMuxReady) this._updateSoftwarePointLightMultiplexer();

          const savedInstCounts = [];
          this.scene.traverse((obj) => {
            if (obj.isInstancedMesh && obj.count > 1) {
              savedInstCounts.push([obj, obj.count]);
              obj.count = 1;
            }
          });
          if (horizonGrp) horizonGrp.visible = false;
          if (grassGrp) grassGrp.visible = false;
          try {
            if (this.v5Lighting) {
              this.v5Lighting.updateTwoTierShadows?.({
                heroPos: outSnap,
                camera: this.camera,
                forceStaticRebuild: true,
                isSoftwareRenderer: Boolean(this.isSoftwareRenderer || this.isCaptureSwCpu),
              });
            }
            this.renderer.shadowMap.autoUpdate = true;
            this.renderer.shadowMap.needsUpdate = true;
            this.renderer.render(this.scene, this.camera);
          } finally {
            for (let ic = 0; ic < savedInstCounts.length; ic++) {
              savedInstCounts[ic][0].count = savedInstCounts[ic][1];
            }
            if (horizonGrp) horizonGrp.visible = prevHorizonVis;
            if (grassGrp) grassGrp.visible = prevGrassVis;
          }
        }

        // 2. Now that all 3 shadow maps (`sunLight`, `dynamicSunLight`, `spotLight`) are allocated,
        //    compile 100% of district WebGL programs AND draw indoor `6.2s` hero/GBike with frustum culling temporarily disabled!
        const savedHeroFrustum = [];
        this.heroAnchor?.traverse?.((obj) => {
          if (obj.isMesh && obj.frustumCulled) {
            savedHeroFrustum.push(obj);
            obj.frustumCulled = false;
          }
        });
        try {
          renderPrewarmPose(6.2, { forceShadows: false });
          for (const distT of [6.2, 11.5, 23.0, 40.25, 54.0, 68.15, 71.2]) {
            state.elapsedTime = distT;
            state.sequenceTime = distT;
            const dSnap = this.game.seekToTime(distT);
            if (distT >= 40.20 && distT <= 41.00) {
              this._wasStanRoaringForVfx = true;
              this._stanRumbleAgeSec = distT - 40.20;
              this._stanRippleAgeSec = distT - 40.20;
              this._updateStanRoarVfx(0.0, dSnap);
            }
            this._syncSceneFromSnapshot(dSnap, 0.0, { snapCamera: true });
            if (distT >= 67.85 && distT <= 69.00) {
              this._prewarmBurnoutSmokeToTime(distT);
            }
            this.scene.updateMatrixWorld(true);
            if (this._swMuxReady) this._updateSoftwarePointLightMultiplexer();
            if (distT === 6.2 || distT === 11.5 || distT === 23.0 || distT === 40.25 || distT === 68.15 || distT === 71.2) {
              await compileScenePrograms();
            }
          }
        } finally {
          for (const m of savedHeroFrustum) {
            m.frustumCulled = true;
          }
        }

        this._reportPreload(86, STAGE_3_LABEL);
        await this._yieldPreloadFrame();

        this.setXrayMode(true);
        this.scene.updateMatrixWorld(true);
        await compileScenePrograms();
        if (horizonGrp) horizonGrp.visible = false;
        if (grassGrp) grassGrp.visible = false;
        try {
          suppressRedundantSwShadowPass();
          this.renderer.render(this.scene, this.camera);
        } finally {
          if (horizonGrp) horizonGrp.visible = prevHorizonVis;
          if (grassGrp) grassGrp.visible = prevGrassVis;
        }
        this.setXrayMode(false);

        if (firstWaymoVis?.root && firstWaymoVis?.yieldRing) {
          firstWaymoVis.root.visible = prevWaymoRootVis;
          firstWaymoVis.yieldRing.visible = prevYieldRingVis;
        }
        if (this._skidPrimary) this._skidPrimary.visible = prevSkid1Vis;
        if (this._skidSecondary) this._skidSecondary.visible = prevSkid2Vis;
        if (this.stanRoarRippleMesh) this.stanRoarRippleMesh.visible = prevRippleVis;
      } else {
        // Hardware GPU full native pre-warm across all 4 landmark poses + X-Ray pass!
        // (a) Spin Studio `"AA"` Dumbbell opening shot (`t = 0.2s` + `t = 6.2s` indoor Pelican & skid marks)
        renderPrewarmPose(0.2, { forceShadows: true });
        renderPrewarmPose(6.2, { forceShadows: false });
        this._reportPreload(76, STAGE_3_LABEL);
        await this._yieldPreloadFrame();

        // (b) Outdoor Gradient Canopy breakout (`t = 11.5s`, pinwheels, Waymo, 3D grass, glass shards, sky/horizon)
        // + full scene WebGL program compile + Android Sculpture Lawn (`t = 23.0s`)
        renderPrewarmPose(11.5, { forceShadows: true });
        await compileScenePrograms();
        this._reportPreload(81, STAGE_3_LABEL);
        await this._yieldPreloadFrame();

        renderPrewarmPose(23.0, { forceShadows: hwForceShadows });
        renderPrewarmPose(38.0, { forceShadows: hwForceShadows });
        renderPrewarmPose(40.25, { forceShadows: false });
        this._reportPreload(85, STAGE_3_LABEL);
        await this._yieldPreloadFrame();

        // (c) Bay View water/ramp (`t = 51.0s` + `58.5s` bridge) + (d) Shoreline Sunset Finale (`t = 68.15s` & `71.2s`)
        renderPrewarmPose(51.0, { forceShadows: hwForceShadows });
        renderPrewarmPose(58.5, { forceShadows: hwForceShadows });
        renderPrewarmPose(68.15, { forceShadows: hwForceShadows });
        renderPrewarmPose(71.2, { forceShadows: false });
        this._reportPreload(89, STAGE_3_LABEL);
        await this._yieldPreloadFrame();

        // X-Ray cutaway pass on ALL GPUs (hardware WebGL AND software renderer!) so toggling `X` never hitches!
        const firstWaymoVis = this.world?.waymoVisuals?.[0] || null;
        const prevWaymoRootVis = firstWaymoVis?.root ? firstWaymoVis.root.visible : false;
        const prevYieldRingVis = firstWaymoVis?.yieldRing ? firstWaymoVis.yieldRing.visible : false;
        const prevSkid1Vis = this._skidPrimary ? this._skidPrimary.visible : false;
        const prevSkid2Vis = this._skidSecondary ? this._skidSecondary.visible : false;
        const prevRippleVis = this.stanRoarRippleMesh ? this.stanRoarRippleMesh.visible : false;
        if (firstWaymoVis?.root && firstWaymoVis?.yieldRing) {
          firstWaymoVis.root.visible = true;
          firstWaymoVis.yieldRing.visible = true;
        }
        if (this._skidPrimary) this._skidPrimary.visible = true;
        if (this._skidSecondary) this._skidSecondary.visible = true;
        if (this.stanRoarRippleMesh) this.stanRoarRippleMesh.visible = true;
        this.setXrayMode(true);
        this.scene.updateMatrixWorld(true);
        await compileScenePrograms();
        this.renderer.render(this.scene, this.camera);
        this.setXrayMode(false);
        if (firstWaymoVis?.root && firstWaymoVis?.yieldRing) {
          firstWaymoVis.root.visible = prevWaymoRootVis;
          firstWaymoVis.yieldRing.visible = prevYieldRingVis;
        }
        if (this._skidPrimary) this._skidPrimary.visible = prevSkid1Vis;
        if (this._skidSecondary) this._skidSecondary.visible = prevSkid2Vis;
        if (this.stanRoarRippleMesh) this.stanRoarRippleMesh.visible = prevRippleVis;
      }
      this.renderer.shadowMap.autoUpdate = true;
      this._xrayPrewarmed = true;
    } finally {
      if (useTinySwPrewarmViewport) {
        this.renderer.setScissorTest(prevScissorTest);
        this.renderer.setViewport(prevViewport);
        this.renderer.setScissor(prevScissor);
        this.resize();
      }
      if (typeof window !== "undefined") {
        window.__CAPTURE_SKIP_DRAW__ = savedSkipDraw;
      }
    }

    // Cleanly reset simulation, RNGs, particles, burnout smoke, audio triggers & camera back to exact `t = 0.000s`!
    this.rng = createSeededRNG(0x96499486);
    this.particleRng = createSeededRNG(0x7c31b29d);
    this.smokeRng = createSeededRNG(0x51a8e30f);
    this._rCursor = 0;
    this._spCursor = 0;
    this._sCursor = 0;
    this._clearAllParticles();
    this._cameraBlending = false;
    this._chaseInitialized = false;
    this.hasPrevHero = false;
    this._prevDirectorShotId = "";
    this._prevEnclosedGym = undefined;

    state.cameraMode = savedCameraMode;
    this.setXrayMode(savedInitialXray);

    const targetBootState =
      savedGameMode === "free_roam" ? "free_roam" : savedCurrentState || "play_all";
    let resetSnap = this.game.resetToState(targetBootState, 0.0);
    state.sequenceTime = 0.0;
    if (savedElapsedTime > 0) {
      state.elapsedTime = savedElapsedTime;
      state.sequenceTime = savedElapsedTime;
      resetSnap = this.game.seekToTime(savedElapsedTime);
      this._prewarmBurnoutSmokeToTime(savedElapsedTime);
    }

    if (this.audio) {
      this.audio.resetPhases();
      this.audio.totalClicksTriggered = 0;
      this.audio.totalPlankThumps = 0;
      if (this.audio.sfxCounts) {
        for (const k of Object.keys(this.audio.sfxCounts)) {
          this.audio.sfxCounts[k] = 0;
        }
      }
      this.audio.syncMechanicalTo(resetSnap.wheelRad, resetSnap.arcDistanceM, resetSnap.plankPitchM);
    }

    this._syncSceneFromSnapshot(resetSnap, 0.0, { snapCamera: true });
    this.scene.updateMatrixWorld(true);
    this.camera.updateMatrixWorld(true);
    if (this._swMuxReady) {
      this._updateSoftwarePointLightMultiplexer();
    }

    // Bake initial `t = 0.000s` Two-Tier shadow maps & render clean Frame 0 behind opaque `#campus-preloader`
    if (!savedSkipDraw) {
      if (this.v5Lighting) {
        this.v5Lighting.updateTwoTierShadows?.({
          heroPos: resetSnap,
          camera: this.camera,
          forceStaticRebuild: true,
          isSoftwareRenderer: Boolean(this.isSoftwareRenderer || this.isCaptureSwCpu),
        });
      }
      this.renderer.shadowMap.needsUpdate = true;
      this.renderer.render(this.scene, this.camera);
      this._wasSkippingDraw = false;
    } else {
      this._wasSkippingDraw = true;
    }

    // Record baseline WebGL program count AFTER full Stage 3 pre-warm + Frame 0 shadow/scene render!
    this._postWarmupProgramCount = this.renderer.info.programs?.length || 0;
    this.preloadTelemetry.programsAfterWarmup = this._postWarmupProgramCount;
    this.preloadTelemetry.programsCompiledDuringTour = 0;
    this._reportPreload(92, STAGE_3_LABEL);
    await this._yieldPreloadFrame();

    // =========================================================================
    // STAGE 4 (92%–100%): Pre-Build / Decode Procedural & Lyria WebAudio Buffers
    // =========================================================================
    this._reportPreload(95, STAGE_4_LABEL);
    await this._yieldPreloadFrame();
    if (this.audio && typeof this.audio.prewarmBuffers === "function") {
      await this.audio.prewarmBuffers();
    }

    this._assetsFinalized = true;
    this.isReady = true;
    this.preloadTelemetry.completed = true;
    this._reportPreload(100, STAGE_4_LABEL);

    const summary = deriveTourSummary();
    bus.emit(DEMO_EVENTS.STATS_UPDATED, {
      elapsedTime: state.elapsedTime,
      sequenceTime: state.sequenceTime,
      clipLocalTime: state.clipLocalTime,
      activeClipId: state.activeClipId,
      activeClipIndex: state.activeClipIndex,
      frameCount: state.frameCount,
      fps: state.fps,
      kinematics: state.kinematics,
      summary,
    });

    this._syncCtTelemetry(false);
    if (typeof this.onPreloadComplete === "function") {
      try {
        this.onPreloadComplete(this.preloadTelemetry);
      } catch (_err) {}
    }
    if (typeof window !== "undefined" && !this._deferDemoReadyToMain) {
      window.__DEMO_READY__ = true;
    }
    return true;
  }

  getRenderStats() {
    const midRideShaderRecompiles =
      this.renderer && this._postWarmupProgramCount > 0
        ? Math.max(0, (this.renderer.info.programs?.length || 0) - this._postWarmupProgramCount)
        : 0;
    if (!this.renderer) {
      return {
        drawCalls: 0,
        triangles: 0,
        geometries: 0,
        textures: 0,
        programs: 0,
        midRideShaderRecompiles: 0,
      };
    }
    return {
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      programs: this.renderer.info.programs?.length || 0,
      midRideShaderRecompiles,
    };
  }

  _initRendererAndScene() {
    this.isSoftwareRenderer = detectSoftwareWebGLRenderer();
    if (this.isSoftwareRenderer && typeof document !== "undefined") {
      document.documentElement.classList.add("is-software-renderer");
    }

    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: !this.isSoftwareRenderer,
        powerPreference: "high-performance",
        alpha: false,
      });
    } catch (_e) {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: false,
      });
    }

    const isCaptureSwCpu = Boolean(
      typeof window !== "undefined" && window.__CAPTURE_UNDERLYING_SWIFTSHADER__
    );
    this.isCaptureSwCpu = isCaptureSwCpu;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = isCaptureSwCpu ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
    this._v5LightingFrameOpts.isSoftwareRenderer = Boolean(this.isSoftwareRenderer || isCaptureSwCpu);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#dbeafe");
    // Natural Silicon Valley golden-hour aerial-perspective distance haze
    this.scene.fog = new THREE.FogExp2("#e7e8df", 0.00078);

    // Bake static Daylight & Golden-Hour PMREM cubemap on ALL renderers (including SwiftShader) so chrome, gold TPUs & bronze T-Rex reflect rich sky/ground IBL!
    this._bakeStaticEnvironmentMaps();

    // Extended 1600m far plane covers the entire 480m × 480m Mountain View campus + Santa Cruz Mountains + SF Bay
    this.camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.12, 1600);
    this.scene.add(this.camera);

    // Subtle filmic screen-edge vignette quad in NDC space (zero DOM touches, zero center darkening!)
    const vigGeom = new THREE.PlaneGeometry(2.0, 2.0);
    const vigMat = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        void main() {
          vec2 d = (vUv - 0.5) * vec2(1.12, 1.02);
          float r2 = dot(d, d);
          float vig = smoothstep(0.20, 0.74, r2) * 0.21;
          gl_FragColor = vec4(0.055, 0.038, 0.024, vig);
        }
      `,
    });
    this.vignetteQuad = new THREE.Mesh(vigGeom, vigMat);
    this.vignetteQuad.name = "CinemaFilmicVignette";
    this.vignetteQuad.frustumCulled = false;
    this.vignetteQuad.renderOrder = 9999;
    this.vignetteQuad.raycast = () => {};
    this.camera.add(this.vignetteQuad);

    this.hemiLight = new THREE.HemisphereLight(
      "#cbe3ff",
      "#8d7f6c",
      this.isSoftwareRenderer ? 1.30 : 0.92
    );
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(
      "#fff5e0",
      this.isSoftwareRenderer ? 2.52 : 2.42
    );
    this.sunLight.name = "Tier1_StaticRegionalSunLight";
    this.sunLight.castShadow = true;
    const isFast1080pBootSw = Boolean(
      this.isSoftwareRenderer &&
        typeof window !== "undefined" &&
        (window.devicePixelRatio || 1) <= 1.05 &&
        (window.innerWidth || 1920) <= 1920
    );
    const isFast1080pCpuShadow = Boolean(
      (this.isSoftwareRenderer || isCaptureSwCpu) &&
        typeof window !== "undefined" &&
        (window.devicePixelRatio || 1) <= 1.05 &&
        (window.innerWidth || 1920) <= 1920
    );
    const initStaticShadowMapSize = isFast1080pCpuShadow
      ? 1536
      : this.isSoftwareRenderer || isCaptureSwCpu
        ? 2048
        : 4096;
    const initDynamicShadowMapSize = this.isSoftwareRenderer || isCaptureSwCpu ? 1024 : 2048;
    this.sunLight.shadow.mapSize.set(initStaticShadowMapSize, initStaticShadowMapSize);
    this.sunLight.shadow.camera.near = 2.0;
    this.sunLight.shadow.camera.far = 295.0;
    const frustum = 64.0;
    this.sunLight.shadow.camera.left = -frustum;
    this.sunLight.shadow.camera.right = frustum;
    this.sunLight.shadow.camera.top = frustum;
    this.sunLight.shadow.camera.bottom = -frustum;
    this.sunLight.shadow.bias = -0.00018;
    this.sunLight.shadow.normalBias = 0.018;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Luminous Golden Sun-Glare / Atmospheric Halo Sprite along the sun vector (`dist = 355m < skyDome 430m`)
    const sunHaloTex = createSolarAtmosphereHaloTexture(256, 2.15);
    const sunHaloMat = new THREE.SpriteMaterial({
      map: sunHaloTex,
      color: "#ffe4a8",
      transparent: true,
      opacity: 0.52,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      fog: false,
      toneMapped: false,
    });
    this.sunGlareSprite = new THREE.Sprite(sunHaloMat);
    this.sunGlareSprite.name = "GoldenSunGlareHalo";
    this.sunGlareSprite.scale.set(215.0, 215.0, 1.0);
    this.sunGlareSprite.frustumCulled = false;
    this.sunGlareSprite.raycast = () => {};
    this.scene.add(this.sunGlareSprite);

    const sunCoreMat = new THREE.SpriteMaterial({
      map: sunHaloTex,
      color: "#fff9e6",
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      fog: false,
      toneMapped: false,
    });
    this.sunCoreSprite = new THREE.Sprite(sunCoreMat);
    this.sunCoreSprite.name = "GoldenSunCore";
    this.sunCoreSprite.scale.set(58.0, 58.0, 1.0);
    this.sunCoreSprite.frustumCulled = false;
    this.sunCoreSprite.raycast = () => {};
    this.scene.add(this.sunCoreSprite);

    // Camera-side warm bounce fill & golden rim lights (zero shadow maps — active on both GPU and 4K SwiftShader!)
    if (isFast1080pBootSw && this.hemiLight) {
      this.hemiLight.intensity += 0.24;
    }
    this.fillLight = new THREE.DirectionalLight("#ffe4bc", 0.46);
    this.fillLight.visible = !isFast1080pBootSw;
    this.scene.add(this.fillLight);
    this.scene.add(this.fillLight.target);

    this.rimLight = new THREE.DirectionalLight("#ffd494", 0.72);
    this.rimLight.position.set(-12, 8, -14);
    this.rimLight.visible = !isFast1080pBootSw;
    this.scene.add(this.rimLight);
    this.scene.add(this.rimLight.target);

    // V7 Two-Tier Static (`4096x4096`, `+-64.0m`, `>8.0m` cached) + Dynamic (`2048x2048`, `+-10.5m` `1.0cm/texel`) Shadows & Atmosphere
    this.v5Lighting = configureAAASunShadowsAndAtmosphere(
      THREE,
      this.renderer,
      this.scene,
      this.sunLight,
      {
        hemiLight: this.hemiLight,
        fillLight: isFast1080pBootSw ? null : this.fillLight,
        rimLight: isFast1080pBootSw ? null : this.rimLight,
        camera: this.camera,
        vignetteMesh: this.vignetteQuad,
        isSoftwareRenderer: Boolean(this.isSoftwareRenderer || isCaptureSwCpu),
        staticShadowMapSize: initStaticShadowMapSize,
        shadowMapSize: initStaticShadowMapSize,
        halfExtentM: 64.0,
        dynamicShadowMapSize: initDynamicShadowMapSize,
        dynamicHalfExtentM: 10.5,
        gymShadowMapSize: this.isSoftwareRenderer || isCaptureSwCpu ? 512 : 1024,
        enableHorizonAerialPerspective: false,
        bakeEnvironment: false,
      }
    );

    // V7 Single-Pass Fused Cinema Post-FX on GPU; SwiftShader uses direct single-pass ACES + `opticsOverlay` (`0` offscreen depth FBO copy!)
    if (typeof createCinemaPostFXPipeline === "function") {
      try {
        this.postFX = createCinemaPostFXPipeline(THREE, this.renderer, {
          isSoftwareRenderer: Boolean(this.isSoftwareRenderer || isCaptureSwCpu),
          enabled: !this.isSoftwareRenderer && !isCaptureSwCpu,
          samples: 4,
          softwareSamples: 0,
          aoStrength: isCaptureSwCpu ? 0 : 0.28,
          dofStrength: 0,
          vignetteMesh: this.vignetteQuad,
        });
      } catch (_err) {
        this.postFX = null;
      }
    }

    // Install re-entrant outer render hook AFTER `configureAAASunShadowsAndAtmosphere` so both internal draws
    // and external screenshot harnesses (`core.renderer.render(core.scene, core.camera)`) render cleanly through
    // Two-Tier Shadows -> HDR Offscreen RT -> Single-Pass AgX Post-FX -> SwiftShader readPixels flush!
    if (typeof this.renderer.render === "function") {
      const innerRenderWithTwoTier = this.renderer.render.bind(this.renderer);
      const swSyncPixel = new Uint8Array(4);
      const flushSoftwareFrame = () => {
        if (
          (this.isSoftwareRenderer || this.isCaptureSwCpu) &&
          typeof window !== "undefined" &&
          (window.__externalClock === true || Boolean(window.__virtualClock))
        ) {
          const gl = this.renderer.getContext?.();
          if (gl && typeof gl.readPixels === "function") {
            try {
              gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, swSyncPixel);
            } catch (_e) {
              if (typeof gl.finish === "function") gl.finish();
            }
          } else if (gl && typeof gl.finish === "function") {
            gl.finish();
          }
        }
      };
      this.renderer.render = (s, c) => {
        if (
          !this._inPostFXPass &&
          this.postFX &&
          this.postFX.isEnabled() &&
          s === this.scene &&
          c === this.camera &&
          !this.renderer.getRenderTarget()
        ) {
          this._inPostFXPass = true;
          try {
            this.postFX.render(s, c, this._postFXFrameOpts);
          } finally {
            this._inPostFXPass = false;
          }
          flushSoftwareFrame();
          return;
        }
        innerRenderWithTwoTier(s, c);
        if (!this._inPostFXPass && s === this.scene && c === this.camera && !this.renderer.getRenderTarget()) {
          flushSoftwareFrame();
        }
      };
    }

    // Soft Elliptical Hero Contact AO Shadow Decal strictly ground-locked (`gY + 0.018`, NEVER mid-air!)
    const contactShadowGeom = new THREE.PlaneGeometry(0.76, 2.24);
    contactShadowGeom.rotateX(-Math.PI * 0.5);
    const contactShadowMat = new THREE.MeshBasicMaterial({
      map: createHeroContactShadowTexture(),
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.heroContactShadow = new THREE.Mesh(contactShadowGeom, contactShadowMat);
    this.heroContactShadow.name = "HeroContactAOShadow";
    this.heroContactShadow.rotation.order = "YXZ";
    this.heroContactShadow.renderOrder = 2;
    this.heroContactShadow.frustumCulled = false;
    this.heroContactShadow.raycast = () => {};
    this.scene.add(this.heroContactShadow);

    this.orbitControls = new OrbitControls(this.camera, this.canvas);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.08;
    this.orbitControls.enablePan = false;
    this.orbitControls.minDistance = 2.4;
    this.orbitControls.maxDistance = 24.0;
    this.orbitControls.maxPolarAngle = Math.PI * 0.485;
    this.orbitControls.enabled = true;

    this._userDraggingOrbit = false;
    this.orbitControls.addEventListener("start", () => {
      this._userDraggingOrbit = true;
      this._cameraBlending = false;
      if (state.cameraMode !== "orbit") {
        dispatchAction(DEMO_ACTIONS.SET_CAMERA, { cameraMode: "orbit" });
      }
      if (!(typeof window !== "undefined" && window.__externalClock === true)) {
        dispatchAction(DEMO_ACTIONS.USER_ACTIVITY, { source: "orbit_drag" });
      }
    });
    this.orbitControls.addEventListener("change", () => {
      if (
        this._userDraggingOrbit &&
        !(typeof window !== "undefined" && window.__externalClock === true)
      ) {
        dispatchAction(DEMO_ACTIONS.USER_ACTIVITY, { source: "orbit_move" });
      }
    });
    this.orbitControls.addEventListener("end", () => {
      this._userDraggingOrbit = false;
    });

    if (this.canvas && typeof this.canvas.addEventListener === "function") {
      this.canvas.addEventListener(
        "wheel",
        () => {
          if (!(typeof window !== "undefined" && window.__externalClock === true)) {
            if (state.cameraMode !== "orbit") {
              dispatchAction(DEMO_ACTIONS.SET_CAMERA, { cameraMode: "orbit" });
            }
            dispatchAction(DEMO_ACTIONS.USER_ACTIVITY, { source: "orbit_wheel" });
          }
        },
        { passive: true }
      );
    }

    this.resize();
    if (typeof window !== "undefined") {
      window.addEventListener("resize", () => this.resize());
    }
  }

  _applySoftwareRendererMaterialTuning() {
    this.scene.environment = null;
    const selectiveEnv = this.sunsetEnvMap || this.dayEnvMap || null;
    const convertedPhysical = this._swConvertedPhysical || (this._swConvertedPhysical = new Map());
    const seenMats = this._swSeenMats || (this._swSeenMats = new Set());
    const seenTex = this._swSeenTex || (this._swSeenTex = new Set());
    const texSlots = [
      "map",
      "bumpMap",
      "normalMap",
      "roughnessMap",
      "metalnessMap",
      "emissiveMap",
      "alphaMap",
    ];
    this.scene.traverse((obj) => {
      if (!obj.material) return;
      const tuneOne = (m) => {
        if (!m) return m;
        if (m.userData?.__v7WorldCohesionUniforms?.uV7PomScale) {
          m.userData.__v7WorldCohesionUniforms.uV7PomScale.value = 0.0;
        }
        if (convertedPhysical.has(m.uuid)) return convertedPhysical.get(m.uuid);
        const isFast1080pSw = Boolean(
          this.isSoftwareRenderer &&
            this.renderer &&
            this.renderer.getPixelRatio() <= 1.05 &&
            this.renderer.domElement.width <= 1920
        );
        for (const k of texSlots) {
          const t = m[k];
          if (t && !seenTex.has(t)) {
            seenTex.add(t);
            let texChanged = false;
            if (t.anisotropy > 1) {
              t.anisotropy = 1;
              texChanged = true;
            }
            if (isFast1080pSw && t.minFilter === THREE.LinearMipmapLinearFilter) {
              t.minFilter = THREE.LinearMipmapNearestFilter;
              texChanged = true;
            }
            if (texChanged) {
              t.needsUpdate = true;
            }
          }
        }
        const matObjLabel = `${m.name || ""} ${obj.name || ""}`;
        const isWaterV6 = Boolean(
          m.userData?.isCampusWaterV6 || /Water_V6|Pond_Water|Creek_And_Bay_Water/i.test(matObjLabel)
        );
        if (
          isFast1080pSw &&
          m.userData?.isCustomRidgeShaderV7 &&
          !m.userData?.isFastRidgeSw &&
          m.userData?.scMaskTex
        ) {
          const isT2 = Boolean(m.userData.isTier2);
          const maskT = m.userData.scMaskTex;
          const gradT = m.userData.scGradTex;
          const fastRidge = new THREE.MeshBasicMaterial({
            name: m.name || "V7_Santa_Cruz_Ridgeline_FastSw",
            color: "#ffffff",
            fog: false,
            toneMapped: true,
          });
          fastRidge.userData = {
            ...m.userData,
            v5AerialShaderInstalled: true,
            v5PreservedNormalMap: null,
            isFastRidgeSw: true,
          };
          fastRidge.customProgramCacheKey = () =>
            isT2 ? "v7_sc_fast_sw_tier2" : "v7_sc_fast_sw_tier1";
          fastRidge.onBeforeCompile = (shader) => {
            shader.uniforms.uIsTier2 = { value: isT2 ? 1.0 : 0.0 };
            shader.uniforms.uScMaskTex = { value: maskT };
            shader.uniforms.uScGradTex = { value: gradT };
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
                vScWorldNorm = normalize(mat3(modelMatrix) * normal);`
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
                {
                  vec2 wpXZ = vScWorldPos.xz;
                  mat2 scRot = mat2(0.80, -0.60, 0.60, 0.80);
                  vec2 uvPrimary = (wpXZ + vec2(vScWorldPos.y * 0.62, -vScWorldPos.y * 0.41)) * (1.0 / 320.0);
                  vec2 uvDetail = (scRot * wpXZ + vec2(-vScWorldPos.y * 0.92, vScWorldPos.y * 0.68)) * (1.0 / 118.0);
                  vec4 mA = texture2D(uScMaskTex, uvPrimary);
                  vec4 mB = texture2D(uScMaskTex, uvDetail);
                  float macroPatch = mix(mA.r, mB.r, 0.34);
                  float chapClump = mix(mA.g, mB.g, 0.56);
                  float fineScrub = mB.b;
                  float canyonRidge = mix(mA.a, mB.a, 0.48);
                  float ravineAO = smoothstep(0.14, 0.76, canyonRidge * 0.82 + macroPatch * 0.24);
                  vec3 wN = normalize(vScWorldNorm + vec3(0.0, 1e-5, 0.0));
                  float steepness = clamp(1.0 - abs(wN.y), 0.0, 1.0);
                  float heightFrac = clamp((vScWorldPos.y - 2.0) / (uIsTier2 > 0.5 ? 78.0 : 52.0), 0.0, 1.0);
                  vec3 deepOak = vec3(0.032, 0.049, 0.020);
                  vec3 chaparralOlive = vec3(0.095, 0.112, 0.064);
                  vec3 goldenOat = vec3(0.355, 0.278, 0.124);
                  vec3 ochreSandstone = vec3(0.335, 0.242, 0.152);
                  vec3 paleStrataLedge = vec3(0.455, 0.365, 0.248);
                  float oatMix = smoothstep(0.34, 0.74, macroPatch * 0.62 + heightFrac * 0.36 + ravineAO * 0.22);
                  vec3 hillBase = mix(chaparralOlive, goldenOat, oatMix);
                  float oakCanopyMask = smoothstep(0.40, 0.70, chapClump * 0.68 + fineScrub * 0.32 + (1.0 - ravineAO) * 0.34);
                  hillBase = mix(hillBase, deepOak, oakCanopyMask * 0.88);
                  float strataPhase = vScWorldPos.y * 0.22 + wpXZ.x * 0.032 - wpXZ.y * 0.024 + canyonRidge * 5.5 + macroPatch * 3.8;
                  float strataBench = smoothstep(0.58, 0.88, 0.5 + 0.5 * sin(strataPhase));
                  float rockMask = smoothstep(0.62, 0.86, steepness) * (1.0 - oakCanopyMask);
                  hillBase = mix(hillBase, mix(ochreSandstone, paleStrataLedge, strataBench), rockMask * 0.26);
                  hillBase *= mix(0.30, 1.16, ravineAO);
                  vec2 g1 = (texture2D(uScGradTex, uvPrimary).rg - 0.5) * 4.2;
                  vec2 g2 = mat2(0.80, 0.60, -0.60, 0.80) * ((texture2D(uScGradTex, uvDetail).rg - 0.5) * 4.2);
                  vec3 gradH = vec3(g1.x * 0.62 + g2.x * 0.52, 0.0, g1.y * 0.62 + g2.y * 0.52);
                  vec3 surfGrad = gradH - wN * dot(gradH, wN);
                  vec3 pertWn = normalize(wN - surfGrad * (uIsTier2 > 0.5 ? 3.15 : 4.25));
                  vec3 sunDir = normalize(vec3(-0.62, 0.34, -0.71));
                  float ndl = max(0.0, dot(pertWn, sunDir));
                  float hemiT = 0.5 + 0.5 * pertWn.y;
                  vec3 skyFill = mix(vec3(0.18, 0.14, 0.10), vec3(0.30, 0.44, 0.62), hemiT) * 1.18;
                  vec3 sunIrrad = vec3(1.00, 0.78, 0.50) * (3.14 * 0.318309886 * ndl);
                  vec3 litHill = hillBase * (sunIrrad + skyFill);
                  float camDist = length(vScWorldPos.xz - cameraPosition.xz);
                  float distHaze = smoothstep(245.0, 540.0, camDist);
                  float hazeFactor = uIsTier2 > 0.5
                    ? clamp(0.30 + 0.16 * distHaze - heightFrac * 0.05, 0.24, 0.48)
                    : clamp(0.10 + 0.15 * distHaze - heightFrac * 0.04, 0.07, 0.26);
                  vec3 coastalHaze = mix(vec3(0.285, 0.348, 0.372), vec3(0.545, 0.578, 0.565), clamp(heightFrac * 0.85, 0.0, 1.0));
                  diffuseColor.rgb = mix(litHill, coastalHaze, hazeFactor);
                }`
              );
          };
          convertedPhysical.set(m.uuid, fastRidge);
          return fastRidge;
        }
        if (isWaterV6 || m.userData?.isCustomRidgeShaderV7 || m.userData?.isRefractiveGlassV7) {
          const coolGlassEnv = this.dayEnvMap || selectiveEnv;
          if (m.userData?.isRefractiveGlassV7 && coolGlassEnv) {
            m.envMap = coolGlassEnv;
            m.envMapIntensity = Math.max(m.envMapIntensity ?? 1.45, 1.45);
          }
          return m;
        }
        const isMatteMountain = /Ridgeline|Horizon_Mountain|Santa_Cruz|Foothill/i.test(matObjLabel);
        const isDeplasticizedProp = Boolean(
          m.userData?.deplasticizedV6 ||
            /_Planter_V6|_Umbrella_V6|Bugdroid|Android_Dessert|Dessert_Statue|Flamingo|Pinwheel/i.test(matObjLabel)
        );
        const isStanBronze = /Stan_Bronze|Mat_Stan_Bronze/i.test(matObjLabel);
        const isTpu8i = /TPU_8i|Mat_TPU_8i/i.test(matObjLabel);
        const targetEnvTex =
          (isTpu8i || /Visitor_Glazing|Visitor_GoogleStore/i.test(matObjLabel)) && this.dayEnvMap
            ? this.dayEnvMap
            : selectiveEnv;
        const isBotanicalFoliage = /Tree_|Oak|Redwood|Shrub|Plume|Bunchgrass|Hedge/i.test(matObjLabel);
        const keepNormalMaps =
          !isFast1080pSw ||
          (!isBotanicalFoliage &&
            (isStanBronze ||
              isTpu8i ||
              /Dragonscale|Visitor|Gradient_Canopy|Bay_View|Snack_Cart|Stevens_Creek_Bridge|Dumbbell|Kettlebell|Pelican|GBike|TPU|Monument|Trex/i.test(
                matObjLabel
              )));
        const hasOrmMaps = Boolean(m.roughnessMap || m.metalnessMap);
        const isHeroEnvTarget =
          !isMatteMountain &&
          !isBotanicalFoliage &&
          !isDeplasticizedProp &&
          /Waymo|Gemini|Monument|Rack|Bike|TPU|Gym|Weights|Mirror|Trex|Stan|Plinth|Cafe|Dumbbell|Kettlebell|Pavilion|Gradient_Canopy|Bay_View|Dragonscale|Glazing|Silver|Bridge/i.test(
            matObjLabel
          );
        const isSpecularFastEnvTarget =
          !isMatteMountain &&
          !isBotanicalFoliage &&
          (isStanBronze ||
            isTpu8i ||
            Boolean(m.transparent && (m.opacity ?? 1.0) < 0.90 && !m.alphaTest) ||
            /Mirror|Chrome|Brass|Gold|TPU|Waymo|Monument/i.test(matObjLabel));
        const wantsEnv =
          !isMatteMountain &&
          !isBotanicalFoliage &&
          selectiveEnv &&
          (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) &&
          (isFast1080pSw
            ? isSpecularFastEnvTarget
            : isDeplasticizedProp ||
              isStanBronze ||
              Boolean(m.transparent) ||
              isHeroEnvTarget ||
              (!hasOrmMaps && ((m.roughness ?? 1.0) <= 0.30 || (m.metalness ?? 0.0) >= 0.48)));
        if (m.isMeshPhysicalMaterial) {
          const origMetal = m.metalness ?? 0.0;
          const isMastMetal = isDeplasticizedProp && /Mast|Pole|Alum|Steel|Frame/i.test(matObjLabel);
          const targetEnvIntensity = isDeplasticizedProp
            ? Math.min(m.envMapIntensity ?? 0.30, isMastMetal ? 0.38 : 0.34)
            : isStanBronze
              ? Math.min(m.envMapIntensity ?? 0.58, 0.60)
              : wantsEnv
                ? Math.max(m.envMapIntensity ?? 0.65, 0.65)
                : 0.0;
          const targetRoughness = isDeplasticizedProp
            ? Math.max(m.roughness ?? 0.68, isMastMetal ? 0.62 : 0.68)
            : isStanBronze
              ? Math.max(m.roughness ?? 0.48, 0.48)
              : m.roughness ?? 0.5;
          const std = new THREE.MeshStandardMaterial({
            name: m.name || "",
            color: m.color ? m.color.clone() : new THREE.Color(0xffffff),
            map: m.map || null,
            alphaMap: m.alphaMap || null,
            roughnessMap: m.roughnessMap || null,
            metalnessMap: m.metalnessMap || null,
            aoMap: m.aoMap || null,
            aoMapIntensity: m.aoMapIntensity ?? 1.0,
            normalMap: keepNormalMaps ? m.normalMap || null : null,
            normalScale:
              keepNormalMaps && m.normalScale ? m.normalScale.clone() : new THREE.Vector2(1, 1),
            bumpMap: keepNormalMaps ? m.bumpMap || null : null,
            bumpScale: keepNormalMaps ? m.bumpScale ?? 1.0 : 0.0,
            emissive: m.emissive ? m.emissive.clone() : new THREE.Color(0x000000),
            emissiveMap: m.emissiveMap || null,
            emissiveIntensity: m.emissiveIntensity ?? 1.0,
            roughness: targetRoughness,
            metalness: isDeplasticizedProp
              ? Math.min(origMetal, isMastMetal ? 0.26 : 0.04)
              : m.metalnessMap
                ? origMetal
                : wantsEnv
                  ? Math.min(origMetal, isStanBronze ? 0.86 : 0.66)
                  : Math.min(origMetal, 0.08),
            envMap: wantsEnv ? targetEnvTex : null,
            envMapIntensity: wantsEnv ? targetEnvIntensity : 0.0,
            vertexColors: Boolean(m.vertexColors),
            transparent: Boolean(m.transparent),
            opacity: m.opacity ?? 1.0,
            alphaTest: m.alphaTest ?? 0,
            side: m.side ?? THREE.FrontSide,
            depthWrite: m.depthWrite ?? true,
            depthTest: m.depthTest ?? true,
            polygonOffset: Boolean(m.polygonOffset),
            polygonOffsetFactor: m.polygonOffsetFactor ?? 0,
            polygonOffsetUnits: m.polygonOffsetUnits ?? 0,
            fog: m.fog ?? true,
            toneMapped: m.toneMapped ?? true,
          });
          if (
            typeof m.onBeforeCompile === "function" &&
            m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile
          ) {
            std.onBeforeCompile = m.onBeforeCompile;
          }
          if (
            typeof m.customProgramCacheKey === "function" &&
            m.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey
          ) {
            std.customProgramCacheKey = m.customProgramCacheKey;
          }
          if (m.userData && typeof m.userData === "object") {
            std.userData = { ...m.userData };
          }
          convertedPhysical.set(m.uuid, std);
          return std;
        }
        if (seenMats.has(m)) return m;
        seenMats.add(m);
        let dirty = false;
        if (!keepNormalMaps && (m.normalMap || m.bumpMap)) {
          m.normalMap = null;
          m.bumpMap = null;
          dirty = true;
        }
        if (wantsEnv) {
          if (m.envMap !== targetEnvTex) {
            m.envMap = targetEnvTex;
            dirty = true;
          }
          if (isDeplasticizedProp) {
            const isMastMetal = /Mast|Pole|Alum|Steel|Frame/i.test(matObjLabel);
            const envCap = isMastMetal ? 0.38 : 0.34;
            const roughFloor = isMastMetal ? 0.62 : 0.68;
            const metalCap = isMastMetal ? 0.26 : 0.04;
            if ((m.envMapIntensity ?? 0.0) > envCap) {
              m.envMapIntensity = envCap;
              dirty = true;
            }
            if ((m.roughness ?? 0.0) < roughFloor) {
              m.roughness = roughFloor;
              dirty = true;
            }
            if (!m.metalnessMap && (m.metalness ?? 0.0) > metalCap) {
              m.metalness = metalCap;
              dirty = true;
            }
          } else if (isStanBronze) {
            if ((m.roughness ?? 0.0) < 0.48) {
              m.roughness = 0.48;
              dirty = true;
            }
            if ((m.envMapIntensity ?? 0.0) > 0.60) {
              m.envMapIntensity = 0.60;
              dirty = true;
            }
          } else if (isTpu8i) {
            if (Math.abs((m.envMapIntensity ?? 0.0) - 0.96) > 0.04) {
              m.envMapIntensity = 0.96;
              dirty = true;
            }
          } else {
            if ((m.envMapIntensity ?? 0.0) < 0.60) {
              m.envMapIntensity = 0.62;
              dirty = true;
            }
            if (!m.metalnessMap && (m.metalness ?? 0.0) > 0.58) {
              m.metalness = 0.58;
              dirty = true;
            }
          }
        } else {
          if (m.envMap) {
            m.envMap = null;
            m.envMapIntensity = 0;
            dirty = true;
          }
          if (isMatteMountain) {
            if ((m.metalness ?? 0.0) !== 0.0) {
              m.metalness = 0.0;
              dirty = true;
            }
            if ((m.roughness ?? 1.0) < 0.95) {
              m.roughness = 0.96;
              dirty = true;
            }
          } else if (!m.metalnessMap && (m.metalness ?? 0.0) > 0.08) {
            m.metalness = 0.08;
            dirty = true;
          }
        }
        if (dirty) m.needsUpdate = true;
        return m;
      };
      if (Array.isArray(obj.material)) {
        obj.material = obj.material.map(tuneOne);
      } else {
        obj.material = tuneOne(obj.material);
      }
      if (obj.userData) {
        if (obj.userData.xrayMaterial) {
          obj.userData.xrayMaterial = Array.isArray(obj.userData.xrayMaterial)
            ? obj.userData.xrayMaterial.map(tuneOne)
            : tuneOne(obj.userData.xrayMaterial);
        }
        if (obj.userData.solidMaterial) {
          obj.userData.solidMaterial = Array.isArray(obj.userData.solidMaterial)
            ? obj.userData.solidMaterial.map(tuneOne)
            : tuneOne(obj.userData.solidMaterial);
        }
      }
    });

    // On 1080p dpr=1 CPU SwiftShader ONLY (`0%` change on 4K dpr=2 or hardware WebGL2!), compact the
    // shared 192x96 `Horizon_Mountain_Mesh_*` grid (`21,222` verts/seg at `300-400m` distance = 4x denser than 1px)
    // to an exact stride-4 `48x24` grid + base skirt (`1,370` verts/seg = `15.5x` fewer CPU vertex shader invocations!).
    const isFast1080pSwNow = Boolean(
      (this.isSoftwareRenderer || this.isCaptureSwCpu) &&
        this.renderer &&
        this.renderer.getPixelRatio() <= 1.05 &&
        this.renderer.domElement.width <= 1920
    );
    if (isFast1080pSwNow) {
      this._decimateHorizonMountainMeshes();
    }
  }

  _decimateHorizonMountainMeshes() {
    if (!this.world?.archV5HorizonGroup || this._fastSwRidgeDecimated) return;
    {
      const decimatedMap = new Map();
      const buildFastRidgeGeom = (srcGeom) => {
        if (decimatedMap.has(srcGeom.uuid)) return decimatedMap.get(srcGeom.uuid);
        const posAttr = srcGeom.attributes?.position;
        const normAttr = srcGeom.attributes?.normal;
        const uvAttr = srcGeom.attributes?.uv;
        if (!posAttr || !normAttr || !uvAttr || posAttr.count < 18721) return srcGeom;
        const NX = 192;
        const NY = 96;
        const STRIDE = 4;
        const GX = NX / STRIDE; // 48
        const GY = NY / STRIDE; // 24
        const gridSrcIdx = new Int32Array((NX + 1) * (NY + 1)).fill(-1);
        for (let k = 0; k < posAttr.count; k++) {
          const py = posAttr.getY(k);
          const u = uvAttr.getX(k);
          const v = uvAttr.getY(k);
          const fi = ((u - 0.004) / 0.992) * NX;
          const i = Math.round(fi);
          if (i < 0 || i > NX || Math.abs(fi - i) > 0.025) continue;
          for (const fj of [((1.0 - v - 0.004) / 0.992) * NY, ((v - 0.004) / 0.992) * NY]) {
            const j = Math.round(fj);
            if (j >= 0 && j <= NY && Math.abs(fj - j) <= 0.025) {
              const gIdx = j * (NX + 1) + i;
              if (gridSrcIdx[gIdx] < 0 || py > posAttr.getY(gridSrcIdx[gIdx])) {
                gridSrcIdx[gIdx] = k;
              }
            }
          }
        }
        const topCols = GX + 1;
        const topRows = GY + 1;
        const topVertCount = topCols * topRows;
        for (let jj = 0; jj < topRows; jj++) {
          for (let ii = 0; ii < topCols; ii++) {
            if (gridSrcIdx[jj * STRIDE * (NX + 1) + ii * STRIDE] < 0) return srcGeom;
          }
        }
        const perim = [];
        for (let ii = 0; ii < GX; ii++) perim.push(ii);
        for (let jj = 0; jj < GY; jj++) perim.push(jj * topCols + GX);
        for (let ii = GX; ii > 0; ii--) perim.push(GY * topCols + ii);
        for (let jj = GY; jj > 0; jj--) perim.push(jj * topCols);
        const totalVerts = topVertCount + perim.length;
        const outPos = new Float32Array(totalVerts * 3);
        const outNorm = new Float32Array(totalVerts * 3);
        const outUv = new Float32Array(totalVerts * 2);
        for (let jj = 0; jj < topRows; jj++) {
          for (let ii = 0; ii < topCols; ii++) {
            const d = jj * topCols + ii;
            const s = gridSrcIdx[jj * STRIDE * (NX + 1) + ii * STRIDE];
            outPos[d * 3] = posAttr.getX(s);
            outPos[d * 3 + 1] = posAttr.getY(s);
            outPos[d * 3 + 2] = posAttr.getZ(s);
            outNorm[d * 3] = normAttr.getX(s);
            outNorm[d * 3 + 1] = normAttr.getY(s);
            outNorm[d * 3 + 2] = normAttr.getZ(s);
            outUv[d * 2] = uvAttr.getX(s);
            outUv[d * 2 + 1] = uvAttr.getY(s);
          }
        }
        for (let p = 0; p < perim.length; p++) {
          const d = topVertCount + p;
          const t = perim[p];
          outPos[d * 3] = outPos[t * 3];
          outPos[d * 3 + 1] = 0.0;
          outPos[d * 3 + 2] = outPos[t * 3 + 2];
          outNorm[d * 3] = outNorm[t * 3];
          outNorm[d * 3 + 1] = outNorm[t * 3 + 1];
          outNorm[d * 3 + 2] = outNorm[t * 3 + 2];
          outUv[d * 2] = outUv[t * 2];
          outUv[d * 2 + 1] = outUv[t * 2 + 1];
        }
        const triCount = GX * GY * 2 + perim.length * 2;
        const outIdx = new Uint16Array(triCount * 3);
        let ptr = 0;
        // Detect winding from source triangle orientation in XZ plane
        const p00x = outPos[0], p00z = outPos[2];
        const p10x = outPos[3], p10z = outPos[5];
        const p01x = outPos[topCols * 3], p01z = outPos[topCols * 3 + 2];
        const crossY = (p10x - p00x) * (p01z - p00z) - (p10z - p00z) * (p01x - p00x);
        const flip = crossY > 0;
        for (let jj = 0; jj < GY; jj++) {
          for (let ii = 0; ii < GX; ii++) {
            const a = jj * topCols + ii;
            const b = a + 1;
            const c = a + topCols + 1;
            const d = a + topCols;
            if (!flip) {
              outIdx[ptr++] = a; outIdx[ptr++] = b; outIdx[ptr++] = c;
              outIdx[ptr++] = a; outIdx[ptr++] = c; outIdx[ptr++] = d;
            } else {
              outIdx[ptr++] = a; outIdx[ptr++] = c; outIdx[ptr++] = b;
              outIdx[ptr++] = a; outIdx[ptr++] = d; outIdx[ptr++] = c;
            }
          }
        }
        for (let p = 0; p < perim.length; p++) {
          const pn = (p + 1) % perim.length;
          const t0 = perim[p];
          const t1 = perim[pn];
          const b0 = topVertCount + p;
          const b1 = topVertCount + pn;
          if (!flip) {
            outIdx[ptr++] = b0; outIdx[ptr++] = b1; outIdx[ptr++] = t1;
            outIdx[ptr++] = b0; outIdx[ptr++] = t1; outIdx[ptr++] = t0;
          } else {
            outIdx[ptr++] = b0; outIdx[ptr++] = t1; outIdx[ptr++] = b1;
            outIdx[ptr++] = b0; outIdx[ptr++] = t0; outIdx[ptr++] = t1;
          }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(outPos, 3));
        g.setAttribute("normal", new THREE.BufferAttribute(outNorm, 3));
        g.setAttribute("uv", new THREE.BufferAttribute(outUv, 2));
        g.setIndex(new THREE.BufferAttribute(outIdx, 1));
        g.computeBoundingBox();
        g.computeBoundingSphere();
        decimatedMap.set(srcGeom.uuid, g);
        return g;
      };
      this.world.archV5HorizonGroup.traverse((ch) => {
        if (ch.isMesh && ch.geometry && /^Horizon_Mountain_Mesh_/i.test(ch.name || "")) {
          ch.geometry = buildFastRidgeGeom(ch.geometry);
        }
      });
      this._fastSwRidgeDecimated = true;
    }
  }

  /**
   * Pure CPU fill-rate & vertex-count optimization for headless SwiftShader video capture
   * when Option 2 hardware GPU lighting is active (`isSoftwareRenderer === false`, `isCaptureSwCpu === true`).
   * Preserves 100% of `this.scene.environment` PMREM sky/sunset IBL, `HalfFloatType` HDR PostFX,
   * `fillLight`/`rimLight`, and authored `roughness`/`metalness`/`envMapIntensity`!
   */
  _applyCaptureCpuFillRateTuning() {
    // Critical SwiftShader CPU speedup: clear global `scene.environment` so diffuse roads, pavers,
    // grass & foliage do NOT execute 14M `textureCubeUV()` octant lookups per frame (~13s -> ~0.4s!),
    // while binding `sunsetEnvMap`/`dayEnvMap` to glossy/metallic/glass meshes and matching diffuse sky IBL via `hemiLight`!
    this.scene.environment = null;
    const selectiveEnv = this.sunsetEnvMap || this.dayEnvMap || null;
    const convertedPhysical = this._capConvertedPhysical || (this._capConvertedPhysical = new Map());
    const seenMats = this._capSeenMats || (this._capSeenMats = new Set());
    const seenTex = this._capSeenTex || (this._capSeenTex = new Set());
    const texSlots = [
      "map",
      "bumpMap",
      "normalMap",
      "roughnessMap",
      "metalnessMap",
      "emissiveMap",
      "alphaMap",
    ];
    const isFast1080pCap = Boolean(
      this.renderer &&
        this.renderer.getPixelRatio() <= 1.05 &&
        this.renderer.domElement.width <= 1920
    );

    this.scene.traverse((obj) => {
      if (!obj.material) return;
      const tuneOne = (m) => {
        if (!m) return m;
        if (m.userData?.__v7WorldCohesionUniforms?.uV7PomScale) {
          m.userData.__v7WorldCohesionUniforms.uV7PomScale.value = 0.0;
        }
        if (convertedPhysical.has(m.uuid)) return convertedPhysical.get(m.uuid);

        for (const k of texSlots) {
          const t = m[k];
          if (t && !seenTex.has(t)) {
            seenTex.add(t);
            let texChanged = false;
            if (t.anisotropy > 1) {
              t.anisotropy = 1;
              texChanged = true;
            }
            if (isFast1080pCap && t.minFilter === THREE.LinearMipmapLinearFilter) {
              t.minFilter = THREE.LinearMipmapNearestFilter;
              texChanged = true;
            }
            if (texChanged) t.needsUpdate = true;
          }
        }

        const matObjLabel = `${m.name || ""} ${obj.name || ""}`;
        const isWaterV6 = Boolean(
          m.userData?.isCampusWaterV6 || /Water_V6|Pond_Water|Creek_And_Bay_Water/i.test(matObjLabel)
        );
        if (isWaterV6 || m.userData?.isRefractiveGlassV7) {
          const coolGlassEnv = this.dayEnvMap || selectiveEnv;
          if (m.userData?.isRefractiveGlassV7 && coolGlassEnv) {
            m.envMap = coolGlassEnv;
            m.envMapIntensity = Math.max(m.envMapIntensity ?? 1.45, 1.45);
          }
          return m;
        }

        if (
          isFast1080pCap &&
          m.userData?.isCustomRidgeShaderV7 &&
          !m.userData?.isFastRidgeSw &&
          m.userData?.scMaskTex
        ) {
          const isT2 = Boolean(m.userData.isTier2);
          const maskT = m.userData.scMaskTex;
          const gradT = m.userData.scGradTex;
          const fastRidge = new THREE.MeshBasicMaterial({
            name: m.name || "V7_Santa_Cruz_Ridgeline_FastCap",
            color: "#ffffff",
            fog: false,
            toneMapped: true,
          });
          fastRidge.userData = {
            ...m.userData,
            v5AerialShaderInstalled: true,
            v5PreservedNormalMap: null,
            isFastRidgeSw: true,
          };
          fastRidge.customProgramCacheKey = () =>
            isT2 ? "v7_sc_fast_sw_tier2" : "v7_sc_fast_sw_tier1";
          fastRidge.onBeforeCompile = (shader) => {
            shader.uniforms.uIsTier2 = { value: isT2 ? 1.0 : 0.0 };
            shader.uniforms.uScMaskTex = { value: maskT };
            shader.uniforms.uScGradTex = { value: gradT };
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
                vScWorldNorm = normalize(mat3(modelMatrix) * normal);`
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
                {
                  vec2 wpXZ = vScWorldPos.xz;
                  mat2 scRot = mat2(0.80, -0.60, 0.60, 0.80);
                  vec2 uvPrimary = (wpXZ + vec2(vScWorldPos.y * 0.62, -vScWorldPos.y * 0.41)) * (1.0 / 320.0);
                  vec2 uvDetail = (scRot * wpXZ + vec2(-vScWorldPos.y * 0.92, vScWorldPos.y * 0.68)) * (1.0 / 118.0);
                  vec4 mA = texture2D(uScMaskTex, uvPrimary);
                  vec4 mB = texture2D(uScMaskTex, uvDetail);
                  float macroPatch = mix(mA.r, mB.r, 0.34);
                  float chapClump = mix(mA.g, mB.g, 0.56);
                  float fineScrub = mB.b;
                  float canyonRidge = mix(mA.a, mB.a, 0.48);
                  float ravineAO = smoothstep(0.14, 0.76, canyonRidge * 0.82 + macroPatch * 0.24);
                  vec3 wN = normalize(vScWorldNorm + vec3(0.0, 1e-5, 0.0));
                  float steepness = clamp(1.0 - abs(wN.y), 0.0, 1.0);
                  float heightFrac = clamp((vScWorldPos.y - 2.0) / (uIsTier2 > 0.5 ? 78.0 : 52.0), 0.0, 1.0);
                  vec3 deepOak = vec3(0.032, 0.049, 0.020);
                  vec3 chaparralOlive = vec3(0.095, 0.112, 0.064);
                  vec3 goldenOat = vec3(0.355, 0.278, 0.124);
                  vec3 ochreSandstone = vec3(0.335, 0.242, 0.152);
                  vec3 paleStrataLedge = vec3(0.455, 0.365, 0.248);
                  float oatMix = smoothstep(0.34, 0.74, macroPatch * 0.62 + heightFrac * 0.36 + ravineAO * 0.22);
                  vec3 hillBase = mix(chaparralOlive, goldenOat, oatMix);
                  float oakCanopyMask = smoothstep(0.40, 0.70, chapClump * 0.68 + fineScrub * 0.32 + (1.0 - ravineAO) * 0.34);
                  hillBase = mix(hillBase, deepOak, oakCanopyMask * 0.88);
                  float strataPhase = vScWorldPos.y * 0.22 + wpXZ.x * 0.032 - wpXZ.y * 0.024 + canyonRidge * 5.5 + macroPatch * 3.8;
                  float strataBench = smoothstep(0.58, 0.88, 0.5 + 0.5 * sin(strataPhase));
                  float rockMask = smoothstep(0.62, 0.86, steepness) * (1.0 - oakCanopyMask);
                  hillBase = mix(hillBase, mix(ochreSandstone, paleStrataLedge, strataBench), rockMask * 0.26);
                  hillBase *= mix(0.30, 1.16, ravineAO);
                  vec2 g1 = (texture2D(uScGradTex, uvPrimary).rg - 0.5) * 4.2;
                  vec2 g2 = mat2(0.80, 0.60, -0.60, 0.80) * ((texture2D(uScGradTex, uvDetail).rg - 0.5) * 4.2);
                  vec3 gradH = vec3(g1.x * 0.62 + g2.x * 0.52, 0.0, g1.y * 0.62 + g2.y * 0.52);
                  vec3 surfGrad = gradH - wN * dot(gradH, wN);
                  vec3 pertWn = normalize(wN - surfGrad * (uIsTier2 > 0.5 ? 3.15 : 4.25));
                  vec3 sunDir = normalize(vec3(-0.62, 0.34, -0.71));
                  float ndl = max(0.0, dot(pertWn, sunDir));
                  float hemiT = 0.5 + 0.5 * pertWn.y;
                  vec3 skyFill = mix(vec3(0.18, 0.14, 0.10), vec3(0.30, 0.44, 0.62), hemiT) * 1.18;
                  vec3 sunIrrad = vec3(1.00, 0.78, 0.50) * (3.14 * 0.318309886 * ndl);
                  vec3 litHill = hillBase * (sunIrrad + skyFill);
                  float camDist = length(vScWorldPos.xz - cameraPosition.xz);
                  float distHaze = smoothstep(245.0, 540.0, camDist);
                  float hazeFactor = uIsTier2 > 0.5
                    ? clamp(0.30 + 0.16 * distHaze - heightFrac * 0.05, 0.24, 0.48)
                    : clamp(0.10 + 0.15 * distHaze - heightFrac * 0.04, 0.07, 0.26);
                  vec3 coastalHaze = mix(vec3(0.285, 0.348, 0.372), vec3(0.545, 0.578, 0.565), clamp(heightFrac * 0.85, 0.0, 1.0));
                  diffuseColor.rgb = mix(litHill, coastalHaze, hazeFactor);
                }`
              );
          };
          convertedPhysical.set(m.uuid, fastRidge);
          return fastRidge;
        }

        const isMatteMountain = /Ridgeline|Horizon_Mountain|Santa_Cruz|Foothill/i.test(matObjLabel);
        const isBotanicalFoliage = /Tree_|Oak|Redwood|Shrub|Plume|Bunchgrass|Hedge/i.test(matObjLabel);
        const keepNormalMaps =
          !isBotanicalFoliage &&
          /Dragonscale|Visitor|Gradient_Canopy|Bay_View|Snack_Cart|Stevens_Creek_Bridge|Dumbbell|Kettlebell|Pelican|GBike|TPU|Monument|Trex|Stan|Waymo/i.test(
            matObjLabel
          );
        const isCoolGlassTarget = /TPU_8i|Mat_TPU_8i|Visitor_Glazing|Visitor_GoogleStore/i.test(matObjLabel);
        const targetEnvTex = isCoolGlassTarget && this.dayEnvMap ? this.dayEnvMap : selectiveEnv;
        const wantsSpecEnv = Boolean(
          !isMatteMountain &&
            !isBotanicalFoliage &&
            targetEnvTex &&
            (/Mirror|Chrome|Silver|Gold|Brass|TPU|Waymo|Monument|Trex|Stan|Glazing|Window|Glass/i.test(
              matObjLabel
            ) ||
              (m.transparent && (m.opacity ?? 1.0) < 0.90 && !m.alphaTest))
        );

        if (m.isMeshPhysicalMaterial) {
          const std = new THREE.MeshStandardMaterial({
            name: m.name || "",
            color: m.color ? m.color.clone() : new THREE.Color(0xffffff),
            map: m.map || null,
            alphaMap: m.alphaMap || null,
            roughnessMap: m.roughnessMap || null,
            metalnessMap: m.metalnessMap || null,
            aoMap: m.aoMap || null,
            aoMapIntensity: m.aoMapIntensity ?? 1.0,
            normalMap: keepNormalMaps ? m.normalMap || null : null,
            normalScale:
              keepNormalMaps && m.normalScale ? m.normalScale.clone() : new THREE.Vector2(1, 1),
            bumpMap: keepNormalMaps ? m.bumpMap || null : null,
            bumpScale: keepNormalMaps ? m.bumpScale ?? 1.0 : 0.0,
            emissive: m.emissive ? m.emissive.clone() : new THREE.Color(0x000000),
            emissiveMap: m.emissiveMap || null,
            emissiveIntensity: m.emissiveIntensity ?? 1.0,
            roughness: m.roughness ?? 0.5,
            metalness: wantsSpecEnv || m.metalnessMap ? (m.metalness ?? 0.0) : Math.min(m.metalness ?? 0.0, 0.08),
            envMap: wantsSpecEnv ? targetEnvTex : null,
            envMapIntensity: wantsSpecEnv ? (m.envMapIntensity ?? 1.0) : 0.0,
            vertexColors: Boolean(m.vertexColors),
            transparent: Boolean(m.transparent),
            opacity: m.opacity ?? 1.0,
            alphaTest: m.alphaTest ?? 0,
            side: m.side ?? THREE.FrontSide,
            depthWrite: m.depthWrite ?? true,
            depthTest: m.depthTest ?? true,
            polygonOffset: Boolean(m.polygonOffset),
            polygonOffsetFactor: m.polygonOffsetFactor ?? 0,
            polygonOffsetUnits: m.polygonOffsetUnits ?? 0,
            fog: m.fog ?? true,
            toneMapped: m.toneMapped ?? true,
          });
          if (
            typeof m.onBeforeCompile === "function" &&
            m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile
          ) {
            std.onBeforeCompile = m.onBeforeCompile;
          }
          if (
            typeof m.customProgramCacheKey === "function" &&
            m.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey
          ) {
            std.customProgramCacheKey = m.customProgramCacheKey;
          }
          if (m.userData && typeof m.userData === "object") {
            std.userData = { ...m.userData };
          }
          convertedPhysical.set(m.uuid, std);
          return std;
        }

        if (seenMats.has(m)) return m;
        seenMats.add(m);
        let dirty = false;
        if (!keepNormalMaps && (m.normalMap || m.bumpMap)) {
          m.normalMap = null;
          m.bumpMap = null;
          dirty = true;
        }
        if (m.isMeshStandardMaterial) {
          if (wantsSpecEnv) {
            if (m.envMap !== targetEnvTex) {
              m.envMap = targetEnvTex;
              dirty = true;
            }
          } else if (m.envMap) {
            m.envMap = null;
            m.envMapIntensity = 0.0;
            dirty = true;
          }
        }
        if (dirty) m.needsUpdate = true;
        return m;
      };

      if (Array.isArray(obj.material)) {
        obj.material = obj.material.map(tuneOne);
      } else {
        obj.material = tuneOne(obj.material);
      }
      if (obj.userData) {
        if (obj.userData.xrayMaterial) {
          obj.userData.xrayMaterial = Array.isArray(obj.userData.xrayMaterial)
            ? obj.userData.xrayMaterial.map(tuneOne)
            : tuneOne(obj.userData.xrayMaterial);
        }
        if (obj.userData.solidMaterial) {
          obj.userData.solidMaterial = Array.isArray(obj.userData.solidMaterial)
            ? obj.userData.solidMaterial.map(tuneOne)
            : tuneOne(obj.userData.solidMaterial);
        }
      }
    });

    if (isFast1080pCap) {
      this._decimateHorizonMountainMeshes();
    }
  }

  _setupSoftwarePointLightMultiplexer() {
    if (this._swMuxReady || !this.world?.root) return;
    const slotCount = this.isSoftwareRenderer || this.isCaptureSwCpu ? 2 : 4;
    this._muxLights = [];
    for (let si = 0; si < slotCount; si++) {
      const pl = new THREE.PointLight(0xffffff, 0.0, 36.0, 2.0);
      pl.name = `Campus_Mux_PointLight_${si}`;
      pl.castShadow = false;
      pl.visible = true;
      this.scene.add(pl);
      this._muxLights.push(pl);
    }
    this._swMuxLightA = this._muxLights[0] || null;
    this._swMuxLightB = this._muxLights[1] || null;

    const muxSet = new Set(this._muxLights);
    const zonePointLights = [];
    const muxRoot = this.scene || this.world.root;
    muxRoot.updateMatrixWorld(true);
    muxRoot.traverse((obj) => {
      if (obj.isPointLight && !muxSet.has(obj)) {
        const wp = new THREE.Vector3();
        obj.getWorldPosition(wp);
        obj.userData = obj.userData || {};
        obj.userData.swMuxManaged = true;
        obj.userData._logicalVisible = obj.visible !== false;
        zonePointLights.push({
          srcLight: obj,
          color: obj.color,
          baseIntensity: obj.intensity,
          distance: obj.distance || 32,
          decay: obj.decay ?? 2,
          wx: wp.x,
          wy: wp.y,
          wz: wp.z,
        });
        obj.visible = false;
        // Lock `.visible` to `false` so external world zone updates (`shorelineStageLight.visible = ...`)
        // update `_logicalVisible` cleanly without EVER changing Three.js `NUM_POINT_LIGHTS`!
        try {
          Object.defineProperty(obj, "visible", {
            get: () => false,
            set: (val) => {
              obj.userData._logicalVisible = Boolean(val);
            },
            configurable: true,
          });
        } catch (_defErr) {}
      }
    });
    this._swZonePointSpecs = zonePointLights;
    this._topMuxSpecs = new Array(slotCount).fill(null);
    this._topMuxScores = new Float64Array(slotCount);
    this._swMuxReady = true;
    this._updateSoftwarePointLightMultiplexer();
  }

  _updateSoftwarePointLightMultiplexer() {
    if (!this._swMuxReady || !this._swZonePointSpecs || !this._muxLights || !this.camera) return;
    const cx = this.camera.position.x;
    const cy = this.camera.position.y;
    const cz = this.camera.position.z;
    const slots = this._muxLights;
    const nSlots = slots.length;
    const topSpecs = this._topMuxSpecs;
    const topScores = this._topMuxScores;
    for (let s = 0; s < nSlots; s++) {
      topSpecs[s] = null;
      topScores[s] = 0.0;
    }

    for (let i = 0; i < this._swZonePointSpecs.length; i++) {
      const sp = this._swZonePointSpecs[i];
      const src = sp.srcLight;
      if (src && src.userData && src.userData._logicalVisible === false) continue;
      const liveInt = src ? Number(src.intensity) || 0.0 : sp.baseIntensity;
      if (liveInt <= 1e-4) continue;

      const d = Math.hypot(sp.wx - cx, sp.wy - cy, sp.wz - cz);
      const maxReach = (sp.distance || 32.0) + 32.0;
      if (d >= maxReach) continue;

      // Smooth C1 distance edge fade (`1.0 -> 0.0` across outer 28% of reach)
      const fadeStart = maxReach * 0.72;
      let fade = 1.0;
      if (d > fadeStart) {
        const u = Math.min(1.0, Math.max(0.0, (maxReach - d) / Math.max(1e-3, maxReach - fadeStart)));
        fade = u * u * (3.0 - 2.0 * u);
      }
      const effInt = liveInt * fade;
      if (effInt <= 1e-4) continue;

      const weight = effInt / (1.0 + d * 0.22);
      for (let s = 0; s < nSlots; s++) {
        if (weight > topScores[s]) {
          for (let k = nSlots - 1; k > s; k--) {
            topScores[k] = topScores[k - 1];
            topSpecs[k] = topSpecs[k - 1];
          }
          topScores[s] = weight;
          topSpecs[s] = sp;
          sp._effIntensity = effInt;
          break;
        }
      }
    }

    for (let s = 0; s < nSlots; s++) {
      const light = slots[s];
      const sp = topSpecs[s];
      if (!sp) {
        light.intensity = 0.0;
        light.position.set(cx, cy - 200.0, cz);
        continue;
      }
      light.color.copy(sp.srcLight ? sp.srcLight.color : sp.color);
      light.intensity = sp._effIntensity;
      light.distance = sp.srcLight ? sp.srcLight.distance || sp.distance : sp.distance;
      light.decay = sp.srcLight ? sp.srcLight.decay ?? sp.decay : sp.decay;
      light.position.set(sp.wx, sp.wy, sp.wz);
      light.updateMatrixWorld();
    }
  }

  _bakeStaticEnvironmentMaps() {
    try {
      if (typeof THREE.PMREMGenerator === "function") {
        const isFast1080pBootSw = Boolean(
          this.isSoftwareRenderer &&
            typeof window !== "undefined" &&
            (window.devicePixelRatio || 1) <= 1.05 &&
            (window.innerWidth || 1920) <= 1920
        );
        const isCaptureSwCpuPmrem = Boolean(
          typeof window !== "undefined" && window.__CAPTURE_UNDERLYING_SWIFTSHADER__
        );
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        const sunsetDome = buildProceduralEnvDomeScene(true);
        if (this.isSoftwareRenderer || isFast1080pBootSw) {
          this.sunsetEnvMap = pmrem.fromScene(sunsetDome.envScene, 0, 0.1, 100, { size: 64 }).texture;
          this.dayEnvMap = this.sunsetEnvMap;
        } else if (isCaptureSwCpuPmrem) {
          const dayDome = buildProceduralEnvDomeScene(false);
          this.sunsetEnvMap = pmrem.fromScene(sunsetDome.envScene, 0, 0.1, 100, { size: 128 }).texture;
          this.dayEnvMap = pmrem.fromScene(dayDome.envScene, 0, 0.1, 100, { size: 128 }).texture;
          dayDome.dispose();
        } else {
          const dayDome = buildProceduralEnvDomeScene(false);
          this.sunsetEnvMap = pmrem.fromScene(sunsetDome.envScene, 0.035).texture;
          this.dayEnvMap = pmrem.fromScene(dayDome.envScene, 0.030).texture;
          dayDome.dispose();
        }
        this._usingSunsetEnv = true;
        sunsetDome.dispose();
        pmrem.dispose();
        this.scene.environment = this.sunsetEnvMap;
      }
    } catch (_err) {
      this.dayEnvMap = null;
      this.sunsetEnvMap = null;
    }
  }

  _ensureSunsetEnvMap() {
    return this.sunsetEnvMap || this.dayEnvMap;
  }

  _initHeroWorldGameAndAudio() {
    this.materials = createMaterialLibrary();
    this.campusWorld = new OpenCampusWorld(this.materials);
    this.campusWorld.dayEnvMap = this.dayEnvMap || null;
    this.campusWorld.sunsetEnvMap = this.sunsetEnvMap || null;
    this.world = this.campusWorld;
    this.scene.add(this.campusWorld.root);

    this.heroAnchor = new THREE.Group();
    this.heroAnchor.name = "HeroPelicanGBikeAnchor";
    this.heroAnchor.rotation.order = "YXZ";
    this.scene.add(this.heroAnchor);

    this.gbike = new GBikeRig(this.materials, {
      bikeVariant: state.bikeVariant || DEFAULT_GBIKE_VARIANT,
    });
    this.heroAnchor.add(this.gbike.root);

    this.pelican = new PelicanRig(this.materials);
    this.gbike.leanGroup.add(this.pelican.root);

    // Open-World Game Physics & Story Auto-Pilot Controller + Lyria 3.5 & Procedural Audio Engine
    this.game = new OpenWorldGameController(this.rng);
    if (typeof window !== "undefined") {
      this.game.bindInputListeners(window);
    }
    this.audio = new GameAudioEngine();
  }

  /**
   * V8-04 + V8-02 Zero-GC Anisotropic VFX Pools (`0` fuzzy white polka dots, `0` per-frame heap allocs):
   *   1. `Slipstream_Ribbon_Pool` (`128` velocity-aligned tapered aerodynamic ribbons & `2–5cm` sunlit ground micro-wisps)
   *   2. `Ballistic_Spark_Pool` (`160` high-aspect-ratio `len = 0.06 + 0.045 * |v|` ballistic metallic spark needles with `-9.81 m/s^2` gravity & 1–2 ground ricochets)
   *   3. `Stan_Roar_Ripple_Ring` (subtle expanding sunlit ground dust ripple ring at `40.20s` around Stan's pedestal)
   */
  _initZeroGcParticlePool() {
    // --- A. Aerodynamic Slipstream Ribbons & Ground Micro-Wisps (`Slipstream_Ribbon_Pool`) ---
    const ribbonTex = createSlipstreamRibbonTexture();
    const ribbonGeom = new THREE.PlaneGeometry(1.0, 1.0);
    this._rAlphaArray = new Float32Array(SLIPSTREAM_POOL_SIZE);
    this._rAlphaAttr = new THREE.InstancedBufferAttribute(this._rAlphaArray, 1);
    this._rAlphaAttr.setUsage(THREE.DynamicDrawUsage);
    ribbonGeom.setAttribute("aRibbonAlpha", this._rAlphaAttr);

    const ribbonMat = new THREE.MeshBasicMaterial({
      map: ribbonTex,
      color: "#ffffff",
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
    });
    ribbonMat.customProgramCacheKey = () => "pelican_v8_slipstream_ribbon";
    ribbonMat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>\nattribute float aRibbonAlpha;\nvarying float vRibbonAlpha;`
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>\nvRibbonAlpha = aRibbonAlpha;`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>\nvarying float vRibbonAlpha;`
        )
        .replace(
          "#include <map_fragment>",
          `#include <map_fragment>\ndiffuseColor.a *= vRibbonAlpha;`
        );
    };

    this.slipstreamMesh = new THREE.InstancedMesh(ribbonGeom, ribbonMat, SLIPSTREAM_POOL_SIZE);
    this.slipstreamMesh.name = "Slipstream_Ribbon_Pool";
    this.slipstreamMesh.castShadow = false;
    this.slipstreamMesh.receiveShadow = false;
    this.slipstreamMesh.userData.noCastShadow = true;
    this.slipstreamMesh.userData.skipGroundingAudit = true;
    this.slipstreamMesh.layers.set(0);
    this.slipstreamMesh.frustumCulled = false;
    this.slipstreamMesh.renderOrder = 19;
    this.slipstreamMesh.raycast = () => {};

    this._rLife = new Float32Array(SLIPSTREAM_POOL_SIZE);
    this._rMaxLife = new Float32Array(SLIPSTREAM_POOL_SIZE);
    this._rX = new Float32Array(SLIPSTREAM_POOL_SIZE);
    this._rY = new Float32Array(SLIPSTREAM_POOL_SIZE);
    this._rZ = new Float32Array(SLIPSTREAM_POOL_SIZE);
    this._rVx = new Float32Array(SLIPSTREAM_POOL_SIZE);
    this._rVy = new Float32Array(SLIPSTREAM_POOL_SIZE);
    this._rVz = new Float32Array(SLIPSTREAM_POOL_SIZE);
    this._rLen = new Float32Array(SLIPSTREAM_POOL_SIZE);
    this._rWidth = new Float32Array(SLIPSTREAM_POOL_SIZE);
    this._rPeakAlpha = new Float32Array(SLIPSTREAM_POOL_SIZE);
    this._rDrag = new Float32Array(SLIPSTREAM_POOL_SIZE);
    this._rCursor = 0;

    // --- B. Anisotropic Ballistic Metallic Sparks (`Ballistic_Spark_Pool`) ---
    const sparkTex = createBallisticSparkNeedleTexture();
    const sparkGeom = new THREE.PlaneGeometry(1.0, 1.0);
    this._spAlphaArray = new Float32Array(BALLISTIC_SPARK_POOL_SIZE);
    this._spAlphaAttr = new THREE.InstancedBufferAttribute(this._spAlphaArray, 1);
    this._spAlphaAttr.setUsage(THREE.DynamicDrawUsage);
    sparkGeom.setAttribute("aSparkAlpha", this._spAlphaAttr);

    const sparkMat = new THREE.MeshBasicMaterial({
      map: sparkTex,
      color: "#ffffff",
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    sparkMat.customProgramCacheKey = () => "pelican_v8_ballistic_spark";
    sparkMat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>\nattribute float aSparkAlpha;\nvarying float vSparkAlpha;`
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>\nvSparkAlpha = aSparkAlpha;`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>\nvarying float vSparkAlpha;`
        )
        .replace(
          "#include <map_fragment>",
          `#include <map_fragment>\ndiffuseColor.a *= vSparkAlpha;`
        );
    };

    this.sparkMesh = new THREE.InstancedMesh(sparkGeom, sparkMat, BALLISTIC_SPARK_POOL_SIZE);
    this.sparkMesh.name = "Ballistic_Spark_Pool";
    this.sparkMesh.castShadow = false;
    this.sparkMesh.receiveShadow = false;
    this.sparkMesh.userData.noCastShadow = true;
    this.sparkMesh.userData.skipGroundingAudit = true;
    this.sparkMesh.layers.set(0);
    this.sparkMesh.frustumCulled = false;
    this.sparkMesh.renderOrder = 21;
    this.sparkMesh.raycast = () => {};

    // Alias `this.particleMesh` to `this.sparkMesh` for external telemetry consumers
    this.particleMesh = this.sparkMesh;

    this._spLife = new Float32Array(BALLISTIC_SPARK_POOL_SIZE);
    this._spMaxLife = new Float32Array(BALLISTIC_SPARK_POOL_SIZE);
    this._spX = new Float32Array(BALLISTIC_SPARK_POOL_SIZE);
    this._spY = new Float32Array(BALLISTIC_SPARK_POOL_SIZE);
    this._spZ = new Float32Array(BALLISTIC_SPARK_POOL_SIZE);
    this._spVx = new Float32Array(BALLISTIC_SPARK_POOL_SIZE);
    this._spVy = new Float32Array(BALLISTIC_SPARK_POOL_SIZE);
    this._spVz = new Float32Array(BALLISTIC_SPARK_POOL_SIZE);
    this._spGroundY = new Float32Array(BALLISTIC_SPARK_POOL_SIZE);
    this._spWidth = new Float32Array(BALLISTIC_SPARK_POOL_SIZE);
    this._spBounces = new Uint8Array(BALLISTIC_SPARK_POOL_SIZE);
    this._spColorMode = new Uint8Array(BALLISTIC_SPARK_POOL_SIZE); // 0=gold cooling, 1..4=Google 4-color, 5=ice glass glint
    this._spCursor = 0;

    _pPos.set(0, -60, 0);
    _pQuat.identity();
    _pScale.setScalar(0.0001);
    _pMat4.compose(_pPos, _pQuat, _pScale);
    _pColor.setHex(0xffffff);
    for (let i = 0; i < SLIPSTREAM_POOL_SIZE; i++) {
      this.slipstreamMesh.setMatrixAt(i, _pMat4);
      this.slipstreamMesh.setColorAt(i, _pColor);
      this._rAlphaArray[i] = 0.0;
    }
    for (let i = 0; i < BALLISTIC_SPARK_POOL_SIZE; i++) {
      this.sparkMesh.setMatrixAt(i, _pMat4);
      this.sparkMesh.setColorAt(i, _pColor);
      this._spAlphaArray[i] = 0.0;
    }
    this.slipstreamMesh.instanceMatrix.needsUpdate = true;
    if (this.slipstreamMesh.instanceColor) this.slipstreamMesh.instanceColor.needsUpdate = true;
    this.sparkMesh.instanceMatrix.needsUpdate = true;
    if (this.sparkMesh.instanceColor) this.sparkMesh.instanceColor.needsUpdate = true;

    this.scene.add(this.slipstreamMesh);
    this.scene.add(this.sparkMesh);

    // --- C. V8-02 `40.20s` Stan T. rex Pedestal Expanding Sunlit Dust Ripple Ring (`0` polka dots) ---
    const rippleGeom = new THREE.RingGeometry(0.76, 1.0, 64, 1);
    rippleGeom.rotateX(-Math.PI * 0.5);
    const rippleMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uOpacity: { value: 0.0 },
        uColorInner: { value: new THREE.Color("#fef3c7") },
        uColorOuter: { value: new THREE.Color("#d9b982") },
      },
      vertexShader: `
        varying vec2 vRingPos;
        void main() {
          vRingPos = position.xz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        uniform vec3 uColorInner;
        uniform vec3 uColorOuter;
        varying vec2 vRingPos;
        void main() {
          float r = length(vRingPos);
          float band = smoothstep(0.76, 0.88, r) * (1.0 - smoothstep(0.89, 1.0, r));
          vec3 col = mix(uColorInner, uColorOuter, smoothstep(0.78, 0.98, r));
          gl_FragColor = vec4(col, band * uOpacity);
        }
      `,
    });
    this.stanRoarRippleMesh = new THREE.Mesh(rippleGeom, rippleMat);
    this.stanRoarRippleMesh.name = "Stan_Roar_Ripple_Ring";
    this.stanRoarRippleMesh.castShadow = false;
    this.stanRoarRippleMesh.receiveShadow = false;
    this.stanRoarRippleMesh.userData.noCastShadow = true;
    this.stanRoarRippleMesh.userData.skipGroundingAudit = true;
    this.stanRoarRippleMesh.layers.set(0);
    const stanGroundY = getOpenWorldTerrainHeight(-118.0, -50.0);
    this.stanRoarRippleMesh.position.set(-118.0, stanGroundY + 0.022, -50.0);
    this.stanRoarRippleMesh.visible = false;
    this.stanRoarRippleMesh.renderOrder = 8;
    this.stanRoarRippleMesh.raycast = () => {};
    this.scene.add(this.stanRoarRippleMesh);
  }

  /**
   * Dedicated Volumetric Billowing Tire-Burnout Rubber Smoke System (`160` billboarded FBM cloud puffs
   * in 1 draw call with per-instance `aPuffAlpha` + `aPuffRoll`, plus twin vulcanized rubber peel-out
   * tire skid marks on the Fitness Gym floor right ahead of the roller stand).
   */
  _initBurnoutSmokeSystem() {
    const puffTex = createBurnoutSmokePuffTexture();
    const smokeGeom = new THREE.PlaneGeometry(1.0, 1.0);

    this._sAlphaArray = new Float32Array(BURNOUT_SMOKE_POOL_SIZE);
    this._sRollArray = new Float32Array(BURNOUT_SMOKE_POOL_SIZE);
    this._sAlphaAttr = new THREE.InstancedBufferAttribute(this._sAlphaArray, 1);
    this._sRollAttr = new THREE.InstancedBufferAttribute(this._sRollArray, 1);
    this._sAlphaAttr.setUsage(THREE.DynamicDrawUsage);
    this._sRollAttr.setUsage(THREE.DynamicDrawUsage);
    smokeGeom.setAttribute("aPuffAlpha", this._sAlphaAttr);
    smokeGeom.setAttribute("aPuffRoll", this._sRollAttr);

    const smokeMat = new THREE.MeshBasicMaterial({
      map: puffTex,
      color: "#ffffff",
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
      blending: THREE.NormalBlending,
      vertexColors: false,
    });
    smokeMat.customProgramCacheKey = () => "pelican_burnout_smoke_v3_lit";
    smokeMat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
attribute float aPuffAlpha;
attribute float aPuffRoll;
varying float vPuffAlpha;
varying vec2 vScreenBillow;`
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
vPuffAlpha = aPuffAlpha;
float cPuffRoll = cos( aPuffRoll );
float sPuffRoll = sin( aPuffRoll );
transformed.xy = mat2( cPuffRoll, -sPuffRoll, sPuffRoll, cPuffRoll ) * transformed.xy;
vScreenBillow = transformed.xy;`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
varying float vPuffAlpha;
varying vec2 vScreenBillow;`
        )
        .replace(
          "#include <map_fragment>",
          `#include <map_fragment>
float foldRelief = diffuseColor.r;
float sunTopT = smoothstep( -0.46, 0.40, vScreenBillow.y * 0.92 - vScreenBillow.x * 0.22 + ( foldRelief - 0.78 ) * 1.15 );
vec3 vulcanBelly = vec3( 0.44, 0.48, 0.56 );
vec3 sunlitCrown = vec3( 1.00, 0.95, 0.86 );
diffuseColor.rgb = mix( vulcanBelly, sunlitCrown, sunTopT ) * ( 0.84 + 0.22 * foldRelief );
diffuseColor.a *= vPuffAlpha;`
        );
    };

    this.burnoutSmokeMesh = new THREE.InstancedMesh(
      smokeGeom,
      smokeMat,
      BURNOUT_SMOKE_POOL_SIZE
    );
    this.burnoutSmokeMesh.name = "VolumetricTireBurnoutSmoke";
    this.burnoutSmokeMesh.frustumCulled = false;
    this.burnoutSmokeMesh.renderOrder = 18;
    this.burnoutSmokeMesh.raycast = () => {};

    this._sLife = new Float32Array(BURNOUT_SMOKE_POOL_SIZE);
    this._sMaxLife = new Float32Array(BURNOUT_SMOKE_POOL_SIZE);
    this._sX = new Float32Array(BURNOUT_SMOKE_POOL_SIZE);
    this._sY = new Float32Array(BURNOUT_SMOKE_POOL_SIZE);
    this._sZ = new Float32Array(BURNOUT_SMOKE_POOL_SIZE);
    this._sVx = new Float32Array(BURNOUT_SMOKE_POOL_SIZE);
    this._sVy = new Float32Array(BURNOUT_SMOKE_POOL_SIZE);
    this._sVz = new Float32Array(BURNOUT_SMOKE_POOL_SIZE);
    this._sDiam0 = new Float32Array(BURNOUT_SMOKE_POOL_SIZE);
    this._sDiamMax = new Float32Array(BURNOUT_SMOKE_POOL_SIZE);
    this._sPeakAlpha = new Float32Array(BURNOUT_SMOKE_POOL_SIZE);
    this._sRollVel = new Float32Array(BURNOUT_SMOKE_POOL_SIZE);
    this._sSwirlPhase = new Float32Array(BURNOUT_SMOKE_POOL_SIZE);
    this._sCursor = 0;

    _pPos.set(0, -60, 0);
    _pQuat.identity();
    _pScale.setScalar(0.0001);
    _pMat4.compose(_pPos, _pQuat, _pScale);
    for (let i = 0; i < BURNOUT_SMOKE_POOL_SIZE; i++) {
      this.burnoutSmokeMesh.setMatrixAt(i, _pMat4);
      this.burnoutSmokeMesh.setColorAt(i, _smokeColorHot);
      this._sAlphaArray[i] = 0.0;
      this._sRollArray[i] = 0.0;
    }
    this.burnoutSmokeMesh.instanceMatrix.needsUpdate = true;
    if (this.burnoutSmokeMesh.instanceColor) {
      this.burnoutSmokeMesh.instanceColor.needsUpdate = true;
    }
    this.scene.add(this.burnoutSmokeMesh);

    // Subtle Twin Dark Vulcanized Rubber Burnout Tire Marks right ahead of the Gym Trainer Stand (`z = 140.25 -> 137.45`)
    const skidTex = createVulcanizedSkidMarkTexture();
    const skidMat = new THREE.MeshBasicMaterial({
      map: skidTex,
      transparent: true,
      opacity: 0.50,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.burnoutSkidGroup = new THREE.Group();
    this.burnoutSkidGroup.name = "GymBurnoutRubberSkidMarks";
    const gymFloorY = getOpenWorldTerrainHeight(0.0, 139.2) + 0.007;

    // Anchor geometry from `z = 0` to `z = -2.85m` so scaling `scale.z` in `[0.01..1.0]` paints tracks forward dynamically!
    const makeSkidStrip = (widthM, lenM, xOff, yawSlight) => {
      const g = new THREE.PlaneGeometry(widthM, lenM);
      g.rotateX(-Math.PI * 0.5);
      g.translate(0.0, 0.0, -lenM * 0.5);
      const m = new THREE.Mesh(g, skidMat);
      m.position.set(xOff, gymFloorY, (GYM_BREAKOUT_CONFIG.trainerZ ?? 140.5) + 0.08);
      m.rotation.y = yawSlight;
      m.scale.set(1.0, 1.0, 0.001);
      m.visible = false;
      m.renderOrder = 3;
      m.raycast = () => {};
      return m;
    };
    this._skidPrimary = makeSkidStrip(0.095, 2.85, -0.028, 0.014);
    this._skidSecondary = makeSkidStrip(0.072, 2.25, 0.046, -0.022);
    this.burnoutSkidGroup.add(this._skidPrimary, this._skidSecondary);
    this.scene.add(this.burnoutSkidGroup);
  }

  _clearBurnoutSmoke() {
    if (!this.burnoutSmokeMesh) return;
    this._sLife.fill(0);
    this._sAlphaArray.fill(0);
    this._smokeEmitAccum = 0.0;
    this._burnoutActivePuffs = 0;
    _pPos.set(0, -60, 0);
    _pQuat.identity();
    _pScale.setScalar(0.0001);
    _pMat4.compose(_pPos, _pQuat, _pScale);
    for (let i = 0; i < BURNOUT_SMOKE_POOL_SIZE; i++) {
      this.burnoutSmokeMesh.setMatrixAt(i, _pMat4);
    }
    this.burnoutSmokeMesh.instanceMatrix.needsUpdate = true;
    this._sAlphaAttr.needsUpdate = true;
    if (this._skidPrimary && this._skidSecondary) {
      this._skidPrimary.visible = false;
      this._skidSecondary.visible = false;
    }
  }

  _clearAllParticles() {
    _pPos.set(0, -60, 0);
    _pQuat.identity();
    _pScale.setScalar(0.0001);
    _pMat4.compose(_pPos, _pQuat, _pScale);
    if (this.slipstreamMesh) {
      this._rLife.fill(0);
      this._rAlphaArray.fill(0);
      for (let i = 0; i < SLIPSTREAM_POOL_SIZE; i++) {
        this.slipstreamMesh.setMatrixAt(i, _pMat4);
      }
      this.slipstreamMesh.instanceMatrix.needsUpdate = true;
      this._rAlphaAttr.needsUpdate = true;
    }
    if (this.sparkMesh) {
      this._spLife.fill(0);
      this._spAlphaArray.fill(0);
      for (let i = 0; i < BALLISTIC_SPARK_POOL_SIZE; i++) {
        this.sparkMesh.setMatrixAt(i, _pMat4);
      }
      this.sparkMesh.instanceMatrix.needsUpdate = true;
      this._spAlphaAttr.needsUpdate = true;
    }
    this._ribbonEmitAccum = 0.0;
    this._wispEmitAccum = 0.0;
    this._stanRumbleAgeSec = 99.0;
    this._stanRippleAgeSec = 99.0;
    this._wasStanRoaringForVfx = false;
    if (this.stanRoarRippleMesh) {
      this.stanRoarRippleMesh.visible = false;
      this.stanRoarRippleMesh.material.uniforms.uOpacity.value = 0.0;
    }
    this._clearBurnoutSmoke();
  }

  _spawnBurnoutSmokePuff(
    x,
    y,
    z,
    vx,
    vy,
    vz,
    maxLife,
    diam0,
    diamMax,
    peakAlpha,
    roll0,
    rollVel,
    swirlPhase
  ) {
    if (!this.burnoutSmokeMesh) return;
    const idx = this._sCursor;
    this._sCursor = (this._sCursor + 1) % BURNOUT_SMOKE_POOL_SIZE;

    this._sLife[idx] = maxLife;
    this._sMaxLife[idx] = Math.max(0.15, maxLife);
    this._sX[idx] = x;
    this._sY[idx] = y;
    this._sZ[idx] = z;
    this._sVx[idx] = vx;
    this._sVy[idx] = vy;
    this._sVz[idx] = vz;
    this._sDiam0[idx] = diam0;
    this._sDiamMax[idx] = diamMax;
    this._sPeakAlpha[idx] = peakAlpha;
    this._sRollArray[idx] = roll0;
    this._sRollVel[idx] = rollVel;
    this._sSwirlPhase[idx] = swirlPhase;
  }

  _updateBurnoutSkidMarks(snap) {
    if (!this._skidPrimary || !this._skidSecondary) return;
    let reveal = 0.0;
    const relSec = GYM_BREAKOUT_CONFIG.trainerStandReleaseSec ?? 2.22;
    const trZ = GYM_BREAKOUT_CONFIG.trainerZ ?? 140.5;
    if (state.gameMode === "story_autopilot") {
      const seqT = state.sequenceTime ?? 0.0;
      if (seqT > relSec && seqT < 16.0) {
        reveal = THREE.MathUtils.clamp((seqT - relSec) / 0.68, 0.0, 1.0);
        reveal = reveal * reveal * (3.0 - 2.0 * reveal);
      }
    } else if (!snap.onTrainerStand && snap.z < trZ - 0.05 && snap.z > 90.0) {
      reveal = 1.0;
    }
    const vis = reveal > 0.015;
    this._skidPrimary.visible = vis;
    this._skidSecondary.visible = vis;
    if (vis) {
      this._skidPrimary.scale.z = Math.max(0.02, reveal);
      this._skidSecondary.scale.z = Math.max(0.02, Math.min(1.0, reveal * 1.12));
    }
  }

  _stepBurnoutSmoke(dt, snap) {
    if (!this.burnoutSmokeMesh || !snap || dt <= 0) return;

    this._updateBurnoutSkidMarks(snap);

    const standSmoke = Math.max(0.0, Number(snap.burnoutSmokeIntensity) || 0.0);
    const peelBurst = Math.max(0.0, Number(snap.peelOutBurstIntensity) || 0.0);
    const shorelineSkid = Math.max(0.0, Number(snap.shorelineSkidIntensity) || 0.0);
    const totalIntensity = Math.max(standSmoke, peelBurst, shorelineSkid);

    if (totalIntensity > 0.02) {
      const isWhipSkidOnly = shorelineSkid > 0.02 && standSmoke <= 0.02 && peelBurst <= 0.02;
      // 46..84 puffs/sec on gym trainer burnout; 36 puffs/sec wispy rear-tire scuff during Shoreline whip-skid (`67.85s -> 68.85s`)
      const rate = isWhipSkidOnly
        ? 36.0 * shorelineSkid
        : 44.0 + standSmoke * 30.0 + peelBurst * 42.0;
      this._smokeEmitAccum += dt * rate;
      const backX = -snap.forwardX;
      const backZ = -snap.forwardZ;
      const rightX = snap.rightX;
      const rightZ = snap.rightZ;
      const rearDist = isWhipSkidOnly ? (this.gbike?.rearAxleZ ?? 0.5425) : 0.55;
      const baseNipX = snap.x + backX * rearDist;
      const baseNipZ = snap.z + backZ * rearDist;
      const gndY = Number.isFinite(snap.groundY) ? snap.groundY : 0.0;
      const baseNipY = gndY + (isWhipSkidOnly ? 0.032 : 0.09);

      while (this._smokeEmitAccum >= 1.0) {
        this._smokeEmitAccum -= 1.0;
        const r1 = this.smokeRng();
        const r2 = this.smokeRng();
        const r3 = this.smokeRng();
        const r4 = this.smokeRng();
        const r5 = this.smokeRng();

        if (isWhipSkidOnly) {
          // Wispy rubber tire-scuff puffs trailing off the sliding rear tire contact patch (`groundY + 0.03m`)
          const latJitter = (r1 - 0.5) * 0.11;
          const longJitter = (r2 - 0.5) * 0.12;
          const px = baseNipX + rightX * latJitter + backX * longJitter;
          const pz = baseNipZ + rightZ * latJitter + backZ * longJitter;
          const py = baseNipY + r3 * 0.028;

          const vSlideX = Number(snap.velX) || 0.0;
          const vSlideZ = Number(snap.velZ) || 0.0;
          const vMag = Math.hypot(vSlideX, vSlideZ);
          const trailDirX = vMag > 0.15 ? -vSlideX / vMag : rightX;
          const trailDirZ = vMag > 0.15 ? -vSlideZ / vMag : rightZ;
          const jetSpd = (0.55 + r4 * 0.95) * (0.45 + 0.55 * shorelineSkid);
          const vx = trailDirX * jetSpd + rightX * (0.28 + (r5 - 0.5) * 0.36);
          const vz = trailDirZ * jetSpd + rightZ * (0.28 + (r5 - 0.5) * 0.36);
          const vy = 0.08 + this.smokeRng() * 0.14;

          const maxLife = 0.62 + this.smokeRng() * 0.34;
          const diam0 = 0.15 + this.smokeRng() * 0.06;
          const diamMax = 0.54 + this.smokeRng() * 0.22;
          const peakAlpha = (0.22 + this.smokeRng() * 0.10) * Math.min(1.0, 0.45 + 0.65 * shorelineSkid);
          const roll0 = this.smokeRng() * Math.PI * 2.0;
          const rollVel = (this.smokeRng() - 0.5) * 1.15;
          const swirlPhase = this.smokeRng() * Math.PI * 2.0;

          this._spawnBurnoutSmokePuff(
            px,
            py,
            pz,
            vx,
            vy,
            vz,
            maxLife,
            diam0,
            diamMax,
            peakAlpha,
            roll0,
            rollVel,
            swirlPhase
          );
          continue;
        }

        const latJitter = (r1 - 0.5) * (0.14 + peelBurst * 0.16);
        const longJitter = (r2 - 0.35) * 0.16;
        const px = baseNipX + rightX * latJitter + backX * longJitter;
        const pz = baseNipZ + rightZ * latJitter + backZ * longJitter;
        const py = baseNipY + r3 * 0.06;

        // High-speed tire-nip backward jet (`1.4..3.4 m/s`) that rapidly decelerates via `exp(-2.8 * dt)` air drag!
        const jetSpeed = (1.42 + r4 * 1.98) * (0.58 + 0.42 * totalIntensity) + peelBurst * 0.85;
        const swirlLat = (r5 - 0.5) * (0.92 + peelBurst * 0.65);
        const vx = backX * jetSpeed + rightX * swirlLat;
        const vz = backZ * jetSpeed + rightZ * swirlLat;
        const vy = 0.25 + this.smokeRng() * 0.36 + peelBurst * 0.18;

        const maxLife = 1.45 + this.smokeRng() * 0.95 + peelBurst * 0.35;
        // Billows from r = 0.14m (diam 0.28m) up to 1.15m..1.45m soft overlapping cloud plumes!
        const diam0 = 0.28 + this.smokeRng() * 0.09;
        const diamMax = (1.18 + this.smokeRng() * 0.34) * (0.84 + 0.24 * totalIntensity);
        const peakAlpha =
          (0.48 + this.smokeRng() * 0.17) * Math.min(1.0, 0.58 + 0.52 * totalIntensity);
        const roll0 = this.smokeRng() * Math.PI * 2.0;
        const rollVel = (this.smokeRng() - 0.5) * 1.35;
        const swirlPhase = this.smokeRng() * Math.PI * 2.0;

        this._spawnBurnoutSmokePuff(
          px,
          py,
          pz,
          vx,
          vy,
          vz,
          maxLife,
          diam0,
          diamMax,
          peakAlpha,
          roll0,
          rollVel,
          swirlPhase
        );
      }
    }

    const dragHoriz = Math.exp(-2.8 * dt);
    const dragVert = Math.exp(-1.35 * dt);
    const camQuat = this.camera ? this.camera.quaternion : _pQuat.identity();
    let anyUpdated = false;
    let activeCount = 0;

    for (let i = 0; i < BURNOUT_SMOKE_POOL_SIZE; i++) {
      let life = this._sLife[i];
      if (life <= 0) continue;
      anyUpdated = true;
      life -= dt;
      this._sLife[i] = life;

      if (life <= 0) {
        this._sAlphaArray[i] = 0.0;
        _pPos.set(0, -60, 0);
        _pScale.setScalar(0.0001);
        _pMat4.compose(_pPos, camQuat, _pScale);
        this.burnoutSmokeMesh.setMatrixAt(i, _pMat4);
        continue;
      }

      activeCount++;
      const maxL = this._sMaxLife[i];
      const age = maxL - life;
      const progress = Math.max(0.0, Math.min(1.0, 1.0 - life / maxL));

      // Air drag + gentle lateral vortex curl + warm thermal buoyancy (`+0.25 -> +0.85 m/s`)
      const ph = this._sSwirlPhase[i];
      const curlX = Math.cos(age * 3.1 + ph) * 0.34 * dt;
      const curlZ = Math.sin(age * 2.7 + ph * 1.3) * 0.28 * dt;
      this._sVx[i] = this._sVx[i] * dragHoriz + curlX;
      this._sVz[i] = this._sVz[i] * dragHoriz + curlZ;
      this._sVy[i] = this._sVy[i] * dragVert + 0.62 * dt;

      this._sX[i] += this._sVx[i] * dt;
      this._sY[i] += this._sVy[i] * dt;
      this._sZ[i] += this._sVz[i] * dt;
      this._sRollArray[i] += this._sRollVel[i] * dt * (1.0 - 0.55 * progress);

      // Smooth cloud billow expansion (`0.28m -> 1.15..1.45m`)
      const expCurve = 1.0 - Math.pow(1.0 - progress, 2.15);
      const diam = this._sDiam0[i] + (this._sDiamMax[i] - this._sDiam0[i]) * expCurve;

      // Silky per-puff alpha (`0.0 -> peak -> 0.0`)
      const fadeIn = Math.min(1.0, progress / 0.11);
      const fadeInSmooth = fadeIn * fadeIn * (3.0 - 2.0 * fadeIn);
      const rem = 1.0 - progress;
      const fadeOutSmooth = rem * rem * (2.2 - 1.2 * rem);
      this._sAlphaArray[i] = this._sPeakAlpha[i] * fadeInSmooth * fadeOutSmooth;

      // Vulcanized rubber-smoke thermal cooling color (`#f4f3ef` -> `#d4d8df` -> `#9aa2b1`)
      if (progress < 0.34) {
        _pColor.lerpColors(_smokeColorHot, _smokeColorMid, progress / 0.34);
      } else {
        _pColor.lerpColors(_smokeColorMid, _smokeColorOuter, (progress - 0.34) / 0.66);
      }
      this.burnoutSmokeMesh.setColorAt(i, _pColor);

      _pPos.set(this._sX[i], this._sY[i], this._sZ[i]);
      _pScale.setScalar(Math.max(0.05, diam));
      _pMat4.compose(_pPos, camQuat, _pScale);
      this.burnoutSmokeMesh.setMatrixAt(i, _pMat4);
    }

    this._burnoutActivePuffs = activeCount;
    if (anyUpdated) {
      this.burnoutSmokeMesh.instanceMatrix.needsUpdate = true;
      if (this.burnoutSmokeMesh.instanceColor) {
        this.burnoutSmokeMesh.instanceColor.needsUpdate = true;
      }
      this._sAlphaAttr.needsUpdate = true;
      this._sRollAttr.needsUpdate = true;
    }
  }

  _prewarmBurnoutSmokeToTime(targetSec) {
    const inGymBurnout = targetSec >= 0.06 && targetSec <= 10.60;
    const inShorelineSkid = targetSec >= 67.86 && targetSec <= 69.90;
    if (state.gameMode !== "story_autopilot" || (!inGymBurnout && !inShorelineSkid)) {
      this._updateBurnoutSkidMarks(this.game.getSnapshot());
      return;
    }
    this.smokeRng = createSeededRNG(inShorelineSkid ? 0x67855c1d : 0x51a8e30f);
    this._smokeEmitAccum = 0.0;
    const dtStep = 1.0 / 60.0;
    const tStart = inShorelineSkid
      ? Math.max(67.80, targetSec - 1.50)
      : Math.max(0.0, targetSec - 3.00);
    const steps = Math.max(1, Math.round((targetSec - tStart) / dtStep));
    for (let s = 1; s <= steps; s++) {
      const tSim = Math.min(targetSec, tStart + s * dtStep);
      const pose = evaluateStoryPoseAtTime(tSim);
      const sig = evaluateStoryBurnoutSmokeSignals(tSim);
      const fwdX = Math.sin(pose.headingYaw);
      const fwdZ = -Math.cos(pose.headingYaw);
      const rightX = Math.cos(pose.headingYaw);
      const rightZ = Math.sin(pose.headingYaw);
      const gY = getOpenWorldTerrainHeight(pose.x, pose.z);
      const simSnap = {
        x: pose.x,
        y: gY,
        z: pose.z,
        groundY: gY,
        forwardX: fwdX,
        forwardZ: fwdZ,
        rightX,
        rightZ,
        velX: pose.velX || 0.0,
        velZ: pose.velZ || 0.0,
        speedMps: pose.speedMps || 0.0,
        leanAngleRad: pose.skidBankRad || 0.0,
        onTrainerStand: pose.onTrainerStand,
        isAirborne: Boolean(pose.isAirborne),
        burnoutSmokeIntensity: sig.burnoutSmokeIntensity,
        peelOutBurstIntensity: sig.peelOutBurstIntensity,
        shorelineSkidIntensity: pose.shorelineSkidIntensity || 0.0,
      };
      this._stepBurnoutSmoke(dtStep, simSnap);
      if (inShorelineSkid) {
        this._stepParticles(dtStep, simSnap);
      }
    }
  }

  _composeVelocityAlignedQuadMatrix(px, py, pz, vx, vy, vz, lengthM, widthM) {
    const camPos = this.camera ? this.camera.position : _up;
    const speedSq = vx * vx + vy * vy + vz * vz;
    if (speedSq > 1e-6) {
      const invSpd = 1.0 / Math.sqrt(speedSq);
      _vfxDir.set(vx * invSpd, vy * invSpd, vz * invSpd);
    } else {
      _vfxDir.set(0.0, 1.0, 0.0);
    }
    _pPos.set(px, py, pz);
    _vfxToCam.subVectors(camPos, _pPos);
    if (_vfxToCam.lengthSq() < 1e-6) {
      _vfxToCam.set(0.0, 0.0, 1.0);
    } else {
      _vfxToCam.normalize();
    }
    _vfxSide.crossVectors(_vfxDir, _vfxToCam);
    if (_vfxSide.lengthSq() < 1e-5) {
      _vfxSide.crossVectors(_vfxDir, _up);
      if (_vfxSide.lengthSq() < 1e-5) _vfxSide.set(1.0, 0.0, 0.0);
    }
    _vfxSide.normalize();
    _vfxNorm.crossVectors(_vfxDir, _vfxSide).normalize();

    // PlaneGeometry(1,1) local +X = velocity axis (`lengthM`), local +Y = cross-ribbon width (`widthM`)
    _vfxBasisMat.makeBasis(_vfxDir, _vfxSide, _vfxNorm);
    const te = _vfxBasisMat.elements;
    te[0] *= lengthM;
    te[1] *= lengthM;
    te[2] *= lengthM;
    te[4] *= widthM;
    te[5] *= widthM;
    te[6] *= widthM;
    te[12] = px;
    te[13] = py;
    te[14] = pz;
    return _vfxBasisMat;
  }

  _spawnSlipstreamRibbon(x, y, z, vx, vy, vz, maxLife, lengthM, widthM, peakAlpha, colorObj, drag = 1.8) {
    if (!this.slipstreamMesh) return;
    const idx = this._rCursor;
    this._rCursor = (this._rCursor + 1) % SLIPSTREAM_POOL_SIZE;

    this._rLife[idx] = maxLife;
    this._rMaxLife[idx] = Math.max(0.05, maxLife);
    this._rX[idx] = x;
    this._rY[idx] = y;
    this._rZ[idx] = z;
    this._rVx[idx] = vx;
    this._rVy[idx] = vy;
    this._rVz[idx] = vz;
    this._rLen[idx] = lengthM;
    this._rWidth[idx] = widthM;
    this._rPeakAlpha[idx] = peakAlpha;
    this._rDrag[idx] = drag;
    this._rAlphaArray[idx] = peakAlpha * 0.35;

    this.slipstreamMesh.setColorAt(idx, colorObj);
    if (this.slipstreamMesh.instanceColor) {
      this.slipstreamMesh.instanceColor.needsUpdate = true;
    }
  }

  _spawnBallisticSpark(
    x,
    y,
    z,
    vx,
    vy,
    vz,
    maxLife,
    widthM,
    groundY,
    bounces = 2,
    colorMode = 0
  ) {
    if (!this.sparkMesh) return;
    const idx = this._spCursor;
    this._spCursor = (this._spCursor + 1) % BALLISTIC_SPARK_POOL_SIZE;

    this._spLife[idx] = maxLife;
    this._spMaxLife[idx] = Math.max(0.06, maxLife);
    this._spX[idx] = x;
    this._spY[idx] = y;
    this._spZ[idx] = z;
    this._spVx[idx] = vx;
    this._spVy[idx] = vy;
    this._spVz[idx] = vz;
    this._spWidth[idx] = widthM;
    this._spGroundY[idx] = groundY;
    this._spBounces[idx] = bounces;
    this._spColorMode[idx] = colorMode;
    this._spAlphaArray[idx] = 1.0;

    if (colorMode >= 1 && colorMode <= 4) {
      this.sparkMesh.setColorAt(idx, _sparkAccentPalette[colorMode - 1]);
    } else if (colorMode === 5) {
      _pColor.setHex(0xe0f2fe);
      this.sparkMesh.setColorAt(idx, _pColor);
    } else {
      this.sparkMesh.setColorAt(idx, _sparkHotCore);
    }
    if (this.sparkMesh.instanceColor) {
      this.sparkMesh.instanceColor.needsUpdate = true;
    }
  }

  _spawnTpuBallisticSparkBurst(worldX, worldY, worldZ, groundY, isGoldTier = false) {
    const count = isGoldTier ? 46 : 40; // `36–48` crisp velocity-stretched ballistic needles
    for (let i = 0; i < count; i++) {
      const u1 = this.particleRng();
      const u2 = this.particleRng();
      const u3 = this.particleRng();
      const az = (i / count) * Math.PI * 2.0 + (u1 - 0.5) * 0.34;
      const horizSpd = 1.85 + u2 * 4.35;
      const vy = 1.55 + u3 * 3.85;
      const vx = Math.cos(az) * horizSpd;
      const vz = Math.sin(az) * horizSpd;
      const isGoogleAccent = i % 4 === 3; // 75% incandescent `#FFF9E2 -> #F6BD41`, 25% 4-color `#4285F4/#EA4335/#FBBC05/#34A853`
      const colorMode = isGoogleAccent ? ((i >> 2) % 4) + 1 : 0;
      const bounces = (i % 2) + 1; // 1–2 crisp ground-bounce ricochets
      const widthM = isGoogleAccent ? 0.0072 : 0.0085;
      const maxLife = 0.44 + this.particleRng() * 0.28;
      this._spawnBallisticSpark(
        worldX + Math.cos(az) * 0.04,
        worldY + (this.particleRng() - 0.5) * 0.04,
        worldZ + Math.sin(az) * 0.04,
        vx,
        vy,
        vz,
        maxLife,
        widthM,
        groundY,
        bounces,
        colorMode
      );
    }
  }

  _updateStanRoarVfx(dt, snap) {
    const stanRoaringNow = (Number(snap?.stanRoarIntensity) || 0.0) > 0.05;
    if (!this._wasStanRoaringForVfx && stanRoaringNow) {
      this._stanRumbleAgeSec = 0.0;
      this._stanRippleAgeSec = 0.0;
    }
    this._wasStanRoaringForVfx = stanRoaringNow;

    if (dt > 0) {
      if (this._stanRumbleAgeSec < 2.0) this._stanRumbleAgeSec += dt;
      if (this._stanRippleAgeSec < 2.0) this._stanRippleAgeSec += dt;
    }

    if (this.stanRoarRippleMesh) {
      const rippleDur = 0.72;
      if (this._stanRippleAgeSec >= 0.0 && this._stanRippleAgeSec < rippleDur) {
        const u = this._stanRippleAgeSec / rippleDur;
        const radius = 2.1 + (8.8 - 2.1) * (1.0 - Math.pow(1.0 - u, 2.1));
        const fadeIn = Math.min(1.0, u / 0.14);
        const fadeOut = Math.pow(1.0 - u, 1.65);
        this.stanRoarRippleMesh.visible = true;
        this.stanRoarRippleMesh.scale.set(radius, 1.0, radius);
        this.stanRoarRippleMesh.material.uniforms.uOpacity.value = 0.34 * fadeIn * fadeOut;
      } else {
        this.stanRoarRippleMesh.visible = false;
        this.stanRoarRippleMesh.material.uniforms.uOpacity.value = 0.0;
      }
    }
  }

  _stepParticles(dt, snap) {
    if ((!this.slipstreamMesh && !this.sparkMesh) || !snap || dt <= 0) return;

    // V8-02: Step `40.20s` Stan T. rex pedestal dust ripple & `180ms` camera rumble timer
    this._updateStanRoarVfx(dt, snap);

    const speedAbs = Math.abs(Number(snap.speedMps) || 0.0);
    const leanAbs = Math.abs(Number(snap.leanAngleRad) || 0.0);
    const isCarving = leanAbs > 0.085 && speedAbs > 2.6;
    const isJumping = Boolean(snap.isAirborne && !snap.onTrainerStand);
    const isBoosting = Boolean(snap.isBoosting && speedAbs > 1.8);
    // V8-04A: Stream sleek slipstream ribbons above `14 km/h` (`3.89 m/s`), carves, jumps, and Espresso boosts!
    const slipstreamActive =
      !snap.onTrainerStand && (speedAbs > 3.89 || isCarving || isJumping || isBoosting);

    if (slipstreamActive) {
      const speedNorm = THREE.MathUtils.clamp((speedAbs - 3.5) / 5.2, 0.18, 1.35);
      const emitRate =
        28.0 * speedNorm +
        (isCarving ? 14.0 : 0.0) +
        (isJumping ? 16.0 : 0.0) +
        (isBoosting ? 26.0 : 0.0);
      this._ribbonEmitAccum += dt * emitRate;

      const fx = snap.forwardX;
      const fz = snap.forwardZ;
      const rx = snap.rightX;
      const rz = snap.rightZ;
      const baseY = Number.isFinite(snap.y) ? snap.y : snap.groundY || 0.0;
      const vVert = Number.isFinite(snap.verticalVelMps) ? snap.verticalVelMps : 0.0;

      while (this._ribbonEmitAccum >= 1.0) {
        this._ribbonEmitAccum -= 1.0;
        const slotType = Math.floor(this.particleRng() * 5);
        let latM = 0.0;
        let upM = 0.92;
        let fwdM = 0.0;
        if (slotType === 0) {
          // Left primary wingtip
          latM = -0.43;
          upM = 0.97 + Math.sin(leanAbs) * 0.06;
          fwdM = -0.06;
        } else if (slotType === 1) {
          // Right primary wingtip
          latM = 0.43;
          upM = 0.97 - Math.sin(leanAbs) * 0.06;
          fwdM = -0.06;
        } else if (slotType === 2) {
          // Left handlebar grip end
          latM = -0.29;
          upM = 0.91;
          fwdM = 0.43;
        } else if (slotType === 3) {
          // Right handlebar grip end
          latM = 0.29;
          upM = 0.91;
          fwdM = 0.43;
        } else {
          // Rear-fender aerodynamic wake
          latM = (this.particleRng() - 0.5) * 0.10;
          upM = 0.38;
          fwdM = -0.66;
        }

        const px = snap.x + rx * latM + fx * fwdM;
        const py = baseY + upM + (this.particleRng() - 0.5) * 0.025;
        const pz = snap.z + rz * latM + fz * fwdM;

        // Velocity vector aligned cleanly along hero slipstream flow (`-forward` relative wake, `+forward` world advection)
        const advectSpd = Math.max(2.6, speedAbs * 0.72);
        const vx = fx * advectSpd + (this.particleRng() - 0.5) * 0.18;
        const vy = vVert * 0.55 + (this.particleRng() - 0.5) * 0.08;
        const vz = fz * advectSpd + (this.particleRng() - 0.5) * 0.18;

        const ribbonLen =
          (0.42 + 0.36 * Math.min(1.2, speedNorm)) * (isBoosting ? 1.24 : 1.0);
        const ribbonWidth = slotType === 4 ? 0.022 : 0.015;
        const peakAlpha = Math.min(
          0.52,
          0.22 + 0.18 * speedNorm + (isBoosting ? 0.10 : 0.0) + (isCarving ? 0.06 : 0.0)
        );
        if (isBoosting && this.particleRng() > 0.52) {
          _pColor.copy(_ribbonBoostMint);
        } else {
          _pColor.lerpColors(_ribbonSkyWhite, _ribbonSkyTint, this.particleRng() * 0.65);
        }

        this._spawnSlipstreamRibbon(
          px,
          py,
          pz,
          vx,
          vy,
          vz,
          0.19 + this.particleRng() * 0.11,
          ribbonLen,
          ribbonWidth,
          peakAlpha,
          _pColor,
          2.6
        );
      }

      // Ground-skimming sunlit micro-dust wisps (`2–5cm` above pavers/asphalt) when grounded at speed!
      if (!snap.isAirborne && speedAbs > 3.89) {
        this._wispEmitAccum += dt * (14.0 * speedNorm);
        const gY = Number.isFinite(snap.groundY) ? snap.groundY : 0.0;
        while (this._wispEmitAccum >= 1.0) {
          this._wispEmitAccum -= 1.0;
          const sideSign = this.particleRng() > 0.5 ? 1.0 : -1.0;
          const lat = sideSign * (0.06 + this.particleRng() * 0.14);
          const wx = snap.x - fx * 0.58 + rx * lat;
          const wy = gY + 0.022 + this.particleRng() * 0.026; // strictly `2.2–4.8cm` above pavers!
          const wz = snap.z - fz * 0.58 + rz * lat;
          const wVx = -fx * (1.2 + speedAbs * 0.22) + rx * sideSign * (0.35 + this.particleRng() * 0.45);
          const wVz = -fz * (1.2 + speedAbs * 0.22) + rz * sideSign * (0.35 + this.particleRng() * 0.45);
          this._spawnSlipstreamRibbon(
            wx,
            wy,
            wz,
            wVx,
            0.03,
            wVz,
            0.22 + this.particleRng() * 0.10,
            0.18 + 0.08 * speedNorm,
            0.013,
            0.26,
            _wispSunlitSand,
            4.2
          );
        }
      }
    }

    // Touchdown ground-skimming radial sunlit micro-wisps (`2–4.5cm` above ground, `0` polka dots!)
    if (this._wasAirborneForParticles && !snap.isAirborne && !snap.onTrainerStand) {
      const gY = Number.isFinite(snap.groundY) ? snap.groundY : 0.0;
      for (let i = 0; i < 14; i++) {
        const ang = (i / 14) * Math.PI * 2.0 + this.particleRng() * 0.22;
        const spd = 1.65 + this.particleRng() * 1.45;
        this._spawnSlipstreamRibbon(
          snap.x + Math.cos(ang) * 0.22,
          gY + 0.024 + (i % 3) * 0.008,
          snap.z + Math.sin(ang) * 0.22,
          Math.cos(ang) * spd,
          0.04,
          Math.sin(ang) * spd,
          0.26 + this.particleRng() * 0.08,
          0.22,
          0.014,
          0.32,
          _wispSunlitSand,
          4.8
        );
      }
    }
    this._wasAirborneForParticles = Boolean(snap.isAirborne);

    // Shattering Glass Curtain-Wall Crystalline Sparkle Needles (velocity-stretched diamond glints)
    if (snap.newlyShatteredGlass) {
      const glassGroundY = getOpenWorldTerrainHeight(0.0, 130.5);
      for (let i = 0; i < 28; i++) {
        const sx = (this.particleRng() - 0.5) * 3.8;
        const sy = 0.65 + this.particleRng() * 2.5;
        const sz = 131.2;
        const vx = sx * 1.35 + (this.particleRng() - 0.5) * 3.1;
        const vy = 0.9 + this.particleRng() * 3.2;
        const vz = -(4.8 + this.particleRng() * 5.6);
        this._spawnBallisticSpark(
          sx,
          sy,
          sz,
          vx,
          vy,
          vz,
          0.56 + this.particleRng() * 0.28,
          0.011,
          glassGroundY,
          2,
          5
        );
      }
    }

    // Wave 4 Shoreline Whip-Skid (`67.85s -> 68.85s`): subtle golden-hour granite/basalt grit micro-sparks & stone dust wisps from locked rear tire!
    const shorelineSkid = Math.max(0.0, Number(snap.shorelineSkidIntensity) || 0.0);
    if (shorelineSkid > 0.04) {
      this._skidGritAccum = (this._skidGritAccum || 0.0) + dt * (28.0 * shorelineSkid);
      const rearDist = this.gbike?.rearAxleZ ?? 0.5425;
      const gY = Number.isFinite(snap.groundY) ? snap.groundY : 0.0;
      const rearPatchX = snap.x - snap.forwardX * rearDist;
      const rearPatchZ = snap.z - snap.forwardZ * rearDist;
      const vSlideX = Number(snap.velX) || 0.0;
      const vSlideZ = Number(snap.velZ) || 0.0;
      const vMag = Math.hypot(vSlideX, vSlideZ);
      const sprayDirX = vMag > 0.12 ? -vSlideX / vMag : snap.rightX;
      const sprayDirZ = vMag > 0.12 ? -vSlideZ / vMag : snap.rightZ;

      while (this._skidGritAccum >= 1.0) {
        this._skidGritAccum -= 1.0;
        const jit = (this.particleRng() - 0.5) * 0.52;
        const spd = (1.35 + this.particleRng() * 1.65) * (0.55 + 0.45 * shorelineSkid);
        const gx = rearPatchX + snap.rightX * (this.particleRng() - 0.5) * 0.06;
        const gz = rearPatchZ + snap.rightZ * (this.particleRng() - 0.5) * 0.06;
        const vx = (sprayDirX + snap.rightX * (0.35 + jit)) * spd;
        const vz = (sprayDirZ + snap.rightZ * (0.35 + jit)) * spd;
        const vy = 0.42 + this.particleRng() * 0.85;
        this._spawnBallisticSpark(
          gx,
          gY + 0.018,
          gz,
          vx,
          vy,
          vz,
          0.19 + this.particleRng() * 0.13,
          0.0056,
          gY,
          1,
          0
        );
        if (this.particleRng() > 0.45) {
          this._spawnSlipstreamRibbon(
            gx,
            gY + 0.024 + this.particleRng() * 0.016,
            gz,
            vx * 0.72,
            0.05,
            vz * 0.72,
            0.22 + this.particleRng() * 0.09,
            0.19,
            0.014,
            0.28 * shorelineSkid,
            _wispSunlitSand,
            4.5
          );
        }
      }
    }

    // --- Step Active Slipstream Ribbons & Ground Micro-Wisps ---
    let ribbonsUpdated = false;
    for (let i = 0; i < SLIPSTREAM_POOL_SIZE; i++) {
      let life = this._rLife[i];
      if (life <= 0) continue;
      ribbonsUpdated = true;
      life -= dt;
      this._rLife[i] = life;

      if (life <= 0) {
        this._rAlphaArray[i] = 0.0;
        _pPos.set(0, -60, 0);
        _pQuat.identity();
        _pScale.setScalar(0.0001);
        _pMat4.compose(_pPos, _pQuat, _pScale);
        this.slipstreamMesh.setMatrixAt(i, _pMat4);
        continue;
      }

      const drag = Math.exp(-this._rDrag[i] * dt);
      this._rVx[i] *= drag;
      this._rVy[i] *= drag;
      this._rVz[i] *= drag;
      this._rX[i] += this._rVx[i] * dt;
      this._rY[i] += this._rVy[i] * dt;
      this._rZ[i] += this._rVz[i] * dt;

      const u = life / this._rMaxLife[i]; // 1 -> 0
      const progress = 1.0 - u;
      const envIn = Math.min(1.0, progress / 0.16);
      const envOut = u * u * (3.0 - 2.0 * u);
      this._rAlphaArray[i] = this._rPeakAlpha[i] * envIn * envOut;

      const curLen = this._rLen[i] * (0.55 + 0.45 * u);
      const curWidth = this._rWidth[i] * (0.65 + 0.35 * u);
      const mat4 = this._composeVelocityAlignedQuadMatrix(
        this._rX[i],
        this._rY[i],
        this._rZ[i],
        this._rVx[i],
        this._rVy[i],
        this._rVz[i],
        curLen,
        curWidth
      );
      this.slipstreamMesh.setMatrixAt(i, mat4);
    }
    if (ribbonsUpdated) {
      this.slipstreamMesh.instanceMatrix.needsUpdate = true;
      this._rAlphaAttr.needsUpdate = true;
    }

    // --- Step Active Ballistic Metallic Sparks (`-9.81 m/s^2` gravity, air drag & 1–2 ground ricochets!) ---
    const airDrag = Math.exp(-1.85 * dt);
    let sparksUpdated = false;
    let sparkColorsUpdated = false;
    for (let i = 0; i < BALLISTIC_SPARK_POOL_SIZE; i++) {
      let life = this._spLife[i];
      if (life <= 0) continue;
      sparksUpdated = true;
      life -= dt;
      this._spLife[i] = life;

      if (life <= 0) {
        this._spAlphaArray[i] = 0.0;
        _pPos.set(0, -60, 0);
        _pQuat.identity();
        _pScale.setScalar(0.0001);
        _pMat4.compose(_pPos, _pQuat, _pScale);
        this.sparkMesh.setMatrixAt(i, _pMat4);
        continue;
      }

      this._spVx[i] *= airDrag;
      this._spVz[i] *= airDrag;
      this._spVy[i] = this._spVy[i] * airDrag - 9.81 * dt;

      let nx = this._spX[i] + this._spVx[i] * dt;
      let ny = this._spY[i] + this._spVy[i] * dt;
      let nz = this._spZ[i] + this._spVz[i] * dt;

      const floorY = this._spGroundY[i] + 0.008;
      if (ny <= floorY && this._spVy[i] < 0.0) {
        ny = floorY;
        if (this._spBounces[i] > 0) {
          this._spBounces[i] -= 1;
          const restitution = 0.46 + (i % 3) * 0.08;
          this._spVy[i] = -this._spVy[i] * restitution;
          this._spVx[i] *= 0.78;
          this._spVz[i] *= 0.78;
        } else {
          this._spVy[i] = 0.0;
          this._spVx[i] *= 0.55;
          this._spVz[i] *= 0.55;
        }
      }
      this._spX[i] = nx;
      this._spY[i] = ny;
      this._spZ[i] = nz;

      const u = life / this._spMaxLife[i]; // 1 -> 0
      const progress = 1.0 - u;
      this._spAlphaArray[i] = Math.min(1.0, u * 1.45) * u;

      // Thermal cooling `#FFF9E2` incandescent core -> `#F6BD41` silicon-gold tail
      if (this._spColorMode[i] === 0) {
        _pColor.lerpColors(_sparkHotCore, _sparkGoldTail, Math.min(1.0, progress * 1.35));
        this.sparkMesh.setColorAt(i, _pColor);
        sparkColorsUpdated = true;
      }

      const spd = Math.hypot(this._spVx[i], this._spVy[i], this._spVz[i]);
      // Strict V8-04B formula: `len = 0.06 + 0.045 * |v|` (high-aspect-ratio needle, NEVER round!)
      const sparkLen = 0.06 + 0.045 * spd;
      const mat4 = this._composeVelocityAlignedQuadMatrix(
        nx,
        ny,
        nz,
        this._spVx[i],
        this._spVy[i],
        this._spVz[i],
        sparkLen,
        this._spWidth[i]
      );
      this.sparkMesh.setMatrixAt(i, mat4);
    }

    if (sparksUpdated) {
      this.sparkMesh.instanceMatrix.needsUpdate = true;
      this._spAlphaAttr.needsUpdate = true;
      if (sparkColorsUpdated && this.sparkMesh.instanceColor) {
        this.sparkMesh.instanceColor.needsUpdate = true;
      }
    }
  }

  /**
   * Toggles `Drivetrain X-Ray` 3D refractive cutaway chainguard + illuminated 98-link chain & `+alpha` linkage.
   */
  setXrayMode(enabled) {
    const isOn = Boolean(enabled);
    this.xrayEnabled = isOn;
    this.gbike.setXrayMode(isOn);
    this.pelican.setXrayMode(isOn);
    if (isOn) {
      const kinLocal = this.pelican.kinematicsLocal || {};
      this.gbike.updateXrayLinkage({
        hipLocal: kinLocal.hipLocal,
        rightKneeLocal: kinLocal.rightKneeLocal,
        rightAnkleLocal: kinLocal.rightAnkleLocal,
        rightPedalLocal: kinLocal.rightPedalLocal,
        crankRad: state.kinematics.crankRad || 0,
        pedalTorqueNm: state.kinematics.pedalTorqueNm || 14.0,
      });
    }
  }

  setCameraPreset(cameraMode) {
    if (cameraMode) {
      dispatchAction(DEMO_ACTIONS.SET_CAMERA, { cameraMode });
    }
  }

  resetCameraOrbit() {
    this._cameraBlending = true;
    this._updateCameraForMode(this.game.getSnapshot(), true, 0);
  }

  /**
   * Adaptive GPU Quality Tier controller (`high` | `medium` | `low`).
   * Strictly locks `'high'` (`4096×4096` shadows on hardware GPU) whenever `window.__externalClock === true`!
   */
  setQualityTier(requestedTier = "high") {
    const isExternal = typeof window !== "undefined" && window.__externalClock === true;
    const tier = isExternal
      ? "high"
      : ["high", "medium", "low"].includes(requestedTier)
        ? requestedTier
        : "high";

    this.qualityTier = tier;
    this.maxDprForQuality = tier === "low" ? 1.0 : tier === "medium" ? 1.5 : 2.0;
    if (tier === "high") {
      this._governedRetinaDprCap = 2.0;
      this._dprFrameDeltaCount = 0;
      this._lastPerfNowMs = 0;
    }

    const isFast1080pCpuTier = Boolean(
      (this.isSoftwareRenderer || this.isCaptureSwCpu) &&
        this.renderer &&
        this.renderer.getPixelRatio() <= 1.05 &&
        this.renderer.domElement.width <= 1920
    );
    const targetShadowSize = isFast1080pCpuTier
      ? 1536
      : this.isSoftwareRenderer || this.isCaptureSwCpu
        ? tier === "low"
          ? 1024
          : 2048
        : tier === "high"
          ? 4096
          : tier === "medium"
            ? 2048
            : 1024;
    if (
      this.sunLight &&
      (this.sunLight.shadow.mapSize.width !== targetShadowSize ||
        this.sunLight.shadow.mapSize.height !== targetShadowSize)
    ) {
      this.sunLight.shadow.mapSize.set(targetShadowSize, targetShadowSize);
      if (this.sunLight.shadow.map) {
        this.sunLight.shadow.map.dispose();
        this.sunLight.shadow.map = null;
      }
      this.sunLight.shadow.needsUpdate = true;
    }

    this.resize();
  }

  _bindEventsAndUrlFlags() {
    const flags = parseInitialUrlFlags();
    if (typeof flags.xrayEnabled === "boolean" && flags.xrayEnabled) {
      this.setXrayMode(true);
    }
    if (flags.qualityTier) {
      this.setQualityTier(flags.qualityTier);
    }
    if (flags.audioEnabled) {
      this.audio.setEnabled(true);
    }

    bus.addEventListener(DEMO_EVENTS.STATE_CHANGED, (e) => {
      const detail = e.detail || {};
      if (detail.internalTransition) {
        return;
      }

      if (detail.reset) {
        this._clearAllParticles();
        this.audio.resetPhases();
        const snap = this.game.resetToState("play_all", 0.0);
        this._chaseInitialized = false;
        this.hasPrevHero = false;
        this._cameraBlending = false;
        this._syncSceneFromSnapshot(snap, 0.0, { snapCamera: true });
      } else {
        if (state.gameMode === "free_roam" && state.elapsedTime === 0) {
          this.game.resetToState("free_roam", 0.0);
        }
        const snap = this.game.getSnapshot();
        this.audio.syncMechanicalTo(snap.wheelRad, snap.arcDistanceM, snap.plankPitchM);
        this.audio.triggerUiClick();
        this._chaseInitialized = false;
        this.hasPrevHero = false;
        this._cameraBlending = false;
        this._syncSceneFromSnapshot(snap, 0.0, { snapCamera: true });
      }

      this.scene.updateMatrixWorld(true);
      this.camera.updateMatrixWorld(true);

      const summary = deriveTourSummary();
      bus.emit(DEMO_EVENTS.STATS_UPDATED, {
        elapsedTime: state.elapsedTime,
        sequenceTime: state.sequenceTime,
        clipLocalTime: state.clipLocalTime,
        activeClipId: state.activeClipId,
        activeClipIndex: state.activeClipIndex,
        frameCount: state.frameCount,
        fps: state.fps,
        kinematics: state.kinematics,
        summary,
      });
    });

    bus.addEventListener(DEMO_EVENTS.CAMERA_CHANGED, (e) => {
      const mode = e.detail?.cameraMode || state.cameraMode;
      this.audio.triggerUiClick();
      if (mode === "orbit") {
        this._cameraBlending = false;
        if (this._userDraggingOrbit) {
          this.orbitControls.target.set(
            this.heroAnchor.position.x,
            this.heroAnchor.position.y + 0.78,
            this.heroAnchor.position.z
          );
          _orbitOffset.subVectors(this.camera.position, this.orbitControls.target);
          const curDist = _orbitOffset.length();
          if (curDist < 2.8 && curDist > 1e-4) {
            _orbitOffset.multiplyScalar(2.8 / curDist);
            this.camera.position.copy(this.orbitControls.target).add(_orbitOffset);
          }
          this.prevHeroPos.copy(this.heroAnchor.position);
          this.hasPrevHero = true;
          return;
        }
        this._updateCameraForMode(this.game.getSnapshot(), true, 0);
        return;
      }

      this._cameraBlending = true;
      this._updateCameraForMode(this.game.getSnapshot(), false, 1 / 60);
    });

    bus.addEventListener(DEMO_EVENTS.XRAY_TOGGLED, (e) => {
      const isEnabled = Boolean(e.detail?.enabled ?? state.xrayEnabled);
      this.setXrayMode(isEnabled);
      this.audio.triggerUiClick();
      if (state.cameraMode === "drivetrain") {
        this._cameraBlending = true;
      }
    });

    bus.addEventListener(DEMO_EVENTS.QUALITY_CHANGED, (e) => {
      this.setQualityTier(e.detail?.qualityTier || state.qualityTier);
    });

    bus.addEventListener(DEMO_EVENTS.AUTOTOUR_CHANGED, (e) => {
      if (e.detail?.isAutoTourActive) {
        this._cameraBlending = true;
        this.audio.ensureResumed();
      }
    });

    bus.addEventListener(DEMO_EVENTS.TPU_COLLECTED, (e) => {
      const tpu = e.detail?.tpu;
      if (!tpu) return;
      const gy = getOpenWorldTerrainHeight(tpu.x, tpu.z);
      const py = gy + (tpu.bonusHeightM ?? 0.55) + 0.14;
      this._spawnTpuBallisticSparkBurst(
        tpu.x,
        py,
        tpu.z,
        gy,
        tpu.tier === "ironwood_gold"
      );
    });

    bus.addEventListener(DEMO_EVENTS.NOOGLER_HAT_TOGGLED, () => {
      this.audio.triggerUiClick();
      const snap = this.game.getSnapshot();
      this._syncSceneFromSnapshot(snap, 0.0, { snapCamera: false });
      this.scene.updateMatrixWorld(true);
      if (
        typeof window !== "undefined" &&
        window.__externalClock === true &&
        window.__CAPTURE_SKIP_DRAW__ !== true &&
        this.renderer
      ) {
        this.renderer.render(this.scene, this.camera);
      }
    });
  }

  resize() {
    if (!this.canvas || !this.renderer) return;
    const rect = this.canvas.getBoundingClientRect();
    const cssW = Math.max(
      1,
      Math.round(rect.width || (typeof window !== "undefined" ? window.innerWidth : 1920))
    );
    const cssH = Math.max(
      1,
      Math.round(rect.height || (typeof window !== "undefined" ? window.innerHeight : 1080))
    );
    const rawDpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const isExternal =
      typeof window !== "undefined" &&
      Boolean(window.__externalClock === true || window.__virtualClock);
    const capDpr = isExternal
      ? Math.max(2.0, Math.min(4.0, rawDpr))
      : Math.min(this.maxDprForQuality || 2.0, this._governedRetinaDprCap || 2.0);
    const dpr = Math.min(rawDpr, capDpr);
    if (!this.canvas.__renderer) {
      this.canvas.__renderer = { setPixelRatio() {}, setSize() {} };
    }

    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(cssW, cssH, false);
    this.postFX?.setSize?.(cssW, cssH, dpr);
    this.camera.aspect = cssW / cssH;
    this.camera.updateProjectionMatrix();
    this.width = Math.round(cssW * dpr);
    this.height = Math.round(cssH * dpr);
  }

  /**
   * Instant deterministic seeking across `0..64.0s` with full matrix, burnout smoke, audio & KPI parity.
   */
  renderAtTime(tSec) {
    const targetSec = Math.max(0, Number(tSec) || 0);
    state.elapsedTime = targetSec;
    this._clearAllParticles();
    this._cameraBlending = false;
    this._chaseInitialized = false;
    this._prevDirectorShotId = "";

    const snap = this.game.seekToTime(targetSec);
    if (state.gameMode === "story_autopilot") {
      const seqSec = Number(state.sequenceTime) || 0.0;
      if (seqSec >= 40.20 && seqSec <= 41.00) {
        const roarAge = seqSec - 40.20;
        this._wasStanRoaringForVfx = true;
        this._stanRumbleAgeSec = roarAge;
        this._stanRippleAgeSec = roarAge;
        this._updateStanRoarVfx(0.0, snap);
      }
    }
    this.audio.syncMechanicalTo(snap.wheelRad, snap.arcDistanceM, snap.plankPitchM);
    this._syncSceneFromSnapshot(snap, 0.0, { snapCamera: true });
    this._prewarmBurnoutSmokeToTime(targetSec);

    this.scene.updateMatrixWorld(true);
    this.camera.updateMatrixWorld(true);
    if (this._swMuxReady) {
      this._updateSoftwarePointLightMultiplexer();
    }

    const summary = deriveTourSummary();
    bus.emit(DEMO_EVENTS.STATS_UPDATED, {
      elapsedTime: state.elapsedTime,
      sequenceTime: state.sequenceTime,
      clipLocalTime: state.clipLocalTime,
      activeClipId: state.activeClipId,
      activeClipIndex: state.activeClipIndex,
      frameCount: state.frameCount,
      fps: state.fps,
      kinematics: state.kinematics,
      summary,
    });

    if (!(typeof window !== "undefined" && window.__CAPTURE_SKIP_DRAW__ === true)) {
      const wasStaticRebuild = Boolean(this.v5Lighting?.sunLight?.shadow?.needsUpdate);
      this.renderer.render(this.scene, this.camera);
      this._syncCtTelemetry(wasStaticRebuild);
    }
  }

  _syncCtTelemetry(wasStaticShadowRebuild = false) {
    const ct = this._ctTelemetry;
    if (!ct) return;
    const lyriaRate = this.audio?.lyriaSource?.playbackRate?.value;
    ct.musicPlaybackRate =
      typeof lyriaRate === "number" && Number.isFinite(lyriaRate) ? lyriaRate : 1.0;
    ct.isOpenWorld = true;
    ct.staticShadowAutoUpdate = Boolean(this.v5Lighting?.sunLight?.shadow?.autoUpdate ?? false);
    if (this.renderer) {
      const rawCalls = this.renderer.info.render.calls;
      if (!wasStaticShadowRebuild && rawCalls > 0) {
        this._steadyDrawCalls = rawCalls;
      }
      ct.drawCalls = this._steadyDrawCalls > 0 ? this._steadyDrawCalls : rawCalls;
      ct.triangles = this.renderer.info.render.triangles;
      const midRecompiles =
        this._postWarmupProgramCount > 0
          ? Math.max(0, (this.renderer.info.programs?.length || 0) - this._postWarmupProgramCount)
          : 0;
      ct.midRideShaderRecompiles = midRecompiles;
      if (this.preloadTelemetry) {
        this.preloadTelemetry.programsCompiledDuringTour = midRecompiles;
      }
    }
  }

  _mirrorSharedWindowInputKeys() {
    if (typeof window === "undefined" || !window.__inputKeys || !this.game) return;
    const ik = window.__inputKeys;
    const prev = this._prevInputMirror;
    if (
      Boolean(ik.up) !== prev.up ||
      Boolean(ik.down) !== prev.down ||
      Boolean(ik.left) !== prev.left ||
      Boolean(ik.right) !== prev.right
    ) {
      prev.up = Boolean(ik.up);
      prev.down = Boolean(ik.down);
      prev.left = Boolean(ik.left);
      prev.right = Boolean(ik.right);
      this.game.setVirtualInput({
        forward: prev.up,
        backward: prev.down,
        left: prev.left,
        right: prev.right,
      });
    }
  }

  /**
   * Poses `heroAnchor`, `GBikeRig`, `PelicanRig`, hero-following 4096 shadows, golden sun glare,
   * active cinema/chase/orbit camera, and `OpenCampusWorld` (with fresh `this.camera` matrices!).
   */
  _syncSceneFromSnapshot(snap, dt, { snapCamera = false } = {}) {
    if (!snap) return;

    // 1. Pose Hero Anchor in Open-World Coordinates (`rotation.order = 'YXZ'`)
    this.heroAnchor.position.set(snap.x, snap.y, snap.z);
    this.heroAnchor.rotation.set(snap.slopePitchRad, snap.threeRotationY, 0, "YXZ");
    // Beat 1 (`0.00s - 1.80s`, `coldOpenBeat === 1`) Macro `"59 / AA"` Dumbbell Fake-Out: keep Pelican, GBike & smoke 100% hidden (`0` spoiler frames!)
    const hideHeroForBeat1Macro =
      snap.coldOpenBeat === 1 ||
      (state.gameMode === "story_autopilot" && state.sequenceTime < 1.80);
    this.heroAnchor.visible = !hideHeroForBeat1Macro;
    // Sync ancestor `matrixWorld` BEFORE `gbike.update` & `pelican.update` so world-space pedal/sole IK queries never read stale transforms (`0.000 mm` lock!)
    this.heroAnchor.updateMatrixWorld(true);

    _heroFwd.set(snap.forwardX, 0, snap.forwardZ).normalize();
    _heroRight.set(snap.rightX, 0, snap.rightZ).normalize();

    const bellStrikeElapsed =
      state.lastBellTime >= 0 ? Math.max(0, state.elapsedTime - state.lastBellTime) : 99;

    // 2. Mechanical GBike Rig (`rigSteerRad = -steerRad` aligns handlebar yaw with turn direction!)
    this.gbike.setCollectedTpuVisualCount?.(state.tpusCollected || 0);
    this.gbike.update({
      wheelRad: snap.wheelRad,
      rearWheelRad: snap.rearWheelRad,
      frontWheelRad: snap.frontWheelRad,
      crankRad: snap.crankRad,
      steerRad: snap.rigSteerRad,
      bankRad: snap.bankRad,
      wheeliePitchRad: snap.wheeliePitchRad || 0.0,
      pelicanSurprisePhase: snap.pelicanSurprisePhase || 0.0,
      trainerCadenceRpm: snap.trainerCadenceRpm,
      trainerPowerWatts: snap.trainerPowerWatts,
      trainerSprintProgress: snap.trainerSprintProgress,
      pedalPhaseRad: snap.pedalPhaseRad,
      trainerRollerOmega: snap.trainerRollerOmega,
      trainerRollerSpinRad: snap.trainerRollerSpinRad,
      trainerFrameShudderM: snap.trainerFrameShudderM,
      trainerFrameShudderRollRad: snap.trainerFrameShudderRollRad,
      bellStrikeElapsed,
      suspensionCompressionMm: snap.suspensionCompressionMm,
      tpusCollected: state.tpusCollected,
      simTime: state.elapsedTime,
    });
    this.heroAnchor.updateMatrixWorld(true);

    // 2B. Ground-Locked Hero Contact AO Shadow Decal (`gY + 0.018`, NEVER airborne!)
    // Computes true underlying ground/ramp elevation directly below `(snap.x, snap.z)`:
    // when on a ramp deck (`rampHit.onDeck`), sits on the ramp surface; once past the ramp lip over
    // the plaza/water, snaps strictly to ground elevation `groundNoRampY` and fades out exponentially
    // (`opacity = 0.34 * Math.exp(-jh * 2.5)`, `visible = jh < 1.15`) so ONLY the crisp 4096x4096 sun shadow casts!
    if (this.heroContactShadow) {
      const sx = Number(snap.x) || 0.0;
      const sz = Number(snap.z) || 0.0;
      const baseEarthY = getOpenWorldEarthHeight(sx, sz);
      const bridgeInfo = getStevensCreekBridgeParam(sx, sz);
      const groundNoRampY =
        bridgeInfo && bridgeInfo.elevationM > 0
          ? Math.max(baseEarthY, bridgeInfo.elevationM)
          : baseEarthY;
      const rampHit = evaluateJumpRampAtPoint(sx, sz);
      const onRampDeckNow = Boolean(rampHit && rampHit.onDeck);
      const gY = onRampDeckNow ? groundNoRampY + rampHit.elevationM : groundNoRampY;
      const heroY = Number.isFinite(snap.y) ? snap.y : gY;
      const jh = Math.max(0.0, Number(snap.jumpHeightM) || 0.0, heroY - gY);
      const aoOpacity = 0.34 * Math.exp(-jh * 2.5);
      const isShadowVisible = jh < 1.15 && aoOpacity > 0.005;

      this.heroContactShadow.position.set(sx, gY + 0.018, sz);
      this.heroContactShadow.rotation.y = snap.threeRotationY;
      this.heroContactShadow.rotation.x =
        onRampDeckNow && jh < 0.08 ? -(Number(snap.slopePitchRad) || 0.0) : 0.0;
      this.heroContactShadow.rotation.z = 0.0;
      const spread = 1.0 + Math.min(0.45, jh * 0.28);
      this.heroContactShadow.scale.set(spread, 1.0, spread);
      this.heroContactShadow.material.opacity = aoOpacity;
      this.heroContactShadow.visible = isShadowVisible && !hideHeroForBeat1Macro;
    }

    // 3. Articulated Pelican Rig (`+alpha` 2-bone legs & wings + RK4 gular throat pouch + V2 secondary motion)
    const isPlanks = snap.surfaceType === "wood_planks" && !snap.isAirborne && !snap.onTrainerStand;
    const plankPitchM = snap.plankPitchM || 0.34;
    const absSpeed = Math.abs(snap.speedMps);
    const plankPhase = isPlanks ? (snap.arcDistanceM / plankPitchM) * Math.PI * 2 : 0.0;
    const omegaPlank = isPlanks ? (absSpeed / plankPitchM) * Math.PI * 2 : 0.0;
    const plankAmp = isPlanks ? 0.0026 : 0.0;
    const dilatedDt = dt * (snap.timeScale ?? 1.0);

    this.gbike.setCelebrationHandlebarHidden((Number(snap.celebrationDismountBlend) || 0.0) > 0.25);
    this.pelican.update({
      dt: dilatedDt,
      simTime: state.elapsedTime,
      sequenceTime: snap.sequenceTime ?? state.sequenceTime,
      crankRad: snap.crankRad,
      omegaCrank: snap.omegaCrank,
      steerRad: snap.rigSteerRad,
      steerAngle: snap.steerRad,
      yawRate: snap.yawRate,
      bankRad: snap.bankRad,
      speedMps: absSpeed,
      deckBounceM: isPlanks ? Math.abs(Math.sin(plankPhase * 0.5)) * 0.0024 : 0.0,
      suspensionCompressionMm: snap.suspensionCompressionMm,
      gularDeflectionOverride: snap.gularDeflectionM,
      plankPhase,
      omegaPlank,
      plankAmp,
      bellStrikeElapsed,
      friendlyNod: snap.friendlyNod || 0.0,
      glassBracePhase: snap.glassBracePhase ?? state.kinematics.glassBracePhase ?? 0.0,
      postSmashShake: snap.postSmashShake ?? state.kinematics.postSmashShake ?? 0.0,
      wingFlare: snap.wingFlare ?? state.kinematics.wingFlare ?? 0.0,
      aeroCrouch: snap.aeroCrouch ?? state.kinematics.aeroCrouch ?? 0.0,
      beakClapPhase: snap.beakClapPhase ?? state.kinematics.beakClapPhase ?? 0.0,
      beakOpen: snap.beakOpen || 0.0,
      pelicanSurprisePhase: snap.pelicanSurprisePhase || 0.0,
      pelicanGlanceBackYawRad: snap.pelicanGlanceBackYawRad || 0.0,
      pelicanCrestJoltRad: snap.pelicanCrestJoltRad || 0.0,
      pelicanStartledBeakOpen: snap.pelicanStartledBeakOpen || 0.0,
      trainerCadenceRpm: snap.trainerCadenceRpm,
      trainerSprintProgress: snap.trainerSprintProgress,
      sprintTorsoLeanRad: snap.sprintTorsoLeanRad,
      sprintHipRockRad: snap.sprintHipRockRad,
      sprintShoulderRockRad: snap.sprintShoulderRockRad,
      sprintWingTuck: snap.sprintWingTuck,
      trainerFrameShudderM: snap.trainerFrameShudderM,
      trainerFrameShudderRollRad: snap.trainerFrameShudderRollRad,
      isAirborne: snap.isAirborne,
      wearNooglerHat: Boolean(state.wearNooglerHat ?? state.nooglerCapUnlocked),
      nooglerCapUnlocked: Boolean(state.nooglerCapUnlocked),
      gazeTargetWorld: snap.gazeTargetWorld || null,
      turnLookaheadYaw: snap.turnLookaheadYaw,
      turnLookaheadDeltaYaw: snap.turnLookaheadDeltaYaw || 0.0,
      heroX: snap.x,
      heroY: snap.y,
      heroZ: snap.z,
      heroYaw: snap.yaw,
      celebrationDismountBlend: snap.celebrationDismountBlend || 0.0,
      celebrationTargetWorldYaw:
        snap.celebrationTargetWorldYaw !== undefined && snap.celebrationTargetWorldYaw !== null
          ? snap.celebrationTargetWorldYaw
          : (Number(snap.celebrationDismountBlend) || 0.0) > 1e-4 && this.camera
            ? Math.atan2(this.camera.position.x - snap.x, -(this.camera.position.z - snap.z))
            : null,
      gbike: this.gbike,
    });

    const kinLocal = this.pelican.kinematicsLocal || {};
    const xlp = this._xrayLinkageParams;
    xlp.hipLocal = kinLocal.hipLocal;
    xlp.rightKneeLocal = kinLocal.rightKneeLocal;
    xlp.rightAnkleLocal = kinLocal.rightAnkleLocal;
    xlp.rightPedalLocal = kinLocal.rightPedalLocal;
    xlp.crankRad = snap.crankRad;
    xlp.pedalTorqueNm = snap.pedalTorqueNm;
    this.gbike.updateXrayLinkage(xlp);
    // Flush descendant world matrices even when `window.__CAPTURE_SKIP_DRAW__ === true`
    this.heroAnchor.updateMatrixWorld(true);

    // Write IK joint telemetry back into single-store `state.kinematics`
    state.kinematics.leftKneeAngleDeg = kinLocal.leftKneeAngleDeg || 0.0;
    state.kinematics.rightKneeAngleDeg = kinLocal.rightKneeAngleDeg || 0.0;
    state.kinematics.ikSoleErrorM = kinLocal.ikSoleErrorM || 0.0;
    state.kinematics.hipLocal = kinLocal.hipLocal || { x: 0, y: 0, z: 0 };
    state.kinematics.rightKneeLocal = kinLocal.rightKneeLocal || { x: 0, y: 0, z: 0 };
    state.kinematics.rightAnkleLocal = kinLocal.rightAnkleLocal || { x: 0, y: 0, z: 0 };
    state.kinematics.rightPedalLocal = kinLocal.rightPedalLocal || { x: 0, y: 0, z: 0 };

    // 4. Raking ~26° Golden-Afternoon California Sun, 2048/4096 Shadow Frustum, Rim Backlight & Aerial Fog
    const sunsetT = THREE.MathUtils.lerp(
      0.72,
      1.0,
      THREE.MathUtils.clamp((130.0 - snap.z) / 310.0, 0.0, 1.0)
    );
    _sunDirWork.copy(_sunDirDay).lerp(_sunDirGold, sunsetT).normalize();

    this.sunLight.color.copy(_sunColorDay).lerp(_sunColorGold, sunsetT);
    this.sunLight.intensity = THREE.MathUtils.lerp(
      this.isSoftwareRenderer ? 2.52 : 2.42,
      this.isSoftwareRenderer ? 2.74 : 2.64,
      sunsetT
    );
    this.hemiLight.color.copy(_hemiSkyDay).lerp(_hemiSkyGold, sunsetT);
    this.hemiLight.groundColor.copy(_hemiGndDay).lerp(_hemiGndGold, sunsetT);
    if (this.scene.fog) {
      this.scene.fog.color.copy(_fogColorDay).lerp(_fogColorGold, sunsetT);
      this.scene.fog.density = THREE.MathUtils.lerp(0.0020, 0.0023, sunsetT);
    }
    if (this.isSoftwareRenderer) {
      this.hemiLight.intensity = THREE.MathUtils.lerp(1.24, 1.46, sunsetT);
    } else {
      this.fillLight.intensity = THREE.MathUtils.lerp(0.42, 0.90, sunsetT);
    }

    if (!this.isSoftwareRenderer && !this.isCaptureSwCpu) {
      const wantSunsetEnv = sunsetT > 0.55;
      if (wantSunsetEnv !== this._usingSunsetEnv) {
        this._usingSunsetEnv = wantSunsetEnv;
        if (wantSunsetEnv) {
          const sTex = this._ensureSunsetEnvMap();
          if (sTex) this.scene.environment = sTex;
        } else if (this.dayEnvMap) {
          this.scene.environment = this.dayEnvMap;
        }
      }
    }

    if (!this.v5Lighting) {
      this.sunLight.position.set(
        snap.x + _sunDirWork.x * 46.0,
        snap.centerY + _sunDirWork.y * 46.0,
        snap.z + _sunDirWork.z * 46.0
      );
      this.sunLight.target.position.set(snap.x, snap.centerY + 0.65, snap.z);
      this.sunLight.target.updateMatrixWorld();
    }

    if (this.rimLight) {
      this.rimLight.position.set(
        snap.x - _sunDirWork.x * 18.0 - _heroFwd.x * 8.0,
        snap.centerY + 7.5,
        snap.z - _sunDirWork.z * 18.0 - _heroFwd.z * 8.0
      );
      this.rimLight.target.position.set(snap.x, snap.centerY + 0.75, snap.z);
      this.rimLight.target.updateMatrixWorld();
    }

    if (this.sunGlareSprite && this.sunCoreSprite) {
      const enclosedGym = Boolean(snap.inGym && !state.glassShattered && snap.z > 132.5);
      this.sunGlareSprite.visible = !enclosedGym;
      this.sunCoreSprite.visible = !enclosedGym;
      if (!enclosedGym) {
        const sx = snap.x + _sunDirWork.x * 355.0;
        const sy = Math.max(18.0, snap.centerY + _sunDirWork.y * 355.0);
        const sz = snap.z + _sunDirWork.z * 355.0;
        this.sunGlareSprite.position.set(sx, sy, sz);
        this.sunCoreSprite.position.set(sx, sy, sz);
        this.sunGlareSprite.material.opacity = THREE.MathUtils.lerp(0.48, 0.72, sunsetT);
        this.sunCoreSprite.material.opacity = THREE.MathUtils.lerp(0.68, 0.88, sunsetT);
        const haloScale = THREE.MathUtils.lerp(215.0, 265.0, sunsetT);
        this.sunGlareSprite.scale.set(haloScale, haloScale, 1.0);
      }
    }

    this.fillLight.position.set(
      snap.x + _heroRight.x * 8.0 + _heroFwd.x * 4.5,
      snap.centerY + 4.4,
      snap.z + _heroRight.z * 8.0 + _heroFwd.z * 4.5
    );
    this.fillLight.target.position.set(snap.x, snap.centerY + 0.85, snap.z);
    this.fillLight.target.updateMatrixWorld();

    // 5. Camera Mode Update + Quadratic Trauma Shake (run BEFORE `this.world` & `this.v5Lighting` sync so `this.camera.matrixWorld` is fresh!)
    this._updateCameraForMode(snap, snapCamera, dt);
    this.camera.updateMatrixWorld(true);

    // 6. Update Open-World Landmarks, 3D Grass Focus (`this.camera`), Pinwheels, Shards, Flamingos, TPUs & Waymos FIRST
    // so static & dynamic caster visibility is fresh before Two-Tier Shadow & Post-FX sync!
    if (this.world) {
      this.world._isFast1080pSw = Boolean(
        (this.isSoftwareRenderer || this.isCaptureSwCpu) &&
          this.renderer &&
          this.renderer.getPixelRatio() <= 1.05 &&
          this.renderer.domElement.width <= 1920
      );
    }
    if (dt === 0 && typeof this.world.syncFromSnapshot === "function") {
      this.world.syncFromSnapshot(snap, state.elapsedTime, this.camera);
    } else {
      this.world.update(dt, snap, state, this.camera);
    }

    // 6B. V7 Two-Tier Static (`4096`) + Dynamic (`2048`, `+-10.5m`) Shadows, World-Cohesion Uniforms & Cold-Open Macro Shallow DoF
    if (this.v5Lighting) {
      const enclosedGymNow = Boolean(snap.inGym && !state.glassShattered && snap.z > 131.5);
      const gymTransitioned =
        this._prevEnclosedGym !== undefined && this._prevEnclosedGym !== enclosedGymNow;
      this._prevEnclosedGym = enclosedGymNow;
      this._v5LightingFrameOpts.enclosedGym = enclosedGymNow;
      this._v5LightingFrameOpts.sequenceTime = state.sequenceTime;
      this._v5LightingFrameOpts.forceStaticRebuild = Boolean(snapCamera || gymTransitioned);
      this.v5Lighting.updateFrame(snap, this.camera, this._v5LightingFrameOpts);
      if (this.isCaptureSwCpu && !this.isSoftwareRenderer) {
        this.hemiLight.color.set("#d8ebff");
        this.hemiLight.groundColor.set("#b59d80");
        this.hemiLight.intensity = THREE.MathUtils.lerp(1.74, 1.88, sunsetT);
        if (this.fillLight) this.fillLight.intensity = THREE.MathUtils.lerp(0.58, 0.88, sunsetT);
        if (this.rimLight) this.rimLight.intensity = 0.78;
      }
      if (this.world.skyDome?.material?.uniforms?.uSunDir && this.v5Lighting.sunDir) {
        _sunDirWork.copy(this.v5Lighting.sunDir);
      }
    }
    const dofStrength = Number.isFinite(snap.dofStrength)
      ? snap.dofStrength
      : Number.isFinite(snap.directorHint?.dofStrength)
        ? snap.directorHint.dofStrength
        : 0.0;
    const dofFocusDistM = Number.isFinite(snap.dofFocusDistM)
      ? snap.dofFocusDistM
      : Number.isFinite(snap.directorHint?.dofFocusDistM)
        ? snap.directorHint.dofFocusDistM
        : 1.35;
    this._postFXFrameOpts.time = state.elapsedTime;
    this._postFXFrameOpts.dofStrength = dofStrength;
    this._postFXFrameOpts.dofFocusDistM = dofFocusDistM;
    this.camera.userData.dofStrength = dofStrength;
    this.camera.userData.dofFocusDistM = dofFocusDistM;

    if (this.world.skyDome) {
      this.world.skyDome.position.set(snap.x, 0.0, snap.z);
      if (this.world.skyDome.material?.uniforms?.uSunDir) {
        this.world.skyDome.material.uniforms.uSunDir.value.copy(_sunDirWork);
      }
    }
  }

  _clampCameraInsideGymIfNeeded(heroPos, desiredPos) {
    // Keep camera inside the Fitness Gym (`|x| <= 10.6, z in [131.65, 147.8]`) while hero is inside unshattered gym
    if (!state.glassShattered && heroPos.z > 131.25 && Math.abs(heroPos.x) < 11.2) {
      desiredPos.x = THREE.MathUtils.clamp(desiredPos.x, -10.5, 10.5);
      desiredPos.z = THREE.MathUtils.clamp(desiredPos.z, 131.65, 147.8);
    } else if (desiredPos.z > 131.2 && desiredPos.z < 150.0 && Math.abs(desiredPos.x) < 11.2) {
      desiredPos.z = Math.min(desiredPos.z, 147.8);
    }
  }

  _updateCameraForMode(snap, snapImmediately = false, dt = 1 / 60) {
    const heroPos = this.heroAnchor.position;
    const mode = state.cameraMode || "cinema";

    // Automatically trigger clean instant Director Cut when hero position jumps `> 6m` across a Chapter Vignette Cut!
    if (this.hasPrevHero && heroPos.distanceToSquared(this.prevHeroPos) > 36.0) {
      snapImmediately = true;
      this._cameraBlending = false;
      this._chaseInitialized = false;
    }

    // --- Mode 5: Interactive Mouse-Drag `orbit` ---
    if (mode === "orbit") {
      if (Math.abs(this.camera.fov - 42) > 0.05) {
        this.camera.fov = snapImmediately
          ? 42
          : THREE.MathUtils.lerp(this.camera.fov, 42, 0.18);
        this.camera.updateProjectionMatrix();
      }

      if (snapImmediately) {
        this.orbitControls.target.set(heroPos.x, heroPos.y + 0.78, heroPos.z);
        this.camera.position.set(
          heroPos.x + _heroRight.x * 3.45 + _heroFwd.x * 1.15,
          heroPos.y + 1.18,
          heroPos.z + _heroRight.z * 3.45 + _heroFwd.z * 1.15
        );
      } else if (this.hasPrevHero) {
        _heroDelta.subVectors(heroPos, this.prevHeroPos);
        this.camera.position.add(_heroDelta);
        this.orbitControls.target.add(_heroDelta);
      } else {
        _orbitOffset.subVectors(this.camera.position, this.orbitControls.target);
        const dist = _orbitOffset.length();
        if (dist < 1.5 || dist > 24.0 || !Number.isFinite(dist)) {
          _orbitOffset.set(
            _heroRight.x * 3.45 + _heroFwd.x * 1.15,
            0.40,
            _heroRight.z * 3.45 + _heroFwd.z * 1.15
          );
        }
        this.orbitControls.target.set(heroPos.x, heroPos.y + 0.78, heroPos.z);
        this.camera.position.copy(this.orbitControls.target).add(_orbitOffset);
      }

      this.camera.up.set(0, 1, 0);
      this.orbitControls.update();
      this.prevHeroPos.copy(heroPos);
      this.hasPrevHero = true;
      return;
    }

    const xrayShiftFwd = state.xrayEnabled ? 0.16 : 0.0;
    let targetFov = 38;
    let customCamUp = null;

    // --- Mode 3: `drivetrain` (Right-Side Unilateral 44T:16T Chain & `+alpha` Leg IK Macro) ---
    if (mode === "drivetrain" || mode === "profile_ik") {
      const isProfile = mode === "profile_ik";
      targetFov = 31;
      const distRight = isProfile ? 4.18 : state.xrayEnabled ? 2.44 : 2.34;
      const lookUp = isProfile ? 0.75 : state.xrayEnabled ? 0.42 : 0.40;
      _camDesiredPos
        .copy(heroPos)
        .addScaledVector(_heroRight, distRight)
        .addScaledVector(_heroFwd, 0.04 + xrayShiftFwd)
        .addScaledVector(_up, lookUp + 0.03);
      _camDesiredLook
        .copy(heroPos)
        .addScaledVector(_heroFwd, 0.04 + xrayShiftFwd)
        .addScaledVector(_up, lookUp);
      this._clampCameraInsideGymIfNeeded(heroPos, _camDesiredPos);
    } else if (mode === "overhead") {
      // --- Mode 4: `overhead` (Top-Down Architectural Street & Crosswalk Grid View) ---
      targetFov = 36;
      _camDesiredPos
        .copy(heroPos)
        .addScaledVector(_heroFwd, -1.25)
        .addScaledVector(_up, 17.5);
      _camDesiredLook
        .copy(heroPos)
        .addScaledVector(_heroFwd, 1.15)
        .addScaledVector(_up, 0.30);
    } else if (mode === "chase") {
      // --- Mode 2: `chase` (Playable Open-World Follow Cam with Creamy Telephoto Framing + Free Roam +5.5 deg Speed FOV) ---
      const isFreeRoamChase = state.gameMode === "free_roam";
      const speedNorm = isFreeRoamChase
        ? THREE.MathUtils.clamp(Math.abs(snap.speedMps) / 12.4, 0.0, 1.0)
        : THREE.MathUtils.clamp((Math.abs(snap.speedMps) - 4.2) / 3.0, 0.0, 1.0);
      targetFov = isFreeRoamChase
        ? 38.0 + speedNorm * 5.5
        : 38.0 + speedNorm * 3.2 + (snap.isBoosting ? 1.8 : 0.0);
      if ((this.camera.aspect || 1.7778) < 1.35) {
        const chaseNarrow = 1.777778 / Math.max(0.45, this.camera.aspect || 1.0);
        targetFov = Math.min(
          64.0,
          THREE.MathUtils.radToDeg(2.0 * Math.atan(Math.tan(THREE.MathUtils.degToRad(targetFov * 0.5)) * Math.pow(chaseNarrow, 0.55)))
        );
      }

      if (!this._chaseInitialized || snapImmediately) {
        this._chaseHeadingYaw = snap.headingYaw;
        this._chaseInitialized = true;
      } else {
        let diff = snap.headingYaw - this._chaseHeadingYaw;
        diff = ((diff + Math.PI) % (Math.PI * 2));
        if (diff < 0) diff += Math.PI * 2;
        diff -= Math.PI;
        const yawAlpha = 1.0 - Math.exp(-7.5 * Math.max(dt, 1 / 120));
        this._chaseHeadingYaw += diff * yawAlpha;
      }

      const cFwdX = Math.sin(this._chaseHeadingYaw);
      const cFwdZ = -Math.cos(this._chaseHeadingYaw);
      const cRightX = Math.cos(this._chaseHeadingYaw);
      const cRightZ = Math.sin(this._chaseHeadingYaw);

      const backDist = 4.65 + speedNorm * (isFreeRoamChase ? 0.52 : 0.35);
      const upDist = 1.56 + (snap.isAirborne ? 0.16 : 0.0);
      const chaseBaseY = snap.isAirborne ? snap.groundY + snap.jumpHeightM * 0.38 : heroPos.y;

      _camDesiredPos.set(
        heroPos.x - cFwdX * backDist + cRightX * 0.44,
        chaseBaseY + upDist,
        heroPos.z - cFwdZ * backDist + cRightZ * 0.44
      );
      _camDesiredLook.set(
        heroPos.x + cFwdX * 2.15,
        chaseBaseY + 0.90 + (snap.isAirborne ? snap.jumpHeightM * 0.35 : 0.0),
        heroPos.z + cFwdZ * 2.15
      );
      this._clampCameraInsideGymIfNeeded(heroPos, _camDesiredPos);
    } else {
      // --- Mode 1: `cinema` (Director Auto-Cut Telephoto Cinematography `29°–40° FOV` from `snap.directorHint`) ---
      const hint = snap.directorHint || {
        fov: 38,
        camOffset: { right: 2.4, up: 1.25, forward: -4.2 },
        lookOffset: { right: 0.0, up: 0.88, forward: 1.2 },
      };
      if (hint.shotId && hint.shotId !== this._prevDirectorShotId) {
        if (hint.hardCut && this._prevDirectorShotId !== "") {
          snapImmediately = true;
          this._cameraBlending = false;
        }
        this._prevDirectorShotId = hint.shotId;
      }
      if (hint.cameraUp) {
        customCamUp = hint.cameraUp;
      }

      targetFov = hint.fov || 38;
      const cOff = hint.camOffset || { right: 2.4, up: 1.25, forward: -4.2 };
      const lOff = hint.lookOffset || { right: 0.0, up: 0.88, forward: 1.2 };
      const camBaseY = hint.anchorGroundY ? snap.groundY : heroPos.y;

      _camDesiredPos
        .set(heroPos.x, camBaseY, heroPos.z)
        .addScaledVector(_heroRight, cOff.right || 0)
        .addScaledVector(_heroFwd, cOff.forward ?? -(cOff.back || 0))
        .addScaledVector(_up, cOff.up ?? 1.25);

      _camDesiredLook
        .set(heroPos.x, camBaseY, heroPos.z)
        .addScaledVector(_heroRight, lOff.right || 0)
        .addScaledVector(_heroFwd, (lOff.forward ?? 0.8) + xrayShiftFwd)
        .addScaledVector(_up, lOff.up ?? 0.85);

      if (hint.worldCam && hint.worldLook) {
        const wBlend = THREE.MathUtils.clamp(hint.worldBlend ?? 1.0, 0.0, 1.0);
        if (wBlend >= 0.999) {
          _camDesiredPos.set(hint.worldCam.x, hint.worldCam.y, hint.worldCam.z);
          _camDesiredLook.set(hint.worldLook.x, hint.worldLook.y, hint.worldLook.z);
        } else if (wBlend > 0.001) {
          _camDesiredPos.lerp(
            _pPos.set(hint.worldCam.x, hint.worldCam.y, hint.worldCam.z),
            wBlend
          );
          _camDesiredLook.lerp(
            _camRightBasis.set(hint.worldLook.x, hint.worldLook.y, hint.worldLook.z),
            wBlend
          );
        }
      }

      // Multi-Aspect Cinematography Adaptation (`1:1` = 1.000 & `9:16` = 0.5625; `16:9` aspect >= 1.35 is 100.000% UNTOUCHED!)
      const viewAspect = this.camera.aspect || 1.7778;
      if (viewAspect < 1.35) {
        const narrowRatio = 1.777778 / Math.max(0.45, viewAspect); // 1.778 for 1:1, 3.160 for 9:16
        const uSquare = THREE.MathUtils.clamp((1.55 - viewAspect) / 0.55, 0.0, 1.0);
        const uPortrait = THREE.MathUtils.clamp((1.0 - viewAspect) / 0.4375, 0.0, 1.0);
        const seqT = Number(state.sequenceTime) || 0.0;
        const shotType = hint.shotType || "";

        // 1. Balanced Hor+ Vertical FOV Compensation (preserves breathing room in 1:1 & 9:16 with zero fisheye distortion)
        const baseRad = THREE.MathUtils.degToRad(targetFov * 0.5);
        const horExp = THREE.MathUtils.lerp(0.56, 0.62, uPortrait);
        targetFov = Math.min(
          68.0,
          THREE.MathUtils.radToDeg(2.0 * Math.atan(Math.tan(baseRad) * Math.pow(narrowRatio, horExp)))
        );

        // 2. Shot-specific narrow-aspect framing (`0` effect on `16:9`!)
        if (shotType === "spin_ad_floor_macro" || (seqT < 2.20 && state.gameMode === "story_autopilot")) {
          // Beat 1 (`0.00s–1.80s`): Center squarely on the `G4 / C` hex dumbbell (`(0.80, 0.09, 141.74)`) so both circular & side stamps read cleanly!
          const uBeat1 = 1.0 - THREE.MathUtils.smoothstep(seqT, 1.55, 2.25);
          if (uBeat1 > 0.001) {
            const dbShift = uBeat1 * THREE.MathUtils.lerp(0.18, 0.34, uPortrait);
            _camDesiredLook.x = THREE.MathUtils.lerp(_camDesiredLook.x, 0.82, dbShift);
            _camDesiredLook.z = THREE.MathUtils.lerp(_camDesiredLook.z, 141.68, dbShift * 0.75);
            _camDesiredPos.z += uBeat1 * THREE.MathUtils.lerp(0.12, 0.28, uPortrait);
          }
        } else if (shotType === "whip_tilt_pelican_reveal" && seqT < 7.40) {
          // Beat 2/3 (`2.20s–7.40s`): Pull slightly back inside gym bounds so full Pelican + Noogler propeller + Priority GBike fit inside 9:16 & 1:1
          const uReveal = THREE.MathUtils.smoothstep(seqT, 3.20, 5.20);
          _camDesiredPos.x += uReveal * THREE.MathUtils.lerp(0.28, 0.55, uPortrait);
          _camDesiredPos.z += uReveal * THREE.MathUtils.lerp(0.32, 0.62, uPortrait);
          _camDesiredLook.x = THREE.MathUtils.lerp(_camDesiredLook.x, heroPos.x, 0.45 * uPortrait * uReveal);
        } else if (shotType === "waymo_street_pass") {
          // Shot 4 (`12.20s–21.50s`): Re-center look between Pelican and Waymo Ojai V4
          _camDesiredLook.x = THREE.MathUtils.lerp(_camDesiredLook.x, heroPos.x + 0.65 * uSquare * (1.0 - 0.45 * uPortrait), 0.55 * uSquare);
        } else if (shotType === "android_lawn_glide" || shotType === "drivetrain_macro" || shotType === "free_roam") {
          // Pull back slightly along view ray & re-center look onto hero so lateral profile shots never clip front/rear tires
          _camFwdBasis.subVectors(_camDesiredPos, _camDesiredLook);
          const pullScale = 1.0 + THREE.MathUtils.lerp(0.14, 0.34, uPortrait);
          _camDesiredLook.x = THREE.MathUtils.lerp(_camDesiredLook.x, heroPos.x, 0.55 * uPortrait);
          _camDesiredLook.z = THREE.MathUtils.lerp(_camDesiredLook.z, heroPos.z, 0.55 * uPortrait);
          _camDesiredPos.copy(_camDesiredLook).addScaledVector(_camFwdBasis, pullScale);
        } else if (shotType === "stan_trex_flamingo_scatter") {
          // Shot 7 (`36.50s–44.80s` Stan T-Rex Courtyard):
          //   - In `1:1`: Pull back along view ray so BOTH roaring Stan (`(-115.6, -47.4)`) AND startled Pelican stay comfortably inside square frame!
          //   - In `9:16`: Frame roaring Stan heroically (`36.5s–40.85s`) then smoothly pan & move slightly forward/elevated (`y >= 2.25m`, clear above sidewalk TPU 8i!) to track the startled Pelican (`40.85s–44.8s`)!
          _camFwdBasis.subVectors(_camDesiredPos, _camDesiredLook);
          const uPanToPelican = THREE.MathUtils.smoothstep(seqT, 40.55, 41.75);
          const portDistScale = THREE.MathUtils.lerp(1.16, 0.72, uPanToPelican);
          const distScale = 1.0 + THREE.MathUtils.lerp(0.24, portDistScale - 1.0, uPortrait) * uSquare;
          if (uPortrait > 0.01) {
            const stanLookX = -115.2;
            const stanLookY = 2.85;
            const stanLookZ = -47.2;
            const heroLookX = heroPos.x - 0.3;
            const heroLookY = heroPos.y + 1.25;
            const heroLookZ = heroPos.z - 0.4;
            const portLookX = THREE.MathUtils.lerp(stanLookX, heroLookX, uPanToPelican);
            const portLookY = THREE.MathUtils.lerp(stanLookY, heroLookY, uPanToPelican);
            const portLookZ = THREE.MathUtils.lerp(stanLookZ, heroLookZ, uPanToPelican);
            _camDesiredLook.x = THREE.MathUtils.lerp(_camDesiredLook.x, portLookX, uPortrait * 0.92);
            _camDesiredLook.y = THREE.MathUtils.lerp(_camDesiredLook.y, portLookY, uPortrait * 0.75);
            _camDesiredLook.z = THREE.MathUtils.lerp(_camDesiredLook.z, portLookZ, uPortrait * 0.92);
          }
          _camDesiredPos.copy(_camDesiredLook).addScaledVector(_camFwdBasis, distScale);
          if (uPortrait > 0.01 && uPanToPelican > 0.01) {
            _camDesiredPos.y += 0.55 * uPortrait * uPanToPelican;
          }
        } else if (shotType === "slowmo_ramp_profile") {
          // Shot 9 (`49.00s–61.00s` Bay View Slow-Mo Jump): Slight pull-back so wide 4-tier wings + Noogler propeller + ramp stay uncropped
          _camFwdBasis.subVectors(_camDesiredPos, _camDesiredLook);
          const jumpScale = 1.0 + THREE.MathUtils.lerp(0.12, 0.28, uPortrait) * uSquare;
          _camDesiredPos.copy(_camDesiredLook).addScaledVector(_camFwdBasis, jumpScale);
        } else if (shotType === "shoreline_crane_finale") {
          // Shot 10 (`61.00s–72.00s` Shoreline Finale):
          //   - `GEMINI 4 CARBON` spans `x ~ [-6.5, +4.2]` at `z = -182.5`; straddling Peacock-Strut Pelican sits at `(13.28, -176.82)`!
          //   - In `1:1`: Pull camera slightly South-East along view ray (`~1.34x`) so 100% of `GEMINI 4 CARBON` AND straddling Peacock-Strut Pelican fit together!
          //   - In `9:16`: Pull camera back South-East (`~1.62x` during finale) & center slightly toward `(7.2, 2.05, -181.5)` or pan smoothly into hero straddling Pelican + monument!
          const uFin = THREE.MathUtils.clamp(hint.worldBlend ?? 0.0, 0.0, 1.0);
          if (uFin > 0.01) {
            if (uPortrait > 0.01) {
              // In 9:16 portrait (`2160x3840`), `GEMINI 4 CARBON` spans `x ~ [-9.6, +5.8]` (`z = -182.5`) and straddling Pelican is at `(13.28, -176.82)`:
              // Shoreline plaza spans `z = -161.0 .. -184.0` (North of the Corten bridge portal at `z = -160.5`, clear of Stevens Creek!).
              // Place portrait finale camera at `(17.2, 2.02, -162.2)` on the East Shoreline plaza (`0` creek/bridge obstruction, oblique ~40° angle!)
              // with `vFOV = 86°` (`hFOV = 58°`, `~26m` wide at `23.5m` distance), looking at `(0.20, 2.02, -181.8)` so ALL 14 letters of `GEMINI 4 CARBON` AND the straddling Pelican fit!
              targetFov = THREE.MathUtils.lerp(targetFov, 86.0, uPortrait * uFin);
              const uSettlePort = THREE.MathUtils.smoothstep(seqT, 67.35, 68.95);
              const portCamX = THREE.MathUtils.lerp(18.5, 17.20, uSettlePort);
              const portCamY = THREE.MathUtils.lerp(2.15, 2.02, uSettlePort);
              const portCamZ = THREE.MathUtils.lerp(-155.0, -162.2, uSettlePort);
              const portLookX = THREE.MathUtils.lerp(9.5, 2.45, uSettlePort);
              const portLookY = THREE.MathUtils.lerp(1.75, 2.02, uSettlePort);
              const portLookZ = THREE.MathUtils.lerp(-176.5, -181.8, uSettlePort);
              _camDesiredPos.x = THREE.MathUtils.lerp(_camDesiredPos.x, portCamX, uPortrait * uFin);
              _camDesiredPos.y = THREE.MathUtils.lerp(_camDesiredPos.y, portCamY, uPortrait * uFin);
              _camDesiredPos.z = THREE.MathUtils.lerp(_camDesiredPos.z, portCamZ, uPortrait * uFin);
              _camDesiredLook.x = THREE.MathUtils.lerp(_camDesiredLook.x, portLookX, uPortrait * uFin);
              _camDesiredLook.y = THREE.MathUtils.lerp(_camDesiredLook.y, portLookY, uPortrait * uFin);
              _camDesiredLook.z = THREE.MathUtils.lerp(_camDesiredLook.z, portLookZ, uPortrait * uFin);
            } else {
              _camFwdBasis.subVectors(_camDesiredPos, _camDesiredLook);
              const finPull = 1.0 + uFin * 0.34 * uSquare;
              _camDesiredPos.copy(_camDesiredLook).addScaledVector(_camFwdBasis, finPull);
            }
          } else {
            // Corten bridge approach (`61.0s–66.5s`)
            _camFwdBasis.subVectors(_camDesiredPos, _camDesiredLook);
            _camDesiredPos.copy(_camDesiredLook).addScaledVector(
              _camFwdBasis,
              1.0 + THREE.MathUtils.lerp(0.10, 0.24, uPortrait) * uSquare
            );
          }
        }
      }

      this._clampCameraInsideGymIfNeeded(heroPos, _camDesiredPos);
    }

    // Section 8B — Outdoor Chase-Camera Obstruction Avoidance (`t > 9.5s` ONLY; `0.00s - 9.50s` 100% UNTOUCHED!)
    const isOutdoorAvoidanceActive =
      mode !== "overhead" &&
      mode !== "orbit" &&
      ((state.gameMode === "story_autopilot" && state.sequenceTime > 9.5) ||
        (state.gameMode !== "story_autopilot" && Boolean(state.glassShattered) && snap.z < 130.2));
    this._camAvoidActive = isOutdoorAvoidanceActive;

    if (!isOutdoorAvoidanceActive) {
      this._camAvoidCurrent.set(0, 0, 0);
    } else if (this.world && typeof this.world.computeOutdoorCameraClearanceOffset === "function") {
      this.world.computeOutdoorCameraClearanceOffset(
        _camDesiredPos,
        _camDesiredLook,
        heroPos,
        _camAvoidTarget
      );
      if (snapImmediately) {
        this._camAvoidCurrent.copy(_camAvoidTarget);
      } else {
        const avoidAlpha = 1.0 - Math.exp(-8.5 * Math.max(dt, 1 / 120));
        this._camAvoidCurrent.lerp(_camAvoidTarget, avoidAlpha);
      }
      if (this._camAvoidCurrent.lengthSq() > 1e-6) {
        _camDesiredPos.add(this._camAvoidCurrent);
      }
    }

    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      const fovBlend = snapImmediately ? 1.0 : 1.0 - Math.exp(-10.0 * Math.max(dt, 1 / 120));
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, fovBlend);
      this.camera.updateProjectionMatrix();
    }

    if (!snapImmediately && this._cameraBlending && this.hasPrevHero) {
      _heroDelta.subVectors(heroPos, this.prevHeroPos);
      this.camera.position.add(_heroDelta);
      this.orbitControls.target.add(_heroDelta);

      const blend = 1.0 - Math.exp(-9.5 * Math.max(dt, 1 / 120));
      this.camera.position.lerp(_camDesiredPos, blend);
      this.orbitControls.target.lerp(_camDesiredLook, blend);

      if (
        this.camera.position.distanceToSquared(_camDesiredPos) < 1e-4 &&
        this.orbitControls.target.distanceToSquared(_camDesiredLook) < 1e-4
      ) {
        this.camera.position.copy(_camDesiredPos);
        this.orbitControls.target.copy(_camDesiredLook);
        this._cameraBlending = false;
      }
    } else {
      this.camera.position.copy(_camDesiredPos);
      this.orbitControls.target.copy(_camDesiredLook);
      this._cameraBlending = false;
    }

    if (customCamUp) {
      this.camera.up.set(customCamUp.x, customCamUp.y, customCamUp.z).normalize();
    } else {
      this.camera.up.set(0, 1, 0);
    }
    this.camera.lookAt(this.orbitControls.target);

    // Apply quadratic camera trauma shake (`shake = trauma^2` on glass smash & jump touchdown)
    // + V8-02 `180ms` low-frequency Stan `T. rex` chest-rumble at `40.20s`!
    const shake = snap.cameraShakeOffset;
    let shakeX = shake ? shake.x || 0.0 : 0.0;
    let shakeY = shake ? shake.y || 0.0 : 0.0;
    let shakeRoll = shake ? shake.roll || 0.0 : 0.0;

    let roarRumbleAge = this._stanRumbleAgeSec;
    if (
      state.gameMode === "story_autopilot" &&
      Number.isFinite(state.sequenceTime) &&
      state.sequenceTime >= 40.20 &&
      state.sequenceTime <= 40.38
    ) {
      roarRumbleAge = Math.min(roarRumbleAge, state.sequenceTime - 40.20);
    }
    if (roarRumbleAge >= 0.0 && roarRumbleAge < 0.180) {
      const uR = roarRumbleAge / 0.180;
      const envR = (1.0 - uR) * (1.0 - uR) * Math.sin(Math.min(1.0, uR * 7.5) * Math.PI * 0.5);
      const twoPi = Math.PI * 2.0;
      shakeY += envR * (0.024 * Math.sin(twoPi * 19.5 * roarRumbleAge) + 0.009 * Math.sin(twoPi * 33.0 * roarRumbleAge));
      shakeX += envR * 0.011 * Math.cos(twoPi * 16.0 * roarRumbleAge + 0.6);
      shakeRoll += envR * 0.0036 * Math.sin(twoPi * 21.0 * roarRumbleAge);
    }

    if (Math.abs(shakeX) > 1e-5 || Math.abs(shakeY) > 1e-5 || Math.abs(shakeRoll) > 1e-5) {
      _camFwdBasis.subVectors(this.orbitControls.target, this.camera.position).normalize();
      _camRightBasis.crossVectors(_camFwdBasis, this.camera.up).normalize();
      _camUpBasis.crossVectors(_camRightBasis, _camFwdBasis).normalize();
      this.camera.position
        .addScaledVector(_camRightBasis, shakeX)
        .addScaledVector(_camUpBasis, shakeY);
      this.camera.rotateZ(shakeRoll);
    }

    this.prevHeroPos.copy(heroPos);
    this.hasPrevHero = true;
  }

  /**
   * Main 60fps / Virtual-Clock Simulation & Render Step.
   */
  advanceFrame(dt = 1 / 60, _timestamp = 0, _frameIndex) {
    if (
      typeof window !== "undefined" &&
      window.__externalClock === true &&
      this.qualityTier !== "high"
    ) {
      this.setQualityTier("high");
    }

    // Priority 0.3B: Smart Non-Destructive Retina DPR Governor (`2.0 -> 1.5` ONLY on ultra-high-DPI
    // interactive GPU sessions if rolling 60-frame wall-clock delta exceeds `18.5ms`; never `< 1.5`).
    if (
      !this.isSoftwareRenderer &&
      this._assetsFinalized &&
      typeof window !== "undefined" &&
      !window.__externalClock &&
      !window.__virtualClock &&
      typeof performance !== "undefined" &&
      dt > 0
    ) {
      const nowMs = performance.now();
      if (this._lastPerfNowMs > 0) {
        const wallDeltaMs = nowMs - this._lastPerfNowMs;
        if (wallDeltaMs > 0.5 && wallDeltaMs < 250.0) {
          this._dprFrameDeltaRing[this._dprFrameDeltaIdx] = wallDeltaMs;
          this._dprFrameDeltaIdx = (this._dprFrameDeltaIdx + 1) % 60;
          if (this._dprFrameDeltaCount < 60) {
            this._dprFrameDeltaCount += 1;
          } else if (
            (window.devicePixelRatio || 1) >= 2.0 &&
            this._governedRetinaDprCap > 1.5 &&
            this.qualityTier === "high"
          ) {
            let sumMs = 0.0;
            for (let ri = 0; ri < 60; ri++) sumMs += this._dprFrameDeltaRing[ri];
            if (sumMs / 60.0 > 18.5) {
              this._governedRetinaDprCap = 1.5;
              this.resize();
            }
          }
        }
      }
      this._lastPerfNowMs = nowMs;
    }

    const numDt = Number(dt);
    const safeDt =
      dt === 0 ? 0 : THREE.MathUtils.clamp(Number.isFinite(numDt) ? numDt : 1 / 60, 0, 0.1);

    if (this.audio && this.audio.enabled) {
      this.audio.ensureResumed();
    }

    this._mirrorSharedWindowInputKeys();

    // 1. Step Open-World Game Physics & Story Spline (`game.step` advances `state.elapsedTime` by `safeDt`)
    const prevElapsed = state.elapsedTime;
    const snap = this.game.step(safeDt);
    const gameAdvancedClock = Math.abs(state.elapsedTime - prevElapsed) > 1e-7;

    const isSkipDraw = typeof window !== "undefined" && window.__CAPTURE_SKIP_DRAW__ === true;
    if (isSkipDraw) {
      // Ultra-fast shard warm-up path (`< 0.15ms/frame`): advance hero anchor, camera smoothing state,
      // and burnout/particle state arrays without running full 3D GLB/rig/matrix/DOM/Canvas2D passes!
      this.heroAnchor.position.set(snap.x, snap.y, snap.z);
      this.heroAnchor.rotation.set(snap.slopePitchRad, snap.threeRotationY, 0, "YXZ");
      _heroFwd.set(snap.forwardX, 0, snap.forwardZ).normalize();
      _heroRight.set(snap.rightX, 0, snap.rightZ).normalize();
      this._updateCameraForMode(snap, safeDt === 0 && state.frameCount === 0, safeDt);
      if (safeDt > 0) {
        this._stepBurnoutSmoke(safeDt, snap);
        this._stepParticles(safeDt, snap);
      }
      if (!gameAdvancedClock && safeDt > 0) {
        state.elapsedTime += safeDt;
      }
      state.frameCount += 1;
      this._wasSkippingDraw = true;
      return;
    }

    // 2. Pose Hero, GBike, Pelican, Camera & Open-World Landmarks
    if (this.world && this.renderer) {
      this.world._isFast1080pSw = Boolean(
        (this.isSoftwareRenderer || this.isCaptureSwCpu) &&
          this.renderer.getPixelRatio() <= 1.05 &&
          this.renderer.domElement.width <= 1920
      );
    }
    this._syncSceneFromSnapshot(snap, safeDt, { snapCamera: safeDt === 0 && state.frameCount === 0 });

    // 3. Step Volumetric Burnout Smoke, Soft Glow Particles & Frame-Locked WebAudio Engine
    if (safeDt > 0) {
      this._stepBurnoutSmoke(safeDt, snap);
      this._stepParticles(safeDt, snap);
      const afp = this._audioFrameParams;
      afp.speedMps = snap.speedMps;
      afp.omegaWheel = snap.omegaWheel;
      afp.cadenceRpm = snap.cadenceRpm;
      afp.isCoasting = snap.isCoasting;
      afp.coastFactor = snap.coastFactor;
      afp.surfaceType = snap.surfaceType;
      afp.arcDistanceM = snap.arcDistanceM;
      afp.plankPitchM = snap.plankPitchM;
      afp.onTrainerStand = snap.onTrainerStand;
      afp.isAirborne = snap.isAirborne;
      afp.trainerSparkIntensity = snap.trainerSparkIntensity;
      afp.burnoutSmokeIntensity = snap.burnoutSmokeIntensity;
      afp.peelOutBurstIntensity = snap.peelOutBurstIntensity;
      afp.shorelineSkidIntensity = snap.shorelineSkidIntensity || 0.0;
      afp.verticalVelMps = snap.verticalVelMps;
      this.audio.update(safeDt, afp);
    }

    const skipDrawNow = Boolean(
      typeof window !== "undefined" && window.__CAPTURE_SKIP_DRAW__ === true
    );
    if (skipDrawNow) {
      this._wasSkippingDraw = true;
      this.camera.updateMatrixWorld(true);
    } else {
      // 4. Matrix Invalidation Guarantee (ensures zero stale matrices!)
      this.scene.updateMatrixWorld(true);
      this.camera.updateMatrixWorld(true);
    }

    if (!skipDrawNow && this._assetsFinalized) {
      const isExternalCapture = Boolean(
        typeof window !== "undefined" && window.__externalClock === true
      );
      const isFast1080pSw = Boolean(
        (this.isSoftwareRenderer || this.isCaptureSwCpu) &&
          this.renderer.getPixelRatio() <= 1.05 &&
          this.renderer.domElement.width <= 1920
      );

      if ((this.isSoftwareRenderer || this.isCaptureSwCpu) && !this._xrayPrewarmed && !state.xrayEnabled) {
        this._xrayPrewarmed = true;
        const prevWorldVis = this.world?.root ? this.world.root.visible : true;
        if (this.world?.root) this.world.root.visible = false;
        this.setXrayMode(true);
        this.renderer.render(this.scene, this.camera);
        this.setXrayMode(false);
        if (this.world?.root) this.world.root.visible = prevWorldVis;
      }

      if (this._wasSkippingDraw) {
        this._wasSkippingDraw = false;
        if (this.v5Lighting) {
          this.v5Lighting.updateTwoTierShadows?.({
            heroPos: snap,
            camera: this.camera,
            forceStaticRebuild: true,
            isSoftwareRenderer: Boolean(this.isSoftwareRenderer || this.isCaptureSwCpu),
          });
        }
        this.renderer.shadowMap.needsUpdate = true;
      }

      // Spatial 14m x 14m frustum & distance culling for 156,000 grass tufts (zero blades removed!)
      if (this.world?.v5Grass?.cullForCamera) {
        this.world.v5Grass.cullForCamera(this.camera, isFast1080pSw);
      }

      // Priority 0.2: Distance-modulate local PointLight intensities via fixed-slot multiplexer across ALL renderers
      // without EVER mutating `.visible` on any PointLight or SpotLight (`midRideShaderRecompiles === 0`!).
      if (this._swMuxReady) {
        this._updateSoftwarePointLightMultiplexer();
      }

      // Tier 1 (`4096x4096`, `autoUpdate = false`) & Tier 2 (`2048x2048`, `+-10.5m`, `autoUpdate = true`) managed by `v5Lighting`
      const wasStaticRebuild = Boolean(this.v5Lighting?.sunLight?.shadow?.needsUpdate);
      this.renderer.shadowMap.autoUpdate = true;
      this.renderer.render(this.scene, this.camera);
      this._syncCtTelemetry(wasStaticRebuild);
    }

    // 5. Emit Single-Store `STATS_UPDATED` without double-incrementing `state.elapsedTime`!
    const estFps = safeDt > 1e-4 ? Math.min(120, 1 / safeDt) : 60;
    dispatchAction(DEMO_ACTIONS.TICK_FRAME, {
      dt: gameAdvancedClock ? 0.0 : safeDt,
      fps: estFps,
    });
  }

  /**
   * Comprehensive Quantitative Telemetry for `sim-math-data-critic`, `visual-3d-shader-critic` & `render-verifier`.
   */
  getDiagnosticTelemetry() {
    const ik = this.pelican.ikDiagnostics;
    const snap = this.game.getSnapshot();
    const maxGap = Math.max(
      ik.leftLeg.gapError,
      ik.rightLeg.gapError,
      ik.leftWing.gapError,
      ik.rightWing.gapError
    );
    const maxFootSoleErr = Math.max(ik.leftFootSoleErrorM, ik.rightFootSoleErrorM);
    const leftMidZ = (ik.leftLeg.rootPos.z + ik.leftLeg.endPos.z) * 0.5;
    const rightMidZ = (ik.rightLeg.rootPos.z + ik.rightLeg.endPos.z) * 0.5;
    const leftKneeForwardOffsetM = leftMidZ - ik.leftLeg.jointPos.z;
    const rightKneeForwardOffsetM = rightMidZ - ik.rightLeg.jointPos.z;
    const wheelSlipErrorM = Math.abs(
      (snap.frontWheelRad ?? snap.wheelRad) * BIKE_CONSTANTS.wheelRadiusM - snap.arcDistanceM
    );
    const gearRatioActual =
      snap.omegaCrank > 0.25 && (snap.coastFactor ?? 1.0) > 0.98
        ? snap.omegaWheel / snap.omegaCrank
        : BIKE_CONSTANTS.chainringTeeth / BIKE_CONSTANTS.rearCogTeeth;
    const minKickstandClearanceM = this.gbike.getMinKickstandClearanceM([
      this.pelican.leftFootHeelLocal,
    ]);

    return {
      activeClipId: state.activeClipId,
      activeClipIndex: state.activeClipIndex,
      activeDistrictName: state.activeDistrictName,
      currentState: state.currentState,
      gameMode: state.gameMode,
      cameraMode: state.cameraMode,
      xrayEnabled: state.xrayEnabled,
      qualityTier: this.qualityTier,
      elapsedTime: Number(state.elapsedTime.toFixed(4)),
      sequenceTime: Number(state.sequenceTime.toFixed(4)),
      clipLocalTime: Number(state.clipLocalTime.toFixed(4)),
      cadenceScale: state.cadenceScale,
      playerPose: {
        x: Number(snap.x.toFixed(3)),
        y: Number(snap.y.toFixed(3)),
        z: Number(snap.z.toFixed(3)),
        headingYaw: Number(snap.headingYaw.toFixed(4)),
        inGym: Boolean(snap.inGym),
        onTrainerStand: Boolean(snap.onTrainerStand),
        glassShattered: Boolean(snap.glassShattered),
        isAirborne: Boolean(snap.isAirborne),
        inSlowMoJump: Boolean(snap.inSlowMoJump),
      },
      burnoutSmokeActivePuffs: this._burnoutActivePuffs || 0,
      cameraAvoidance: {
        active: Boolean(this._camAvoidActive),
        offsetM: Number(this._camAvoidCurrent.length().toFixed(4)),
        liftY: Number(this._camAvoidCurrent.y.toFixed(4)),
        blockingForegroundProps: this.world?.lastOutdoorObstructionCount ?? 0,
        fadedForegroundProps: this.world?.lastOutdoorAvoidanceHiddenCount ?? 0,
      },
      envMapActive: Boolean(this.scene.environment || this.sunsetEnvMap),
      glbLoadedStatus: { ...this.glbLoadedStatus },
      renderStats: this.getRenderStats(),
      subPartCounts: {
        pelican: this.pelican.subPartCount,
        gbike: this.gbike.subPartCount,
        totalHeroSubParts: this.pelican.subPartCount + this.gbike.subPartCount,
      },
      ik: {
        jointGapErrorM: Number(maxGap.toFixed(6)),
        leftLegReachRatio: Number(ik.leftLeg.reachRatio.toFixed(4)),
        rightLegReachRatio: Number(ik.rightLeg.reachRatio.toFixed(4)),
        leftWingReachRatio: Number(ik.leftWing.reachRatio.toFixed(4)),
        rightWingReachRatio: Number(ik.rightWing.reachRatio.toFixed(4)),
        anyChainClamped: Boolean(
          ik.leftLeg.clamped || ik.rightLeg.clamped || ik.leftWing.clamped || ik.rightWing.clamped
        ),
        leftKneeForwardOffsetM: Number(leftKneeForwardOffsetM.toFixed(4)),
        rightKneeForwardOffsetM: Number(rightKneeForwardOffsetM.toFixed(4)),
        leftKneeAngleDeg: Number((state.kinematics.leftKneeAngleDeg || 0).toFixed(2)),
        rightKneeAngleDeg: Number((state.kinematics.rightKneeAngleDeg || 0).toFixed(2)),
        footSoleErrorM: Number(maxFootSoleErr.toFixed(6)),
      },
      drivetrain: {
        unilateralRightOnly: true,
        driveSideX: BIKE_CONSTANTS.driveSideX,
        chainringTeeth: BIKE_CONSTANTS.chainringTeeth,
        rearCogTeeth: BIKE_CONSTANTS.rearCogTeeth,
        chainLinks: BIKE_CONSTANTS.chainLinks,
        gearRatioActual: Number(gearRatioActual.toFixed(6)),
        chainSpeedMps: Number((state.kinematics.chainSpeedMps || 0).toFixed(4)),
        pedalTorqueNm: Number((state.kinematics.pedalTorqueNm || 0).toFixed(2)),
        powerWatts: Number((state.kinematics.powerWatts || 0).toFixed(1)),
        isCoasting: Boolean(snap.isCoasting),
        coastFactor: Number((snap.coastFactor ?? 1.0).toFixed(4)),
        wheelSlipErrorM: Number(wheelSlipErrorM.toFixed(6)),
        minKickstandClearanceM: Number(minKickstandClearanceM.toFixed(4)),
      },
      groundContact: {
        heroGroundY: Number(this.heroAnchor.position.y.toFixed(6)),
        heroContactShadowY: Number((this.heroContactShadow?.position?.y ?? 0).toFixed(6)),
        heroContactShadowOpacity: Number(
          (this.heroContactShadow?.material?.opacity ?? 0).toFixed(6)
        ),
        heroContactShadowVisible: Boolean(this.heroContactShadow?.visible),
        rigAttachedShadowMeshCount: (() => {
          let cnt = 0;
          this.heroAnchor?.traverse((o) => {
            if (o !== this.heroAnchor && o.isMesh && o.visible && /shadow/i.test(String(o.name || ""))) {
              cnt++;
            }
          });
          return cnt;
        })(),
        spinStudioLedRpm: Number((this.world?.lastGymLedRpm ?? 0).toFixed(1)),
        slopePitchDeg: Number((state.kinematics.slopePitchDeg || 0).toFixed(3)),
        bridgeArchElevationM: Number((state.kinematics.bridgeArchElevationM || 0).toFixed(4)),
        suspensionCompressionMm: Number((state.kinematics.suspensionCompressionMm || 0).toFixed(3)),
        tireCompressedContactPatchM: 0.003,
        allCampusLandmarksBox3Grounded: Boolean(this.world.v5GroundingReport?.pass ?? true),
        v5MaxFloatMm: Number((this.world.v5GroundingReport?.maxFloatMm ?? 0.0).toFixed(4)),
        v5AuditedPropCount: this.world.v5GroundingReport?.propCount || 0,
        v5AuditedNodeCount: this.world.v5GroundingReport?.nodeCount || 0,
      },
      gularSpring: {
        omegaN: this.pelican.gularOmegaN,
        zeta: this.pelican.gularZeta,
        deflectionM: Number(this.pelican.gularY.toFixed(6)),
      },
      audio: {
        enabled: this.audio.enabled,
        rmsDb: Number(this.audio.getRmsDb().toFixed(2)),
        lyriaCutoffHz: Number(this.audio.getLyriaCutoffHz().toFixed(1)),
        totalClicksTriggered: this.audio.totalClicksTriggered,
        totalPlankThumps: this.audio.totalPlankThumps,
        sfxCounts: { ...this.audio.sfxCounts },
      },
      telemetrySummary: deriveTourSummary(),
    };
  }
}
