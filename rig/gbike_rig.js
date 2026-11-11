/**
 * gbike_rig.js — Authentic Mountain View Priority Bicycles Google GBike Replica (`priority_v9`, Default)
 * + Instant URL/Config Revert to Preserved Classic V6 GBike (`?bike=classic` / `bikeVariant: "classic_v6"`).
 *
 * Wave 3 Item 2 Architecture:
 *   1. Variant Router in `constructor(materials, opts = {})`:
 *      - Checks `opts?.bikeVariant`, `?bike=classic` URL query param, and `state?.bikeVariant`.
 *      - Returns `new GBikeRigClassic(materials)` instantly when `variant === "classic_v6"`.
 *   2. Priority Bicycles Google GBike (`"priority_v9"`, Default):
 *      - Immediate high-fidelity Frame-0 procedural Priority GBike in exact Priority Campus colors:
 *        * Vivid Google Blue (`#1967D2` / `#1A73E8`) cruiser tires (ZERO whitewall), blue rubber grips & blue cables
 *        * Glossy Google Green (`#1E8E3E` / `#229642`) full-wrap front & rear fenders + stainless V-stays + ruby reflector
 *        * Google Yellow (`#F9AB00`) hydroformed step-through frame + airbrushed white `"Google"` down-tube sleeve
 *          + seamless sculpted Google Yellow belt/chainguard (`0` UV seams) + `"PRIORITY"` right chainstay
 *        * Google Red (`#D93025`) tubular front fork, headtube-mounted welded wire basket, blocky 4-bolt stem,
 *          rotary ring bell, and plush ergonomic Google Red cruiser saddle
 *        * Brushed silver rims, 36 stainless spokes, silver/black dynamo front hub, silver Nexus rear hub,
 *          forged silver crank arms (`L = 0.170m`), silver cruiser handlebars, silver seatpost + curved QR lever,
 *          and animated unilateral matte-black toothed Gates Carbon Drive belt (`x = +0.068m`, 0.00% slip).
 *      - `attachPriorityGbikeV9Glb(glbScene)` mounts all 13 articulated 2-manifold Blender sub-parts from
 *        `priority_gbike_v9_glb.js` onto the exact kinematic pivots with a single shared 2K PBR material,
 *        preserving 100% of `PelicanRig` IK anchors, 16-slot `TPU 8i` basket rack, `GBike_RearAxleSkewerNuts_V8`
 *        spin-trainer clamp fit, and `Drivetrain X-Ray` (`X`) cutaway mode.
 */

import * as THREE from "../vendor/three.module.js";
import { BIKE_CONSTANTS, state } from "../contract.js";
import { CHAIN_LOOP_SPEC, KIN_CONSTANTS, getChainLinkPose } from "./kin.js";
import { GBikeRigClassic, createParkedGBikeMeshClassic } from "./gbike_rig_classic.js";

export { GBikeRigClassic, createParkedGBikeMeshClassic };

const _upY = new THREE.Vector3(0, 1, 0);
const _upX = new THREE.Vector3(1, 0, 0);
const _tmpA = new THREE.Vector3();
const _tmpB = new THREE.Vector3();
const _tmpDir = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _pos = new THREE.Vector3();
const _scale = new THREE.Vector3(1, 1, 1);

const MAX_BASKET_TPUS = 16;
const SHADOW_PLANE_NAME_RE = /shadow|contactao|blobshadow/i;

function resolveBikeVariant(opts = {}) {
  if (opts && typeof opts === "object" && typeof opts.bikeVariant === "string") {
    const v = opts.bikeVariant.trim().toLowerCase();
    if (v === "classic" || v === "classic_v6") return "classic_v6";
    if (v === "priority" || v === "priority_v9") return "priority_v9";
  }
  if (typeof window !== "undefined" && window.location?.search) {
    try {
      const q = new URLSearchParams(window.location.search).get("bike");
      if (q && q.trim().toLowerCase() === "classic") return "classic_v6";
      if (q && q.trim().toLowerCase() === "priority") return "priority_v9";
    } catch (_e) {
      // Ignore URL parse errors under restricted origins
    }
  }
  const stVariant = typeof state?.bikeVariant === "string" ? state.bikeVariant.trim().toLowerCase() : "";
  if (stVariant === "classic" || stVariant === "classic_v6") return "classic_v6";
  return "priority_v9";
}

function stripAttachedShadowPlanesAndEnableCast(rootNode, skipSubtree = null) {
  const toRemove = [];
  rootNode.traverse((node) => {
    if (!node || node === rootNode) return;
    if (skipSubtree && (node === skipSubtree || skipSubtree.getObjectById(node.id))) return;
    if (node.name && SHADOW_PLANE_NAME_RE.test(node.name)) {
      node.visible = false;
      toRemove.push(node);
      return;
    }
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
  for (const n of toRemove) {
    if (n.parent) n.parent.remove(n);
  }
}

function pointToSegmentDistSq(p, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const apz = p.z - a.z;
  const abLenSq = abx * abx + aby * aby + abz * abz;
  const t = abLenSq > 1e-12 ? Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / abLenSq)) : 0;
  const dx = apx - abx * t;
  const dy = apy - aby * t;
  const dz = apz - abz * t;
  return dx * dx + dy * dy + dz * dz;
}

function orientTaperedLimb(mesh, pStart, pEnd, lengthScale = 1.0) {
  _tmpDir.subVectors(pEnd, pStart);
  const len = _tmpDir.length();
  if (len < 1e-6) return 0;
  mesh.position.addVectors(pStart, pEnd).multiplyScalar(0.5);
  _tmpDir.multiplyScalar(1 / len);
  mesh.quaternion.setFromUnitVectors(_upY, _tmpDir);
  mesh.scale.set(1, len * lengthScale, 1);
  return len;
}

function createTubeFromPoints(points, radius, tubularSegments = 20, radialSegments = 10, material, closed = false) {
  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => (p.isVector3 ? p.clone() : new THREE.Vector3(p[0], p[1], p[2]))),
    closed
  );
  const geom = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, closed);
  const mesh = new THREE.Mesh(geom, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function mergeStaticGeometries(geoms) {
  const nonIndexed = geoms.map((g) => (g.index ? g.toNonIndexed() : g.clone()));
  let totalVerts = 0;
  let hasUv = true;
  for (const g of nonIndexed) {
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) hasUv = false;
    totalVerts += g.attributes.position.count;
  }
  const pos = new Float32Array(totalVerts * 3);
  const norm = new Float32Array(totalVerts * 3);
  const uv = hasUv ? new Float32Array(totalVerts * 2) : null;
  let vOffset = 0;
  for (const g of nonIndexed) {
    const pArr = g.attributes.position.array;
    const nArr = g.attributes.normal.array;
    pos.set(pArr, vOffset * 3);
    norm.set(nArr, vOffset * 3);
    if (uv) uv.set(g.attributes.uv.array, vOffset * 2);
    vOffset += g.attributes.position.count;
    g.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(norm, 3));
  if (uv) merged.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

export function splitGeometryByTrianglePredicate(srcGeom, shouldExtractTri) {
  const posAttr = srcGeom.attributes.position;
  const idxAttr = srcGeom.index;
  const triCount = idxAttr ? Math.floor(idxAttr.count / 3) : Math.floor(posAttr.count / 3);
  const keptTris = [];
  const extTris = [];

  for (let t = 0; t < triCount; t++) {
    const i0 = idxAttr ? idxAttr.getX(t * 3) : t * 3;
    const i1 = idxAttr ? idxAttr.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = idxAttr ? idxAttr.getX(t * 3 + 2) : t * 3 + 2;
    const x0 = posAttr.getX(i0), y0 = posAttr.getY(i0), z0 = posAttr.getZ(i0);
    const x1 = posAttr.getX(i1), y1 = posAttr.getY(i1), z1 = posAttr.getZ(i1);
    const x2 = posAttr.getX(i2), y2 = posAttr.getY(i2), z2 = posAttr.getZ(i2);
    const cx = (x0 + x1 + x2) / 3.0;
    const cy = (y0 + y1 + y2) / 3.0;
    const cz = (z0 + z1 + z2) / 3.0;
    if (shouldExtractTri(cx, cy, cz, x0, y0, z0, x1, y1, z1, x2, y2, z2)) {
      extTris.push(i0, i1, i2);
    } else {
      keptTris.push(i0, i1, i2);
    }
  }

  const attrNames = Object.keys(srcGeom.attributes);
  const buildSubGeom = (srcIndices) => {
    const remap = new Int32Array(posAttr.count).fill(-1);
    const uniqueSrc = [];
    const newIndices = new (srcIndices.length > 65535 ? Uint32Array : Uint16Array)(srcIndices.length);
    for (let k = 0; k < srcIndices.length; k++) {
      const oldIdx = srcIndices[k];
      let mapped = remap[oldIdx];
      if (mapped < 0) {
        mapped = uniqueSrc.length;
        remap[oldIdx] = mapped;
        uniqueSrc.push(oldIdx);
      }
      newIndices[k] = mapped;
    }
    const out = new THREE.BufferGeometry();
    const vCount = uniqueSrc.length;
    for (const name of attrNames) {
      const a = srcGeom.attributes[name];
      if (!a || a.isInterleavedBufferAttribute) continue;
      const itemSize = a.itemSize;
      const Ctor = a.array.constructor;
      const dst = new Ctor(vCount * itemSize);
      const srcArr = a.array;
      for (let v = 0; v < vCount; v++) {
        const sBase = uniqueSrc[v] * itemSize;
        const dBase = v * itemSize;
        for (let c = 0; c < itemSize; c++) dst[dBase + c] = srcArr[sBase + c];
      }
      out.setAttribute(name, new THREE.BufferAttribute(dst, itemSize, a.normalized));
    }
    out.setIndex(new THREE.BufferAttribute(newIndices, 1));
    out.computeBoundingBox();
    out.computeBoundingSphere();
    return out;
  };

  return {
    keptGeom: buildSubGeom(keptTris),
    extractedGeom: buildSubGeom(extTris),
  };
}

function isPriorityCelebrationOccludedSteerTri(cx, cy, _cz, x0, _y0, _z0, x1, _y1, _z1, x2) {
  return (
    (cy > 0.080 && (cx < -0.022 || Math.min(x0, x1, x2) < -0.026 || cx > 0.180 || Math.max(x0, x1, x2) > 0.185)) ||
    (cy > 0.015 && cx < -0.058)
  );
}

function createUChannelFenderGeometry({
  rMid = 0.350,
  halfW = 0.032,
  wallThick = 0.004,
  lipDrop = 0.014,
  thetaStart = -1.32,
  thetaEnd = +1.08,
  arcSegs = 32,
} = {}) {
  const baseProfile = [];
  const outerSteps = 8;
  for (let k = 0; k <= outerSteps; k++) {
    const s = (k / outerSteps) * 2 - 1;
    baseProfile.push([s * halfW, 0.002 - s * s * lipDrop]);
  }
  const innerSteps = 6;
  for (let k = innerSteps; k >= 0; k--) {
    const s = ((k / innerSteps) * 2 - 1) * 0.90;
    baseProfile.push([s * halfW, 0.002 - s * s * lipDrop - wallThick]);
  }
  baseProfile.push([baseProfile[0][0], baseProfile[0][1]]);

  const m = baseProfile.length;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i <= arcSegs; i++) {
    const u = i / arcSegs;
    const theta = thetaStart + (thetaEnd - thetaStart) * u;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const endDist = Math.min(u, 1 - u);
    const widthScale = endDist < 0.09 ? 0.76 + 0.24 * Math.sin((endDist / 0.09) * Math.PI * 0.5) : 1.0;

    for (let j = 0; j < m; j++) {
      const [bx, bdr] = baseProfile[j];
      const x = bx * widthScale;
      const r = rMid + bdr;
      positions.push(x, cosT * r, sinT * r);
      uvs.push(j / (m - 1), u);
    }
  }

  for (let i = 0; i < arcSegs; i++) {
    for (let j = 0; j < m - 1; j++) {
      const a = i * m + j;
      const b = a + 1;
      const c = (i + 1) * m + j;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

function createBeltSprocketMesh(teeth, pitchRadius, thickness, material) {
  const shape = new THREE.Shape();
  const rootR = pitchRadius - 0.0024;
  const tipR = pitchRadius + 0.0024;
  const steps = teeth * 4;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const phase = i % 4;
    const r = phase === 1 || phase === 2 ? tipR : rootR;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  const hole = new THREE.Path();
  hole.absarc(0, 0, Math.max(0.014, pitchRadius - 0.016), 0, Math.PI * 2, true);
  shape.holes.push(hole);

  const geom = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 1 });
  geom.translate(0, 0, -thickness * 0.5);
  geom.rotateY(Math.PI / 2);
  const mesh = new THREE.Mesh(geom, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

let _priorityDowntubeTex = null;
function getPriorityDowntubeSleeveTexture() {
  if (_priorityDowntubeTex) return _priorityDowntubeTex;
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext("2d");
    const grad = ctx.createLinearGradient(0, 512, 0, 0);
    grad.addColorStop(0.00, "#F9AB00");
    grad.addColorStop(0.16, "#F9AB00");
    grad.addColorStop(0.35, "#FFFFFF");
    grad.addColorStop(0.65, "#FFFFFF");
    grad.addColorStop(0.84, "#F9AB00");
    grad.addColorStop(1.00, "#F9AB00");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    const drawWordmark = (uCenter, flipDir) => {
      ctx.save();
      ctx.translate(uCenter * 512, 256);
      ctx.rotate(flipDir > 0 ? -Math.PI * 0.5 : Math.PI * 0.5);
      ctx.font = '700 54px "Google Sans", "Product Sans", system-ui, sans-serif';
      ctx.textBaseline = "middle";
      const letters = [
        ["G", "#4285F4"],
        ["o", "#EA4335"],
        ["o", "#FBBC05"],
        ["g", "#4285F4"],
        ["l", "#34A853"],
        ["e", "#EA4335"],
      ];
      let totalW = 0;
      const widths = letters.map(([ch]) => {
        const w = ctx.measureText(ch).width;
        totalW += w;
        return w;
      });
      let x = -totalW * 0.5;
      letters.forEach(([ch, col], idx) => {
        ctx.fillStyle = col;
        ctx.fillText(ch, x, 0);
        x += widths[idx];
      });
      ctx.restore();
    };
    drawWordmark(0.72, +1);
    drawWordmark(0.28, -1);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    _priorityDowntubeTex = tex;
    return tex;
  }
  const data = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++) {
    const s = 1.0 - y / 63;
    const w = Math.max(0, Math.min(1, 1 - Math.abs(s - 0.5) * 3.4));
    const r = Math.round(249 * (1 - w) + 253 * w);
    const g = Math.round(171 * (1 - w) + 253 * w);
    const b = Math.round(0 * (1 - w) + 255 * w);
    for (let x = 0; x < 64; x++) {
      const idx = (y * 64 + x) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }
  const dt = new THREE.DataTexture(data, 64, 64, THREE.RGBAFormat);
  dt.colorSpace = THREE.SRGBColorSpace;
  dt.needsUpdate = true;
  _priorityDowntubeTex = dt;
  return dt;
}

function buildPriorityV9Materials(base = {}) {
  const sleeveTex = getPriorityDowntubeSleeveTexture();
  return {
    ...base,
    priorityBlueTire: new THREE.MeshStandardMaterial({
      name: "Priority_Blue_CruiserTire",
      color: "#1967D2",
      roughness: 0.68,
      metalness: 0.02,
    }),
    priorityGreenFender: new THREE.MeshPhysicalMaterial({
      name: "Priority_Green_Fender",
      color: "#229642",
      roughness: 0.22,
      metalness: 0.06,
      clearcoat: 0.42,
      clearcoatRoughness: 0.16,
    }),
    priorityYellowFrame: new THREE.MeshPhysicalMaterial({
      name: "Priority_Yellow_Frame",
      color: "#F9AB00",
      roughness: 0.24,
      metalness: 0.05,
      clearcoat: 0.36,
      clearcoatRoughness: 0.18,
    }),
    priorityDowntubeSleeve: new THREE.MeshPhysicalMaterial({
      name: "Priority_YellowWhite_GoogleSleeve",
      color: "#ffffff",
      map: sleeveTex,
      roughness: 0.30,
      metalness: 0.04,
      clearcoat: 0.20,
      clearcoatRoughness: 0.22,
    }),
    priorityRedPaint: new THREE.MeshPhysicalMaterial({
      name: "Priority_Red_ForkBasketStem",
      color: "#D93025",
      roughness: 0.24,
      metalness: 0.06,
      clearcoat: 0.38,
      clearcoatRoughness: 0.18,
    }),
    priorityRedSaddle: new THREE.MeshStandardMaterial({
      name: "Priority_Red_CruiserSaddle",
      color: "#D02E25",
      roughness: 0.58,
      metalness: 0.02,
    }),
    priorityBlueGrip: new THREE.MeshStandardMaterial({
      name: "Priority_Blue_GripCable",
      color: "#1A73E8",
      roughness: 0.52,
      metalness: 0.02,
    }),
    prioritySilverBrushed: new THREE.MeshStandardMaterial({
      name: "Priority_Silver_BrushedAlu",
      color: "#D8DEE6",
      roughness: 0.24,
      metalness: 0.88,
    }),
    priorityChrome: new THREE.MeshStandardMaterial({
      name: "Priority_Stainless_Chrome",
      color: "#EEF2F6",
      roughness: 0.16,
      metalness: 0.94,
    }),
    priorityMatteBlack: new THREE.MeshStandardMaterial({
      name: "Priority_MatteBlack_GatesBelt",
      color: "#1C1F24",
      roughness: 0.78,
      metalness: 0.08,
    }),
    priorityDarkAlloy: new THREE.MeshStandardMaterial({
      name: "Priority_DarkAlloy_Sprocket",
      color: "#363C46",
      roughness: 0.34,
      metalness: 0.82,
    }),
    reflectorWhite:
      base.reflectorWhite ||
      new THREE.MeshStandardMaterial({ color: "#f8fafc", roughness: 0.15, metalness: 0.40 }),
    reflectorRuby:
      base.reflectorRuby ||
      new THREE.MeshStandardMaterial({ color: "#dc2626", roughness: 0.18, metalness: 0.30 }),
    reflectorAmber:
      base.reflectorAmber ||
      new THREE.MeshStandardMaterial({ color: "#f59e0b", roughness: 0.20, metalness: 0.30 }),
  };
}

function createSeamlessPriorityChainguardGeometry() {
  // 100% seamless sculpted Google Yellow hockey-stick chainguard (`0` UV seams, `0` non-manifold edges)
  const shape = new THREE.Shape();
  const rFront = 0.108;
  shape.absarc(0, 0, rFront, -Math.PI * 0.96, Math.PI * 0.5, false);
  shape.lineTo(0.416, 0.096);
  shape.quadraticCurveTo(0.428, 0.082, 0.416, 0.068);
  shape.lineTo(0.107, 0.012);
  shape.closePath();

  const hole = new THREE.Path();
  hole.absarc(0, 0, 0.026, 0, Math.PI * 2, true);
  shape.holes.push(hole);

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: 0.014,
    bevelEnabled: true,
    bevelThickness: 0.0025,
    bevelSize: 0.0025,
    bevelSegments: 2,
    curveSegments: 32,
  });
  // Rotate `(x_2d = +Z_rear, y_2d = +Y_up, z_ext)` -> Three.js `(+X_drive, +Y_up, +Z_rear)`
  geom.rotateY(-Math.PI * 0.5);
  geom.computeVertexNormals();
  return geom;
}

function buildPriorityProceduralWheel(mats, includeRearCog = false) {
  const wheelGroup = new THREE.Group();
  const tireR = 0.3045;
  const tubeR = 0.0295; // outer radius = 0.3340m -> exact rolling contact!

  // Vivid Google Blue Cruiser Tire (`ZERO whitewall!`)
  const tire = new THREE.Mesh(
    new THREE.TorusGeometry(tireR, tubeR, 20, 56).rotateY(Math.PI / 2),
    mats.priorityBlueTire
  );
  tire.castShadow = true;
  tire.receiveShadow = true;
  wheelGroup.add(tire);

  // Brushed Silver Aluminum Rim
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.268, 0.0125, 14, 48).rotateY(Math.PI / 2),
    mats.prioritySilverBrushed
  );
  rim.castShadow = true;
  wheelGroup.add(rim);

  // Hub (Front: silver/black dynamo roller hub; Rear: silver Shimano Nexus internal hub)
  const hubShell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028, 0.028, 0.068, 20).rotateZ(Math.PI / 2),
    mats.prioritySilverBrushed
  );
  wheelGroup.add(hubShell);
  if (!includeRearCog) {
    const blackDynamoBand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.030, 0.030, 0.034, 20).rotateZ(Math.PI / 2),
      mats.priorityMatteBlack
    );
    wheelGroup.add(blackDynamoBand);
  }

  // 36 Stainless Steel Cross-3 Spokes (merged into 1 draw call)
  const spokeGeoms = [];
  const baseSpoke = new THREE.CylinderGeometry(0.0012, 0.0012, 1.0, 5);
  const tmp = new THREE.Object3D();
  const pHub = new THREE.Vector3();
  const pRim = new THREE.Vector3();
  const dir = new THREE.Vector3();
  for (let i = 0; i < 36; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const crossDir = Math.floor(i / 2) % 2 === 0 ? 1 : -1;
    const rimAng = (i / 36) * Math.PI * 2;
    const hubAng = rimAng + crossDir * 0.56;
    pHub.set(side * 0.030, Math.sin(hubAng) * 0.030, Math.cos(hubAng) * 0.030);
    pRim.set(side * 0.0025, Math.sin(rimAng) * 0.258, Math.cos(rimAng) * 0.258);
    dir.subVectors(pRim, pHub);
    const len = dir.length();
    tmp.position.addVectors(pHub, pRim).multiplyScalar(0.5);
    tmp.quaternion.setFromUnitVectors(_upY, dir.normalize());
    tmp.scale.set(1, len, 1);
    tmp.updateMatrix();
    spokeGeoms.push(baseSpoke.clone().applyMatrix4(tmp.matrix));
  }
  baseSpoke.dispose();
  const spokesMesh = new THREE.Mesh(mergeStaticGeometries(spokeGeoms), mats.priorityChrome);
  spokesMesh.userData.logicalSubParts = 36;
  wheelGroup.add(spokesMesh);

  // Clear Oval Spoke Reflector
  const spokeRefl = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.024, 0.068), mats.reflectorWhite);
  spokeRefl.position.set(0, 0.175, 0.105);
  spokeRefl.rotation.x = -0.52;
  wheelGroup.add(spokeRefl);

  if (includeRearCog) {
    const rearCog = createBeltSprocketMesh(
      BIKE_CONSTANTS.rearCogTeeth,
      KIN_CONSTANTS.rearCogRadiusM,
      0.0068,
      mats.priorityDarkAlloy
    );
    rearCog.position.x = BIKE_CONSTANTS.driveSideX;
    wheelGroup.add(rearCog);
  }

  return wheelGroup;
}

export class GBikeRig {
  constructor(materials = {}, opts = {}) {
    const variant = resolveBikeVariant(opts);
    if (variant === "classic_v6") {
      const classicRig = new GBikeRigClassic(materials);
      classicRig.bikeVariant = "classic_v6";
      return classicRig;
    }

    this.bikeVariant = "priority_v9";
    this.materials = buildPriorityV9Materials(materials);

    this.root = new THREE.Group();
    this.root.name = "GBikeRoot";

    this.leanGroup = new THREE.Group();
    this.leanGroup.name = "GBikeLeanGroup";
    this.root.add(this.leanGroup);

    this.subPartCount = 0;
    this._collectedTpuCount = 0;
    this._lastSimTime = 0;
    this._priorityV9GlbAttached = false;

    // Exact public kinematic properties (100% invariant with `BIKE_CONSTANTS`, `PelicanRig` & `core.js`)
    this.wheelRadius = BIKE_CONSTANTS.wheelRadiusM; // 0.335m
    this.wheelbase = BIKE_CONSTANTS.wheelbaseM;     // 1.085m
    this.axleY = 0.334;                             // 0.335m - 0.001m micro-contact
    this.rearAxleZ = +BIKE_CONSTANTS.wheelbaseM * 0.5;  // +0.5425m
    this.frontAxleZ = -BIKE_CONSTANTS.wheelbaseM * 0.5; // -0.5425m
    this.bbPos = new THREE.Vector3(0, 0.285, +0.085);
    this.saddleTopPos = new THREE.Vector3(0, 0.752, +0.238);
    this.headAxisOrigin = new THREE.Vector3(0, 0.755, -0.395);
    this.headRakePitch = 0.335;

    this.leftPedalTopLocal = new THREE.Vector3();
    this.rightPedalTopLocal = new THREE.Vector3();
    this.leftGripLocal = new THREE.Vector3();
    this.rightGripLocal = new THREE.Vector3();
    this.leftGripWorld = new THREE.Vector3();
    this.rightGripWorld = new THREE.Vector3();
    this.leftFootPitch = 0;
    this.rightFootPitch = 0;
    this.shadowGroup = null;

    this._proceduralBuckets = {
      frame: [],
      rearWheel: [],
      frontWheel: [],
      steer: [],
      basket: [],
      bell: [],
      bellStriker: [],
      crank: [],
      pedalR: [],
      pedalL: [],
      saddle: [],
    };

    this._buildPriorityFrameAndRearFender();
    this._buildPrioritySteerCockpitAndHeadtubeBasket();
    this._buildPriorityBeltDrivetrainAndXray();
    this._buildPrioritySaddleAndKickstand();

    this.root.traverse((obj) => {
      if (obj.isMesh || obj.isInstancedMesh) {
        this.subPartCount += obj.userData?.logicalSubParts || (obj.isInstancedMesh ? obj.count : 1);
      }
    });

    stripAttachedShadowPlanesAndEnableCast(this.root, this.xrayOverlayGroup);
    if (this.chainguardMesh) {
      this.chainguardMesh.castShadow = !this.xrayEnabled;
    }

    this.update({ wheelRad: 0, crankRad: 0, steerRad: 0, bankRad: 0, tpusCollected: 0, simTime: 0 });
  }

  _buildPriorityFrameAndRearFender() {
    const m = this.materials;
    const frameParts = this._proceduralBuckets.frame;

    // 1. Google Yellow Headtube + Silver Headset Cups
    this.headTubeGroup = new THREE.Group();
    this.headTubeGroup.position.copy(this.headAxisOrigin);
    this.headTubeGroup.rotation.x = this.headRakePitch;
    const htMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.140, 20), m.priorityYellowFrame);
    this.headTubeGroup.add(htMesh);
    frameParts.push(htMesh);
    for (const yCup of [-0.074, +0.074]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.013, 20), m.prioritySilverBrushed);
      cup.position.y = yCup;
      this.headTubeGroup.add(cup);
      frameParts.push(cup);
    }
    this.leanGroup.add(this.headTubeGroup);

    // 2. Curved Google Yellow Down-Tube + Airbrushed White `"Google"` Sleeve + Mid Step-Through Brace
    const dtUpper = createTubeFromPoints(
      [[0, 0.742, -0.390], [0, 0.680, -0.342]],
      0.0215,
      6,
      16,
      m.priorityYellowFrame
    );
    const dtSleeve = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0218, 0.0218, 0.378, 24, 1, false),
      m.priorityDowntubeSleeve
    );
    dtSleeve.position.set(0, 0.534, -0.2235);
    dtSleeve.quaternion.setFromUnitVectors(
      _upY,
      new THREE.Vector3(0, 0.680 - 0.388, -0.342 - -0.105).normalize()
    );
    dtSleeve.castShadow = true;
    const dtLower = createTubeFromPoints(
      [
        [0, 0.388, -0.105],
        [0, 0.316, -0.032],
        [0, 0.289, +0.030],
        [0, 0.285, +0.085],
      ],
      0.0210,
      16,
      16,
      m.priorityYellowFrame
    );
    const midBrace = createTubeFromPoints(
      [
        [0, 0.384, -0.098],
        [0, 0.379, +0.010],
        [0, 0.378, +0.118],
      ],
      0.0155,
      10,
      14,
      m.priorityYellowFrame
    );
    const seatTube = createTubeFromPoints(
      [[0, 0.285, +0.085], [0, 0.636, +0.200]],
      0.0178,
      10,
      16,
      m.priorityYellowFrame
    );
    const seatCollar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.021, 0.021, 0.020, 18),
      m.prioritySilverBrushed
    );
    seatCollar.position.set(0, 0.640, 0.202);
    seatCollar.rotation.x = 0.315;
    const qrLever = createTubeFromPoints(
      [
        [+0.019, 0.642, +0.184],
        [+0.020, 0.610, +0.168],
        [+0.016, 0.556, +0.146],
      ],
      0.0052,
      8,
      10,
      m.prioritySilverBrushed
    );
    const seatPost = createTubeFromPoints(
      [[0, 0.646, +0.204], [0, 0.716, +0.234]],
      0.0142,
      8,
      16,
      m.prioritySilverBrushed
    );
    const bbShell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.027, 0.027, 0.076, 20).rotateZ(Math.PI / 2),
      m.priorityYellowFrame
    );
    bbShell.position.copy(this.bbPos);
    this.leanGroup.add(dtUpper, dtSleeve, dtLower, midBrace, seatTube, seatCollar, qrLever, seatPost, bbShell);
    frameParts.push(dtUpper, dtSleeve, dtLower, midBrace, seatTube, seatCollar, qrLever, seatPost, bbShell);

    // 3. Yellow Chainstays & Seatstays + Rear Green Full-Wrap Fender + Stainless V-Stays + Red Reflector
    for (const side of [-1, 1]) {
      const cstay = createTubeFromPoints(
        [
          [side * 0.028, 0.285, +0.095],
          [side * 0.046, 0.308, +0.320],
          [side * 0.056, this.axleY - 0.003, this.rearAxleZ - 0.024],
        ],
        0.0125,
        12,
        12,
        m.priorityYellowFrame
      );
      const sstay = createTubeFromPoints(
        [
          [side * 0.018, 0.596, +0.188],
          [side * 0.042, 0.478, +0.345],
          [side * 0.055, this.axleY + 0.014, this.rearAxleZ - 0.018],
        ],
        0.0098,
        12,
        10,
        m.priorityYellowFrame
      );
      this.leanGroup.add(cstay, sstay);
      frameParts.push(cstay, sstay);
    }

    const rearFender = new THREE.Mesh(
      createUChannelFenderGeometry({
        rMid: 0.350,
        halfW: 0.0325,
        wallThick: 0.003,
        lipDrop: 0.014,
        thetaStart: -1.34,
        thetaEnd: +1.06,
        arcSegs: 36,
      }),
      m.priorityGreenFender
    );
    rearFender.position.set(0, this.axleY, this.rearAxleZ);
    this.leanGroup.add(rearFender);
    frameParts.push(rearFender);

    for (const thStay of [0.16, 0.76]) {
      const fy = this.axleY + Math.cos(thStay) * 0.352;
      const fz = this.rearAxleZ + Math.sin(thStay) * 0.352;
      for (const side of [-1, 1]) {
        const stay = createTubeFromPoints(
          [[side * 0.056, this.axleY, this.rearAxleZ - 0.008], [side * 0.026, fy, fz]],
          0.0020,
          6,
          6,
          m.priorityChrome
        );
        this.leanGroup.add(stay);
        frameParts.push(stay);
      }
    }

    const reflTheta = 0.58;
    const reflPod = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.042, 0.034), m.priorityMatteBlack);
    reflPod.position.set(
      0,
      this.axleY + Math.cos(reflTheta) * 0.362,
      this.rearAxleZ + Math.sin(reflTheta) * 0.362
    );
    reflPod.rotation.x = reflTheta;
    const rubyLens = new THREE.Mesh(new THREE.BoxGeometry(0.020, 0.030, 0.006), m.reflectorRuby);
    rubyLens.position.set(0, 0, 0.018);
    reflPod.add(rubyLens);
    this.leanGroup.add(reflPod);
    frameParts.push(reflPod);

    // 4. Rear Wheel + V8 Extended Rear-Axle Trainer Skewer Nuts (`|x| = 0.106m` invariant!)
    this.rearWheel = buildPriorityProceduralWheel(m, true);
    this.rearWheel.position.set(0, this.axleY, this.rearAxleZ);
    this.leanGroup.add(this.rearWheel);
    this._proceduralBuckets.rearWheel.push(...this.rearWheel.children);

    const skewerGeoms = [];
    for (const side of [-1, 1]) {
      skewerGeoms.push(
        new THREE.CylinderGeometry(0.0060, 0.0060, 0.030, 14)
          .rotateZ(Math.PI * 0.5)
          .translate(side * 0.075, 0, 0),
        new THREE.CylinderGeometry(0.0125, 0.0125, 0.018, 16)
          .rotateZ(Math.PI * 0.5)
          .translate(side * 0.094, 0, 0),
        new THREE.CylinderGeometry(0.0060, 0.0095, 0.006, 16)
          .rotateZ(-side * Math.PI * 0.5)
          .translate(side * 0.103, 0, 0)
      );
    }
    this.rearSkewerNutsMesh = new THREE.Mesh(mergeStaticGeometries(skewerGeoms), m.prioritySilverBrushed);
    this.rearSkewerNutsMesh.name = "GBike_RearAxleSkewerNuts_V8";
    this.rearSkewerNutsMesh.position.set(0, this.axleY, this.rearAxleZ);
    this.rearSkewerNutsMesh.castShadow = true;
    this.leanGroup.add(this.rearSkewerNutsMesh);
  }

  _buildPrioritySteerCockpitAndHeadtubeBasket() {
    const m = this.materials;
    const steerParts = this._proceduralBuckets.steer;

    // 1. Exact Tilted Headtube Axis Steering Hierarchy:
    //    `steerAxisCarrier` (`pos = headAxisOrigin`, `rot.x = +headRakePitch`)
    //     -> `steerGroup` (`rot.y = steerRad`)
    //       -> `steerVisualAnchor` (`pos = 0`, `rot.x = -headRakePitch`)
    //    At `steerRad = 0`, `steerVisualAnchor` has exact un-rotated world orientation centered at `headAxisOrigin`!
    this.steerAxisCarrier = new THREE.Group();
    this.steerAxisCarrier.position.copy(this.headAxisOrigin);
    this.steerAxisCarrier.rotation.x = this.headRakePitch;
    this.leanGroup.add(this.steerAxisCarrier);

    this.steerGroup = new THREE.Group();
    this.steerAxisCarrier.add(this.steerGroup);

    this.steerVisualAnchor = new THREE.Group();
    this.steerVisualAnchor.rotation.x = -this.headRakePitch;
    this.steerGroup.add(this.steerVisualAnchor);
    this.cockpitAlign = this.steerVisualAnchor;

    const hx = this.headAxisOrigin.x;
    const hy = this.headAxisOrigin.y;
    const hz = this.headAxisOrigin.z;

    // 2. Google Red Tubular Front Fork + Glossy Google Green Front Fender
    const forkCrown = createTubeFromPoints(
      [
        [-0.048, 0.648 - hy, -0.432 - hz],
        [0, 0.676 - hy, -0.424 - hz],
        [+0.048, 0.648 - hy, -0.432 - hz],
      ],
      0.017,
      8,
      14,
      m.priorityRedPaint
    );
    this.steerVisualAnchor.add(forkCrown);
    steerParts.push(forkCrown);

    for (const side of [-1, 1]) {
      const blade = createTubeFromPoints(
        [
          [side * 0.048, 0.648 - hy, -0.432 - hz],
          [side * 0.053, 0.515 - hy, -0.482 - hz],
          [side * 0.054, this.axleY - hy, this.frontAxleZ - hz],
        ],
        0.0135,
        10,
        14,
        m.priorityRedPaint
      );
      this.steerVisualAnchor.add(blade);
      steerParts.push(blade);
    }

    const frontFender = new THREE.Mesh(
      createUChannelFenderGeometry({
        rMid: 0.350,
        halfW: 0.0325,
        wallThick: 0.003,
        lipDrop: 0.014,
        thetaStart: -0.32,
        thetaEnd: +1.56,
        arcSegs: 32,
      }),
      m.priorityGreenFender
    );
    frontFender.position.set(0, this.axleY - hy, this.frontAxleZ - hz);
    this.steerVisualAnchor.add(frontFender);
    steerParts.push(frontFender);

    // 3. Spinning Front Wheel (`(0, axleY, frontAxleZ)` in world space at `steerRad = 0`)
    this.frontWheelAlign = new THREE.Group();
    this.frontWheelAlign.position.set(0 - hx, this.axleY - hy, this.frontAxleZ - hz);
    this.steerVisualAnchor.add(this.frontWheelAlign);

    this.frontWheel = buildPriorityProceduralWheel(m, false);
    this.frontWheelAlign.add(this.frontWheel);
    this._proceduralBuckets.frontWheel.push(...this.frontWheel.children);

    // 4. Silver Headset Spacers + Blocky Google Red 4-Bolt Stem + Swept-Back Silver Handlebars + Blue Grips
    const spacerStack = createTubeFromPoints(
      [[0, 0.830 - hy, -0.370 - hz], [0, 0.886 - hy, -0.350 - hz]],
      0.0195,
      6,
      16,
      m.prioritySilverBrushed
    );
    const redStem = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.040, 0.068), m.priorityRedPaint);
    redStem.position.set(0, 0.896 - hy, -0.372 - hz);
    redStem.rotation.x = 0.34;

    const handlebar = createTubeFromPoints(
      [
        [-0.276, 0.899 - hy, -0.132 - hz],
        [-0.214, 0.911 - hy, -0.224 - hz],
        [-0.145, 0.920 - hy, -0.320 - hz],
        [0, 0.902 - hy, -0.382 - hz],
        [+0.145, 0.920 - hy, -0.320 - hz],
        [+0.214, 0.911 - hy, -0.224 - hz],
        [+0.276, 0.899 - hy, -0.132 - hz],
      ],
      0.0112,
      28,
      14,
      m.priorityChrome
    );
    const hbSplit = splitGeometryByTrianglePredicate(handlebar.geometry, isPriorityCelebrationOccludedSteerTri);
    handlebar.geometry.dispose();
    handlebar.geometry = hbSplit.keptGeom;
    const procOccHandlebar = new THREE.Mesh(hbSplit.extractedGeom, m.priorityChrome);
    procOccHandlebar.name = "Priority_CelebrationOccludedHandlebar_Procedural";
    procOccHandlebar.castShadow = true;
    procOccHandlebar.receiveShadow = true;

    this.steerVisualAnchor.add(spacerStack, redStem, handlebar, procOccHandlebar);
    steerParts.push(spacerStack, redStem, handlebar, procOccHandlebar);
    this.celebrationOccludedHandlebarMesh = procOccHandlebar;
    this._proceduralCelebrationOccludedSteerParts = [procOccHandlebar];
    this._celebrationHandlebarHidden = false;

    this.leftGripAnchor = new THREE.Object3D();
    this.rightGripAnchor = new THREE.Object3D();
    for (const side of [-1, 1]) {
      const grip = createTubeFromPoints(
        [
          [side * 0.208, 0.912 - hy, -0.233 - hz],
          [side * 0.282, 0.898 - hy, -0.123 - hz],
        ],
        0.0165,
        8,
        14,
        m.priorityBlueGrip
      );
      this.steerVisualAnchor.add(grip);
      steerParts.push(grip);
      this._proceduralCelebrationOccludedSteerParts.push(grip);

      const anchor = side < 0 ? this.leftGripAnchor : this.rightGripAnchor;
      anchor.position.set(side * 0.246, 0.905 - hy, -0.176 - hz);
      this.steerVisualAnchor.add(anchor);
    }

    // 5. Google Red Rotary Ring Bell + Articulated Striker Lever (`(+0.194, 0.914, -0.252)`)
    this.bellBaseY = 0.914 - hy;
    this.bellGroup = new THREE.Group();
    this.bellGroup.position.set(+0.194, this.bellBaseY, -0.252 - hz);
    const bellSilverBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.020, 0.020, 0.026, 18).rotateZ(Math.PI * 0.5),
      m.prioritySilverBrushed
    );
    const bellRedRing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.024, 0.012, 20).rotateZ(Math.PI * 0.5),
      m.priorityRedPaint
    );
    this.bellGroup.add(bellSilverBody, bellRedRing);
    this._proceduralBuckets.bell.push(bellSilverBody, bellRedRing);

    this.bellStrikerPivot = new THREE.Group();
    const bellLever = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.008, 0.026), m.priorityMatteBlack);
    bellLever.position.set(0, 0.014, 0.022);
    this.bellStrikerPivot.add(bellLever);
    this._proceduralBuckets.bellStriker.push(bellLever);
    this.bellGroup.add(this.bellStrikerPivot);
    this.steerVisualAnchor.add(this.bellGroup);

    // 6. Headtube-Mounted Google Red Welded Steel Wire Basket (`(0, 0.806, -0.576)` on `leanGroup`!)
    //    Bolted directly to the yellow headtube so steering fork/fender rotates freely underneath (`>= 37mm` gap),
    //    and sized with wide interior (`±0.120m x ±0.098m`) so all 16 `TPU 8i` boards nest with ZERO wire collisions!
    const basketGroup = new THREE.Group();
    basketGroup.position.set(0, 0.806, -0.576);
    this.basketGroup = basketGroup;
    this.leanGroup.add(basketGroup);

    const redWireGeoms = [];
    for (const [yHoop, sxy, rW] of [
      [+0.088, 1.00, 0.0044],
      [+0.024, 0.95, 0.0032],
      [-0.028, 0.90, 0.0032],
      [-0.080, 0.85, 0.0038],
    ]) {
      const hw = 0.144 * sxy;
      const hd = 0.114 * sxy;
      const c = new THREE.CatmullRomCurve3(
        [
          new THREE.Vector3(-hw, yHoop, -hd),
          new THREE.Vector3(+hw, yHoop, -hd),
          new THREE.Vector3(+hw, yHoop, +hd),
          new THREE.Vector3(-hw, yHoop, +hd),
        ],
        true
      );
      redWireGeoms.push(new THREE.TubeGeometry(c, 24, rW, 6, true));
    }
    redWireGeoms.push(new THREE.BoxGeometry(0.068, 0.094, 0.068).translate(0, -0.036, +0.146));
    const procBasketMesh = new THREE.Mesh(mergeStaticGeometries(redWireGeoms), m.priorityRedPaint);
    procBasketMesh.castShadow = true;
    basketGroup.add(procBasketMesh);
    this._proceduralBuckets.basket.push(procBasketMesh);

    const procFloorPlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.184, 0.006, 0.156),
      m.priorityMatteBlack
    );
    procFloorPlate.position.set(0, -0.080, -0.004);
    basketGroup.add(procFloorPlate);
    this._proceduralBuckets.basket.push(procFloorPlate);

    // 7. 16-Slot Collectible Glowing `TPU 8i` Rack Nested Cleanly Inside the Red Wire Basket
    this.basketPropsGroup = new THREE.Group();
    this.basketTpuStackGroup = new THREE.Group();
    this.basketTpuSlots = [];

    const miniPcbMat = new THREE.MeshStandardMaterial({
      color: "#0b6e56",
      emissive: "#047857",
      emissiveIntensity: 0.24,
      roughness: 0.30,
      metalness: 0.38,
    });
    const miniGoldMat = new THREE.MeshStandardMaterial({
      color: "#facc15",
      emissive: "#ca8a04",
      emissiveIntensity: 0.24,
      roughness: 0.20,
      metalness: 0.90,
    });
    const miniCopperMat = new THREE.MeshStandardMaterial({
      color: "#d97736",
      emissive: "#d97706",
      emissiveIntensity: 0.20,
      roughness: 0.24,
      metalness: 0.88,
    });
    const miniDieMat = new THREE.MeshStandardMaterial({
      color: "#38bdf8",
      emissive: "#0ea5e9",
      emissiveIntensity: 0.88,
      roughness: 0.10,
      metalness: 0.92,
    });

    const sharedPcbGeom = new THREE.BoxGeometry(0.074, 0.064, 0.0046);
    const sharedGoldGeom = new THREE.BoxGeometry(0.060, 0.008, 0.0054);
    const sharedCopperGeom = new THREE.BoxGeometry(0.062, 0.016, 0.0074);
    const sharedDieGeom = new THREE.BoxGeometry(0.028, 0.028, 0.0084);

    for (let i = 0; i < MAX_BASKET_TPUS; i++) {
      const slot = new THREE.Group();
      const row = Math.floor(i / 2);
      const colSign = i % 2 === 0 ? -1 : +1;
      const rowFrac = row / 7;

      slot.position.set(
        colSign * 0.049,
        -0.042 + row * 0.0046,
        -0.056 + rowFrac * 0.112
      );
      slot.rotation.set(
        -0.20 + rowFrac * 0.28,
        colSign * -0.09,
        colSign * 0.025
      );

      const fallbackGroup = new THREE.Group();
      const pcb = new THREE.Mesh(sharedPcbGeom, miniPcbMat);
      const goldEdge = new THREE.Mesh(sharedGoldGeom, miniGoldMat);
      goldEdge.position.y = -0.026;
      const sink = new THREE.Mesh(sharedCopperGeom, miniCopperMat);
      sink.position.y = +0.022;
      const die = new THREE.Mesh(sharedDieGeom, miniDieMat);
      die.position.y = -0.002;
      fallbackGroup.add(pcb, goldEdge, sink, die);

      slot.add(fallbackGroup);
      slot.userData = { fallbackGroup, baseY: slot.position.y };
      slot.visible = false;
      this.basketTpuStackGroup.add(slot);
      this.basketTpuSlots.push(slot);
    }
    this.basketPropsGroup.add(this.basketTpuStackGroup);
    basketGroup.add(this.basketPropsGroup);
  }

  _buildPriorityBeltDrivetrainAndXray() {
    const m = this.materials;
    const driveX = BIKE_CONSTANTS.driveSideX; // +0.068m

    // 1. Forged Brushed-Silver Crankset (`L = 0.170m`) + 44T Gates Front Sprocket
    this.crankGroup = new THREE.Group();
    this.crankGroup.position.copy(this.bbPos);
    this.leanGroup.add(this.crankGroup);

    const spindle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0095, 0.0095, 0.194, 14).rotateZ(Math.PI / 2),
      m.prioritySilverBrushed
    );
    this.chainring = createBeltSprocketMesh(
      BIKE_CONSTANTS.chainringTeeth,
      KIN_CONSTANTS.chainringRadiusM,
      0.0072,
      m.priorityDarkAlloy
    );
    this.chainring.position.x = driveX;
    this.crankGroup.add(spindle, this.chainring);
    this._proceduralBuckets.crank.push(spindle, this.chainring);

    const R_crank = BIKE_CONSTANTS.crankRadiusM; // 0.170m
    this.crankArmX = 0.096;

    this.rightPedalGroup = this._createPriorityPedalAssembly(+1);
    this.rightPedalGroup.position.set(+this.crankArmX, R_crank, 0);
    this.crankGroup.add(this.rightPedalGroup);

    this.leftPedalGroup = this._createPriorityPedalAssembly(-1);
    this.leftPedalGroup.position.set(-this.crankArmX, -R_crank, 0);
    this.crankGroup.add(this.leftPedalGroup);

    for (const side of [1, -1]) {
      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(0.012, R_crank + 0.028, 0.026),
        m.prioritySilverBrushed
      );
      arm.position.set(side * this.crankArmX, (side > 0 ? 1 : -1) * R_crank * 0.5, 0);
      arm.castShadow = true;
      this.crankGroup.add(arm);
      this._proceduralBuckets.crank.push(arm);
    }

    // 2. Seamless Sculpted Google Yellow Belt/Chainguard (`0` UV seams!)
    const chainguardMesh = new THREE.Mesh(
      createSeamlessPriorityChainguardGeometry(),
      m.priorityYellowFrame
    );
    chainguardMesh.position.set(driveX + 0.002, this.bbPos.y, this.bbPos.z);
    chainguardMesh.castShadow = true;
    this.chainguardMesh = chainguardMesh;
    this.chainguardSolidMat = m.priorityYellowFrame;
    this.chainguardTopFlange = null;
    this.leanGroup.add(chainguardMesh);

    // 3. Live Animated Matte-Black Toothed Gates Carbon Drive Belt (`x = +0.068m`, 0.00% slip!)
    this.chainLength = CHAIN_LOOP_SPEC.totalLengthM;
    this.chainDriveX = driveX;
    this._sampleAnalyticalChain = (uNorm, outPos, outPitchObj) => {
      const pose = getChainLinkPose(uNorm, driveX);
      outPos.set(pose.x, pose.y, pose.z);
      outPitchObj.pitch = Math.atan2(-pose.ty, pose.tz);
    };

    const linkCount = BIKE_CONSTANTS.chainLinks;
    const beltBandGeom = new THREE.BoxGeometry(0.0112, 0.0038, 0.0148);
    this.beltSolidMat = m.priorityMatteBlack;
    this.chainInstanced = new THREE.InstancedMesh(beltBandGeom, this.beltSolidMat, linkCount);
    this.chainInstanced.castShadow = true;
    this.chainInstanced.frustumCulled = false;
    this.leanGroup.add(this.chainInstanced);

    const beltToothGeom = new THREE.BoxGeometry(0.0108, 0.0036, 0.0052);
    beltToothGeom.translate(0, -0.0030, 0);
    this.beltToothSolidMat = m.priorityDarkAlloy;
    this.chainRollersInstanced = new THREE.InstancedMesh(
      beltToothGeom,
      this.beltToothSolidMat,
      linkCount
    );
    this.chainRollersInstanced.frustumCulled = false;
    this.leanGroup.add(this.chainRollersInstanced);

    // 4. `Drivetrain X-Ray` (`X`) Cutaway Overlay + Four-Bar Cobalt Linkage + Amber Torque Arc
    this.xrayEnabled = false;
    this.xrayOverlayGroup = new THREE.Group();
    this.xrayOverlayGroup.name = "GBikeXrayOverlay";
    this.xrayOverlayGroup.visible = false;
    this.leanGroup.add(this.xrayOverlayGroup);

    this.xrayChainguardMat = new THREE.MeshPhysicalMaterial({
      color: "#F9AB00",
      roughness: 0.14,
      metalness: 0.05,
      transmission: 0.42,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    this.xrayChainPlateMat = new THREE.MeshStandardMaterial({
      color: "#38bdf8",
      emissive: "#0284c7",
      emissiveIntensity: 0.55,
      roughness: 0.22,
      metalness: 0.75,
    });
    this.xrayChainRollerMat = new THREE.MeshStandardMaterial({
      color: "#facc15",
      emissive: "#ca8a04",
      emissiveIntensity: 0.45,
      roughness: 0.20,
      metalness: 0.85,
    });

    const edgeMat = new THREE.LineBasicMaterial({
      color: "#fef08a",
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    this.xrayChainguardEdgeLines = new THREE.LineSegments(
      new THREE.EdgesGeometry(this.chainguardMesh.geometry, 26),
      edgeMat
    );
    this.xrayChainguardEdgeLines.position.copy(this.chainguardMesh.position);
    this.xrayChainguardEdgeLines.renderOrder = 2;
    this.xrayOverlayGroup.add(this.xrayChainguardEdgeLines);

    const rodMat = new THREE.MeshBasicMaterial({
      color: "#38bdf8",
      transparent: true,
      opacity: 0.92,
      depthTest: false,
    });
    const jointMat = new THREE.MeshBasicMaterial({ color: "#e0f2fe", depthTest: false });
    const rodUnitGeom = new THREE.CylinderGeometry(0.0052, 0.0052, 1.0, 10);
    const jointSphereGeom = new THREE.SphereGeometry(0.011, 12, 10);

    this.xrayThighRod = new THREE.Mesh(rodUnitGeom, rodMat);
    this.xrayShinRod = new THREE.Mesh(rodUnitGeom, rodMat);
    this.xrayFootRod = new THREE.Mesh(rodUnitGeom, rodMat);
    for (const rod of [this.xrayThighRod, this.xrayShinRod, this.xrayFootRod]) {
      rod.position.copy(this.bbPos);
      rod.scale.set(1, 0.01, 1);
    }
    this.xrayJointDotsInstanced = new THREE.InstancedMesh(jointSphereGeom, jointMat, 4);
    this.xrayJointDotsInstanced.frustumCulled = false;
    _mat4.makeTranslation(this.bbPos.x, this.bbPos.y, this.bbPos.z);
    for (let j = 0; j < 4; j++) {
      this.xrayJointDotsInstanced.setMatrixAt(j, _mat4);
    }
    this.xrayJointDotsInstanced.instanceMatrix.needsUpdate = true;

    for (const xm of [
      this.xrayThighRod,
      this.xrayShinRod,
      this.xrayFootRod,
      this.xrayJointDotsInstanced,
    ]) {
      xm.visible = false;
      xm.renderOrder = 12;
      this.xrayOverlayGroup.add(xm);
    }

    this.xrayTorquePivot = new THREE.Group();
    this.xrayTorquePivot.position.set(driveX + 0.026, this.bbPos.y, this.bbPos.z);
    this.xrayTorqueArcMat = new THREE.MeshBasicMaterial({
      color: "#f59e0b",
      transparent: true,
      opacity: 0.94,
      depthTest: false,
    });
    const arcSweep = Math.PI * 0.64;
    const arcRadius = 0.118;
    const torqueArc = new THREE.Mesh(
      new THREE.TorusGeometry(arcRadius, 0.0046, 8, 28, arcSweep),
      this.xrayTorqueArcMat
    );
    torqueArc.rotation.y = Math.PI * 0.5;
    torqueArc.renderOrder = 13;
    const arrowTip = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.028, 10), this.xrayTorqueArcMat);
    arrowTip.position.set(0, Math.sin(arcSweep) * arcRadius, Math.cos(arcSweep) * arcRadius);
    arrowTip.rotation.x = -(arcSweep + Math.PI * 0.5);
    arrowTip.renderOrder = 13;
    this.xrayTorquePivot.add(torqueArc, arrowTip);
    this.xrayOverlayGroup.add(this.xrayTorquePivot);
  }

  _createPriorityPedalAssembly(sideSign) {
    const m = this.materials;
    const group = new THREE.Group();
    const bucket = sideSign > 0 ? this._proceduralBuckets.pedalR : this._proceduralBuckets.pedalL;

    const spindleLen = 0.058;
    const spindle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0055, 0.0055, spindleLen, 10).rotateZ(Math.PI / 2),
      m.prioritySilverBrushed
    );
    spindle.position.x = sideSign * spindleLen * 0.5;
    group.add(spindle);
    bucket.push(spindle);

    const platform = new THREE.Group();
    platform.position.x = sideSign * 0.060; // total |x| = 0.096 + 0.060 = 0.156m === KIN_CONSTANTS.pedalStanceX!

    const treadBlock = new THREE.Mesh(
      new THREE.BoxGeometry(0.082, 0.022, 0.094),
      m.priorityMatteBlack
    );
    treadBlock.castShadow = true;
    platform.add(treadBlock);
    bucket.push(treadBlock);

    for (const zSide of [-1, 1]) {
      const refl = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.008, 0.004), m.reflectorAmber);
      refl.position.set(0, 0, zSide * 0.048);
      platform.add(refl);
      bucket.push(refl);
    }

    const topAnchor = new THREE.Object3D();
    topAnchor.position.set(0, 0.011, 0);
    platform.add(topAnchor);

    group.add(platform);
    group.userData = { platform, topAnchor };
    return group;
  }

  _buildPrioritySaddleAndKickstand() {
    const m = this.materials;

    // 1. Plush Google Red Ergonomic Cruiser Saddle + Black Undercarriage & Rails
    const saddleGroup = new THREE.Group();
    saddleGroup.position.copy(this.saddleTopPos);
    this.saddleGroup = saddleGroup;

    const cushion = new THREE.Mesh(new THREE.SphereGeometry(0.112, 20, 14), m.priorityRedSaddle);
    cushion.scale.set(1.02, 0.34, 1.24);
    cushion.position.set(0, -0.018, 0.014);
    cushion.castShadow = true;

    const nose = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.092, 8, 12), m.priorityRedSaddle);
    nose.rotation.x = Math.PI * 0.47;
    nose.position.set(0, -0.016, -0.086);
    nose.castShadow = true;

    const underPan = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.024, 0.048), m.priorityMatteBlack);
    underPan.position.set(0, -0.046, -0.006);

    saddleGroup.add(cushion, nose, underPan);
    this._proceduralBuckets.saddle.push(cushion, nose, underPan);
    this.saddleSprings = [];
    this.leanGroup.add(saddleGroup);

    // 2. Folded Matte-Black Left Rear-Stay Kickstand (`z = +0.358..+0.512m`, >= 65mm heel/crank clearance!)
    this.kickstandSegA = new THREE.Vector3(-0.046, 0.306, 0.358);
    this.kickstandSegB = new THREE.Vector3(-0.054, 0.286, 0.512);
    this.kickstandRadius = 0.0060;

    const kickLeg = createTubeFromPoints(
      [this.kickstandSegA.toArray(), this.kickstandSegB.toArray()],
      0.0060,
      6,
      10,
      m.priorityMatteBlack
    );
    this.leanGroup.add(kickLeg);
    this._proceduralBuckets.frame.push(kickLeg);
  }

  /**
   * Attaches all 13 articulated 2-manifold Blender sub-meshes from `priority_gbike_v9.glb`
   * onto the exact Priority V9 kinematic pivots using a single shared 2K PBR material.
   */
  attachPriorityGbikeV9Glb(gltfScene) {
    if (!gltfScene || this._priorityV9GlbAttached) return;

    const byName = new Map();
    let sharedPbrMat = null;

    gltfScene.traverse((node) => {
      if (!node || !node.name || SHADOW_PLANE_NAME_RE.test(node.name)) return;
      if (node.isMesh) {
        byName.set(node.name.toLowerCase(), node);
        if (!sharedPbrMat && node.material) {
          sharedPbrMat = node.material.clone();
          sharedPbrMat.name = "Priority_GBike_V9_SharedPBR";
          sharedPbrMat.envMapIntensity = 0.42;
          sharedPbrMat.side = THREE.FrontSide;
          for (const texKey of ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap"]) {
            const t = sharedPbrMat[texKey];
            if (t) t.anisotropy = 8;
          }
          if (sharedPbrMat.roughnessMap && !sharedPbrMat.aoMap) {
            sharedPbrMat.aoMap = sharedPbrMat.roughnessMap;
            sharedPbrMat.aoMapIntensity = 0.85;
          }
        }
      }
    });

    const makeMesh = (exactLowerName, castShadow = true) => {
      const src = byName.get(exactLowerName);
      if (!src || !src.geometry) return null;
      const g = src.geometry;
      if (g.attributes.uv && !g.attributes.uv1) {
        g.setAttribute("uv1", g.attributes.uv);
      }
      const mesh = new THREE.Mesh(g, sharedPbrMat || src.material);
      mesh.name = src.name;
      mesh.position.set(0, 0, 0);
      mesh.rotation.set(0, 0, 0);
      mesh.scale.set(1, 1, 1);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      return mesh;
    };

    const hideBucket = (arr) => {
      for (const obj of arr || []) {
        if (!obj) continue;
        obj.visible = false;
        if (obj.parent) obj.parent.remove(obj);
      }
    };

    let attachedCount = 0;

    // 1. Frame + Rear Fender + QR Decal + `"PRIORITY"` Stay + Blue Rear Cable + Kickstand
    const frameMesh = makeMesh("priority_frame_v9");
    if (frameMesh) {
      this.leanGroup.add(frameMesh);
      hideBucket(this._proceduralBuckets.frame);
      attachedCount++;
    }

    // 2. Seamless Sculpted Google Yellow Belt/Chainguard (`0` UV seams, wired to `setXrayMode`!)
    const cgMesh = makeMesh("priority_chainguard_v9", !this.xrayEnabled);
    if (cgMesh) {
      cgMesh.position.set(BIKE_CONSTANTS.driveSideX + 0.007, this.bbPos.y, this.bbPos.z);
      cgMesh.receiveShadow = true;
      if (this.chainguardMesh) {
        this.chainguardMesh.visible = false;
        if (this.chainguardMesh.parent) this.chainguardMesh.parent.remove(this.chainguardMesh);
      }
      this.leanGroup.add(cgMesh);
      this.chainguardSolidMat = sharedPbrMat || cgMesh.material;
      this.chainguardMesh = cgMesh;
      this.hasGlbChainGuard = true;
      if (this.xrayEnabled) {
        cgMesh.material = this.xrayChainguardMat;
      }
      if (this.xrayChainguardEdgeLines) {
        this.xrayChainguardEdgeLines.geometry.dispose();
        this.xrayChainguardEdgeLines.geometry = new THREE.EdgesGeometry(cgMesh.geometry, 26);
        this.xrayChainguardEdgeLines.position.copy(cgMesh.position);
      }
      attachedCount++;
    }

    // 3. Rear Axle Shimano Nexus / Trainer Clamp Skewer Nuts (`|x| = 0.106m`)
    const nutsMesh = makeMesh("priority_rearaxlenuts_v9");
    if (nutsMesh) {
      nutsMesh.name = "GBike_RearAxleSkewerNuts_V8";
      nutsMesh.position.set(0, this.axleY, this.rearAxleZ);
      if (this.rearSkewerNutsMesh) {
        this.rearSkewerNutsMesh.name = "GBike_RearAxleSkewerNuts_ProceduralHidden";
        this.rearSkewerNutsMesh.visible = false;
        if (this.rearSkewerNutsMesh.parent) this.rearSkewerNutsMesh.parent.remove(this.rearSkewerNutsMesh);
      }
      this.rearSkewerNutsMesh = nutsMesh;
      this.leanGroup.add(nutsMesh);
      attachedCount++;
    }

    // 4. Spinning Rear & Front Priority Cruiser Wheels (Blue tires, silver rims, 36 spokes, spoke reflectors)
    const rWheelMesh = makeMesh("priority_wheel_rear_v9");
    if (rWheelMesh) {
      hideBucket(this._proceduralBuckets.rearWheel);
      this.rearWheel.add(rWheelMesh);
      attachedCount++;
    }
    const fWheelMesh = makeMesh("priority_wheel_front_v9");
    if (fWheelMesh) {
      hideBucket(this._proceduralBuckets.frontWheel);
      this.frontWheel.add(fWheelMesh);
      attachedCount++;
    }

    // 5. Steerable Red Fork + Green Front Fender + Silver Spacers + Red 4-Bolt Stem + Silver Bars + Blue Grips
    const steerMesh = makeMesh("priority_steerassembly_v9");
    if (steerMesh) {
      hideBucket(this._proceduralBuckets.steer);
      const glbSplit = splitGeometryByTrianglePredicate(steerMesh.geometry, isPriorityCelebrationOccludedSteerTri);
      steerMesh.geometry = glbSplit.keptGeom;
      const glbOccBar = new THREE.Mesh(glbSplit.extractedGeom, steerMesh.material);
      glbOccBar.name = "Priority_CelebrationOccludedHandlebar_V9";
      glbOccBar.castShadow = true;
      glbOccBar.receiveShadow = true;
      glbOccBar.visible = !this._celebrationHandlebarHidden;
      this.celebrationOccludedHandlebarMesh = glbOccBar;
      this.steerVisualAnchor.add(steerMesh, glbOccBar);
      attachedCount++;
    }

    // 6. Priority Rotary Ring Bell + Articulated Striker Lever
    const bellMesh = makeMesh("priority_bell_v9");
    if (bellMesh) {
      hideBucket(this._proceduralBuckets.bell);
      this.bellGroup.add(bellMesh);
      attachedCount++;
    }
    const bellLeverMesh = makeMesh("priority_bell_lever_v9");
    if (bellLeverMesh) {
      hideBucket(this._proceduralBuckets.bellStriker);
      this.bellStrikerPivot.add(bellLeverMesh);
      attachedCount++;
    }

    // 7. Headtube-Mounted Stepped Google Red Welded Wire Basket (`16-slot TPU 8i` rack stays active inside!)
    const basketMesh = makeMesh("priority_basket_v9");
    if (basketMesh) {
      hideBucket(this._proceduralBuckets.basket);
      this.basketGroup.add(basketMesh);
      attachedCount++;
    }

    // 8. Forged Silver Crank Arms + 44T Front Belt Sprocket + Counter-Rotating Commuter Pedals
    const crankMesh = makeMesh("priority_crank_v9");
    if (crankMesh) {
      hideBucket(this._proceduralBuckets.crank);
      this.crankGroup.add(crankMesh);
      attachedCount++;
    }
    const pedalRMesh = makeMesh("priority_pedal_r_v9");
    if (pedalRMesh) {
      hideBucket(this._proceduralBuckets.pedalR);
      this.rightPedalGroup.add(pedalRMesh);
      attachedCount++;
    }
    const pedalLMesh = makeMesh("priority_pedal_l_v9");
    if (pedalLMesh) {
      hideBucket(this._proceduralBuckets.pedalL);
      this.leftPedalGroup.add(pedalLMesh);
      attachedCount++;
    }

    // 9. Plush Google Red Ergonomic Cruiser Saddle
    const saddleMesh = makeMesh("priority_saddle_v9");
    if (saddleMesh) {
      hideBucket(this._proceduralBuckets.saddle);
      this.saddleGroup.add(saddleMesh);
      this._v9SaddleAttached = true;
      attachedCount++;
    }

    if (attachedCount > 0) {
      this._priorityV9GlbAttached = true;
      stripAttachedShadowPlanesAndEnableCast(this.root, this.xrayOverlayGroup);
      if (this.chainguardMesh) {
        this.chainguardMesh.castShadow = !this.xrayEnabled;
      }
      this.root.updateMatrixWorld(true);
    }
    return Boolean(this._priorityV9GlbAttached);
  }

  /**
   * Safe compatibility no-ops on `"priority_v9"` so `core.js` & `test_kin_and_game.mjs` can call
   * `attachVehiclesV2Glb` / `attachCockpitPropsGlb` unconditionally across both bike variants.
   */
  attachVehiclesV2Glb(_gltfScene) {}
  attachCockpitPropsGlb(_gltfScene) {}
  attachCockpitGlb(_gltfScene) {}

  setCollectedTpuVisualCount(count) {
    const clamped = THREE.MathUtils.clamp(Math.round(Number(count) || 0), 0, MAX_BASKET_TPUS);
    this._collectedTpuCount = clamped;
    this._syncBasketTpuVisuals(clamped, this._lastSimTime || 0);
  }

  _syncBasketTpuVisuals(visibleBoards, simTime = 0) {
    const count = THREE.MathUtils.clamp(visibleBoards | 0, 0, MAX_BASKET_TPUS);
    if (this.basketTpuUsingInstanced && this.basketTpuInstancedBatches) {
      for (const inst of this.basketTpuInstancedBatches) {
        inst.count = count;
      }
      if (count > 0) {
        _scale.setScalar(0.145);
        for (let i = 0; i < count; i++) {
          const slot = this.basketTpuSlots[i];
          _pos.set(
            slot.position.x,
            slot.userData.baseY + Math.sin(simTime * 5.2 + i * 0.65) * 0.0018,
            slot.position.z
          );
          _quat.setFromEuler(slot.rotation);
          _mat4.compose(_pos, _quat, _scale);
          for (const inst of this.basketTpuInstancedBatches) {
            inst.setMatrixAt(i, _mat4);
          }
        }
        for (const inst of this.basketTpuInstancedBatches) {
          inst.instanceMatrix.needsUpdate = true;
          inst.computeBoundingBox();
        }
      }
    } else if (this.basketTpuSlots) {
      for (let i = 0; i < this.basketTpuSlots.length; i++) {
        const slot = this.basketTpuSlots[i];
        slot.visible = i < count;
        if (slot.visible) {
          slot.position.y = slot.userData.baseY + Math.sin(simTime * 5.2 + i * 0.65) * 0.0018;
        }
      }
    }
  }

  attachBasketTpuTemplate(tpuTemplateNode) {
    if (!tpuTemplateNode || !this.basketTpuSlots || this.basketTpuUsingInstanced) return;
    tpuTemplateNode.updateMatrixWorld(true);
    const invRoot = tpuTemplateNode.matrixWorld.clone().invert();
    this.basketTpuInstancedBatches = [];

    tpuTemplateNode.traverse((ch) => {
      if (!ch.isMesh || !ch.geometry || !ch.material) return;
      const relMat = invRoot.clone().multiply(ch.matrixWorld);
      const geom = ch.geometry.clone();
      geom.applyMatrix4(relMat);
      const mat = ch.material.clone();
      if (mat.emissive) {
        mat.emissive.set("#0284c7");
        mat.emissiveIntensity = 0.05;
      }
      const inst = new THREE.InstancedMesh(geom, mat, MAX_BASKET_TPUS);
      inst.castShadow = false;
      inst.receiveShadow = true;
      inst.count = 0;
      inst.frustumCulled = false;
      this.basketTpuStackGroup.add(inst);
      this.basketTpuInstancedBatches.push(inst);
    });

    if (this.basketTpuInstancedBatches.length > 0) {
      this.basketTpuUsingInstanced = true;
      for (const slot of this.basketTpuSlots) {
        slot.visible = false;
      }
      this._syncBasketTpuVisuals(this._collectedTpuCount, this._lastSimTime || 0);
    }
  }

  getPedalWorldPosition(side = "right", out = new THREE.Vector3()) {
    const isLeft =
      side === "left" || side === "L" || side === "l" || (typeof side === "number" && side < 0);
    const pedalGrp = isLeft ? this.leftPedalGroup : this.rightPedalGroup;
    if (pedalGrp?.userData?.topAnchor) {
      pedalGrp.userData.topAnchor.getWorldPosition(out);
    } else if (pedalGrp) {
      pedalGrp.getWorldPosition(out);
    }
    return out;
  }

  setXrayMode(enabled) {
    const next = Boolean(enabled);
    this.xrayEnabled = next;
    if (this.chainguardMesh) {
      this.chainguardMesh.material = next ? this.xrayChainguardMat : this.chainguardSolidMat;
      this.chainguardMesh.castShadow = !next;
    }
    if (this.chainInstanced) {
      this.chainInstanced.material = next ? this.xrayChainPlateMat : this.beltSolidMat;
    }
    if (this.chainRollersInstanced) {
      this.chainRollersInstanced.material = next ? this.xrayChainRollerMat : this.beltToothSolidMat;
    }
    if (this.xrayOverlayGroup) {
      this.xrayOverlayGroup.visible = next;
    }
  }

  setCelebrationHandlebarHidden(hidden) {
    const hide = Boolean(hidden);
    if (this._celebrationHandlebarHidden === hide) return;
    this._celebrationHandlebarHidden = hide;
    if (this._priorityV9GlbAttached) {
      if (this.celebrationOccludedHandlebarMesh) {
        this.celebrationOccludedHandlebarMesh.visible = !hide;
      }
    } else if (this._proceduralCelebrationOccludedSteerParts) {
      for (const p of this._proceduralCelebrationOccludedSteerParts) {
        if (p) p.visible = !hide;
      }
    }
    if (this.bellGroup) {
      this.bellGroup.visible = !hide;
    }
  }

  updateXrayLinkage({
    hipLocal,
    rightKneeLocal,
    rightAnkleLocal,
    rightPedalLocal,
    crankRad = 0,
    pedalTorqueNm = 12,
  } = {}) {
    if (!this.xrayEnabled || !this.xrayOverlayGroup) return;

    if (hipLocal && rightKneeLocal && rightAnkleLocal && rightPedalLocal) {
      this.xrayThighRod.visible = true;
      this.xrayShinRod.visible = true;
      this.xrayFootRod.visible = true;
      this.xrayJointDotsInstanced.visible = true;
      _quat.identity();
      _scale.setScalar(1.0);

      _tmpA.set(hipLocal.x + 0.018, hipLocal.y, hipLocal.z);
      _tmpB.set(rightKneeLocal.x + 0.018, rightKneeLocal.y, rightKneeLocal.z);
      orientTaperedLimb(this.xrayThighRod, _tmpA, _tmpB, 1.0);
      _mat4.compose(_tmpA, _quat, _scale);
      this.xrayJointDotsInstanced.setMatrixAt(0, _mat4);
      _mat4.compose(_tmpB, _quat, _scale);
      this.xrayJointDotsInstanced.setMatrixAt(1, _mat4);

      _tmpA.copy(_tmpB);
      _tmpB.set(rightAnkleLocal.x + 0.018, rightAnkleLocal.y, rightAnkleLocal.z);
      orientTaperedLimb(this.xrayShinRod, _tmpA, _tmpB, 1.0);
      _mat4.compose(_tmpB, _quat, _scale);
      this.xrayJointDotsInstanced.setMatrixAt(2, _mat4);

      _tmpA.copy(_tmpB);
      _tmpB.set(rightPedalLocal.x + 0.018, rightPedalLocal.y, rightPedalLocal.z);
      orientTaperedLimb(this.xrayFootRod, _tmpA, _tmpB, 1.0);
      _mat4.compose(_tmpB, _quat, _scale);
      this.xrayJointDotsInstanced.setMatrixAt(3, _mat4);
      this.xrayJointDotsInstanced.instanceMatrix.needsUpdate = true;
    }

    if (this.xrayTorquePivot) {
      this.xrayTorquePivot.rotation.x = -crankRad + 0.35;
      const tNorm = THREE.MathUtils.clamp((pedalTorqueNm - 4.0) / 24.0, 0.15, 1.25);
      const s = 0.88 + 0.24 * tNorm;
      this.xrayTorquePivot.scale.set(1.0, s, s);
      this.xrayTorqueArcMat.opacity = 0.62 + 0.34 * Math.min(1.0, tNorm);
    }
  }

  getMinKickstandClearanceM(extraLocalPoints = []) {
    this.root.updateWorldMatrix(true, true);
    const invLean = _mat4.copy(this.leanGroup.matrixWorld).invert();
    const samples = [];

    this.leftPedalGroup.getWorldPosition(_tmpB).applyMatrix4(invLean);
    samples.push(_tmpB.clone());
    samples.push(_tmpB.clone().lerp(this.bbPos, 0.5));
    samples.push(
      new THREE.Vector3(
        this.leftPedalTopLocal.x + 0.041,
        this.leftPedalTopLocal.y - 0.011,
        this.leftPedalTopLocal.z + 0.049
      )
    );

    if (extraLocalPoints) {
      if (extraLocalPoints.isVector3) {
        samples.push(extraLocalPoints);
      } else if (Array.isArray(extraLocalPoints)) {
        for (const pt of extraLocalPoints) {
          if (pt && pt.isVector3) samples.push(pt);
        }
      }
    }

    let minDist = Infinity;
    for (const p of samples) {
      const d = Math.sqrt(pointToSegmentDistSq(p, this.kickstandSegA, this.kickstandSegB)) - this.kickstandRadius;
      if (d < minDist) minDist = d;
    }
    return Math.max(0, minDist);
  }

  update({
    wheelRad = 0,
    rearWheelRad,
    frontWheelRad,
    crankRad = 0,
    steerRad = 0,
    bankRad = 0,
    anklingAmpRad = 0.24,
    bellStrikeElapsed = 99,
    suspensionCompressionMm = 0,
    wheeliePitchRad,
    pelicanSurprisePhase,
    trainerFrameShudderRollRad,
    tpusCollected,
    simTime = 0,
  } = {}) {
    this._lastSimTime = simTime;
    const effWheeliePitch = THREE.MathUtils.clamp(
      Number.isFinite(Number(wheeliePitchRad))
        ? Number(wheeliePitchRad)
        : Number(state.kinematics?.wheeliePitchRad) || 0.0,
      -0.08,
      0.22
    );
    const effSurprise = THREE.MathUtils.clamp(
      Number.isFinite(Number(pelicanSurprisePhase))
        ? Number(pelicanSurprisePhase)
        : Number(state.kinematics?.pelicanSurprisePhase) || 0.0,
      0.0,
      1.0
    );
    const effShudderRoll = THREE.MathUtils.clamp(
      Number.isFinite(Number(trainerFrameShudderRollRad))
        ? Number(trainerFrameShudderRollRad)
        : Number(state.kinematics?.trainerFrameShudderRollRad) || 0.0,
      -0.04,
      0.04
    );

    this.leanGroup.rotation.order = "ZXY";
    this.leanGroup.rotation.z = -bankRad + effShudderRoll;
    this.leanGroup.rotation.x = effWheeliePitch;
    this.steerGroup.rotation.y = steerRad;
    this.basketPropsGroup.rotation.z = -steerRad * 0.14;

    if (tpusCollected !== undefined && tpusCollected !== null) {
      this._collectedTpuCount = THREE.MathUtils.clamp(
        Math.round(Number(tpusCollected) || 0),
        0,
        MAX_BASKET_TPUS
      );
    }
    this._syncBasketTpuVisuals(this._collectedTpuCount, simTime);

    const suspM = THREE.MathUtils.clamp((suspensionCompressionMm || 0) * 0.001, 0, 0.0040);
    if (this.saddleGroup) {
      this.saddleGroup.position.set(
        this.saddleTopPos.x,
        this.saddleTopPos.y - suspM,
        this.saddleTopPos.z
      );
      this.saddleGroup.rotation.x = suspM * 2.8;
    }

    const rWheelRad = Number.isFinite(rearWheelRad) ? rearWheelRad : wheelRad;
    const fWheelRad = Number.isFinite(frontWheelRad) ? frontWheelRad : wheelRad;
    this.rearWheel.rotation.x = -rWheelRad;
    this.frontWheel.rotation.x = -fWheelRad;

    this.crankGroup.rotation.x = -crankRad;

    const rightAnkleTilt = Math.sin(crankRad) * anklingAmpRad;
    const leftAnkleTilt = Math.sin(crankRad + Math.PI) * anklingAmpRad;
    this.rightPedalGroup.rotation.x = +crankRad + rightAnkleTilt;
    this.leftPedalGroup.rotation.x = +crankRad + leftAnkleTilt;

    // Advance unilateral matte-black toothed Gates Carbon Drive belt (`x = +0.068m`, 0.00% slip!)
    const beltTravel = crankRad * KIN_CONSTANTS.chainringRadiusM;
    const linkCount = BIKE_CONSTANTS.chainLinks;
    const pitchHolder = { pitch: 0 };

    for (let i = 0; i < linkCount; i++) {
      const uSeg = (i + 0.5) / linkCount + beltTravel / this.chainLength;
      this._sampleAnalyticalChain(uSeg, _pos, pitchHolder);
      _quat.setFromAxisAngle(_upX, pitchHolder.pitch);
      _scale.set(1.0, 1.0, 1.0);
      _mat4.compose(_pos, _quat, _scale);
      this.chainInstanced.setMatrixAt(i, _mat4);

      const uTooth = i / linkCount + beltTravel / this.chainLength;
      this._sampleAnalyticalChain(uTooth, _pos, pitchHolder);
      _quat.setFromAxisAngle(_upX, pitchHolder.pitch);
      _mat4.compose(_pos, _quat, _scale);
      this.chainRollersInstanced.setMatrixAt(i, _mat4);
    }
    this.chainInstanced.instanceMatrix.needsUpdate = true;
    this.chainRollersInstanced.instanceMatrix.needsUpdate = true;

    // Rotary Ring Bell Striker Animation
    if (bellStrikeElapsed >= 0 && bellStrikeElapsed < 1.05) {
      const flick1 =
        bellStrikeElapsed < 0.85
          ? -Math.exp(-bellStrikeElapsed * 6.2) * Math.cos(bellStrikeElapsed * 21.0) * 0.52
          : 0.0;
      const dt2 = bellStrikeElapsed - 0.34;
      const flick2 =
        effSurprise > 0.1 && dt2 >= 0 && dt2 < 0.70
          ? -Math.exp(-dt2 * 6.5) * Math.cos(dt2 * 22.0) * 0.50
          : 0.0;
      this.bellStrikerPivot.rotation.x = Math.abs(flick2) > Math.abs(flick1) ? flick2 : flick1;
      const ringEnv =
        Math.exp(-bellStrikeElapsed * 9.0) +
        (effSurprise > 0.1 && dt2 >= 0 ? Math.exp(-dt2 * 9.0) : 0.0);
      this.bellGroup.position.y = this.bellBaseY + ringEnv * Math.cos(bellStrikeElapsed * 95.0) * 0.0020;
    } else {
      this.bellStrikerPivot.rotation.x = 0;
      this.bellGroup.position.y = this.bellBaseY;
    }

    this.root.updateWorldMatrix(true, true);
    const invLean = _mat4.copy(this.leanGroup.matrixWorld).invert();

    this.rightPedalGroup.userData.topAnchor.getWorldPosition(this.rightPedalTopLocal);
    this.rightPedalTopLocal.applyMatrix4(invLean);

    this.leftPedalGroup.userData.topAnchor.getWorldPosition(this.leftPedalTopLocal);
    this.leftPedalTopLocal.applyMatrix4(invLean);

    this.rightGripAnchor.getWorldPosition(this.rightGripWorld);
    this.rightGripLocal.copy(this.rightGripWorld).applyMatrix4(invLean);

    this.leftGripAnchor.getWorldPosition(this.leftGripWorld);
    this.leftGripLocal.copy(this.leftGripWorld).applyMatrix4(invLean);

    this.rightFootPitch = rightAnkleTilt;
    this.leftFootPitch = leftAnkleTilt;
  }
}

/**
 * Companion Priority Campus GBike builder for campus bike corrals (switches cleanly to Classic V6 under `?bike=classic`).
 */
export function createParkedGBikeMesh(materials = {}, opts = {}) {
  if (resolveBikeVariant(opts) === "classic_v6") {
    return createParkedGBikeMeshClassic(materials);
  }
  const pMats = buildPriorityV9Materials(materials);
  const g = new THREE.Group();
  const axleY = 0.334;
  const rZ = +0.52;
  const fZ = -0.52;

  const blueTireGeoms = [];
  const silverGeoms = [];
  const yellowGeoms = [];
  const greenGeoms = [];
  const redGeoms = [];
  const blueGripGeoms = [];
  const blackGeoms = [];

  const tmpObj = new THREE.Object3D();
  const pHub = new THREE.Vector3();
  const pRim = new THREE.Vector3();
  const dirVec = new THREE.Vector3();

  const tubeGeom = (pts, rad, tSeg = 14, rSeg = 8) =>
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))),
      tSeg,
      rad,
      rSeg,
      false
    );

  const baseSpoke = new THREE.CylinderGeometry(0.0014, 0.0014, 1.0, 5);
  for (const z of [rZ, fZ]) {
    blueTireGeoms.push(
      new THREE.TorusGeometry(0.3045, 0.0295, 12, 32).rotateY(Math.PI / 2).translate(0, axleY, z)
    );
    silverGeoms.push(
      new THREE.TorusGeometry(0.268, 0.0125, 10, 28).rotateY(Math.PI / 2).translate(0, axleY, z),
      new THREE.CylinderGeometry(0.024, 0.024, 0.068, 12).rotateZ(Math.PI / 2).translate(0, axleY, z)
    );
    for (let i = 0; i < 18; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const crossDir = Math.floor(i / 2) % 2 === 0 ? 1 : -1;
      const rimAng = (i / 18) * Math.PI * 2;
      const hubAng = rimAng + crossDir * 0.55;
      pHub.set(side * 0.028, axleY + Math.sin(hubAng) * 0.024, z + Math.cos(hubAng) * 0.024);
      pRim.set(side * 0.002, axleY + Math.sin(rimAng) * 0.258, z + Math.cos(rimAng) * 0.258);
      dirVec.subVectors(pRim, pHub);
      const len = dirVec.length();
      tmpObj.position.addVectors(pHub, pRim).multiplyScalar(0.5);
      tmpObj.quaternion.setFromUnitVectors(_upY, dirVec.normalize());
      tmpObj.scale.set(1, len, 1);
      tmpObj.updateMatrix();
      silverGeoms.push(baseSpoke.clone().applyMatrix4(tmpObj.matrix));
    }
  }
  baseSpoke.dispose();

  // Yellow Step-Through Priority Frame + Chainguard
  yellowGeoms.push(
    tubeGeom([[0, 0.692, -0.402], [0, 0.806, -0.365]], 0.021, 6, 12),
    tubeGeom([[0, 0.280, +0.080], [0, 0.630, +0.198]], 0.0175, 8, 10),
    tubeGeom([[0, 0.382, -0.095], [0, 0.378, +0.010], [0, 0.376, +0.116]], 0.015, 8, 10),
    tubeGeom([[0, 0.728, -0.390], [0, 0.530, -0.220], [0, 0.320, -0.040], [0, 0.280, +0.080]], 0.020, 16, 12),
    new THREE.CylinderGeometry(0.026, 0.026, 0.072, 14).rotateZ(Math.PI / 2).translate(0, 0.280, +0.080),
    createSeamlessPriorityChainguardGeometry().translate(0.068, 0.280, +0.080)
  );
  for (const side of [-1, 1]) {
    yellowGeoms.push(
      tubeGeom([[side * 0.026, 0.280, +0.080], [side * 0.046, 0.305, +0.300], [side * 0.052, axleY, rZ]], 0.011, 10, 8),
      tubeGeom([[side * 0.018, 0.595, +0.188], [side * 0.044, 0.495, +0.320], [side * 0.052, axleY + 0.010, rZ]], 0.0095, 10, 8)
    );
  }

  // Red Fork + Red Stem + Red Headtube Wire Basket
  redGeoms.push(
    tubeGeom([[-0.048, 0.652, -0.422], [0, 0.676, -0.415], [+0.048, 0.652, -0.422]], 0.016, 8, 10),
    new THREE.BoxGeometry(0.042, 0.038, 0.064).translate(0, 0.888, -0.368)
  );
  for (const side of [-1, 1]) {
    redGeoms.push(
      tubeGeom([[side * 0.048, 0.652, -0.422], [side * 0.053, 0.505, -0.472], [side * 0.052, axleY, fZ]], 0.013, 10, 10)
    );
  }
  const bx = 0;
  const by = 0.805;
  const bz = -0.56;
  for (let t = 0; t < 4; t++) {
    const u = t / 3;
    const hy = by - 0.080 + u * 0.168;
    const hw = THREE.MathUtils.lerp(0.115, 0.142, u);
    const hd = THREE.MathUtils.lerp(0.090, 0.112, u);
    redGeoms.push(
      tubeGeom(
        [[-hw, hy, bz - hd], [+hw, hy, bz - hd], [+hw, hy, bz + hd], [-hw, hy, bz + hd], [-hw, hy, bz - hd]],
        0.0036,
        16,
        5
      )
    );
  }
  redGeoms.push(new THREE.BoxGeometry(0.064, 0.088, 0.064).translate(0, by - 0.032, bz + 0.140));

  // Silver Seatpost & Swept Handlebars + Blue Grips + Deployed Matte-Black Kickstand
  silverGeoms.push(
    new THREE.CylinderGeometry(0.021, 0.021, 0.020, 12).translate(0, 0.632, +0.198),
    tubeGeom([[0, 0.625, +0.196], [0, 0.732, +0.226]], 0.014, 6, 10),
    tubeGeom([[-0.24, 0.90, -0.17], [-0.14, 0.91, -0.32], [0, 0.89, -0.37], [+0.14, 0.91, -0.32], [+0.24, 0.90, -0.17]], 0.011, 20, 8)
  );
  for (const side of [-1, 1]) {
    blueGripGeoms.push(
      tubeGeom([[side * 0.20, 0.905, -0.23], [side * 0.26, 0.898, -0.14]], 0.016, 6, 8)
    );
  }
  blackGeoms.push(
    tubeGeom([[-0.036, 0.280, +0.135], [-0.155, 0.008, +0.170]], 0.006, 6, 8),
    new THREE.BoxGeometry(0.176, 0.006, 0.148).translate(0, by - 0.080, bz)
  );

  // Green Full-Wrap Fenders
  greenGeoms.push(
    createUChannelFenderGeometry({ rMid: 0.348, halfW: 0.031, wallThick: 0.004, lipDrop: 0.014, thetaStart: -1.30, thetaEnd: +1.08, arcSegs: 22 }).translate(0, axleY, rZ),
    createUChannelFenderGeometry({ rMid: 0.348, halfW: 0.031, wallThick: 0.004, lipDrop: 0.014, thetaStart: -0.32, thetaEnd: +1.52, arcSegs: 20 }).translate(0, axleY, fZ)
  );

  const addMerged = (geoms, mat) => {
    const m = new THREE.Mesh(mergeStaticGeometries(geoms), mat);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  };

  addMerged(blueTireGeoms, pMats.priorityBlueTire);
  addMerged(silverGeoms, pMats.prioritySilverBrushed);
  addMerged(yellowGeoms, pMats.priorityYellowFrame);
  addMerged(greenGeoms, pMats.priorityGreenFender);
  addMerged(redGeoms, pMats.priorityRedPaint);
  addMerged(blueGripGeoms, pMats.priorityBlueGrip);
  addMerged(blackGeoms, pMats.priorityMatteBlack);

  const saddleGeom = new THREE.SphereGeometry(0.108, 14, 10);
  saddleGeom.scale(1.02, 0.35, 1.26);
  saddleGeom.translate(0, 0.734, +0.228);
  const saddle = new THREE.Mesh(saddleGeom, pMats.priorityRedSaddle);
  saddle.castShadow = true;
  g.add(saddle);

  return g;
}
