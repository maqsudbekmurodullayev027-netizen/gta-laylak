/**
 * ui.js — Pelican Campus Quest V7 High-Taste Open-World HUD, Portrait `TPU 8i` Badge,
 * 3-Pill Frosted Glass Top Bar, `1.5s` Auto-Pilot Idle Cursor Hide & `30Hz` Zero-GC Telemetry.
 *
 * Implements:
 *   1. Top-Left Supercluster `TPU 8i` Pill (Portrait `1 : 1.24` SVG + `0 / 16` + `+1` pop + 4-color bar + district tag)
 *   2. Top-Right 3 Breathable Frosted-Glass Pill Groups (`tabular-nums`):
 *      - Pill Group 1 (Mode): `Auto-Pilot` / `Free Roam`
 *      - Pill Group 2 (Chapters): `Tour`, `01 Gym`, `02 Lawn`, `03 T-Rex`, `04 Ramp`, `05 Shore`
 *      - Pill Group 3 (Stage Utilities): `Director` camera popover, `X-Ray`, `Audio`, `Reset`
 *   3. Subtle Top-Right Kinetic Event Micro-Callout (`SLOW MOTION`, `ESPRESSO BOOST`, `SUPERCLUSTER ONLINE`)
 *   4. Bottom-Left Compact (`168x168` CSS) & Expandable (`316x316` CSS) `30Hz` Campus Radar + Portrait `TPU 8i` Glyphs
 *   5. Bottom-Right Speedometer (`KM/H` + `MPH`), `[Keycap] + [Label]` Action Pills & IP-Safe Keycaps
 *   6. Collapsible `30Hz` `Drivetrain X-Ray` 2D Polar Torque & Pedal Linkage Schematic (`RATIO`, `POWER`, `SLOPE`, `CADENCE`)
 *   7. Automatic `1.5s` Idle Cursor Hide (`.cursor-idle-hidden`) in `Auto-Pilot` / `Tour` Mode
 *   8. Strict Dirty-Checked Zero-GC Hot Path (Zero DOM writes & zero heap/string allocations on steady 60fps frames)
 *
 * Owned exclusively by `ui-hud-v7`.
 */

import {
  BIKE_CONSTANTS,
  CAMPUS_CLIPS,
  CAMERA_MODES,
  CAMPUS_ROADS,
  CAMPUS_BUILDING_BLOCKS,
  CAMPUS_LANDMARKS,
  MK_BOOST_PADS,
  DEMO_ACTIONS,
  DEMO_EVENTS,
  bus,
  state,
  dispatchAction,
  deriveTourSummary,
  normalizeStateKey,
} from "./contract.js";
import {
  KIN_CONSTANTS,
  computePedalTorqueNm,
  solveTwoBoneAvianIK,
} from "./rig/kin.js";

const TWO_PI = Math.PI * 2.0;
const RAD_TO_DEG = 180.0 / Math.PI;
const DEFAULT_GEAR_RATIO = BIKE_CONSTANTS.chainringTeeth / BIKE_CONSTANTS.rearCogTeeth;

// Section 1C: 30Hz Canvas Throttle (>= 32ms delta) & Section 8: 1.5s Cursor Idle Hide
const MIN_CANVAS_REDRAW_DELTA_MS = 32.0;
const CURSOR_IDLE_HIDE_MS = 1500.0;

// Portrait-Aspect (1 : 1.24) `TPU 8i` Palette Tokens
const TPU8I_SILVER = "#C8CFD6";
const TPU8I_TEAL = "#0F353C";
const TPU8I_GOLD = "#E8BE63";
const TPU8I_GOLD_BRIGHT = "#F7DF97";

const CAM_LABELS = Object.freeze({
  cinema: "Director",
  chase: "Chase",
  drivetrain: "Macro",
  overhead: "Aerial",
});

// Pre-allocated frozen District Badge objects (Zero per-frame heap allocations)
const DISTRICT_BADGES_OFFLINE = Object.freeze({
  clip1: Object.freeze({ label: "Gradient Canopy", color: "#FBBC05" }),
  clip2: Object.freeze({ label: "Android Lawn", color: "#34A853" }),
  clip3: Object.freeze({ label: "Stan T-Rex", color: "#EA4335" }),
  clip4: Object.freeze({ label: "Bay View", color: "#4285F4" }),
  clip5: Object.freeze({ label: "Shoreline", color: "#4285F4" }),
});

const DISTRICT_BADGES_ONLINE = Object.freeze({
  clip1: Object.freeze({ label: "Gradient Canopy", color: "#34A853" }),
  clip2: Object.freeze({ label: "Android Lawn", color: "#34A853" }),
  clip3: Object.freeze({ label: "Stan T-Rex", color: "#34A853" }),
  clip4: Object.freeze({ label: "Bay View", color: "#34A853" }),
  clip5: Object.freeze({ label: "Shoreline", color: "#34A853" }),
});

// Expanded Campus Radar District Callouts (>= 11.5px CSS / >= 23px physical @ 2x DPR, 0px overlap)
const EXPANDED_MAP_LABELS = Object.freeze([
  Object.freeze({ clipId: "clip1", landmarkIndex: 0, text: "01 Canopy", color: "#FBBC05", dx: 10, dy: 28 }),
  Object.freeze({ clipId: "clip2", landmarkIndex: 1, text: "02 Android", color: "#34A853", dx: 2, dy: 24 }),
  Object.freeze({ clipId: "clip3", landmarkIndex: 2, text: "03 T-Rex", color: "#EA4335", dx: -6, dy: -22 }),
  Object.freeze({ clipId: "clip4", landmarkIndex: 3, text: "04 Bay View", color: "#4285F4", dx: -8, dy: -24 }),
  Object.freeze({ clipId: "clip5", landmarkIndex: 4, text: "05 Shoreline", color: "#4285F4", dx: 0, dy: -23 }),
]);

// Isotropic North-Up cartographic projection for Compact (168px) & Expanded (316px) Campus Radar
const MAP_COMPACT_CSS_SIZE = 168;
const MAP_EXPANDED_CSS_SIZE = 316;
const MAP_WORLD_CX = 8.0;
const MAP_WORLD_CZ = -20.0;
const MAP_BASE_SCALE = 0.345; // px per meter at 168px CSS

function getMapScale(mapCssSize) {
  return (mapCssSize / MAP_COMPACT_CSS_SIZE) * MAP_BASE_SCALE;
}

function worldToMapX(wx, mapCssSize) {
  return mapCssSize * 0.5 + (wx - MAP_WORLD_CX) * getMapScale(mapCssSize);
}

function worldToMapY(wz, mapCssSize) {
  return mapCssSize * 0.5 + (wz - MAP_WORLD_CZ) * getMapScale(mapCssSize);
}

function mapToWorld(mx, my, mapCssSize) {
  const scale = getMapScale(mapCssSize);
  return {
    x: MAP_WORLD_CX + (mx - mapCssSize * 0.5) / scale,
    z: MAP_WORLD_CZ + (my - mapCssSize * 0.5) / scale,
  };
}

function computeV3MapRoadSegmentsOnce() {
  const segs = [];
  let hasCourtyardWalk = false;
  for (const r of CAMPUS_ROADS) {
    let { x1, z1, x2, z2 } = r;
    if (r.id === "googleplex_courtyard_walk") {
      hasCourtyardWalk = true;
    } else if (r.id === "shoreline_blvd") {
      z1 = Math.min(z1, 121.25);
      z2 = Math.min(z2, 121.25);
    } else if (r.id === "west_campus_ave") {
      const zMin = Math.max(-18.0, Math.min(z1, z2));
      const zMax = Math.min(86.6, Math.max(z1, z2));
      z1 = zMax;
      z2 = zMin;
    } else if (r.id === "north_creek_connector") {
      x1 = Math.max(0.0, x1);
      x2 = Math.max(0.0, x2);
    }
    segs.push(Object.freeze({ ...r, x1, z1, x2, z2 }));
  }
  if (!hasCourtyardWalk) {
    segs.push(
      Object.freeze({
        id: "stan_trex_courtyard_walk",
        x1: -118.0,
        z1: -18.0,
        x2: -118.0,
        z2: -72.0,
        widthM: 9.0,
        surface: "pavers",
      })
    );
  }
  segs.push(
    Object.freeze({
      id: "android_plaza_walk",
      x1: -118.0,
      z1: 86.6,
      x2: -118.0,
      z2: 96.0,
      widthM: 10.0,
      surface: "pavers",
    })
  );
  return Object.freeze(segs);
}

function resolveMkSidewalkApronPos(pad) {
  let roadYaw = 0.0;
  let roadHalfW = 7.0;
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
    }
  }
  const rightX = Math.cos(roadYaw);
  const rightZ = Math.sin(roadYaw);
  const sideSign = pad.x > 140 ? -1 : 1;
  const offsetM = Math.max(9.2, roadHalfW + 2.3);
  return Object.freeze({
    x: pad.x + rightX * sideSign * offsetM,
    z: pad.z + rightZ * sideSign * offsetM,
  });
}

// Static precomputed road & MK sidewalk cartography (Zero per-frame allocations)
const V3_MAP_ROAD_SEGMENTS = computeV3MapRoadSegmentsOnce();
const MK_SIDEWALK_APRON_POSITIONS = Object.freeze(
  Array.isArray(MK_BOOST_PADS) ? MK_BOOST_PADS.map(resolveMkSidewalkApronPos) : []
);

const _projRoadScratch = { x: 0, z: 0, yaw: 0, distSq: Infinity };

function projectToNearestRoad(wx, wz) {
  _projRoadScratch.x = wx;
  _projRoadScratch.z = wz;
  _projRoadScratch.yaw = 0;
  _projRoadScratch.distSq = Infinity;
  for (let i = 0; i < V3_MAP_ROAD_SEGMENTS.length; i++) {
    const r = V3_MAP_ROAD_SEGMENTS[i];
    const dx = r.x2 - r.x1;
    const dz = r.z2 - r.z1;
    const lenSq = dx * dx + dz * dz;
    const t = lenSq > 1e-6 ? Math.max(0, Math.min(1, ((wx - r.x1) * dx + (wz - r.z1) * dz) / lenSq)) : 0;
    const px = r.x1 + dx * t;
    const pz = r.z1 + dz * t;
    const dSq = (wx - px) * (wx - px) + (wz - pz) * (wz - pz);
    if (dSq < _projRoadScratch.distSq) {
      _projRoadScratch.x = px;
      _projRoadScratch.z = pz;
      _projRoadScratch.yaw = Math.atan2(dx, -dz);
      _projRoadScratch.distSq = dSq;
    }
  }
  return _projRoadScratch;
}

// Pre-allocated scratch buffers for 2D X-Ray Linkage & Joints (Zero per-frame allocations)
const _linkageScratch = {
  bb: { y: 0, z: 0 },
  hip: { y: 0, z: 0 },
  knee: { y: 0, z: 0 },
  ankle: { y: 0, z: 0 },
  pedal: { y: 0, z: 0 },
  kneeAngleDeg: 108,
};
const _ikHipScratch = { x: 0, y: 0, z: 0 };
const _ikAnkleScratch = { x: 0, y: 0, z: 0 };
const _ikPoleHint = Object.freeze({ x: 0, y: -0.46, z: -1 });
const _xrayJointsScratch = [
  { x: 0, y: 0, r: 2.5, fill: "#B0BDD0" },
  { x: 0, y: 0, r: 3.2, fill: "#F8FAFC" },
  { x: 0, y: 0, r: 3.7, fill: "#38BDF8" },
  { x: 0, y: 0, r: 2.9, fill: "#F59E0B" },
];

function getPerfNowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function safeRoundRect(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.rect(x, y, w, h);
  }
}

/**
 * Draws a crisp portrait-aspect (`1 : 1.24`) `TPU 8i` silicon chip glyph on the 2D Campus Radar:
 * brushed-silver stiffener frame, deep-teal (`#0F353C`) substrate border, and champagne-gold (`#E8BE63`) core.
 */
function drawTpu8iRadarGlyph(ctx, tx, ty, collected, isGoldTier, pulse, expanded) {
  if (collected) {
    const w = expanded ? 5.0 : 3.6;
    const h = w * 1.24;
    ctx.fillStyle = TPU8I_TEAL;
    ctx.strokeStyle = "rgba(52, 211, 153, 0.56)";
    ctx.lineWidth = expanded ? 1.0 : 0.85;
    ctx.beginPath();
    safeRoundRect(ctx, tx - w * 0.5, ty - h * 0.5, w, h, expanded ? 1.1 : 0.8);
    ctx.fill();
    ctx.stroke();
    return;
  }

  const haloR = (3.6 + pulse * 1.9) * (expanded ? 1.42 : 1.0);
  ctx.fillStyle = "rgba(232, 190, 99, 0.24)";
  ctx.beginPath();
  ctx.arc(tx, ty, haloR, 0, TWO_PI);
  ctx.fill();

  const w = expanded ? 7.8 : 5.4;
  const h = w * 1.24;
  const rx = expanded ? 1.4 : 0.95;

  // 1. Brushed-silver portrait stiffener frame
  ctx.fillStyle = TPU8I_SILVER;
  ctx.beginPath();
  safeRoundRect(ctx, tx - w * 0.5, ty - h * 0.5, w, h, rx);
  ctx.fill();

  // 2. Deep-teal (#0F353C) recessed substrate window
  const iw = w * 0.78;
  const ih = h * 0.78;
  ctx.fillStyle = TPU8I_TEAL;
  ctx.fillRect(tx - iw * 0.5, ty - ih * 0.5, iw, ih);

  // 3. Champagne-gold (#E8BE63) silicon core
  const cw = w * 0.54;
  const ch = h * 0.60;
  ctx.fillStyle = isGoldTier ? TPU8I_GOLD_BRIGHT : TPU8I_GOLD;
  ctx.fillRect(tx - cw * 0.5, ty - ch * 0.5, cw, ch);

  // 4. Dual vertical central die seam in expanded view
  if (expanded) {
    ctx.strokeStyle = TPU8I_TEAL;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(tx, ty - ch * 0.48);
    ctx.lineTo(tx, ty + ch * 0.48);
    ctx.stroke();
  }
}

function parseInitialExpandedMapFlag() {
  try {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search || "");
    const raw = (params.get("map") || params.get("minimap") || "").trim().toLowerCase();
    return (
      raw === "expanded" ||
      raw === "expand" ||
      raw === "full" ||
      raw === "large" ||
      raw === "2"
    );
  } catch (_) {
    return false;
  }
}

export function initUI() {
  const appRoot = document.getElementById("app");

  // 1. Top-Left Supercluster `TPU 8i` Pill Elements
  const superclusterPill = document.getElementById("supercluster-pill");
  const tpuCountValue = document.getElementById("tpu-count-value");
  const tpuPopBadge = document.getElementById("tpu-pop-badge");
  const scSegFills = [0, 1, 2, 3].map((i) => document.getElementById(`sc-seg-${i}`));
  const districtDot = document.getElementById("district-dot");
  const districtTag = document.getElementById("district-tag");
  const clusterPctLabel = document.getElementById("cluster-pct-label");

  // 2. Top-Right 3 Frosted-Glass Pill Group Elements (Mode · Chapters · Stage Utilities)
  const btnFreeroam = document.getElementById("btn-freeroam");
  const labelFreeroam = document.getElementById("label-freeroam");
  const clipPills = Array.from(document.querySelectorAll(".clip-pill"));
  const camDropdownWrap = document.getElementById("cam-dropdown-wrap");
  const btnCamMenu = document.getElementById("btn-cam-menu");
  const labelCamActive = document.getElementById("label-cam-active");
  const camPopover = document.getElementById("cam-popover");
  const camPills = Array.from(document.querySelectorAll(".cam-pill"));
  const btnXray = document.getElementById("btn-xray");
  const btnAudio = document.getElementById("btn-audio");
  const btnReset = document.getElementById("btn-reset");

  // 3. Top-Right Kinetic Event Micro-Callout
  const eventCallout = document.getElementById("event-callout");
  const eventCalloutText = document.getElementById("event-callout-text");

  // 4. Collapsible Drivetrain X-Ray Card
  const xrayCard = document.getElementById("xray-telemetry-card");
  const xrayCardCodeEl = document.getElementById("xray-card-code");
  const btnCloseXray = document.getElementById("btn-close-xray");
  const xrayPolarCanvas = document.getElementById("xray-polar-canvas");
  const xrayRatioEl = document.getElementById("xray-ratio");
  const xrayPowerEl = document.getElementById("xray-power");
  const xraySlopeEl = document.getElementById("xray-slope");
  const xrayIkErrEl = document.getElementById("xray-ik-err");

  // 5. Bottom-Left Campus Radar Minimap (Compact & Expandable)
  const minimapCard = document.getElementById("campus-minimap-card");
  const btnExpandMinimap = document.getElementById("btn-expand-minimap");
  const btnToggleMinimap = document.getElementById("btn-toggle-minimap");
  const minimapCanvas = document.getElementById("campus-minimap-canvas");

  // 6. Bottom-Right MPH Speedometer & Action Pills
  const speedMphVal = document.getElementById("speed-mph-val");
  const btnHop = document.getElementById("btn-hop");
  const btnRingBell = document.getElementById("btn-ring-bell");
  let btnNooglerHat = document.getElementById("btn-noogler-hat");
  if (!btnNooglerHat && btnRingBell && btnRingBell.parentElement) {
    btnNooglerHat = document.createElement("button");
    btnNooglerHat.type = "button";
    btnNooglerHat.className = "action-pill";
    btnNooglerHat.id = "btn-noogler-hat";
    btnNooglerHat.dataset.demoId = "toggle-noogler-hat";
    btnNooglerHat.setAttribute("aria-pressed", "false");
    btnNooglerHat.title = "Toggle Noogler Propeller Hat [H]";
    btnNooglerHat.innerHTML = '<kbd class="keycap">H</kbd><span>Hat</span>';
    btnRingBell.insertAdjacentElement("afterend", btnNooglerHat);
  }

  let isMinimapExpanded = parseInitialExpandedMapFlag();
  let isCamPopoverOpen = false;
  const expandedLabelHitBoxes = [];
  const lastDomClickMeta = { demoId: null, simTime: -999, frameCount: -999 };
  let lastHopSimTime = -999;
  let lastRenderedGameMode = null;
  let lastRenderedState = null;
  let lastRenderedCam = null;

  // Monotonic dual-source clock (handles live browser, __virtualClock 4-worker capture & unit tests)
  let monotonicClockMs = 0;
  let prevPerfMs = getPerfNowMs();
  let prevSimMs = (Number(state.elapsedTime) || 0) * 1000;

  function advanceClockMs() {
    const curPerf = getPerfNowMs();
    const curSim = (Number(state.elapsedTime) || 0) * 1000;
    const dPerf = curPerf > prevPerfMs ? curPerf - prevPerfMs : 0;
    const dSim = curSim > prevSimMs ? curSim - prevSimMs : 0;
    prevPerfMs = curPerf;
    prevSimMs = curSim;
    monotonicClockMs += Math.max(dPerf, dSim <= 5000 ? dSim : 0);
    return monotonicClockMs;
  }

  // Section 8: Pointer Activity & 1.5s Auto-Pilot Cursor Idle Hide State
  let lastPointerActivityMs = 0;
  let hasPointerSeed = false;
  let lastPointerX = -9999;
  let lastPointerY = -9999;
  let cursorIdleTimerId = null;

  // Section 1C: 30Hz (>= 32ms) Canvas Redraw Timestamps & Offscreen Static Radar Cache
  let lastMinimapDrawClockMs = -9999;
  let lastXrayDrawClockMs = -9999;
  let minimapStaticCanvas = null;
  let minimapStaticKeyPx = -1;
  let minimapStaticKeyCss = -1;
  let minimapStaticKeyOnline = null;
  let cachedXrayCssW = 314;
  let cachedXrayCssH = 156;
  let xrayDimensionsDirty = true;

  // Section 1C: Strict Dirty-Checked DOM Cache (Zero DOM writes & zero string/object allocs when unchanged)
  const domCache = {
    tpusCollected: -1,
    totalTpus: -1,
    isPopping: null,
    isPickupPulse: null,
    isClusterOnline: null,
    clusterPowerPct: -1,
    segMilli0: -1,
    segMilli1: -1,
    segMilli2: -1,
    segMilli3: -1,
    districtColor: "",
    districtLabel: "",
    pctOnline: null,
    pctLabelInt: -1,
    calloutCode: -1,
    calloutTpusKey: -1,
    calloutXrayShifted: null,
    speedMphInt: -1,
    bellRinging: null,
    hopping: null,
    wearingHat: null,
    xrayCodeInit: false,
    xrayRatioCentis: -1,
    xrayPowerInt: -9999,
    xraySlopeTenths: -9999,
    xrayCadenceInt: -1,
    cursorIdleHidden: false,
  };

  function applyCursorIdleHiddenClass(hidden) {
    if (domCache.cursorIdleHidden === hidden) return;
    domCache.cursorIdleHidden = hidden;
    if (typeof document !== "undefined") {
      if (document.documentElement) {
        document.documentElement.classList.toggle("cursor-idle-hidden", hidden);
      }
      if (document.body) {
        document.body.classList.toggle("cursor-idle-hidden", hidden);
      }
    }
    if (appRoot) {
      appRoot.classList.toggle("cursor-idle-hidden", hidden);
    }
  }

  function scheduleLiveCursorIdleCheck() {
    if (typeof window === "undefined" || window.__externalClock || window.__virtualClock) return;
    if (cursorIdleTimerId !== null) {
      clearTimeout(cursorIdleTimerId);
      cursorIdleTimerId = null;
    }
    if (state.gameMode !== "story_autopilot" || isCamPopoverOpen) return;
    cursorIdleTimerId = setTimeout(() => {
      cursorIdleTimerId = null;
      syncCursorIdleState();
    }, CURSOR_IDLE_HIDE_MS + 24);
  }

  function syncCursorIdleState(nowMsInput) {
    const nowMs = nowMsInput !== undefined ? nowMsInput : advanceClockMs();
    const shouldHide =
      state.gameMode === "story_autopilot" &&
      !isCamPopoverOpen &&
      nowMs - lastPointerActivityMs >= CURSOR_IDLE_HIDE_MS;
    applyCursorIdleHiddenClass(shouldHide);
  }

  function recordPointerActivity() {
    lastPointerActivityMs = advanceClockMs();
    applyCursorIdleHiddenClass(false);
    scheduleLiveCursorIdleCheck();
  }

  function handlePointerMoveActivity(e) {
    const cx = Number(e.clientX);
    const cy = Number(e.clientY);
    if (Number.isFinite(cx) && Number.isFinite(cy)) {
      if (!hasPointerSeed) {
        hasPointerSeed = true;
        lastPointerX = cx;
        lastPointerY = cy;
        lastPointerActivityMs = advanceClockMs();
        scheduleLiveCursorIdleCheck();
        return;
      }
      const dx = cx - lastPointerX;
      const dy = cy - lastPointerY;
      // Ignore synthetic zero-delta coordinate probes; restore on first pixel/sub-pixel of movement
      if (dx * dx + dy * dy <= 1e-6) return;
      lastPointerX = cx;
      lastPointerY = cy;
    }
    recordPointerActivity();
  }

  function recordDomClick(demoId) {
    lastDomClickMeta.demoId = demoId;
    lastDomClickMeta.simTime = state.elapsedTime;
    lastDomClickMeta.frameCount = state.frameCount;
  }

  function wasJustClicked(demoId) {
    if (lastDomClickMeta.demoId !== demoId) return false;
    const dtSim = Math.abs(state.elapsedTime - lastDomClickMeta.simTime);
    const dFrames = Math.abs(state.frameCount - lastDomClickMeta.frameCount);
    return dtSim < 0.12 || dFrames <= 3;
  }

  function getActiveMapCssSize() {
    return isMinimapExpanded ? MAP_EXPANDED_CSS_SIZE : MAP_COMPACT_CSS_SIZE;
  }

  function resolveDistrictBadge() {
    const online = Boolean(state.clusterOnline);
    const map = online ? DISTRICT_BADGES_ONLINE : DISTRICT_BADGES_OFFLINE;

    if (state.gameMode === "free_roam") {
      const px = Number(state.playerX) || 0;
      const pz = Number(state.playerZ) || 0;
      if (pz < -102) return map.clip5;
      if (px > 82) return map.clip4;
      if (px < -48 && pz < 26) return map.clip3;
      if (px < -48 && pz >= 26) return map.clip2;
      return map.clip1;
    }

    return map[state.activeClipId] || map.clip1;
  }

  function syncModeAndChapterPills() {
    const isRoam = state.gameMode === "free_roam";
    if (btnFreeroam) {
      btnFreeroam.classList.add("active");
      btnFreeroam.classList.toggle("is-freeroam", isRoam);
      btnFreeroam.setAttribute("aria-pressed", isRoam ? "true" : "false");
    }
    if (labelFreeroam) {
      const nextText = isRoam ? "Free Roam" : "Auto-Pilot";
      if (labelFreeroam.textContent !== nextText) {
        labelFreeroam.textContent = nextText;
      }
    }

    const curState = state.currentState;
    for (let i = 0; i < clipPills.length; i++) {
      const btn = clipPills[i];
      const isMatch = !isRoam && btn.dataset.state === curState;
      btn.classList.toggle("active", isMatch);
      btn.setAttribute("aria-selected", isMatch ? "true" : "false");
    }

    lastRenderedGameMode = state.gameMode;
    lastRenderedState = curState;
    syncCursorIdleState();
    if (!isRoam) {
      scheduleLiveCursorIdleCheck();
    }
  }

  function setCamPopoverOpen(forceBool) {
    isCamPopoverOpen = typeof forceBool === "boolean" ? forceBool : !isCamPopoverOpen;
    if (camPopover) {
      camPopover.classList.toggle("is-open", isCamPopoverOpen);
      if (isCamPopoverOpen) {
        camPopover.removeAttribute("hidden");
      } else {
        camPopover.setAttribute("hidden", "");
      }
    }
    if (btnCamMenu) {
      btnCamMenu.classList.toggle("is-open", isCamPopoverOpen);
      btnCamMenu.classList.toggle("is-active", isCamPopoverOpen);
      btnCamMenu.setAttribute("aria-expanded", isCamPopoverOpen ? "true" : "false");
    }
    syncCursorIdleState();
    if (!isCamPopoverOpen) {
      scheduleLiveCursorIdleCheck();
    }
    return isCamPopoverOpen;
  }

  function syncCameraPills() {
    const cam = state.cameraMode;
    for (let i = 0; i < camPills.length; i++) {
      const btn = camPills[i];
      const isMatch = btn.dataset.cam === cam;
      btn.classList.toggle("active", isMatch);
      btn.setAttribute("aria-selected", isMatch ? "true" : "false");
    }
    if (labelCamActive) {
      const nextLabel = CAM_LABELS[cam] || "Director";
      if (labelCamActive.textContent !== nextLabel) {
        labelCamActive.textContent = nextLabel;
      }
    }
    lastRenderedCam = cam;
  }

  function syncAudioButton(enabled = state.audioEnabled) {
    if (!btnAudio) return;
    const isOn = Boolean(enabled);
    btnAudio.classList.toggle("is-active", isOn);
    btnAudio.setAttribute("aria-pressed", isOn ? "true" : "false");
  }

  function syncMinimapDomState() {
    const visible = Boolean(state.minimapVisible);
    const expandedActive = visible && isMinimapExpanded;
    if (minimapCard) {
      minimapCard.classList.toggle("is-collapsed", !visible);
      minimapCard.classList.toggle("is-expanded", expandedActive);
    }
    if (btnToggleMinimap) {
      btnToggleMinimap.setAttribute("aria-expanded", visible ? "true" : "false");
    }
    if (btnExpandMinimap) {
      btnExpandMinimap.setAttribute("aria-expanded", expandedActive ? "true" : "false");
      const nextTitle = expandedActive ? "Compact Campus Map" : "Expand Campus Map";
      if (btnExpandMinimap.title !== nextTitle) {
        btnExpandMinimap.title = nextTitle;
        btnExpandMinimap.setAttribute("aria-label", nextTitle);
      }
    }
  }

  function syncMinimapVisibility() {
    syncMinimapDomState();
    if (state.minimapVisible) {
      drawCampusMinimap(true);
    }
  }

  function setMinimapExpanded(forceBool) {
    const nextExpanded = typeof forceBool === "boolean" ? forceBool : !isMinimapExpanded;
    isMinimapExpanded = nextExpanded;
    if (nextExpanded && !state.minimapVisible) {
      dispatchAction(DEMO_ACTIONS.TOGGLE_MINIMAP, { visible: true });
    }
    syncMinimapDomState();
    if (state.minimapVisible) {
      drawCampusMinimap(true);
    }
    return isMinimapExpanded;
  }

  if (typeof window !== "undefined") {
    window.__toggleMinimapExpanded = (forceBool) => setMinimapExpanded(forceBool);
  }

  function syncEventCallout(tpusCollectedArg, totalTpusArg) {
    if (!eventCallout || !eventCalloutText) return;

    const inSlowMo =
      Boolean(state.inSlowMoJump) ||
      state.directorShotLabel === "SLOW MOTION" ||
      (Number(state.timeScale) > 0 && Number(state.timeScale) < 0.75);
    const isBoost = Number(state.boostRemainingSec) > 0.05;
    const isOnline = Boolean(state.clusterOnline);

    // Numeric state code: 0 = hidden, 1 = slowmo, 2 = online, 3 = boost
    let calloutCode = 0;
    if (inSlowMo) calloutCode = 1;
    else if (isOnline) calloutCode = 2;
    else if (isBoost) calloutCode = 3;

    const xrayShifted = Boolean(state.xrayEnabled);
    if (xrayShifted !== domCache.calloutXrayShifted) {
      domCache.calloutXrayShifted = xrayShifted;
      eventCallout.classList.toggle("is-xray-shifted", xrayShifted);
    }

    const tc = tpusCollectedArg !== undefined ? tpusCollectedArg : state.tpusCollected | 0;
    const tt = totalTpusArg !== undefined ? totalTpusArg : state.totalTpus | 0;
    const tpusKey = calloutCode === 2 ? tc * 1024 + tt : 0;

    if (calloutCode === domCache.calloutCode && tpusKey === domCache.calloutTpusKey) {
      return;
    }
    domCache.calloutCode = calloutCode;
    domCache.calloutTpusKey = tpusKey;

    if (calloutCode === 0) {
      eventCallout.classList.add("is-hidden");
      eventCallout.setAttribute("hidden", "");
      return;
    }

    const text =
      calloutCode === 1
        ? "SLOW MOTION"
        : calloutCode === 2
          ? `SUPERCLUSTER ONLINE · ${tc} / ${tt}`
          : "ESPRESSO BOOST";

    eventCallout.classList.remove("is-hidden");
    eventCallout.removeAttribute("hidden");
    eventCallout.classList.toggle("is-boost", calloutCode === 3);
    eventCallout.classList.toggle("is-online", calloutCode === 2);
    if (eventCalloutText.textContent !== text) {
      eventCalloutText.textContent = text;
    }
  }

  function renderMinimapStaticBase(ctx, mapCssSize, dpr, clusterOnline) {
    const mapScale = getMapScale(mapCssSize);
    const k = mapCssSize / MAP_COMPACT_CSS_SIZE;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, mapCssSize, mapCssSize);

    // 1. Deep midnight radar backdrop + subtle cartographic grid
    ctx.fillStyle = "#0A0F17";
    ctx.fillRect(0, 0, mapCssSize, mapCssSize);

    const gridStep = Math.round(28 * k);
    ctx.strokeStyle = "rgba(176, 189, 208, 0.08)";
    ctx.lineWidth = 1;
    for (let g = gridStep; g < mapCssSize; g += gridStep) {
      ctx.beginPath();
      ctx.moveTo(g + 0.5, 0);
      ctx.lineTo(g + 0.5, mapCssSize);
      ctx.moveTo(0, g + 0.5);
      ctx.lineTo(mapCssSize, g + 0.5);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(176, 189, 208, 0.12)";
    ctx.beginPath();
    ctx.arc(mapCssSize * 0.5, mapCssSize * 0.5, 66 * k, 0, TWO_PI);
    ctx.stroke();

    // 2. Water Bodies (Stevens Creek Tidal Marsh + Bay View Retention Pond) in Deep Teal
    ctx.fillStyle = "rgba(14, 116, 144, 0.54)";
    ctx.strokeStyle = "rgba(34, 211, 238, 0.36)";
    ctx.lineWidth = Math.max(1, 0.95 * k);

    ctx.beginPath();
    ctx.moveTo(0, worldToMapY(-112, mapCssSize));
    ctx.bezierCurveTo(
      worldToMapX(-60, mapCssSize), worldToMapY(-118, mapCssSize),
      worldToMapX(45, mapCssSize), worldToMapY(-132, mapCssSize),
      mapCssSize, worldToMapY(-120, mapCssSize)
    );
    ctx.lineTo(mapCssSize, worldToMapY(-136, mapCssSize));
    ctx.bezierCurveTo(
      worldToMapX(45, mapCssSize), worldToMapY(-146, mapCssSize),
      worldToMapX(-60, mapCssSize), worldToMapY(-132, mapCssSize),
      0, worldToMapY(-126, mapCssSize)
    );
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    const pondX = worldToMapX(165, mapCssSize);
    const pondY = worldToMapY(-18, mapCssSize);
    ctx.beginPath();
    safeRoundRect(ctx, pondX, pondY, 20 * mapScale, 84 * mapScale, 4 * k);
    ctx.fill();
    ctx.stroke();

    // 3. Architectural Building Footprints (`CAMPUS_BUILDING_BLOCKS` + Gradient Canopy + Shoreline Peaks)
    ctx.fillStyle = "rgba(148, 163, 184, 0.18)";
    ctx.strokeStyle = "rgba(176, 189, 208, 0.32)";
    ctx.lineWidth = Math.max(0.9, 0.85 * k);
    for (let i = 0; i < CAMPUS_BUILDING_BLOCKS.length; i++) {
      const b = CAMPUS_BUILDING_BLOCKS[i];
      const bx = worldToMapX(b.cx - b.wx * 0.5, mapCssSize);
      const by = worldToMapY(b.cz - b.wz * 0.5, mapCssSize);
      const bw = Math.max(4 * k, b.wx * mapScale);
      const bh = Math.max(4 * k, b.wz * mapScale);
      ctx.beginPath();
      safeRoundRect(ctx, bx, by, bw, bh, 1.5 * k);
      ctx.fill();
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(worldToMapX(0, mapCssSize), worldToMapY(146, mapCssSize), 19 * mapScale, 0, TWO_PI);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = clusterOnline ? "rgba(52, 168, 83, 0.36)" : "rgba(226, 232, 240, 0.24)";
    ctx.beginPath();
    ctx.arc(worldToMapX(12, mapCssSize), worldToMapY(-196, mapCssSize), 13 * mapScale, 0, Math.PI, true);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 4A. Four Campus Plazas (Warm Terracotta/Sandstone)
    ctx.fillStyle = "rgba(194, 120, 78, 0.56)";
    ctx.strokeStyle = "rgba(234, 179, 138, 0.48)";
    ctx.lineWidth = Math.max(0.95, 1.0 * k);

    ctx.beginPath();
    safeRoundRect(ctx, worldToMapX(-16, mapCssSize), worldToMapY(121, mapCssSize), 32 * mapScale, 10 * mapScale, 1.8 * k);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(worldToMapX(-118, mapCssSize), worldToMapY(96, mapCssSize), 9.5 * mapScale, 0, TWO_PI);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(worldToMapX(-118, mapCssSize), worldToMapY(-50, mapCssSize), 14.0 * mapScale, 0, TWO_PI);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(worldToMapX(14, mapCssSize), worldToMapY(-188, mapCssSize), 24.0 * mapScale, 0, TWO_PI);
    ctx.fill();
    ctx.stroke();

    // 4B. Pedestrian Paver Promenades
    ctx.lineCap = "round";
    for (let i = 0; i < V3_MAP_ROAD_SEGMENTS.length; i++) {
      const r = V3_MAP_ROAD_SEGMENTS[i];
      if (r.surface !== "pavers") continue;
      const x1 = worldToMapX(r.x1, mapCssSize);
      const y1 = worldToMapY(r.z1, mapCssSize);
      const x2 = worldToMapX(r.x2, mapCssSize);
      const y2 = worldToMapY(r.z2, mapCssSize);
      const pxW = Math.max(2.4 * k, r.widthM * mapScale);

      ctx.strokeStyle = "rgba(234, 179, 138, 0.48)";
      ctx.lineWidth = pxW + 1.2 * k;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      ctx.strokeStyle = "rgba(194, 120, 78, 0.56)";
      ctx.lineWidth = pxW;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // 4C. Clipped Asphalt & Concrete Carriageways
    ctx.lineCap = "butt";
    const dashPattern = [2.6 * k, 3.0 * k];
    for (let i = 0; i < V3_MAP_ROAD_SEGMENTS.length; i++) {
      const r = V3_MAP_ROAD_SEGMENTS[i];
      if (r.surface === "pavers" || r.surface === "wood_planks" || r.isArchedBridge) continue;
      const x1 = worldToMapX(r.x1, mapCssSize);
      const y1 = worldToMapY(r.z1, mapCssSize);
      const x2 = worldToMapX(r.x2, mapCssSize);
      const y2 = worldToMapY(r.z2, mapCssSize);
      const pxW = Math.max(2.4 * k, r.widthM * mapScale);

      ctx.strokeStyle = r.surface === "concrete" ? "#334155" : "#283244";
      ctx.lineWidth = pxW;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      if (r.surface === "asphalt" || !r.surface) {
        ctx.save();
        ctx.strokeStyle = "rgba(250, 204, 21, 0.45)";
        ctx.lineWidth = Math.max(0.85, 0.9 * k);
        if (typeof ctx.setLineDash === "function") ctx.setLineDash(dashPattern);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 4D. Stevens Creek Corten & Timber Bridge (`wood_planks`)
    ctx.lineCap = "round";
    for (let i = 0; i < V3_MAP_ROAD_SEGMENTS.length; i++) {
      const r = V3_MAP_ROAD_SEGMENTS[i];
      if (r.surface !== "wood_planks" && !r.isArchedBridge) continue;
      const x1 = worldToMapX(r.x1, mapCssSize);
      const y1 = worldToMapY(r.z1, mapCssSize);
      const x2 = worldToMapX(r.x2, mapCssSize);
      const y2 = worldToMapY(r.z2, mapCssSize);
      const pxW = Math.max(2.6 * k, r.widthM * mapScale);

      ctx.strokeStyle = "rgba(234, 179, 138, 0.48)";
      ctx.lineWidth = pxW + 1.1 * k;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      ctx.strokeStyle = "rgba(180, 122, 68, 0.78)";
      ctx.lineWidth = pxW;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // 5. Microkitchen (`MK`) Sidewalk Café Espresso Carts
    for (let i = 0; i < MK_SIDEWALK_APRON_POSITIONS.length; i++) {
      const apron = MK_SIDEWALK_APRON_POSITIONS[i];
      const mx = worldToMapX(apron.x, mapCssSize);
      const my = worldToMapY(apron.z, mapCssSize);
      ctx.fillStyle = "rgba(245, 158, 11, 0.28)";
      ctx.beginPath();
      ctx.arc(mx, my, 3.6 * k, 0, TWO_PI);
      ctx.fill();

      ctx.fillStyle = "#F59E0B";
      ctx.strokeStyle = "#451A03";
      ctx.lineWidth = 0.9 * k;
      ctx.beginPath();
      ctx.arc(mx, my, 2.15 * k, 0, TWO_PI);
      ctx.fill();
      ctx.stroke();
    }

    // 6. 5 Color-Coded Campus Landmark Pins
    for (let i = 0; i < CAMPUS_LANDMARKS.length; i++) {
      const lm = CAMPUS_LANDMARKS[i];
      const lx = worldToMapX(lm.x, mapCssSize);
      const ly = worldToMapY(lm.z, mapCssSize);
      ctx.fillStyle = "rgba(10, 15, 23, 0.90)";
      ctx.beginPath();
      ctx.arc(lx, ly, 4.3 * k, 0, TWO_PI);
      ctx.fill();

      ctx.strokeStyle = lm.color;
      ctx.lineWidth = 1.55 * k;
      ctx.beginPath();
      ctx.arc(lx, ly, 3.6 * k, 0, TWO_PI);
      ctx.stroke();
    }
  }

  function drawCampusMinimap(force = false, nowMsInput) {
    if (!minimapCanvas || !state.minimapVisible) return;
    if (!force && typeof window !== "undefined" && window.__CAPTURE_SKIP_DRAW__) return;

    const nowMs = nowMsInput !== undefined ? nowMsInput : advanceClockMs();
    if (!force && nowMs - lastMinimapDrawClockMs < MIN_CANVAS_REDRAW_DELTA_MS) {
      return;
    }
    lastMinimapDrawClockMs = nowMs;

    const mapCssSize = getActiveMapCssSize();
    const k = mapCssSize / MAP_COMPACT_CSS_SIZE;
    const dpr = Math.min(
      3,
      Math.max(1, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1)
    );
    const targetPx = Math.round(mapCssSize * dpr);
    if (minimapCanvas.width !== targetPx || minimapCanvas.height !== targetPx) {
      minimapCanvas.width = targetPx;
      minimapCanvas.height = targetPx;
    }

    const ctx = minimapCanvas.getContext("2d");
    if (!ctx) return;

    const onlineBool = Boolean(state.clusterOnline);
    let drewCachedBase = false;

    if (typeof document !== "undefined" && typeof ctx.drawImage === "function") {
      if (!minimapStaticCanvas) {
        try {
          minimapStaticCanvas = document.createElement("canvas");
        } catch (_) {
          minimapStaticCanvas = null;
        }
      }
      if (minimapStaticCanvas && typeof minimapStaticCanvas.getContext === "function") {
        if (
          minimapStaticKeyPx !== targetPx ||
          minimapStaticKeyCss !== mapCssSize ||
          minimapStaticKeyOnline !== onlineBool
        ) {
          minimapStaticCanvas.width = targetPx;
          minimapStaticCanvas.height = targetPx;
          const offCtx = minimapStaticCanvas.getContext("2d");
          if (offCtx) {
            renderMinimapStaticBase(offCtx, mapCssSize, dpr, onlineBool);
            minimapStaticKeyPx = targetPx;
            minimapStaticKeyCss = mapCssSize;
            minimapStaticKeyOnline = onlineBool;
          }
        }
        if (minimapStaticKeyPx === targetPx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, mapCssSize, mapCssSize);
          ctx.drawImage(minimapStaticCanvas, 0, 0, mapCssSize, mapCssSize);
          drewCachedBase = true;
        }
      }
    }

    if (!drewCachedBase) {
      renderMinimapStaticBase(ctx, mapCssSize, dpr, onlineBool);
    }

    // 7. Collectible `TPU 8i` Silicon Packages (Portrait `1 : 1.24` Stiffener + Teal + Champagne-Gold Core)
    const pulse = 0.5 + 0.5 * Math.sin((Number(state.elapsedTime) || 0) * 5.2);
    const ledger = state.tpuLedger;
    for (let i = 0; i < ledger.length; i++) {
      const tpu = ledger[i];
      const tx = worldToMapX(tpu.x, mapCssSize);
      const ty = worldToMapY(tpu.z, mapCssSize);
      drawTpu8iRadarGlyph(
        ctx,
        tx,
        ty,
        Boolean(tpu.collected),
        tpu.tier === "ironwood_gold",
        pulse,
        isMinimapExpanded
      );
    }

    // 8. Live Autonomous Waymo SUVs & Shuttles (`state.waymoPositions`)
    if (Array.isArray(state.waymoPositions)) {
      const vScale = isMinimapExpanded ? 1.4 : 1.0;
      for (let i = 0; i < state.waymoPositions.length; i++) {
        const v = state.waymoPositions[i];
        const vx = worldToMapX(v.x, mapCssSize);
        const vy = worldToMapY(v.z, mapCssSize);
        if (v.yielding) {
          ctx.strokeStyle = "rgba(245, 158, 11, 0.80)";
          ctx.lineWidth = 1.2 * vScale;
          ctx.beginPath();
          ctx.arc(vx, vy, 3.4 * vScale, 0, TWO_PI);
          ctx.stroke();
        }
        ctx.fillStyle = v.type === "shuttle" ? "#93C5FD" : "#F8FAFC";
        ctx.beginPath();
        ctx.arc(vx, vy, (v.type === "shuttle" ? 2.3 : 1.9) * vScale, 0, TWO_PI);
        ctx.fill();
      }
    }

    // 9. Expanded Mode Pill-Backed District Callout Labels (11.5px CSS / 23px Physical @ 2x DPR)
    expandedLabelHitBoxes.length = 0;
    if (isMinimapExpanded) {
      ctx.font = '600 11.5px "Inter", system-ui, sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const pillH = 20;

      for (let i = 0; i < EXPANDED_MAP_LABELS.length; i++) {
        const item = EXPANDED_MAP_LABELS[i];
        const lm = CAMPUS_LANDMARKS[item.landmarkIndex];
        if (!lm) continue;
        const pinX = worldToMapX(lm.x, mapCssSize);
        const pinY = worldToMapY(lm.z, mapCssSize);
        const textW = ctx.measureText ? ctx.measureText(item.text).width : item.text.length * 6.4;
        const pillW = Math.ceil(textW + 14);
        const cx = Math.max(pillW * 0.5 + 6, Math.min(mapCssSize - pillW * 0.5 - 6, pinX + item.dx));
        const cy = Math.max(pillH * 0.5 + 6, Math.min(mapCssSize - pillH * 0.5 - 6, pinY + item.dy));
        const rx = cx - pillW * 0.5;
        const ry = cy - pillH * 0.5;

        const isActiveDistrict =
          state.gameMode !== "free_roam" && state.activeClipId === item.clipId;

        ctx.strokeStyle = item.color;
        ctx.lineWidth = 1.15;
        ctx.beginPath();
        ctx.moveTo(pinX, pinY);
        ctx.lineTo(cx, cy);
        ctx.stroke();

        ctx.fillStyle = isActiveDistrict ? "rgba(20, 27, 42, 0.96)" : "rgba(10, 14, 22, 0.90)";
        ctx.strokeStyle = item.color;
        ctx.lineWidth = isActiveDistrict ? 1.6 : 1.15;
        ctx.beginPath();
        safeRoundRect(ctx, rx, ry, pillW, pillH, 10);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#F8FAFC";
        ctx.fillText(item.text, cx, cy + 0.5);

        expandedLabelHitBoxes.push({
          clipId: item.clipId,
          x1: rx - 3,
          y1: ry - 3,
          x2: rx + pillW + 3,
          y2: ry + pillH + 3,
        });
      }
    }

    // 10. Bright 4-Color Player GBike Arrow + Forward FOV Cone
    const edgePad = 7 * k;
    const px = Math.max(
      edgePad,
      Math.min(mapCssSize - edgePad, worldToMapX(Number(state.playerX) || 0, mapCssSize))
    );
    const py = Math.max(
      edgePad,
      Math.min(mapCssSize - edgePad, worldToMapY(Number(state.playerZ) || 0, mapCssSize))
    );
    const yaw = Number(state.playerHeadingYaw) || 0;
    const canvasHeading = yaw - Math.PI * 0.5;

    const pScale = isMinimapExpanded ? 1.32 : 1.0;
    const fovHalf = 0.46;
    const fovR = 22 * pScale;
    if (typeof ctx.createRadialGradient === "function") {
      const grad = ctx.createRadialGradient(px, py, 2, px, py, fovR);
      grad.addColorStop(0, "rgba(66, 133, 244, 0.44)");
      grad.addColorStop(1, "rgba(66, 133, 244, 0.0)");
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = "rgba(66, 133, 244, 0.24)";
    }
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.arc(px, py, fovR, canvasHeading - fovHalf, canvasHeading + fovHalf);
    ctx.closePath();
    ctx.fill();

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(yaw);

    ctx.strokeStyle = "#FBBC05";
    ctx.lineWidth = 1.4 * pScale;
    ctx.beginPath();
    ctx.arc(0, 0, 5.4 * pScale, 0, TWO_PI);
    ctx.stroke();

    ctx.fillStyle = "#4285F4";
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 1.35 * pScale;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(0, -5.8 * pScale);
    ctx.lineTo(4.3 * pScale, 4.4 * pScale);
    ctx.lineTo(0, 2.2 * pScale);
    ctx.lineTo(-4.3 * pScale, 4.4 * pScale);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function resolveSagittalLinkage(kin, crankRad) {
    const hipRaw = kin.hipLocal;
    const kneeRaw = kin.rightKneeLocal;
    const ankleRaw = kin.rightAnkleLocal;
    const pedalRaw = kin.rightPedalLocal;

    const hasLiveCoords =
      hipRaw &&
      kneeRaw &&
      ankleRaw &&
      pedalRaw &&
      Math.hypot((hipRaw.y || 0) - (pedalRaw.y || 0), (hipRaw.z || 0) - (pedalRaw.z || 0)) > 0.08;

    const bbY = KIN_CONSTANTS?.bbPos?.y ?? 0.285;
    const bbZ = KIN_CONSTANTS?.bbPos?.z ?? 0.085;
    const rCrank = KIN_CONSTANTS?.crankRadiusM ?? BIKE_CONSTANTS.crankRadiusM;

    _linkageScratch.bb.y = bbY;
    _linkageScratch.bb.z = bbZ;

    if (hasLiveCoords) {
      const fY = hipRaw.y - kneeRaw.y;
      const fZ = hipRaw.z - kneeRaw.z;
      const tY = ankleRaw.y - kneeRaw.y;
      const tZ = ankleRaw.z - kneeRaw.z;
      const denom = Math.max(1e-6, Math.hypot(fY, fZ) * Math.hypot(tY, tZ));
      const cosKnee = Math.max(-1, Math.min(1, (fY * tY + fZ * tZ) / denom));
      const computedKneeDeg = Math.acos(cosKnee) * RAD_TO_DEG;

      _linkageScratch.hip.y = hipRaw.y;
      _linkageScratch.hip.z = hipRaw.z;
      _linkageScratch.knee.y = kneeRaw.y;
      _linkageScratch.knee.z = kneeRaw.z;
      _linkageScratch.ankle.y = ankleRaw.y;
      _linkageScratch.ankle.z = ankleRaw.z;
      _linkageScratch.pedal.y = pedalRaw.y;
      _linkageScratch.pedal.z = pedalRaw.z;
      _linkageScratch.kneeAngleDeg =
        Number.isFinite(kin.rightKneeAngleDeg) && kin.rightKneeAngleDeg > 5
          ? kin.rightKneeAngleDeg
          : computedKneeDeg;
      return _linkageScratch;
    }

    const pedX = KIN_CONSTANTS?.pedalStanceX ?? 0.13;
    const pedY = bbY + rCrank * Math.cos(crankRad);
    const pedZ = bbZ - rCrank * Math.sin(crankRad);

    _ikAnkleScratch.x = pedX;
    _ikAnkleScratch.y = pedY + 0.026;
    _ikAnkleScratch.z = pedZ + 0.012;

    _ikHipScratch.x = KIN_CONSTANTS?.hipLocal?.x ?? 0.095;
    _ikHipScratch.y = KIN_CONSTANTS?.hipLocal?.y ?? 0.755;
    _ikHipScratch.z = KIN_CONSTANTS?.hipLocal?.z ?? 0.215;

    const ik =
      typeof solveTwoBoneAvianIK === "function"
        ? solveTwoBoneAvianIK(
            _ikHipScratch,
            _ikAnkleScratch,
            BIKE_CONSTANTS.legL1 ?? KIN_CONSTANTS?.legL1M ?? 0.395,
            BIKE_CONSTANTS.legL2 ?? KIN_CONSTANTS?.legL2M ?? 0.320,
            _ikPoleHint
          )
        : null;
    const kneePos = ik ? ik.jointPos || ik.midPos : null;
    const endPos = ik ? ik.endPos || _ikAnkleScratch : _ikAnkleScratch;

    _linkageScratch.hip.y = _ikHipScratch.y;
    _linkageScratch.hip.z = _ikHipScratch.z;
    _linkageScratch.knee.y = kneePos ? kneePos.y : 0.52;
    _linkageScratch.knee.z = kneePos ? kneePos.z : -0.04;
    _linkageScratch.ankle.y = endPos.y;
    _linkageScratch.ankle.z = endPos.z;
    _linkageScratch.pedal.y = pedY;
    _linkageScratch.pedal.z = pedZ;
    _linkageScratch.kneeAngleDeg = ik ? ik.kneeAngleDeg ?? ik.interiorAngleDeg ?? 108 : 108;
    return _linkageScratch;
  }

  function safePedalTorque(crankRad, cScale, slopeDeg) {
    if (typeof computePedalTorqueNm === "function") {
      return computePedalTorqueNm(crankRad, cScale, slopeDeg);
    }
    return 18.0 + 14.0 * Math.pow(Math.sin(crankRad), 2);
  }

  function refreshXrayCanvasCssSize() {
    if (!xrayPolarCanvas || typeof xrayPolarCanvas.getBoundingClientRect !== "function") return;
    const rect = xrayPolarCanvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      cachedXrayCssW = Math.max(260, Math.round(rect.width));
      cachedXrayCssH = Math.max(140, Math.round(rect.height));
      xrayDimensionsDirty = false;
    }
  }

  function drawXrayPolarAndLinkageCanvas(kin, force = false, nowMsInput) {
    if (!xrayPolarCanvas || !state.xrayEnabled) return;
    if (!force && typeof window !== "undefined" && window.__CAPTURE_SKIP_DRAW__) return;

    const nowMs = nowMsInput !== undefined ? nowMsInput : advanceClockMs();
    if (!force && nowMs - lastXrayDrawClockMs < MIN_CANVAS_REDRAW_DELTA_MS) {
      return;
    }
    lastXrayDrawClockMs = nowMs;

    if (force || xrayDimensionsDirty) {
      refreshXrayCanvasCssSize();
    }
    const cssW = cachedXrayCssW;
    const cssH = cachedXrayCssH;
    const dpr = Math.min(
      3,
      Math.max(1, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1)
    );
    const targetW = Math.round(cssW * dpr);
    const targetH = Math.round(cssH * dpr);

    if (xrayPolarCanvas.width !== targetW || xrayPolarCanvas.height !== targetH) {
      xrayPolarCanvas.width = targetW;
      xrayPolarCanvas.height = targetH;
    }

    const ctx = xrayPolarCanvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    ctx.fillStyle = "#090C12";
    ctx.fillRect(0, 0, cssW, cssH);

    const midX = Math.round(cssW * 0.495);
    ctx.strokeStyle = "rgba(176, 189, 208, 0.16)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(midX + 0.5, 8);
    ctx.lineTo(midX + 0.5, cssH - 8);
    ctx.stroke();

    const crankRad = Number(kin.crankRad) || 0;
    const wheelRad = Number.isFinite(kin.wheelRad) ? kin.wheelRad : crankRad * DEFAULT_GEAR_RATIO;
    const cScale = Number(state.cadenceScale) || 1.0;
    const rawSlope = Number.isFinite(kin.slopePitchDeg) ? kin.slopePitchDeg : 0;
    const liveTorqueNm =
      Number.isFinite(kin.pedalTorqueNm) && kin.pedalTorqueNm > 0.1
        ? kin.pedalTorqueNm
        : safePedalTorque(crankRad, cScale, rawSlope);

    // LEFT PANEL: 360° Polar Torque Envelope & 2.75x Rear Cog Ring
    const pCx = Math.max(Math.round(midX * 0.52), Math.round(midX * 0.5 + 4));
    const pCy = Math.round(cssH * 0.59);
    const rMax = Math.min(midX * 0.22, (cssH - 46) * 0.275, (midX - 82) * 0.5);
    const rCogRing = rMax + 5.5;

    ctx.font = '600 11px "Inter", system-ui, sans-serif';
    ctx.fillStyle = "#B0BDD0";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("TORQUE LOBE", 9, 17);

    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.fillStyle = "#F59E0B";
    ctx.textAlign = "right";
    ctx.fillText(`${liveTorqueNm.toFixed(1)} N·m`, midX - 9, 17);

    ctx.strokeStyle = "rgba(176, 189, 208, 0.16)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(pCx, pCy, rMax * 0.5, 0, TWO_PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(pCx, pCy, rMax, 0, TWO_PI);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(pCx - rMax - 4, pCy);
    ctx.lineTo(pCx + rMax + 4, pCy);
    ctx.moveTo(pCx, pCy - rMax - 4);
    ctx.lineTo(pCx, pCy + rMax + 4);
    ctx.stroke();

    ctx.save();
    ctx.strokeStyle = "rgba(56, 189, 248, 0.34)";
    ctx.lineWidth = 1.3;
    if (typeof ctx.setLineDash === "function") ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(pCx, pCy, rCogRing, 0, TWO_PI);
    ctx.stroke();
    if (typeof ctx.setLineDash === "function") ctx.setLineDash([]);

    const cogAngleCanvas = wheelRad - Math.PI * 0.5;
    ctx.strokeStyle = "#38BDF8";
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.arc(pCx, pCy, rCogRing, cogAngleCanvas - 0.65, cogAngleCanvas);
    ctx.stroke();

    ctx.fillStyle = "#38BDF8";
    ctx.beginPath();
    ctx.arc(pCx + rCogRing * Math.sin(wheelRad), pCy - rCogRing * Math.cos(wheelRad), 2.2, 0, TWO_PI);
    ctx.fill();

    ctx.fillStyle = "rgba(56, 189, 248, 0.55)";
    ctx.beginPath();
    ctx.arc(
      pCx + rCogRing * Math.sin(wheelRad + Math.PI),
      pCy - rCogRing * Math.cos(wheelRad + Math.PI),
      2.2,
      0,
      TWO_PI
    );
    ctx.fill();
    ctx.restore();

    const maxRefTorque = Math.max(36.0, rawSlope > 0.5 ? 36.0 + rawSlope * 1.6 : 36.0);
    const samples = 72;
    ctx.beginPath();
    for (let i = 0; i <= samples; i++) {
      const th = (i / samples) * TWO_PI;
      const tau = safePedalTorque(th, cScale, rawSlope);
      const r = Math.min(rMax * 1.04, Math.max(5, (tau / maxRefTorque) * rMax));
      const x = pCx + r * Math.sin(th);
      const y = pCy - r * Math.cos(th);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(37, 99, 235, 0.28)";
    ctx.fill();
    ctx.strokeStyle = "#38BDF8";
    ctx.lineWidth = 1.65;
    ctx.stroke();

    const oppX = pCx - rMax * 0.55 * Math.sin(crankRad);
    const oppY = pCy + rMax * 0.55 * Math.cos(crankRad);
    ctx.strokeStyle = "rgba(248, 250, 252, 0.34)";
    ctx.lineWidth = 1.8;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(pCx, pCy);
    ctx.lineTo(oppX, oppY);
    ctx.stroke();

    const activeR = Math.min(rMax * 1.04, Math.max(8, (liveTorqueNm / maxRefTorque) * rMax));
    const vecX = pCx + activeR * Math.sin(crankRad);
    const vecY = pCy - activeR * Math.cos(crankRad);

    ctx.strokeStyle = "#F59E0B";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(pCx, pCy);
    ctx.lineTo(vecX, vecY);
    ctx.stroke();

    ctx.fillStyle = "#F59E0B";
    ctx.beginPath();
    ctx.arc(vecX, vecY, 3.4, 0, TWO_PI);
    ctx.fill();

    ctx.fillStyle = "#F8FAFC";
    ctx.beginPath();
    ctx.arc(pCx, pCy, 2.7, 0, TWO_PI);
    ctx.fill();

    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.fillStyle = "#B0BDD0";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("0°", pCx, pCy - rCogRing - 8.5);
    ctx.fillText("180°", pCx, pCy + rCogRing + 9.0);
    ctx.textAlign = "left";
    ctx.fillText("90°", pCx + rCogRing + 3.5, pCy);
    ctx.textAlign = "right";
    ctx.fillText("270°", pCx - rCogRing - 3.5, pCy);

    // RIGHT PANEL: Pedal Linkage Schematic
    const linkage = resolveSagittalLinkage(kin, crankRad);
    const rightW = cssW - midX;

    ctx.font = '600 11px "Inter", system-ui, sans-serif';
    ctx.fillStyle = "#B0BDD0";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("PEDAL LINKAGE", midX + 9, 17);

    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.fillStyle = "#38BDF8";
    ctx.textAlign = "right";
    ctx.fillText(`${Math.round(linkage.kneeAngleDeg)}°`, cssW - 9, 17);

    const scalePxPerM = Math.min(rightW * 0.78, (cssH - 58) * 1.32);
    const originX = midX + rightW * 0.46;
    const originY = cssH - 13;
    const mapX = (z) => originX + (-z) * scalePxPerM;
    const mapY = (y) => originY - (y - 0.04) * scalePxPerM;

    const bbPx = mapX(linkage.bb.z);
    const bbPy = mapY(linkage.bb.y);
    const hipPx = mapX(linkage.hip.z);
    const hipPy = mapY(linkage.hip.y);
    const kneePx = mapX(linkage.knee.z);
    const kneePy = mapY(linkage.knee.y);
    const anklePx = mapX(linkage.ankle.z);
    const anklePy = mapY(linkage.ankle.y);
    const pedPx = mapX(linkage.pedal.z);
    const pedPy = mapY(linkage.pedal.y);
    const crankRpx = (KIN_CONSTANTS?.crankRadiusM ?? 0.17) * scalePxPerM;

    ctx.strokeStyle = "rgba(176, 189, 208, 0.22)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(bbPx, bbPy);
    ctx.lineTo(hipPx, hipPy + 4);
    ctx.moveTo(bbPx, bbPy);
    ctx.lineTo(mapX(0.36), mapY(0.32));
    ctx.moveTo(bbPx, bbPy);
    ctx.lineTo(mapX(-0.26), mapY(0.56));
    ctx.stroke();

    ctx.save();
    ctx.strokeStyle = "rgba(56, 189, 248, 0.28)";
    ctx.lineWidth = 1.2;
    if (typeof ctx.setLineDash === "function") ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(bbPx, bbPy, crankRpx, 0, TWO_PI);
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = "#F59E0B";
    ctx.lineWidth = 2.1;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(bbPx, bbPy);
    ctx.lineTo(pedPx, pedPy);
    ctx.stroke();

    const soleHalfPx = 9.5;
    ctx.strokeStyle = "rgba(248, 250, 252, 0.55)";
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(pedPx - soleHalfPx, pedPy + 2.2);
    ctx.lineTo(pedPx + soleHalfPx, pedPy + 2.2);
    ctx.stroke();

    ctx.strokeStyle = "#F59E0B";
    ctx.lineWidth = 2.7;
    ctx.beginPath();
    ctx.moveTo(pedPx - soleHalfPx * 0.72, pedPy);
    ctx.lineTo(pedPx + soleHalfPx * 0.95, pedPy);
    ctx.stroke();

    ctx.strokeStyle = "#38BDF8";
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(hipPx, hipPy);
    ctx.lineTo(kneePx, kneePy);
    ctx.stroke();

    ctx.strokeStyle = "#60A5FA";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(kneePx, kneePy);
    ctx.lineTo(anklePx, anklePy);
    ctx.lineTo(pedPx, pedPy);
    ctx.stroke();

    _xrayJointsScratch[0].x = bbPx;
    _xrayJointsScratch[0].y = bbPy;
    _xrayJointsScratch[1].x = hipPx;
    _xrayJointsScratch[1].y = hipPy;
    _xrayJointsScratch[2].x = kneePx;
    _xrayJointsScratch[2].y = kneePy;
    _xrayJointsScratch[3].x = anklePx;
    _xrayJointsScratch[3].y = anklePy;

    for (let i = 0; i < _xrayJointsScratch.length; i++) {
      const j = _xrayJointsScratch[i];
      ctx.fillStyle = j.fill;
      ctx.beginPath();
      ctx.arc(j.x, j.y, j.r, 0, TWO_PI);
      ctx.fill();
      ctx.fillStyle = "#090C12";
      ctx.beginPath();
      ctx.arc(j.x, j.y, 1.15, 0, TWO_PI);
      ctx.fill();
    }

    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.textBaseline = "middle";

    const hipLabelX = Math.max(midX + 8, hipPx - 28);
    const hipLabelY = Math.max(42, hipPy - 2);
    ctx.fillStyle = "#B0BDD0";
    ctx.textAlign = "left";
    ctx.fillText("HIP", hipLabelX, hipLabelY);

    const kneeLabelX = Math.min(cssW - 38, kneePx + 7);
    const kneeLabelY = Math.min(cssH - 30, Math.max(42, kneePy - 4));
    ctx.fillStyle = "#38BDF8";
    ctx.fillText("KNEE", kneeLabelX, kneeLabelY);

    const pedLabelX = Math.max(midX + 8, Math.min(cssW - 44, pedPx + 11));
    const pedLabelY = Math.min(cssH - 10, Math.max(kneeLabelY + 15, pedPy + 9));
    ctx.fillStyle = "#F59E0B";
    ctx.textAlign = "left";
    ctx.fillText("PEDAL", pedLabelX, pedLabelY);
  }

  function updateXrayTextCells(gearRatioInput, cadenceRpmInput) {
    const kin = state.kinematics;
    const ratio =
      Number.isFinite(gearRatioInput) && gearRatioInput > 0 ? gearRatioInput : DEFAULT_GEAR_RATIO;
    const cScale = Number(state.cadenceScale) || 1.0;
    const rawSlope = Number.isFinite(kin.slopePitchDeg) ? kin.slopePitchDeg : 0;
    const cadenceRpm = Math.max(0, Math.round(Number(cadenceRpmInput) || 0));
    const omegaCrank = (cadenceRpm * TWO_PI) / 60.0;
    const fallbackPower =
      omegaCrank > 0.05 ? safePedalTorque(kin.crankRad || 0, cScale, rawSlope) * omegaCrank : 0;
    const powerW =
      Number.isFinite(kin.powerWatts) && (kin.powerWatts > 0.05 || (Number(kin.speedMps) || 0) <= 0.05)
        ? kin.powerWatts
        : fallbackPower;

    const cleanSlope = Math.abs(rawSlope) < 0.05 ? 0 : rawSlope;

    if (xrayCardCodeEl && !domCache.xrayCodeInit) {
      domCache.xrayCodeInit = true;
      const codeStr = `${BIKE_CONSTANTS.chainringTeeth}T:${BIKE_CONSTANTS.rearCogTeeth}T`;
      if (xrayCardCodeEl.textContent !== codeStr) {
        xrayCardCodeEl.textContent = codeStr;
      }
    }

    const ratioCentis = Math.round(ratio * 100);
    if (xrayRatioEl && ratioCentis !== domCache.xrayRatioCentis) {
      domCache.xrayRatioCentis = ratioCentis;
      xrayRatioEl.textContent = `${BIKE_CONSTANTS.chainringTeeth}:${BIKE_CONSTANTS.rearCogTeeth} · ${(ratioCentis / 100).toFixed(2)}x`;
    }

    const powerInt = Math.round(powerW);
    if (xrayPowerEl && powerInt !== domCache.xrayPowerInt) {
      domCache.xrayPowerInt = powerInt;
      xrayPowerEl.textContent = `${powerInt} W`;
    }

    const slopeTenths = Math.round(cleanSlope * 10);
    if (xraySlopeEl && slopeTenths !== domCache.xraySlopeTenths) {
      domCache.xraySlopeTenths = slopeTenths;
      const slopeVal = slopeTenths / 10;
      const slopePrefix = slopeVal >= 0 ? "+" : "";
      xraySlopeEl.textContent = `${slopePrefix}${slopeVal.toFixed(1)}°`;
    }

    if (xrayIkErrEl && cadenceRpm !== domCache.xrayCadenceInt) {
      domCache.xrayCadenceInt = cadenceRpm;
      xrayIkErrEl.textContent = `${cadenceRpm} RPM`;
    }
  }

  function renderXrayTelemetry(summaryInput, forceCanvas = false, nowMsInput) {
    if (!state.xrayEnabled || !xrayCard) return;
    const kin = state.kinematics;
    const gearRatio = summaryInput ? summaryInput.gearRatio : kin.gearRatio;
    const cadenceRpm = summaryInput ? summaryInput.cadenceRpm : kin.cadenceRpm;
    updateXrayTextCells(gearRatio, cadenceRpm);
    drawXrayPolarAndLinkageCanvas(kin, forceCanvas, nowMsInput);
  }

  function syncNooglerHatButton() {
    if (!btnNooglerHat) return;
    const wearing = Boolean(state.wearNooglerHat);
    if (wearing !== domCache.wearingHat) {
      domCache.wearingHat = wearing;
      btnNooglerHat.classList.toggle("is-active", wearing);
      btnNooglerHat.setAttribute("aria-pressed", wearing ? "true" : "false");
    }
  }

  function syncXrayCard() {
    const enabled = Boolean(state.xrayEnabled);
    if (btnXray) {
      btnXray.classList.toggle("is-active", enabled);
      btnXray.setAttribute("aria-pressed", enabled ? "true" : "false");
    }
    if (eventCallout && enabled !== domCache.calloutXrayShifted) {
      domCache.calloutXrayShifted = enabled;
      eventCallout.classList.toggle("is-xray-shifted", enabled);
    }
    if (!xrayCard) return;

    xrayCard.classList.toggle("is-hidden", !enabled);
    if (enabled) {
      xrayCard.removeAttribute("hidden");
      xrayDimensionsDirty = true;
      const summary = deriveTourSummary(state.segmentLedger, state.kinematics, state.tpuLedger);
      renderXrayTelemetry(summary, true);
    } else {
      xrayCard.setAttribute("hidden", "");
    }
  }

  function renderTelemetry(summaryInput, forceCanvases = false) {
    const nowMs = advanceClockMs();

    // Read directly from `summaryInput` when provided (60fps hot path), or direct `state` scalars (0 allocations!)
    const kin = state.kinematics;
    const tpusCollected = summaryInput
      ? summaryInput.tpusCollected | 0
      : state.tpusCollected | 0;
    const totalTpus = summaryInput
      ? summaryInput.totalTpus | 0
      : (state.totalTpus | 0) || state.tpuLedger.length;
    const clusterOnline = summaryInput
      ? Boolean(summaryInput.clusterOnline)
      : Boolean(state.clusterOnline);
    const pctInt = Math.round(
      Number(summaryInput ? summaryInput.clusterPowerPct : state.clusterPowerPct) || 0
    );

    // 1. Top-Left Supercluster `TPU 8i` Counter, +1 Gold Pop, 4-Color Bar & District Tag
    if (
      tpuCountValue &&
      (tpusCollected !== domCache.tpusCollected || totalTpus !== domCache.totalTpus)
    ) {
      domCache.tpusCollected = tpusCollected;
      domCache.totalTpus = totalTpus;
      tpuCountValue.textContent = `${tpusCollected} / ${totalTpus}`;
    }

    const dtSincePickup = state.elapsedTime - state.lastTpuPickupTime;
    const isPopping = tpusCollected > 0 && dtSincePickup >= 0 && dtSincePickup < 0.95;
    if (tpuPopBadge && isPopping !== domCache.isPopping) {
      domCache.isPopping = isPopping;
      tpuPopBadge.classList.toggle("is-popping", isPopping);
    }

    const isPickupPulse = isPopping && dtSincePickup < 0.35;
    if (superclusterPill) {
      if (isPickupPulse !== domCache.isPickupPulse) {
        domCache.isPickupPulse = isPickupPulse;
        superclusterPill.classList.toggle("is-pickup-pulse", isPickupPulse);
      }
      if (clusterOnline !== domCache.isClusterOnline) {
        domCache.isClusterOnline = clusterOnline;
        superclusterPill.classList.toggle("is-cluster-online", clusterOnline);
      }
    }

    if (pctInt !== domCache.clusterPowerPct) {
      domCache.clusterPowerPct = pctInt;
      const normPct = Math.min(1, Math.max(0, pctInt / 100));
      for (let i = 0; i < 4; i++) {
        const el = scSegFills[i];
        if (!el) continue;
        const segFill = Math.min(1, Math.max(0, (normPct - i * 0.25) / 0.25));
        const segMilli = Math.round(segFill * 10000);
        const key = i === 0 ? "segMilli0" : i === 1 ? "segMilli1" : i === 2 ? "segMilli2" : "segMilli3";
        if (domCache[key] !== segMilli) {
          domCache[key] = segMilli;
          el.style.transform = `scaleX(${(segMilli / 10000).toFixed(4)})`;
        }
      }
    }

    const dMeta = resolveDistrictBadge();
    if (districtDot && dMeta.color !== domCache.districtColor) {
      domCache.districtColor = dMeta.color;
      districtDot.style.backgroundColor = dMeta.color;
    }
    if (districtTag && dMeta.label !== domCache.districtLabel) {
      domCache.districtLabel = dMeta.label;
      districtTag.textContent = dMeta.label;
    }
    if (
      clusterPctLabel &&
      (clusterOnline !== domCache.pctOnline || (!clusterOnline && pctInt !== domCache.pctLabelInt))
    ) {
      domCache.pctOnline = clusterOnline;
      domCache.pctLabelInt = pctInt;
      clusterPctLabel.textContent = clusterOnline ? "ONLINE" : `${pctInt}%`;
    }

    // 2. Top-Right Kinetic Event Micro-Callout
    syncEventCallout(tpusCollected, totalTpus);

    // 3. Bottom-Right MPH Speedometer & Action Highlights (Zero DOM writes & zero strings when speed int is steady)
    const onStand = Boolean(state.onTrainerStand || (summaryInput && summaryInput.onTrainerStand));
    const rawMph = onStand
      ? 0
      : summaryInput && Number.isFinite(summaryInput.speedMph)
        ? summaryInput.speedMph
        : (Number(kin.speedMps) || 0) * 2.23693629;
    const mph = Number.isFinite(rawMph) ? Math.max(0, Math.round(rawMph)) : 0;

    if (mph !== domCache.speedMphInt) {
      domCache.speedMphInt = mph;
      if (speedMphVal) {
        speedMphVal.textContent = String(mph);
      }
    }

    if (btnRingBell) {
      const sinceBell = state.elapsedTime - state.lastBellTime;
      const isRinging = sinceBell >= 0 && sinceBell < 0.42 && state.bellCount > 0;
      if (isRinging !== domCache.bellRinging) {
        domCache.bellRinging = isRinging;
        btnRingBell.classList.toggle("is-ringing", isRinging);
      }
    }

    if (btnHop) {
      const sinceHop = state.elapsedTime - lastHopSimTime;
      const isHopping = Boolean(state.isAirborne) || (sinceHop >= 0 && sinceHop < 0.35);
      if (isHopping !== domCache.hopping) {
        domCache.hopping = isHopping;
        btnHop.classList.toggle("is-active", isHopping);
      }
    }

    syncNooglerHatButton();

    // 4. Section 8: Check 1.5s Auto-Pilot Idle Cursor Hide
    syncCursorIdleState(nowMs);

    // 5. Section 1C: 30Hz (>= 32ms) Campus Radar Minimap
    if (state.minimapVisible) {
      drawCampusMinimap(forceCanvases, nowMs);
    }

    // 6. Section 1C: 30Hz (>= 32ms) Collapsible Drivetrain X-Ray Card (Skipped completely when closed)
    if (state.xrayEnabled) {
      renderXrayTelemetry(summaryInput, forceCanvases, nowMs);
    }
  }

  function performFullReset() {
    lastHopSimTime = -999;
    setCamPopoverOpen(false);
    dispatchAction(DEMO_ACTIONS.TRIGGER_RESET);
    prevSimMs = (Number(state.elapsedTime) || 0) * 1000;
  }

  // =========================================================================
  // DOM & Pointer Activity Bindings (Zero Duplicate Keydown Action Toggles)
  // =========================================================================

  if (typeof window !== "undefined") {
    window.addEventListener("pointermove", handlePointerMoveActivity, { passive: true });
    window.addEventListener("pointerdown", recordPointerActivity, { passive: true });
    window.addEventListener("mousedown", recordPointerActivity, { passive: true });
    window.addEventListener("wheel", recordPointerActivity, { passive: true });
    window.addEventListener("keydown", recordPointerActivity, { passive: true });
    window.addEventListener("touchstart", recordPointerActivity, { passive: true });
  }

  if (btnFreeroam) {
    btnFreeroam.addEventListener("click", () => {
      recordDomClick("toggle-freeroam");
      const nextRoam = state.gameMode !== "free_roam";
      dispatchAction(DEMO_ACTIONS.SET_FREE_ROAM, { enabled: nextRoam, source: "ui" });
    });
  }

  for (let i = 0; i < clipPills.length; i++) {
    const btn = clipPills[i];
    btn.addEventListener("click", () => {
      recordDomClick(btn.dataset.demoId);
      dispatchAction(DEMO_ACTIONS.SET_STATE, { state: btn.dataset.state, source: "ui" });
    });
  }

  if (btnCamMenu) {
    btnCamMenu.addEventListener("click", (e) => {
      e.stopPropagation();
      recordDomClick("toggle-cam-menu");
      setCamPopoverOpen();
    });
  }

  for (let i = 0; i < camPills.length; i++) {
    const btn = camPills[i];
    btn.addEventListener("click", () => {
      recordDomClick(btn.dataset.demoId);
      dispatchAction(DEMO_ACTIONS.SET_CAMERA, { cameraMode: btn.dataset.cam });
      setCamPopoverOpen(false);
    });
  }

  if (typeof document !== "undefined") {
    document.addEventListener("pointerdown", (e) => {
      if (isCamPopoverOpen && camDropdownWrap && !camDropdownWrap.contains(e.target)) {
        setCamPopoverOpen(false);
      }
    });
  }

  if (btnXray) {
    btnXray.addEventListener("click", () => {
      recordDomClick("toggle-xray");
      dispatchAction(DEMO_ACTIONS.TOGGLE_XRAY);
    });
  }

  if (btnCloseXray) {
    btnCloseXray.addEventListener("click", () => {
      recordDomClick("close-xray");
      dispatchAction(DEMO_ACTIONS.TOGGLE_XRAY, { enabled: false });
    });
  }

  if (btnAudio) {
    btnAudio.addEventListener("click", () => {
      recordDomClick("toggle-audio");
      dispatchAction(DEMO_ACTIONS.TOGGLE_AUDIO);
    });
  }

  if (btnReset) {
    btnReset.addEventListener("click", () => {
      recordDomClick("action-reset");
      performFullReset();
    });
  }

  if (btnExpandMinimap) {
    btnExpandMinimap.addEventListener("click", () => {
      recordDomClick("expand-minimap");
      setMinimapExpanded();
    });
  }

  if (btnToggleMinimap) {
    btnToggleMinimap.addEventListener("click", () => {
      recordDomClick("toggle-minimap");
      dispatchAction(DEMO_ACTIONS.TOGGLE_MINIMAP);
    });
  }

  if (minimapCanvas) {
    minimapCanvas.addEventListener("click", (e) => {
      const rect = minimapCanvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const mapCssSize = getActiveMapCssSize();
      const mx = ((e.clientX - rect.left) / rect.width) * mapCssSize;
      const my = ((e.clientY - rect.top) / rect.height) * mapCssSize;

      // 1. Direct hit test on expanded-mode district label pills
      if (isMinimapExpanded && expandedLabelHitBoxes.length > 0) {
        const hitBox = expandedLabelHitBoxes.find(
          (b) => mx >= b.x1 && mx <= b.x2 && my >= b.y1 && my <= b.y2
        );
        if (hitBox) {
          dispatchAction(DEMO_ACTIONS.SET_STATE, { state: hitBox.clipId, source: "minimap" });
          return;
        }
      }

      // 2. Hit test near the 5 district landmarks / chapter spawns
      const targetWorld = mapToWorld(mx, my, mapCssSize);
      let bestClip = null;
      let bestDist = 42.0;
      for (let i = 0; i < CAMPUS_CLIPS.length; i++) {
        const clip = CAMPUS_CLIPS[i];
        const lm = CAMPUS_LANDMARKS[i];
        const dLm = lm ? Math.hypot(targetWorld.x - lm.x, targetWorld.z - lm.z) : Infinity;
        const dSpawn = Math.hypot(targetWorld.x - clip.spawnX, targetWorld.z - clip.spawnZ);
        const d = Math.min(dLm, dSpawn);
        if (d < bestDist) {
          bestDist = d;
          bestClip = clip;
        }
      }

      if (bestClip && state.gameMode !== "free_roam") {
        dispatchAction(DEMO_ACTIONS.SET_STATE, { state: bestClip.id, source: "minimap" });
      } else {
        const snapped = projectToNearestRoad(targetWorld.x, targetWorld.z);
        state.inGym = false;
        state.onTrainerStand = false;
        state.glassShattered = true;
        state.playerX = snapped.x;
        state.playerZ = snapped.z;
        state.playerHeadingYaw = snapped.yaw;
        dispatchAction(DEMO_ACTIONS.SET_FREE_ROAM, {
          enabled: true,
          source: "minimap",
          teleport: true,
          x: snapped.x,
          z: snapped.z,
          yaw: snapped.yaw,
        });
        drawCampusMinimap(true);
      }
    });
  }

  if (btnHop) {
    btnHop.addEventListener("click", () => {
      recordDomClick("bunny-hop");
      lastHopSimTime = state.elapsedTime;
      dispatchAction(DEMO_ACTIONS.BUNNY_HOP, { source: "ui" });
    });
  }

  if (btnRingBell) {
    btnRingBell.addEventListener("click", () => {
      recordDomClick("ring-bell");
      dispatchAction(DEMO_ACTIONS.RING_BELL, { source: "ui" });
    });
  }

  if (btnNooglerHat) {
    btnNooglerHat.addEventListener("click", () => {
      recordDomClick("toggle-noogler-hat");
      dispatchAction(DEMO_ACTIONS.TOGGLE_NOOGLER_HAT, { source: "ui" });
    });
  }

  if (typeof window !== "undefined") {
    window.addEventListener("resize", () => {
      xrayDimensionsDirty = true;
      minimapStaticKeyPx = -1;
      if (state.xrayEnabled) {
        const summary = deriveTourSummary(state.segmentLedger, state.kinematics, state.tpuLedger);
        renderXrayTelemetry(summary, true);
      }
      if (state.minimapVisible) {
        drawCampusMinimap(true);
      }
    });
  }

  // =========================================================================
  // Contract Event Bus Subscriptions
  // =========================================================================

  bus.addEventListener(DEMO_EVENTS.STATE_CHANGED, () => {
    prevSimMs = (Number(state.elapsedTime) || 0) * 1000;
    syncModeAndChapterPills();
    syncCameraPills();
    const summary = deriveTourSummary(state.segmentLedger, state.kinematics, state.tpuLedger);
    renderTelemetry(summary, true);
  });

  bus.addEventListener(DEMO_EVENTS.FREE_ROAM_CHANGED, () => {
    syncModeAndChapterPills();
    syncCameraPills();
    const summary = deriveTourSummary(state.segmentLedger, state.kinematics, state.tpuLedger);
    renderTelemetry(summary, true);
  });

  bus.addEventListener(DEMO_EVENTS.AUTOPLAY_TOGGLED, () => {
    syncModeAndChapterPills();
    renderTelemetry(undefined, true);
  });

  bus.addEventListener(DEMO_EVENTS.CAMERA_CHANGED, () => {
    syncCameraPills();
  });

  bus.addEventListener(DEMO_EVENTS.XRAY_TOGGLED, () => {
    syncXrayCard();
  });

  bus.addEventListener(DEMO_EVENTS.MINIMAP_TOGGLED, () => {
    syncMinimapVisibility();
  });

  bus.addEventListener(DEMO_EVENTS.AUDIO_TOGGLED, (e) => {
    syncAudioButton(e.detail?.enabled ?? state.audioEnabled);
  });

  bus.addEventListener(DEMO_EVENTS.TPU_COLLECTED, () => {
    if (tpuPopBadge && !domCache.isPopping) {
      domCache.isPopping = true;
      tpuPopBadge.classList.add("is-popping");
    }
    const summary = deriveTourSummary(state.segmentLedger, state.kinematics, state.tpuLedger);
    renderTelemetry(summary, true);
  });

  bus.addEventListener(DEMO_EVENTS.CLUSTER_BOOTED, () => {
    minimapStaticKeyOnline = null;
    const summary = deriveTourSummary(state.segmentLedger, state.kinematics, state.tpuLedger);
    renderTelemetry(summary, true);
  });

  bus.addEventListener(DEMO_EVENTS.BOOST_TRIGGERED, () => {
    syncEventCallout();
  });

  bus.addEventListener(DEMO_EVENTS.BELL_RUNG, () => {
    if (btnRingBell && !domCache.bellRinging) {
      domCache.bellRinging = true;
      btnRingBell.classList.add("is-ringing");
    }
  });

  bus.addEventListener(DEMO_EVENTS.BUNNY_HOPPED, () => {
    lastHopSimTime = state.elapsedTime;
    if (btnHop && !domCache.hopping) {
      domCache.hopping = true;
      btnHop.classList.add("is-active");
    }
  });

  bus.addEventListener(DEMO_EVENTS.NOOGLER_HAT_TOGGLED, () => {
    syncNooglerHatButton();
  });

  bus.addEventListener(DEMO_EVENTS.QUALITY_CHANGED, () => {
    if (state.xrayEnabled) {
      const summary = deriveTourSummary(state.segmentLedger, state.kinematics, state.tpuLedger);
      renderXrayTelemetry(summary, true);
    }
    if (state.minimapVisible) {
      drawCampusMinimap(true);
    }
  });

  bus.addEventListener(DEMO_EVENTS.STATS_UPDATED, (e) => {
    if (state.gameMode !== lastRenderedGameMode || state.currentState !== lastRenderedState) {
      syncModeAndChapterPills();
    }
    if (state.cameraMode !== lastRenderedCam) {
      syncCameraPills();
    }
    renderTelemetry(e.detail?.summary, false);
  });

  function syncAll() {
    syncModeAndChapterPills();
    syncCameraPills();
    syncAudioButton(state.audioEnabled);
    syncMinimapVisibility();
    syncXrayCard();
    syncNooglerHatButton();
    const summary = deriveTourSummary(state.segmentLedger, state.kinematics, state.tpuLedger);
    renderTelemetry(summary, true);
    scheduleLiveCursorIdleCheck();
  }

  // Idempotent cross-worker action dispatcher (`window.__ensureDemoClick`) with full V6/V7 alias support
  function ensureDemoClick(demoId, options = {}) {
    if (!demoId) return false;
    const id = String(demoId).trim();

    if (id === "toggle-freeroam" || id === "toggle-autoplay" || id === "free-roam" || id === "btn-freeroam") {
      if (options.enabled !== undefined) {
        const wantRoam = id === "toggle-autoplay" ? !options.enabled : Boolean(options.enabled);
        if ((state.gameMode === "free_roam") !== wantRoam || options.force) {
          dispatchAction(DEMO_ACTIONS.SET_FREE_ROAM, { enabled: wantRoam, source: "ensure" });
          return true;
        }
        return false;
      }
      if (!wasJustClicked("toggle-freeroam")) {
        dispatchAction(DEMO_ACTIONS.SET_FREE_ROAM, {
          enabled: state.gameMode !== "free_roam",
          source: "ensure",
        });
        return true;
      }
      return false;
    }

    if (id === "play-all" || /^clip-[1-5]$/.test(id) || /^state-/.test(id)) {
      const cleanRaw = id.replace(/^state-/, "");
      if (cleanRaw === "xray" || cleanRaw === "x-ray" || cleanRaw === "x_ray") {
        dispatchAction(DEMO_ACTIONS.SET_STATE, { state: "xray" });
        return true;
      }
      const targetState = normalizeStateKey(id);
      if (
        state.currentState !== targetState ||
        (targetState !== "free_roam" && state.gameMode === "free_roam") ||
        options.force
      ) {
        dispatchAction(DEMO_ACTIONS.SET_STATE, { state: targetState, source: "ensure" });
        return true;
      }
      return false;
    }

    if (id === "toggle-cam-menu" || id === "btn-cam-menu") {
      const explicitOpen = options.open !== undefined ? options.open : options.enabled;
      if (explicitOpen !== undefined) {
        if (isCamPopoverOpen !== Boolean(explicitOpen) || options.force) {
          setCamPopoverOpen(Boolean(explicitOpen));
          return true;
        }
        return false;
      }
      if (!wasJustClicked("toggle-cam-menu") || options.force) {
        setCamPopoverOpen();
        return true;
      }
      return false;
    }

    const camEntry = CAMERA_MODES.find((c) => c.demoId === id || c.id === id);
    if (camEntry) {
      let changed = false;
      if (state.cameraMode !== camEntry.id || options.force) {
        dispatchAction(DEMO_ACTIONS.SET_CAMERA, { cameraMode: camEntry.id });
        changed = true;
      }
      if (isCamPopoverOpen) {
        setCamPopoverOpen(false);
      }
      return changed;
    }

    if (id === "ring-bell" || id === "action-bell" || id === "btn-ring-bell") {
      const recentlyRung =
        Math.abs(state.elapsedTime - state.lastBellTime) < 0.16 && state.bellCount > 0;
      if (!recentlyRung && !wasJustClicked("ring-bell")) {
        dispatchAction(DEMO_ACTIONS.RING_BELL, { source: "ensure" });
        return true;
      }
      return false;
    }

    if (id === "bunny-hop" || id === "action-hop" || id === "btn-hop") {
      const recentlyHopped = Math.abs(state.elapsedTime - lastHopSimTime) < 0.16;
      if (!recentlyHopped && !wasJustClicked("bunny-hop")) {
        lastHopSimTime = state.elapsedTime;
        dispatchAction(DEMO_ACTIONS.BUNNY_HOP, { source: "ensure" });
        return true;
      }
      return false;
    }

    if (id === "toggle-noogler-hat" || id === "noogler-hat" || id === "btn-noogler-hat") {
      const explicitOpt =
        options.wearNooglerHat !== undefined ? options.wearNooglerHat : options.enabled;
      if (explicitOpt !== undefined) {
        if (Boolean(state.wearNooglerHat) !== Boolean(explicitOpt) || options.force) {
          dispatchAction(DEMO_ACTIONS.TOGGLE_NOOGLER_HAT, {
            enabled: Boolean(explicitOpt),
            source: "ensure",
          });
          return true;
        }
        return false;
      }
      if (!wasJustClicked("toggle-noogler-hat")) {
        dispatchAction(DEMO_ACTIONS.TOGGLE_NOOGLER_HAT, { source: "ensure" });
        return true;
      }
      return false;
    }

    if (id === "toggle-xray" || id === "action-xray" || id === "btn-xray") {
      if (options.enabled !== undefined) {
        if (state.xrayEnabled !== Boolean(options.enabled)) {
          dispatchAction(DEMO_ACTIONS.TOGGLE_XRAY, { enabled: Boolean(options.enabled) });
          return true;
        }
        return false;
      }
      if (!wasJustClicked("toggle-xray")) {
        dispatchAction(DEMO_ACTIONS.TOGGLE_XRAY);
        return true;
      }
      return false;
    }

    if (id === "close-xray" || id === "btn-close-xray") {
      if (state.xrayEnabled) {
        dispatchAction(DEMO_ACTIONS.TOGGLE_XRAY, { enabled: false });
        return true;
      }
      return false;
    }

    if (id === "expand-minimap" || id === "minimap-expand" || id === "btn-expand-minimap") {
      const explicitExpanded =
        options.expanded !== undefined ? options.expanded : options.enabled;
      if (explicitExpanded !== undefined) {
        if (isMinimapExpanded !== Boolean(explicitExpanded) || options.force) {
          setMinimapExpanded(Boolean(explicitExpanded));
          return true;
        }
        return false;
      }
      if (!wasJustClicked("expand-minimap") || options.force) {
        setMinimapExpanded();
        return true;
      }
      return false;
    }

    if (id === "toggle-minimap" || id === "minimap-toggle" || id === "btn-toggle-minimap") {
      if (options.visible !== undefined) {
        if (state.minimapVisible !== Boolean(options.visible)) {
          dispatchAction(DEMO_ACTIONS.TOGGLE_MINIMAP, { visible: Boolean(options.visible) });
          return true;
        }
        return false;
      }
      if (!wasJustClicked("toggle-minimap")) {
        dispatchAction(DEMO_ACTIONS.TOGGLE_MINIMAP);
        return true;
      }
      return false;
    }

    if (id === "toggle-audio" || id === "action-audio" || id === "btn-audio") {
      if (options.enabled !== undefined) {
        if (state.audioEnabled !== Boolean(options.enabled)) {
          dispatchAction(DEMO_ACTIONS.TOGGLE_AUDIO, { enabled: Boolean(options.enabled) });
          return true;
        }
        return false;
      }
      if (!wasJustClicked("toggle-audio")) {
        dispatchAction(DEMO_ACTIONS.TOGGLE_AUDIO);
        return true;
      }
      return false;
    }

    if (id === "action-reset" || id === "btn-reset") {
      if (!wasJustClicked("action-reset") || options.force) {
        performFullReset();
        return true;
      }
      return false;
    }

    const fallbackEl = document.querySelector(`[data-demo-id="${id}"]`);
    if (fallbackEl && !wasJustClicked(id)) {
      fallbackEl.click();
      return true;
    }
    return false;
  }

  syncAll();

  return {
    syncAll,
    drawCampusMinimap,
    setMinimapExpanded,
    setCamPopoverOpen,
    ensureDemoClick,
  };
}
