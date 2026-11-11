/**
 * gbike_rig.js — Cohesive Feature-Film Mountain View Four-Color Google Bike (GBike V2).
 *
 * Local Right-Handed Coordinate Frame (y = 0.000m is ground contact plane):
 *   -Z = Forward (front wheel at z = -0.5425m, rear wheel at z = +0.5425m, wheelbase = 1.085m)
 *   +Y = Up      (axle centers at y = 0.334m with 1mm pneumatic micro-contact for R = 0.335m)
 *   +X = Right   (unilateral drivetrain at x = +0.068m = BIKE_CONSTANTS.driveSideX — zero left sprocket)
 *   -X = Left    (folded kickstand tucked aft along left chainstay at z = +0.355..+0.510m for >= 55mm crank clearance)
 *
 * V2 Upgrades:
 *   - 100% clean, airy yellow woven wire-mesh front cruiser basket (ZERO fish, ZERO baguette, ZERO dark drum liner!).
 *   - 16-slot stadium-fanned glowing Google TPU wafer pod rack (`0..16`, strictly empty at `0 / 16` TPUs).
 *   - Seamless V2 GLB attachment (`GBike_Saddle_V2`, `GBike_Basket_V2`, `GBike_Bell_V2`, `GBike_Bell_Lever_V2`,
 *     `GBike_ChainGuard_V2`, `GBike_HeadBadge_V2`) with preserved local pivots & full `Drivetrain X-Ray` compatibility.
 *   - Hydroformed frame weld fillets, 36 brass spoke nipples per wheel, front & rear caliper brakes + routed cables,
 *     and stitched honey-leather saddle fallback.
 */

import * as THREE from "../vendor/three.module.js";
import { BIKE_CONSTANTS, state } from "../contract.js";
import { mergeStaticGeometries, compactRigidGroupMeshes } from "../scenes/materials.js";
import { orientTaperedLimb } from "./ik_solver.js";
import { KIN_CONSTANTS, CHAIN_LOOP_SPEC, getChainLinkPose, createMulberry32 } from "./kin.js";

const MAX_BASKET_TPUS = 16;

let _cachedV6GBikeTextures = null;

function getV6GBikeProceduralTextures() {
  if (_cachedV6GBikeTextures) return _cachedV6GBikeTextures;
  const rng = createMulberry32(0x6b1ce606);

  // 1. Deterministic 64x64 Vulcanized Cruiser Tire Tread Bump Map (circumferential sipes + chevron shoulder blocks)
  const tw = 64;
  const th = 64;
  const tireData = new Uint8Array(tw * th * 4);
  for (let y = 0; y < th; y++) {
    const v = y / th; // across tire cross-section
    for (let x = 0; x < tw; x++) {
      const u = x / tw; // around tire circumference
      const centerRib = Math.cos(v * Math.PI * 6.0) * 0.35;
      const chevron = Math.sin((u * 24.0 + Math.abs(v - 0.5) * 6.0) * Math.PI * 2.0) * 0.45;
      const grit = (rng() - 0.5) * 0.22;
      const h = THREE.MathUtils.clamp(0.52 + 0.28 * (centerRib + chevron) + grit, 0.05, 0.98);
      const byte = Math.round(h * 255);
      const idx = (y * tw + x) * 4;
      tireData[idx] = byte;
      tireData[idx + 1] = byte;
      tireData[idx + 2] = byte;
      tireData[idx + 3] = 255;
    }
  }
  const tireBumpTex = new THREE.DataTexture(tireData, tw, th, THREE.RGBAFormat);
  tireBumpTex.wrapS = THREE.RepeatWrapping;
  tireBumpTex.wrapT = THREE.RepeatWrapping;
  tireBumpTex.repeat.set(18, 2);
  tireBumpTex.needsUpdate = true;

  // 2. Deterministic 32x32 Campus Powder-Coat Micro-Orange-Peel Roughness Map
  const pw = 32;
  const ph = 32;
  const powderData = new Uint8Array(pw * ph * 4);
  for (let i = 0; i < pw * ph; i++) {
    const n = 236 + Math.round((rng() - 0.5) * 26);
    const b = THREE.MathUtils.clamp(n, 210, 255);
    powderData[i * 4] = b;
    powderData[i * 4 + 1] = b;
    powderData[i * 4 + 2] = b;
    powderData[i * 4 + 3] = 255;
  }
  const powderRoughTex = new THREE.DataTexture(powderData, pw, ph, THREE.RGBAFormat);
  powderRoughTex.wrapS = THREE.RepeatWrapping;
  powderRoughTex.wrapT = THREE.RepeatWrapping;
  powderRoughTex.repeat.set(6, 6);
  powderRoughTex.needsUpdate = true;

  // 3. Deterministic 32x32 Circumferential Brushed Aluminum Rim Bump & Metalness Map
  const aw = 32;
  const ah = 32;
  const aluBumpData = new Uint8Array(aw * ah * 4);
  const aluMetalData = new Uint8Array(aw * ah * 4);
  for (let y = 0; y < ah; y++) {
    const streak = Math.round((rng() - 0.5) * 34);
    for (let x = 0; x < aw; x++) {
      const fine = Math.round((rng() - 0.5) * 10);
      const bVal = THREE.MathUtils.clamp(128 + streak + fine, 80, 180);
      const mVal = THREE.MathUtils.clamp(250 + Math.round(fine * 0.4), 240, 255);
      const idx = (y * aw + x) * 4;
      aluBumpData[idx] = bVal;
      aluBumpData[idx + 1] = bVal;
      aluBumpData[idx + 2] = bVal;
      aluBumpData[idx + 3] = 255;
      aluMetalData[idx] = mVal;
      aluMetalData[idx + 1] = mVal;
      aluMetalData[idx + 2] = mVal;
      aluMetalData[idx + 3] = 255;
    }
  }
  const aluBumpTex = new THREE.DataTexture(aluBumpData, aw, ah, THREE.RGBAFormat);
  aluBumpTex.wrapS = THREE.RepeatWrapping;
  aluBumpTex.wrapT = THREE.RepeatWrapping;
  aluBumpTex.repeat.set(12, 3);
  aluBumpTex.needsUpdate = true;

  const aluMetalTex = new THREE.DataTexture(aluMetalData, aw, ah, THREE.RGBAFormat);
  aluMetalTex.wrapS = THREE.RepeatWrapping;
  aluMetalTex.wrapT = THREE.RepeatWrapping;
  aluMetalTex.needsUpdate = true;

  _cachedV6GBikeTextures = { tireBumpTex, powderRoughTex, aluBumpTex, aluMetalTex };
  return _cachedV6GBikeTextures;
}

function createPowderCoatMaterial(name, hexColor, powderRoughTex) {
  return new THREE.MeshPhysicalMaterial({
    name,
    color: hexColor,
    roughness: 0.42,
    roughnessMap: powderRoughTex,
    metalness: 0.06,
    clearcoat: 0.35,
    clearcoatRoughness: 0.28,
    envMapIntensity: 0.55,
  });
}

function buildV6GBikeMaterials(baseMaterials = {}) {
  const tex = getV6GBikeProceduralTextures();
  const frameRed = createPowderCoatMaterial("GBike_PowderCoat_Red", "#C6362C", tex.powderRoughTex);
  const goldYellow = createPowderCoatMaterial("GBike_PowderCoat_Gold", "#DDA52B", tex.powderRoughTex);
  const forkBlue = createPowderCoatMaterial("GBike_PowderCoat_Blue", "#2A62AD", tex.powderRoughTex);
  const fenderGreen = createPowderCoatMaterial("GBike_PowderCoat_Green", "#2C854A", tex.powderRoughTex);

  const vulcanizedRubber = new THREE.MeshStandardMaterial({
    name: "Cruiser_Vulcanized_Rubber",
    color: "#1e2124",
    roughness: 0.88,
    metalness: 0.0,
    bumpMap: tex.tireBumpTex,
    bumpScale: 0.0052,
    envMapIntensity: 0.0,
  });

  const brushedRim = new THREE.MeshStandardMaterial({
    name: "GBike_Brushed_Aluminum_Rim",
    color: "#d6dbe2",
    metalness: 0.86,
    metalnessMap: tex.aluMetalTex,
    roughness: 0.24,
    bumpMap: tex.aluBumpTex,
    bumpScale: 0.0018,
    envMapIntensity: 0.78,
  });

  const brushedAlloy = new THREE.MeshStandardMaterial({
    name: "GBike_Brushed_Alloy",
    color: "#cdd3dc",
    metalness: 0.86,
    metalnessMap: tex.aluMetalTex,
    roughness: 0.24,
    bumpMap: tex.aluBumpTex,
    bumpScale: 0.0014,
    envMapIntensity: 0.74,
  });

  const satinChrome = new THREE.MeshStandardMaterial({
    name: "GBike_Satin_Chrome",
    color: "#dde2e8",
    metalness: 0.86,
    metalnessMap: tex.aluMetalTex,
    roughness: 0.22,
    envMapIntensity: 0.82,
  });

  const matteWhitewall = new THREE.MeshStandardMaterial({
    name: "Cruiser_Matte_Cream_Sidewall",
    color: "#ece6da",
    roughness: 0.84,
    metalness: 0.0,
    bumpMap: tex.tireBumpTex,
    bumpScale: 0.0015,
    envMapIntensity: 0.0,
  });

  return {
    ...baseMaterials,
    gbikeFrameRed: frameRed,
    gbikeYellow: goldYellow,
    gbikeForkBlue: forkBlue,
    gbikeGreen: fenderGreen,
    gbikeCruiserTire: vulcanizedRubber,
    gbikeTireRubber: vulcanizedRubber,
    gbikeBrushedRim: brushedRim,
    gbikeAlloy: brushedAlloy,
    gbikeChrome: satinChrome,
    gbikeWhitewall: matteWhitewall,
  };
}

const SHADOW_PLANE_NAME_RE = /contact.?shadow|shadow.?plane|ground.?shadow|_ao\b|contact_ao|blob.?shadow/i;

function stripAttachedShadowPlanesAndEnableCast(rootObj, skipSubtree = null) {
  if (!rootObj) return;
  const toRemove = [];
  const visit = (obj) => {
    if (!obj || obj === skipSubtree) return;
    const label = `${obj.name || ""} ${obj.material?.name || ""}`;
    if (SHADOW_PLANE_NAME_RE.test(label)) {
      obj.visible = false;
      toRemove.push(obj);
      return;
    }
    if (obj.isMesh || obj.isInstancedMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
    if (obj.children) {
      for (let i = 0; i < obj.children.length; i++) {
        visit(obj.children[i]);
      }
    }
  };
  visit(rootObj);
  for (const rem of toRemove) {
    if (rem.parent) rem.parent.remove(rem);
  }
}

const _mat4 = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _upX = new THREE.Vector3(1, 0, 0);
const _tmpA = new THREE.Vector3();
const _tmpB = new THREE.Vector3();
const _segAB = new THREE.Vector3();
const _segAP = new THREE.Vector3();

function createTubeFromPoints(points, radius, tubularSegments, radialSegments, material) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const geom = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
  const mesh = new THREE.Mesh(geom, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function pointToSegmentDistSq(p, a, b) {
  _segAB.subVectors(b, a);
  _segAP.subVectors(p, a);
  const lenSq = _segAB.lengthSq();
  if (lenSq < 1e-8) return _segAP.lengthSq();
  const t = THREE.MathUtils.clamp(_segAP.dot(_segAB) / lenSq, 0.0, 1.0);
  _tmpA.copy(a).addScaledVector(_segAB, t);
  return p.distanceToSquared(_tmpA);
}

/**
 * Builds a rich honey-brown cruiser saddle leather material (`#b56835`) matching `GBike_Saddle_V2`.
 */
function createHoneySaddleMaterial(materials) {
  const tex = getV6GBikeProceduralTextures();
  return new THREE.MeshStandardMaterial({
    name: "GBike_Honey_Saddle_Leather",
    color: "#b06534",
    bumpMap: materials?.gbikeSaddleLeather?.bumpMap || tex.powderRoughTex,
    bumpScale: 0.0028,
    roughness: 0.56,
    metalness: 0.02,
    envMapIntensity: 0.14,
  });
}

/**
 * Builds a machined toothed sprocket (36T front chainring with 5 web cutouts, or 18T rear cog).
 */
function createSprocketMesh(teethCount, pitchRadius, thickness, material, withWebCutouts = false) {
  const shape = new THREE.Shape();
  const outerR = pitchRadius + 0.0042;
  const rootR = pitchRadius - 0.0040;
  const steps = teethCount * 4;

  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const phase = i % 4;
    const r = phase === 1 || phase === 2 ? outerR : rootR;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }

  const centerHole = new THREE.Path();
  centerHole.absarc(0, 0, 0.013, 0, Math.PI * 2, true);
  shape.holes.push(centerHole);

  if (withWebCutouts) {
    for (let k = 0; k < 5; k++) {
      const ang = (k / 5) * Math.PI * 2;
      const hole = new THREE.Path();
      const hx = Math.cos(ang) * (pitchRadius * 0.54);
      const hy = Math.sin(ang) * (pitchRadius * 0.54);
      hole.absarc(hx, hy, pitchRadius * 0.21, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    }
  }

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: 0.001,
    bevelSize: 0.0009,
    bevelSegments: 2,
    curveSegments: 16,
  });
  geom.center();
  geom.rotateY(Math.PI / 2);
  const mesh = new THREE.Mesh(geom, material);
  mesh.castShadow = true;
  return mesh;
}

/**
 * Builds a realistic figure-8 dual-plate bicycle roller chain link geometry (zero Morse-code air gaps!).
 * Spans pitch = 15.8mm with 5.2mm rounded lobes -> total plate length = 26.2mm overlapping adjacent pin centers!
 */
function createFigureEightChainLinkGeometry(pitch = 0.0158) {
  const halfP = pitch * 0.5;
  const rEnd = 0.0052;
  const waistY = 0.0036;

  const shape = new THREE.Shape();
  shape.moveTo(-halfP, rEnd);
  shape.quadraticCurveTo(0, waistY, +halfP, rEnd);
  shape.absarc(+halfP, 0, rEnd, Math.PI * 0.5, -Math.PI * 0.5, true);
  shape.quadraticCurveTo(0, -waistY, -halfP, -rEnd);
  shape.absarc(-halfP, 0, rEnd, -Math.PI * 0.5, Math.PI * 0.5, true);

  // Pin centers are capped by `chainRollersInstanced`, so skipping occluded 2mm holes
  // with `curveSegments: 3` cuts 86-link chain triangles from 55,728 -> 3,440 with zero visual change!
  const plateThick = 0.0016;
  const basePlate = new THREE.ExtrudeGeometry(shape, {
    depth: plateThick,
    bevelEnabled: false,
    curveSegments: 3,
  });
  basePlate.center();
  basePlate.rotateY(Math.PI / 2);

  const posBase = basePlate.attributes.position;
  const normBase = basePlate.attributes.normal;
  const vCount = posBase.count;
  const mergedPos = new Float32Array(vCount * 2 * 3);
  const mergedNorm = new Float32Array(vCount * 2 * 3);

  const plateOffset = 0.0038;
  for (let sideIdx = 0; sideIdx < 2; sideIdx++) {
    const xOff = sideIdx === 0 ? -plateOffset : +plateOffset;
    const baseOffset = sideIdx * vCount * 3;
    for (let i = 0; i < vCount; i++) {
      mergedPos[baseOffset + i * 3] = posBase.getX(i) + xOff;
      mergedPos[baseOffset + i * 3 + 1] = posBase.getY(i);
      mergedPos[baseOffset + i * 3 + 2] = posBase.getZ(i);

      mergedNorm[baseOffset + i * 3] = normBase.getX(i);
      mergedNorm[baseOffset + i * 3 + 1] = normBase.getY(i);
      mergedNorm[baseOffset + i * 3 + 2] = normBase.getZ(i);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(mergedPos, 3));
  geom.setAttribute("normal", new THREE.BufferAttribute(mergedNorm, 3));
  if (basePlate.index) {
    const idxArr = basePlate.index.array;
    const mergedIdx = new Uint32Array(idxArr.length * 2);
    mergedIdx.set(idxArr, 0);
    for (let i = 0; i < idxArr.length; i++) {
      mergedIdx[idxArr.length + i] = idxArr[i] + vCount;
    }
    geom.setIndex(new THREE.BufferAttribute(mergedIdx, 1));
  }
  basePlate.dispose();
  return geom;
}

/**
 * Builds a single continuous 2D Shape extruded hockey-stick Google Blue chainguard (zero step seam!)
 * with exact 4:1 planar UVs on the camera-facing +X side for crisp white "Google" typography.
 */
function createSeamlessChainguardMesh(bbY, bbZ, driveX, material) {
  const cx = -bbZ; // -0.085
  const cy = bbY;  // +0.285
  const rOut = 0.113;
  const rIn = 0.084;
  const wingRearX = -0.505; // z_bike = +0.505m (just ahead of rear cog)

  const shape = new THREE.Shape();
  shape.moveTo(wingRearX + 0.014, 0.342);
  shape.quadraticCurveTo(wingRearX - 0.006, 0.344, wingRearX - 0.006, 0.370);
  shape.quadraticCurveTo(wingRearX - 0.006, 0.396, wingRearX + 0.016, 0.398);
  shape.lineTo(cx, cy + rOut);

  const endOutAng = -0.56;
  shape.absarc(cx, cy, rOut, Math.PI * 0.5, endOutAng, true);

  const tipInX = cx + Math.cos(endOutAng + 0.06) * rIn;
  const tipInY = cy + Math.sin(endOutAng + 0.06) * rIn;
  shape.quadraticCurveTo(
    cx + Math.cos(endOutAng - 0.05) * ((rOut + rIn) * 0.5),
    cy + Math.sin(endOutAng - 0.05) * ((rOut + rIn) * 0.5),
    tipInX,
    tipInY
  );

  const innerJoinAng = 2.02;
  shape.absarc(cx, cy, rIn, endOutAng + 0.06, innerJoinAng, false);
  shape.quadraticCurveTo(cx - 0.062, 0.342, cx - 0.105, 0.342);
  shape.lineTo(wingRearX + 0.014, 0.342);

  const depth = 0.0075;
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.0018,
    bevelSize: 0.0018,
    bevelSegments: 3,
    curveSegments: 28,
  });

  geom.rotateY(Math.PI / 2);
  geom.computeVertexNormals();

  const posAttr = geom.attributes.position;
  const normAttr = geom.attributes.normal;
  const uvArr = new Float32Array(posAttr.count * 2);

  const zRearRef = 0.515;
  const zSpan = 0.545;
  const yBotRef = 0.301875;
  const ySpan = 0.13625;

  for (let i = 0; i < posAttr.count; i++) {
    const nx = normAttr.getX(i);
    if (nx > 0.94) {
      const vy = posAttr.getY(i);
      const vz = posAttr.getZ(i);
      uvArr[i * 2] = (zRearRef - vz) / zSpan;
      uvArr[i * 2 + 1] = (vy - yBotRef) / ySpan;
    } else {
      uvArr[i * 2] = 0.96;
      uvArr[i * 2 + 1] = 0.10;
    }
  }
  geom.setAttribute("uv", new THREE.BufferAttribute(uvArr, 2));

  const mesh = new THREE.Mesh(geom, material);
  mesh.position.x = driveX + 0.0065;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Builds a realistic thin (`5.5mm` wall, `58mm` width) curved U-channel sheet-metal bicycle mudguard shell
 * around wheel axle `(0, 0, 0)` (`theta = 0` = top dead center `+Y`, `-theta` = forward `-Z`, `+theta` = rearward `+Z`).
 */
function createUChannelFenderGeometry({
  rMid = 0.346,
  halfW = 0.029,
  wallThick = 0.0055,
  lipDrop = 0.015,
  thetaStart = -0.48,
  thetaEnd = +0.53,
  arcSegs = 28,
} = {}) {
  const baseProfile = [];
  const outerSteps = 8;
  for (let k = 0; k <= outerSteps; k++) {
    const s = (k / outerSteps) * 2 - 1;
    const dr = 0.003 - s * s * lipDrop;
    baseProfile.push([s * halfW, dr]);
  }
  const innerSteps = 5;
  for (let k = innerSteps; k >= 0; k--) {
    const s = ((k / innerSteps) * 2 - 1) * 0.90;
    const dr = 0.003 - s * s * lipDrop - wallThick;
    baseProfile.push([s * halfW, dr]);
  }

  const ringCount = baseProfile.length;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i <= arcSegs; i++) {
    const u = i / arcSegs;
    const theta = THREE.MathUtils.lerp(thetaStart, thetaEnd, u);
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const endDist = Math.min(u, 1 - u);
    const widthScale = endDist < 0.09 ? 0.72 + 0.28 * Math.sin((endDist / 0.09) * Math.PI * 0.5) : 1.0;

    for (let j = 0; j < ringCount; j++) {
      const [bx, bdr] = baseProfile[j];
      const x = bx * widthScale;
      const r = rMid + bdr;
      const y = r * cosT;
      const z = r * sinT;
      positions.push(x, y, z);
      uvs.push(u, j / ringCount);
    }
  }

  for (let i = 0; i < arcSegs; i++) {
    const rowA = i * ringCount;
    const rowB = (i + 1) * ringCount;
    for (let j = 0; j < ringCount; j++) {
      const jNext = (j + 1) % ringCount;
      const a = rowA + j;
      const b = rowA + jNext;
      const c = rowB + j;
      const d = rowB + jNext;
      indices.push(a, c, b, b, c, d);
    }
  }

  for (const [rowBase, flip] of [
    [0, true],
    [arcSegs * ringCount, false],
  ]) {
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let j = 0; j < ringCount; j++) {
      cx += positions[(rowBase + j) * 3];
      cy += positions[(rowBase + j) * 3 + 1];
      cz += positions[(rowBase + j) * 3 + 2];
    }
    const centerIdx = positions.length / 3;
    positions.push(cx / ringCount, cy / ringCount, cz / ringCount);
    uvs.push(0.5, 0.5);
    for (let j = 0; j < ringCount; j++) {
      const jNext = (j + 1) % ringCount;
      if (flip) {
        indices.push(centerIdx, rowBase + jNext, rowBase + j);
      } else {
        indices.push(centerIdx, rowBase + j, rowBase + jNext);
      }
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

/**
 * Builds a complete 26-inch GBike cruiser wheel (yellow anodized rim, cream whitewall, dark rubber tread,
 * chrome hub + flanges, 36 merged cross-3 tangent steel spokes, 36 merged brass spoke nipples,
 * brass Schrader valve stem & oval spoke reflector).
 */
function buildCruiserWheel(materials, includeRearCog = false) {
  const wheelGroup = new THREE.Group();
  const R = BIKE_CONSTANTS.wheelRadiusM; // 0.335m

  const tireGeom = new THREE.TorusGeometry(R - 0.031, 0.031, 20, 56);
  tireGeom.rotateY(Math.PI / 2);
  const tireMesh = new THREE.Mesh(
    tireGeom,
    materials.gbikeCruiserTire || materials.gbikeTireRubber
  );
  tireMesh.castShadow = true;
  tireMesh.receiveShadow = true;
  wheelGroup.add(tireMesh);

  const wwGeom = new THREE.TorusGeometry(R - 0.044, 0.017, 14, 52);
  wwGeom.rotateY(Math.PI / 2);
  for (const side of [-1, 1]) {
    const ww = new THREE.Mesh(wwGeom, materials.gbikeWhitewall);
    ww.position.x = side * 0.0155;
    ww.scale.set(0.55, 1, 1);
    ww.castShadow = true;
    ww.receiveShadow = true;
    wheelGroup.add(ww);
  }

  const rimGeom = new THREE.TorusGeometry(R - 0.062, 0.0135, 14, 52);
  rimGeom.rotateY(Math.PI / 2);
  const rimMesh = new THREE.Mesh(rimGeom, materials.gbikeBrushedRim || materials.gbikeAlloy);
  rimMesh.castShadow = true;
  rimMesh.receiveShadow = true;
  wheelGroup.add(rimMesh);

  const hubBarrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.016, 0.016, 0.088, 18),
    materials.gbikeChrome
  );
  hubBarrel.rotation.z = Math.PI / 2;
  hubBarrel.castShadow = true;
  wheelGroup.add(hubBarrel);

  const flangeR = 0.028;
  const flangeX = 0.030;
  for (const side of [-1, 1]) {
    const flange = new THREE.Mesh(
      new THREE.CylinderGeometry(flangeR, flangeR, 0.004, 20),
      materials.gbikeChrome
    );
    flange.rotation.z = Math.PI / 2;
    flange.position.x = side * flangeX;
    flange.castShadow = true;
    wheelGroup.add(flange);

    const axleNut = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0085, 0.0085, 0.014, 6),
      materials.gbikeChrome
    );
    axleNut.rotation.z = Math.PI / 2;
    axleNut.position.x = side * 0.058;
    axleNut.castShadow = true;
    wheelGroup.add(axleNut);
  }

  const rimInnerR = R - 0.071;
  const baseSpokeGeom = new THREE.CylinderGeometry(0.0014, 0.0014, 1.0, 6);
  const baseNippleGeom = new THREE.CylinderGeometry(0.0024, 0.0020, 0.010, 6);
  const spokeGeoms = [];
  const brassGeoms = [];
  const pHub = new THREE.Vector3();
  const pRim = new THREE.Vector3();
  const spokeDir = new THREE.Vector3();
  const upVec = new THREE.Vector3(0, 1, 0);
  const tmpSpokeObj = new THREE.Object3D();

  for (let i = 0; i < 36; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const idxOnSide = Math.floor(i / 2);
    const crossDir = idxOnSide % 2 === 0 ? 1 : -1;
    const rimAngle = (i / 36) * Math.PI * 2;
    const hubAngle = rimAngle + crossDir * 0.58;

    pHub.set(side * flangeX, Math.sin(hubAngle) * (flangeR * 0.86), Math.cos(hubAngle) * (flangeR * 0.86));
    pRim.set(side * 0.003, Math.sin(rimAngle) * rimInnerR, Math.cos(rimAngle) * rimInnerR);

    spokeDir.subVectors(pRim, pHub);
    const len = spokeDir.length();
    spokeDir.normalize();

    tmpSpokeObj.position.addVectors(pHub, pRim).multiplyScalar(0.5);
    tmpSpokeObj.quaternion.setFromUnitVectors(upVec, spokeDir);
    tmpSpokeObj.scale.set(1, len, 1);
    tmpSpokeObj.updateMatrix();
    spokeGeoms.push(baseSpokeGeom.clone().applyMatrix4(tmpSpokeObj.matrix));

    // Machined brass spoke nipple seated cleanly at rim bed
    tmpSpokeObj.position.copy(pRim).addScaledVector(spokeDir, -0.004);
    tmpSpokeObj.scale.set(1, 1, 1);
    tmpSpokeObj.updateMatrix();
    brassGeoms.push(baseNippleGeom.clone().applyMatrix4(tmpSpokeObj.matrix));
  }
  baseSpokeGeom.dispose();
  baseNippleGeom.dispose();

  const spokesMesh = new THREE.Mesh(mergeStaticGeometries(spokeGeoms), materials.gbikeAlloy);
  spokesMesh.userData.logicalSubParts = 36;
  wheelGroup.add(spokesMesh);

  // Schrader valve stem merged into the brass spoke-nipple batch (single draw call!)
  brassGeoms.push(
    new THREE.CylinderGeometry(0.0028, 0.0032, 0.024, 8).translate(0, -(rimInnerR - 0.011), 0)
  );
  const brassMesh = new THREE.Mesh(mergeStaticGeometries(brassGeoms), materials.gbikeBrass);
  brassMesh.userData.logicalSubParts = 37;
  wheelGroup.add(brassMesh);

  const spokeRefl = new THREE.Mesh(
    new THREE.BoxGeometry(0.005, 0.022, 0.052),
    materials.reflectorWhite
  );
  spokeRefl.position.set(0, rimInnerR * 0.68, rimInnerR * 0.32);
  spokeRefl.rotation.x = -0.42;
  wheelGroup.add(spokeRefl);

  // Unilateral Right-Side 16T Rear Sprocket Cog (ONLY on rear wheel at +driveSideX!)
  if (includeRearCog) {
    const rearCog = createSprocketMesh(
      BIKE_CONSTANTS.rearCogTeeth,
      KIN_CONSTANTS.rearCogRadiusM,
      0.0048,
      materials.gbikeAlloy,
      false
    );
    rearCog.position.x = BIKE_CONSTANTS.driveSideX;
    wheelGroup.add(rearCog);
  }

  return wheelGroup;
}

export class GBikeRigClassic {
  constructor(materials) {
    this.materials = buildV6GBikeMaterials(materials);
    this.honeySaddleMat = createHoneySaddleMaterial(this.materials);

    this.root = new THREE.Group();
    this.root.name = "GBikeRoot";

    this.leanGroup = new THREE.Group();
    this.leanGroup.name = "GBikeLeanGroup";
    this.root.add(this.leanGroup);

    this.subPartCount = 0;
    this._collectedTpuCount = 0;
    this._lastSimTime = 0;

    // Public kinematic properties (100% invariant with `BIKE_CONSTANTS`, `PelicanRig` & `core.js`)
    this.wheelRadius = BIKE_CONSTANTS.wheelRadiusM; // 0.335m
    this.wheelbase = BIKE_CONSTANTS.wheelbaseM;     // 1.085m
    this.axleY = 0.334; // wRad 0.335m - 0.001m micro-contact (V8-11)
    this.rearAxleZ = +BIKE_CONSTANTS.wheelbaseM * 0.5; // +0.5425m
    this.frontAxleZ = -BIKE_CONSTANTS.wheelbaseM * 0.5; // -0.5425m
    this.bbPos = new THREE.Vector3(0, 0.285, +0.085);
    this.saddleTopPos = new THREE.Vector3(0, 0.752, +0.238);

    this.leftPedalTopLocal = new THREE.Vector3();
    this.rightPedalTopLocal = new THREE.Vector3();
    this.leftGripLocal = new THREE.Vector3();
    this.rightGripLocal = new THREE.Vector3();
    this.leftGripWorld = new THREE.Vector3();
    this.rightGripWorld = new THREE.Vector3();
    this.leftFootPitch = 0;
    this.rightFootPitch = 0;

    // V6 FIX #1: ZERO rig-attached contact shadows! World-grounded HeroContactAOShadow in core.js +
    // directional 4096x4096 sun shadow cast the real silhouette onto plaza/ramps without flying into the sky!
    this.shadowGroup = null;
    this._buildMainCruiserFrame();
    this._buildRearWheelAndGreenFender();
    this._buildSteerableFrontForkAndBasket();
    this._buildUnilateralDrivetrain();
    this._buildSaddleBrakeCableAndKickstand();

    this.root.traverse((obj) => {
      if (obj.isMesh || obj.isInstancedMesh) {
        this.subPartCount += obj.userData?.logicalSubParts || (obj.isInstancedMesh ? obj.count : 1);
      }
    });

    this._compactStaticAssemblyMeshes();
    stripAttachedShadowPlanesAndEnableCast(this.root, this.xrayOverlayGroup);
    if (this.chainguardMesh) {
      this.chainguardMesh.castShadow = !this.xrayEnabled;
    }

    // Seed initial world/local anchor transforms at t = 0
    this.update({ wheelRad: 0, crankRad: 0, steerRad: 0, bankRad: 0, tpusCollected: 0, simTime: 0 });
  }

  _compactStaticAssemblyMeshes() {
    compactRigidGroupMeshes(this.headTubeGroup);
    compactRigidGroupMeshes(
      this.leanGroup,
      new Set([
        this.headTubeGroup,
        this.steerAxisCarrier,
        this.rearWheel,
        this.crankGroup,
        this.saddleGroup,
        this.xrayOverlayGroup,
      ].filter(Boolean)),
      new Set([
        this.chainInstanced,
        this.chainRollersInstanced,
        this.chainguardMesh,
        this.chainguardTopFlange,
        this.rearSkewerNutsMesh,
      ].filter(Boolean))
    );
    compactRigidGroupMeshes(
      this.steerGroup,
      new Set([this.frontWheelAlign, this.cockpitAlign].filter(Boolean))
    );
    compactRigidGroupMeshes(
      this.frontWheelAlign,
      new Set([this.frontWheel].filter(Boolean))
    );
    compactRigidGroupMeshes(this.frontWheel);
    compactRigidGroupMeshes(this.rearWheel);
    compactRigidGroupMeshes(
      this.cockpitAlign,
      new Set([
        this.bellGroup,
        this.basketGroup,
        this.basketPropsGroup,
        this.leftGripAnchor,
        this.rightGripAnchor,
      ].filter(Boolean))
    );
    compactRigidGroupMeshes(
      this.crankGroup,
      new Set([this.leftPedalGroup, this.rightPedalGroup].filter(Boolean))
    );
    compactRigidGroupMeshes(this.leftPedalGroup);
    compactRigidGroupMeshes(this.rightPedalGroup);
  }

  _buildMainCruiserFrame() {
    const redMat = this.materials.gbikeFrameRed;
    const chromeMat = this.materials.gbikeChrome;

    // Raised steering headtube cleanly above 26" front tire & thin U-channel fender (`r_crown >= 0.375m`!)
    this.headAxisOrigin = new THREE.Vector3(0, 0.755, -0.395);
    this.headRakePitch = 0.335; // ~19.2 deg backward tilt from vertical

    const headTubeGroup = new THREE.Group();
    this.headTubeGroup = headTubeGroup;
    headTubeGroup.position.copy(this.headAxisOrigin);
    headTubeGroup.rotation.x = this.headRakePitch;

    const headTube = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.126, 20), redMat);
    headTube.castShadow = true;
    headTubeGroup.add(headTube);

    for (const yCup of [-0.066, 0.066]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.0245, 0.0245, 0.013, 20), chromeMat);
      cup.position.y = yCup;
      headTubeGroup.add(cup);
    }
    this.leanGroup.add(headTubeGroup);

    const seatTube = createTubeFromPoints(
      [
        [0, 0.285, 0.085],
        [0, 0.640, 0.204],
      ],
      0.0175,
      12,
      16,
      redMat
    );
    this.leanGroup.add(seatTube);

    const seatCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.022, 18), chromeMat);
    seatCollar.position.set(0, 0.642, 0.205);
    seatCollar.rotation.x = 0.325;
    this.leanGroup.add(seatCollar);

    const seatPost = createTubeFromPoints(
      [
        [0, 0.635, 0.202],
        [0, 0.728, 0.233],
      ],
      0.0135,
      8,
      16,
      chromeMat
    );
    this.leanGroup.add(seatPost);

    // Swept step-through tubes maintaining >= 45mm 3D radial clearance from frontFender (`r = 0.346m`) across full ±0.28 rad steering!
    const stepThroughTopTube = createTubeFromPoints(
      [
        [0, 0.786, -0.384],
        [0, 0.590, -0.212],
        [0, 0.435, -0.052],
        [0, 0.395, +0.122],
      ],
      0.0165,
      28,
      16,
      redMat
    );
    this.leanGroup.add(stepThroughTopTube);

    const downTube = createTubeFromPoints(
      [
        [0, 0.722, -0.405],
        [0, 0.572, -0.192],
        [0, 0.352, -0.062],
        [0, 0.285, +0.085],
      ],
      0.0185,
      28,
      16,
      redMat
    );
    this.leanGroup.add(downTube);

    // Hydroformed frame weld gusset fillets at headtube, mid-brace, and BB junctions
    const topHeadGusset = createTubeFromPoints(
      [
        [0, 0.788, -0.386],
        [0, 0.752, -0.356],
      ],
      0.0205,
      6,
      14,
      redMat
    );
    const lowHeadGusset = createTubeFromPoints(
      [
        [0, 0.720, -0.405],
        [0, 0.692, -0.362],
      ],
      0.0215,
      6,
      14,
      redMat
    );
    const stepMidGusset = createTubeFromPoints(
      [
        [0, 0.532, -0.158],
        [0, 0.492, -0.148],
      ],
      0.0125,
      6,
      12,
      redMat
    );
    const seatTubeGusset = createTubeFromPoints(
      [
        [0, 0.402, +0.118],
        [0, 0.438, +0.136],
      ],
      0.0185,
      6,
      14,
      redMat
    );
    this.leanGroup.add(topHeadGusset, lowHeadGusset, stepMidGusset, seatTubeGusset);

    const greenBand = createTubeFromPoints(
      [
        [0, 0.692, -0.304],
        [0, 0.654, -0.270],
      ],
      0.0176,
      6,
      16,
      this.materials.gbikeGreen
    );
    this.leanGroup.add(greenBand);

    // Dual rear chainstays & seatstays bowed cleanly outside `rearFender` (`halfW = 0.029m`) and `driveSideX = +0.068m`!
    for (const side of [-1, 1]) {
      const dropoutX = side * 0.047;
      const chainstay = createTubeFromPoints(
        [
          [side * 0.026, 0.285, 0.085],
          [side * 0.044, 0.305, 0.310],
          [dropoutX, this.axleY, this.rearAxleZ],
        ],
        0.0105,
        16,
        12,
        redMat
      );
      this.leanGroup.add(chainstay);

      const seatstay = createTubeFromPoints(
        [
          [side * 0.020, 0.605, 0.192],
          [side * 0.046, 0.525, 0.315],
          [dropoutX, this.axleY + 0.012, this.rearAxleZ],
        ],
        0.0098,
        16,
        12,
        redMat
      );
      this.leanGroup.add(seatstay);

      const dropout = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.034, 0.040), redMat);
      dropout.position.set(dropoutX, this.axleY, this.rearAxleZ);
      this.leanGroup.add(dropout);
    }

    // Welded seatstay brake bridge arch above rear green fender (`(0, 0.642, 0.258)`)
    const seatstayBridge = createTubeFromPoints(
      [
        [-0.030, 0.576, 0.236],
        [0.0, 0.588, 0.234],
        [+0.030, 0.576, 0.236],
      ],
      0.0075,
      8,
      10,
      redMat
    );
    this.leanGroup.add(seatstayBridge);

    const bbShell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.026, 0.026, 0.072, 20),
      redMat
    );
    bbShell.rotation.z = Math.PI / 2;
    bbShell.position.copy(this.bbPos);
    bbShell.castShadow = true;
    this.leanGroup.add(bbShell);
  }

  _buildRearWheelAndGreenFender() {
    this.rearWheel = buildCruiserWheel(this.materials, true);
    this.rearWheel.position.set(0, this.axleY, this.rearAxleZ);
    this.leanGroup.add(this.rearWheel);

    // V8-10B: Extended machined-chrome rear-axle quick-release trainer skewer nuts protruding cleanly
    // to exact `|x| = 0.106m` on both sides (`±0.1060m`), outside the `±0.092m` blue chainguard so
    // the indoor trainer's rubberized clamp cups (`|x| = 0.102m` inner tip) grip ONLY the chrome skewer nuts!
    const skewerGeoms = [];
    for (const side of [-1, 1]) {
      // 1. Chrome axle extension shaft (`|x| = 0.0600m .. 0.0900m`)
      skewerGeoms.push(
        new THREE.CylinderGeometry(0.0058, 0.0058, 0.030, 14)
          .rotateZ(Math.PI * 0.5)
          .translate(side * 0.075, this.axleY, this.rearAxleZ)
      );
      // 2. Serrated clearance collar flange (`|x| = 0.0900m .. 0.0940m`)
      skewerGeoms.push(
        new THREE.CylinderGeometry(0.0112, 0.0112, 0.004, 18)
          .rotateZ(Math.PI * 0.5)
          .translate(side * 0.092, this.axleY, this.rearAxleZ)
      );
      // 3. Cylindrical trainer-cup seating barrel (`|x| = 0.0940m .. 0.1020m`)
      skewerGeoms.push(
        new THREE.CylinderGeometry(0.0092, 0.0092, 0.008, 18)
          .rotateZ(Math.PI * 0.5)
          .translate(side * 0.098, this.axleY, this.rearAxleZ)
      );
      // 4. Tapered frustum trainer acorn tip (`|x| = 0.1020m .. 0.1060m` exact outer tip!)
      skewerGeoms.push(
        new THREE.CylinderGeometry(0.0056, 0.0090, 0.004, 18)
          .rotateZ(-side * Math.PI * 0.5)
          .translate(side * 0.104, this.axleY, this.rearAxleZ)
      );
    }
    this.rearSkewerNutsMesh = new THREE.Mesh(
      mergeStaticGeometries(skewerGeoms),
      this.materials.gbikeChrome
    );
    this.rearSkewerNutsMesh.name = "GBike_RearAxleSkewerNuts_V8";
    this.rearSkewerNutsMesh.userData.logicalSubParts = 2;
    this.rearSkewerNutsMesh.castShadow = true;
    this.rearSkewerNutsMesh.receiveShadow = true;
    this.leanGroup.add(this.rearSkewerNutsMesh);

    // Thin `5.5mm` Curved U-Channel Google Green Rear Mudguard (`r = 0.346m`, `halfW = 0.029m`)
    const fenderR = 0.346;
    const rearFenderGeom = createUChannelFenderGeometry({
      rMid: fenderR,
      halfW: 0.029,
      wallThick: 0.0055,
      lipDrop: 0.015,
      thetaStart: -1.24,
      thetaEnd: +1.34,
      arcSegs: 32,
    });
    const rearFender = new THREE.Mesh(rearFenderGeom, this.materials.gbikeGreen);
    rearFender.position.set(0, this.axleY, this.rearAxleZ);
    rearFender.castShadow = true;
    rearFender.receiveShadow = true;
    this.leanGroup.add(rearFender);

    // Chrome rear fender stays anchored cleanly to the rolled outer edge of `rearFender` (`x = ±0.029m`)
    const stayTheta = 1.15;
    const stayEndY = this.axleY + Math.cos(stayTheta) * (fenderR - 0.010);
    const stayEndZ = this.rearAxleZ + Math.sin(stayTheta) * (fenderR - 0.010);
    for (const side of [-1, 1]) {
      const stay = createTubeFromPoints(
        [
          [side * 0.052, this.axleY, this.rearAxleZ],
          [side * 0.029, stayEndY, stayEndZ],
        ],
        0.003,
        6,
        8,
        this.materials.gbikeChrome
      );
      this.leanGroup.add(stay);
    }

    const reflTheta = 1.02;
    const reflY = this.axleY + Math.cos(reflTheta) * (fenderR + 0.010);
    const reflZ = this.rearAxleZ + Math.sin(reflTheta) * (fenderR + 0.010);
    const reflPod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.013, 0.015, 0.020, 14),
      this.materials.gbikeBasketLiner
    );
    reflPod.rotation.x = reflTheta;
    reflPod.position.set(0, reflY, reflZ);
    this.leanGroup.add(reflPod);

    const rubyLens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.011, 0.011, 0.006, 14),
      this.materials.reflectorRuby
    );
    rubyLens.rotation.x = reflTheta;
    rubyLens.position.set(
      0,
      reflY + Math.cos(reflTheta) * 0.011,
      reflZ + Math.sin(reflTheta) * 0.011
    );
    this.leanGroup.add(rubyLens);
  }

  _buildSteerableFrontForkAndBasket() {
    this.steerAxisCarrier = new THREE.Group();
    this.steerAxisCarrier.position.copy(this.headAxisOrigin);
    this.steerAxisCarrier.rotation.x = this.headRakePitch;
    this.leanGroup.add(this.steerAxisCarrier);

    this.steerGroup = new THREE.Group();
    this.steerAxisCarrier.add(this.steerGroup);

    const invCarrier = new THREE.Matrix4()
      .makeRotationX(this.headRakePitch)
      .setPosition(this.headAxisOrigin)
      .invert();

    const toSteerLocal = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(invCarrier);

    // 1. Sculpted Smooth Tubular Google Blue Front Fork Crown (`r = 0.375m` above front axle) + Wide Blades
    const crownLeft = toSteerLocal(-0.050, 0.678, -0.422);
    const crownMid = toSteerLocal(0.0, 0.686, -0.419);
    const crownRight = toSteerLocal(+0.050, 0.678, -0.422);
    const crownTube = createTubeFromPoints(
      [crownLeft.toArray(), crownMid.toArray(), crownRight.toArray()],
      0.0148,
      12,
      14,
      this.materials.gbikeForkBlue
    );
    this.steerGroup.add(crownTube);

    const steererStub = createTubeFromPoints(
      [crownMid.toArray(), toSteerLocal(0.0, 0.704, -0.413).toArray()],
      0.016,
      4,
      12,
      this.materials.gbikeForkBlue
    );
    this.steerGroup.add(steererStub);

    for (const side of [-1, 1]) {
      const pTop = toSteerLocal(side * 0.050, 0.678, -0.422);
      const pMid = toSteerLocal(side * 0.055, 0.512, -0.492);
      const pTip = toSteerLocal(side * 0.054, this.axleY, this.frontAxleZ);
      const blade = createTubeFromPoints(
        [pTop.toArray(), pMid.toArray(), pTip.toArray()],
        0.0130,
        16,
        14,
        this.materials.gbikeForkBlue
      );
      this.steerGroup.add(blade);
    }

    // 2. Front 26" Wheel mounted at front axle inside steerGroup
    const frontAxleInSteer = toSteerLocal(0, this.axleY, this.frontAxleZ);
    this.frontWheelAlign = new THREE.Group();
    this.frontWheelAlign.position.copy(frontAxleInSteer);
    this.frontWheelAlign.rotation.x = -this.headRakePitch;
    this.frontWheel = buildCruiserWheel(this.materials, false);
    this.frontWheelAlign.add(this.frontWheel);
    this.steerGroup.add(this.frontWheelAlign);

    // 3. Thin `5.5mm` U-Channel Google Green Front Fender (`r = 0.346m`, `z_tail = -0.366m <= -0.365m`)
    const fenderR = 0.346;
    const frontFenderGeom = createUChannelFenderGeometry({
      rMid: fenderR,
      halfW: 0.029,
      wallThick: 0.0055,
      lipDrop: 0.015,
      thetaStart: -0.48,
      thetaEnd: +0.46,
      arcSegs: 28,
    });
    const frontFender = new THREE.Mesh(frontFenderGeom, this.materials.gbikeGreen);
    frontFender.castShadow = true;
    frontFender.receiveShadow = true;
    this.frontWheelAlign.add(frontFender);

    const crownFenderTab = createTubeFromPoints(
      [
        [0, Math.cos(0.34) * (fenderR + 0.002), Math.sin(0.34) * (fenderR + 0.002)],
        [0, 0.686 - this.axleY, -0.419 - this.frontAxleZ],
      ],
      0.0045,
      4,
      8,
      this.materials.gbikeChrome
    );
    this.frontWheelAlign.add(crownFenderTab);

    const fStayTheta = -0.30;
    for (const side of [-1, 1]) {
      const stay = createTubeFromPoints(
        [
          [side * 0.054, 0, 0],
          [side * 0.029, Math.cos(fStayTheta) * (fenderR - 0.010), Math.sin(fStayTheta) * (fenderR - 0.010)],
        ],
        0.003,
        6,
        8,
        this.materials.gbikeChrome
      );
      this.frontWheelAlign.add(stay);
    }

    // 4. Chrome Quill Stem + Swept-Back Gullwing Cruiser Handlebars + Ribbed Grips + Dual Brake Levers + Silver Bell
    this.cockpitAlign = new THREE.Group();
    this.cockpitAlign.position.copy(toSteerLocal(0, 0.675, -0.352));
    this.cockpitAlign.rotation.x = -this.headRakePitch;
    this.steerGroup.add(this.cockpitAlign);
    this.steerVisualAnchor = this.cockpitAlign;

    const quillStem = createTubeFromPoints(
      [
        [0, 0.125, -0.028],
        [0, 0.156, -0.020],
        [0, 0.155, -0.048],
      ],
      0.0125,
      12,
      14,
      this.materials.gbikeChrome
    );
    this.cockpitAlign.add(quillStem);

    const handlebar = createTubeFromPoints(
      [
        [-0.255, 0.225, +0.225],
        [-0.225, 0.222, +0.095],
        [-0.125, 0.185, -0.025],
        [0.0, 0.155, -0.048],
        [+0.125, 0.185, -0.025],
        [+0.225, 0.222, +0.095],
        [+0.255, 0.225, +0.225],
      ],
      0.011,
      36,
      14,
      this.materials.gbikeChrome
    );
    {
      const srcGeom = handlebar.geometry;
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
        const extract =
          cy > 0.080 &&
          ((cx < -0.022 && (cx < -0.060 || cz > -0.032)) || cx > 0.180);
        if (extract) extTris.push(i0, i1, i2);
        else keptTris.push(i0, i1, i2);
      }
      const attrNames = Object.keys(srcGeom.attributes);
      const buildSub = (srcIndices) => {
        const remap = new Int32Array(posAttr.count).fill(-1);
        const uniqueSrc = [];
        const newIndices = new Uint16Array(srcIndices.length);
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
          const dst = new a.array.constructor(vCount * a.itemSize);
          for (let v = 0; v < vCount; v++) {
            const sBase = uniqueSrc[v] * a.itemSize;
            const dBase = v * a.itemSize;
            for (let c = 0; c < a.itemSize; c++) dst[dBase + c] = a.array[sBase + c];
          }
          out.setAttribute(name, new THREE.BufferAttribute(dst, a.itemSize, a.normalized));
        }
        out.setIndex(new THREE.BufferAttribute(newIndices, 1));
        out.computeBoundingBox();
        out.computeBoundingSphere();
        return out;
      };
      const keptGeom = buildSub(keptTris);
      const extGeom = buildSub(extTris);
      srcGeom.dispose();
      handlebar.geometry = keptGeom;
      const occBar = new THREE.Mesh(extGeom, this.materials.gbikeChrome);
      occBar.name = "Classic_CelebrationOccludedHandlebar_V6";
      occBar.castShadow = true;
      occBar.receiveShadow = true;
      this.celebrationOccludedHandlebarMesh = occBar;
      this._celebrationOccludedParts = [occBar];
      this._celebrationHandlebarHidden = false;
      this.cockpitAlign.add(occBar);
    }
    this.cockpitAlign.add(handlebar);

    this.leftGripAnchor = new THREE.Object3D();
    this.rightGripAnchor = new THREE.Object3D();

    for (const side of [-1, 1]) {
      const grip = createTubeFromPoints(
        [
          [side * 0.232, 0.223, +0.118],
          [side * 0.258, 0.225, +0.236],
        ],
        0.0155,
        8,
        14,
        this.materials.gbikeTireRubber
      );
      this.cockpitAlign.add(grip);
      this._celebrationOccludedParts.push(grip);

      const anchor = side < 0 ? this.leftGripAnchor : this.rightGripAnchor;
      anchor.position.set(side * 0.246, 0.230, +0.176);
      this.cockpitAlign.add(anchor);

      // Symmetric forged alloy front (+1) & rear (-1) handlebar brake levers
      const brakeLeverMount = new THREE.Mesh(
        new THREE.BoxGeometry(0.024, 0.022, 0.026),
        this.materials.gbikeAlloy
      );
      brakeLeverMount.position.set(side * 0.222, 0.218, +0.095);
      this.cockpitAlign.add(brakeLeverMount);

      const brakeBarrelAdjuster = new THREE.CylinderGeometry(0.005, 0.005, 0.016, 10).rotateZ(Math.PI * 0.5);
      const brakeBarrelAdjusterMesh = new THREE.Mesh(
        brakeBarrelAdjuster,
        this.materials.gbikeChrome
      );
      brakeBarrelAdjusterMesh.position.set(side * 0.206, 0.218, +0.092);
      this.cockpitAlign.add(brakeBarrelAdjusterMesh);

      const brakeLeverBlade = createTubeFromPoints(
        [
          [side * 0.222, 0.212, +0.088],
          [side * 0.206, 0.198, +0.145],
          [side * 0.202, 0.194, +0.188],
        ],
        0.0045,
        8,
        8,
        this.materials.gbikeChrome
      );
      this.cockpitAlign.add(brakeLeverBlade);
      this._celebrationOccludedParts.push(brakeLeverMount, brakeBarrelAdjusterMesh, brakeLeverBlade);
    }

    // Sculpted Fork-Crown Front Side-Pull Caliper Brake + Unbroken Steerable Brake Cable
    const caliperPivot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.007, 0.007, 0.028, 12).rotateX(Math.PI * 0.5),
      this.materials.gbikeChrome
    );
    caliperPivot.position.set(0, 0.011, -0.080);
    this.cockpitAlign.add(caliperPivot);

    for (const side of [-1, 1]) {
      const calArm = createTubeFromPoints(
        [
          [0, 0.011, -0.086],
          [side * 0.038, -0.018, -0.094],
          [side * 0.022, -0.068, -0.102],
        ],
        0.0042,
        8,
        8,
        this.materials.gbikeAlloy
      );
      this.cockpitAlign.add(calArm);

      const brakePad = new THREE.Mesh(
        new THREE.BoxGeometry(0.008, 0.012, 0.032),
        this.materials.gbikeTireRubber
      );
      brakePad.position.set(side * 0.018, -0.070, -0.104);
      this.cockpitAlign.add(brakePad);
    }

    const caliperPinchArm = createTubeFromPoints(
      [
        [+0.024, -0.008, -0.090],
        [+0.044, +0.024, -0.084],
      ],
      0.0038,
      4,
      8,
      this.materials.gbikeAlloy
    );
    this.cockpitAlign.add(caliperPinchArm);

    const steerableBrakeCable = createTubeFromPoints(
      [
        [+0.204, 0.218, +0.092],
        [+0.148, 0.206, +0.034],
        [+0.092, 0.164, -0.022],
        [+0.056, 0.094, -0.064],
        [+0.044, 0.024, -0.084],
      ],
      0.0030,
      24,
      8,
      this.materials.gbikeTireRubber
    );
    this.cockpitAlign.add(steerableBrakeCable);

    // Upper steerable rear-brake cable loop from left lever toward headtube
    const leftRearCableTop = createTubeFromPoints(
      [
        [-0.204, 0.218, +0.092],
        [-0.142, 0.202, +0.030],
        [-0.064, 0.145, -0.022],
        [-0.022, 0.065, -0.042],
      ],
      0.0030,
      16,
      8,
      this.materials.gbikeTireRubber
    );
    this.cockpitAlign.add(leftRearCableTop);
    if (this._celebrationOccludedParts) {
      this._celebrationOccludedParts.push(leftRearCableTop);
    }

    // Classic Polished Silver Dome Rotary Bell with Instant Frame-0 Thumb Striker
    this.bellGroup = new THREE.Group();
    this.bellGroup.position.set(+0.165, 0.208, +0.022);
    const bellDome = new THREE.Mesh(
      new THREE.SphereGeometry(0.026, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.62),
      this.materials.gbikeChrome
    );
    bellDome.scale.set(1, 0.72, 1);
    bellDome.castShadow = true;
    this.bellGroup.add(bellDome);

    const bellBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.018, 0.010, 16),
      this.materials.gbikeBasketLiner
    );
    bellBase.position.y = -0.004;
    this.bellGroup.add(bellBase);
    this.proceduralBellParts = [bellDome, bellBase];

    this.bellStrikerPivot = new THREE.Group();
    this.bellStrikerPivot.position.set(0.020, -0.002, 0.012);
    const strikerArm = new THREE.Mesh(
      new THREE.BoxGeometry(0.006, 0.004, 0.028),
      this.materials.gbikeChrome
    );
    strikerArm.position.z = 0.014;
    const strikerTab = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.004, 12),
      this.materials.gbikeBasketLiner
    );
    strikerTab.position.set(0, 0.002, 0.026);
    this.bellStrikerPivot.add(strikerArm, strikerTab);
    this.proceduralBellStrikerParts = [strikerArm, strikerTab];
    this.bellGroup.add(this.bellStrikerPivot);
    this.cockpitAlign.add(this.bellGroup);

    // 5. 100% Clean, Open, Airy Yellow Woven Wire-Mesh Front Cruiser Basket (ZERO fish, ZERO baguette, ZERO dark drum liner!)
    const basketGroup = new THREE.Group();
    const bH = 0.184;
    basketGroup.position.set(0, 0.142, -0.138);
    this.basketGroup = basketGroup;
    this.cockpitAlign.add(basketGroup);

    const bWTop = 0.276;
    const bDTop = 0.204;
    const bWBot = 0.216;
    const bDBot = 0.156;

    const yellowBasketGeoms = [];
    // Crisscross open yellow bottom wire grid (7 longitudinal + 5 lateral rods — 100% see-through & airy!)
    const yFloorA = -bH * 0.5 + 0.0022;
    const yFloorB = -bH * 0.5 - 0.0016;
    for (let kx = -3; kx <= 3; kx++) {
      const fx = kx * 0.026;
      const rodZ = new THREE.CylinderGeometry(0.0024, 0.0024, bDBot - 0.012, 6);
      rodZ.rotateX(Math.PI * 0.5);
      rodZ.translate(fx, yFloorA, 0);
      yellowBasketGeoms.push(rodZ);
    }
    for (let kz = -2; kz <= 2; kz++) {
      const fz = kz * 0.026;
      const rodX = new THREE.CylinderGeometry(0.0024, 0.0024, bWBot - 0.012, 6);
      rodX.rotateZ(Math.PI * 0.5);
      rodX.translate(0, yFloorB, fz);
      yellowBasketGeoms.push(rodX);
    }

    for (let tier = 0; tier < 5; tier++) {
      const u = tier / 4;
      const y = -bH * 0.5 + u * (bH * 0.96);
      const w = THREE.MathUtils.lerp(bWBot, bWTop, u) * 0.5;
      const d = THREE.MathUtils.lerp(bDBot, bDTop, u) * 0.5;
      const wireR = tier === 4 ? 0.0046 : 0.0034;
      const hoopCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-w, y, -d),
        new THREE.Vector3(+w, y, -d),
        new THREE.Vector3(+w, y, +d),
        new THREE.Vector3(-w, y, +d),
        new THREE.Vector3(-w, y, -d),
      ]);
      yellowBasketGeoms.push(new THREE.TubeGeometry(hoopCurve, 28, wireR, 7, false));
    }

    const baseWireGeom = new THREE.CylinderGeometry(0.0028, 0.0028, 1.0, 6);
    const pA = new THREE.Vector3();
    const pB = new THREE.Vector3();
    const wDir = new THREE.Vector3();
    const upY = new THREE.Vector3(0, 1, 0);
    const tmpRibObj = new THREE.Object3D();

    const perimSamples = 24;
    for (let i = 0; i < perimSamples; i++) {
      const ang = (i / perimSamples) * Math.PI * 2;
      const cosA = Math.cos(ang);
      const sinA = Math.sin(ang);
      const sx = Math.sign(cosA) * Math.pow(Math.abs(cosA), 0.55);
      const sz = Math.sign(sinA) * Math.pow(Math.abs(sinA), 0.55);
      pA.set(sx * bWBot * 0.5, -bH * 0.5, sz * bDBot * 0.5);
      pB.set(sx * bWTop * 0.5, bH * 0.48, sz * bDTop * 0.5);
      wDir.subVectors(pB, pA);
      const len = wDir.length();
      tmpRibObj.position.addVectors(pA, pB).multiplyScalar(0.5);
      tmpRibObj.quaternion.setFromUnitVectors(upY, wDir.normalize());
      tmpRibObj.scale.set(1, len, 1);
      tmpRibObj.updateMatrix();
      yellowBasketGeoms.push(baseWireGeom.clone().applyMatrix4(tmpRibObj.matrix));
    }
    baseWireGeom.dispose();

    const basketWireMesh = new THREE.Mesh(
      mergeStaticGeometries(yellowBasketGeoms),
      this.materials.gbikeYellow
    );
    basketWireMesh.castShadow = true;
    basketWireMesh.userData.logicalSubParts = 41;
    this.proceduralBasketWireMesh = basketWireMesh;
    basketGroup.add(basketWireMesh);

    // Upper handlebar clamp brackets + wide-stanced front-axle basket struts (`|x| >= 0.056m`, outside `±0.029m` fender!)
    for (const side of [-1, 1]) {
      const hbClamp = createTubeFromPoints(
        [
          [side * 0.052, 0.142 + bH * 0.34, -0.138 + bDTop * 0.48],
          [side * 0.052, 0.165, -0.042],
        ],
        0.0042,
        6,
        8,
        this.materials.gbikeChrome
      );
      this.cockpitAlign.add(hbClamp);

      const strut = createTubeFromPoints(
        [
          [side * 0.088, 0.142 - bH * 0.5, -0.138],
          [side * 0.064, -0.115, -0.165],
          [side * 0.056, this.axleY - 0.675, this.frontAxleZ + 0.352],
        ],
        0.0035,
        8,
        8,
        this.materials.gbikeChrome
      );
      this.cockpitAlign.add(strut);
    }

    // 6. 16-Slot Neatly Fanned/Stacked Glowing Google TPU Wafer Pod Rack (`0..16`, strictly EMPTY at `0 / 16`!)
    this.basketPropsGroup = new THREE.Group();
    this.basketPropsGroup.position.set(0, 0, 0);

    this.basketTpuStackGroup = new THREE.Group();
    this.basketTpuStackGroup.position.set(0, 0, 0);
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
      const row = Math.floor(i / 2); // 0..7 front-to-back stadium rows
      const col = i % 2;             // 0 = left (-X), 1 = right (+X)
      const colSign = col === 0 ? -1 : +1;
      const rowFrac = row / 7;

      slot.position.set(
        colSign * 0.049,
        -0.044 + row * 0.0046,
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

  /**
   * Explicitly sets how many miniature glowing TPU wafer boards (`0..16`) are stacked inside the front basket.
   * At `0`, the yellow woven wire basket is 100% clean & empty.
   */
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
        }
      }
    } else if (this.basketTpuSlots) {
      for (let i = 0; i < this.basketTpuSlots.length; i++) {
        const slot = this.basketTpuSlots[i];
        slot.visible = i < count;
        if (slot.visible) {
          slot.position.y =
            slot.userData.baseY + Math.sin(simTime * 5.2 + i * 0.65) * 0.0018;
        }
      }
    }
  }

  /**
   * Upgrades the 16 mini basket TPU slots with instanced batches of `TPU_Wafer_Pod` GLB (`<= 3` draw calls total!).
   */
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

  /**
   * Returns world-space pedal platform top center for `'left'|'right'` (or `-1|+1`).
   */
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

  _buildUnilateralDrivetrain() {
    const driveX = BIKE_CONSTANTS.driveSideX; // +0.068m (Right Side ONLY)

    // 1. Crank Assembly rotating at BB
    this.crankGroup = new THREE.Group();
    this.crankGroup.position.copy(this.bbPos);
    this.leanGroup.add(this.crankGroup);

    const spindle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0095, 0.0095, 0.192, 14),
      this.materials.gbikeChrome
    );
    spindle.rotation.z = Math.PI / 2;
    this.crankGroup.add(spindle);

    // SINGLE Right-Side 44T Machined Silver Chainring (x = +0.068m, zero left sprocket!)
    this.chainring = createSprocketMesh(
      BIKE_CONSTANTS.chainringTeeth,
      KIN_CONSTANTS.chainringRadiusM,
      0.0052,
      this.materials.gbikeAlloy,
      true
    );
    this.chainring.position.x = driveX;
    this.crankGroup.add(this.chainring);

    const R_crank = BIKE_CONSTANTS.crankRadiusM; // 0.170m
    this.crankArmX = 0.096;

    this.rightPedalGroup = this._createPedalAssembly(+1);
    this.rightPedalGroup.position.set(+this.crankArmX, R_crank, 0);
    this.crankGroup.add(this.rightPedalGroup);

    this.leftPedalGroup = this._createPedalAssembly(-1);
    this.leftPedalGroup.position.set(-this.crankArmX, -R_crank, 0);
    this.crankGroup.add(this.leftPedalGroup);

    for (const side of [1, -1]) {
      const ySign = side > 0 ? 1 : -1;
      const armX = side * this.crankArmX;
      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(0.011, R_crank + 0.026, 0.024),
        this.materials.gbikeChrome
      );
      arm.position.set(armX, ySign * (R_crank * 0.5), 0);
      arm.castShadow = true;
      this.crankGroup.add(arm);

      const bossCap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.016, 0.016, 0.014, 14),
        this.materials.gbikeChrome
      );
      bossCap.rotation.z = Math.PI / 2;
      bossCap.position.set(armX, 0, 0);
      this.crankGroup.add(bossCap);
    }

    // 2. Seamless Extruded Hockey-Stick Google Blue Chain Fender with Crisp White "Google" Typography
    const chainguardMesh = createSeamlessChainguardMesh(
      this.bbPos.y,
      this.bbPos.z,
      driveX,
      this.materials.gbikeChainguardGraphic
    );
    this.chainguardMesh = chainguardMesh;
    this.chainguardSolidMat = this.materials.gbikeChainguardGraphic;
    this.leanGroup.add(chainguardMesh);

    const topFlange = new THREE.Mesh(
      new THREE.BoxGeometry(0.016, 0.005, 0.415),
      this.materials.gbikeForkBlue
    );
    topFlange.position.set(driveX + 0.002, 0.3965, 0.292);
    this.chainguardTopFlange = topFlange;
    this.chainguardFlangeSolidMat = this.materials.gbikeForkBlue;
    this.leanGroup.add(topFlange);

    // 3. Exact 4-Segment Analytical Bitangent + Circular-Arc 98-Link Overlapping Roller Chain
    this._buildRollerChainLoop(driveX);

    // 4. `Drivetrain X-Ray` 3D Glass Cutaway + Precision Cobalt Linkage + Force Amber Torque Arc
    this._buildXrayCutawayOverlay(driveX);
  }

  _createPedalAssembly(sideSign) {
    const group = new THREE.Group();

    const spindleLen = 0.058;
    const spindle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0055, 0.0055, spindleLen, 10),
      this.materials.gbikeChrome
    );
    spindle.rotation.z = Math.PI / 2;
    spindle.position.x = sideSign * (spindleLen * 0.5);
    group.add(spindle);

    // Platform pedal body centered at x = sideSign * 0.060 (total X from bike center = ±0.156m === KIN_CONSTANTS.pedalStanceX!)
    const platform = new THREE.Group();
    platform.position.x = sideSign * 0.060;

    const treadBlock = new THREE.Mesh(
      new THREE.BoxGeometry(0.082, 0.022, 0.096),
      this.materials.gbikeTireRubber
    );
    treadBlock.castShadow = true;
    platform.add(treadBlock);

    for (const zSide of [-1, 1]) {
      const refl = new THREE.Mesh(
        new THREE.BoxGeometry(0.054, 0.010, 0.004),
        this.materials.reflectorAmber
      );
      refl.position.set(0, 0, zSide * 0.049);
      platform.add(refl);
    }

    const topAnchor = new THREE.Object3D();
    topAnchor.position.set(0, 0.011, 0);
    platform.add(topAnchor);

    group.add(platform);
    group.userData = { platform, topAnchor };
    return group;
  }

  _buildRollerChainLoop(driveX) {
    this.chainLength = CHAIN_LOOP_SPEC.totalLengthM;
    this.chainDriveX = driveX;

    this._sampleAnalyticalChain = (uNorm, outPos, outPitchObj) => {
      const pose = getChainLinkPose(uNorm, driveX);
      outPos.set(pose.x, pose.y, pose.z);
      outPitchObj.pitch = Math.atan2(-pose.ty, pose.tz);
    };

    const linkCount = BIKE_CONSTANTS.chainLinks;
    const pitch = this.chainLength / linkCount;
    const plateGeom = createFigureEightChainLinkGeometry(pitch);
    this.chainInstanced = new THREE.InstancedMesh(
      plateGeom,
      this.materials.gbikeChainSteel,
      linkCount
    );
    this.chainInstanced.castShadow = true;
    this.chainInstanced.receiveShadow = true;
    this.leanGroup.add(this.chainInstanced);

    const rollerGeom = new THREE.CylinderGeometry(0.0040, 0.0040, 0.0064, 10);
    rollerGeom.rotateZ(Math.PI / 2);
    this.chainRollersInstanced = new THREE.InstancedMesh(
      rollerGeom,
      this.materials.gbikeChainRoller,
      linkCount
    );
    this.chainRollersInstanced.castShadow = true;
    this.chainRollersInstanced.receiveShadow = true;
    this.leanGroup.add(this.chainRollersInstanced);
  }

  _buildXrayCutawayOverlay(driveX) {
    this.xrayEnabled = false;

    this.xrayChainguardMat = new THREE.MeshStandardMaterial({
      color: "#3b82f6",
      map: this.chainguardSolidMat ? this.chainguardSolidMat.map : null,
      roughness: 0.48,
      metalness: 0.08,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.xrayFlangeMat = new THREE.MeshStandardMaterial({
      color: "#38bdf8",
      roughness: 0.48,
      metalness: 0.10,
      transparent: true,
      opacity: 0.20,
      depthWrite: false,
    });

    this.xrayChainPlateMat = new THREE.MeshStandardMaterial({
      color: "#38bdf8",
      emissive: "#0284c7",
      emissiveIntensity: 0.52,
      roughness: 0.26,
      metalness: 0.62,
    });
    this.xrayChainRollerMat = new THREE.MeshStandardMaterial({
      color: "#f59e0b",
      emissive: "#d97706",
      emissiveIntensity: 0.46,
      roughness: 0.22,
      metalness: 0.72,
    });

    this.xrayOverlayGroup = new THREE.Group();
    this.xrayOverlayGroup.name = "GBike_XrayCutawayOverlay";
    this.xrayOverlayGroup.visible = false;
    this.leanGroup.add(this.xrayOverlayGroup);

    const edgesGeom = new THREE.EdgesGeometry(this.chainguardMesh.geometry, 26);
    const edgeLines = new THREE.LineSegments(
      edgesGeom,
      new THREE.LineBasicMaterial({
        color: "#38bdf8",
        transparent: true,
        opacity: 0.78,
      })
    );
    edgeLines.position.copy(this.chainguardMesh.position);
    edgeLines.rotation.copy(this.chainguardMesh.rotation);
    edgeLines.scale.copy(this.chainguardMesh.scale);
    this.xrayChainguardEdgeLines = edgeLines;
    this.xrayOverlayGroup.add(edgeLines);

    if (this.materials.gbikeChainguardWordmarkXray) {
      const wordmarkDecal = new THREE.Mesh(
        this.chainguardMesh.geometry,
        this.materials.gbikeChainguardWordmarkXray
      );
      wordmarkDecal.position.copy(this.chainguardMesh.position);
      wordmarkDecal.position.x += 0.0012;
      wordmarkDecal.rotation.copy(this.chainguardMesh.rotation);
      wordmarkDecal.scale.copy(this.chainguardMesh.scale);
      wordmarkDecal.renderOrder = 3;
      this.xrayWordmarkDecal = wordmarkDecal;
      this.xrayOverlayGroup.add(wordmarkDecal);
    }

    const rodMat = new THREE.MeshBasicMaterial({
      color: "#38bdf8",
      transparent: true,
      opacity: 0.92,
      depthTest: false,
    });
    const jointMat = new THREE.MeshBasicMaterial({
      color: "#e0f2fe",
      depthTest: false,
    });
    const rodUnitGeom = new THREE.CylinderGeometry(0.0052, 0.0052, 1.0, 10);
    const jointSphereGeom = new THREE.SphereGeometry(0.011, 12, 10);

    this.xrayThighRod = new THREE.Mesh(rodUnitGeom, rodMat);
    this.xrayShinRod = new THREE.Mesh(rodUnitGeom, rodMat);
    this.xrayFootRod = new THREE.Mesh(rodUnitGeom, rodMat);
    this.xrayJointDotsInstanced = new THREE.InstancedMesh(jointSphereGeom, jointMat, 4);
    this.xrayJointDotsInstanced.frustumCulled = false;

    for (const m of [
      this.xrayThighRod,
      this.xrayShinRod,
      this.xrayFootRod,
      this.xrayJointDotsInstanced,
    ]) {
      m.visible = false;
      m.renderOrder = 12;
      this.xrayOverlayGroup.add(m);
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

    const arrowTip = new THREE.Mesh(
      new THREE.ConeGeometry(0.012, 0.028, 10),
      this.xrayTorqueArcMat
    );
    arrowTip.position.set(
      0,
      Math.sin(arcSweep) * arcRadius,
      Math.cos(arcSweep) * arcRadius
    );
    arrowTip.rotation.x = -(arcSweep + Math.PI * 0.5);
    arrowTip.renderOrder = 13;

    this.xrayTorquePivot.add(torqueArc, arrowTip);
    compactRigidGroupMeshes(this.xrayTorquePivot);
    this.xrayOverlayGroup.add(this.xrayTorquePivot);
  }

  setXrayMode(enabled) {
    const next = Boolean(enabled);
    this.xrayEnabled = next;
    if (this.chainguardMesh) {
      this.chainguardMesh.material = next ? this.xrayChainguardMat : this.chainguardSolidMat;
      this.chainguardMesh.castShadow = !next;
    }
    if (this.chainguardTopFlange) {
      this.chainguardTopFlange.material = next
        ? this.xrayFlangeMat
        : this.chainguardFlangeSolidMat;
      this.chainguardTopFlange.castShadow = !next;
    }
    if (this.chainInstanced) {
      this.chainInstanced.material = next
        ? this.xrayChainPlateMat
        : this.materials.gbikeChainSteel;
    }
    if (this.chainRollersInstanced) {
      this.chainRollersInstanced.material = next
        ? this.xrayChainRollerMat
        : this.materials.gbikeChainRoller;
    }
    if (this.xrayOverlayGroup) {
      this.xrayOverlayGroup.visible = next;
    }
  }

  setCelebrationHandlebarHidden(hidden) {
    const hide = Boolean(hidden);
    if (this._celebrationHandlebarHidden === hide) return;
    this._celebrationHandlebarHidden = hide;
    if (this._celebrationOccludedParts) {
      for (const p of this._celebrationOccludedParts) {
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

  /**
   * Alias for `attachCockpitPropsGlb` supporting `attachCockpitGlb`, `attachVehiclesV2Glb`, and safe no-op `attachPriorityGbikeV9Glb`.
   */
  attachCockpitGlb(gltfScene) {
    return this.attachCockpitPropsGlb(gltfScene);
  }

  attachVehiclesV2Glb(gltfScene) {
    return this.attachCockpitPropsGlb(gltfScene);
  }

  attachPriorityGbikeV9Glb(_gltfScene) {
    // Classic V6 GBike intentionally ignores Priority V9 GLB so `?bike=classic` preserves 100% Classic V6 visuals!
  }

  /**
   * Attaches Cycles-verified V2 GBike GLB sub-parts (`GBike_Saddle_V2`, `GBike_Basket_V2`,
   * `GBike_Bell_V2`, `GBike_Bell_Lever_V2`, `GBike_ChainGuard_V2`, `GBike_HeadBadge_V2`)
   * from either `gbike_cockpit_props_glb.js` or `gbike_and_vehicles_v2_glb.js` (ZERO fish, ZERO baguette!).
   */
  attachCockpitPropsGlb(gltfScene) {
    if (!gltfScene || this._cockpitV2Attached) return;

    const findExactOrPartial = (exactNames, partialPatterns = []) => {
      let match = null;
      const lowerExacts = exactNames.map((n) => n.toLowerCase());
      gltfScene.traverse((obj) => {
        if (match || !obj.name || SHADOW_PLANE_NAME_RE.test(obj.name)) return;
        const lower = obj.name.toLowerCase();
        if (lowerExacts.includes(lower)) {
          match = obj;
        }
      });
      if (!match && partialPatterns.length > 0) {
        gltfScene.traverse((obj) => {
          if (match || !obj.name || SHADOW_PLANE_NAME_RE.test(obj.name)) return;
          const lower = obj.name.toLowerCase();
          if (partialPatterns.some((p) => lower.includes(p))) {
            match = obj;
          }
        });
      }
      return match;
    };

    const cloneSingleMesh = (srcNode, castShadow = true, overrideMat = null) => {
      if (srcNode.isMesh) {
        const mesh = new THREE.Mesh(
          srcNode.geometry,
          overrideMat || (srcNode.material ? srcNode.material.clone() : undefined)
        );
        mesh.castShadow = castShadow;
        mesh.receiveShadow = true;
        return mesh;
      }
      const grp = srcNode.clone(true);
      grp.position.set(0, 0, 0);
      grp.rotation.set(0, 0, 0);
      grp.scale.set(1, 1, 1);
      grp.traverse((ch) => {
        if (ch.isMesh) {
          if (overrideMat) ch.material = overrideMat;
          ch.castShadow = castShadow;
          ch.receiveShadow = true;
        }
      });
      stripAttachedShadowPlanesAndEnableCast(grp);
      compactRigidGroupMeshes(grp);
      return grp;
    };

    let attachedAny = false;
    const tex = getV6GBikeProceduralTextures();

    // 1. Stitched Honey-Leather Cruiser Saddle + Chrome Twin Coil Springs (`GBike_Saddle_V2`)
    const saddleNode = findExactOrPartial(["gbike_saddle_v2"], ["cruiser_saddle"]);
    if (saddleNode && this.saddleGroup) {
      const clone = cloneSingleMesh(saddleNode, true);
      clone.traverse((ch) => {
        if (ch.isMesh && ch.material) {
          const m = ch.material.clone();
          const mName = `${ch.name || ""} ${m.name || ""}`.toLowerCase();
          if (mName.includes("chrome") || mName.includes("spring") || (m.metalness ?? 0) > 0.5) {
            m.metalness = 0.86;
            m.metalnessMap = tex.aluMetalTex;
            m.roughness = 0.22;
            m.name = "GBike_Saddle_Spring_Chrome";
          } else {
            m.metalnessMap = null;
            m.roughnessMap = null;
            m.roughness = 0.60;
            m.metalness = 0.02;
            m.bumpMap = m.bumpMap || tex.powderRoughTex;
            m.bumpScale = 0.0028;
            m.envMapIntensity = 0.12;
            m.name = "GBike_Saddle_Leather_V6";
          }
          ch.material = m;
          ch.castShadow = true;
          ch.receiveShadow = true;
        }
      });
      if (saddleNode.name.toLowerCase().includes("gbike_saddle_v2")) {
        // Local `(0, 0, 0)` IS `saddleTopPos` (`+0.002m` leather crown, `-0.052m` seatpost clamp)
        clone.position.set(0, 0, 0);
        for (const sp of this.saddleSprings || []) sp.visible = false;
      } else {
        const box = new THREE.Box3().setFromObject(clone);
        if (!box.isEmpty()) {
          const center = box.getCenter(new THREE.Vector3());
          clone.position.set(-center.x, -box.max.y + 0.002, -center.z + 0.008);
        }
      }
      this.saddleGroup.add(clone);
      for (const p of this.proceduralSaddleParts || []) p.visible = false;
      this._v2SaddleAttached = true;
      attachedAny = true;
    }

    // 2. Clean Empty Woven Yellow Wire-Mesh Cruiser Basket (`GBike_Basket_V2` — ZERO fish, ZERO baguette!)
    const basketNode = findExactOrPartial(["gbike_basket_v2"]);
    if (basketNode && this.basketGroup) {
      const clone = cloneSingleMesh(basketNode, true, this.materials.gbikeYellow);
      clone.position.set(0, 0, 0);
      this.basketGroup.add(clone);
      if (this.proceduralBasketWireMesh) {
        this.proceduralBasketWireMesh.visible = false;
      }
      attachedAny = true;
    }

    // 3. Polished Mirror-Chrome Rotary Dome Bell (`GBike_Bell_V2`) + Articulated Thumb Striker (`GBike_Bell_Lever_V2`)
    const bellNode = findExactOrPartial(["gbike_bell_v2"]);
    const bellLeverNode = findExactOrPartial(["gbike_bell_lever_v2"]);
    if (bellNode && this.bellGroup) {
      const bellMesh = cloneSingleMesh(bellNode, true, this.materials.gbikeChrome);
      bellMesh.position.set(0, 0, 0);
      this.bellGroup.add(bellMesh);
      for (const p of this.proceduralBellParts || []) p.visible = false;
      attachedAny = true;
    }
    if (bellLeverNode && this.bellStrikerPivot) {
      const leverMesh = cloneSingleMesh(bellLeverNode, true);
      leverMesh.position.set(0, 0, 0);
      this.bellStrikerPivot.add(leverMesh);
      for (const p of this.proceduralBellStrikerParts || []) p.visible = false;
      attachedAny = true;
    }

    // 4. Hydroformed Google-Blue Hockey-Stick Chain Guard (`GBike_ChainGuard_V2`) + Seamless X-Ray Cutaway Upgrade
    const cgNode = findExactOrPartial(["gbike_chainguard_v2"]);
    if (cgNode && cgNode.isMesh && this.leanGroup) {
      const driveX = BIKE_CONSTANTS.driveSideX;
      if (this.chainguardMesh) this.chainguardMesh.visible = false;
      if (this.chainguardTopFlange) {
        this.chainguardTopFlange.visible = false;
        this.chainguardTopFlange = null;
      }

      // Rebuild non-indexed planar UVs on `GBike_ChainGuard_V2` to eliminate the 92 seam-wrapped
      // triangles in the GLB that caused horizontal white texel streaks across the fender!
      const cgGeom = cgNode.geometry.index ? cgNode.geometry.toNonIndexed() : cgNode.geometry.clone();
      const cgPos = cgGeom.attributes.position;
      const cleanUvs = new Float32Array(cgPos.count * 2);
      const va = new THREE.Vector3();
      const vb = new THREE.Vector3();
      const vc = new THREE.Vector3();
      const vab = new THREE.Vector3();
      const vac = new THREE.Vector3();
      for (let i = 0; i < cgPos.count; i += 3) {
        va.fromBufferAttribute(cgPos, i);
        vb.fromBufferAttribute(cgPos, i + 1);
        vc.fromBufferAttribute(cgPos, i + 2);
        vab.subVectors(vb, va);
        vac.subVectors(vc, va);
        const fn = vab.cross(vac).normalize();
        const isOuterFlat = fn.x > 0.94 && va.x > 0.006 && vb.x > 0.006 && vc.x > 0.006;
        for (let k = 0; k < 3; k++) {
          const idx2 = (i + k) * 2;
          if (isOuterFlat) {
            const py = cgPos.getY(i + k);
            const pz = cgPos.getZ(i + k);
            // Strictly linear `(z, y)` -> `(u, v)` (no per-vertex clamp!) so large N-gon fan triangles
            // interpolate affinely; `ClampToEdgeWrapping` clamps outside `[0, 1]` per-pixel to `#2A62AD`!
            cleanUvs[idx2] = (0.255 - pz) / 0.210;
            cleanUvs[idx2 + 1] = (py - 0.029) / 0.056;
          } else {
            cleanUvs[idx2] = -1.0;
            cleanUvs[idx2 + 1] = -1.0;
          }
        }
      }
      cgGeom.setAttribute("uv", new THREE.BufferAttribute(cleanUvs, 2));

      let wordmarkTex = null;
      if (typeof document !== "undefined") {
        const c = document.createElement("canvas");
        c.width = 512;
        c.height = 128;
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#2A62AD";
        ctx.fillRect(0, 0, 512, 128);
        ctx.fillStyle = "#ffffff";
        ctx.font = '700 50px "Google Sans", "Product Sans", system-ui, sans-serif';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("Google", 256, 65);
        wordmarkTex = new THREE.CanvasTexture(c);
        wordmarkTex.wrapS = THREE.ClampToEdgeWrapping;
        wordmarkTex.wrapT = THREE.ClampToEdgeWrapping;
        wordmarkTex.colorSpace = THREE.SRGBColorSpace;
        wordmarkTex.anisotropy = 8;
      }

      const v2Mat = new THREE.MeshPhysicalMaterial({
        name: "GBike_ChainGuard_PowderCoat_Blue",
        color: wordmarkTex ? "#ffffff" : "#2A62AD",
        map: wordmarkTex || null,
        roughness: 0.42,
        roughnessMap: tex.powderRoughTex,
        metalness: 0.06,
        clearcoat: 0.35,
        clearcoatRoughness: 0.28,
        envMapIntensity: 0.34,
        side: THREE.FrontSide,
      });
      const v2Guard = new THREE.Mesh(cgGeom, v2Mat);
      v2Guard.position.set(driveX + 0.0085, this.bbPos.y, this.bbPos.z);
      v2Guard.castShadow = !this.xrayEnabled;
      v2Guard.receiveShadow = false;
      this.leanGroup.add(v2Guard);

      this.chainguardSolidMat = v2Mat;
      this.chainguardMesh = v2Guard;
      this.hasGlbChainGuard = true;
      if (this.xrayChainguardMat && wordmarkTex) {
        this.xrayChainguardMat.map = wordmarkTex;
        this.xrayChainguardMat.color.set("#ffffff");
        this.xrayChainguardMat.opacity = 0.54;
        this.xrayChainguardMat.side = THREE.FrontSide;
        this.xrayChainguardMat.needsUpdate = true;
      }
      if (this.xrayWordmarkDecal) {
        this.xrayWordmarkDecal.visible = false;
      }
      if (this.xrayEnabled) {
        v2Guard.material = this.xrayChainguardMat;
      }

      if (this.xrayChainguardEdgeLines) {
        this.xrayChainguardEdgeLines.geometry.dispose();
        this.xrayChainguardEdgeLines.geometry = new THREE.EdgesGeometry(cgNode.geometry, 26);
        this.xrayChainguardEdgeLines.position.copy(v2Guard.position);
      }
      if (this.xrayWordmarkDecal) {
        // Hide procedural decal when GLB chainguard is attached so X-ray never double-draws overlapping wordmarks!
        this.xrayWordmarkDecal.visible = false;
      }
      attachedAny = true;
    }

    // 5. Curved 4-Color Enameled Google Head-Tube Shield Emblem (`GBike_HeadBadge_V2`)
    const badgeNode = findExactOrPartial(["gbike_headbadge_v2"]);
    if (badgeNode && this.headTubeGroup) {
      const badgeMesh = cloneSingleMesh(badgeNode, true);
      badgeMesh.position.set(0, 0, 0);
      this.headTubeGroup.add(badgeMesh);
      attachedAny = true;
    }

    if (attachedAny) {
      this._cockpitV2Attached = true;
      stripAttachedShadowPlanesAndEnableCast(this.root, this.xrayOverlayGroup);
      if (this.chainguardMesh) {
        this.chainguardMesh.castShadow = !this.xrayEnabled;
      }
      this.leanGroup.updateMatrixWorld(true);
    }
  }

  _buildSaddleBrakeCableAndKickstand() {
    // 1. Wide Plush Honey-Brown Cruiser Saddle + Dual Chrome Helical Springs + Seatpost Clamp
    const saddleGroup = new THREE.Group();
    saddleGroup.position.copy(this.saddleTopPos);
    this.saddleGroup = saddleGroup;

    const cushion = new THREE.Mesh(
      new THREE.SphereGeometry(0.115, 22, 16),
      this.honeySaddleMat
    );
    cushion.scale.set(1.05, 0.30, 1.25);
    cushion.position.set(0, -0.018, 0.015);
    cushion.castShadow = true;
    saddleGroup.add(cushion);

    const saddleNose = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.028, 0.095, 8, 14),
      this.honeySaddleMat
    );
    saddleNose.rotation.x = Math.PI * 0.47;
    saddleNose.position.set(0, -0.016, -0.088);
    saddleNose.castShadow = true;
    saddleGroup.add(saddleNose);

    const seatGutsClamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.042, 0.024, 0.044),
      this.materials.gbikeBasketLiner
    );
    seatGutsClamp.position.set(0, -0.052, 0.012);
    saddleGroup.add(seatGutsClamp);

    this.proceduralSaddleParts = [cushion, saddleNose, seatGutsClamp];
    this.saddleSprings = [];

    for (const side of [-1, 1]) {
      const springPts = [];
      const turns = 4.5;
      for (let i = 0; i <= 28; i++) {
        const u = i / 28;
        const ang = u * turns * Math.PI * 2;
        springPts.push([
          side * 0.058 + Math.cos(ang) * 0.014,
          -0.068 + u * 0.042,
          0.068 + Math.sin(ang) * 0.014,
        ]);
      }
      const spring = createTubeFromPoints(springPts, 0.0028, 28, 6, this.materials.gbikeChrome);
      saddleGroup.add(spring);
      this.saddleSprings.push(spring);
    }
    this.leanGroup.add(saddleGroup);

    // 2. Rear Seatstay Side-Pull Caliper Brake + Routed Rear Brake Cable Housing along `downTube`
    const rearCalPivot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0065, 0.0065, 0.024, 10).rotateX(Math.PI * 0.5),
      this.materials.gbikeChrome
    );
    rearCalPivot.position.set(0, 0.588, 0.244);
    this.leanGroup.add(rearCalPivot);

    for (const side of [-1, 1]) {
      const rArm = createTubeFromPoints(
        [
          [0, 0.588, 0.248],
          [side * 0.036, 0.562, 0.264],
          [side * 0.020, 0.526, 0.282],
        ],
        0.0038,
        8,
        8,
        this.materials.gbikeAlloy
      );
      this.leanGroup.add(rArm);

      const rPad = new THREE.Mesh(
        new THREE.BoxGeometry(0.008, 0.012, 0.030),
        this.materials.gbikeTireRubber
      );
      rPad.position.set(side * 0.017, 0.524, 0.285);
      rPad.rotation.x = 0.48;
      this.leanGroup.add(rPad);
    }

    const rearFrameBrakeCable = createTubeFromPoints(
      [
        [-0.018, 0.728, -0.390],
        [-0.016, 0.580, -0.205],
        [-0.014, 0.428, -0.045],
        [-0.014, 0.398, +0.122],
        [-0.022, 0.520, +0.198],
        [-0.028, 0.582, +0.246],
      ],
      0.0028,
      24,
      8,
      this.materials.gbikeTireRubber
    );
    this.leanGroup.add(rearFrameBrakeCable);

    // 3. Unilateral Folded Left-Side Rear-Stay Kickstand (z = +0.355m .. +0.510m, >= 55mm crank/pedal/foot clearance!)
    this.kickstandSegA = new THREE.Vector3(-0.046, 0.308, 0.358);
    this.kickstandSegB = new THREE.Vector3(-0.054, 0.286, 0.512);
    this.kickstandRadius = 0.006;

    const kickstandMount = new THREE.Mesh(
      new THREE.BoxGeometry(0.018, 0.020, 0.030),
      this.materials.gbikeAlloy
    );
    kickstandMount.position.set(-0.044, 0.310, 0.355);
    this.leanGroup.add(kickstandMount);

    const kickstandLeg = createTubeFromPoints(
      [this.kickstandSegA.toArray(), this.kickstandSegB.toArray()],
      0.0052,
      8,
      10,
      this.materials.gbikeAlloy
    );
    this.leanGroup.add(kickstandLeg);

    const kickstandFoot = new THREE.Mesh(
      new THREE.SphereGeometry(0.0085, 10, 10),
      this.materials.gbikeTireRubber
    );
    kickstandFoot.position.copy(this.kickstandSegB);
    this.leanGroup.add(kickstandFoot);
  }

  /**
   * Computes exact minimum 3D clearance (m) between left crank/pedal/foot and folded kickstand in `leanGroup` space.
   */
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

    for (const pt of extraLocalPoints) {
      samples.push(pt);
    }

    let minDist = Infinity;
    for (const p of samples) {
      const d = Math.sqrt(pointToSegmentDistSq(p, this.kickstandSegA, this.kickstandSegB)) - this.kickstandRadius;
      if (d < minDist) minDist = d;
    }
    return Math.max(0, minDist);
  }

  /**
   * Updates all mechanical joints of the GBike for the current simulation step.
   */
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
    this.basketPropsGroup.rotation.z = -steerRad * 0.28;

    if (tpusCollected !== undefined && tpusCollected !== null) {
      this._collectedTpuCount = THREE.MathUtils.clamp(
        Math.round(Number(tpusCollected) || 0),
        0,
        MAX_BASKET_TPUS
      );
    }
    this._syncBasketTpuVisuals(this._collectedTpuCount, simTime);

    // Live saddle coil-spring micro-compression (`0..4.5mm`, keeping `seatPost` socketed inside clamp!)
    const suspM = THREE.MathUtils.clamp((suspensionCompressionMm || 0) * 0.001, 0, 0.0045);
    if (this.saddleGroup) {
      this.saddleGroup.position.set(
        this.saddleTopPos.x,
        this.saddleTopPos.y - suspM,
        this.saddleTopPos.z
      );
      this.saddleGroup.rotation.x = suspM * 3.2;
    }
    if (this.saddleSprings && !this._v2SaddleAttached) {
      const spScaleY = Math.max(0.76, 1.0 - suspM * 9.5);
      for (const sp of this.saddleSprings) {
        sp.scale.set(1.0, spScaleY, 1.0);
      }
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

    // Advance analytical roller chain & pin rollers via `kin.js` (`getChainLinkPose`, exact 0.00% tooth slip!)
    const chainTravel = crankRad * KIN_CONSTANTS.chainringRadiusM;
    const linkCount = BIKE_CONSTANTS.chainLinks;
    const pitchHolder = { pitch: 0 };

    for (let i = 0; i < linkCount; i++) {
      const uLink = (i + 0.5) / linkCount + chainTravel / this.chainLength;
      this._sampleAnalyticalChain(uLink, _pos, pitchHolder);
      _quat.setFromAxisAngle(_upX, pitchHolder.pitch);
      const isOuterPlate = i % 2 === 0;
      _scale.set(isOuterPlate ? 1.22 : 0.88, isOuterPlate ? 1.05 : 0.94, 1.0);
      _mat4.compose(_pos, _quat, _scale);
      this.chainInstanced.setMatrixAt(i, _mat4);

      const uPin = i / linkCount + chainTravel / this.chainLength;
      this._sampleAnalyticalChain(uPin, _pos, pitchHolder);
      _quat.setFromAxisAngle(_upX, 0);
      _scale.set(1, 1, 1);
      _mat4.compose(_pos, _quat, _scale);
      this.chainRollersInstanced.setMatrixAt(i, _mat4);
    }
    this.chainInstanced.instanceMatrix.needsUpdate = true;
    this.chainRollersInstanced.instanceMatrix.needsUpdate = true;

    // Instant Frame-0 Silver GBike Bell Striker (+ frantic second strike at +0.34s during startled surprise!)
    if (bellStrikeElapsed >= 0 && bellStrikeElapsed < 1.05) {
      const flick1 =
        bellStrikeElapsed < 0.85
          ? -Math.exp(-bellStrikeElapsed * 6.2) * Math.cos(bellStrikeElapsed * 21.0) * 0.56
          : 0.0;
      const dt2 = bellStrikeElapsed - 0.34;
      const flick2 =
        effSurprise > 0.1 && dt2 >= 0 && dt2 < 0.70
          ? -Math.exp(-dt2 * 6.5) * Math.cos(dt2 * 22.0) * 0.54
          : 0.0;
      this.bellStrikerPivot.rotation.y = Math.abs(flick2) > Math.abs(flick1) ? flick2 : flick1;
      const ringEnv =
        Math.exp(-bellStrikeElapsed * 9.0) +
        (effSurprise > 0.1 && dt2 >= 0 ? Math.exp(-dt2 * 9.0) : 0.0);
      this.bellGroup.position.y = 0.208 + ringEnv * Math.cos(bellStrikeElapsed * 95.0) * 0.0022;
    } else {
      this.bellStrikerPivot.rotation.y = 0;
      this.bellGroup.position.y = 0.208;
    }

    // Synchronize ancestor (`heroAnchor`) AND descendant (`leanGroup`, `crankGroup`, `steerGroup`, pedals, grips)
    // world matrices BEFORE inverting `leanGroup.matrixWorld`, eliminating stale Frame N-1 world-matrix desync!
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
 * Companion four-color GBike builder for Sunny Campus Bike Corral:
 *   - Straight `seatTube` + chrome `seatPost` welded directly into honey-brown cruiser saddle
 *   - Proper `headTube` + chrome `quillStem` clamping cruiser handlebars + rubber grips
 *   - Open yellow woven wire-mesh basket (100% clean & empty — zero fish, zero baguette!)
 *   - Material-batched static geometries (~7 draw calls per parked bike)
 */
export function createParkedGBikeMeshClassic(materials) {
  const v6Mats = buildV6GBikeMaterials(materials);
  const g = new THREE.Group();
  const axleY = 0.334; // BIKE_CONSTANTS.wheelRadiusM (0.335m) - 0.001m micro-contact
  const rZ = +0.52;
  const fZ = -0.52;

  const cruiserTireGeoms = [];
  const rubberGeoms = [];
  const wwGeoms = [];
  const rimGeoms = [];
  const yellowGeoms = [];
  const greenGeoms = [];
  const chromeGeoms = [];
  const redGeoms = [];
  const blueGeoms = [];

  const tmpObj = new THREE.Object3D();
  const upVec = new THREE.Vector3(0, 1, 0);
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

  // 1. Spoked Front & Rear Wheels (`18` cross-laced spokes + hub barrel + flanges per wheel)
  const baseSpoke = new THREE.CylinderGeometry(0.0014, 0.0014, 1.0, 5);
  for (const z of [rZ, fZ]) {
    cruiserTireGeoms.push(
      new THREE.TorusGeometry(0.304, 0.030, 12, 32).rotateY(Math.PI / 2).translate(0, axleY, z)
    );
    wwGeoms.push(
      new THREE.TorusGeometry(0.286, 0.015, 8, 28).rotateY(Math.PI / 2).translate(0, axleY, z)
    );
    rimGeoms.push(
      new THREE.TorusGeometry(0.270, 0.013, 10, 28).rotateY(Math.PI / 2).translate(0, axleY, z)
    );

    chromeGeoms.push(
      new THREE.CylinderGeometry(0.015, 0.015, 0.084, 12).rotateZ(Math.PI / 2).translate(0, axleY, z)
    );
    for (const side of [-1, 1]) {
      chromeGeoms.push(
        new THREE.CylinderGeometry(0.026, 0.026, 0.004, 12)
          .rotateZ(Math.PI / 2)
          .translate(side * 0.028, axleY, z)
      );
    }

    for (let i = 0; i < 18; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const crossDir = Math.floor(i / 2) % 2 === 0 ? 1 : -1;
      const rimAng = (i / 18) * Math.PI * 2;
      const hubAng = rimAng + crossDir * 0.55;
      pHub.set(side * 0.028, axleY + Math.sin(hubAng) * 0.022, z + Math.cos(hubAng) * 0.022);
      pRim.set(side * 0.002, axleY + Math.sin(rimAng) * 0.262, z + Math.cos(rimAng) * 0.262);
      dirVec.subVectors(pRim, pHub);
      const len = dirVec.length();
      tmpObj.position.addVectors(pHub, pRim).multiplyScalar(0.5);
      tmpObj.quaternion.setFromUnitVectors(upVec, dirVec.normalize());
      tmpObj.scale.set(1, len, 1);
      tmpObj.updateMatrix();
      chromeGeoms.push(baseSpoke.clone().applyMatrix4(tmpObj.matrix));
    }
  }
  baseSpoke.dispose();

  // 2. Connected Step-Through Red Cruiser Frame
  redGeoms.push(
    tubeGeom([[0, 0.692, -0.402], [0, 0.802, -0.366]], 0.020, 6, 12),
    tubeGeom([[0, 0.280, +0.080], [0, 0.625, +0.198]], 0.017, 8, 10),
    tubeGeom(
      [
        [0, 0.782, -0.372],
        [0, 0.580, -0.198],
        [0, 0.425, -0.042],
        [0, 0.390, +0.118],
      ],
      0.016,
      16,
      10
    ),
    tubeGeom(
      [
        [0, 0.712, -0.396],
        [0, 0.542, -0.192],
        [0, 0.340, -0.062],
        [0, 0.280, +0.080],
      ],
      0.017,
      16,
      10
    ),
    new THREE.CylinderGeometry(0.024, 0.024, 0.068, 14).rotateZ(Math.PI / 2).translate(0, 0.280, +0.080)
  );
  for (const side of [-1, 1]) {
    redGeoms.push(
      tubeGeom(
        [
          [side * 0.024, 0.280, +0.080],
          [side * 0.044, 0.305, +0.300],
          [side * 0.046, axleY, rZ],
        ],
        0.010,
        10,
        8
      ),
      tubeGeom(
        [
          [side * 0.018, 0.595, +0.188],
          [side * 0.044, 0.515, +0.305],
          [side * 0.046, axleY + 0.010, rZ],
        ],
        0.0095,
        10,
        8
      )
    );
  }

  // 3. Blue Fork Crown & Dual Fork Blades
  blueGeoms.push(
    tubeGeom([[-0.048, 0.678, -0.408], [0, 0.686, -0.404], [+0.048, 0.678, -0.408]], 0.014, 8, 10),
    tubeGeom([[0, 0.686, -0.404], [0, 0.700, -0.399]], 0.015, 4, 10)
  );
  for (const side of [-1, 1]) {
    blueGeoms.push(
      tubeGeom(
        [
          [side * 0.048, 0.678, -0.408],
          [side * 0.054, 0.505, -0.472],
          [side * 0.052, axleY, fZ],
        ],
        0.0125,
        10,
        10
      )
    );
  }

  // 4. Chrome `seatPost`, `quillStem`, Gullwing Handlebars & Deployed Kickstand
  chromeGeoms.push(
    new THREE.CylinderGeometry(0.021, 0.021, 0.020, 12).translate(0, 0.625, +0.198),
    tubeGeom([[0, 0.618, +0.196], [0, 0.732, +0.220]], 0.0135, 6, 10),
    tubeGeom(
      [
        [0, 0.792, -0.369],
        [0, 0.836, -0.362],
        [0, 0.835, -0.396],
      ],
      0.0125,
      8,
      10
    ),
    tubeGeom(
      [
        [-0.23, 0.88, -0.18],
        [-0.13, 0.85, -0.36],
        [0, 0.835, -0.396],
        [+0.13, 0.85, -0.36],
        [+0.23, 0.88, -0.18],
      ],
      0.011,
      20,
      8
    ),
    tubeGeom([[-0.032, 0.282, +0.130], [-0.155, 0.008, +0.165]], 0.0058, 6, 8)
  );

  for (const side of [-1, 1]) {
    rubberGeoms.push(
      tubeGeom(
        [
          [side * 0.19, 0.87, -0.25],
          [side * 0.235, 0.882, -0.17],
        ],
        0.015,
        6,
        8
      )
    );
  }
  rubberGeoms.push(new THREE.SphereGeometry(0.010, 8, 8).translate(-0.155, 0.008, +0.165));

  const saddleGeom = new THREE.SphereGeometry(0.105, 14, 10);
  saddleGeom.scale(1.0, 0.32, 1.28);
  saddleGeom.translate(0, 0.730, +0.220);

  // 5. Thin U-Channel Green Rear & Front Mudguard Fenders
  greenGeoms.push(
    createUChannelFenderGeometry({
      rMid: 0.346,
      halfW: 0.028,
      wallThick: 0.0055,
      lipDrop: 0.014,
      thetaStart: -1.18,
      thetaEnd: +1.28,
      arcSegs: 22,
    }).translate(0, axleY, rZ),
    createUChannelFenderGeometry({
      rMid: 0.346,
      halfW: 0.028,
      wallThick: 0.0055,
      lipDrop: 0.014,
      thetaStart: -0.46,
      thetaEnd: +0.52,
      arcSegs: 20,
    }).translate(0, axleY, fZ)
  );

  // 6. Open Airy Yellow Wire-Mesh Front Basket (`(0, 0.81, -0.50)`) — 100% clean & empty!
  const bx = 0;
  const by = 0.81;
  const bz = -0.50;
  const bH = 0.165;
  for (let kx = -2; kx <= 2; kx++) {
    yellowGeoms.push(
      new THREE.CylinderGeometry(0.0024, 0.0024, 0.145, 5)
        .rotateX(Math.PI * 0.5)
        .translate(bx + kx * 0.036, by - bH * 0.5 + 0.002, bz)
    );
  }
  for (let kz = -2; kz <= 2; kz++) {
    yellowGeoms.push(
      new THREE.CylinderGeometry(0.0024, 0.0024, 0.195, 5)
        .rotateZ(Math.PI * 0.5)
        .translate(bx, by - bH * 0.5, bz + kz * 0.028)
    );
  }
  for (let t = 0; t < 4; t++) {
    const u = t / 3;
    const hy = by - bH * 0.5 + u * bH;
    const hw = THREE.MathUtils.lerp(0.10, 0.13, u);
    const hd = THREE.MathUtils.lerp(0.075, 0.098, u);
    yellowGeoms.push(
      tubeGeom(
        [
          [-hw, hy, bz - hd],
          [+hw, hy, bz - hd],
          [+hw, hy, bz + hd],
          [-hw, hy, bz + hd],
          [-hw, hy, bz - hd],
        ],
        0.0036,
        16,
        5
      )
    );
  }
  const baseRib = new THREE.CylinderGeometry(0.003, 0.003, bH, 5);
  for (let i = 0; i < 14; i++) {
    const ang = (i / 14) * Math.PI * 2;
    const rx = Math.sign(Math.cos(ang)) * Math.pow(Math.abs(Math.cos(ang)), 0.6) * 0.115;
    const rz = Math.sign(Math.sin(ang)) * Math.pow(Math.abs(ang ? Math.sin(ang) : 0), 0.6) * 0.086;
    yellowGeoms.push(baseRib.clone().translate(bx + rx, by, bz + rz));
  }
  baseRib.dispose();

  for (const side of [-1, 1]) {
    chromeGeoms.push(
      tubeGeom(
        [
          [side * 0.048, by + 0.055, bz + 0.092],
          [side * 0.048, 0.840, -0.392],
        ],
        0.004,
        4,
        6
      ),
      tubeGeom(
        [
          [side * 0.082, by - bH * 0.5, bz],
          [side * 0.060, 0.560, -0.512],
          [side * 0.054, axleY, fZ],
        ],
        0.0034,
        6,
        6
      )
    );
  }

  const cg = createSeamlessChainguardMesh(0.28, 0.08, 0.055, v6Mats.gbikeChainguardGraphic || v6Mats.gbikeForkBlue);
  g.add(cg);

  const addMerged = (geoms, mat, cast = true) => {
    const m = new THREE.Mesh(mergeStaticGeometries(geoms), mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    g.add(m);
  };

  addMerged(cruiserTireGeoms, v6Mats.gbikeCruiserTire || v6Mats.gbikeTireRubber);
  addMerged(rubberGeoms, v6Mats.gbikeTireRubber);
  addMerged(wwGeoms, v6Mats.gbikeWhitewall);
  addMerged(rimGeoms, v6Mats.gbikeBrushedRim || v6Mats.gbikeAlloy);
  addMerged(yellowGeoms, v6Mats.gbikeYellow);
  addMerged(greenGeoms, v6Mats.gbikeGreen);
  addMerged(chromeGeoms, v6Mats.gbikeChrome);
  addMerged(redGeoms, v6Mats.gbikeFrameRed);
  addMerged(blueGeoms, v6Mats.gbikeForkBlue);

  const saddle = new THREE.Mesh(saddleGeom, createHoneySaddleMaterial(v6Mats));
  saddle.castShadow = true;
  g.add(saddle);

  return g;
}
