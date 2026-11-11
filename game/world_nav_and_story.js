/**
 * world_nav_and_story.js — Fixed-Timestep Open-World Campus Physics, Traffic,
 * Collision Deflection & 54s Story Auto-Pilot Engine (v3.0).
 *
 * STRICT MODULE BOUNDARY:
 *   - ZERO `three` imports (100% pure deterministic math, standalone verifiable in Node.js).
 *   - Zero `Math.random()` (100% seeded `mulberry32` PRNG).
 *   - Heading Convention (`src/contract.js`):
 *       `yaw = 0` is due North (`dx = Math.sin(yaw), dz = -Math.cos(yaw)`),
 *       `+PI/2` = due East (`+X`), `-PI/2` = due West (`-X`), `PI` = due South (`+Z`).
 */

import {
  BIKE_CONSTANTS,
  WORLD_BOUNDS,
  GYM_BREAKOUT_CONFIG,
  KINETIC_PINWHEELS,
  CAMPUS_INTERSECTIONS,
  CAMPUS_BUILDING_BLOCKS,
  CAMPUS_LANDMARKS,
  JUMP_RAMPS,
  LANDING_RAMPS,
  BAYVIEW_LANDING_RAMP,
  MK_BOOST_PADS,
  TPU_SPAWNS,
  TPU_PICKUP_RADIUS_M,
  TPU_MODEL_LABEL,
  WAYMO_KINEMATICS_SPEC,
  WAYMO_ROUTES,
  CAMPUS_CLIPS,
  T_TOTAL,
  state,
  bus,
  dispatchAction,
  deriveTourSummary,
  normalizeStateKey,
  DEMO_ACTIONS,
  DEMO_EVENTS,
} from "../contract.js";
import {
  clamp,
  KIN_CONSTANTS,
  CLIP5_PLANK_PITCH_M,
  createMulberry32,
  getOpenWorldTerrainHeight,
  getOpenWorldSurfaceType,
  getStevensCreekBridgeParam,
  evaluateJumpRampAtPoint,
  evaluateLandingRampAtPoint,
  solveOpenWorldWheelbasePose,
  solveDrivetrainKinematics,
  createBikeDynamicsState,
  syncBikeDynamicsAnalytically,
  stepBikeDynamicsSpring,
  evaluatePelicanSurpriseKinematics,
  TRAINER_SPRINT_SPEC,
  evaluateTrainerSprintKinematics,
} from "../rig/kin.js";

const FIXED_DT = 1.0 / 60.0;
const SUB_STEPS = 8; // 8 swept sub-steps per 60Hz tick in Free Roam to prevent 2x-speed wall/curb tunneling
const TWO_PI = Math.PI * 2.0;
const RAD_TO_DEG = 180.0 / Math.PI;
const GEAR_RATIO = BIKE_CONSTANTS.chainringTeeth / BIKE_CONSTANTS.rearCogTeeth;

const PLAYER_COLLISION_RADIUS_M = 0.72;
export { TPU_PICKUP_RADIUS_M, TPU_SPAWNS, TPU_MODEL_LABEL, WAYMO_KINEMATICS_SPEC };

const WAYMO_MAX_STEER_RAD = (WAYMO_KINEMATICS_SPEC.maxSteerDeg * Math.PI) / 180.0;
const WAYMO_KAPPA_MAX = Math.tan(WAYMO_MAX_STEER_RAD) / WAYMO_KINEMATICS_SPEC.wheelbaseM;

// V5 Story Auto-Pilot Master Timestamps (`72.0s` Total Runtime, exact 60Hz tick boundaries!)
export const V5_STORY_DURATION_SEC = 72.0;
export const V5_TRAINER_RELEASE_SEC = 7.40; // Exact `444 / 60` frame boundary
export const TRAINER_STAND_ELEVATION_M = 0.052; // V8-10B: +52mm elevation above 0.000m gym floor
export const V5_GLASS_SMASH_SEC = 9.40;     // Exact `564 / 60` frame boundary (`4x6` muntin bay smash!)
export const STAN_TREX_POS = Object.freeze({ x: -118.0, y: 0.0, z: -50.0 });
export const STAN_SKULL_WORLD = Object.freeze({ x: -115.6, y: 3.85, z: -47.4 });
export const STAN_ROAR_TRIGGER_SEC = 40.20; // Exact `2412 / 60` frame boundary
export const PELICAN_SURPRISE_DELAY_SEC = 0.12;
export const PELICAN_SURPRISE_ONSET_SEC = STAN_ROAR_TRIGGER_SEC + PELICAN_SURPRISE_DELAY_SEC; // 40.32s

// V8-06 Dramatic Newtonian Bay View Ramp Jump (`~4.05m` Apex in `3.8–4.2m` gate, `g = -9.81 m/s^2`, `1.0x -> 0.25x -> 1.0x` Slow-Mo!)
export const SLOWMO_MIN_TIME_SCALE = 0.25;
export const SLOWMO_TIME_SCALE = 0.25;
export const SLOWMO_TAKEOFF_SEC = 53.55; // Exact `3213 / 60` frame boundary
export const SLOWMO_LAND_SEC = 57.20;    // Exact `3432 / 60` frame boundary (`3.65s` screen duration)
export const SLOWMO_SCREEN_DUR = SLOWMO_LAND_SEC - SLOWMO_TAKEOFF_SEC; // 3.65s
const SLOWMO_EASE_FRAC = 0.22; // Smooth 0.803s ease-in (1.0->0.25), 2.044s 0.25x upper-arc plateau, 0.803s ease-out (0.25->1.0)
export const SLOWMO_FLIGHT_TAU =
  SLOWMO_SCREEN_DUR * (SLOWMO_MIN_TIME_SCALE + (1.0 - SLOWMO_MIN_TIME_SCALE) * SLOWMO_EASE_FRAC); // Exact `1.514750s` physical flight time
export const SLOWMO_TAKEOFF_Z = 28.30; // Exact North lip of `ramp_bayview_waterfront` (center z=32.0, halfL=3.7)
export const SLOWMO_V_HORIZ = 8.20;    // 8.20 m/s (29.52 km/h) athletic sprint into the 19 deg wooden kicker!
export const SLOWMO_VZ = -SLOWMO_V_HORIZ;
export const SLOWMO_RAMP_TOE_Z = 35.70;
export const SLOWMO_RAMP_TOE_SEC =
  SLOWMO_TAKEOFF_SEC - (SLOWMO_RAMP_TOE_Z - SLOWMO_TAKEOFF_Z) / SLOWMO_V_HORIZ; // 52.647561s
export const SLOWMO_LAND_Z = SLOWMO_TAKEOFF_Z + SLOWMO_VZ * SLOWMO_FLIGHT_TAU; // 15.87905m on `bayview_landing_ramp`

const _bayviewTakeoffPose = solveOpenWorldWheelbasePose(
  156.0,
  SLOWMO_TAKEOFF_Z,
  0.0,
  BIKE_CONSTANTS.wheelbaseM,
  BIKE_CONSTANTS.wheelRadiusM,
  0.0
);
const _bayviewLandingPose = solveOpenWorldWheelbasePose(
  156.0,
  SLOWMO_LAND_Z,
  0.0,
  BIKE_CONSTANTS.wheelbaseM,
  BIKE_CONSTANTS.wheelRadiusM,
  0.0
);
export const SLOWMO_TAKEOFF_Y = _bayviewTakeoffPose.centerY; // ~1.4386m
export const SLOWMO_LAND_Y = _bayviewLandingPose.centerY;    // ~1.0229m on -13.3 deg landing ramp
export const SLOWMO_TAKEOFF_PITCH_RAD = _bayviewTakeoffPose.slopePitchRad; // +18.31 deg
export const SLOWMO_LAND_PITCH_RAD = _bayviewLandingPose.slopePitchRad;    // -13.33 deg
export const SLOWMO_VY0 =
  (SLOWMO_LAND_Y -
    SLOWMO_TAKEOFF_Y +
    0.5 * 9.81 * SLOWMO_FLIGHT_TAU * SLOWMO_FLIGHT_TAU) /
  SLOWMO_FLIGHT_TAU; // ~7.1560 m/s -> pure Newtonian apex `4.0485m` at `z = 22.32m` (`tpu_12`)!

function smootherstepIntegral01(u) {
  const s = clamp(u, 0.0, 1.0);
  const s2 = s * s;
  const s4 = s2 * s2;
  return s4 * (2.5 - 3.0 * s + s2);
}

/**
 * Analytical variable `timeScale(t)` (`1.0x -> 0.25x -> 1.0x`) and exact physical flight clock `tau(t)`
 * (`d(tau)/dt === timeScale(t)`) across `[SLOWMO_TAKEOFF_SEC, SLOWMO_LAND_SEC]`.
 */
export function evaluateSlowMoClock(seqT) {
  const t = Number(seqT) || 0.0;
  if (t <= SLOWMO_TAKEOFF_SEC) {
    return { active: false, uScreen: 0.0, timeScale: 1.0, tau: 0.0, uAir: 0.0 };
  }
  if (t >= SLOWMO_LAND_SEC) {
    return { active: false, uScreen: 1.0, timeScale: 1.0, tau: SLOWMO_FLIGHT_TAU, uAir: 1.0 };
  }
  const u = clamp((t - SLOWMO_TAKEOFF_SEC) / SLOWMO_SCREEN_DUR, 0.0, 1.0);
  const r = SLOWMO_EASE_FRAC;
  const minS = SLOWMO_MIN_TIME_SCALE;
  const deltaS = 1.0 - minS;
  let timeScale = minS;
  let normInt = 0.0;

  if (u < r) {
    const w = u / r;
    timeScale = 1.0 - deltaS * smootherstep01(w);
    normInt = u - deltaS * r * smootherstepIntegral01(w);
  } else if (u <= 1.0 - r) {
    timeScale = minS;
    normInt = (1.0 - 0.5 * deltaS) * r + minS * (u - r);
  } else {
    const w = (u - (1.0 - r)) / r;
    timeScale = minS + deltaS * smootherstep01(w);
    normInt =
      (1.0 - 0.5 * deltaS) * r +
      minS * (1.0 - 2.0 * r) +
      r * (minS * w + deltaS * smootherstepIntegral01(w));
  }

  const tau = clamp(SLOWMO_SCREEN_DUR * normInt, 0.0, SLOWMO_FLIGHT_TAU);
  const uAir = clamp(tau / SLOWMO_FLIGHT_TAU, 0.0, 1.0);
  return { active: true, uScreen: u, timeScale, tau, uAir };
}

/**
 * Exact Chapter Cut Boundaries (`V5_STORY_DURATION_SEC = 72.0s`) — all integer multiples of `FIXED_DT = 1/60`!
 * Each chapter lives on the unified open-world campus map (Free Roam rides continuously anywhere with zero cuts),
 * while `play_all` presents 5 unhurried, breezy `14–20 km/h` scenic vignettes separated by clean Director Cuts.
 */
export const STORY_CHAPTER_BOUNDS = Object.freeze([
  { index: 0, id: "clip1", startSec: 0.0, endSec: 21.5 },
  { index: 1, id: "clip2", startSec: 21.5, endSec: 36.5 },
  { index: 2, id: "clip3", startSec: 36.5, endSec: 49.0 },
  { index: 3, id: "clip4", startSec: 49.0, endSec: 61.0 },
  { index: 4, id: "clip5", startSec: 61.0, endSec: 72.0 },
]);

export const V5_TPU_SPAWNS = TPU_SPAWNS;

/**
 * V5 Physical-Contact TPU Collection (`TPU_PICKUP_RADIUS_M = 0.92m`):
 * Zero early or time-window awards — all 16 `TPU_SPAWNS` sit directly on the Pelican's front-basket line
 * (`max closest-approach <= 0.006m`) and trigger strictly on physical contact (`dist2D <= 0.92m`).
 */
export const STORY_TRANSIT_TPU_AWARDS = Object.freeze([]);

function knotForBasketContact(t, tx, tz, vx, vz) {
  const s = Math.hypot(vx, vz) || 1.0;
  return {
    t,
    x: Number((tx - (vx / s) * 0.54).toFixed(4)),
    z: Number((tz - (vz / s) * 0.54).toFixed(4)),
    vx,
    vz,
  };
}

const RAW_CHAPTER_WAYPOINTS = Object.freeze([
  // Chapter 1 (`0.00s – 21.50s`, `gym_breakout`): Slow Cinema Spin Studio Open (0-7.40s) -> 9.40s 4x6 Muntin Window Smash -> Pinwheel Spine -> Charleston Rd + Waymo Gen 6
  [
    { t: V5_TRAINER_RELEASE_SEC, x: 0.0, z: 140.20, vx: 0.0, vz: -4.35 },
    { t: V5_GLASS_SMASH_SEC, x: 0.0, z: 131.20, vx: 0.0, vz: -4.65 }, // Seamless 4x6 Muntin Window Smash (`z = 131.20` at exact `9.40s`!)
    { t: 12.15, x: 0.0, z: 118.00, vx: 0.0, vz: -4.65 },              // `tpu_01` (Gradient Canopy Drop-Off)
    { t: 15.60, x: 0.0, z: 102.00, vx: 0.0, vz: -4.55 },              // `tpu_02` (16 Kinetic Pinwheels spine)
    { t: 16.92, x: 0.0, z: 96.00, vx: 0.0, vz: -4.55 },               // `mk_pinwheel_plaza` (Canopy MK Espresso)
    { t: 19.05, x: -0.35, z: 86.30, vx: -0.85, vz: -4.45 },           // Approaches Charleston Rd intersection
    { t: 20.35, x: -3.55, z: 81.90, vx: -3.85, vz: -1.60 },           // Smooth rounded turn into Charleston Rd bike lane (`z = 81.3`)
    { t: 21.50, x: -8.55, z: 81.20, vx: -4.50, vz: -0.10 },           // `tpu_03` + Cruising Westbound alongside Waymo Gen 6!
  ],
  // Chapter 2 (`21.50s – 36.50s`, `android_lawn`): Low Lawn-Edge Glide past 3D Grass & Bugdroid -> 90° Top-Down 4-Way Crosswalk!
  [
    { t: 21.50, x: -113.70, z: 109.90, vx: -0.06, vz: -4.45 },        // Enters Charleston West / Android Lawn edge (`16.0 km/h`)
    knotForBasketContact(23.60, -113.82, 100.55, -0.10, -4.42),       // `tpu_04` (`(-113.82, 100.55)`)
    { t: 25.05, x: -114.35, z: 94.65, vx: -0.92, vz: -4.35 },         // Skims cleanly past waving Bugdroid plinth (`R=3.17m`) & Dessert Statues!
    knotForBasketContact(26.75, -117.58, 87.02, -0.85, -4.38),        // `tpu_05` (`(-117.58, 87.02)` Ironwood Gold)
    { t: 28.80, x: -118.00, z: 78.55, vx: 0.0, vz: -4.52 },           // Enters South Zebra Crosswalk as Shot 6 cuts to 90° Top-Down!
    knotForBasketContact(31.75, -118.00, 65.18, 0.0, -4.55),          // `tpu_06` (`(-118.00, 65.18)`) while Waymo Gen 6 yields behind stop bar!
    { t: 34.30, x: -118.00, z: 54.00, vx: 0.0, vz: -4.55 },           // `mk_android_lawn` (Android Matcha Bar)
    { t: 36.50, x: -118.00, z: 44.00, vx: 0.0, vz: -4.55 },
  ],
  // Chapter 3 (`36.50s – 49.00s`, `googleplex_trex`): Stan T-Rex Sudden Roar (`40.20s`) -> Pelican Surprise (`40.32s`) + Crisp Evasive S-Turn (`~21.5 km/h` -> `16.5 km/h`) -> 31° Drivetrain Macro!
  [
    { t: 36.50, x: -118.00, z: -33.75, vx: 0.0, vz: -4.45 },          // Enters Googleplex Courtyard Paver Walk (`16.0 km/h`)
    knotForBasketContact(37.60, -117.96, -39.06, 0.65, -4.45),        // `tpu_07` (`(-117.96, -39.06)`) while Stan's head tracks Pelican
    { t: 38.90, x: -115.10, z: -44.05, vx: 3.65, vz: -2.45 },         // Smooth North-East curve into medium-wide two-shot with Stan
    knotForBasketContact(STAN_ROAR_TRIGGER_SEC, -109.12, -43.40, 4.15, 2.15), // `tpu_08` @ `40.20s` — STAN WHIPS HEAD & ROARS!
    { t: 41.15, x: -104.70, z: -41.70, vx: 5.76, vz: 1.55 },          // EVASIVE S-TURN DART AWAY FROM STAN (`21.47 km/h` peak, left bank `kappa < 0`)!
    { t: 42.15, x: -100.85, z: -38.45, vx: 0.30, vz: 4.57 },          // S-TURN COUNTER-CARVE SOUTH (`16.49 km/h` settle, right counter-bank `kappa > 0`)!
    knotForBasketContact(44.75, -102.00, -25.89, 0.35, 4.55),         // `tpu_09` (`(-102.00, -25.89)`) before Shot 8 Drivetrain Macro cut (`44.80s`)!
    { t: 46.60, x: -98.15, z: -19.55, vx: 3.35, vz: 2.35 },           // `mk_plex_courtyard` (`(-96, -18)`, `d = 2.65m <= 3.2m`)
    { t: 48.25, x: -91.25, z: -18.06, vx: 4.55, vz: 0.12 },           // Smooth wide-radius merge onto Eastbound Amphitheatre Pkwy (`< 45 deg/s`)
    { t: 49.00, x: -87.82, z: -18.00, vx: 4.58, vz: 0.0 },
  ],
  // Chapter 4 (`49.00s – 61.00s`, `bay_view_ramp`): Sunlit Bay View Waterfront -> Cold Brew Boost -> 8.20 m/s Kicker Sprint -> 4.05m Newtonian 0.25x Slow-Mo Jump onto Landing Ramp!
  [
    { t: 49.00, x: 156.0, z: 60.08, vx: 0.0, vz: -4.65 },
    { t: 49.53, x: 156.0, z: 57.50, vx: 0.0, vz: -5.10 },             // `mk_waterfront` (`z = 57.5` Bay View Cold Brew Cart!)
    { t: 50.83, x: 156.0, z: 49.71, vx: 0.0, vz: -6.90 },             // `tpu_10` (`(156, 49.71)`)
    { t: 52.132, x: 156.0, z: 39.90, vx: 0.0, vz: -8.12 },            // `tpu_11` (`(156, 39.90)`) building sprint speed!
    { t: SLOWMO_RAMP_TOE_SEC, x: 156.0, z: SLOWMO_RAMP_TOE_Z, vx: 0.0, vz: SLOWMO_VZ }, // Enters wooden ramp toe at `8.20 m/s` (`29.5 km/h`)!
    { t: SLOWMO_TAKEOFF_SEC, x: 156.0, z: SLOWMO_TAKEOFF_Z, vx: 0.0, vz: SLOWMO_VZ },   // Preload crouch + bunny-hop launch off `+1.44m` `~19 deg` lip at `53.55s`!
    { t: SLOWMO_LAND_SEC, x: 156.0, z: SLOWMO_LAND_Z, vx: 0.0, vz: SLOWMO_VZ },         // Tangent touchdown on `-13.3 deg` `bayview_landing_ramp` at `57.20s` (`tpu_12` snatched at `4.05m` apex)!
    { t: 57.81, x: 156.0, z: 11.30, vx: 0.0, vz: -6.80 },             // Smooth rollout off `bayview_landing_ramp` North toe (`z = 11.30m`)
    { t: 58.40, x: 156.0, z: 7.80, vx: 0.0, vz: -5.10 },              // `tpu_13` (`(156, 7.80)`)
    { t: 61.00, x: 156.0, z: -4.55, vx: 0.0, vz: -4.45 },
  ],
  // Chapter 5 (`61.00s – 72.00s`, `shoreline_finale`): Arched Corten Bridge -> Crisp `~4.8 m/s` (`~10.8 MPH`) Pickup of `tpu_16` @ `67.85s` -> Decoupled Whip-Skid (`67.85s–68.85s`) Facing `GEMINI 4 CARBON` -> Off-Saddle Straddle & Peacock-Strut Wing-Fan Finale (`68.85s–72.00s`)!
  (() => {
    const brLen = Math.hypot(-34.0, -72.0); // 79.6241m
    const ux = -34.0 / brLen; // -0.427006
    const uz = -72.0 / brLen; // -0.904249
    return [
      { t: 61.00, x: 28.32, z: -136.15, vx: ux * 6.55, vz: uz * 6.55 },         // Arched Corten Stevens Creek Bridge (`+0.784m` arch > `0.75m`!)
      knotForBasketContact(62.40, 24.18, -144.91, ux * 6.75, uz * 6.75),        // `tpu_14` (`(24.18, -144.91)`)
      knotForBasketContact(64.90, 16.92, -160.57, ux * 5.85, uz * 5.85),        // `tpu_15` (`(16.92, -160.57)`) North bridge portal
      { t: 65.95, x: 15.3693, z: -166.7631, vx: -0.78, vz: -4.76 },             // Carrying crisp `4.82 m/s` (`10.79 MPH`) onto Shoreline Esplanade
      knotForBasketContact(67.85, 13.80, -176.34, -0.78, -4.76),                // `tpu_16` (`(13.80, -176.34)` @ `4.82 m/s` -> 16/16 SUPERCLUSTER ONLINE + Left Whip-Skid!)
      { t: 72.00, x: 13.2806, z: -176.8193, vx: 0.0, vz: 0.0 },                 // Medallion stop marker (evaluated analytically for `t > 67.85s`)
    ];
  })(),
]);

export const STORY_WAYPOINTS = RAW_CHAPTER_WAYPOINTS;

/**
 * Director Cut Cinematography Schedule (`cinema` camera mode) — 10 Telephoto Cinema Shots (`25°–40.5° FOV`)
 * featuring V5 Locked Option 1 Slow Cinema Cold Open (`0.00s - 12.20s`, zero whip-tilt spikes) +
 * Medium-Wide Stan T-Rex Roar & Pelican Evasive S-Turn Dual Framing (`36.50s - 44.80s`).
 */
export const DIRECTOR_SHOT_TABLE = Object.freeze([
  // 1. `0.00s – 3.20s`: Slow, Weighted Spin-Studio Floor Dolly (`25° FOV`) — glides past flat foreground `59 AA` hex dumbbell into billowing burnout smoke, red roller nip & pumping orange webbed foot while Pelican head/torso stay cleanly above frame (`ndc.y > 1.0`)!
  {
    shotId: "shot_01_spin_ad_floor_dolly",
    tStart: 0.00,
    tEnd: 3.20,
    shotType: "spin_ad_floor_macro",
    hardCut: true,
    fov: 25,
    anchorGroundY: true,
    cam: { right: 0.76, up: 0.20, back: 2.78 },
    look: { right: 0.10, up: 0.04, forward: -0.34 },
    label: "",
  },
  // 2. `3.20s – 6.70s`: Buttery `3.5s` C2-Continuous Cinema Crane Rise & Gentle Arc (`25° -> 34° FOV`, peak angular velocity `~13 deg/s`, zero whip!) revealing deadpan California Brown Pelican inside luxury cedar/maple Google spin studio!
  {
    shotId: "shot_02_cinema_crane_pelican_reveal",
    tStart: 3.20,
    tEnd: 6.70,
    shotType: "whip_tilt_pelican_reveal",
    hardCut: false,
    fov: 34,
    anchorGroundY: true,
    cam: { right: 2.38, up: 1.16, back: 1.95 },
    look: { right: -0.18, up: 0.96, forward: 1.15 },
    label: "",
  },
  // 3. `6.70s – 12.20s`: Deadpan Hold (`6.70s – 7.35s`), Stand Release (`7.40s`), Smooth Low Tracking Glide & `4x6` Muntin Window Smash (`9.40s`) into Sunlit Pinwheel Plaza (`34° -> 38° FOV`)!
  {
    shotId: "shot_03_chase_through_window_smash",
    tStart: 6.70,
    tEnd: 12.20,
    shotType: "chase_through_window_smash",
    hardCut: false,
    fov: 38,
    cam: { right: 0.42, up: 1.06, back: 3.25 },
    look: { right: 0.0, up: 0.96, forward: 3.40 },
    label: "",
  },
  // 4. `12.20s – 21.50s`: Low Street-Level Telephoto Lead Shot (`34° FOV`) alongside Waymo Gen 6 on Charleston Rd
  {
    shotId: "shot_04_charleston_waymo_lead",
    tStart: 12.20,
    tEnd: 21.50,
    shotType: "waymo_street_pass",
    hardCut: true,
    fov: 34,
    cam: { right: 2.05, up: 0.92, back: -7.25 },
    look: { right: 1.95, up: 0.86, forward: -0.40 },
    label: "",
  },
  // 5. `21.50s – 28.80s`: Low Lawn-Edge Tracking Glide (`36° FOV`) past swaying 3D grass blades, Santa Cruz foothills & Android statues
  {
    shotId: "shot_05_android_lawn_glide",
    tStart: 21.50,
    tEnd: 28.80,
    shotType: "android_lawn_glide",
    hardCut: true,
    fov: 36,
    cam: { right: 3.75, up: 0.86, back: -2.85 },
    look: { right: -0.55, up: 0.82, forward: 0.25 },
    label: "",
  },
  // 6. `28.80s – 36.50s`: Crisp 90° Top-Down Overhead 4-Way Zebra Crosswalk Shot (`38° FOV`, `up: 24.8m`, framing all 4 crosswalks + yielding Waymo behind stop bar!)
  {
    shotId: "shot_06_overhead_crosswalk",
    tStart: 28.80,
    tEnd: 36.50,
    shotType: "overhead_crosswalk",
    hardCut: true,
    fov: 38,
    cam: { right: 0.0, up: 24.8, back: 0.01 },
    look: { right: 0.0, up: 0.25, forward: 0.01 },
    cameraUp: { x: 0.0, y: 0.0, z: -1.0 },
    label: "",
  },
  // 7. `36.50s – 44.80s`: Medium-Wide Courtyard 3/4 Two-Shot (`35.2°–37.6° FOV`, `worldBlend = 1.0` throughout) framing BOTH Stan's articulated bronze skull/jaws (`48.4°` off-axis silhouette) AND Pelican (`12.3–14.8m`, `>= 16.2%` screen height) across the head-whip, roar, surprise & evasive S-turn!
  {
    shotId: "shot_07_stan_trex_roar_evasive",
    tStart: 36.50,
    tEnd: 44.80,
    shotType: "stan_trex_flamingo_scatter",
    hardCut: true,
    fov: 36,
    cam: { right: -3.55, up: 1.24, back: 4.75 },
    look: { right: 0.25, up: 0.94, forward: 2.15 },
    label: "",
  },
  // 8. `44.80s – 49.00s`: Parallel Drivetrain & Webbed-Foot Sole Macro (`31° FOV`, uncropped crankset + webbed soles)
  {
    shotId: "shot_08_drivetrain_sole_macro",
    tStart: 44.80,
    tEnd: 49.00,
    shotType: "drivetrain_macro",
    hardCut: true,
    fov: 31,
    cam: { right: 2.48, up: 0.44, back: -0.05 },
    look: { right: 0.0, up: 0.39, forward: 0.06 },
    label: "",
  },
  // 9. `49.00s – 61.00s`: Bay View Waterfront Approach -> Uncropped Side-Profile `0.35x SLOW MOTION` Wooden Ramp Jump (`38° FOV`, C1 ramp-lip compensated `anchorGroundY: true`, zero lip snap or exit whip!)
  {
    shotId: "shot_09_bayview_slowmo_jump",
    tStart: 49.00,
    tEnd: 61.00,
    shotType: "slowmo_ramp_profile",
    hardCut: true,
    fov: 38,
    anchorGroundY: true,
    cam: { right: -6.15, up: 0.96, back: -6.35 },
    look: { right: 0.10, up: 0.78, forward: -0.75 },
    label: "",
  },
  // 10. `61.00s – 72.00s`: Arched Corten Bridge -> Uncropped Golden-Hour `GEMINI 4 CARBON` Shoreline Finale (`38° -> 40.5° FOV`)!
  {
    shotId: "shot_10_corten_shoreline_sunset",
    tStart: 61.00,
    tEnd: 72.01,
    shotType: "shoreline_crane_finale",
    hardCut: true,
    fov: 38,
    cam: { right: -3.55, up: 1.36, back: 4.65 },
    look: { right: 0.10, up: 0.92, forward: 2.10 },
    label: "",
  },
]);

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
  if (a < 0) a += TWO_PI;
  return a - Math.PI;
}

export function getStoryChapterIndexAtTime(seqT) {
  const t = clamp(Number(seqT) || 0.0, 0.0, V5_STORY_DURATION_SEC);
  for (let i = STORY_CHAPTER_BOUNDS.length - 1; i >= 0; i--) {
    if (t >= STORY_CHAPTER_BOUNDS[i].startSec - 1e-7) {
      return i;
    }
  }
  return 0;
}

/**
 * Analytical Gym Tire-Burnout Rubber Smoke (`0.02s -> 8.60s`) & Peel-Out Twin Skid Burst (`7.38s -> 8.45s`)
 * for V5's slow, weighted 9.40s Spin Studio Cold Open (`V5_TRAINER_RELEASE_SEC = 7.40s`).
 */
export function evaluateStoryBurnoutSmokeSignals(seqT) {
  const t = Number(seqT) || 0.0;
  let burnoutSmokeIntensity = 0.0;
  if (t >= 0.02 && t <= V5_TRAINER_RELEASE_SEC) {
    burnoutSmokeIntensity = evaluateTrainerSprintKinematics(t, 1.0).trainerBurnoutSmoke;
  } else if (t > V5_TRAINER_RELEASE_SEC && t < V5_TRAINER_RELEASE_SEC + 1.20) {
    burnoutSmokeIntensity = 1.0 - smoothstep01((t - V5_TRAINER_RELEASE_SEC) / 1.20);
  }

  let peelOutBurstIntensity = 0.0;
  if (t >= V5_TRAINER_RELEASE_SEC - 0.02 && t < V5_TRAINER_RELEASE_SEC + 1.05) {
    const uIn = smoothstep01((t - (V5_TRAINER_RELEASE_SEC - 0.02)) / 0.10);
    const uOut = 1.0 - smoothstep01((t - (V5_TRAINER_RELEASE_SEC + 0.28)) / 0.77);
    peelOutBurstIntensity = clamp(uIn * uOut, 0.0, 1.0);
  }
  return { burnoutSmokeIntensity, peelOutBurstIntensity };
}

/**
 * Analytical Gym-Glass Head-Duck Brace (`glassBracePhase`) & Post-Smash Shake (`postSmashShake`)
 * along the 72.0s V5 Story Auto-Pilot timeline (`V5_TRAINER_RELEASE_SEC = 7.40s`, `V5_GLASS_SMASH_SEC = 9.40s`).
 * Strictly exclusive to the Gradient Canopy `4x6` dark-bronze muntin bay breakout (`t in [8.15s, 10.64s]`,
 * holding `glassBracePhase = 1.0` across `8.58s .. 9.62s`); mathematically `0.0` everywhere else.
 */
export function evaluateStoryGlassBreakoutSignals(seqT) {
  const t = Number(seqT) || 0.0;
  let glassBracePhase = 0.0;
  if (t > 8.15 && t < 8.58) {
    glassBracePhase = smoothstep01((t - 8.15) / (8.58 - 8.15));
  } else if (t >= 8.58 && t <= 9.62) {
    glassBracePhase = 1.0;
  } else if (t > 9.62 && t < 10.06) {
    glassBracePhase = 1.0 - smoothstep01((t - 9.62) / (10.06 - 9.62));
  }

  let postSmashShake = 0.0;
  if (t > 9.94 && t < 10.64) {
    const s = Math.sin((Math.PI * (t - 9.94)) / (10.64 - 9.94));
    postSmashShake = s * s;
  }

  return { glassBracePhase, postSmashShake };
}
export const evaluateGymGlassBrace = evaluateStoryGlassBreakoutSignals;

/**
 * Analytical Stan T-Rex Courtyard Encounter (`(-118, -50)` across `36.8s - 45.2s`):
 *   - `36.80s -> 40.20s`: Stan's articulated bronze skull & neck smoothly track the approaching Pelican
 *   - `40.02s -> 40.22s`: Predatory head-whip snap & rear-up -> downward bellow lunge
 *   - `40.20s` (`STAN_ROAR_TRIGGER_SEC`): Sudden chest-rattling sub-bass ROAR (`stanRoarIntensity = 1.0`, `jawOpenDeg` up to `35°` with `16.5 Hz` tremor)
 *   - `40.45s -> 41.10s` (`+0.25s .. +0.90s` post-roar): Subtle damped low-frequency camera rumble (`stanCameraRumble`, zero nauseating whip!)
 *   - `40.32s` (`+0.12s` post-roar): Pelican startled wing flare, upward crest jolt, over-the-shoulder glance toward Stan, `0.142m` mini front-wheel hop (`ikSoleErrorM === 0.0000m`), and crisp evasive S-turn!
 */
export function evaluateStanEncounterSignals(
  seqT,
  pelicanX = -102.6,
  pelicanZ = -49.2,
  headingYaw = 0.0
) {
  const t = Number(seqT) || 0.0;

  // 1. Stan Head Tracking (`36.80s -> 44.60s`) & Sudden Whip (`40.02s -> 40.22s`)
  const trackIn = smootherstep01((t - 36.80) / 3.20);
  const trackOut = 1.0 - smootherstep01((t - 43.40) / 1.30);
  const stanTrackPhase = t > 36.80 && t < 44.70 ? clamp(trackIn * trackOut, 0.0, 1.0) : 0.0;

  let stanHeadWhipPhase = 0.0;
  if (t > 40.00 && t < 44.30) {
    const whipIn = smootherstep01((t - 40.00) / 0.22);
    const whipOut = 1.0 - smootherstep01((t - 42.35) / 1.95);
    stanHeadWhipPhase = clamp(whipIn * whipOut, 0.0, 1.0);
  }

  // 2. Stan Sudden Roar Envelope & Articulated Jaw Tremor (`t = 40.20s .. 42.08s`)
  let stanRoarIntensity = 0.0;
  let stanJawOpenDeg = 0.0;
  let stanHeadPitchRad = 0.0;
  if (t >= STAN_ROAR_TRIGGER_SEC - 0.18 && t < STAN_ROAR_TRIGGER_SEC) {
    // Brief pre-roar inhale rear-back (`-0.14 rad`)
    const uInhale = smoothstep01((t - (STAN_ROAR_TRIGGER_SEC - 0.18)) / 0.18);
    stanHeadPitchRad = -0.14 * uInhale;
    stanJawOpenDeg = 4.0 * uInhale;
  } else if (t >= STAN_ROAR_TRIGGER_SEC && t < 42.10) {
    const dtRoar = t - STAN_ROAR_TRIGGER_SEC;
    const attack = smoothstep01(dtRoar / 0.085);
    const sustainDecay = 1.0 - smootherstep01((dtRoar - 1.08) / 0.82);
    stanRoarIntensity = clamp(attack * sustainDecay, 0.0, 1.0);
    const jawTremor = Math.sin(TWO_PI * 16.5 * dtRoar) * 2.3 * stanRoarIntensity;
    stanJawOpenDeg = clamp(33.0 * stanRoarIntensity + jawTremor, 0.0, 35.5);
    const lunge = smoothstep01(dtRoar / 0.14);
    stanHeadPitchRad = lerp(-0.14, 0.21, lunge) * sustainDecay;
  }
  const stanJawOpenNorm = clamp(stanJawOpenDeg / 35.0, 0.0, 1.0);

  // Target yaw from Stan `(-118, -50)` toward Pelican `(pelicanX, pelicanZ)`
  const dxHero = (Number(pelicanX) || -102.6) - STAN_TREX_POS.x;
  const dzHero = (Number(pelicanZ) || -49.2) - STAN_TREX_POS.z;
  const rawHeroYaw = Math.atan2(dxHero, dzHero);
  const stanHeadYawRad = clamp(wrapAngleSigned(rawHeroYaw - 0.85), -0.92, 0.92) * stanTrackPhase;
  const stanTailSwayRad =
    Math.sin(t * 2.1) * 0.06 + stanRoarIntensity * Math.sin((t - STAN_ROAR_TRIGGER_SEC) * 11.0) * 0.11;

  // 3. Subtle Damped Low-Frequency Camera Rumble (`0.25s .. 0.90s` after roar onset => `[40.45s, 41.10s]`, `< 6 deg/s` sub-bass tremor)
  let stanCameraRumble = 0.0;
  let stanCameraRumbleOffset = { x: 0.0, y: 0.0, roll: 0.0 };
  const dtRumble = t - (STAN_ROAR_TRIGGER_SEC + 0.25);
  const rumbleDur = 0.65; // 40.45s -> 41.10s
  if (dtRumble > 0.0 && dtRumble < rumbleDur) {
    const envIn = smoothstep01(dtRumble / 0.11);
    const envOut = Math.exp(-3.2 * dtRumble) * smoothstep01((rumbleDur - dtRumble) / 0.18);
    stanCameraRumble = clamp(envIn * envOut * 1.18, 0.0, 1.0);
    const phaseA = TWO_PI * 8.5 * dtRumble;
    const phaseB = TWO_PI * 13.0 * dtRumble;
    stanCameraRumbleOffset = {
      x: (Math.sin(phaseA) * 0.0072 + Math.cos(phaseB) * 0.0028) * stanCameraRumble,
      y: (Math.cos(phaseA * 1.06) * 0.0112 + Math.sin(phaseB) * 0.0036) * stanCameraRumble,
      roll: Math.sin(phaseA * 0.85) * 0.0018 * stanCameraRumble,
    };
  }

  // 4. Pelican Startled Surprise Kinematics (`+0.12s` at `40.32s`)
  const surprise = evaluatePelicanSurpriseKinematics({
    dtSinceRoar: t - STAN_ROAR_TRIGGER_SEC,
    seqT: t,
    roarTriggerSec: STAN_ROAR_TRIGGER_SEC,
    pelicanX,
    pelicanZ,
    headingYaw,
    stanX: STAN_TREX_POS.x,
    stanZ: STAN_TREX_POS.z,
    reactionDelaySec: PELICAN_SURPRISE_DELAY_SEC,
  });

  return {
    stanRoarTriggerTime: STAN_ROAR_TRIGGER_SEC,
    pelicanSurpriseOnsetTime: PELICAN_SURPRISE_ONSET_SEC,
    stanTrackPhase,
    stanHeadWhipPhase,
    stanRoarPhase: stanRoarIntensity,
    stanRoarIntensity,
    roarIntensity: stanRoarIntensity,
    stanJawOpenNorm,
    stanJawOpenDeg,
    stanHeadYawRad,
    stanHeadPitchRad,
    stanTailSwayRad,
    stanCameraRumble,
    stanCameraRumbleOffset,
    pelicanSurprisePhase: surprise.pelicanSurprisePhase,
    frontWheelHopM: surprise.frontWheelHopM,
    centerHopM: surprise.centerHopM,
    centerHopVyMps: surprise.centerHopVyMps,
    wheeliePitchRad: surprise.wheeliePitchRad,
    pelicanCrestJoltRad: surprise.crestJoltRad,
    pelicanGlanceBackYawRad: surprise.glanceBackYawRad,
    pelicanStartledBeakOpen: surprise.startledBeakOpen,
    pelicanStartledWingFlare: surprise.startledWingFlare,
  };
}

/**
 * Natural intermittent cruiser freewheel coasting (`coastFactor` in `[0.0, 1.0]`):
 * Smooth `~3.5s` pedaling at `~48 RPM` followed by `~1.4s` of relaxed freewheel coasting on gentle
 * straightaways where `omegaCrank` eases smoothly to `0` while wheels keep rolling at exact `v / R`
 * and both webbed feet remain `0.000mm` locked onto the pedals!
 */
const STORY_COAST_WINDOWS = Object.freeze([
  { t0: 13.60, t1: 15.00 },  // Ch 1: Breezy Pinwheel Plaza glide after window smash
  { t0: 19.60, t1: 21.00 },  // Ch 1: Relaxed coast alongside Waymo Gen 6 on Charleston Rd
  { t0: 29.30, t1: 30.80 },  // Ch 2: Unhurried coast across 4-Way Zebra Crosswalk in 90° Top-Down shot
  { t0: 47.20, t1: 48.45 },  // Ch 3: Brief silky freewheel coast near end of 31° Drivetrain Macro
  { t0: 59.35, t1: 60.65 },  // Ch 4: Post-landing Bay View Waterfront breeze
  { t0: 60.60, t1: 66.10 },  // Ch 5: Downhill freewheel coast down North Corten Bridge slope onto Shoreline Esplanade
]);

export const SHORELINE_SKID_START_SEC = 67.85;
export const SHORELINE_SKID_END_SEC = 68.85;
export const SHORELINE_DISMOUNT_START_SEC = 68.65;
export const SHORELINE_DISMOUNT_END_SEC = 69.20;
export const SHORELINE_MONUMENT_WORLD = Object.freeze({ x: -1.2, y: 1.25, z: -182.5 });

export function evaluateShot10FinaleCamera(seqT) {
  const t = Number(seqT) || 0.0;
  const uFinale = smoothstep01((t - 66.40) / 1.75);
  const uSettle = smoothstep01((t - 67.55) / 1.45);
  return {
    uFinale,
    uSettle,
    fov: lerp(38.0, 48.0, uSettle),
    worldCam: {
      x: lerp(18.8, 15.35, uSettle),
      y: lerp(2.15, 1.78, uSettle),
      z: lerp(-154.0, -169.70, uSettle),
    },
    worldLook: {
      x: lerp(12.2, 5.45, uSettle),
      y: lerp(1.75, 1.88, uSettle),
      z: lerp(-176.5, -184.50, uSettle),
    },
  };
}

export function evaluateStoryCoastFactor(seqT, pose = null) {
  const t = Number(seqT) || 0.0;
  if (pose && (pose.onTrainerStand || pose.inSlowMoJump)) {
    return pose.inSlowMoJump ? 0.22 : 1.0; // Gentle poised slow-mo air pedal drift
  }
  if (t >= 67.76) {
    return 1.0 - smoothstep01((t - 67.76) / 0.09);
  }
  for (let i = 0; i < STORY_COAST_WINDOWS.length; i++) {
    const w = STORY_COAST_WINDOWS[i];
    if (t > w.t0 && t < w.t1) {
      const rampIn = smoothstep01((t - w.t0) / 0.32);
      const rampOut = smoothstep01((w.t1 - t) / 0.32);
      return clamp(1.0 - rampIn * rampOut, 0.0, 1.0);
    }
  }
  return 1.0;
}

/**
 * Smooth athletic forward sprint crouch (`0.0..1.0`) whenever `boostRemainingSec > 0`
 * from a Microkitchen Espresso pad (distinct from `glassBracePhase` — eyes stay open & looking forward).
 */
export function evaluateAeroCrouch(boostRemainingSec, boostTotalSec = 3.4, glassBracePhase = 0.0) {
  const remRaw = Number(boostRemainingSec) || 0.0;
  if (remRaw <= 0.0) return 0.0;
  const total = Math.max(0.5, Number(boostTotalSec) || 3.4);
  const rem = clamp(remRaw, 0.0, total);
  const elapsed = Math.max(0.0, total - rem);
  const rampIn = smoothstep01((elapsed + 0.035) / 0.28);
  const rampOut = smoothstep01(rem / 0.45);
  return clamp(rampIn * rampOut * (1.0 - 0.85 * clamp(glassBracePhase, 0.0, 1.0)), 0.0, 1.0);
}

/**
 * Smooth wingspan flare (`0.0..1.0`) during bunny-hops, `0.35x` slow-mo Bay View ramp glide,
 * and startled Stan T-Rex roar reaction; exact `0.0` whenever calmly cruising on the ground.
 */
export function evaluateWingFlare({
  isAirborne = false,
  inSlowMoJump = false,
  jumpHeightM = 0.0,
  glassBracePhase = 0.0,
  startledWingFlare = 0.0,
} = {}) {
  if (inSlowMoJump) return 1.0;
  let airFlare = 0.0;
  if (isAirborne && jumpHeightM > 0.02) {
    const u = clamp((jumpHeightM - 0.02) / 0.85, 0.0, 1.0);
    airFlare = 0.92 * smoothstep01(u) * (1.0 - clamp(glassBracePhase, 0.0, 1.0));
  }
  return clamp(Math.max(airFlare, Number(startledWingFlare) || 0.0), 0.0, 1.0);
}

/**
 * Damped happy beak-clap wave (`0.0..1.0`) triggered on `RING_BELL`, `TPU_COLLECTED`,
 * `CLUSTER_ONLINE`, and post-glass-breakout rollout celebration.
 */
export function evaluateBeakClapWave(dtSinceTrigger, kind = "standard", glassBracePhase = 0.0) {
  if (!Number.isFinite(dtSinceTrigger) || dtSinceTrigger < -1e-6) return 0.0;
  const dur = kind === "cluster" ? 1.35 : 0.72;
  if (dtSinceTrigger >= dur) return 0.0;
  const dtPos = Math.max(0.0, dtSinceTrigger);
  const effDt = dtPos + 0.015;
  const freqHz = kind === "cluster" ? 4.5 : 4.2;
  const decay = kind === "cluster" ? 0.85 : 1.35;
  const tailFade = smoothstep01((dur - dtPos) / 0.16);
  const wave =
    Math.abs(Math.sin(Math.PI * freqHz * effDt)) *
    Math.exp(-decay * dtPos) *
    tailFade *
    1.12;
  return clamp(wave * (1.0 - 0.7 * clamp(glassBracePhase, 0.0, 1.0)), 0.0, 1.0);
}

const SHOT_07_COURTYARD_KNOTS = Object.freeze([
  { t: 36.50, cx: -119.5, cy: 1.78, cz: -24.0, lx: -117.6, ly: 2.40, lz: -42.5, fov: 35.5 },
  { t: 38.50, cx: -118.4, cy: 1.80, cz: -30.6, lx: -116.2, ly: 2.62, lz: -45.8, fov: 35.2 },
  { t: 40.20, cx: -116.5, cy: 1.84, cz: -30.8, lx: -112.6, ly: 2.68, lz: -45.5, fov: 35.8 },
  { t: 41.80, cx: -108.1, cy: 1.90, cz: -26.8, lx: -107.1, ly: 2.52, lz: -42.6, fov: 37.8 },
  { t: 43.30, cx: -105.6, cy: 1.96, cz: -20.5, lx: -107.1, ly: 2.45, lz: -38.4, fov: 37.4 },
  { t: 44.80, cx: -104.8, cy: 2.00, cz: -13.6, lx: -107.4, ly: 2.40, lz: -34.8, fov: 37.2 },
]);

function evalShot07CourtyardSpline(t) {
  const knots = SHOT_07_COURTYARD_KNOTS;
  const n = knots.length;
  if (t <= knots[0].t) return knots[0];
  if (t >= knots[n - 1].t) return knots[n - 1];
  let idx = 0;
  for (let i = 0; i < n - 1; i++) {
    if (t >= knots[i].t && t <= knots[i + 1].t) {
      idx = i;
      break;
    }
  }
  const k0 = knots[idx];
  const k1 = knots[idx + 1];
  const dt = k1.t - k0.t;
  const u = clamp((t - k0.t) / dt, 0.0, 1.0);
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 = 2.0 * u3 - 3.0 * u2 + 1.0;
  const h10 = u3 - 2.0 * u2 + u;
  const h01 = -2.0 * u3 + 3.0 * u2;
  const h11 = u3 - u2;
  const interpKey = (key) => {
    const v0 =
      idx === 0
        ? 0.0
        : (knots[idx + 1][key] - knots[idx - 1][key]) / (knots[idx + 1].t - knots[idx - 1].t);
    const v1 =
      idx + 1 === n - 1
        ? 0.0
        : (knots[idx + 2][key] - knots[idx][key]) / (knots[idx + 2].t - knots[idx].t);
    return h00 * k0[key] + h10 * (v0 * dt) + h01 * k1[key] + h11 * (v1 * dt);
  };
  return {
    cx: interpKey("cx"),
    cy: interpKey("cy"),
    cz: interpKey("cz"),
    lx: interpKey("lx"),
    ly: interpKey("ly"),
    lz: interpKey("lz"),
    fov: interpKey("fov"),
  };
}

/**
 * V7 Section 8 — `C^2` Monotone Quintic 3-Beat Cold-Open Camera Spline (`0.00s – 12.20s`):
 *   - Beat 1 (`0.00s – 1.80s` — Serious Gym-Ad Misdirection): Tight macro hero shot on the `"59 / AA"`
 *     hex dumbbell endcap catching the golden morning sunbeam on speckled rubber flooring (`dofStrength = 0.92`,
 *     zero Pelican webbed feet, bike, trainer, or burnout smoke visible inside the frame!).
 *   - Beat 2 (`1.80s – 4.40s` — The First Clue): Smooth shallow-DoF focus rack (`dofFocusDistM` shifts onto the
 *     spinning pedal) + `C^2` dolly/tilt past `"59 / AA"` as the giant bright-orange webbed foot stomps down!
 *   - Beat 3 (`4.40s – 7.40s` — Full Hero Pelican Reveal & Launch): Smooth crane rise up the red-and-blue GBike,
 *     fluttering polka-dot scarf, and Spin Studio LED RPM board (`36 -> 168 RPM`) to the feathered Pelican in
 *     aero sprint crouch before unlatching at `7.40s` -> tempered-glass window smash at `9.40s`!
 */
const COLD_OPEN_3BEAT_KNOTS = Object.freeze([
  { t: 0.00, right: 0.56, up: 0.160, back: 2.18, lookRight: 1.68, lookUp: 0.052, lookFwd: 0.42, fov: 25.0 },
  { t: 1.80, right: 0.61, up: 0.156, back: 2.13, lookRight: 1.56, lookUp: 0.058, lookFwd: 0.38, fov: 25.0 },
  { t: 2.65, right: 0.66, up: 0.215, back: 2.04, lookRight: 0.74, lookUp: 0.132, lookFwd: 0.18, fov: 25.5 },
  { t: 3.45, right: 0.76, up: 0.285, back: 1.94, lookRight: 0.11, lookUp: 0.205, lookFwd: 0.00, fov: 26.2 },
  { t: 4.40, right: 1.48, up: 0.540, back: 1.86, lookRight: -0.04, lookUp: 0.460, lookFwd: 0.26, fov: 28.8 },
  { t: 6.10, right: 2.38, up: 1.150, back: 1.98, lookRight: -0.22, lookUp: 0.960, lookFwd: 1.20, fov: 34.0 },
  { t: 6.95, right: 2.34, up: 1.150, back: 2.02, lookRight: -0.18, lookUp: 0.960, lookFwd: 1.25, fov: 34.2 },
  { t: 9.15, right: 0.42, up: 1.060, back: 3.25, lookRight: 0.00, lookUp: 0.960, lookFwd: 3.40, fov: 38.0 },
  { t: 12.20, right: 0.42, up: 1.060, back: 3.25, lookRight: 0.00, lookUp: 0.960, lookFwd: 3.40, fov: 38.0 },
]);

const COLD_OPEN_SPLINE_KEYS = Object.freeze([
  "right",
  "up",
  "back",
  "lookRight",
  "lookUp",
  "lookFwd",
  "fov",
]);

function evalColdOpen3BeatSpline(t) {
  const knots = COLD_OPEN_3BEAT_KNOTS;
  const n = knots.length;
  if (t <= knots[0].t) return knots[0];
  if (t >= knots[n - 1].t) return knots[n - 1];
  let idx = 0;
  for (let i = 0; i < n - 1; i++) {
    if (t >= knots[i].t && t <= knots[i + 1].t) {
      idx = i;
      break;
    }
  }
  const k0 = knots[idx];
  const k1 = knots[idx + 1];
  const dt = k1.t - k0.t;
  const u = clamp((t - k0.t) / dt, 0.0, 1.0);
  const u2 = u * u;
  const u3 = u2 * u;
  const u4 = u3 * u;
  const u5 = u4 * u;

  // Quintic Hermite basis with zero knot second derivatives (`C^2` continuous across all knots!)
  const h0 = 1.0 - 10.0 * u3 + 15.0 * u4 - 6.0 * u5;
  const h1 = 10.0 * u3 - 15.0 * u4 + 6.0 * u5;
  const hv0 = u - 6.0 * u3 + 8.0 * u4 - 3.0 * u5;
  const hv1 = -4.0 * u3 + 7.0 * u4 - 3.0 * u5;

  // Weighted harmonic Fritsch-Carlson monotone tangent slopes (zero overshoot!)
  const slopeAt = (m, key) => {
    if (m <= 0 || m >= n - 1) return 0.0;
    const prev = knots[m - 1];
    const curr = knots[m];
    const next = knots[m + 1];
    const sPrev = (curr[key] - prev[key]) / (curr.t - prev.t);
    const sNext = (next[key] - curr[key]) / (next.t - curr.t);
    if (sPrev * sNext <= 0.0) return 0.0;
    const w1 = 2.0 * (next.t - curr.t) + (curr.t - prev.t);
    const w2 = (next.t - curr.t) + 2.0 * (curr.t - prev.t);
    return (w1 + w2) / (w1 / sPrev + w2 / sNext);
  };

  const out = {
    right: 0.0,
    up: 0.0,
    back: 0.0,
    lookRight: 0.0,
    lookUp: 0.0,
    lookFwd: 0.0,
    fov: 34.0,
  };
  for (let i = 0; i < COLD_OPEN_SPLINE_KEYS.length; i++) {
    const key = COLD_OPEN_SPLINE_KEYS[i];
    const v0 = slopeAt(idx, key);
    const v1 = slopeAt(idx + 1, key);
    out[key] = h0 * k0[key] + h1 * k1[key] + hv0 * (v0 * dt) + hv1 * (v1 * dt);
  }
  return out;
}

function evaluateColdOpenDof(t, right, up, back) {
  if (t > V5_TRAINER_RELEASE_SEC) {
    return {
      dofFocusDistM: Math.hypot(right, up - 0.96, back),
      dofStrength: 0.0,
      coldOpenBeat: 0,
    };
  }
  const coldOpenBeat = t < 1.80 ? 1 : t < 4.40 ? 2 : 3;
  // Stationary trainer hero anchor is (0.0, 0.0, 140.20) facing due North (yaw = 0.0) -> cam = (right, up, 140.20 + back)
  const camX = right;
  const camY = up;
  const camZ = GYM_BREAKOUT_CONFIG.trainerZ + back;
  // "59 / AA" hex dumbbell +Z endcap at (0.8035, 0.089, 141.7433); right spinning pedal/webbed foot at (0.11, 0.24, 140.20)
  const dDumbbell = Math.hypot(camX - 0.8035, camY - 0.089, camZ - 141.7433);
  const dPedal = Math.hypot(camX - 0.11, camY - 0.24, camZ - 140.20);
  const dHero = Math.hypot(camX, camY - 1.16, camZ - 140.20);

  const uRackToPedal = smootherstep01((t - 1.80) / 1.25);
  const uRackToHero = smootherstep01((t - 3.60) / 1.60);
  const dofFocusDistM = lerp(lerp(dDumbbell, dPedal, uRackToPedal), dHero, uRackToHero);
  // Active strictly in [0.0, 3.80s] (`uDofStrength === 0` from 3.80s onward for zero extra PostFX taps during riding!)
  const dofFadeOut = 1.0 - smootherstep01((t - 2.75) / 1.05);
  const dofStrength = clamp(0.92 * dofFadeOut, 0.0, 1.0);
  return { dofFocusDistM, dofStrength, coldOpenBeat };
}

/**
 * Evaluates smooth Telephoto Director Camera Hint (`25°–40.5° FOV`) at sequence timestamp `seqT` in `[0, 72.0]`.
 */
export function evaluateDirectorHint(seqT, jumpHeightMOverride = null) {
  const t = clamp(seqT, 0.0, V5_STORY_DURATION_SEC);
  let idx = 0;
  for (let i = DIRECTOR_SHOT_TABLE.length - 1; i >= 0; i--) {
    if (t >= DIRECTOR_SHOT_TABLE[i].tStart - 1e-7) {
      idx = i;
      break;
    }
  }
  const cur = DIRECTOR_SHOT_TABLE[idx];
  let fov = cur.fov;
  let right = cur.cam.right;
  let up = cur.cam.up;
  let back = cur.cam.back;
  let lookRight = cur.look.right;
  let lookUp = cur.look.up;
  let lookFwd = cur.look.forward;
  let anchorGroundY = Boolean(cur.anchorGroundY);
  let cameraUp = cur.cameraUp || null;

  let worldBlend = 0.0;
  let worldCam = null;
  let worldLook = null;

  if (
    cur.shotType === "spin_ad_floor_macro" ||
    cur.shotType === "whip_tilt_pelican_reveal" ||
    cur.shotType === "chase_through_window_smash"
  ) {
    // Unified C^2 3-Beat Cold Open (`0.00s – 12.20s`): Beat 1 "59 / AA" Gym-Ad Misdirection (0.0–1.8s) ->
    // Beat 2 Focus Rack to Orange Webbed Foot on Pedal (1.8–4.4s) -> Beat 3 Full Pelican + LED RPM Crane (4.4–7.4s) ->
    // 7.40s Trainer Release & 9.40s Tempered-Glass Window Smash!
    const kCold = evalColdOpen3BeatSpline(t);
    fov = clamp(kCold.fov, 25.0, 38.0);
    anchorGroundY = t <= 7.40 ? true : Boolean(cur.anchorGroundY);
    right = kCold.right;
    up = kCold.up;
    back = kCold.back;
    lookRight = kCold.lookRight;
    lookUp = kCold.lookUp;
    lookFwd = kCold.lookFwd;
  } else if (cur.shotType === "waymo_street_pass" && t >= 17.00) {
    // Shot 4 Charleston Rd Corner (`17.00s – 21.50s`, `34° FOV`): C1-matched 4.5s Hermite camera arc around the
    // Westbound intersection so non-cut angular velocity stays `< 38 deg/s << 50 deg/s` while framing Waymo Gen 6!
    const dtCorner = 4.50;
    const u = clamp((t - 17.00) / dtCorner, 0.0, 1.0);
    const u2 = u * u;
    const u3 = u2 * u;
    const h00 = 2.0 * u3 - 3.0 * u2 + 1.0;
    const h10 = u3 - 2.0 * u2 + u;
    const h01 = -2.0 * u3 + 3.0 * u2;
    const h11 = u3 - u2;
    fov = 34;
    worldBlend = 1.0;
    worldCam = {
      x: h00 * 2.090 + h10 * (0.0 * dtCorner) + h01 * -15.74 + h11 * (-4.50 * dtCorner),
      y: 0.92,
      z: h00 * 88.397 + h10 * (-4.55 * dtCorner) + h01 * 79.13 + h11 * (-0.10 * dtCorner),
    };
    worldLook = {
      x: h00 * 1.949 + h10 * (0.0 * dtCorner) + h01 * -8.09 + h11 * (-4.50 * dtCorner),
      y: 0.86,
      z: h00 * 96.046 + h10 * (-4.55 * dtCorner) + h01 * 79.25 + h11 * (-0.10 * dtCorner),
    };
  } else if (cur.shotType === "overhead_crosswalk") {
    // Shot 6 (`28.80s – 36.50s`, `38° FOV`, `up: 24.8m`): Crisp 90° Top-Down Overhead 4-Way Zebra Crosswalk Shot
    // framing all 4 zebra crosswalks, all 4 R=3.6m granite corner curbs, yielding Waymo Gen 6 stopped behind stop bar, and Pelican!
    const uCross = 1.0 - smoothstep01((t - 30.55) / 1.15);
    worldBlend = 0.85 * uCross;
    worldCam = { x: -116.8, y: 24.8, z: 76.0 };
    worldLook = { x: -116.8, y: 0.25, z: 75.98 };
  } else if (cur.shotType === "stan_trex_flamingo_scatter") {
    // Shot 7 (`36.50s – 44.80s`): Pure `worldBlend = 1.0` C1 Hermite Courtyard 3/4 Medium-Wide Two-Shot (`< 12 deg/s` peak angular rate,
    // zero entry/exit whips, `12.3–14.8m` to Pelican, `48.4°` off-axis roar jaw silhouette, Pelican `>= 16.0%` screen height,
    // both Stan head/jaws AND Pelican strictly inside `|ndc| <= 0.77 <= 0.85` across `38.0–44.5s`)!
    const s7 = evalShot07CourtyardSpline(t);
    fov = s7.fov;
    worldBlend = 1.0;
    worldCam = { x: s7.cx, y: s7.cy, z: s7.cz };
    worldLook = { x: s7.lx, y: s7.ly, z: s7.lz };
  } else if (cur.shotType === "slowmo_ramp_profile") {
    // Shot 9 (`49.00s – 61.00s`, V8-06): Sweeping Minimum-Jerk `65°` Hero Orbit Camera (`0` hard cuts or snaps!):
    //   1. Approach -> Ramp Climb (`49.00s -> 52.65s`): drops low (`0.68m` above ground!) alongside West flank of launch ramp (`phi = -110°`).
    //   2. Upper Arc & `4.05m` Apex (`52.65s -> 55.35s`): orbits `+65.0°` via minimum-jerk `smootherstep01` into a dramatic
    //      low-angle (`~1.52m` world Y looking UP at `4.05m` Pelican + `5.05m` spinning Noogler cap propeller) front-3/4 shot (`phi = -45°`)
    //      framing Pelican, wide 4-tier wings, `tpu_12` snatch, Bay View dragonscale roof (`x = 202, z = 22`), and golden atmosphere!
    //   3. Descent, `-13.3°` Landing Ramp Touchdown & Runout (`55.35s -> 59.55s -> 61.00s`): sweeps smoothly back behind
    //      into a clean rear-3/4 chase angle (`phi = -146°`, framing golden sun halo ahead) with `anchorGroundY = false` (`0.0mm` lip/crest snap!).
    anchorGroundY = false;

    const uDropToRamp = smootherstep01((t - 49.55) / (52.45 - 49.55));
    const uOrbitApex = smootherstep01((t - 52.20) / (55.30 - 52.20));
    const uSweepChase = smootherstep01((t - 55.30) / (60.65 - 55.30));

    // Horizontal orbit azimuth `phi` around Pelican (`0°` = due front, `-90°` = West profile, `-180°` = due rear):
    // `-126°` approach -> `-110°` ramp side -> `-45°` apex (`+65.0°` hero orbit!) -> `-140°` rear-3/4 chase!
    const phiDeg =
      t <= 52.20
        ? lerp(-126.0, -110.0, uDropToRamp)
        : t <= 55.30
          ? lerp(-110.0, -45.0, uOrbitApex)
          : lerp(-45.0, -140.0, uSweepChase);
    const phiRad = (phiDeg * Math.PI) / 180.0;

    const orbitRadiusM =
      t <= 52.20
        ? lerp(6.15, 6.05, uDropToRamp)
        : t <= 55.30
          ? lerp(6.05, 6.25, uOrbitApex)
          : lerp(6.25, 5.65, uSweepChase);

    // Smooth hero-relative vertical camera offset `up`:
    //   - Drops cleanly to `+0.68m` above ground (`heroY = 0.016m`) alongside the launch ramp (`t ~ 52.45–52.65s`).
    //   - Tracks `heroY` across the `1.0x` takeoff lip (`53.55s`) & touchdown (`57.20s`) for zero vertical whip,
    //     while dipping to `-2.38m` relative to `heroY = 4.05m` (`~1.67m` world Y!) across the `0.25x` slow-mo upper arc
    //     for a dramatic low-angle upward hero shot framing Pelican, spinning Noogler propeller, and Bay View roof!
    const uDipLowApex =
      smootherstep01((t - 53.55) / (55.25 - 53.55)) *
      (1.0 - smootherstep01((t - 55.35) / (57.35 - 55.35)));
    const baseRelUp =
      t <= 52.45
        ? lerp(1.34, 0.68, uDropToRamp)
        : lerp(0.68, 1.18, smootherstep01((t - 55.30) / (59.80 - 55.30)));
    up = baseRelUp - 3.06 * uDipLowApex;

    const camFwd = orbitRadiusM * Math.cos(phiRad);
    right = orbitRadiusM * Math.sin(phiRad);
    back = -camFwd;

    const apexFocusBell = uOrbitApex * (1.0 - uSweepChase);
    fov = lerp(37.8, 39.8, apexFocusBell);
    lookRight = lerp(0.16, 0.0, uSweepChase) * (1.0 - 0.30 * apexFocusBell) + 0.18 * apexFocusBell;
    lookUp = lerp(0.84, 0.62, uDipLowApex) + 0.06 * uSweepChase;
    lookFwd =
      t <= 55.30
        ? lerp(0.72, 0.18, uOrbitApex)
        : lerp(0.18, 1.45, uSweepChase);
  } else if (cur.shotType === "shoreline_crane_finale") {
    // Shot 10 (`61.00s – 72.00s`): Arched Corten Bridge -> Uncropped Golden-Hour `GEMINI 4 CARBON` + GBike Whip-Skid & Peacock-Fan Shoreline Finale (`42.6° FOV`)!
    const s10 = evaluateShot10FinaleCamera(t);
    fov = s10.fov;
    worldBlend = s10.uFinale;
    worldCam = s10.worldCam;
    worldLook = s10.worldLook;
  }

  const inSlowMo = t > SLOWMO_TAKEOFF_SEC + 1e-6 && t <= SLOWMO_LAND_SEC + 1e-6;
  const label = inSlowMo ? "SLOW MOTION" : "";
  const dof = evaluateColdOpenDof(t, right, up, back);

  return {
    shotId: cur.shotId,
    shotType: cur.shotType,
    hardCut: Boolean(cur.hardCut),
    fov,
    anchorGroundY,
    cameraUp,
    camOffset: {
      right,
      up,
      back,
      forward: -back,
    },
    lookOffset: {
      right: lookRight,
      up: lookUp,
      forward: lookFwd,
      back: -lookFwd,
    },
    worldBlend,
    worldCam,
    worldLook,
    isOverhead: cur.shotType === "overhead_crosswalk",
    dofFocusDistM: dof.dofFocusDistM,
    dofStrength: dof.dofStrength,
    coldOpenBeat: dof.coldOpenBeat,
    label,
  };
}

/**
 * Physically unified GBike speedometer & wheel roll velocity along the 72.0s V5 Story Auto-Pilot
 * spline (`seqT` in `[0, 72.0]`):
 *   - Stationary gym stand (`t < 7.40s`): `17.6..19.2 km/h` roller spin-up (`50.0 -> 54.5 RPM`) building rubber burnout smoke
 *   - Campus cruising: exact physical spline velocity (`14.3–19.7 km/h`, `~46–56 RPM` with `44T:16T` cruiser gearing!)
 *   - Stan T-Rex evasive S-turn (`40.32s - 42.15s`): crisp startled surge peaking `~21.55 km/h` before settling smoothly into `16.5 km/h` cruise
 *   - Bay View ramp sprint & `0.35x` slow-mo jump (`54.90s - 58.20s`): `19.51 km/h` (`5.42 m/s`)
 *   - Shoreline Amphitheatre sunset arrival: smooth braking down to `0.0 km/h` by `69.60s` (`2.4s` Finale Hold)!
 */
export function evaluateStoryCalibratedSpeedMps(
  _seqT,
  pose,
  _boostRemainingSec = 0.0,
  cadenceScale = 1.0
) {
  const cScale = clamp(Number(cadenceScale) || 1.0, 0.35, 2.0);
  if (!pose) return BIKE_CONSTANTS.baseSpeedMps * cScale;
  if (pose.onTrainerStand) {
    return pose.rollerSpeedMps * cScale;
  }
  if (pose.inSlowMoJump) {
    return SLOWMO_V_HORIZ * cScale;
  }
  return Math.max(0.0, (Number(pose.groundSpeedMps) || 0.0) * cScale);
}

/**
 * Evaluates exact analytical pose, velocity, curvature, jump height, and V5/V6 Sprint + Stan signals
 * within a specific Chapter (`0..4`) at timestamp `t` (never interpolating across chapter cut boundaries!).
 */
export function evaluateStoryChapterPose(chapterIdx, seqT) {
  const chIdx = clamp(Math.round(Number(chapterIdx) || 0), 0, RAW_CHAPTER_WAYPOINTS.length - 1);
  const chBound = STORY_CHAPTER_BOUNDS[chIdx];
  const t = clamp(Number(seqT) || 0.0, chBound.startSec, chBound.endSec);
  const glassSignals = evaluateStoryGlassBreakoutSignals(t);
  const smokeSignals = evaluateStoryBurnoutSmokeSignals(t);

  // Phase 1: Stationary Gym Roller Trainer (`0.00s - 7.40s`, Chapter 0 — V8 `+52mm` Elevated Stand + 36 -> 168 RPM Sprint!)
  if (chIdx === 0 && t < V5_TRAINER_RELEASE_SEC - 1e-6) {
    const sprint = evaluateTrainerSprintKinematics(t, 1.0);
    const cadenceRpm = sprint.trainerCadenceRpm;
    const rollerSpeedMps = sprint.trainerRollerOmega * BIKE_CONSTANTS.wheelRadiusM;
    const releaseEdgeFade = 1.0 - smoothstep01((t - (V5_TRAINER_RELEASE_SEC - 0.06)) / 0.06);
    const trainerVib =
      (0.0008 * Math.abs(Math.sin(sprint.pedalPhaseRad)) +
        Math.max(0.0, sprint.trainerFrameShudderM)) *
      releaseEdgeFade;
    const elevatedTrainerY = TRAINER_STAND_ELEVATION_M + Math.max(0.0, trainerVib);
    const zeroStan = evaluateStanEncounterSignals(
      t,
      GYM_BREAKOUT_CONFIG.trainerX,
      GYM_BREAKOUT_CONFIG.trainerZ
    );

    return {
      chapterIdx: 0,
      x: GYM_BREAKOUT_CONFIG.trainerX,
      z: GYM_BREAKOUT_CONFIG.trainerZ,
      worldY: elevatedTrainerY,
      headingYaw: GYM_BREAKOUT_CONFIG.trainerHeadingYaw,
      groundSpeedMps: 0.0,
      rollerSpeedMps,
      displaySpeedMps: 0.0,
      cadenceRpmOverride: cadenceRpm,
      coastFactor: 1.0,
      kappa: 0.0,
      jumpHeightM: elevatedTrainerY,
      verticalVelMps: 0.0,
      airPitchRad: 0.0,
      preloadCrouch: 0.0,
      onTrainerStand: true,
      inGym: true,
      inSlowMoJump: false,
      timeScale: 1.0,
      wingFlare: 0.0,
      glassBracePhase: 0.0,
      postSmashShake: 0.0,
      beakOpen: 0.0,
      trainerSparkIntensity: smokeSignals.burnoutSmokeIntensity,
      burnoutSmokeIntensity: smokeSignals.burnoutSmokeIntensity,
      peelOutBurstIntensity: 0.0,
      pedalPhaseRad: sprint.pedalPhaseRad,
      trainerCadenceRpm: sprint.trainerCadenceRpm,
      trainerPowerWatts: sprint.trainerPowerWatts,
      trainerSprintProgress: sprint.sprintProgress,
      trainerRollerOmega: sprint.trainerRollerOmega,
      trainerRollerSpinRad: sprint.trainerRollerPhaseRad,
      peelOutSlipBlend: 1.0,
      sprintTorsoLeanRad: sprint.sprintTorsoLeanRad,
      sprintHipRockRad: sprint.sprintHipRockRad,
      sprintShoulderRockRad: sprint.sprintShoulderRockRad,
      sprintWingTuck: sprint.sprintWingTuck,
      trainerFrameShudderM: sprint.trainerFrameShudderM,
      trainerFrameShudderRollRad: sprint.trainerFrameShudderRollRad,
      ...zeroStan,
    };
  }

  // Phase 2: Dramatic Newtonian Parabolic Jump off Bay View Ramp (`(53.550s, 57.200s)`, Chapter 3:
  // `g = -9.81 m/s^2`, `4.05m` Apex, `1.0x -> 0.25x -> 1.0x` Slow-Mo, tangent `-13.3°` landing!)
  if (chIdx === 3 && t > SLOWMO_TAKEOFF_SEC + 1e-6 && t < SLOWMO_LAND_SEC - 1e-6) {
    const sm = evaluateSlowMoClock(t);
    const tau = sm.tau;
    const uAir = sm.uAir;
    const z = SLOWMO_TAKEOFF_Z + SLOWMO_VZ * tau;
    const x = 156.0;
    const worldY = SLOWMO_TAKEOFF_Y + SLOWMO_VY0 * tau - 0.5 * 9.81 * tau * tau;
    const vy = SLOWMO_VY0 - 9.81 * tau;
    const groundAtXZ = getOpenWorldTerrainHeight(x, z);
    const jumpHeightM = Math.max(0.0, worldY - groundAtXZ);
    const physSpeed = SLOWMO_V_HORIZ;
    const screenSpeed = physSpeed * sm.timeScale;
    const apexBell = Math.sin(Math.PI * uAir);

    // Smooth C^inf velocity-tangent pitch (`+18.3°` launch lip -> `0.0°` level at apex -> `-13.3°` landing ramp slope!)
    const vyLand = SLOWMO_VY0 - 9.81 * SLOWMO_FLIGHT_TAU;
    const kTake = SLOWMO_TAKEOFF_PITCH_RAD / Math.atan2(SLOWMO_VY0, physSpeed);
    const kLand = SLOWMO_LAND_PITCH_RAD / Math.atan2(vyLand, physSpeed);
    const airPitchRad =
      Math.atan2(vy, physSpeed) * lerp(kTake, kLand, smootherstep01(uAir));

    // Explosive extension out of the `-35ms` lip preload crouch right after takeoff
    const preloadExtend =
      tau < 0.08 ? 0.88 * (1.0 - smoothstep01(tau / 0.08)) : 0.0;
    const zeroStan = evaluateStanEncounterSignals(t, x, z);

    return {
      chapterIdx: 3,
      x,
      z,
      worldY,
      headingYaw: 0.0,
      groundSpeedMps: screenSpeed,
      rollerSpeedMps: screenSpeed,
      displaySpeedMps: physSpeed,
      cadenceRpmOverride: null,
      coastFactor: 0.22,
      kappa: 0.0,
      jumpHeightM,
      verticalVelMps: vy,
      airPitchRad,
      preloadCrouch: preloadExtend,
      onTrainerStand: false,
      inGym: false,
      inSlowMoJump: true,
      timeScale: sm.timeScale,
      wingFlare: 1.0,
      glassBracePhase: 0.0,
      postSmashShake: 0.0,
      beakOpen: clamp(0.35 + 0.65 * apexBell, 0.0, 1.0),
      trainerSparkIntensity: 0.0,
      burnoutSmokeIntensity: 0.0,
      peelOutBurstIntensity: 0.0,
      trainerCadenceRpm: TRAINER_SPRINT_SPEC.rpmPeak,
      trainerPowerWatts: TRAINER_SPRINT_SPEC.powerWattsPeak,
      trainerSprintProgress: 1.0,
      trainerRollerOmega: 0.0,
      trainerRollerSpinRad: 0.0,
      peelOutSlipBlend: 0.0,
      sprintTorsoLeanRad: 0.0,
      sprintHipRockRad: 0.0,
      sprintShoulderRockRad: 0.0,
      sprintWingTuck: 0.0,
      trainerFrameShudderM: 0.0,
      trainerFrameShudderRollRad: 0.0,
      ...zeroStan,
    };
  }

  // Phase 3: Chapter-Local C1 Cubic Hermite Spline Evaluation
  const waypoints = RAW_CHAPTER_WAYPOINTS[chIdx];
  let segIdx = t <= waypoints[0].t ? 0 : waypoints.length - 2;
  for (let i = 0; i < waypoints.length - 1; i++) {
    if (t >= waypoints[i].t && t <= waypoints[i + 1].t) {
      segIdx = i;
      break;
    }
  }

  const p0 = waypoints[segIdx];
  const p1 = waypoints[segIdx + 1];
  const dtSeg = Math.max(1e-5, p1.t - p0.t);
  const u = clamp((t - p0.t) / dtSeg, 0.0, 1.0);
  const u2 = u * u;
  const u3 = u2 * u;

  const h00 = 2.0 * u3 - 3.0 * u2 + 1.0;
  const h10 = u3 - 2.0 * u2 + u;
  const h01 = -2.0 * u3 + 3.0 * u2;
  const h11 = u3 - u2;

  const m0x = p0.vx * dtSeg;
  const m0z = p0.vz * dtSeg;
  const m1x = p1.vx * dtSeg;
  const m1z = p1.vz * dtSeg;

  let x = h00 * p0.x + h10 * m0x + h01 * p1.x + h11 * m1x;
  let z = h00 * p0.z + h10 * m0z + h01 * p1.z + h11 * m1z;

  const dh00 = (6.0 * u2 - 6.0 * u) / dtSeg;
  const dh10 = (3.0 * u2 - 4.0 * u + 1.0) / dtSeg;
  const dh01 = (-6.0 * u2 + 6.0 * u) / dtSeg;
  const dh11 = (3.0 * u2 - 2.0 * u) / dtSeg;

  let velX = dh00 * p0.x + dh10 * m0x + dh01 * p1.x + dh11 * m1x;
  let velZ = dh00 * p0.z + dh10 * m0z + dh01 * p1.z + dh11 * m1z;

  const d2h00 = (12.0 * u - 6.0) / (dtSeg * dtSeg);
  const d2h10 = (6.0 * u - 4.0) / (dtSeg * dtSeg);
  const d2h01 = (-12.0 * u + 6.0) / (dtSeg * dtSeg);
  const d2h11 = (6.0 * u - 2.0) / (dtSeg * dtSeg);

  let accX = d2h00 * p0.x + d2h10 * m0x + d2h01 * p1.x + d2h11 * m1x;
  let accZ = d2h00 * p0.z + d2h10 * m0z + d2h01 * p1.z + d2h11 * m1z;

  let speed = Math.hypot(velX, velZ);
  let headingYaw = 0.0;
  let slipAngleDeg = 0.0;
  let shorelineSkidIntensity = 0.0;
  let rearWheelLock = 0.0;
  let skidBankRad = null;
  let skidSteerRad = null;
  let skidSuspPulseM = 0.0;
  let celebrationDismountBlend = 0.0;
  let celebrationTargetWorldYaw = null;

  if (chIdx === 4 && t > SHORELINE_SKID_START_SEC) {
    // Wave 4 Decoupled Lateral Whip-Turn & Coulomb Brake-Slide (`67.85s -> 68.85s`) onto Shoreline Plaza Medallion:
    //   - `bikeHeadingYaw` sweeps rapidly left (`~ -0.16 rad -> -1.197 rad` / `-68.6°`) so GBike front wheel & TPU-packed
    //     red wire basket stop pointed directly at `Gemini4_Carbon_Monument_V4` (`(-1.2, -182.5)`).
    //   - Center-of-mass `(x, z)` skids diagonally at `32°–45°` slip angle `beta` and arrests cleanly to `0.000 m/s` at `68.85s`.
    const skidNode = waypoints[waypoints.length - 2]; // `t = 67.85s` knot
    const skidDur = SHORELINE_SKID_END_SEC - SHORELINE_SKID_START_SEC; // 1.00s
    const uSkid = clamp((t - SHORELINE_SKID_START_SEC) / skidDur, 0.0, 1.0);
    const expN = 3.60;
    const fPos = (1.0 - Math.pow(1.0 - uSkid, expN)) / expN;
    const fVel = t < SHORELINE_SKID_END_SEC ? Math.pow(1.0 - uSkid, expN - 1.0) : 0.0;
    const fAcc =
      t < SHORELINE_SKID_END_SEC
        ? (-(expN - 1.0) * Math.pow(1.0 - uSkid, expN - 2.0)) / skidDur
        : 0.0;

    const dxLat = -0.39;
    const dzLat = +0.31;
    const gPos = uSkid * uSkid * (3.0 - 2.0 * uSkid);
    const gVel = t < SHORELINE_SKID_END_SEC ? (6.0 * uSkid * (1.0 - uSkid)) / skidDur : 0.0;
    const gAcc =
      t < SHORELINE_SKID_END_SEC ? (6.0 - 12.0 * uSkid) / (skidDur * skidDur) : 0.0;

    x = skidNode.x + skidNode.vx * skidDur * fPos + dxLat * gPos;
    z = skidNode.z + skidNode.vz * skidDur * fPos + dzLat * gPos;
    velX = skidNode.vx * fVel + dxLat * gVel;
    velZ = skidNode.vz * fVel + dzLat * gVel;
    accX = skidNode.vx * fAcc + dxLat * gAcc;
    accZ = skidNode.vz * fAcc + dzLat * gAcc;
    speed = Math.hypot(velX, velZ);

    const stopX = skidNode.x + (skidNode.vx * skidDur) / expN + dxLat;
    const stopZ = skidNode.z + (skidNode.vz * skidDur) / expN + dzLat;
    const approachYaw = Math.atan2(skidNode.vx, -skidNode.vz);
    const monumentYaw = Math.atan2(
      SHORELINE_MONUMENT_WORLD.x - stopX,
      -(SHORELINE_MONUMENT_WORLD.z - stopZ)
    );
    const uYaw = smootherstep01(clamp(uSkid / 0.58, 0.0, 1.0));
    headingYaw = wrapAngleSigned(approachYaw + wrapAngleSigned(monumentYaw - approachYaw) * uYaw);

    if (t < SHORELINE_SKID_END_SEC - 0.02 && speed > 0.04) {
      const velYaw = Math.atan2(velX, -velZ);
      slipAngleDeg = Math.abs(wrapAngleSigned(velYaw - headingYaw)) * RAD_TO_DEG;
    }

    rearWheelLock = smoothstep01((t - SHORELINE_SKID_START_SEC) / 0.07);
    if (t >= 67.88 && t <= 68.82) {
      shorelineSkidIntensity =
        smoothstep01((t - 67.88) / 0.07) * (1.0 - smoothstep01((t - 68.66) / 0.16));
    }

    // Inward slide lean peaking at `-0.33 rad` (`~19°`) + subtle tire-bite upright rebound (`68.80s -> 69.06s`) -> exact `0.00 rad`
    const leanIn = smoothstep01((t - SHORELINE_SKID_START_SEC) / 0.22);
    const leanOut = 1.0 - smootherstep01((t - 68.45) / 0.40);
    const rebU = clamp((t - 68.80) / 0.26, 0.0, 1.0);
    const rebWave =
      t >= 68.80 && t <= 69.06 ? 0.024 * Math.sin(Math.PI * rebU) * (1.0 - smoothstep01(rebU)) : 0.0;
    skidBankRad = -0.33 * leanIn * leanOut + rebWave;
    skidSteerRad =
      0.22 * leanIn * (1.0 - smootherstep01((t - 68.42) / 0.42));

    if (t >= 68.75 && t <= 69.10) {
      skidSuspPulseM = 0.0028 * Math.sin(Math.PI * ((t - 68.75) / 0.35));
    }

    if (t >= SHORELINE_DISMOUNT_START_SEC) {
      celebrationDismountBlend = smootherstep01(
        (t - SHORELINE_DISMOUNT_START_SEC) /
          (SHORELINE_DISMOUNT_END_SEC - SHORELINE_DISMOUNT_START_SEC)
      );
      const s10Cam = evaluateShot10FinaleCamera(t).worldCam;
      celebrationTargetWorldYaw = Math.atan2(s10Cam.x - x, -(s10Cam.z - z));
    }
  } else if (speed > 1e-4) {
    headingYaw = Math.atan2(velX, -velZ);
  } else if (chIdx === 4) {
    headingYaw = Math.atan2(
      SHORELINE_MONUMENT_WORLD.x - x,
      -(SHORELINE_MONUMENT_WORLD.z - z)
    );
  }

  const rightX = Math.cos(headingYaw);
  const rightZ = Math.sin(headingYaw);
  const kappa =
    speed > 0.4 ? clamp((accX * rightX + accZ * rightZ) / (speed * speed), -0.18, 0.18) : 0.0;

  // V8-10B Trainer Stand Breakaway Hop & Damped `5.2cm` Release Drop (`t >= 7.40s` onto `y = 0.000m` hardwood floor!)
  let jumpHeightM = 0.0;
  let verticalVelMps = 0.0;
  const vy0Hop = 0.68; // Crisp unlatch pop off roller lip from `y(7.400) = +0.052m` -> `0.000m` floor at `tau = 0.1934s`
  const tauFloorHit =
    (vy0Hop + Math.sqrt(vy0Hop * vy0Hop + 2.0 * 9.81 * TRAINER_STAND_ELEVATION_M)) / 9.81; // 0.19344s
  const reboundDur = 0.11;
  if (
    chIdx === 0 &&
    t >= V5_TRAINER_RELEASE_SEC - 1e-6 &&
    t < V5_TRAINER_RELEASE_SEC + tauFloorHit + reboundDur
  ) {
    const tauHop = Math.max(0.0, t - V5_TRAINER_RELEASE_SEC);
    if (tauHop <= tauFloorHit) {
      jumpHeightM = Math.max(
        0.0,
        TRAINER_STAND_ELEVATION_M + vy0Hop * tauHop - 0.5 * 9.81 * tauHop * tauHop
      );
      verticalVelMps = vy0Hop - 9.81 * tauHop;
    } else {
      const dtReb = tauHop - tauFloorHit;
      const uReb = clamp(dtReb / reboundDur, 0.0, 1.0);
      const damp = Math.exp(-8.5 * dtReb);
      jumpHeightM = 0.011 * Math.sin(Math.PI * uReb) * damp;
      verticalVelMps =
        0.011 *
        ((Math.PI / reboundDur) * Math.cos(Math.PI * uReb) - 8.5 * Math.sin(Math.PI * uReb)) *
        damp;
    }
  }

  // V8-06 Athletic Rider Preload Crouch (`~35ms` before `53.550s` ramp lip, peaking at `t = 53.515s`) + Landing Cushion (`57.20..57.48s`)
  let preloadCrouch = 0.0;
  if (chIdx === 3) {
    if (t >= SLOWMO_TAKEOFF_SEC - 0.22 && t <= SLOWMO_TAKEOFF_SEC) {
      const peakT = SLOWMO_TAKEOFF_SEC - 0.035; // Exact `35ms` before lip!
      if (t <= peakT) {
        preloadCrouch = 0.90 * smootherstep01((t - (SLOWMO_TAKEOFF_SEC - 0.22)) / (peakT - (SLOWMO_TAKEOFF_SEC - 0.22)));
      } else {
        // Begin explosive upward bunny-hop extension across the final `35ms` onto the lip
        preloadCrouch = lerp(0.90, 0.88, smoothstep01((t - peakT) / 0.035));
      }
    } else if (t >= SLOWMO_LAND_SEC && t <= SLOWMO_LAND_SEC + 0.28) {
      const dtLand = t - SLOWMO_LAND_SEC;
      preloadCrouch =
        0.62 *
        smoothstep01(dtLand / 0.055) *
        (1.0 - smootherstep01((dtLand - 0.055) / 0.225));
    }
  }

  const stanSignals = evaluateStanEncounterSignals(t, x, z, headingYaw);
  if (stanSignals.centerHopM > jumpHeightM) {
    jumpHeightM = stanSignals.centerHopM;
    verticalVelMps = stanSignals.centerHopVyMps;
  }
  const inGym = chIdx === 0 && z > GYM_BREAKOUT_CONFIG.glassPlaneZ && Math.abs(x) <= 12.0;
  const isAirborne = jumpHeightM > 0.015;
  const coastFactor = evaluateStoryCoastFactor(t);
  const sprintPost = chIdx === 0 ? evaluateTrainerSprintKinematics(t, 1.0) : null;
  const peelOutSlipBlend = sprintPost ? sprintPost.peelOutSlipBlend : 0.0;
  const roadRpm =
    ((speed / (BIKE_CONSTANTS.wheelRadiusM * GEAR_RATIO)) * coastFactor * 60.0) / TWO_PI;
  const cadenceRpmOverride =
    peelOutSlipBlend > 1e-6
      ? lerp(roadRpm, TRAINER_SPRINT_SPEC.rpmPeak, peelOutSlipBlend)
      : null;

  return {
    chapterIdx: chIdx,
    x,
    z,
    headingYaw,
    groundSpeedMps: speed,
    rollerSpeedMps: speed,
    displaySpeedMps: speed,
    cadenceRpmOverride,
    coastFactor,
    kappa,
    jumpHeightM,
    verticalVelMps,
    airPitchRad: null,
    preloadCrouch,
    onTrainerStand: false,
    inGym,
    inSlowMoJump: false,
    timeScale: 1.0,
    wingFlare: evaluateWingFlare({
      isAirborne,
      inSlowMoJump: false,
      jumpHeightM,
      glassBracePhase: glassSignals.glassBracePhase,
      startledWingFlare: stanSignals.pelicanStartledWingFlare,
    }),
    glassBracePhase: glassSignals.glassBracePhase,
    postSmashShake: glassSignals.postSmashShake,
    beakOpen: stanSignals.pelicanStartledBeakOpen || 0.0,
    trainerSparkIntensity: smokeSignals.burnoutSmokeIntensity,
    burnoutSmokeIntensity: smokeSignals.burnoutSmokeIntensity,
    peelOutBurstIntensity: smokeSignals.peelOutBurstIntensity,
    trainerCadenceRpm: TRAINER_SPRINT_SPEC.rpmPeak,
    trainerPowerWatts: TRAINER_SPRINT_SPEC.powerWattsPeak,
    trainerSprintProgress: 1.0,
    trainerRollerOmega: sprintPost ? sprintPost.trainerRollerOmega * peelOutSlipBlend : 0.0,
    trainerRollerSpinRad: sprintPost ? sprintPost.trainerRollerPhaseRad : 0.0,
    peelOutSlipBlend,
    sprintTorsoLeanRad: sprintPost
      ? sprintPost.sprintTorsoLeanRad * (1.0 - glassSignals.glassBracePhase)
      : 0.0,
    sprintHipRockRad: sprintPost
      ? sprintPost.sprintHipRockRad * (1.0 - glassSignals.glassBracePhase)
      : 0.0,
    sprintShoulderRockRad: sprintPost
      ? sprintPost.sprintShoulderRockRad * (1.0 - glassSignals.glassBracePhase)
      : 0.0,
    sprintWingTuck: sprintPost
      ? sprintPost.sprintWingTuck * (1.0 - glassSignals.glassBracePhase)
      : 0.0,
    trainerFrameShudderM: sprintPost ? sprintPost.trainerFrameShudderM : 0.0,
    trainerFrameShudderRollRad: sprintPost ? sprintPost.trainerFrameShudderRollRad : 0.0,
    slipAngleDeg,
    shorelineSkidIntensity,
    rearWheelLock,
    skidBankRad,
    skidSteerRad,
    skidSuspPulseM,
    celebrationDismountBlend,
    celebrationTargetWorldYaw,
    ...stanSignals,
  };
}

/**
 * Evaluates analytical `0.30s` Avian Gaze Anticipation (`turnLookaheadYaw`, `turnLookaheadDeltaYaw`, `gazeTargetWorld`)
 * for Pelican head/eye lookahead in both `story_autopilot` (chapter-clamped `t + 0.30s` path tangent) and `free_roam`:
 *   - Locks onto Stan's articulated bronze skull `(-115.6, 3.85, -47.4)` during the `stanRoar` encounter (`"stan_skull"`).
 *   - Locks onto the nearest uncollected forward-hemisphere `TPU 8i` wafer within `11.0m` (`"tpu_8i"`).
 *   - Locks dead-ahead onto the `4x6` muntin glass window bay `(0.0, 1.58, 131.20)` during Beat 3 pre-breakout sprint (`5.60s–7.40s`, `"window_breakout"`).
 *   - Otherwise tracks `6.0m` ahead along the `t + 0.30s` path tangent heading (`"path_lookahead"`).
 */
export function evaluateHeroGazeAnticipation({
  seqT = 0.0,
  isStoryMode = true,
  x = 0.0,
  y = 0.0,
  z = 140.2,
  headingYaw = 0.0,
  steerRad = 0.0,
  speedMps = 0.0,
  onTrainerStand = false,
  stanRoarIntensity = 0.0,
  pelicanGlanceBackYawRad = 0.0,
  celebrationDismountBlend = 0.0,
  tpuLedger = null,
} = {}) {
  let turnLookaheadYaw = Number(headingYaw) || 0.0;
  if (isStoryMode) {
    const tClamped = clamp(Number(seqT) || 0.0, 0.0, V5_STORY_DURATION_SEC);
    const chIdx = getStoryChapterIndexAtTime(tClamped);
    const chEnd = STORY_CHAPTER_BOUNDS[chIdx].endSec;
    const lookPose = evaluateStoryChapterPose(chIdx, Math.min(chEnd, tClamped + 0.30));
    turnLookaheadYaw = lookPose.headingYaw;
  } else {
    const wb = Math.max(0.5, Number(BIKE_CONSTANTS.wheelbaseM) || 1.085);
    const omegaYaw = ((Number(speedMps) || 0.0) * Math.tan(Number(steerRad) || 0.0)) / wb;
    turnLookaheadYaw = wrapAngleSigned(turnLookaheadYaw + clamp(omegaYaw * 0.30, -0.65, 0.65));
  }
  const turnLookaheadDeltaYaw = wrapAngleSigned(turnLookaheadYaw - (Number(headingYaw) || 0.0));

  const fwdX = Math.sin(headingYaw);
  const fwdZ = -Math.cos(headingYaw);
  const lookFwdX = Math.sin(turnLookaheadYaw);
  const lookFwdZ = -Math.cos(turnLookaheadYaw);

  let gx = x + lookFwdX * 6.0;
  let gy = (Number(y) || 0.0) + 1.18;
  let gz = z + lookFwdZ * 6.0;
  let targetType = "path_lookahead";

  if (isStoryMode && (Number(celebrationDismountBlend) || 0.0) > 0.15) {
    const s10Cam = evaluateShot10FinaleCamera(seqT).worldCam;
    const uCelGaze = smoothstep01(((Number(celebrationDismountBlend) || 0.0) - 0.15) / 0.55);
    gx = lerp(gx, s10Cam.x, uCelGaze);
    gy = lerp(gy, s10Cam.y, uCelGaze);
    gz = lerp(gz, s10Cam.z, uCelGaze);
    targetType = "shoreline_camera";
  } else if (isStoryMode && onTrainerStand && seqT >= 5.20) {
    const uWin = smootherstep01((seqT - 5.20) / 0.80);
    gx = lerp(gx, 0.0, uWin);
    gy = lerp(gy, 1.58, uWin);
    gz = lerp(gz, GYM_BREAKOUT_CONFIG.glassPlaneZ, uWin);
    if (seqT >= 5.60) targetType = "window_breakout";
  }

  if (
    (Number(stanRoarIntensity) || 0.0) > 0.12 ||
    Math.abs(Number(pelicanGlanceBackYawRad) || 0.0) > 0.05
  ) {
    gx = STAN_SKULL_WORLD.x;
    gy = STAN_SKULL_WORLD.y;
    gz = STAN_SKULL_WORLD.z;
    targetType = "stan_skull";
  } else if (!onTrainerStand) {
    let bestDist = 11.0;
    let bestSp = null;
    for (let i = 0; i < TPU_SPAWNS.length; i++) {
      if (tpuLedger && tpuLedger[i] && tpuLedger[i].collected) continue;
      const sp = TPU_SPAWNS[i];
      const dx = sp.x - x;
      const dz = sp.z - z;
      const dist = Math.hypot(dx, dz);
      if (dist <= bestDist && dist > 0.20) {
        const along = dx * fwdX + dz * fwdZ;
        if (along >= 0.15) {
          bestDist = dist;
          bestSp = sp;
        }
      }
    }
    if (bestSp) {
      gx = bestSp.x;
      gy = getOpenWorldTerrainHeight(bestSp.x, bestSp.z) + (bestSp.bonusHeightM || 0.55);
      gz = bestSp.z;
      targetType = "tpu_8i";
    }
  }

  const dGaze = Math.hypot(gx - x, gz - z);
  const gazeYaw = dGaze > 1e-4 ? Math.atan2(gx - x, -(gz - z)) : turnLookaheadYaw;

  return {
    turnLookaheadYaw,
    turnLookaheadDeltaYaw,
    gazeTargetWorld: {
      x: gx,
      y: gy,
      z: gz,
      yaw: gazeYaw,
      targetType,
    },
  };
}

/**
 * Evaluates exact analytical pose along the 72.0s V5 Story Auto-Pilot timeline (`seqT` in `[0, 72.0]`).
 */
export function evaluateStoryPoseAtTime(seqT) {
  const t = clamp(Number(seqT) || 0.0, 0.0, V5_STORY_DURATION_SEC);
  const chIdx = getStoryChapterIndexAtTime(t);
  return evaluateStoryChapterPose(chIdx, t);
}

/**
 * Deterministic zero-Three.js Story Snapshot (`getStorySnapshot(t)`), exposing all master timestamps,
 * V6 Spin-Studio Accelerating Sprint (`trainerCadenceRpm` `36 -> 168`, `trainerPowerWatts` `140 -> 1260`),
 * Pelican pose/speed/surprise signals, V7 `0.30s` Avian Gaze + Cold-Open DoF signals, Stan T-Rex signals, and Director Hint.
 */
export function getStorySnapshot(seqT) {
  const t = clamp(Number(seqT) || 0.0, 0.0, V5_STORY_DURATION_SEC);
  const pose = evaluateStoryPoseAtTime(t);
  const calibratedSpeedMps = evaluateStoryCalibratedSpeedMps(t, pose, 0.0, 1.0);
  const directorHint = evaluateDirectorHint(t, pose.jumpHeightM);
  const heroGroundY = getOpenWorldTerrainHeight(pose.x, pose.z);
  const gaze = evaluateHeroGazeAnticipation({
    seqT: t,
    isStoryMode: true,
    x: pose.x,
    y: heroGroundY + (pose.jumpHeightM || 0.0),
    z: pose.z,
    headingYaw: pose.headingYaw,
    steerRad: 0.0,
    speedMps: calibratedSpeedMps,
    onTrainerStand: pose.onTrainerStand,
    stanRoarIntensity: pose.stanRoarIntensity,
    pelicanGlanceBackYawRad: pose.pelicanGlanceBackYawRad,
    celebrationDismountBlend: pose.celebrationDismountBlend,
    tpuLedger: null,
  });
  const liveCadenceRpm =
    pose.cadenceRpmOverride !== null && pose.cadenceRpmOverride !== undefined
      ? pose.cadenceRpmOverride
      : ((calibratedSpeedMps / (BIKE_CONSTANTS.wheelRadiusM * GEAR_RATIO)) *
          (pose.coastFactor ?? 1.0) *
          60.0) /
        TWO_PI;
  return {
    t,
    sequenceTime: t,
    totalDurationSec: V5_STORY_DURATION_SEC,
    trainerReleaseTime: V5_TRAINER_RELEASE_SEC,
    glassBreakTime: V5_GLASS_SMASH_SEC,
    stanRoarTriggerTime: STAN_ROAR_TRIGGER_SEC,
    pelicanSurpriseOnsetTime: PELICAN_SURPRISE_ONSET_SEC,
    ...pose,
    cadenceRpm: liveCadenceRpm,
    omegaCrank: (liveCadenceRpm * TWO_PI) / 60.0,
    speedMps: calibratedSpeedMps,
    speedKmh: pose.onTrainerStand ? 0.0 : calibratedSpeedMps * 3.6,
    glassShattered:
      pose.z <= GYM_BREAKOUT_CONFIG.glassPlaneZ + 1e-6 ||
      t >= V5_GLASS_SMASH_SEC - 1e-6 ||
      pose.chapterIdx > 0,
    dofFocusDistM: directorHint.dofFocusDistM,
    dofStrength: directorHint.dofStrength,
    coldOpenBeat: directorHint.coldOpenBeat,
    turnLookaheadYaw: gaze.turnLookaheadYaw,
    turnLookaheadDeltaYaw: gaze.turnLookaheadDeltaYaw,
    gazeTargetWorld: gaze.gazeTargetWorld,
    stanRoarSignal: {
      triggerTime: STAN_ROAR_TRIGGER_SEC,
      trackPhase: pose.stanTrackPhase,
      headWhipPhase: pose.stanHeadWhipPhase,
      roarIntensity: pose.stanRoarIntensity,
      jawOpenNorm: pose.stanJawOpenNorm,
      jawOpenDeg: pose.stanJawOpenDeg,
      headYawRad: pose.stanHeadYawRad,
      headPitchRad: pose.stanHeadPitchRad,
      tailSwayRad: pose.stanTailSwayRad,
      cameraRumble: pose.stanCameraRumble,
      cameraRumbleOffset: pose.stanCameraRumbleOffset,
    },
    directorHint,
  };
}

/**
 * V7 Section 6 — `C^2` Quintic-Bezier Closed Asphalt Waymo Loops & Exact Ackermann Kinematics:
 *   - Replaces piecewise-linear chord snaps & impossible `4.4m` hairpins with `C^2` Quintic-Bezier
 *     corner fillets (`kappa(0) === 0`, `kappa(1) === 0`, `R_min = 8.62m–9.80m` inside `[8.5m, 10.5m]`).
 *   - Exact Ackermann steering (`L = 2.92m`, `W = 1.62m`, `|delta| <= 32 deg`, `cot(outer) - cot(inner) === W / L`).
 *   - Intersection speed profiling (`5.8 m/s` straight -> `3.0 m/s` through `90°` turns -> smooth re-accel).
 *   - `1.8 Hz` amber turn signals (`turnSignalLeft`, `turnSignalRight`, `blinkOn`) starting `2.0s` before turn entry through apex.
 */
function evalQuinticBezier2D(P0, P1, P2, P3, P4, P5, u) {
  const o = 1.0 - u;
  const o2 = o * o;
  const o3 = o2 * o;
  const o4 = o3 * o;
  const o5 = o4 * o;
  const u2 = u * u;
  const u3 = u2 * u;
  const u4 = u3 * u;
  const u5 = u4 * u;

  const x =
    o5 * P0.x +
    5.0 * o4 * u * P1.x +
    10.0 * o3 * u2 * P2.x +
    10.0 * o2 * u3 * P3.x +
    5.0 * o * u4 * P4.x +
    u5 * P5.x;
  const z =
    o5 * P0.z +
    5.0 * o4 * u * P1.z +
    10.0 * o3 * u2 * P2.z +
    10.0 * o2 * u3 * P3.z +
    5.0 * o * u4 * P4.z +
    u5 * P5.z;

  const dx =
    5.0 *
    (o4 * (P1.x - P0.x) +
      4.0 * o3 * u * (P2.x - P1.x) +
      6.0 * o2 * u2 * (P3.x - P2.x) +
      4.0 * o * u3 * (P4.x - P3.x) +
      u4 * (P5.x - P4.x));
  const dz =
    5.0 *
    (o4 * (P1.z - P0.z) +
      4.0 * o3 * u * (P2.z - P1.z) +
      6.0 * o2 * u2 * (P3.z - P2.z) +
      4.0 * o * u3 * (P4.z - P3.z) +
      u4 * (P5.z - P4.z));

  const d2x =
    20.0 *
    (o3 * (P2.x - 2.0 * P1.x + P0.x) +
      3.0 * o2 * u * (P3.x - 2.0 * P2.x + P1.x) +
      3.0 * o * u2 * (P4.x - 2.0 * P3.x + P2.x) +
      u3 * (P5.x - 2.0 * P4.x + P3.x));
  const d2z =
    20.0 *
    (o3 * (P2.z - 2.0 * P1.z + P0.z) +
      3.0 * o2 * u * (P3.z - 2.0 * P2.z + P1.z) +
      3.0 * o * u2 * (P4.z - 2.0 * P3.z + P2.z) +
      u3 * (P5.z - 2.0 * P4.z + P3.z));

  const ds = Math.hypot(dx, dz) || 1e-6;
  const yaw = Math.atan2(dx / ds, -dz / ds);
  // World heading yaw = 0 is -Z, +PI/2 is +X -> kappa > 0 is Right turn, kappa < 0 is Left turn
  const kappa = (dx * d2z - dz * d2x) / (ds * ds * ds);
  return { x, z, yaw, kappa };
}

export function computeAckermannSteeringFromKappa(rawKappa) {
  const kappa = clamp(Number(rawKappa) || 0.0, -WAYMO_KAPPA_MAX, WAYMO_KAPPA_MAX);
  const L = WAYMO_KINEMATICS_SPEC.wheelbaseM;
  const W = WAYMO_KINEMATICS_SPEC.trackWidthM;
  const delta = clamp(Math.atan(L * kappa), -WAYMO_MAX_STEER_RAD, WAYMO_MAX_STEER_RAD);
  const steerFL = clamp(
    Math.atan((L * kappa) / Math.max(0.25, 1.0 + 0.5 * W * kappa)),
    -WAYMO_MAX_STEER_RAD,
    WAYMO_MAX_STEER_RAD
  );
  const steerFR = clamp(
    Math.atan((L * kappa) / Math.max(0.25, 1.0 - 0.5 * W * kappa)),
    -WAYMO_MAX_STEER_RAD,
    WAYMO_MAX_STEER_RAD
  );
  return { kappa, delta, steerFL, steerFR };
}

function buildWaymoLoopSpec(route) {
  const pts = route.waypoints;
  const m = pts.length;
  const setback = Number(route.filletSetbackM) || 12.2;
  const straightSpeedMps = Number(route.speedMps) || 5.8;
  const turnSpeedMps = Number(route.turnSpeedMps) || 3.0;
  const alpha = 0.26;
  const cornerSteps = 96;

  const corners = [];
  for (let i = 0; i < m; i++) {
    const prev = pts[(i - 1 + m) % m];
    const curr = pts[i];
    const next = pts[(i + 1) % m];

    const vInX = curr.x - prev.x;
    const vInZ = curr.z - prev.z;
    const lenIn = Math.hypot(vInX, vInZ) || 1.0;

    const vOutX = next.x - curr.x;
    const vOutZ = next.z - curr.z;
    const lenOut = Math.hypot(vOutX, vOutZ) || 1.0;

    const tin = { x: vInX / lenIn, z: vInZ / lenIn };
    const tout = { x: vOutX / lenOut, z: vOutZ / lenOut };
    const d = Math.min(setback, lenIn * 0.4, lenOut * 0.4);
    const c = alpha * d;

    // Collinear P0,P1,P2 and P3,P4,P5 guarantee exact C^2 zero-curvature joins onto the straights!
    const P0 = { x: curr.x - tin.x * d, z: curr.z - tin.z * d };
    const P1 = { x: P0.x + tin.x * c, z: P0.z + tin.z * c };
    const P2 = { x: P0.x + tin.x * 2.0 * c, z: P0.z + tin.z * 2.0 * c };
    const P5 = { x: curr.x + tout.x * d, z: curr.z + tout.z * d };
    const P4 = { x: P5.x - tout.x * c, z: P5.z - tout.z * c };
    const P3 = { x: P5.x - tout.x * 2.0 * c, z: P5.z - tout.z * 2.0 * c };
    corners.push({ P0, P1, P2, P3, P4, P5, tin });
  }

  const samples = [];
  const cornerWindows = [];
  let cumS = 0.0;

  for (let i = 0; i < m; i++) {
    const prevC = corners[(i - 1 + m) % m];
    const curC = corners[i];
    const straightLen = Math.hypot(curC.P0.x - prevC.P5.x, curC.P0.z - prevC.P5.z);
    const straightYaw = Math.atan2(curC.tin.x, -curC.tin.z);
    const nStr = Math.max(4, Math.ceil(straightLen / 0.25));

    for (let k = 0; k < nStr; k++) {
      const u = k / nStr;
      const x = lerp(prevC.P5.x, curC.P0.x, u);
      const z = lerp(prevC.P5.z, curC.P0.z, u);
      if (samples.length > 0) {
        const last = samples[samples.length - 1];
        cumS += Math.hypot(x - last.x, z - last.z);
      }
      samples.push({ s: cumS, x, z, yaw: straightYaw, kappa: 0.0, vProfile: straightSpeedMps, tFree: 0.0 });
    }

    const lastBeforeCorner = samples[samples.length - 1];
    const sEnter = cumS + Math.hypot(curC.P0.x - lastBeforeCorner.x, curC.P0.z - lastBeforeCorner.z);
    const enterSampleIdx = samples.length;
    let apexS = sEnter;
    let apexSampleIdx = enterSampleIdx;
    let peakAbsKappa = 0.0;
    let peakSignedKappa = 0.0;

    for (let k = 0; k <= cornerSteps; k++) {
      if (i === m - 1 && k === cornerSteps) continue;
      const u = k / cornerSteps;
      const ev = evalQuinticBezier2D(curC.P0, curC.P1, curC.P2, curC.P3, curC.P4, curC.P5, u);
      const last = samples[samples.length - 1];
      cumS += Math.hypot(ev.x - last.x, ev.z - last.z);
      const curIdx = samples.length;
      samples.push({ s: cumS, x: ev.x, z: ev.z, yaw: ev.yaw, kappa: ev.kappa, vProfile: turnSpeedMps, tFree: 0.0 });
      if (Math.abs(ev.kappa) > peakAbsKappa) {
        peakAbsKappa = Math.abs(ev.kappa);
        peakSignedKappa = ev.kappa;
        apexS = cumS;
        apexSampleIdx = curIdx;
      }
    }

    cornerWindows.push({
      sEnter,
      sApex: apexS,
      sExit: cumS,
      enterSampleIdx,
      apexSampleIdx,
      exitSampleIdx: samples.length - 1,
      tEnter: 0.0,
      tApex: 0.0,
      tExit: 0.0,
      turnDir: peakSignedKappa >= 0.0 ? 1 : -1, // +1 = Right turn, -1 = Left turn
      minRadiusM: peakAbsKappa > 1e-6 ? 1.0 / peakAbsKappa : 999.0,
    });
  }

  const lastSmp = samples[samples.length - 1];
  const totalLen = Math.max(
    1.0,
    cumS + Math.hypot(samples[0].x - lastSmp.x, samples[0].z - lastSmp.z)
  );

  // Smooth intersection speed profile: `5.8 m/s` on straights -> `3.0 m/s` (`[2.8, 3.2] m/s`) through `90°` turns -> smooth re-accel
  const brakeDistM = 13.5;
  const accelDistM = 11.5;
  const cycDist = (fromS, toS) => (((toS - fromS) % totalLen) + totalLen) % totalLen;

  for (let idx = 0; idx < samples.length; idx++) {
    const smp = samples[idx];
    let vDes = straightSpeedMps;
    for (let c = 0; c < cornerWindows.length; c++) {
      const cw = cornerWindows[c];
      const dBefore = cycDist(smp.s, cw.sEnter);
      const dInto = cycDist(cw.sEnter, smp.s);
      const cornerLen = cycDist(cw.sEnter, cw.sExit);
      if (dInto <= cornerLen) {
        const uExit = smoothstep01((dInto - 0.78 * cornerLen) / (0.22 * cornerLen + accelDistM));
        vDes = Math.min(vDes, lerp(turnSpeedMps, straightSpeedMps, uExit));
      } else if (dBefore <= brakeDistM) {
        const uBrake = smoothstep01((brakeDistM - dBefore) / brakeDistM);
        vDes = Math.min(vDes, lerp(straightSpeedMps, turnSpeedMps, uBrake));
      } else {
        const dAfter = cycDist(cw.sExit, smp.s);
        if (dAfter <= accelDistM) {
          const uAccel = smoothstep01((0.22 * cornerLen + dAfter) / (0.22 * cornerLen + accelDistM));
          vDes = Math.min(vDes, lerp(turnSpeedMps, straightSpeedMps, uAccel));
        }
      }
    }
    smp.vProfile = vDes;
  }

  // Integrate free-flow cycle time `tFree(s)` for exact `2.0s` turn-signal lookahead & deterministic time seeks
  let cumT = 0.0;
  samples[0].tFree = 0.0;
  for (let idx = 1; idx < samples.length; idx++) {
    const ds = samples[idx].s - samples[idx - 1].s;
    const vAvg = Math.max(0.5, 0.5 * (samples[idx - 1].vProfile + samples[idx].vProfile));
    cumT += ds / vAvg;
    samples[idx].tFree = cumT;
  }
  const wrapDs = totalLen - samples[samples.length - 1].s;
  const wrapVAvg = Math.max(0.5, 0.5 * (samples[samples.length - 1].vProfile + samples[0].vProfile));
  const totalCycleTimeSec = Math.max(1.0, cumT + wrapDs / wrapVAvg);

  for (let c = 0; c < cornerWindows.length; c++) {
    const cw = cornerWindows[c];
    cw.tEnter = samples[Math.min(samples.length - 1, cw.enterSampleIdx)].tFree;
    cw.tApex = samples[Math.min(samples.length - 1, cw.apexSampleIdx)].tFree;
    cw.tExit = samples[Math.min(samples.length - 1, cw.exitSampleIdx)].tFree;
  }

  const spec = {
    id: route.id,
    vehicleType: route.vehicleType,
    speedMps: straightSpeedMps,
    turnSpeedMps,
    phase: route.phase || 0.0,
    samples,
    cornerWindows,
    totalLen,
    totalCycleTimeSec,
    phaseTimeSec: 0.0,
  };
  spec.phaseTimeSec = sampleWaymoLoopAtDistance(spec, spec.phase * spec.totalLen).tFree;
  return spec;
}

const WAYMO_LOOP_SPECS = WAYMO_ROUTES.map(buildWaymoLoopSpec);

function sampleWaymoLoopAtDistance(spec, distM) {
  const s = ((distM % spec.totalLen) + spec.totalLen) % spec.totalLen;
  const arr = spec.samples;
  const n = arr.length;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (arr[mid].s <= s) lo = mid;
    else hi = mid - 1;
  }
  const a = arr[lo];
  const b = arr[(lo + 1) % n];
  const segS = lo + 1 < n ? b.s - a.s : spec.totalLen - a.s;
  const f = segS > 1e-6 ? clamp((s - a.s) / segS, 0.0, 1.0) : 0.0;

  const x = lerp(a.x, b.x, f);
  const z = lerp(a.z, b.z, f);
  const yaw = wrapAngleSigned(a.yaw + wrapAngleSigned(b.yaw - a.yaw) * f);
  const rawKappa = lerp(a.kappa, b.kappa, f);
  const ack = computeAckermannSteeringFromKappa(rawKappa);
  const vProfile = lerp(a.vProfile, b.vProfile, f);
  const endT = lo + 1 < n ? b.tFree : spec.totalCycleTimeSec;
  const tFree = lerp(a.tFree, endT, f);

  // Analytical free-flow longitudinal acceleration dv/dt = v * dv/ds for deterministic init/seek pitch
  const dvDs = segS > 1e-5 ? (b.vProfile - a.vProfile) / segS : 0.0;
  const accelFreeMps2 = vProfile * dvDs;

  return {
    s,
    x,
    z,
    yaw,
    kappa: ack.kappa,
    delta: ack.delta,
    steerFL: ack.steerFL,
    steerFR: ack.steerFR,
    vProfile,
    tFree,
    accelFreeMps2,
  };
}

function sampleWaymoLoopAtFreeTime(spec, tFreeRaw) {
  const t = ((tFreeRaw % spec.totalCycleTimeSec) + spec.totalCycleTimeSec) % spec.totalCycleTimeSec;
  const arr = spec.samples;
  const n = arr.length;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (arr[mid].tFree <= t) lo = mid;
    else hi = mid - 1;
  }
  const a = arr[lo];
  const b = arr[(lo + 1) % n];
  const endT = lo + 1 < n ? b.tFree : spec.totalCycleTimeSec;
  const endS = lo + 1 < n ? b.s : spec.totalLen;
  const segT = endT - a.tFree;
  const f = segT > 1e-6 ? clamp((t - a.tFree) / segT, 0.0, 1.0) : 0.0;
  return sampleWaymoLoopAtDistance(spec, lerp(a.s, endS, f));
}

/**
 * Circle-vs-AABB smooth pushout + tangential velocity slide (`zero-trap` open-world collision helper).
 */
function deflectCircleFromAABB(x, z, vx, vz, radius, minX, maxX, minZ, maxZ) {
  const cx = clamp(x, minX, maxX);
  const cz = clamp(z, minZ, maxZ);
  const dx = x - cx;
  const dz = z - cz;
  const distSq = dx * dx + dz * dz;

  if (distSq >= radius * radius) {
    return { x, z, vx, vz, hit: false };
  }

  let nx = 0.0;
  let nz = 0.0;
  let outX = x;
  let outZ = z;

  if (distSq > 1e-8) {
    const dist = Math.sqrt(distSq);
    nx = dx / dist;
    nz = dz / dist;
    outX = cx + nx * radius;
    outZ = cz + nz * radius;
  } else {
    // Center is inside AABB: push out along minimum penetration face
    const penLeft = x - minX;
    const penRight = maxX - x;
    const penNorth = z - minZ;
    const penSouth = maxZ - z;
    const minPen = Math.min(penLeft, penRight, penNorth, penSouth);
    if (minPen === penLeft) {
      nx = -1.0;
      outX = minX - radius;
    } else if (minPen === penRight) {
      nx = 1.0;
      outX = maxX + radius;
    } else if (minPen === penNorth) {
      nz = -1.0;
      outZ = minZ - radius;
    } else {
      nz = 1.0;
      outZ = maxZ + radius;
    }
  }

  const vn = vx * nx + vz * nz;
  let outVx = vx;
  let outVz = vz;
  if (vn < 0.0) {
    outVx -= vn * nx;
    outVz -= vn * nz;
  }
  return { x: outX, z: outZ, vx: outVx, vz: outVz, hit: true, nx, nz };
}

/**
 * Resolves all static open-world boundaries (Buildings, Gradient Canopy side piers, Bay View Pond,
 * Stevens Creek water outside the bridge deck, and World Bounds) with zero-trap tangential sliding.
 */
export function resolveOpenWorldCollisions(x, z, vx, vz, glassShattered = true) {
  let px = x;
  let pz = z;
  let pvx = vx;
  let pvz = vz;
  let collided = false;
  let brokeGlass = false;

  const r = PLAYER_COLLISION_RADIUS_M;

  // 1. Campus Building Blocks (`CAMPUS_BUILDING_BLOCKS` — skipping open-air drive-under `solar_carport`!)
  for (let i = 0; i < CAMPUS_BUILDING_BLOCKS.length; i++) {
    const b = CAMPUS_BUILDING_BLOCKS[i];
    if (b.style === "solar_carport") continue;
    const halfWx = b.wx * 0.5;
    const halfWz = b.wz * 0.5;
    const res = deflectCircleFromAABB(
      px,
      pz,
      pvx,
      pvz,
      r,
      b.cx - halfWx,
      b.cx + halfWx,
      b.cz - halfWz,
      b.cz + halfWz
    );
    if (res.hit) {
      px = res.x;
      pz = res.z;
      pvx = res.vx;
      pvz = res.vz;
      collided = true;
    }
  }

  // 1B. Monument Plinth Circle Colliders (Bronze Stan T-Rex `(-118, -50, R=4.55m)` & Android Bugdroid `(-118, 96, R=2.45m)`)
  const plinths = [
    { cx: -118.0, cz: -50.0, rad: 4.55 + r },
    { cx: -118.0, cz: 96.0, rad: 2.45 + r },
  ];
  for (let i = 0; i < plinths.length; i++) {
    const pl = plinths[i];
    const dxP = px - pl.cx;
    const dzP = pz - pl.cz;
    const dP = Math.hypot(dxP, dzP);
    if (dP < pl.rad) {
      const nx = dP > 1e-5 ? dxP / dP : 1.0;
      const nz = dP > 1e-5 ? dzP / dP : 0.0;
      px = pl.cx + nx * pl.rad;
      pz = pl.cz + nz * pl.rad;
      const vn = pvx * nx + pvz * nz;
      if (vn < 0.0) {
        pvx -= vn * nx;
        pvz -= vn * nz;
      }
      collided = true;
    }
  }

  // 2. Gradient Canopy Gym Side Piers & South Back Wall (keeping central `x in [-2.35, +2.35]` corridor open!)
  const canopyWalls = [
    { minX: -28.0, maxX: -2.35 - r * 0.1, minZ: 129.8, maxZ: 154.0 }, // West gym pier
    { minX: 2.35 + r * 0.1, maxX: 28.0, minZ: 129.8, maxZ: 154.0 },   // East gym pier
    { minX: -28.0, maxX: 28.0, minZ: 151.8, maxZ: 158.0 },            // South back wall
  ];
  for (let i = 0; i < canopyWalls.length; i++) {
    const w = canopyWalls[i];
    const res = deflectCircleFromAABB(px, pz, pvx, pvz, r, w.minX, w.maxX, w.minZ, w.maxZ);
    if (res.hit) {
      px = res.x;
      pz = res.z;
      pvx = res.vx;
      pvz = res.vz;
      collided = true;
    }
  }

  // If glass hasn't shattered yet and player crosses glassPlaneZ inside the central pane, shatter it!
  if (!glassShattered && Math.abs(px) <= 2.5 && pz <= GYM_BREAKOUT_CONFIG.glassPlaneZ) {
    brokeGlass = true;
  }

  // 3. Bay View Retention Pond (`x > 166, z in [-68, 98]`)
  {
    const res = deflectCircleFromAABB(px, pz, pvx, pvz, r, 166.0, 245.0, -68.0, 98.0);
    if (res.hit) {
      px = res.x;
      pz = res.z;
      pvx = res.vx;
      pvz = res.vz;
      collided = true;
    }
  }

  // 4. Stevens Creek Tidal Channel (`z in [-151.0, -95.2]`) outside `stevens_creek_bridge` deck
  if (pz < -93.0 && pz > -154.0) {
    const br = getStevensCreekBridgeParam(px, pz);
    const maxSafeDeck = 2.65;
    if (br.uRaw > -0.04 && br.uRaw < 1.04 && br.dPerp < 6.2) {
      // On or right next to the bridge: keep cleanly inside the Corten Warren truss guardrails
      if (br.dPerp > maxSafeDeck && pz < -94.0 && pz > -152.5) {
        const cx = 52.0 + br.uClamped * -34.0;
        const cz = -86.0 + br.uClamped * -72.0;
        const dx = px - cx;
        const dz = pz - cz;
        const d = Math.hypot(dx, dz) || 1.0;
        const nx = -dx / d;
        const nz = -dz / d;
        px = cx + (dx / d) * maxSafeDeck;
        pz = cz + (dz / d) * maxSafeDeck;
        const vn = pvx * nx + pvz * nz;
        if (vn < 0.0) {
          pvx -= vn * nx;
          pvz -= vn * nz;
        }
        collided = true;
      }
    } else if (pz < -95.2 && pz > -151.0) {
      // Approaching Stevens Creek water away from the bridge mouth: slide along South or North creek bank
      const distSouth = Math.abs(pz - -95.2);
      const distNorth = Math.abs(pz - -151.0);
      if (distSouth <= distNorth) {
        pz = -95.2;
        if (pvz < 0.0) pvz = 0.0;
      } else {
        pz = -151.0;
        if (pvz > 0.0) pvz = 0.0;
      }
      collided = true;
    }
  }

  // 5. Outer Campus `WORLD_BOUNDS` (`[-235..235, -235..185]`)
  const margin = 2.0;
  if (px < WORLD_BOUNDS.minX + margin) {
    px = WORLD_BOUNDS.minX + margin;
    if (pvx < 0) pvx = 0;
    collided = true;
  } else if (px > WORLD_BOUNDS.maxX - margin) {
    px = WORLD_BOUNDS.maxX - margin;
    if (pvx > 0) pvx = 0;
    collided = true;
  }
  if (pz < WORLD_BOUNDS.minZ + margin) {
    pz = WORLD_BOUNDS.minZ + margin;
    if (pvz < 0) pvz = 0;
    collided = true;
  } else if (pz > WORLD_BOUNDS.maxZ - margin) {
    pz = WORLD_BOUNDS.maxZ - margin;
    if (pvz > 0) pvz = 0;
    collided = true;
  }

  return { x: px, z: pz, vx: pvx, vz: pvz, collided, brokeGlass };
}

/**
 * Resolves closest district badge title for the current `(x, z)` coordinate.
 */
function resolveDistrictNameAt(x, z, inGym = false) {
  if (inGym) return "Gradient Canopy Gym";
  if (z < -152.0) return "Shoreline Amphitheatre";
  const br = getStevensCreekBridgeParam(x, z);
  if (br.onDeck) return "Stevens Creek Corten Bridge";
  let bestTitle = CAMPUS_LANDMARKS[0].title;
  let bestDistSq = Infinity;
  for (let i = 0; i < CAMPUS_LANDMARKS.length; i++) {
    const lm = CAMPUS_LANDMARKS[i];
    const d2 = (x - lm.x) * (x - lm.x) + (z - lm.z) * (z - lm.z);
    if (d2 < bestDistSq) {
      bestDistSq = d2;
      bestTitle = lm.title;
    }
  }
  return bestTitle;
}

let _activeControllerInstance = null;

export class OpenWorldGameController {
  constructor(rng = null) {
    _activeControllerInstance = this;
    if (typeof rng === "function") {
      this.rng = rng;
    } else if (typeof rng === "number") {
      this.rng = createMulberry32(rng);
    } else {
      this.rng = createMulberry32(0x96499486);
    }

    this.bikeDyn = createBikeDynamicsState();
    this.accumulator = 0.0;

    // Input state (Keyboard + Virtual Input)
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      sprint: false,
      celebrateHold: false,
    };
    this.virtualInput = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      sprint: false,
      celebrate: false,
      throttle: 0.0,
      steer: 0.0,
    };

    // Hero dynamic physics state
    this.x = GYM_BREAKOUT_CONFIG.trainerX;
    this.y = 0.0;
    this.z = GYM_BREAKOUT_CONFIG.trainerZ;
    this.headingYaw = GYM_BREAKOUT_CONFIG.trainerHeadingYaw;
    this.speedMps = 0.0;
    this.steerRad = 0.0;
    this.bankRad = 0.0;
    this.jumpHeightM = 0.0;
    this.verticalVelMps = 0.0;
    this.isAirborne = false;
    this.airFromSlowMoRamp = false;

    this.wheelRad = 0.0;
    this.rearWheelRad = 0.0;
    this.frontWheelRad = 0.0;
    this.crankRad = 0.0;
    this.chainDistM = 0.0;
    this.totalArcDistM = 0.0;
    this.completedLoopsDistM = 0.0;
    this.clipDistancesM = [0.0, 0.0, 0.0, 0.0, 0.0];
    this.cameraTrauma = 0.0;
    this.newlyShatteredGlass = false;
    this.wingFlare = 0.0;
    this.glassBracePhase = 0.0;
    this.postSmashShake = 0.0;
    this.beakClapPhase = 0.0;
    this.aeroCrouch = 0.0;
    this.beakOpen = 0.0;
    this.friendlyNod = 0.0;
    this.coastFactor = 1.0;
    this.trainerSparkIntensity = 0.0;
    this.burnoutSmokeIntensity = 0.0;
    this.peelOutBurstIntensity = 0.0;
    this.slipAngleDeg = 0.0;
    this.shorelineSkidIntensity = 0.0;
    this.celebrationDismountBlend = 0.0;
    this.celebrationTargetWorldYaw = null;
    this._skidSuspPulseM = 0.0;
    this._rearWheelLock = 0.0;
    this._rearWheelLocked = false;
    this._freeRoamCelebrateToggle = false;
    this._freeRoamCelebrationBlend = 0.0;
    this._cadenceRpmOverride = null;
    this._storyChapterIdx = 0;
    this._freeRoamCruiseClock = 0.0;
    this._freeRoamPeelTimer = 0.0;
    this._trainerBounceTimer = 0.0;

    // Scripted Story Event Guards & Secondary Motion Timers (reset on loop/seek)
    this._scriptedAndroidBell = false;
    this._scriptedStanRoar = false;
    this._scriptedTrexBell = false;
    this._scriptedPostSmashClap = false;
    this._scriptedRampHop = false;
    this._storyHopY = 0.0;
    this._storyHopVy = 0.0;
    this.frontWheelHopM = 0.0;
    this.wheeliePitchRad = 0.0;
    this._activeBoostTotalSec = 3.4;
    this._lastClapElapsedTime = -10.0;
    this._lastClapKind = "standard";
    this._freeRoamGlassSmashElapsed = -1.0;
    this._freeRoamPostSmashClapped = false;
    this._boostCooldownByPad = Object.create(null);
    this._lastRampLaunchId = "";
    this._rampLaunchCooldown = 0.0;

    // Autonomous Waymo Gen 6 fleet state (`5` vehicles on C^2 US right-hand-traffic closed asphalt loops)
    this.waymos = WAYMO_LOOP_SPECS.map((spec) => {
      const initDist = ((spec.phase * spec.totalLen) % spec.totalLen + spec.totalLen) % spec.totalLen;
      const pose = sampleWaymoLoopAtDistance(spec, initDist);
      const maxRollRad = WAYMO_KINEMATICS_SPEC.maxRollRad || 0.043633;
      const maxPitchRad = WAYMO_KINEMATICS_SPEC.maxPitchRad || 0.020071;
      const initRollRad = clamp(
        0.0365 * pose.vProfile * pose.vProfile * pose.kappa,
        -maxRollRad,
        maxRollRad
      );
      const initPitchRad = clamp(-0.0102 * pose.accelFreeMps2, -maxPitchRad, maxPitchRad);
      return {
        id: spec.id,
        type: spec.vehicleType,
        vehicleType: spec.vehicleType,
        distM: initDist,
        speedScale: 1.0,
        speedMps: pose.vProfile,
        wheelRad: 0.0,
        wheelSpinRad: 0.0,
        lidarSpinRad: spec.phase * TWO_PI,
        x: pose.x,
        y: getOpenWorldTerrainHeight(pose.x, pose.z),
        z: pose.z,
        yaw: pose.yaw,
        kappa: pose.kappa,
        delta: pose.delta,
        steerFL: pose.steerFL,
        steerFR: pose.steerFR,
        rollRad: initRollRad,
        pitchRad: initPitchRad,
        signalClockSec: 0.0,
        turnSignalLeft: false,
        turnSignalRight: false,
        blinkOn: false,
        yielding: false,
      };
    });

    // 54 Live Pink Flamingos around Googleplex Stan T-Rex (`(-118, -50)`) — Pre-allocated (Zero GC!)
    this.flamingos = this._initFlamingos(54);

    // 16 Kinetic Wind Pinwheels dynamic spin state
    this.pinwheels = KINETIC_PINWHEELS.map((pw) => ({
      id: pw.id,
      x: pw.x,
      z: pw.z,
      phase: pw.phase,
      spinRad: pw.phase,
      angularVel: 2.3 + (pw.phase % 1.0) * 0.7,
      boostVel: 0.0,
    }));

    this._boundTargetWin = null;
    this._onKeyDown = null;
    this._onKeyUp = null;
    this._onBlur = null;
    this._internalStateSync = false;

    this.directorHint = evaluateDirectorHint(0.0);
    this.snapshot = null;

    this._bindContractBusListeners();
    this.resetToState(state.currentState || "play_all", 0.0);
  }

  _initFlamingos(count = 54) {
    const cx = -118.0;
    const cz = -50.0;
    const arr = new Array(count);
    for (let i = 0; i < count; i++) {
      // Golden-angle spiral ring on the lush green Stan T-Rex courtyard lawn (`R in [4.6m, 13.0m]` outside the 4.55m plinth!)
      const frac = (i + 0.5) / count;
      const r = 4.65 + 8.30 * Math.sqrt(frac) + (this.rng() - 0.5) * 0.45;
      const theta = i * 2.399963 + (this.rng() - 0.5) * 0.28;
      const hx = cx + Math.cos(theta) * r;
      const hz = cz + Math.sin(theta) * r;
      const baseGround = getOpenWorldTerrainHeight(hx, hz);
      arr[i] = {
        index: i,
        homeX: hx,
        homeZ: hz,
        x: hx,
        y: baseGround,
        z: hz,
        vx: 0.0,
        vz: 0.0,
        hopY: 0.0,
        vy: 0.0,
        yaw: this.rng() * TWO_PI - Math.PI,
        phase: this.rng() * TWO_PI,
        wingFlap: 0.0,
        scattered: false,
      };
    }
    return arr;
  }

  _triggerBeakClap(kind = "standard", atTimeSec = state.elapsedTime) {
    const nowSec = Number.isFinite(atTimeSec) ? atTimeSec : Number(state.elapsedTime) || 0.0;
    if (
      kind === "standard" &&
      this._lastClapKind === "cluster" &&
      Math.abs(nowSec - this._lastClapElapsedTime) < 1e-4
    ) {
      return;
    }
    this._lastClapElapsedTime = nowSec;
    this._lastClapKind = kind;
    this.beakClapPhase = evaluateBeakClapWave(
      Math.max(0.0, (Number(state.elapsedTime) || 0.0) - nowSec),
      this._lastClapKind,
      this.glassBracePhase
    );
    state.beakClapPhase = this.beakClapPhase;
    state.kinematics.beakClapPhase = this.beakClapPhase;
  }

  _bindContractBusListeners() {
    this._busAbort?.abort();
    this._busAbort = typeof AbortController !== "undefined" ? new AbortController() : null;
    const opts = this._busAbort ? { signal: this._busAbort.signal } : undefined;

    bus.addEventListener(
      DEMO_EVENTS.BUNNY_HOPPED,
      (e) => {
        if (_activeControllerInstance && _activeControllerInstance !== this) return;
        const src = e.detail?.source || "";
        if (src !== "controller_internal") {
          this.triggerBunnyHop(Number(e.detail?.impulse) || 5.2, false);
        }
      },
      opts
    );

    bus.addEventListener(
      DEMO_EVENTS.BELL_RUNG,
      () => {
        if (_activeControllerInstance && _activeControllerInstance !== this) return;
        this._applyBellWorldInteractions();
        this._triggerBeakClap("standard", state.elapsedTime);
      },
      opts
    );

    bus.addEventListener(
      DEMO_EVENTS.TPU_COLLECTED,
      () => {
        if (_activeControllerInstance && _activeControllerInstance !== this) return;
        this._triggerBeakClap("standard", state.elapsedTime);
      },
      opts
    );

    bus.addEventListener(
      DEMO_EVENTS.CLUSTER_BOOTED,
      () => {
        if (_activeControllerInstance && _activeControllerInstance !== this) return;
        this._triggerBeakClap("cluster", state.elapsedTime);
      },
      opts
    );

    bus.addEventListener(
      DEMO_EVENTS.BOOST_TRIGGERED,
      (e) => {
        if (_activeControllerInstance && _activeControllerInstance !== this) return;
        const dur = Number(e.detail?.durationSec) || state.boostRemainingSec || 3.4;
        this._activeBoostTotalSec = Math.max(0.5, dur);
      },
      opts
    );

    bus.addEventListener(
      DEMO_EVENTS.STATE_CHANGED,
      (e) => {
        if (_activeControllerInstance && _activeControllerInstance !== this) return;
        if (this._internalStateSync) return;
        const det = e.detail || {};
        if (det.internalTransition) return;
        if (det.reset) {
          this.resetToState("play_all", 0.0);
        } else if (state.gameMode === "free_roam") {
          this._enterFreeRoamFromCurrentPose();
        } else {
          const targetT =
            state.currentState === "play_all"
              ? state.sequenceTime || 0.0
              : state.clipLocalTime || 0.0;
          this.resetToState(state.currentState, targetT);
        }
      },
      opts
    );

    bus.addEventListener(
      DEMO_EVENTS.FREE_ROAM_CHANGED,
      (e) => {
        if (_activeControllerInstance && _activeControllerInstance !== this) return;
        if (this._internalStateSync) return;
        const isRoam = Boolean(e.detail?.freeRoam);
        if (isRoam) {
          this._enterFreeRoamFromCurrentPose(e.detail);
        }
      },
      opts
    );
  }

  dispose() {
    this.unbindInputListeners();
    this._busAbort?.abort();
    this._busAbort = null;
    if (_activeControllerInstance === this) {
      _activeControllerInstance = null;
    }
  }

  _enterFreeRoamFromCurrentPose(detail = null) {
    if (detail?.teleport) {
      state.inGym = false;
      state.onTrainerStand = false;
      state.glassShattered = true;
      this.x = Number.isFinite(detail.x) ? detail.x : state.playerX;
      this.z = Number.isFinite(detail.z) ? detail.z : state.playerZ;
      this.y = getOpenWorldTerrainHeight(this.x, this.z);
      this.headingYaw = Number.isFinite(detail.yaw) ? detail.yaw : state.playerHeadingYaw;
      state.playerX = this.x;
      state.playerZ = this.z;
      state.playerHeadingYaw = this.headingYaw;
      this.jumpHeightM = 0.0;
      this.verticalVelMps = 0.0;
      this.isAirborne = false;
      this.speedMps = Math.max(this.speedMps, BIKE_CONSTANTS.baseSpeedMps);
      this._cadenceRpmOverride = null;
      this.coastFactor = 1.0;
      this._freeRoamGlassSmashElapsed = -1.0;
      this._freeRoamPostSmashClapped = false;
      this.glassBracePhase = 0.0;
      this.postSmashShake = 0.0;
      state.inSlowMoJump = false;
      state.timeScale = 1.0;
      state.directorShotLabel = "";
      return;
    }
    // If breaking out straight from the stationary `+0.052m` gym trainer, drop/pop cleanly onto the hardwood floor!
    if (state.onTrainerStand) {
      state.onTrainerStand = false;
      this.jumpHeightM = Math.max(this.jumpHeightM, TRAINER_STAND_ELEVATION_M);
      this.verticalVelMps = Math.max(this.verticalVelMps, 0.95);
      this.isAirborne = true;
      this.speedMps = Math.max(this.speedMps, 5.35);
      this._freeRoamPeelTimer = 0.85;
    } else if (this.speedMps < 1.8) {
      this.speedMps = BIKE_CONSTANTS.baseSpeedMps;
    }
    this._cadenceRpmOverride = null;
    this.coastFactor = 1.0;

    // Preserve seamless rollout if player takes over right during the Story glass smash (`9.35s..10.95s`)
    if (
      state.glassShattered &&
      state.sequenceTime >= V5_GLASS_SMASH_SEC - 0.05 &&
      state.sequenceTime < 10.95
    ) {
      this._freeRoamGlassSmashElapsed = Math.max(
        0.0,
        state.sequenceTime - V5_GLASS_SMASH_SEC
      );
      this._freeRoamPostSmashClapped = this._scriptedPostSmashClap;
    } else if (state.glassShattered) {
      this._freeRoamGlassSmashElapsed = -1.0;
      this._freeRoamPostSmashClapped = false;
      this.glassBracePhase = 0.0;
      this.postSmashShake = 0.0;
    } else {
      this._freeRoamGlassSmashElapsed = -1.0;
      this._freeRoamPostSmashClapped = false;
    }

    this.x = state.playerX;
    this.z = state.playerZ;
    this.headingYaw = state.playerHeadingYaw;
    state.inSlowMoJump = false;
    state.timeScale = 1.0;
    state.directorShotLabel = "";
  }

  bindInputListeners(targetWindow = typeof window !== "undefined" ? window : null) {
    _activeControllerInstance = this;
    if (!targetWindow || typeof targetWindow.addEventListener !== "function") return;
    this.unbindInputListeners();
    this._boundTargetWin = targetWindow;

    const isEditableTarget = (el) => {
      if (!el || typeof el !== "object") return false;
      const tag = String(el.tagName || "").toUpperCase();
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || Boolean(el.isContentEditable);
    };

    this._onKeyDown = (e) => {
      if (isEditableTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const code = e.code || "";
      let isDriveKey = false;

      switch (code) {
        case "KeyW":
        case "ArrowUp":
          this.keys.forward = true;
          isDriveKey = true;
          break;
        case "KeyS":
        case "ArrowDown":
          this.keys.backward = true;
          isDriveKey = true;
          break;
        case "KeyA":
        case "ArrowLeft":
          this.keys.left = true;
          isDriveKey = true;
          break;
        case "KeyD":
        case "ArrowRight":
          this.keys.right = true;
          isDriveKey = true;
          break;
        case "ShiftLeft":
        case "ShiftRight":
          this.keys.sprint = true;
          break;
        case "KeyV":
          if (!e.repeat && state.gameMode === "free_roam" && Math.abs(this.speedMps) < 0.12 && !this.isAirborne) {
            this._freeRoamCelebrateToggle = !this._freeRoamCelebrateToggle;
          }
          break;
        case "Space":
          if (state.gameMode === "free_roam" && Math.abs(this.speedMps) < 0.12 && !this.isAirborne) {
            this.keys.celebrateHold = true;
          }
          break;
        default:
          break;
      }

      if (isDriveKey) {
        if (typeof e.preventDefault === "function" && code.startsWith("Arrow")) {
          e.preventDefault();
        }
        // Instant Zero-Menu Open-World Takeover (`WASD` / `Arrows`)!
        if (state.gameMode === "story_autopilot") {
          this._internalStateSync = true;
          dispatchAction(DEMO_ACTIONS.SET_FREE_ROAM, { enabled: true, source: "keyboard" });
          this._internalStateSync = false;
          this._enterFreeRoamFromCurrentPose();
        }
        dispatchAction(DEMO_ACTIONS.USER_ACTIVITY, { source: "keyboard" });
      }
    };

    this._onKeyUp = (e) => {
      const code = e.code || "";
      switch (code) {
        case "KeyW":
        case "ArrowUp":
          this.keys.forward = false;
          break;
        case "KeyS":
        case "ArrowDown":
          this.keys.backward = false;
          break;
        case "KeyA":
        case "ArrowLeft":
          this.keys.left = false;
          break;
        case "KeyD":
        case "ArrowRight":
          this.keys.right = false;
          break;
        case "ShiftLeft":
        case "ShiftRight":
          this.keys.sprint = false;
          break;
        case "Space":
          this.keys.celebrateHold = false;
          break;
        default:
          break;
      }
    };

    this._onBlur = () => {
      this.keys.forward = false;
      this.keys.backward = false;
      this.keys.left = false;
      this.keys.right = false;
      this.keys.sprint = false;
      this.keys.celebrateHold = false;
    };

    targetWindow.addEventListener("keydown", this._onKeyDown);
    targetWindow.addEventListener("keyup", this._onKeyUp);
    targetWindow.addEventListener("blur", this._onBlur);
  }

  unbindInputListeners() {
    if (!this._boundTargetWin) return;
    if (this._onKeyDown) this._boundTargetWin.removeEventListener("keydown", this._onKeyDown);
    if (this._onKeyUp) this._boundTargetWin.removeEventListener("keyup", this._onKeyUp);
    if (this._onBlur) this._boundTargetWin.removeEventListener("blur", this._onBlur);
    this._boundTargetWin = null;
  }

  setVirtualInput(inp = {}) {
    _activeControllerInstance = this;
    if (!inp || typeof inp !== "object") return;
    if (inp.forward !== undefined) this.virtualInput.forward = Boolean(inp.forward);
    if (inp.backward !== undefined) this.virtualInput.backward = Boolean(inp.backward);
    if (inp.left !== undefined) this.virtualInput.left = Boolean(inp.left);
    if (inp.right !== undefined) this.virtualInput.right = Boolean(inp.right);
    if (inp.sprint !== undefined) this.virtualInput.sprint = Boolean(inp.sprint);
    if (inp.celebrate !== undefined) {
      this.virtualInput.celebrate = Boolean(inp.celebrate);
      if (!inp.celebrate) this._freeRoamCelebrateToggle = false;
    }
    if (inp.celebrateToggle) {
      this._freeRoamCelebrateToggle = !this._freeRoamCelebrateToggle;
    }
    if (inp.throttle !== undefined) {
      this.virtualInput.throttle = clamp(Number(inp.throttle) || 0.0, -1.0, 1.0);
    }
    if (inp.steer !== undefined) {
      this.virtualInput.steer = clamp(Number(inp.steer) || 0.0, -1.0, 1.0);
    }
    if (inp.hop || inp.bunnyHop) {
      this.triggerBunnyHop(5.2, true);
    }
    if (inp.bell) {
      dispatchAction(DEMO_ACTIONS.RING_BELL, { source: "virtual" });
    }

    const activeDrive =
      this.virtualInput.forward ||
      this.virtualInput.backward ||
      this.virtualInput.left ||
      this.virtualInput.right ||
      Math.abs(this.virtualInput.throttle) > 0.05 ||
      Math.abs(this.virtualInput.steer) > 0.05;

    if (activeDrive && inp.takeover !== false && state.gameMode === "story_autopilot") {
      this._internalStateSync = true;
      dispatchAction(DEMO_ACTIONS.SET_FREE_ROAM, { enabled: true, source: "virtual" });
      this._internalStateSync = false;
      this._enterFreeRoamFromCurrentPose();
    }
  }

  triggerBunnyHop(impulse = 5.2, emitAction = false) {
    _activeControllerInstance = this;
    // Playful additive ballistic hop during `story_autopilot` (`VETO-UX-02`) without breaking Story path!
    if (state.gameMode === "story_autopilot") {
      if (state.onTrainerStand) {
        this._trainerBounceTimer = 0.50;
        this.bikeDyn.suspVel += 0.09;
        this._triggerBeakClap("standard", state.elapsedTime);
        if (emitAction) {
          dispatchAction(DEMO_ACTIONS.BUNNY_HOP, {
            source: "controller_internal",
            impulse: 3.6,
            onTrainerStand: true,
          });
        }
        return;
      }
      if (!state.inSlowMoJump && this._storyHopY <= 0.04) {
        const hopImp = clamp(Number(impulse) || 5.2, 4.6, 6.2);
        this._storyHopVy = hopImp;
        this._storyHopY = Math.max(this._storyHopY, 0.025);
        this.jumpHeightM = Math.max(this.jumpHeightM, this._storyHopY);
        this.verticalVelMps = this._storyHopVy;
        this.isAirborne = true;
        state.isAirborne = true;
        if (emitAction) {
          dispatchAction(DEMO_ACTIONS.BUNNY_HOP, {
            source: "controller_internal",
            impulse: hopImp,
          });
        }
      }
      return;
    }

    if (state.onTrainerStand) {
      state.onTrainerStand = false;
      this.speedMps = Math.max(this.speedMps, 5.35);
      this._freeRoamPeelTimer = 0.85;
    }
    if (!this.isAirborne && this.jumpHeightM <= 0.05) {
      this.verticalVelMps = Math.max(3.2, Number(impulse) || 5.2);
      this.jumpHeightM = Math.max(this.jumpHeightM, 0.02);
      this.isAirborne = true;
      this.airFromSlowMoRamp = false;
      if (emitAction) {
        dispatchAction(DEMO_ACTIONS.BUNNY_HOP, {
          source: "controller_internal",
          impulse: this.verticalVelMps,
        });
      }
    }
  }

  _applyBellWorldInteractions() {
    const px = this.x;
    const pz = this.z;

    // 1. Scatter nearby Stan T-Rex Pink Flamingos (`(-118, -50)`)
    let newlyScattered = 0;
    for (let i = 0; i < this.flamingos.length; i++) {
      const fl = this.flamingos[i];
      const dx = fl.x - px;
      const dz = fl.z - pz;
      const dist = Math.hypot(dx, dz);
      if (dist <= 28.0) {
        const dirX = dist > 1e-3 ? dx / dist : Math.cos(fl.phase);
        const dirZ = dist > 1e-3 ? dz / dist : Math.sin(fl.phase);
        const kick = 4.2 + (1.0 - clamp(dist / 28.0, 0.0, 1.0)) * 4.5;
        fl.vx += dirX * kick;
        fl.vz += dirZ * kick;
        fl.vy = Math.max(fl.vy, 2.6 + (i % 5) * 0.35);
        fl.hopY = Math.max(fl.hopY, 0.03);
        fl.yaw = Math.atan2(dirX, -dirZ);
        fl.wingFlap = 1.0;
        fl.scattered = true;
        newlyScattered++;
      }
    }
    if (newlyScattered > 0) {
      state.flamingosScattered = Math.max(state.flamingosScattered, newlyScattered);
    }

    // 2. Make Android Bugdroid wave when ringing near Android Lawn (`(-118, 96)`)
    if (Math.hypot(px - -118.0, pz - 96.0) <= 28.0) {
      state.bugdroidWaved = true;
      this.friendlyNod = 0.72;
    }

    // 3. Accelerate nearby Google Kinetic Wind Pinwheels
    for (let i = 0; i < this.pinwheels.length; i++) {
      const pw = this.pinwheels[i];
      const d = Math.hypot(pw.x - px, pw.z - pz);
      if (d <= 32.0) {
        pw.boostVel = Math.max(pw.boostVel, 7.5 * (1.0 - d / 34.0));
      }
    }
  }

  _applyStanRoarFlamingoScatter() {
    // Radial sub-bass roar shockwave from Stan T-Rex (`(-118, -50)`) scattering all 54 courtyard flamingos!
    for (let i = 0; i < this.flamingos.length; i++) {
      const fl = this.flamingos[i];
      const dx = fl.x - STAN_TREX_POS.x;
      const dz = fl.z - STAN_TREX_POS.z;
      const dist = Math.hypot(dx, dz);
      const dirX = dist > 1e-3 ? dx / dist : Math.cos(fl.phase);
      const dirZ = dist > 1e-3 ? dz / dist : Math.sin(fl.phase);
      const kick = 4.8 + (1.0 - clamp(dist / 22.0, 0.0, 1.0)) * 4.6;
      fl.vx += dirX * kick;
      fl.vz += dirZ * kick;
      fl.vy = Math.max(fl.vy, 2.75 + (i % 5) * 0.35);
      fl.hopY = Math.max(fl.hopY, 0.035);
      fl.yaw = Math.atan2(dirX, -dirZ);
      fl.wingFlap = 1.0;
      fl.scattered = true;
    }
    state.flamingosScattered = this.flamingos.length;
  }

  /**
   * Instant deterministic seek / reset to `play_all`, `free_roam`, or `clip1..clip5` (plus aliases)
   * at arbitrary timestamp `tSec` (powering `window.__renderAtTime(tSec)` with 100% parity).
   */
  resetToState(stateKey = "play_all", tSec = 0.0) {
    _activeControllerInstance = this;
    const normalized = normalizeStateKey(stateKey);
    const clampedT = Math.max(0.0, Number(tSec) || 0.0);

    this.accumulator = 0.0;
    this.newlyShatteredGlass = false;
    this.cameraTrauma = 0.0;
    this.glassBracePhase = 0.0;
    this.postSmashShake = 0.0;
    this.beakClapPhase = 0.0;
    this.aeroCrouch = 0.0;
    this.wingFlare = 0.0;
    this.coastFactor = 1.0;
    this.trainerSparkIntensity = 0.0;
    this.burnoutSmokeIntensity = 0.0;
    this.peelOutBurstIntensity = 0.0;
    this.slipAngleDeg = 0.0;
    this.shorelineSkidIntensity = 0.0;
    this.celebrationDismountBlend = 0.0;
    this.celebrationTargetWorldYaw = null;
    this._skidSuspPulseM = 0.0;
    this._rearWheelLock = 0.0;
    this._rearWheelLocked = false;
    this._freeRoamCelebrateToggle = false;
    this._freeRoamCelebrationBlend = 0.0;
    this._cadenceRpmOverride = null;
    this._storyChapterIdx = 0;
    this._freeRoamCruiseClock = 0.0;
    this._freeRoamPeelTimer = 0.0;
    this._activeBoostTotalSec = 3.4;
    this._lastClapElapsedTime = -10.0;
    this._lastClapKind = "standard";
    this._scriptedAndroidBell = false;
    this._scriptedStanRoar = false;
    this._scriptedTrexBell = false;
    this._scriptedPostSmashClap = false;
    this._scriptedRampHop = false;
    this._storyHopY = 0.0;
    this._storyHopVy = 0.0;
    this.frontWheelHopM = 0.0;
    this.wheeliePitchRad = 0.0;
    this._trainerBounceTimer = 0.0;
    this.clipDistancesM = [0.0, 0.0, 0.0, 0.0, 0.0];
    this._freeRoamGlassSmashElapsed = -1.0;
    this._freeRoamPostSmashClapped = false;
    this._boostCooldownByPad = Object.create(null);
    this._lastRampLaunchId = "";
    this._rampLaunchCooldown = 0.0;

    this._internalStateSync = true;
    state.currentState = normalized;
    state.elapsedTime = clampedT;
    state.boostRemainingSec = 0.0;
    this._lastKnownElapsedTime = clampedT;

    // V8-05 State Lock: Pelican wears Noogler Cap 100% of the time across all modes & resets!
    state.nooglerCapUnlocked = true;
    state.wearNooglerHat = true;

    if (normalized === "free_roam") {
      state.gameMode = "free_roam";
      state.isAutoplay = false;
      state.isAutoTourActive = false;
      state.inGym = false;
      state.onTrainerStand = false;
      state.glassShattered = true;
      state.inSlowMoJump = false;
      state.timeScale = 1.0;
      state.directorShotLabel = "";
      this.directorHint = {
        shotId: "free_roam_cinema",
        shotType: "free_roam",
        fov: 35,
        anchorGroundY: false,
        cameraUp: null,
        camOffset: { right: 2.35, up: 1.18, back: 4.4, forward: -4.4 },
        lookOffset: { right: 0.0, up: 0.92, forward: 2.2, back: -2.2 },
        worldBlend: 0.0,
        worldCam: null,
        worldLook: null,
        isOverhead: false,
        dofFocusDistM: 4.5,
        dofStrength: 0.0,
        coldOpenBeat: 0,
        label: "",
      };
      state.tpuLedger.forEach((item) => {
        item.collected = false;
        item.collectedAtSec = -1;
      });
      state.clusterOnline = false;
      state.nooglerCapUnlocked = true;
      state.wearNooglerHat = true;

      this.x = 0.0;
      this.z = 114.0;
      this.headingYaw = 0.0;
      this.speedMps = BIKE_CONSTANTS.baseSpeedMps;
      this.jumpHeightM = 0.0;
      this.verticalVelMps = 0.0;
      this.isAirborne = false;
      this.steerRad = 0.0;
      this.bankRad = 0.0;
      this.totalArcDistM = clampedT * BIKE_CONSTANTS.baseSpeedMps;
      this.clipDistancesM = [this.totalArcDistM, 0.0, 0.0, 0.0, 0.0];
      state.segmentLedger.forEach((seg, idx) => {
        seg.coveredSec = idx === 0 ? Math.min(seg.durationSec, clampedT) : 0.0;
        seg.distanceM = idx === 0 ? this.totalArcDistM : 0.0;
      });
      this.wheelRad = this.totalArcDistM / BIKE_CONSTANTS.wheelRadiusM;
      this.rearWheelRad = this.wheelRad;
      this.frontWheelRad = this.wheelRad;
      this.crankRad = this.wheelRad / GEAR_RATIO;
      this.chainDistM = this.crankRad * KIN_CONSTANTS.chainringRadiusM;

      syncBikeDynamicsAnalytically(this.bikeDyn, {
        kappa: 0.0,
        speedMps: this.speedMps,
        surfaceType: "concrete",
        arcDistanceM: this.totalArcDistM,
        plankPitchM: CLIP5_PLANK_PITCH_M,
        crankRad: this.crankRad,
        simTime: clampedT,
      });

      this._syncWaymosDeterministically(clampedT);
      this._resetFlamingosToHome();
      for (let i = 0; i < this.pinwheels.length; i++) {
        const pw = this.pinwheels[i];
        pw.boostVel = 0.0;
        pw.spinRad = (pw.phase + clampedT * pw.angularVel) % TWO_PI;
      }
      this._syncStateAndTelemetry(0.0);
      this._internalStateSync = false;
      return this.snapshot;
    }

    // Story Auto-Pilot (`play_all` or `clip1..clip5`)
    state.gameMode = "story_autopilot";
    state.isAutoplay = true;
    state.isAutoTourActive = true;

    let seqT = 0.0;
    let activeClipIdx = 0;
    if (normalized === "play_all") {
      seqT =
        clampedT >= V5_STORY_DURATION_SEC && clampedT > 0
          ? clampedT % V5_STORY_DURATION_SEC
          : clampedT;
      activeClipIdx = this._findClipIndexForSeqTime(seqT);
      state.clipLocalTime = seqT - STORY_CHAPTER_BOUNDS[activeClipIdx].startSec;
    } else {
      const idx = STORY_CHAPTER_BOUNDS.findIndex((c) => c.id === normalized);
      activeClipIdx = idx >= 0 ? idx : 0;
      const clip = STORY_CHAPTER_BOUNDS[activeClipIdx];
      const dur = Math.max(0.1, clip.endSec - clip.startSec);
      const localT = clampedT >= dur && clampedT > 0 ? clampedT % dur : clampedT;
      state.clipLocalTime = localT;
      seqT = clip.startSec + localT;
    }

    state.sequenceTime = seqT;
    state.activeClipIndex = activeClipIdx;
    state.activeClipId = STORY_CHAPTER_BOUNDS[activeClipIdx].id;

    // Deterministically reconstruct exact arc-distance, dynamics springs, Waymos, Flamingos, TPUs & boosts along `[startScanT .. seqT]`
    this._reconstructStoryStateAtSeqTime(seqT, normalized);
    this._syncStateAndTelemetry(0.0);

    this._internalStateSync = false;
    return this.snapshot;
  }

  seekToTime(tSec = 0.0) {
    return this.resetToState(state.currentState || "play_all", tSec);
  }

  _findClipIndexForSeqTime(seqT) {
    for (let i = STORY_CHAPTER_BOUNDS.length - 1; i >= 0; i--) {
      if (seqT >= STORY_CHAPTER_BOUNDS[i].startSec - 1e-6) {
        return i;
      }
    }
    return 0;
  }

  _resetFlamingosToHome() {
    for (let i = 0; i < this.flamingos.length; i++) {
      const fl = this.flamingos[i];
      fl.x = fl.homeX;
      fl.z = fl.homeZ;
      fl.y = getOpenWorldTerrainHeight(fl.homeX, fl.homeZ);
      fl.vx = 0.0;
      fl.vz = 0.0;
      fl.hopY = 0.0;
      fl.vy = 0.0;
      fl.wingFlap = 0.0;
      fl.scattered = false;
    }
  }

  _stepDrivetrainAcrossStoryTick(
    prevSeqT,
    seqT,
    stepDt,
    ds,
    pose,
    baseCadenceScale,
    prevCrankRad,
    prevRearWheelRad,
    prevFrontWheelRad
  ) {
    if (pose.onTrainerStand) {
      const sp = evaluateTrainerSprintKinematics(seqT, baseCadenceScale);
      return {
        crankRad: sp.pedalPhaseRad,
        rearWheelRad: sp.trainerRollerPhaseRad,
        frontWheelRad: 0.0,
      };
    }

    let crankRad = prevCrankRad;
    let rearWheelRad = prevRearWheelRad;
    const frontWheelRad = prevFrontWheelRad + ds / BIKE_CONSTANTS.wheelRadiusM;
    let dtPost = stepDt;

    if (pose.chapterIdx === 0 && prevSeqT < V5_TRAINER_RELEASE_SEC - 1e-9) {
      const spRelease = evaluateTrainerSprintKinematics(V5_TRAINER_RELEASE_SEC, baseCadenceScale);
      crankRad = spRelease.pedalPhaseRad;
      rearWheelRad = spRelease.trainerRollerPhaseRad;
      dtPost = Math.max(0.0, seqT - V5_TRAINER_RELEASE_SEC);
    }

    if (dtPost <= 1e-12) {
      return { crankRad, rearWheelRad, frontWheelRad };
    }

    if (pose.chapterIdx === 0 && (pose.peelOutSlipBlend || 0.0) > 1e-6) {
      const tMid = Math.max(V5_TRAINER_RELEASE_SEC, seqT - 0.5 * dtPost);
      const midPose = evaluateStoryChapterPose(0, tMid);
      const omegaCrankMid =
        (((midPose.cadenceRpmOverride ?? TRAINER_SPRINT_SPEC.rpmPeak) * baseCadenceScale) *
          TWO_PI) /
        60.0;
      const omegaRoadRearMid =
        (Math.max(0.0, Number(midPose.groundSpeedMps) || 0.0) * baseCadenceScale) /
        BIKE_CONSTANTS.wheelRadiusM;
      const omegaPeakRear =
        TRAINER_SPRINT_SPEC.omegaPeak * baseCadenceScale * TRAINER_SPRINT_SPEC.trainerGearRatio;
      const omegaRearMid = lerp(
        omegaRoadRearMid,
        omegaPeakRear,
        midPose.peelOutSlipBlend || 0.0
      );
      crankRad += omegaCrankMid * dtPost;
      rearWheelRad += omegaRearMid * dtPost;
      return { crankRad, rearWheelRad, frontWheelRad };
    }

    const dWheel = ds / BIKE_CONSTANTS.wheelRadiusM;
    const rearLock = clamp(Number(pose.rearWheelLock) || 0.0, 0.0, 1.0);
    rearWheelRad += dWheel * (1.0 - rearLock);
    crankRad += (dWheel / GEAR_RATIO) * (pose.coastFactor ?? 1.0) * (1.0 - rearLock);
    if (pose.chapterIdx === 4 && seqT >= SHORELINE_SKID_START_SEC) {
      // Park crank smoothly so right crank sits aft (`crankRad ≡ -1.35 rad mod 2π`, right pedal `z = +0.248m`) out of standing leg corridor
      const targetParkCrank = Math.round((crankRad + 1.35) / TWO_PI) * TWO_PI - 1.35;
      const parkAlpha = 1.0 - Math.exp(-12.0 * dtPost);
      crankRad = lerp(crankRad, targetParkCrank, parkAlpha);
    }
    return { crankRad, rearWheelRad, frontWheelRad };
  }

  _computePriorStoryState(untilSeqT) {
    const dists = [0.0, 0.0, 0.0, 0.0, 0.0];
    let crankRad = 0.0;
    let rearWheelRad = 0.0;
    let frontWheelRad = 0.0;
    if (untilSeqT <= 0.0) return { dists, crankRad, rearWheelRad, frontWheelRad };
    const baseCadenceScale = clamp(Number(state.cadenceScale) || 1.0, 0.35, 2.0);
    const initP = evaluateStoryPoseAtTime(0.0);
    let prevX = initP.x;
    let prevZ = initP.z;
    let prevChIdx = initP.chapterIdx;
    let prevTs = 0.0;
    const steps = Math.max(1, Math.round(untilSeqT / FIXED_DT));
    for (let k = 1; k <= steps; k++) {
      const ts = Math.min(untilSeqT, k * FIXED_DT);
      const stepDt = Math.max(0.0, ts - prevTs);
      const p = evaluateStoryPoseAtTime(ts);
      const cIdx = this._findClipIndexForSeqTime(ts);
      let ds = 0.0;
      if (!p.onTrainerStand) {
        if (p.chapterIdx !== prevChIdx) {
          const chStart = STORY_CHAPTER_BOUNDS[p.chapterIdx].startSec;
          const refP = evaluateStoryChapterPose(p.chapterIdx, Math.max(chStart, ts - stepDt));
          ds = Math.hypot(p.x - refP.x, p.z - refP.z) * baseCadenceScale;
        } else {
          ds = Math.hypot(p.x - prevX, p.z - prevZ) * baseCadenceScale;
        }
      }
      dists[cIdx] += ds;
      const dtOut = this._stepDrivetrainAcrossStoryTick(
        prevTs,
        ts,
        stepDt,
        ds,
        p,
        baseCadenceScale,
        crankRad,
        rearWheelRad,
        frontWheelRad
      );
      crankRad = dtOut.crankRad;
      rearWheelRad = dtOut.rearWheelRad;
      frontWheelRad = dtOut.frontWheelRad;
      prevX = p.x;
      prevZ = p.z;
      prevChIdx = p.chapterIdx;
      prevTs = ts;
    }
    return { dists, crankRad, rearWheelRad, frontWheelRad };
  }

  _computePriorStoryDistances(untilSeqT) {
    return this._computePriorStoryState(untilSeqT).dists;
  }

  _awardTransitTpusUpTo(seqT, minAllowSec, simTimeSec, silentSeek = false) {
    for (let i = 0; i < STORY_TRANSIT_TPU_AWARDS.length; i++) {
      const aw = STORY_TRANSIT_TPU_AWARDS[i];
      if (aw.tSec < minAllowSec - 1e-6 || seqT < aw.tSec - 1e-7) continue;
      const item = state.tpuLedger[aw.index];
      if (!item || item.collected) continue;
      if (silentSeek) {
        item.collected = true;
        item.collectedAtSec = simTimeSec;
        state.lastTpuPickupTime = simTimeSec;
        const allCollected = state.tpuLedger.every((t) => t.collected);
        if (allCollected) {
          state.clusterOnline = true;
          state.nooglerCapUnlocked = true;
          if (state._manualNooglerHat === undefined) {
            state.wearNooglerHat = true;
          }
          this._lastClapElapsedTime = simTimeSec;
          this._lastClapKind = "cluster";
        } else {
          this._lastClapElapsedTime = simTimeSec;
          this._lastClapKind = "standard";
        }
      } else {
        dispatchAction(DEMO_ACTIONS.COLLECT_TPU, { id: aw.id, index: aw.index });
      }
    }
  }

  /**
   * Shared single-tick Story integrator called identically by both `_stepStoryAutopilotFixed`
   * and `_reconstructStoryStateAtSeqTime` to guarantee `< 1e-6` step-vs-seek parity across
   * `bankRad`, `steerRad`, `suspensionCompressionMm`, `gularDeflectionM`, `arcDistanceM`, and actors.
   */
  _advanceStoryTickInternal(seqT, stepDt, simTimeAtStep, silentSeek = false, wrappedLoop = false) {
    const prevX = this.x;
    const prevZ = this.z;
    const prevChIdx = this._storyChapterIdx;
    const wasAirborne = this.isAirborne;
    const pose = evaluateStoryPoseAtTime(seqT);
    const chapterCut = wrappedLoop || pose.chapterIdx !== prevChIdx;

    this._storyChapterIdx = pose.chapterIdx;
    this.x = pose.x;
    this.z = pose.z;
    this.headingYaw = pose.headingYaw;
    this.coastFactor = pose.coastFactor ?? 1.0;
    this._cadenceRpmOverride = pose.cadenceRpmOverride ?? null;
    this.burnoutSmokeIntensity = pose.burnoutSmokeIntensity || 0.0;
    this.peelOutBurstIntensity = pose.peelOutBurstIntensity || 0.0;
    this.trainerSparkIntensity = this.burnoutSmokeIntensity;
    this.slipAngleDeg = pose.slipAngleDeg || 0.0;
    this.shorelineSkidIntensity = pose.shorelineSkidIntensity || 0.0;
    this.celebrationDismountBlend = pose.celebrationDismountBlend || 0.0;
    this.celebrationTargetWorldYaw = pose.celebrationTargetWorldYaw ?? null;
    this._skidSuspPulseM = pose.skidSuspPulseM || 0.0;
    this._rearWheelLock = pose.rearWheelLock || 0.0;
    this._rearWheelLocked = this._rearWheelLock > 0.5;
    this._freeRoamCelebrationBlend = 0.0;
    this._freeRoamCelebrateToggle = false;

    // Integrate optional playful additive Story bunny-hop (`VETO-UX-02`)
    if (pose.onTrainerStand || pose.inSlowMoJump || chapterCut) {
      this._storyHopY = 0.0;
      this._storyHopVy = 0.0;
    } else if (this._storyHopY > 0.0 || this._storyHopVy > 0.0) {
      this._storyHopY += this._storyHopVy * stepDt;
      this._storyHopVy -= 15.8 * stepDt;
      if (this._storyHopY <= 0.0) {
        this._storyHopY = 0.0;
        this._storyHopVy = 0.0;
      }
    }

    const trainerBounceWave =
      pose.onTrainerStand && this._trainerBounceTimer > 0.0
        ? Math.sin(Math.PI * clamp(this._trainerBounceTimer / 0.50, 0.0, 1.0))
        : 0.0;
    const useAdditiveHop = this._storyHopY > (pose.jumpHeightM || 0.0);
    this.jumpHeightM = useAdditiveHop
      ? this._storyHopY
      : pose.jumpHeightM + trainerBounceWave * 0.038;
    this.verticalVelMps = useAdditiveHop ? this._storyHopVy : pose.verticalVelMps;
    this.isAirborne = !pose.onTrainerStand && this.jumpHeightM > 0.015;
    this.glassBracePhase = pose.glassBracePhase || 0.0;
    this.postSmashShake = pose.postSmashShake || 0.0;
    this.frontWheelHopM = pose.frontWheelHopM || 0.0;
    this.wheeliePitchRad = pose.wheeliePitchRad || 0.0;
    this._storyAirPitchRad = Number.isFinite(pose.airPitchRad) ? pose.airPitchRad : null;
    this._storyPreloadCrouch = pose.preloadCrouch || 0.0;
    this.wingFlare = Math.max(
      pose.wingFlare || 0.0,
      trainerBounceWave * 0.62,
      evaluateWingFlare({
        isAirborne: this.isAirborne,
        inSlowMoJump: pose.inSlowMoJump,
        jumpHeightM: this.jumpHeightM,
        glassBracePhase: this.glassBracePhase,
        startledWingFlare: pose.pelicanStartledWingFlare || 0.0,
      })
    );
    this.beakOpen = pose.beakOpen || 0.0;

    // 1. Check Glass Shatter Transition (`z <= 131.2`, exact `t = 9.40s` = frame 564)
    if (
      !state.glassShattered &&
      (pose.z <= GYM_BREAKOUT_CONFIG.glassPlaneZ + 1e-6 ||
        seqT >= V5_GLASS_SMASH_SEC - 1e-6)
    ) {
      this.cameraTrauma = 0.72;
      if (silentSeek) {
        state.glassShattered = true;
        state.inGym = false;
        state.glassShatterTime = simTimeAtStep;
      } else {
        this.newlyShatteredGlass = true;
        dispatchAction(DEMO_ACTIONS.GLASS_SHATTERED, {});
      }
    }

    // 2. Triumphant happy beak-clap right as `glassBracePhase` releases (`t = 10.00s`)
    if (!this._scriptedPostSmashClap && seqT >= 10.00 && seqT < 10.68) {
      this._scriptedPostSmashClap = true;
      if (silentSeek) {
        this._lastClapElapsedTime = simTimeAtStep;
        this._lastClapKind = "standard";
      } else {
        this._triggerBeakClap("standard", simTimeAtStep);
      }
    }

    // 3. Scripted Android Bugdroid Bell Greeting (`~t = 24.9s`), Stan T-Rex Sudden Roar Shockwave (`t = 40.20s`),
    //    and Pelican Startled Surprise Double Bike-Bell (`t = 40.32s`, `+0.12s` after Stan's roar!)
    if (!this._scriptedAndroidBell && seqT >= 24.85 && seqT < 25.65) {
      this._scriptedAndroidBell = true;
      if (silentSeek) {
        this._applyBellWorldInteractions();
        this._lastClapElapsedTime = simTimeAtStep;
        this._lastClapKind = "standard";
      } else {
        dispatchAction(DEMO_ACTIONS.RING_BELL, { source: "script_android" });
      }
    }
    if (!this._scriptedStanRoar && seqT >= STAN_ROAR_TRIGGER_SEC - 1e-6 && seqT < STAN_ROAR_TRIGGER_SEC + 0.90) {
      this._scriptedStanRoar = true;
      this._applyStanRoarFlamingoScatter();
    }
    if (!this._scriptedTrexBell && seqT >= PELICAN_SURPRISE_ONSET_SEC - 1e-6 && seqT < PELICAN_SURPRISE_ONSET_SEC + 0.90) {
      this._scriptedTrexBell = true;
      if (silentSeek) {
        this._applyBellWorldInteractions();
        this._lastClapElapsedTime = simTimeAtStep;
        this._lastClapKind = "standard";
      } else {
        dispatchAction(DEMO_ACTIONS.RING_BELL, { source: "script_stan_surprise", doubleRing: true });
      }
    }

    // 4. Scripted Bay View Ramp Lip Hop SFX (`SLOWMO_TAKEOFF_SEC = 54.90s`)
    if (!this._scriptedRampHop && seqT >= SLOWMO_TAKEOFF_SEC && seqT < SLOWMO_LAND_SEC) {
      this._scriptedRampHop = true;
      if (!silentSeek) {
        dispatchAction(DEMO_ACTIONS.BUNNY_HOP, {
          source: "controller_internal",
          impulse: 5.4,
        });
      }
    }

    // 5. Touchdown cushioned landing trauma micro-pulse
    if (wasAirborne && !this.isAirborne && !chapterCut) {
      this.cameraTrauma = Math.max(this.cameraTrauma, 0.24);
      this.bikeDyn.suspVel += 0.055;
    }

    state.onTrainerStand = pose.onTrainerStand;
    state.inGym = pose.inGym && !state.glassShattered;
    state.inSlowMoJump = pose.inSlowMoJump;
    state.timeScale = pose.timeScale;

    // 6. Physical-Contact TPU Collectibles (`dist2D <= 0.92m`) & Boost Pads (strict sequential 0..15!)
    const minAllowSec =
      state.currentState === "play_all"
        ? 0.0
        : (STORY_CHAPTER_BOUNDS[state.activeClipIndex]?.startSec ?? 0.0);
    this._awardTransitTpusUpTo(seqT, minAllowSec, simTimeAtStep, silentSeek);
    this._checkCollectiblesAt(
      this.x,
      this.z,
      this.jumpHeightM,
      simTimeAtStep,
      silentSeek,
      this.headingYaw
    );

    const baseCadenceScale = clamp(Number(state.cadenceScale) || 1.0, 0.35, 2.0);
    this.speedMps = evaluateStoryCalibratedSpeedMps(
      seqT,
      pose,
      state.boostRemainingSec,
      baseCadenceScale
    );

    let ds = 0.0;
    if (!wrappedLoop && !pose.onTrainerStand) {
      if (chapterCut) {
        const chStart = STORY_CHAPTER_BOUNDS[pose.chapterIdx].startSec;
        const refPose = evaluateStoryChapterPose(pose.chapterIdx, Math.max(chStart, seqT - stepDt));
        ds = Math.hypot(this.x - refPose.x, this.z - refPose.z) * baseCadenceScale;
      } else {
        ds = Math.hypot(this.x - prevX, this.z - prevZ) * baseCadenceScale;
      }
    }

    this.totalArcDistM += ds;
    this.clipDistancesM[state.activeClipIndex] =
      (this.clipDistancesM[state.activeClipIndex] || 0.0) + ds;

    if (!wrappedLoop) {
      const prevSeqT = Math.max(0.0, seqT - stepDt);
      const dtOut = this._stepDrivetrainAcrossStoryTick(
        prevSeqT,
        seqT,
        stepDt,
        ds,
        pose,
        baseCadenceScale,
        this.crankRad,
        this.rearWheelRad,
        this.frontWheelRad
      );
      this.crankRad = dtOut.crankRad;
      this.rearWheelRad = dtOut.rearWheelRad;
      this.frontWheelRad = dtOut.frontWheelRad;
    }
    this.wheelRad = this.rearWheelRad;
    this.chainDistM = this.crankRad * KIN_CONSTANTS.chainringRadiusM;

    const surf = getOpenWorldSurfaceType(this.x, this.z);
    const omegaCrank =
      pose.cadenceRpmOverride !== null && pose.cadenceRpmOverride !== undefined
        ? ((pose.cadenceRpmOverride * baseCadenceScale) * TWO_PI) / 60.0
        : (this.speedMps / (BIKE_CONSTANTS.wheelRadiusM * GEAR_RATIO)) * this.coastFactor;

    if (chapterCut && !wrappedLoop) {
      syncBikeDynamicsAnalytically(this.bikeDyn, {
        kappa: pose.kappa,
        speedMps: this.speedMps,
        surfaceType: surf,
        arcDistanceM: this.totalArcDistM,
        plankPitchM: CLIP5_PLANK_PITCH_M,
        crankRad: this.crankRad,
        simTime: simTimeAtStep,
      });
      this.bankRad = this.bikeDyn.bankRad;
      this.steerRad = this.bikeDyn.steerRad;
    } else {
      const dynOut = stepBikeDynamicsSpring(this.bikeDyn, {
        kappa: pose.kappa,
        speedMps: this.speedMps,
        surfaceType: surf,
        arcDistanceM: this.totalArcDistM,
        plankPitchM: CLIP5_PLANK_PITCH_M,
        crankRad: this.crankRad,
        omegaCrank,
        simTime: simTimeAtStep,
        dt: stepDt * state.timeScale,
      });
      this.bankRad = dynOut.bankRad;
      this.steerRad = dynOut.steerRad;
    }

    if (pose.chapterIdx === 4 && seqT > SHORELINE_SKID_START_SEC && pose.skidBankRad !== null) {
      const skidBlend = smoothstep01((seqT - SHORELINE_SKID_START_SEC) / 0.14);
      this.bankRad = lerp(this.bankRad, pose.skidBankRad, skidBlend);
      this.steerRad = lerp(this.steerRad, pose.skidSteerRad || 0.0, skidBlend);
    }

    this._syncSegmentLedgerForStory(seqT);
    this.directorHint = evaluateDirectorHint(seqT, this.jumpHeightM);
    state.directorShotLabel = this.directorHint.label;
  }

  _reconstructStoryStateAtSeqTime(seqT, modeKey) {
    // Reset collectibles & transient state to baseline for `play_all` or chapter preset
    let priorCount = 0;
    if (modeKey !== "play_all") {
      const idx = STORY_CHAPTER_BOUNDS.findIndex((c) => c.id === modeKey);
      priorCount = idx === 1 ? 3 : idx === 2 ? 6 : idx === 3 ? 9 : idx === 4 ? 13 : 0;
    }
    state.tpuLedger.forEach((item, i) => {
      item.collected = i < priorCount;
      item.collectedAtSec = item.collected ? 0.0 : -1;
    });
    state.clusterOnline = false;
    state.boostRemainingSec = 0.0;
    state.nooglerCapUnlocked = true;
    state.wearNooglerHat = true;

    const startScanT =
      modeKey === "play_all" ? 0.0 : STORY_CHAPTER_BOUNDS[state.activeClipIndex].startSec;
    state.flamingosScattered = startScanT >= STAN_ROAR_TRIGGER_SEC + 0.90 ? 54 : 0;
    state.bugdroidWaved = startScanT >= 24.90;
    this._scriptedAndroidBell = startScanT >= 25.65;
    this._scriptedStanRoar = startScanT >= STAN_ROAR_TRIGGER_SEC + 0.90;
    this._scriptedTrexBell = startScanT >= PELICAN_SURPRISE_ONSET_SEC + 0.90;
    this._scriptedPostSmashClap = startScanT >= 10.68;
    this._scriptedRampHop = startScanT >= SLOWMO_LAND_SEC;
    this._storyHopY = 0.0;
    this._storyHopVy = 0.0;
    this.frontWheelHopM = 0.0;
    this.wheeliePitchRad = 0.0;
    this._trainerBounceTimer = 0.0;
    this._lastClapElapsedTime = -10.0;
    this._lastClapKind = "standard";
    this._boostCooldownByPad = Object.create(null);
    this.cameraTrauma = 0.0;
    this.friendlyNod = 0.0;
    this._rampLaunchCooldown = 0.0;

    // Baseline pose & analytical dynamics at `startScanT`
    const initPose = evaluateStoryPoseAtTime(startScanT);
    this._storyChapterIdx = initPose.chapterIdx;
    this.x = initPose.x;
    this.z = initPose.z;
    this.headingYaw = initPose.headingYaw;
    this.jumpHeightM = initPose.jumpHeightM;
    this.verticalVelMps = initPose.verticalVelMps;
    this.isAirborne = initPose.jumpHeightM > 0.015;
    this.glassBracePhase = initPose.glassBracePhase || 0.0;
    this.postSmashShake = initPose.postSmashShake || 0.0;
    this.frontWheelHopM = initPose.frontWheelHopM || 0.0;
    this.wheeliePitchRad = initPose.wheeliePitchRad || 0.0;
    this._storyAirPitchRad = Number.isFinite(initPose.airPitchRad) ? initPose.airPitchRad : null;
    this._storyPreloadCrouch = initPose.preloadCrouch || 0.0;
    this.wingFlare = initPose.wingFlare || 0.0;
    this.beakOpen = initPose.beakOpen || 0.0;
    this.coastFactor = initPose.coastFactor ?? 1.0;
    this._cadenceRpmOverride = initPose.cadenceRpmOverride ?? null;
    this.burnoutSmokeIntensity = initPose.burnoutSmokeIntensity || 0.0;
    this.peelOutBurstIntensity = initPose.peelOutBurstIntensity || 0.0;
    this.trainerSparkIntensity = this.burnoutSmokeIntensity;
    this.slipAngleDeg = initPose.slipAngleDeg || 0.0;
    this.shorelineSkidIntensity = initPose.shorelineSkidIntensity || 0.0;
    this.celebrationDismountBlend = initPose.celebrationDismountBlend || 0.0;
    this.celebrationTargetWorldYaw = initPose.celebrationTargetWorldYaw ?? null;
    this._skidSuspPulseM = initPose.skidSuspPulseM || 0.0;
    this._rearWheelLock = initPose.rearWheelLock || 0.0;
    this._rearWheelLocked = this._rearWheelLock > 0.5;
    this._freeRoamCelebrationBlend = 0.0;
    this._freeRoamCelebrateToggle = false;

    state.onTrainerStand = initPose.onTrainerStand;
    state.glassShattered =
      initPose.z <= GYM_BREAKOUT_CONFIG.glassPlaneZ + 1e-6 ||
      startScanT >= V5_GLASS_SMASH_SEC - 1e-6 ||
      (modeKey !== "play_all" && state.activeClipIndex > 0);
    state.inGym = initPose.inGym && !state.glassShattered;
    state.glassShatterTime = state.glassShattered ? V5_GLASS_SMASH_SEC : -10.0;
    state.inSlowMoJump = initPose.inSlowMoJump;
    state.timeScale = initPose.timeScale;

    const priorState = this._computePriorStoryState(startScanT);
    this.clipDistancesM = priorState.dists;
    this.totalArcDistM = this.clipDistancesM.reduce((s, d) => s + d, 0.0);
    this.rearWheelRad = priorState.rearWheelRad;
    this.frontWheelRad = priorState.frontWheelRad;
    this.wheelRad = this.rearWheelRad;
    this.crankRad = priorState.crankRad;
    this.chainDistM = this.crankRad * KIN_CONSTANTS.chainringRadiusM;
    this.speedMps = evaluateStoryCalibratedSpeedMps(
      startScanT,
      initPose,
      0.0,
      state.cadenceScale
    );

    const startSimTime = state.elapsedTime - (seqT - startScanT);
    syncBikeDynamicsAnalytically(this.bikeDyn, {
      kappa: initPose.kappa,
      speedMps: this.speedMps,
      surfaceType: getOpenWorldSurfaceType(this.x, this.z),
      arcDistanceM: this.totalArcDistM,
      plankPitchM: CLIP5_PLANK_PITCH_M,
      crankRad: this.crankRad,
      simTime: startSimTime,
    });
    this.bankRad = this.bikeDyn.bankRad;
    this.steerRad = this.bikeDyn.steerRad;

    this._syncWaymosDeterministically(startScanT);
    this._resetFlamingosToHome();
    if (startScanT >= STAN_ROAR_TRIGGER_SEC && startScanT <= 49.0) {
      const dtScat = startScanT - STAN_ROAR_TRIGGER_SEC;
      for (let i = 0; i < this.flamingos.length; i++) {
        const fl = this.flamingos[i];
        const dx = fl.homeX - STAN_TREX_POS.x;
        const dz = fl.homeZ - STAN_TREX_POS.z;
        const d = Math.hypot(dx, dz) || 1.0;
        const push = Math.min(4.6, dtScat * 4.2) * Math.exp(-dtScat * 0.35);
        fl.x = fl.homeX + (dx / d) * push;
        fl.z = fl.homeZ + (dz / d) * push;
        fl.y = getOpenWorldTerrainHeight(fl.x, fl.z);
        fl.scattered = true;
      }
    }
    for (let i = 0; i < this.pinwheels.length; i++) {
      const pw = this.pinwheels[i];
      pw.boostVel = 0.0;
      pw.spinRad = (pw.phase + startScanT * pw.angularVel) % TWO_PI;
    }

    // Integrate exact `FIXED_DT = 1/60` lockstep ticks from `startScanT` to `seqT` for 100% step-vs-seek parity
    if (seqT > startScanT) {
      let curSeq = startScanT;
      let curSimTime = startSimTime;

      const stepOneScanTick = (nextSeq, stepDt, nextSimTime) => {
        if (state.boostRemainingSec > 0.0) {
          state.boostRemainingSec = Math.max(0.0, state.boostRemainingSec - stepDt);
        }
        if (this.cameraTrauma > 0.0) {
          this.cameraTrauma = Math.max(0.0, this.cameraTrauma - stepDt * 2.25);
        }
        if (this.friendlyNod > 0.001) {
          this.friendlyNod *= Math.exp(-3.4 * stepDt);
        } else {
          this.friendlyNod = 0.0;
        }
        if (this._rampLaunchCooldown > 0.0) {
          this._rampLaunchCooldown = Math.max(0.0, this._rampLaunchCooldown - stepDt);
        }
        if (this._trainerBounceTimer > 0.0) {
          this._trainerBounceTimer = Math.max(0.0, this._trainerBounceTimer - stepDt);
        }

        const cIdx = this._findClipIndexForSeqTime(nextSeq);
        state.activeClipIndex = cIdx;
        state.activeClipId = STORY_CHAPTER_BOUNDS[cIdx].id;
        state.clipLocalTime = nextSeq - STORY_CHAPTER_BOUNDS[cIdx].startSec;
        state.sequenceTime = nextSeq;

        this._advanceStoryTickInternal(nextSeq, stepDt, nextSimTime, true, false);

        const envDt = stepDt * (state.inSlowMoJump ? state.timeScale : 1.0);
        this._stepWaymosFixed(envDt);
        this._stepFlamingosFixed(envDt);
        this._stepPinwheelsFixed(envDt);
      };

      while (seqT - curSeq >= FIXED_DT - 1e-7) {
        let nextSeq = curSeq + FIXED_DT;
        if (Math.abs(seqT - nextSeq) <= 1e-7 || nextSeq > seqT) {
          nextSeq = seqT;
        }
        const stepDt = nextSeq - curSeq;
        curSimTime += stepDt;
        stepOneScanTick(nextSeq, stepDt, curSimTime);
        curSeq = nextSeq;
      }

      if (seqT - curSeq > 1e-7) {
        const remDt = seqT - curSeq;
        stepOneScanTick(seqT, remDt, state.elapsedTime);
      }
    } else {
      this._awardTransitTpusUpTo(seqT, startScanT, startSimTime, true);
      this._checkCollectiblesAt(
        this.x,
        this.z,
        this.jumpHeightM,
        startSimTime,
        true,
        this.headingYaw
      );
      this._syncSegmentLedgerForStory(seqT);
      this.directorHint = evaluateDirectorHint(seqT, this.jumpHeightM);
      state.directorShotLabel = this.directorHint.label;
    }

    const finalIdx =
      modeKey === "play_all" ? this._findClipIndexForSeqTime(seqT) : state.activeClipIndex;
    state.activeClipIndex = finalIdx;
    state.activeClipId = STORY_CHAPTER_BOUNDS[finalIdx].id;
    state.clipLocalTime = seqT - STORY_CHAPTER_BOUNDS[finalIdx].startSec;
    state.sequenceTime = seqT;
  }

  _syncSegmentLedgerForStory(seqT) {
    for (let i = 0; i < STORY_CHAPTER_BOUNDS.length; i++) {
      const clip = STORY_CHAPTER_BOUNDS[i];
      const seg = state.segmentLedger[i];
      if (!seg) continue;
      const dur = clip.endSec - clip.startSec;
      seg.durationSec = dur;
      seg.distanceM = this.clipDistancesM[i] || 0.0;
      if (seqT >= clip.endSec) {
        seg.coveredSec = dur;
      } else if (seqT > clip.startSec) {
        seg.coveredSec = seqT - clip.startSec;
      } else {
        seg.coveredSec = 0.0;
      }
    }
  }

  _evaluateWaymoYieldTarget(w, wIdx = -1) {
    const dx = this.x - w.x;
    const dz = this.z - w.z;
    const fwdX = Math.sin(w.yaw);
    const fwdZ = -Math.cos(w.yaw);
    const alongM = dx * fwdX + dz * fwdZ;
    const crossM = Math.abs(dx * fwdZ - dz * fwdX);

    let yieldTarget = 1.0;
    // Same-lane forward clearance yield (adjacent bike lanes `crossM >= 2.85m` cruise smoothly alongside!)
    if (crossM < 2.85 && alongM > -2.0 && alongM < 18.5) {
      yieldTarget = clamp((alongM - 5.8) / 12.0, 0.0, 0.55);
    }

    // Polite autonomous crosswalk yielding behind the `2.35m` white intersection stop bar (e.g. `(-118, 76)` Overhead Shot!)
    for (let c = 0; c < CAMPUS_INTERSECTIONS.length; c++) {
      const it = CAMPUS_INTERSECTIONS[c];
      if (!it.hasCrosswalk) continue;
      const pInCross = Math.hypot(this.x - it.x, this.z - it.z) < it.radiusM + 4.8;
      if (pInCross) {
        const toItX = it.x - w.x;
        const toItZ = it.z - w.z;
        const alongToIt = toItX * fwdX + toItZ * fwdZ;
        const crossToIt = Math.abs(toItX * fwdZ - toItZ * fwdX);
        if (alongToIt > 3.0 && alongToIt < it.radiusM + 16.5 && crossToIt < 6.5) {
          yieldTarget = Math.min(
            yieldTarget,
            clamp((alongToIt - (it.radiusM + 4.8)) / 7.5, 0.0, 0.12)
          );
        }
      }
    }

    // Same-lane inter-Waymo headway spacing so trailing vehicles smoothly maintain >= 7.5m clearance
    for (let j = 0; j < this.waymos.length; j++) {
      if (j === wIdx) continue;
      const other = this.waymos[j];
      if (!other || other === w) continue;
      const ox = other.x - w.x;
      const oz = other.z - w.z;
      const alongOther = ox * fwdX + oz * fwdZ;
      const crossOther = Math.abs(ox * fwdZ - oz * fwdX);
      if (alongOther > 2.0 && alongOther < 15.5 && crossOther < 2.4) {
        const otherFwdX = Math.sin(other.yaw);
        const otherFwdZ = -Math.cos(other.yaw);
        if (fwdX * otherFwdX + fwdZ * otherFwdZ > 0.7) {
          yieldTarget = Math.min(yieldTarget, clamp((alongOther - 7.5) / 7.0, 0.0, 1.0));
        }
      }
    }

    return yieldTarget;
  }

  _syncWaymosDeterministically(tSec) {
    const tNow = Math.max(0.0, Number(tSec) || 0.0);
    const maxRollRad = WAYMO_KINEMATICS_SPEC.maxRollRad || 0.043633;
    const maxPitchRad = WAYMO_KINEMATICS_SPEC.maxPitchRad || 0.020071;
    const wheelR = WAYMO_KINEMATICS_SPEC.wheelRadiusM || 0.36;

    // First pass: resolve deterministic arc-length & pose along each C^2 speed-profiled loop
    if (!this._waymoSeekPoses || this._waymoSeekPoses.length !== this.waymos.length) {
      this._waymoSeekPoses = new Array(this.waymos.length);
    }
    const poses = this._waymoSeekPoses;
    for (let i = 0; i < this.waymos.length; i++) {
      const w = this.waymos[i];
      const spec = WAYMO_LOOP_SPECS[i];
      const pose =
        tNow <= 1e-9
          ? sampleWaymoLoopAtDistance(spec, spec.phase * spec.totalLen)
          : sampleWaymoLoopAtFreeTime(spec, spec.phaseTimeSec + tNow);
      poses[i] = pose;
      w.distM = pose.s;
      w.x = pose.x;
      w.z = pose.z;
      w.y = getOpenWorldTerrainHeight(pose.x, pose.z);
      w.yaw = pose.yaw;
      w.kappa = pose.kappa;
      w.delta = pose.delta;
      w.steerFL = pose.steerFL;
      w.steerFR = pose.steerFR;
    }

    // Second pass: evaluate yielding, speed, damped roll/pitch, wheel spin & 1.8 Hz turn signals
    const avgLoopMps = 4.95;
    for (let i = 0; i < this.waymos.length; i++) {
      const w = this.waymos[i];
      const spec = WAYMO_LOOP_SPECS[i];
      const pose = poses[i];
      const yieldTarget = this._evaluateWaymoYieldTarget(w, i);
      w.speedScale = yieldTarget;
      w.yielding = w.speedScale < 0.82;
      w.speedMps = pose.vProfile * w.speedScale;
      w.rollRad = clamp(0.0365 * w.speedMps * w.speedMps * pose.kappa, -maxRollRad, maxRollRad);
      w.pitchRad = clamp(-0.0102 * pose.accelFreeMps2 * w.speedScale, -maxPitchRad, maxPitchRad);
      const spinRad = (tNow * avgLoopMps) / wheelR;
      w.wheelRad = spinRad;
      w.wheelSpinRad = spinRad;
      w.lidarSpinRad = ((spec.phase + tNow * 5.0) * TWO_PI) % TWO_PI;
      w.signalClockSec = tNow;
      w.turnSignalLeft = false;
      w.turnSignalRight = false;
      w.blinkOn = false;
    }
    this._writeWaymosToState();
  }

  _writeWaymosToState() {
    for (let i = 0; i < this.waymos.length; i++) {
      const w = this.waymos[i];
      const dst = state.waymoPositions[i];
      if (dst) {
        dst.id = w.id;
        dst.type = w.vehicleType;
        dst.vehicleType = w.vehicleType;
        dst.x = w.x;
        dst.y = w.y;
        dst.z = w.z;
        dst.yaw = w.yaw;
        dst.kappa = w.kappa;
        dst.delta = w.delta;
        dst.steerFL = w.steerFL;
        dst.steerFR = w.steerFR;
        dst.rollRad = w.rollRad;
        dst.pitchRad = w.pitchRad;
        dst.wheelRad = w.wheelRad;
        dst.wheelSpinRad = w.wheelSpinRad;
        dst.speedMps = w.speedMps;
        dst.speedScale = w.speedScale;
        dst.turnSignalLeft = w.turnSignalLeft;
        dst.turnSignalRight = w.turnSignalRight;
        dst.blinkOn = w.blinkOn;
        dst.yielding = w.yielding;
      }
    }
  }

  /**
   * Checks physical-contact `TPU_SPAWNS` (`radius = 0.92m` at front basket/wheel nose or bike center)
   * and `MK_BOOST_PADS` at `(px, pz)`.
   */
  _checkCollectiblesAt(
    px,
    pz,
    jumpHeightM,
    simTimeSec,
    silentSeek = false,
    headingRad = this.headingYaw
  ) {
    const groundY = getOpenWorldTerrainHeight(px, pz);
    const heroCenterY = groundY + jumpHeightM + 0.55;
    // Heading convention (`src/contract.js`): yaw=0 is due North (-Z), forward = (+sin(yaw), -cos(yaw))
    const yaw = Number.isFinite(headingRad) ? headingRad : this.headingYaw;
    const frontX = px + Math.sin(yaw) * 0.54;
    const frontZ = pz - Math.cos(yaw) * 0.54;

    for (let i = 0; i < TPU_SPAWNS.length; i++) {
      if (state.tpuLedger[i] && state.tpuLedger[i].collected) continue;
      const sp = TPU_SPAWNS[i];
      const dist2D = Math.min(
        Math.hypot(frontX - sp.x, frontZ - sp.z),
        Math.hypot(px - sp.x, pz - sp.z)
      );
      if (dist2D <= TPU_PICKUP_RADIUS_M) {
        const tpuWorldY = getOpenWorldTerrainHeight(sp.x, sp.z) + (sp.bonusHeightM || 0.55);
        const dy = Math.abs(heroCenterY - tpuWorldY);
        // Tightened V4 physical-contact vertical reach (`1.15m` ground, `1.20m` mid-air ramp `bonusHeightM > 1.3m`)
        const maxVertGap = sp.bonusHeightM > 1.3 ? 1.20 : 1.15;
        if (dy <= maxVertGap) {
          if (silentSeek) {
            state.tpuLedger[i].collected = true;
            state.tpuLedger[i].collectedAtSec = simTimeSec;
            state.lastTpuPickupTime = simTimeSec;
            const allCollected = state.tpuLedger.every((item) => item.collected);
            if (allCollected) {
              state.clusterOnline = true;
              state.nooglerCapUnlocked = true;
              if (state._manualNooglerHat === undefined) {
                state.wearNooglerHat = true;
              }
              this._lastClapElapsedTime = simTimeSec;
              this._lastClapKind = "cluster";
            } else {
              this._lastClapElapsedTime = simTimeSec;
              this._lastClapKind = "standard";
            }
          } else {
            dispatchAction(DEMO_ACTIONS.COLLECT_TPU, { id: sp.id, index: sp.index });
          }
          if (sp.id === "tpu_05") {
            state.bugdroidWaved = true;
            this.friendlyNod = 0.75;
          }
        }
      }
    }

    // Check `MK_BOOST_PADS` (`radiusM = 3.2m`)
    for (let i = 0; i < MK_BOOST_PADS.length; i++) {
      const pad = MK_BOOST_PADS[i];
      const d = Math.hypot(px - pad.x, pz - pad.z);
      if (d <= pad.radiusM) {
        const lastTrig = this._boostCooldownByPad[pad.id] ?? -99.0;
        if (simTimeSec - lastTrig >= 4.0) {
          this._boostCooldownByPad[pad.id] = simTimeSec;
          this._activeBoostTotalSec = 3.4;
          if (silentSeek) {
            state.boostRemainingSec = Math.max(state.boostRemainingSec, 3.4);
          } else {
            dispatchAction(DEMO_ACTIONS.TRIGGER_BOOST, {
              padId: pad.id,
              label: pad.label,
              durationSec: 3.4,
            });
          }
        }
      }
    }
  }

  /**
   * Advances simulation by `dt` seconds using a fixed `1/60` accumulator for 100% deterministic lockstep.
   */
  step(dt = FIXED_DT) {
    _activeControllerInstance = this;
    const numDt = Number(dt);
    this.newlyShatteredGlass = false;

    if (!Number.isFinite(numDt) || numDt <= 0.0) {
      return this._syncStateAndTelemetry(0.0);
    }

    const clampedDt = Math.min(numDt, 0.1);
    const externalAdvanced =
      Math.abs((Number(state.elapsedTime) || 0.0) - (this._lastKnownElapsedTime || 0.0)) > 1e-6;

    // Exact single-step fast path when driven at 60Hz (`window.__advanceFrame(1/60)`)
    if (Math.abs(clampedDt - FIXED_DT) < 1e-5 && this.accumulator < 1e-6) {
      if (!externalAdvanced) {
        state.elapsedTime = (Number(state.elapsedTime) || 0.0) + FIXED_DT;
      }
      this._stepFixed(FIXED_DT);
      this._lastKnownElapsedTime = state.elapsedTime;
      return this._syncStateAndTelemetry(FIXED_DT);
    }

    this.accumulator += clampedDt;
    let subCount = 0;
    while (this.accumulator >= FIXED_DT - 1e-7 && subCount < 8) {
      if (!externalAdvanced) {
        state.elapsedTime = (Number(state.elapsedTime) || 0.0) + FIXED_DT;
      }
      this._stepFixed(FIXED_DT);
      this.accumulator = Math.max(0.0, this.accumulator - FIXED_DT);
      subCount++;
    }
    this._lastKnownElapsedTime = state.elapsedTime;
    return this._syncStateAndTelemetry(subCount > 0 ? subCount * FIXED_DT : clampedDt);
  }

  _stepFixed(dt) {
    // Decay boost timer & camera trauma (`0.72 / 2.25 = 0.32s` crisp damped shudder!)
    if (state.boostRemainingSec > 0.0) {
      state.boostRemainingSec = Math.max(0.0, state.boostRemainingSec - dt);
    }
    if (this.cameraTrauma > 0.0) {
      this.cameraTrauma = Math.max(0.0, this.cameraTrauma - dt * 2.25);
    }
    if (this.friendlyNod > 0.001) {
      this.friendlyNod *= Math.exp(-3.4 * dt);
    } else {
      this.friendlyNod = 0.0;
    }
    if (this._rampLaunchCooldown > 0.0) {
      this._rampLaunchCooldown = Math.max(0.0, this._rampLaunchCooldown - dt);
    }
    if (this._trainerBounceTimer > 0.0) {
      this._trainerBounceTimer = Math.max(0.0, this._trainerBounceTimer - dt);
    }

    if (state.gameMode === "story_autopilot") {
      this._stepStoryAutopilotFixed(dt);
    } else {
      this._stepFreeRoamFixed(dt);
    }

    const envDt = dt * (state.inSlowMoJump ? state.timeScale : 1.0);
    this._stepWaymosFixed(envDt);
    this._stepFlamingosFixed(envDt);
    this._stepPinwheelsFixed(envDt);
  }

  _stepStoryAutopilotFixed(dt) {
    const prevClipIdx = state.activeClipIndex;

    let wrappedLoop = false;
    if (state.currentState === "play_all") {
      const nextSeq = state.sequenceTime + dt;
      if (nextSeq >= V5_STORY_DURATION_SEC) {
        wrappedLoop = true;
        this.completedLoopsDistM += this.totalArcDistM;
        this.totalArcDistM = 0.0;
        this.wheelRad = 0.0;
        this.rearWheelRad = 0.0;
        this.frontWheelRad = 0.0;
        this.crankRad = 0.0;
        this.chainDistM = 0.0;
        this._storyChapterIdx = 0;
        this._trainerBounceTimer = 0.0;
        this.clipDistancesM = [0.0, 0.0, 0.0, 0.0, 0.0];
        state.sequenceTime = nextSeq % V5_STORY_DURATION_SEC;
        // Seamless loop back into Gradient Canopy Gym resetting glass & TPUs for next showcase pass
        state.tpuLedger.forEach((item) => {
          item.collected = false;
          item.collectedAtSec = -1;
        });
        state.clusterOnline = false;
        state.boostRemainingSec = 0.0;
        state.nooglerCapUnlocked = true;
        state.wearNooglerHat = true;
        state.glassShattered = false;
        state.inGym = true;
        state.onTrainerStand = true;
        this._scriptedAndroidBell = false;
        this._scriptedStanRoar = false;
        this._scriptedTrexBell = false;
        this._scriptedPostSmashClap = false;
        this._scriptedRampHop = false;
        this._storyHopY = 0.0;
        this._storyHopVy = 0.0;
        this.frontWheelHopM = 0.0;
        this.wheeliePitchRad = 0.0;
        this._boostCooldownByPad = Object.create(null);
        this._resetFlamingosToHome();
      } else {
        state.sequenceTime = nextSeq;
      }
      const newIdx = this._findClipIndexForSeqTime(state.sequenceTime);
      state.activeClipIndex = newIdx;
      state.activeClipId = STORY_CHAPTER_BOUNDS[newIdx].id;
      state.clipLocalTime = state.sequenceTime - STORY_CHAPTER_BOUNDS[newIdx].startSec;
    } else {
      const clip = STORY_CHAPTER_BOUNDS[state.activeClipIndex] || STORY_CHAPTER_BOUNDS[0];
      const dur = Math.max(0.1, clip.endSec - clip.startSec);
      const nextLocal = state.clipLocalTime + dt;
      if (nextLocal >= dur) {
        wrappedLoop = true;
        this.completedLoopsDistM += this.clipDistancesM[state.activeClipIndex] || 0.0;
        const priorState = this._computePriorStoryState(clip.startSec);
        this.clipDistancesM = priorState.dists;
        this.totalArcDistM = this.clipDistancesM.reduce((s, d) => s + d, 0.0);
        this.rearWheelRad = priorState.rearWheelRad;
        this.frontWheelRad = priorState.frontWheelRad;
        this.wheelRad = this.rearWheelRad;
        this.crankRad = priorState.crankRad;
        this.chainDistM = this.crankRad * KIN_CONSTANTS.chainringRadiusM;
        this._storyChapterIdx = state.activeClipIndex;
        this._trainerBounceTimer = 0.0;
        state.clipLocalTime = nextLocal % dur;
        const priorCount =
          state.activeClipIndex === 1
            ? 3
            : state.activeClipIndex === 2
              ? 6
              : state.activeClipIndex === 3
                ? 9
                : state.activeClipIndex === 4
                  ? 13
                  : 0;
        state.tpuLedger.forEach((item, i) => {
          item.collected = i < priorCount;
          item.collectedAtSec = item.collected ? 0.0 : -1;
        });
        if (state.activeClipIndex === 0) {
          state.glassShattered = false;
          state.inGym = true;
          state.onTrainerStand = true;
        }
        this._scriptedAndroidBell = clip.startSec >= 25.65;
        this._scriptedStanRoar = clip.startSec >= STAN_ROAR_TRIGGER_SEC + 0.90;
        this._scriptedTrexBell = clip.startSec >= PELICAN_SURPRISE_ONSET_SEC + 0.90;
        this._scriptedPostSmashClap = clip.startSec >= 10.68;
        this._scriptedRampHop = clip.startSec >= SLOWMO_LAND_SEC;
        this._storyHopY = 0.0;
        this._storyHopVy = 0.0;
        this.frontWheelHopM = 0.0;
        this.wheeliePitchRad = 0.0;
        this._boostCooldownByPad = Object.create(null);
      } else {
        state.clipLocalTime = nextLocal;
      }
      state.sequenceTime = clip.startSec + state.clipLocalTime;
    }

    const seqT = state.sequenceTime;
    this._advanceStoryTickInternal(seqT, dt, state.elapsedTime, false, wrappedLoop);

    if (state.activeClipIndex !== prevClipIdx || wrappedLoop) {
      bus.emit(DEMO_EVENTS.STATE_CHANGED, {
        state: state.currentState,
        gameMode: state.gameMode,
        activeClipId: state.activeClipId,
        activeClipIndex: state.activeClipIndex,
        reset: false,
        internalTransition: true,
      });
    }
  }

  _stepFreeRoamFixed(dt) {
    // Dilate physics clock to 0.25x while soaring off `ramp_bayview_waterfront` (`slowMo: true`)!
    const physDt = this.isAirborne && this.airFromSlowMoRamp ? dt * SLOWMO_MIN_TIME_SCALE : dt;
    state.inSlowMoJump = Boolean(this.isAirborne && this.airFromSlowMoRamp);
    state.timeScale = state.inSlowMoJump ? SLOWMO_MIN_TIME_SCALE : 1.0;
    state.directorShotLabel = state.inSlowMoJump ? "SLOW MOTION" : "";
    this._cadenceRpmOverride = null;
    this.frontWheelHopM = 0.0;
    this.wheeliePitchRad = 0.0;
    this._storyAirPitchRad = null;
    this._storyPreloadCrouch = 0.0;

    // 1. Gather throttle & steering commands
    let throttleCmd = this.virtualInput.throttle;
    if (this.keys.forward || this.virtualInput.forward) throttleCmd = 1.0;
    else if (this.keys.backward || this.virtualInput.backward) throttleCmd = -1.0;

    let steerCmd = this.virtualInput.steer;
    if (this.keys.left || this.virtualInput.left) steerCmd -= 1.0;
    if (this.keys.right || this.virtualInput.right) steerCmd += 1.0;
    steerCmd = clamp(steerCmd, -1.0, 1.0);

    const isSprint = this.keys.sprint || this.virtualInput.sprint;
    const isBoost = state.boostRemainingSec > 0.0;
    const baseCadenceScale = clamp(Number(state.cadenceScale) || 1.0, 0.35, 2.0);
    // Wave 3 Item 3: 2x Faster Free Roam Riding Speed (`9.0 m/s` ~20.1 MPH cruise, `11.2 m/s` ~25.0 MPH Sprint, `12.4 m/s` ~27.7 MPH Espresso Boost)
    const topSpeed = isBoost
      ? 12.4
      : isSprint
        ? 11.2
        : 9.0 * baseCadenceScale;

    let targetCoast = 1.0;
    const prevAbsSpeed = Math.abs(this.speedMps);

    if (throttleCmd > 0.02) {
      if (prevAbsSpeed < 1.35 && !this.isAirborne) {
        this._freeRoamPeelTimer = Math.max(this._freeRoamPeelTimer, 0.55);
      }
      // Keep steady top speed (`0` coasting speed-dip!) while allowing natural intermittent
      // straightaway freewheel pedal glides (`targetCoast = 0.0`) so freewheel pawls click cleanly!
      if (!isSprint && !isBoost && Math.abs(steerCmd) < 0.16 && this.speedMps >= topSpeed * 0.85) {
        this._freeRoamCruiseClock += physDt;
      } else {
        this._freeRoamCruiseClock = 0.0;
      }
      const inPedalGlideRest = (this._freeRoamCruiseClock % 4.4) >= 2.8;
      targetCoast = inPedalGlideRest ? 0.0 : 1.0;
      const accel = isBoost ? 18.5 : 12.5;
      this.speedMps = Math.min(topSpeed, this.speedMps + throttleCmd * accel * physDt);
    } else if (throttleCmd < -0.02) {
      this._freeRoamCruiseClock = 0.0;
      targetCoast = this.speedMps > 0.25 ? 0.0 : 1.0;
      const brakeDecel = this.speedMps > 0.2 ? 18.0 : 4.5;
      this.speedMps = Math.max(
        BIKE_CONSTANTS.maxReverseMps,
        this.speedMps + throttleCmd * brakeDecel * physDt
      );
    } else {
      this._freeRoamCruiseClock = 0.0;
      targetCoast = 0.0; // Freewheel coasting with zero throttle
      const drag = Math.exp(-1.15 * physDt);
      this.speedMps *= drag;
      if (Math.abs(this.speedMps) < 0.03) this.speedMps = 0.0;
    }

    if (state.inSlowMoJump) {
      targetCoast = 0.22;
    }
    this.coastFactor = lerp(this.coastFactor, targetCoast, 1.0 - Math.exp(-10.0 * physDt));

    if (this._freeRoamPeelTimer > 0.0) {
      this._freeRoamPeelTimer = Math.max(0.0, this._freeRoamPeelTimer - dt);
      const uPeel = clamp(this._freeRoamPeelTimer / 0.55, 0.0, 1.0);
      this.burnoutSmokeIntensity = uPeel * 0.72;
      this.peelOutBurstIntensity = uPeel;
    } else {
      this.burnoutSmokeIntensity = 0.0;
      this.peelOutBurstIntensity = 0.0;
    }
    this.trainerSparkIntensity = this.burnoutSmokeIntensity;

    // Speed-sensitive max steer across 0 -> 12.4 m/s so 2x-speed turns stay smooth and tip-free
    const speedNorm = clamp(Math.abs(this.speedMps) / 12.4, 0.0, 1.0);
    const maxSteer = BIKE_CONSTANTS.maxSteerRad * (1.0 - 0.52 * speedNorm);
    const targetSteer = steerCmd * maxSteer;
    const steerBlend = 1.0 - Math.exp(-12.0 * physDt);
    this.steerRad = lerp(this.steerRad, targetSteer, steerBlend);

    // 2. Swept 8x Sub-Step Bicycle Integration + Collision Deflection + Ramp Launch
    const subH = physDt / SUB_STEPS;
    let totalDs = 0.0;
    const wb = BIKE_CONSTANTS.wheelbaseM;

    for (let s = 0; s < SUB_STEPS; s++) {
      const yawRate = (this.speedMps / wb) * Math.tan(this.steerRad);
      this.headingYaw = wrapAngleSigned(this.headingYaw + yawRate * subH);

      const fwdX = Math.sin(this.headingYaw);
      const fwdZ = -Math.cos(this.headingYaw);
      let vx = fwdX * this.speedMps;
      let vz = fwdZ * this.speedMps;

      // Check wooden ramp lip launch right before leaving the ramp crest!
      if (!this.isAirborne && this._rampLaunchCooldown <= 0.0 && this.speedMps > 2.8) {
        const rampHit = evaluateJumpRampAtPoint(this.x, this.z);
        if (rampHit && rampHit.onDeck && rampHit.u >= 0.88) {
          const alignDot = fwdX * rampHit.ramp.fwdX + fwdZ * rampHit.ramp.fwdZ;
          if (alignDot > 0.65) {
            const nextX = this.x + vx * subH * 2.0;
            const nextZ = this.z + vz * subH * 2.0;
            const nextHit = evaluateJumpRampAtPoint(nextX, nextZ);
            if (!nextHit || !nextHit.onDeck || rampHit.u >= 0.94) {
              if (rampHit.ramp.slowMo) {
                this.speedMps = Math.max(this.speedMps, 8.15);
              }
              const rampVy = rampHit.ramp.slowMo
                ? 7.22
                : this.speedMps * Math.tan(rampHit.lipPitchRad) + 2.15;
              const launchWorldY = getOpenWorldTerrainHeight(this.x, this.z);
              this.isAirborne = true;
              this.airFromSlowMoRamp = Boolean(rampHit.ramp.slowMo);
              this._lastRampLaunchId = rampHit.ramp.id;
              this._rampLaunchCooldown = 0.6;
              this.verticalVelMps = rampVy;
              // Preserve absolute world elevation across the lip dropoff
              this._airWorldY = launchWorldY;
              dispatchAction(DEMO_ACTIONS.BUNNY_HOP, {
                source: "controller_internal",
                impulse: rampVy,
              });
            }
          }
        }
      }

      const rawX = this.x + vx * subH;
      const rawZ = this.z + vz * subH;

      // Resolve static world walls, buildings, pond & creek
      const col = resolveOpenWorldCollisions(rawX, rawZ, vx, vz, state.glassShattered);
      let nextX = col.x;
      let nextZ = col.z;
      vx = col.vx;
      vz = col.vz;

      if (col.brokeGlass && !state.glassShattered) {
        this.newlyShatteredGlass = true;
        this.cameraTrauma = 0.72;
        this.glassBracePhase = 1.0;
        this._freeRoamGlassSmashElapsed = 0.0;
        this._freeRoamPostSmashClapped = false;
        dispatchAction(DEMO_ACTIONS.GLASS_SHATTERED, {});
      }

      // Soft deflection against autonomous Waymo / Shuttle bumpers
      for (let wIdx = 0; wIdx < this.waymos.length; wIdx++) {
        const w = this.waymos[wIdx];
        const minSep = w.vehicleType === "shuttle" ? 2.85 : 2.25;
        const dxW = nextX - w.x;
        const dzW = nextZ - w.z;
        const dW = Math.hypot(dxW, dzW);
        if (dW < minSep && dW > 1e-4) {
          const nx = dxW / dW;
          const nz = dzW / dW;
          nextX = w.x + nx * minSep;
          nextZ = w.z + nz * minSep;
          const vn = vx * nx + vz * nz;
          if (vn < 0.0) {
            vx -= vn * nx;
            vz -= vn * nz;
          }
        }
      }

      const stepMoved = Math.hypot(nextX - this.x, nextZ - this.z);
      totalDs += stepMoved;
      this.x = nextX;
      this.z = nextZ;

      if (col.collided && Math.abs(this.speedMps) > 0.5) {
        // Gently align heading along slid tangent velocity so bike never snags against building walls
        const slidSpeed = Math.hypot(vx, vz);
        this.speedMps = this.speedMps >= 0 ? slidSpeed : -slidSpeed;
        if (slidSpeed > 0.6 && this.speedMps > 0) {
          const slideYaw = Math.atan2(vx, -vz);
          this.headingYaw = wrapAngleSigned(
            this.headingYaw + wrapAngleSigned(slideYaw - this.headingYaw) * 0.35
          );
        }
      }

      // Vertical airborne integration (`g = -9.81 m/s^2`)
      const groundNow = getOpenWorldTerrainHeight(this.x, this.z);
      if (this.isAirborne) {
        if (this._airWorldY === undefined) {
          this._airWorldY = groundNow + this.jumpHeightM;
        }
        this._airWorldY += this.verticalVelMps * subH;
        this.verticalVelMps -= BIKE_CONSTANTS.gravityMps2 * subH;
        if (this._airWorldY <= groundNow && this.verticalVelMps <= 0.0) {
          const impact = Math.abs(this.verticalVelMps);
          this._airWorldY = undefined;
          this.jumpHeightM = 0.0;
          this.verticalVelMps = 0.0;
          this.isAirborne = false;
          this.airFromSlowMoRamp = false;
          if (impact > 1.8) {
            this.cameraTrauma = Math.max(this.cameraTrauma, clamp(impact * 0.055, 0.1, 0.36));
            this.bikeDyn.suspVel += 0.05;
          }
        } else {
          this.jumpHeightM = Math.max(0.0, this._airWorldY - groundNow);
          if (this.airFromSlowMoRamp) {
            this._storyAirPitchRad = clamp(
              Math.atan2(0.45 * this.verticalVelMps, Math.max(4.0, Math.abs(this.speedMps))),
              -0.28,
              0.34
            );
          }
        }
      } else {
        this._airWorldY = undefined;
        this.jumpHeightM = 0.0;
        this.verticalVelMps = 0.0;
      }
    }

    // 3. Exclusive Gym-Glass Head-Duck Brace (`glassBracePhase`) & Post-Smash Shake in Free Roam
    if (this._freeRoamGlassSmashElapsed >= 0.0) {
      if (!this.newlyShatteredGlass) {
        this._freeRoamGlassSmashElapsed += dt;
      }
      const tau = this._freeRoamGlassSmashElapsed;
      if (tau <= 0.21) {
        this.glassBracePhase = 1.0;
      } else if (tau < 0.59) {
        this.glassBracePhase = 1.0 - smoothstep01((tau - 0.21) / 0.38);
      } else {
        this.glassBracePhase = 0.0;
      }

      if (tau > 0.48 && tau < 1.18) {
        const s = Math.sin((Math.PI * (tau - 0.48)) / 0.70);
        this.postSmashShake = s * s;
      } else {
        this.postSmashShake = 0.0;
      }

      if (!this._freeRoamPostSmashClapped && tau >= 0.50) {
        this._freeRoamPostSmashClapped = true;
        this._triggerBeakClap("standard", state.elapsedTime);
      }

      if (tau >= 1.20) {
        this._freeRoamGlassSmashElapsed = -1.0;
        this.glassBracePhase = 0.0;
        this.postSmashShake = 0.0;
      }
    } else if (!state.glassShattered) {
      const fwdZNow = -Math.cos(this.headingYaw);
      const approachingIntactGlass =
        Math.abs(this.x) <= 3.6 &&
        this.z > GYM_BREAKOUT_CONFIG.glassPlaneZ &&
        this.z <= 141.0 &&
        fwdZNow < -0.25 &&
        this.speedMps > 1.0;

      if (approachingIntactGlass) {
        if (this.z <= 133.8) {
          this.glassBracePhase = 1.0;
        } else {
          const approachU = clamp((139.8 - this.z) / (139.8 - 133.8), 0.0, 1.0);
          const braceTarget = smoothstep01(approachU);
          this.glassBracePhase = lerp(
            this.glassBracePhase,
            braceTarget,
            1.0 - Math.exp(-24.0 * dt)
          );
        }
      } else {
        this.glassBracePhase *= Math.exp(-10.0 * dt);
        if (this.glassBracePhase < 1e-4) this.glassBracePhase = 0.0;
      }
      this.postSmashShake = 0.0;
    } else {
      this.glassBracePhase = 0.0;
      this.postSmashShake = 0.0;
    }

    this.wingFlare = evaluateWingFlare({
      isAirborne: this.isAirborne,
      inSlowMoJump: state.inSlowMoJump,
      jumpHeightM: this.jumpHeightM,
      glassBracePhase: this.glassBracePhase,
    });
    this.beakOpen = this.isAirborne && this.airFromSlowMoRamp ? 0.85 : 0.0;

    state.inGym =
      Math.abs(this.x) <= 12.0 && this.z > GYM_BREAKOUT_CONFIG.glassPlaneZ && !state.glassShattered;
    state.onTrainerStand = false;

    this.totalArcDistM += totalDs;
    const signedDs = this.speedMps >= 0 ? totalDs : -totalDs;
    const dWheel = signedDs / BIKE_CONSTANTS.wheelRadiusM;
    this.rearWheelRad += dWheel;
    this.frontWheelRad += dWheel;
    this.wheelRad = this.rearWheelRad;
    const effCoast = this.speedMps >= 0 ? this.coastFactor : 1.0;
    this.crankRad += dWheel * (1.0 / GEAR_RATIO) * effCoast;
    this.chainDistM = this.crankRad * KIN_CONSTANTS.chainringRadiusM;

    const kappa = Math.tan(this.steerRad) / wb;
    const surf = getOpenWorldSurfaceType(this.x, this.z);
    const omegaCrank =
      (Math.abs(this.speedMps) / (BIKE_CONSTANTS.wheelRadiusM * GEAR_RATIO)) * effCoast;
    const dynOut = stepBikeDynamicsSpring(this.bikeDyn, {
      kappa,
      speedMps: Math.abs(this.speedMps),
      surfaceType: surf,
      arcDistanceM: this.totalArcDistM,
      plankPitchM: CLIP5_PLANK_PITCH_M,
      crankRad: this.crankRad,
      omegaCrank,
      simTime: state.elapsedTime,
      dt: physDt,
    });
    this.bankRad = dynOut.bankRad;

    // Wave 4 Interactive Free Roam Stationary Celebration (`KeyV` toggle or holding `Space` at `0 MPH`, smoothly re-mounting on drive!)
    const activeDriveCmd =
      Math.abs(throttleCmd) > 0.02 ||
      Math.abs(steerCmd) > 0.02 ||
      Math.abs(this.speedMps) >= 0.12 ||
      this.isAirborne;
    if (activeDriveCmd) {
      this._freeRoamCelebrateToggle = false;
      this.keys.celebrateHold = false;
    }
    const wantStationaryCelebrate =
      !activeDriveCmd &&
      (this._freeRoamCelebrateToggle ||
        this.keys.celebrateHold ||
        Boolean(this.virtualInput.celebrate));
    if (wantStationaryCelebrate) {
      this._freeRoamCelebrationBlend = Math.min(1.0, this._freeRoamCelebrationBlend + dt / 0.42);
    } else if (this._freeRoamCelebrationBlend > 0.0) {
      this._freeRoamCelebrationBlend = Math.max(0.0, this._freeRoamCelebrationBlend - dt / 0.28);
    }
    this.slipAngleDeg = 0.0;
    this.shorelineSkidIntensity = 0.0;
    this._skidSuspPulseM = 0.0;
    this._rearWheelLock = 0.0;
    this._rearWheelLocked = false;
    this.celebrationDismountBlend = smootherstep01(this._freeRoamCelebrationBlend);
    if (this.celebrationDismountBlend > 0.001) {
      const targetParkCrank = Math.round((this.crankRad + 1.35) / TWO_PI) * TWO_PI - 1.35;
      this.crankRad = lerp(
        this.crankRad,
        targetParkCrank,
        (1.0 - Math.exp(-12.0 * dt)) * this.celebrationDismountBlend
      );
      this.chainDistM = this.crankRad * KIN_CONSTANTS.chainringRadiusM;
      this.bankRad *= 1.0 - this.celebrationDismountBlend;
      this.celebrationTargetWorldYaw = wrapAngleSigned(
        this.headingYaw + Math.PI - Math.atan2(2.35, 4.4)
      );
    } else {
      this.celebrationTargetWorldYaw = null;
    }

    // Live player-relative telephoto cinema rig in Free Roam (`worldBlend: 0` so camera never stays frozen in a world-space Story shot!)
    this.directorHint = {
      shotId: "free_roam_cinema",
      shotType: "free_roam",
      fov: 35,
      anchorGroundY: false,
      cameraUp: null,
      camOffset: { right: 2.35, up: 1.18, back: 4.4, forward: -4.4 },
      lookOffset: { right: 0.0, up: 0.92, forward: 2.2, back: -2.2 },
      worldBlend: 0.0,
      worldCam: null,
      worldLook: null,
      isOverhead: false,
      dofFocusDistM: 4.5,
      dofStrength: 0.0,
      coldOpenBeat: 0,
      label: state.directorShotLabel,
    };

    this._checkCollectiblesAt(
      this.x,
      this.z,
      this.jumpHeightM,
      state.elapsedTime,
      false,
      this.headingYaw
    );

    // Track free-roam distance inside active segment ledger entry
    const seg = state.segmentLedger[state.activeClipIndex] || state.segmentLedger[0];
    if (seg) {
      seg.distanceM += totalDs;
      seg.coveredSec = Math.min(seg.durationSec, seg.coveredSec + physDt);
    }
  }

  _stepWaymosFixed(dt) {
    if (dt <= 0.0) return;
    const maxRollRad = WAYMO_KINEMATICS_SPEC.maxRollRad || 0.043633;
    const maxPitchRad = WAYMO_KINEMATICS_SPEC.maxPitchRad || 0.020071;
    const wheelR = WAYMO_KINEMATICS_SPEC.wheelRadiusM || 0.36;
    const yieldBlend = 1.0 - Math.exp(-8.5 * dt);
    const speedBlend = 1.0 - Math.exp(-6.5 * dt);
    const rollBlend = 1.0 - Math.exp(-9.0 * dt);
    const pitchBlend = 1.0 - Math.exp(-8.0 * dt);

    for (let i = 0; i < this.waymos.length; i++) {
      const w = this.waymos[i];
      const spec = WAYMO_LOOP_SPECS[i];
      const curPose = sampleWaymoLoopAtDistance(spec, w.distM);

      const yieldTarget = this._evaluateWaymoYieldTarget(w, i);
      w.speedScale = lerp(w.speedScale, yieldTarget, yieldBlend);
      w.yielding = w.speedScale < 0.82;

      const prevSpeedMps = w.speedMps;
      const desiredSpeedMps = curPose.vProfile * w.speedScale;
      w.speedMps = lerp(prevSpeedMps, desiredSpeedMps, speedBlend);
      const accelMps2 = (w.speedMps - prevSpeedMps) / Math.max(1e-5, dt);

      w.distM = (w.distM + w.speedMps * dt) % spec.totalLen;
      const pose = sampleWaymoLoopAtDistance(spec, w.distM);
      w.x = pose.x;
      w.z = pose.z;
      w.y = getOpenWorldTerrainHeight(pose.x, pose.z);
      w.yaw = pose.yaw;
      w.kappa = pose.kappa;
      w.delta = pose.delta;
      w.steerFL = pose.steerFL;
      w.steerFR = pose.steerFR;

      // Damped outward suspension body roll (1.5–2.5 deg ~ v^2 * kappa) & braking/accel pitch dive (~0.8 deg ~ -dv/dt)
      const targetRollRad = clamp(
        0.0365 * w.speedMps * w.speedMps * pose.kappa,
        -maxRollRad,
        maxRollRad
      );
      const targetPitchRad = clamp(-0.0102 * accelMps2, -maxPitchRad, maxPitchRad);
      w.rollRad = lerp(w.rollRad || 0.0, targetRollRad, rollBlend);
      w.pitchRad = lerp(w.pitchRad || 0.0, targetPitchRad, pitchBlend);

      const dSpin = (w.speedMps * dt) / wheelR;
      w.wheelRad += dSpin;
      w.wheelSpinRad = w.wheelRad;
      w.lidarSpinRad = (w.lidarSpinRad + dt * 5.0 * TWO_PI) % TWO_PI;

      w.signalClockSec = (Number(w.signalClockSec) || 0.0) + dt;
      w.turnSignalLeft = false;
      w.turnSignalRight = false;
      w.blinkOn = false;
    }
    this._writeWaymosToState();
  }

  _stepFlamingosFixed(dt) {
    if (dt <= 0.0) return;
    const distCourtyard = Math.hypot(this.x - -118.0, this.z - -50.0);
    if (distCourtyard > 42.0) {
      // Gently relax scattered flamingos when hero is far away
      for (let i = 0; i < this.flamingos.length; i++) {
        const fl = this.flamingos[i];
        fl.x = lerp(fl.x, fl.homeX, 0.04);
        fl.z = lerp(fl.z, fl.homeZ, 0.04);
        fl.hopY = Math.max(0.0, fl.hopY - dt * 1.5);
        fl.wingFlap *= 0.92;
      }
      return;
    }

    let totalScat = 0;
    for (let i = 0; i < this.flamingos.length; i++) {
      const fl = this.flamingos[i];
      const dx = fl.x - this.x;
      const dz = fl.z - this.z;
      const dist = Math.hypot(dx, dz);

      if (dist < 7.5 && dist > 1e-3) {
        const push = (1.0 - dist / 7.5) * 14.0;
        fl.vx += (dx / dist) * push * dt;
        fl.vz += (dz / dist) * push * dt;
        if (fl.hopY <= 0.01) {
          fl.vy = 1.9 + (i % 4) * 0.25;
        }
        fl.yaw = Math.atan2(dx, -dz);
        fl.wingFlap = 1.0;
        fl.scattered = true;
      }

      // Soft spring back toward courtyard home lawn (keeping courtyard populated)
      fl.vx += (fl.homeX - fl.x) * 0.85 * dt;
      fl.vz += (fl.homeZ - fl.z) * 0.85 * dt;
      const damp = Math.exp(-3.2 * dt);
      fl.vx *= damp;
      fl.vz *= damp;

      fl.x += fl.vx * dt;
      fl.z += fl.vz * dt;

      if (fl.hopY > 0.0 || fl.vy > 0.0) {
        fl.hopY += fl.vy * dt;
        fl.vy -= 9.81 * dt;
        if (fl.hopY <= 0.0) {
          fl.hopY = 0.0;
          fl.vy = 0.0;
        }
      }
      fl.wingFlap *= Math.exp(-2.8 * dt);
      fl.y = getOpenWorldTerrainHeight(fl.x, fl.z) + fl.hopY;
      if (fl.scattered) totalScat++;
    }
    if (totalScat > state.flamingosScattered) {
      state.flamingosScattered = totalScat;
    }
  }

  _stepPinwheelsFixed(dt) {
    if (dt <= 0.0) return;
    for (let i = 0; i < this.pinwheels.length; i++) {
      const pw = this.pinwheels[i];
      // Wake draft spin boost when pelican rides closely past a pinwheel!
      const d = Math.hypot(pw.x - this.x, pw.z - this.z);
      if (d < 9.5 && this.speedMps > 3.2) {
        pw.boostVel = Math.max(pw.boostVel, (1.0 - d / 9.5) * this.speedMps * 0.55);
      }
      pw.boostVel *= Math.exp(-1.4 * dt);
      pw.spinRad = (pw.spinRad + (pw.angularVel + pw.boostVel) * dt) % TWO_PI;
    }
  }

  _syncStateAndTelemetry(_dt) {
    const wbPose = solveOpenWorldWheelbasePose(
      this.x,
      this.z,
      this.headingYaw,
      BIKE_CONSTANTS.wheelbaseM,
      BIKE_CONSTANTS.wheelRadiusM,
      this.jumpHeightM
    );

    // Blend smooth ballistic air pitch when airborne (using exact C^inf tangent `this._storyAirPitchRad` on the V8 Bay View jump!)
    const activeSurpriseHop =
      state.gameMode === "story_autopilot" && (Number(this.wheeliePitchRad) || 0.0) > 0.001;
    let pitchRad = wbPose.slopePitchRad;
    if (
      state.gameMode === "story_autopilot" &&
      this._storyAirPitchRad !== null &&
      this._storyAirPitchRad !== undefined &&
      Number.isFinite(this._storyAirPitchRad)
    ) {
      pitchRad = this._storyAirPitchRad;
    } else if (this.isAirborne && !activeSurpriseHop) {
      const airPitch = clamp(
        Math.atan2(this.verticalVelMps, Math.max(3.5, Math.abs(this.speedMps))) * 0.65,
        -0.28,
        0.36
      );
      const airW = clamp(this.jumpHeightM / 0.18, 0.0, 1.0);
      pitchRad = lerp(wbPose.slopePitchRad, airPitch, airW);
    }
    const pitchDeg = pitchRad * RAD_TO_DEG;

    const dtKin = solveDrivetrainKinematics({
      speedMps: Math.abs(this.speedMps),
      ds: 0.0,
      prevWheelRad: this.wheelRad,
      prevCrankRad: this.crankRad,
      prevChainDistM: this.chainDistM,
      cadenceScale: state.cadenceScale,
      slopePitchDeg: pitchDeg,
    });

    const absSpeed = Math.abs(this.speedMps);
    const baseCadenceScale = clamp(Number(state.cadenceScale) || 1.0, 0.35, 2.0);
    const seqNow = Number(state.sequenceTime) || 0.0;
    const isStoryMode = state.gameMode === "story_autopilot";
    const sprintLive = isStoryMode
      ? evaluateTrainerSprintKinematics(seqNow, baseCadenceScale)
      : null;

    const roadOmegaWheel = absSpeed / BIKE_CONSTANTS.wheelRadiusM;
    const rearLockFactor = isStoryMode && this._rearWheelLocked ? 0.0 : 1.0;
    const omegaWheel =
      isStoryMode && state.onTrainerStand && sprintLive
        ? sprintLive.trainerRollerOmega
        : isStoryMode && sprintLive && seqNow < V5_TRAINER_RELEASE_SEC + 0.72
          ? lerp(roadOmegaWheel, sprintLive.trainerRollerOmega, sprintLive.peelOutSlipBlend)
          : roadOmegaWheel * rearLockFactor;
    const wheelRpm = (omegaWheel * 60.0) / TWO_PI;
    const effCoast = clamp(this.coastFactor, 0.0, 1.0);
    const omegaCrank =
      isStoryMode && state.onTrainerStand && sprintLive
        ? sprintLive.omegaCrank
        : this._cadenceRpmOverride !== null && this._cadenceRpmOverride !== undefined
          ? ((this._cadenceRpmOverride * baseCadenceScale) * TWO_PI) / 60.0
          : (roadOmegaWheel / GEAR_RATIO) * effCoast * rearLockFactor;
    const cadenceRpm = (omegaCrank * 60.0) / TWO_PI;
    const chainSpeedMps = omegaCrank * KIN_CONSTANTS.chainringRadiusM;

    const trainerCadenceRpm = sprintLive ? sprintLive.trainerCadenceRpm : cadenceRpm;
    const trainerPowerWatts = sprintLive ? sprintLive.trainerPowerWatts : Math.max(0.0, dtKin.pedalTorqueNm * effCoast * omegaCrank);
    const trainerSprintProgress = sprintLive ? sprintLive.sprintProgress : 0.0;
    const trainerRollerOmega =
      sprintLive && (state.onTrainerStand || sprintLive.peelOutSlipBlend > 0.0)
        ? sprintLive.trainerRollerOmega * (state.onTrainerStand ? 1.0 : sprintLive.peelOutSlipBlend)
        : 0.0;
    const trainerRollerSpinRad = this.rearWheelRad;

    const powerWatts =
      isStoryMode && state.onTrainerStand
        ? trainerPowerWatts
        : isStoryMode && sprintLive && sprintLive.peelOutSlipBlend > 1e-6
          ? lerp(Math.max(0.0, dtKin.pedalTorqueNm * effCoast * omegaCrank), trainerPowerWatts, sprintLive.peelOutSlipBlend)
          : Math.max(0.0, dtKin.pedalTorqueNm * effCoast * omegaCrank);
    const pedalTorqueNm =
      omegaCrank > 0.25 ? powerWatts / omegaCrank : dtKin.pedalTorqueNm * effCoast;
    const inShorelineSkid =
      isStoryMode && seqNow >= SHORELINE_SKID_START_SEC - 1e-6 && seqNow <= SHORELINE_SKID_END_SEC + 0.05;
    const isCoasting = !inShorelineSkid && effCoast < 0.35 && absSpeed > 1.0;

    this.y = wbPose.centerY;

    // Evaluate secondary biomechanical motion signals analytically for 100% step & seek parity
    const boostAeroCrouch = evaluateAeroCrouch(
      state.boostRemainingSec,
      this._activeBoostTotalSec,
      this.glassBracePhase
    );
    const preloadCrouch =
      state.gameMode === "story_autopilot" ? clamp(Number(this._storyPreloadCrouch) || 0.0, 0.0, 1.0) : 0.0;
    this.aeroCrouch = Math.max(boostAeroCrouch, preloadCrouch);
    const braceSuppress = 1.0 - clamp(this.glassBracePhase, 0.0, 1.0);
    const sprintEffortEnv =
      sprintLive && seqNow <= V5_TRAINER_RELEASE_SEC + 0.75
        ? sprintLive.sprintProgress *
          sprintLive.sprintProgress *
          (seqNow <= V5_TRAINER_RELEASE_SEC
            ? 1.0
            : 1.0 - smoothstep01((seqNow - V5_TRAINER_RELEASE_SEC) / 0.75)) *
          braceSuppress
        : 0.0;
    const sprintTorsoLeanRad = sprintLive ? sprintLive.sprintTorsoLeanRad * braceSuppress : 0.0;
    const sprintHipRockRad = 0.072 * Math.sin(this.crankRad) * sprintEffortEnv;
    const sprintShoulderRockRad = -0.058 * Math.sin(this.crankRad) * sprintEffortEnv;
    const sprintWingTuck = sprintLive ? sprintLive.sprintWingTuck * braceSuppress : 0.0;
    const trainerFrameShudderM = sprintLive ? sprintLive.trainerFrameShudderM : 0.0;
    const trainerFrameShudderRollRad = sprintLive ? sprintLive.trainerFrameShudderRollRad : 0.0;
    const dtSinceClap =
      this._lastClapElapsedTime >= -1.0
        ? (Number(state.elapsedTime) || 0.0) - this._lastClapElapsedTime
        : -10.0;
    this.beakClapPhase = evaluateBeakClapWave(
      dtSinceClap,
      this._lastClapKind,
      this.glassBracePhase
    );

    state.playerX = this.x;
    state.playerY = this.y;
    state.playerZ = this.z;
    state.playerHeadingYaw = this.headingYaw;
    state.isAirborne = this.isAirborne;
    state.glassBracePhase = this.glassBracePhase;
    state.postSmashShake = this.postSmashShake;
    state.beakClapPhase = this.beakClapPhase;
    state.aeroCrouch = this.aeroCrouch;
    state.wingFlare = this.wingFlare;
    state.activeDistrictName = resolveDistrictNameAt(this.x, this.z, state.inGym);

    const suspMm = clamp((this.bikeDyn.suspM + (this._skidSuspPulseM || 0.0)) * 1000.0, 0.0, 4.5);
    const surf = getOpenWorldSurfaceType(this.x, this.z);

    // Evaluate analytical V5 Stan T-Rex & Pelican Startled Surprise signals (active in `story_autopilot`)
    const stanSignals =
      state.gameMode === "story_autopilot"
        ? evaluateStanEncounterSignals(state.sequenceTime || 0.0, this.x, this.z, this.headingYaw)
        : evaluateStanEncounterSignals(-99.0, this.x, this.z, this.headingYaw);
    const frontWheelHopM =
      state.gameMode === "story_autopilot" ? stanSignals.frontWheelHopM : 0.0;
    const wheeliePitchRad =
      state.gameMode === "story_autopilot" ? stanSignals.wheeliePitchRad : 0.0;
    this.frontWheelHopM = frontWheelHopM;
    this.wheeliePitchRad = wheeliePitchRad;

    // Evaluate V7 `0.30s` Avian Gaze Anticipation (`turnLookaheadYaw`, `turnLookaheadDeltaYaw`, `gazeTargetWorld`) & Cold-Open DoF
    const gaze = evaluateHeroGazeAnticipation({
      seqT: seqNow,
      isStoryMode,
      x: this.x,
      y: this.y,
      z: this.z,
      headingYaw: this.headingYaw,
      steerRad: this.steerRad,
      speedMps: this.speedMps,
      onTrainerStand: state.onTrainerStand,
      stanRoarIntensity: stanSignals.stanRoarIntensity,
      pelicanGlanceBackYawRad: stanSignals.pelicanGlanceBackYawRad,
      celebrationDismountBlend: this.celebrationDismountBlend,
      tpuLedger: state.tpuLedger,
    });
    const dofFocusDistM = Number(this.directorHint?.dofFocusDistM) || 4.5;
    const dofStrength = Number(this.directorHint?.dofStrength) || 0.0;
    const coldOpenBeat = Number(this.directorHint?.coldOpenBeat) || 0;

    state.dofFocusDistM = dofFocusDistM;
    state.dofStrength = dofStrength;
    state.coldOpenBeat = coldOpenBeat;
    state.turnLookaheadYaw = gaze.turnLookaheadYaw;
    state.turnLookaheadDeltaYaw = gaze.turnLookaheadDeltaYaw;
    state.gazeTargetWorld.x = gaze.gazeTargetWorld.x;
    state.gazeTargetWorld.y = gaze.gazeTargetWorld.y;
    state.gazeTargetWorld.z = gaze.gazeTargetWorld.z;
    state.gazeTargetWorld.yaw = gaze.gazeTargetWorld.yaw;
    state.gazeTargetWorld.targetType = gaze.gazeTargetWorld.targetType;

    // Quadratic camera trauma shake (`shake = trauma^2`) + subtle damped low-frequency Stan roar rumble (`40.45s - 41.10s`)
    const shake = this.cameraTrauma * this.cameraTrauma;
    const tShake = state.elapsedTime * 43.0;
    const rumbleOff = stanSignals.stanCameraRumbleOffset;
    const cameraShakeOffset = {
      x: Math.sin(tShake * 1.13) * 0.068 * shake + rumbleOff.x,
      y: Math.cos(tShake * 1.57) * 0.094 * shake + rumbleOff.y,
      roll: Math.sin(tShake * 0.52) * 0.0085 * shake + rumbleOff.roll,
    };

    state.kinematics.speedMps = absSpeed;
    state.kinematics.speedKmh = absSpeed * 3.6;
    state.kinematics.speedMph = absSpeed * 2.236936;
    state.kinematics.cadenceRpm = cadenceRpm;
    state.kinematics.trainerCadenceRpm = trainerCadenceRpm;
    state.kinematics.trainerPowerWatts = trainerPowerWatts;
    state.kinematics.trainerSprintProgress = trainerSprintProgress;
    state.kinematics.trainerRollerOmega = trainerRollerOmega;
    state.kinematics.trainerRollerSpinRad = trainerRollerSpinRad;
    state.kinematics.pedalPhaseRad = this.crankRad;
    state.kinematics.sprintTorsoLeanRad = sprintTorsoLeanRad;
    state.kinematics.sprintHipRockRad = sprintHipRockRad;
    state.kinematics.sprintShoulderRockRad = sprintShoulderRockRad;
    state.kinematics.sprintWingTuck = sprintWingTuck;
    state.kinematics.trainerFrameShudderM = trainerFrameShudderM;
    state.kinematics.trainerFrameShudderRollRad = trainerFrameShudderRollRad;
    state.kinematics.wheelRpm = wheelRpm;
    state.kinematics.bankDeg = this.bankRad * RAD_TO_DEG;
    state.kinematics.steerDeg = this.steerRad * RAD_TO_DEG;
    state.kinematics.crankRad = this.crankRad;
    state.kinematics.wheelRad = this.wheelRad;
    state.kinematics.rearWheelRad = this.rearWheelRad;
    state.kinematics.frontWheelRad = this.frontWheelRad;
    state.kinematics.gularDeflectionM = this.bikeDyn.gularY;
    state.kinematics.arcDistanceM = this.totalArcDistM;
    state.kinematics.gearRatio = GEAR_RATIO;
    state.kinematics.chainSpeedMps = chainSpeedMps;
    state.kinematics.pedalTorqueNm = pedalTorqueNm;
    state.kinematics.powerWatts = powerWatts;
    state.kinematics.coastFactor = effCoast;
    state.kinematics.isCoasting = isCoasting;
    state.kinematics.burnoutSmokeIntensity = this.burnoutSmokeIntensity;
    state.kinematics.peelOutBurstIntensity = this.peelOutBurstIntensity;
    state.kinematics.slipAngleDeg = this.slipAngleDeg;
    state.kinematics.shorelineSkidIntensity = this.shorelineSkidIntensity;
    state.kinematics.celebrationDismountBlend = this.celebrationDismountBlend;
    state.kinematics.celebrationTargetWorldYaw = this.celebrationTargetWorldYaw;
    state.kinematics.rearWheelLocked = Boolean(this._rearWheelLocked);
    state.kinematics.slopePitchDeg = pitchDeg;
    state.kinematics.bridgeArchElevationM = wbPose.bridgeArchElevationM;
    state.kinematics.suspensionCompressionMm = suspMm;
    state.kinematics.verticalVelMps = this.verticalVelMps;
    state.kinematics.jumpHeightM = this.jumpHeightM;
    state.kinematics.frontWheelHopM = frontWheelHopM;
    state.kinematics.wheeliePitchRad = wheeliePitchRad;
    state.kinematics.cameraTrauma = this.cameraTrauma;
    state.kinematics.glassBracePhase = this.glassBracePhase;
    state.kinematics.postSmashShake = this.postSmashShake;
    state.kinematics.beakClapPhase = this.beakClapPhase;
    state.kinematics.aeroCrouch = this.aeroCrouch;
    state.kinematics.wingFlare = this.wingFlare;
    state.kinematics.glassBreakTime = V5_GLASS_SMASH_SEC;
    state.kinematics.trainerReleaseTime = V5_TRAINER_RELEASE_SEC;
    state.kinematics.stanRoarTriggerTime = STAN_ROAR_TRIGGER_SEC;
    state.kinematics.pelicanSurpriseOnsetTime = PELICAN_SURPRISE_ONSET_SEC;
    state.kinematics.totalDurationSec = V5_STORY_DURATION_SEC;
    state.kinematics.stanTrackPhase = stanSignals.stanTrackPhase;
    state.kinematics.stanHeadWhipPhase = stanSignals.stanHeadWhipPhase;
    state.kinematics.stanRoarPhase = stanSignals.stanRoarPhase;
    state.kinematics.stanRoarIntensity = stanSignals.stanRoarIntensity;
    state.kinematics.roarIntensity = stanSignals.roarIntensity;
    state.kinematics.stanJawOpenNorm = stanSignals.stanJawOpenNorm;
    state.kinematics.stanJawOpenDeg = stanSignals.stanJawOpenDeg;
    state.kinematics.stanHeadYawRad = stanSignals.stanHeadYawRad;
    state.kinematics.stanHeadPitchRad = stanSignals.stanHeadPitchRad;
    state.kinematics.stanTailSwayRad = stanSignals.stanTailSwayRad;
    state.kinematics.stanCameraRumble = stanSignals.stanCameraRumble;
    state.kinematics.pelicanSurprisePhase = stanSignals.pelicanSurprisePhase;
    state.kinematics.pelicanCrestJoltRad = stanSignals.pelicanCrestJoltRad;
    state.kinematics.pelicanGlanceBackYawRad = stanSignals.pelicanGlanceBackYawRad;
    state.kinematics.pelicanStartledBeakOpen = stanSignals.pelicanStartledBeakOpen;
    state.kinematics.dofFocusDistM = dofFocusDistM;
    state.kinematics.dofStrength = dofStrength;
    state.kinematics.coldOpenBeat = coldOpenBeat;
    state.kinematics.turnLookaheadYaw = gaze.turnLookaheadYaw;
    state.kinematics.turnLookaheadDeltaYaw = gaze.turnLookaheadDeltaYaw;
    if (!state.kinematics.gazeTargetWorld) {
      state.kinematics.gazeTargetWorld = { x: 0.0, y: 0.96, z: 136.0, yaw: 0.0, targetType: "path_lookahead" };
    }
    state.kinematics.gazeTargetWorld.x = gaze.gazeTargetWorld.x;
    state.kinematics.gazeTargetWorld.y = gaze.gazeTargetWorld.y;
    state.kinematics.gazeTargetWorld.z = gaze.gazeTargetWorld.z;
    state.kinematics.gazeTargetWorld.yaw = gaze.gazeTargetWorld.yaw;
    state.kinematics.gazeTargetWorld.targetType = gaze.gazeTargetWorld.targetType;

    const summary = deriveTourSummary();

    const fwdX = Math.sin(this.headingYaw);
    const fwdZ = -Math.cos(this.headingYaw);
    const rightX = Math.cos(this.headingYaw);
    const rightZ = Math.sin(this.headingYaw);

    this.snapshot = {
      sequenceTime: Number(state.sequenceTime) || 0.0,
      elapsedTime: Number(state.elapsedTime) || 0.0,
      x: this.x,
      y: this.y,
      z: this.z,
      playerX: this.x,
      playerY: this.y,
      playerZ: this.z,
      headingYaw: this.headingYaw,
      yaw: this.headingYaw,
      threeRotationY: -this.headingYaw,
      forwardX: fwdX,
      forwardZ: fwdZ,
      rightX,
      rightZ,
      groundY: wbPose.groundY,
      yRear: wbPose.yRear + this.jumpHeightM - Math.max(0.0, frontWheelHopM - this.jumpHeightM),
      yFront: wbPose.yFront + Math.max(this.jumpHeightM, frontWheelHopM),
      centerY: wbPose.centerY,
      slopePitchRad: pitchRad,
      slopePitchDeg: pitchDeg,
      bridgeArchElevationM: wbPose.bridgeArchElevationM,
      jumpHeightM: this.jumpHeightM,
      frontWheelHopM,
      wheeliePitchRad,
      verticalVelMps: this.verticalVelMps,
      speedMps: this.speedMps,
      speedKmh: absSpeed * 3.6,
      arcDistanceM: this.totalArcDistM,
      wheelRad: this.wheelRad,
      rearWheelRad: this.rearWheelRad,
      frontWheelRad: this.frontWheelRad,
      crankRad: this.crankRad,
      pedalPhaseRad: this.crankRad,
      chainDistM: this.chainDistM,
      omegaWheel,
      omegaCrank,
      cadenceRpm,
      trainerCadenceRpm,
      trainerPowerWatts,
      trainerSprintProgress,
      trainerRollerOmega,
      trainerRollerSpinRad,
      sprintTorsoLeanRad,
      sprintHipRockRad,
      sprintShoulderRockRad,
      sprintWingTuck,
      trainerFrameShudderM,
      trainerFrameShudderRollRad,
      wheelRpm,
      gearRatio: GEAR_RATIO,
      chainSpeedMps,
      pedalTorqueNm,
      powerWatts,
      coastFactor: effCoast,
      isCoasting,
      steerRad: this.steerRad,
      rigSteerRad: -this.steerRad,
      steerDeg: this.steerRad * RAD_TO_DEG,
      bankRad: this.bankRad,
      bankDeg: this.bankRad * RAD_TO_DEG,
      suspensionCompressionMm: suspMm,
      gularDeflectionM: this.bikeDyn.gularY,
      surfaceType: surf,
      plankPitchM: CLIP5_PLANK_PITCH_M,
      inGym: state.inGym,
      onTrainerStand: state.onTrainerStand,
      trainerSparkIntensity: this.trainerSparkIntensity,
      burnoutSmokeIntensity: this.burnoutSmokeIntensity,
      peelOutBurstIntensity: this.peelOutBurstIntensity,
      slipAngleDeg: this.slipAngleDeg,
      shorelineSkidIntensity: this.shorelineSkidIntensity,
      celebrationDismountBlend: this.celebrationDismountBlend,
      celebrationTargetWorldYaw: this.celebrationTargetWorldYaw,
      rearWheelLock: this._rearWheelLock || 0.0,
      rearWheelLocked: Boolean(this._rearWheelLocked),
      glassShattered: state.glassShattered,
      newlyShatteredGlass: this.newlyShatteredGlass,
      isAirborne: this.isAirborne,
      inSlowMoJump: state.inSlowMoJump,
      timeScale: state.timeScale,
      glassBracePhase: this.glassBracePhase,
      postSmashShake: this.postSmashShake,
      beakClapPhase: this.beakClapPhase,
      aeroCrouch: this.aeroCrouch,
      wingFlare: this.wingFlare,
      wearNooglerHat: Boolean(state.wearNooglerHat),
      nooglerCapUnlocked: Boolean(state.nooglerCapUnlocked),
      beakOpen: this.beakOpen,
      friendlyNod: this.friendlyNod,
      boostRemainingSec: state.boostRemainingSec,
      isBoosting: state.boostRemainingSec > 0.0,
      cameraTrauma: this.cameraTrauma,
      cameraShakeOffset,
      glassBreakTime: V5_GLASS_SMASH_SEC,
      trainerReleaseTime: V5_TRAINER_RELEASE_SEC,
      stanRoarTriggerTime: STAN_ROAR_TRIGGER_SEC,
      pelicanSurpriseOnsetTime: PELICAN_SURPRISE_ONSET_SEC,
      totalDurationSec: V5_STORY_DURATION_SEC,
      stanTrackPhase: stanSignals.stanTrackPhase,
      stanHeadWhipPhase: stanSignals.stanHeadWhipPhase,
      stanRoarPhase: stanSignals.stanRoarPhase,
      stanRoarIntensity: stanSignals.stanRoarIntensity,
      roarIntensity: stanSignals.roarIntensity,
      stanJawOpenNorm: stanSignals.stanJawOpenNorm,
      stanJawOpenDeg: stanSignals.stanJawOpenDeg,
      stanHeadYawRad: stanSignals.stanHeadYawRad,
      stanHeadPitchRad: stanSignals.stanHeadPitchRad,
      stanTailSwayRad: stanSignals.stanTailSwayRad,
      stanCameraRumble: stanSignals.stanCameraRumble,
      stanCameraRumbleOffset: stanSignals.stanCameraRumbleOffset,
      stanRoarSignal: {
        triggerTime: STAN_ROAR_TRIGGER_SEC,
        trackPhase: stanSignals.stanTrackPhase,
        headWhipPhase: stanSignals.stanHeadWhipPhase,
        roarIntensity: stanSignals.stanRoarIntensity,
        jawOpenNorm: stanSignals.stanJawOpenNorm,
        jawOpenDeg: stanSignals.stanJawOpenDeg,
        headYawRad: stanSignals.stanHeadYawRad,
        headPitchRad: stanSignals.stanHeadPitchRad,
        tailSwayRad: stanSignals.stanTailSwayRad,
        cameraRumble: stanSignals.stanCameraRumble,
        cameraRumbleOffset: stanSignals.stanCameraRumbleOffset,
      },
      pelicanSurprisePhase: stanSignals.pelicanSurprisePhase,
      pelicanCrestJoltRad: stanSignals.pelicanCrestJoltRad,
      pelicanGlanceBackYawRad: stanSignals.pelicanGlanceBackYawRad,
      pelicanStartledBeakOpen: stanSignals.pelicanStartledBeakOpen,
      dofFocusDistM,
      dofStrength,
      coldOpenBeat,
      turnLookaheadYaw: gaze.turnLookaheadYaw,
      turnLookaheadDeltaYaw: gaze.turnLookaheadDeltaYaw,
      gazeTargetWorld: gaze.gazeTargetWorld,
      directorShotLabel: state.directorShotLabel,
      directorHint: this.directorHint,
      waymoPositions: this.waymos,
      waymos: this.waymos,
      flamingos: this.flamingos,
      pinwheels: this.pinwheels,
      summary,
    };

    return this.snapshot;
  }

  getSnapshot() {
    return this.snapshot || this._syncStateAndTelemetry(0.0);
  }
}
