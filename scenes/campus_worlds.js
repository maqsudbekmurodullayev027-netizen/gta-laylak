/**
 * campus_worlds.js — All 5 Iconic Mountain View Google Campus 3D Worlds (T_CLIP = 5.2s, T_TOTAL = 26.0s).
 *
 * Wave 2 Frustum-Verified Landmark Composition & Organic Foliage Overhaul:
 *   1. clip1: Bay View 3-Tier Stepped Catenary Dragonscale Canopy, Glowing Clerestories & Stevens Creek Pond
 *   2. clip2: Googleplex Courtyard, 4-Color Café Umbrellas, Redwoods, Dynamic Bronze "Stan" T-Rex & 54 Flamingos
 *   3. clip3: Android Lawn Sculpture Garden (Waving Bugdroid, Embossed Wafer Ice Cream, Sprinkled Donut,
 *             Pastel Cupcake, Swirled Lollipop) & Mass-Timber Visitor Experience Pavilion
 *   4. clip4: Thickened Gradient Canopy Scalloped Diagrid Shell, Agave/Lavender Cedar Planters & 5-Bike GBike Corral
 *   5. clip5: Open-Sightline Stevens Creek Wooden-Plank Truss Bridge, Golden Tidal Channel, Backlit Cattail Reeds
 *             & Twin White Shoreline Amphitheatre Tensile Tent Peaks at Sunset
 *
 * Enforces:
 *   - SwiftShader Fill-Rate Law (analytical sky dome + MeshBasicMaterial 360° Santa Cruz Mountain ring)
 *   - Strict Box3 Grounding (`groundObjectToY` -> zero floating props/buildings/trees)
 *   - High-Subdivision Smooth Organic Foliage with Sunlit Vertex-Color Gradients (zero low-poly crystal facets)
 *   - Seeded mulberry32 PRNG (100% deterministic across multi-worker shards; zero unseeded randomness)
 */

import * as THREE from "../vendor/three.module.js";
import { createSeededRNG } from "../rig/ik_solver.js";
import {
  CLIP5_PLANK_PITCH_M,
  getClip5BridgeHeightAtX,
  getClipTerrainHeight,
} from "../rig/kin.js";
import {
  createSkyDomeMaterial,
  createWaterPondMaterial,
  createGoldenDustMotesMaterial,
  mergeStaticGeometries,
  compactRigidGroupMeshes,
} from "./materials.js";
import { createParkedGBikeMesh } from "../rig/gbike_rig.js";

const _box3 = new THREE.Box3();
const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);

/**
 * Asserts exact physical contact (`objBox.min.y === targetY - weldSink`) so zero geometry ever floats.
 */
export function groundObjectToY(obj, targetY = 0, weldSink = 0.004) {
  obj.updateMatrixWorld(true);
  _box3.setFromObject(obj);
  if (!_box3.isEmpty() && Number.isFinite(_box3.min.y)) {
    obj.position.y += targetY - _box3.min.y - weldSink;
    obj.updateMatrixWorld(true);
  }
  return obj;
}

/**
 * Extrudes a flat ribbon mesh along a 3D curve (used for smooth bike paths, curbs, and bridge decks).
 */
function buildRibbonAlongCurve(
  curve,
  width,
  thickness,
  segments,
  material,
  yOffset = 0,
  lateralOffset = 0,
  heightFn = null
) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const len = curve.getLength();

  const pt = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const right = new THREE.Vector3();

  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    curve.getPointAt(u, pt);
    curve.getTangentAt(u, tan);
    right.crossVectors(tan, _up).normalize();

    const extraY = heightFn ? heightFn(pt, u) : 0.0;
    const cx = pt.x + right.x * lateralOffset;
    const cy = pt.y + yOffset + extraY;
    const cz = pt.z + right.z * lateralOffset;

    const hw = width * 0.5;
    positions.push(
      cx - right.x * hw, cy, cz - right.z * hw,
      cx + right.x * hw, cy, cz + right.z * hw,
      cx - right.x * hw, cy - thickness, cz - right.z * hw,
      cx + right.x * hw, cy - thickness, cz + right.z * hw
    );
    normals.push(0, 1, 0, 0, 1, 0, -right.x, 0, -right.z, right.x, 0, right.z);
    const vCoord = u * (len / 4.0);
    uvs.push(0, vCoord, 1, vCoord, 0, vCoord, 1, vCoord);

    if (i < segments) {
      const base = i * 4;
      indices.push(base, base + 1, base + 5, base, base + 5, base + 4);
      indices.push(base + 2, base, base + 4, base + 2, base + 4, base + 6);
      indices.push(base + 1, base + 3, base + 7, base + 1, base + 7, base + 5);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();

  const mesh = new THREE.Mesh(geom, material);
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Builds a smooth, organic displaced canopy cluster with sunlit-crown-to-dappled-underbough vertex colors (`V3D-W1-05`).
 */
export function createOrganicFoliageGeometry(radius, segW = 12, segH = 9, phase = 0.0) {
  const geom = new THREE.SphereGeometry(radius, segW, segH);
  const pos = geom.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  const topCol = new THREE.Color("#f8fde4");
  const midCol = new THREE.Color("#d8f2ba");
  const botCol = new THREE.Color("#7eb06b");
  const tmpCol = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const invR = 1.0 / Math.max(1e-4, radius);
    const nx = x * invR;
    const ny = y * invR;
    const nz = z * invR;

    // Smooth organic billowing lobes without sharp polyhedral creases
    const billow =
      1.0 +
      0.13 * Math.sin(nx * 3.2 + phase) * Math.cos(nz * 3.2 - phase * 0.7) +
      0.08 * Math.sin(ny * 4.5 + nx * 2.1 + phase * 1.3);

    pos.setXYZ(i, x * billow, y * billow, z * billow);

    const hNorm = THREE.MathUtils.clamp(ny * 0.5 + 0.5, 0, 1);
    if (hNorm >= 0.45) {
      tmpCol.lerpColors(midCol, topCol, (hNorm - 0.45) / 0.55);
    } else {
      tmpCol.lerpColors(botCol, midCol, hNorm / 0.45);
    }
    colors[i * 3] = tmpCol.r;
    colors[i * 3 + 1] = tmpCol.g;
    colors[i * 3 + 2] = tmpCol.b;
  }

  geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geom.computeVertexNormals();
  return geom;
}

export function createDeciduousTree(materials, rng, height = 5.8, willowStyle = false) {
  const g = new THREE.Group();
  const trunkH = height * 0.40;
  const barkGeoms = [];
  const tmpObj = new THREE.Object3D();

  barkGeoms.push(
    new THREE.CylinderGeometry(height * 0.024, height * 0.048, trunkH, 12).translate(
      0,
      trunkH * 0.5,
      0
    )
  );

  // Primary structural scaffold branches reaching into the canopy
  for (let b = 0; b < 3; b++) {
    const bAng = (b / 3) * Math.PI * 2 + rng() * 0.6;
    const limbGeom = new THREE.CylinderGeometry(height * 0.012, height * 0.022, height * 0.22, 8);
    tmpObj.position.set(
      Math.cos(bAng) * height * 0.05,
      trunkH * 0.88,
      Math.sin(bAng) * height * 0.05
    );
    tmpObj.rotation.set(Math.sin(bAng) * 0.48, 0, -Math.cos(bAng) * 0.48);
    tmpObj.scale.set(1, 1, 1);
    tmpObj.updateMatrix();
    barkGeoms.push(limbGeom.applyMatrix4(tmpObj.matrix));
  }

  const barkMesh = new THREE.Mesh(mergeStaticGeometries(barkGeoms), materials.redwoodBark);
  barkMesh.castShadow = true;
  g.add(barkMesh);

  const crownGroup = new THREE.Group();
  crownGroup.position.y = trunkH * 0.86;
  const folMat = willowStyle ? materials.foliageWillow : materials.foliageDeep;
  const puffs = willowStyle ? 9 : 7;
  const puffGeoms = [];

  for (let i = 0; i < puffs; i++) {
    const ang = (i / puffs) * Math.PI * 2 + rng() * 0.45;
    const rad = (0.19 + rng() * 0.18) * height;
    const dist = i === 0 ? 0 : (0.11 + rng() * 0.16) * height;
    const puffGeom = createOrganicFoliageGeometry(rad, 9, 7, i * 1.3 + rng() * 2.0);
    puffGeom.scale(1.08, willowStyle ? 1.32 : 0.86, 1.08);
    puffGeom.translate(
      Math.cos(ang) * dist,
      (i === 0 ? 0.27 : 0.08 + rng() * 0.20) * height,
      Math.sin(ang) * dist
    );
    puffGeoms.push(puffGeom);
  }
  const crownMesh = new THREE.Mesh(mergeStaticGeometries(puffGeoms, true), folMat);
  crownMesh.castShadow = true;
  crownGroup.add(crownMesh);

  // Layered alpha-tested deciduous leaf-spray bough cards around outer canopy for feathery sunlit silhouette!
  if (materials.foliageDeciduousBough) {
    const cardGeoms = [];
    const cardObj = new THREE.Object3D();
    for (let c = 0; c < 12; c++) {
      const cAng = (c / 12) * Math.PI * 2 + rng() * 0.35;
      const cDist = (0.18 + rng() * 0.14) * height;
      const cardSz = (0.14 + rng() * 0.08) * height;
      const planeG = new THREE.PlaneGeometry(cardSz, cardSz);
      cardObj.position.set(
        Math.cos(cAng) * cDist,
        (0.06 + rng() * 0.22) * height,
        Math.sin(cAng) * cDist
      );
      cardObj.rotation.set(
        (rng() - 0.5) * 0.7,
        cAng + Math.PI * 0.5 + (rng() - 0.5) * 0.6,
        (rng() - 0.5) * 0.5
      );
      cardObj.updateMatrix();
      cardGeoms.push(planeG.applyMatrix4(cardObj.matrix));
    }
    const cardMesh = new THREE.Mesh(mergeStaticGeometries(cardGeoms), materials.foliageDeciduousBough);
    cardMesh.castShadow = true;
    crownGroup.add(cardMesh);
  }

  g.add(crownGroup);
  g.userData.swayCrown = crownGroup;
  g.userData.swayPhase = rng() * Math.PI * 2;
  return g;
}

export function createCoastalRedwood(materials, rng, height = 15.0) {
  const g = new THREE.Group();
  // Tall straight deeply-furrowed cinnamon Coast Redwood (`Sequoia sempervirens`) trunk (`r = 0.42m -> 0.14m`)
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(height * 0.011, height * 0.032, height * 0.90, 16),
    materials.redwoodBark
  );
  trunk.position.y = height * 0.45;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  g.add(trunk);

  const boughGroup = new THREE.Group();
  const tiers = 11;
  const topCol = new THREE.Color("#b8db8e");
  const midCol = new THREE.Color("#639c52");
  const shadeCol = new THREE.Color("#335c2e");
  const cTmp = new THREE.Color();
  const tierGeoms = [];
  const boughObj = new THREE.Object3D();

  // Horizontal whorls of broad, gracefully drooping feathery bough pads (zero 7-sided cones or stuck-on spiky balls!)
  for (let t = 0; t < tiers; t++) {
    const u = t / (tiers - 1);
    const y = height * (0.25 + u * 0.71);
    const tierSpan = height * (0.205 * (1.0 - u * 0.72));
    const boughsInWhorl = t < tiers - 2 ? 5 : 4;
    const baseYaw = t * 1.18 + rng() * 0.35;

    for (let b = 0; b < boughsInWhorl; b++) {
      const ang = baseYaw + (b / boughsInWhorl) * Math.PI * 2 + (rng() - 0.5) * 0.22;
      const reach = tierSpan * (0.62 + rng() * 0.26);
      const padR = tierSpan * (0.48 + rng() * 0.14);
      const padG = createOrganicFoliageGeometry(padR, 9, 6, t * 3.1 + b * 1.3 + rng());

      const pos = padG.attributes.position;
      const cols = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const px = pos.getX(i);
        const py = pos.getY(i);
        const pz = pos.getZ(i);
        const rOut = Math.max(0, pz / Math.max(0.01, padR));
        const droopY = -0.14 * rOut * rOut * padR;
        pos.setXYZ(i, px * 1.05, py * 0.34 + droopY, pz * 1.42);

        const lit = THREE.MathUtils.clamp((py / Math.max(0.01, padR) + 0.55) * 0.65 + u * 0.35, 0, 1);
        if (lit < 0.5) {
          cTmp.lerpColors(shadeCol, midCol, lit * 2.0);
        } else {
          cTmp.lerpColors(midCol, topCol, (lit - 0.5) * 2.0);
        }
        cols[i * 3] = cTmp.r;
        cols[i * 3 + 1] = cTmp.g;
        cols[i * 3 + 2] = cTmp.b;
      }
      padG.setAttribute("color", new THREE.BufferAttribute(cols, 3));
      padG.computeVertexNormals();

      boughObj.position.set(
        Math.sin(ang) * reach * 0.58,
        y - reach * 0.06,
        Math.cos(ang) * reach * 0.58
      );
      boughObj.rotation.set(0.16 + (1.0 - u) * 0.10, ang, (rng() - 0.5) * 0.12);
      boughObj.scale.set(1, 1, 1);
      boughObj.updateMatrix();
      tierGeoms.push(padG.applyMatrix4(boughObj.matrix));
    }
  }

  // Conical apical leader crown at tree summit
  const apexG = createOrganicFoliageGeometry(height * 0.065, 12, 10, 9.4);
  apexG.scale(0.85, 1.45, 0.85);
  const aPos = apexG.attributes.position;
  const aCols = new Float32Array(aPos.count * 3);
  for (let i = 0; i < aPos.count; i++) {
    cTmp.lerpColors(midCol, topCol, 0.72);
    aCols[i * 3] = cTmp.r;
    aCols[i * 3 + 1] = cTmp.g;
    aCols[i * 3 + 2] = cTmp.b;
  }
  apexG.setAttribute("color", new THREE.BufferAttribute(aCols, 3));
  apexG.translate(0, height * 0.96, 0);
  tierGeoms.push(apexG);

  const boughMesh = new THREE.Mesh(
    mergeStaticGeometries(tierGeoms, true),
    materials.foliageWillow
  );
  boughMesh.castShadow = true;
  boughMesh.receiveShadow = true;
  boughGroup.add(boughMesh);

  g.add(boughGroup);
  g.userData.swayCrown = boughGroup;
  g.userData.swayPhase = rng() * Math.PI * 2;
  return g;
}

export function createOrnamentalShrub(materials, rng, radius = 0.52) {
  const g = new THREE.Group();
  const mat = rng() > 0.45 ? materials.foliageWillow : materials.foliageGolden;
  const lobeGeoms = [];
  for (let i = 0; i < 6; i++) {
    const rLobe = radius * (0.52 + rng() * 0.32);
    const lobeGeom = createOrganicFoliageGeometry(rLobe, 12, 9, i * 1.7 + rng());
    lobeGeom.scale(1.12, 0.72, 1.12);
    lobeGeom.translate(
      (rng() - 0.5) * radius * 0.75,
      rLobe * 0.58,
      (rng() - 0.5) * radius * 0.75
    );
    lobeGeoms.push(lobeGeom);
  }
  const shrubMesh = new THREE.Mesh(mergeStaticGeometries(lobeGeoms, true), mat);
  g.add(shrubMesh);
  return g;
}

/**
 * Builds the famous sculpted 3D dark-bronze "Stan" T-Rex Skeleton in a dynamic forward-lunging theropod pose!
 */
export function buildStanTRexStatue(materials) {
  const stanRoot = new THREE.Group();
  const bronze = materials.stanBronze;

  // Low weathered oval concrete garden plinth (`height = 0.24m`, top at `y = 0.24m`) raising Stan's feet cleanly above the mulch!
  const plinth = new THREE.Mesh(
    new THREE.CylinderGeometry(2.55, 2.72, 0.24, 36),
    materials.concreteCurb
  );
  plinth.scale.set(1.12, 1.0, 0.62);
  plinth.position.y = 0.12;
  plinth.receiveShadow = true;
  plinth.castShadow = true;
  plinth.name = "Stan_Garden_Plinth";
  stanRoot.add(plinth);

  const skel = new THREE.Group();
  skel.position.set(0, 0.24, 0);
  stanRoot.add(skel);

  // Dynamic lowered hunting/roaring theropod S-curve spine (head pitched forward-and-down toward plaza!)
  const spinePts = [
    new THREE.Vector3(-2.32, 2.38, 0.08),
    new THREE.Vector3(-1.75, 2.48, 0.04),
    new THREE.Vector3(-1.18, 2.26, 0.0),
    new THREE.Vector3(-0.55, 2.22, 0.0),
    new THREE.Vector3(0.0, 2.18, 0.0),
    new THREE.Vector3(0.78, 2.12, 0.04),
    new THREE.Vector3(1.62, 1.98, 0.10),
    new THREE.Vector3(2.55, 1.82, 0.05),
    new THREE.Vector3(3.48, 1.72, -0.04),
  ];
  const spineCurve = new THREE.CatmullRomCurve3(spinePts);

  const vertCount = 36;
  for (let i = 0; i < vertCount; i++) {
    const u = i / (vertCount - 1);
    const p = spineCurve.getPointAt(u);
    const tan = spineCurve.getTangentAt(u);
    const scale = u < 0.55 ? 1.0 - Math.abs(u - 0.35) * 0.38 : 1.0 - (u - 0.55) * 1.42;
    const r = Math.max(0.026, 0.098 * scale);

    const centrum = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.88, r, 0.13, 10), bronze);
    centrum.position.copy(p);
    centrum.quaternion.setFromUnitVectors(_up, tan);
    centrum.castShadow = true;
    skel.add(centrum);

    const spineH = Math.max(0.045, 0.24 * scale);
    const neural = new THREE.Mesh(new THREE.BoxGeometry(0.048, spineH, 0.026), bronze);
    neural.position.set(p.x, p.y + spineH * 0.5 + r * 0.5, p.z);
    neural.rotation.z = -0.18;
    skel.add(neural);
  }

  // 11 Pairs of Curved Thoracic Ribs (22 ribs)
  for (let r = 0; r < 11; r++) {
    const u = 0.17 + (r / 10) * 0.28;
    const p = spineCurve.getPointAt(u);
    const ribDrop = 0.64 + Math.sin((r / 10) * Math.PI) * 0.44;
    const ribFlare = 0.26 + Math.sin((r / 10) * Math.PI) * 0.28;

    for (const side of [-1, 1]) {
      const ribCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(p.x, p.y - 0.04, p.z + side * 0.06),
        new THREE.Vector3(p.x - 0.04, p.y - ribDrop * 0.45, p.z + side * ribFlare),
        new THREE.Vector3(p.x + 0.10, p.y - ribDrop, p.z + side * ribFlare * 0.52),
      ]);
      const rib = new THREE.Mesh(
        new THREE.TubeGeometry(ribCurve, 10, 0.020, 7, false),
        bronze
      );
      rib.castShadow = true;
      skel.add(rib);
    }
  }

  // Sculpted Organic Theropod Pelvis (Paired Bevelled Iliac Blades + Curved Pubis Boot + Ischium)
  const iliumShape = new THREE.Shape();
  iliumShape.moveTo(-0.48, -0.06);
  iliumShape.quadraticCurveTo(-0.46, +0.16, -0.10, +0.18);
  iliumShape.quadraticCurveTo(+0.38, +0.17, +0.48, +0.02);
  iliumShape.quadraticCurveTo(+0.42, -0.11, +0.08, -0.10);
  iliumShape.quadraticCurveTo(-0.30, -0.12, -0.48, -0.06);
  const iliumGeom = new THREE.ExtrudeGeometry(iliumShape, {
    depth: 0.045,
    bevelEnabled: true,
    bevelThickness: 0.028,
    bevelSize: 0.028,
    bevelSegments: 3,
    curveSegments: 14,
  });
  iliumGeom.center();
  for (const side of [-1, 1]) {
    const iliumBlade = new THREE.Mesh(iliumGeom, bronze);
    iliumBlade.position.set(0.05, 2.18, side * 0.145);
    iliumBlade.castShadow = true;
    skel.add(iliumBlade);
  }

  const pubisCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.02, 2.10, 0),
    new THREE.Vector3(-0.14, 1.72, 0),
    new THREE.Vector3(-0.26, 1.38, 0),
  ]);
  const pubis = new THREE.Mesh(new THREE.TubeGeometry(pubisCurve, 10, 0.042, 8, false), bronze);
  skel.add(pubis);
  const pubisBoot = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.22, 6, 10), bronze);
  pubisBoot.rotation.z = Math.PI * 0.46;
  pubisBoot.position.set(-0.24, 1.36, 0);
  skel.add(pubisBoot);

  const ischiumCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(+0.12, 2.08, 0),
    new THREE.Vector3(+0.32, 1.76, 0),
    new THREE.Vector3(+0.54, 1.48, 0),
  ]);
  const ischium = new THREE.Mesh(new THREE.TubeGeometry(ischiumCurve, 10, 0.032, 8, false), bronze);
  skel.add(ischium);

  // Muscular Striding Hind Legs + 3-Toed Talons
  const legConfigs = [
    { z: +0.30, knee: [-0.46, 1.36], ankle: [+0.02, 0.66], footX: -0.28 },
    { z: -0.30, knee: [+0.18, 1.34], ankle: [+0.58, 0.66], footX: +0.36 },
  ];
  for (const lc of legConfigs) {
    const hip = new THREE.Vector3(0.04, 2.08, lc.z);
    const knee = new THREE.Vector3(lc.knee[0], lc.knee[1], lc.z * 1.08);
    const ankle = new THREE.Vector3(lc.ankle[0], lc.ankle[1], lc.z * 1.05);
    const foot = new THREE.Vector3(lc.footX, 0.05, lc.z * 1.05);

    for (const [a, b, rTop, rBot] of [
      [hip, knee, 0.072, 0.102],
      [knee, ankle, 0.052, 0.070],
      [ankle, foot, 0.038, 0.048],
    ]) {
      const dir = new THREE.Vector3().subVectors(b, a);
      const len = dir.length();
      const bone = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, len, 10), bronze);
      bone.position.addVectors(a, b).multiplyScalar(0.5);
      bone.quaternion.setFromUnitVectors(_up, dir.normalize());
      bone.castShadow = true;
      skel.add(bone);
    }

    for (const spreadZ of [-0.14, 0, +0.14]) {
      const toe = new THREE.Mesh(new THREE.ConeGeometry(0.036, 0.36, 8), bronze);
      toe.rotation.z = Math.PI * 0.5;
      toe.rotation.y = spreadZ * 1.4;
      toe.position.set(lc.footX - 0.16, 0.035, lc.z * 1.05 + spreadZ);
      skel.add(toe);
    }
  }

  // Tiny 2-Fingered T-Rex Forelimbs
  for (const side of [-1, 1]) {
    const armCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.24, 1.90, side * 0.22),
      new THREE.Vector3(-1.34, 1.56, side * 0.25),
      new THREE.Vector3(-1.54, 1.44, side * 0.22),
    ]);
    const arm = new THREE.Mesh(new THREE.TubeGeometry(armCurve, 8, 0.024, 6, false), bronze);
    skel.add(arm);
    for (const clawOff of [-0.03, +0.03]) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.013, 0.085, 6), bronze);
      claw.rotation.z = Math.PI * 0.62;
      claw.position.set(-1.58, 1.41 + clawOff, side * 0.22);
      skel.add(claw);
    }
  }

  // Sculpted Organic Fenestrated Cast-Bronze T-Rex Skull + Wide-Open Roaring Jaws + 26 Curved Teeth!
  const skullGroup = new THREE.Group();
  skullGroup.position.set(-2.38, 2.38, 0.10);
  skullGroup.rotation.set(0, 0.20, 0.22);
  skel.add(skullGroup);

  // Rounded posterior braincase + nuchal crest (zero rectilinear box corners!)
  const braincase = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 14), bronze);
  braincase.scale.set(1.18, 0.92, 0.88);
  braincase.position.set(0.10, 0.09, 0);
  braincase.castShadow = true;
  skullGroup.add(braincase);

  // Rugose arched dorsal nasal bridge tapering toward rounded premaxilla snout
  const nasalArch = new THREE.CatmullRomCurve3([
    new THREE.Vector3(+0.22, +0.22, 0),
    new THREE.Vector3(-0.16, +0.25, 0),
    new THREE.Vector3(-0.56, +0.21, 0),
    new THREE.Vector3(-0.84, +0.11, 0),
    new THREE.Vector3(-0.88, -0.02, 0),
  ]);
  const nasalMesh = new THREE.Mesh(new THREE.TubeGeometry(nasalArch, 18, 0.068, 10, false), bronze);
  nasalMesh.scale.set(1.0, 0.82, 1.65);
  nasalMesh.castShadow = true;
  skullGroup.add(nasalMesh);

  // Paired sculpted lacrimal/postorbital brow horns + curved maxillary tooth-bearing arches + fenestra bars!
  for (const side of [-1, 1]) {
    const browHorn = new THREE.Mesh(new THREE.CapsuleGeometry(0.038, 0.12, 6, 10), bronze);
    browHorn.position.set(-0.10, +0.24, side * 0.145);
    browHorn.rotation.set(side * 0.22, 0, 0.45);
    skullGroup.add(browHorn);

    const maxillaCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(+0.20, -0.04, side * 0.165),
      new THREE.Vector3(-0.18, -0.06, side * 0.148),
      new THREE.Vector3(-0.56, -0.05, side * 0.122),
      new THREE.Vector3(-0.86, -0.02, side * 0.065),
      new THREE.Vector3(-0.89, -0.01, 0.0),
    ]);
    const maxillaTube = new THREE.Mesh(
      new THREE.TubeGeometry(maxillaCurve, 16, 0.044, 8, false),
      bronze
    );
    maxillaTube.castShadow = true;
    skullGroup.add(maxillaTube);

    // Temporal, postorbital & antorbital fenestra curved bone struts
    for (const [topX, topY, botX, botY, rStrut] of [
      [+0.22, +0.19, +0.20, -0.04, 0.034], // Squamosal-quadrate rear arch
      [-0.06, +0.22, -0.10, -0.05, 0.030], // Postorbital bar (separating orbit & temporal fenestra)
      [-0.36, +0.21, -0.38, -0.05, 0.026], // Lacrimal bar (separating orbit & antorbital fenestra)
      [-0.68, +0.16, -0.70, -0.03, 0.022], // Maxillary-nasal bar (behind naris)
    ]) {
      const barCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(topX, topY, side * 0.125),
        new THREE.Vector3((topX + botX) * 0.5 - 0.02, (topY + botY) * 0.5, side * 0.155),
        new THREE.Vector3(botX, botY, side * 0.135),
      ]);
      const barMesh = new THREE.Mesh(
        new THREE.TubeGeometry(barCurve, 8, rStrut, 7, false),
        bronze
      );
      skullGroup.add(barMesh);
    }
  }

  // Articulated Organic Lower Mandible Rami meeting at a rounded chin symphysis
  const jawGroup = new THREE.Group();
  jawGroup.position.set(0.14, -0.08, 0);
  jawGroup.rotation.z = 0.44;
  for (const side of [-1, 1]) {
    const dentaryCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.04, 0.02, side * 0.155),
      new THREE.Vector3(-0.28, -0.03, side * 0.135),
      new THREE.Vector3(-0.66, -0.02, side * 0.102),
      new THREE.Vector3(-0.92, +0.01, side * 0.048),
      new THREE.Vector3(-0.95, +0.02, 0.0),
    ]);
    const ramusMesh = new THREE.Mesh(
      new THREE.TubeGeometry(dentaryCurve, 16, 0.046, 8, false),
      bronze
    );
    ramusMesh.scale.set(1.0, 1.18, 0.82);
    ramusMesh.castShadow = true;
    jawGroup.add(ramusMesh);
  }
  skullGroup.add(jawGroup);

    for (let t = 0; t < 7; t++) {
    const uT = t / 6;
    const tx = -0.80 + uT * 0.56;
    const tz = 0.078 + uT * 0.058;
    const toothLen = 0.068 + Math.sin(uT * Math.PI) * 0.032;
    for (const side of [-1, 1]) {
      const uTooth = new THREE.Mesh(
        new THREE.ConeGeometry(0.016, toothLen, 7),
        materials.stanTooth
      );
      uTooth.rotation.x = Math.PI;
      uTooth.rotation.z = -0.10;
      uTooth.position.set(tx, -0.10, side * tz);
      skullGroup.add(uTooth);

      if (t < 6) {
        const lTooth = new THREE.Mesh(
          new THREE.ConeGeometry(0.014, toothLen * 0.84, 7),
          materials.stanTooth
        );
        lTooth.rotation.z = 0.08;
        lTooth.position.set(tx - 0.10, 0.062, side * (tz * 0.90));
        jawGroup.add(lTooth);
      }
    }
  }

  // Merge all ~140 static bronze & tooth bone primitives inside `skel` into 2 draw calls (`V3D-W3-06`)!
  skel.updateMatrixWorld(true);
  const bronzeGeoms = [];
  const toothGeoms = [];
  skel.traverse((child) => {
    if (child.isMesh && child.geometry) {
      const gClone = child.geometry.clone().applyMatrix4(child.matrixWorld);
      if (child.material === materials.stanTooth) {
        toothGeoms.push(gClone);
      } else {
        bronzeGeoms.push(gClone);
      }
    }
  });
  stanRoot.remove(skel);

  const mergedBronze = new THREE.Mesh(mergeStaticGeometries(bronzeGeoms), bronze);
  mergedBronze.castShadow = true;
  mergedBronze.receiveShadow = true;
  stanRoot.add(mergedBronze);

  const mergedTeeth = new THREE.Mesh(mergeStaticGeometries(toothGeoms), materials.stanTooth);
  mergedTeeth.castShadow = true;
  stanRoot.add(mergedTeeth);

  return stanRoot;
}

/**
 * Builds the Iconic Waving Green Android Bugdroid Statue for Clip 3 (`V3D-W3-03` & `V3D-W3-06`)!
 * Includes recessed cylindrical neck core, capped head underside, and shoulder axle pins.
 */
export function buildAndroidBugdroidStatue(materials, waving = true) {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(1.15, 1.22, 0.12, 28),
    materials.concreteCurb
  );
  pad.position.y = 0.06;
  pad.receiveShadow = true;
  g.add(pad);

  const green = materials.androidGreen;
  const greenGeoms = [];
  const eyeGeoms = [];
  const mechGeoms = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const eul = new THREE.Euler();
  const pos = new THREE.Vector3();

  for (const side of [-1, 1]) {
    const legG = new THREE.CapsuleGeometry(0.175, 0.48, 10, 16);
    legG.translate(side * 0.34, 0.46, 0);
    greenGeoms.push(legG);
  }

  const torsoG = new THREE.CylinderGeometry(0.76, 0.76, 1.12, 32);
  torsoG.translate(0, 1.28, 0);
  greenGeoms.push(torsoG);

  const torsoBotG = new THREE.SphereGeometry(
    0.76,
    32,
    16,
    0,
    Math.PI * 2,
    Math.PI * 0.5,
    Math.PI * 0.5
  );
  torsoBotG.translate(0, 0.74, 0);
  greenGeoms.push(torsoBotG);

  // Recessed mechanical cylindrical neck core bridging torso (`y = 1.84m`) into head (`y = 1.89m`)!
  const neckCoreG = new THREE.CylinderGeometry(0.46, 0.46, 0.22, 24);
  neckCoreG.translate(0, 1.865, 0);
  mechGeoms.push(neckCoreG);

  const headG = new THREE.SphereGeometry(0.76, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.5);
  headG.translate(0, 1.89, 0);
  greenGeoms.push(headG);

  // Solid underside cap disc at `y = 1.89m` so low-angle views never see hollow interior backfaces
  const headCapG = new THREE.CircleGeometry(0.758, 32);
  headCapG.rotateX(Math.PI * 0.5);
  headCapG.translate(0, 1.89, 0);
  greenGeoms.push(headCapG);

  for (const side of [-1, 1]) {
    const eyeG = new THREE.SphereGeometry(0.072, 14, 12);
    eyeG.translate(side * 0.32, 2.22, 0.66);
    eyeGeoms.push(eyeG);

    const antG = new THREE.CapsuleGeometry(0.032, 0.28, 6, 10);
    eul.set(0, 0, side * -0.48);
    q.setFromEuler(eul);
    pos.set(side * 0.42, 2.66, 0);
    m.compose(pos, q, _scale);
    antG.applyMatrix4(m);
    greenGeoms.push(antG);

    // Cylindrical shoulder axle pin (`|x| = 0.65..0.99m`) physically pinning torso (`0.76m`) to arm (`0.96m`)!
    const pinG = new THREE.CylinderGeometry(0.088, 0.088, 0.34, 18);
    pinG.rotateZ(Math.PI * 0.5);
    pinG.translate(side * 0.82, 1.72, 0);
    mechGeoms.push(pinG);

    const armG = new THREE.CapsuleGeometry(0.165, 0.72, 10, 16);
    armG.translate(0, -0.34, 0);
    if (waving && side === -1) {
      eul.set(0.18, 0, -2.42);
    } else {
      eul.set(0, 0, 0);
    }
    q.setFromEuler(eul);
    pos.set(side * 0.96, 1.72, 0);
    m.compose(pos, q, _scale);
    armG.applyMatrix4(m);
    greenGeoms.push(armG);
  }

  const bodyMesh = new THREE.Mesh(mergeStaticGeometries(greenGeoms), green);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  g.add(bodyMesh);

  const mechMesh = new THREE.Mesh(mergeStaticGeometries(mechGeoms), materials.steelMullion);
  mechMesh.castShadow = true;
  g.add(mechMesh);

  const eyeMesh = new THREE.Mesh(mergeStaticGeometries(eyeGeoms), materials.reflectorWhite);
  g.add(eyeMesh);

  return g;
}

/**
 * Builds the Giant Frosted Donut Android Statue with Exact Surface-Normal Tangent Sprinkles (`V3D-W3-03`)!
 */
export function buildGiantDonutStatue(materials, rng) {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.16, 0.92), materials.concreteCurb);
  pad.position.y = 0.08;
  pad.receiveShadow = true;
  g.add(pad);

  const ringGroup = new THREE.Group();
  ringGroup.position.y = 1.48;

  const dough = new THREE.Mesh(
    new THREE.TorusGeometry(0.95, 0.44, 24, 44),
    materials.donutDough
  );
  // Proportionally Z-compressed (`0.76`) so pink front icing (`0.04 + 0.455*0.74 = 0.377m`) coats the golden dough (`0.334m`)!
  dough.scale.set(1, 1, 0.76);
  dough.castShadow = true;
  ringGroup.add(dough);

  const icingScaleZ = 0.74;
  const icingOffsetZ = 0.04;
  const R = 0.95;
  const r = 0.455;

  const icing = new THREE.Mesh(
    new THREE.TorusGeometry(R, r, 22, 44),
    materials.donutIcingPink
  );
  icing.position.z = icingOffsetZ;
  icing.scale.set(1, 1, icingScaleZ);
  icing.castShadow = true;
  ringGroup.add(icing);

  const sprinkleMats = [
    materials.gbikeYellow,
    materials.gbikeForkBlue,
    materials.gbikeGreen,
    materials.reflectorWhite,
    materials.pelicanBeakUpper,
  ];
  const spProto = new THREE.CapsuleGeometry(0.022, 0.084, 4, 8);
  const buckets = [[], [], [], [], []];
  const pSurf = new THREE.Vector3();
  const nOut = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const tangDir = new THREE.Vector3();
  const spPos = new THREE.Vector3();
  const spQuat = new THREE.Quaternion();
  const spMat4 = new THREE.Matrix4();

  for (let i = 0; i < 60; i++) {
    const u = rng() * Math.PI * 2;
    // Sample strictly on the front icing cap (`sin(v) >= 0.38 >= 0.28`)
    const v = Math.PI * 0.5 + (rng() - 0.5) * 1.92;
    const cosU = Math.cos(u);
    const sinU = Math.sin(u);
    const cosV = Math.cos(v);
    const sinV = Math.sin(v);

    // Exact point on Z-scaled `icing` surface inside `ringGroup`
    pSurf.set(
      (R + r * cosV) * cosU,
      (R + r * cosV) * sinU,
      icingOffsetZ + r * icingScaleZ * sinV
    );

    // Exact outward unit normal of `(x, y, z0 + sZ * z_torus)`: N ~ (sZ * cosV * cosU, sZ * cosV * sinU, sinV)
    nOut.set(icingScaleZ * cosV * cosU, icingScaleZ * cosV * sinU, sinV).normalize();

    // Orthonormal tangent basis `(e1, e2)` strictly perpendicular to `nOut`
    e1.set(-sinU, cosU, 0);
    e2.crossVectors(nOut, e1).normalize();

    const psi = rng() * Math.PI * 2;
    tangDir
      .set(0, 0, 0)
      .addScaledVector(e1, Math.cos(psi))
      .addScaledVector(e2, Math.sin(psi))
      .normalize();

    // Half-embedded (`+8mm` along outward normal for `22mm` radius capsule) so zero floating gap!
    spPos.copy(pSurf).addScaledVector(nOut, 0.008);
    spQuat.setFromUnitVectors(_up, tangDir);
    spMat4.compose(spPos, spQuat, _scale);

    const gClone = spProto.clone();
    gClone.applyMatrix4(spMat4);
    buckets[i % sprinkleMats.length].push(gClone);
  }
  spProto.dispose();

  for (let b = 0; b < sprinkleMats.length; b++) {
    if (buckets[b].length > 0) {
      const spMesh = new THREE.Mesh(
        mergeStaticGeometries(buckets[b]),
        sprinkleMats[b]
      );
      spMesh.castShadow = true;
      ringGroup.add(spMesh);
    }
  }

  g.add(ringGroup);
  return g;
}

/**
 * Builds the Iconic Android 2.3 Gingerbread Cookie Lawn Sculpture (`V3D-W3-03`)!
 */
export function buildGingerbreadStatue(materials) {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(0.98, 1.06, 0.12, 24),
    materials.concreteCurb
  );
  pad.position.y = 0.06;
  pad.receiveShadow = true;
  g.add(pad);

  const cookieGeoms = [];
  const icingGeoms = [];
  const redGeoms = [];
  const greenGeoms = [];

  const cookieExtrudeOpts = {
    depth: 0.16,
    bevelEnabled: true,
    bevelThickness: 0.052,
    bevelSize: 0.048,
    bevelSegments: 5,
    curveSegments: 20,
  };

  const makePillShape = (halfLen, rad) => {
    const sh = new THREE.Shape();
    sh.absarc(0, +halfLen, rad, 0, Math.PI, false);
    sh.absarc(0, -halfLen, rad, Math.PI, Math.PI * 2, false);
    sh.closePath();
    return sh;
  };

  // Flat-faced bevelled baked cookie silhouette (`z in [-0.132, +0.132]`) — zero cylindrical drum torso!
  const headSh = new THREE.Shape();
  headSh.absarc(0, 0, 0.41, 0, Math.PI * 2, false);
  const headG = new THREE.ExtrudeGeometry(headSh, cookieExtrudeOpts);
  headG.translate(0, 1.84, -0.08);
  cookieGeoms.push(headG);

  const torsoSh = new THREE.Shape();
  torsoSh.moveTo(-0.34, +0.44);
  torsoSh.quadraticCurveTo(0, +0.50, +0.34, +0.44);
  torsoSh.quadraticCurveTo(+0.45, -0.04, +0.41, -0.44);
  torsoSh.quadraticCurveTo(0, -0.50, -0.41, -0.44);
  torsoSh.quadraticCurveTo(-0.45, -0.04, -0.34, +0.44);
  const torsoG = new THREE.ExtrudeGeometry(torsoSh, cookieExtrudeOpts);
  torsoG.translate(0, 1.10, -0.08);
  cookieGeoms.push(torsoG);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const eul = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3(1, 1, 1);

  const makeWaveIcingTube = (pts) =>
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 22, 0.024, 8, false);

  for (const side of [-1, 1]) {
    // Outstretched flat-cookie arms
    const armG = new THREE.ExtrudeGeometry(makePillShape(0.28, 0.145), cookieExtrudeOpts);
    armG.translate(0, 0, -0.08);
    eul.set(0, 0, side * 1.18);
    q.setFromEuler(eul);
    pos.set(side * 0.64, 1.30, 0);
    m.compose(pos, q, scl);
    armG.applyMatrix4(m);
    cookieGeoms.push(armG);

    // Planted flat-cookie legs (`y_min ~ 0.06m <= 0.12m` concrete pad)
    const legG = new THREE.ExtrudeGeometry(makePillShape(0.27, 0.165), cookieExtrudeOpts);
    legG.translate(0, 0, -0.08);
    eul.set(0, 0, side * -0.15);
    q.setFromEuler(eul);
    pos.set(side * 0.30, 0.46, 0);
    m.compose(pos, q, scl);
    legG.applyMatrix4(m);
    cookieGeoms.push(legG);

    // Zig-zag wavy white royal-icing piping on wrists & ankles (both front & back faces!)
    for (const zFace of [+0.134, -0.134]) {
      const wristPts = [];
      const anklePts = [];
      for (let k = 0; k <= 8; k++) {
        const u = (k / 8 - 0.5) * 2.0; // -1..+1 across limb width
        const wave = Math.sin(k * Math.PI * 1.0) * 0.026;
        // Wrist local -> rotated around `(side*0.64, 1.30)`
        const wxLocal = u * 0.145;
        const wyLocal = -0.14 + wave;
        const ca = Math.cos(side * 1.18);
        const sa = Math.sin(side * 1.18);
        wristPts.push(
          new THREE.Vector3(
            side * 0.64 + wxLocal * ca - wyLocal * sa,
            1.30 + wxLocal * sa + wyLocal * ca,
            zFace
          )
        );

        const axLocal = u * 0.165;
        const ayLocal = -0.12 + wave;
        const cl = Math.cos(side * -0.15);
        const sl = Math.sin(side * -0.15);
        anklePts.push(
          new THREE.Vector3(
            side * 0.30 + axLocal * cl - ayLocal * sl,
            0.46 + axLocal * sl + ayLocal * cl,
            zFace
          )
        );
      }
      icingGeoms.push(makeWaveIcingTube(wristPts), makeWaveIcingTube(anklePts));
    }

    // Royal-icing eyes & cheerful arched eyebrows
    const eye = new THREE.SphereGeometry(0.056, 12, 10);
    eye.scale(1, 1, 0.48);
    eye.translate(side * 0.16, 1.91, 0.135);
    icingGeoms.push(eye);

    const browPts = [
      new THREE.Vector3(side * 0.09, 2.01, 0.135),
      new THREE.Vector3(side * 0.16, 2.05, 0.136),
      new THREE.Vector3(side * 0.23, 2.00, 0.135),
    ];
    icingGeoms.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(browPts), 10, 0.016, 6, false));
  }

  // Piped royal-icing smile
  const smilePts = [];
  for (let s = 0; s <= 10; s++) {
    const a = Math.PI * 1.15 + (s / 10) * Math.PI * 0.70;
    smilePts.push(new THREE.Vector3(Math.cos(a) * 0.16, 1.81 + Math.sin(a) * 0.11, 0.136));
  }
  icingGeoms.push(makeWaveIcingTube(smilePts));

  // Red bow-tie + 2 Alternating Green/Red Gumdrop Buttons down the cookie chest!
  for (const side of [-1, 1]) {
    const bowLobe = new THREE.SphereGeometry(0.058, 12, 10);
    bowLobe.scale(1.25, 0.78, 0.50);
    bowLobe.translate(side * 0.072, 1.46, 0.138);
    redGeoms.push(bowLobe);
  }
  const bowKnot = new THREE.SphereGeometry(0.036, 10, 8);
  bowKnot.scale(1, 1, 0.55);
  bowKnot.translate(0, 1.46, 0.142);
  icingGeoms.push(bowKnot);

  const btn1 = new THREE.SphereGeometry(0.076, 14, 10);
  btn1.scale(1, 1, 0.56);
  btn1.translate(0, 1.20, 0.138);
  greenGeoms.push(btn1);

  const btn2 = new THREE.SphereGeometry(0.076, 14, 10);
  btn2.scale(1, 1, 0.56);
  btn2.translate(0, 0.94, 0.138);
  redGeoms.push(btn2);

  const cookieMesh = new THREE.Mesh(
    mergeStaticGeometries(cookieGeoms),
    materials.gingerbreadCookie
  );
  cookieMesh.castShadow = true;
  cookieMesh.receiveShadow = true;
  g.add(cookieMesh);

  g.add(new THREE.Mesh(mergeStaticGeometries(icingGeoms), materials.reflectorWhite));
  g.add(new THREE.Mesh(mergeStaticGeometries(greenGeoms), materials.androidGreen));
  g.add(new THREE.Mesh(mergeStaticGeometries(redGeoms), materials.gbikeFrameRed));

  return g;
}

/**
 * Builds the Iconic Android 4.4 KitKat Chocolate Wafer Fingers Sculpture (`V3D-W3-03`)!
 */
export function buildKitKatStatue(materials) {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(
    new THREE.BoxGeometry(1.78, 0.16, 0.88),
    materials.concreteCurb
  );
  pad.position.y = 0.08;
  pad.receiveShadow = true;
  g.add(pad);

  const barTiltGrp = new THREE.Group();
  barTiltGrp.position.y = 0.12;
  barTiltGrp.rotation.z = -0.05;

  const chocGeoms = [];
  const creamGeoms = [];

  // 4 signature chocolate-coated wafer fingers standing side-by-side (`x = -0.48..+0.48m`)
  for (let f = 0; f < 4; f++) {
    const fx = (f - 1.5) * 0.33;
    const isSnapped = f === 3;
    const hFinger = isSnapped ? 1.56 : 2.12;
    const finger = new THREE.BoxGeometry(0.28, hFinger, 0.26);
    finger.translate(fx, hFinger * 0.5, 0);
    chocGeoms.push(finger);

    // Beveled top ridge on intact fingers, or angled snapped top piece on the 4th finger!
    if (!isSnapped) {
      const ridge = new THREE.BoxGeometry(0.22, 0.08, 0.20);
      ridge.translate(fx, hFinger + 0.03, 0);
      chocGeoms.push(ridge);
    } else {
      // Crisp wafer cream layers visible at the break!
      for (const wy of [-0.04, 0.0, +0.04]) {
        const waferLayer = new THREE.BoxGeometry(0.26, 0.018, 0.24);
        waferLayer.translate(fx, hFinger + 0.02 + wy, 0);
        creamGeoms.push(waferLayer);
      }
      const topBreak = new THREE.BoxGeometry(0.27, 0.52, 0.25);
      topBreak.rotateZ(-0.28);
      topBreak.translate(fx + 0.08, hFinger + 0.26, 0);
      chocGeoms.push(topBreak);
    }
  }

  // Glossy crimson lower foil sleeve + crisp white diagonal emblem band
  const sleeve = new THREE.Mesh(
    new THREE.BoxGeometry(1.38, 1.06, 0.32),
    materials.gbikeFrameRed
  );
  sleeve.position.set(0, 0.53, 0);
  sleeve.castShadow = true;
  barTiltGrp.add(sleeve);

  const badge = new THREE.Mesh(
    new THREE.BoxGeometry(0.96, 0.34, 0.34),
    materials.reflectorWhite
  );
  badge.position.set(0, 0.58, 0);
  badge.rotation.z = 0.14;
  barTiltGrp.add(badge);

  const chocMesh = new THREE.Mesh(
    mergeStaticGeometries(chocGeoms),
    materials.chocolateWafer
  );
  chocMesh.castShadow = true;
  barTiltGrp.add(chocMesh);

  if (creamGeoms.length > 0) {
    barTiltGrp.add(
      new THREE.Mesh(mergeStaticGeometries(creamGeoms), materials.iceCreamVanilla)
    );
  }

  g.add(barTiltGrp);
  return g;
}

export function buildCupcakeStatue(materials) {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(0.82, 0.88, 0.10, 24),
    materials.concreteCurb
  );
  pad.position.y = 0.05;
  pad.receiveShadow = true;
  g.add(pad);

  // Fluted baking liner cup (28 pleated vertical ribs)
  const cupGeom = new THREE.CylinderGeometry(0.72, 0.52, 0.90, 56, 1);
  const cPos = cupGeom.attributes.position;
  for (let i = 0; i < cPos.count; i++) {
    const x = cPos.getX(i);
    const z = cPos.getZ(i);
    const ang = Math.atan2(z, x);
    const pleat = 1.0 + 0.045 * Math.cos(ang * 28.0);
    cPos.setX(i, x * pleat);
    cPos.setZ(i, z * pleat);
  }
  cupGeom.computeVertexNormals();
  const cup = new THREE.Mesh(cupGeom, materials.cupcakeCup);
  cup.position.y = 0.52;
  cup.castShadow = true;
  g.add(cup);

  const frostingGeoms = [];
  const tiers = [
    { y: 1.06, r: 0.58, t: 0.21 },
    { y: 1.32, r: 0.43, t: 0.18 },
    { y: 1.54, r: 0.27, t: 0.15 },
  ];
  for (const tr of tiers) {
    const swG = new THREE.TorusGeometry(tr.r, tr.t, 18, 30);
    swG.rotateX(Math.PI * 0.5 + 0.08);
    swG.translate(0, tr.y, 0);
    frostingGeoms.push(swG);
  }
  const peakG = new THREE.ConeGeometry(0.22, 0.36, 18);
  peakG.translate(0, 1.78, 0);
  frostingGeoms.push(peakG);

  const frostingMesh = new THREE.Mesh(
    mergeStaticGeometries(frostingGeoms),
    materials.cupcakeFrosting
  );
  frostingMesh.castShadow = true;
  g.add(frostingMesh);

  // Cherry stem + glossy red cherry seated into frosting peak (`y = 1.94m`)
  const cherry = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 14, 12),
    materials.gbikeFrameRed
  );
  cherry.position.set(0.03, 1.94, 0.02);
  g.add(cherry);

  return g;
}

export function buildIceCreamSandwichStatue(materials) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(1.48, 0.22, 0.76),
    materials.concreteCurb
  );
  base.position.y = 0.11;
  base.receiveShadow = true;
  g.add(base);

  const body = new THREE.Group();
  body.position.y = 1.24;
  body.rotation.z = 0.06;

  const vanilla = new THREE.Mesh(
    new THREE.BoxGeometry(1.22, 2.08, 0.36),
    materials.iceCreamVanilla
  );
  body.add(vanilla);

  const waferGeoms = [];
  for (const side of [-1, 1]) {
    const wG = new THREE.BoxGeometry(1.28, 2.14, 0.095);
    wG.translate(0, 0, side * 0.22);
    waferGeoms.push(wG);
  }
  const waferMesh = new THREE.Mesh(
    mergeStaticGeometries(waferGeoms),
    materials.iceCreamWafer
  );
  waferMesh.castShadow = true;
  body.add(waferMesh);

  g.add(body);
  return g;
}

export function buildLollipopStatue(materials) {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(0.58, 0.64, 0.10, 22),
    materials.concreteCurb
  );
  pad.position.y = 0.05;
  pad.receiveShadow = true;
  g.add(pad);

  const stick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.058, 0.058, 1.90, 14),
    materials.reflectorWhite
  );
  stick.position.y = 0.98;
  stick.castShadow = true;
  g.add(stick);

  const candy = new THREE.Mesh(
    new THREE.CylinderGeometry(0.96, 0.96, 0.24, 40),
    materials.lollipopCandy
  );
  candy.rotation.x = Math.PI * 0.5;
  candy.position.y = 2.32;
  candy.castShadow = true;
  g.add(candy);

  const candyRim = new THREE.Mesh(
    new THREE.TorusGeometry(0.95, 0.12, 14, 40),
    materials.gbikeFrameRed
  );
  candyRim.position.y = 2.32;
  candyRim.scale.set(1, 1, 0.95);
  g.add(candyRim);

  return g;
}

/**
 * Helper to append an arched vertical wall strip with outward-facing normals between `getBotY(t)` and `getTopY(t)`.
 */
function pushArchedWallStrip(posArr, uvArr, indArr, ptsXZ, getBotY, getTopY, flipWinding = false) {
  const baseVert = posArr.length / 3;
  const n = ptsXZ.length - 1;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const [x, z] = ptsXZ[i];
    const y0 = getBotY(t, x, z);
    const y1 = getTopY(t, x, z);
    posArr.push(x, y0, z, x, y1, z);
    uvArr.push(t * 4.0, 0.0, t * 4.0, 1.0);
    if (i < n) {
      const a = baseVert + i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      if (!flipWinding) {
        indArr.push(a, c, d, a, d, b);
      } else {
        indArr.push(a, d, c, a, b, d);
      }
    }
  }
}

/**
 * Builds the 3-Tier Stepped Undulating Catenary Bay View Dragonscale Canopy + Profile-Matched Clerestories (`V3D-W3-05`)!
 */
export function buildBayViewDragonscaleBuilding(materials) {
  const bayViewGroup = new THREE.Group();

  const curbGeoms = [];
  const roofGeoms = [];
  const steelGeoms = [];

  // Stepped lakeside concrete terrace across full 39m canopy width
  for (let s = 0; s < 3; s++) {
    const stepG = new THREE.BoxGeometry(39.4 - s * 1.4, 0.24, 3.4 - s * 0.6);
    stepG.translate(0, 0.12 + s * 0.22, 6.8 - s * 0.85);
    curbGeoms.push(stepG);
  }
  const terraceMesh = new THREE.Mesh(mergeStaticGeometries(curbGeoms), materials.concreteCurb);
  terraceMesh.receiveShadow = true;
  bayViewGroup.add(terraceMesh);

  // 3 Steeply Draped Overlapping Catenary Dragonscale Canopy Tiers + Recessed Mullioned Clerestory Glazing!
  const tierSpecs = [
    { spanX: 39.0, spanZ: 7.4, zCenter: +4.6, baseY: 5.35, riseX: 2.05, waveAmp: 0.64, dropZ: 1.85 },
    { spanX: 36.0, spanZ: 7.8, zCenter: -0.2, baseY: 7.35, riseX: 2.30, waveAmp: 0.70, dropZ: 2.05 },
    { spanX: 32.0, spanZ: 8.2, zCenter: -5.2, baseY: 9.25, riseX: 2.50, waveAmp: 0.76, dropZ: 2.15 },
  ];

  const evalTierSpecY = (ts, ux, vz) => {
    const uClamped = THREE.MathUtils.clamp(ux, 0, 1);
    const vClamped = THREE.MathUtils.clamp(vz, 0, 1);
    // Concave catenary forward drape (`pow(1 - vz, 1.25)`) tilts silver-titanium dragonscale shingles directly toward camera!
    const catenaryDrape = Math.pow(1.0 - vClamped, 1.22) * -(ts.dropZ || 1.95);
    return (
      ts.baseY +
      Math.abs(Math.sin(uClamped * Math.PI * 3.0)) * ts.waveAmp +
      catenaryDrape +
      Math.sin(uClamped * Math.PI) * ts.riseX
    );
  };

  // Profile-matched ground-floor curtain-glass pavilion extending continuously into Tier 0/1/2 soffits across 38.2m!
  const gPos = [];
  const gUv = [];
  const gInd = [];
  const fSegs = 40;
  const frontXZ = [];
  const rearXZ = [];
  const zFrontGlass = 5.72;
  const zRearGlass = -6.80;
  const halfFacadeX = 19.1;
  const vzFront0 = THREE.MathUtils.clamp(0.5 - (zFrontGlass - tierSpecs[0].zCenter) / tierSpecs[0].spanZ, 0, 1);

  for (let i = 0; i <= fSegs; i++) {
    const x = -halfFacadeX + (i / fSegs) * (halfFacadeX * 2);
    frontXZ.push([x, zFrontGlass]);
    rearXZ.push([x, zRearGlass]);
  }
  pushArchedWallStrip(
    gPos,
    gUv,
    gInd,
    frontXZ,
    () => 0.0,
    (_t, x) => evalTierSpecY(tierSpecs[0], x / tierSpecs[0].spanX + 0.5, vzFront0) + 0.03,
    false
  );
  pushArchedWallStrip(
    gPos,
    gUv,
    gInd,
    rearXZ,
    () => 0.0,
    (_t, x) => evalTierSpecY(tierSpecs[2], x / tierSpecs[2].spanX + 0.5, 0.85) + 0.03,
    true
  );

  const sideSegs = 12;
  const rightXZ = [];
  const leftXZ = [];
  for (let iz = 0; iz <= sideSegs; iz++) {
    const z = zFrontGlass + (iz / sideSegs) * (zRearGlass - zFrontGlass);
    rightXZ.push([+halfFacadeX, z]);
    leftXZ.push([-halfFacadeX, z]);
  }
  const sideTopY = (_t, x, z) => {
    const tierUse = z > 1.8 ? tierSpecs[0] : z > -2.5 ? tierSpecs[1] : tierSpecs[2];
    const vz = THREE.MathUtils.clamp(0.5 - (z - tierUse.zCenter) / tierUse.spanZ, 0, 1);
    return evalTierSpecY(tierUse, x / tierUse.spanX + 0.5, vz);
  };
  pushArchedWallStrip(gPos, gUv, gInd, rightXZ, () => 0.0, sideTopY, false);
  pushArchedWallStrip(gPos, gUv, gInd, leftXZ, () => 0.0, sideTopY, true);

  const facadeGeom = new THREE.BufferGeometry();
  facadeGeom.setAttribute("position", new THREE.Float32BufferAttribute(gPos, 3));
  facadeGeom.setAttribute("uv", new THREE.Float32BufferAttribute(gUv, 2));
  facadeGeom.setIndex(gInd);
  facadeGeom.computeVertexNormals();
  bayViewGroup.add(new THREE.Mesh(facadeGeom, materials.curtainGlass));

  // Front facade steel mullions (`m = -9..+9` across `36m`) rising continuously into Tier 0 soffit!
  for (let mIdx = -9; mIdx <= 9; mIdx++) {
    const mx = mIdx * 2.0;
    const mTop = evalTierSpecY(tierSpecs[0], mx / tierSpecs[0].spanX + 0.5, vzFront0) + 0.02;
    const mulG = new THREE.BoxGeometry(0.14, mTop, 0.24);
    mulG.translate(mx, mTop * 0.5, zFrontGlass + 0.04);
    steelGeoms.push(mulG);
  }

  // Profile-matched luminous clerestory strips across ALL 3 canopy tiers (`tIdx = 0, 1, 2`)!
  const clerPos = [];
  const clerUv = [];
  const clerInd = [];

  for (let tIdx = 0; tIdx < tierSpecs.length; tIdx++) {
    const ts = tierSpecs[tIdx];
    const segX = 40;
    const segZ = 10;
    const rPos = [];
    const rUv = [];
    const rInd = [];

    for (let iz = 0; iz <= segZ; iz++) {
      const vz = iz / segZ;
      const z = ts.zCenter + (0.5 - vz) * ts.spanZ;
      for (let ix = 0; ix <= segX; ix++) {
        const ux = ix / segX;
        const x = (ux - 0.5) * ts.spanX;
        const y = evalTierSpecY(ts, ux, vz);
        rPos.push(x, y, z);
        rUv.push(ux * 7.0, vz * 2.4);

        if (iz < segZ && ix < segX) {
          const a = iz * (segX + 1) + ix;
          const b = a + 1;
          const c = (iz + 1) * (segX + 1) + ix;
          const d = c + 1;
          rInd.push(a, b, d, a, d, c);
        }
      }
    }

    const roofGeom = new THREE.BufferGeometry();
    roofGeom.setAttribute("position", new THREE.Float32BufferAttribute(rPos, 3));
    roofGeom.setAttribute("uv", new THREE.Float32BufferAttribute(rUv, 2));
    roofGeom.setIndex(rInd);
    roofGeom.computeVertexNormals();
    roofGeoms.push(roofGeom);

    // Sculpted dark solar-shingle catenary eave fascia along each tier's leading edge
    const eavePts = [];
    for (let ix = 0; ix <= segX; ix++) {
      const ux = ix / segX;
      eavePts.push(
        new THREE.Vector3(
          (ux - 0.5) * ts.spanX,
          evalTierSpecY(ts, ux, 0.0) - 0.04,
          ts.zCenter + 0.5 * ts.spanZ
        )
      );
    }
    steelGeoms.push(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(eavePts), 44, 0.085, 8, false)
    );

    // Warm acoustic cedar-timber clerestory soffit trim tucked directly beneath each dragonscale catenary eave!
    const soffitPts = eavePts.map(
      (p) => new THREE.Vector3(p.x * 0.985, p.y - 0.11, p.z - 0.24)
    );
    if (!bayViewGroup.userData.soffitGeoms) bayViewGroup.userData.soffitGeoms = [];
    bayViewGroup.userData.soffitGeoms.push(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(soffitPts), 40, 0.14, 6, false)
    );

    // Recessed narrow (`~0.52m`) catenary clerestory ribbon windows tucked under each dragonscale soffit!
    const vzCler = tIdx === 0 ? 0.34 : 0.30;
    const zCler = ts.zCenter + (0.5 - vzCler) * ts.spanZ;
    const clerHalfW = ts.spanX * 0.47;
    const cStripXZ = [];
    for (let ix = 0; ix <= segX; ix++) {
      const x = -clerHalfW + (ix / segX) * (clerHalfW * 2);
      cStripXZ.push([x, zCler]);
    }
    const clerBotY = (x) => {
      const ux = x / ts.spanX + 0.5;
      const topY = evalTierSpecY(ts, ux, vzCler);
      if (tIdx === 0) {
        return Math.max(3.55, topY - 0.52);
      }
      const prevTs = tierSpecs[tIdx - 1];
      const uxPrev = x / prevTs.spanX + 0.5;
      return Math.max(evalTierSpecY(prevTs, uxPrev, 0.72) - 0.14, topY - 0.58);
    };
    pushArchedWallStrip(
      clerPos,
      clerUv,
      clerInd,
      cStripXZ,
      (_t, x) => clerBotY(x),
      (_t, x) => evalTierSpecY(ts, x / ts.spanX + 0.5, vzCler) + 0.02,
      false
    );

    // Dense 1.35m-spaced vertical steel clerestory mullions across ALL 3 tiers (`tIdx >= 0`)!
    const mulCount = Math.floor(clerHalfW / 1.35);
    for (let cm = -mulCount; cm <= mulCount; cm++) {
      const cx = cm * 1.35;
      if (Math.abs(cx) > clerHalfW - 0.35) continue;
      const yB = clerBotY(cx) - 0.04;
      const yT = evalTierSpecY(ts, cx / ts.spanX + 0.5, vzCler) + 0.02;
      const hM = Math.max(0.18, yT - yB);
      const cmG = new THREE.BoxGeometry(0.085, hM, 0.16);
      cmG.translate(cx, (yB + yT) * 0.5, zCler + 0.04);
      steelGeoms.push(cmG);
    }
  }

  const roofMesh = new THREE.Mesh(mergeStaticGeometries(roofGeoms), materials.dragonscaleTile);
  roofMesh.castShadow = true;
  bayViewGroup.add(roofMesh);

  if (bayViewGroup.userData.soffitGeoms && bayViewGroup.userData.soffitGeoms.length > 0) {
    const soffitMesh = new THREE.Mesh(
      mergeStaticGeometries(bayViewGroup.userData.soffitGeoms),
      materials.cedarTimber
    );
    bayViewGroup.add(soffitMesh);
  }

  const clerGeom = new THREE.BufferGeometry();
  clerGeom.setAttribute("position", new THREE.Float32BufferAttribute(clerPos, 3));
  clerGeom.setAttribute("uv", new THREE.Float32BufferAttribute(clerUv, 2));
  clerGeom.setIndex(clerInd);
  clerGeom.computeVertexNormals();
  bayViewGroup.add(new THREE.Mesh(clerGeom, materials.clerestoryGlow));

  // 9 Pairs of Structural Steel V-Columns spanning full 37.2m waterfront terrace & welded into Tier 0 soffit!
  const mCol = new THREE.Matrix4();
  const qCol = new THREE.Quaternion();
  const eCol = new THREE.Euler();
  const pCol = new THREE.Vector3();
  const zVCol = 6.42;
  const vzVCol = THREE.MathUtils.clamp(
    0.5 - (zVCol - tierSpecs[0].zCenter) / tierSpecs[0].spanZ,
    0,
    1
  );
  for (let col = 0; col < 9; col++) {
    const uxCol = col / 8;
    const cx = (uxCol - 0.5) * 37.2;
    const apexY = evalTierSpecY(tierSpecs[0], cx / tierSpecs[0].spanX + 0.5, vzVCol) + 0.02;
    const baseY = 0.56;
    const strutH = Math.max(1.5, (apexY - baseY) / Math.cos(0.19));
    for (const tilt of [-0.19, +0.19]) {
      const vStrutG = new THREE.CylinderGeometry(0.11, 0.14, strutH, 10);
      eCol.set(0, 0, -tilt);
      qCol.setFromEuler(eCol);
      pCol.set(cx + Math.sin(tilt) * strutH * 0.5, (apexY + baseY) * 0.5, zVCol);
      mCol.compose(pCol, qCol, _scale);
      vStrutG.applyMatrix4(mCol);
      steelGeoms.push(vStrutG);
    }
    const capPlate = new THREE.CylinderGeometry(0.24, 0.24, 0.10, 12);
    capPlate.translate(cx, apexY - 0.04, zVCol);
    steelGeoms.push(capPlate);
  }

  const steelMesh = new THREE.Mesh(mergeStaticGeometries(steelGeoms), materials.steelMullion);
  steelMesh.castShadow = true;
  bayViewGroup.add(steelMesh);

  return bayViewGroup;
}

/**
 * Builds the Scalloped Diagrid "Gradient Canopy" Shell Building with Profile-Matched Arched Atrium & Full-Height Piers (`V3D-W3-05`)!
 */
export function buildGradientCanopyBuilding(materials, options = {}) {
  const { openCenterBay = false, bayHalfWidth = 2.28, bayHeight = 3.65 } = options;
  const g = new THREE.Group();

  const segX = 48;
  const segZ = 20;
  const spanX = 36.0;
  const spanZ = 15.0;
  const shellThickness = 0.42;

  function shellY(xNorm, zNorm) {
    const ux = THREE.MathUtils.clamp(xNorm, -1, 1);
    const vz = THREE.MathUtils.clamp(zNorm, 0, 1);
    const domeX = Math.pow(Math.max(0, 1.0 - ux * ux * 0.86), 0.68) * 5.55;
    const domeZ = Math.sin((vz * 0.72 + 0.14) * Math.PI) * 1.45;
    const eaveScallop =
      (1.0 - vz * 0.75) *
      Math.pow(Math.abs(ux), 1.55) *
      Math.cos(ux * Math.PI * 3.0) *
      0.42;
    return Math.max(1.85, 1.85 + domeX + domeZ + eaveScallop);
  }

  const evalShellAtXZ = (x, z) => shellY(x / (spanX * 0.5), 0.5 - z / spanZ);

  const positions = [];
  const uvs = [];
  const indices = [];

  for (let iz = 0; iz <= segZ; iz++) {
    const vz = iz / segZ;
    const z = (0.5 - vz) * spanZ;
    for (let ix = 0; ix <= segX; ix++) {
      const ux = (ix / segX) * 2 - 1;
      const x = ux * (spanX * 0.5);
      const y = shellY(ux, vz);
      positions.push(x, y, z);
      uvs.push((ix / segX) * 4.0, vz * 2.5);

      if (iz < segZ && ix < segX) {
        const a = iz * (segX + 1) + ix;
        const b = a + 1;
        const c = (iz + 1) * (segX + 1) + ix;
        const d = c + 1;
        indices.push(a, b, d, a, d, c);
      }
    }
  }

  const shellGeom = new THREE.BufferGeometry();
  shellGeom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  shellGeom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  shellGeom.setIndex(indices);
  shellGeom.computeVertexNormals();

  // Thickened Front Architectural Fascia Rim Tube merged with shell material
  const frontFasciaPts = [];
  for (let ix = 0; ix <= segX; ix++) {
    const ux = (ix / segX) * 2 - 1;
    frontFasciaPts.push(
      new THREE.Vector3(
        ux * (spanX * 0.5),
        shellY(ux, 0) - shellThickness * 0.45,
        spanZ * 0.5
      )
    );
  }
  const fasciaGeom = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(frontFasciaPts),
    64,
    shellThickness * 0.55,
    10,
    false
  );
  const roofMesh = new THREE.Mesh(
    mergeStaticGeometries([shellGeom, fasciaGeom]),
    materials.gradientShell
  );
  roofMesh.castShadow = true;
  roofMesh.receiveShadow = true;
  g.add(roofMesh);

  // Warm Metallic Champagne / Timber Interior Diagrid Soffit Liner beneath scalloped Gradient Canopy arches!
  if (materials.champagneDiagridSoffit) {
    const innerGeom = shellGeom.clone();
    innerGeom.translate(0, -0.14, 0);
    innerGeom.scale(0.985, 1.0, 0.975);
    const soffitLiner = new THREE.Mesh(innerGeom, materials.champagneDiagridSoffit);
    g.add(soffitLiner);
  }

  const steelGeoms = [];

  // Sculpted Dark-Steel Diagrid Skylight Ribs arching across the scalloped shell
  for (let d = -4; d <= 4; d++) {
    for (const slant of [-0.35, +0.35]) {
      const ribPts = [];
      for (let s = 0; s <= 12; s++) {
        const vz = s / 12;
        const ux = THREE.MathUtils.clamp(d * 0.21 + (vz - 0.5) * slant, -0.98, 0.98);
        ribPts.push(
          new THREE.Vector3(
            ux * (spanX * 0.5),
            shellY(ux, vz) + 0.04,
            (0.5 - vz) * spanZ
          )
        );
      }
      steelGeoms.push(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ribPts), 18, 0.055, 6, false)
      );
    }
  }

  // Profile-Matched Arched Curtain-Glass Atrium Enclosure (`x in [-14.5, +14.5]`, `z in [-6.2, +3.80]`) — Zero sky-gap!
  const halfAtriumX = 14.5;
  const zFront = 3.80;
  const zRear = -6.20;
  const cPos = [];
  const cUv = [];
  const cInd = [];
  const aSegX = 36;
  const aSegZ = 12;

  const frontXZ = [];
  const rearXZ = [];
  const transomPts = [];
  for (let ix = 0; ix <= aSegX; ix++) {
    const x = -halfAtriumX + (ix / aSegX) * (halfAtriumX * 2);
    frontXZ.push([x, zFront]);
    rearXZ.push([x, zRear]);
    transomPts.push(new THREE.Vector3(x, evalShellAtXZ(x, zFront), zFront + 0.05));
  }
  if (openCenterBay) {
    const leftXZ = [];
    const midXZ = [];
    const rightSpanXZ = [];
    for (let ix = 0; ix <= 16; ix++) {
      leftXZ.push([-halfAtriumX + (ix / 16) * (-bayHalfWidth - -halfAtriumX), zFront]);
      rightSpanXZ.push([bayHalfWidth + (ix / 16) * (halfAtriumX - bayHalfWidth), zFront]);
    }
    for (let ix = 0; ix <= 8; ix++) {
      midXZ.push([-bayHalfWidth + (ix / 8) * (bayHalfWidth * 2), zFront]);
    }
    pushArchedWallStrip(cPos, cUv, cInd, leftXZ, () => 0.0, (_t, x, z) => evalShellAtXZ(x, z) + 0.03, false);
    pushArchedWallStrip(cPos, cUv, cInd, rightSpanXZ, () => 0.0, (_t, x, z) => evalShellAtXZ(x, z) + 0.03, false);
    pushArchedWallStrip(cPos, cUv, cInd, midXZ, () => bayHeight, (_t, x, z) => evalShellAtXZ(x, z) + 0.03, false);
  } else {
    pushArchedWallStrip(
      cPos,
      cUv,
      cInd,
      frontXZ,
      () => 0.0,
      (_t, x, z) => evalShellAtXZ(x, z) + 0.03,
      false
    );
  }
  if (!openCenterBay) {
    pushArchedWallStrip(
      cPos,
      cUv,
      cInd,
      rearXZ,
      () => 0.0,
      (_t, x, z) => evalShellAtXZ(x, z) + 0.03,
      true
    );
  }

  const rightXZ = [];
  const leftXZ = [];
  for (let iz = 0; iz <= aSegZ; iz++) {
    const z = zFront + (iz / aSegZ) * (zRear - zFront);
    rightXZ.push([+halfAtriumX, z]);
    leftXZ.push([-halfAtriumX, z]);
  }
  pushArchedWallStrip(
    cPos,
    cUv,
    cInd,
    rightXZ,
    () => 0.0,
    (_t, x, z) => evalShellAtXZ(x, z) + 0.03,
    false
  );
  pushArchedWallStrip(
    cPos,
    cUv,
    cInd,
    leftXZ,
    () => 0.0,
    (_t, x, z) => evalShellAtXZ(x, z) + 0.03,
    true
  );

  const atriumGlassGeom = new THREE.BufferGeometry();
  atriumGlassGeom.setAttribute("position", new THREE.Float32BufferAttribute(cPos, 3));
  atriumGlassGeom.setAttribute("uv", new THREE.Float32BufferAttribute(cUv, 2));
  atriumGlassGeom.setIndex(cInd);
  atriumGlassGeom.computeVertexNormals();
  g.add(new THREE.Mesh(atriumGlassGeom, materials.curtainGlass));

  // Recess Warm Clerestory Glow Band INSIDE the glass facade (`z = +3.42m < 3.80m`) across full 28.4m atrium width!
  const glowPos = [];
  const glowUv = [];
  const glowInd = [];
  const glowXZ = [];
  for (let ix = 0; ix <= aSegX; ix++) {
    const x = -14.2 + (ix / aSegX) * 28.4;
    glowXZ.push([x, 3.42]);
  }
  pushArchedWallStrip(
    glowPos,
    glowUv,
    glowInd,
    glowXZ,
    (_t, x, z) => Math.max(3.6, evalShellAtXZ(x, z) - 1.52),
    (_t, x, z) => evalShellAtXZ(x, z) - 0.14,
    false
  );
  const glowGeom = new THREE.BufferGeometry();
  glowGeom.setAttribute("position", new THREE.Float32BufferAttribute(glowPos, 3));
  glowGeom.setAttribute("uv", new THREE.Float32BufferAttribute(glowUv, 2));
  glowGeom.setIndex(glowInd);
  glowGeom.computeVertexNormals();
  g.add(new THREE.Mesh(glowGeom, materials.clerestoryGlow));

  // Full-height arched steel mullions (`m = -6..+6`) + curved upper transom beam
  steelGeoms.push(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(transomPts), 36, 0.095, 8, false)
  );
  for (let mIdx = -6; mIdx <= 6; mIdx++) {
    const mx = mIdx === -1 && openCenterBay
      ? -bayHalfWidth
      : mIdx === 1 && openCenterBay
      ? bayHalfWidth
      : mIdx * 2.28;
    const mTop = evalShellAtXZ(mx, zFront) + 0.02;
    if (openCenterBay && mIdx === 0) {
      const upperH = Math.max(0.2, mTop - bayHeight);
      const mulG = new THREE.BoxGeometry(0.15, upperH, 0.24);
      mulG.translate(mx, bayHeight + upperH * 0.5, zFront + 0.06);
      steelGeoms.push(mulG);
    } else {
      const mulG = new THREE.BoxGeometry(0.15, mTop, 0.24);
      mulG.translate(mx, mTop * 0.5, zFront + 0.06);
      steelGeoms.push(mulG);
    }
  }
  // Mid-height horizontal transom bar tying mullions cleanly together
  const transomY = openCenterBay ? bayHeight : 3.65;
  const midTransom = new THREE.BoxGeometry(29.0, 0.14, 0.22);
  midTransom.translate(0, transomY, zFront + 0.05);
  steelGeoms.push(midTransom);

  const steelMesh = new THREE.Mesh(mergeStaticGeometries(steelGeoms), materials.steelMullion);
  steelMesh.castShadow = true;
  g.add(steelMesh);

  // 4 Perimeter Concrete Corner Piers (`px = ±14.2, pz = ±4.8`) rising continuously from ground (`y = 0`) into canopy soffit!
  const pierGeoms = [];
  for (const px of [-14.2, +14.2]) {
    for (const pz of [+4.8, -4.8]) {
      const soffitY = evalShellAtXZ(px, pz) + 0.04;
      const shaftG = new THREE.CylinderGeometry(0.74, 0.90, soffitY, 16);
      shaftG.translate(px, soffitY * 0.5, pz);
      pierGeoms.push(shaftG);

      const capCollar = new THREE.CylinderGeometry(1.04, 0.78, 0.42, 16);
      capCollar.translate(px, soffitY - 0.24, pz);
      pierGeoms.push(capCollar);

      const plinthPad = new THREE.CylinderGeometry(1.02, 1.08, 0.22, 16);
      plinthPad.translate(px, 0.11, pz);
      pierGeoms.push(plinthPad);
    }
  }
  const piersMesh = new THREE.Mesh(mergeStaticGeometries(pierGeoms), materials.concreteCurb);
  piersMesh.castShadow = true;
  piersMesh.receiveShadow = true;
  g.add(piersMesh);

  return g;
}

/**
 * Builds Shoreline Amphitheatre's Iconic Twin White Tensile Tent Peaks, Grounded Corner Pylons,
 * Capped Masts (`<= 12.5m` in-frame) & Concrete-Anchored Guy Wires (`V3D-W3-04` & `V3D-W3-06`)!
 */
export function buildShorelineAmphitheatre(materials) {
  const g = new THREE.Group();

  const peakOffsets = [
    { x: -6.4, z: 0.0, h: 11.6, baseR: 10.8 },
    { x: +6.6, z: -1.8, h: 10.7, baseR: 9.8 },
  ];

  const tentGeoms = [];
  const mastGeoms = [];
  const cableGeoms = [];
  const anchorGeoms = [];

  for (const pk of peakOffsets) {
    const radialSegs = 48;
    const heightSegs = 24;
    const pos = [];
    const ind = [];

    for (let iy = 0; iy <= heightSegs; iy++) {
      const v = iy / heightSegs;
      const flare = Math.pow(1 - v, 2.2);
      const r = 0.34 + (pk.baseR - 0.34) * flare;

      for (let ir = 0; ir <= radialSegs; ir++) {
        const ang = (ir / radialSegs) * Math.PI * 2;
        // 8 scalloped catenary arches dipping down to `y = 0.46m` at the 8 corner tie-down pylons (`sin(4*ang) == 0`)!
        const hemArch = (1 - v) * (1 - v) * Math.abs(Math.sin(ang * 4)) * 1.52;
        const y = 0.46 + v * (pk.h - 0.46) + hemArch;
        pos.push(pk.x + Math.cos(ang) * r, y, pk.z + Math.sin(ang) * r);

        if (iy < heightSegs && ir < radialSegs) {
          const a = iy * (radialSegs + 1) + ir;
          const b = a + 1;
          const c = (iy + 1) * (radialSegs + 1) + ir;
          const d = c + 1;
          ind.push(a, b, d, a, d, c);
        }
      }
    }

    const tentGeom = new THREE.BufferGeometry();
    tentGeom.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    tentGeom.setIndex(ind);
    tentGeom.computeVertexNormals();
    tentGeoms.push(tentGeom);

    // Proportioned interior steel mast rising `+0.92m` above peak apex (`100%` visible inside Clip 5 sky!) + capped finial
    const mastTopY = pk.h + 0.92;
    const mastG = new THREE.CylinderGeometry(0.085, 0.18, mastTopY + 0.35, 12);
    mastG.translate(pk.x, (mastTopY - 0.35) * 0.5, pk.z);
    mastGeoms.push(mastG);

    const mastRingG = new THREE.TorusGeometry(0.36, 0.045, 8, 20);
    mastRingG.rotateX(Math.PI * 0.5);
    mastRingG.translate(pk.x, pk.h, pk.z);
    cableGeoms.push(mastRingG);

    const finialConeG = new THREE.ConeGeometry(0.14, 0.28, 12);
    finialConeG.translate(pk.x, mastTopY + 0.14, pk.z);
    mastGeoms.push(finialConeG);

    // 8 Corner Concrete Tie-Down Pylons + 8 Tensioned Guy-Wire Cables anchored into outer Concrete Deadman Blocks!
    for (let c = 0; c < 8; c++) {
      const ang = (c / 8) * Math.PI * 2;
      const cosA = Math.cos(ang);
      const sinA = Math.sin(ang);

      // Corner concrete pylon directly under tent catenary corner (`r = pk.baseR, y_corner = 0.46m`)
      const cornerX = pk.x + cosA * pk.baseR;
      const cornerZ = pk.z + sinA * pk.baseR;
      const pylonG = new THREE.CylinderGeometry(0.24, 0.34, 1.32, 10);
      pylonG.translate(cornerX, -0.12, cornerZ); // spans `y = -0.78..+0.54m`, deeply embedded in berm & clasping tent corner!
      anchorGeoms.push(pylonG);

      // Outer concrete deadman anchor block (`r = pk.baseR * 1.09`) deeply embedded in the dry grassy berm (`y = -0.72..+0.18m`)
      const anchorX = pk.x + cosA * (pk.baseR * 1.09);
      const anchorZ = pk.z + sinA * (pk.baseR * 1.09);
      const blockG = new THREE.BoxGeometry(0.56, 0.90, 0.56);
      blockG.rotateY(-ang);
      blockG.translate(anchorX, -0.27, anchorZ);
      anchorGeoms.push(blockG);

      // Masthead-to-corner ridge cable + corner-to-deadman tie-down stay (visibly tensioning every scalloped tent corner!)
      const cabCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(pk.x, mastTopY - 0.08, pk.z),
        new THREE.Vector3(
          pk.x + cosA * pk.baseR * 0.54,
          pk.h * 0.52,
          pk.z + sinA * pk.baseR * 0.54
        ),
        new THREE.Vector3(cornerX, 0.47, cornerZ),
      ]);
      cableGeoms.push(new THREE.TubeGeometry(cabCurve, 12, 0.025, 5, false));

      const cornerStay = new THREE.CatmullRomCurve3([
        new THREE.Vector3(cornerX, 0.47, cornerZ),
        new THREE.Vector3(anchorX, 0.12, anchorZ),
      ]);
      cableGeoms.push(new THREE.TubeGeometry(cornerStay, 4, 0.032, 5, false));
    }
  }

  const tentMesh = new THREE.Mesh(mergeStaticGeometries(tentGeoms), materials.shorelineTent);
  tentMesh.castShadow = true;
  g.add(tentMesh);

  const mastMesh = new THREE.Mesh(mergeStaticGeometries(mastGeoms), materials.reflectorWhite);
  mastMesh.castShadow = true;
  g.add(mastMesh);

  const cableMesh = new THREE.Mesh(mergeStaticGeometries(cableGeoms), materials.bridgeRailing);
  g.add(cableMesh);

  const anchorMesh = new THREE.Mesh(mergeStaticGeometries(anchorGeoms), materials.concreteCurb);
  anchorMesh.castShadow = true;
  anchorMesh.receiveShadow = true;
  g.add(anchorMesh);

  return g;
}

export class CampusWorlds {
  constructor(scene, materials) {
    this.scene = scene;
    this.materials = materials;
    this.worldRoot = new THREE.Group();
    this.worldRoot.name = "MountainViewCampusRoot";
    this.scene.add(this.worldRoot);

    this.swayingCrowns = [];
    this.waterMaterials = [];
    this.dappledGoboMeshes = [];
    this.flamingoActors = [];
    this.flamDynamicMeshes = null;
    this.stanSlotGroup = null;
    this.stanFallbackSkel = null;
    this.stanFallbackMeshes = [];
    this.bugdroidSlotGroup = null;
    this.bugdroidFallback = null;
    this.sunsetDustMotes = null;
    this.sunsetDustMat = null;
    this.sunsetDustBasePos = null;
    this.sunsetDustPhase = null;
    this.sunsetDustMaxCount = 220;

    this._buildSkyAndMountainRing();
    this.clips = [
      this._buildClip1BayView(),
      this._buildClip2StanTRex(),
      this._buildClip3AndroidLawn(),
      this._buildClip4GradientCanopy(),
      this._buildClip5ShorelineSunset(),
    ];

    // Distant background trees (`|z| >= 11m`) sit outside the tight `±7.5m` hero shadow-camera frustum;
    // disabling `castShadow` on them avoids redundant shadow-pass draw calls while keeping close trees & dappled gobos crisp!
    for (const tree of this.swayingCrowns) {
      if (Math.abs(tree.position.z) >= 11.0) {
        tree.traverse((ch) => {
          if (ch.isMesh) ch.castShadow = false;
        });
      }
    }

    this.clips.forEach((clip, idx) => {
      clip.group.visible = idx === 0;
      this.worldRoot.add(clip.group);
    });
  }

  _buildSkyAndMountainRing() {
    this.skyMat = createSkyDomeMaterial();
    this.skyDome = new THREE.Mesh(new THREE.SphereGeometry(220, 32, 20), this.skyMat);
    this.skyDome.frustumCulled = false;
    this.worldRoot.add(this.skyDome);

    const rng = createSeededRNG(0x360ca11f);
    const segs = 128;
    const R = 148;
    const pos = [];
    const cols = [];
    const ind = [];

    this.mountainMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
    });

    const baseCol = new THREE.Color("#7f95ad");
    const ridgeCol = new THREE.Color("#9ab0c7");

    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const x = Math.cos(a) * R;
      const z = Math.sin(a) * R;
      const ridgeH =
        8.5 +
        Math.sin(a * 3.0 + 0.4) * 4.8 +
        Math.cos(a * 7.0 - 1.1) * 2.6 +
        Math.sin(a * 13.0) * 1.1 +
        rng() * 0.4;

      pos.push(x, -4.0, z, x, ridgeH, z);
      cols.push(baseCol.r, baseCol.g, baseCol.b, ridgeCol.r, ridgeCol.g, ridgeCol.b);

      if (i < segs) {
        const b = i * 2;
        ind.push(b, b + 1, b + 3, b, b + 3, b + 2);
      }
    }

    const mtnGeom = new THREE.BufferGeometry();
    mtnGeom.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    mtnGeom.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    mtnGeom.setIndex(ind);
    this.mountainRing = new THREE.Mesh(mtnGeom, this.mountainMat);
    this.mountainRing.frustumCulled = false;
    this.worldRoot.add(this.mountainRing);
  }

  /**
   * CLIP 1: Bay View 3-Tier Dragonscale Canopy & Stevens Creek Waterfront Path
   */
  _buildClip1BayView() {
    const rng = createSeededRNG(0xc1190001);
    const group = new THREE.Group();
    group.name = "Clip1_BayView";

    // Starts at x = -3.2m -> frames Bay View Canopy cleanly at BOTH t = 0.0s AND mid-clip t = 2.6s!
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-3.2, 0, -0.2),
      new THREE.Vector3(+6.8, 0, +0.35),
      new THREE.Vector3(+16.8, 0, +0.05),
      new THREE.Vector3(+26.8, 0, -0.45),
      new THREE.Vector3(+36.8, 0, -0.15),
    ]);
    const pathCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-24.2, 0, -0.55),
      new THREE.Vector3(-13.7, 0, -0.38),
      new THREE.Vector3(-3.2, 0, -0.2),
      new THREE.Vector3(+6.8, 0, +0.35),
      new THREE.Vector3(+16.8, 0, +0.05),
      new THREE.Vector3(+26.8, 0, -0.45),
      new THREE.Vector3(+36.8, 0, -0.15),
      new THREE.Vector3(+46.8, 0, +0.05),
    ]);

    const groundApron = new THREE.Mesh(
      new THREE.PlaneGeometry(180, 150).rotateX(-Math.PI / 2),
      this.materials.apronMulchLambert
    );
    groundApron.position.set(14, -0.05, 0);
    groundApron.receiveShadow = true;
    group.add(groundApron);

    // Seamless full-horizon lawn bordering the south (+Z) side of the path (zero backlot seam at any orbit angle!)
    const rightLawn = new THREE.Mesh(
      new THREE.PlaneGeometry(180, 78).rotateX(-Math.PI / 2),
      this.materials.apronGrassLambert
    );
    rightLawn.position.set(14, -0.02, +40.8);
    rightLawn.receiveShadow = true;
    group.add(rightLawn);

    const clip1HeightFn = (pt) => getClipTerrainHeight("clip1", (pt.x + 3.2) / 40.0, pt.x);
    const bikePath = buildRibbonAlongCurve(
      pathCurve,
      3.6,
      0.08,
      104,
      this.materials.concretePath,
      0.0,
      0.0,
      clip1HeightFn
    );
    group.add(bikePath);

    // Dry sculpted soil embankment (`lat in [-3.18, -1.88]`) + architectural stone shoreline coping (`lat = -3.22`)!
    const pondEmbankment = buildRibbonAlongCurve(
      pathCurve,
      1.32,
      0.14,
      104,
      this.materials.mulchSoil,
      -0.005,
      -2.54,
      clip1HeightFn
    );
    const pondShoreCoping = buildRibbonAlongCurve(
      pathCurve,
      0.34,
      0.14,
      104,
      this.materials.concreteCurb,
      0.015,
      -3.24,
      clip1HeightFn
    );
    group.add(pondEmbankment, pondShoreCoping);

    const waterCurb = buildRibbonAlongCurve(
      pathCurve,
      0.28,
      0.16,
      104,
      this.materials.concreteCurb,
      0.08,
      -1.92,
      clip1HeightFn
    );
    const rightCurb = buildRibbonAlongCurve(
      pathCurve,
      0.22,
      0.11,
      104,
      this.materials.concreteCurb,
      0.04,
      +1.90,
      clip1HeightFn
    );
    group.add(waterCurb, rightCurb);

    // Batch all embankment sedges (`z >= -2.95m`, cleanly north of `z <= -3.35m` pond water!) & outer border shrubs by foliage material
    const willowShrubGeoms = [];
    const goldenShrubGeoms = [];
    for (let gIdx = 0; gIdx < 32; gIdx++) {
      const u = gIdx / 31;
      pathCurve.getPointAt(u, _vA);
      const sedge = createOrnamentalShrub(this.materials, rng, 0.22 + rng() * 0.08);
      sedge.scale.set(1.18, 0.56, 0.80);
      sedge.position.set(_vA.x + (rng() - 0.5) * 0.7, 0, _vA.z - 2.38 - rng() * 0.16);
      groundObjectToY(sedge, -0.005);
      sedge.updateMatrixWorld(true);
      sedge.traverse((c) => {
        if (c.isMesh) {
          const gc = c.geometry.clone();
          gc.applyMatrix4(c.matrixWorld);
          if (c.material === this.materials.foliageGolden) goldenShrubGeoms.push(gc);
          else willowShrubGeoms.push(gc);
          c.geometry.dispose();
        }
      });
    }

    // Shimmering Stevens Creek Retention Pond (`z in [-27.35, -3.35]`) with crisp foreground stone coping!
    const waterMat = createWaterPondMaterial(false);
    this.waterMaterials.push(waterMat);
    const pondMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(136, 24.0).rotateX(-Math.PI / 2),
      waterMat
    );
    pondMesh.position.set(12, -0.025, -15.35);
    group.add(pondMesh);

    // Centered Hero Landmark (`x = +1.5m, z = -28.0m`) with full 3-tier catenary crown below top HUD bar!
    const bayViewGroup = buildBayViewDragonscaleBuilding(this.materials);
    bayViewGroup.position.set(+1.5, 0, -28.0);
    groundObjectToY(bayViewGroup, 0.0, 0.02);
    group.add(bayViewGroup);

    // Secondary East Wing Dragonscale Pavilion for continuous 1.6x cadence skyline
    const eastWing = buildBayViewDragonscaleBuilding(this.materials);
    eastWing.scale.set(0.68, 0.80, 0.76);
    eastWing.position.set(+34.5, 0, -29.5);
    groundObjectToY(eastWing, 0.0, 0.02);
    group.add(eastWing);

    // Framing Weeping Willows & Coastal Oaks placed cleanly outside the central dragonscale sightline
    const treeCoords = [
      [-23.5, -22.5, 7.4, true],
      [+21.5, -23.5, 7.2, true],
      [+27.5, -21.0, 6.4, false],
      [-12.0, +15.0, 6.8, false],
      [+4.5, +17.5, 7.0, true],
      [+19.5, +16.0, 6.6, false],
      [+33.0, +15.5, 7.0, true],
    ];
    for (const [tx, tz, th, isWillow] of treeCoords) {
      const tree = createDeciduousTree(this.materials, rng, th, isWillow);
      tree.position.set(tx, 0, tz);
      groundObjectToY(tree, 0.0);
      group.add(tree);
      this.swayingCrowns.push(tree);
    }

    // Coastal Agave & Ornamental Shrubs on outer mulched border (`z >= +4.8m`, well clear of camera!)
    for (let i = 0; i < 14; i++) {
      const u = i / 13;
      curve.getPointAt(u, _vA);
      const shrub = createOrnamentalShrub(this.materials, rng, 0.34 + rng() * 0.16);
      shrub.position.set(_vA.x + (rng() - 0.5) * 1.1, 0, _vA.z + 5.0 + rng() * 0.8);
      groundObjectToY(shrub, 0.0);
      shrub.updateMatrixWorld(true);
      shrub.traverse((c) => {
        if (c.isMesh) {
          const gc = c.geometry.clone();
          gc.applyMatrix4(c.matrixWorld);
          if (c.material === this.materials.foliageGolden) goldenShrubGeoms.push(gc);
          else willowShrubGeoms.push(gc);
          c.geometry.dispose();
        }
      });
    }

    if (willowShrubGeoms.length > 0) {
      const mW = new THREE.Mesh(
        mergeStaticGeometries(willowShrubGeoms, true),
        this.materials.foliageWillow
      );
      mW.castShadow = true;
      mW.receiveShadow = true;
      group.add(mW);
    }
    if (goldenShrubGeoms.length > 0) {
      const mG = new THREE.Mesh(
        mergeStaticGeometries(goldenShrubGeoms, true),
        this.materials.foliageGolden
      );
      mG.castShadow = true;
      mG.receiveShadow = true;
      group.add(mG);
    }

    return {
      id: "clip1",
      group,
      curve,
      curveLength: curve.getLength(),
      plankPitchM: 0.35,
      lighting: {
        sunDir: new THREE.Vector3(0.35, 0.78, 0.52).normalize(),
        sunColor: new THREE.Color("#fff9ed"),
        sunIntensity: 2.38,
        hemiSky: new THREE.Color("#cce5ff"),
        hemiGround: new THREE.Color("#8d8373"),
        skyZenith: new THREE.Color("#6ba4de"),
        skyHorizon: new THREE.Color("#e8f2fc"),
        skyGlow: new THREE.Color("#fff8e6"),
        sunsetMix: 0.05,
        mtnColor: new THREE.Color("#93aac2"),
      },
      cameraOffset: { right: 3.12, forward: 0.82, up: 0.70, lookUp: 0.73, fov: 45 },
    };
  }

  /**
   * CLIP 2: Googleplex Courtyard, Matte 4-Color Café Umbrellas, Bistro Chairs, Redwoods & Bronze "Stan" T-Rex + 54 Flamingos
   */
  _buildClip2StanTRex() {
    const rng = createSeededRNG(0xc1190002);
    const group = new THREE.Group();
    group.name = "Clip2_StanTRex";

    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-3.2, 0, +0.15),
      new THREE.Vector3(+6.8, 0, +0.35),
      new THREE.Vector3(+16.8, 0, -0.15),
      new THREE.Vector3(+26.8, 0, -0.42),
      new THREE.Vector3(+36.8, 0, +0.10),
    ]);

    const plazaFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(180, 150).rotateX(-Math.PI / 2),
      this.materials.apronConcreteLambert
    );
    plazaFloor.position.set(14, -0.02, 0);
    plazaFloor.receiveShadow = true;
    group.add(plazaFloor);

    // Crisp 4K PBR concrete cycling lane directly under hero tires (following `kin.js` `clip2` crown 1:1!)
    const clip2HeightFn = (pt) => getClipTerrainHeight("clip2", (pt.x + 3.2) / 40.0, pt.x);
    group.add(
      buildRibbonAlongCurve(curve, 4.4, 0.05, 68, this.materials.concretePath, 0.0, 0.0, clip2HeightFn)
    );

    // Dappled Sunlit Coastal-Redwood Leaf-Canopy Shadow Gobos projected onto courtyard pavers & bike path!
    if (this.materials.dappledShadowGobo) {
      const goboGeoms = [];
      const goboSpecs = [
        [-1.8, +0.2, 6.4, 4.2, 0.25],
        [+5.8, -1.6, 7.2, 4.8, -0.35],
        [+13.4, +0.1, 6.8, 4.4, 0.48],
        [+21.5, -0.8, 7.0, 4.5, -0.22],
        [+29.5, +0.2, 6.2, 4.0, 0.18],
        [-6.5, -6.2, 7.5, 5.2, 0.62],
        [+11.5, -6.4, 7.8, 5.0, -0.44],
      ];
      for (const [gx, gz, gw, gd, gYaw] of goboSpecs) {
        const gy = (Math.abs(gz) < 2.2 ? clip2HeightFn({ x: gx }) : 0.0) + 0.006;
        const gPlane = new THREE.PlaneGeometry(gw, gd).rotateX(-Math.PI * 0.5);
        gPlane.rotateY(gYaw);
        gPlane.translate(gx, gy, gz);
        goboGeoms.push(gPlane);
      }
      const goboMesh = new THREE.Mesh(mergeStaticGeometries(goboGeoms), this.materials.dappledShadowGobo);
      goboMesh.userData.baseX = 0;
      group.add(goboMesh);
      this.dappledGoboMeshes.push(goboMesh);
    }

    // Building 40 / 43 Sunlit Mullioned Glass Curtain-Wall Facades directly behind courtyard!
    const bldgBack = new THREE.Mesh(
      new THREE.BoxGeometry(58, 11.2, 8.5),
      this.materials.curtainGlass
    );
    bldgBack.position.set(6.0, 5.6, -21.5);
    group.add(bldgBack);

    const cafeSteelGeoms = [];
    for (let m = -13; m <= 13; m++) {
      const mulG = new THREE.BoxGeometry(0.15, 11.3, 0.28);
      mulG.translate(6.0 + m * 2.15, 5.65, -17.15);
      cafeSteelGeoms.push(mulG);
    }

    const bldgLeft = new THREE.Mesh(
      new THREE.BoxGeometry(11.0, 12.2, 22.0),
      this.materials.curtainGlass
    );
    bldgLeft.position.set(-18.5, 6.1, -12.5);
    group.add(bldgLeft);

    // Build reusable 4-legged café bistro chair prototype (`V3D-W3-05`: seat pan + 4 splayed legs + curved backrest!)
    const chairPartGeoms = [];
    const seatPan = new THREE.CylinderGeometry(0.20, 0.19, 0.028, 14);
    seatPan.translate(0, 0.44, 0);
    chairPartGeoms.push(seatPan);

    const chMat = new THREE.Matrix4();
    const chQuat = new THREE.Quaternion();
    const chEul = new THREE.Euler();
    const chPos = new THREE.Vector3();

    for (const lx of [-0.145, +0.145]) {
      for (const lz of [-0.145, +0.145]) {
        const legG = new THREE.CylinderGeometry(0.013, 0.010, 0.45, 7);
        chEul.set(lz * 0.45, 0, -lx * 0.45);
        chQuat.setFromEuler(chEul);
        chPos.set(lx, 0.22, lz);
        chMat.compose(chPos, chQuat, _scale);
        legG.applyMatrix4(chMat);
        chairPartGeoms.push(legG);
      }
    }
    // Backrest uprights (`-Z` is behind seated diner, `+Z` faces table)
    for (const bx of [-0.155, +0.155]) {
      const postG = new THREE.CylinderGeometry(0.012, 0.013, 0.36, 7);
      chEul.set(-0.14, 0, 0);
      chQuat.setFromEuler(chEul);
      chPos.set(bx, 0.61, -0.175);
      chMat.compose(chPos, chQuat, _scale);
      postG.applyMatrix4(chMat);
      chairPartGeoms.push(postG);
    }
    const backSlatCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.165, 0.75, -0.19),
      new THREE.Vector3(0.0, 0.77, -0.215),
      new THREE.Vector3(+0.165, 0.75, -0.19),
    ]);
    chairPartGeoms.push(new THREE.TubeGeometry(backSlatCurve, 8, 0.024, 6, false));
    const midSlatCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.16, 0.62, -0.175),
      new THREE.Vector3(0.0, 0.63, -0.198),
      new THREE.Vector3(+0.16, 0.62, -0.175),
    ]);
    chairPartGeoms.push(new THREE.TubeGeometry(midSlatCurve, 8, 0.016, 6, false));
    const bistroChairProto = mergeStaticGeometries(chairPartGeoms);

    // Matte Woven-Canvas 4-Color Google Café Umbrellas + Bistro Tables + 4-Legged Bistro Chairs!
    const umbrellaSpecs = [
      { x: -9.4, z: -5.4, mat: this.materials.umbrellaRed },
      { x: -6.4, z: -5.8, mat: this.materials.umbrellaBlue },
      { x: -8.0, z: -8.8, mat: this.materials.umbrellaGreen },
      { x: -4.8, z: -8.6, mat: this.materials.umbrellaYellow },
      { x: +8.8, z: -6.2, mat: this.materials.umbrellaRed },
      { x: +11.8, z: -8.4, mat: this.materials.umbrellaBlue },
      { x: +14.8, z: -6.0, mat: this.materials.umbrellaGreen },
      { x: +18.0, z: -8.0, mat: this.materials.umbrellaYellow },
    ];

    const cafeAlloyGeoms = [];
    const canopyMap = new Map();

    for (const u of umbrellaSpecs) {
      const poleG = new THREE.CylinderGeometry(0.032, 0.036, 2.48, 10);
      poleG.translate(u.x, 1.24, u.z);
      cafeAlloyGeoms.push(poleG);

      const finialG = new THREE.SphereGeometry(0.055, 10, 8);
      finialG.translate(u.x, 2.68, u.z);
      cafeAlloyGeoms.push(finialG);

      const tableTopG = new THREE.CylinderGeometry(0.60, 0.60, 0.045, 18);
      tableTopG.translate(u.x, 0.74, u.z);
      cafeAlloyGeoms.push(tableTopG);

      const tableBaseG = new THREE.CylinderGeometry(0.28, 0.32, 0.03, 14);
      tableBaseG.translate(u.x, 0.015, u.z);
      cafeAlloyGeoms.push(tableBaseG);

      const canopyG = new THREE.ConeGeometry(1.56, 0.48, 8);
      canopyG.translate(u.x, 2.42, u.z);
      if (!canopyMap.has(u.mat)) canopyMap.set(u.mat, []);
      canopyMap.get(u.mat).push(canopyG);

      for (let c = 0; c < 3; c++) {
        const ca = (c / 3) * Math.PI * 2 + 0.4;
        const cx = u.x + Math.cos(ca) * 0.86;
        const cz = u.z + Math.sin(ca) * 0.86;
        const chClone = bistroChairProto.clone();
        // Orient `+Z` of chair inward toward table center `(u.x, u.z)`!
        chEul.set(0, Math.atan2(u.x - cx, u.z - cz), 0);
        chQuat.setFromEuler(chEul);
        chPos.set(cx, 0.0, cz);
        chMat.compose(chPos, chQuat, _scale);
        chClone.applyMatrix4(chMat);
        cafeSteelGeoms.push(chClone);
      }
    }
    bistroChairProto.dispose();

    const cafeAlloyMesh = new THREE.Mesh(
      mergeStaticGeometries(cafeAlloyGeoms),
      this.materials.gbikeAlloy
    );
    cafeAlloyMesh.castShadow = true;
    group.add(cafeAlloyMesh);

    const cafeSteelMesh = new THREE.Mesh(
      mergeStaticGeometries(cafeSteelGeoms),
      this.materials.steelMullion
    );
    cafeSteelMesh.castShadow = true;
    cafeSteelMesh.receiveShadow = true;
    group.add(cafeSteelMesh);

    for (const [uMat, cGeoms] of canopyMap.entries()) {
      const cMesh = new THREE.Mesh(mergeStaticGeometries(cGeoms), uMat);
      cMesh.castShadow = true;
      group.add(cMesh);
    }

    // Hero Midground (`x = +1.8m, z = -8.6m`): Mulched Garden Island + Sculpted Bronze "Stan" T-Rex + 54 Pink Flamingos!
    const mulchBed = new THREE.Mesh(
      new THREE.CylinderGeometry(7.2, 7.6, 0.08, 36),
      this.materials.mulchSoil
    );
    mulchBed.scale.set(1.26, 1, 0.72);
    mulchBed.position.set(+1.8, 0.02, -8.6);
    mulchBed.receiveShadow = true;
    group.add(mulchBed);

    const stanYaw = 0.26;
    const stan = buildStanTRexStatue(this.materials);
    // Keep `Stan_Garden_Plinth` (`stan.children[0]`) visible under `stan_trex.glb` so Stan's bronze feet stand proudly atop the concrete plinth (`y = +0.24m`), zero buried toes!
    const stanFallbackMeshes = stan.children.filter((ch) => ch.name !== "Stan_Garden_Plinth");
    stan.position.set(+1.8, 0, -8.5);
    stan.rotation.y = stanYaw;
    groundObjectToY(stan, 0.04);
    this.stanSlotGroup = stan;
    this.stanFallbackSkel = stanFallbackMeshes[0] || null;
    this.stanFallbackMeshes = stanFallbackMeshes;
    group.add(stan);

    // Build shared prototypes for 54 Instanced Pink Lawn Flamingos (`270` draw calls -> `5` draw calls!)
    const legL = new THREE.CylinderGeometry(0.0045, 0.0045, 0.35, 6);
    legL.translate(-0.025, 0.175, 0);
    const legR = new THREE.CylinderGeometry(0.0045, 0.0045, 0.35, 6);
    legR.translate(+0.025, 0.175, 0);
    const legPairProto = mergeStaticGeometries([legL, legR]);

    const makeFlamBodyAndBeak = (pecking) => {
      const bSphere = new THREE.SphereGeometry(0.115, 14, 10);
      bSphere.scale(0.76, 0.84, 1.38);
      const nCurve = new THREE.CatmullRomCurve3(
        pecking
          ? [
              new THREE.Vector3(0, 0.03, 0.11),
              new THREE.Vector3(0, 0.12, 0.22),
              new THREE.Vector3(0, -0.08, 0.28),
            ]
          : [
              new THREE.Vector3(0, 0.04, 0.10),
              new THREE.Vector3(0, 0.19, 0.08),
              new THREE.Vector3(0, 0.29, 0.15),
            ]
      );
      const nTube = new THREE.TubeGeometry(nCurve, 8, 0.023, 6, false);
      const tip = nCurve.getPoint(1);
      const bk = new THREE.ConeGeometry(0.021, 0.072, 8);
      bk.rotateX(Math.PI * 0.72);
      bk.translate(tip.x, tip.y - 0.02, tip.z + 0.03);
      return {
        pinkGeom: mergeStaticGeometries([bSphere, nTube]),
        beakGeom: bk,
      };
    };

    const peckProto = makeFlamBodyAndBeak(true);
    const idleProto = makeFlamBodyAndBeak(false);

    const cosStan = Math.cos(stanYaw);
    const sinStan = Math.sin(stanYaw);
    const peckActors = [];
    const idleActors = [];

    for (let attempt = 0; attempt < 260 && peckActors.length + idleActors.length < 54; attempt++) {
      const idx = peckActors.length + idleActors.length;
      const ang = (attempt / 54) * Math.PI * 2 + rng() * 0.45;
      const rx = 2.4 + rng() * 5.2;
      const rz = 1.6 + rng() * 2.8;
      const fx = 1.8 + Math.cos(ang) * rx;
      const fz = -8.6 + Math.sin(ang) * rz;

      // Transform `(fx, fz)` into Stan's rotated local plinth frame (`+0.26 rad` around `(1.8, -8.5)`)!
      const dx = fx - 1.8;
      const dz = fz + 8.5;
      const localX = dx * cosStan - dz * sinStan;
      const localZ = dx * sinStan + dz * cosStan;
      if (Math.abs(localX) < 3.35 && Math.abs(localZ) < 1.65) continue;
      if (fz > -4.6) continue;

      const yaw = rng() * Math.PI * 2;
      const isPecking = idx % 4 === 0;
      const actor = {
        x: fx,
        y: 0.40, // `0.05` mulch top + `0.35` leg height
        z: fz,
        yaw,
        isPecking,
        phase: idx * 0.65,
        instIdx: isPecking ? peckActors.length : idleActors.length,
      };
      if (isPecking) {
        peckActors.push(actor);
      } else {
        idleActors.push(actor);
      }
      this.flamingoActors.push(actor);
    }

    const totalFlams = this.flamingoActors.length;
    const flamLegsInst = new THREE.InstancedMesh(
      legPairProto,
      this.materials.gbikeAlloy,
      totalFlams
    );
    for (let i = 0; i < totalFlams; i++) {
      const fa = this.flamingoActors[i];
      _quat.setFromAxisAngle(_up, fa.yaw);
      _vA.set(fa.x, 0.05, fa.z);
      _mat4.compose(_vA, _quat, _scale);
      flamLegsInst.setMatrixAt(i, _mat4);
    }
    flamLegsInst.instanceMatrix.needsUpdate = true;
    group.add(flamLegsInst);

    const peckPinkInst = new THREE.InstancedMesh(
      peckProto.pinkGeom,
      this.materials.flamingoPink,
      Math.max(1, peckActors.length)
    );
    const peckBeakInst = new THREE.InstancedMesh(
      peckProto.beakGeom,
      this.materials.pelicanBlackPrimary,
      Math.max(1, peckActors.length)
    );
    const idlePinkInst = new THREE.InstancedMesh(
      idleProto.pinkGeom,
      this.materials.flamingoPink,
      Math.max(1, idleActors.length)
    );
    const idleBeakInst = new THREE.InstancedMesh(
      idleProto.beakGeom,
      this.materials.pelicanBlackPrimary,
      Math.max(1, idleActors.length)
    );
    peckPinkInst.castShadow = true;
    idlePinkInst.castShadow = true;
    group.add(peckPinkInst, peckBeakInst, idlePinkInst, idleBeakInst);

    this.flamDynamicMeshes = {
      peckPinkInst,
      peckBeakInst,
      idlePinkInst,
      idleBeakInst,
    };
    this._syncFlamingoInstancedMatrices(0.0);

    // Towering Multi-Tiered Sunlit Coastal Redwoods framing Stan & Googleplex Courtyard!
    const redwoodPositions = [
      [-12.2, -14.8, 15.0],
      [-2.2, -14.8, 16.4],
      [+5.4, -15.0, 17.0],
      [+12.2, -14.2, 15.8],
      [+23.5, -13.6, 15.4],
    ];
    for (const [rx, rz, rh] of redwoodPositions) {
      const rw = createCoastalRedwood(this.materials, rng, rh);
      rw.position.set(rx, 0, rz);
      groundObjectToY(rw, 0.0);
      group.add(rw);
      this.swayingCrowns.push(rw);
    }

    compactRigidGroupMeshes(
      group,
      new Set([...this.swayingCrowns, this.stanSlotGroup, ...this.dappledGoboMeshes])
    );

    return {
      id: "clip2",
      group,
      curve,
      curveLength: curve.getLength(),
      plankPitchM: 0.35,
      lighting: {
        sunDir: new THREE.Vector3(0.42, 0.76, 0.49).normalize(),
        sunColor: new THREE.Color("#fff6e0"),
        sunIntensity: 2.36,
        hemiSky: new THREE.Color("#cbe3fc"),
        hemiGround: new THREE.Color("#918474"),
        skyZenith: new THREE.Color("#639cd9"),
        skyHorizon: new THREE.Color("#e6f0fa"),
        skyGlow: new THREE.Color("#fff5dc"),
        sunsetMix: 0.08,
        mtnColor: new THREE.Color("#8ea6bf"),
      },
      cameraOffset: { right: 3.12, forward: 0.82, up: 0.70, lookUp: 0.73, fov: 45 },
    };
  }

  /**
   * CLIP 3: Android Lawn Statues Sculpture Garden (7 Distinct Sculptures!) & Mass-Timber Visitor Experience Pavilion
   */
  _buildClip3AndroidLawn() {
    const rng = createSeededRNG(0xc1190003);
    const group = new THREE.Group();
    group.name = "Clip3_AndroidLawn";

    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-3.2, 0, +0.25),
      new THREE.Vector3(+6.8, 0, -0.18),
      new THREE.Vector3(+16.8, 0, +0.25),
      new THREE.Vector3(+26.8, 0, +0.08),
      new THREE.Vector3(+36.8, 0, -0.25),
    ]);
    const laneCurve3 = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-23.2, 0, +0.40),
      new THREE.Vector3(-13.2, 0, +0.34),
      new THREE.Vector3(-3.2, 0, +0.25),
      new THREE.Vector3(+6.8, 0, -0.18),
      new THREE.Vector3(+16.8, 0, +0.25),
      new THREE.Vector3(+26.8, 0, +0.08),
      new THREE.Vector3(+36.8, 0, -0.25),
      new THREE.Vector3(+46.8, 0, -0.35),
    ]);

    const lawn = new THREE.Mesh(
      new THREE.PlaneGeometry(180, 150).rotateX(-Math.PI / 2),
      this.materials.apronGrassLambert
    );
    lawn.position.set(14, -0.02, 0);
    lawn.receiveShadow = true;
    group.add(lawn);

    const clip3HeightFn = (pt) => getClipTerrainHeight("clip3", (pt.x + 3.2) / 40.0, pt.x);
    const brickLane = buildRibbonAlongCurve(
      laneCurve3,
      3.4,
      0.08,
      104,
      this.materials.brickPath,
      0.0,
      0.0,
      clip3HeightFn
    );
    group.add(brickLane);
    for (const side of [-1.78, +1.78]) {
      group.add(
        buildRibbonAlongCurve(
          laneCurve3,
          0.18,
          0.10,
          104,
          this.materials.concreteCurb,
          0.015,
          side,
          clip3HeightFn
        )
      );
    }

    // Dappled Sunlit Deciduous Leaf-Canopy Shadow Gobos across brick bike lane & sculpture lawn!
    if (this.materials.dappledShadowGobo) {
      const goboGeoms3 = [];
      const goboSpecs3 = [
        [-2.2, +0.2, 5.8, 3.6, -0.25],
        [+7.5, -0.1, 6.2, 3.8, 0.32],
        [+17.2, +0.2, 6.0, 3.6, -0.18],
        [+27.0, +0.1, 6.4, 3.8, 0.28],
      ];
      for (const [gx, gz, gw, gd, gYaw] of goboSpecs3) {
        const gy = clip3HeightFn({ x: gx }) + 0.006;
        const gPlane = new THREE.PlaneGeometry(gw, gd).rotateX(-Math.PI * 0.5);
        gPlane.rotateY(gYaw);
        gPlane.translate(gx, gy, gz);
        goboGeoms3.push(gPlane);
      }
      const goboMesh3 = new THREE.Mesh(
        mergeStaticGeometries(goboGeoms3),
        this.materials.dappledShadowGobo
      );
      goboMesh3.userData.baseX = 0;
      group.add(goboMesh3);
      this.dappledGoboMeshes.push(goboMesh3);
    }

    // 7 Distinct Iconic Android Statues Staged Across the Lawn (Zero Clones!)
    const iceCream = buildIceCreamSandwichStatue(this.materials);
    iceCream.position.set(-8.0, 0, -7.2);
    iceCream.rotation.y = 0.32;
    groundObjectToY(iceCream, 0.0);
    group.add(iceCream);

    const donut = buildGiantDonutStatue(this.materials, rng);
    donut.position.set(-4.8, 0, -7.8);
    donut.rotation.y = 0.22;
    groundObjectToY(donut, 0.0);
    group.add(donut);

    const cupcake = buildCupcakeStatue(this.materials);
    cupcake.position.set(-1.5, 0, -7.5);
    groundObjectToY(cupcake, 0.0);
    group.add(cupcake);

    // Hero Center: Cheerful Waving Green Android Bugdroid (`|NDC.x| <= 0.76` at BOTH t = 0.0s AND t = 2.6s)!
    const bugdroidSlot = new THREE.Group();
    bugdroidSlot.position.set(+1.8, 0, -8.2);
    bugdroidSlot.rotation.y = 0.08;

    const bugdroidPlinth = new THREE.Mesh(
      new THREE.CylinderGeometry(1.02, 1.10, 0.14, 24),
      this.materials.concreteCurb
    );
    bugdroidPlinth.position.y = 0.07;
    bugdroidPlinth.castShadow = true;
    bugdroidPlinth.receiveShadow = true;
    bugdroidSlot.add(bugdroidPlinth);

    const bugdroid = buildAndroidBugdroidStatue(this.materials, true);
    compactRigidGroupMeshes(bugdroid);
    groundObjectToY(bugdroid, 0.14);
    bugdroidSlot.add(bugdroid);
    this.bugdroidSlotGroup = bugdroidSlot;
    this.bugdroidFallback = bugdroid;
    group.add(bugdroidSlot);

    const lollipop = buildLollipopStatue(this.materials);
    lollipop.position.set(+5.0, 0, -6.8);
    lollipop.rotation.y = -0.18;
    groundObjectToY(lollipop, 0.0);
    group.add(lollipop);

    // Distinct East Lawn Sculptures: Android 2.3 Gingerbread & Android 4.4 KitKat (`V3D-W3-03`)!
    const gingerbread = buildGingerbreadStatue(this.materials);
    gingerbread.position.set(+8.2, 0, -7.6);
    gingerbread.rotation.y = -0.16;
    groundObjectToY(gingerbread, 0.0);
    group.add(gingerbread);

    const kitkat = buildKitKatStatue(this.materials);
    kitkat.position.set(+11.8, 0, -8.6);
    kitkat.rotation.y = -0.22;
    groundObjectToY(kitkat, 0.0);
    group.add(kitkat);

    // Centered Background Landmark (`x = +2.0m, z = -19.5m`): Full-Perimeter Supported Mass-Timber Pavilion (`V3D-W3-03`)!
    const timberPav = new THREE.Group();
    timberPav.position.set(+2.0, 0, -19.5);
    timberPav.rotation.y = -0.06;

    const pavGlass = new THREE.Mesh(
      new THREE.BoxGeometry(24.0, 5.4, 9.0),
      this.materials.curtainGlass
    );
    pavGlass.position.set(0, 2.7, -0.4);
    timberPav.add(pavGlass);

    const timberGeoms = [];
    const roofG = new THREE.BoxGeometry(28.0, 0.36, 13.5);
    roofG.translate(0, 5.52, 0);
    timberGeoms.push(roofG);

    // Front (`z = +5.0`) and Rear (`z = -5.8`) glulam colonnades + header beams + full-depth rafters
    for (const beamZ of [+5.0, -5.8]) {
      const hdr = new THREE.BoxGeometry(25.5, 0.26, 0.26);
      hdr.translate(0, 5.24, beamZ);
      timberGeoms.push(hdr);
    }

    for (let c = -5; c <= 5; c++) {
      const cx = c * 2.5;
      for (const cz of [+5.0, -5.8]) {
        const colG = new THREE.BoxGeometry(0.25, 5.42, 0.25);
        colG.translate(cx, 2.71, cz);
        timberGeoms.push(colG);
      }
      const rafterG = new THREE.BoxGeometry(0.16, 0.28, 13.8);
      rafterG.translate(cx, 5.24, 0);
      timberGeoms.push(rafterG);
    }
    // Side flank glulam columns (`x = ±12.5m, z = -0.4m`) so outer eaves have zero cantilevered illusion
    for (const sx of [-12.5, +12.5]) {
      const sideCol = new THREE.BoxGeometry(0.25, 5.42, 0.25);
      sideCol.translate(sx, 2.71, -0.4);
      timberGeoms.push(sideCol);
    }

    const timberMesh = new THREE.Mesh(
      mergeStaticGeometries(timberGeoms),
      this.materials.cedarTimber
    );
    timberMesh.castShadow = true;
    timberMesh.receiveShadow = true;
    timberPav.add(timberMesh);

    groundObjectToY(timberPav, 0.0);
    group.add(timberPav);

    // Framing deciduous trees kept well clear of foreground statue & pavilion sightlines!
    for (const [tx, tz, th] of [
      [-21.5, -16.5, 8.0],
      [+17.5, -14.5, 7.6],
      [+26.5, -14.0, 8.0],
    ]) {
      const tree = createDeciduousTree(this.materials, rng, th, false);
      tree.position.set(tx, 0, tz);
      groundObjectToY(tree, 0.0);
      group.add(tree);
      this.swayingCrowns.push(tree);
    }

    compactRigidGroupMeshes(
      group,
      new Set([...this.swayingCrowns, donut, this.bugdroidSlotGroup, ...this.dappledGoboMeshes])
    );

    return {
      id: "clip3",
      group,
      curve,
      curveLength: curve.getLength(),
      plankPitchM: 0.35,
      lighting: {
        sunDir: new THREE.Vector3(0.38, 0.80, 0.46).normalize(),
        sunColor: new THREE.Color("#fff9eb"),
        sunIntensity: 2.38,
        hemiSky: new THREE.Color("#cde6ff"),
        hemiGround: new THREE.Color("#6e8c58"),
        skyZenith: new THREE.Color("#5f9be0"),
        skyHorizon: new THREE.Color("#e5f0fc"),
        skyGlow: new THREE.Color("#fff7e2"),
        sunsetMix: 0.05,
        mtnColor: new THREE.Color("#8da6c0"),
      },
      cameraOffset: { right: 3.12, forward: 0.82, up: 0.70, lookUp: 0.73, fov: 45 },
    };
  }

  /**
   * CLIP 4: Smooth Rounded Gradient Canopy Diagrid Shell, Organic Lavender/Agave Planters & Grounded 5-Bike GBike Corral
   */
  _buildClip4GradientCanopy() {
    const rng = createSeededRNG(0xc1190004);
    const group = new THREE.Group();
    group.name = "Clip4_GradientCanopy";

    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-3.2, 0, +0.30),
      new THREE.Vector3(+6.8, 0, -0.08),
      new THREE.Vector3(+16.8, 0, -0.32),
      new THREE.Vector3(+26.8, 0, +0.18),
      new THREE.Vector3(+36.8, 0, +0.35),
    ]);
    const laneCurve4 = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-23.2, 0, +0.52),
      new THREE.Vector3(-13.2, 0, +0.42),
      new THREE.Vector3(-3.2, 0, +0.30),
      new THREE.Vector3(+6.8, 0, -0.08),
      new THREE.Vector3(+16.8, 0, -0.32),
      new THREE.Vector3(+26.8, 0, +0.18),
      new THREE.Vector3(+36.8, 0, +0.35),
      new THREE.Vector3(+46.8, 0, +0.42),
    ]);

    const plaza = new THREE.Mesh(
      new THREE.PlaneGeometry(180, 150).rotateX(-Math.PI / 2),
      this.materials.apronConcreteLambert
    );
    plaza.position.set(14, -0.02, 0);
    plaza.receiveShadow = true;
    group.add(plaza);

    // Crisp 4K PBR concrete cycling lane directly under hero tires (following `kin.js` `clip4` crown 1:1!)
    const clip4HeightFn = (pt) => getClipTerrainHeight("clip4", (pt.x + 3.2) / 40.0, pt.x);
    group.add(
      buildRibbonAlongCurve(
        laneCurve4,
        4.4,
        0.05,
        104,
        this.materials.concretePath,
        0.0,
        0.0,
        clip4HeightFn
      )
    );

    // Centered Hero Landmark (`x = +1.8m, z = -26.5m`): Full Scalloped BIG/Heatherwick Gradient Canopy Crown Below Top HUD!
    const gradientCanopy = buildGradientCanopyBuilding(this.materials);
    gradientCanopy.position.set(+1.8, 0, -26.5);
    groundObjectToY(gradientCanopy, 0.0, 0.02);
    group.add(gradientCanopy);

    const eastCanopy = buildGradientCanopyBuilding(this.materials);
    eastCanopy.scale.set(0.76, 0.84, 0.78);
    eastCanopy.position.set(+41.5, 0, -28.0);
    groundObjectToY(eastCanopy, 0.0, 0.02);
    group.add(eastCanopy);

    // Tiered Warm Cedar-Timber Planters merged by material (`~350` draw calls -> `5` draw calls!)
    const stemGeom = new THREE.CylinderGeometry(0.008, 0.012, 0.34, 6);
    const floretGeom = new THREE.SphereGeometry(0.036, 8, 6);
    const cedarGeoms = [];
    const soilGeoms = [];
    const agaveGeoms = [];
    const bloomGeoms = [];
    const moundWillowGeoms = [];
    const moundGoldenGeoms = [];

    const planterPositions = [
      { x: -6.4, z: -5.6, w: 4.4, d: 2.2 },
      { x: -2.2, z: -8.2, w: 4.0, d: 2.0 },
      { x: +9.6, z: -7.8, w: 4.2, d: 2.1 },
    ];
    for (const pp of planterPositions) {
      const pGrp = new THREE.Group();
      pGrp.position.set(pp.x, 0, pp.z);
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(pp.w, 0.56, pp.d),
        this.materials.cedarTimber
      );
      box.position.y = 0.28;
      pGrp.add(box);

      const soil = new THREE.Mesh(
        new THREE.BoxGeometry(pp.w - 0.24, 0.06, pp.d - 0.24),
        this.materials.mulchSoil
      );
      soil.position.y = 0.56;
      pGrp.add(soil);

      for (const ax of [-pp.w * 0.28, +pp.w * 0.28]) {
        const agave = new THREE.Group();
        agave.position.set(ax, 0.58, 0);
        for (let b = 0; b < 14; b++) {
          const ang = (b / 14) * Math.PI * 2;
          const inner = b % 2 === 0;
          const blade = new THREE.Mesh(
            new THREE.ConeGeometry(0.11, inner ? 0.70 : 0.58, 7),
            this.materials.agaveBlueGreen
          );
          blade.position.set(Math.cos(ang) * 0.14, 0.24, Math.sin(ang) * 0.14);
          blade.rotation.z = -Math.cos(ang) * (inner ? 0.40 : 0.76);
          blade.rotation.x = Math.sin(ang) * (inner ? 0.40 : 0.76);
          agave.add(blade);
        }
        pGrp.add(agave);
      }

      for (let bush = -1; bush <= 1; bush++) {
        const bushGrp = new THREE.Group();
        bushGrp.position.set(bush * 0.34, 0.58, (bush % 2) * 0.18 - 0.06);

        const foliageMound = createOrnamentalShrub(this.materials, rng, 0.24);
        foliageMound.scale.set(1.15, 0.68, 1.15);
        bushGrp.add(foliageMound);

        for (let sp = 0; sp < 7; sp++) {
          const sAng = (sp / 7) * Math.PI * 2 + rng() * 0.4;
          const sTilt = 0.18 + rng() * 0.26;
          const sprig = new THREE.Group();
          sprig.rotation.set(Math.sin(sAng) * sTilt, 0, -Math.cos(sAng) * sTilt);

          const stem = new THREE.Mesh(stemGeom, this.materials.agaveBlueGreen);
          stem.position.y = 0.17;
          sprig.add(stem);

          for (let fl = 0; fl < 3; fl++) {
            const floret = new THREE.Mesh(floretGeom, this.materials.lavenderBloom);
            floret.scale.set(0.85, 1.35 - fl * 0.18, 0.85);
            floret.position.y = 0.24 + fl * 0.065;
            sprig.add(floret);
          }
          bushGrp.add(sprig);
        }
        pGrp.add(bushGrp);
      }

      groundObjectToY(pGrp, 0.0);
      pGrp.updateMatrixWorld(true);
      pGrp.traverse((c) => {
        if (!c.isMesh) return;
        const gc = c.geometry.clone();
        gc.applyMatrix4(c.matrixWorld);
        if (c.material === this.materials.cedarTimber) cedarGeoms.push(gc);
        else if (c.material === this.materials.mulchSoil) soilGeoms.push(gc);
        else if (c.material === this.materials.agaveBlueGreen) agaveGeoms.push(gc);
        else if (c.material === this.materials.lavenderBloom) bloomGeoms.push(gc);
        else if (c.material === this.materials.foliageGolden) moundGoldenGeoms.push(gc);
        else if (c.material === this.materials.foliageWillow) moundWillowGeoms.push(gc);
        if (c.geometry !== stemGeom && c.geometry !== floretGeom) {
          c.geometry.dispose();
        }
      });
    }
    stemGeom.dispose();
    floretGeom.dispose();

    const cedarBoxMesh = new THREE.Mesh(
      mergeStaticGeometries(cedarGeoms),
      this.materials.cedarTimber
    );
    cedarBoxMesh.castShadow = true;
    cedarBoxMesh.receiveShadow = true;
    group.add(cedarBoxMesh);
    group.add(new THREE.Mesh(mergeStaticGeometries(soilGeoms), this.materials.mulchSoil));
    const agaveMesh = new THREE.Mesh(
      mergeStaticGeometries(agaveGeoms),
      this.materials.agaveBlueGreen
    );
    agaveMesh.castShadow = true;
    group.add(agaveMesh);
    group.add(new THREE.Mesh(mergeStaticGeometries(bloomGeoms), this.materials.lavenderBloom));
    if (moundWillowGeoms.length > 0) {
      group.add(
        new THREE.Mesh(
          mergeStaticGeometries(moundWillowGeoms, true),
          this.materials.foliageWillow
        )
      );
    }
    if (moundGoldenGeoms.length > 0) {
      group.add(
        new THREE.Mesh(
          mergeStaticGeometries(moundGoldenGeoms, true),
          this.materials.foliageGolden
        )
      );
    }

    // Center-Right Midground (`x = -0.6m .. +4.0m, z = -4.5m`): Sunny Fully-Connected 5-Bike GBike Corral (`V3D-W3-02`)!
    const buildBikeCorral = (baseX, baseZ, count) => {
      const corralGroup = new THREE.Group();
      corralGroup.name = "CampusBikeCorral";
      corralGroup.position.set(baseX, 0, baseZ);
      const matBuckets = new Map();
      const pushGeom = (mat, geom) => {
        if (!matBuckets.has(mat)) matBuckets.set(mat, []);
        matBuckets.get(mat).push(geom);
      };
      let maxBikeGroundErrMm = 0;

      for (let b = 0; b < count; b++) {
        const slotX = b * 1.12;
        const rackCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(slotX - 0.44, 0.0, 0.45),
          new THREE.Vector3(slotX - 0.44, 0.25, 0.45),
          new THREE.Vector3(slotX - 0.44, 0.78, 0.45),
          new THREE.Vector3(slotX - 0.44, 0.86, 0.0),
          new THREE.Vector3(slotX - 0.44, 0.78, -0.45),
          new THREE.Vector3(slotX - 0.44, 0.25, -0.45),
          new THREE.Vector3(slotX - 0.44, 0.0, -0.45),
        ]);
        pushGeom(
          this.materials.gbikeChrome,
          new THREE.TubeGeometry(rackCurve, 20, 0.024, 10, false)
        );

        const parkedBike = createParkedGBikeMesh(this.materials);
        parkedBike.position.set(slotX, 0, 0);
        parkedBike.rotation.y = 0.52 + (rng() - 0.5) * 0.08;
        parkedBike.rotation.z = 0.04;
        // Ground EVERY individual rotated/leaned corral bike directly to `y = 0.0m`!
        groundObjectToY(parkedBike, 0.0, 0.002);
        parkedBike.updateMatrixWorld(true);
        const bikeBox = new THREE.Box3().setFromObject(parkedBike);
        maxBikeGroundErrMm = Math.max(maxBikeGroundErrMm, Math.abs(bikeBox.min.y) * 1000);

        parkedBike.traverse((ch) => {
          if (ch.isMesh) {
            const gClone = ch.geometry.clone();
            gClone.applyMatrix4(ch.matrixWorld);
            pushGeom(ch.material, gClone);
            ch.geometry.dispose();
          }
        });
      }

      for (const [mat, geoms] of matBuckets.entries()) {
        const mergedMesh = new THREE.Mesh(mergeStaticGeometries(geoms), mat);
        if (mat !== this.materials.contactShadow) {
          mergedMesh.castShadow = true;
          mergedMesh.receiveShadow = true;
        }
        corralGroup.add(mergedMesh);
      }

      corralGroup.userData = {
        isBikeCorral: true,
        bikeCount: count,
        maxBikeGroundErrMm,
      };
      group.add(corralGroup);
    };

    buildBikeCorral(-0.6, -4.5, 5);
    buildBikeCorral(+15.0, -4.6, 3);

    // Framing trees placed cleanly outside central Gradient Canopy dome sightline!
    for (const [tx, tz, th] of [
      [-22.5, -15.5, 6.8],
      [+19.5, -13.5, 6.6],
      [+26.5, -11.5, 7.2],
    ]) {
      const tree = createDeciduousTree(this.materials, rng, th, false);
      tree.position.set(tx, 0, tz);
      groundObjectToY(tree, 0.0);
      group.add(tree);
      this.swayingCrowns.push(tree);
    }

    return {
      id: "clip4",
      group,
      curve,
      curveLength: curve.getLength(),
      plankPitchM: 0.35,
      lighting: {
        sunDir: new THREE.Vector3(0.46, 0.72, 0.52).normalize(),
        sunColor: new THREE.Color("#fff4d8"),
        sunIntensity: 2.40,
        hemiSky: new THREE.Color("#d4e7fc"),
        hemiGround: new THREE.Color("#9e907e"),
        skyZenith: new THREE.Color("#6ca2dc"),
        skyHorizon: new THREE.Color("#f0f4f8"),
        skyGlow: new THREE.Color("#fff2cf"),
        sunsetMix: 0.14,
        mtnColor: new THREE.Color("#96abc2"),
      },
      cameraOffset: { right: 3.16, forward: 0.84, up: 0.70, lookUp: 0.74, fov: 45 },
    };
  }

  /**
   * CLIP 5: Baluster-Welded Wooden-Plank Truss Bridge, Narrowed Tidal Creek Channel,
   * Dry Grassy Amphitheatre Berm & Grounded Twin White Shoreline Peaks at Sunset (`V3D-W3-04`)!
   */
  _buildClip5ShorelineSunset() {
    const rng = createSeededRNG(0xc1190005);
    const group = new THREE.Group();
    group.name = "Clip5_ShorelineSunset";

    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-3.2, 0, +0.18),
      new THREE.Vector3(+6.8, 0, +0.34),
      new THREE.Vector3(+16.8, 0, +0.08),
      new THREE.Vector3(+26.8, 0, -0.35),
      new THREE.Vector3(+36.8, 0, -0.78),
    ]);
    const curveLen = curve.getLength();
    const plankPitchM = CLIP5_PLANK_PITCH_M;

    // Continuous full-span bridge curve (`x = -25.2m .. +44.8m`) passing through every waypoint of `curve`
    // so the wooden bridge deck, planks, curbs, balusters & overhead Corten truss span edge-to-edge at t = 0.0s!
    const bridgeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-25.2, 0, +0.00),
      new THREE.Vector3(-14.2, 0, +0.09),
      new THREE.Vector3(-3.2, 0, +0.18),
      new THREE.Vector3(+6.8, 0, +0.34),
      new THREE.Vector3(+16.8, 0, +0.08),
      new THREE.Vector3(+26.8, 0, -0.35),
      new THREE.Vector3(+36.8, 0, -0.78),
      new THREE.Vector3(+44.8, 0, -1.04),
    ]);
    const bridgeLen = bridgeCurve.getLength();
    const bridgePlankCount = Math.max(180, Math.round(bridgeLen / plankPitchM) + 1);

    // Golden-Hour Stevens Creek Marshlands (`Lambert` fill-rate optimized!)
    const marshGround = new THREE.Mesh(
      new THREE.PlaneGeometry(190, 160).rotateX(-Math.PI / 2),
      this.materials.apronMulchLambert
    );
    marshGround.position.set(14, -0.56, -10);
    group.add(marshGround);

    // Shimmering Golden-Hour Sunset Creek Channel (`z in [-18.3, -1.9]`, `y = -0.34m`) unmistakably visible beyond the `-1.52m` North Corten railing!
    const creekWaterMat = createWaterPondMaterial(true);
    this.waterMaterials.push(creekWaterMat);
    const creekChannel = new THREE.Mesh(
      new THREE.PlaneGeometry(176, 16.4).rotateX(-Math.PI / 2),
      creekWaterMat
    );
    creekChannel.rotation.y = 0.02;
    creekChannel.position.set(+14.0, -0.34, -10.1);
    group.add(creekChannel);

    // Sculpted Golden Meadow Amphitheatre Berm (`z in [-56.0, -18.2]`, flat plateau `y = -0.38m` across `[-47.5, -19.8]`)
    // Seats Shoreline's twin peaks, 16 corner pylons & 16 concrete guy-wire blocks 100% on dry golden grassland!
    const bermSegX = 40;
    const bermRowsZ = [
      [-18.2, -0.58],
      [-19.8, -0.38],
      [-32.0, -0.38],
      [-47.5, -0.38],
      [-56.0, -1.35],
    ];
    const bermPos = [];
    const bermUv = [];
    const bermInd = [];
    const rCount = bermRowsZ.length;
    for (let iz = 0; iz < rCount; iz++) {
      const [bz, byBase] = bermRowsZ[iz];
      for (let ix = 0; ix <= bermSegX; ix++) {
        const u = ix / bermSegX;
        const bx = -76.0 + u * 164.0;
        const edgeRoll = iz >= 1 && iz <= 3 ? Math.sin(u * Math.PI) * 0.04 : 0.0;
        bermPos.push(bx, byBase + edgeRoll, bz);
        bermUv.push(u * 18.0, iz * 3.0);
        if (iz < rCount - 1 && ix < bermSegX) {
          const a = iz * (bermSegX + 1) + ix;
          const b = a + 1;
          const c = (iz + 1) * (bermSegX + 1) + ix;
          const d = c + 1;
          bermInd.push(a, b, d, a, d, c);
        }
      }
    }
    const bermGeom = new THREE.BufferGeometry();
    bermGeom.setAttribute("position", new THREE.Float32BufferAttribute(bermPos, 3));
    bermGeom.setAttribute("uv", new THREE.Float32BufferAttribute(bermUv, 2));
    bermGeom.setIndex(bermInd);
    bermGeom.computeVertexNormals();
    const shorelineBerm = new THREE.Mesh(bermGeom, this.materials.coastalMeadowLambert);
    shorelineBerm.receiveShadow = true;
    group.add(shorelineBerm);

    // Warm Golden-Lit Sculpted Coastal Hills rising behind Shoreline Amphitheatre (`z = -52m`)!
    const hillSegs = 64;
    const hillPos = [];
    const hillInd = [];
    for (let i = 0; i <= hillSegs; i++) {
      const u = i / hillSegs;
      const hx = -78.0 + u * 168.0;
      const hPeak =
        5.8 +
        Math.sin(u * Math.PI * 3.2 + 0.4) * 3.2 +
        Math.cos(u * Math.PI * 6.5 - 0.8) * 1.4;
      const hz = -52.0 - Math.sin(u * Math.PI) * 6.0;
      hillPos.push(hx, -2.2, hz + 10.0, hx, hPeak, hz);
      if (i < hillSegs) {
        const b = i * 2;
        hillInd.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
      }
    }
    const hillGeom = new THREE.BufferGeometry();
    hillGeom.setAttribute("position", new THREE.Float32BufferAttribute(hillPos, 3));
    hillGeom.setIndex(hillInd);
    hillGeom.computeVertexNormals();
    const coastalHills = new THREE.Mesh(hillGeom, this.materials.coastalHillGold);
    group.add(coastalHills);

    // Authentic Backlit Golden `Typha` Cattails & Arching Marsh Reeds lining the north & south creek banks (`598 -> 2` draw calls!)
    const reedStemGeom = new THREE.CylinderGeometry(0.014, 0.022, 1.55, 6);
    const cattailHeadGeom = new THREE.CapsuleGeometry(0.036, 0.24, 6, 8);
    const reedLeafGeom = new THREE.BoxGeometry(0.038, 1.25, 0.008);
    const reedGoldGeoms = [];
    const spikeBrownGeoms = [];

    for (let r = 0; r < 46; r++) {
      const northBank = r % 2 === 0;
      const rx = -22.0 + (r / 45) * 66.0 + (rng() - 0.5) * 1.4;
      const zReed = northBank
        ? -17.8 + rng() * 0.65
        : -4.8 - rng() * 0.95;

      const clump = new THREE.Group();
      clump.position.set(rx, -0.46, zReed);

      for (let k = 0; k < 5; k++) {
        const stalkGrp = new THREE.Group();
        stalkGrp.position.set((rng() - 0.5) * 0.55, 0, (rng() - 0.5) * 0.45);
        stalkGrp.rotation.set((rng() - 0.5) * 0.18, rng() * Math.PI, (rng() - 0.5) * 0.18);

        const stem = new THREE.Mesh(reedStemGeom, this.materials.marshReedGold);
        stem.position.y = 0.76;
        stalkGrp.add(stem);

        if (k < 3) {
          const spike = new THREE.Mesh(cattailHeadGeom, this.materials.cattailVelvetBrown);
          spike.position.y = 1.28;
          stalkGrp.add(spike);
        }

        const blade = new THREE.Mesh(reedLeafGeom, this.materials.marshReedGold);
        blade.position.set(0.05, 0.58, 0);
        blade.rotation.z = -0.24 - rng() * 0.20;
        stalkGrp.add(blade);

        clump.add(stalkGrp);
      }
      clump.updateMatrixWorld(true);
      clump.traverse((c) => {
        if (!c.isMesh) return;
        const gc = c.geometry.clone();
        gc.applyMatrix4(c.matrixWorld);
        if (c.material === this.materials.cattailVelvetBrown) spikeBrownGeoms.push(gc);
        else reedGoldGeoms.push(gc);
      });
    }
    reedStemGeom.dispose();
    cattailHeadGeom.dispose();
    reedLeafGeom.dispose();

    group.add(
      new THREE.Mesh(mergeStaticGeometries(reedGoldGeoms), this.materials.marshReedGold),
      new THREE.Mesh(mergeStaticGeometries(spikeBrownGeoms), this.materials.cattailVelvetBrown)
    );

    // Parabolic Cambered Weathered-Timber & Corten-Steel Warren Truss Footbridge (`+0.92m` mid-span arch matching `kin.js` 1:1)!
    // Eastbound bike rides `1.52m` inside the North (`-Z`) rail (`latNorth = -1.52m`, `latSouth = +3.72m`) so Sunset Creek shimmers right past the rail!
    const bridgeArchFn = (pt) => getClip5BridgeHeightAtX(pt.x);
    const latNorth = -1.52;
    const latSouth = +3.72;
    const deckWidth = latSouth - latNorth;
    const deckCenterLat = 0.5 * (latNorth + latSouth);
    const bridgeDeck = buildRibbonAlongCurve(
      bridgeCurve,
      deckWidth,
      0.16,
      136,
      this.materials.bridgePlanks,
      -0.012,
      deckCenterLat,
      bridgeArchFn
    );
    group.add(bridgeDeck);

    const plankGeom = new THREE.BoxGeometry(deckWidth - 0.12, 0.018, 0.25);
    const plankInst = new THREE.InstancedMesh(
      plankGeom,
      this.materials.bridgePlanks,
      bridgePlankCount
    );
    plankInst.receiveShadow = true;
    const plankEuler = new THREE.Euler(0, 0, 0, "YXZ");
    const plankRight = new THREE.Vector3();
    for (let i = 0; i < bridgePlankCount; i++) {
      const u = i / (bridgePlankCount - 1);
      bridgeCurve.getPointAt(u, _vA);
      bridgeCurve.getTangentAt(u, _vB);
      plankRight.crossVectors(_vB, _up).normalize();
      const yaw = Math.atan2(-_vB.x, -_vB.z);
      const yHere = getClip5BridgeHeightAtX(_vA.x);
      const yAhead = getClip5BridgeHeightAtX(_vA.x + _vB.x * 0.25);
      const yBehind = getClip5BridgeHeightAtX(_vA.x - _vB.x * 0.25);
      const localPitch = Math.atan2(yAhead - yBehind, 0.50);
      plankEuler.set(localPitch, yaw, 0, "YXZ");
      _quat.setFromEuler(plankEuler);
      _vA.addScaledVector(plankRight, deckCenterLat);
      // Top surface of `0.018m`-thick plank (`-0.009 + 0.009`) equals exact `yHere + 0.000m` (`0.0mm` tire tangency error!)
      _vA.y = yHere - 0.009;
      _mat4.compose(_vA, _quat, _scale);
      plankInst.setMatrixAt(i, _mat4);
    }
    plankInst.instanceMatrix.needsUpdate = true;
    group.add(plankInst);

    // Authentic Cambered Corten-Steel & Timber Warren Truss Bridge (`7` bays + sub-deck & portal `/\/\` Warren triangulation)
    // Preserves 100% open eye-level sightline to Sunset Creek, backlit cattails & Shoreline Amphitheatre's twin white peaks!
    const trussHeight = 3.35;
    const underDeckDepth = 0.82;
    const bayCount = 7;
    const balustersPerBay = 7;
    const cortenGeoms = [];
    const railingGeoms = [];
    const brMat = new THREE.Matrix4();
    const brQuat = new THREE.Quaternion();
    const brPos = new THREE.Vector3();

    const addChordTube = (targetArr, p0, p1, w, d = w) => {
      const vec = new THREE.Vector3().subVectors(p1, p0);
      const len = vec.length();
      if (len < 1e-3) return;
      const g = new THREE.BoxGeometry(w, len, d);
      brPos.addVectors(p0, p1).multiplyScalar(0.5);
      brQuat.setFromUnitVectors(_up, vec.normalize());
      brMat.compose(brPos, brQuat, _scale);
      g.applyMatrix4(brMat);
      targetArr.push(g);
    };

    for (const sideSign of [-1, 1]) {
      const lat = sideSign < 0 ? latNorth : latSouth;
      const railLat = lat - sideSign * 0.12;

      const lowCurbRibbon = buildRibbonAlongCurve(
        bridgeCurve,
        0.22,
        0.22,
        96,
        this.materials.cortenTruss,
        0.14,
        lat,
        bridgeArchFn
      );
      const bottomSubChordRibbon = buildRibbonAlongCurve(
        bridgeCurve,
        0.22,
        0.18,
        96,
        this.materials.cortenTruss,
        -underDeckDepth,
        lat,
        (pt) => getClip5BridgeHeightAtX(pt.x) * 0.35
      );
      const topChordRibbon = buildRibbonAlongCurve(
        bridgeCurve,
        0.21,
        0.21,
        96,
        this.materials.cortenTruss,
        trussHeight,
        lat,
        bridgeArchFn
      );
      const upperFriezeChord = buildRibbonAlongCurve(
        bridgeCurve,
        0.13,
        0.13,
        96,
        this.materials.cortenTruss,
        trussHeight - 0.78,
        lat,
        bridgeArchFn
      );
      cortenGeoms.push(
        lowCurbRibbon.geometry,
        bottomSubChordRibbon.geometry,
        topChordRibbon.geometry,
        upperFriezeChord.geometry
      );

      const hiRailRibbon = buildRibbonAlongCurve(
        bridgeCurve,
        0.068,
        0.068,
        96,
        this.materials.bridgeRailing,
        0.85,
        railLat,
        bridgeArchFn
      );
      const midRailRibbon = buildRibbonAlongCurve(
        bridgeCurve,
        0.044,
        0.044,
        96,
        this.materials.bridgeRailing,
        0.47,
        railLat,
        bridgeArchFn
      );
      railingGeoms.push(hiRailRibbon.geometry, midRailRibbon.geometry);

      for (let b = 0; b <= bayCount; b++) {
        const u0 = b / bayCount;
        bridgeCurve.getPointAt(u0, _vA);
        bridgeCurve.getTangentAt(u0, _vB);
        const yaw0 = Math.atan2(-_vB.x, -_vB.z);
        brQuat.setFromAxisAngle(_up, yaw0);

        const deckY0 = getClip5BridgeHeightAtX(_vA.x);
        const subY0 = -underDeckDepth + deckY0 * 0.35;

        const right = new THREE.Vector3().crossVectors(_vB, _up).normalize();
        const basePos = _vA.clone().addScaledVector(right, lat);

        // Main vertical Corten truss column spanning from lower Warren chord (`subY0`) up to overhead chord (`deckY0 + trussHeight`)
        const fullPostH = deckY0 + trussHeight - subY0;
        const vPostG = new THREE.BoxGeometry(0.15, fullPostH, 0.15);
        brPos.set(basePos.x, subY0 + fullPostH * 0.5, basePos.z);
        brMat.compose(brPos, brQuat, _scale);
        vPostG.applyMatrix4(brMat);
        cortenGeoms.push(vPostG);

        // Bolted Corten Gusset Plates at deck & overhead truss joints!
        for (const gy of [deckY0 + 0.14, deckY0 + trussHeight - 0.12, subY0 + 0.08]) {
          const gussetG = new THREE.BoxGeometry(0.045, 0.34, 0.42);
          brPos.set(basePos.x, gy, basePos.z);
          brMat.compose(brPos, brQuat, _scale);
          gussetG.applyMatrix4(brMat);
          cortenGeoms.push(gussetG);
        }

        // Welded steel mounting brackets tying both horizontal rails (`railLat`) directly into each main Corten post (`lat`)!
        const midLat = (lat + railLat) * 0.5;
        const bracketPt = _vA.clone().addScaledVector(right, midLat);
        for (const ry of [0.47, 0.85]) {
          const brkG = new THREE.BoxGeometry(0.18, 0.052, 0.052);
          brPos.set(bracketPt.x, deckY0 + ry, bracketPt.z);
          brMat.compose(brPos, brQuat, _scale);
          brkG.applyMatrix4(brMat);
          railingGeoms.push(brkG);
        }

        if (b < bayCount) {
          // 6 intermediate vertical balusters + alternating Warren guardrail diagonals (`/\`) per 10m bay!
          for (let sub = 1; sub < balustersPerBay; sub++) {
            const uSub = (b + sub / balustersPerBay) / bayCount;
            const ptSub = bridgeCurve.getPointAt(uSub);
            const tanSub = bridgeCurve.getTangentAt(uSub);
            const yawSub = Math.atan2(-tanSub.x, -tanSub.z);
            brQuat.setFromAxisAngle(_up, yawSub);
            const rSub = new THREE.Vector3().crossVectors(tanSub, _up).normalize();
            const deckYSub = getClip5BridgeHeightAtX(ptSub.x);

            const balPos = ptSub.clone().addScaledVector(rSub, railLat);
            const balG = new THREE.BoxGeometry(0.036, 0.76, 0.036);
            brPos.set(balPos.x, deckYSub + 0.47, balPos.z);
            brMat.compose(brPos, brQuat, _scale);
            balG.applyMatrix4(brMat);
            railingGeoms.push(balG);

            const shoePos = ptSub.clone().addScaledVector(rSub, midLat);
            const shoeG = new THREE.BoxGeometry(0.17, 0.058, 0.058);
            brPos.set(shoePos.x, deckYSub + 0.14, shoePos.z);
            brMat.compose(brPos, brQuat, _scale);
            shoeG.applyMatrix4(brMat);
            railingGeoms.push(shoeG);
          }

          // Alternating `/\/\/\` Warren Truss Web Chords (both Under-Deck Arch Web AND Overhead Portal Frieze Web!)
          const warrenPanels = 4;
          for (let wp = 0; wp < warrenPanels; wp++) {
            const uA = (b + wp / warrenPanels) / bayCount;
            const uB = (b + (wp + 0.5) / warrenPanels) / bayCount;
            const uC = (b + (wp + 1.0) / warrenPanels) / bayCount;

            const ptA = bridgeCurve.getPointAt(uA);
            const ptB = bridgeCurve.getPointAt(uB);
            const ptC = bridgeCurve.getPointAt(uC);

            const rA = new THREE.Vector3().crossVectors(bridgeCurve.getTangentAt(uA), _up).normalize();
            const rB = new THREE.Vector3().crossVectors(bridgeCurve.getTangentAt(uB), _up).normalize();
            const rC = new THREE.Vector3().crossVectors(bridgeCurve.getTangentAt(uC), _up).normalize();

            const yDeckA = getClip5BridgeHeightAtX(ptA.x);
            const yDeckB = getClip5BridgeHeightAtX(ptB.x);
            const yDeckC = getClip5BridgeHeightAtX(ptC.x);

            const ySubA = -underDeckDepth + yDeckA * 0.35;
            const ySubB = -underDeckDepth + yDeckB * 0.35;
            const ySubC = -underDeckDepth + yDeckC * 0.35;

            const posA = ptA.addScaledVector(rA, lat);
            const posB = ptB.addScaledVector(rB, lat);
            const posC = ptC.addScaledVector(rC, lat);

            // 1. Structural Under-Deck Cambered Warren Truss (`/\` equilateral Corten diagonals over creek!)
            addChordTube(
              cortenGeoms,
              new THREE.Vector3(posA.x, ySubA, posA.z),
              new THREE.Vector3(posB.x, yDeckB + 0.08, posB.z),
              0.11
            );
            addChordTube(
              cortenGeoms,
              new THREE.Vector3(posB.x, yDeckB + 0.08, posB.z),
              new THREE.Vector3(posC.x, ySubC, posC.z),
              0.11
            );

            // 2. Overhead Portal Frieze Warren Truss (`/\` Corten diagonals inside `y = +2.57..+3.35m`!)
            addChordTube(
              cortenGeoms,
              new THREE.Vector3(posA.x, yDeckA + trussHeight - 0.78, posA.z),
              new THREE.Vector3(posB.x, yDeckB + trussHeight - 0.04, posB.z),
              0.088
            );
            addChordTube(
              cortenGeoms,
              new THREE.Vector3(posB.x, yDeckB + trussHeight - 0.04, posB.z),
              new THREE.Vector3(posC.x, yDeckC + trussHeight - 0.78, posC.z),
              0.088
            );

            // 3. Low-Profile Guardrail Warren Diagonals (`y = +0.16..+0.84m`, cleanly below sightline!)
            const gPosA = posA.clone().addScaledVector(rA, -sideSign * 0.12);
            const gPosB = posB.clone().addScaledVector(rB, -sideSign * 0.12);
            const gPosC = posC.clone().addScaledVector(rC, -sideSign * 0.12);
            addChordTube(
              cortenGeoms,
              new THREE.Vector3(gPosA.x, yDeckA + 0.16, gPosA.z),
              new THREE.Vector3(gPosB.x, yDeckB + 0.83, gPosB.z),
              0.038
            );
            addChordTube(
              cortenGeoms,
              new THREE.Vector3(gPosB.x, yDeckB + 0.83, gPosB.z),
              new THREE.Vector3(gPosC.x, yDeckC + 0.16, gPosC.z),
              0.038
            );
          }
        }
      }
    }

    const cortenMesh = new THREE.Mesh(
      mergeStaticGeometries(cortenGeoms),
      this.materials.cortenTruss
    );
    cortenMesh.castShadow = true;
    group.add(cortenMesh);

    const railingMesh = new THREE.Mesh(
      mergeStaticGeometries(railingGeoms),
      this.materials.bridgeRailing
    );
    railingMesh.castShadow = true;
    group.add(railingMesh);

    // Drifting Golden-Hour Atmospheric Dust Motes (`THREE.Points`, 100% deterministic seeded curl drift!)
    const moteCount = this.sunsetDustMaxCount;
    const motePos = new Float32Array(moteCount * 3);
    const moteBase = new Float32Array(moteCount * 3);
    const moteScale = new Float32Array(moteCount);
    const motePhase = new Float32Array(moteCount);
    for (let m = 0; m < moteCount; m++) {
      const mx = -4.0 + rng() * 44.0;
      const my = 0.35 + rng() * 2.95 + getClip5BridgeHeightAtX(mx) * 0.85;
      const mz = -3.4 + rng() * 6.8;
      motePos[m * 3] = mx;
      motePos[m * 3 + 1] = my;
      motePos[m * 3 + 2] = mz;
      moteBase[m * 3] = mx;
      moteBase[m * 3 + 1] = my;
      moteBase[m * 3 + 2] = mz;
      moteScale[m] = 0.65 + rng() * 1.15;
      motePhase[m] = rng();
    }
    const moteGeom = new THREE.BufferGeometry();
    moteGeom.setAttribute("position", new THREE.BufferAttribute(motePos, 3));
    moteGeom.setAttribute("aScale", new THREE.BufferAttribute(moteScale, 1));
    moteGeom.setAttribute("aPhase", new THREE.BufferAttribute(motePhase, 1));
    moteGeom.setDrawRange(0, moteCount);

    this.sunsetDustMat = createGoldenDustMotesMaterial();
    this.sunsetDustMotes = new THREE.Points(moteGeom, this.sunsetDustMat);
    this.sunsetDustMotes.frustumCulled = false;
    this.sunsetDustBasePos = moteBase;
    this.sunsetDustPhase = motePhase;
    group.add(this.sunsetDustMotes);

    // Centered Hero Background Landmark (`x = +2.2m, y = -0.38m, z = -31.5m`) seated flush on the `-0.38m` golden berm plateau!
    const shoreline = buildShorelineAmphitheatre(this.materials);
    shoreline.position.set(+2.2, -0.38, -31.5);
    shoreline.rotation.y = 0.08;
    group.add(shoreline);

    return {
      id: "clip5",
      group,
      curve,
      curveLength: curveLen,
      plankPitchM,
      lighting: {
        sunDir: new THREE.Vector3(-0.24, 0.32, -0.91).normalize(),
        sunColor: new THREE.Color("#ffbc75"),
        sunIntensity: 2.58,
        hemiSky: new THREE.Color("#ffd8b0"),
        hemiGround: new THREE.Color("#8c664e"),
        skyZenith: new THREE.Color("#4e64a6"),
        skyHorizon: new THREE.Color("#ff9b54"),
        skyGlow: new THREE.Color("#ffe394"),
        sunsetMix: 0.95,
        mtnColor: new THREE.Color("#9e7a78"),
      },
      // Camera rides inside `latSouth = +3.72m` (`right = 3.02m`) with elevated golden-hour sightline over `latNorth = -1.52m` into Sunset Creek!
      cameraOffset: { right: 3.02, forward: 0.86, up: 0.94, lookUp: 0.72, fov: 45 },
    };
  }

  /**
   * Switches active campus clip (O(1) visibility swap) and updates sky/mountain shaders.
   */
  setActiveClip(clipIndex, sunLight, hemiLight) {
    const clampedIdx = THREE.MathUtils.clamp(clipIndex, 0, this.clips.length - 1);
    for (let i = 0; i < this.clips.length; i++) {
      this.clips[i].group.visible = i === clampedIdx;
    }

    const active = this.clips[clampedIdx];
    const L = active.lighting;

    this.skyMat.uniforms.uZenithColor.value.copy(L.skyZenith);
    this.skyMat.uniforms.uHorizonColor.value.copy(L.skyHorizon);
    this.skyMat.uniforms.uGlowColor.value.copy(L.skyGlow);
    this.skyMat.uniforms.uSunDir.value.copy(L.sunDir);
    this.skyMat.uniforms.uSunsetMix.value = L.sunsetMix;
    this.mountainMat.color.copy(L.mtnColor);

    if (sunLight) {
      sunLight.color.copy(L.sunColor);
      sunLight.intensity = L.sunIntensity;
    }
    if (hemiLight) {
      hemiLight.color.copy(L.hemiSky);
      hemiLight.groundColor.copy(L.hemiGround);
    }

    return active;
  }

  _syncFlamingoInstancedMatrices(simTime) {
    if (!this.flamDynamicMeshes) return;
    const { peckPinkInst, peckBeakInst, idlePinkInst, idleBeakInst } = this.flamDynamicMeshes;
    const eul = new THREE.Euler(0, 0, 0, "YXZ");

    for (let i = 0; i < this.flamingoActors.length; i++) {
      const fl = this.flamingoActors[i];
      if (fl.isPecking) {
        eul.set(0.14 * Math.sin(simTime * 3.4 + fl.phase), fl.yaw, 0);
      } else {
        eul.set(0, fl.yaw, 0.05 * Math.sin(simTime * 1.9 + fl.phase));
      }
      _quat.setFromEuler(eul);
      _vA.set(fl.x, fl.y, fl.z);
      _mat4.compose(_vA, _quat, _scale);
      if (fl.isPecking) {
        peckPinkInst.setMatrixAt(fl.instIdx, _mat4);
        peckBeakInst.setMatrixAt(fl.instIdx, _mat4);
      } else {
        idlePinkInst.setMatrixAt(fl.instIdx, _mat4);
        idleBeakInst.setMatrixAt(fl.instIdx, _mat4);
      }
    }
    peckPinkInst.instanceMatrix.needsUpdate = true;
    peckBeakInst.instanceMatrix.needsUpdate = true;
    idlePinkInst.instanceMatrix.needsUpdate = true;
    idleBeakInst.instanceMatrix.needsUpdate = true;
  }

  /**
   * Animates living-world environmental physics (water glints, wind wave across trees, instanced pecking flamingos).
   */
  updateLivingWorld(simTime, heroPos) {
    if (heroPos) {
      this.skyDome.position.set(heroPos.x, 0, heroPos.z);
      this.mountainRing.position.set(heroPos.x, 0, heroPos.z);
    }

    for (const wm of this.waterMaterials) {
      wm.uniforms.uTime.value = simTime;
    }

    for (const tree of this.swayingCrowns) {
      const crown = tree.userData.swayCrown;
      if (!crown) continue;
      const wave =
        Math.sin(
          tree.position.x * 0.09 +
            tree.position.z * 0.06 -
            simTime * 2.1 +
            tree.userData.swayPhase
        ) * 0.028;
      crown.rotation.z = wave;
      crown.rotation.x = wave * 0.62;
    }

    // Subtle coherent wind sway on dappled leaf-canopy shadow gobos (`Clips 2 & 3`)
    for (let i = 0; i < this.dappledGoboMeshes.length; i++) {
      const gm = this.dappledGoboMeshes[i];
      gm.position.x = (gm.userData.baseX || 0) + Math.sin(simTime * 1.85 + i * 1.3) * 0.09;
      gm.position.z = Math.cos(simTime * 1.45 + i * 0.9) * 0.06;
    }

    if (this.clips[1].group.visible) {
      this._syncFlamingoInstancedMatrices(simTime);
    }

    // Deterministic curl-like golden-hour dust mote drift over Clip 5's arched bridge!
    if (this.clips[4].group.visible && this.sunsetDustMotes && this.sunsetDustBasePos) {
      this.sunsetDustMat.uniforms.uTime.value = simTime;
      const posAttr = this.sunsetDustMotes.geometry.attributes.position;
      const arr = posAttr.array;
      const base = this.sunsetDustBasePos;
      const ph = this.sunsetDustPhase;
      const count = posAttr.count;
      for (let i = 0; i < count; i++) {
        const p = ph[i] * 6.28318;
        const bx = base[i * 3];
        const by = base[i * 3 + 1];
        const bz = base[i * 3 + 2];
        arr[i * 3] = bx + Math.sin(simTime * 0.42 + p + by * 0.7) * 0.55;
        arr[i * 3 + 1] = by + Math.sin(simTime * 0.68 + p * 1.3 + bx * 0.15) * 0.22;
        arr[i * 3 + 2] = bz + Math.cos(simTime * 0.36 + p * 0.9 + bx * 0.22) * 0.42;
      }
      posAttr.needsUpdate = true;
    }
  }

  /**
   * Scales environmental particle density & water foam detail across Adaptive GPU Quality Tiers (`high` | `medium` | `low`).
   */
  setQualityTier(tier = "high", pixelRatio = 1.5) {
    if (this.sunsetDustMotes) {
      const maxC = this.sunsetDustMaxCount;
      const drawCount =
        tier === "low"
          ? Math.floor(maxC * 0.28)
          : tier === "medium"
            ? Math.floor(maxC * 0.60)
            : maxC;
      this.sunsetDustMotes.geometry.setDrawRange(0, drawCount);
    }
    if (this.sunsetDustMat) {
      this.sunsetDustMat.uniforms.uPixelRatio.value = pixelRatio;
    }
  }

  /**
   * Attaches Cycles-sculpted `stan_trex` (Clip 2) and `android_bugdroid` (Clip 3) GLBs grounded flush on their plinths.
   */
  attachLandmarkGlbs({ stanGlbScene = null, bugdroidGlbScene = null } = {}) {
    const prepLandmark = (srcScene, minRoughness = 0.45) => {
      const clone = srcScene.clone(true);
      clone.position.set(0, 0, 0);
      clone.rotation.set(0, 0, 0);
      clone.scale.set(1, 1, 1);
      clone.traverse((ch) => {
        if (ch.isMesh) {
          ch.castShadow = true;
          ch.receiveShadow = true;
          if (ch.material && ch.material.roughness !== undefined) {
            ch.material.roughness = Math.max(ch.material.roughness, minRoughness);
          }
        }
      });
      clone.updateMatrixWorld(true);
      return clone;
    };

    if (stanGlbScene && this.stanSlotGroup) {
      const stanClone = prepLandmark(stanGlbScene, 0.46);
      const box = new THREE.Box3().setFromObject(stanClone);
      if (!box.isEmpty()) {
        const size = box.getSize(new THREE.Vector3());
        // `stan_trex.glb` snout/dentition points along `-Z`; `+PI/2` rotates `-Z` to `-X` (`x' = z*sin(+PI/2) = -4.27`),
        // matching procedural Stan's `-X` lunge facing the approaching rider & courtyard!
        if (size.z > size.x * 1.35) {
          stanClone.rotation.y = +Math.PI * 0.5;
          stanClone.updateMatrixWorld(true);
          box.setFromObject(stanClone);
          box.getSize(size);
        }
        const horizSpan = Math.max(size.x, size.z);
        if (horizSpan > 0.2) {
          const targetSpan = 6.6;
          const sc = THREE.MathUtils.clamp(targetSpan / horizSpan, 0.4, 2.5);
          stanClone.scale.multiplyScalar(sc);
          stanClone.updateMatrixWorld(true);
          box.setFromObject(stanClone);
        }
        // Seat `Stan_Skeleton` (`box.min.y = 0`) flush atop `Stan_Garden_Plinth` (`topY = 0.240m`, 0.000m gap, zero buried toes in mulch!)
        stanClone.position.set(0, 0.24 - box.min.y, 0);
        for (const fb of this.stanFallbackMeshes || []) {
          if (fb) fb.visible = false;
        }
        if (this.stanFallbackSkel) this.stanFallbackSkel.visible = false;
        this.stanSlotGroup.add(stanClone);
      }
    }

    if (bugdroidGlbScene && this.bugdroidSlotGroup) {
      const bugClone = prepLandmark(bugdroidGlbScene, 0.45);
      const box = new THREE.Box3().setFromObject(bugClone);
      if (!box.isEmpty()) {
        const size = box.getSize(new THREE.Vector3());
        if (size.y > 0.2) {
          const targetH = 2.45;
          const sc = THREE.MathUtils.clamp(targetH / size.y, 0.5, 2.0);
          bugClone.scale.multiplyScalar(sc);
          bugClone.updateMatrixWorld(true);
          box.setFromObject(bugClone);
        }
        // Keep Bugdroid's feet (`x = ±0.47m, z = ±0.18m`) centered at `(0,0)` on the circular `0.14m` concrete plinth (`minY = 0.138m`)!
        bugClone.position.set(0, 0.138 - box.min.y, 0);
        if (this.bugdroidFallback) this.bugdroidFallback.visible = false;
        this.bugdroidSlotGroup.add(bugClone);
      }
    }
  }
}
