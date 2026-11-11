/**
 * game_audio.js — V7 Sunlit California Lyria 3.5 Score, Dual-Bus Mastering & 72ms Lookahead Physical Foley Engine.
 *
 * STRICT V7 AUDIO & HEADLESS INVARIANTS (`audio-sensory-experience` & `webaudio-instrument-craft`):
 *   1. Permanently Locked `playbackRate = 1.000` (`0` Pitch/Tempo Warping Ever!):
 *        - Decodes Base64-inlined `lyria_score_b64.js` (`112 BPM` California coastal indie-funk / Rhodes cruiser)
 *          into a phase-aligned circular equal-power looping `AudioBufferSourceNode` with `playbackRate.value = 1.000`
 *          permanently locked across indoor gym, outdoor cruise, Micro-Kitchen Espresso boost, and Bay View slow-mo jump!
 *        - Expresses Bay View slow-mo jump apexes and Micro-Kitchen Espresso boosts via dedicated sound-design layers
 *          on `sfxBus` (warm sub-bass drop, airy Cmaj9 harmonic shimmer, gentle swept filter bloom).
 *   2. Dual-Bus Mastering (`musicBus` + `sfxBus` -> `-1.2 dB` Fast Peak Ceiling Limiter, Zero Pumping!):
 *        - `lyriaSource (1.000x) -> lyriaFilter -> musicHighpass (38 Hz) -> lyriaGain -> musicBus -> masterGain -> limiter`
 *        - `SFX/Foley voices -> preMasterGain (sfxInput) -> sfxHighpass (30 Hz) -> compressor (SFX-only peak glue) -> sfxBus -> masterGain -> limiter`
 *        - `limiter`: fast brickwall peak safety ceiling (`threshold = -1.2 dB`, `knee = 0.0`, `ratio = 20:1`, `attack = 0.001s`, `release = 0.04s`)
 *          connected to `AnalyserNode`, `audioCtx.destination`, AND Frame-0 `window.__audioStreamDestination`.
 *        - Loud SFX transients (window shatter, Stan T-Rex sub-roar, brass bell strikes, TPU 8i chimes, Supercluster fanfare)
 *          NEVER duck or pump `musicBus`!
 *   3. 65–80ms (`72ms`) Lookahead-Scheduled Physical Multi-Transient Bike, Avian & Cold-Open Foley:
 *        - Schedules mechanical/drivetrain/surface transients ahead on `AudioContext.currentTime` (`72ms` PLL-locked
 *          lookahead window with sub-millisecond phase interpolation) to eliminate browser `rAF` timing jitter.
 *        - Multi-transient metallic `18T` freehub pawl impulse bursts (`2.8–6.5 kHz`) when coasting vs taut chain roller engagement under torque.
 *        - Surface-proportioned tire rolling texture (hex paver dual-tap micro-joints, aggregate asphalt hiss, weathered timber plank cavity knocks).
 *        - Natural two-tone spun-brass GBike bell (`inharmonic dome partials + metallic striker transient`).
 *        - Aerodynamic wind-in-feathers primary-remiges rustle + subtle Pelican keratin bill-clack & wing-ruffle Foley.
 *        - Cold-Open 3-Beat Foley (`0.0–9.6s`): Beat 1 (`0.0–1.8s`) high-inertia spin-flywheel whirr -> Beat 2 (`1.8–4.4s`)
 *          heavy rubbery webbed-foot stomp onto pedal -> Beat 3 (`4.4–7.4s`) accelerating `36 -> 168 RPM` roller sprint ->
 *          `7.40s` crisp metallic latch snap -> `9.40s` crystalline tempered-glass shatter!
 *   4. All `exponentialRampToValueAtTime` anchors & targets strictly clamped `>= 0.0001`; all attacks `>= 5.5ms`.
 *   5. Zero `three` imports and zero `Math.random()` (`mulberry32` deterministic PRNG only).
 */

import { decodeLyriaScoreArrayBuffer, LYRIA_SCORE_BPM } from "./lyria_score_b64.js";
import { CLIP5_PLANK_PITCH_M, createMulberry32, clamp } from "../rig/kin.js";
import { bus, state, DEMO_EVENTS } from "../contract.js";

const MIN_EXP_VAL = 0.0001;
const MIN_ATTACK_SEC = 0.0055; // >= 5.5ms click-free linear attack
const GYM_MUFFLE_CUTOFF_HZ = 520.0;
const LOOKAHEAD_WINDOW_SEC = 0.072; // 72ms WebAudio lookahead window (inside 65–80ms target)
const LOCKED_MUSIC_RATE = 1.0;

// 16-Step Ascending C-Major9 / Lydian Wafer Pickup Ladder (C5 -> G7)
export const C_MAJ9_LADDER_HZ = Object.freeze([
  523.25,  // 01: C5
  587.33,  // 02: D5
  659.25,  // 03: E5
  783.99,  // 04: G5
  987.77,  // 05: B5 (Ironwood Gold Android Lawn!)
  1046.50, // 06: C6
  1174.66, // 07: D6
  1318.51, // 08: E6 (Ironwood Gold Stan T-Rex!)
  1479.98, // 09: F#6
  1567.98, // 10: G6
  1760.00, // 11: A6
  1975.53, // 12: B6 (Ironwood Gold Slow-Mo Ramp Apex!)
  2093.00, // 13: C7
  2349.32, // 14: D7
  2637.02, // 15: E7 (Ironwood Gold Corten Bridge Mid-Span!)
  3135.96, // 16: G7 (Ironwood Gold Shoreline Finale!)
]);

function safeExpVal(val) {
  return Math.max(MIN_EXP_VAL, Number.isFinite(val) ? val : MIN_EXP_VAL);
}

function isOfflineAudioContext(ctx) {
  return typeof OfflineAudioContext !== "undefined" && ctx instanceof OfflineAudioContext;
}

function setParamAt(param, val, time) {
  if (!param) return;
  if (typeof param.setValueAtTime === "function") {
    param.setValueAtTime(val, time);
  } else {
    param.value = val;
  }
}

function setTargetAt(param, val, time, timeConstant) {
  if (!param) return;
  if (typeof param.setTargetAtTime === "function") {
    param.setTargetAtTime(val, time, timeConstant);
  } else {
    param.value = val;
  }
}

function expRampParam(param, val, endTime) {
  if (!param) return;
  const safeV = safeExpVal(val);
  if (typeof param.exponentialRampToValueAtTime === "function") {
    param.exponentialRampToValueAtTime(safeV, endTime);
  } else {
    param.value = safeV;
  }
}

function linRampParam(param, val, endTime) {
  if (!param) return;
  if (typeof param.linearRampToValueAtTime === "function") {
    param.linearRampToValueAtTime(val, endTime);
  } else {
    param.value = val;
  }
}

export class GameAudioEngine {
  constructor(options = {}) {
    this.rng =
      typeof options.rng === "function"
        ? options.rng
        : createMulberry32(typeof options.seed === "number" ? options.seed : 0x5f8a0d10);

    this._injectedCtx = options.audioContext || null;
    this._predecodedLyriaBuffer = options.lyriaBuffer || null;
    this.ctx = null;

    // V7 Independent Dual-Bus Mastering Nodes (`musicBus` + `sfxBus` -> `masterGain` -> `-1.2 dB` `limiter`)
    this.musicBus = null;
    this.musicHighpass = null;
    this.sfxBus = null;
    this.sfxHighpass = null;
    this.preMasterGain = null; // SFX input bus (`sfxInput`) preserved for 100% API compatibility
    this.compressor = null;    // SFX-only transient peak glue (NEVER touches `musicBus`!)
    this.masterGain = null;
    this.limiter = null;
    this.analyser = null;
    this.streamDestination = null;
    this.timeDomainFloat = null;
    this.timeDomainByte = null;

    // 65–80ms Lookahead Scheduler State
    this.lookaheadSec = LOOKAHEAD_WINDOW_SEC;
    this._schedHorizonTime = -1.0;

    // Lyria 3.5 Score Nodes (permanently locked at `playbackRate = 1.000`)
    this.lyriaBuffer = null;
    this.lyriaSource = null;
    this.lyriaFilter = null;
    this.lyriaGain = null;
    this.lyriaReadyPromise = null;
    this._lyriaDecoding = false;
    this._bloomEndAudioTime = -1.0;
    this._duckEndAudioTime = -1.0;
    this.currentLyriaCutoffHz =
      state.inGym && !state.glassShattered ? GYM_MUFFLE_CUTOFF_HZ : 20000.0;
    this.currentLyriaPlaybackRate = LOCKED_MUSIC_RATE;

    // Continuous Procedural Mechanical, Surface, Avian Feather & Slow-Mo SFX-Bus Layers
    this.noiseBuffer = null;
    this.crispNoiseBuffer = null;
    this.tireFilter = null;
    this.tireGain = null;
    this.tireHissFilter = null;
    this.tireHissGain = null;
    this.windFilter = null;
    this.windGain = null;
    this.featherRustleFilter = null;
    this.featherRustleGain = null;
    this.slowMoBloomFilter = null;
    this.slowMoBloomGain = null;
    this.trainerOsc = null;
    this.trainerHarmOsc = null;
    this.trainerHarmGain = null;
    this.trainerFilter = null;
    this.trainerGain = null;
    this.flywheelWhirFilter = null;
    this.flywheelWhirGain = null;
    this.chainWhirFilter = null;
    this.chainWhirGain = null;
    this.burnoutRubFilter = null;
    this.burnoutRubGain = null;
    this._continuousSources = [];

    this.enabled = Boolean(options.enabled ?? state.audioEnabled);
    this.initialized = false;
    this._disposed = false;
    this._gestureUnlockBound = false;
    this._onGestureHandler = null;
    this._gestureOpts = { capture: true, passive: true };
    this._busListeners = [];
    this._wasOnTrainerStand = Boolean(state.onTrainerStand);
    this._wasAirborne = Boolean(state.isAirborne);
    this._wasInSlowMo = Boolean(state.inSlowMoJump);
    this._wasInBeat2Stomp = false;
    this._wasStanRoaring = false;
    this._wasPelicanSurprised = false;
    this._wasShorelineSkidding = false;
    this._prevFlamingosScattered = Number(state.flamingosScattered) || 0;
    this._sparkTickAccum = 0.0;
    this._shudderTickAccum = 0.0;
    this._internalPedalPhaseRad = 0.0;
    this.lastPedalStrokeIdx = 0;
    this.totalPedalWhooshes = 0;
    this._nextTpuArpAudioTime = 0.0;

    // Deterministic mechanical phase accumulators
    this.pawlRad = 0.0;
    this.nextClickRad = (Math.PI * 2.0) / 18.0;
    this.lastPlankIdx = 0;
    this.lastPaverIdx = 0;
    this.totalClicksTriggered = 0;
    this.totalPlankThumps = 0;

    // Clock-rewind-safe event dedupe map
    this._dedupeAtMs = new Map();

    // Counters for deterministic Node/headless inspection
    this.sfxCounts = {
      glassShatter: 0,
      trainerShearSnap: 0,
      pedalWhoosh: 0,
      webbedFootStomp: 0,
      bell: 0,
      stanRoar: 0,
      pelicanSquawk: 0,
      billClack: 0,
      wingRuffle: 0,
      flamingoHonks: 0,
      tpuPickup: 0,
      boost: 0,
      slowMoBloom: 0,
      hop: 0,
      landing: 0,
      clusterFanfare: 0,
      shorelineSkidChirp: 0,
      shorelineCelebration: 0,
      uiClick: 0,
    };

    // Synchronously initialize WebAudio graph + real `MediaStreamAudioDestinationNode` (`this.streamDest`)
    // on Frame 0 so `window.__audioStreamDestination` is immediately available for `--audio` capture!
    this.streamDest = null;
    this._persistentStreamWrapper = null;
    this._persistentStream = null;
    this._ensureContext();
    if (typeof window !== "undefined") {
      if (this.streamDest) {
        window.__audioStreamDestination = this.streamDest;
      } else if (!window.__audioStreamDestination && typeof MediaStream === "function") {
        try {
          window.__audioStreamDestination = { stream: new MediaStream() };
        } catch (_err) {
          // Ignore if MediaStream constructor is unavailable in minimal environment
        }
      }
      if (window.__audioStreamDestination) {
        this._persistentStreamWrapper = window.__audioStreamDestination;
        this._persistentStream = window.__audioStreamDestination.stream || null;
      }
    }

    this._bindUserGestureUnlock();
    if (options.autoBindBus !== false) {
      this._bindContractBusEvents();
    }

    state.kinematics.lyriaCutoffHz = this.currentLyriaCutoffHz;
  }

  _nowPerfMs() {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
      return performance.now();
    }
    return Date.now();
  }

  _nowDedupeMs() {
    if (this.ctx && Number.isFinite(this.ctx.currentTime)) {
      return this.ctx.currentTime * 1000.0;
    }
    if (Number.isFinite(state.elapsedTime) && state.elapsedTime > 0.0) {
      return state.elapsedTime * 1000.0;
    }
    return this._nowPerfMs();
  }

  _shouldFireDedupe(key, windowMs = 35.0) {
    const nowMs = this._nowDedupeMs();
    const prev = this._dedupeAtMs.get(key);
    if (prev !== undefined && nowMs >= prev && nowMs - prev < windowMs) {
      return false;
    }
    this._dedupeAtMs.set(key, nowMs);
    return true;
  }

  /**
   * Advances the PLL-stabilized `72ms` (`65–80ms`) WebAudio lookahead clock for live `AudioContext`
   * so browser main-thread `rAF` jitter never perturbs drivetrain, tire, or pedal transient rhythm,
   * while maintaining exact `<1.4ms` frame-0 timestamp lock inside deterministic `OfflineAudioContext` renders.
   */
  _computeStepScheduleWindow(now, safeDt) {
    if (isOfflineAudioContext(this.ctx)) {
      const span = Math.min(Math.max(0.0, safeDt), 0.025);
      return { windowStart: now, windowSpan: span };
    }
    const targetHorizon = now + this.lookaheadSec;
    if (
      this._schedHorizonTime < now + 0.015 ||
      this._schedHorizonTime > now + 0.135 ||
      safeDt <= 0.0
    ) {
      this._schedHorizonTime = targetHorizon;
    }
    const windowStart = clamp(this._schedHorizonTime, now + 0.065, now + 0.080);
    const stepSpan = Math.min(Math.max(0.0, safeDt), 0.050);
    const nextRaw = windowStart + stepSpan;
    this._schedHorizonTime = nextRaw + (targetHorizon + stepSpan - nextRaw) * 0.08;
    return { windowStart, windowSpan: stepSpan };
  }

  _bindUserGestureUnlock() {
    if (this._gestureUnlockBound || typeof window === "undefined") return;
    this._gestureUnlockBound = true;
    this._onGestureHandler = () => {
      if (this._disposed) return;
      this.prewarmAndResume();
    };
    window.addEventListener("pointerdown", this._onGestureHandler, this._gestureOpts);
    window.addEventListener("touchstart", this._onGestureHandler, this._gestureOpts);
    window.addEventListener("keydown", this._onGestureHandler, this._gestureOpts);
  }

  _addBusListener(eventName, handler) {
    bus.addEventListener(eventName, handler);
    this._busListeners.push([eventName, handler]);
  }

  _bindContractBusEvents() {
    this._addBusListener(DEMO_EVENTS.AUDIO_TOGGLED, (e) => {
      if (this._disposed) return;
      const next = Boolean(e.detail?.enabled ?? state.audioEnabled);
      this.setEnabled(next);
      if (next) this.triggerUiClick();
    });

    this._addBusListener(DEMO_EVENTS.GLASS_SHATTERED, () => {
      if (this._disposed) return;
      this.playGlassShatter();
    });

    this._addBusListener(DEMO_EVENTS.BELL_RUNG, (e) => {
      if (this._disposed) return;
      const franticSurprise = Boolean(
        e.detail?.doubleRing || e.detail?.source === "script_stan_surprise"
      );
      const doubleChime = franticSurprise || e.detail?.source === "script_corral";
      this.ringBell(doubleChime, franticSurprise);
      const nearTrexFlamingos =
        Math.hypot((Number(state.playerX) || 0) - -118.0, (Number(state.playerZ) || 0) - -50.0) <=
        30.0;
      if (!franticSurprise && (doubleChime || nearTrexFlamingos)) {
        this.playFlamingoHonks(4);
      }
    });

    this._addBusListener(DEMO_EVENTS.TPU_COLLECTED, (e) => {
      if (this._disposed) return;
      const item = e.detail?.tpu;
      const idx =
        typeof item?.index === "number"
          ? item.index
          : Math.max(0, (Number(e.detail?.collectedCount) || 1) - 1);
      const tier = item?.tier || "trillium";
      this.playTpuPickup(idx, tier);
    });

    this._addBusListener(DEMO_EVENTS.BOOST_TRIGGERED, () => {
      if (this._disposed) return;
      this.playBoost();
    });

    this._addBusListener(DEMO_EVENTS.BUNNY_HOPPED, (e) => {
      if (this._disposed) return;
      const onStand = Boolean(e.detail?.onTrainerStand || state.onTrainerStand);
      const isRamp = !onStand && (Number(e.detail?.impulse) || 5.2) > 5.8;
      this.playHop(isRamp, onStand);
    });

    this._addBusListener(DEMO_EVENTS.CLUSTER_BOOTED, () => {
      if (this._disposed) return;
      this.playClusterBootFanfare();
    });

    this._addBusListener(DEMO_EVENTS.OMNI_REF_TOGGLED, () => {
      if (this._disposed) return;
      this.triggerUiClick();
    });
  }

  _ensureContext() {
    if (this._disposed) return false;
    if (this.initialized) return Boolean(this.ctx);
    this.initialized = true;

    let ctx = this._injectedCtx;
    if (!ctx && typeof window !== "undefined") {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        try {
          ctx = new AudioCtx();
        } catch (_err) {
          ctx = null;
        }
      }
    }
    if (!ctx) return false;

    try {
      this.ctx = ctx;

      // 1. V7 Dual-Bus Mastering Topology (`musicBus` + `sfxBus` -> `masterGain` -> `-1.2 dB` Ceiling Limiter)
      //    Zero shared compressor between music and SFX — loud Foley transients NEVER pump or duck `musicBus`!
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 1.0;

      this.musicHighpass = this.ctx.createBiquadFilter();
      this.musicHighpass.type = "highpass";
      this.musicHighpass.frequency.value = 38.0;
      this.musicHighpass.Q.value = 0.707;

      // `preMasterGain` serves as the SFX-only input bus (`sfxInput`)
      this.preMasterGain = this.ctx.createGain();
      this.preMasterGain.gain.value = 0.94;

      this.sfxHighpass = this.ctx.createBiquadFilter();
      this.sfxHighpass.type = "highpass";
      this.sfxHighpass.frequency.value = 30.0;
      this.sfxHighpass.Q.value = 0.707;

      // Gentle SFX-only peak ceiling (strictly isolated inside `sfxBus`; `musicBus` bypasses it completely!)
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -7.0;
      this.compressor.knee.value = 3.0;
      this.compressor.ratio.value = 5.5;
      this.compressor.attack.value = 0.002;
      this.compressor.release.value = 0.045;

      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = 0.90;

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.enabled ? 0.92 : 0.0;

      // Transparent fast lookahead brickwall safety ceiling limiter (`-1.2 dB`, `20:1`, `1ms` attack, `40ms` release)
      this.limiter = this.ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -1.2;
      this.limiter.knee.value = 0.0;
      this.limiter.ratio.value = 20.0;
      this.limiter.attack.value = 0.001;
      this.limiter.release.value = 0.04;

      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.82;
      this.timeDomainFloat = new Float32Array(this.analyser.fftSize);
      this.timeDomainByte = new Uint8Array(this.analyser.fftSize);

      // Wire SFX Bus: `preMasterGain -> sfxHighpass -> compressor -> sfxBus -> masterGain`
      this.preMasterGain.connect(this.sfxHighpass);
      this.sfxHighpass.connect(this.compressor);
      this.compressor.connect(this.sfxBus);
      this.sfxBus.connect(this.masterGain);

      // Wire Music Bus: `musicBus -> masterGain`
      this.musicBus.connect(this.masterGain);

      // Wire Master Ceiling Limiter & Output Destinations
      this.masterGain.connect(this.limiter);
      this.limiter.connect(this.analyser);
      if (this.ctx.destination) {
        this.analyser.connect(this.ctx.destination);
      }

      if (typeof this.ctx.createMediaStreamDestination === "function") {
        const streamDest = this.ctx.createMediaStreamDestination();
        this.analyser.connect(streamDest);
        this.streamDest = streamDest;
        this.streamDestination = streamDest;
        if (typeof window !== "undefined") {
          window.__audioStreamDestination = streamDest;
        }
      }

      // 2. Lyria 3.5 Environmental Lowpass Filter -> `musicHighpass` -> `lyriaGain` -> `musicBus`
      const inMuffledGym = Boolean(state.inGym && !state.glassShattered);
      this.lyriaFilter = this.ctx.createBiquadFilter();
      this.lyriaFilter.type = "lowpass";
      const initCutoff = inMuffledGym
        ? GYM_MUFFLE_CUTOFF_HZ
        : state.inSlowMoJump
          ? 1350.0
          : 20000.0;
      this.lyriaFilter.frequency.value = initCutoff;
      this.lyriaFilter.Q.value = inMuffledGym ? 0.90 : 0.82;
      this.currentLyriaCutoffHz = initCutoff;
      this.currentLyriaPlaybackRate = LOCKED_MUSIC_RATE;

      this.lyriaGain = this.ctx.createGain();
      this.lyriaGain.gain.value = inMuffledGym ? 0.58 : 0.82;

      this.lyriaFilter.connect(this.musicHighpass);
      this.musicHighpass.connect(this.lyriaGain);
      this.lyriaGain.connect(this.musicBus);

      // 3. Deterministic Seeded Noise Buffers:
      //    - `noiseBuffer`: 2.0s pink-brown organic bed for wind, tire carcass, breath, and feather rustle
      //    - `crispNoiseBuffer`: 0.5s broadband crisp impulse noise for metallic pawl clicks, striker transients, gravel hiss, and shards
      const noiseRng = createMulberry32(0x5f8a0d10);
      const sampleRate = this.ctx.sampleRate || 48000;
      const len = sampleRate * 2;
      this.noiseBuffer = this.ctx.createBuffer(1, len, sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      let b0 = 0.0;
      let b1 = 0.0;
      let b2 = 0.0;
      for (let i = 0; i < len; i++) {
        const white = noiseRng() * 2.0 - 1.0;
        b0 = 0.99765 * b0 + white * 0.099046;
        b1 = 0.96300 * b1 + white * 0.296516;
        b2 = 0.57000 * b2 + white * 1.052691;
        data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.12;
      }

      const crispLen = Math.max(1024, Math.floor(sampleRate * 0.5));
      this.crispNoiseBuffer = this.ctx.createBuffer(1, crispLen, sampleRate);
      const crispData = this.crispNoiseBuffer.getChannelData(0);
      let prevW = 0.0;
      for (let i = 0; i < crispLen; i++) {
        const w = noiseRng() * 2.0 - 1.0;
        crispData[i] = (0.65 * w + 0.35 * (w - prevW)) * 0.32;
        prevW = w;
      }

      // 3B. V8-02 Pre-Baked Deterministic Prehistoric Theropod (`T. rex`) Bio-Acoustic Assets:
      //     - `roarTanhCurve`: asymmetric vocal-fold soft-clipping saturation curve (`tanh`)
      //     - `glottalPeriodicWave`: 32-harmonic Liljencrants-Fant asymmetric glottal pulse wave (`0` clean sawtooth!)
      //     - `glottalJitterBuffer`: low-passed pink-noise pitch/amp jitter + `24 Hz` subharmonic vocal-fry roughness (`0` clean sine LFO!)
      //     - `pharyngealRaspBuffer`: flesh-and-tooth flutter-modulated brown/pink airflow buffer (`1.2–4.0 kHz` snarl)
      const curveLen = 2048;
      this.roarTanhCurve = new Float32Array(curveLen);
      for (let i = 0; i < curveLen; i++) {
        const x = (i / (curveLen - 1)) * 2.0 - 1.0;
        this.roarTanhCurve[i] = Math.tanh(2.95 * x + 0.20 * x * x) * 0.92;
      }

      if (typeof this.ctx.createPeriodicWave === "function") {
        const numHarm = 32;
        const real = new Float32Array(numHarm + 1);
        const imag = new Float32Array(numHarm + 1);
        real[0] = 0.0;
        imag[0] = 0.0;
        for (let k = 1; k <= numHarm; k++) {
          // Asymmetric LF glottal closing transient: rich low-mid energy + steep return phase skew
          const env = 1.0 / Math.pow(k, 1.12);
          const glottalSkew = 0.32 * Math.cos(k * 0.68);
          real[k] = env * glottalSkew;
          imag[k] = env * (0.94 + 0.16 * ((k % 2 === 1) ? 1.0 : -0.65));
        }
        try {
          this.glottalPeriodicWave = this.ctx.createPeriodicWave(real, imag, {
            disableNormalization: false,
          });
        } catch (_pwErr) {
          this.glottalPeriodicWave = null;
        }
      } else {
        this.glottalPeriodicWave = null;
      }

      const jitterLen = Math.max(2048, Math.floor(sampleRate * 1.6));
      this.glottalJitterBuffer = this.ctx.createBuffer(1, jitterLen, sampleRate);
      const jitterData = this.glottalJitterBuffer.getChannelData(0);
      let jPink0 = 0.0;
      let jPink1 = 0.0;
      let jLow = 0.0;
      let fryPhase = 0.0;
      const twoPi = Math.PI * 2.0;
      const lpAlpha = Math.min(0.25, (twoPi * 22.0) / sampleRate);
      for (let i = 0; i < jitterLen; i++) {
        const w = noiseRng() * 2.0 - 1.0;
        jPink0 = 0.995 * jPink0 + w * 0.12;
        jPink1 = 0.940 * jPink1 + w * 0.34;
        const pink = jPink0 + jPink1 + w * 0.14;
        jLow += lpAlpha * (pink - jLow);
        // Chaotic `24 Hz` subharmonic period-doubling vocal-fry pulse warped by stochastic turbulence
        const instFryHz = 24.0 + jLow * 9.5;
        fryPhase += (twoPi * instFryHz) / sampleRate;
        const fryRaw =
          Math.sin(fryPhase) +
          0.52 * Math.sin(fryPhase * 0.5 + 0.7) +
          0.34 * Math.cos(fryPhase * 2.0 - 0.4);
        jitterData[i] = Math.tanh(0.85 * fryRaw + 1.45 * jLow);
      }

      const raspLen = Math.max(2048, Math.floor(sampleRate * 1.55));
      this.pharyngealRaspBuffer = this.ctx.createBuffer(1, raspLen, sampleRate);
      const raspData = this.pharyngealRaspBuffer.getChannelData(0);
      let rBrown = 0.0;
      let rPink = 0.0;
      let rFlutterPhase = 0.0;
      for (let i = 0; i < raspLen; i++) {
        const w = noiseRng() * 2.0 - 1.0;
        rBrown = clamp(rBrown + w * 0.045, -1.0, 1.0) * 0.994;
        rPink = 0.92 * rPink + w * 0.28;
        const jitterMod = jitterData[i % jitterLen];
        rFlutterPhase += (twoPi * (28.0 + jitterMod * 11.0)) / sampleRate;
        const mucosalGate = 0.42 + 0.58 * Math.max(0.0, Math.tanh(1.65 * Math.sin(rFlutterPhase) + 0.95 * jitterMod));
        raspData[i] = (0.48 * rBrown + 0.38 * rPink + 0.28 * w) * mucosalGate * 0.68;
      }

      // 4A. Continuous Surface-Adaptive Tire Carcass Rolling Bed
      const tireSrc = this.ctx.createBufferSource();
      tireSrc.buffer = this.noiseBuffer;
      tireSrc.loop = true;
      this.tireFilter = this.ctx.createBiquadFilter();
      this.tireFilter.type = "lowpass";
      this.tireFilter.frequency.value = 230.0;
      this.tireFilter.Q.value = 1.05;
      this.tireGain = this.ctx.createGain();
      this.tireGain.gain.value = 0.0;
      tireSrc.connect(this.tireFilter);
      this.tireFilter.connect(this.tireGain);
      this.tireGain.connect(this.preMasterGain);
      tireSrc.start(0);

      // 4B. Continuous Surface-Proportioned Aggregate Asphalt / Stone Tire Hiss Layer
      const tireHissSrc = this.ctx.createBufferSource();
      tireHissSrc.buffer = this.crispNoiseBuffer;
      tireHissSrc.loop = true;
      this.tireHissFilter = this.ctx.createBiquadFilter();
      this.tireHissFilter.type = "bandpass";
      this.tireHissFilter.frequency.value = 1920.0;
      this.tireHissFilter.Q.value = 0.95;
      this.tireHissGain = this.ctx.createGain();
      this.tireHissGain.gain.value = 0.0;
      tireHissSrc.connect(this.tireHissFilter);
      this.tireHissFilter.connect(this.tireHissGain);
      this.tireHissGain.connect(this.preMasterGain);
      tireHissSrc.start(0);

      // 4C. Continuous Aerodynamic Coastal Wind Rush
      const windSrc = this.ctx.createBufferSource();
      windSrc.buffer = this.noiseBuffer;
      windSrc.loop = true;
      this.windFilter = this.ctx.createBiquadFilter();
      this.windFilter.type = "bandpass";
      this.windFilter.frequency.value = 980.0;
      this.windFilter.Q.value = 0.65;
      this.windGain = this.ctx.createGain();
      this.windGain.gain.value = 0.0;
      windSrc.connect(this.windFilter);
      this.windFilter.connect(this.windGain);
      this.windGain.connect(this.preMasterGain);
      windSrc.start(0);

      // 4D. Aerodynamic Wind-in-Feathers Primary Remiges Rustle (`2.5–3.9 kHz` fluttered bandpass)
      const featherSrc = this.ctx.createBufferSource();
      featherSrc.buffer = this.crispNoiseBuffer;
      featherSrc.loop = true;
      this.featherRustleFilter = this.ctx.createBiquadFilter();
      this.featherRustleFilter.type = "bandpass";
      this.featherRustleFilter.frequency.value = 2850.0;
      this.featherRustleFilter.Q.value = 1.65;
      this.featherRustleGain = this.ctx.createGain();
      this.featherRustleGain.gain.value = 0.0;
      featherSrc.connect(this.featherRustleFilter);
      this.featherRustleFilter.connect(this.featherRustleGain);
      this.featherRustleGain.connect(this.preMasterGain);
      featherSrc.start(0);

      // 4E. Dedicated SFX-Bus Slow-Mo Gentle Filter Bloom Bed (`420 -> 1720 Hz` airy halo)
      const slowMoBloomSrc = this.ctx.createBufferSource();
      slowMoBloomSrc.buffer = this.noiseBuffer;
      slowMoBloomSrc.loop = true;
      this.slowMoBloomFilter = this.ctx.createBiquadFilter();
      this.slowMoBloomFilter.type = "bandpass";
      this.slowMoBloomFilter.frequency.value = 620.0;
      this.slowMoBloomFilter.Q.value = 1.85;
      this.slowMoBloomGain = this.ctx.createGain();
      this.slowMoBloomGain.gain.value = 0.0;
      slowMoBloomSrc.connect(this.slowMoBloomFilter);
      this.slowMoBloomFilter.connect(this.slowMoBloomGain);
      this.slowMoBloomGain.connect(this.preMasterGain);
      slowMoBloomSrc.start(0);

      // 4F. Cold-Open Beat 1–3 High-Inertia Spin-Flywheel Whirr + Roller Sprint Turbine
      this.trainerOsc = this.ctx.createOscillator();
      this.trainerOsc.type = "triangle";
      this.trainerOsc.frequency.value = 62.0;

      this.trainerHarmOsc = this.ctx.createOscillator();
      this.trainerHarmOsc.type = "sawtooth";
      this.trainerHarmOsc.frequency.value = 186.0;
      this.trainerHarmGain = this.ctx.createGain();
      this.trainerHarmGain.gain.value = 0.30;

      this.trainerFilter = this.ctx.createBiquadFilter();
      this.trainerFilter.type = "bandpass";
      this.trainerFilter.frequency.value = 210.0;
      this.trainerFilter.Q.value = 2.4;
      this.trainerGain = this.ctx.createGain();
      this.trainerGain.gain.value = 0.0;
      this.trainerOsc.connect(this.trainerFilter);
      this.trainerHarmOsc.connect(this.trainerHarmGain);
      this.trainerHarmGain.connect(this.trainerFilter);
      this.trainerFilter.connect(this.trainerGain);
      this.trainerGain.connect(this.preMasterGain);
      this.trainerOsc.start(0);
      this.trainerHarmOsc.start(0);

      // Beat 1 (`0.0–1.8s`) Precision Weighted Steel Spin-Flywheel Air-Shear Whirr
      const flywheelSrc = this.ctx.createBufferSource();
      flywheelSrc.buffer = this.crispNoiseBuffer;
      flywheelSrc.loop = true;
      this.flywheelWhirFilter = this.ctx.createBiquadFilter();
      this.flywheelWhirFilter.type = "bandpass";
      this.flywheelWhirFilter.frequency.value = 1140.0;
      this.flywheelWhirFilter.Q.value = 4.2;
      this.flywheelWhirGain = this.ctx.createGain();
      this.flywheelWhirGain.gain.value = 0.0;
      flywheelSrc.connect(this.flywheelWhirFilter);
      this.flywheelWhirFilter.connect(this.flywheelWhirGain);
      this.flywheelWhirGain.connect(this.preMasterGain);
      flywheelSrc.start(0);

      // Taut Chain Roller Engagement Whir under Pedaling Torque (`36 -> 168 RPM`)
      const chainWhirSrc = this.ctx.createBufferSource();
      chainWhirSrc.buffer = this.crispNoiseBuffer;
      chainWhirSrc.loop = true;
      this.chainWhirFilter = this.ctx.createBiquadFilter();
      this.chainWhirFilter.type = "bandpass";
      this.chainWhirFilter.frequency.value = 340.0;
      this.chainWhirFilter.Q.value = 4.1;
      this.chainWhirGain = this.ctx.createGain();
      this.chainWhirGain.gain.value = 0.0;
      chainWhirSrc.connect(this.chainWhirFilter);
      this.chainWhirFilter.connect(this.chainWhirGain);
      this.chainWhirGain.connect(this.preMasterGain);
      chainWhirSrc.start(0);

      // Vulcanized Rubber Tire-on-Roller Burnout Friction Layer
      const burnoutSrc = this.ctx.createBufferSource();
      burnoutSrc.buffer = this.noiseBuffer;
      burnoutSrc.loop = true;
      this.burnoutRubFilter = this.ctx.createBiquadFilter();
      this.burnoutRubFilter.type = "bandpass";
      this.burnoutRubFilter.frequency.value = 760.0;
      this.burnoutRubFilter.Q.value = 2.9;
      this.burnoutRubGain = this.ctx.createGain();
      this.burnoutRubGain.gain.value = 0.0;
      burnoutSrc.connect(this.burnoutRubFilter);
      this.burnoutRubFilter.connect(this.burnoutRubGain);
      this.burnoutRubGain.connect(this.preMasterGain);
      burnoutSrc.start(0);

      this._continuousSources = [
        tireSrc,
        tireHissSrc,
        windSrc,
        featherSrc,
        slowMoBloomSrc,
        this.trainerOsc,
        this.trainerHarmOsc,
        flywheelSrc,
        chainWhirSrc,
        burnoutSrc,
      ];

      // Kick off asynchronous Base64 Lyria 3.5 MP3 decode & seamless 1.000x loop playback
      this.lyriaReadyPromise = this._decodeAndStartLyria();

      return true;
    } catch (_err) {
      this.ctx = null;
      return false;
    }
  }

  /**
   * Trims any trailing near-zero MP3 frame padding and applies an `8ms` raised-cosine circular boundary weld
   * directly on decoded stereo PCM channels so `AudioBufferSourceNode.loop = true` wraps with zero click.
   */
  _polishSeamlessLoopBuffer(decoded) {
    if (
      !decoded ||
      typeof decoded.getChannelData !== "function" ||
      !Number.isFinite(decoded.length) ||
      decoded.length < 4096
    ) {
      return { loopStart: 0.0, loopEnd: decoded?.duration || 0.0 };
    }
    const nCh = Math.max(1, decoded.numberOfChannels || 1);
    const channels = [];
    for (let c = 0; c < nCh; c++) {
      channels.push(decoded.getChannelData(c));
    }

    // Trim at most 2 MP3 frames (2304 samples) of decoder end-padding silence if present
    let activeLen = decoded.length;
    const minTrimmed = Math.max(4096, decoded.length - 2304);
    while (activeLen > minTrimmed) {
      let maxAbs = 0.0;
      for (let c = 0; c < nCh; c++) {
        const a = Math.abs(channels[c][activeLen - 1]);
        if (a > maxAbs) maxAbs = a;
      }
      if (maxAbs > 1.5e-4) break;
      activeLen--;
    }

    // 384-sample (~8ms @ 48kHz) raised-cosine endpoint weld between sample [activeLen - 1] and sample [0]
    const weld = Math.min(384, Math.floor(activeLen / 8));
    for (let c = 0; c < nCh; c++) {
      const ch = channels[c];
      const halfDiff = 0.5 * (ch[0] - ch[activeLen - 1]);
      for (let i = 0; i < weld; i++) {
        const w = 0.5 * (1.0 + Math.cos((Math.PI * i) / weld));
        ch[i] -= halfDiff * w;
        ch[activeLen - 1 - i] += halfDiff * w;
      }
    }

    const sr = decoded.sampleRate || 48000;
    return { loopStart: 0.0, loopEnd: activeLen / sr };
  }

  async _decodeAndStartLyria() {
    if (!this.ctx || this._disposed || this._lyriaDecoding || this.lyriaSource) {
      return Boolean(this.lyriaSource);
    }
    this._lyriaDecoding = true;
    try {
      let decoded = this._predecodedLyriaBuffer;
      if (!decoded) {
        const rawBuf = decodeLyriaScoreArrayBuffer();
        decoded = await new Promise((resolve, reject) => {
          let settled = false;
          const onOk = (buf) => {
            if (!settled) {
              settled = true;
              resolve(buf);
            }
          };
          const onErr = (err) => {
            if (!settled) {
              settled = true;
              reject(err);
            }
          };
          try {
            const maybePromise = this.ctx.decodeAudioData(rawBuf.slice(0), onOk, onErr);
            if (maybePromise && typeof maybePromise.then === "function") {
              maybePromise.then(onOk, onErr);
            }
          } catch (err) {
            onErr(err);
          }
        });
      }

      if (!decoded || !this.ctx || this._disposed || !this.lyriaFilter) {
        this._lyriaDecoding = false;
        return false;
      }

      const loopBounds = this._polishSeamlessLoopBuffer(decoded);
      this.lyriaBuffer = decoded;
      const src = this.ctx.createBufferSource();
      src.buffer = decoded;
      src.loop = true;
      if ("loopStart" in src && "loopEnd" in src && loopBounds.loopEnd > 0.5) {
        src.loopStart = loopBounds.loopStart;
        src.loopEnd = loopBounds.loopEnd;
      }
      // V7 STRICT INVARIANT: Permanently lock music `playbackRate = 1.000` (ZERO pitch or tempo warping ever!)
      if (src.playbackRate) {
        src.playbackRate.value = LOCKED_MUSIC_RATE;
      }
      src.connect(this.lyriaFilter);
      src.start(0);
      this.lyriaSource = src;
      this._lyriaDecoding = false;
      this.syncEnvironment();
      return true;
    } catch (_err) {
      this._lyriaDecoding = false;
      return false;
    }
  }

  /**
   * Initializes WebAudio graph and awaits Lyria 3.5 decode completion before `OfflineAudioContext.startRendering()`.
   */
  async initForOfflineRender() {
    this.enabled = true;
    state.audioEnabled = true;
    this._ensureContext();
    if (this.masterGain) {
      this.masterGain.gain.value = 0.92;
    }
    if (this.lyriaReadyPromise) {
      await this.lyriaReadyPromise;
    }
    return Boolean(this.ctx && this.lyriaSource);
  }

  /**
   * Stage 4 Pre-Loader helper: initializes procedural WebAudio noise/impulse buffers
   * (T. rex bio-acoustic rasp/jitter, tire/wind/feather beds, drivetrain/bell graph) and
   * awaits background Lyria 3.5 MP3 decoding into memory with zero user gesture required.
   * Never calls `ctx.resume()` and keeps `masterGain` muted (`0.0`) while `!this.enabled`.
   */
  async prewarmBuffers() {
    if (this._disposed) return false;
    try {
      if (!this.ctx) {
        this._ensureContext();
      }
      if (this.masterGain && !this.enabled) {
        this.masterGain.gain.value = 0.0;
      }
      if (this.lyriaReadyPromise) {
        const waitFn =
          (typeof window !== "undefined" && window.__nativeSetTimeout) || setTimeout;
        await Promise.race([
          Promise.resolve(this.lyriaReadyPromise).catch(() => false),
          new Promise((resolve) => waitFn(() => resolve(false), 1200)),
        ]);
      }
      return Boolean(this.ctx);
    } catch (_err) {
      return false;
    }
  }

  prewarmAndResume() {
    if (this._disposed) return;
    if (!this.ctx) this._ensureContext();
    if (this.masterGain && !this.enabled) {
      this.masterGain.gain.value = 0.0;
    }
    if (
      this.ctx &&
      !isOfflineAudioContext(this.ctx) &&
      this.ctx.state === "suspended" &&
      typeof this.ctx.resume === "function"
    ) {
      this.ctx.resume().catch(() => {});
    }
  }

  ensureResumed() {
    if (!this.enabled || this._disposed) return;
    if (!this.ctx) this._ensureContext();
    if (
      this.ctx &&
      !isOfflineAudioContext(this.ctx) &&
      this.ctx.state === "suspended" &&
      typeof this.ctx.resume === "function"
    ) {
      this.ctx.resume().catch(() => {});
    }
  }

  setEnabled(enabled) {
    if (this._disposed) return;
    this.enabled = Boolean(enabled);
    state.audioEnabled = this.enabled;
    if (this.enabled) {
      this._ensureContext();
      this.ensureResumed();
    }
    if (this.masterGain && this.ctx) {
      const now = this.ctx.currentTime;
      setTargetAt(this.masterGain.gain, this.enabled ? 0.92 : 0.0, now, 0.028);
    }
  }

  getLyriaCutoffHz() {
    return this.currentLyriaCutoffHz;
  }

  getScoreBpm() {
    return LYRIA_SCORE_BPM;
  }

  /**
   * Updates environmental EQ on `musicBus` (`520 Hz` indoor gym muffle -> `20000 Hz` sunlit campus,
   * `18500 Hz` Espresso boost presence, `1350 Hz` raised-cosine apex filter contour) AND drives
   * dedicated `sfxBus` slow-mo filter bloom while keeping `lyriaSource.playbackRate` permanently locked at `1.000`!
   */
  syncEnvironment() {
    const inMuffledGym = Boolean(state.inGym && !state.glassShattered);
    const inSlowMo = Boolean(state.inSlowMoJump);
    const inEspressoBoost =
      !inMuffledGym && !inSlowMo && (Number(state.boostRemainingSec) || 0.0) > 0.01;

    let targetCutoff = 20000.0;
    let targetQ = 0.82;
    let targetGain = 0.82;
    let slowMoApex = 0.0;

    if (inMuffledGym) {
      targetCutoff = GYM_MUFFLE_CUTOFF_HZ;
      targetQ = 0.90;
      targetGain = 0.58;
    } else if (inSlowMo) {
      if (state.gameMode === "story_autopilot") {
        const uSm = clamp(((Number(state.sequenceTime) || 56.55) - 54.85) / 3.40, 0.0, 1.0);
        slowMoApex = 0.5 - 0.5 * Math.cos(2.0 * Math.PI * uSm);
      } else {
        slowMoApex = clamp((Number(state.kinematics?.jumpHeightM) || 0.55) / 1.45, 0.25, 1.0);
      }
      targetCutoff = 20000.0 * Math.pow(1350.0 / 20000.0, slowMoApex);
      targetQ = 0.85 + 0.22 * slowMoApex;
      targetGain = 0.82; // Constant musicBus gain — zero ducking!
    } else if (inEspressoBoost) {
      targetCutoff = 18500.0;
      targetQ = 1.22;
      targetGain = 0.82; // Constant musicBus gain — zero speed/pitch warp!
    }

    this.currentLyriaCutoffHz = targetCutoff;
    this.currentLyriaPlaybackRate = LOCKED_MUSIC_RATE;
    state.kinematics.lyriaCutoffHz = targetCutoff;

    // Trigger dedicated SFX-bus slow-mo sub-drop + airy harmonic shimmer on slow-mo entry
    const enteredSlowMo = !this._wasInSlowMo && inSlowMo;
    this._wasInSlowMo = inSlowMo;
    if (enteredSlowMo) {
      this._playSlowMoApexLayer();
    }

    if (!this.ctx || !this.lyriaFilter || !this.lyriaGain) return;
    const now = this.ctx.currentTime;

    if (now >= this._bloomEndAudioTime) {
      setTargetAt(this.lyriaFilter.frequency, safeExpVal(targetCutoff), now, 0.048);
      setTargetAt(this.lyriaFilter.Q, targetQ, now, 0.048);
    }
    setTargetAt(this.lyriaGain.gain, targetGain, now, 0.055);

    // Permanently lock `playbackRate = 1.000` (never warp music pitch or tempo!)
    if (this.lyriaSource && this.lyriaSource.playbackRate) {
      this.lyriaSource.playbackRate.value = LOCKED_MUSIC_RATE;
    }

    // Continuous SFX-bus gentle filter bloom halo across Bay View slow-mo jump apex
    if (this.slowMoBloomFilter && this.slowMoBloomGain) {
      if (inSlowMo && slowMoApex > 0.01) {
        setTargetAt(
          this.slowMoBloomFilter.frequency,
          440.0 + 1280.0 * slowMoApex,
          now,
          0.045
        );
        setTargetAt(this.slowMoBloomFilter.Q, 1.6 + 1.1 * slowMoApex, now, 0.045);
        setTargetAt(this.slowMoBloomGain.gain, 0.085 * slowMoApex, now, 0.045);
      } else {
        setTargetAt(this.slowMoBloomGain.gain, 0.0, now, 0.05);
      }
    }
  }

  /**
   * Dedicated SFX-Bus Bay View Slow-Mo Jump Apex Sound-Design Layer (`_playSlowMoApexLayer`):
   *   1. Warm sub-bass drop (`94 Hz -> 38 Hz` velvet sine weight)
   *   2. Airy `Cmaj9#11` crystalline harmonic shimmer (`B5, E6, F#6, B6` twin-detuned halo)
   *   3. Swept airy filter bloom (`460 -> 1780 -> 620 Hz`), with `0` touch to music pitch or tempo!
   */
  _playSlowMoApexLayer() {
    if (this._disposed) return;
    if (!this._shouldFireDedupe("slow_mo_bloom", 400.0)) return;
    this.sfxCounts.slowMoBloom++;

    if (!this.enabled) return;
    if (!this.ctx) this._ensureContext();
    this.ensureResumed();
    if (!this.ctx || !this.preMasterGain) return;

    const now = this.ctx.currentTime;

    // 1. Warm Sub-Bass Gravity Drop (`94 Hz -> 38 Hz` over `0.92s`)
    {
      const subOsc = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();
      subOsc.type = "sine";
      setParamAt(subOsc.frequency, 94.0, now);
      expRampParam(subOsc.frequency, 38.0, now + 0.92);

      setParamAt(subGain.gain, MIN_EXP_VAL, now);
      linRampParam(subGain.gain, 0.20, now + 0.045);
      expRampParam(subGain.gain, MIN_EXP_VAL, now + 1.05);

      subOsc.connect(subGain);
      subGain.connect(this.preMasterGain);
      subOsc.start(now);
      subOsc.stop(now + 1.08);
    }

    // 2. Airy `Cmaj9#11` Harmonic Shimmer (`B5, E6, F#6, B6`) blooming across apex
    const shimmerHz = [987.77, 1318.51, 1479.98, 1975.53];
    for (let i = 0; i < shimmerHz.length; i++) {
      const t0 = now + 0.06 + i * 0.065;
      const dur = 1.65 - i * 0.12;
      const oscA = this.ctx.createOscillator();
      const oscB = this.ctx.createOscillator();
      const lp = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();

      oscA.type = "sine";
      oscB.type = "triangle";
      setParamAt(oscA.frequency, safeExpVal(shimmerHz[i] * 0.998), t0);
      setParamAt(oscB.frequency, safeExpVal(shimmerHz[i] * 1.0025), t0);

      lp.type = "lowpass";
      setParamAt(lp.frequency, 900.0, t0);
      expRampParam(lp.frequency, 4200.0, t0 + dur * 0.45);
      expRampParam(lp.frequency, 1150.0, t0 + dur);

      const peak = 0.036 * Math.pow(0.88, i);
      setParamAt(g.gain, MIN_EXP_VAL, t0);
      linRampParam(g.gain, safeExpVal(peak), t0 + 0.18);
      expRampParam(g.gain, MIN_EXP_VAL, t0 + dur);

      const trimB = this.ctx.createGain();
      trimB.gain.value = 0.45;
      oscA.connect(lp);
      oscB.connect(trimB);
      trimB.connect(lp);
      lp.connect(g);
      g.connect(this.preMasterGain);

      oscA.start(t0);
      oscB.start(t0);
      oscA.stop(t0 + dur + 0.02);
      oscB.stop(t0 + dur + 0.02);
    }
  }

  /**
   * Returns instantaneous master RMS level in dBFS (`[-60.0, 0.0]`) from `AnalyserNode`.
   */
  getRmsDb() {
    if (
      !this.enabled ||
      !this.ctx ||
      !this.analyser ||
      (!isOfflineAudioContext(this.ctx) && this.ctx.state !== "running")
    ) {
      return -60.0;
    }
    try {
      let sumSq = 0.0;
      const n = this.analyser.fftSize;
      if (typeof this.analyser.getFloatTimeDomainData === "function" && this.timeDomainFloat) {
        this.analyser.getFloatTimeDomainData(this.timeDomainFloat);
        for (let i = 0; i < n; i++) {
          const s = this.timeDomainFloat[i];
          sumSq += s * s;
        }
      } else if (this.timeDomainByte) {
        this.analyser.getByteTimeDomainData(this.timeDomainByte);
        for (let i = 0; i < n; i++) {
          const s = (this.timeDomainByte[i] - 128.0) / 128.0;
          sumSq += s * s;
        }
      }
      const rms = Math.sqrt(sumSq / Math.max(1, n));
      if (!Number.isFinite(rms) || rms <= 1e-3) return -60.0;
      return clamp(20.0 * Math.log10(rms), -60.0, 0.0);
    } catch (_err) {
      return -60.0;
    }
  }

  resetPhases() {
    this.pawlRad = 0.0;
    this.nextClickRad = (Math.PI * 2.0) / 18.0;
    this.lastPlankIdx = 0;
    this.lastPaverIdx = 0;
    this._sparkTickAccum = 0.0;
    this._shudderTickAccum = 0.0;
    this._internalPedalPhaseRad = 0.0;
    this.lastPedalStrokeIdx = 0;
    this._nextTpuArpAudioTime = 0.0;
    this._schedHorizonTime = -1.0;
    this._prevFlamingosScattered = 0;
    this._wasStanRoaring = false;
    this._wasPelicanSurprised = false;
    this._wasShorelineSkidding = false;
    this._wasInSlowMo = false;
    this._wasInBeat2Stomp = false;
    this._dedupeAtMs.clear();
  }

  syncMechanicalTo(wheelRad = 0.0, arcDistanceM = 0.0, plankPitchM = CLIP5_PLANK_PITCH_M) {
    const step = (Math.PI * 2.0) / 18.0;
    const safeWheel = Math.max(0.0, Number(wheelRad) || 0.0);
    const pitch = Math.max(0.1, Number(plankPitchM) || CLIP5_PLANK_PITCH_M);
    this.pawlRad = safeWheel;
    this.nextClickRad = (Math.floor(safeWheel / step) + 1) * step;
    this.lastPlankIdx = Math.floor((Number(arcDistanceM) || 0.0) / pitch);
    this.lastPaverIdx = Math.floor((Number(arcDistanceM) || 0.0) / 0.65);
    const extPhase = Number(state.kinematics?.pedalPhaseRad ?? state.kinematics?.crankRad);
    this._internalPedalPhaseRad = Number.isFinite(extPhase) && extPhase >= 0.0 ? extPhase : 0.0;
    this.lastPedalStrokeIdx = Math.floor(this._internalPedalPhaseRad / Math.PI);
    this._nextTpuArpAudioTime = 0.0;
    this._schedHorizonTime = -1.0;
    this._wasStanRoaring = (Number(state.kinematics?.stanRoarIntensity) || 0) > 0.05;
    this._wasPelicanSurprised = (Number(state.kinematics?.pelicanSurprisePhase) || 0) > 0.05;
    this._wasShorelineSkidding = (Number(state.kinematics?.shorelineSkidIntensity) || 0) > 0.06;
    this._wasInSlowMo = Boolean(state.inSlowMoJump);
    this._wasInBeat2Stomp = false;
    this._dedupeAtMs.clear();
    this.syncEnvironment();
  }

  /**
   * Lookahead-scheduled physical mechanical, surface, avian & cold-open Foley step (`stepMechanical` / `update`).
   */
  stepMechanical(
    dt,
    {
      speedMps = 0.0,
      omegaWheel = 0.0,
      cadenceRpm = 0.0,
      trainerCadenceRpm = undefined,
      pedalPhaseRad = undefined,
      trainerFrameShudderM = undefined,
      isCoasting = false,
      coastFactor = 1.0,
      surfaceType = "asphalt",
      arcDistanceM = 0.0,
      plankPitchM = CLIP5_PLANK_PITCH_M,
      onTrainerStand = state.onTrainerStand,
      isAirborne = state.isAirborne,
      trainerSparkIntensity = 0.0,
      burnoutSmokeIntensity = undefined,
      peelOutBurstIntensity = 0.0,
      shorelineSkidIntensity = undefined,
      verticalVelMps = 0.0,
      timeScale = undefined,
    } = {}
  ) {
    if (this._disposed) return;
    const safeDt = Math.max(0.0, Number.isFinite(Number(dt)) ? Number(dt) : 0.0);
    const inSlowMo = Boolean(state.inSlowMoJump);
    const mechTimeScale = inSlowMo
      ? Number.isFinite(Number(timeScale)) && Number(timeScale) > 0.0
        ? Number(timeScale)
        : 0.25
      : 1.0;
    const stepStep = (Math.PI * 2.0) / 18.0;
    const safeOmega = Math.max(0.0, Number.isFinite(Number(omegaWheel)) ? Number(omegaWheel) : 0.0);
    const effCoast = clamp(Number.isFinite(Number(coastFactor)) ? Number(coastFactor) : 1.0, 0.0, 1.0);

    // Freehub pawls ONLY overrun & click while coasting (`coastFactor < 0.5`), NEVER while pedaling or on stand!
    const pawlsOverrunning = !onTrainerStand && (Boolean(isCoasting) || effCoast < 0.5);
    const prevPawlRad = this.pawlRad;
    const deltaPawlRad = safeOmega * safeDt * mechTimeScale;
    this.pawlRad += deltaPawlRad;

    const clickFractions = [];
    while (this.pawlRad >= this.nextClickRad) {
      const crossedAtRad = this.nextClickRad;
      this.nextClickRad += stepStep;
      if (pawlsOverrunning) {
        this.totalClicksTriggered++;
        if (clickFractions.length < 6) {
          const frac =
            deltaPawlRad > 1e-6 ? clamp((crossedAtRad - prevPawlRad) / deltaPawlRad, 0.0, 0.98) : 0.0;
          clickFractions.push(frac);
        }
      }
    }

    const grounded = !onTrainerStand && !isAirborne;
    const pitch = Math.max(0.1, Number(plankPitchM) || CLIP5_PLANK_PITCH_M);
    const safeArc = Number.isFinite(Number(arcDistanceM)) ? Number(arcDistanceM) : 0.0;
    const plankIdx = Math.floor(safeArc / pitch);
    const crossedPlank =
      grounded && surfaceType === "wood_planks" && plankIdx !== this.lastPlankIdx;
    this.lastPlankIdx = plankIdx;
    if (crossedPlank) this.totalPlankThumps++;

    const paverIdx = Math.floor(safeArc / 0.65);
    const crossedPaver = grounded && surfaceType === "pavers" && paverIdx !== this.lastPaverIdx;
    this.lastPaverIdx = paverIdx;

    // Detect Cold-Open `7.40s` latch shear snap, `40.20s` Stan T-Rex Roar, `40.32s` Pelican startle, ramp/hop & landing
    const poppedOffTrainer = this._wasOnTrainerStand && !onTrainerStand;
    const stanRoarNow = (Number(state.kinematics?.stanRoarIntensity) || 0.0) > 0.05;
    const pelicanSurpriseNow = (Number(state.kinematics?.pelicanSurprisePhase) || 0.0) > 0.05;
    const triggeredStanRoar = !this._wasStanRoaring && stanRoarNow;
    const triggeredPelicanSurprise = !this._wasPelicanSurprised && pelicanSurpriseNow;
    const inSurpriseWheelie =
      pelicanSurpriseNow || (Number(state.kinematics?.wheeliePitchRad) || 0.0) > 0.002;

    const launchedAir =
      !this._wasAirborne && Boolean(isAirborne) && !onTrainerStand && !poppedOffTrainer;
    const landedFromAir = this._wasAirborne && !isAirborne && !onTrainerStand;
    this._wasOnTrainerStand = Boolean(onTrainerStand);
    this._wasAirborne = Boolean(isAirborne);
    this._wasStanRoaring = stanRoarNow;
    this._wasPelicanSurprised = pelicanSurpriseNow;

    this.syncEnvironment();

    if (poppedOffTrainer) {
      this._playTrainerPopOff();
    }
    if (triggeredStanRoar) {
      this.playStanTrexRoar(1.0);
    }
    if (triggeredPelicanSurprise) {
      this.playPelicanStartledSquawk();
    }
    if (launchedAir && !inSurpriseWheelie) {
      this.playHop(inSlowMo);
    }
    if (landedFromAir) {
      this.playLanding(clamp(Math.abs(Number(verticalVelMps) || 0.0) / 4.2, 0.35, 1.35));
    }

    const curFlamingos = Number(state.flamingosScattered) || 0;
    if (curFlamingos > (this._prevFlamingosScattered || 0)) {
      this._prevFlamingosScattered = curFlamingos;
      this.playFlamingoHonks(4);
    } else if (curFlamingos < (this._prevFlamingosScattered || 0)) {
      this._prevFlamingosScattered = curFlamingos;
    }

    if (!this.enabled) {
      state.kinematics.audioRmsDb = -60.0;
      return;
    }
    if (!this.ctx) this._ensureContext();
    this.ensureResumed();
    if (
      !this.ctx ||
      (!isOfflineAudioContext(this.ctx) && this.ctx.state !== "running") ||
      !this.preMasterGain
    ) {
      state.kinematics.audioRmsDb = -60.0;
      return;
    }

    const now = this.ctx.currentTime;
    const { windowStart, windowSpan } = this._computeStepScheduleWindow(now, safeDt);
    const safeSpeed = Number.isFinite(Number(speedMps)) ? Math.abs(Number(speedMps)) : 0.0;
    const speedFactor = clamp(safeSpeed / 5.0, 0.0, 1.75);

    // Cold-open sequence beat phase (`0.0–1.8s` Beat 1 spin-flywheel -> `1.8–4.4s` Beat 2 webbed-foot stomp -> `4.4–7.4s` Beat 3 sprint)
    const seqT = Number.isFinite(Number(state.sequenceTime)) ? Number(state.sequenceTime) : -1.0;
    const isAutopilotColdOpen = Boolean(onTrainerStand && state.gameMode === "story_autopilot" && seqT >= 0.0);
    const inColdOpenBeat1 = isAutopilotColdOpen && seqT < 1.80;
    const inColdOpenBeat2 = isAutopilotColdOpen && seqT >= 1.80 && seqT < 4.40;

    // Trigger signature Beat 2 (`1.80s`) reveal webbed-foot stomp onto aluminum pedal cage!
    const enteredBeat2 = !this._wasInBeat2Stomp && inColdOpenBeat2;
    this._wasInBeat2Stomp = inColdOpenBeat2;
    if (enteredBeat2) {
      this._triggerWebbedFootPedalStomp(windowStart, 1.0, 0);
    }

    const rawBurnout =
      burnoutSmokeIntensity !== undefined ? burnoutSmokeIntensity : trainerSparkIntensity;
    const safeBurnout = clamp(Number.isFinite(Number(rawBurnout)) ? Number(rawBurnout) : 0.0, 0.0, 1.3);
    const safePeel = clamp(
      Number.isFinite(Number(peelOutBurstIntensity)) ? Number(peelOutBurstIntensity) : 0.0,
      0.0,
      1.3
    );
    const rawShoreSkid =
      shorelineSkidIntensity !== undefined
        ? shorelineSkidIntensity
        : state.kinematics?.shorelineSkidIntensity;
    const safeShoreSkid = clamp(
      Number.isFinite(Number(rawShoreSkid)) ? Number(rawShoreSkid) : 0.0,
      0.0,
      1.3
    );
    const shoreSkidActiveNow = safeShoreSkid > 0.06;
    if (!this._wasShorelineSkidding && shoreSkidActiveNow) {
      this._wasShorelineSkidding = true;
      this._playShorelineWhipSkidChirp(windowStart, safeShoreSkid);
    } else if (this._wasShorelineSkidding && safeShoreSkid <= 0.025) {
      this._wasShorelineSkidding = false;
      this.playShorelineCelebrationFlourish(windowStart);
    }
    const effCadenceRpm =
      Number(cadenceRpm) > 1.0
        ? Number(cadenceRpm)
        : (safeOmega * 30.0) / Math.PI / 2.85;
    const effTrainerRpm =
      Number.isFinite(Number(trainerCadenceRpm)) && Number(trainerCadenceRpm) > 1.0
        ? Number(trainerCadenceRpm)
        : Number(state.kinematics?.trainerCadenceRpm) > 1.0
          ? Number(state.kinematics.trainerCadenceRpm)
          : effCadenceRpm;
    const uTrainerRpm = clamp((effTrainerRpm - 36.0) / (168.0 - 36.0), 0.0, 1.08);
    const effShudderM = Number.isFinite(Number(trainerFrameShudderM))
      ? Math.abs(Number(trainerFrameShudderM))
      : Math.abs(Number(state.kinematics?.trainerFrameShudderM) || 0.0);

    // 1. Lookahead-Scheduled Crank Downstrokes: Beat 2 Webbed-Foot Stomps (`1.8–4.4s`) & Beat 3 Sprint Whooshes (`4.4–7.4s`)
    const prevPedalPhase = this._internalPedalPhaseRad;
    const extPedalPhase = Number.isFinite(Number(pedalPhaseRad))
      ? Number(pedalPhaseRad)
      : Number(state.kinematics?.pedalPhaseRad ?? state.kinematics?.crankRad);
    if (Number.isFinite(extPedalPhase) && extPedalPhase >= 0.0) {
      this._internalPedalPhaseRad = extPedalPhase;
    } else if (safeDt > 0.0) {
      const activeRpm = onTrainerStand ? effTrainerRpm : effCadenceRpm;
      this._internalPedalPhaseRad +=
        ((Math.max(0.0, activeRpm) * Math.PI * 2.0) / 60.0) * safeDt * mechTimeScale;
    }
    const deltaPedalPhase = Math.max(0.0, this._internalPedalPhaseRad - prevPedalPhase);
    const curStrokeIdx = Math.floor(this._internalPedalPhaseRad / Math.PI);

    if (curStrokeIdx < this.lastPedalStrokeIdx) {
      this.lastPedalStrokeIdx = curStrokeIdx;
    } else if (curStrokeIdx > this.lastPedalStrokeIdx) {
      const prevIdx = this.lastPedalStrokeIdx;
      const strokesCrossed = curStrokeIdx - prevIdx;
      this.lastPedalStrokeIdx = curStrokeIdx;

      if (!inColdOpenBeat1 && strokesCrossed <= 4) {
        const firstCrossRad = (prevIdx + 1) * Math.PI;
        const strokeFrac =
          deltaPedalPhase > 1e-5
            ? clamp((firstCrossRad - prevPedalPhase) / deltaPedalPhase, 0.0, 0.95)
            : 0.0;
        const tStroke = windowStart + strokeFrac * windowSpan;

        if (inColdOpenBeat2 || (onTrainerStand && !isAutopilotColdOpen && effTrainerRpm < 64.0)) {
          // Beat 2 (`1.8–4.4s`): Heavy rubbery webbed-foot stomp onto pedal + subtle air movement
          this._triggerWebbedFootPedalStomp(tStroke, 0.88, curStrokeIdx & 1);
          this._triggerPedalStrokeWhoosh(tStroke + 0.012, clamp(uTrainerRpm, 0.0, 0.35), curStrokeIdx & 1, true);
        } else {
          const shouldWhoosh =
            (onTrainerStand && effTrainerRpm >= 32.0) ||
            (!onTrainerStand && !isAirborne && !pawlsOverrunning && effCadenceRpm >= 86.0);
          if (shouldWhoosh) {
            const uWhoosh = onTrainerStand
              ? clamp(uTrainerRpm, 0.0, 1.0)
              : clamp((effCadenceRpm - 60.0) / 108.0, 0.0, 1.0);
            this._triggerPedalStrokeWhoosh(tStroke, uWhoosh, curStrokeIdx & 1, onTrainerStand);
          }
        }
      }
    }

    // 2. Cold-Open Beat 1 Spin-Flywheel Inertia Whirr (`0.0–1.8s`) -> Beat 3 (`4.4–7.4s`) `36 -> 168 RPM` Roller Sprint
    if (this.trainerGain && this.trainerOsc && this.trainerFilter) {
      if (onTrainerStand) {
        // In Beat 1 (`0.0–1.8s`), weighted flywheel spins smoothly at crisp high inertia before heavy torque mash
        const beat1FlywheelBoost = inColdOpenBeat1 ? 0.38 : 0.0;
        const effRollerNorm = Math.max(uTrainerRpm, beat1FlywheelBoost);
        const baseRollerHz = 62.0 + effRollerNorm * 204.0;
        setTargetAt(this.trainerOsc.frequency, baseRollerHz, now, 0.032);
        if (this.trainerHarmOsc) {
          setTargetAt(this.trainerHarmOsc.frequency, baseRollerHz * 3.0, now, 0.032);
        }
        if (this.trainerHarmGain) {
          setTargetAt(this.trainerHarmGain.gain, 0.22 + effRollerNorm * 0.40, now, 0.035);
        }
        setTargetAt(this.trainerFilter.frequency, 210.0 + effRollerNorm * 1030.0, now, 0.032);
        setTargetAt(this.trainerFilter.Q, 2.2 + effRollerNorm * 1.35, now, 0.035);
        setTargetAt(
          this.trainerGain.gain,
          inColdOpenBeat1 ? 0.068 : 0.044 + uTrainerRpm * 0.094,
          now,
          0.032
        );

        if (this.flywheelWhirFilter && this.flywheelWhirGain) {
          const fwHz = inColdOpenBeat1 ? 1180.0 : 880.0 + uTrainerRpm * 1120.0;
          const fwAmp = inColdOpenBeat1 ? 0.036 : 0.014 + uTrainerRpm * 0.032;
          setTargetAt(this.flywheelWhirFilter.frequency, fwHz, now, 0.035);
          setTargetAt(this.flywheelWhirGain.gain, fwAmp, now, 0.035);
        }

        if (safeBurnout > 0.14) {
          this._sparkTickAccum += safeDt * (6.5 + safeBurnout * 13.0 + uTrainerRpm * 10.0);
          if (this._sparkTickAccum >= 1.0) {
            const frac = clamp(1.0 - (this._sparkTickAccum % 1.0), 0.0, 0.95);
            this._sparkTickAccum %= 1.0;
            this._triggerTrainerSparkTick(windowStart + frac * windowSpan, safeBurnout, uTrainerRpm);
          }
        }

        if (effShudderM > 0.00018 || uTrainerRpm > 0.72) {
          const shudderNorm = clamp(
            Math.max(effShudderM / 0.0034, (uTrainerRpm - 0.72) / 0.28),
            0.0,
            1.0
          );
          this._shudderTickAccum += safeDt * (14.0 + shudderNorm * 24.0);
          if (this._shudderTickAccum >= 1.0) {
            const frac = clamp(1.0 - (this._shudderTickAccum % 1.0), 0.0, 0.95);
            this._shudderTickAccum %= 1.0;
            this._triggerTrainerShudderRattle(windowStart + frac * windowSpan, shudderNorm);
          }
        }
      } else {
        setTargetAt(this.trainerGain.gain, 0.0, now, 0.03);
        if (this.flywheelWhirGain) {
          setTargetAt(this.flywheelWhirGain.gain, 0.0, now, 0.03);
        }
      }
    }

    // 3. Quiet Taut Chain Roller Engagement under Pedaling Torque (vs 0.0 when coasting)
    if (this.chainWhirFilter && this.chainWhirGain) {
      const pedalingActive = onTrainerStand || (!pawlsOverrunning && effCadenceRpm > 12.0);
      if (pedalingActive) {
        const rpmRef = onTrainerStand ? effTrainerRpm : effCadenceRpm;
        const uChain = clamp((rpmRef - 34.0) / 134.0, 0.0, 1.12);
        const chainHz = 320.0 + uChain * 1380.0;
        const chainAmp = onTrainerStand
          ? 0.015 + uChain * 0.046
          : (0.009 + uChain * 0.018) * (inSlowMo ? 0.55 : 1.0);
        setTargetAt(this.chainWhirFilter.frequency, chainHz, now, 0.032);
        setTargetAt(this.chainWhirFilter.Q, 3.8 + uChain * 1.1, now, 0.035);
        setTargetAt(this.chainWhirGain.gain, chainAmp, now, 0.032);
      } else {
        setTargetAt(this.chainWhirGain.gain, 0.0, now, 0.035);
      }
    }

    // 4. Vulcanized Rubber Burnout, Peel-Out & Wave 4 Shoreline Whip-Skid Friction
    if (this.burnoutRubFilter && this.burnoutRubGain) {
      const rubActive = Math.max(
        onTrainerStand ? safeBurnout * (0.35 + 0.65 * uTrainerRpm) : 0.0,
        safePeel * 0.96,
        safeShoreSkid * 0.94
      );
      if (rubActive > 0.025) {
        const rubHz =
          safeShoreSkid > 0.05
            ? 880.0 + safeShoreSkid * 620.0 + safeSpeed * 55.0
            : 780.0 + uTrainerRpm * 740.0 + rubActive * 420.0 + safePeel * 260.0;
        setTargetAt(this.burnoutRubFilter.frequency, rubHz, now, 0.030);
        setTargetAt(
          this.burnoutRubFilter.Q,
          safeShoreSkid > 0.05 ? 3.8 + safeShoreSkid * 1.4 : 3.1 + rubActive * 1.25,
          now,
          0.032
        );
        setTargetAt(this.burnoutRubGain.gain, 0.026 + rubActive * 0.088, now, 0.028);
      } else {
        setTargetAt(this.burnoutRubGain.gain, 0.0, now, 0.04);
      }
    }

    // 5. Surface-Proportioned Dual-Layer Tire Rolling Texture (Carcass Roll + Aggregate Asphalt/Paver/Timber Hiss)
    let targetTireCutoff = 235.0;
    let tireLevel = grounded ? 0.056 * speedFactor : 0.0;
    let targetHissHz = 1950.0;
    let targetHissQ = 0.95;
    let tireHissLevel = grounded ? 0.022 * Math.pow(speedFactor, 1.15) : 0.0;

    if (surfaceType === "pavers") {
      targetTireCutoff = 335.0;
      tireLevel = grounded ? 0.068 * speedFactor : 0.0;
      targetHissHz = 1420.0;
      targetHissQ = 1.45;
      tireHissLevel = grounded ? 0.018 * speedFactor : 0.0;
    } else if (surfaceType === "wood_planks") {
      targetTireCutoff = 180.0;
      tireLevel = grounded ? 0.082 * speedFactor : 0.0;
      targetHissHz = 720.0;
      targetHissQ = 1.80;
      tireHissLevel = grounded ? 0.014 * speedFactor : 0.0;
    } else if (surfaceType === "concrete") {
      targetTireCutoff = 210.0;
      tireLevel = grounded ? 0.048 * speedFactor : 0.0;
      targetHissHz = 1220.0;
      targetHissQ = 1.10;
      tireHissLevel = grounded ? 0.011 * speedFactor : 0.0;
    }
    if (safeShoreSkid > 0.03) {
      // Fine granite/basalt aggregate grit rasp under locked lateral rear tire slide (`67.85s -> 68.85s`)
      targetHissHz = Math.max(targetHissHz, 2380.0 + safeShoreSkid * 480.0);
      targetHissQ = Math.max(targetHissQ, 1.65);
      tireHissLevel = Math.max(tireHissLevel, 0.054 * safeShoreSkid);
      tireLevel = Math.max(tireLevel, 0.062 * safeShoreSkid);
    }
    setTargetAt(this.tireFilter.frequency, Math.max(40.0, targetTireCutoff), now, 0.04);
    setTargetAt(this.tireGain.gain, tireLevel, now, 0.04);
    if (this.tireHissFilter && this.tireHissGain) {
      setTargetAt(
        this.tireHissFilter.frequency,
        targetHissHz + speedFactor * 240.0,
        now,
        0.04
      );
      setTargetAt(this.tireHissFilter.Q, targetHissQ, now, 0.04);
      setTargetAt(this.tireHissGain.gain, tireHissLevel, now, 0.04);
    }

    // 6. Aerodynamic Coastal Wind + Primary-Feather Rustle (`featherRustleFilter`)
    const windFactor = onTrainerStand ? 0.0 : speedFactor * (isAirborne ? 1.28 : 1.0);
    if (inSlowMo && isAirborne) {
      setTargetAt(this.windFilter.frequency, 660.0, now, 0.045);
      setTargetAt(this.windFilter.Q, 1.35, now, 0.045);
      setTargetAt(this.windGain.gain, 0.115, now, 0.045);
    } else {
      const windLevel = 0.022 * Math.pow(windFactor, 1.45);
      setTargetAt(
        this.windFilter.frequency,
        Math.max(200.0, 680.0 + windFactor * 460.0),
        now,
        0.05
      );
      setTargetAt(this.windFilter.Q, 0.65, now, 0.05);
      setTargetAt(this.windGain.gain, windLevel, now, 0.05);
    }

    if (this.featherRustleFilter && this.featherRustleGain) {
      const celWingBlend = clamp(Number(state.kinematics?.celebrationDismountBlend) || 0.0, 0.0, 1.0);
      const celWaveEnv =
        celWingBlend > 0.05
          ? 0.012 * celWingBlend * (0.50 + 0.50 * Math.abs(Math.cos(now * Math.PI * 2.0 * 0.90)))
          : 0.0;
      const flutterMod = 1.0 + 0.16 * Math.sin(now * 47.0); // ~7.5 Hz remiges aero-flutter
      const featherLevel =
        onTrainerStand
          ? 0.0
          : Math.max(
              celWaveEnv,
              (inSlowMo && isAirborne
                ? 0.024
                : 0.011 * Math.pow(Math.max(0.0, windFactor - 0.22), 1.35)) * flutterMod
            );
      setTargetAt(
        this.featherRustleFilter.frequency,
        2650.0 + windFactor * 680.0 + celWingBlend * 320.0,
        now,
        0.045
      );
      setTargetAt(this.featherRustleGain.gain, featherLevel, now, 0.045);
    }

    // 7. Lookahead-Scheduled Multi-Transient `18T` Freehub Pawl Clicks & Surface Joint Transients
    if (clickFractions.length > 0 && pawlsOverrunning) {
      const coastDepth = clamp((0.5 - effCoast) / 0.5, 0.25, 1.0);
      const clickAmp = clamp((0.46 + speedFactor * 0.36) * (0.75 + 0.52 * coastDepth), 0.32, 1.25);
      for (let i = 0; i < clickFractions.length; i++) {
        const tClick = windowStart + clickFractions[i] * windowSpan;
        this._triggerRatchetClick(tClick, clickAmp, inSlowMo);
      }
    }
    if (crossedPlank) {
      this._triggerWoodPlankThump(windowStart + 0.25 * windowSpan, Math.max(0.55, speedFactor));
    } else if (crossedPaver) {
      this._triggerPaverTick(
        windowStart + 0.25 * windowSpan,
        Math.max(0.45, speedFactor),
        Math.max(1.8, safeSpeed)
      );
    }

    state.kinematics.audioRmsDb = this.getRmsDb();
  }

  update(dt, opts = {}) {
    return this.stepMechanical(dt, opts);
  }

  /**
   * Multi-Transient Physical `18T` Freehub Pawl Click (`2.8–6.5 kHz` dual steel hub resonances + crisp impulse burst):
   *   1. Crisp metallic pawl tooth engagement transient (`bandpass 4.4 kHz` filtered impulse noise)
   *   2. Primary machined steel ratchet ring (`3.42 kHz` -> `2.88 kHz`, `Q = 7.2`)
   *   3. Secondary aluminum freehub shell harmonic (`5.75 kHz` -> `4.65 kHz`, `+3.2ms` micro-seat rebound)
   */
  _triggerRatchetClick(time, intensity, inSlowMo = Boolean(state.inSlowMoJump)) {
    if (!this.ctx || !this.preMasterGain) return;
    const safeInt = clamp(Number.isFinite(Number(intensity)) ? Number(intensity) : 0.8, 0.2, 1.5);
    const jitter = 0.96 + this.rng() * 0.08;

    // 1. Crisp metallic pawl tooth micro-impulse noise burst (`2.8–6.5 kHz`)
    if (this.crispNoiseBuffer) {
      const impSrc = this.ctx.createBufferSource();
      impSrc.buffer = this.crispNoiseBuffer;
      const impBp = this.ctx.createBiquadFilter();
      impBp.type = "bandpass";
      impBp.frequency.value = (inSlowMo ? 3150.0 : 4550.0) * jitter;
      impBp.Q.value = 3.2;
      const impGain = this.ctx.createGain();
      const impDur = inSlowMo ? 0.018 : 0.013;

      setParamAt(impGain.gain, MIN_EXP_VAL, time);
      linRampParam(impGain.gain, safeExpVal(0.052 * safeInt), time + MIN_ATTACK_SEC);
      expRampParam(impGain.gain, MIN_EXP_VAL, time + impDur);

      impSrc.connect(impBp);
      impBp.connect(impGain);
      impGain.connect(this.preMasterGain);
      impSrc.start(time);
      impSrc.stop(time + impDur + 0.004);
    }

    // 2. Primary `2.8–3.6 kHz` hardened steel pawl strike resonance
    {
      const osc1 = this.ctx.createOscillator();
      const bp1 = this.ctx.createBiquadFilter();
      const g1 = this.ctx.createGain();
      osc1.type = "triangle";
      const fStart = (inSlowMo ? 2980.0 : 3520.0) * jitter;
      const fEnd = (inSlowMo ? 2420.0 : 2840.0) * jitter;
      const dur1 = inSlowMo ? 0.024 : 0.016;

      setParamAt(osc1.frequency, safeExpVal(fStart), time);
      expRampParam(osc1.frequency, safeExpVal(fEnd), time + dur1);

      bp1.type = "bandpass";
      bp1.frequency.value = fStart * 0.96;
      bp1.Q.value = 6.8;

      setParamAt(g1.gain, MIN_EXP_VAL, time);
      linRampParam(g1.gain, safeExpVal(0.036 * safeInt), time + MIN_ATTACK_SEC);
      expRampParam(g1.gain, MIN_EXP_VAL, time + dur1);

      osc1.connect(bp1);
      bp1.connect(g1);
      g1.connect(this.preMasterGain);
      osc1.start(time);
      osc1.stop(time + dur1 + 0.004);
    }

    // 3. Secondary `+3.2ms` `5.4–6.3 kHz` cassette shell micro-rebound click
    {
      const t2 = time + (inSlowMo ? 0.0048 : 0.0032);
      const dur2 = inSlowMo ? 0.017 : 0.0125;
      const osc2 = this.ctx.createOscillator();
      const g2 = this.ctx.createGain();
      osc2.type = "sine";
      const f2 = (inSlowMo ? 4480.0 : 5820.0) * jitter;

      setParamAt(osc2.frequency, safeExpVal(f2), t2);
      expRampParam(osc2.frequency, safeExpVal(f2 * 0.86), t2 + dur2);

      setParamAt(g2.gain, MIN_EXP_VAL, t2);
      linRampParam(g2.gain, safeExpVal(0.018 * safeInt), t2 + MIN_ATTACK_SEC);
      expRampParam(g2.gain, MIN_EXP_VAL, t2 + dur2);

      osc2.connect(g2);
      g2.connect(this.preMasterGain);
      osc2.start(t2);
      osc2.stop(t2 + dur2 + 0.004);
    }
  }

  /**
   * Cold-Open Beat 2 (`1.8–4.4s`) Heavy Rubbery Webbed-Foot Stomp onto Aluminum Pedal Cage:
   *   1. Weighted fleshy foot-to-crank thud (`94 Hz -> 46 Hz`)
   *   2. Dampened rubbery webbed-skin slap (`bandpass 680 Hz`, `Q = 2.6`)
   *   3. Subtle aluminum pedal-cage pin/bearing click (`2.35 kHz`)
   */
  _triggerWebbedFootPedalStomp(time, intensity = 0.9, sideParity = 0) {
    if (!this.ctx || !this.preMasterGain) return;
    this.sfxCounts.webbedFootStomp++;
    const scale = clamp(Number.isFinite(Number(intensity)) ? Number(intensity) : 0.9, 0.3, 1.35);
    const detune = sideParity ? 1.04 : 0.97;

    // 1. Heavy rubbery sole-to-pedal low thud (`94 -> 46 Hz`)
    {
      const thudOsc = this.ctx.createOscillator();
      const thudGain = this.ctx.createGain();
      thudOsc.type = "sine";
      setParamAt(thudOsc.frequency, safeExpVal(96.0 * detune), time);
      expRampParam(thudOsc.frequency, safeExpVal(46.0 * detune), time + 0.085);

      setParamAt(thudGain.gain, MIN_EXP_VAL, time);
      linRampParam(thudGain.gain, safeExpVal(0.165 * scale), time + MIN_ATTACK_SEC);
      expRampParam(thudGain.gain, MIN_EXP_VAL, time + 0.098);

      thudOsc.connect(thudGain);
      thudGain.connect(this.preMasterGain);
      thudOsc.start(time);
      thudOsc.stop(time + 0.108);
    }

    // 2. Fleshy rubbery webbed-foot slap transient (`bandpass 690 -> 410 Hz`)
    if (this.noiseBuffer) {
      const slapSrc = this.ctx.createBufferSource();
      slapSrc.buffer = this.noiseBuffer;
      const slapBp = this.ctx.createBiquadFilter();
      slapBp.type = "bandpass";
      setParamAt(slapBp.frequency, safeExpVal(720.0 * detune), time);
      expRampParam(slapBp.frequency, safeExpVal(410.0 * detune), time + 0.056);
      slapBp.Q.value = 2.5;

      const slapGain = this.ctx.createGain();
      setParamAt(slapGain.gain, MIN_EXP_VAL, time);
      linRampParam(slapGain.gain, safeExpVal(0.125 * scale), time + MIN_ATTACK_SEC);
      expRampParam(slapGain.gain, MIN_EXP_VAL, time + 0.062);

      slapSrc.connect(slapBp);
      slapBp.connect(slapGain);
      slapGain.connect(this.preMasterGain);
      slapSrc.start(time);
      slapSrc.stop(time + 0.072);
    }

    // 3. Aluminum platform pedal bearing / cage pin click (`2.35 kHz`)
    {
      const tPin = time + 0.004;
      const pinOsc = this.ctx.createOscillator();
      const pinGain = this.ctx.createGain();
      pinOsc.type = "triangle";
      setParamAt(pinOsc.frequency, safeExpVal(2380.0 * detune), tPin);
      expRampParam(pinOsc.frequency, safeExpVal(1420.0 * detune), tPin + 0.018);

      setParamAt(pinGain.gain, MIN_EXP_VAL, tPin);
      linRampParam(pinGain.gain, safeExpVal(0.032 * scale), tPin + MIN_ATTACK_SEC);
      expRampParam(pinGain.gain, MIN_EXP_VAL, tPin + 0.022);

      pinOsc.connect(pinGain);
      pinGain.connect(this.preMasterGain);
      pinOsc.start(tPin);
      pinOsc.stop(tPin + 0.026);
    }
  }

  /**
   * Phase-locked rhythmic leg downstroke air-whoosh + light webbed-foot contact (`36 -> 168 RPM`).
   */
  _triggerPedalStrokeWhoosh(time, uRpm = 0.0, sideParity = 0, onStand = true) {
    if (!this.ctx || !this.preMasterGain || !this.noiseBuffer) return;
    const u = clamp(Number.isFinite(Number(uRpm)) ? Number(uRpm) : 0.0, 0.0, 1.05);
    this.sfxCounts.pedalWhoosh++;
    this.totalPedalWhooshes++;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    const sideDetune = sideParity ? 1.045 : 0.975;
    const fPeak = (245.0 + u * 595.0) * sideDetune;
    const fEnd = Math.max(120.0, fPeak * 0.64);
    const dur = Math.max(0.062, 0.168 - u * 0.100);

    setParamAt(bp.frequency, safeExpVal(fPeak * 0.82), time);
    expRampParam(bp.frequency, safeExpVal(fPeak), time + 0.018);
    expRampParam(bp.frequency, safeExpVal(fEnd), time + dur);
    bp.Q.value = 1.85 + u * 0.92;

    const g = this.ctx.createGain();
    const baseAmp = onStand ? 0.036 + u * 0.052 : 0.020 + u * 0.026;
    setParamAt(g.gain, MIN_EXP_VAL, time);
    linRampParam(g.gain, safeExpVal(baseAmp), time + Math.max(MIN_ATTACK_SEC, 0.008));
    expRampParam(g.gain, MIN_EXP_VAL, time + dur);

    src.connect(bp);
    bp.connect(g);
    g.connect(this.preMasterGain);
    src.start(time);
    src.stop(time + dur + 0.008);
  }

  /**
   * High-frequency metallic trainer stand frame shudder (`5.80s -> 7.40s`) right before the `7.40s` latch shear snap.
   */
  _triggerTrainerShudderRattle(time, shudderNorm = 0.5) {
    if (!this.ctx || !this.preMasterGain) return;
    const s = clamp(Number.isFinite(Number(shudderNorm)) ? Number(shudderNorm) : 0.5, 0.05, 1.0);
    const osc = this.ctx.createOscillator();
    const bp = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();

    osc.type = "triangle";
    const f0 = 1040.0 + s * 680.0 + this.rng() * 180.0;
    setParamAt(osc.frequency, safeExpVal(f0), time);
    expRampParam(osc.frequency, safeExpVal(f0 * 0.74), time + 0.025);

    bp.type = "bandpass";
    bp.frequency.value = f0 * 0.95;
    bp.Q.value = 5.4;

    setParamAt(g.gain, MIN_EXP_VAL, time);
    linRampParam(g.gain, safeExpVal(0.015 + 0.032 * s), time + MIN_ATTACK_SEC);
    expRampParam(g.gain, MIN_EXP_VAL, time + 0.027);

    osc.connect(bp);
    bp.connect(g);
    g.connect(this.preMasterGain);
    osc.start(time);
    osc.stop(time + 0.031);
  }

  /**
   * Vulcanized rubber stick-slip tread scrub grain on gym rollers.
   */
  _triggerTrainerSparkTick(time, intensity, uRpm = 0.0) {
    if (!this.ctx || !this.preMasterGain || !this.crispNoiseBuffer) return;
    const safeInt = clamp(Number.isFinite(Number(intensity)) ? Number(intensity) : 0.5, 0.0, 1.5);
    const u = clamp(Number.isFinite(Number(uRpm)) ? Number(uRpm) : 0.0, 0.0, 1.1);

    const src = this.ctx.createBufferSource();
    src.buffer = this.crispNoiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    const f0 = 620.0 + u * 680.0 + this.rng() * 220.0;
    setParamAt(bp.frequency, safeExpVal(f0), time);
    expRampParam(bp.frequency, safeExpVal(f0 * 0.78), time + 0.034);
    bp.Q.value = 3.8;

    const g = this.ctx.createGain();
    setParamAt(g.gain, MIN_EXP_VAL, time);
    linRampParam(g.gain, safeExpVal(0.024 * safeInt), time + MIN_ATTACK_SEC);
    expRampParam(g.gain, MIN_EXP_VAL, time + 0.038);

    src.connect(bp);
    bp.connect(g);
    g.connect(this.preMasterGain);
    src.start(time);
    src.stop(time + 0.042);
  }

  /**
   * Cold-Open `7.40s` Crisp Metallic Rear-Axle Latch Snap + Vulcanized Tire Peel-Out (`_playTrainerPopOff`).
   */
  _playTrainerPopOff() {
    if (this._disposed) return;
    this.sfxCounts.trainerShearSnap++;
    if (!this.enabled) return;
    if (!this.ctx) this._ensureContext();
    this.ensureResumed();
    if (!this.ctx || !this.preMasterGain) return;

    const now = this.ctx.currentTime;

    // 1. Crisp hardened-steel latch snap (`3.2 kHz` & `5.1 kHz` metallic impulse + `1540 Hz` spring-pin ping)
    if (this.crispNoiseBuffer) {
      const latchSrc = this.ctx.createBufferSource();
      latchSrc.buffer = this.crispNoiseBuffer;
      const latchBp = this.ctx.createBiquadFilter();
      latchBp.type = "bandpass";
      setParamAt(latchBp.frequency, 3650.0, now);
      expRampParam(latchBp.frequency, 1650.0, now + 0.052);
      latchBp.Q.value = 3.6;

      const latchGain = this.ctx.createGain();
      setParamAt(latchGain.gain, MIN_EXP_VAL, now);
      linRampParam(latchGain.gain, 0.24, now + MIN_ATTACK_SEC);
      expRampParam(latchGain.gain, MIN_EXP_VAL, now + 0.064);

      latchSrc.connect(latchBp);
      latchBp.connect(latchGain);
      latchGain.connect(this.preMasterGain);
      latchSrc.start(now);
      latchSrc.stop(now + 0.072);
    }

    const metalModes = [
      { f0: 3180.0, f1: 1180.0, dur: 0.068, amp: 0.16, type: "triangle" },
      { f0: 1540.0, f1: 1445.0, dur: 0.145, amp: 0.11, type: "sine" },
      { f0: 5120.0, f1: 4460.0, dur: 0.054, amp: 0.065, type: "sine" },
    ];
    for (let i = 0; i < metalModes.length; i++) {
      const m = metalModes[i];
      const t0 = now + i * 0.003;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = m.type;
      setParamAt(osc.frequency, safeExpVal(m.f0), t0);
      expRampParam(osc.frequency, safeExpVal(m.f1), t0 + m.dur);

      setParamAt(g.gain, MIN_EXP_VAL, t0);
      linRampParam(g.gain, safeExpVal(m.amp), t0 + MIN_ATTACK_SEC);
      expRampParam(g.gain, MIN_EXP_VAL, t0 + m.dur);

      osc.connect(g);
      g.connect(this.preMasterGain);
      osc.start(t0);
      osc.stop(t0 + m.dur + 0.01);
    }

    // 2. Mechanical roller-stand release thud (`190 -> 78 Hz`)
    {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "sine";
      setParamAt(osc.frequency, 190.0, now);
      expRampParam(osc.frequency, 78.0, now + 0.155);

      setParamAt(g.gain, MIN_EXP_VAL, now);
      linRampParam(g.gain, 0.19, now + MIN_ATTACK_SEC);
      expRampParam(g.gain, MIN_EXP_VAL, now + 0.168);

      osc.connect(g);
      g.connect(this.preMasterGain);
      osc.start(now);
      osc.stop(now + 0.178);
    }

    // 3. Vulcanized rubber tire peel-out chirp & smoke scrub (`920 -> 1320 -> 580 Hz`)
    if (this.noiseBuffer) {
      const hissSrc = this.ctx.createBufferSource();
      hissSrc.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.value = 2.15;
      setParamAt(bp.frequency, 960.0, now + 0.01);
      expRampParam(bp.frequency, 1380.0, now + 0.085);
      expRampParam(bp.frequency, 540.0, now + 0.36);

      const g = this.ctx.createGain();
      setParamAt(g.gain, MIN_EXP_VAL, now + 0.01);
      linRampParam(g.gain, 0.165, now + 0.032);
      expRampParam(g.gain, MIN_EXP_VAL, now + 0.38);

      hissSrc.connect(bp);
      bp.connect(g);
      g.connect(this.preMasterGain);
      hissSrc.start(now + 0.01);
      hissSrc.stop(now + 0.40);
    }
  }

  /**
   * Weathered Timber Plank Cadence Knock across Corten Stevens Creek Bridge & Jump Ramp (`_triggerWoodPlankThump`):
   *   1. Dual hollow timber deck modes (`126 Hz` + `282 Hz`)
   *   2. Crisp tire-edge plank-gap knock (`bandpass 880 Hz` noise burst)
   *   3. Subtle weathered cedar board flex micro-creak (`540 -> 395 Hz`)
   */
  _triggerWoodPlankThump(time, speedFactor) {
    if (!this.ctx || !this.preMasterGain) return;
    const safeFactor = clamp(Number.isFinite(Number(speedFactor)) ? Number(speedFactor) : 1.0, 0.25, 1.5);
    const pitchJit = 0.96 + this.rng() * 0.08;

    // 1. Hollow timber deck body resonance (`126 Hz` + `282 Hz`)
    const modes = [
      { f0: 132.0 * pitchJit, f1: 74.0 * pitchJit, amp: 0.098, dur: 0.062 },
      { f0: 286.0 * pitchJit, f1: 192.0 * pitchJit, amp: 0.046, dur: 0.044 },
    ];
    for (let i = 0; i < modes.length; i++) {
      const m = modes[i];
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = i === 0 ? "sine" : "triangle";
      setParamAt(osc.frequency, safeExpVal(m.f0), time);
      expRampParam(osc.frequency, safeExpVal(m.f1), time + m.dur);

      setParamAt(g.gain, MIN_EXP_VAL, time);
      linRampParam(g.gain, safeExpVal(m.amp * Math.min(1.35, safeFactor)), time + MIN_ATTACK_SEC);
      expRampParam(g.gain, MIN_EXP_VAL, time + m.dur);

      osc.connect(g);
      g.connect(this.preMasterGain);
      osc.start(time);
      osc.stop(time + m.dur + 0.006);
    }

    // 2. Tire-on-timber plank edge transient (`bandpass 890 Hz`)
    if (this.crispNoiseBuffer) {
      const knockSrc = this.ctx.createBufferSource();
      knockSrc.buffer = this.crispNoiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 890.0 * pitchJit;
      bp.Q.value = 2.4;
      const g = this.ctx.createGain();
      setParamAt(g.gain, MIN_EXP_VAL, time);
      linRampParam(g.gain, safeExpVal(0.042 * safeFactor), time + MIN_ATTACK_SEC);
      expRampParam(g.gain, MIN_EXP_VAL, time + 0.026);

      knockSrc.connect(bp);
      bp.connect(g);
      g.connect(this.preMasterGain);
      knockSrc.start(time);
      knockSrc.stop(time + 0.030);
    }
  }

  /**
   * Interlocking Hex Paver Micro-Joint Dual-Wheel Tap (`_triggerPaverTick`):
   * Front tire chamfer tap at `time` + subtle rear-wheel wheelbase follow tap (`1.06m / speed`).
   */
  _triggerPaverTick(time, speedFactor, speedMps = 4.5) {
    if (!this.ctx || !this.preMasterGain) return;
    const safeFactor = clamp(Number.isFinite(Number(speedFactor)) ? Number(speedFactor) : 1.0, 0.25, 1.5);
    const wheelbaseFollowSec = clamp(1.06 / Math.max(2.2, speedMps), 0.085, 0.28);
    const taps = [
      { t: time, scale: 1.0 },
      { t: time + wheelbaseFollowSec, scale: 0.68 },
    ];

    for (let i = 0; i < taps.length; i++) {
      const tap = taps[i];
      const jit = 0.97 + this.rng() * 0.06;

      if (this.crispNoiseBuffer) {
        const src = this.ctx.createBufferSource();
        src.buffer = this.crispNoiseBuffer;
        const bp = this.ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = 1580.0 * jit;
        bp.Q.value = 2.6;
        const g = this.ctx.createGain();
        setParamAt(g.gain, MIN_EXP_VAL, tap.t);
        linRampParam(g.gain, safeExpVal(0.022 * safeFactor * tap.scale), tap.t + MIN_ATTACK_SEC);
        expRampParam(g.gain, MIN_EXP_VAL, tap.t + 0.019);
        src.connect(bp);
        bp.connect(g);
        g.connect(this.preMasterGain);
        src.start(tap.t);
        src.stop(tap.t + 0.023);
      }

      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "sine";
      setParamAt(osc.frequency, safeExpVal(390.0 * jit), tap.t);
      expRampParam(osc.frequency, safeExpVal(175.0 * jit), tap.t + 0.021);
      setParamAt(g.gain, MIN_EXP_VAL, tap.t);
      linRampParam(g.gain, safeExpVal(0.024 * safeFactor * tap.scale), tap.t + MIN_ATTACK_SEC);
      expRampParam(g.gain, MIN_EXP_VAL, tap.t + 0.024);
      osc.connect(g);
      g.connect(this.preMasterGain);
      osc.start(tap.t);
      osc.stop(tap.t + 0.028);
    }
  }

  /**
   * Subtle Pelican Avian Foley (`_playPelicanBillClackAndWingRuffle`):
   * Hollow keratin mandible bill-clack (`840/1720 Hz` dual cavity snap) + primary-remiges wing-ruffle sweep.
   */
  _playPelicanBillClackAndWingRuffle(time, intensity = 0.75, doubleClack = false) {
    if (!this.ctx || !this.preMasterGain) return;
    const scale = clamp(Number.isFinite(Number(intensity)) ? Number(intensity) : 0.75, 0.25, 1.35);
    this.sfxCounts.billClack++;
    this.sfxCounts.wingRuffle++;

    const clackOffsets = doubleClack ? [0.0, 0.068] : [0.0];
    for (let k = 0; k < clackOffsets.length; k++) {
      const tClack = time + clackOffsets[k];
      const ampScale = scale * (k === 0 ? 1.0 : 0.78);

      // Hollow keratin upper/lower mandible cavity snap (`860 Hz` & `1740 Hz` + crisp snap noise)
      if (this.crispNoiseBuffer) {
        const snapSrc = this.ctx.createBufferSource();
        snapSrc.buffer = this.crispNoiseBuffer;
        const bp = this.ctx.createBiquadFilter();
        bp.type = "bandpass";
        setParamAt(bp.frequency, 1680.0, tClack);
        expRampParam(bp.frequency, 920.0, tClack + 0.024);
        bp.Q.value = 4.2;

        const g = this.ctx.createGain();
        setParamAt(g.gain, MIN_EXP_VAL, tClack);
        linRampParam(g.gain, safeExpVal(0.048 * ampScale), tClack + MIN_ATTACK_SEC);
        expRampParam(g.gain, MIN_EXP_VAL, tClack + 0.026);

        snapSrc.connect(bp);
        bp.connect(g);
        g.connect(this.preMasterGain);
        snapSrc.start(tClack);
        snapSrc.stop(tClack + 0.030);
      }

      const billOsc = this.ctx.createOscillator();
      const billGain = this.ctx.createGain();
      billOsc.type = "triangle";
      setParamAt(billOsc.frequency, 880.0, tClack);
      expRampParam(billOsc.frequency, 520.0, tClack + 0.022);
      setParamAt(billGain.gain, MIN_EXP_VAL, tClack);
      linRampParam(billGain.gain, safeExpVal(0.034 * ampScale), tClack + MIN_ATTACK_SEC);
      expRampParam(billGain.gain, MIN_EXP_VAL, tClack + 0.024);
      billOsc.connect(billGain);
      billGain.connect(this.preMasterGain);
      billOsc.start(tClack);
      billOsc.stop(tClack + 0.028);
    }

    // Feathered wing-ruffle sweep (`bandpass 1480 -> 580 Hz` over `0.15s`)
    if (this.noiseBuffer) {
      const tRuf = time + 0.012;
      const rufSrc = this.ctx.createBufferSource();
      rufSrc.buffer = this.noiseBuffer;
      const rufBp = this.ctx.createBiquadFilter();
      rufBp.type = "bandpass";
      setParamAt(rufBp.frequency, 1520.0, tRuf);
      expRampParam(rufBp.frequency, 590.0, tRuf + 0.155);
      rufBp.Q.value = 1.65;

      const rufGain = this.ctx.createGain();
      setParamAt(rufGain.gain, MIN_EXP_VAL, tRuf);
      linRampParam(rufGain.gain, safeExpVal(0.062 * scale), tRuf + 0.022);
      expRampParam(rufGain.gain, MIN_EXP_VAL, tRuf + 0.165);

      rufSrc.connect(rufBp);
      rufBp.connect(rufGain);
      rufGain.connect(this.preMasterGain);
      rufSrc.start(tRuf);
      rufSrc.stop(tRuf + 0.180);
    }
  }

  /**
   * Cold-Open `9.40s` Crystalline Tempered Curtain-Wall Shatter (`playGlassShatter`):
   *   - Blooms `lyriaFilter` from indoor `520 Hz -> 20000 Hz` over `0.16s` (lifting `lyriaGain` `0.34 -> 0.46` with ZERO duck!)
   *   - Synthesizes structural mullion punch + dual-band tempered safety-glass burst + 18 high-sparkle shard chimes!
   */
  playGlassShatter(intensity = 1.0) {
    if (this._disposed) return;
    if (!this._shouldFireDedupe("glass_shatter", 120.0)) return;
    const scale = clamp(Number.isFinite(Number(intensity)) ? Number(intensity) : 1.0, 0.25, 1.5);
    this.sfxCounts.glassShatter++;
    this.currentLyriaCutoffHz = 20000.0;
    state.kinematics.lyriaCutoffHz = 20000.0;

    if (!this.enabled) return;
    if (!this.ctx) this._ensureContext();
    this.ensureResumed();
    if (!this.ctx || !this.preMasterGain) return;

    const now = this.ctx.currentTime;

    // 1. Snappy 0.16s Indoor-to-Outdoor Acoustic Bloom (`520 Hz -> 20000 Hz`, zero ducking on `musicBus`!)
    if (this.lyriaFilter) {
      const startHz = safeExpVal(this.lyriaFilter.frequency.value || GYM_MUFFLE_CUTOFF_HZ);
      if (typeof this.lyriaFilter.frequency.cancelScheduledValues === "function") {
        this.lyriaFilter.frequency.cancelScheduledValues(now);
      }
      setParamAt(this.lyriaFilter.frequency, startHz, now);
      expRampParam(this.lyriaFilter.frequency, 20000.0, now + 0.16);
      setTargetAt(this.lyriaFilter.Q, 0.82, now, 0.04);
      this._bloomEndAudioTime = now + 0.17;
    }
    if (this.lyriaGain) {
      if (typeof this.lyriaGain.gain.cancelScheduledValues === "function") {
        this.lyriaGain.gain.cancelScheduledValues(now);
      }
      setParamAt(this.lyriaGain.gain, safeExpVal(this.lyriaGain.gain.value || 0.58), now);
      linRampParam(this.lyriaGain.gain, 0.82, now + 0.16);
    }

    // 2. Curtain-Wall Aluminum Mullion Impact Thud (`124 Hz -> 38 Hz`)
    {
      const thudOsc = this.ctx.createOscillator();
      const thudGain = this.ctx.createGain();
      thudOsc.type = "sine";
      setParamAt(thudOsc.frequency, 124.0, now);
      expRampParam(thudOsc.frequency, 38.0, now + 0.21);

      setParamAt(thudGain.gain, MIN_EXP_VAL, now);
      linRampParam(thudGain.gain, safeExpVal(0.28 * scale), now + MIN_ATTACK_SEC);
      expRampParam(thudGain.gain, MIN_EXP_VAL, now + 0.24);

      thudOsc.connect(thudGain);
      thudGain.connect(this.preMasterGain);
      thudOsc.start(now);
      thudOsc.stop(now + 0.26);
    }

    // 3. Crystalline Tempered Safety-Glass Fracture Burst (`highpass 2350 Hz` on crisp broadband buffer)
    const fractureBuf = this.crispNoiseBuffer || this.noiseBuffer;
    if (fractureBuf) {
      const burstSrc = this.ctx.createBufferSource();
      burstSrc.buffer = fractureBuf;
      burstSrc.loop = true;
      const hp = this.ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 2350.0;
      hp.Q.value = 1.45;
      const burstGain = this.ctx.createGain();
      setParamAt(burstGain.gain, MIN_EXP_VAL, now);
      linRampParam(burstGain.gain, safeExpVal(0.26 * scale), now + MIN_ATTACK_SEC);
      expRampParam(burstGain.gain, MIN_EXP_VAL, now + 0.32);

      burstSrc.connect(hp);
      hp.connect(burstGain);
      burstGain.connect(this.preMasterGain);
      burstSrc.start(now);
      burstSrc.stop(now + 0.34);
    }

    // 4. Staggered Cascade of 18 Crystalline Tempered-Glass Shard Pings (`2.8 kHz – 9.1 kHz`)
    const shardFreqs = [
      2840, 3560, 4320, 5280, 6420, 3980, 7340, 4790, 6080,
      3290, 8120, 5140, 6860, 5620, 8890, 4490, 7610, 6290,
    ];
    for (let i = 0; i < shardFreqs.length; i++) {
      const delay = 0.010 + i * 0.032 + (i % 3) * 0.008;
      const t0 = now + delay;
      const dur = 0.068 + (i % 4) * 0.026;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();

      osc.type = i % 3 === 0 ? "triangle" : "sine";
      const f = shardFreqs[i];
      setParamAt(osc.frequency, safeExpVal(f), t0);
      expRampParam(osc.frequency, safeExpVal(f * 0.94), t0 + dur);

      const amp = 0.072 * scale * Math.pow(0.89, i);
      setParamAt(g.gain, MIN_EXP_VAL, t0);
      linRampParam(g.gain, safeExpVal(amp), t0 + MIN_ATTACK_SEC);
      expRampParam(g.gain, MIN_EXP_VAL, t0 + dur);

      osc.connect(g);
      g.connect(this.preMasterGain);
      osc.start(t0);
      osc.stop(t0 + dur + 0.01);
    }
  }

  /**
   * Natural Two-Tone Spun-Brass GBike Bell (`1568.0 Hz` + `110ms` -> `2349.3 Hz`),
   * with rapid frantic double-ring (`frantic = true`) when startled by Stan T-Rex (`t = 40.32s`).
   */
  ringBell(doubleChime = false, frantic = false) {
    if (this._disposed) return;
    if (!this._shouldFireDedupe("bell", 45.0)) return;
    this.sfxCounts.bell++;

    if (!this.enabled) return;
    if (!this.ctx) this._ensureContext();
    this.ensureResumed();
    if (!this.ctx || !this.preMasterGain) return;

    const now = this.ctx.currentTime;
    if (frantic) {
      this._strikeBellPartialCluster(now, 1568.0, 0.19, 0.56);
      this._strikeBellPartialCluster(now + 0.082, 2349.3, 0.17, 0.64);
      this._strikeBellPartialCluster(now + 0.215, 1622.0, 0.17, 0.54);
      this._strikeBellPartialCluster(now + 0.295, 2418.0, 0.16, 0.68);
      return;
    }

    this._strikeBellPartialCluster(now, 1568.0, 0.18, 0.64);
    this._strikeBellPartialCluster(now + 0.11, 2349.3, 0.16, 0.74);
    if (doubleChime) {
      this._strikeBellPartialCluster(now + 0.34, 1568.0, 0.13, 0.56);
      this._strikeBellPartialCluster(now + 0.45, 2349.3, 0.13, 0.68);
    }
  }

  playBell(doubleChime = false, frantic = false) {
    this.ringBell(doubleChime, frantic);
  }

  /**
   * Natural Spun-Brass Dome Partial Cluster + Metallic Brass Clapper Striker Transient (`_strikeBellPartialCluster`).
   */
  _strikeBellPartialCluster(startTime, baseFreq, amp, duration) {
    if (!this.ctx || !this.preMasterGain) return;

    // 1. Crisp metallic brass striker clapper transient (`bandpass 4.85 kHz` impulse)
    if (this.crispNoiseBuffer) {
      const strikerSrc = this.ctx.createBufferSource();
      strikerSrc.buffer = this.crispNoiseBuffer;
      const strikerBp = this.ctx.createBiquadFilter();
      strikerBp.type = "bandpass";
      strikerBp.frequency.value = 4850.0;
      strikerBp.Q.value = 4.4;

      const strikerGain = this.ctx.createGain();
      setParamAt(strikerGain.gain, MIN_EXP_VAL, startTime);
      linRampParam(strikerGain.gain, safeExpVal(amp * 0.34), startTime + MIN_ATTACK_SEC);
      expRampParam(strikerGain.gain, MIN_EXP_VAL, startTime + 0.019);

      strikerSrc.connect(strikerBp);
      strikerBp.connect(strikerGain);
      strikerGain.connect(this.preMasterGain);
      strikerSrc.start(startTime);
      strikerSrc.stop(startTime + 0.024);
    }

    // 2. Five authentic spun-brass dome inharmonic partials (`hum/prime, octave-beating, minor-10th, quint, upper ring`)
    const ratios = [1.0, 2.007, 2.758, 4.184, 5.412];
    const weights = [1.0, 0.44, 0.34, 0.19, 0.11];
    const decayFactors = [1.0, 1.35, 1.85, 2.75, 3.8];

    for (let i = 0; i < ratios.length; i++) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "sine";
      setParamAt(osc.frequency, safeExpVal(baseFreq * ratios[i]), startTime);

      const partialDur = Math.max(0.045, duration / decayFactors[i]);
      const peakGain = safeExpVal(amp * weights[i]);
      setParamAt(g.gain, MIN_EXP_VAL, startTime);
      linRampParam(g.gain, peakGain, startTime + MIN_ATTACK_SEC);
      expRampParam(g.gain, MIN_EXP_VAL, startTime + partialDur);

      osc.connect(g);
      g.connect(this.preMasterGain);
      osc.start(startTime);
      osc.stop(startTime + partialDur + 0.02);
    }
  }

  /**
   * V8-02: Visceral 4-Layer Prehistoric `T. rex` Bio-Acoustic Predator Roar (`t = 40.20s`).
   *   1. Explosive Sub-Glottal Chest Lung Blast (`0–110ms`, `28–52 Hz` chest thump + expiratory air burst)
   *   2. Nonlinear Chaotic Glottal Growl (`0` clean sawtooth/sine LFOs): coupled asymmetric LF glottal pulse
   *      oscillators modulated by low-passed pink-noise jitter + `24 Hz` subharmonic vocal-fry roughness
   *      (`95 Hz -> 148 Hz` bellow peak -> `58 Hz` guttural drop) -> `WaveShaperNode` (`tanh` saturation)
   *      -> 3 parallel swept vocal-tract formant resonators (`F1: 280->165 Hz`, `F2: 720->410 Hz`, `F3: 1520->860 Hz`)
   *   3. Fierce Upper Pharyngeal Rasp & Hiss (`1.2–4.0 kHz` amplitude-modulated flesh-and-tooth snarl)
   *   4. Courtyard Architectural Slapback Reverb (`105ms` & `230ms` filtered Googleplex glass facade reflections)
   * Routed strictly through `sfxBus` with ZERO `musicBus` ducking or pitch warping!
   */
  playStanTrexRoar(intensity = 1.0) {
    if (this._disposed) return;
    if (!this._shouldFireDedupe("stan_roar", 600.0)) return;
    this.sfxCounts.stanRoar++;

    if (!this.enabled) return;
    if (!this.ctx) this._ensureContext();
    this.ensureResumed();
    if (!this.ctx || !this.preMasterGain) return;

    const now = this.ctx.currentTime;
    const scale = clamp(Number.isFinite(Number(intensity)) ? Number(intensity) : 1.0, 0.4, 1.35);

    // Dry predator vocal bus + courtyard slapback send bus
    const roarDryBus = this.ctx.createGain();
    roarDryBus.gain.value = 1.0;
    roarDryBus.connect(this.preMasterGain);

    const applyGlottalWave = (osc) => {
      if (this.glottalPeriodicWave && typeof osc.setPeriodicWave === "function") {
        osc.setPeriodicWave(this.glottalPeriodicWave);
      } else {
        osc.type = "triangle";
      }
    };

    // -------------------------------------------------------------------------
    // LAYER 1: Explosive Sub-Glottal Chest Lung Blast (`0–110ms`, `28–52 Hz`)
    // -------------------------------------------------------------------------
    {
      const chestOsc = this.ctx.createOscillator();
      const chestSubOsc = this.ctx.createOscillator();
      const chestLp = this.ctx.createBiquadFilter();
      const chestGain = this.ctx.createGain();

      chestOsc.type = "triangle";
      setParamAt(chestOsc.frequency, 52.0, now);
      expRampParam(chestOsc.frequency, 34.0, now + 0.085);
      expRampParam(chestOsc.frequency, 28.0, now + 0.34);

      applyGlottalWave(chestSubOsc);
      setParamAt(chestSubOsc.frequency, 46.0, now);
      expRampParam(chestSubOsc.frequency, 29.0, now + 0.110);
      expRampParam(chestSubOsc.frequency, 26.0, now + 0.34);

      chestLp.type = "lowpass";
      setParamAt(chestLp.frequency, 132.0, now);
      expRampParam(chestLp.frequency, 68.0, now + 0.28);
      chestLp.Q.value = 1.45;

      setParamAt(chestGain.gain, MIN_EXP_VAL, now);
      linRampParam(chestGain.gain, safeExpVal(0.42 * scale), now + 0.012);
      expRampParam(chestGain.gain, safeExpVal(0.16 * scale), now + 0.110);
      expRampParam(chestGain.gain, MIN_EXP_VAL, now + 0.38);

      const subTrim = this.ctx.createGain();
      subTrim.gain.value = 0.55;
      chestOsc.connect(chestLp);
      chestSubOsc.connect(subTrim);
      subTrim.connect(chestLp);
      chestLp.connect(chestGain);
      chestGain.connect(this.preMasterGain);

      chestOsc.start(now);
      chestSubOsc.start(now);
      chestOsc.stop(now + 0.40);
      chestSubOsc.stop(now + 0.40);

      // Turbulent expiratory lung air blast (`0–110ms` jaw-snap exhalation)
      if (this.noiseBuffer) {
        const lungSrc = this.ctx.createBufferSource();
        lungSrc.buffer = this.noiseBuffer;
        lungSrc.loop = true;

        const lungBp = this.ctx.createBiquadFilter();
        lungBp.type = "bandpass";
        setParamAt(lungBp.frequency, 210.0, now);
        expRampParam(lungBp.frequency, 92.0, now + 0.110);
        expRampParam(lungBp.frequency, 68.0, now + 0.28);
        lungBp.Q.value = 1.15;

        const lungGain = this.ctx.createGain();
        setParamAt(lungGain.gain, MIN_EXP_VAL, now);
        linRampParam(lungGain.gain, safeExpVal(0.36 * scale), now + 0.010);
        expRampParam(lungGain.gain, safeExpVal(0.11 * scale), now + 0.110);
        expRampParam(lungGain.gain, MIN_EXP_VAL, now + 0.30);

        lungSrc.connect(lungBp);
        lungBp.connect(lungGain);
        lungGain.connect(roarDryBus);
        lungSrc.start(now);
        lungSrc.stop(now + 0.32);
      }
    }

    // -------------------------------------------------------------------------
    // LAYER 2: Nonlinear Chaotic Glottal Growl (`95 -> 148 -> 58 Hz`)
    //          + `WaveShaperNode` (`tanh`) + 3 Swept Vocal-Tract Formant Resonators
    // -------------------------------------------------------------------------
    {
      const glottalPrimary = this.ctx.createOscillator();
      const glottalSub = this.ctx.createOscillator();
      const glottalFry = this.ctx.createOscillator();
      applyGlottalWave(glottalPrimary);
      applyGlottalWave(glottalSub);
      applyGlottalWave(glottalFry);

      // `95 Hz -> 148 Hz` ferocious bellow peak -> `58 Hz` cavernous guttural drop
      setParamAt(glottalPrimary.frequency, 95.0, now);
      expRampParam(glottalPrimary.frequency, 148.0, now + 0.155);
      expRampParam(glottalPrimary.frequency, 112.0, now + 0.58);
      expRampParam(glottalPrimary.frequency, 58.0, now + 1.36);

      // Coupled asymmetric sub-fold (`0.505x` period-doubled theropod vocal fold)
      setParamAt(glottalSub.frequency, 48.0, now);
      expRampParam(glottalSub.frequency, 74.8, now + 0.162);
      expRampParam(glottalSub.frequency, 56.5, now + 0.60);
      expRampParam(glottalSub.frequency, 29.5, now + 1.36);

      // `24 Hz` subharmonic vocal-fry roughness generator (warped by stochastic jitter, `0` sine LFO!)
      setParamAt(glottalFry.frequency, 24.0, now);
      expRampParam(glottalFry.frequency, 26.8, now + 0.18);
      expRampParam(glottalFry.frequency, 21.5, now + 1.36);

      const glottalDrive = this.ctx.createGain();
      setParamAt(glottalDrive.gain, 1.48, now);
      linRampParam(glottalDrive.gain, 1.85, now + 0.16);
      expRampParam(glottalDrive.gain, 0.92, now + 1.36);

      // Modulate pitch & vocal-fold closure via pre-baked low-passed pink-noise + 24 Hz fry jitter buffer
      if (this.glottalJitterBuffer) {
        const jitterSrc = this.ctx.createBufferSource();
        jitterSrc.buffer = this.glottalJitterBuffer;
        jitterSrc.loop = true;

        const pitchJitterPrimary = this.ctx.createGain();
        pitchJitterPrimary.gain.value = 18.5;
        const pitchJitterSub = this.ctx.createGain();
        pitchJitterSub.gain.value = 10.2;
        const fryFreqJitter = this.ctx.createGain();
        fryFreqJitter.gain.value = 5.4;
        const ampRoughnessDepth = this.ctx.createGain();
        ampRoughnessDepth.gain.value = 0.44;

        jitterSrc.connect(pitchJitterPrimary);
        pitchJitterPrimary.connect(glottalPrimary.frequency);
        jitterSrc.connect(pitchJitterSub);
        pitchJitterSub.connect(glottalSub.frequency);
        jitterSrc.connect(fryFreqJitter);
        fryFreqJitter.connect(glottalFry.frequency);
        jitterSrc.connect(ampRoughnessDepth);
        ampRoughnessDepth.connect(glottalDrive.gain);

        jitterSrc.start(now);
        jitterSrc.stop(now + 1.42);
      }

      // Cross-couple `24 Hz` fry fold into primary frequency & drive for chaotic nonlinear intermodulation
      const fryCrossFm = this.ctx.createGain();
      fryCrossFm.gain.value = 14.0;
      const subMix = this.ctx.createGain();
      subMix.gain.value = 0.68;
      const fryMix = this.ctx.createGain();
      fryMix.gain.value = 0.36;

      glottalFry.connect(fryCrossFm);
      fryCrossFm.connect(glottalPrimary.frequency);

      glottalPrimary.connect(glottalDrive);
      glottalSub.connect(subMix);
      subMix.connect(glottalDrive);
      glottalFry.connect(fryMix);
      fryMix.connect(glottalDrive);

      // Nonlinear `WaveShaperNode` (`tanh` soft-clipping saturation; graceful GainNode fallback on mock test contexts)
      let saturatedNode = glottalDrive;
      if (typeof this.ctx.createWaveShaper === "function" && this.roarTanhCurve) {
        const shaper = this.ctx.createWaveShaper();
        shaper.curve = this.roarTanhCurve;
        shaper.oversample = "2x";
        glottalDrive.connect(shaper);
        saturatedNode = shaper;
      }

      const roarEnv = this.ctx.createGain();
      setParamAt(roarEnv.gain, MIN_EXP_VAL, now);
      linRampParam(roarEnv.gain, safeExpVal(0.86 * scale), now + 0.028);
      setParamAt(roarEnv.gain, safeExpVal(0.80 * scale), now + 0.52);
      expRampParam(roarEnv.gain, safeExpVal(0.32 * scale), now + 1.05);
      expRampParam(roarEnv.gain, MIN_EXP_VAL, now + 1.40);

      // 3 Parallel Swept Vocal-Tract Formant Bandpass Resonators (`1.5m` Theropod Throat Cavity)
      const formants = [
        { fStart: 280.0, fPeak: 308.0, fEnd: 165.0, q: 3.4, gain: 0.40 }, // F1: deep pharyngeal cavity
        { fStart: 720.0, fPeak: 775.0, fEnd: 410.0, q: 4.1, gain: 0.30 }, // F2: oral/palatal resonance
        { fStart: 1520.0, fPeak: 1610.0, fEnd: 860.0, q: 4.6, gain: 0.20 }, // F3: upper laryngeal/snout snarl
      ];
      for (let fi = 0; fi < formants.length; fi++) {
        const fm = formants[fi];
        const bp = this.ctx.createBiquadFilter();
        bp.type = "bandpass";
        setParamAt(bp.frequency, fm.fStart, now);
        expRampParam(bp.frequency, fm.fPeak, now + 0.13);
        expRampParam(bp.frequency, fm.fEnd, now + 1.36);
        bp.Q.value = fm.q;

        const fg = this.ctx.createGain();
        fg.gain.value = fm.gain;
        saturatedNode.connect(bp);
        bp.connect(fg);
        fg.connect(roarEnv);
      }

      // Low-tracheal chest resonance foundation (`<= 145 Hz`) underneath the 3 vocal-tract formants
      const trachealLp = this.ctx.createBiquadFilter();
      trachealLp.type = "lowpass";
      setParamAt(trachealLp.frequency, 150.0, now);
      expRampParam(trachealLp.frequency, 88.0, now + 1.36);
      trachealLp.Q.value = 1.35;
      const trachealGain = this.ctx.createGain();
      trachealGain.gain.value = 0.24;
      saturatedNode.connect(trachealLp);
      trachealLp.connect(trachealGain);
      trachealGain.connect(roarEnv);

      roarEnv.connect(roarDryBus);

      glottalPrimary.start(now);
      glottalSub.start(now);
      glottalFry.start(now);
      glottalPrimary.stop(now + 1.42);
      glottalSub.stop(now + 1.42);
      glottalFry.stop(now + 1.42);
    }

    // -------------------------------------------------------------------------
    // LAYER 3: Fierce Upper Pharyngeal Rasp & Hiss (`1.2–4.0 kHz` Predator Snarl)
    // -------------------------------------------------------------------------
    if (this.pharyngealRaspBuffer || this.noiseBuffer) {
      const raspSrc = this.ctx.createBufferSource();
      raspSrc.buffer = this.pharyngealRaspBuffer || this.noiseBuffer;
      raspSrc.loop = true;

      const raspHp = this.ctx.createBiquadFilter();
      raspHp.type = "highpass";
      setParamAt(raspHp.frequency, 1200.0, now);
      raspHp.Q.value = 0.85;

      // Lower-palate wet flesh rasp (`2.15 kHz -> 1.28 kHz`)
      const raspBpLow = this.ctx.createBiquadFilter();
      raspBpLow.type = "bandpass";
      setParamAt(raspBpLow.frequency, 2150.0, now);
      expRampParam(raspBpLow.frequency, 2480.0, now + 0.14);
      expRampParam(raspBpLow.frequency, 1280.0, now + 1.32);
      raspBpLow.Q.value = 1.55;

      // Upper-jaw tooth & sinus hiss (`3.65 kHz -> 2.10 kHz`, strictly inside `1.2–4.0 kHz`)
      const raspBpHigh = this.ctx.createBiquadFilter();
      raspBpHigh.type = "bandpass";
      setParamAt(raspBpHigh.frequency, 3650.0, now);
      expRampParam(raspBpHigh.frequency, 3920.0, now + 0.12);
      expRampParam(raspBpHigh.frequency, 2100.0, now + 1.28);
      raspBpHigh.Q.value = 1.95;

      const raspGain = this.ctx.createGain();
      setParamAt(raspGain.gain, MIN_EXP_VAL, now);
      linRampParam(raspGain.gain, safeExpVal(0.27 * scale), now + 0.024);
      setParamAt(raspGain.gain, safeExpVal(0.23 * scale), now + 0.56);
      expRampParam(raspGain.gain, MIN_EXP_VAL, now + 1.34);

      const hissTrim = this.ctx.createGain();
      hissTrim.gain.value = 0.62;

      raspSrc.connect(raspHp);
      raspHp.connect(raspBpLow);
      raspHp.connect(raspBpHigh);
      raspBpLow.connect(raspGain);
      raspBpHigh.connect(hissTrim);
      hissTrim.connect(raspGain);
      raspGain.connect(roarDryBus);

      raspSrc.start(now);
      raspSrc.stop(now + 1.36);
    }

    // -------------------------------------------------------------------------
    // LAYER 4: Courtyard Architectural Slapback Reverb (`105ms` & `230ms` Glass Facades)
    // -------------------------------------------------------------------------
    if (typeof this.ctx.createDelay === "function") {
      const slapGate = this.ctx.createGain();
      setParamAt(slapGate.gain, 1.0, now);
      setParamAt(slapGate.gain, 1.0, now + 1.45);
      expRampParam(slapGate.gain, MIN_EXP_VAL, now + 1.92);

      // Reflection 1 (`105ms`): Near Googleplex glass curtain-wall slapback
      const delayNear = this.ctx.createDelay(0.5);
      delayNear.delayTime.value = 0.105;
      const hpNear = this.ctx.createBiquadFilter();
      hpNear.type = "highpass";
      hpNear.frequency.value = 185.0;
      const lpNear = this.ctx.createBiquadFilter();
      lpNear.type = "lowpass";
      lpNear.frequency.value = 2650.0;
      const gainNear = this.ctx.createGain();
      gainNear.gain.value = 0.25 * scale;

      // Reflection 2 (`230ms`): Across-courtyard architectural terrace echo + diffuse cross-tail
      const delayFar = this.ctx.createDelay(0.5);
      delayFar.delayTime.value = 0.230;
      const hpFar = this.ctx.createBiquadFilter();
      hpFar.type = "highpass";
      hpFar.frequency.value = 225.0;
      const lpFar = this.ctx.createBiquadFilter();
      lpFar.type = "lowpass";
      lpFar.frequency.value = 1820.0;
      const gainFar = this.ctx.createGain();
      gainFar.gain.value = 0.15 * scale;

      const crossFeed = this.ctx.createGain();
      crossFeed.gain.value = 0.20;

      roarDryBus.connect(delayNear);
      delayNear.connect(hpNear);
      hpNear.connect(lpNear);
      lpNear.connect(gainNear);
      gainNear.connect(slapGate);

      roarDryBus.connect(delayFar);
      lpNear.connect(crossFeed);
      crossFeed.connect(delayFar);
      delayFar.connect(hpFar);
      hpFar.connect(lpFar);
      lpFar.connect(gainFar);
      gainFar.connect(slapGate);

      slapGate.connect(this.preMasterGain);
    }
  }

  /**
   * Pelican Startled Two-Syllable Seabird Squawk + Hollow Keratin Bill-Clack & Feathered Wing-Ruffle (`t = 40.32s`).
   */
  playPelicanStartledSquawk() {
    if (this._disposed) return;
    if (!this._shouldFireDedupe("pelican_squawk", 500.0)) return;
    this.sfxCounts.pelicanSquawk++;

    if (!this.enabled) return;
    if (!this.ctx) this._ensureContext();
    this.ensureResumed();
    if (!this.ctx || !this.preMasterGain) return;

    const now = this.ctx.currentTime;

    // Subtle startled Pelican double keratin bill-clack + feathered wing-ruffle Foley!
    this._playPelicanBillClackAndWingRuffle(now, 0.95, true);

    const syllables = [
      { offset: 0.012, dur: 0.158, fStart: 590.0, fPeak: 1110.0, fEnd: 730.0, amp: 0.185 },
      { offset: 0.190, dur: 0.165, fStart: 660.0, fPeak: 985.0, fEnd: 560.0, amp: 0.155 },
    ];

    for (let i = 0; i < syllables.length; i++) {
      const s = syllables[i];
      const t0 = now + s.offset;
      const osc = this.ctx.createOscillator();
      const vibLfo = this.ctx.createOscillator();
      const vibGain = this.ctx.createGain();
      const bp = this.ctx.createBiquadFilter();
      const nasalPeak = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();

      osc.type = "sawtooth";
      setParamAt(osc.frequency, safeExpVal(s.fStart), t0);
      expRampParam(osc.frequency, safeExpVal(s.fPeak), t0 + 0.032);
      expRampParam(osc.frequency, safeExpVal(s.fEnd), t0 + s.dur);

      vibLfo.type = "sine";
      setParamAt(vibLfo.frequency, 34.0, t0);
      setParamAt(vibGain.gain, 42.0, t0);
      vibLfo.connect(vibGain);
      vibGain.connect(osc.frequency);

      bp.type = "bandpass";
      setParamAt(bp.frequency, 1180.0, t0);
      expRampParam(bp.frequency, 890.0, t0 + s.dur);
      bp.Q.value = 3.3;

      nasalPeak.type = "peaking";
      setParamAt(nasalPeak.frequency, 2350.0, t0);
      nasalPeak.Q.value = 2.4;
      if (nasalPeak.gain) {
        setParamAt(nasalPeak.gain, 5.0, t0);
      }

      setParamAt(g.gain, MIN_EXP_VAL, t0);
      linRampParam(g.gain, safeExpVal(s.amp), t0 + 0.012);
      expRampParam(g.gain, MIN_EXP_VAL, t0 + s.dur);

      osc.connect(bp);
      bp.connect(nasalPeak);
      nasalPeak.connect(g);
      g.connect(this.preMasterGain);

      osc.start(t0);
      vibLfo.start(t0);
      osc.stop(t0 + s.dur + 0.015);
      vibLfo.stop(t0 + s.dur + 0.015);
    }
  }

  /**
   * Playful Staggered Pink Flamingo Honks + Wing-Flutter Bursts (`420–680 Hz` nasal formant bandpass).
   */
  playFlamingoHonks(count = 4) {
    if (this._disposed) return;
    if (!this._shouldFireDedupe("flamingo_honks", 450.0)) return;
    this.sfxCounts.flamingoHonks++;

    if (!this.enabled) return;
    if (!this.ctx) this._ensureContext();
    this.ensureResumed();
    if (!this.ctx || !this.preMasterGain) return;

    const now = this.ctx.currentTime;
    const baseFreqs = [445.0, 535.0, 635.0, 492.0, 585.0];
    const safeCount = clamp(Math.round(Number(count) || 4), 3, 5);

    for (let i = 0; i < safeCount; i++) {
      const t0 = now + 0.045 + i * 0.088 + (i % 2) * 0.018;
      const dur = 0.155 + (i % 3) * 0.024;
      const f0 = baseFreqs[i % baseFreqs.length];

      const osc = this.ctx.createOscillator();
      const bp = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();

      osc.type = "sawtooth";
      setParamAt(osc.frequency, safeExpVal(f0 * 0.94), t0);
      expRampParam(osc.frequency, safeExpVal(f0 * 1.15), t0 + dur * 0.38);
      expRampParam(osc.frequency, safeExpVal(f0 * 0.86), t0 + dur);

      bp.type = "bandpass";
      setParamAt(bp.frequency, safeExpVal(clamp(f0 * 1.08, 420.0, 680.0)), t0);
      bp.Q.value = 4.2;

      const peak = 0.135 * Math.pow(0.92, i);
      setParamAt(g.gain, MIN_EXP_VAL, t0);
      linRampParam(g.gain, safeExpVal(peak), t0 + 0.012);
      expRampParam(g.gain, MIN_EXP_VAL, t0 + dur);

      osc.connect(bp);
      bp.connect(g);
      g.connect(this.preMasterGain);
      osc.start(t0);
      osc.stop(t0 + dur + 0.015);

      if (this.noiseBuffer) {
        const wSrc = this.ctx.createBufferSource();
        wSrc.buffer = this.noiseBuffer;
        const wBp = this.ctx.createBiquadFilter();
        wBp.type = "bandpass";
        wBp.frequency.value = 920.0 + i * 110.0;
        wBp.Q.value = 1.75;
        const wGain = this.ctx.createGain();
        const wDur = 0.085;
        setParamAt(wGain.gain, MIN_EXP_VAL, t0 + 0.01);
        linRampParam(wGain.gain, 0.062, t0 + 0.01 + MIN_ATTACK_SEC);
        expRampParam(wGain.gain, MIN_EXP_VAL, t0 + 0.01 + wDur);
        wSrc.connect(wBp);
        wBp.connect(wGain);
        wGain.connect(this.preMasterGain);
        wSrc.start(t0 + 0.01);
        wSrc.stop(t0 + 0.02 + wDur);
      }
    }
  }

  /**
   * Ascending 16-Step C-Major9 TPU 8i Wafer Pickup Chime (`playTpuPickup`).
   * Staggers simultaneous multi-TPU pickups on a `40ms` ascending arpeggio grid (`sfxBus` only — zero music ducking!).
   */
  playTpuPickup(index = 0, tier = "trillium") {
    if (this._disposed) return;
    const safeIdx = clamp(Math.round(Number(index) || 0), 0, C_MAJ9_LADDER_HZ.length - 1);
    if (!this._shouldFireDedupe(`tpu_${safeIdx}`, 30.0)) return;
    this.sfxCounts.tpuPickup++;

    if (!this.enabled) return;
    if (!this.ctx) this._ensureContext();
    this.ensureResumed();
    if (!this.ctx || !this.preMasterGain) return;

    const now = this.ctx.currentTime;
    const baseStart = Math.max(now, Math.min(now + 0.48, this._nextTpuArpAudioTime || 0.0));
    this._nextTpuArpAudioTime = baseStart + 0.04;

    const f0 = C_MAJ9_LADDER_HZ[safeIdx];
    const isGold = tier === "ironwood_gold";

    const notes = isGold ? [f0, f0 * 1.25, f0 * 1.4983, f0 * 2.0] : [f0, f0 * 1.4983];
    const gains = isGold ? [0.165, 0.098, 0.088, 0.066] : [0.15, 0.076];

    for (let i = 0; i < notes.length; i++) {
      const tStart = baseStart + i * 0.028;
      const dur = isGold ? 0.38 : 0.26;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();

      osc.type = i === 0 ? "triangle" : "sine";
      setParamAt(osc.frequency, safeExpVal(notes[i]), tStart);

      setParamAt(g.gain, MIN_EXP_VAL, tStart);
      linRampParam(g.gain, safeExpVal(gains[i]), tStart + MIN_ATTACK_SEC);
      expRampParam(g.gain, MIN_EXP_VAL, tStart + dur);

      osc.connect(g);
      g.connect(this.preMasterGain);
      osc.start(tStart);
      osc.stop(tStart + dur + 0.015);
    }
  }

  /**
   * Microkitchen (`MK`) Espresso & Matcha Boost Sound-Design Layer on `sfxBus` (`playBoost`):
   *   1. Warm sub-bass punch (`92 Hz -> 45 Hz`)
   *   2. Frothy Espresso steam gentle filter bloom (`560 Hz -> 3450 Hz -> 1420 Hz`)
   *   3. Airy `Cmaj9` harmonic shimmer (`C5, E5, G5, B5, D6`), with `0` warp on music `playbackRate`!
   */
  playBoost() {
    if (this._disposed) return;
    if (!this._shouldFireDedupe("boost", 80.0)) return;
    this.sfxCounts.boost++;

    this.syncEnvironment();

    if (!this.enabled) return;
    if (!this.ctx) this._ensureContext();
    this.ensureResumed();
    if (!this.ctx || !this.preMasterGain) return;

    const now = this.ctx.currentTime;

    // 1. Warm Sub-Bass Boost Bloom (`92 Hz -> 45 Hz`)
    {
      const subOsc = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();
      subOsc.type = "sine";
      setParamAt(subOsc.frequency, 92.0, now);
      expRampParam(subOsc.frequency, 45.0, now + 0.38);

      setParamAt(subGain.gain, MIN_EXP_VAL, now);
      linRampParam(subGain.gain, 0.175, now + 0.022);
      expRampParam(subGain.gain, MIN_EXP_VAL, now + 0.44);

      subOsc.connect(subGain);
      subGain.connect(this.preMasterGain);
      subOsc.start(now);
      subOsc.stop(now + 0.46);
    }

    // 2. Frothy Espresso Steam Gentle Filter Bloom (`560 Hz -> 3450 Hz -> 1420 Hz`)
    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.value = 2.05;
      setParamAt(bp.frequency, 560.0, now);
      expRampParam(bp.frequency, 3450.0, now + 0.32);
      expRampParam(bp.frequency, 1420.0, now + 0.56);

      const g = this.ctx.createGain();
      setParamAt(g.gain, MIN_EXP_VAL, now);
      linRampParam(g.gain, 0.19, now + 0.028);
      expRampParam(g.gain, MIN_EXP_VAL, now + 0.58);

      src.connect(bp);
      bp.connect(g);
      g.connect(this.preMasterGain);
      src.start(now);
      src.stop(now + 0.60);
    }

    // 3. Airy `Cmaj9` Harmonic Shimmer (`C5, E5, G5, B5, D6`)
    const shimmerNotes = [523.25, 659.25, 783.99, 987.77, 1174.66];
    for (let i = 0; i < shimmerNotes.length; i++) {
      const t0 = now + i * 0.026;
      const dur = 0.48 - i * 0.03;
      const osc = this.ctx.createOscillator();
      const lp = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();

      osc.type = i % 2 === 0 ? "triangle" : "sine";
      setParamAt(osc.frequency, safeExpVal(shimmerNotes[i]), t0);

      lp.type = "lowpass";
      setParamAt(lp.frequency, 1100.0, t0);
      expRampParam(lp.frequency, 4600.0, t0 + 0.16);
      expRampParam(lp.frequency, 1800.0, t0 + dur);

      const peak = 0.068 * Math.pow(0.90, i);
      setParamAt(g.gain, MIN_EXP_VAL, t0);
      linRampParam(g.gain, safeExpVal(peak), t0 + 0.020);
      expRampParam(g.gain, MIN_EXP_VAL, t0 + dur);

      osc.connect(lp);
      lp.connect(g);
      g.connect(this.preMasterGain);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }
  }

  /**
   * Bunny-Hop Suspension Unload + Subtle Pelican Bill-Clack & Wing-Ruffle Foley (`playHop`).
   */
  playHop(isRamp = false, onTrainerStand = false) {
    if (this._disposed) return;
    if (!this._shouldFireDedupe("hop", 60.0)) return;
    this.sfxCounts.hop++;

    if (!this.enabled) return;
    if (!this.ctx) this._ensureContext();
    this.ensureResumed();
    if (!this.ctx || !this.preMasterGain) return;

    const now = this.ctx.currentTime;

    // Subtle avian bill-clack + feathered wing-ruffle on every jump/ramp launch!
    this._playPelicanBillClackAndWingRuffle(now + 0.010, isRamp ? 0.85 : 0.58, false);

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();

    if (onTrainerStand) {
      osc.type = "triangle";
      setParamAt(osc.frequency, 520.0, now);
      expRampParam(osc.frequency, 840.0, now + 0.072);
      expRampParam(osc.frequency, 620.0, now + 0.14);
      setParamAt(g.gain, MIN_EXP_VAL, now);
      linRampParam(g.gain, 0.12, now + MIN_ATTACK_SEC);
      expRampParam(g.gain, MIN_EXP_VAL, now + 0.15);
      osc.connect(g);
      g.connect(this.preMasterGain);
      osc.start(now);
      osc.stop(now + 0.165);
      return;
    }

    osc.type = "sine";
    setParamAt(osc.frequency, isRamp ? 132.0 : 158.0, now);
    expRampParam(osc.frequency, isRamp ? 460.0 : 380.0, now + (isRamp ? 0.15 : 0.11));

    setParamAt(g.gain, MIN_EXP_VAL, now);
    linRampParam(g.gain, isRamp ? 0.18 : 0.14, now + MIN_ATTACK_SEC);
    expRampParam(g.gain, MIN_EXP_VAL, now + (isRamp ? 0.19 : 0.13));

    osc.connect(g);
    g.connect(this.preMasterGain);
    osc.start(now);
    osc.stop(now + (isRamp ? 0.21 : 0.145));
  }

  /**
   * Cushioned Pneumatic Tire Touchdown Thud + Frame Settle & Feather Settle (`playLanding`).
   */
  playLanding(impact = 1.0) {
    if (this._disposed) return;
    if (!this._shouldFireDedupe("landing", 75.0)) return;
    this.sfxCounts.landing++;

    if (!this.enabled) return;
    if (!this.ctx) this._ensureContext();
    this.ensureResumed();
    if (!this.ctx || !this.preMasterGain) return;

    const now = this.ctx.currentTime;
    const scale = clamp(Number.isFinite(Number(impact)) ? Number(impact) : 1.0, 0.3, 1.5);

    // 1. Pneumatic rubber tire compression thud (`112 Hz -> 44 Hz`)
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sine";
    setParamAt(osc.frequency, 112.0, now);
    expRampParam(osc.frequency, 44.0, now + 0.088);

    setParamAt(g.gain, MIN_EXP_VAL, now);
    linRampParam(g.gain, safeExpVal(0.155 * scale), now + MIN_ATTACK_SEC);
    expRampParam(g.gain, MIN_EXP_VAL, now + 0.108);

    osc.connect(g);
    g.connect(this.preMasterGain);
    osc.start(now);
    osc.stop(now + 0.118);

    // 2. Tire tread scrub + subtle Pelican wing-feather settle on firm landings
    if (scale > 0.65) {
      this._playPelicanBillClackAndWingRuffle(now + 0.018, 0.45 * scale, false);
    }
  }

  /**
   * `16 / 16` Shoreline Supercluster Online Polyphonic `Cmaj9#11` Synth Fanfare (`playClusterBootFanfare`).
   * Routed strictly on `sfxBus` with ZERO `musicBus` ducking!
   */
  playClusterBootFanfare() {
    if (this._disposed) return;
    if (!this._shouldFireDedupe("cluster_fanfare", 500.0)) return;
    this.sfxCounts.clusterFanfare++;

    if (!this.enabled) return;
    if (!this.ctx) this._ensureContext();
    this.ensureResumed();
    if (!this.ctx || !this.preMasterGain) return;

    const now = this.ctx.currentTime;

    const chordHz = [130.81, 261.63, 329.63, 392.00, 493.88, 587.33, 739.99, 1046.50];
    for (let i = 0; i < chordHz.length; i++) {
      const t0 = now + i * 0.044;
      const dur = 1.15 - i * 0.05;
      const osc = this.ctx.createOscillator();
      const lp = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();

      osc.type = i === 0 ? "triangle" : i % 2 === 0 ? "sawtooth" : "triangle";
      setParamAt(osc.frequency, safeExpVal(chordHz[i]), t0);

      lp.type = "lowpass";
      setParamAt(lp.frequency, 3200.0, t0);
      expRampParam(lp.frequency, 1180.0, t0 + dur);

      const peak = i === 0 ? 0.135 : 0.080;
      setParamAt(g.gain, MIN_EXP_VAL, t0);
      linRampParam(g.gain, safeExpVal(peak), t0 + 0.018);
      expRampParam(g.gain, MIN_EXP_VAL, t0 + dur);

      osc.connect(lp);
      lp.connect(g);
      g.connect(this.preMasterGain);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }
  }

  /**
   * Wave 4 Shoreline Whip-Skid (`67.85s -> 68.85s`): Rubber-on-Honed-Basalt Bicycle Brake-Skid Chirp + Fine Stone Grit Rasp!
   * Routed strictly on `sfxBus` (`preMasterGain`) with ZERO `musicBus` ducking or pitch warping!
   */
  _playShorelineWhipSkidChirp(startTime = null, intensity = 1.0) {
    if (this._disposed) return;
    if (!this._shouldFireDedupe("shoreline_skid_chirp", 260.0)) return;
    this.sfxCounts.shorelineSkidChirp++;

    if (!this.enabled) return;
    if (!this.ctx) this._ensureContext();
    this.ensureResumed();
    if (!this.ctx || !this.preMasterGain) return;

    const t0 =
      startTime !== null && Number.isFinite(Number(startTime))
        ? Math.max(this.ctx.currentTime, Number(startTime))
        : this.ctx.currentTime;
    const scale = clamp(Number.isFinite(Number(intensity)) ? Number(intensity) : 1.0, 0.35, 1.25);

    // 1. Stick-slip vulcanized bicycle tire rubber squeal/chirp (`1580 -> 1080 -> 740 Hz` + `2280 -> 1490 Hz` harmonic)
    const freqs = [
      [1580.0, 1080.0, 740.0, 0.088],
      [2280.0, 1490.0, 1020.0, 0.046],
    ];
    for (let i = 0; i < freqs.length; i++) {
      const [fStart, fMid, fEnd, peakAmp] = freqs[i];
      const osc = this.ctx.createOscillator();
      const bp = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();

      osc.type = i === 0 ? "triangle" : "sawtooth";
      setParamAt(osc.frequency, fStart, t0);
      expRampParam(osc.frequency, fMid, t0 + 0.32);
      expRampParam(osc.frequency, fEnd, t0 + 0.86);

      bp.type = "bandpass";
      setParamAt(bp.frequency, fStart * 1.05, t0);
      expRampParam(bp.frequency, fEnd * 1.12, t0 + 0.86);
      bp.Q.value = 4.6;

      setParamAt(g.gain, MIN_EXP_VAL, t0);
      linRampParam(g.gain, safeExpVal(peakAmp * scale), t0 + 0.028);
      expRampParam(g.gain, safeExpVal(peakAmp * 0.62 * scale), t0 + 0.48);
      expRampParam(g.gain, MIN_EXP_VAL, t0 + 0.88);

      osc.connect(bp);
      bp.connect(g);
      g.connect(this.preMasterGain);
      osc.start(t0);
      osc.stop(t0 + 0.90);
    }

    // 2. Honed granite/basalt plaza fine aggregate grit rasp (`2.75 kHz` swept noise scrub across the `~0.92s` slide)
    if (this.noiseBuffer) {
      const nSrc = this.ctx.createBufferSource();
      nSrc.buffer = this.noiseBuffer;
      nSrc.loop = true;

      const gritBp = this.ctx.createBiquadFilter();
      gritBp.type = "bandpass";
      setParamAt(gritBp.frequency, 2860.0, t0);
      expRampParam(gritBp.frequency, 1680.0, t0 + 0.90);
      gritBp.Q.value = 1.85;

      const gritGain = this.ctx.createGain();
      setParamAt(gritGain.gain, MIN_EXP_VAL, t0);
      linRampParam(gritGain.gain, safeExpVal(0.095 * scale), t0 + 0.032);
      expRampParam(gritGain.gain, safeExpVal(0.058 * scale), t0 + 0.56);
      expRampParam(gritGain.gain, MIN_EXP_VAL, t0 + 0.92);

      nSrc.connect(gritBp);
      gritBp.connect(gritGain);
      gritGain.connect(this.preMasterGain);
      nSrc.start(t0);
      nSrc.stop(t0 + 0.94);
    }
  }

  /**
   * Wave 4 Shoreline Completion Flourish (`~68.85s` Whip-Skid Arrest -> Off-Saddle Webbed-Foot Plant & Peacock Wing-Fan!):
   * Dual webbed-foot plaza plant thuds + joyful Pelican bill-clack & broad feather fan whoosh + warm sunlit `Gmaj9 -> Cmaj9#11` cadence!
   */
  playShorelineCelebrationFlourish(startTime = null) {
    if (this._disposed) return;
    if (!this._shouldFireDedupe("shoreline_celebration", 400.0)) return;
    this.sfxCounts.shorelineCelebration++;

    if (!this.enabled) return;
    if (!this.ctx) this._ensureContext();
    this.ensureResumed();
    if (!this.ctx || !this.preMasterGain) return;

    const t0 =
      startTime !== null && Number.isFinite(Number(startTime))
        ? Math.max(this.ctx.currentTime, Number(startTime))
        : this.ctx.currentTime;

    // 1. Crisp left + right webbed-foot ground straddle plant onto honed basalt plaza (`+0.02s` & `+0.09s`)
    this._triggerWebbedFootPedalStomp(t0 + 0.020, 0.82, 0);
    this._triggerWebbedFootPedalStomp(t0 + 0.092, 0.88, 1);

    // 2. Joyful Pelican celebratory bill-clack + broad Peacock-Strut Wing-Fan feather whoosh (`+0.14s` & `+0.48s`)
    this._playPelicanBillClackAndWingRuffle(t0 + 0.140, 0.92, false);
    this._playPelicanBillClackAndWingRuffle(t0 + 0.485, 0.76, false);

    // 3. Warm triumphant Shoreline Amphitheatre sunlit harmonic flourish (`sfxBus` ONLY, 0 `musicBus` ducking!)
    const notesHz = [196.00, 293.66, 392.00, 493.88, 587.33, 783.99, 1046.50, 1318.51];
    for (let i = 0; i < notesHz.length; i++) {
      const tn = t0 + 0.055 + i * 0.042;
      const dur = 1.38 - i * 0.06;
      const osc = this.ctx.createOscillator();
      const lp = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();

      osc.type = i < 2 ? "triangle" : i % 2 === 0 ? "sine" : "triangle";
      setParamAt(osc.frequency, safeExpVal(notesHz[i]), tn);

      lp.type = "lowpass";
      setParamAt(lp.frequency, 3600.0, tn);
      expRampParam(lp.frequency, 1320.0, tn + dur);

      const peak = i === 0 ? 0.105 : 0.064;
      setParamAt(g.gain, MIN_EXP_VAL, tn);
      linRampParam(g.gain, safeExpVal(peak), tn + 0.020);
      expRampParam(g.gain, MIN_EXP_VAL, tn + dur);

      osc.connect(lp);
      lp.connect(g);
      g.connect(this.preMasterGain);
      osc.start(tn);
      osc.stop(tn + dur + 0.02);
    }
  }

  /**
   * Subtle crisp mechanical detent click for HUD toggles (`X-Ray`, camera modes, clip switches).
   */
  triggerUiClick() {
    if (this._disposed) return;
    if (!this._shouldFireDedupe("ui_click", 18.0)) return;
    this.sfxCounts.uiClick++;

    if (!this.enabled) return;
    if (!this.ctx) this._ensureContext();
    this.ensureResumed();
    if (!this.ctx || !this.preMasterGain) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();

    osc.type = "triangle";
    setParamAt(osc.frequency, 1580.0, now);
    expRampParam(osc.frequency, 660.0, now + 0.014);

    setParamAt(g.gain, MIN_EXP_VAL, now);
    linRampParam(g.gain, 0.048, now + MIN_ATTACK_SEC);
    expRampParam(g.gain, MIN_EXP_VAL, now + 0.017);

    osc.connect(g);
    g.connect(this.preMasterGain);
    osc.start(now);
    osc.stop(now + 0.019);
  }

  playUiClick() {
    this.triggerUiClick();
  }

  /**
   * Cleanly detaches all `bus` and `window` event listeners and stops active source nodes.
   */
  dispose() {
    if (this._disposed) return;
    this._disposed = true;

    for (let i = 0; i < this._busListeners.length; i++) {
      const [ev, fn] = this._busListeners[i];
      bus.removeEventListener(ev, fn);
    }
    this._busListeners.length = 0;

    if (this._gestureUnlockBound && typeof window !== "undefined" && this._onGestureHandler) {
      window.removeEventListener("pointerdown", this._onGestureHandler, this._gestureOpts);
      window.removeEventListener("touchstart", this._onGestureHandler, this._gestureOpts);
      window.removeEventListener("keydown", this._onGestureHandler, this._gestureOpts);
      this._gestureUnlockBound = false;
      this._onGestureHandler = null;
    }

    if (this.lyriaSource) {
      try {
        this.lyriaSource.stop();
        this.lyriaSource.disconnect();
      } catch (_err) {
        // Ignore already stopped source
      }
      this.lyriaSource = null;
    }

    for (let i = 0; i < this._continuousSources.length; i++) {
      try {
        this._continuousSources[i].stop();
        this._continuousSources[i].disconnect();
      } catch (_err) {
        // Ignore
      }
    }
    this._continuousSources.length = 0;
    this._dedupeAtMs.clear();
  }
}
