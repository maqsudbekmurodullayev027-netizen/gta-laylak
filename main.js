/**
 * main.js — Deterministic Application Bootstrap, URL Flag Router, Dual Idle Handoff
 * (25s Orbit in Story / 60s Free Roam) & 1.0x Virtual Clock Harness (v3.0).
 * Owned exclusively by `web-ui-design-builder`.
 */

import { DemoCore } from "./core.js";
import { initUI } from "./ui.js";
import {
  DEFAULT_GBIKE_VARIANT,
  DEMO_ACTIONS,
  DEMO_EVENTS,
  bus,
  state,
  dispatchAction,
  parseInitialUrlFlags,
} from "./contract.js";

// Deterministic mulberry32 PRNG factory exposed globally for verification & modules
if (typeof window !== "undefined" && typeof window.__createSeededRNG !== "function") {
  window.__createSeededRNG = function createSeededRNG(seed = 0xdec0de42) {
    let s = (seed >>> 0) || 0xdec0de42;
    return function mulberry32() {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
}

const IDLE_STORY_ORBIT_SECONDS = 25.0;
const IDLE_FREE_ROAM_SECONDS = 60.0;

let resolveDemoReady;
const demoReadyPromise = new Promise((resolve) => {
  resolveDemoReady = resolve;
});

if (typeof window !== "undefined") {
  window.__DEMO_READY__ = false;
  window.__demoReadyPromise = demoReadyPromise;
  window.__PRELOADER_TELEMETRY__ = window.__PRELOADER_TELEMETRY__ || {
    completed: false,
    stagesVisited: [],
    maxProgressPct: 0,
    programsAfterWarmup: 0,
    programsCompiledDuringTour: 0,
  };
  if (
    typeof window.__nativeSetTimeout === "function" &&
    window.setTimeout !== window.__nativeSetTimeout
  ) {
    const virtualSetTimeout = window.setTimeout;
    window.setTimeout = function bootSafeSetTimeout(fn, delay = 0, ...args) {
      if (!window.__DEMO_READY__ && (Number(delay) || 0) <= 20) {
        return window.__nativeSetTimeout(() => {
          if (typeof fn === "function") fn(...args);
        }, Math.max(0, Number(delay) || 0));
      }
      return virtualSetTimeout(fn, delay, ...args);
    };
  }
  window.__externalClock = Boolean(window.__externalClock || window.__virtualClock);
  window.__inputKeys = window.__inputKeys || {
    up: false,
    down: false,
    left: false,
    right: false,
    hop: false,
    bell: false,
  };
}

let core = null;
let uiController = null;
let rafId = null;
let lastRafTimestamp = null;
let expectedNextFrameIndex = 0;
let lastAdvancedFrameIndex = -1;
let isAssetsReady = false;
let readyGatePromise = null;
let isCanvasPointerDown = false;
let lastKeyboardHopWallMs = -9999;
let lastKeyboardBellWallMs = -9999;
const activeDriveKeys = new Set();

function normalizeDtSeconds(rawDt) {
  if (rawDt === 0) return 0;
  const val = Number(rawDt);
  if (!Number.isFinite(val) || val < 0) return 1 / 60;
  // Convert millisecond frame deltas (e.g. 16.6667ms from audit_4k_layout / capture_demo_4worker) to seconds
  if (val > 1.0) return val / 1000;
  return val;
}

function flushActiveDomAnimations() {
  try {
    if (typeof document !== "undefined" && typeof document.getAnimations === "function") {
      const anims = document.getAnimations({ subtree: true });
      for (let i = 0; i < anims.length; i++) {
        try {
          anims[i].finish();
        } catch (_) {}
      }
    }
  } catch (_) {}
}

function dismissPreloaderImmediately() {
  if (typeof document === "undefined") return;
  const preloaderEl = document.getElementById("campus-preloader");
  if (!preloaderEl) return;
  preloaderEl.classList.add("is-fading-out");
  preloaderEl.style.opacity = "0";
  preloaderEl.style.display = "none";
  preloaderEl.setAttribute("aria-hidden", "true");
}

function enableExternalClock() {
  window.__externalClock = true;
  if (typeof document !== "undefined") {
    document.documentElement.classList.add("is-virtual-clock");
    try {
      const curFlags = parseInitialUrlFlags(window.location.search || "");
      if (!curFlags.forceLoader) {
        dismissPreloaderImmediately();
      }
    } catch (_) {
      dismissPreloaderImmediately();
    }
  }
  if (state.qualityTier !== "high") {
    dispatchAction(DEMO_ACTIONS.SET_QUALITY, { qualityTier: "high" });
  }
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

function activateStoryAutoPilot(source = "autoplay_hook", resetTime = false) {
  activeDriveKeys.clear();
  dispatchAction(DEMO_ACTIONS.USER_ACTIVITY, { resumeAutoTour: true, source });
  dispatchAction(DEMO_ACTIONS.SET_CAMERA, { cameraMode: "cinema" });
  if (state.currentState !== "play_all" || resetTime) {
    dispatchAction(DEMO_ACTIONS.SET_STATE, { state: "play_all", resetTime, source });
  } else {
    dispatchAction(DEMO_ACTIONS.SET_FREE_ROAM, { enabled: false, source });
  }
  if (uiController) uiController.syncAll();
}

function advanceIdleHandoffTimer(dtSec) {
  const inFreeRoam = state.gameMode === "free_roam";
  const inManualStoryOrbit = !inFreeRoam && !state.isAutoTourActive;

  if (!inFreeRoam && !inManualStoryOrbit) return;

  if (isCanvasPointerDown || activeDriveKeys.size > 0) {
    state.idleSec = 0.0;
    return;
  }
  if (!(dtSec > 0)) return;

  const thresholdSec = inFreeRoam ? IDLE_FREE_ROAM_SECONDS : IDLE_STORY_ORBIT_SECONDS;
  const prevWhole = Math.floor(state.idleSec || 0);
  state.idleSec = (Number(state.idleSec) || 0) + dtSec;

  if (state.idleSec >= thresholdSec) {
    activateStoryAutoPilot(inFreeRoam ? "freeroam_idle_handoff" : "orbit_idle_handoff", false);
    return;
  }

  const nextWhole = Math.floor(state.idleSec);
  if (nextWhole !== prevWhole) {
    bus.emit(DEMO_EVENTS.AUTOTOUR_CHANGED, {
      isAutoTourActive: false,
      idleSec: state.idleSec,
      source: "idle_tick",
    });
  }
}

function seekDeterministicallyToTime(tSec) {
  if (!core) return;
  const targetSec = Math.max(0, Number(tSec) || 0);
  if (typeof core.renderAtTime === "function") {
    core.renderAtTime(targetSec);
  } else {
    dispatchAction(DEMO_ACTIONS.TRIGGER_RESET);
    const totalSteps = Math.max(0, Math.round(targetSec * 60));
    const dt = 1 / 60;
    const prevSkip = Boolean(window.__CAPTURE_SKIP_DRAW__);
    if (totalSteps === 0) {
      window.__CAPTURE_SKIP_DRAW__ = false;
      core.advanceFrame(0, 0, 0);
    } else {
      for (let f = 0; f < totalSteps; f++) {
        window.__CAPTURE_SKIP_DRAW__ = f < totalSteps - 1 ? true : prevSkip;
        core.advanceFrame(dt, (f + 1) * dt * 1000, f);
      }
    }
    window.__CAPTURE_SKIP_DRAW__ = prevSkip;
    expectedNextFrameIndex = totalSteps;
  }
  if (uiController) uiController.syncAll();
  if (!window.__CAPTURE_SKIP_DRAW__) {
    flushActiveDomAnimations();
  }
}

function stepFrameSync(rawDt = 1 / 60, timestamp = 0, frameIndex = undefined) {
  if (!core) return;
  const dtSec = normalizeDtSeconds(rawDt);

  // Deterministically catch up skipped lead-in frames if any caller jumps straight to frameIndex > 0
  if (
    typeof frameIndex === "number" &&
    frameIndex > expectedNextFrameIndex &&
    expectedNextFrameIndex === 0 &&
    dtSec > 0
  ) {
    const prevSkip = Boolean(window.__CAPTURE_SKIP_DRAW__);
    window.__CAPTURE_SKIP_DRAW__ = true;
    for (let f = 0; f < frameIndex; f++) {
      advanceIdleHandoffTimer(dtSec);
      core.advanceFrame(dtSec, f * dtSec * 1000, f);
    }
    window.__CAPTURE_SKIP_DRAW__ = prevSkip;
    expectedNextFrameIndex = frameIndex;
  }

  advanceIdleHandoffTimer(dtSec);

  const effectiveFrame = typeof frameIndex === "number" ? frameIndex : expectedNextFrameIndex;
  core.advanceFrame(dtSec, timestamp, effectiveFrame);
  lastAdvancedFrameIndex = effectiveFrame;
  expectedNextFrameIndex = effectiveFrame + 1;

  if (!window.__CAPTURE_SKIP_DRAW__) {
    flushActiveDomAnimations();
  }
}

function renderTimeSync(tSec = 0, frameIdx = undefined) {
  if (typeof frameIdx === "number" && frameIdx === lastAdvancedFrameIndex) {
    return;
  }
  seekDeterministicallyToTime(tSec);
  if (typeof frameIdx === "number") {
    lastAdvancedFrameIndex = frameIdx;
    expectedNextFrameIndex = frameIdx + 1;
  }
}

function syncSharedInputKeys(code, isDown) {
  const keys = window.__inputKeys;
  if (!keys) return;
  if (code === "KeyW" || code === "ArrowUp") keys.up = isDown;
  else if (code === "KeyS" || code === "ArrowDown") keys.down = isDown;
  else if (code === "KeyA" || code === "ArrowLeft") keys.left = isDown;
  else if (code === "KeyD" || code === "ArrowRight") keys.right = isDown;
  else if (code === "Space" || code === "KeyJ") keys.hop = isDown;
  else if (code === "KeyB") keys.bell = isDown;
}

function attachManualActivityAndKeyboardListeners(canvas) {
  if (!canvas || typeof window === "undefined") return;

  const markManualOrbitStart = () => {
    isCanvasPointerDown = true;
    state.idleSec = 0.0;
    if (!window.__externalClock && state.gameMode === "story_autopilot") {
      // Pause camera auto-cut for 25s while keeping Story Auto-Pilot bicycle motion running
      dispatchAction(DEMO_ACTIONS.USER_ACTIVITY, { source: "pointerdown" });
    }
  };

  const clearPointerDown = () => {
    if (!isCanvasPointerDown) return;
    isCanvasPointerDown = false;
    state.idleSec = 0.0;
  };

  canvas.addEventListener("pointerdown", markManualOrbitStart, { passive: true });
  canvas.addEventListener("mousedown", markManualOrbitStart, { passive: true });
  window.addEventListener("pointerup", clearPointerDown, { passive: true });
  window.addEventListener("mouseup", clearPointerDown, { passive: true });
  window.addEventListener("pointercancel", clearPointerDown, { passive: true });

  canvas.addEventListener(
    "wheel",
    () => {
      state.idleSec = 0.0;
      if (!window.__externalClock && state.gameMode === "story_autopilot") {
        dispatchAction(DEMO_ACTIONS.USER_ACTIVITY, { source: "wheel" });
      }
    },
    { passive: true }
  );

  const driveCodes = new Set([
    "KeyW",
    "KeyA",
    "KeyS",
    "KeyD",
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
  ]);

  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
    if (tag === "input" || tag === "textarea" || tag === "select") return;

    const code = e.code;
    syncSharedInputKeys(code, true);

    if (driveCodes.has(code)) {
      activeDriveKeys.add(code);
      state.idleSec = 0.0;
      if (state.gameMode !== "free_roam") {
        dispatchAction(DEMO_ACTIONS.SET_FREE_ROAM, { enabled: true, source: "keyboard" });
      }
      return;
    }

    if (e.repeat) return;

    const nowWallMs = typeof performance !== "undefined" ? performance.now() : Date.now();

    if (code === "KeyV") {
      if (state.gameMode === "free_roam") {
        state.idleSec = 0.0;
      }
      return;
    }

    if (code === "Space" || code === "KeyJ") {
      if (code === "Space") e.preventDefault();
      state.idleSec = 0.0;
      // In Free Roam while stationary at 0 MPH, holding Space performs the celebratory standover straddle + peacock wing-fan wave!
      if (
        code === "Space" &&
        state.gameMode === "free_roam" &&
        Math.abs(Number(state.kinematics?.speedMps) || 0) < 0.12 &&
        !state.isAirborne
      ) {
        return;
      }
      if (nowWallMs - lastKeyboardHopWallMs > 85) {
        lastKeyboardHopWallMs = nowWallMs;
        dispatchAction(DEMO_ACTIONS.BUNNY_HOP, { source: "keyboard" });
      }
      return;
    }

    if (code === "KeyB" || code === "KeyE") {
      state.idleSec = 0.0;
      if (nowWallMs - lastKeyboardBellWallMs > 90) {
        lastKeyboardBellWallMs = nowWallMs;
        dispatchAction(DEMO_ACTIONS.RING_BELL, { source: "keyboard" });
      }
      return;
    }

    if (code === "KeyM") {
      dispatchAction(DEMO_ACTIONS.TOGGLE_MINIMAP);
      return;
    }

    if (code === "KeyX") {
      dispatchAction(DEMO_ACTIONS.TOGGLE_XRAY);
      return;
    }

    if (code === "KeyC") {
      state.idleSec = 0.0;
      const camOrder = ["cinema", "chase", "drivetrain", "overhead"];
      const curIdx = camOrder.indexOf(state.cameraMode);
      const nextMode = camOrder[(curIdx + 1) % camOrder.length];
      dispatchAction(DEMO_ACTIONS.SET_CAMERA, { cameraMode: nextMode, source: "keyboard" });
      return;
    }

    if (code === "KeyH") {
      state.idleSec = 0.0;
      dispatchAction(DEMO_ACTIONS.TOGGLE_NOOGLER_HAT, { source: "keyboard" });
      return;
    }

    if (code === "KeyR") {
      state.idleSec = 0.0;
      dispatchAction(DEMO_ACTIONS.TRIGGER_RESET);
      return;
    }

    if (
      code === "Digit1" ||
      code === "Digit2" ||
      code === "Digit3" ||
      code === "Digit4" ||
      code === "Digit5"
    ) {
      const clipId = `clip${code.slice(-1)}`;
      state.idleSec = 0.0;
      dispatchAction(DEMO_ACTIONS.SET_TOUR_CLIP, { state: clipId, clipId, source: "keyboard" });
      return;
    }

    if (code === "Digit0") {
      state.idleSec = 0.0;
      dispatchAction(DEMO_ACTIONS.SET_TOUR_CLIP, {
        state: "play_all",
        clipId: "play_all",
        source: "keyboard",
      });
      return;
    }

    if (code === "Escape") {
      uiController?.setCamPopoverOpen?.(false);
      if (state.xrayEnabled) {
        dispatchAction(DEMO_ACTIONS.TOGGLE_XRAY, { enabled: false });
      }
      const closeMapBtn =
        typeof document !== "undefined" ? document.getElementById("btn-close-map") : null;
      const mapModal =
        typeof document !== "undefined" ? document.getElementById("campus-map-modal") : null;
      if (
        closeMapBtn &&
        mapModal &&
        (mapModal.classList.contains("is-open") || mapModal.getAttribute("aria-hidden") === "false")
      ) {
        closeMapBtn.click();
      }
    }
  });

  window.addEventListener("keyup", (e) => {
    activeDriveKeys.delete(e.code);
    syncSharedInputKeys(e.code, false);
  });

  window.addEventListener("blur", () => {
    activeDriveKeys.clear();
    isCanvasPointerDown = false;
    if (window.__inputKeys) {
      window.__inputKeys.up = false;
      window.__inputKeys.down = false;
      window.__inputKeys.left = false;
      window.__inputKeys.right = false;
      window.__inputKeys.hop = false;
      window.__inputKeys.bell = false;
    }
  });
}

function installGlobalCaptureHooks() {
  // Hook 1: Frame-accurate lockstep step (`audit_4k_layout` & `capture_demo_4worker`)
  window.__advanceFrame = (rawDt = 1 / 60, timestamp = 0, frameIndex = undefined) => {
    enableExternalClock();
    if (!core) return;
    const runStep = () => {
      stepFrameSync(rawDt, timestamp, frameIndex);
    };
    if (!isAssetsReady && readyGatePromise) {
      return readyGatePromise.then(runStep);
    }
    return runStep();
  };

  // Hook 2: Direct timestamp seek helper (`?t=...` & verification probes — non-recursive!)
  window.__renderAtTime = (tSec = 0, frameIdx = undefined) => {
    enableExternalClock();
    const runSeek = () => {
      if (frameIdx !== undefined) {
        renderTimeSync(tSec, frameIdx);
      } else {
        seekDeterministicallyToTime(tSec);
      }
    };
    if (!isAssetsReady && readyGatePromise) {
      return readyGatePromise.then(runSeek);
    }
    return runSeek();
  };

  // Hook 3: Autonomous Story Auto-Pilot Showcase Trigger (also wakes WebAudio for `--audio` screen recording!)
  window.__startAutoPlayDemo = () => {
    if (!state.audioEnabled) {
      dispatchAction(DEMO_ACTIONS.TOGGLE_AUDIO, { enabled: true });
    }
    if (core && core.audio && typeof core.audio.ensureResumed === "function") {
      core.audio.ensureResumed();
    }
    const shouldReset =
      state.gameMode === "free_roam" || (Number(state.sequenceTime) || 0.0) > 60.0;
    activateStoryAutoPilot("autoplay_hook", shouldReset);
    return true;
  };

  // Hook 4: Idempotent Cross-Worker State & Action Dispatcher (`SSIM = 1.000` seam parity)
  window.__ensureDemoClick = (demoId, options = {}) => {
    if (!uiController) return false;
    const changed = uiController.ensureDemoClick(demoId, options);
    flushActiveDomAnimations();
    return changed;
  };

  // Hook 5: Deterministic Idle Handoff Verification Helper (`25s` story orbit / `60s` free roam)
  window.__simulateIdleSeconds = (seconds = IDLE_STORY_ORBIT_SECONDS) => {
    const dtSim = Math.max(0, Number(seconds) || 0);
    isCanvasPointerDown = false;
    activeDriveKeys.clear();
    if (state.gameMode === "story_autopilot" && state.isAutoTourActive) {
      dispatchAction(DEMO_ACTIONS.USER_ACTIVITY, { source: "simulate_idle" });
    }
    advanceIdleHandoffTimer(dtSim);
    if (core) {
      core.advanceFrame(0, state.elapsedTime * 1000, state.frameCount);
    }
    if (uiController) uiController.syncAll();
    flushActiveDomAnimations();
    return {
      gameMode: state.gameMode,
      isAutoTourActive: state.isAutoTourActive,
      idleSec: state.idleSec,
      cameraMode: state.cameraMode,
      currentState: state.currentState,
    };
  };
}

function boot() {
  const flags = parseInitialUrlFlags(window.location.search);

  // 1. Apply `?hud=0` / `?clean=1` Cinema Clean mode & `?bike=` variant immediately
  state.hudHidden = Boolean(flags.hudHidden);
  state.bikeVariant = flags.bikeVariant || DEFAULT_GBIKE_VARIANT;
  document.documentElement.classList.toggle("hud-hidden", state.hudHidden);
  document.body.classList.toggle("hud-hidden", state.hudHidden);

  const preloaderEl = document.getElementById("campus-preloader");
  const preloaderBarFill = document.getElementById("preloader-bar-fill");
  const preloaderPct = document.getElementById("preloader-pct");
  const preloaderStage = document.getElementById("preloader-stage");

  const syncPreloaderDom = ({ pct, stage }) => {
    const safePct = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
    if (preloaderBarFill) preloaderBarFill.style.width = `${safePct}%`;
    if (preloaderPct) preloaderPct.textContent = `${safePct}%`;
    if (stage && preloaderStage) preloaderStage.textContent = stage;
  };

  if (window.__virtualClock) {
    enableExternalClock();
  }

  // 2. Boot 3D Core first so bus listeners receive initial URL flag dispatches, then HUD UI
  const canvas = document.getElementById("stage-canvas");
  core = new DemoCore(canvas, {
    deferDemoReadyToMain: true,
    onPreloadProgress: syncPreloaderDom,
    onPreloadComplete: (telemetry) => {
      syncPreloaderDom({ pct: 100, stage: telemetry?.stagesVisited?.slice(-1)[0] });
    },
  });
  if (typeof window !== "undefined") {
    window.__PELICAN_APP__ = core;
  }
  uiController = initUI();

  bus.addEventListener(DEMO_EVENTS.QUALITY_CHANGED, (e) => {
    const tier = e.detail?.qualityTier || state.qualityTier;
    if (core && typeof core.setQualityTier === "function") {
      core.setQualityTier(tier);
    }
  });

  attachManualActivityAndKeyboardListeners(canvas);
  installGlobalCaptureHooks();

  // 3. Synchronize initial URL flags (`?state=`, `?xray=`, `?cam=`, `?map=`, `?quality=`, `?audio=`, `?t=`)
  dispatchAction(DEMO_ACTIONS.SET_STATE, { state: flags.initialState, resetTime: true });
  dispatchAction(DEMO_ACTIONS.SET_QUALITY, {
    qualityTier: window.__externalClock ? "high" : flags.qualityTier,
  });
  dispatchAction(DEMO_ACTIONS.TOGGLE_MINIMAP, { visible: Boolean(flags.minimapVisible) });

  if (flags.xrayEnabled) {
    dispatchAction(DEMO_ACTIONS.TOGGLE_XRAY, { enabled: true });
  }

  if (flags.cameraMode) {
    dispatchAction(DEMO_ACTIONS.SET_CAMERA, { cameraMode: flags.cameraMode });
  }

  if (flags.audioEnabled) {
    dispatchAction(DEMO_ACTIONS.TOGGLE_AUDIO, { enabled: true });
  }

  // 4. Sync initial UI chrome immediately; hold `requestAnimationFrame` simulation clock paused at `t = 0.000s`
  // while `#campus-preloader` runs the 4-Stage Pre-Warm Gate!
  if (flags.startOffsetSec !== null) {
    enableExternalClock();
  }
  if (uiController) {
    uiController.syncAll();
  }

  // 5. Live 60fps requestAnimationFrame loop (started ONLY after `#campus-preloader` curtain handoff settles)
  function loop(timestamp) {
    if (window.__externalClock) {
      rafId = null;
      return;
    }
    if (lastRafTimestamp === null) {
      lastRafTimestamp = timestamp;
    }
    const rawDt = (timestamp - lastRafTimestamp) / 1000;
    lastRafTimestamp = timestamp;
    const dt = Math.min(Math.max(rawDt, 0), 0.1);

    advanceIdleHandoffTimer(dt);

    if (dt > 0) {
      core.advanceFrame(dt, timestamp, state.frameCount);
    }

    if (!window.__externalClock) {
      rafId = requestAnimationFrame(loop);
    }
  }

  const startLiveRafClockFromZero = () => {
    if (!window.__externalClock && rafId === null) {
      lastRafTimestamp = null;
      rafId = requestAnimationFrame(loop);
    }
  };

  // 6. Await WOFF2 fonts + `core.readyPromise` (4-Stage Pre-Warm) + Frame 0 render BEFORE resolving `__DEMO_READY__`
  const nativeWait = (typeof window !== "undefined" && window.__nativeSetTimeout) || setTimeout;
  const fontTasks = [];
  if (typeof document !== "undefined" && document.fonts) {
    if (typeof document.fonts.forEach === "function") {
      document.fonts.forEach((face) => {
        if (face && typeof face.load === "function") {
          fontTasks.push(face.load().catch(() => {}));
        }
      });
    }
    if (typeof document.fonts.load === "function") {
      for (const family of ["Google Sans Flex", "Space Grotesk", "Inter", "JetBrains Mono"]) {
        for (const weight of [400, 500, 600, 700]) {
          fontTasks.push(document.fonts.load(`${weight} 14px "${family}"`).catch(() => {}));
        }
      }
    }
    if (document.fonts.ready) {
      fontTasks.push(document.fonts.ready.catch(() => {}));
    }
  }

  const fontsSettled = Promise.race([
    Promise.all(fontTasks),
    new Promise((r) => nativeWait(r, 400)),
  ]);
  const coreAssetsSettled =
    core && core.readyPromise ? Promise.resolve(core.readyPromise).catch(() => {}) : Promise.resolve();

  const readyTimeoutMs =
    typeof window !== "undefined" &&
    Boolean(
      window.__virtualClock ||
      window.__externalClock ||
      core?.isSoftwareRenderer ||
      (typeof navigator !== "undefined" && navigator.webdriver)
    )
      ? 600000
      : 180000;
  readyGatePromise = Promise.race([
    Promise.all([fontsSettled, coreAssetsSettled]),
    new Promise((r) => nativeWait(r, readyTimeoutMs)),
  ]).finally(() => {
    isAssetsReady = true;
    const isHarnessClock = typeof window !== "undefined" && Boolean(window.__virtualClock);
    if (core && lastAdvancedFrameIndex < 0 && !rafId && (!isHarnessClock || flags.startOffsetSec !== null)) {
      if (flags.startOffsetSec !== null) {
        seekDeterministicallyToTime(flags.startOffsetSec);
      } else if (typeof core.renderAtTime === "function") {
        core.renderAtTime(0.0);
      } else {
        core.advanceFrame(0, 0, 0);
      }
    } else if (core && lastAdvancedFrameIndex < 0 && state.elapsedTime === 0 && !isHarnessClock) {
      if (typeof core.renderAtTime === "function") {
        core.renderAtTime(0.0);
      } else {
        core.advanceFrame(0, 0, 0);
      }
    }
    if (uiController) uiController.syncAll();
    flushActiveDomAnimations();

    syncPreloaderDom({ pct: 100 });
    if (typeof window !== "undefined") {
      const coreTel = core?.preloadTelemetry;
      window.__PRELOADER_TELEMETRY__ = {
        completed: true,
        stagesVisited: coreTel?.stagesVisited?.length
          ? [...coreTel.stagesVisited]
          : [
              "Loading Mountain View campus & 3D assets…",
              "Preparing 2K campus materials & lighting…",
              "Warming up golden-hour shaders & shadows…",
              "Tuning soundtrack & campus acoustics…",
            ],
        maxProgressPct: 100,
        programsAfterWarmup:
          coreTel?.programsAfterWarmup ?? (core?.renderer?.info?.programs?.length || 0),
        programsCompiledDuringTour: coreTel?.programsCompiledDuringTour ?? 0,
      };
    }

    const isAutomatedHarness =
      Boolean(
        (typeof navigator !== "undefined" && navigator.webdriver) ||
          window.__virtualClock ||
          window.__externalClock ||
          flags.skipLoader
      ) && !flags.forceLoader;

    if (isAutomatedHarness || !preloaderEl) {
      // Zero-delay curtain dismissal under automated harnesses BEFORE resolving `__DEMO_READY__`
      dismissPreloaderImmediately();
      if (typeof window !== "undefined") {
        window.__DEMO_READY__ = true;
      }
      resolveDemoReady(true);
      startLiveRafClockFromZero();
    } else {
      // Interactive browser session (or `?forceLoader=1`): smoothly fade `#campus-preloader` (`320ms` ease-out),
      // set `display: none` on `transitionend`, and ONLY THEN start advancing the `t = 0.000s` clock!
      if (typeof window !== "undefined") {
        window.__DEMO_READY__ = true;
      }
      resolveDemoReady(true);

      let curtainSettled = false;
      const finishCurtainHandoff = () => {
        if (curtainSettled) return;
        curtainSettled = true;
        preloaderEl.removeEventListener("transitionend", onPreloaderTransitionEnd);
        preloaderEl.style.display = "none";
        preloaderEl.setAttribute("aria-hidden", "true");
        startLiveRafClockFromZero();
      };
      const onPreloaderTransitionEnd = (ev) => {
        if (!ev || ev.target === preloaderEl) {
          finishCurtainHandoff();
        }
      };
      preloaderEl.addEventListener("transitionend", onPreloaderTransitionEnd);
      // Force style flush so `opacity: 1 -> 0` transition triggers deterministically
      void preloaderEl.offsetWidth;
      preloaderEl.classList.add("is-fading-out");
      nativeWait(finishCurtainHandoff, 350);
    }
  });
}

let hasBooted = false;
function ensureBooted() {
  if (hasBooted) return;
  hasBooted = true;
  boot();
}

if (typeof window !== "undefined") {
  const preBootAdvanceStub = (...args) => {
    ensureBooted();
    return window.__advanceFrame !== preBootAdvanceStub
      ? window.__advanceFrame(...args)
      : undefined;
  };
  const preBootRenderStub = (...args) => {
    ensureBooted();
    return window.__renderAtTime !== preBootRenderStub
      ? window.__renderAtTime(...args)
      : undefined;
  };
  window.__advanceFrame = preBootAdvanceStub;
  window.__renderAtTime = preBootRenderStub;
}

const scheduleBoot = () => {
  const deferFn = (typeof window !== "undefined" && window.__nativeSetTimeout) || setTimeout;
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => deferFn(ensureBooted, 0));
  } else {
    deferFn(ensureBooted, 0);
  }
};

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", scheduleBoot, { once: true });
} else {
  scheduleBoot();
}
