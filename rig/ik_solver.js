/**
 * ik_solver.js — Watertight Analytical 2-Bone IK Bridge, Tapered Limb Orientation & Seeded PRNG.
 * Delegates closed-form `+alpha` math directly to `src/rig/kin.js` (Single-Source Parity Law).
 */

import * as THREE from "../vendor/three.module.js";
import { solveTwoBoneAvianIK } from "./kin.js";

const UP_AXIS = new THREE.Vector3(0, 1, 0);
const _lowerVec = new THREE.Vector3();
const _lowerDir = new THREE.Vector3();
const _midPoint = new THREE.Vector3();

/**
 * Deterministic mulberry32 PRNG factory (100% seeded, zero unseeded randomness).
 */
export function createSeededRNG(seed = 0xdec0de) {
  let a = seed >>> 0;
  return function nextRandom() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

if (typeof window !== "undefined" && !window.__createSeededRNG) {
  window.__createSeededRNG = createSeededRNG;
}

/**
 * Analytical 2-bone IK solver wrapping pure-math `solveTwoBoneAvianIK` from `./kin.js`.
 */
export function solveTwoBoneIK(rootPos, targetPos, L1, L2, bendHint, out = null) {
  const res = out || {
    rootPos: new THREE.Vector3(),
    jointPos: new THREE.Vector3(),
    endPos: new THREE.Vector3(),
    upperDir: new THREE.Vector3(),
    lowerDir: new THREE.Vector3(),
    upperLen: L1,
    lowerLen: L2,
    rawDist: 0,
    clampedDist: 0,
    reachRatio: 0,
    kneeAngleDeg: 0,
    gapError: 0,
    targetErrorM: 0,
    clamped: false,
  };

  const pure = solveTwoBoneAvianIK(rootPos, targetPos, L1, L2, bendHint);

  res.rootPos.set(pure.rootPos.x, pure.rootPos.y, pure.rootPos.z);
  res.jointPos.set(pure.jointPos.x, pure.jointPos.y, pure.jointPos.z);
  res.endPos.set(pure.endPos.x, pure.endPos.y, pure.endPos.z);
  res.upperDir.set(pure.upperDir.x, pure.upperDir.y, pure.upperDir.z);
  res.lowerDir.set(pure.lowerDir.x, pure.lowerDir.y, pure.lowerDir.z);
  res.upperLen = pure.upperLen;
  res.lowerLen = pure.lowerLen;
  res.rawDist = pure.rawDist;
  res.clampedDist = pure.clampedDist;
  res.reachRatio = pure.reachRatio;
  res.kneeAngleDeg = pure.kneeAngleDeg;
  res.gapError = Math.max(pure.jointGapErrorM, pure.targetErrorM);
  res.targetErrorM = pure.targetErrorM;
  res.clamped = pure.clamped;

  return res;
}

/**
 * Orients a midpoint-centered limb (`[-restLen/2, +restLen/2]` along +Y) from `startPos` to `endPos`.
 */
export function orientTaperedLimb(mesh, startPos, endPos, restLen) {
  _lowerVec.subVectors(endPos, startPos);
  const dist = _lowerVec.length();
  _midPoint.addVectors(startPos, endPos).multiplyScalar(0.5);
  mesh.position.copy(_midPoint);
  if (dist > 1e-6) {
    _lowerDir.copy(_lowerVec).multiplyScalar(1 / dist);
    mesh.quaternion.setFromUnitVectors(UP_AXIS, _lowerDir);
    mesh.scale.set(1, dist / restLen, 1);
  }
}

/**
 * Orients a proximal-socket-origin limb (`[0, +restLen]` along +Y, matching Blender GLB limb pivots)
 * from `startPos` to `endPos` with `0.000m` endpoint error.
 */
export function orientOriginBoneSegment(group, startPos, endPos, restLen) {
  _lowerVec.subVectors(endPos, startPos);
  const dist = _lowerVec.length();
  group.position.copy(startPos);
  if (dist > 1e-6) {
    _lowerDir.copy(_lowerVec).multiplyScalar(1 / dist);
    group.quaternion.setFromUnitVectors(UP_AXIS, _lowerDir);
    group.scale.set(1, dist / restLen, 1);
  }
}
