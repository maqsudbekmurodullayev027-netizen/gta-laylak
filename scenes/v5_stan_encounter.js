/**
 * v5_stan_encounter.js — Articulated Museum Cast-Bronze Stan T-Rex Encounter,
 * Stepped Sierra Granite Plinth, Courtyard Bistro Sets & Deterministic Flamingo Scatter (V5).
 *
 * Strictly deterministic function of `timeSec` (`0` `Math.random()` calls, `0` stateful drift,
 * 100% safe under random-access `?t=` timeline scrubbing and headless frame capture).
 *
 * Articulated GLB Hierarchy (`src/assets/glb/stan_trex_v5_glb.js` -> `stan_trex_v5.glb`):
 *   - `Stan_Plinth_V5`        : Grounded strictly at `minY = 0.0000m`, top deck at `Y = 0.5600m`
 *   - `Stan_Body_V5`          : Local origin `(0, 0.5600, 0)`, striding feet planted at `Y = 0.5600m`
 *     └─ `Stan_Neck_Head_V5`  : Local origin `(0, 2.8600, 1.4800)` (cervicothoracic pivot `(0, 3.42, 1.48)`)
 *        └─ `Stan_Lower_Jaw_V5`: Local origin `(0, 0.6200, 0.7400)` (quadrate-articular jaw hinge)
 *   - `Courtyard_Cafe_Set_V5` : Grounded strictly at `minY = 0.0000m` (umbrella + teak table + 4 chairs)
 */

import { decodeStanTrexV5Glb } from "../assets/glb/stan_trex_v5_glb.js";

export { decodeStanTrexV5Glb };

export const STAN_V5_NODE_NAMES = Object.freeze({
  plinth: "Stan_Plinth_V5",
  body: "Stan_Body_V5",
  neckHead: "Stan_Neck_Head_V5",
  lowerJaw: "Stan_Lower_Jaw_V5",
  cafeSet: "Courtyard_Cafe_Set_V5",
});

export const STAN_COURTYARD_CENTER = Object.freeze({ x: -118.0, z: -50.0 });
export const STAN_ROAR_TRIGGER_SEC_DEFAULT = 40.20;
export const STAN_DEFAULT_BASE_YAW_RAD = 0.85; // Faces ENE toward Pelican's courtyard pass `(-109.12, -43.40)`

function makeCafeSpotTuple(x, z) {
  const t = [x, z];
  t.x = x;
  t.z = z;
  return Object.freeze(t);
}

export const DEFAULT_COURTYARD_CAFE_SPOTS = Object.freeze([
  // 6 Stan Courtyard circular sandstone paver ring spots (`13.6m <= rStan <= 18.8m` around `(-118, -50)`)
  makeCafeSpotTuple(-130.5, -39.5),
  makeCafeSpotTuple(-134.2, -49.0),
  makeCafeSpotTuple(-130.2, -61.0),
  makeCafeSpotTuple(-102.0, -53.2),
  makeCafeSpotTuple(-106.0, -61.8),
  makeCafeSpotTuple(-118.0, -66.5),
  // 2 Android Plaza sandstone paver disc spots (`rAndroid <= 9.4m` around `(-118, 96)`, `z >= 86.95`)
  makeCafeSpotTuple(-124.4, 93.2),
  makeCafeSpotTuple(-124.2, 98.8),
]);

const TWO_PI = Math.PI * 2.0;
const DEG_TO_RAD = Math.PI / 180.0;
const RAD_TO_DEG = 180.0 / Math.PI;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a, b, u) {
  return a + (b - a) * u;
}

function smoothstep01(u) {
  const t = clamp(u, 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

function smootherstep01(u) {
  const t = clamp(u, 0.0, 1.0);
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

function wrapAngleSigned(rad) {
  let a = (rad + Math.PI) % TWO_PI;
  if (a < 0.0) a += TWO_PI;
  return a - Math.PI;
}

function hash01(seed) {
  let x = (seed ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return (x & 0x00ffffff) / 0x01000000;
}

function findNamedNode(root, exactName) {
  if (!root) return null;
  const direct = root.getObjectByName ? root.getObjectByName(exactName) : null;
  if (direct) return direct;
  let match = null;
  root.traverse((node) => {
    if (!match && node !== root && node.name && node.name.startsWith(exactName)) {
      match = node;
    }
  });
  return match;
}

/**
 * Pure closed-form analytical kinematics for Stan's creepy stalk -> predatory head-whip ->
 * wide-open `37.5°` roaring jaw tremor + damped sub-bass camera shake trauma.
 * 100% deterministic function of `timeSec`, `pelicanPos`, and optional `stanRoarSignal`.
 */
export function evaluateStanRoarKinematics({
  timeSec = 0.0,
  pelicanPos = null,
  stanRoarSignal = undefined,
  center = STAN_COURTYARD_CENTER,
  baseYawRad = STAN_DEFAULT_BASE_YAW_RAD,
  roarTriggerSec = STAN_ROAR_TRIGGER_SEC_DEFAULT,
} = {}) {
  const t = Number(timeSec) || 0.0;
  const cx = Number(center?.x ?? STAN_COURTYARD_CENTER.x);
  const cz = Number(center?.z ?? STAN_COURTYARD_CENTER.z);

  const sigIsObj = stanRoarSignal !== null && typeof stanRoarSignal === "object";
  const sigIsNum = typeof stanRoarSignal === "number" && Number.isFinite(stanRoarSignal);

  const tTrigger = sigIsObj
    ? Number(
        stanRoarSignal.stanRoarTriggerTime ??
          stanRoarSignal.roarTriggerSec ??
          stanRoarSignal.triggerSec ??
          roarTriggerSec
      )
    : Number(roarTriggerSec);

  const px = Number.isFinite(pelicanPos?.x) ? pelicanPos.x : -109.12;
  const py = Number.isFinite(pelicanPos?.y) ? pelicanPos.y : 0.0;
  const pz = Number.isFinite(pelicanPos?.z) ? pelicanPos.z : -43.40;

  const dx = px - cx;
  const dz = pz - cz;
  const dist2D = Math.hypot(dx, dz);

  // Local yaw in `assemblyGroup` where `+Z` is forward along `baseYawRad` (`atan2(dx, dz) - baseYawRad`)
  const rawLocalYawRad =
    dist2D > 0.25 ? wrapAngleSigned(Math.atan2(dx, dz) - baseYawRad) : 0.0;
  const targetAimYawRad = clamp(rawLocalYawRad, -1.04, 1.04); // Anatomical `±59.6°` cervical limit

  // Downward pitch angle from Stan's `~4.45m` skull height toward Pelican (`~1.05m` torso height)
  const skullElevM = Math.max(0.6, 4.45 - Math.max(0.0, py + 1.05));
  const naturalLookDownPitchRad = clamp(
    Math.atan2(skullElevM, Math.max(5.5, dist2D)) * 0.62,
    0.04,
    0.34
  );

  // Subtle museum idle breathing/micro-drift when Pelican is far away (`±1.2°` slow living bronze presence)
  const museumMicroYaw = Math.sin(t * 0.65) * 0.018;
  const museumMicroPitch = Math.cos(t * 0.52) * 0.012;

  let roarIntensity = 0.0;
  let headYawRad = museumMicroYaw;
  let headPitchRad = museumMicroPitch;
  let headRollRad = 0.0;
  let jawOpenDeg = 0.0;
  let cameraShakeTrauma = 0.0;
  let dtRoar = t - tTrigger;

  if (sigIsNum) {
    // Explicit numeric signal override (`0.0 .. 1.0`, e.g. Free Roam proximity roar or unit test)
    roarIntensity = clamp(stanRoarSignal, 0.0, 1.0);
    const proxWeight = smoothstep01((34.0 - dist2D) / 14.0);
    const trackWeight = Math.max(proxWeight, roarIntensity);
    headYawRad = lerp(museumMicroYaw, targetAimYawRad, trackWeight);
    const tremor =
      roarIntensity > 0.01
        ? (Math.sin(TWO_PI * 17.5 * t) * 2.2 + Math.sin(TWO_PI * 29.0 * t + 0.9) * 1.1) *
          roarIntensity
        : 0.0;
    jawOpenDeg = clamp(36.2 * roarIntensity + tremor, 0.0, 38.0);
    headPitchRad = lerp(
      museumMicroPitch,
      naturalLookDownPitchRad * (0.45 + 0.55 * roarIntensity),
      trackWeight
    );
    headRollRad = Math.sin(t * 6.0) * 0.075 * roarIntensity;
    cameraShakeTrauma = clamp(roarIntensity * 0.85, 0.0, 1.0);
    dtRoar = roarIntensity > 0.001 ? 0.35 + (t % 0.8) * 0.5 : -1.0;
  } else {
    // Canonical V5 Courtyard Encounter Timeline (`tTrigger = 40.20s` default):
    //   1) `tTrigger - 3.55s .. tTrigger - 0.22s`: Slow, eerie bronze cervical creep stalking Pelican
    //   2) `tTrigger - 0.22s .. tTrigger + 0.03s`: Sudden predatory HEAD-WHIP + brief inhale rear-up
    //   3) `tTrigger + 0.00s .. tTrigger + 1.92s`: Wide-open `37.5°` ROAR lunge + multi-harmonic jaw tremor
    //   4) `tTrigger + 1.92s .. tTrigger + 4.40s`: Menacing follow-gaze & smooth return to museum poise
    const stalkStart = tTrigger - 3.55;
    const whipStart = tTrigger - 0.22;
    const whipEnd = tTrigger + 0.03;
    const holdEnd = tTrigger + 2.85;
    const settleEnd = tTrigger + 4.65;

    if (t > stalkStart && t < settleEnd) {
      const envIn = smootherstep01((t - stalkStart) / 1.45);
      const envOut = 1.0 - smootherstep01((t - holdEnd) / (settleEnd - holdEnd));
      const activeEnv = clamp(envIn * envOut, 0.0, 1.0);

      // During creepy stalk (`t < whipStart`), Stan lags slightly behind at 46% aim with eerie stillness,
      // then WHIPS across to 100% dead-on lock in `0.25s` (`whipStart -> whipEnd`)!
      const whipFrac = smootherstep01((t - whipStart) / Math.max(0.05, whipEnd - whipStart));
      const creepYaw = clamp(targetAimYawRad * 0.46 - 0.32, -0.96, 0.96);
      const lockedYaw = targetAimYawRad;
      const desiredYaw = lerp(creepYaw, lockedYaw, whipFrac);
      headYawRad = lerp(museumMicroYaw, desiredYaw, activeEnv);

      if (t >= whipStart && t < tTrigger) {
        // Predatory pre-roar inhale rear-up (`-0.16 rad`) + slight 5° jaw crack
        const uInhale = smoothstep01((t - whipStart) / Math.max(0.05, tTrigger - whipStart));
        headPitchRad = lerp(museumMicroPitch + 0.05 * activeEnv, -0.16, uInhale);
        headRollRad = 0.065 * uInhale;
        jawOpenDeg = 5.2 * uInhale;
      } else if (t >= tTrigger && t < tTrigger + 1.95) {
        const dt = t - tTrigger;
        const attack = smoothstep01(dt / 0.075);
        const sustainDecay = 1.0 - smootherstep01((dt - 1.12) / 0.80);
        roarIntensity = clamp(attack * sustainDecay, 0.0, 1.0);
        if (sigIsObj && Number.isFinite(stanRoarSignal.stanRoarIntensity ?? stanRoarSignal.roarIntensity)) {
          roarIntensity = Math.max(
            roarIntensity,
            clamp(Number(stanRoarSignal.stanRoarIntensity ?? stanRoarSignal.roarIntensity), 0.0, 1.0)
          );
        }

        // High-frequency cast-bronze mandibular roar tremor (`16.5 Hz + 28.5 Hz`, peaking at `37.6 deg <= 38.0 deg`!)
        const jawTremor =
          (Math.sin(TWO_PI * 16.5 * dt) * 2.15 + Math.sin(TWO_PI * 28.5 * dt + 0.6) * 0.95) *
          roarIntensity;
        jawOpenDeg = clamp(35.4 * roarIntensity + jawTremor, 0.0, 38.0);

        // Downward predatory bellow lunge toward Pelican (`-0.16 -> +0.23 rad`) + avian head-cock roll
        const lunge = smoothstep01(dt / 0.13);
        const lungeTarget = Math.max(0.21, naturalLookDownPitchRad);
        headPitchRad = lerp(-0.16, lungeTarget, lunge) * sustainDecay + 0.06 * (1.0 - sustainDecay);
        headRollRad =
          (0.085 * Math.sin(dt * 5.2 + 0.5) + 0.04 * Math.sin(TWO_PI * 14.0 * dt)) * roarIntensity;
      } else {
        // Creepy pre-whip stalk OR post-roar menacing follow gaze (`t > tTrigger + 1.95s`)
        headPitchRad = lerp(museumMicroPitch, naturalLookDownPitchRad * 0.42, activeEnv);
        headRollRad = -0.035 * activeEnv * whipFrac;
        jawOpenDeg = 0.0;
      }
    }

    // Damped sub-bass camera trauma (`tTrigger + 0.04s .. tTrigger + 1.05s`)
    const dtShake = t - (tTrigger + 0.04);
    if (dtShake > 0.0 && dtShake < 1.02) {
      const shIn = smoothstep01(dtShake / 0.08);
      const shOut = Math.exp(-3.1 * dtShake) * smoothstep01((1.02 - dtShake) / 0.22);
      cameraShakeTrauma = clamp(shIn * shOut * 1.15, 0.0, 1.0);
    }
    if (sigIsObj && Number.isFinite(stanRoarSignal.stanCameraRumble)) {
      cameraShakeTrauma = Math.max(cameraShakeTrauma, clamp(stanRoarSignal.stanCameraRumble, 0.0, 1.0));
    }
  }

  // Shockwave ring radius (`3.75m -> 15.2m` over `1.65s` from `tTrigger`, subtle `<= 0.26` dust alpha)
  let shockwaveProgress = 0.0;
  let shockwaveAlpha = 0.0;
  let shockwaveRadiusM = 0.0;
  if (dtRoar > 0.0 && dtRoar < 1.68) {
    shockwaveProgress = clamp(dtRoar / 1.68, 0.0, 1.0);
    const easeOut = 1.0 - Math.pow(1.0 - shockwaveProgress, 2.3);
    shockwaveRadiusM = lerp(3.75, 15.25, easeOut);
    shockwaveAlpha =
      smoothstep01(dtRoar / 0.09) * (1.0 - smootherstep01((dtRoar - 0.45) / 1.20)) * 0.26;
  }

  const out = arguments[0]?.out;
  if (out && typeof out === "object") {
    out.headYawRad = headYawRad;
    out.headPitchRad = headPitchRad;
    out.headRollRad = headRollRad;
    out.headYawDeg = headYawRad * RAD_TO_DEG;
    out.headPitchDeg = headPitchRad * RAD_TO_DEG;
    out.jawOpenDeg = jawOpenDeg;
    out.jawOpenRad = jawOpenDeg * DEG_TO_RAD;
    out.roarIntensity = roarIntensity;
    out.stanRoarIntensity = roarIntensity;
    out.cameraShakeTrauma = cameraShakeTrauma;
    out.shockwaveProgress = shockwaveProgress;
    out.shockwaveRadiusM = shockwaveRadiusM;
    out.shockwaveAlpha = shockwaveAlpha;
    out.dtRoar = dtRoar;
    out.effectiveTriggerSec = tTrigger;
    return out;
  }

  return {
    headYawRad,
    headPitchRad,
    headRollRad,
    headYawDeg: headYawRad * RAD_TO_DEG,
    headPitchDeg: headPitchRad * RAD_TO_DEG,
    jawOpenDeg,
    jawOpenRad: jawOpenDeg * DEG_TO_RAD,
    roarIntensity,
    stanRoarIntensity: roarIntensity,
    cameraShakeTrauma,
    shockwaveProgress,
    shockwaveRadiusM,
    shockwaveAlpha,
    dtRoar,
    effectiveTriggerSec: tTrigger,
  };
}

/**
 * Builds deterministic default home coordinates for the 54 Stan Courtyard lawn flamingos
 * (`R in [4.68m, 12.90m]` around `(-118, -50)` on lush 3D grass, outside the `4.55m` plinth).
 */
export function buildDefaultCourtyardFlamingos(
  count = 54,
  center = STAN_COURTYARD_CENTER,
  terrainHeightFn = null
) {
  const cx = Number(center?.x ?? STAN_COURTYARD_CENTER.x);
  const cz = Number(center?.z ?? STAN_COURTYARD_CENTER.z);
  const arr = new Array(count);
  for (let i = 0; i < count; i++) {
    const frac = (i + 0.5) / count;
    const jR = (hash01(i * 17 + 3) - 0.5) * 0.42;
    const jA = (hash01(i * 31 + 11) - 0.5) * 0.26;
    const r = 4.68 + 8.18 * Math.sqrt(frac) + jR;
    const theta = i * 2.39996323 + jA;
    const hx = cx + Math.cos(theta) * r;
    const hz = cz + Math.sin(theta) * r;
    const gy = terrainHeightFn ? Number(terrainHeightFn(hx, hz)) || 0.0 : 0.0;
    const homeYaw = (hash01(i * 47 + 7) * TWO_PI) - Math.PI;
    const phase = hash01(i * 59 + 19) * TWO_PI;
    arr[i] = {
      index: i,
      homeX: hx,
      homeZ: hz,
      homeYaw,
      x: hx,
      y: gy,
      z: hz,
      hopY: 0.0,
      yaw: homeYaw,
      pitch: 0.0,
      roll: 0.0,
      phase,
      wingFlap: 0.0,
      scattered: false,
    };
  }
  return arr;
}

/**
 * Pure deterministic courtyard flamingo scatter solver (`0` `Math.random()`, `0` integration drift):
 * When Stan's acoustic shockwave reaches a flamingo's lawn radius `rHome`, it executes a
 * 3-bounce damped comedic panic hop/tumble radially outward (staying strictly inside the
 * `R <= 13.18m` lush courtyard grass ring so zero flamingos ever enter pavers or roads!),
 * then settles cleanly at `hopY === 0.0000m` (`y === terrainHeightFn(x, z)`).
 */
export function evaluateFlamingoRoarScatter({
  timeSec = 0.0,
  roarTriggerSec = STAN_ROAR_TRIGGER_SEC_DEFAULT,
  stanRoarSignal = undefined,
  center = STAN_COURTYARD_CENTER,
  flamingos = null,
  terrainHeightFn = null,
} = {}) {
  const t = Number(timeSec) || 0.0;
  const cx = Number(center?.x ?? STAN_COURTYARD_CENTER.x);
  const cz = Number(center?.z ?? STAN_COURTYARD_CENTER.z);
  const sigIsObj = stanRoarSignal !== null && typeof stanRoarSignal === "object";
  const tTrigger = sigIsObj
    ? Number(
        stanRoarSignal.stanRoarTriggerTime ??
          stanRoarSignal.roarTriggerSec ??
          stanRoarSignal.triggerSec ??
          roarTriggerSec
      )
    : Number(roarTriggerSec);

  const list = flamingos || [];
  let scatteredCount = 0;

  for (let i = 0; i < list.length; i++) {
    const fl = list[i];
    const hx = Number.isFinite(fl.homeX) ? fl.homeX : fl.x;
    const hz = Number.isFinite(fl.homeZ) ? fl.homeZ : fl.z;
    if (!Number.isFinite(fl.homeYaw)) {
      fl.homeYaw = Number.isFinite(fl.yaw) ? fl.yaw : (hash01(i * 47 + 7) * TWO_PI - Math.PI);
    }

    const rdx = hx - cx;
    const rdz = hz - cz;
    const rHome = Math.max(0.001, Math.hypot(rdx, rdz));
    const ux = rdx / rHome;
    const uz = rdz / rHome;

    // Only scatter flamingos inside Stan Courtyard (`rHome <= 16.5m`)
    if (rHome > 16.5) continue;

    // Acoustic blast wave arrival delay (`~38 m/s` visual shockwave speed + tiny per-bird reaction jitter)
    const jitterDelay = hash01(i * 73 + 5) * 0.075;
    const waveDelay = Math.max(0.0, (rHome - 4.2) * 0.024) + jitterDelay;
    const dt = t - (tTrigger + waveDelay);

    if (dt <= 0.0 || dt > 12.0) {
      const gy0 = terrainHeightFn ? Number(terrainHeightFn(hx, hz)) || 0.0 : 0.0;
      fl.x = hx;
      fl.z = hz;
      fl.hopY = 0.0;
      fl.y = gy0;
      fl.yaw = fl.homeYaw;
      fl.pitch = 0.0;
      fl.roll = 0.0;
      fl.wingFlap = 0.0;
      fl.scattered = false;
      continue;
    }

    // Outward radial dart (`+1.55m .. +2.95m`), clamped strictly inside `[5.10m, 13.18m]` grass lawn!
    const maxPush = (1.55 + hash01(i * 97 + 13) * 1.40) * clamp((14.2 - rHome) / 8.5, 0.35, 1.15);
    const outProgress = smootherstep01(dt / 0.88);
    // Gentle return-to-home walk well after Shot 7 cuts (`dt > 8.2s`, i.e., `t > 48.4s`)
    const returnBlend = 1.0 - smootherstep01((dt - 8.2) / 3.2);
    const netDisp = outProgress * returnBlend;

    const rNow = clamp(rHome + maxPush * netDisp, 4.95, 13.18);
    const tangSign = i % 2 === 0 ? 1.0 : -1.0;
    const tangJink = tangSign * (0.22 + 0.18 * hash01(i * 41 + 29)) * Math.sin(outProgress * Math.PI) * returnBlend;

    const nx = cx + ux * rNow + (-uz) * tangJink;
    const nz = cz + uz * rNow + ux * tangJink;
    const groundY = terrainHeightFn ? Number(terrainHeightFn(nx, nz)) || 0.0 : 0.0;

    // 3-bounce damped ballistic parabola (`hop1 = 0.44s`, `hop2 = 0.34s`, `hop3 = 0.24s` -> settles at `dt === 1.02s`!)
    const hScale = 0.78 + 0.42 * hash01(i * 61 + 23);
    const d1 = 0.44;
    const d2 = 0.34;
    const d3 = 0.24;
    let hopY = 0.0;
    let tumblePitch = 0.0;
    let tumbleRoll = 0.0;
    let wingFlap = 0.0;

    if (dt < d1) {
      const u = dt / d1;
      hopY = 4.0 * u * (1.0 - u) * (0.56 * hScale);
      tumblePitch = Math.sin(u * Math.PI) * 0.38;
      tumbleRoll = tangSign * Math.sin(u * TWO_PI) * 0.28;
      wingFlap = 1.0;
    } else if (dt < d1 + d2) {
      const u = (dt - d1) / d2;
      hopY = 4.0 * u * (1.0 - u) * (0.28 * hScale);
      tumblePitch = Math.sin(u * Math.PI) * 0.20;
      tumbleRoll = -tangSign * Math.sin(u * Math.PI) * 0.16;
      wingFlap = 0.72;
    } else if (dt < d1 + d2 + d3) {
      const u = (dt - d1 - d2) / d3;
      hopY = 4.0 * u * (1.0 - u) * (0.10 * hScale);
      tumblePitch = Math.sin(u * Math.PI) * 0.08;
      tumbleRoll = tangSign * Math.sin(u * Math.PI) * 0.06;
      wingFlap = 0.36 * (1.0 - u);
    } else {
      // Strictly grounded on `y === groundY` (`hopY === 0.0000m`)!
      hopY = 0.0;
      tumblePitch = 0.0;
      tumbleRoll = 0.0;
      // Brief startled post-landing flutter (`1.02s .. 1.65s`), then calm alert stance
      wingFlap = dt < 1.65 ? 0.18 * (1.0 - smoothstep01((dt - 1.02) / 0.63)) : 0.0;
    }

    const outwardYaw = Math.atan2(ux, -uz);
    const yawNow = wrapAngleSigned(
      fl.homeYaw + wrapAngleSigned(outwardYaw - fl.homeYaw) * clamp(outProgress * 1.25, 0.0, 1.0) * returnBlend
    );

    fl.x = nx;
    fl.z = nz;
    fl.hopY = Math.max(0.0, hopY);
    fl.y = groundY + fl.hopY;
    fl.yaw = yawNow;
    fl.pitch = tumblePitch;
    fl.roll = tumbleRoll;
    fl.wingFlap = wingFlap;
    fl.scattered = netDisp > 0.02;
    if (fl.scattered) scatteredCount++;
  }

  return scatteredCount;
}

/**
 * Extracts `Courtyard_Cafe_Set_V5` from `stanV5Scene` and populates grounded bistro umbrella sets
 * (`minY === terrainHeightFn(ux, uz)`) across all requested `spots`.
 */
export function installCourtyardCafeSetsV5(THREE, stanV5Scene, options = {}) {
  const sceneRoot = stanV5Scene?.scene || stanV5Scene;
  const cafeSrc = findNamedNode(sceneRoot, STAN_V5_NODE_NAMES.cafeSet);
  if (!THREE || !cafeSrc) return null;

  const spots = options.spots || DEFAULT_COURTYARD_CAFE_SPOTS;
  const surfaceTopFn = options.surfaceTopFn || null;
  const terrainHeightFn = options.terrainHeightFn || null;
  const castShadow = options.castShadow !== false;
  const receiveShadow = options.receiveShadow !== false;
  const envMapIntensity = Number.isFinite(options.envMapIntensity) ? options.envMapIntensity : 0.34;

  const matCache = new Map();
  const group = new THREE.Group();
  // Named with `_Props_V5` so `auditAndGroundPropsZeroFloat` expands and audits each bistro set individually
  group.name = "Courtyard_Cafe_Props_V5";

  for (let i = 0; i < spots.length; i++) {
    const sp = spots[i];
    const ux = Array.isArray(sp) ? sp[0] : sp.x;
    const uz = Array.isArray(sp) ? sp[1] : sp.z;
    const uy = surfaceTopFn
      ? Number(surfaceTopFn(ux, uz, "cafeSets")) || 0.0
      : terrainHeightFn
        ? Number(terrainHeightFn(ux, uz)) || 0.0
        : Number(sp.y) || 0.0;
    const rotY = Number.isFinite(sp?.rotY) ? sp.rotY : (i * 0.78539816) % TWO_PI;

    const clone = cafeSrc.clone(true);
    clone.name = `Courtyard_Cafe_Set_V5_${i}`;
    // Reset bundle showcase offset `(6.80, 0, 0)` -> exact `(ux, uy, uz)` (`local_minY === 0.0000m`!)
    clone.position.set(ux, uy, uz);
    clone.rotation.set(0.0, rotY, 0.0);
    clone.scale.setScalar(Number(sp?.scale) || 1.0);

    clone.traverse((ch) => {
      if (!ch.isMesh) return;
      const prepMat = (m) => {
        if (!m) return m;
        if (matCache.has(m.uuid)) return matCache.get(m.uuid);
        const cm = m.clone();
        if (cm.isMeshStandardMaterial || cm.isMeshPhysicalMaterial) {
          cm.name = "Mat_Courtyard_Cafe_Umbrella_V6";
          if (cm.isMeshPhysicalMaterial) {
            cm.clearcoat = 0.0;
            cm.clearcoatRoughness = 1.0;
          }
          cm.metalnessMap = null;
          if (cm.normalMap) {
            cm.bumpMap = null;
            cm.bumpScale = 0.0;
          }
          cm.metalness = Math.min(0.06, cm.metalness ?? 0.04);
          cm.roughness = Math.max(0.68, cm.roughnessMap ? 0.88 : cm.roughness ?? 0.74);
          cm.envMapIntensity = envMapIntensity;
          if (cm.emissive && (cm.emissiveIntensity ?? 0.0) > 0.03) {
            cm.emissiveIntensity = 0.02;
          }
          cm.needsUpdate = true;
        }
        matCache.set(m.uuid, cm);
        return cm;
      };
      ch.material = Array.isArray(ch.material) ? ch.material.map(prepMat) : prepMat(ch.material);
      ch.castShadow = castShadow;
      ch.receiveShadow = receiveShadow;
    });

    group.add(clone);
  }

  if (options.targetRoot && options.targetRoot.add) {
    options.targetRoot.add(group);
  }
  return group;
}

/**
 * Deterministic headless-Node-safe PBR micro-surface `DataTexture` suite for V6 Stan:
 *   1. `bronzeRoughnessMap` (`256x256`, `[220..255]` -> effective roughness `[0.36..0.42]` with `roughness = 0.42`),
 *   2. `unitMetalnessMap` (`4x4` pure `255` so `metalness = 0.82` is preserved across SwiftShader & GPU),
 *   3. `limestoneGrainMap` (`256x256` neutral `[236..255]` bush-hammered pitting modulator paired with `#9A9284`),
 *   4. `limestoneNormalMap` (`256x256` tangent-space bush-hammered limestone normal map),
 *   5. `limestoneRoughnessMap` (`256x256`, `[242..255]` paired with `roughness = 0.88`).
 */
let _cachedStanV6PbrMaps = null;
function getStanV6PbrMaps(THREE) {
  if (_cachedStanV6PbrMaps) return _cachedStanV6PbrMaps;

  const size = 256;
  const mask = size - 1;
  // V7 Packed ORM (`R=AO, G=Roughness, B=Metalness, A=Height`) + foundry sand-cast bronze normalMap
  const bronzeOrmData = new Uint8Array(size * size * 4);
  const bronzeHeight = new Float32Array(size * size);
  const bronzeNormData = new Uint8Array(size * size * 4);
  const limeAlbData = new Uint8Array(size * size * 4);
  const limeOrmData = new Uint8Array(size * size * 4);
  const limeHeight = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const h1 = hash01(idx * 17 + 5);
      const h2 = hash01(((x >> 1) + (y >> 1) * 128) * 31 + 11);
      const h3 = hash01(((x >> 3) + (y >> 3) * 32) * 53 + 23);

      // Foundry cast-bronze micro-pore height, cavity AO, patina roughness, and cast-bronze metalness
      const foundryPit = h1 < 0.09 ? -0.22 : (h1 - 0.5) * 0.14 + (h2 - 0.5) * 0.20 + (h3 - 0.5) * 0.16;
      const bH = clamp(0.62 + foundryPit, 0.05, 1.0);
      bronzeHeight[idx] = bH;
      const bAo = Math.round(clamp((0.68 + 0.34 * bH) * 255.0, 152.0, 255.0));
      // Calibrated roughness [0.38..0.54] packed directly in G (with roughness scalar = 1.0)
      const bRough = Math.round(clamp((0.52 - 0.14 * bH + (h1 - 0.5) * 0.04) * 255.0, 92.0, 148.0));
      // Metallic bronze facets vs slightly less metallic oxidized pore crevices in B
      const bMetal = Math.round(clamp((0.76 + 0.24 * bH) * 255.0, 184.0, 255.0));
      const p = idx * 4;
      bronzeOrmData[p] = bAo;
      bronzeOrmData[p + 1] = bRough;
      bronzeOrmData[p + 2] = bMetal;
      bronzeOrmData[p + 3] = Math.round(bH * 255.0);

      // Bush-hammered Indiana limestone pitting + ashlar course micro-variation
      const courseSeam = y % 64 === 0 ? -0.14 : y % 64 === 1 ? -0.06 : 0.0;
      const vertSeam = ((x + ((y >> 6) & 1) * 128) & 255) < 2 ? -0.12 : 0.0;
      const seamTot = Math.min(courseSeam, vertSeam);
      const pit = h1 < 0.08 ? -0.07 : (h1 - 0.5) * 0.045 + (h2 - 0.5) * 0.055 + (h3 - 0.5) * 0.04;
      const lMod = clamp(0.97 + pit + seamTot, 0.80, 1.04);
      const lByte = Math.round(clamp(lMod * 246.0, 198.0, 255.0));
      limeAlbData[p] = lByte;
      limeAlbData[p + 1] = Math.round(clamp(lByte * 0.995, 196.0, 255.0));
      limeAlbData[p + 2] = Math.round(clamp(lByte * 0.985, 192.0, 255.0));
      limeAlbData[p + 3] = 255;

      const lH = clamp(0.62 + pit * 2.4 + seamTot * 2.2, 0.02, 1.0);
      limeHeight[idx] = lH;
      const lAo = Math.round(clamp((0.58 + 0.44 * lH) * 255.0, 138.0, 255.0));
      const lRough = Math.round(clamp((0.82 + (1.0 - lH) * 0.12 + (h1 - 0.5) * 0.04) * 255.0, 196.0, 246.0));
      limeOrmData[p] = lAo;
      limeOrmData[p + 1] = lRough;
      limeOrmData[p + 2] = 0;
      limeOrmData[p + 3] = Math.round(lH * 255.0);
    }
  }

  const limeNormData = new Uint8Array(size * size * 4);
  const limeStrength = 2.35;
  const bronzeStrength = 1.35;
  for (let y = 0; y < size; y++) {
    const ym = ((y - 1) & mask) * size;
    const yc = y * size;
    const yp = ((y + 1) & mask) * size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1) & mask;
      const xp = (x + 1) & mask;
      const p = (yc + x) * 4;

      const dxL = (limeHeight[yc + xp] - limeHeight[yc + xm]) * limeStrength;
      const dyL = (limeHeight[yp + x] - limeHeight[ym + x]) * limeStrength;
      const invL = 1.0 / Math.hypot(dxL, dyL, 1.0);
      limeNormData[p] = Math.round((-dxL * invL * 0.5 + 0.5) * 255.0);
      limeNormData[p + 1] = Math.round((-dyL * invL * 0.5 + 0.5) * 255.0);
      limeNormData[p + 2] = Math.round((invL * 0.5 + 0.5) * 255.0);
      limeNormData[p + 3] = 255;

      const dxB = (bronzeHeight[yc + xp] - bronzeHeight[yc + xm]) * bronzeStrength;
      const dyB = (bronzeHeight[yp + x] - bronzeHeight[ym + x]) * bronzeStrength;
      const invB = 1.0 / Math.hypot(dxB, dyB, 1.0);
      bronzeNormData[p] = Math.round((-dxB * invB * 0.5 + 0.5) * 255.0);
      bronzeNormData[p + 1] = Math.round((-dyB * invB * 0.5 + 0.5) * 255.0);
      bronzeNormData[p + 2] = Math.round((invB * 0.5 + 0.5) * 255.0);
      bronzeNormData[p + 3] = 255;
    }
  }

  const makeRepeatTex = (arr, w, h, isSrgb) => {
    const t = new THREE.DataTexture(arr, w, h, THREE.RGBAFormat);
    if (THREE.RepeatWrapping) {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
    }
    if (THREE.LinearFilter) {
      t.minFilter = THREE.LinearFilter;
      t.magFilter = THREE.LinearFilter;
    }
    if (isSrgb && THREE.SRGBColorSpace) {
      t.colorSpace = THREE.SRGBColorSpace;
    } else if (!isSrgb && THREE.NoColorSpace) {
      t.colorSpace = THREE.NoColorSpace;
    }
    t.needsUpdate = true;
    return t;
  };

  const bronzeOrmMap = makeRepeatTex(bronzeOrmData, size, size, false);
  const bronzeNormalMap = makeRepeatTex(bronzeNormData, size, size, false);
  const limestoneOrmMap = makeRepeatTex(limeOrmData, size, size, false);

  _cachedStanV6PbrMaps = {
    bronzeOrmMap,
    bronzeNormalMap,
    bronzeRoughnessMap: bronzeOrmMap,
    unitMetalnessMap: bronzeOrmMap,
    limestoneGrainMap: makeRepeatTex(limeAlbData, size, size, true),
    limestoneNormalMap: makeRepeatTex(limeNormData, size, size, false),
    limestoneRoughnessMap: limestoneOrmMap,
    limestoneOrmMap,
  };
  return _cachedStanV6PbrMaps;
}

/**
 * Applies the V7 Calibrated Oxidized Cast-Bronze Patina + Burnished Rib/Skull Pop shader:
 *   - `#3B2E1E` aged cast-bronze patina base,
 *   - `#9C7A4C` burnished rib/skull/crest specular & diffuse bronze ridges,
 *   - `#3E5648` subtle museum copper-carbonate verdigris nestled in deep skeletal cavities,
 *   - Warm sandstone plaza ground-bounce rim (`#E2B482`) + golden grazing silhouette rim so Stan's
 *     roaring skeleton pops dramatically against dark background Coast Redwoods (`keyframe_07`)!
 */
function applyStanMuseumOxidizedBronzePatina(THREE, mat, pbrMaps, bronzeEnvMapIntensity) {
  mat.name = "Mat_Stan_Bronze_Museum_V6";
  mat.color.set("#4D3E2B");
  // Packed ORM (`R=AO, G=Roughness, B=Metalness, A=Height`) + zero redundant bumpMap
  if (!mat.aoMap) {
    mat.aoMap = pbrMaps.bronzeOrmMap;
    mat.aoMapIntensity = 0.78;
  } else {
    mat.aoMapIntensity = 1.12;
  }
  mat.roughness = 1.0;
  mat.roughnessMap = pbrMaps.bronzeOrmMap;
  mat.metalness = 0.88;
  mat.metalnessMap = pbrMaps.bronzeOrmMap;
  if (!mat.normalMap) {
    mat.normalMap = pbrMaps.bronzeNormalMap;
    mat.normalScale = new THREE.Vector2(0.45, 0.45);
  } else if (mat.normalScale) {
    mat.normalScale.set(1.0, 1.0);
  }
  mat.bumpMap = null;
  mat.bumpScale = 0.0;
  mat.envMapIntensity = Math.min(0.66, Number.isFinite(bronzeEnvMapIntensity) ? Math.max(0.62, bronzeEnvMapIntensity) : 0.64);
  if (mat.emissive && typeof mat.emissive.set === "function") {
    mat.emissive.set("#110d08");
    mat.emissiveIntensity = 0.04;
  }
  if (mat.isMeshPhysicalMaterial) {
    mat.clearcoat = 0.0;
    mat.clearcoatRoughness = 1.0;
  }

  mat.userData = {
    ...(mat.userData || {}),
    v6MuseumOxidizedBronze: true,
    v7StanBronzePop: true,
    agedPatinaBaseHex: "#3B2E1E",
    burnishedRidgeHex: "#9C7A4C",
    verdigrisCavityHex: "#3E5648",
    v7WorldCohesionApplied: true,
  };

  mat.customProgramCacheKey = () => "stan_museum_oxidized_bronze_patina_v7_pop";
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vStanWorldPos;
        varying vec3 vStanWorldNormal;
        varying vec3 vStanViewNormal;`
      )
      .replace(
        "#include <worldpos_vertex>",
        `#include <worldpos_vertex>
        vec4 stanWp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          stanWp = instanceMatrix * stanWp;
        #endif
        stanWp = modelMatrix * stanWp;
        vStanWorldPos = stanWp.xyz;
        vStanWorldNormal = normalize(mat3(modelMatrix) * objectNormal + vec3(0.0, 1e-6, 0.0));
        vStanViewNormal = normalize(transformedNormal + vec3(0.0, 1e-6, 0.0));`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vStanWorldPos;
        varying vec3 vStanWorldNormal;
        varying vec3 vStanViewNormal;`
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        float v7StanRidgeMask = 0.5;
        float v7StanVerdigrisMask = 0.0;
        {
          vec3 stanRawTex = diffuseColor.rgb / max(diffuse, vec3(0.001));
          float stanBoneLum = dot(stanRawTex, vec3(0.299, 0.587, 0.114));
          vec3 stanWn = normalize(vStanWorldNormal + vec3(0.0, 1e-6, 0.0));
          vec3 stanViewDir = normalize(vViewPosition + vec3(0.0, 0.0, 1e-6));
          float stanNdotV = clamp(abs(dot(normalize(vStanViewNormal + vec3(0.0, 1e-6, 0.0)), stanViewDir)), 0.0, 1.0);
          float stanSilhouette = pow(max(1.0 - stanNdotV, 1e-4), 2.15);

          // Rib/skull/tooth crest burnish mask + deep skeletal recess verdigris mask
          v7StanRidgeMask = clamp(smoothstep(0.028, 0.148, stanBoneLum) + stanSilhouette * 0.34, 0.0, 1.0);
          v7StanVerdigrisMask = (1.0 - smoothstep(0.012, 0.064, stanBoneLum)) * clamp(0.68 - 0.32 * stanWn.y, 0.22, 1.0);

          // Exact calibrated linear sRGB targets:
          // #3B2E1E aged patina base   -> vec3(0.0437, 0.0273, 0.0130)
          // #3E5648 verdigris cavity   -> vec3(0.0482, 0.0931, 0.0648)
          // #9C7A4C burnished ridge    -> vec3(0.3325, 0.1946, 0.0723)
          vec3 stanPatinaBaseLin = vec3(0.0437, 0.0273, 0.0130);
          vec3 stanVerdigrisLin = vec3(0.0482, 0.0931, 0.0648);
          vec3 stanBurnishedLin = vec3(0.3325, 0.1946, 0.0723);

          vec3 stanCavityCol = mix(stanPatinaBaseLin, stanVerdigrisLin, v7StanVerdigrisMask * 0.52);
          diffuseColor.rgb = mix(stanCavityCol, stanBurnishedLin, v7StanRidgeMask);
        }`
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        // Burnished ribs, zygomatic skull ridges & teeth polish down to ~0.35 while verdigris cavities stay matte ~0.58
        roughnessFactor = clamp(mix(0.56, 0.34, v7StanRidgeMask) + v7StanVerdigrisMask * 0.06, 0.31, 0.64);`
      )
      .replace(
        "#include <lights_fragment_end>",
        `#include <lights_fragment_end>
        {
          vec3 stanWn2 = normalize(vStanWorldNormal + vec3(0.0, 1e-6, 0.0));
          float stanHAbovePlinth = max(vStanWorldPos.y - 0.52, 0.0);
          // Warm courtyard sandstone plaza ground-bounce rim on underside ribs, pelvis & roaring jaw
          float stanBounceMask = clamp(0.46 - 0.54 * stanWn2.y, 0.0, 1.0) * exp(-stanHAbovePlinth * 0.28);
          vec3 stanWarmPlazaBounce = vec3(0.58, 0.35, 0.16) * stanBounceMask * 0.26;
          // Golden-hour grazing silhouette rim so roaring Stan pops cleanly off dark background Coast Redwoods
          float stanGrazingRim = pow(max(1.0 - saturate(dot(geometryNormal, geometryViewDir)), 1e-4), 2.85);
          vec3 stanSilhouetteRim = vec3(0.68, 0.44, 0.19) * stanGrazingRim * (0.20 + 0.22 * v7StanRidgeMask);
          reflectedLight.indirectDiffuse += stanWarmPlazaBounce * diffuseColor.rgb * 2.2;
          reflectedLight.indirectSpecular += stanWarmPlazaBounce * 0.28 + stanSilhouetteRim;
        }`
      );
  };
  mat.needsUpdate = true;
}

function applyStanLimestonePlinthMaterial(THREE, mat, pbrMaps, plinthEnvIntensity) {
  mat.name = "Mat_Stan_Plinth_Boulder_Limestone_V6";
  mat.color.set("#9A9284");
  mat.map = pbrMaps.limestoneGrainMap;
  mat.normalMap = pbrMaps.limestoneNormalMap;
  if (!mat.normalScale) {
    mat.normalScale = new THREE.Vector2(0.88, 0.88);
  } else {
    mat.normalScale.set(0.88, 0.88);
  }
  mat.bumpMap = null;
  mat.bumpScale = 0.0;
  mat.aoMap = pbrMaps.limestoneOrmMap;
  mat.aoMapIntensity = 0.64;
  mat.roughnessMap = pbrMaps.limestoneOrmMap;
  mat.metalnessMap = pbrMaps.limestoneOrmMap;
  mat.roughness = 1.0;
  mat.metalness = 0.0;
  mat.envMapIntensity = plinthEnvIntensity;
  if (mat.emissive && typeof mat.emissive.set === "function") {
    mat.emissive.set("#000000");
    mat.emissiveIntensity = 0.0;
  }
  if (mat.isMeshPhysicalMaterial) {
    mat.clearcoat = 0.0;
    mat.clearcoatRoughness = 1.0;
  }
  mat.needsUpdate = true;
}

/**
 * Builds a headless-Node-safe 64x64 RGBA `DataTexture` with a smooth Gaussian/quintic
 * radial alpha falloff (`alpha = 0` at `r >= 0.96`) so courtyard ground dust puffs
 * never exhibit hard polygon edges or diamond confetti artifacts.
 */
function buildSoftRadialVaporTexture(THREE) {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  const half = (size - 1) * 0.5;
  for (let y = 0; y < size; y++) {
    const dy = (y - half) / half;
    for (let x = 0; x < size; x++) {
      const dx = (x - half) / half;
      const r2 = dx * dx + dy * dy;
      const falloff = r2 >= 0.90 ? 0.0 : Math.pow(1.0 - r2 / 0.90, 3.15);
      const idx = (y * size + x) * 4;
      data[idx] = 250;
      data[idx + 1] = 244;
      data[idx + 2] = 232;
      data[idx + 3] = Math.round(clamp(falloff * 255.0, 0.0, 255.0));
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  if (THREE.LinearFilter) {
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
  }
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Deterministic 2D value-noise helper (`0..1`) for breaking up roar-breath mist wisps
 * so Stan's acoustic roar breath never renders as smooth circular discs or lens smudges.
 */
function sampleBreathValueNoise2D(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3.0 - 2.0 * fx);
  const uy = fy * fy * (3.0 - 2.0 * fy);
  const h00 = hash01(ix * 127 + iy * 311 + 17);
  const h10 = hash01((ix + 1) * 127 + iy * 311 + 17);
  const h01 = hash01(ix * 127 + (iy + 1) * 311 + 17);
  const h11 = hash01((ix + 1) * 127 + (iy + 1) * 311 + 17);
  const nx0 = h00 + (h10 - h00) * ux;
  const nx1 = h01 + (h11 - h01) * ux;
  return nx0 + (nx1 - nx0) * uy;
}

/**
 * Builds a turbulent, streaky FBM wispy mist `DataTexture` (`64x64`) for Stan's roar breath.
 * Uses anisotropic horizontal shear + 3-octave FBM erosion so every breath wisp reads as
 * delicate translucent acoustic mist rather than circular beige blobs.
 */
function buildWispyRoarBreathTexture(THREE) {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  const half = (size - 1) * 0.5;
  for (let y = 0; y < size; y++) {
    const dy = (y - half) / half;
    for (let x = 0; x < size; x++) {
      const dx = (x - half) / half;
      // Tapered plume envelope (narrower near jaw origin, flaring & feathering downstream)
      const flareY = dy / (0.72 + 0.26 * (dx * 0.5 + 0.5));
      const r2 = dx * dx * 0.88 + flareY * flareY * 1.42;
      if (r2 >= 0.88) {
        continue;
      }
      const env = Math.pow(1.0 - r2 / 0.88, 2.85);
      // 3-octave sheared FBM filaments (streaked along X jet axis)
      const u1 = (dx + 1.0) * 2.4;
      const v1 = (dy + 1.0) * 5.2 + Math.sin(dx * 3.4) * 0.45;
      const n1 = sampleBreathValueNoise2D(u1, v1);
      const n2 = sampleBreathValueNoise2D(u1 * 2.15 + 7.3, v1 * 2.05 - 3.1);
      const n3 = sampleBreathValueNoise2D(u1 * 4.3 - 2.7, v1 * 3.9 + 5.9);
      const fbm = n1 * 0.52 + n2 * 0.31 + n3 * 0.17;
      const wisps = clamp((fbm - 0.34) / 0.52, 0.0, 1.0);
      const alpha = env * wisps * wisps * 0.78;
      const idx = (y * size + x) * 4;
      data[idx] = 238;
      data[idx + 1] = 245;
      data[idx + 2] = 250;
      data[idx + 3] = Math.round(clamp(alpha * 255.0, 0.0, 255.0));
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  if (THREE.LinearFilter) {
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
  }
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Builds a feathered radial ring `DataTexture` (`64x64`) for the ground dust shockwave
 * so the expanding acoustic ring has soft mist edges rather than hard `RingGeometry` polygons.
 */
function buildSoftShockwaveRingTexture(THREE) {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  const half = (size - 1) * 0.5;
  for (let y = 0; y < size; y++) {
    const dy = (y - half) / half;
    for (let x = 0; x < size; x++) {
      const dx = (x - half) / half;
      const r = Math.hypot(dx, dy);
      const band = Math.max(0.0, 1.0 - Math.abs(r - 0.80) / 0.17);
      const alpha = r > 0.98 ? 0.0 : Math.pow(band, 2.1);
      const idx = (y * size + x) * 4;
      data[idx] = 244;
      data[idx + 1] = 232;
      data[idx + 2] = 208;
      data[idx + 3] = Math.round(clamp(alpha * 255.0, 0.0, 255.0));
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  if (THREE.LinearFilter) {
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
  }
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Primary V5 Stan Courtyard Encounter Controller (`createStanEncounterController(THREE, options)`).
 *
 * Builds:
 *   1. Stepped Sierra Granite Plinth (`Stan_Plinth_V5`) + Articulated Bronze Stan T-Rex
 *      (`Stan_Body_V5` -> `Stan_Neck_Head_V5` -> `Stan_Lower_Jaw_V5`) at `(-118, -50)` with
 *      calibrated cast-bronze `envMapIntensity = 1.92`, warm golden courtyard key/rim/bounce lights,
 *      synchronous `Stan_Plinth_V5` zero-float grounding, and `castShadow` / `receiveShadow` on all meshes.
 *   2. Deterministic feathered ground dust shockwave + soft radial-gradient alpha dust/vapor puffs
 *      (`opacity <= 0.28`, zero polygon diamonds).
 *   3. Courtyard Bistro Umbrella Sets (`Courtyard_Cafe_Set_V5`) strictly on flat sandstone pavers &
 *      deterministic 54-flamingo outward hop/tumble scatter on roar.
 */
export function createStanEncounterController(THREE, options = {}) {
  if (!THREE) {
    throw new Error("createStanEncounterController requires a THREE namespace.");
  }

  const center = {
    x: Number(options.center?.x ?? STAN_COURTYARD_CENTER.x),
    z: Number(options.center?.z ?? STAN_COURTYARD_CENTER.z),
  };
  const terrainHeightFn = typeof options.terrainHeightFn === "function" ? options.terrainHeightFn : null;
  const surfaceTopFn = typeof options.surfaceTopFn === "function" ? options.surfaceTopFn : null;
  const groundY = Number.isFinite(options.groundY)
    ? options.groundY
    : surfaceTopFn
      ? Number(surfaceTopFn(center.x, center.z, "stanPlinth")) || 0.0
      : terrainHeightFn
        ? Number(terrainHeightFn(center.x, center.z)) || 0.0
        : 0.0;

  const baseYawRad = Number.isFinite(options.baseYawRad)
    ? options.baseYawRad
    : STAN_DEFAULT_BASE_YAW_RAD;
  const defaultRoarTriggerSec = Number.isFinite(options.roarTriggerSec)
    ? options.roarTriggerSec
    : STAN_ROAR_TRIGGER_SEC_DEFAULT;
  const modelScale = Number.isFinite(options.scale) ? options.scale : 1.0;
  const envMapIntensity = Number.isFinite(options.envMapIntensity) ? options.envMapIntensity : 0.38;
  const bronzeEnvMapIntensity = Number.isFinite(options.bronzeEnvMapIntensity)
    ? Math.min(0.60, options.bronzeEnvMapIntensity)
    : 0.60;
  const stanV6PbrMaps = getStanV6PbrMaps(THREE);

  // Root encounter group — detects whether `parent` / `stanHolder` is already centered at `(-118, -50)`
  const encounterGroup = new THREE.Group();
  encounterGroup.name = "Stan_Encounter_V5_Root";

  const attachParent = options.stanHolder || options.parent || options.rootGroup || null;
  const parentAlreadyCentered = Boolean(
    options.stanHolder ||
      (attachParent &&
        attachParent.position &&
        Math.hypot(attachParent.position.x - center.x, attachParent.position.z - center.z) < 0.75)
  );

  if (parentAlreadyCentered) {
    encounterGroup.position.set(0.0, 0.0, 0.0);
  } else {
    encounterGroup.position.set(center.x, groundY, center.z);
  }

  // Oriented monument assembly (`baseYawRad` points Stan & front museum plaque toward Pelican's pass)
  const monumentRig = new THREE.Group();
  monumentRig.name = "Stan_Monument_Oriented_V5";
  monumentRig.userData.groundAsSingleUnit = true;
  monumentRig.userData.bx = center.x;
  monumentRig.userData.bz = center.z;
  monumentRig.rotation.y = baseYawRad;
  monumentRig.scale.setScalar(modelScale);
  encounterGroup.add(monumentRig);

  // Synchronous zero-float `Stan_Plinth_V5` placeholder (`2.26m x 4.12m x 0.56m`, `minY === 0.0000m`)
  // in weathered bush-hammered grey-buff limestone (`#9A9284`, `roughness: 0.88`)!
  let placeholderPlinthGeom = new THREE.BoxGeometry(2.26, 0.56, 4.12);
  placeholderPlinthGeom.translate(0.0, 0.28, 0.05);
  let placeholderPlinthMat = new THREE.MeshStandardMaterial({
    name: "Mat_Stan_Plinth_Boulder_Limestone_V6",
    color: "#9A9284",
    map: stanV6PbrMaps.limestoneGrainMap,
    normalMap: stanV6PbrMaps.limestoneNormalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughnessMap: stanV6PbrMaps.limestoneRoughnessMap,
    roughness: 0.88,
    metalness: 0.02,
    envMapIntensity,
  });
  const placeholderPlinth = new THREE.Mesh(placeholderPlinthGeom, placeholderPlinthMat);
  placeholderPlinth.name = STAN_V5_NODE_NAMES.plinth;
  placeholderPlinth.userData.groundingCategory = "stanPlinth";
  placeholderPlinth.userData.isPlaceholderPlinth = true;
  placeholderPlinth.castShadow = true;
  placeholderPlinth.receiveShadow = true;
  monumentRig.add(placeholderPlinth);

  // Subtle non-glowing museum courtyard skylight & limestone shadow-fill rig
  // (keeps ribcage & underside jaw readable without orange-brass point-light glare OR #000 crush!)
  const courtyardLightRig = new THREE.Group();
  courtyardLightRig.name = "Stan_Courtyard_Light_Rig";
  const keyFillLight = new THREE.PointLight("#7B9EC4", 3.6, 28.0, 1.6);
  keyFillLight.name = "Stan_Courtyard_Key_Light";
  keyFillLight.position.set(8.2, 5.6, 7.8);
  const dorsalRimLight = new THREE.PointLight("#EAD7B7", 2.6, 26.0, 1.6);
  dorsalRimLight.name = "Stan_Courtyard_Rim_Light";
  dorsalRimLight.position.set(6.5, 6.2, -6.5);
  const jawBounceLight = new THREE.PointLight("#9A9284", 1.8, 18.0, 1.6);
  jawBounceLight.name = "Stan_Courtyard_Bounce_Light";
  jawBounceLight.position.set(2.8, 1.9, 4.4);
  courtyardLightRig.add(keyFillLight, dorsalRimLight, jawBounceLight);
  encounterGroup.add(courtyardLightRig);

  // Articulated node references (seeded synchronously with `placeholderPlinth`, upgraded by `attachGlbScene`)
  const nodes = {
    plinth: placeholderPlinth,
    body: null,
    neckHead: null,
    lowerJaw: null,
    cafePrototype: null,
  };
  let restNeckPos = new THREE.Vector3(0.0, 2.86, 1.48);
  let restJawPos = new THREE.Vector3(0.0, 0.62, 0.74);
  let cafeSetsGroup = null;

  // ==========================================================================
  // DETERMINISTIC ZERO-GC ROAR SHOCKWAVE & SOFT RADIAL VAPOR/DUST BILLBOARDS
  // (All transient VFX nodes include `Dust` in their names so zero-float static prop audits skip them)
  // ==========================================================================
  const shockwaveGroup = new THREE.Group();
  shockwaveGroup.name = "Stan_Roar_Shockwave_Dust_VFX";
  shockwaveGroup.visible = false;
  encounterGroup.add(shockwaveGroup);

  const vaporTex = buildSoftRadialVaporTexture(THREE);
  const breathWispTex = buildWispyRoarBreathTexture(THREE);
  const ringTex = buildSoftShockwaveRingTexture(THREE);

  const ringGeom = new THREE.PlaneGeometry(2.0, 2.0);
  ringGeom.rotateX(-Math.PI * 0.5);
  const ringMat = new THREE.MeshBasicMaterial({
    map: ringTex,
    color: "#e6d5b8",
    transparent: true,
    opacity: 0.0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const lockNoCastShadowVfxMesh = (mesh) => {
    mesh.userData = mesh.userData || {};
    mesh.userData.noCastShadow = true;
    mesh.receiveShadow = false;
    if (mesh.layers) {
      mesh.layers.enable(0);
      mesh.layers.disable(1);
      mesh.layers.disable(2);
    }
    // Prevent parent group traversals (e.g. `stanHolder.traverse(ch => ch.castShadow = ...)`) from ever
    // flipping translucent shockwave/dust/breath billboards into shadow casters!
    Object.defineProperty(mesh, "castShadow", {
      get() {
        return false;
      },
      set(_v) {},
      configurable: true,
      enumerable: true,
    });
  };

  const shockwaveRingMesh = new THREE.Mesh(ringGeom, ringMat);
  shockwaveRingMesh.name = "Stan_Shockwave_Dust_Ring";
  shockwaveRingMesh.position.y = 0.045;
  lockNoCastShadowVfxMesh(shockwaveRingMesh);
  shockwaveGroup.add(shockwaveRingMesh);

  // 32 Soft Radial-Gradient Sunlit Courtyard Dust Puffs erupting around plinth base (`opacity <= 0.16`)
  const DUST_LEAF_COUNT = 32;
  const leafGeom = new THREE.PlaneGeometry(0.62, 0.62);
  const leafMat = new THREE.MeshBasicMaterial({
    map: vaporTex,
    color: "#dcc59e",
    transparent: true,
    opacity: 0.16,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const shockwaveLeavesInst = new THREE.InstancedMesh(leafGeom, leafMat, DUST_LEAF_COUNT);
  shockwaveLeavesInst.name = "Stan_Shockwave_Dust_Leaves_Instanced";
  lockNoCastShadowVfxMesh(shockwaveLeavesInst);
  shockwaveLeavesInst.frustumCulled = false;
  const leafColor = new THREE.Color();
  const leafPalette = [0xe2cfa8, 0xd4be94, 0xdfc89e, 0xcfb487];
  const leafSeeds = new Array(DUST_LEAF_COUNT);
  for (let i = 0; i < DUST_LEAF_COUNT; i++) {
    leafColor.setHex(leafPalette[i % leafPalette.length]);
    shockwaveLeavesInst.setColorAt(i, leafColor);
    leafSeeds[i] = {
      angle: (i / DUST_LEAF_COUNT) * TWO_PI + (hash01(i * 19 + 3) - 0.5) * 0.22,
      rStart: 3.75 + hash01(i * 29 + 7) * 0.85,
      rSpan: 4.8 + hash01(i * 37 + 11) * 4.4,
      apexY: 0.26 + hash01(i * 43 + 17) * 0.48,
      dur: 0.82 + hash01(i * 53 + 23) * 0.62,
      delay: hash01(i * 67 + 31) * 0.14,
      spinX: (hash01(i * 71 + 5) - 0.5) * 2.2,
      spinZ: (hash01(i * 79 + 9) - 0.5) * 2.8,
      scaleBase: 0.85 + hash01(i * 83 + 15) * 0.85,
    };
  }
  if (shockwaveLeavesInst.instanceColor) shockwaveLeavesInst.instanceColor.needsUpdate = true;
  shockwaveGroup.add(shockwaveLeavesInst);

  // 28 Delicate Streaky FBM Acoustic Breath Mist Wisps streaming from `Stan_Neck_Head_V5` jaws (`opacity <= 0.082`)
  const BREATH_MOTE_COUNT = 28;
  const moteGeom = new THREE.PlaneGeometry(0.60, 0.23);
  const moteMat = new THREE.MeshBasicMaterial({
    map: breathWispTex,
    color: "#ebf1f6",
    transparent: true,
    opacity: 0.0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const breathMotesInst = new THREE.InstancedMesh(moteGeom, moteMat, BREATH_MOTE_COUNT);
  breathMotesInst.name = "Stan_Roar_Breath_Dust_Motes_Instanced";
  lockNoCastShadowVfxMesh(breathMotesInst);
  breathMotesInst.frustumCulled = false;
  breathMotesInst.visible = false;
  shockwaveGroup.add(breathMotesInst);
  const moteSeeds = new Array(BREATH_MOTE_COUNT);
  for (let i = 0; i < BREATH_MOTE_COUNT; i++) {
    const spreadAng = (i / BREATH_MOTE_COUNT) * TWO_PI + hash01(i * 23 + 7) * 0.5;
    const coneR = 0.05 + 0.24 * Math.sqrt(hash01(i * 31 + 13));
    moteSeeds[i] = {
      dirX: Math.cos(spreadAng) * coneR,
      dirY: Math.sin(spreadAng) * coneR * 0.62 - 0.08,
      speed: 3.4 + hash01(i * 41 + 19) * 3.6,
      phaseOffset: hash01(i * 59 + 29) * 0.95,
      scaleBase: 0.54 + hash01(i * 73 + 37) * 0.56,
      yawOffset: (i % 3 - 1) * 0.42 + (hash01(i * 89 + 41) - 0.5) * 0.30,
    };
  }

  // Pre-allocated scratch math objects (Zero GC per frame!)
  const _pos = new THREE.Vector3();
  const _neckOrigin = new THREE.Vector3();
  const _euler = new THREE.Euler(0, 0, 0, "YXZ");
  const _quat = new THREE.Quaternion();
  const _quatBase = new THREE.Quaternion();
  const _quatNeck = new THREE.Quaternion();
  const _scale = new THREE.Vector3(1, 1, 1);
  const _mat4 = new THREE.Matrix4();
  const _stanShockwave = { x: center.x, z: center.z, radiusM: 0.0, intensity: 0.0 };
  const _kinScratch = {
    headYawRad: 0.0,
    headPitchRad: 0.0,
    headRollRad: 0.0,
    headYawDeg: 0.0,
    headPitchDeg: 0.0,
    jawOpenDeg: 0.0,
    jawOpenRad: 0.0,
    roarIntensity: 0.0,
    stanRoarIntensity: 0.0,
    cameraShakeTrauma: 0.0,
    shockwaveProgress: 0.0,
    shockwaveRadiusM: 0.0,
    shockwaveAlpha: 0.0,
    dtRoar: 0.0,
    effectiveTriggerSec: defaultRoarTriggerSec,
  };
  const _kinArgsScratch = {
    timeSec: 0.0,
    pelicanPos: null,
    stanRoarSignal: undefined,
    center,
    baseYawRad,
    roarTriggerSec: defaultRoarTriggerSec,
    out: _kinScratch,
  };
  const _scatterArgsScratch = {
    timeSec: 0.0,
    roarTriggerSec: defaultRoarTriggerSec,
    stanRoarSignal: undefined,
    center,
    flamingos: null,
    terrainHeightFn,
  };
  const _updateResult = {
    headYawDeg: 0.0,
    headPitchDeg: 0.0,
    jawOpenDeg: 0.0,
    roarIntensity: 0.0,
    stanRoarIntensity: 0.0,
    cameraShakeTrauma: 0.0,
    shockwaveRadiusM: 0.0,
    stanShockwave: _stanShockwave,
    flamingosScattered: 0,
  };
  const _emptyObj = Object.freeze({});

  const internalFlamingos = buildDefaultCourtyardFlamingos(54, center, terrainHeightFn);

  function attachGlbScene(stanV5Scene) {
    const srcRoot = stanV5Scene?.scene || stanV5Scene;
    if (!srcRoot) return false;

    const plinthSrc = findNamedNode(srcRoot, STAN_V5_NODE_NAMES.plinth);
    const bodySrc = findNamedNode(srcRoot, STAN_V5_NODE_NAMES.body);
    const cafeSrc = findNamedNode(srcRoot, STAN_V5_NODE_NAMES.cafeSet);
    if (!plinthSrc || !bodySrc) return false;

    while (monumentRig.children.length > 0) {
      monumentRig.remove(monumentRig.children[0]);
    }
    if (placeholderPlinthGeom) {
      placeholderPlinthGeom.dispose();
      placeholderPlinthGeom = null;
    }
    if (placeholderPlinthMat) {
      placeholderPlinthMat.dispose();
      placeholderPlinthMat = null;
    }

    const matCache = new Map();
    const prepHierarchyShadowsAndMaterials = (obj, isBronzeSkeleton = false) => {
      obj.traverse((ch) => {
        if (!ch.isMesh) return;
        const prepMat = (m) => {
          if (!m) return m;
          const cacheKey = `${m.uuid}:${isBronzeSkeleton ? "bronze" : "stone"}`;
          if (matCache.has(cacheKey)) return matCache.get(cacheKey);
          const cm = m.clone();
          if (cm.isMeshStandardMaterial || cm.isMeshPhysicalMaterial) {
            if (isBronzeSkeleton) {
              applyStanMuseumOxidizedBronzePatina(THREE, cm, stanV6PbrMaps, bronzeEnvMapIntensity);
            } else {
              applyStanLimestonePlinthMaterial(THREE, cm, stanV6PbrMaps, envMapIntensity);
            }
          }
          matCache.set(cacheKey, cm);
          return cm;
        };
        ch.material = Array.isArray(ch.material) ? ch.material.map(prepMat) : prepMat(ch.material);
        ch.castShadow = true;
        ch.receiveShadow = true;
      });
    };

    const plinthClone = plinthSrc.clone(true);
    plinthClone.name = STAN_V5_NODE_NAMES.plinth;
    plinthClone.userData.groundingCategory = "stanPlinth";
    plinthClone.position.set(0.0, 0.0, 0.0);
    plinthClone.rotation.set(0.0, 0.0, 0.0);
    plinthClone.scale.set(1.0, 1.0, 1.0);
    // Guarantee exact `0.0mm` grounding (`local minY === 0.0000m`) on `Stan_Plinth_V5`
    plinthClone.updateMatrixWorld(true);
    const plinthBox = new THREE.Box3().setFromObject(plinthClone);
    if (Number.isFinite(plinthBox.min.y) && Math.abs(plinthBox.min.y) > 1e-5) {
      plinthClone.position.y -= plinthBox.min.y;
    }
    prepHierarchyShadowsAndMaterials(plinthClone, false);

    // Clone `Stan_Body_V5` WITH its articulated child hierarchy (`Stan_Neck_Head_V5` -> `Stan_Lower_Jaw_V5`)!
    const bodyClone = bodySrc.clone(true);
    bodyClone.name = STAN_V5_NODE_NAMES.body;
    prepHierarchyShadowsAndMaterials(bodyClone, true);

    const neckClone = findNamedNode(bodyClone, STAN_V5_NODE_NAMES.neckHead);
    const jawClone = findNamedNode(bodyClone, STAN_V5_NODE_NAMES.lowerJaw);

    if (neckClone) {
      neckClone.name = STAN_V5_NODE_NAMES.neckHead;
      neckClone.rotation.order = "YXZ";
      restNeckPos.copy(neckClone.position);
    }

    if (jawClone) {
      jawClone.name = STAN_V5_NODE_NAMES.lowerJaw;
      jawClone.rotation.order = "XYZ";
      restJawPos.copy(jawClone.position);
    }

    monumentRig.add(plinthClone, bodyClone);
    nodes.plinth = plinthClone;
    nodes.body = bodyClone;
    nodes.neckHead = neckClone;
    nodes.lowerJaw = jawClone;
    nodes.cafePrototype = cafeSrc || null;

    // Hide legacy plain grey cylinder plinth & unarticulated fallback inside `stanHolder` if attached there
    if (attachParent && attachParent !== encounterGroup.parent) {
      if (parentAlreadyCentered) {
        for (const ch of attachParent.children) {
          if (ch !== encounterGroup) ch.visible = false;
        }
      }
      attachParent.add(encounterGroup);
    } else if (attachParent && parentAlreadyCentered) {
      for (const ch of attachParent.children) {
        if (ch !== encounterGroup) ch.visible = false;
      }
    }

    // Optional automatic courtyard bistro umbrella set installation
    if (cafeSrc && (options.cafeSpots || options.cafeTargetRoot || options.installCafeSets)) {
      installCafeSets(options.cafeSpots || DEFAULT_COURTYARD_CAFE_SPOTS, options.cafeTargetRoot || null);
    }

    monumentRig.updateMatrixWorld(true);
    return true;
  }

  function installCafeSets(spots = DEFAULT_COURTYARD_CAFE_SPOTS, targetRoot = null) {
    if (!nodes.cafePrototype) return null;
    if (cafeSetsGroup && cafeSetsGroup.parent) {
      cafeSetsGroup.parent.remove(cafeSetsGroup);
    }
    const wrapper = { getObjectByName: (nm) => (nm === STAN_V5_NODE_NAMES.cafeSet ? nodes.cafePrototype : null) };
    cafeSetsGroup = installCourtyardCafeSetsV5(THREE, wrapper, {
      spots,
      surfaceTopFn,
      terrainHeightFn,
      targetRoot,
      envMapIntensity,
      castShadow: true,
      receiveShadow: true,
    });
    return cafeSetsGroup;
  }

  // Attach parent immediately even before GLB arrives if `attachParent` was supplied
  if (attachParent && !encounterGroup.parent) {
    if (parentAlreadyCentered) {
      for (const ch of attachParent.children) {
        if (ch !== encounterGroup) ch.visible = false;
      }
    }
    attachParent.add(encounterGroup);
  }

  if (options.stanV5Scene) {
    attachGlbScene(options.stanV5Scene);
  }

  /**
   * Pure deterministic per-frame update (`100%` function of `timeSec`, `pelicanPos`, `stanRoarSignal`).
   */
  function update(opts) {
    const o = opts || _emptyObj;
    const t = Number(o.timeSec) || 0.0;
    _kinArgsScratch.timeSec = t;
    _kinArgsScratch.pelicanPos = o.pelicanPos ?? null;
    _kinArgsScratch.stanRoarSignal = o.stanRoarSignal;
    _kinArgsScratch.roarTriggerSec = o.roarTriggerSec ?? defaultRoarTriggerSec;
    const kin = evaluateStanRoarKinematics(_kinArgsScratch);
    const flamingos = o.flamingos;
    const flamingosBodyInstanced =
      o.flamingosBodyInstanced !== undefined ? o.flamingosBodyInstanced : (options.flamingosBodyInstanced || null);
    const flamingosExtraBatches =
      o.flamingosExtraBatches !== undefined ? o.flamingosExtraBatches : (options.flamingosExtraBatches || null);

    // 1. Apply articulated cervicothoracic neck/head whip (`YXZ` order) & lower jaw roar gape (`+X` hinge)
    if (nodes.neckHead) {
      nodes.neckHead.position.copy(restNeckPos);
      nodes.neckHead.rotation.set(kin.headPitchRad, kin.headYawRad, kin.headRollRad, "YXZ");
    }
    if (nodes.lowerJaw) {
      nodes.lowerJaw.position.copy(restJawPos);
      // Rest museum skeleton already holds an alert ~18° gape; +0.68 * jawOpenRad snaps to ~43.6° full roar!
      nodes.lowerJaw.rotation.set(kin.jawOpenRad * 0.68, 0.0, 0.0, "XYZ");
    }

    // 2. Deterministic Feathered Ground Shockwave Ring + 32 Soft Radial Dust Puffs (`opacity <= 0.24`)
    const showShockwave = kin.dtRoar > 0.0 && kin.dtRoar < 1.72;
    const showBreath = kin.roarIntensity > 0.02;
    shockwaveGroup.visible = showShockwave || showBreath;
    shockwaveRingMesh.visible = showShockwave && kin.shockwaveAlpha > 0.004;
    shockwaveLeavesInst.visible = showShockwave;
    if (showShockwave) {
      const rScale = Math.max(0.01, kin.shockwaveRadiusM);
      shockwaveRingMesh.scale.set(rScale, 1.0, rScale);
      ringMat.opacity = clamp(kin.shockwaveAlpha * 0.78, 0.0, 0.18);
      leafMat.opacity = clamp(0.05 + 0.11 * (1.0 - kin.shockwaveProgress), 0.0, 0.16);

      for (let i = 0; i < DUST_LEAF_COUNT; i++) {
        const sd = leafSeeds[i];
        const lt = kin.dtRoar - sd.delay;
        if (lt <= 0.0 || lt >= sd.dur) {
          _pos.set(0.0, -20.0, 0.0);
          _quat.identity();
          _scale.setScalar(0.0001);
        } else {
          const u = lt / sd.dur;
          const easeR = 1.0 - Math.pow(1.0 - u, 2.1);
          const rr = sd.rStart + sd.rSpan * easeR;
          const lx = Math.cos(sd.angle) * rr;
          const lz = Math.sin(sd.angle) * rr;
          const ly = 0.06 + 4.0 * u * (1.0 - u) * sd.apexY;
          const fade = Math.sin(u * Math.PI) * sd.scaleBase * (0.75 + 0.55 * u);
          _pos.set(lx, ly, lz);
          _euler.set(-1.12 + 0.22 * Math.sin(lt * sd.spinX + i), sd.angle, lt * sd.spinZ, "YXZ");
          _quat.setFromEuler(_euler);
          _scale.setScalar(Math.max(0.001, fade));
        }
        _mat4.compose(_pos, _quat, _scale);
        shockwaveLeavesInst.setMatrixAt(i, _mat4);
      }
      shockwaveLeavesInst.instanceMatrix.needsUpdate = true;
    }

    // 3. Deterministic Streaky FBM Roar Breath Mist Wisps streaming from open jaws (`opacity <= 0.082`, zero circular blobs)
    breathMotesInst.visible = showBreath;
    if (showBreath) {
      moteMat.opacity = clamp(0.018 + 0.064 * kin.roarIntensity, 0.0, 0.082);
      const localRoarClock = Math.max(0.0, kin.dtRoar);
      const bodyLocalY = nodes.body ? nodes.body.position.y : 0.56;
      _euler.set(0.0, baseYawRad, 0.0, "YXZ");
      _quatBase.setFromEuler(_euler);
      _euler.set(kin.headPitchRad, kin.headYawRad, kin.headRollRad, "YXZ");
      _quatNeck.setFromEuler(_euler);
      _quatNeck.premultiply(_quatBase);

      _neckOrigin
        .set(restNeckPos.x, bodyLocalY + restNeckPos.y, restNeckPos.z)
        .multiplyScalar(modelScale)
        .applyQuaternion(_quatBase);

      for (let i = 0; i < BREATH_MOTE_COUNT; i++) {
        const ms = moteSeeds[i];
        // Continuous deterministic wispy mist stream cycling every `0.48s` during the roar
        const lifeU = ((localRoarClock * 2.08 + ms.phaseOffset) % 1.0 + 1.0) % 1.0;
        const distFwd = lifeU * ms.speed * 0.58;
        // Origin `(0, 0.60, 1.72)` sits right inside the proud S-neck roaring maxillary/dentary gape in `Stan_Neck_Head_V5` space!
        const mx = ms.dirX * (0.12 + distFwd * 0.68);
        const my = 0.60 + ms.dirY * (0.12 + distFwd * 0.68) - 0.05 * lifeU * lifeU;
        const mz = 1.74 + distFwd;
        const sEnv =
          Math.sin(lifeU * Math.PI) *
          ms.scaleBase *
          (0.45 + 0.62 * lifeU) *
          (0.50 + 0.50 * kin.roarIntensity) *
          modelScale;
        _pos.set(mx, my, mz).multiplyScalar(modelScale).applyQuaternion(_quatNeck).add(_neckOrigin);
        _euler.set(
          0.12 * Math.sin(lifeU * 3.2 + i),
          baseYawRad + kin.headYawRad + Math.PI * 0.5 + ms.yawOffset,
          (hash01(i * 47 + 11) - 0.5) * 0.42 + lifeU * 0.35,
          "YXZ"
        );
        _quat.setFromEuler(_euler);
        const sLen = Math.max(0.001, sEnv * (1.15 + 0.55 * lifeU));
        const sHgt = Math.max(0.001, sEnv * (0.72 + 0.28 * lifeU));
        _scale.set(sLen, sHgt, 1.0);
        _mat4.compose(_pos, _quat, _scale);
        breathMotesInst.setMatrixAt(i, _mat4);
      }
      breathMotesInst.instanceMatrix.needsUpdate = true;
    }

    // 4. Deterministic Courtyard Flamingo Hop/Tumble Outward Scatter (settling cleanly at `hopY === 0.0m`)
    const targetFlamingos = Array.isArray(flamingos)
      ? flamingos
      : flamingosBodyInstanced
        ? internalFlamingos
        : null;

    let flamingosScattered = 0;
    if (targetFlamingos) {
      _scatterArgsScratch.timeSec = t;
      _scatterArgsScratch.roarTriggerSec = kin.effectiveTriggerSec;
      _scatterArgsScratch.stanRoarSignal = o.stanRoarSignal;
      _scatterArgsScratch.flamingos = targetFlamingos;
      flamingosScattered = evaluateFlamingoRoarScatter(_scatterArgsScratch);

      if (flamingosBodyInstanced) {
        const count = Math.min(targetFlamingos.length, flamingosBodyInstanced.count || targetFlamingos.length);
        for (let i = 0; i < count; i++) {
          const fl = targetFlamingos[i];
          _pos.set(fl.x, fl.y, fl.z);
          _euler.set(
            (fl.pitch || 0.0) + fl.wingFlap * 0.18 * Math.sin(t * 18.0 + fl.phase),
            -fl.yaw,
            (fl.roll || 0.0) + Math.sin(t * 14.0 + fl.phase) * fl.wingFlap * 0.14,
            "YXZ"
          );
          _quat.setFromEuler(_euler);
          const flapW = 1.0 + fl.wingFlap * 0.24 * Math.abs(Math.sin(t * 22.0 + fl.phase));
          _scale.set(flapW, 1.0, 1.0);
          _mat4.compose(_pos, _quat, _scale);
          flamingosBodyInstanced.setMatrixAt(i, _mat4);
          if (flamingosExtraBatches) {
            for (const exInst of flamingosExtraBatches) {
              exInst.setMatrixAt(i, _mat4);
            }
          }
        }
        flamingosBodyInstanced.instanceMatrix.needsUpdate = true;
        if (flamingosExtraBatches) {
          for (const exInst of flamingosExtraBatches) {
            exInst.instanceMatrix.needsUpdate = true;
          }
        }
      }
    }

    _stanShockwave.x = center.x;
    _stanShockwave.z = center.z;
    _stanShockwave.radiusM = kin.shockwaveRadiusM;
    _stanShockwave.intensity = kin.roarIntensity > 0.001 ? kin.roarIntensity : kin.shockwaveAlpha * 1.4;

    _updateResult.headYawDeg = kin.headYawDeg;
    _updateResult.headPitchDeg = kin.headPitchDeg;
    _updateResult.jawOpenDeg = kin.jawOpenDeg;
    _updateResult.roarIntensity = kin.roarIntensity;
    _updateResult.stanRoarIntensity = kin.roarIntensity;
    _updateResult.cameraShakeTrauma = kin.cameraShakeTrauma;
    _updateResult.shockwaveRadiusM = kin.shockwaveRadiusM;
    _updateResult.stanShockwave = _stanShockwave;
    _updateResult.flamingosScattered = flamingosScattered;
    return _updateResult;
  }

  function dispose() {
    if (placeholderPlinthGeom) placeholderPlinthGeom.dispose();
    if (placeholderPlinthMat) placeholderPlinthMat.dispose();
    ringGeom.dispose();
    ringMat.dispose();
    ringTex.dispose();
    leafGeom.dispose();
    leafMat.dispose();
    moteGeom.dispose();
    moteMat.dispose();
    vaporTex.dispose();
    breathWispTex.dispose();
  }

  return {
    group: encounterGroup,
    monumentRig,
    courtyardLightRig,
    shockwaveGroup,
    nodes,
    internalFlamingos,
    get cafeSetsGroup() {
      return cafeSetsGroup;
    },
    attachGlbScene,
    installCafeSets,
    update,
    dispose,
  };
}
