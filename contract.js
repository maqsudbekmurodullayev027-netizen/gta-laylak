/**
 * contract.js — Frozen Open-World Master Contract (v3.0 — Pelican Campus Quest).
 *
 * Shared, read-only spatial & state contract uniting:
 *   1. `webgl-world-builder` (`src/scenes/open_campus_world.js`, `src/core.js`, `src/rig/*`, `src/assets/glb/*`)
 *   2. `game-physics-builder` (`src/rig/kin.js`, `src/game/world_nav_and_story.js`, `src/audio/game_audio.js`)
 *   3. `web-ui-design-builder` (`src/index.html`, `src/styles.css`, `src/ui.js`, `src/main.js`, `choreography.json`)
 *
 * Coordinate & Heading Convention (Right-Handed Three.js Y-Up):
 *   - `X` axis: West (`-X`) <-> East (`+X`, toward Bay View Pond & Dragonscale Canopy)
 *   - `Z` axis: North (`-Z`, toward Stevens Creek Bridge & Shoreline Amphitheatre) <-> South (`+Z`, Gradient Canopy Gym)
 *   - `headingYaw` (rad): `0` = due North (`dirX = 0, dirZ = -1`); `+PI/2` = due East (`+X`); `-PI/2` = due West (`-X`); `PI` = due South (`+Z`).
 *     Forward unit vector: `forwardX = Math.sin(headingYaw)`, `forwardZ = -Math.cos(headingYaw)`.
 */

export const T_CLIP = 14.4;
export const NUM_CLIPS = 5;
export const T_TOTAL = 72.0; // Full 72s V5 Story Auto-Pilot arc across 5 scenic campus vignettes

export const DEFAULT_GBIKE_VARIANT = "priority_v9"; // "priority_v9" | "classic_v6"

export const GBIKE_COLORS = {
  frameRed: "#EA4335",
  forkBlue: "#4285F4",
  fenderRimYellow: "#FBBC05",
  rearFenderGreen: "#34A853",
  basketCharcoal: "#1E2229",
  chrome: "#E2E8F0",
  tireRubber: "#1F2328",
  whitewall: "#F4F1EA",
};

export const BIKE_CONSTANTS = {
  wheelRadiusM: 0.335,
  wheelbaseM: 1.085,
  crankRadiusM: 0.170,
  driveSideX: 0.068,
  chainringTeeth: 44,
  rearCogTeeth: 16,
  chainLinks: 98,
  baseSpeedMps: 4.5,          // 16.2 km/h relaxed, breezy campus cruiser pace (~47-50 RPM)
  boostSpeedMps: 6.2,         // 22.3 km/h gentle Microkitchen Espresso breeze (1.38x)
  maxReverseMps: -2.0,
  maxSteerRad: 0.56,
  gravityMps2: 9.81,
  legL1: 0.395,
  legL2: 0.320,
  legL1M: 0.395,
  legL2M: 0.320,
};

export const WORLD_BOUNDS = {
  minX: -235,
  maxX: 235,
  minZ: -235,
  maxZ: 185,
};

export const TPU_PICKUP_RADIUS_M = 0.92;
export const TPU_MODEL_LABEL = "TPU 8i";

export const WAYMO_KINEMATICS_SPEC = Object.freeze({
  wheelbaseM: 2.92,
  trackWidthM: 1.62,
  wheelRadiusM: 0.375,
  maxSteerDeg: 32.0,
  straightSpeedMps: 5.8,
  turnSpeedMps: 3.0,
  turnBlinkHz: 1.8,
  turnSignalHz: 1.8,
  turnPreSignalSec: 2.0,
  turnSignalLeadSec: 2.0,
  maxRollRad: (2.5 * Math.PI) / 180.0,
  maxPitchRad: (1.15 * Math.PI) / 180.0,
});

export const GYM_BREAKOUT_CONFIG = {
  canopyCenterX: 0.0,
  canopyCenterZ: 146.0,
  trainerX: 0.0,
  trainerZ: 140.2,
  trainerHeadingYaw: 0.0,     // Facing due North (-Z) straight through the breakable window toward Pinwheels & Shoreline
  trainerStandReleaseSec: 7.40,
  glassPlaneZ: 131.2,
  glassPaneHalfWidthM: 2.4,
  glassPaneHeightM: 3.7,
  glassSmashSec: 9.40,
  drivewayApexZ: 116.0,
};

/**
 * 16 Colorful Google Kinetic Wind Pinwheels outside Gradient Canopy Drop-Off Driveway heading toward Shoreline.
 */
export const KINETIC_PINWHEELS = [
  { id: "pw01", x: -26.0, z: 121.0, heightM: 3.6, color: "#4285F4", phase: 0.1 },
  { id: "pw02", x: -20.5, z: 118.5, heightM: 4.1, color: "#EA4335", phase: 0.8 },
  { id: "pw03", x: -15.0, z: 121.5, heightM: 3.4, color: "#FBBC05", phase: 1.5 },
  { id: "pw04", x: -10.5, z: 110.5, heightM: 3.9, color: "#34A853", phase: 2.2 },
  { id: "pw05", x: -16.5, z: 106.0, heightM: 4.3, color: "#4285F4", phase: 2.9 },
  { id: "pw06", x: -23.0, z: 108.0, heightM: 3.5, color: "#EA4335", phase: 3.6 },
  { id: "pw07", x: -7.5,  z: 98.0,  heightM: 3.8, color: "#FBBC05", phase: 4.1 },
  { id: "pw08", x: -12.0, z: 92.0,  heightM: 4.2, color: "#34A853", phase: 4.8 },
  { id: "pw09", x: 7.5,   z: 98.0,  heightM: 3.8, color: "#4285F4", phase: 0.5 },
  { id: "pw10", x: 12.0,  z: 92.0,  heightM: 4.2, color: "#EA4335", phase: 1.2 },
  { id: "pw11", x: 10.5,  z: 110.5, heightM: 3.9, color: "#FBBC05", phase: 1.9 },
  { id: "pw12", x: 16.5,  z: 106.0, heightM: 4.3, color: "#34A853", phase: 2.6 },
  { id: "pw13", x: 23.0,  z: 108.0, heightM: 3.5, color: "#4285F4", phase: 3.3 },
  { id: "pw14", x: 15.0,  z: 121.5, heightM: 3.4, color: "#EA4335", phase: 4.0 },
  { id: "pw15", x: 20.5,  z: 118.5, heightM: 4.1, color: "#FBBC05", phase: 4.7 },
  { id: "pw16", x: 26.0,  z: 121.0, heightM: 3.6, color: "#34A853", phase: 5.4 },
];

/**
 * Contiguous Open-World Road & Protected Bikeway Segments (`520m x 520m` North Bayshore Grid).
 */
export const CAMPUS_ROADS = [
  // East-West Grand Boulevards
  { id: "charleston_rd", x1: -195, z1: 76, x2: 164, z2: 76, widthM: 14.0, bikeLane: true, surface: "asphalt", name: "Charleston Rd" },
  { id: "amphitheatre_pkwy", x1: -195, z1: -18, x2: 164, z2: -18, widthM: 14.0, bikeLane: true, surface: "asphalt", name: "Amphitheatre Pkwy" },
  { id: "gradient_driveway", x1: -56, z1: 116, x2: 56, z2: 116, widthM: 10.5, bikeLane: false, surface: "concrete", name: "Gradient Canopy Drop-Off" },
  { id: "north_creek_connector", x1: 0, z1: -86, x2: 164, z2: -86, widthM: 11.5, bikeLane: true, surface: "asphalt", name: "North Bayshore Trail" },
  // North-South Avenues & Waterfront Promenade
  { id: "shoreline_blvd", x1: 0, z1: 121.25, x2: 0, z2: -86, widthM: 14.0, bikeLane: true, surface: "asphalt", name: "N Shoreline Blvd" },
  { id: "west_campus_ave", x1: -118, z1: 86.6, x2: -118, z2: -18, widthM: 13.0, bikeLane: true, surface: "asphalt", name: "Googleplex West Ave" },
  { id: "googleplex_courtyard_walk", x1: -118, z1: -18, x2: -118, z2: -72, widthM: 9.0, bikeLane: false, surface: "pavers", name: "Googleplex Stan T-Rex Courtyard" },
  { id: "bay_view_promenade", x1: 156, z1: 112, x2: 156, z2: -86, widthM: 16.0, bikeLane: false, surface: "pavers", name: "Bay View Waterfront Promenade" },
  // Stevens Creek Arched Bridge Corridor -> Shoreline Amphitheatre Sunset Meadow
  { id: "stevens_creek_bridge", x1: 52, z1: -86, x2: 18, z2: -158, widthM: 6.2, bikeLane: false, surface: "wood_planks", isArchedBridge: true, archHeightM: 1.18, name: "Stevens Creek Corten Bridge" },
  { id: "shoreline_meadow_path", x1: 18, z1: -158, x2: 12, z2: -190, widthM: 9.5, bikeLane: false, surface: "pavers", name: "Shoreline Amphitheatre Esplanade" },
];

export const CAMPUS_INTERSECTIONS = [
  { x: 0, z: 116, radiusM: 9.0, hasCrosswalk: true },
  { x: 0, z: 76, radiusM: 10.0, hasCrosswalk: true, hasTrafficLight: true },
  { x: -118, z: 76, radiusM: 10.0, hasCrosswalk: true, hasTrafficLight: true },
  { x: 156, z: 76, radiusM: 10.0, hasCrosswalk: true, hasTrafficLight: true },
  { x: 0, z: -18, radiusM: 10.0, hasCrosswalk: true, hasTrafficLight: true },
  { x: -118, z: -18, radiusM: 10.0, hasCrosswalk: true, hasTrafficLight: true },
  { x: 156, z: -18, radiusM: 10.0, hasCrosswalk: true, hasTrafficLight: true },
  { x: 0, z: -86, radiusM: 9.0, hasCrosswalk: true },
  { x: 52, z: -86, radiusM: 9.0, hasCrosswalk: true },
  { x: 156, z: -86, radiusM: 9.0, hasCrosswalk: true },
];

/**
 * Surrounding Campus Office Wings & Landmarks (`soft-deflection AABBs` so open-world blocks feel architecturally dense, zero empty void).
 * NOTE: Gradient Canopy (`id: 'bldg_gradient_canopy'`) leaves the central Gym corridor (`x in [-5.5, +5.5], z in [130, 146]`) passable once glass breaks!
 */
export const CAMPUS_BUILDING_BLOCKS = [
  { id: "bldg_visitor_timber", name: "Visitor Experience Pavilion", cx: -156, cz: 104, wx: 34, wz: 22, hy: 9.5, style: "timber" },
  { id: "bldg_charleston_sw", name: "Charleston West Studio", cx: -60, cz: 46, wx: 52, wz: 24, hy: 12.5, style: "glass_modern" },
  { id: "bldg_charleston_se", name: "Charleston East Commons", cx: 76, cz: 46, wx: 64, wz: 24, hy: 13.0, style: "glass_modern" },
  { id: "bldg_plex_40", name: "Googleplex Bldg 40", cx: -162, cz: -52, wx: 38, wz: 26, hy: 14.0, style: "plex_glass" },
  { id: "bldg_plex_41", name: "Googleplex Bldg 41", cx: -74, cz: -52, wx: 36, wz: 24, hy: 13.5, style: "plex_glass" },
  { id: "bldg_plex_42", name: "Googleplex Bldg 42", cx: -60, cz: 12, wx: 48, wz: 22, hy: 13.0, style: "plex_glass" },
  { id: "bldg_ai_compute_hub", name: "North Bayshore TPU 8i Hub", cx: 76, cz: 12, wx: 58, wz: 24, hy: 14.5, style: "timber" },
  { id: "bldg_bayview_canopy", name: "Bay View Dragonscale Campus", cx: 202, cz: 22, wx: 42, wz: 56, hy: 13.0, style: "dragonscale" },
  { id: "bldg_solar_carport_w", name: "Campus Solar Carport West", cx: -162, cz: 28, wx: 32, wz: 36, hy: 5.4, style: "solar_carport" },
  { id: "bldg_north_commons", name: "Shoreline Tech Pavilion", cx: -32, cz: -54, wx: 34, wz: 20, hy: 11.5, style: "timber" },
];

export const CAMPUS_LANDMARKS = [
  { id: "gradient_canopy", title: "Gradient Canopy & Pinwheels", x: 0, z: 126, color: "#FBBC05" },
  { id: "android_lawn", title: "Android Lawn Sculpture Park", x: -118, z: 96, color: "#34A853" },
  { id: "stan_trex_courtyard", title: "Googleplex Stan T-Rex Plaza", x: -118, z: -50, color: "#EA4335" },
  { id: "bay_view_pond", title: "Bay View Dragonscale Waterfront", x: 156, z: 22, color: "#4285F4" },
  { id: "shoreline_amphitheatre", title: "Shoreline Amphitheatre Peaks", x: 12, z: -196, color: "#4285F4" },
];

/**
 * Wooden Campus Jump Ramps (`slowMo: true` dilates simulation clock to `0.35x` mid-air like Addy's 00:36 ramp shot!).
 */
export const JUMP_RAMPS = [
  {
    id: "ramp_android_plaza",
    x: -92.0,
    z: 76.0,
    headingYaw: -Math.PI / 2, // Launching West toward Android Lawn intersection
    lengthM: 6.4,
    widthM: 3.6,
    heightM: 1.15,
    slowMo: false,
  },
  {
    id: "ramp_bayview_waterfront",
    x: 156.0,
    z: 32.0,
    headingYaw: 0.0,          // Launching North along the sunlit Bay View Waterfront Promenade!
    lengthM: 7.4,
    widthM: 4.2,
    heightM: 1.42,
    slowMo: true,
  },
];

/**
 * Companion Sloped Wooden Landing Transition Ramp (`Campus_Landing_Ramp_V8`, `bayview_landing_ramp`):
 * Placed `~11.5m` downrange of `ramp_bayview_waterfront` along `x = 156.0` (`z = 14.30m` center,
 * `z = 17.30m` South `1.35m` entry crest sloping smoothly at `~ -13.4 deg` to `z = 11.30m` North ground toe).
 */
export const BAYVIEW_LANDING_RAMP = Object.freeze({
  id: "bayview_landing_ramp",
  x: 156.0,
  z: 14.30,
  y: 0.016,
  headingYaw: 0.0,
  rotY: 0.0,
  lengthM: 6.0,
  widthM: 3.8,
  heightM: 1.35,
  peakHeightM: 1.35,
});

export const LANDING_RAMPS = [BAYVIEW_LANDING_RAMP];

/**
 * 5 Microkitchen (`MK`) Espresso & Matcha Turbo Boost Carts (`1.38x` speed surge + frothy steam particles).
 */
export const MK_BOOST_PADS = [
  { id: "mk_pinwheel_plaza", x: 0.0, z: 96.0, radiusM: 3.2, label: "Canopy MK Espresso" },
  { id: "mk_android_lawn", x: -118.0, z: 54.0, radiusM: 3.2, label: "Android Matcha Bar" },
  { id: "mk_plex_courtyard", x: -96.0, z: -18.0, radiusM: 3.2, label: "Googleplex Microkitchen" },
  { id: "mk_amphitheatre_east", x: 73.5, z: -18.0, radiusM: 3.2, label: "Amphitheatre East MK Espresso" },
  { id: "mk_waterfront", x: 156.0, z: 57.5, radiusM: 3.2, label: "Bay View Cold Brew Cart" },
];

/**
 * 16 Collectible Glowing Google TPU 8i Wafers snapped dead-center onto the Pelican's front-basket
 * trajectory across all 5 Campus Districts (`TPU_PICKUP_RADIUS_M = 0.92m` physical-contact collection!).
 */
export const TPU_SPAWNS = [
  // District 1: Gradient Canopy Driveway & Pinwheel Spine (3 TPU 8i chips)
  { id: "tpu_01", index: 0, x: 0.00, z: 117.93, bonusHeightM: 0.55, tier: "trillium", model: "TPU 8i", district: "gradient_canopy" },
  { id: "tpu_02", index: 1, x: 0.00, z: 103.06, bonusHeightM: 0.55, tier: "trillium", model: "TPU 8i", district: "gradient_canopy" },
  { id: "tpu_03", index: 2, x: -6.16, z: 81.30, bonusHeightM: 0.55, tier: "trillium", model: "TPU 8i", district: "gradient_canopy" },
  // District 2: Charleston West & Android Lawn Sculpture Garden (3 TPU 8i chips)
  { id: "tpu_04", index: 3, x: -113.82, z: 100.55, bonusHeightM: 0.55, tier: "trillium", model: "TPU 8i", district: "android_lawn" },
  { id: "tpu_05", index: 4, x: -117.58, z: 87.02, bonusHeightM: 0.65, tier: "ironwood_gold", model: "TPU 8i", district: "android_lawn" },
  { id: "tpu_06", index: 5, x: -118.00, z: 65.18, bonusHeightM: 0.55, tier: "trillium", model: "TPU 8i", district: "android_lawn" },
  // District 3: Googleplex Courtyard & Stan T-Rex Flamingo Ring (3 TPU 8i chips)
  { id: "tpu_07", index: 6, x: -117.96, z: -39.06, bonusHeightM: 0.55, tier: "trillium", model: "TPU 8i", district: "stan_trex_courtyard" },
  { id: "tpu_08", index: 7, x: -109.12, z: -43.40, bonusHeightM: 0.65, tier: "ironwood_gold", model: "TPU 8i", district: "stan_trex_courtyard" },
  { id: "tpu_09", index: 8, x: -102.00, z: -25.89, bonusHeightM: 0.55, tier: "trillium", model: "TPU 8i", district: "stan_trex_courtyard" },
  // District 4: Bay View Dragonscale Waterfront & Slow-Mo Ramp Apex (4 TPU 8i chips)
  { id: "tpu_10", index: 9, x: 156.00, z: 49.71, bonusHeightM: 0.55, tier: "trillium", model: "TPU 8i", district: "bay_view_pond" },
  { id: "tpu_11", index: 10, x: 156.00, z: 39.90, bonusHeightM: 0.55, tier: "trillium", model: "TPU 8i", district: "bay_view_pond" },
  { id: "tpu_12", index: 11, x: 156.00, z: 22.35, bonusHeightM: 4.54, tier: "ironwood_gold", model: "TPU 8i", district: "bay_view_pond" }, // High ~4.02m Newtonian apex over Bay View Slow-Mo Ramp!
  { id: "tpu_13", index: 12, x: 156.00, z: 7.80, bonusHeightM: 0.55, tier: "trillium", model: "TPU 8i", district: "bay_view_pond" },
  // District 5: Stevens Creek Arched Bridge -> Shoreline Amphitheatre Finale (3 TPU 8i chips)
  { id: "tpu_14", index: 13, x: 24.18, z: -144.91, bonusHeightM: 0.55, tier: "trillium", model: "TPU 8i", district: "shoreline_amphitheatre" },
  { id: "tpu_15", index: 14, x: 16.92, z: -160.57, bonusHeightM: 0.65, tier: "ironwood_gold", model: "TPU 8i", district: "shoreline_amphitheatre" }, // North Corten Bridge portal!
  { id: "tpu_16", index: 15, x: 13.80, z: -176.34, bonusHeightM: 0.68, tier: "ironwood_gold", model: "TPU 8i", district: "shoreline_amphitheatre" }, // Shoreline Amphitheatre TPU 8i Supercluster Pedestal!
];

/**
 * Autonomous Campus Traffic Loops (100% Legal US Right-Hand-Traffic On-Asphalt `Waymo_Gen6_V3` Ojai Robotaxis).
 * Parameterized via `C^2` Quintic-Bezier corner fillets (`R_min = 8.62m–9.80m` inside `[8.5m, 10.5m]`, zero hairpins!).
 */
export const WAYMO_ROUTES = [
  {
    id: "waymo_01",
    vehicleType: "waymo",
    speedMps: 5.8,
    turnSpeedMps: 3.0,
    filletSetbackM: 13.2,
    phase: 0.560,
    waypoints: [
      { x: -120.2, z: 78.2 }, { x: 2.2, z: 78.2 }, { x: 2.2, z: -20.2 }, { x: -120.2, z: -20.2 },
    ],
  },
  {
    id: "waymo_02",
    vehicleType: "waymo",
    speedMps: 5.8,
    turnSpeedMps: 3.0,
    filletSetbackM: 13.2,
    phase: 0.215,
    waypoints: [
      { x: -120.2, z: 78.2 }, { x: 2.2, z: 78.2 }, { x: 2.2, z: -20.2 }, { x: -120.2, z: -20.2 },
    ],
  },
  {
    id: "waymo_03",
    vehicleType: "waymo",
    speedMps: 5.8,
    turnSpeedMps: 3.0,
    filletSetbackM: 11.6,
    phase: 0.928,
    waypoints: [
      { x: -115.8, z: 73.8 }, { x: -115.8, z: -15.8 }, { x: -2.2, z: -15.8 }, { x: -2.2, z: 73.8 },
    ],
  },
  {
    id: "waymo_04",
    vehicleType: "waymo",
    speedMps: 5.8,
    turnSpeedMps: 3.0,
    filletSetbackM: 13.2,
    phase: 0.890,
    waypoints: [
      { x: -120.2, z: 78.2 }, { x: 2.2, z: 78.2 }, { x: 2.2, z: -20.2 }, { x: -120.2, z: -20.2 },
    ],
  },
  {
    id: "gbus_shuttle_01",
    vehicleType: "waymo",
    speedMps: 5.8,
    turnSpeedMps: 3.0,
    filletSetbackM: 11.6,
    phase: 0.428,
    waypoints: [
      { x: -115.8, z: 73.8 }, { x: -115.8, z: -15.8 }, { x: -2.2, z: -15.8 }, { x: -2.2, z: 73.8 },
    ],
  },
];

/**
 * Mode / Chapter Presets (`?state=` URL support + Top HUD quick-jump pills).
 * Preserves legacy `clip1..clip5` & `play_all` aliases while adding open-world game chapters & `free_roam`.
 */
export const CAMPUS_CLIPS = [
  {
    id: "clip1",
    stateKey: "gym_breakout",
    index: 0,
    shortLabel: "01 · Gym Breakout",
    title: "Gradient Canopy Gym & Pinwheel Breakout",
    locationBadge: "Gradient Canopy · Pinwheel Plaza",
    startSec: 0.0,
    endSec: 21.5,
    baseSpeedMps: 4.8,
    surfaceType: "concrete",
    dotColor: "#FBBC05",
    spawnX: 0.0,
    spawnZ: 140.2,
    spawnYaw: 0.0,
  },
  {
    id: "clip2",
    stateKey: "android_lawn",
    index: 1,
    shortLabel: "02 · Android Lawn",
    title: "Charleston Bikeway & Android Sculpture Park",
    locationBadge: "Charleston Rd · Android Lawn",
    startSec: 21.5,
    endSec: 36.5,
    baseSpeedMps: 4.6,
    surfaceType: "asphalt",
    dotColor: "#34A853",
    spawnX: -113.70,
    spawnZ: 109.90,
    spawnYaw: -0.0135,
  },
  {
    id: "clip3",
    stateKey: "googleplex_trex",
    index: 2,
    shortLabel: "03 · Stan T-Rex",
    title: "Googleplex Courtyard & Stan T-Rex Roar",
    locationBadge: "1600 Amphitheatre · Stan T-Rex",
    startSec: 36.5,
    endSec: 49.0,
    baseSpeedMps: 4.6,
    surfaceType: "pavers",
    dotColor: "#EA4335",
    spawnX: -118.0,
    spawnZ: -33.75,
    spawnYaw: 0.0,
  },
  {
    id: "clip4",
    stateKey: "bay_view_ramp",
    index: 3,
    shortLabel: "04 · Bay View Ramp",
    title: "Bay View Waterfront & Slow-Mo Ramp Jump",
    locationBadge: "Bay View Dragonscale · Waterfront",
    startSec: 49.0,
    endSec: 61.0,
    baseSpeedMps: 5.4,
    surfaceType: "pavers",
    dotColor: "#4285F4",
    spawnX: 156.0,
    spawnZ: 58.82,
    spawnYaw: 0.0,
  },
  {
    id: "clip5",
    stateKey: "shoreline_finale",
    index: 4,
    shortLabel: "05 · Shoreline Finale",
    title: "Stevens Creek Bridge & Supercluster Boot",
    locationBadge: "Stevens Creek Bridge · Shoreline Sunset",
    startSec: 61.0,
    endSec: 72.0,
    baseSpeedMps: 4.8,
    surfaceType: "wood_planks",
    dotColor: "#4285F4",
    spawnX: 28.40,
    spawnZ: -135.98,
    spawnYaw: -0.4412,
  },
];

export const CHAPTER_PRESETS = CAMPUS_CLIPS;
export const CAMPUS_DISTRICTS = CAMPUS_CLIPS.map((c) => c.stateKey);

export const CAMERA_MODES = [
  { id: "cinema", demoId: "cam-cinema", label: "Director Cut" },
  { id: "chase", demoId: "cam-chase", label: "Chase Cam" },
  { id: "drivetrain", demoId: "cam-drivetrain", label: "Drivetrain X-Ray" },
  { id: "overhead", demoId: "cam-overhead", label: "Aerial Grid" },
  { id: "orbit", demoId: "cam-orbit", label: "Free Orbit" },
];

export const DEMO_ACTIONS = {
  SET_STATE: "SET_STATE",
  SET_TOUR_CLIP: "SET_STATE",
  SET_CAMERA: "SET_CAMERA",
  SET_CADENCE: "SET_CADENCE",
  RING_BELL: "RING_BELL",
  BUNNY_HOP: "BUNNY_HOP",
  COLLECT_TPU: "COLLECT_TPU",
  TRIGGER_BOOST: "TRIGGER_BOOST",
  GLASS_SHATTERED: "GLASS_SHATTERED",
  SET_FREE_ROAM: "SET_FREE_ROAM",
  TOGGLE_MINIMAP: "TOGGLE_MINIMAP",
  TOGGLE_OMNI_REF: "TOGGLE_OMNI_REF",
  TOGGLE_AUDIO: "TOGGLE_AUDIO",
  TOGGLE_AUTOPLAY: "TOGGLE_AUTOPLAY",
  TRIGGER_RESET: "TRIGGER_RESET",
  TICK_FRAME: "TICK_FRAME",
  TOGGLE_XRAY: "TOGGLE_XRAY",
  TOGGLE_NOOGLER_HAT: "TOGGLE_NOOGLER_HAT",
  SET_QUALITY: "SET_QUALITY",
  USER_ACTIVITY: "USER_ACTIVITY",
};

export const DEMO_EVENTS = {
  STATE_CHANGED: "demo:state_changed",
  CAMERA_CHANGED: "demo:camera_changed",
  CADENCE_CHANGED: "demo:cadence_changed",
  BELL_RUNG: "demo:bell_rung",
  BUNNY_HOPPED: "demo:bunny_hopped",
  TPU_COLLECTED: "demo:tpu_collected",
  BOOST_TRIGGERED: "demo:boost_triggered",
  GLASS_SHATTERED: "demo:glass_shattered",
  CLUSTER_BOOTED: "demo:cluster_booted",
  CLUSTER_ONLINE: "demo:cluster_booted",
  NOOGLER_HAT_TOGGLED: "NOOGLER_HAT_TOGGLED",
  FREE_ROAM_CHANGED: "demo:free_roam_changed",
  MINIMAP_TOGGLED: "demo:minimap_toggled",
  OMNI_REF_TOGGLED: "demo:omni_ref_toggled",
  AUDIO_TOGGLED: "demo:audio_toggled",
  AUTOPLAY_TOGGLED: "demo:autoplay_toggled",
  STATS_UPDATED: "demo:stats_updated",
  XRAY_TOGGLED: "demo:xray_toggled",
  QUALITY_CHANGED: "demo:quality_changed",
  AUTOTOUR_CHANGED: "demo:autotour_changed",
};

class DemoEventBus extends EventTarget {
  emit(eventName, detail = {}) {
    this.dispatchEvent(new CustomEvent(eventName, { detail }));
  }
}

export const bus = new DemoEventBus();

/**
 * Single-Store State Object (`state`).
 * `tpuLedger` tracks each of the 16 TPU wafers individually so `tpusCollected`, `clusterPowerPct`,
 * and `totalTflops` are ALWAYS derived via `Array.prototype.reduce()` (Single-Store Parity Law).
 */
export const state = {
  slug: "pelican-campus-quest",
  title: "Pelican Campus Quest — Mountain View Open World",
  archetype: 2,
  currentState: "play_all",   // 'play_all' | 'free_roam' | 'clip1'..'clip5'
  gameMode: "story_autopilot",// 'story_autopilot' | 'free_roam'
  activeClipId: "clip1",
  activeClipIndex: 0,
  activeDistrictName: "Gradient Canopy Gym",
  cameraMode: "cinema",       // 'cinema' | 'chase' | 'drivetrain' | 'overhead' | 'orbit'
  directorShotLabel: "",      // e.g. 'SLOW MOTION' during Bay View ramp jump, empty otherwise
  cadenceScale: 1.0,
  timeScale: 1.0,             // 1.0 normal; 0.35 during Slow-Motion Ramp Jump apex!
  hudHidden: false,
  minimapVisible: true,
  minimapExpanded: false,
  omniRefVisible: false,
  audioEnabled: false,
  isAutoplay: true,
  isAutoTourActive: true,
  xrayEnabled: false,
  qualityTier: "high",
  idleSec: 0.0,
  elapsedTime: 0.0,
  clipLocalTime: 0.0,
  sequenceTime: 0.0,
  frameCount: 0,
  fps: 60.0,
  // Open-World Hero Pose & Story Flags
  playerX: GYM_BREAKOUT_CONFIG.trainerX,
  playerY: 0.052,
  playerZ: GYM_BREAKOUT_CONFIG.trainerZ,
  playerHeadingYaw: GYM_BREAKOUT_CONFIG.trainerHeadingYaw,
  inGym: true,
  onTrainerStand: true,
  glassShattered: false,
  glassShatterTime: -10.0,
  isAirborne: false,
  inSlowMoJump: false,
  boostRemainingSec: 0.0,
  clusterOnline: false,
  nooglerCapUnlocked: true,
  wearNooglerHat: true,
  glassBracePhase: 0.0,
  postSmashShake: 0.0,
  beakClapPhase: 0.0,
  aeroCrouch: 0.0,
  wingFlare: 0.0,
  stanTrackPhase: 0.0,
  stanHeadWhipPhase: 0.0,
  stanRoarPhase: 0.0,
  stanRoarIntensity: 0.0,
  stanJawOpenNorm: 0.0,
  stanJawOpenDeg: 0.0,
  stanHeadYawRad: 0.0,
  stanHeadPitchRad: 0.0,
  stanCameraRumble: 0.0,
  pelicanSurprisePhase: 0.0,
  frontWheelHopM: 0.0,
  wheeliePitchRad: 0.0,
  pelicanCrestJoltRad: 0.0,
  pelicanGlanceBackYawRad: 0.0,
  pelicanStartledBeakOpen: 0.0,
  bellCount: 0,
  lastBellTime: -10.0,
  lastTpuPickupTime: -10.0,
  flamingosScattered: 0,
  bugdroidWaved: false,
  tpusCollected: 0,
  totalTpus: TPU_SPAWNS.length,
  tpuModelLabel: TPU_MODEL_LABEL,
  clusterPowerPct: 0,
  totalTflops: 0,
  speedKmh: 0.0,
  speedMph: 0,
  bikeVariant: DEFAULT_GBIKE_VARIANT,
  dofFocusDistM: 0.75,
  dofStrength: 0.92,
  coldOpenBeat: 1,
  turnLookaheadYaw: GYM_BREAKOUT_CONFIG.trainerHeadingYaw,
  turnLookaheadDeltaYaw: 0.0,
  gazeTargetWorld: { x: 0.0, y: 1.18, z: 136.0, targetType: "path_lookahead" },
  waymoCount: WAYMO_ROUTES.length,
  waymoPositions: WAYMO_ROUTES.map((w) => ({
    id: w.id,
    type: w.vehicleType,
    vehicleType: w.vehicleType,
    x: w.waypoints[0].x,
    z: w.waypoints[0].z,
    yaw: 0.0,
    kappa: 0.0,
    delta: 0.0,
    steerFL: 0.0,
    steerFR: 0.0,
    rollRad: 0.0,
    pitchRad: 0.0,
    wheelSpinRad: 0.0,
    wheelRad: 0.0,
    turnSignalLeft: false,
    turnSignalRight: false,
    blinkOn: false,
    speedMps: w.speedMps,
    speedScale: 1.0,
    yielding: false,
  })),
  tpuLedger: TPU_SPAWNS.map((t) => ({
    id: t.id,
    index: t.index,
    x: t.x,
    z: t.z,
    bonusHeightM: t.bonusHeightM,
    tier: t.tier,
    model: t.model || TPU_MODEL_LABEL,
    chipLabel: `${t.model || TPU_MODEL_LABEL} #${String(t.index + 1).padStart(2, "0")}`,
    district: t.district,
    tflops: t.tier === "ironwood_gold" ? 4614 : 1836,
    collected: false,
    collectedAtSec: -1,
  })),
  kinematics: {
    speedMps: 4.5,
    speedMph: 10.1,
    speedKmh: 16.2,
    cadenceRpm: 46.6,
    wheelRpm: 128.3,
    bankDeg: 0.0,
    steerDeg: 0.0,
    crankRad: 0.0,
    wheelRad: 0.0,
    gularDeflectionM: 0.0,
    arcDistanceM: 0.0,
    gearRatio: 2.75,
    chainSpeedMps: 0.0,
    pedalTorqueNm: 0.0,
    powerWatts: 0.0,
    slopePitchDeg: 0.0,
    bridgeArchElevationM: 0.0,
    suspensionCompressionMm: 0.0,
    verticalVelMps: 0.0,
    jumpHeightM: 0.0,
    cameraTrauma: 0.0,
    glassBracePhase: 0.0,
    postSmashShake: 0.0,
    beakClapPhase: 0.0,
    aeroCrouch: 0.0,
    wingFlare: 0.0,
    stanTrackPhase: 0.0,
    stanHeadWhipPhase: 0.0,
    stanRoarPhase: 0.0,
    stanRoarIntensity: 0.0,
    stanJawOpenNorm: 0.0,
    stanJawOpenDeg: 0.0,
    stanHeadYawRad: 0.0,
    stanHeadPitchRad: 0.0,
    stanCameraRumble: 0.0,
    pelicanSurprisePhase: 0.0,
    frontWheelHopM: 0.0,
    wheeliePitchRad: 0.0,
    pelicanCrestJoltRad: 0.0,
    pelicanGlanceBackYawRad: 0.0,
    pelicanStartledBeakOpen: 0.0,
    leftKneeAngleDeg: 0.0,
    rightKneeAngleDeg: 0.0,
    ikSoleErrorM: 0.0,
    hipLocal: { x: 0, y: 0, z: 0 },
    rightKneeLocal: { x: 0, y: 0, z: 0 },
    rightAnkleLocal: { x: 0, y: 0, z: 0 },
    rightPedalLocal: { x: 0, y: 0, z: 0 },
    dofFocusDistM: 0.75,
    dofStrength: 0.92,
    coldOpenBeat: 1,
    turnLookaheadYaw: GYM_BREAKOUT_CONFIG.trainerHeadingYaw,
    turnLookaheadDeltaYaw: 0.0,
    gazeTargetWorld: { x: 0.0, y: 1.18, z: 136.0, targetType: "path_lookahead" },
    audioRmsDb: -60.0,
    lyriaCutoffHz: 520.0,
  },
  segmentLedger: CAMPUS_CLIPS.map((c) => ({
    clipId: c.id,
    coveredSec: 0.0,
    durationSec: c.endSec - c.startSec,
    distanceM: 0.0,
  })),
};

/**
 * Single-store `Array.prototype.reduce()` derivation for TPU Cluster & Tour Telemetry (`sim-math-data-critic` parity law).
 */
export function deriveTourSummary(ledger = state.segmentLedger, kinematics = state.kinematics, tpuLedger = state.tpuLedger) {
  const totals = ledger.reduce(
    (acc, seg) => {
      acc.coveredSec += Math.min(seg.coveredSec, seg.durationSec);
      acc.totalSec += seg.durationSec;
      acc.totalDistanceM += seg.distanceM;
      if (seg.coveredSec >= seg.durationSec * 0.98) acc.completedClips += 1;
      return acc;
    },
    { coveredSec: 0, totalSec: 0, totalDistanceM: 0, completedClips: 0 }
  );

  const tpuStats = tpuLedger.reduce(
    (acc, item) => {
      acc.totalCount += 1;
      if (item.collected) {
        acc.collectedCount += 1;
        acc.totalTflops += item.tflops;
      }
      return acc;
    },
    { collectedCount: 0, totalCount: 0, totalTflops: 0 }
  );

  const clusterPowerPct =
    tpuStats.totalCount > 0 ? Math.round((tpuStats.collectedCount / tpuStats.totalCount) * 100) : 0;
  const rawSpeedKmh = state.onTrainerStand ? 0.0 : (Number(kinematics.speedMps) || 0) * 3.6;
  const speedKmh = rawSpeedKmh;
  const rawSpeedMph = state.onTrainerStand ? 0.0 : (Number(kinematics.speedMps) || 0) * 2.23693629;
  const speedMph = state.onTrainerStand ? 0 : Math.max(0, Math.round(rawSpeedMph));
  const gearRatio =
    Number.isFinite(kinematics.gearRatio) && kinematics.gearRatio > 0
      ? kinematics.gearRatio
      : BIKE_CONSTANTS.chainringTeeth / BIKE_CONSTANTS.rearCogTeeth;

  state.tpusCollected = tpuStats.collectedCount;
  state.totalTpus = tpuStats.totalCount;
  state.clusterPowerPct = clusterPowerPct;
  state.totalTflops = tpuStats.totalTflops;
  state.speedKmh = speedKmh;
  state.speedMph = speedMph;
  state.clusterOnline = tpuStats.collectedCount >= tpuStats.totalCount && tpuStats.totalCount > 0;
  // V8-05 State Lock: Pelican wears Noogler propeller cap 100% of the time across all modes!
  state.nooglerCapUnlocked = true;
  state.wearNooglerHat = true;

  return {
    tpusCollected: tpuStats.collectedCount,
    totalTpus: tpuStats.totalCount,
    clusterPowerPct,
    totalTflops: tpuStats.totalTflops,
    clusterOnline: state.clusterOnline,
    wearNooglerHat: true,
    speedKmh,
    speedMph,
    cadenceRpm: kinematics.cadenceRpm,
    bankDeg: kinematics.bankDeg,
    gearRatio,
    powerWatts: kinematics.powerWatts,
    pedalTorqueNm: kinematics.pedalTorqueNm,
    slopePitchDeg: kinematics.slopePitchDeg,
    ikSoleErrorMm: (Number(kinematics.ikSoleErrorM) || 0) * 1000,
    tourProgressPct: totals.totalSec > 0 ? Math.min(100, Math.max(0, (totals.coveredSec / totals.totalSec) * 100)) : 0,
    totalDistanceM: totals.totalDistanceM,
    totalDistanceFt: totals.totalDistanceM * 3.28084,
    completedClips: totals.completedClips,
  };
}

const STATE_ALIASES = {
  hero: "play_all",
  cinema: "play_all",
  director_cut: "play_all",
  play_all: "play_all",
  playall: "play_all",
  story: "play_all",
  story_mode: "play_all",
  autoplay: "play_all",
  autoplay_bot: "play_all",
  xray: "play_all",
  x_ray: "play_all",
  free_roam: "free_roam",
  freeroam: "free_roam",
  explore: "free_roam",
  roam: "free_roam",
  gym_breakout: "clip1",
  pinwheel_driveway: "clip1",
  clip1: "clip1",
  clip_1: "clip1",
  android_lawn: "clip2",
  clip2: "clip2",
  clip_2: "clip2",
  googleplex_trex: "clip3",
  stan_trex: "clip3",
  clip3: "clip3",
  clip_3: "clip3",
  bay_view_ramp: "clip4",
  bay_view_waterfront: "clip4",
  ramp_slowmo: "clip4",
  clip4: "clip4",
  clip_4: "clip4",
  shoreline_finale: "clip5",
  shoreline: "clip5",
  clip5: "clip5",
  clip_5: "clip5",
};

export function normalizeStateKey(raw) {
  if (!raw) return "play_all";
  const clean = String(raw).trim().toLowerCase().replace(/^state-/, "").replace(/-/g, "_");
  return STATE_ALIASES[clean] || "play_all";
}

function isXrayStateAlias(raw) {
  if (!raw) return false;
  const clean = String(raw).trim().toLowerCase().replace(/^state-/, "").replace(/-/g, "_");
  return clean === "xray" || clean === "x_ray";
}

export function isShortViewport() {
  if (typeof window === "undefined") return false;
  const h = Number(window.innerHeight) || 0;
  const w = Number(window.innerWidth) || 0;
  if (h <= 0) return false;
  return h < 860 || (w > 0 && w <= 1780 && h < 900);
}

export function parseInitialUrlFlags(search = typeof window !== "undefined" ? window.location.search : "") {
  const params = new URLSearchParams(search);
  const rawState = params.get("state") || "play_all";
  const stateIsXray = isXrayStateAlias(rawState);
  const initialState = stateIsXray ? "play_all" : normalizeStateKey(rawState);
  const xrayParam = (params.get("xray") || "").trim().toLowerCase();
  const xrayEnabled = stateIsXray || xrayParam === "1" || xrayParam === "true";

  const hudHidden = params.get("hud") === "0" || params.get("clean") === "1";
  const minimapVisible = params.get("map") !== "0";
  const rawOmniRef = params.get("omniRef") === "1";
  const omniRefVisible = rawOmniRef && !(xrayEnabled && isShortViewport());

  const camParam = params.get("cam");
  const defaultCam = stateIsXray
    ? "drivetrain"
    : initialState === "free_roam"
      ? "chase"
      : "cinema";
  const validCam = CAMERA_MODES.find((c) => c.id === camParam)?.id || defaultCam;

  const rawQuality = (params.get("quality") || "").trim().toLowerCase();
  const qualityTier = ["high", "medium", "low"].includes(rawQuality) ? rawQuality : "high";
  const audioEnabled = params.get("audio") === "1" || params.get("audioOnly") === "1";

  const rawBike = (params.get("bike") || "").trim().toLowerCase();
  const bikeVariant =
    rawBike === "classic" || rawBike === "classic_v6" || rawBike === "v6"
      ? "classic_v6"
      : rawBike === "priority" || rawBike === "priority_v9" || rawBike === "v9"
        ? "priority_v9"
        : DEFAULT_GBIKE_VARIANT;

  const skipLoader = params.get("skipLoader") === "1" || params.get("skipLoader") === "true";
  const forceLoader = params.get("forceLoader") === "1" || params.get("forceLoader") === "true";

  const tParam = params.get("t");
  const startOffsetSec =
    tParam !== null && !Number.isNaN(parseFloat(tParam)) ? Math.max(0, parseFloat(tParam)) : null;

  return {
    initialState,
    hudHidden,
    minimapVisible,
    omniRefVisible,
    xrayEnabled,
    qualityTier,
    audioEnabled,
    bikeVariant,
    skipLoader,
    forceLoader,
    cameraMode: validCam,
    startOffsetSec,
  };
}

export function dispatchAction(actionType, payload = {}) {
  switch (actionType) {
    case DEMO_ACTIONS.SET_STATE: {
      const rawTarget = payload.state ?? payload.clipId;
      const requestedXrayAlias = isXrayStateAlias(rawTarget);
      const normalized = normalizeStateKey(rawTarget);
      state.currentState = normalized;

      if (normalized === "free_roam") {
        state.gameMode = "free_roam";
        state.isAutoplay = false;
        state.isAutoTourActive = false;
        if (state.inGym) {
          state.inGym = false;
          state.onTrainerStand = false;
          state.glassShattered = true;
          state.playerX = 0.0;
          state.playerZ = 114.0;
          state.playerHeadingYaw = 0.0;
        }
        if (state.cameraMode === "cinema") {
          state.cameraMode = "chase";
          bus.emit(DEMO_EVENTS.CAMERA_CHANGED, { cameraMode: "chase" });
        }
        bus.emit(DEMO_EVENTS.FREE_ROAM_CHANGED, { freeRoam: true, source: payload.source || "ui" });
      } else if (normalized === "play_all") {
        state.gameMode = "story_autopilot";
        state.isAutoplay = true;
        state.isAutoTourActive = true;
        if (payload.resetTime !== false) {
          state.sequenceTime = 0.0;
          state.clipLocalTime = 0.0;
          state.activeClipIndex = 0;
          state.activeClipId = "clip1";
          state.inGym = true;
          state.onTrainerStand = true;
          state.glassShattered = false;
          state.playerX = GYM_BREAKOUT_CONFIG.trainerX;
          state.playerY = 0.052;
          state.playerZ = GYM_BREAKOUT_CONFIG.trainerZ;
          state.playerHeadingYaw = GYM_BREAKOUT_CONFIG.trainerHeadingYaw;
          state.glassBracePhase = 0.0;
          state.postSmashShake = 0.0;
          state.beakClapPhase = 0.0;
          state.aeroCrouch = 0.0;
          state.wingFlare = 0.0;
          state.nooglerCapUnlocked = true;
          state.wearNooglerHat = true;
          state.tpuLedger.forEach((item) => {
            item.collected = false;
            item.collectedAtSec = -1;
          });
          deriveTourSummary();
        }
        bus.emit(DEMO_EVENTS.FREE_ROAM_CHANGED, { freeRoam: false, source: payload.source || "ui" });
      } else {
        const idx = CAMPUS_CLIPS.findIndex((c) => c.id === normalized);
        if (idx >= 0) {
          const clip = CAMPUS_CLIPS[idx];
          state.activeClipIndex = idx;
          state.activeClipId = clip.id;
          state.clipLocalTime = 0.0;
          state.sequenceTime = clip.startSec;
          state.gameMode = "story_autopilot";
          state.isAutoplay = true;
          state.isAutoTourActive = true;
          state.inGym = idx === 0;
          state.onTrainerStand = idx === 0;
          state.glassShattered = idx > 0;
          state.playerX = clip.spawnX;
          if (idx === 0) state.playerY = 0.052;
          state.playerZ = clip.spawnZ;
          state.playerHeadingYaw = clip.spawnYaw;
          state.nooglerCapUnlocked = true;
          state.wearNooglerHat = true;
          // Mark prior-chapter TPUs collected when jumping straight to a chapter preset!
          const priorDistrictCount = idx === 0 ? 0 : idx === 1 ? 3 : idx === 2 ? 6 : idx === 3 ? 9 : 13;
          state.tpuLedger.forEach((item, tIdx) => {
            item.collected = tIdx < priorDistrictCount;
            item.collectedAtSec = item.collected ? 0 : -1;
          });
          deriveTourSummary();
        }
      }

      bus.emit(DEMO_EVENTS.STATE_CHANGED, {
        state: state.currentState,
        gameMode: state.gameMode,
        activeClipId: state.activeClipId,
        activeClipIndex: state.activeClipIndex,
        reset: Boolean(payload.reset),
        internalTransition: Boolean(payload.internalTransition),
      });

      if (requestedXrayAlias) {
        if (!state.xrayEnabled) {
          state.xrayEnabled = true;
          bus.emit(DEMO_EVENTS.XRAY_TOGGLED, { enabled: true });
        }
        const targetCam = payload.cameraMode || "drivetrain";
        if (state.cameraMode !== targetCam) {
          state.cameraMode = targetCam;
          bus.emit(DEMO_EVENTS.CAMERA_CHANGED, { cameraMode: state.cameraMode });
        }
      }
      break;
    }

    case DEMO_ACTIONS.SET_FREE_ROAM: {
      const enableRoam = payload.enabled !== undefined ? Boolean(payload.enabled) : state.gameMode !== "free_roam";
      state.gameMode = enableRoam ? "free_roam" : "story_autopilot";
      state.currentState = enableRoam ? "free_roam" : "play_all";
      state.isAutoplay = !enableRoam;
      state.isAutoTourActive = !enableRoam;
      state.idleSec = 0.0;
      if (enableRoam && state.cameraMode === "cinema") {
        state.cameraMode = "chase";
        bus.emit(DEMO_EVENTS.CAMERA_CHANGED, { cameraMode: "chase" });
      } else if (!enableRoam && state.cameraMode === "chase") {
        state.cameraMode = "cinema";
        bus.emit(DEMO_EVENTS.CAMERA_CHANGED, { cameraMode: "cinema" });
      }
      bus.emit(DEMO_EVENTS.FREE_ROAM_CHANGED, {
        freeRoam: enableRoam,
        source: payload.source || "user",
        teleport: Boolean(payload.teleport),
        x: payload.x,
        z: payload.z,
        yaw: payload.yaw,
      });
      bus.emit(DEMO_EVENTS.AUTOTOUR_CHANGED, {
        isAutoTourActive: state.isAutoTourActive,
        idleSec: state.idleSec,
      });
      break;
    }

    case DEMO_ACTIONS.COLLECT_TPU: {
      const idx = state.tpuLedger.findIndex((t) => t.id === payload.id || t.index === payload.index);
      if (idx >= 0 && !state.tpuLedger[idx].collected) {
        const wasOnline = state.clusterOnline;
        state.tpuLedger[idx].collected = true;
        state.tpuLedger[idx].collectedAtSec = state.elapsedTime;
        state.lastTpuPickupTime = state.elapsedTime;
        const summary = deriveTourSummary();
        bus.emit(DEMO_EVENTS.TPU_COLLECTED, {
          tpu: state.tpuLedger[idx],
          tpusCollected: summary.tpusCollected,
          totalTpus: summary.totalTpus,
          clusterPowerPct: summary.clusterPowerPct,
          totalTflops: summary.totalTflops,
        });
        if (!wasOnline && summary.clusterOnline) {
          state.nooglerCapUnlocked = true;
          delete state._manualNooglerHat;
          state.wearNooglerHat = true;
          bus.emit(DEMO_EVENTS.NOOGLER_HAT_TOGGLED, {
            wearNooglerHat: state.wearNooglerHat,
            enabled: state.wearNooglerHat,
            nooglerCapUnlocked: state.nooglerCapUnlocked,
            source: "cluster_online",
          });
          bus.emit(DEMO_EVENTS.CLUSTER_BOOTED, {
            totalTpus: summary.totalTpus,
            totalTflops: summary.totalTflops,
            wearNooglerHat: state.wearNooglerHat,
            time: state.elapsedTime,
          });
        }
      }
      break;
    }

    case DEMO_ACTIONS.TRIGGER_BOOST: {
      state.boostRemainingSec = Math.max(state.boostRemainingSec, Number(payload.durationSec) || 3.4);
      bus.emit(DEMO_EVENTS.BOOST_TRIGGERED, {
        padId: payload.padId || "mk",
        label: payload.label || "MK Espresso Boost",
        durationSec: state.boostRemainingSec,
      });
      break;
    }

    case DEMO_ACTIONS.GLASS_SHATTERED: {
      if (!state.glassShattered) {
        state.glassShattered = true;
        state.inGym = false;
        state.onTrainerStand = false;
        state.glassShatterTime = state.elapsedTime;
        bus.emit(DEMO_EVENTS.GLASS_SHATTERED, { time: state.elapsedTime });
      }
      break;
    }

    case DEMO_ACTIONS.BUNNY_HOP: {
      bus.emit(DEMO_EVENTS.BUNNY_HOPPED, {
        source: payload.source || "user",
        impulse: payload.impulse || 4.8,
        time: state.elapsedTime,
      });
      break;
    }

    case DEMO_ACTIONS.TOGGLE_MINIMAP: {
      state.minimapVisible =
        payload.visible !== undefined ? Boolean(payload.visible) : !state.minimapVisible;
      bus.emit(DEMO_EVENTS.MINIMAP_TOGGLED, { visible: state.minimapVisible });
      break;
    }

    case DEMO_ACTIONS.SET_CAMERA: {
      if (payload.cameraMode) {
        state.cameraMode = payload.cameraMode;
        bus.emit(DEMO_EVENTS.CAMERA_CHANGED, { cameraMode: state.cameraMode });
      }
      break;
    }

    case DEMO_ACTIONS.SET_CADENCE: {
      const next = Math.min(1.6, Math.max(0.5, Number(payload.cadenceScale) || 1.0));
      state.cadenceScale = next;
      bus.emit(DEMO_EVENTS.CADENCE_CHANGED, { cadenceScale: next });
      break;
    }

    case DEMO_ACTIONS.RING_BELL: {
      state.bellCount += 1;
      state.lastBellTime = state.elapsedTime;
      bus.emit(DEMO_EVENTS.BELL_RUNG, {
        bellCount: state.bellCount,
        time: state.elapsedTime,
        source: payload.source || "user",
      });
      break;
    }

    case DEMO_ACTIONS.TOGGLE_XRAY: {
      state.xrayEnabled =
        payload.enabled !== undefined ? Boolean(payload.enabled) : !state.xrayEnabled;
      bus.emit(DEMO_EVENTS.XRAY_TOGGLED, { enabled: state.xrayEnabled });
      break;
    }

    case DEMO_ACTIONS.TOGGLE_NOOGLER_HAT: {
      // V8-05 State Lock: Never reset wearNooglerHat to false anywhere!
      state.nooglerCapUnlocked = true;
      state.wearNooglerHat = true;
      state._manualNooglerHat = true;
      bus.emit(DEMO_EVENTS.NOOGLER_HAT_TOGGLED, {
        wearNooglerHat: true,
        enabled: true,
        nooglerCapUnlocked: true,
        source: payload.source || "user",
      });
      break;
    }

    case DEMO_ACTIONS.TOGGLE_OMNI_REF: {
      state.omniRefVisible =
        payload.visible !== undefined ? Boolean(payload.visible) : !state.omniRefVisible;
      bus.emit(DEMO_EVENTS.OMNI_REF_TOGGLED, { visible: state.omniRefVisible });
      break;
    }

    case DEMO_ACTIONS.SET_QUALITY: {
      const rawTier = String(payload.qualityTier || "high").toLowerCase();
      const validTier = ["high", "medium", "low"].includes(rawTier) ? rawTier : "high";
      const lockedHigh =
        typeof window !== "undefined" && Boolean(window.__externalClock) && !payload.forceExternal;
      state.qualityTier = lockedHigh ? "high" : validTier;
      bus.emit(DEMO_EVENTS.QUALITY_CHANGED, { qualityTier: state.qualityTier });
      break;
    }

    case DEMO_ACTIONS.USER_ACTIVITY: {
      if (payload.resumeAutoTour === true) {
        state.idleSec = 0.0;
        state.isAutoTourActive = true;
        state.isAutoplay = true;
        state.gameMode = "story_autopilot";
      } else {
        state.idleSec = 0.0;
        state.isAutoTourActive = false;
      }
      bus.emit(DEMO_EVENTS.AUTOTOUR_CHANGED, {
        isAutoTourActive: state.isAutoTourActive,
        idleSec: state.idleSec,
        source: payload.source || "user",
      });
      break;
    }

    case DEMO_ACTIONS.TOGGLE_AUDIO: {
      state.audioEnabled =
        payload.enabled !== undefined ? Boolean(payload.enabled) : !state.audioEnabled;
      bus.emit(DEMO_EVENTS.AUDIO_TOGGLED, { enabled: state.audioEnabled });
      break;
    }

    case DEMO_ACTIONS.TOGGLE_AUTOPLAY: {
      const nextAuto = payload.isAutoplay !== undefined ? Boolean(payload.isAutoplay) : !state.isAutoplay;
      state.isAutoplay = nextAuto;
      state.isAutoTourActive = nextAuto;
      state.gameMode = nextAuto ? "story_autopilot" : "free_roam";
      state.currentState = nextAuto ? "play_all" : "free_roam";
      bus.emit(DEMO_EVENTS.AUTOPLAY_TOGGLED, { isAutoplay: state.isAutoplay, gameMode: state.gameMode });
      bus.emit(DEMO_EVENTS.FREE_ROAM_CHANGED, { freeRoam: !nextAuto, source: payload.source || "ui" });
      break;
    }

    case DEMO_ACTIONS.TRIGGER_RESET: {
      const wasXray = Boolean(state.xrayEnabled);
      const prevCam = state.cameraMode;
      state.elapsedTime = 0.0;
      state.sequenceTime = 0.0;
      state.clipLocalTime = 0.0;
      state.frameCount = 0;
      state.cadenceScale = 1.0;
      state.timeScale = 1.0;
      state.bellCount = 0;
      state.lastBellTime = -10.0;
      state.lastTpuPickupTime = -10.0;
      state.idleSec = 0.0;
      state.isAutoTourActive = true;
      state.isAutoplay = true;
      state.gameMode = "story_autopilot";
      state.currentState = "play_all";
      state.cameraMode = "cinema";
      state.xrayEnabled = false;
      state.minimapExpanded = false;
      state.inGym = true;
      state.onTrainerStand = true;
      state.glassShattered = false;
      state.glassShatterTime = -10.0;
      state.boostRemainingSec = 0.0;
      state.inSlowMoJump = false;
      state.directorShotLabel = "";
      state.nooglerCapUnlocked = true;
      state.wearNooglerHat = true;
      delete state._manualNooglerHat;
      state.glassBracePhase = 0.0;
      state.postSmashShake = 0.0;
      state.beakClapPhase = 0.0;
      state.aeroCrouch = 0.0;
      state.wingFlare = 0.0;
      state.stanTrackPhase = 0.0;
      state.stanHeadWhipPhase = 0.0;
      state.stanRoarPhase = 0.0;
      state.stanRoarIntensity = 0.0;
      state.stanJawOpenNorm = 0.0;
      state.stanJawOpenDeg = 0.0;
      state.stanHeadYawRad = 0.0;
      state.stanHeadPitchRad = 0.0;
      state.stanCameraRumble = 0.0;
      state.pelicanSurprisePhase = 0.0;
      state.frontWheelHopM = 0.0;
      state.wheeliePitchRad = 0.0;
      state.pelicanCrestJoltRad = 0.0;
      state.pelicanGlanceBackYawRad = 0.0;
      state.pelicanStartledBeakOpen = 0.0;
      state.kinematics.glassBracePhase = 0.0;
      state.kinematics.postSmashShake = 0.0;
      state.kinematics.beakClapPhase = 0.0;
      state.kinematics.aeroCrouch = 0.0;
      state.kinematics.wingFlare = 0.0;
      state.kinematics.stanTrackPhase = 0.0;
      state.kinematics.stanHeadWhipPhase = 0.0;
      state.kinematics.stanRoarPhase = 0.0;
      state.kinematics.stanRoarIntensity = 0.0;
      state.kinematics.stanJawOpenNorm = 0.0;
      state.kinematics.stanJawOpenDeg = 0.0;
      state.kinematics.stanHeadYawRad = 0.0;
      state.kinematics.stanHeadPitchRad = 0.0;
      state.kinematics.stanCameraRumble = 0.0;
      state.kinematics.pelicanSurprisePhase = 0.0;
      state.kinematics.frontWheelHopM = 0.0;
      state.kinematics.wheeliePitchRad = 0.0;
      state.kinematics.pelicanCrestJoltRad = 0.0;
      state.kinematics.pelicanGlanceBackYawRad = 0.0;
      state.kinematics.pelicanStartledBeakOpen = 0.0;
      state.dofFocusDistM = 0.75;
      state.dofStrength = 0.92;
      state.coldOpenBeat = 1;
      state.turnLookaheadYaw = GYM_BREAKOUT_CONFIG.trainerHeadingYaw;
      state.turnLookaheadDeltaYaw = 0.0;
      state.gazeTargetWorld = { x: 0.0, y: 1.18, z: 136.0, targetType: "path_lookahead" };
      state.kinematics.dofFocusDistM = 0.75;
      state.kinematics.dofStrength = 0.92;
      state.kinematics.coldOpenBeat = 1;
      state.kinematics.turnLookaheadYaw = GYM_BREAKOUT_CONFIG.trainerHeadingYaw;
      state.kinematics.turnLookaheadDeltaYaw = 0.0;
      state.kinematics.gazeTargetWorld = state.gazeTargetWorld;
      state.kinematics.lyriaCutoffHz = 520.0;
      state.playerX = GYM_BREAKOUT_CONFIG.trainerX;
      state.playerY = 0.052;
      state.playerZ = GYM_BREAKOUT_CONFIG.trainerZ;
      state.playerHeadingYaw = GYM_BREAKOUT_CONFIG.trainerHeadingYaw;
      state.tpuLedger.forEach((t) => {
        t.collected = false;
        t.collectedAtSec = -1;
      });
      state.segmentLedger.forEach((seg) => {
        seg.coveredSec = 0.0;
        seg.distanceM = 0.0;
      });
      const summary = deriveTourSummary();
      if (wasXray) {
        bus.emit(DEMO_EVENTS.XRAY_TOGGLED, { enabled: false });
      }
      if (prevCam !== "cinema") {
        bus.emit(DEMO_EVENTS.CAMERA_CHANGED, { cameraMode: "cinema" });
      }
      bus.emit(DEMO_EVENTS.CADENCE_CHANGED, { cadenceScale: 1.0 });
      bus.emit(DEMO_EVENTS.AUTOTOUR_CHANGED, { isAutoTourActive: true, idleSec: 0.0 });
      bus.emit(DEMO_EVENTS.STATE_CHANGED, {
        state: "play_all",
        gameMode: "story_autopilot",
        activeClipId: "clip1",
        activeClipIndex: 0,
        reset: true,
        summary,
      });
      break;
    }

    case DEMO_ACTIONS.TICK_FRAME: {
      const dt = payload.dt ?? 1 / 60;
      state.frameCount += 1;
      state.elapsedTime += dt;
      if (payload.fps) state.fps = payload.fps;
      if (payload.kinematics) {
        Object.assign(state.kinematics, payload.kinematics);
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
      break;
    }

    default:
      console.warn("[DemoContract] Unknown action:", actionType);
  }
}

export const dispatch = dispatchAction;

if (typeof window !== "undefined") {
  try {
    const bootFlags = parseInitialUrlFlags(window.location.search || "");
    state.currentState = bootFlags.initialState;
    state.gameMode = bootFlags.initialState === "free_roam" ? "free_roam" : "story_autopilot";
    state.isAutoplay = state.gameMode === "story_autopilot";
    state.isAutoTourActive = state.isAutoplay;
    state.cameraMode = bootFlags.cameraMode;
    state.xrayEnabled = Boolean(bootFlags.xrayEnabled);
    state.minimapVisible = Boolean(bootFlags.minimapVisible);
    state.omniRefVisible = Boolean(bootFlags.omniRefVisible);
    state.hudHidden = Boolean(bootFlags.hudHidden);
    state.bikeVariant = bootFlags.bikeVariant || DEFAULT_GBIKE_VARIANT;
    state.qualityTier = window.__virtualClock ? "high" : bootFlags.qualityTier;
    if (bootFlags.initialState !== "play_all") {
      dispatchAction(DEMO_ACTIONS.SET_STATE, { state: bootFlags.initialState });
    } else {
      deriveTourSummary();
    }
  } catch (_) {}

  window.DEMO_BUS = bus;
  window.DEMO_STATE = state;
  window.__demoState = state;
  window.DEFAULT_GBIKE_VARIANT = DEFAULT_GBIKE_VARIANT;
  window.CAMPUS_CLIPS = CAMPUS_CLIPS;
  window.CAMERA_MODES = CAMERA_MODES;
  window.TPU_SPAWNS = TPU_SPAWNS;
  window.TPU_MODEL_LABEL = TPU_MODEL_LABEL;
  window.WAYMO_KINEMATICS_SPEC = WAYMO_KINEMATICS_SPEC;
  window.TPU_PICKUP_RADIUS_M = TPU_PICKUP_RADIUS_M;
  window.CAMPUS_ROADS = CAMPUS_ROADS;
  window.CAMPUS_LANDMARKS = CAMPUS_LANDMARKS;
  window.dispatchDemoAction = dispatchAction;
  window.deriveTourSummary = deriveTourSummary;
}
