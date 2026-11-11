import * as THREE from "../vendor/three.module.js";

function sstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / Math.max(1e-6, e1 - e0)));
  return t * t * (3 - 2 * t);
}

function segDistSq(px, py, pz, ax, ay, az, bx, by, bz) {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const lenSq = abx * abx + aby * aby + abz * abz;
  const t =
    lenSq > 1e-8
      ? Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / lenSq))
      : 0;
  const dx = px - (ax + abx * t);
  const dy = py - (ay + aby * t);
  const dz = pz - (az + abz * t);
  return dx * dx + dy * dy + dz * dz;
}

// Armature-space rest bone segments `(name, ax, ay, az, bx, by, bz, sigma)` matching `pelican_hero_v2_meta.json`
const SPINE_SEGMENTS = [
  ["Tail", 0.0, 0.020, 0.160, 0.0, 0.095, 0.370, 0.095],
  ["Pelvis", 0.0, 0.000, 0.000, 0.0, 0.085, -0.045, 0.098],
  ["Chest", 0.0, 0.085, -0.045, 0.0, 0.178, -0.165, 0.095],
  ["Neck_01", 0.0, 0.178, -0.165, 0.0, 0.270, -0.118, 0.068],
  ["Neck_02", 0.0, 0.270, -0.118, 0.0, 0.358, -0.100, 0.068],
  ["Neck_03", 0.0, 0.358, -0.100, 0.0, 0.442, -0.132, 0.068],
  ["Neck_04", 0.0, 0.442, -0.132, 0.0, 0.512, -0.171, 0.068],
  ["Head", 0.0, 0.512, -0.171, 0.0, 0.534, -0.265, 0.072],
];

/**
 * Ensures `Pelican_Body_Skinned` has C2-smooth multi-bone weights across all 16 armature bones.
 * Note: glTF flips texture V relative to Blender (`vb = 1.0 - uv.y`).
 */
export function ensureSmoothAvianSkinWeights(skinnedMesh) {
  const geom = skinnedMesh?.geometry;
  const bones = skinnedMesh?.skeleton?.bones;
  if (!geom || !bones || bones.length === 0) return;

  const pos = geom.attributes.position;
  const uv = geom.attributes.uv;
  if (!pos) return;

  const boneIdx = {};
  for (let i = 0; i < bones.length; i++) {
    boneIdx[bones[i].name] = i;
  }
  const headJoint = boneIdx.Head;
  if (headJoint === undefined) return;

  // Preserve distributed multi-bone weights from V3/V2 GLB while guaranteeing 100.0% rigid
  // `Head` lock on the upper cranium dome (`0.000mm` skull-to-cap drift under `crownSocket`)!
  const existingIdx = geom.attributes.skinIndex;
  const existingWgt = geom.attributes.skinWeight;
  if (existingIdx && existingWgt) {
    let headSum = 0;
    for (let i = 0; i < pos.count; i++) {
      for (let c = 0; c < 4; c++) {
        if (existingIdx.getComponent(i, c) === headJoint) {
          headSum += existingWgt.getComponent(i, c);
        }
      }
    }
    if (headSum > 5.0) {
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        if (y >= 0.518 && z <= -0.132 && z >= -0.260 && Math.abs(x) <= 0.058) {
          existingIdx.setXYZW(i, headJoint, 0, 0, 0);
          existingWgt.setXYZW(i, 1.0, 0.0, 0.0, 0.0);
        }
      }
      existingIdx.needsUpdate = true;
      existingWgt.needsUpdate = true;
      return;
    }
  }

  const count = pos.count;
  const idxArr = new Uint16Array(count * 4);
  const wgtArr = new Float32Array(count * 4);
  const pelvisJoint = boneIdx.Pelvis ?? 0;

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const u = uv ? uv.getX(i) : 0.25;
    // Convert glTF top-down V back to Blender bottom-up V (`pelican_v2_tex_and_utils.py`)
    const vb = uv ? 1.0 - uv.getY(i) : 0.78;

    const wMap = {};
    const isEyeUv = u >= 0.74 && vb >= 0.50 && vb <= 0.76;
    const isScarfUv = u <= 0.49 && vb >= 0.24 && vb <= 0.49;

    if (isEyeUv) {
      wMap.Head = 1.0;
    } else if (isScarfUv) {
      if (z < -0.213 && y < 0.174) {
        const ut = Math.max(0, Math.min(1, (0.172 - y) / 0.068));
        const w0 = 1 - sstep(0.0, 0.30, ut);
        const w2 = sstep(0.45, 0.85, ut);
        const w1 = Math.max(0, 1 - w0 - w2);
        wMap.Neck_01 = w0 * 0.6;
        wMap.Chest = w0 * 0.4;
        wMap.Scarf_Tail_01 = w1;
        wMap.Scarf_Tail_02 = w2;
      } else if (x > 0.045 && z > -0.130) {
        const ur = Math.max(0, Math.min(1, (z + 0.126) / 0.188));
        const w0 = 1 - sstep(0.0, 0.28, ur);
        const w2 = sstep(0.45, 0.85, ur);
        const w1 = Math.max(0, 1 - w0 - w2);
        wMap.Neck_01 = w0 * 0.7;
        wMap.Chest = w0 * 0.3;
        wMap.Scarf_Rear_01 = w1;
        wMap.Scarf_Rear_02 = w2;
      } else {
        for (const [bName, ax, ay, az, bx, by, bz, sig] of SPINE_SEGMENTS) {
          const dSq = segDistSq(x, y, z, ax, ay, az, bx, by, bz);
          wMap[bName] = Math.exp(-dSq / (sig * sig));
        }
      }
    } else {
      // Exact parametric `(s_i, a_norm)` from `UV_BODY_SKIN = (0.03, 0.69, 0.47, 0.88)`
      const s = Math.max(0, Math.min(1, (u - 0.03) / 0.44));
      const aNorm = Math.max(0, Math.min(1, (vb - 0.69) / 0.19)); // 0=dorsal, 0.5=tomium, 1=ventral

      if (s >= 0.70 && aNorm <= 0.50) {
        const wH = sstep(0.66, 0.71, s);
        wMap.Head = wH;
        wMap.Neck_04 = 1.0 - wH;
      } else {
        for (const [bName, ax, ay, az, bx, by, bz, sig] of SPINE_SEGMENTS) {
          const dSq = segDistSq(x, y, z, ax, ay, az, bx, by, bz);
          wMap[bName] = Math.exp(-dSq / (sig * sig));
        }
        if (s >= 0.70) {
          wMap.Head = (wMap.Head || 0) + 3.0 * sstep(0.68, 0.75, s);
        }
      }

      // Smooth elastic gular pouch & lower mandible articulation (`JawPouch` + `Head` + `Neck_04`)
      if (s >= 0.61 && aNorm > 0.50) {
        const fAng = sstep(0.50, 0.67, aNorm);
        // Keep smooth longitudinal taper without detaching distal lower symphysis from jaw motion
        const fLon = sstep(0.61, 0.73, s) * (1.0 - 0.45 * sstep(0.92, 0.99, s));
        const jp = 0.82 * fAng * fLon;
        for (const k of Object.keys(wMap)) {
          wMap[k] *= 1.0 - jp;
        }
        wMap.JawPouch = jp;
      }
    }

    const entries = Object.entries(wMap)
      .filter(([bn, val]) => val > 1e-5 && boneIdx[bn] !== undefined)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);

    let sum = 0;
    for (const [, val] of entries) sum += val;
    if (sum <= 1e-7) {
      idxArr[i * 4] = z < -0.15 ? headJoint : pelvisJoint;
      wgtArr[i * 4] = 1.0;
    } else {
      for (let c = 0; c < entries.length; c++) {
        idxArr[i * 4 + c] = boneIdx[entries[c][0]];
        wgtArr[i * 4 + c] = entries[c][1] / sum;
      }
    }
  }

  geom.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(idxArr, 4));
  geom.setAttribute("skinWeight", new THREE.Float32BufferAttribute(wgtArr, 4));
  geom.attributes.skinIndex.needsUpdate = true;
  geom.attributes.skinWeight.needsUpdate = true;
}
