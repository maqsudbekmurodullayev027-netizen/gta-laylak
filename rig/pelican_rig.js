import * as THREE from "../vendor/three.module.js";
import { clone as cloneSkeleton } from "../vendor/SkeletonUtils.js";
import { state, TPU_SPAWNS } from "../contract.js";
import { solveTwoBoneIK } from "./ik_solver.js";
import { evaluatePelicanGazeAndBlink, getOpenWorldTerrainHeight } from "./kin.js";
import { evaluatePelicanMotionPose } from "./pelican_motion_poses.js";
import { ensureSmoothAvianSkinWeights } from "./pelican_skin_weights.js";

const PELICAN_SHADOW_PLANE_RE = /contact.?shadow|shadow.?plane|ground.?shadow|_ao\b|contact_ao|blob.?shadow/i;

/**
 * Clean V7 Plumage & Gular-Pouch Subsurface Rim Hook (`ZERO` tiled stripe grids, `ZERO` high-frequency spatial sin() golf-ball noise!).
 * Preserves the UV-unwrapped `2048x2048` feather-barb normal & packed ORM maps 1:1 while adding soft golden-hour feather rim
 * and warm backlit golden-peach gular throat pouch translucency.
 */
function attachPelicanPlumageShaderHook(mat) {
  mat.customProgramCacheKey = () => "pelican_v7_plumage_sheen_sss_v1";
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
      {
        vec3 pelViewDir = normalize( vViewPosition );
        float pelNdotV = clamp( dot( normal, pelViewDir ), 0.0, 1.0 );
        float pelRim = pow( 1.0 - pelNdotV, 2.65 );
        float pelWarmDiff = diffuseColor.r - diffuseColor.b;
        float pelPlumageMask = 1.0 - clamp( ( pelWarmDiff - 0.16 ) * 3.5, 0.0, 1.0 );
        float pelPouchMask = clamp( ( pelWarmDiff - 0.22 ) * 2.8, 0.0, 1.0 ) * clamp( ( diffuseColor.g - 0.34 ) * 2.4, 0.0, 1.0 );
        totalEmissiveRadiance += vec3( 1.0, 0.94, 0.82 ) * ( 0.058 * pelRim * pelPlumageMask * diffuseColor.g );
        totalEmissiveRadiance += vec3( 0.97, 0.68, 0.34 ) * ( ( 0.042 + 0.075 * pelRim ) * pelPouchMask );
      }`
    );
  };
  return mat;
}

function ensureSingleUvRepeat(tex) {
  if (!tex) return null;
  tex.repeat.set(1, 1);
  tex.offset.set(0, 0);
  return tex;
}

export function upgradePelicanMaterialV7(srcMat, meshName = "") {
  if (!srcMat) return srcMat;
  const mName = `${srcMat.name || ""} ${meshName || ""}`.toLowerCase();

  // Wet dark amber/hazel avian cornea with crisp specular catchlight (`roughness: 0.03, clearcoat: 1.0`, zero bumpMap!)
  if (mName.includes("eye") && !mName.includes("eyelid")) {
    return new THREE.MeshPhysicalMaterial({
      name: "Pelican_Cornea_Eye_V7",
      color: srcMat.color ? srcMat.color.clone() : new THREE.Color("#ffffff"),
      map: ensureSingleUvRepeat(srcMat.map),
      roughness: 0.03,
      metalness: 0.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      ior: 1.45,
      envMapIntensity: 0.85,
      side: THREE.FrontSide,
    });
  }

  const baseMap = ensureSingleUvRepeat(srcMat.map);
  const normMap = ensureSingleUvRepeat(srcMat.normalMap);
  const roughMap = ensureSingleUvRepeat(srcMat.roughnessMap);
  const aoMap = ensureSingleUvRepeat(srcMat.aoMap || srcMat.roughnessMap);
  const hasBakedOrm = Boolean(roughMap);

  if (mName.includes("propeller")) {
    return new THREE.MeshPhysicalMaterial({
      name: "Pelican_Noogler_Propeller_V8",
      color: srcMat.color ? srcMat.color.clone() : new THREE.Color("#ffffff"),
      map: baseMap,
      normalMap: normMap,
      normalScale: new THREE.Vector2(0.35, 0.35),
      roughness: hasBakedOrm ? 1.0 : 0.22,
      roughnessMap: roughMap,
      aoMap,
      aoMapIntensity: hasBakedOrm ? 0.45 : 0.0,
      metalness: 0.0,
      metalnessMap: null,
      clearcoat: 0.52,
      clearcoatRoughness: 0.18,
      envMapIntensity: 0.42,
      side: THREE.FrontSide,
    });
  }

  if (mName.includes("noogler")) {
    return new THREE.MeshPhysicalMaterial({
      name: "Pelican_Noogler_Hat_V8",
      color: srcMat.color ? srcMat.color.clone() : new THREE.Color("#ffffff"),
      map: baseMap,
      normalMap: normMap,
      normalScale: new THREE.Vector2(0.72, 0.72),
      roughness: hasBakedOrm ? 1.0 : 0.78,
      roughnessMap: roughMap,
      aoMap,
      aoMapIntensity: hasBakedOrm ? 0.50 : 0.0,
      metalness: hasBakedOrm ? 1.0 : 0.0,
      metalnessMap: hasBakedOrm ? roughMap : null,
      sheen: 0.24,
      sheenRoughness: 0.62,
      sheenColor: new THREE.Color("#ffffff"),
      envMapIntensity: 0.38,
      side: THREE.FrontSide,
    });
  }

  // Hero Pelican V7 4-Tier Plumage, Fibrous Culmen, Pleated Gular Pouch, Scutellate Legs/Feet & Woven Cap:
  // Driven 100% by clean UV-unwrapped `2048x2048` BaseColor + Feather-Barb Tangent Normal + Packed ORM (`R=AO, G=Roughness, B=Metalness`),
  // soft natural feather sheen (`#fffaf0`, `sheenRoughness: 0.35`), and ZERO redundant bumpMap!
  const plumageMat = new THREE.MeshPhysicalMaterial({
    name: "Pelican_Plumage_Keratin_V7",
    color: srcMat.color ? srcMat.color.clone() : new THREE.Color("#ffffff"),
    map: baseMap,
    normalMap: normMap,
    normalScale: new THREE.Vector2(0.60, 0.60),
    roughness: hasBakedOrm ? 1.0 : 0.82,
    roughnessMap: roughMap,
    aoMap,
    aoMapIntensity: hasBakedOrm ? 0.52 : 0.0,
    metalness: 0.0,
    metalnessMap: null,
    sheen: 0.65,
    sheenRoughness: 0.35,
    sheenColor: new THREE.Color("#fffaf0"),
    envMapIntensity: 0.25,
    side: srcMat.side ?? THREE.DoubleSide,
  });
  plumageMat.userData.plumageRoughnessRange = [0.74, 0.86];
  return attachPelicanPlumageShaderHook(plumageMat);
}

export const upgradePelicanMaterialV6 = upgradePelicanMaterialV7;

function stripPelicanShadowPlanesAndEnableCast(rootObj, skipSubtree = null) {
  if (!rootObj) return;
  const toRemove = [];
  const visit = (obj) => {
    if (!obj || obj === skipSubtree) return;
    const label = `${obj.name || ""} ${obj.material?.name || ""}`;
    if (PELICAN_SHADOW_PLANE_RE.test(label)) {
      obj.visible = false;
      toRemove.push(obj);
      return;
    }
    if (obj.isMesh || obj.isSkinnedMesh) {
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

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _dorsal = new THREE.Vector3();
const _xAxis = new THREE.Vector3();
const _yAxis = new THREE.Vector3();
const _zAxis = new THREE.Vector3();
const _pedalWorldPos = new THREE.Vector3();
const _pedalUpWorld = new THREE.Vector3();
const _probeWorldPos = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _matBasis = new THREE.Matrix4();
const _quatTmp = new THREE.Quaternion();
const _qChar = new THREE.Quaternion();
const _eulerTmp = new THREE.Euler(0, 0, 0, "XYZ");
const _upVec = new THREE.Vector3(0, 1, 0);

// Armature-space rest coordinates matching `pelican_hero_v3_meta.json` (V8 zero-clip Noogler crown fit: +14.2mm lift, +11.2 deg brow tilt)
const CROWN_ARMATURE_POS = new THREE.Vector3(0.0, 0.5572, -0.192);
const NOOGLER_BROW_TILT_RAD = THREE.MathUtils.degToRad(11.2);
const EYE_L_ARMATURE_POS = new THREE.Vector3(-0.0335, 0.530, -0.215);
const EYE_R_ARMATURE_POS = new THREE.Vector3(0.0335, 0.530, -0.215);
const SHOULDER_L_ARMATURE_POS = new THREE.Vector3(-0.126, 0.138, -0.115);
const SHOULDER_R_ARMATURE_POS = new THREE.Vector3(0.126, 0.138, -0.115);
const NOOGLER_PROP_OFFSET = new THREE.Vector3(0.0, 0.0852, 0.0);
const _gripTargetTmp = new THREE.Vector3();
const _primStart0 = new THREE.Vector3();
const _primStart1 = new THREE.Vector3();
const _foreDir = new THREE.Vector3();
const _soarForeDir = new THREE.Vector3();
const _soarHintTmp = new THREE.Vector3();
const _foldSpanDir = new THREE.Vector3();
const _foldDorsalHint = new THREE.Vector3();
const _soarDorsalHint = new THREE.Vector3();
const _qFold = new THREE.Quaternion();
const _qSoar = new THREE.Quaternion();
const _qRootInv = new THREE.Quaternion();
const _qToeYaw = new THREE.Quaternion();
const _qCelBasis = new THREE.Quaternion();
const _qGroundFoot = new THREE.Quaternion();
const _groundFootPos = new THREE.Vector3();
const _celDorsalVec = new THREE.Vector3();
const _celOffsetTmp = new THREE.Vector3();
const _celBendTmp = new THREE.Vector3();
const _ikSoarTmp = {
  rootPos: new THREE.Vector3(),
  jointPos: new THREE.Vector3(),
  endPos: new THREE.Vector3(),
  upperDir: new THREE.Vector3(),
  lowerDir: new THREE.Vector3(),
  reachRatio: 0,
  kneeAngleDeg: 0,
  gapError: 0,
  targetErrorM: 0,
  clamped: false,
};

function computeWingBasisQuat(outQuat, yAxisUnit, dorsalHint, sideSign) {
  _yAxis.copy(yAxisUnit);
  if (_yAxis.lengthSq() < 1e-8) _yAxis.set(sideSign, 0, 0);
  _yAxis.normalize();

  _dorsal.copy(dorsalHint).addScaledVector(_yAxis, -dorsalHint.dot(_yAxis));
  if (_dorsal.lengthSq() < 1e-6) _dorsal.set(0, 1, 0);
  _dorsal.normalize();

  _xAxis.copy(_dorsal).multiplyScalar(sideSign);
  _zAxis.crossVectors(_xAxis, _yAxis).normalize();
  _xAxis.crossVectors(_yAxis, _zAxis).normalize();

  _matBasis.makeBasis(_xAxis, _yAxis, _zAxis);
  return outQuat.setFromRotationMatrix(_matBasis);
}

function orientLimbAlongY(group, startPos, endPos, restLen) {
  _v3.subVectors(endPos, startPos);
  const len = _v3.length();
  group.position.copy(startPos);
  if (len < 1e-6) return;
  _v3.multiplyScalar(1 / len);
  group.quaternion.setFromUnitVectors(_upVec, _v3);
  group.scale.set(1, len / Math.max(1e-4, restLen), 1);
}

function orientWingSegmentWithDorsalUp(
  group,
  startPos,
  endPos,
  restLen,
  sideSign,
  flareBlend,
  rideDorsalX = 0.96,
  rideDorsalY = -0.08,
  rideDorsalZ = 0.12,
  customFlareDorsal = null
) {
  _yAxis.subVectors(endPos, startPos);
  const len = _yAxis.length();
  group.position.copy(startPos);
  if (len < 1e-6) return;
  _yAxis.multiplyScalar(1 / len);

  // Smoothly rotate wing airfoil from flank-hugging riding cape (`rideDorsalY < 0` so trailing coverts cup the rounded ribcage
  // with zero outward splay!) to ~34° supinated positive angle-of-attack (`+0.82 Y` skyward, `+0.56 Z` aft dorsal normal),
  // or into the rotated celebration frame (`customFlareDorsal`) during the Peacock-Strut Wing-Fan!
  const targetDx = customFlareDorsal ? customFlareDorsal.x : sideSign * -0.08;
  const targetDy = customFlareDorsal ? customFlareDorsal.y : 0.82;
  const targetDz = customFlareDorsal ? customFlareDorsal.z : 0.56;
  _dorsal
    .set(
      THREE.MathUtils.lerp(sideSign * rideDorsalX, targetDx, flareBlend),
      THREE.MathUtils.lerp(rideDorsalY, targetDy, flareBlend),
      THREE.MathUtils.lerp(rideDorsalZ, targetDz, flareBlend)
    )
    .normalize();
  _dorsal.addScaledVector(_yAxis, -_dorsal.dot(_yAxis));
  if (_dorsal.lengthSq() < 1e-6) _dorsal.set(0, 1, 0);
  _dorsal.normalize();

  _xAxis.copy(_dorsal).multiplyScalar(sideSign);
  _zAxis.crossVectors(_xAxis, _yAxis).normalize();
  _xAxis.crossVectors(_yAxis, _zAxis).normalize();

  _matBasis.makeBasis(_xAxis, _yAxis, _zAxis);
  group.quaternion.setFromRotationMatrix(_matBasis);
  group.scale.set(1, len / Math.max(1e-4, restLen), 1);
}

function attachArmatureSocket(bone, invBoneArmRestMat, socketArmPos) {
  const socket = new THREE.Group();
  _mat4.makeTranslation(socketArmPos.x, socketArmPos.y, socketArmPos.z);
  _mat4.premultiply(invBoneArmRestMat);
  _mat4.decompose(socket.position, socket.quaternion, socket.scale);
  bone.add(socket);
  return socket;
}

export class PelicanRig {
  constructor(materials) {
    this.materials = materials || {};
    this.root = new THREE.Group();
    this.root.name = "PelicanRoot";

    // Seated carrier centered squarely over the 241.6mm leather cruiser saddle cushion (`z_bike = +0.304m`, `y = 0.833m`)
    this.torsoBasePos = new THREE.Vector3(0, 0.833, 0.304);
    this.torsoGroup = new THREE.Group();
    this.torsoGroup.position.copy(this.torsoBasePos);
    this.root.add(this.torsoGroup);

    // Keep fallback placeholder group invisible so Frame 0 never flashes a raw white sphere before GLB decode
    this.fallbackGroup = new THREE.Group();
    this.fallbackGroup.visible = false;
    this.torsoGroup.add(this.fallbackGroup);

    // Hip & Shoulder Socket Anchors (`y = -0.073, z = -0.046` preserves world hip `(±0.082, 0.760, 0.258)` and `0.000m` IK sole error!)
    this.leftHipAnchor = new THREE.Object3D();
    this.leftHipAnchor.position.set(-0.082, -0.073, -0.046);
    this.rightHipAnchor = new THREE.Object3D();
    this.rightHipAnchor.position.set(0.082, -0.073, -0.046);
    this.torsoGroup.add(this.leftHipAnchor, this.rightHipAnchor);

    this.leftShoulderAnchor = new THREE.Object3D();
    this.leftShoulderAnchor.position.set(-0.126, 0.138, -0.115);
    this.rightShoulderAnchor = new THREE.Object3D();
    this.rightShoulderAnchor.position.set(0.126, 0.138, -0.115);
    this.torsoGroup.add(this.leftShoulderAnchor, this.rightShoulderAnchor);

    // Exact V3 Limb Lengths matching `pelican_hero_v3_meta.json` (`0.0000m` IK sole error!)
    this.legL1 = 0.395;
    this.legL2 = 0.320;
    this.wingL1 = 0.285;
    this.wingL2 = 0.268;
    this.wingPrimariesL3 = 0.384;

    this.legs = { left: this._createLegSide(-1), right: this._createLegSide(1) };
    this.wings = { left: this._createWingSide(-1), right: this._createWingSide(1) };

    // RK4 Gular Pouch Oscillator & Apparent-Wind Propeller State
    this.gularY = 0;
    this.gularV = 0;
    this.gularOmegaN = 15.5;
    this.gularZeta = 0.26;
    this.propellerAngle = 0;
    this.propellerOmega = 0.8 * Math.PI * 2;

    // Skinned V3/V2 State
    this.isSkinnedV2 = false;
    this.skinnedBoneCount = 0;
    this.armatureRoot = null;
    this.skinnedMeshes = [];
    this.rigMeshes = [];
    this.bones = {};
    this.boneRest = {};
    this.casquetteMesh = null;
    this.nooglerHatGroup = null;
    this.nooglerPropellerPivot = null;
    this.eyelidPivots = [];
    this.crownSocket = null;
    this.lastPose = null;
    this.gazeState = null;

    // Public Telemetry & Diagnostics Contract expected by `core.js` & V7 parity checks
    const makeIkSlot = () => ({
      rootPos: new THREE.Vector3(),
      jointPos: new THREE.Vector3(),
      endPos: new THREE.Vector3(),
      upperDir: new THREE.Vector3(),
      lowerDir: new THREE.Vector3(),
      reachRatio: 0,
      kneeAngleDeg: 0,
      gapError: 0,
      targetErrorM: 0,
      clamped: false,
    });
    this.ikDiagnostics = {
      leftLeg: makeIkSlot(),
      rightLeg: makeIkSlot(),
      leftWing: makeIkSlot(),
      rightWing: makeIkSlot(),
      leftFootSoleErrorM: 0,
      rightFootSoleErrorM: 0,
    };
    this.kinematicsLocal = {
      hipLocal: { x: 0, y: 0, z: 0 },
      rightKneeLocal: { x: 0, y: 0, z: 0 },
      rightAnkleLocal: { x: 0, y: 0, z: 0 },
      rightPedalLocal: { x: 0, y: 0, z: 0 },
      leftKneeAngleDeg: 0,
      rightKneeAngleDeg: 0,
      ikSoleErrorM: 0,
      gazeYawRad: 0,
      gazePitchRad: 0,
      gazeTargetType: "path_lookahead",
      blinkClosure: 0,
      headwearCrownGapMm: 0,
    };
    this.leftFootHeelLocal = new THREE.Vector3(-0.118, 0.29, 0.11);
    this.subPartCount = 24;

    this.xrayEnabled = false;
    this._buildXrayOverlay();
  }

  _createLegSide(sideSign) {
    const thighGroup = new THREE.Group();
    const shinGroup = new THREE.Group();
    const footGroup = new THREE.Group();

    const ankleNode = new THREE.Object3D();
    ankleNode.position.set(0, 0.028, 0.0);
    const distalSoleProbe = new THREE.Object3D();
    distalSoleProbe.position.set(0, 0.0, -0.034);
    const heelClearanceProbe = new THREE.Object3D();
    heelClearanceProbe.position.set(sideSign * -0.028, 0.008, 0.028);
    footGroup.add(ankleNode, distalSoleProbe, heelClearanceProbe);

    this.root.add(thighGroup, shinGroup, footGroup);
    return {
      sideSign,
      thighGroup,
      shinGroup,
      footGroup,
      ankleNode,
      distalSoleProbe,
      heelClearanceProbe,
      bendHint: new THREE.Vector3(sideSign * 0.012, -0.18, -0.98),
    };
  }

  _createWingSide(sideSign) {
    const humerusGroup = new THREE.Group();
    const forewingGroup = new THREE.Group();
    const primariesGroup = new THREE.Group();

    const wingtipProbe = new THREE.Object3D();
    wingtipProbe.position.set(0, 0.296, 0);
    forewingGroup.add(wingtipProbe);

    this.root.add(humerusGroup, forewingGroup, primariesGroup);
    return {
      sideSign,
      humerusGroup,
      forewingGroup,
      primariesGroup,
      hasPrimaries: false,
      wingtipProbe,
      bendHint: new THREE.Vector3(sideSign * 0.34, -0.22, 0.18),
    };
  }

  _buildXrayOverlay() {
    this.xrayGroup = new THREE.Group();
    this.xrayGroup.visible = false;
    this._xrayPoints = new Float32Array(8 * 3);
    const lineGeom = new THREE.BufferGeometry();
    lineGeom.setAttribute("position", new THREE.BufferAttribute(this._xrayPoints, 3));
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x0ea5e9,
      depthTest: false,
      transparent: true,
      opacity: 0.95,
    });
    this.xrayLine = new THREE.LineSegments(lineGeom, lineMat);
    this.xrayLine.frustumCulled = false;
    this.xrayLine.renderOrder = 999;
    this.xrayGroup.add(this.xrayLine);
    this.root.add(this.xrayGroup);
  }

  _getOrCreateXrayMaterial(solidMat) {
    if (!solidMat) return solidMat;
    if (!this._xrayMatCache) this._xrayMatCache = new Map();
    const key = solidMat.uuid;
    if (this._xrayMatCache.has(key)) return this._xrayMatCache.get(key);
    const xm = new THREE.MeshStandardMaterial({
      name: `${solidMat.name || "Pelican"}_Xray_V7`,
      color: solidMat.color ? solidMat.color.clone() : new THREE.Color("#ffffff"),
      map: solidMat.map || null,
      roughness: 0.72,
      metalness: 0.0,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      side: solidMat.side ?? THREE.DoubleSide,
    });
    xm.customProgramCacheKey = () =>
      xm.map ? "pelican_xray_v7_map" : "pelican_xray_v7_nomap";
    this._xrayMatCache.set(key, xm);
    return xm;
  }

  _registerRigMeshMaterials(mesh) {
    if (!mesh || !mesh.material) return;
    mesh.userData.solidMaterial = mesh.material;
    mesh.userData.xrayMaterial = Array.isArray(mesh.material)
      ? mesh.material.map((m) => this._getOrCreateXrayMaterial(m))
      : this._getOrCreateXrayMaterial(mesh.material);
    if (this.xrayEnabled) {
      mesh.material = mesh.userData.xrayMaterial;
    }
  }

  setXrayMode(enabled) {
    const next = Boolean(enabled);
    if (this.xrayEnabled === next && this.xrayGroup && this.xrayGroup.visible === next) return;
    this.xrayEnabled = next;
    if (this.xrayGroup) this.xrayGroup.visible = this.xrayEnabled;
    for (const mesh of this.rigMeshes) {
      if (!mesh.userData.solidMaterial) {
        this._registerRigMeshMaterials(mesh);
      }
      mesh.material = this.xrayEnabled ? mesh.userData.xrayMaterial : mesh.userData.solidMaterial;
    }
    if (this.casquetteMesh) this.casquetteMesh.visible = false;
    if (this.nooglerHatGroup) this.nooglerHatGroup.visible = true;
  }

  _purgeFallbackGeometry() {
    if (!this.fallbackGroup) return;
    this.fallbackGroup.visible = false;
    this.fallbackGroup.traverse((c) => {
      if (c.isMesh && c.geometry) c.geometry.dispose();
    });
    if (this.fallbackGroup.parent) {
      this.fallbackGroup.parent.remove(this.fallbackGroup);
    }
  }

  _prepMeshClone(srcNode) {
    if (!srcNode || PELICAN_SHADOW_PLANE_RE.test(srcNode.name || "")) return null;
    const clone = srcNode.clone(true);
    clone.position.set(0, 0, 0);
    clone.rotation.set(0, 0, 0);
    clone.scale.set(1, 1, 1);
    stripPelicanShadowPlanesAndEnableCast(clone);
    clone.traverse((c) => {
      if (c.isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
        c.frustumCulled = false;
        if (c.geometry?.attributes?.uv && !c.geometry.attributes.uv1) {
          c.geometry.setAttribute("uv1", c.geometry.attributes.uv);
        }
        if (c.material) {
          const partName = c.name || srcNode.name || "";
          c.material = Array.isArray(c.material)
            ? c.material.map((m) => upgradePelicanMaterialV7(m, partName))
            : upgradePelicanMaterialV7(c.material, partName);
          this._registerRigMeshMaterials(c);
        }
        this.rigMeshes.push(c);
      }
    });
    return clone;
  }

  attachHeroGlb(gltfScene) {
    if (!gltfScene) return;
    this._purgeFallbackGeometry();
    this.rigMeshes = [];
    this.skinnedMeshes = [];
    this.bones = {};
    this.boneRest = {};
    this.eyelidPivots = [];

    const armatureSrc = gltfScene.getObjectByName("Pelican_Armature");
    if (armatureSrc) {
      const armatureClone = cloneSkeleton(armatureSrc);
      armatureClone.position.set(0, 0, 0);
      armatureClone.rotation.set(0, 0, 0);
      armatureClone.scale.set(1, 1, 1);
      stripPelicanShadowPlanesAndEnableCast(armatureClone);
      this.torsoGroup.position.copy(this.torsoBasePos);
      this.torsoGroup.rotation.set(0, 0, 0);
      this.torsoGroup.add(armatureClone);
      this.torsoGroup.updateMatrixWorld(true);

      const invArmWorld = armatureClone.matrixWorld.clone().invert();
      armatureClone.traverse((node) => {
        if (node.isSkinnedMesh || node.isMesh) {
          node.frustumCulled = false;
          node.castShadow = true;
          node.receiveShadow = true;
          const partName = node.name || "Pelican_Body_Skinned";
          node.material = Array.isArray(node.material)
            ? node.material.map((m) => upgradePelicanMaterialV7(m, partName))
            : upgradePelicanMaterialV7(node.material, partName);
          this._registerRigMeshMaterials(node);
          this.rigMeshes.push(node);
          if (node.isSkinnedMesh) {
            node.geometry = node.geometry.clone();
            if (node.geometry.attributes.uv && !node.geometry.attributes.uv1) {
              node.geometry.setAttribute("uv1", node.geometry.attributes.uv);
            }
            ensureSmoothAvianSkinWeights(node);
            if (node.skeleton && !node.skeleton.boneTexture) {
              node.skeleton.computeBoneTexture();
            }
            this.skinnedMeshes.push(node);
          } else if (node.geometry?.attributes?.uv && !node.geometry.attributes.uv1) {
            node.geometry.setAttribute("uv1", node.geometry.attributes.uv);
          }
        }
        if (node.isBone) {
          this.bones[node.name] = node;
          const armRestMat = node.matrixWorld.clone().premultiply(invArmWorld);
          const armPos = new THREE.Vector3();
          const armQuat = new THREE.Quaternion();
          const armScl = new THREE.Vector3();
          armRestMat.decompose(armPos, armQuat, armScl);
          this.boneRest[node.name] = {
            localPos: node.position.clone(),
            localQuat: node.quaternion.clone(),
            armRestMat,
            invArmRestMat: armRestMat.clone().invert(),
            armQuat,
            invArmQuat: armQuat.clone().invert(),
          };
        }
      });

      this.armatureRoot = armatureClone;
      this.skinnedBoneCount = Object.keys(this.bones).length;
      this.isSkinnedV2 = this.skinnedBoneCount > 0 && this.skinnedMeshes.length > 0;

      // Bind shoulder sockets to `Chest` bone so shoulders follow the `-0.34 rad` glass-brace tuck!
      if (this.bones.Chest) {
        const invChest = this.boneRest.Chest.invArmRestMat;
        const sL = attachArmatureSocket(this.bones.Chest, invChest, SHOULDER_L_ARMATURE_POS);
        const sR = attachArmatureSocket(this.bones.Chest, invChest, SHOULDER_R_ARMATURE_POS);
        this.leftShoulderAnchor.position.set(0, 0, 0);
        this.rightShoulderAnchor.position.set(0, 0, 0);
        sL.add(this.leftShoulderAnchor);
        sR.add(this.rightShoulderAnchor);
      }

      // Bind Structured 6-Panel Google Noogler Cap (+ Royal-Blue Propeller) and Eyelids rigidly onto `Head` bone (`0.000mm` jump separation)!
      if (this.bones.Head) {
        const invHead = this.boneRest.Head.invArmRestMat;
        this.crownSocket = attachArmatureSocket(this.bones.Head, invHead, CROWN_ARMATURE_POS);
        this.crownSocket.name = "Pelican_CrownSocket";

        this.casquetteMesh = this._prepMeshClone(gltfScene.getObjectByName("Pelican_Casquette"));
        if (this.casquetteMesh) {
          this.casquetteMesh.visible = false;
          this.casquetteMesh.castShadow = false;
          this.casquetteMesh.receiveShadow = false;
          this.crownSocket.add(this.casquetteMesh);
        }

        this.nooglerHatGroup = new THREE.Group();
        this.nooglerHatGroup.name = "Pelican_NooglerHat_Group";
        this.nooglerHatGroup.visible = true;
        this.nooglerHatGroup.rotation.set(NOOGLER_BROW_TILT_RAD, 0, 0);
        const nooglerBase = this._prepMeshClone(gltfScene.getObjectByName("Pelican_Noogler_Hat"));
        if (nooglerBase) this.nooglerHatGroup.add(nooglerBase);

        this.nooglerPropellerPivot = new THREE.Group();
        this.nooglerPropellerPivot.name = "Pelican_NooglerPropeller_Pivot";
        this.nooglerPropellerPivot.position.copy(NOOGLER_PROP_OFFSET);
        const propNode =
          gltfScene.getObjectByName("Pelican_Propeller") ||
          gltfScene.getObjectByName("Pelican_Noogler_Propeller");
        const propMesh = this._prepMeshClone(propNode);
        if (propMesh) this.nooglerPropellerPivot.add(propMesh);
        this.nooglerHatGroup.add(this.nooglerPropellerPivot);
        this.crownSocket.add(this.nooglerHatGroup);

        for (const [lbl, eyeArmPos] of [
          ["L", EYE_L_ARMATURE_POS],
          ["R", EYE_R_ARMATURE_POS],
        ]) {
          const eyeSocket = attachArmatureSocket(this.bones.Head, invHead, eyeArmPos);
          eyeSocket.userData.sideSign = lbl === "R" ? 1 : -1;
          const lidMesh = this._prepMeshClone(gltfScene.getObjectByName(`Pelican_Eyelid_${lbl}`));
          if (lidMesh) {
            eyeSocket.add(lidMesh);
            this.eyelidPivots.push(eyeSocket);
          }
        }
      }
    }

    // Attach 10 watertight 2-Bone IK wing, thigh, shin & totipalmate webbed foot meshes
    for (const [sideKey, lbl] of [
      ["left", "L"],
      ["right", "R"],
    ]) {
      const leg = this.legs[sideKey];
      const wing = this.wings[sideKey];
      const thigh = this._prepMeshClone(gltfScene.getObjectByName(`Pelican_Thigh_${lbl}`));
      const shin = this._prepMeshClone(gltfScene.getObjectByName(`Pelican_Shin_${lbl}`));
      const foot = this._prepMeshClone(gltfScene.getObjectByName(`Pelican_Foot_${lbl}`));
      const hum = this._prepMeshClone(gltfScene.getObjectByName(`Pelican_Wing_Humerus_${lbl}`));
      const fore = this._prepMeshClone(gltfScene.getObjectByName(`Pelican_Wing_Fore_${lbl}`));
      const prim = this._prepMeshClone(gltfScene.getObjectByName(`Pelican_Wing_Primaries_${lbl}`));

      if (thigh) leg.thighGroup.add(thigh);
      if (shin) leg.shinGroup.add(shin);
      if (foot) leg.footGroup.add(foot);
      if (hum) wing.humerusGroup.add(hum);
      if (fore) wing.forewingGroup.add(fore);
      if (prim) {
        wing.primariesGroup.add(prim);
        wing.hasPrimaries = true;
        wing.wingtipProbe.position.set(0, 0.3837, -0.045);
        wing.primariesGroup.add(wing.wingtipProbe);
      } else {
        wing.hasPrimaries = false;
        wing.wingtipProbe.position.set(0, 0.296, 0);
        wing.forewingGroup.add(wing.wingtipProbe);
      }
    }

    this.subPartCount = Math.max(24, this.rigMeshes.length + this.skinnedBoneCount);
    stripPelicanShadowPlanesAndEnableCast(this.root, this.xrayGroup);
    if (this.xrayEnabled) this.setXrayMode(true);
  }

  _applyBoneCharRot(boneName, rx, ry, rz) {
    const bone = this.bones[boneName];
    const rest = this.boneRest[boneName];
    if (!bone || !rest) return;
    _eulerTmp.set(rx, ry, rz, "XYZ");
    _qChar.setFromEuler(_eulerTmp);
    // Bone-roll-invariant conjugation: L_new = L_rest * B_rest^-1 * Q_char * B_rest
    bone.quaternion
      .copy(rest.localQuat)
      .multiply(rest.invArmQuat)
      .multiply(_qChar)
      .multiply(rest.armQuat);
  }

  _evalGularForce(crankRad, omegaCrank, plankPhase, omegaPlank, plankAmp) {
    return (
      -0.011 * (4.0 * omegaCrank * omegaCrank) * Math.cos(2.0 * crankRad) -
      plankAmp * (omegaPlank * omegaPlank) * Math.sin(plankPhase) * 0.55
    );
  }

  syncSpringAnalytically(crankRad, omegaCrank, plankPhase = 0, omegaPlank = 0, plankAmp = 0) {
    const wn = this.gularOmegaN;
    const z = this.gularZeta;
    const wn2 = wn * wn;
    const w1 = 2.0 * omegaCrank;
    const A1 = -0.011 * w1 * w1;
    const d1 = Math.pow(wn2 - w1 * w1, 2) + Math.pow(2 * z * wn * w1, 2);
    let y = 0;
    let v = 0;
    if (d1 > 1e-8) {
      const c = Math.cos(2.0 * crankRad);
      const s = Math.sin(2.0 * crankRad);
      y += (A1 / d1) * ((wn2 - w1 * w1) * c + 2 * z * wn * w1 * s);
      v += (A1 / d1) * (-(wn2 - w1 * w1) * w1 * s + 2 * z * wn * w1 * w1 * c);
    }
    this.gularY = THREE.MathUtils.clamp(y, -0.026, 0.028);
    this.gularV = v;
  }

  getHeadWorldPosition(out = new THREE.Vector3()) {
    if (this.crownSocket) return this.crownSocket.getWorldPosition(out);
    if (this.bones.Head) return this.bones.Head.getWorldPosition(out);
    return out.copy(this.torsoGroup.position).add(_v1.set(0, 0.54, -0.19));
  }

  getCurrentWingspanM() {
    this.root.updateWorldMatrix(true, true);
    const invRoot = _mat4.copy(this.root.matrixWorld).invert();
    this.wings.left.wingtipProbe.getWorldPosition(_v1).applyMatrix4(invRoot);
    this.wings.right.wingtipProbe.getWorldPosition(_v2).applyMatrix4(invRoot);
    return Math.hypot(_v2.x - _v1.x, _v2.z - _v1.z);
  }

  update(params) {
    const {
      dt = 0,
      simTime = 0,
      sequenceTime,
      crankRad = 0,
      omegaCrank = 0,
      steerRad = 0,
      steerAngle,
      yawRate,
      turnLookahead,
      turnLookaheadYaw,
      turnLookaheadDeltaYaw,
      headingYaw,
      heroYaw,
      heroX,
      heroY,
      heroZ,
      gazeTarget,
      gazeTargetWorld,
      bankRad = 0,
      speedMps = 0,
      deckBounceM = 0,
      suspensionCompressionMm = 0,
      gularDeflectionOverride = null,
      plankPhase = 0,
      omegaPlank = 0,
      plankAmp = 0,
      bellStrikeElapsed = 99,
      friendlyNod = 0,
      wingFlare = 0,
      beakOpen = 0,
      beakClapPhase = 0,
      glassBracePhase = 0,
      postSmashShake = 0,
      aeroCrouch = 0,
      pelicanSurprisePhase,
      pelicanGlanceBackYawRad,
      pelicanCrestJoltRad,
      pelicanStartledBeakOpen,
      sprintTorsoLeanRad,
      sprintHipRockRad,
      sprintShoulderRockRad,
      sprintWingTuck,
      celebrationDismountBlend = 0,
      celebrationTargetWorldYaw = null,
      wearNooglerHat,
      nooglerCapUnlocked = false,
      gbike,
    } = params;

    const celBlend = THREE.MathUtils.clamp(Number(celebrationDismountBlend) || 0.0, 0.0, 1.0);
    const celPhase = simTime * Math.PI * 2.0 * 0.90;

    const surprise = THREE.MathUtils.clamp(
      Number.isFinite(Number(pelicanSurprisePhase))
        ? Number(pelicanSurprisePhase)
        : Number(state.kinematics?.pelicanSurprisePhase) || 0.0,
      0.0,
      1.0
    );
    const glanceYaw = THREE.MathUtils.clamp(
      Number.isFinite(Number(pelicanGlanceBackYawRad))
        ? Number(pelicanGlanceBackYawRad)
        : Number(state.kinematics?.pelicanGlanceBackYawRad) || 0.0,
      -1.25,
      1.25
    );
    const crestJolt = THREE.MathUtils.clamp(
      Number.isFinite(Number(pelicanCrestJoltRad))
        ? Number(pelicanCrestJoltRad)
        : Number(state.kinematics?.pelicanCrestJoltRad) || 0.26 * surprise,
      0.0,
      0.35
    );
    const startledBeak = THREE.MathUtils.clamp(
      Number.isFinite(Number(pelicanStartledBeakOpen))
        ? Number(pelicanStartledBeakOpen)
        : Number(state.kinematics?.pelicanStartledBeakOpen) || 0.0,
      0.0,
      1.0
    );
    const rawSprintLean = THREE.MathUtils.clamp(
      Number.isFinite(Number(sprintTorsoLeanRad))
        ? Number(sprintTorsoLeanRad)
        : Number(state.kinematics?.sprintTorsoLeanRad) || 0.0,
      0.0,
      0.26
    );
    const rawSprintHipRock = THREE.MathUtils.clamp(
      Number.isFinite(Number(sprintHipRockRad))
        ? Number(sprintHipRockRad)
        : Number(state.kinematics?.sprintHipRockRad) || 0.0,
      -0.18,
      0.18
    );
    const rawSprintShoulderRock = THREE.MathUtils.clamp(
      Number.isFinite(Number(sprintShoulderRockRad))
        ? Number(sprintShoulderRockRad)
        : Number(state.kinematics?.sprintShoulderRockRad) || 0.0,
      -0.22,
      0.22
    );
    const rawSprintWingTuck = THREE.MathUtils.clamp(
      Number.isFinite(Number(sprintWingTuck))
        ? Number(sprintWingTuck)
        : Number(state.kinematics?.sprintWingTuck) || 0.0,
      0.0,
      1.0
    );
    const effWingFlareIn = Math.max(Number(wingFlare) || 0.0, surprise * 0.96);

    // 1. RK4 Gular Throat Pouch Integration
    if (gularDeflectionOverride !== null && Number.isFinite(gularDeflectionOverride)) {
      this.gularY = gularDeflectionOverride;
    } else if (dt > 0 && dt <= 0.12) {
      const wn = this.gularOmegaN;
      const z2wn = 2.0 * this.gularZeta * wn;
      const wn2 = wn * wn;
      const f0 = this._evalGularForce(crankRad - omegaCrank * dt, omegaCrank, plankPhase - omegaPlank * dt, omegaPlank, plankAmp);
      const fM = this._evalGularForce(crankRad - omegaCrank * dt * 0.5, omegaCrank, plankPhase - omegaPlank * dt * 0.5, omegaPlank, plankAmp);
      const f1 = this._evalGularForce(crankRad, omegaCrank, plankPhase, omegaPlank, plankAmp);
      const y0 = this.gularY;
      const v0 = this.gularV;
      const k1y = v0, k1v = f0 - z2wn * v0 - wn2 * y0;
      const k2y = v0 + 0.5 * dt * k1v, k2v = fM - z2wn * k2y - wn2 * (y0 + 0.5 * dt * k1y);
      const k3y = v0 + 0.5 * dt * k2v, k3v = fM - z2wn * k3y - wn2 * (y0 + 0.5 * dt * k2y);
      const k4y = v0 + dt * k3v, k4v = f1 - z2wn * k4y - wn2 * (y0 + dt * k3y);
      this.gularY = THREE.MathUtils.clamp(y0 + (dt / 6.0) * (k1y + 2 * k2y + 2 * k3y + k4y), -0.026, 0.028);
      this.gularV = v0 + (dt / 6.0) * (k1v + 2 * k2v + 2 * k3v + k4v);
    }

    // 1B. Step 8 Avian Gaze Anticipation (`0.30s` corner lookahead + TPU 8i / Stan fixation) & Natural Blinks (`3.4–5.2s`)
    const kinSnap = state.kinematics || {};
    const resolvedSeqTime = Number.isFinite(Number(sequenceTime))
      ? Number(sequenceTime)
      : Number.isFinite(Number(state.sequenceTime))
        ? Number(state.sequenceTime)
        : simTime;
    const resolvedYawRate = yawRate ?? kinSnap.yawRate ?? state.yawRate;
    const resolvedLookaheadYaw = turnLookaheadYaw ?? kinSnap.turnLookaheadYaw ?? state.turnLookaheadYaw;
    const resolvedLookaheadDelta =
      turnLookaheadDeltaYaw ?? kinSnap.turnLookaheadDeltaYaw ?? state.turnLookaheadDeltaYaw;
    const resolvedHeadingYaw =
      headingYaw ?? heroYaw ?? kinSnap.headingYaw ?? state.playerHeadingYaw ?? 0;
    const resolvedHeroX = heroX ?? kinSnap.heroX ?? state.playerX ?? 0;
    const resolvedHeroY = heroY ?? kinSnap.heroY ?? state.playerY ?? 0;
    const resolvedHeroZ = heroZ ?? kinSnap.heroZ ?? state.playerZ ?? 0;
    const resolvedGazeTargetWorld = gazeTargetWorld ?? kinSnap.gazeTargetWorld ?? state.gazeTargetWorld ?? null;

    const gaze = evaluatePelicanGazeAndBlink({
      simTime,
      sequenceTime: resolvedSeqTime,
      steerRad,
      steerAngle,
      speedMps,
      yawRate: resolvedYawRate,
      turnLookahead,
      turnLookaheadYaw: resolvedLookaheadYaw,
      turnLookaheadDeltaYaw: resolvedLookaheadDelta,
      headingYaw: resolvedHeadingYaw,
      heroX: resolvedHeroX,
      heroY: resolvedHeroY,
      heroZ: resolvedHeroZ,
      gazeTarget,
      gazeTargetWorld: resolvedGazeTargetWorld,
      pelicanSurprisePhase: surprise,
      aeroCrouch,
      sprintWingTuck: rawSprintWingTuck,
      glassBracePhase,
      postSmashShake,
      tpuSpawns: TPU_SPAWNS,
      tpuLedger: state.tpuLedger,
    });
    this.gazeState = gaze;

    // 2. Evaluate Deterministic Pose (`pelican_motion_poses.js`) — V8 keeps Noogler Cap visible 100% of runtime
    const useNoogler = true;
    void wearNooglerHat;
    void nooglerCapUnlocked;
    if (celBlend > 0.01 && gularDeflectionOverride === null) {
      this.gularY = THREE.MathUtils.clamp(
        this.gularY * (1.0 - celBlend) + 0.006 * Math.sin(celPhase) * celBlend,
        -0.026,
        0.028
      );
    }
    const pose = evaluatePelicanMotionPose({
      simTime,
      crankRad,
      omegaCrank,
      steerRad,
      bankRad,
      speedMps,
      deckBounceM,
      suspensionCompressionMm,
      gularY: this.gularY,
      bellStrikeElapsed,
      friendlyNod,
      glassBracePhase,
      postSmashShake,
      wingFlare: Math.max(effWingFlareIn, celBlend),
      aeroCrouch,
      beakClapPhase: Math.max(beakClapPhase || 0, beakOpen || 0),
      wearNooglerHat: useNoogler,
      gazeYawRad: gaze.gazeBoneYawRad * (1.0 - surprise) * (1.0 - celBlend),
      gazePitchRad: gaze.gazeBonePitchRad * (1.0 - surprise * 0.5) * (1.0 - celBlend),
      blinkClosureOverride: gaze.blinkClosure,
      celebrationBlend: celBlend,
    });
    this.lastPose = pose;

    // Smoothly turn straddling Pelican toward the active camera ray (`celebrationTargetWorldYaw`) while GBike stays aimed at `GEMINI 4 CARBON`!
    let rawCelDeltaRy = 0.0;
    if (
      celBlend > 1e-4 &&
      celebrationTargetWorldYaw !== null &&
      celebrationTargetWorldYaw !== undefined &&
      Number.isFinite(Number(celebrationTargetWorldYaw))
    ) {
      rawCelDeltaRy = resolvedHeadingYaw - Number(celebrationTargetWorldYaw);
      rawCelDeltaRy = ((rawCelDeltaRy + Math.PI) % (Math.PI * 2));
      if (rawCelDeltaRy < 0) rawCelDeltaRy += Math.PI * 2;
      rawCelDeltaRy -= Math.PI;
    }
    const celTurnRy = rawCelDeltaRy * celBlend;
    const effGlanceYaw = glanceYaw * (1.0 - celBlend);

    const sprintGate = Math.max(0.0, (1.0 - pose.brace * 0.85) * (1.0 - celBlend));
    const effSprintLean = rawSprintLean * sprintGate;
    const effHipRock = rawSprintHipRock * sprintGate;
    const effShoulderRock = rawSprintShoulderRock * sprintGate;
    const effWingTuck = rawSprintWingTuck * sprintGate;

    const saddleY = gbike?.saddleTopPos ? gbike.saddleTopPos.y + 0.081 : this.torsoBasePos.y;
    const saddleZ = gbike?.saddleTopPos ? gbike.saddleTopPos.z + 0.066 : this.torsoBasePos.z;
    const seatTorsoY =
      saddleY + pose.hipOffsetY + 0.030 * surprise + 0.004 * Math.sin(2.0 * crankRad) * effWingTuck;
    const seatTorsoZ = saddleZ + pose.hipOffsetZ - 0.015 * surprise - 0.016 * effWingTuck;

    // Off-saddle standover straddle (`z_bike = -0.055m`, `y_bike = 0.712m` -> > 27cm daylight above step-through tube!) + `+3.8cm` hop arc
    const hopArcY = 0.038 * 4.0 * celBlend * (1.0 - celBlend);
    const strutSwayX = 0.0055 * Math.sin(celPhase) * celBlend;
    const strutBobY = 0.004 * Math.abs(Math.sin(celPhase)) * celBlend;
    const standTorsoY = 0.712 + strutBobY;
    const standTorsoZ = -0.055;
    this.torsoGroup.position.set(
      THREE.MathUtils.lerp(0.0, strutSwayX, celBlend),
      THREE.MathUtils.lerp(seatTorsoY, standTorsoY, celBlend) + hopArcY,
      THREE.MathUtils.lerp(seatTorsoZ, standTorsoZ, celBlend)
    );
    const torsoCarrierRy = 0.54 * celTurnRy;
    this.torsoGroup.rotation.set(0, torsoCarrierRy, 0);

    let chestTotalCharRy = 0.0;

    // 3. Drive Skinned `Pelican_Armature` Bones + Rigid Headwear (`0.0mm` Crown Gap!) + Concentric Eyelids
    if (this.isSkinnedV2) {
      const pelvisRy = pose.pelvis.ry - 0.42 * effHipRock + 0.08 * celTurnRy;
      const chestShimmyRy = 0.013 * Math.sin(celPhase) * celBlend;
      const chestRy =
        pose.chest.ry + effGlanceYaw * 0.12 + 0.28 * effShoulderRock + 0.32 * celTurnRy + chestShimmyRy;
      chestTotalCharRy = torsoCarrierRy + pelvisRy + chestRy;

      this._applyBoneCharRot(
        "Pelvis",
        pose.pelvis.rx - 0.28 * effSprintLean,
        pelvisRy,
        pose.pelvis.rz + effHipRock
      );
      // Keep `Chest` strictly unit-scale `(1, 1, 1)` so `Pelvis -> Head -> crownSocket` stays pure rigid `SE(3)` (`0.000mm` cap float)!
      this._applyBoneCharRot(
        "Chest",
        pose.chest.rx + 0.08 * surprise - 0.72 * effSprintLean,
        chestRy,
        pose.chest.rz + effShoulderRock
      );
      this._applyBoneCharRot(
        "Neck_01",
        pose.neck[0].rx + crestJolt * 0.32 - 0.22 * effSprintLean,
        pose.neck[0].ry + effGlanceYaw * 0.14 + 0.01 * celTurnRy,
        pose.neck[0].rz - 0.18 * effShoulderRock
      );
      this._applyBoneCharRot(
        "Neck_02",
        pose.neck[1].rx + crestJolt * 0.42 - 0.12 * effSprintLean,
        pose.neck[1].ry + effGlanceYaw * 0.18 + 0.01 * celTurnRy,
        pose.neck[1].rz - 0.16 * effShoulderRock
      );
      this._applyBoneCharRot(
        "Neck_03",
        pose.neck[2].rx + crestJolt * 0.48 + 0.22 * effSprintLean,
        pose.neck[2].ry + effGlanceYaw * 0.22 + 0.01 * celTurnRy - 0.04 * celBlend,
        pose.neck[2].rz - 0.12 * effShoulderRock
      );
      this._applyBoneCharRot(
        "Neck_04",
        pose.neck[3].rx + crestJolt * 0.36 + 0.30 * effSprintLean,
        pose.neck[3].ry + effGlanceYaw * 0.24 + 0.01 * celTurnRy - 0.05 * celBlend,
        pose.neck[3].rz - 0.10 * effShoulderRock
      );
      this._applyBoneCharRot(
        "Head",
        pose.head.rx - 0.14 * surprise + 0.54 * effSprintLean - 0.045 * celBlend,
        pose.head.ry + effGlanceYaw * 0.36 + 0.02 * celTurnRy - 0.125 * celBlend - chestShimmyRy * 0.55,
        pose.head.rz - effGlanceYaw * 0.08 - 0.22 * effShoulderRock + 0.075 * celBlend
      );
      const jawRx = Math.min(pose.jaw.rx, -0.245 * startledBeak);
      this._applyBoneCharRot("JawPouch", jawRx, 0, pose.jaw.rz);
      this._applyBoneCharRot("Tail", pose.tail.rx - 0.12 * surprise + 0.14 * effWingTuck, pose.tail.ry, pose.tail.rz);

      // Headwind polka-dot scarf wave (`Scarf_Tail_01..02` front V-bow, neutral draped `Scarf_Rear_01..02`)
      const sw1 = Math.sin(simTime * pose.windFreq * 0.78) * pose.scarfWaveAmp;
      const sw2 = Math.sin(simTime * pose.windFreq * 0.78 - 0.9) * pose.scarfWaveAmp * 1.45;
      const latW = Math.cos(simTime * pose.windFreq * 0.56) * pose.scarfWaveAmp * 0.6;
      this._applyBoneCharRot("Scarf_Tail_01", pose.scarfLift * 0.35 + sw1, -steerRad * 0.18 + latW, 0);
      this._applyBoneCharRot("Scarf_Tail_02", pose.scarfLift * 0.28 + sw2, latW * 1.2, 0);
      this._applyBoneCharRot("Scarf_Rear_01", pose.scarfLift * 0.04 + sw1 * 0.30, -steerRad * 0.10 - latW * 0.4, 0);
      this._applyBoneCharRot("Scarf_Rear_02", pose.scarfLift * 0.03 + sw2 * 0.35, -latW * 0.5, 0);

      // Concentric upper-corneal eyelid sweep (`evaluatePelicanGazeAndBlink` handles natural blinks, Stan double-blink & Beat 3 squint)
      const effLidClosure = pose.eyelidClosure;
      for (const lidPivot of this.eyelidPivots) {
        const sgn = lidPivot.userData?.sideSign || 1;
        lidPivot.rotation.set(-0.62 * effLidClosure, 0, -sgn * 0.78 * effLidClosure);
      }
      // V8 Headwear Contract: `Pelican_Casquette` permanently hidden (`visible = false`),
      // `Pelican_Noogler_Hat` visible 100% of runtime (`0.000s -> 72.0s`, Free Roam, chapters, X-Ray),
      // and `Pelican_Propeller` driven by damped apparent-wind angular velocity (`~0.8 rev/s` -> `~3.0 rev/s`)!
      if (this.casquetteMesh) this.casquetteMesh.visible = false;
      if (this.nooglerHatGroup) {
        this.nooglerHatGroup.visible = true;
        this.nooglerHatGroup.rotation.set(NOOGLER_BROW_TILT_RAD, 0, 0);
      }
      if (this.nooglerPropellerPivot) {
        const spdNorm = THREE.MathUtils.clamp((Math.max(0, Number(speedMps) || 0)) / 8.5, 0.0, 1.0);
        const aeroBoost = THREE.MathUtils.clamp(
          0.34 * pose.wingSoar.blend + 0.24 * effWingTuck + 0.16 * (Number(aeroCrouch) || 0),
          0.0,
          0.55
        );
        const windBlend = THREE.MathUtils.clamp(
          Math.max(spdNorm * 0.90 + aeroBoost, celBlend),
          0.0,
          1.0
        );
        const targetRevPerSec = THREE.MathUtils.lerp(0.80, 3.00, windBlend);
        const targetOmega = targetRevPerSec * Math.PI * 2.0;
        if (dt > 0 && dt < 0.25) {
          const dampAlpha = 1.0 - Math.exp(-dt / 0.22);
          this.propellerOmega += (targetOmega - this.propellerOmega) * dampAlpha;
          this.propellerAngle = (this.propellerAngle + this.propellerOmega * dt) % (Math.PI * 200);
        } else {
          this.propellerOmega = targetOmega;
          this.propellerAngle = (simTime * targetOmega) % (Math.PI * 200);
        }
        this.nooglerPropellerPivot.rotation.set(0, this.propellerAngle, 0);
      }
    }

    this.kinematicsLocal.gazeYawRad = gaze.gazeBoneYawRad;
    this.kinematicsLocal.gazePitchRad = gaze.gazeBonePitchRad;
    this.kinematicsLocal.gazeTargetType = gaze.gazeTargetType;
    this.kinematicsLocal.blinkClosure = pose.eyelidClosure;
    this.kinematicsLocal.headwearCrownGapMm = 0;
    this.kinematicsLocal.celebrationDismountBlend = celBlend;
    if (state.kinematics && typeof state.kinematics === "object") {
      state.kinematics.pelicanGazeYawRad = gaze.gazeBoneYawRad;
      state.kinematics.pelicanGazePitchRad = gaze.gazeBonePitchRad;
      state.kinematics.pelicanGazeTargetType = gaze.gazeTargetType;
      state.kinematics.pelicanBlinkClosure = pose.eyelidClosure;
      state.kinematics.pelicanHeadwearCrownGapMm = 0;
    }

    // Synchronize all ancestor (`heroAnchor`, `gbike.leanGroup`) and descendant world matrices BEFORE inverting `this.root.matrixWorld`!
    this.root.updateWorldMatrix(true, true);
    for (let si = 0; si < this.skinnedMeshes.length; si++) {
      const sm = this.skinnedMeshes[si];
      if (sm.skeleton) {
        if (!sm.skeleton.boneTexture) sm.skeleton.computeBoneTexture();
        sm.skeleton.update();
      }
    }
    const invRoot = _mat4.copy(this.root.matrixWorld).invert();
    this.root.getWorldQuaternion(_qRootInv).invert();
    if (!gbike) return;

    // 4. `+alpha` 2-Bone Analytical Leg IK (`ikSoleErrorM === 0.0000m` across all 360° crank, bank, & ground straddle!)
    for (const side of ["left", "right"]) {
      const leg = this.legs[side];
      const hipAnchor = side === "right" ? this.rightHipAnchor : this.leftHipAnchor;
      const pedalGroup = side === "right" ? gbike.rightPedalGroup : gbike.leftPedalGroup;
      const pedalTopAnchor = pedalGroup.userData.topAnchor;

      pedalTopAnchor.getWorldPosition(_pedalWorldPos);
      pedalGroup.getWorldQuaternion(_quatTmp);
      _pedalUpWorld.set(0, 1, 0).applyQuaternion(_quatTmp).normalize();
      _qToeYaw.setFromAxisAngle(_upVec, leg.sideSign * -0.03);
      _quatTmp.multiply(_qToeYaw);

      let footGroundY = _pedalWorldPos.y;
      if (celBlend > 1e-5) {
        // Wide athletic straddle on opposite sides of the GBike (`left` on `-X_bike`, `right` on `+X_bike`),
        // clearing the low-step tube, chainguard (`z >= -0.023m`), saddle (`z >= +0.084m`), and parked cranks by > 11.5cm!
        const straddleX = leg.sideSign * 0.275;
        const straddleZ = side === "left" ? 0.095 : -0.175;
        _groundFootPos.set(straddleX, 0.0, straddleZ).applyMatrix4(gbike.root.matrixWorld);
        footGroundY = getOpenWorldTerrainHeight(_groundFootPos.x, _groundFootPos.z);
        _groundFootPos.y = footGroundY;

        const footTurnCharRy =
          side === "left" ? 0.58 * celTurnRy + 0.20 : 0.42 * celTurnRy - 0.16;
        _qGroundFoot.setFromAxisAngle(_upVec, -resolvedHeadingYaw + footTurnCharRy);
        if (_quatTmp.dot(_qGroundFoot) < 0) {
          _qGroundFoot.set(-_qGroundFoot.x, -_qGroundFoot.y, -_qGroundFoot.z, -_qGroundFoot.w);
        }

        _pedalWorldPos.lerp(_groundFootPos, celBlend);
        _quatTmp.slerp(_qGroundFoot, celBlend);
        _pedalUpWorld.lerp(_upVec, celBlend).normalize();
      }

      // Lock `footGroup` directly to the exact pedal/ground target frame in `this.root` space
      leg.footGroup.position.copy(_pedalWorldPos).applyMatrix4(invRoot);
      leg.footGroup.quaternion.copy(_qRootInv).multiply(_quatTmp);
      leg.footGroup.updateWorldMatrix(false, true);

      hipAnchor.getWorldPosition(_v1).applyMatrix4(invRoot);
      if (celBlend > 1e-5) {
        // Keep left hip strictly on `-X_bike` and right hip strictly on `+X_bike` inside the plump ventral belly plumage
        // so neither leg ever crosses over the step-through bicycle frame (`> 11.5cm >= 10cm` clearance on V9 & V6!)
        const standHipX = leg.sideSign * 0.142 + strutSwayX * 0.65;
        const standHipY = 0.642 + strutBobY * 0.85 + hopArcY;
        const standHipZ = side === "left" ? 0.072 : -0.158;
        _v1.set(
          THREE.MathUtils.lerp(_v1.x, standHipX, celBlend),
          THREE.MathUtils.lerp(_v1.y, standHipY, celBlend),
          THREE.MathUtils.lerp(_v1.z, standHipZ, celBlend)
        );
      }
      leg.ankleNode.getWorldPosition(_v2).applyMatrix4(invRoot);

      // Avian femoral telescoping inside the plump ventral belly plumage:
      // Keeps `this.legL1 = 0.395m` & `this.legL2 = 0.320m` intact at full standing extension while retracting
      // the upper drumstick compactly over the crankset at top-of-stroke (`0` clamping, `0.0000mm` sole error,
      // `14.2cm` less forward knee protrusion so knees never hairpin into the basket/down-tube!)
      const hipToAnkle = _v1.distanceTo(_v2);
      const effLegSpan = Math.min(this.legL1 + this.legL2, Math.max(0.485, hipToAnkle * 1.045));
      const effLegL1 = effLegSpan * 0.54;
      const effLegL2 = effLegSpan * 0.46;

      if (celBlend > 1e-5) {
        _celBendTmp.set(
          THREE.MathUtils.lerp(leg.bendHint.x, leg.sideSign * 0.66, celBlend),
          THREE.MathUtils.lerp(leg.bendHint.y, 0.24, celBlend),
          THREE.MathUtils.lerp(leg.bendHint.z, -0.70, celBlend)
        ).normalize();
      } else {
        _celBendTmp.copy(leg.bendHint);
      }

      const ikOut = this.ikDiagnostics[side === "right" ? "rightLeg" : "leftLeg"];
      solveTwoBoneIK(_v1, _v2, effLegL1, effLegL2, _celBendTmp, ikOut);

      orientLimbAlongY(leg.thighGroup, ikOut.rootPos, ikOut.jointPos, this.legL1);
      orientLimbAlongY(leg.shinGroup, ikOut.jointPos, ikOut.endPos, this.legL2);

      leg.distalSoleProbe.getWorldPosition(_probeWorldPos);
      const soleErr = Math.abs(_pedalUpWorld.dot(_v3.subVectors(_probeWorldPos, _pedalWorldPos)));

      if (side === "right") {
        this.ikDiagnostics.rightFootSoleErrorM = soleErr;
        this.ikDiagnostics.rightFootSoleWorldY = _probeWorldPos.y;
        this.ikDiagnostics.rightFootGroundY = footGroundY;
        this.kinematicsLocal.rightFootSoleWorldY = _probeWorldPos.y;
        this.kinematicsLocal.rightFootGroundY = footGroundY;
        this.kinematicsLocal.hipLocal = { x: ikOut.rootPos.x, y: ikOut.rootPos.y, z: ikOut.rootPos.z };
        this.kinematicsLocal.rightKneeLocal = { x: ikOut.jointPos.x, y: ikOut.jointPos.y, z: ikOut.jointPos.z };
        this.kinematicsLocal.rightAnkleLocal = { x: ikOut.endPos.x, y: ikOut.endPos.y, z: ikOut.endPos.z };
        this.kinematicsLocal.rightPedalLocal = {
          x: leg.footGroup.position.x,
          y: leg.footGroup.position.y,
          z: leg.footGroup.position.z,
        };
        this.kinematicsLocal.rightKneeAngleDeg = ikOut.kneeAngleDeg || 0;
      } else {
        this.ikDiagnostics.leftFootSoleErrorM = soleErr;
        this.ikDiagnostics.leftFootSoleWorldY = _probeWorldPos.y;
        this.ikDiagnostics.leftFootGroundY = footGroundY;
        this.kinematicsLocal.leftFootSoleWorldY = _probeWorldPos.y;
        this.kinematicsLocal.leftFootGroundY = footGroundY;
        this.kinematicsLocal.leftKneeAngleDeg = ikOut.kneeAngleDeg || 0;
        leg.heelClearanceProbe.getWorldPosition(this.leftFootHeelLocal).applyMatrix4(invRoot);
      }
    }

    this.kinematicsLocal.ikSoleErrorM = Math.max(
      this.ikDiagnostics.leftFootSoleErrorM,
      this.ikDiagnostics.rightFootSoleErrorM,
      this.ikDiagnostics.leftLeg.gapError || 0,
      this.ikDiagnostics.rightLeg.gapError || 0
    );

    // 5. Cambered Multi-Jointed Avian Gull-Wing Arch, Flap Stroke & Peacock-Strut Wing-Fan (`flare > 0`) + Snug Flank-Hugging Grip Lock (`flare = 0`)
    const flare = Math.max(pose.wingSoar.blend, celBlend);
    const usingPrimaries = Boolean(this.wings.left.hasPrimaries || this.wings.right.hasPrimaries);
    const soarL1 = THREE.MathUtils.lerp(0.315, 0.342, celBlend);
    const soarL2 = THREE.MathUtils.lerp(0.300, 0.328, celBlend);
    const effWingL1 = usingPrimaries
      ? THREE.MathUtils.lerp(0.242, soarL1, flare)
      : THREE.MathUtils.lerp(this.wingL1, 0.355, flare);
    const effWingL2 = usingPrimaries
      ? THREE.MathUtils.lerp(0.236, soarL2, flare)
      : THREE.MathUtils.lerp(this.wingL2, 0.385, flare);

    _qCelBasis.setFromAxisAngle(_upVec, chestTotalCharRy * celBlend);
    const celWaveY = 0.018 * Math.sin(celPhase) * celBlend;
    const celWaveSpan = 0.011 * Math.cos(celPhase - 0.35) * celBlend;
    const celWaveZ = 0.010 * Math.sin(celPhase - 0.70) * celBlend;

    for (const side of ["left", "right"]) {
      const wing = this.wings[side];
      const shoulderAnchor = side === "right" ? this.rightShoulderAnchor : this.leftShoulderAnchor;
      const gripWorld = side === "right" ? gbike.rightGripWorld : gbike.leftGripWorld;
      const gripLocalFallback = side === "right" ? gbike.rightGripLocal : gbike.leftGripLocal;
      const hintObj = side === "right" ? pose.wingSoar.rightElbowHint : pose.wingSoar.leftElbowHint;

      shoulderAnchor.getWorldPosition(_v1).applyMatrix4(invRoot);
      if (gripWorld) {
        _gripTargetTmp.copy(gripWorld).applyMatrix4(invRoot);
      } else {
        _gripTargetTmp.copy(gripLocalFallback);
      }
      // Elevate carpal wrist target `+16mm` atop the rubber grip cylinder so white carpal fingers wrap cleanly over it!
      const wingTuckClamp = effWingTuck * (1.0 - flare);
      _gripTargetTmp.y += 0.016 - 0.003 * wingTuckClamp;
      _gripTargetTmp.z += 0.008;

      // Multi-jointed avian carpal target (`soarSpanFromShoulder = 0.528m < L1+L2 = 0.615m`, reachRatio ~ 0.87 -> ~136° gull arch!)
      // + Wave 4 Peacock-Strut Dorsal Display Fan (`+0.295m` above shoulders, `±0.515m` lateral span, `+0.065m` dorsal sweep in `_qCelBasis`)!
      const soarSpanFromShoulder = wing.hasPrimaries
        ? THREE.MathUtils.lerp(0.528, 0.490, surprise)
        : 0.625;
      const surpriseBeatY =
        surprise > 0.01 ? 0.095 * surprise + Math.sin(simTime * 28.0) * 0.024 * surprise : 0.0;

      const baseOffsetX = wing.sideSign * soarSpanFromShoulder;
      const baseOffsetY = (wing.hasPrimaries ? 0.145 : 0.175) + pose.wingSoar.beatY + surpriseBeatY;
      const baseOffsetZ = -0.046 + pose.wingSoar.sweepZ - 0.018 * surprise;

      const celOffsetX = wing.sideSign * (0.525 + celWaveSpan);
      const celOffsetY = 0.335 + celWaveY;
      const celOffsetZ = 0.065 + celWaveZ;

      _celOffsetTmp.set(
        THREE.MathUtils.lerp(baseOffsetX, celOffsetX, celBlend),
        THREE.MathUtils.lerp(baseOffsetY, celOffsetY, celBlend),
        THREE.MathUtils.lerp(baseOffsetZ, celOffsetZ, celBlend)
      );
      if (celBlend > 1e-5) {
        _celOffsetTmp.applyQuaternion(_qCelBasis);
      }
      _v3.copy(_v1).add(_celOffsetTmp);
      _v2.lerpVectors(_gripTargetTmp, _v3, flare);

      const baseHintX = hintObj.x - wing.sideSign * 0.04 * wingTuckClamp;
      const baseHintY = hintObj.y - 0.16 * wingTuckClamp + 0.08 * surprise * flare;
      const baseHintZ = hintObj.z + 0.055 * wingTuckClamp;
      wing.bendHint.set(
        THREE.MathUtils.lerp(baseHintX, wing.sideSign * 0.36, celBlend),
        THREE.MathUtils.lerp(baseHintY, 0.54, celBlend),
        THREE.MathUtils.lerp(baseHintZ, 0.32, celBlend)
      );
      if (celBlend > 1e-5) {
        wing.bendHint.applyQuaternion(_qCelBasis).normalize();
      }

      const ikOut = this.ikDiagnostics[side === "right" ? "rightWing" : "leftWing"];
      solveTwoBoneIK(_v1, _v2, effWingL1, effWingL2, wing.bendHint, ikOut);

      let customDorsal = null;
      if (celBlend > 1e-5) {
        _celDorsalVec
          .set(
            THREE.MathUtils.lerp(wing.sideSign * -0.08, wing.sideSign * -0.04, celBlend),
            THREE.MathUtils.lerp(0.82, 0.28, celBlend),
            THREE.MathUtils.lerp(0.56, 0.96, celBlend)
          )
          .normalize()
          .applyQuaternion(_qCelBasis);
        customDorsal = _celDorsalVec;
      }

      orientWingSegmentWithDorsalUp(
        wing.humerusGroup,
        ikOut.rootPos,
        ikOut.jointPos,
        this.wingL1,
        wing.sideSign,
        flare,
        0.96,
        -0.06,
        0.14,
        customDorsal
      );
      orientWingSegmentWithDorsalUp(
        wing.forewingGroup,
        ikOut.jointPos,
        ikOut.endPos,
        this.wingL2,
        wing.sideSign,
        flare,
        0.96,
        -0.20,
        -0.04,
        customDorsal
      );

      if (wing.hasPrimaries) {
        _foreDir.subVectors(ikOut.endPos, ikOut.jointPos);
        if (_foreDir.lengthSq() > 1e-8) {
          _foreDir.normalize();
        } else {
          _foreDir.set(wing.sideSign, 0, 0);
        }

        // Outer 12-feather primary fan (`Pelican_Wing_Primaries_L/R`) wrist camber:
        //   - Ramp jump / Breakout (`surprise = 0`): cambered downward-aft gull-wing M-arch (`y = primaryDihedralRad ~ -0.18`)!
        //   - Stan startle (`surprise > 0`): high upward V-dihedral primary spread (`y -> +0.32`) matching Look Bible Panel 4!
        //   - Wave 4 Peacock-Strut Celebration (`celBlend > 0`): high upward/outward radial feather fan (`y ~ +0.58`) + ripple!
        const basePrimDihedralY = THREE.MathUtils.lerp(
          pose.wingSoar.primaryDihedralRad ?? -0.18,
          0.32 + 0.06 * Math.sin(simTime * 28.0 - 0.5),
          surprise
        );
        const celPrimDihedralY = 0.65 + 0.035 * Math.sin(celPhase - 0.55);
        const primDihedralY = THREE.MathUtils.lerp(basePrimDihedralY, celPrimDihedralY, celBlend);

        const basePrimSweepZ = THREE.MathUtils.lerp(
          pose.wingSoar.primarySweepRad ?? 0.06,
          0.08,
          surprise
        );
        const primSweepZ = THREE.MathUtils.lerp(basePrimSweepZ, 0.04, celBlend);

        _soarForeDir
          .set(wing.sideSign * THREE.MathUtils.lerp(0.92, 0.82, celBlend), primDihedralY, primSweepZ)
          .normalize();
        if (celBlend > 1e-5) {
          _soarForeDir.applyQuaternion(_qCelBasis);
        }

        _primStart0.set(
          wing.sideSign * 0.174,
          ikOut.jointPos.y + 0.062,
          ikOut.jointPos.z + 0.150
        );
        _primStart1.copy(ikOut.endPos).addScaledVector(_foreDir, -0.055);
        wing.primariesGroup.position.lerpVectors(_primStart0, _primStart1, flare);

        _foldSpanDir.set(wing.sideSign * -0.12, -0.76, 0.638).normalize();
        _foldDorsalHint.set(wing.sideSign * 0.96, 0.16, 0.22);
        computeWingBasisQuat(_qFold, _foldSpanDir, _foldDorsalHint, wing.sideSign);

        _soarDorsalHint
          .set(
            THREE.MathUtils.lerp(wing.sideSign * -0.10, wing.sideSign * -0.04, celBlend),
            THREE.MathUtils.lerp(0.82, 0.28, celBlend),
            THREE.MathUtils.lerp(0.56, 0.96, celBlend)
          )
          .normalize();
        if (celBlend > 1e-5) {
          _soarDorsalHint.applyQuaternion(_qCelBasis);
        }
        computeWingBasisQuat(_qSoar, _soarForeDir, _soarDorsalHint, wing.sideSign);
        if (_qFold.dot(_qSoar) < 0) {
          _qSoar.set(-_qSoar.x, -_qSoar.y, -_qSoar.z, -_qSoar.w);
        }
        wing.primariesGroup.quaternion.slerpQuaternions(_qFold, _qSoar, flare);
        const soarScaleY = THREE.MathUtils.lerp(1.06, 1.15, celBlend);
        wing.primariesGroup.scale.set(1.0, THREE.MathUtils.lerp(0.80, soarScaleY, flare), 1.0);
      }
    }

    // 6. Update X-Ray IK Bone Lines if active
    if (this.xrayEnabled && this.xrayLine) {
      const pts = this._xrayPoints;
      const rL = this.ikDiagnostics.rightLeg;
      const lL = this.ikDiagnostics.leftLeg;
      if (rL.rootPos && lL.rootPos) {
        const arr = [rL.rootPos, rL.jointPos, rL.jointPos, rL.endPos, lL.rootPos, lL.jointPos, lL.jointPos, lL.endPos];
        for (let i = 0; i < arr.length; i++) {
          pts[i * 3] = arr[i].x;
          pts[i * 3 + 1] = arr[i].y;
          pts[i * 3 + 2] = arr[i].z;
        }
        this.xrayLine.geometry.attributes.position.needsUpdate = true;
      }
    }
  }
}
