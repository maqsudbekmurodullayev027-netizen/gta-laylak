import * as THREE from "../vendor/three.module.js";

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;

function smooth01(x) {
  const t = clamp(x || 0, 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Pure deterministic pose evaluator for Pelican V2 (`pelican_motion_poses.js`).
 *
 * Character-frame axis convention (`PelicanRoot` / `GBikeRig.leanGroup`):
 *   +X = Character Right
 *   +Y = Up
 *   -Z = Forward (toward handlebars & front TPU basket)
 *
 * Right-hand rule around +X:
 *   - Negative `rx` (`rx < 0`) pitches an upward (+Y) spine/neck bone FORWARD toward -Z,
 *     and pitches a forward (-Z) beak/jaw DOWNWARD.
 *   - Positive `rx` (`rx > 0`) pitches an upward (+Y) bone BACKWARD/UPWARD (S-curve recovery).
 */
export function evaluatePelicanMotionPose({
  simTime = 0,
  crankRad = 0,
  omegaCrank = 0,
  steerRad = 0,
  bankRad = 0,
  speedMps = 0,
  deckBounceM = 0,
  suspensionCompressionMm = 0,
  gularY = 0,
  bellStrikeElapsed = 99,
  friendlyNod = 0,
  glassBracePhase = 0,
  postSmashShake = 0,
  wingFlare = 0,
  aeroCrouch = 0,
  beakClapPhase = 0,
  wearNooglerHat = false,
  gazeYawRad = null,
  gazePitchRad = 0,
  blinkClosureOverride = null,
  celebrationBlend = 0,
}) {
  const brace = smooth01(glassBracePhase);
  const shake = clamp(postSmashShake || 0, 0, 1);
  const cel = smooth01(celebrationBlend);
  const flare = Math.max(smooth01(wingFlare), cel);
  // Suppress sprint crouch when full glass-brace tuck is active so angles never over-stack
  const crouch = smooth01(aeroCrouch) * (1 - brace * 0.85);
  const clap = clamp(beakClapPhase || 0, 0, 1);
  const hasExplicitGaze = gazeYawRad !== null && gazeYawRad !== undefined && Number.isFinite(Number(gazeYawRad));
  const effGazeYaw = hasExplicitGaze
    ? clamp(Number(gazeYawRad), -0.92, 0.92)
    : clamp(steerRad * 0.80, -0.58, 0.58) * (1 - brace * 0.85);
  const effGazePitch = clamp(Number(gazePitchRad) || 0, -0.30, 0.28) * (1 - brace * 0.85);

  const pedalingBlend = clamp(Math.abs(omegaCrank) / 3.0, 0, 1);
  const suspM = clamp((suspensionCompressionMm || 0) * 0.001, 0, 0.006);

  // 1. Pelvis & Torso Breathing / Pedaling Counter-Rock / Tuck Poise
  const cadenceBobY = 0.005 * Math.cos(2.0 * crankRad) * pedalingBlend;
  const idleBreathWave = Math.sin(simTime * 2.15);
  const breathScaleXZ = 1.0 + (0.016 + 0.008 * crouch) * idleBreathWave;

  const hipOffsetY =
    cadenceBobY +
    0.004 * idleBreathWave * (1 - pedalingBlend * 0.5) +
    deckBounceM -
    suspM +
    0.004 * brace +
    0.002 * crouch +
    0.016 * flare;
  const hipOffsetZ = +0.018 * brace - 0.006 * crouch;

  const pelvisRoll = 0.040 * Math.sin(crankRad) * pedalingBlend * (1 - brace * 0.65);
  const pelvisYaw = -0.028 * Math.cos(crankRad) * pedalingBlend * (1 - brace * 0.65);
  const pelvisPitch =
    0.018 * Math.sin(2.0 * crankRad) * pedalingBlend -
    0.08 * brace -
    0.05 * crouch -
    0.04 * flare;

  // 2. Chest Pitch:
  // During `glassBracePhase`, Chest pitches forward (`rx = -0.34`),
  // driving the 4-bone S-neck forward while the crown leads and beak ducks down behind the stem.
  // During `celebrationBlend`, Chest puffs proudly upward (`+0.11`) with a graceful `0.90 Hz` strut shimmy!
  const celWavePhase = simTime * (Math.PI * 2.0 * 0.90);
  const chestPitch =
    -0.34 * brace -
    0.22 * crouch -
    0.10 * flare * (1 - cel) +
    0.11 * cel +
    0.055 * shake +
    0.012 * idleBreathWave;
  const chestYaw = effGazeYaw * 0.10 * (1 - brace * 0.7) * (1 - cel);
  const chestRoll = bankRad * 0.10 * (1 - brace * 0.7) + 0.013 * Math.sin(celWavePhase) * cel;

  // 3. 4-Bone Avian S-Neck (`Neck_01` -> `Neck_02` -> `Neck_03` -> `Neck_04`):
  //   - Cruise: gyro horizon roll stabilization (`bankRad` counter-roll) + cadence wave + 0.30s gaze anticipation
  //   - Glass-Brace Tuck: S-neck curls forward-and-downward so the cap crown leads forward
  //     and the head & beak duck steeply downward (`~-42°`) tucked safely behind the handlebars/stem!
  //   - Post-Smash Shake: proud rise + crisp 2-cycle avian head-shake (`shakeOsc`)
  const gyroRoll = (bankRad * 0.36 - pelvisRoll * 0.72) * (1 - brace * 0.75);
  const cadenceNeckWave = 0.028 * Math.sin(2.0 * crankRad - 0.45) * pedalingBlend * (1 - brace);
  const shakeFreqPhase = simTime * 22.0;
  const shakeOscRoll = Math.sin(shakeFreqPhase) * shake;
  const shakeOscYaw = Math.cos(shakeFreqPhase * 0.85) * shake;

  const neck01 = {
    rx: -0.26 * brace - 0.16 * crouch - 0.06 * flare + 0.04 * shake + cadenceNeckWave * 0.45,
    ry: effGazeYaw * 0.10 + 0.04 * shakeOscYaw,
    rz: gyroRoll * 0.35 + 0.05 * shakeOscRoll,
  };
  const neck02 = {
    rx: -0.24 * brace - 0.12 * crouch - 0.04 * flare + 0.04 * shake + cadenceNeckWave * 0.35 + effGazePitch * 0.10,
    ry: effGazeYaw * 0.14 + 0.06 * shakeOscYaw,
    rz: gyroRoll * 0.30 + 0.07 * shakeOscRoll,
  };
  const neck03 = {
    rx: -0.18 * brace + 0.14 * crouch + 0.06 * flare + 0.03 * shake + cadenceNeckWave * 0.15 + effGazePitch * 0.18,
    ry: effGazeYaw * 0.18 + 0.10 * shakeOscYaw,
    rz: gyroRoll * 0.20 + 0.11 * shakeOscRoll,
  };
  const neck04 = {
    rx: -0.08 * brace + 0.16 * crouch + 0.08 * flare + 0.02 * shake + effGazePitch * 0.26,
    ry: effGazeYaw * 0.22 + 0.14 * shakeOscYaw,
    rz: gyroRoll * 0.15 + 0.14 * shakeOscRoll,
  };

  // 4. Head Poise, Visor Shield Pitch, Bell Perk, 0.30s Gaze Anticipation & Post-Smash Avian Shake
  const bellPerk =
    bellStrikeElapsed >= 0 && bellStrikeElapsed < 0.9
      ? Math.exp(-bellStrikeElapsed * 4.5) * Math.sin(bellStrikeElapsed * 14.0) * 0.085
      : 0;

  // Net world head pitch during full brace = (-0.08 - 0.34 - 0.26 - 0.24 - 0.18 - 0.08 + 0.60) = -0.58 rad (~-45° downward beak duck!)
  const head = {
    rx:
      +0.60 * brace +
      0.18 * crouch +
      0.08 * flare -
      0.024 * Math.cos(2.0 * crankRad) * pedalingBlend * (1 - brace) +
      bellPerk * (1 - brace) +
      friendlyNod * 0.14 * (1 - brace) +
      0.05 * shake +
      effGazePitch * 0.46,
    ry:
      effGazeYaw * 0.36 +
      (-pelvisYaw * 0.75 + friendlyNod * 0.18) * (1 - brace * 0.85) +
      0.22 * shakeOscYaw,
    rz: 0.26 * shakeOscRoll + (bankRad * 0.08 - effGazeYaw * 0.06) * (1 - brace),
  };

  // 5. Lower Mandible (`JawPouch`) & Eyelid Blink / Protective Glass-Brace Squint
  const bellChuckle =
    bellStrikeElapsed >= 0 && bellStrikeElapsed < 0.55
      ? -0.055 * Math.sin((bellStrikeElapsed / 0.55) * Math.PI)
      : 0;
  const clapWave =
    clap > 0.001
      ? -0.155 * (0.35 + 0.65 * Math.abs(Math.sin(simTime * 10.5))) * clap
      : 0;
  const celGrinClap =
    cel > 0.001
      ? -0.155 * (0.68 + 0.32 * Math.abs(Math.sin(simTime * 3.4))) * cel
      : 0;
  // Clamp lower mandible tightly sealed (`jawPitch = 0`) throughout `glassBracePhase`!
  const rawJawPitch =
    Math.min(clamp(gularY * 0.85, -0.018, 0.0) + bellChuckle + clapWave, celGrinClap);
  const jawPitch = rawJawPitch * (1 - smooth01(brace * 1.35));
  const jawRoll = -bankRad * 0.032 * (1 - brace);

  let eyelidClosure = 0;
  if (blinkClosureOverride !== null && blinkClosureOverride !== undefined && Number.isFinite(Number(blinkClosureOverride))) {
    eyelidClosure = clamp(Math.max(Number(blinkClosureOverride), 0.24 * cel), 0, 0.96);
  } else {
    const blinkCycle = ((simTime % 4.2) + 4.2) % 4.2;
    let periodicBlink = 0;
    if (blinkCycle > 3.92 && blinkCycle < 4.07) {
      periodicBlink = Math.sin(((blinkCycle - 3.92) / 0.15) * Math.PI);
    }
    const squintTarget = Math.max(brace * 0.88, crouch * 0.34, shake * 0.22, cel * 0.24);
    eyelidClosure = clamp(Math.max(periodicBlink, squintTarget), 0, 0.96);
  }

  // 6. Tail Fan & Polka-Dot Scarf Headwind Wave
  const tail = {
    rx:
      0.060 * Math.sin(2.0 * crankRad - 0.6) * pedalingBlend +
      0.16 * brace +
      0.10 * crouch -
      0.14 * flare * (1 - cel) -
      0.36 * cel,
    ry: -effGazeYaw * 0.14 * (1 - cel) + 0.03 * Math.sin(celWavePhase) * cel,
    rz: -pelvisRoll * 0.5,
  };

  const effectiveWindMps = Math.max(speedMps + flare * 3.5 + crouch * 2.0, cel * 6.4);
  const windFreq = 8.5 + effectiveWindMps * 1.45;
  const scarfLift = Math.min(0.32, effectiveWindMps * 0.038) + brace * 0.12;
  const scarfWaveAmp = 0.042 + Math.min(0.085, effectiveWindMps * 0.012);

  // 7. Cambered Multi-Jointed Avian Gull-Wing Arch & Expressive Flap Stroke (`flare > 0`)
  const flapPhase = simTime * 5.2;
  const flapSin = Math.sin(flapPhase);
  const flapCos = Math.cos(flapPhase);
  const soarBeatY = 0.056 * flapSin * flare;
  const soarSweepZ = 0.026 * flapCos * flare;
  const primaryDihedralRad = (-0.08 - 0.10 * Math.cos(flapPhase - 0.35)) * flare;
  const primarySweepRad = (0.06 + 0.04 * flapSin) * flare;

  // Elbow bend hint:
  //   - Riding (`flare = 0`): snug ribcage-hugging avian fold (`rideHintX = -0.13` inward, `rideHintY = -0.26`, `rideHintZ = 0.30`)
  //     so folded elbows sit flush against the `0.178m` flank (`0` 45° hang-glider splay from Front or Rear!)!
  //   - Soaring / Startle (`flare > 0`): graceful elevated gull-wing arch (`soarHintY = +0.24`, `z = +0.04`,
  //     `elbowAngle ~ 130°–144°`) bridging humerus -> forearm -> primaries with zero V-notch and zero T-pose!
  const rideHintX = lerp(-0.13, -0.16, brace);
  const rideHintY = lerp(-0.26, -0.38, brace);
  const rideHintZ = lerp(0.30, 0.28, brace);
  const soarHintY = 0.24 + 0.05 * flapSin;
  const leftElbowHint = {
    x: lerp(-rideHintX, -0.26, flare),
    y: lerp(rideHintY, soarHintY, flare),
    z: lerp(rideHintZ, 0.04, flare),
  };
  const rightElbowHint = {
    x: lerp(rideHintX, 0.26, flare),
    y: lerp(rideHintY, soarHintY, flare),
    z: lerp(rideHintZ, 0.04, flare),
  };

  // 8. Google Noogler Propeller Hat Angular Velocity (`rad/s`)
  const propellerOmega = wearNooglerHat
    ? 6.5 + Math.max(0, effectiveWindMps) * 3.8 + clap * 9.5 + flare * 5.0
    : 0;

  return {
    brace,
    shake,
    flare,
    crouch,
    clap,
    hipOffsetY,
    hipOffsetZ,
    breathScaleXZ,
    pelvis: { rx: pelvisPitch, ry: pelvisYaw, rz: pelvisRoll },
    chest: { rx: chestPitch, ry: chestYaw, rz: chestRoll },
    neck: [neck01, neck02, neck03, neck04],
    head,
    jaw: { rx: jawPitch, rz: jawRoll },
    tail,
    eyelidClosure,
    eyelidScaleY: 0.12 + 0.90 * eyelidClosure,
    windFreq,
    scarfLift,
    scarfWaveAmp,
    wingSoar: {
      blend: flare,
      beatY: soarBeatY,
      sweepZ: soarSweepZ,
      primaryDihedralRad,
      primarySweepRad,
      leftElbowHint,
      rightElbowHint,
    },
    propellerOmega,
    wearNooglerHat: Boolean(wearNooglerHat),
  };
}
