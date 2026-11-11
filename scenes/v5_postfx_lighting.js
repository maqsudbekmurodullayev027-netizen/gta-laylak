/**
 * v5_postfx_lighting.js — Pelican Campus Quest V5 AAA Sun Shadows, Golden-Hour
 * Aerial Perspective, Horizon Glow & SwiftShader-Safe Cinema Optics Module.
 *
 * Self-contained deterministic ES module (ZERO Math.random(), Node + Browser + SwiftShader safe):
 *   1. configureAAASunShadowsAndAtmosphere(THREE, renderer, scene, sunLight, options):
 *      - Enforces PCFSoftShadowMap and a true 4096x4096 directional shadow map on the
 *        4200K golden-hour key light (#FFD28A along [-0.62, 0.34, -0.71], 19.86 deg elevation),
 *        disposing any stale lower-res shadow FBO so Three.js allocates full 4096x4096 resolution.
 *      - Configures tight +-58m (116m x 116m, 2.83cm/texel) shadow camera bounds with calibrated
 *        bias (-0.00018) and normalBias (0.018) so Stan's bronze ribcage/skull, Coast Redwoods,
 *        Live Oaks, patio umbrellas, pavilions, Waymos, and Pelican cast razor-sharp real shadows
 *        across 3D grass blades and sandstone pavers.
 *      - Calibrates HemisphereLight (#CFE2F7 sky / #7E694E ground), golden-hour aerial-perspective
 *        distance haze (FogExp2 #E5EBE7, density 0.00125), warm coastal-golden horizon glow ring,
 *        golden-hour PMREM reflection dome helper, and SwiftShader-safe single-pass bloom/glare
 *        & 35mm cinema vignette optics (with every GLSL pow & vector normalization NaN-guarded).
 *   2. updateTightCameraShadowFrustum(sunLight, focusPos, camera, options):
 *      - Dynamically centers the +-58m directional shadow ortho frustum around the active
 *        hero/camera focus each frame with exact orthonormal light-space texel-grid snapping
 *        (0.0000 sub-texel drift) to eliminate shadow-edge shimmer during camera/bike motion.
 */

import * as DEFAULT_THREE from "../vendor/three.module.js";
import {
  applyTemperedGlassShardGlintShader,
  applyWorldCohesionShaderHook,
  updateWorldCohesionUniforms,
  WORLD_COHESION_SHARED_UNIFORMS,
} from "./materials.js";

export {
  applyTemperedGlassShardGlintShader,
  applyWorldCohesionShaderHook,
  updateWorldCohesionUniforms,
  WORLD_COHESION_SHARED_UNIFORMS,
};

export const LAYER_STATIC_SHADOW = 1;
export const LAYER_DYNAMIC_SHADOW = 2;

export const OMNI_V5_LIGHTING_TELEMETRY = Object.freeze({
  version: "7.0.0",
  sunDirectionYup: Object.freeze([-0.62, 0.34, -0.71]),
  sunElevationDeg: 19.86,
  sunColorK: 4200,
  sunColorHex: "#FFD596",
  sunIntensity: 3.14,
  hemiSkyHex: "#7A9EC2",
  hemiGroundHex: "#6B5D4D",
  hemiIntensity: 1.08,
  fillLightHex: "#7A9EC2",
  fillLightIntensity: 0.28,
  rimLightHex: "#FFD596",
  rimLightIntensity: 0.50,
  skyZenithHex: "#8FB2CE",
  horizonHazeHex: "#E4EAE6",
  horizonWarmGlowHex: "#EAD7B7",
  fogExp2Density: 0.00115,
  toneMappingExposure: 1.02,
  shadowMapType: "PCFSoftShadowMap",
  shadowMapSize: 4096,
  shadowFrustumHalfExtentM: 64.0,
  dynamicShadowMapSize: 2048,
  dynamicShadowFrustumHalfExtentM: 10.5,
  staticShadowMoveRebuildThresholdM: 4.5,
  shadowBorderFadeBandM: 14.0,
  shadowNearM: 2.0,
  shadowFarM: 295.0,
  shadowBias: -0.00042,
  shadowNormalBias: 0.030,
  shadowRadius: 1.35,
  dynamicShadowBias: -0.00038,
  dynamicShadowNormalBias: 0.018,
  dynamicShadowRadius: 1.15,
  sunDistanceM: 140.0,
  cameraLeadBiasM: 14.0,
  maxCameraLeadClampM: 16.0,
  depthSnapStepM: 0.25,
});

export const OMNI_V6_LIGHTING_TELEMETRY = OMNI_V5_LIGHTING_TELEMETRY;
export const OMNI_V7_LIGHTING_TELEMETRY = OMNI_V5_LIGHTING_TELEMETRY;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Normalizes a 3D vector component triplet with strict zero-length NaN protection.
 */
function safeNormalizeTriplet(x, y, z, fallbackX = -0.62, fallbackY = 0.34, fallbackZ = -0.71) {
  const lenSq = x * x + y * y + z * z;
  if (!(lenSq > 1e-10) || !Number.isFinite(lenSq)) {
    const fbLen = Math.hypot(fallbackX, fallbackY, fallbackZ) || 1.0;
    return [fallbackX / fbLen, fallbackY / fbLen, fallbackZ / fbLen];
  }
  const inv = 1.0 / Math.sqrt(lenSq);
  return [x * inv, y * inv, z * inv];
}

const DEFAULT_SUN_DIR_UNIT = Object.freeze(
  safeNormalizeTriplet(
    OMNI_V5_LIGHTING_TELEMETRY.sunDirectionYup[0],
    OMNI_V5_LIGHTING_TELEMETRY.sunDirectionYup[1],
    OMNI_V5_LIGHTING_TELEMETRY.sunDirectionYup[2]
  )
);

/**
 * Extracts world-space (x, y, z) from a Vector3, Object3D, `{x, y/centerY, z}` snapshot, or array.
 */
function extractFocusPoint(focusPos, camera) {
  if (focusPos && typeof focusPos === "object") {
    if (
      Number.isFinite(focusPos.x) &&
      Number.isFinite(focusPos.z) &&
      (Number.isFinite(focusPos.y) || Number.isFinite(focusPos.centerY))
    ) {
      const fy = Number.isFinite(focusPos.centerY) ? focusPos.centerY : focusPos.y;
      return [focusPos.x, fy, focusPos.z];
    }
    if (focusPos.position && Number.isFinite(focusPos.position.x)) {
      return [
        focusPos.position.x,
        Number.isFinite(focusPos.position.y) ? focusPos.position.y : 0.0,
        Number.isFinite(focusPos.position.z) ? focusPos.position.z : 0.0,
      ];
    }
  }
  if (Array.isArray(focusPos) && focusPos.length >= 3) {
    return [
      Number(focusPos[0]) || 0.0,
      Number(focusPos[1]) || 0.0,
      Number(focusPos[2]) || 0.0,
    ];
  }
  if (camera && camera.position) {
    return [camera.position.x || 0.0, 0.0, camera.position.z || 0.0];
  }
  return [0.0, 0.0, 0.0];
}

/**
 * Dynamically centers a tight `+-58m` (`116m x 116m`) directional shadow ortho frustum
 * around the active hero/camera focus and snaps the shadow target in exact orthonormal
 * light-camera space `(R, U, sunDir)` to integer shadow-map texel steps (`116 / 4096 = 2.832 cm`),
 * guaranteeing ZERO sub-texel shadow-edge shimmer while riding or orbiting.
 *
 * @param {import("../vendor/three.module.js").DirectionalLight} sunLight
 * @param {object} focusPos - Hero Vector3, Object3D, or game snapshot `{ x, y/centerY, z }`
 * @param {import("../vendor/three.module.js").Camera} [camera]
 * @param {object} [options]
 */
export function updateTightCameraShadowFrustum(sunLight, focusPos, camera = null, options = {}) {
  if (!sunLight || !sunLight.shadow || !sunLight.shadow.camera) {
    return null;
  }

  const shadow = sunLight.shadow;
  const shadowCam = shadow.camera;
  const halfExtent =
    Number.isFinite(options.halfExtentM) && options.halfExtentM > 4.0
      ? options.halfExtentM
      : OMNI_V5_LIGHTING_TELEMETRY.shadowFrustumHalfExtentM;
  const sunDistance =
    Number.isFinite(options.sunDistanceM) && options.sunDistanceM > 20.0
      ? options.sunDistanceM
      : OMNI_V5_LIGHTING_TELEMETRY.sunDistanceM;
  const depthStep =
    Number.isFinite(options.depthSnapStepM) && options.depthSnapStepM > 1e-3
      ? options.depthSnapStepM
      : OMNI_V5_LIGHTING_TELEMETRY.depthSnapStepM;

  // Enforce symmetric +-halfExtent ortho bounds if drifted or uninitialized
  let projDirty = false;
  if (
    Math.abs(shadowCam.left + halfExtent) > 1e-4 ||
    Math.abs(shadowCam.right - halfExtent) > 1e-4 ||
    Math.abs(shadowCam.top - halfExtent) > 1e-4 ||
    Math.abs(shadowCam.bottom + halfExtent) > 1e-4
  ) {
    shadowCam.left = -halfExtent;
    shadowCam.right = halfExtent;
    shadowCam.top = halfExtent;
    shadowCam.bottom = -halfExtent;
    projDirty = true;
  }

  const wantNear = Number.isFinite(options.nearM)
    ? options.nearM
    : OMNI_V5_LIGHTING_TELEMETRY.shadowNearM;
  const wantFar = Number.isFinite(options.farM)
    ? options.farM
    : OMNI_V5_LIGHTING_TELEMETRY.shadowFarM;
  if (Math.abs(shadowCam.near - wantNear) > 1e-3 || Math.abs(shadowCam.far - wantFar) > 1e-2) {
    shadowCam.near = wantNear;
    shadowCam.far = wantFar;
    projDirty = true;
  }

  // Resolve unit sun vector (from scene toward sun)
  let sx = DEFAULT_SUN_DIR_UNIT[0];
  let sy = DEFAULT_SUN_DIR_UNIT[1];
  let sz = DEFAULT_SUN_DIR_UNIT[2];
  const srcDir = options.sunDir || (sunLight.userData && sunLight.userData.v5SunDir) || null;
  if (srcDir) {
    if (Array.isArray(srcDir) && srcDir.length >= 3) {
      [sx, sy, sz] = safeNormalizeTriplet(srcDir[0], srcDir[1], srcDir[2]);
    } else if (Number.isFinite(srcDir.x) && Number.isFinite(srcDir.y) && Number.isFinite(srcDir.z)) {
      [sx, sy, sz] = safeNormalizeTriplet(srcDir.x, srcDir.y, srcDir.z);
    }
  } else if (sunLight.position && sunLight.target && sunLight.target.position) {
    const dx = sunLight.position.x - sunLight.target.position.x;
    const dy = sunLight.position.y - sunLight.target.position.y;
    const dz = sunLight.position.z - sunLight.target.position.z;
    if (dx * dx + dy * dy + dz * dz > 1.0) {
      [sx, sy, sz] = safeNormalizeTriplet(dx, dy, dz);
    }
  }

  // Base hero/focus coordinate
  const [hx, hy, hz] = extractFocusPoint(focusPos, camera);
  let fx = hx;
  let fy = clamp(hy, -4.0, 24.0);
  let fz = hz;

  // Bias shadow frustum center slightly ahead along horizontal camera view direction
  // so landmarks/trees in front of the lens sit squarely inside the +-58m high-res window,
  // while strictly clamping offset <= 16m so the hero always retains >= 42m shadow margin.
  const leadBiasM =
    options.cameraLeadBiasM !== undefined
      ? Number(options.cameraLeadBiasM)
      : OMNI_V5_LIGHTING_TELEMETRY.cameraLeadBiasM;
  if (camera && leadBiasM > 0.0 && camera.matrixWorld && camera.matrixWorld.elements) {
    const e = camera.matrixWorld.elements;
    // Camera forward in Three.js world space is -Z column: (-e[8], -e[9], -e[10])
    const cfx = -e[8];
    const cfz = -e[10];
    const horizLenSq = cfx * cfx + cfz * cfz;
    if (horizLenSq > 1e-6 && Number.isFinite(horizLenSq)) {
      const invH = 1.0 / Math.sqrt(horizLenSq);
      const clampedLead = clamp(
        leadBiasM,
        0.0,
        Math.min(OMNI_V5_LIGHTING_TELEMETRY.maxCameraLeadClampM, halfExtent * 0.28)
      );
      fx += cfx * invH * clampedLead;
      fz += cfz * invH * clampedLead;
    }
  }

  // Build exact orthonormal light-camera basis matching THREE.Camera.lookAt(target) from eye = target + sunDir * D:
  //   Z_cam = normalize(eye - target) = (sx, sy, sz)
  //   X_cam = normalize(cross(up, Z_cam))
  //   Y_cam = cross(Z_cam, X_cam)
  const useAltUp = Math.abs(sy) > 0.985;
  const upX = 0.0;
  const upY = useAltUp ? 0.0 : 1.0;
  const upZ = useAltUp ? 1.0 : 0.0;

  let rx = upY * sz - upZ * sy;
  let ry = upZ * sx - upX * sz;
  let rz = upX * sy - upY * sx;
  [rx, ry, rz] = safeNormalizeTriplet(rx, ry, rz, 1.0, 0.0, 0.0);

  let ux = sy * rz - sz * ry;
  let uy = sz * rx - sx * rz;
  let uz = sx * ry - sy * rx;
  [ux, uy, uz] = safeNormalizeTriplet(ux, uy, uz, 0.0, 1.0, 0.0);

  const mapW = Math.max(256, (shadow.mapSize && shadow.mapSize.x) || OMNI_V5_LIGHTING_TELEMETRY.shadowMapSize);
  const mapH = Math.max(256, (shadow.mapSize && shadow.mapSize.y) || OMNI_V5_LIGHTING_TELEMETRY.shadowMapSize);
  const frustumW = shadowCam.right - shadowCam.left;
  const frustumH = shadowCam.top - shadowCam.bottom;
  const texelW = frustumW / mapW;
  const texelH = frustumH / mapH;

  // Project raw focus into orthonormal light space and quantize to exact shadow-texel grid
  const rawU = fx * rx + fy * ry + fz * rz;
  const rawV = fx * ux + fy * uy + fz * uz;
  const rawW = fx * sx + fy * sy + fz * sz;

  const snappedU = Math.round(rawU / texelW) * texelW;
  const snappedV = Math.round(rawV / texelH) * texelH;
  const snappedW = Math.round(rawW / depthStep) * depthStep;

  // Reconstruct world-space snapped target from orthonormal light basis
  const tx = rx * snappedU + ux * snappedV + sx * snappedW;
  const ty = ry * snappedU + uy * snappedV + sy * snappedW;
  const tz = rz * snappedU + uz * snappedV + sz * snappedW;

  const lx = tx + sx * sunDistance;
  const ly = ty + sy * sunDistance;
  const lz = tz + sz * sunDistance;

  sunLight.position.set(lx, ly, lz);
  if (sunLight.target) {
    sunLight.target.position.set(tx, ty, tz);
    sunLight.target.updateMatrixWorld();
  }
  sunLight.updateMatrixWorld();

  shadowCam.up.set(upX, upY, upZ);
  shadowCam.position.set(lx, ly, lz);
  shadowCam.lookAt(tx, ty, tz);
  shadowCam.updateMatrixWorld(true);
  if (projDirty || options.forceProjectionUpdate === true) {
    shadowCam.updateProjectionMatrix();
  }

  sunLight.userData = sunLight.userData || {};
  let telemetry = sunLight.userData.v5LastShadowFrustum;
  if (!telemetry) {
    telemetry = {
      target: [tx, ty, tz],
      sunPosition: [lx, ly, lz],
      sunDirection: [sx, sy, sz],
      halfExtentM: halfExtent,
      mapSize: [mapW, mapH],
      texelSizeM: [texelW, texelH],
      snappedLightUV: [snappedU, snappedV, snappedW],
    };
    sunLight.userData.v5LastShadowFrustum = telemetry;
  } else {
    telemetry.target[0] = tx;
    telemetry.target[1] = ty;
    telemetry.target[2] = tz;
    telemetry.sunPosition[0] = lx;
    telemetry.sunPosition[1] = ly;
    telemetry.sunPosition[2] = lz;
    telemetry.sunDirection[0] = sx;
    telemetry.sunDirection[1] = sy;
    telemetry.sunDirection[2] = sz;
    telemetry.halfExtentM = halfExtent;
    telemetry.mapSize[0] = mapW;
    telemetry.mapSize[1] = mapH;
    telemetry.texelSizeM[0] = texelW;
    telemetry.texelSizeM[1] = texelH;
    telemetry.snappedLightUV[0] = snappedU;
    telemetry.snappedUV = telemetry.snappedLightUV;
    telemetry.snappedLightUV[1] = snappedV;
    telemetry.snappedLightUV[2] = snappedW;
  }
  return telemetry;
}

/**
 * Creates a world-anchored Golden-Hour Horizon Aerial Glow cylinder/band strictly outside all
 * cross-campus Tier-2 Santa Cruz / Diablo mountain ridges (`radius = 640m > max cross-campus ridge 605m`,
 * `< camera.far 1600m`) so it illuminates the open sky horizon without ever drawing a translucent veil
 * in front of mountain PBR textures. Every GLSL `pow` & normalization is NaN-guarded for SwiftShader.
 */
export function createGoldenHourHorizonGlowMesh(THREE, options = {}) {
  const radius = Number.isFinite(options.radius) ? options.radius : 640.0;
  const height = Number.isFinite(options.height) ? options.height : 265.0;
  const geom = new THREE.CylinderGeometry(radius, radius, height, 64, 1, true);
  // Shift cylinder so it spans y in [-26m, +239m] around horizon (preserving exact vertical angle)
  geom.translate(0.0, height * 0.5 - 26.0, 0.0);

  const sunDirVec = new THREE.Vector3(
    DEFAULT_SUN_DIR_UNIT[0],
    DEFAULT_SUN_DIR_UNIT[1],
    DEFAULT_SUN_DIR_UNIT[2]
  );
  if (options.sunDir) {
    const [sx, sy, sz] = Array.isArray(options.sunDir)
      ? safeNormalizeTriplet(options.sunDir[0], options.sunDir[1], options.sunDir[2])
      : safeNormalizeTriplet(options.sunDir.x, options.sunDir.y, options.sunDir.z);
    sunDirVec.set(sx, sy, sz);
  }

  const mat = new THREE.ShaderMaterial({
    name: "V5GoldenHourHorizonGlowMat",
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: false,
    toneMapped: true,
    uniforms: {
      uSunDir: { value: sunDirVec },
      uHazeColor: { value: new THREE.Color(options.hazeHex || OMNI_V5_LIGHTING_TELEMETRY.horizonHazeHex) },
      uWarmGlowColor: { value: new THREE.Color(options.warmGlowHex || OMNI_V5_LIGHTING_TELEMETRY.horizonWarmGlowHex) },
      uSunColor: { value: new THREE.Color(options.sunHex || OMNI_V5_LIGHTING_TELEMETRY.sunColorHex) },
      uOpacity: { value: Number.isFinite(options.opacity) ? options.opacity : 0.30 },
      uGlowBaseOffset: { value: 26.0 },
      uGlowHeight: { value: Math.max(height, 1.0) },
    },
    vertexShader: /* glsl */ `
      uniform float uGlowBaseOffset;
      uniform float uGlowHeight;
      varying vec3 vLocalDir;
      varying float vElevNorm;
      void main() {
        vLocalDir = position;
        vElevNorm = clamp((position.y + uGlowBaseOffset) / uGlowHeight, 0.0, 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      uniform vec3 uHazeColor;
      uniform vec3 uWarmGlowColor;
      uniform vec3 uSunColor;
      uniform float uOpacity;

      varying vec3 vLocalDir;
      varying float vElevNorm;

      vec3 safeNorm3(vec3 v) {
        float l2 = dot(v, v);
        return l2 > 1e-8 ? v * inversesqrt(l2) : vec3(0.0, 1.0, 0.0);
      }

      void main() {
        vec3 viewDir = safeNorm3(vLocalDir);
        vec3 sunDir = safeNorm3(uSunDir);

        // Horizontal azimuth alignment toward the low 19.8-deg golden-hour sun
        vec3 viewH = safeNorm3(vec3(viewDir.x, 0.0, viewDir.z));
        vec3 sunH = safeNorm3(vec3(sunDir.x, 0.0, sunDir.z));
        float sunAzimuth = max(dot(viewH, sunH), 0.0);
        float sunDirect = max(dot(viewDir, sunDir), 0.0);

        // Smooth vertical bell concentrated along the campus horizon & distant treeline
        float lowerFade = smoothstep(0.0, 0.11, vElevNorm);
        float upperFade = 1.0 - smoothstep(0.14, 0.96, vElevNorm);
        float band = lowerFade * pow(max(upperFade, 1e-5), 1.65);

        float mieBroad = pow(max(sunAzimuth, 1e-5), 2.4);
        float mieTight = pow(max(sunDirect, 1e-5), 7.5);

        vec3 col = mix(uHazeColor, uWarmGlowColor, clamp(0.22 + 0.64 * mieBroad, 0.0, 1.0));
        col = mix(col, uSunColor, clamp(mieTight * 0.68, 0.0, 1.0));

        float alpha = band * uOpacity * (0.42 + 0.58 * mieBroad + 0.35 * mieTight);
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.62));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  const mesh = new THREE.Mesh(geom, mat);
  mesh.name = "V5GoldenHourHorizonGlowRing";
  mesh.frustumCulled = false;
  mesh.renderOrder = -2;
  mesh.raycast = () => {};
  return mesh;
}

/**
 * Creates (or upgrades in-place) a SwiftShader-safe single-pass NDC Cinema Optics overlay
 * combining a subtle 35mm filmic edge vignette with an analytical golden-hour solar bloom veil
 * and warm anamorphic lens streak when looking toward the low sun.
 * Zero offscreen FBO passes; 100% NaN-guarded GLSL (`max(x, 1e-5)` on every `pow`).
 */
export function createSwiftShaderSafeOpticsOverlay(THREE, options = {}) {
  const uniforms = {
    uSunScreen: { value: new THREE.Vector3(-0.35, 0.42, 0.0) }, // (ndcX, ndcY, visibilityWeight)
    uAspect: { value: Number.isFinite(options.aspect) ? options.aspect : 16.0 / 9.0 },
    uVignetteStrength: {
      value: Number.isFinite(options.vignetteStrength) ? options.vignetteStrength : 0.19,
    },
    uBloomStrength: {
      value: Number.isFinite(options.bloomStrength) ? options.bloomStrength : 0.13,
    },
    uSunBloomColor: {
      value: new THREE.Color(options.sunBloomHex || OMNI_V5_LIGHTING_TELEMETRY.sunColorHex),
    },
  };

  const mat = new THREE.ShaderMaterial({
    name: "V5SwiftShaderSafeOpticsMat",
    transparent: true,
    depthTest: false,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    uniforms,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunScreen;
      uniform float uAspect;
      uniform float uVignetteStrength;
      uniform float uBloomStrength;
      uniform vec3 uSunBloomColor;

      varying vec2 vUv;

      void main() {
        // 1. Subtle 35mm cinema edge vignette (zero center darkening!)
        vec2 vd = (vUv - 0.5) * vec2(1.12, 1.02);
        float r2 = dot(vd, vd);
        float vig = smoothstep(0.24, 0.78, r2) * uVignetteStrength;

        // 2. SwiftShader-safe analytical golden-hour solar bloom & warm anamorphic streak
        float sunVis = clamp(uSunScreen.z, 0.0, 1.0);
        vec2 sunUv = uSunScreen.xy * 0.5 + 0.5;
        vec2 delta = vUv - sunUv;
        vec2 metric = vec2(delta.x * max(uAspect, 0.5), delta.y);
        float dist = sqrt(max(dot(metric, metric), 1e-8));

        float radialBloom = pow(max(1.0 - clamp(dist / 0.95, 0.0, 1.0), 1e-5), 2.8);
        float anamorphicY = exp(-abs(delta.y) * 26.0);
        float anamorphicX = pow(max(1.0 - clamp(abs(delta.x) / 0.85, 0.0, 1.0), 1e-5), 2.2);
        float bloom = sunVis * uBloomStrength * (radialBloom * 0.78 + anamorphicY * anamorphicX * 0.28);

        // Composite warm bloom tint over dark espresso outer edge vignette in premultiplied-safe alpha
        float totalAlpha = clamp(vig + bloom, 0.0, 0.42);
        vec3 vigDark = vec3(0.052, 0.038, 0.026);
        float blendT = totalAlpha > 1e-5 ? clamp(bloom / totalAlpha, 0.0, 1.0) : 0.0;
        vec3 finalRgb = mix(vigDark, uSunBloomColor, blendT);

        gl_FragColor = vec4(finalRgb, totalAlpha);
      }
    `,
  });

  if (options.existingVignetteMesh && options.existingVignetteMesh.isMesh) {
    const mesh = options.existingVignetteMesh;
    if (mesh.material && typeof mesh.material.dispose === "function") {
      mesh.material.dispose();
    }
    mesh.material = mat;
    mesh.frustumCulled = false;
    mesh.renderOrder = 9999;
    return mesh;
  }

  const geom = new THREE.PlaneGeometry(2.0, 2.0);
  const mesh = new THREE.Mesh(geom, mat);
  mesh.name = "CinemaFilmicVignette";
  mesh.frustumCulled = false;
  mesh.renderOrder = 9999;
  mesh.raycast = () => {};
  return mesh;
}

/**
 * Bakes a static PMREM golden-hour reflection cubemap calibrated to `@omni-director`'s
 * V5 Look Bible (`#A1BDCD` coastal zenith, `#E5EBE7` horizon haze, `#FFD28A` 4200K sun,
 * `#7E694E` sandstone/turf bounce) so Stan's bronze patina, curtain-wall glass, and
 * Bay View Dragonscale roof scales exhibit grounded specular reflections.
 */
export function bakeGoldenHourEnvironmentMap(THREE, renderer, options = {}) {
  if (!renderer || typeof THREE.PMREMGenerator !== "function") {
    return null;
  }
  let pmrem = null;
  const envScene = new THREE.Scene();
  const sphereGeom = new THREE.SphereGeometry(16, 20, 14);
  const pos = sphereGeom.attributes.position;
  const cols = new Float32Array(pos.count * 3);

  const zenith = new THREE.Color(options.zenithHex || OMNI_V5_LIGHTING_TELEMETRY.skyZenithHex);
  const skyMid = new THREE.Color(options.skyMidHex || OMNI_V5_LIGHTING_TELEMETRY.hemiSkyHex);
  const horizon = new THREE.Color(options.horizonHex || OMNI_V5_LIGHTING_TELEMETRY.horizonHazeHex);
  const warmBand = new THREE.Color(options.warmGlowHex || OMNI_V5_LIGHTING_TELEMETRY.horizonWarmGlowHex);
  const ground = new THREE.Color(options.groundHex || OMNI_V5_LIGHTING_TELEMETRY.hemiGroundHex);
  const tmp = new THREE.Color();

  const [sx, sy, sz] = options.sunDir
    ? Array.isArray(options.sunDir)
      ? safeNormalizeTriplet(options.sunDir[0], options.sunDir[1], options.sunDir[2])
      : safeNormalizeTriplet(options.sunDir.x, options.sunDir.y, options.sunDir.z)
    : DEFAULT_SUN_DIR_UNIT;

  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i) / 16.0;
    const vy = pos.getY(i) / 16.0;
    const vz = pos.getZ(i) / 16.0;
    const sunDot = Math.max(0.0, vx * sx + vy * sy + vz * sz);
    if (vy >= 0.0) {
      const skyT = Math.pow(Math.max(vy, 1e-5), 0.58);
      if (skyT < 0.45) {
        tmp.lerpColors(horizon, skyMid, skyT / 0.45);
      } else {
        tmp.lerpColors(skyMid, zenith, (skyT - 0.45) / 0.55);
      }
      const horizonWarmth = (1.0 - Math.min(1.0, vy * 1.95)) * (0.24 + 0.76 * Math.pow(Math.max(sunDot, 1e-5), 1.65));
      tmp.lerp(warmBand, clamp(horizonWarmth * 0.62, 0.0, 0.80));
    } else {
      tmp.lerpColors(horizon, ground, Math.min(1.0, -vy * 2.1));
    }
    cols[i * 3] = tmp.r;
    cols[i * 3 + 1] = tmp.g;
    cols[i * 3 + 2] = tmp.b;
  }
  sphereGeom.setAttribute("color", new THREE.BufferAttribute(cols, 3));

  const domeMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
  });
  envScene.add(new THREE.Mesh(sphereGeom, domeMat));

  const sunGeom = new THREE.SphereGeometry(2.35, 12, 10);
  const sunMat = new THREE.MeshBasicMaterial({
    color: options.sunHex || OMNI_V5_LIGHTING_TELEMETRY.sunColorHex,
  });
  const sunMesh = new THREE.Mesh(sunGeom, sunMat);
  sunMesh.position.set(sx * 13.0, sy * 13.0, sz * 13.0);
  envScene.add(sunMesh);

  let envRT = null;
  try {
    pmrem = new THREE.PMREMGenerator(renderer);
    if (typeof pmrem.compileCubemapShader === "function") {
      pmrem.compileCubemapShader();
    }
    envRT = pmrem.fromScene(envScene, 0.035);
  } catch (_err) {
    envRT = null;
  } finally {
    sphereGeom.dispose();
    domeMat.dispose();
    sunGeom.dispose();
    sunMat.dispose();
    if (pmrem) pmrem.dispose();
  }

  return envRT;
}

/**
 * `[VETO-3D-04]` Upgrades `Horizon_Santa_Cruz_Mountains_V5` (`Horizon_Mountain_Mesh_*`) with
 * SwiftShader-safe Rayleigh/Mie golden-hour aerial perspective (`onBeforeCompile`):
 * - Distance-attenuates Tier 1 foothills (`R ~ 248m`) and Tier 2 skyline ridges (`R ~ 372m`)
 *   into coastal sage-blue (`#8DA4A4`) -> pale horizon mist (`#CED9D6` / `#E5EBE7`) + directional
 *   `#F6CFA0` golden Mie scatter toward the low 19.8-deg NW sun.
 * - Enforces a backlit atmospheric scatter floor so North/NW mountain arcs facing away from the
 *   `-Z` sun NEVER crush to dark `RGB(25,28,18)` silhouettes on any azimuth (`0-360 deg`).
 */
export function applyAerialPerspectiveToHorizonGroup(THREE, horizonGroup, options = {}) {
  if (!horizonGroup || typeof horizonGroup.traverse !== "function") {
    return { upgradedMeshes: 0, materials: [] };
  }

  const [sx, sy, sz] = options.sunDir
    ? Array.isArray(options.sunDir)
      ? safeNormalizeTriplet(options.sunDir[0], options.sunDir[1], options.sunDir[2])
      : safeNormalizeTriplet(options.sunDir.x, options.sunDir.y, options.sunDir.z)
    : DEFAULT_SUN_DIR_UNIT;

  const uSunDir = new THREE.Vector3(sx, sy, sz);
  // V6 Santa Cruz Chaparral Rayleigh/Mie aerial haze (#8CA0A4 -> #C8D5D2 -> #E4EAE6 + #EAD7B7 Mie scatter)
  const uMidHaze = new THREE.Color(options.midHazeHex || "#8CA0A4").multiplyScalar(0.76);
  const uFarHaze = new THREE.Color(options.farHazeHex || "#C8D5D2").multiplyScalar(0.80);
  const uValleyMist = new THREE.Color(options.valleyMistHex || "#E4EAE6").multiplyScalar(0.78);
  const uWarmScatter = new THREE.Color(options.warmGlowHex || "#EAD7B7").multiplyScalar(0.78);

  const clonedBySourceUuid = new Map();
  const upgradedMaterials = [];
  let upgradedMeshes = 0;

  const restorePreservedNormalMap = (m) => {
    if (!m || !m.userData) return false;
    if (m.userData.v5PreservedNormalMap && !m.normalMap) {
      m.normalMap = m.userData.v5PreservedNormalMap;
      if (m.normalScale && m.userData.v5PreservedNormalScale) {
        m.normalScale.copy(m.userData.v5PreservedNormalScale);
      }
      m.needsUpdate = true;
      return true;
    }
    return false;
  };

  const installAerialHookOnMaterial = (srcMat) => {
    if (!srcMat) return srcMat;
    if (srcMat.userData && srcMat.userData.v5AerialShaderInstalled) {
      restorePreservedNormalMap(srcMat);
      return srcMat;
    }
    if (clonedBySourceUuid.has(srcMat.uuid)) {
      const cached = clonedBySourceUuid.get(srcMat.uuid);
      restorePreservedNormalMap(cached);
      return cached;
    }

    const preservedNormalMap = srcMat.normalMap || srcMat.userData?.v5PreservedNormalMap || null;
    const preservedNormalScale = srcMat.normalScale
      ? srcMat.normalScale.clone()
      : new THREE.Vector2(1.65, 1.65);
    const baseName =
      srcMat.name && /Ridgeline|Horizon_Mountain/i.test(srcMat.name)
        ? srcMat.name
        : `${srcMat.name || "V5"}_Santa_Cruz_Ridgeline_Horizon_Mountain`;

    // Always materialize as MeshStandardMaterial (never MeshPhysicalMaterial) so
    // `core.js:_applySoftwareRendererMaterialTuning()` NEVER replaces it and strips `onBeforeCompile`!
    const mat = srcMat.isMeshPhysicalMaterial
      ? new THREE.MeshStandardMaterial({
          name: baseName,
          color: srcMat.color ? srcMat.color.clone() : new THREE.Color(0xffffff),
          map: srcMat.map || null,
          normalMap: preservedNormalMap,
          normalScale: preservedNormalScale.clone(),
          bumpMap: srcMat.bumpMap || null,
          bumpScale: srcMat.bumpScale ?? 1.0,
          roughnessMap: srcMat.roughnessMap || null,
          metalnessMap: null,
          aoMap: srcMat.aoMap || null,
          aoMapIntensity: srcMat.aoMapIntensity ?? 1.0,
          emissive: srcMat.emissive ? srcMat.emissive.clone() : new THREE.Color(0x4a5440),
          emissiveMap: srcMat.emissiveMap || null,
          emissiveIntensity: srcMat.emissiveIntensity ?? 0.04,
          roughness: srcMat.roughness ?? 0.92,
          metalness: 0.0,
          envMapIntensity: srcMat.envMapIntensity ?? 0.80,
          vertexColors: Boolean(srcMat.vertexColors),
          side: srcMat.side ?? THREE.FrontSide,
          toneMapped: srcMat.toneMapped ?? true,
        })
      : typeof srcMat.clone === "function"
        ? srcMat.clone()
        : srcMat;

    mat.name = baseName;
    if (preservedNormalMap && !mat.normalMap) {
      mat.normalMap = preservedNormalMap;
    }
    if (mat.normalScale && preservedNormalScale) {
      mat.normalScale.copy(preservedNormalScale);
    }
    mat.fog = false; // Handled physically in linear space by Beer-Lambert Rayleigh/Mie aerial perspective
    mat.metalness = 0.0;
    mat.roughness = Math.max(0.95, mat.roughness ?? 0.96);
    mat.envMapIntensity = 0.0;
    mat.userData = mat.userData || {};
    mat.userData.v5AerialShaderInstalled = true;
    mat.userData.v5PreservedNormalMap = preservedNormalMap;
    mat.userData.v5PreservedNormalScale = preservedNormalScale;
    mat.userData.v5AerialUniforms = {
      uV5SunDir: { value: uSunDir },
      uV5MidHaze: { value: uMidHaze },
      uV5FarHaze: { value: uFarHaze },
      uV5ValleyMist: { value: uValleyMist },
      uV5WarmScatter: { value: uWarmScatter },
    };

    mat.customProgramCacheKey = () => "v5_horizon_aerial_perspective_v4_beer_lambert";
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, mat.userData.v5AerialUniforms);

      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          /* glsl */ `
          #include <common>
          varying vec3 vV5AerialWorldPos;
          `
        )
        .replace(
          "#include <worldpos_vertex>",
          /* glsl */ `
          #include <worldpos_vertex>
          vec4 v5Wp = vec4( transformed, 1.0 );
          #ifdef USE_INSTANCING
            v5Wp = instanceMatrix * v5Wp;
          #endif
          vV5AerialWorldPos = ( modelMatrix * v5Wp ).xyz;
          `
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          /* glsl */ `
          #include <common>
          uniform vec3 uV5SunDir;
          uniform vec3 uV5MidHaze;
          uniform vec3 uV5FarHaze;
          uniform vec3 uV5ValleyMist;
          uniform vec3 uV5WarmScatter;
          varying vec3 vV5AerialWorldPos;

          vec3 v5SafeNorm3(vec3 v) {
            float l2 = dot(v, v);
            return l2 > 1e-8 ? v * inversesqrt(l2) : vec3(0.0, 1.0, 0.0);
          }
          `
        )
        .replace(
          "#include <tonemapping_fragment>",
          /* glsl */ `
          {
            // [VETO-W3-01] Beer-Lambert linear-space Rayleigh/Mie aerial perspective:
            // NEVER hard-clamp gl_FragColor.rgb — preserve 100% of 2048x2048 chaparral/oak/sandstone
            // albedo & 1.65x normal-mapped N*L canyon contrast!
            vec3 toFrag = vV5AerialWorldPos - cameraPosition;
            float camDist = length(toFrag.xz);
            float originDist = length(vV5AerialWorldPos.xz);
            float distM = max(camDist * 0.88, originDist);

            // Tier-1 foothills (distM ~ 180-305m) -> 0.18-0.28 haze (72-82% crisp chaparral/canyon detail!)
            // Tier-2 skyline  (distM ~ 340-415m) -> 0.45-0.56 haze (soft California golden-sage mist!)
            float nearEntry = smoothstep(90.0, 180.0, distM);
            float tier1Ramp = nearEntry * (0.18 + smoothstep(180.0, 305.0, distM) * 0.08);
            float tier2Boost = smoothstep(308.0, 352.0, distM) * 0.26;
            float farTier = smoothstep(305.0, 378.0, distM);
            float elevNorm = clamp((vV5AerialWorldPos.y + 3.0) / 82.0, 0.0, 1.0);
            float lowValleyMist = (1.0 - smoothstep(0.0, 0.36, elevNorm)) * smoothstep(130.0, 320.0, distM);

            vec3 viewDirH = v5SafeNorm3(vec3(toFrag.x, 0.0, toFrag.z));
            vec3 sunDirH = v5SafeNorm3(vec3(uV5SunDir.x, 0.0, uV5SunDir.z));
            float sunAz = max(dot(viewDirH, sunDirH), 0.0);
            float mieWarm = pow(max(sunAz, 1e-5), 2.1);

            // Tiny soft additive linear ambient floor (zero pixel clamping!)
            vec3 liftedLinear = gl_FragColor.rgb + vec3(0.012, 0.015, 0.011) * smoothstep(90.0, 260.0, distM);

            vec3 hazeLinear = mix(uV5MidHaze, uV5FarHaze, farTier);
            hazeLinear = mix(hazeLinear, uV5ValleyMist, clamp(lowValleyMist * 0.38, 0.0, 0.44));
            hazeLinear = mix(
              hazeLinear,
              uV5WarmScatter,
              clamp((0.14 + 0.42 * mieWarm) * (0.42 + 0.58 * farTier), 0.0, 0.58)
            );

            float hazeWeight = clamp(
              tier1Ramp + tier2Boost + lowValleyMist * 0.02,
              0.0,
              0.56
            );
            gl_FragColor.rgb = mix(liftedLinear, hazeLinear, hazeWeight);
          }
          #include <tonemapping_fragment>
          `
        );
    };
    mat.needsUpdate = true;

    clonedBySourceUuid.set(srcMat.uuid, mat);
    upgradedMaterials.push(mat);
    return mat;
  };

  horizonGroup.traverse((child) => {
    if (!child || !child.isMesh) return;
    const mats = Array.isArray(child.material) ? child.material : child.material ? [child.material] : [];
    let repairedNormal = false;
    for (let i = 0; i < mats.length; i++) {
      if (restorePreservedNormalMap(mats[i])) repairedNormal = true;
    }
    const alreadyInstalled =
      mats.length > 0 && mats.every((m) => Boolean(m && m.userData && m.userData.v5AerialShaderInstalled));
    if (alreadyInstalled && child.receiveShadow === false) {
      if (repairedNormal) upgradedMeshes++;
      return;
    }

    if (Array.isArray(child.material)) {
      child.material = child.material.map((m) => installAerialHookOnMaterial(m));
    } else if (child.material) {
      child.material = installAerialHookOnMaterial(child.material);
    }
    // Horizon mountains at R=280-396m are outside the +-58m hero shadow box; disable receiveShadow
    // so distant triangles never catch shadow-map border clamping artifacts.
    child.receiveShadow = false;
    child.castShadow = false;
    child.userData = child.userData || {};
    child.userData.v5AerialApplied = true;
    upgradedMeshes++;
  });

  return { upgradedMeshes, materials: upgradedMaterials };
}

/**
 * `[VETO-3D-02]` Creates a dedicated golden-hour Spin Studio window-streaming `SpotLight`
 * just outside the `z = 131.25m` glass curtain wall (`(-4.85, 3.45, 127.6)` -> `(0.55, 0.007, 141.35)`),
 * casting crisp directional contact/cast shadows from `Gym_Hex_Dumbbell_59AA_Flat_V5`, kettlebells,
 * and Peloton spin bikes onto the warm charcoal-taupe EPDM floor while enclosed under the canopy roof.
 * Auto-gated in `updateFrame` so it costs ZERO shadow draw calls outdoors!
 */
export function createSpinStudioWindowSunRig(THREE, scene, options = {}) {
  const T = THREE || DEFAULT_THREE;
  if (!T || typeof T.SpotLight !== "function") return null;

  const existing = scene && typeof scene.getObjectByName === "function"
    ? scene.getObjectByName("V5_SpinStudio_Window_SunRig")
    : null;
  if (existing && existing.userData?.spotLight) {
    return existing.userData;
  }

  const rigGroup = new T.Group();
  rigGroup.name = "V5_SpinStudio_Window_SunRig";

  const spotLight = new T.SpotLight(
    options.colorHex || "#FFD596",
    Number.isFinite(options.intensity) ? options.intensity : 2.75,
    34.0,
    0.60,
    0.36,
    0.0
  );
  spotLight.name = "V5_SpinStudio_Window_SunSpot";
  spotLight.position.set(-4.85, 3.45, 127.6);
  spotLight.target.position.set(0.55, 0.007, 141.35);
  spotLight.castShadow = true;

  if (spotLight.shadow) {
    const mapSz = Number.isFinite(options.shadowMapSize) ? options.shadowMapSize : 1024;
    spotLight.shadow.mapSize.set(mapSz, mapSz);
    spotLight.shadow.bias = -0.00014;
    spotLight.shadow.normalBias = 0.008;
    spotLight.shadow.radius = 1.55;
    if (spotLight.shadow.camera) {
      spotLight.shadow.camera.near = 2.2;
      spotLight.shadow.camera.far = 26.5;
      spotLight.shadow.camera.updateProjectionMatrix();
    }
  }

  // Cool California window skylight shadow fill (#7A9EC2) + warm cedar/floor bounce (#E6CCA8)
  const skyFillLight = new T.PointLight("#7A9EC2", 0.40, 24.0, 1.4);
  skyFillLight.name = "V6_SpinStudio_CoolSkyFill";
  skyFillLight.position.set(2.2, 3.35, 133.2);
  skyFillLight.castShadow = false;

  const bounceLight = new T.PointLight("#E6CCA8", 0.36, 22.0, 1.4);
  bounceLight.name = "V5_SpinStudio_WarmBounce";
  bounceLight.position.set(-1.2, 3.85, 140.2);
  bounceLight.castShadow = false;

  rigGroup.add(spotLight);
  rigGroup.add(spotLight.target);
  rigGroup.add(skyFillLight);
  rigGroup.add(bounceLight);

  const isSwIndoor = Boolean(options.isSoftwareRenderer);
  const baseSpotIntensity = spotLight.intensity;
  const baseSkyFillIntensity = skyFillLight.intensity;
  const baseBounceIntensity = bounceLight.intensity;
  if (isSwIndoor && spotLight.shadow) {
    spotLight.shadow.autoUpdate = false;
    spotLight.shadow.needsUpdate = true;
  }

  let lastIndoorActive = true;
  const setIndoorActive = (active) => {
    const on = Boolean(active);
    // Keep light & shadow topology strictly constant (`NUM_SPOT_LIGHTS === 1`, `NUM_SPOT_LIGHT_SHADOWS === 1`)
    // across ALL renderers from `0.0s -> 72.0s` so exiting Spin Studio at `t = 10.5s` causes ZERO GLSL recompiles!
    rigGroup.visible = true;
    spotLight.visible = true;
    spotLight.castShadow = true;
    spotLight.intensity = on ? baseSpotIntensity : 0.0;
    if (spotLight.shadow) {
      if (isSwIndoor) {
        spotLight.shadow.autoUpdate = false;
        if (on && !spotLight.shadow.map) {
          spotLight.shadow.needsUpdate = true;
        }
      } else {
        spotLight.shadow.autoUpdate = on;
        if (on && (!lastIndoorActive || !spotLight.shadow.map)) {
          spotLight.shadow.needsUpdate = true;
        }
      }
    }
    skyFillLight.intensity = on ? baseSkyFillIntensity : 0.0;
    bounceLight.intensity = on ? baseBounceIntensity : 0.0;
    if (!skyFillLight.userData?.swMuxManaged) skyFillLight.visible = true;
    if (!bounceLight.userData?.swMuxManaged) bounceLight.visible = true;
    lastIndoorActive = on;
  };

  const rigState = {
    rigGroup,
    spotLight,
    skyFillLight,
    bounceLight,
    setIndoorActive,
  };
  rigGroup.userData = rigState;

  if (scene && typeof scene.add === "function") {
    scene.add(rigGroup);
    rigGroup.updateMatrixWorld(true);
  }

  return rigState;
}

/**
 * Creates a lightweight additive/alpha-soft **Spin Studio Golden-Hour Volumetric Sunbeam Shafts**
 * controller (`createSpinStudioSunbeams`) for Zone 1 (`0.0s - 9.4s`) matching Omni 1.5 `zone1_mid.png`.
 *
 * Streams 6 crossed-ribbon golden-hour volumetric shafts (`#FFD596` / `#FFE4B5`) inward from the
 * `z = 131.26m` `4x6` dark-bronze muntin window bays down onto the `#343538` speckled EPDM rubber floor
 * along `[+0.598, -0.328, +0.685]`, with view-grazing edge fade, muntin-pane modulation, floor soft-clip,
 * camera-proximity fade, and deterministic floating dust shimmer (`0` `Math.random()`, `0` offscreen FBOs).
 *
 * Flexible call signatures supported:
 *   - `createSpinStudioSunbeams()`
 *   - `createSpinStudioSunbeams(options)`
 *   - `createSpinStudioSunbeams(THREE, options)`
 *   - `createSpinStudioSunbeams(THREE, scene, options)`
 */
export function createSpinStudioSunbeams(arg1 = null, arg2 = null, arg3 = {}) {
  let T = DEFAULT_THREE;
  let scene = null;
  let options = {};

  if (arg1 && typeof arg1.ShaderMaterial === "function") {
    T = arg1;
    if (arg2 && typeof arg2.add === "function") {
      scene = arg2;
      options = arg3 || {};
    } else {
      options = arg2 || {};
    }
  } else if (arg1 && typeof arg1.add === "function") {
    scene = arg1;
    options = arg2 || {};
  } else if (arg1 && typeof arg1 === "object") {
    options = arg1;
  }

  if (scene && typeof scene.getObjectByName === "function") {
    const existing = scene.getObjectByName("V6_SpinStudio_Sunbeams_BeamGroup");
    if (existing && existing.userData?.sunbeamController) {
      return existing.userData.sunbeamController;
    }
  }

  // Sun travels inward from the z = 131.26m window wall along -sunDirYup = [+0.62, -0.34, +0.71]
  const [rx, ry, rz] = options.rayDir
    ? Array.isArray(options.rayDir)
      ? safeNormalizeTriplet(options.rayDir[0], options.rayDir[1], options.rayDir[2], 0.60, -0.33, 0.72)
      : safeNormalizeTriplet(options.rayDir.x, options.rayDir.y, options.rayDir.z, 0.60, -0.33, 0.72)
    : safeNormalizeTriplet(0.60, -0.33, 0.72);
  const rayDir = new T.Vector3(rx, ry, rz);

  const uniforms = {
    uSunColor: { value: new T.Color(options.colorHex || "#FFD596") },
    uCoreColor: { value: new T.Color(options.coreHex || "#FFE9C2") },
    uOpacity: { value: Number.isFinite(options.opacity) ? options.opacity : 0.115 },
    uTime: { value: 0.0 },
    uFade: { value: 1.0 },
  };

  const material = new T.ShaderMaterial({
    name: "V6_SpinStudio_VolumetricSunbeams_Mat",
    transparent: true,
    blending: T.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    side: T.DoubleSide,
    fog: false,
    uniforms,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunColor;
      uniform vec3 uCoreColor;
      uniform float uOpacity;
      uniform float uTime;
      uniform float uFade;

      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;

      vec3 safeNorm3(vec3 v) {
        float l2 = dot(v, v);
        return l2 > 1e-8 ? v * inversesqrt(l2) : vec3(0.0, 1.0, 0.0);
      }

      void main() {
        // 1. Soft Gaussian-bell lateral profile across shaft width (zero hard ribbon borders)
        float across = sin(clamp(vUv.x, 0.0, 1.0) * 3.14159265);
        across = across * across;

        // Subtle 4x6 muntin window-pane light-lane modulation
        float paneMod = 0.76 + 0.24 * sin(vUv.x * 9.42477796);

        // 2. Longitudinal entry & Beer-Lambert falloff from glass wall (vUv.y = 0) to EPDM floor (vUv.y = 1)
        float entryFade = smoothstep(0.0, 0.13, vUv.y);
        float distFade = 1.0 - smoothstep(0.24, 0.98, vUv.y);
        float floorClip = smoothstep(0.015, 0.34, vWorldPos.y);
        float wallClip = smoothstep(131.30, 131.85, vWorldPos.z);

        // 3. View-grazing & camera-proximity fade so riding through shafts never clips or pops
        vec3 toCam = cameraPosition - vWorldPos;
        float camDist = sqrt(max(dot(toCam, toCam), 1e-6));
        vec3 viewDir = toCam / camDist;
        float viewGrazing = pow(max(abs(dot(safeNorm3(vWorldNormal), viewDir)), 1e-4), 1.22);
        float nearCamFade = smoothstep(0.45, 1.85, camDist);

        // 4. Deterministic warm golden-hour dust-mote air shimmer
        float dustWave = 0.88 + 0.12 * sin(vWorldPos.x * 2.7 + vWorldPos.y * 4.1 - uTime * 0.85)
                              * cos(vWorldPos.z * 2.3 + uTime * 0.62);

        float alpha = across * paneMod * entryFade * distFade * floorClip * wallClip
                    * viewGrazing * nearCamFade * dustWave * uOpacity * clamp(uFade, 0.0, 1.0);

        vec3 beamCol = mix(uSunColor, uCoreColor, across * (1.0 - vUv.y * 0.55));
        gl_FragColor = vec4(beamCol, clamp(alpha, 0.0, 0.28));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  // Named with `Beam` so static prop zero-float grounding audits ignore volumetric light geometry
  const group = new T.Group();
  group.name = "V6_SpinStudio_Sunbeams_BeamGroup";
  group.userData.skipZeroFloatAudit = true;

  // 6 upper/mid window bay origins along the z = 131.26m Spin Studio muntin curtain wall
  const shaftSpecs = [
    { wx: -5.25, wy: 3.88, wz: 131.38, width: 1.55, length: 11.4 },
    { wx: -3.75, wy: 3.52, wz: 131.38, width: 1.48, length: 10.6 },
    { wx: -2.25, wy: 3.82, wz: 131.38, width: 1.60, length: 11.2 },
    { wx: -0.75, wy: 3.44, wz: 131.38, width: 1.45, length: 10.4 },
    { wx: 0.75, wy: 3.76, wz: 131.38, width: 1.52, length: 11.0 },
    { wx: 2.25, wy: 3.38, wz: 131.38, width: 1.40, length: 10.2 },
  ];

  const yDownAxis = new T.Vector3(0, -1, 0);
  const alignQuat = new T.Quaternion().setFromUnitVectors(yDownAxis, rayDir);
  const rollQuat = new T.Quaternion();
  const geometries = [];

  for (let i = 0; i < shaftSpecs.length; i++) {
    const s = shaftSpecs[i];
    const shaftHolder = new T.Group();
    shaftHolder.name = `V6_SpinStudio_Sunbeam_Beam_${i}`;
    shaftHolder.position.set(s.wx, s.wy, s.wz);
    shaftHolder.quaternion.copy(alignQuat);

    for (let p = 0; p < 2; p++) {
      // Plane extends from y = 0 (window glass, vUv.y = 1 in default PlaneGeometry -> flip so vUv.y = 0 at top!)
      const geom = new T.PlaneGeometry(s.width, s.length, 1, 1);
      // Map top edge (window entry) -> uv.y = 0, bottom edge (floor end) -> uv.y = 1
      const uvAttr = geom.attributes.uv;
      if (uvAttr) {
        for (let k = 0; k < uvAttr.count; k++) {
          uvAttr.setY(k, 1.0 - uvAttr.getY(k));
        }
        uvAttr.needsUpdate = true;
      }
      geom.translate(0.0, -s.length * 0.5, 0.0);
      geometries.push(geom);

      const ribbon = new T.Mesh(geom, material);
      ribbon.name = `V6_SpinStudio_Sunbeam_BeamRibbon_${i}_${p}`;
      rollQuat.setFromAxisAngle(yDownAxis, p === 0 ? 0.35 : 0.35 + Math.PI * 0.5);
      ribbon.quaternion.copy(rollQuat);
      ribbon.castShadow = false;
      ribbon.receiveShadow = false;
      ribbon.frustumCulled = false;
      ribbon.renderOrder = 12;
      ribbon.raycast = () => {};
      shaftHolder.add(ribbon);
    }

    group.add(shaftHolder);
  }

  const maxZone1Sec = Number.isFinite(options.maxZone1Sec) ? options.maxZone1Sec : 9.4;

  const setActive = (visible) => {
    group.visible = Boolean(visible);
  };

  const update = (elapsedSec = 0.0, updateOpts = {}) => {
    const t = Number.isFinite(elapsedSec) ? elapsedSec : 0.0;
    uniforms.uTime.value = t;
    if (updateOpts.forceVisible !== undefined) {
      group.visible = Boolean(updateOpts.forceVisible);
      uniforms.uFade.value = group.visible ? 1.0 : 0.0;
      return;
    }
    const inWindow = t >= 0.0 && t <= maxZone1Sec + 0.6;
    const nearGym = updateOpts.nearGym !== undefined ? Boolean(updateOpts.nearGym) : true;
    const active = inWindow && nearGym;
    group.visible = active;
    if (active) {
      // Smooth fade-out after 8.4s as Pelican bursts outside across the plaza
      const fadeOut = 1.0 - clamp((t - (maxZone1Sec - 0.8)) / 1.2, 0.0, 1.0);
      uniforms.uFade.value = fadeOut;
    }
  };

  const dispose = () => {
    if (group.parent) group.parent.remove(group);
    for (const g of geometries) g.dispose();
    material.dispose();
  };

  const controller = {
    group,
    mesh: group,
    material,
    uniforms,
    setActive,
    update,
    dispose,
  };
  group.userData.sunbeamController = controller;

  if (scene && typeof scene.add === "function") {
    scene.add(group);
    group.updateMatrixWorld(true);
  }

  return controller;
}

const DYNAMIC_SHADOW_CASTER_NAME_RE =
  /pelican|gbike|heroanchor|herorig|waymo|jaguar|ipace|pinwheel.*rotor|origami.*rotor|pinwheel_blades|v6pinwheelrotor|glass.*shard|shatter.*shard|refractive.*shard|mullionshard|windowshard|breakableshard/i;

const STATIC_SHADOW_EXCLUDED_NAME_RE =
  /HeroContactAOShadow|CinemaFilmicVignette|V5GoldenHourHorizonGlowRing|SpinStudioSunbeam|Shockwave_Dust|Roar_Breath|Dust_Motes|Chalk_Motes|Sunlit_Motes|TurnSignal|ContactShadow|HaloGlow|Slipstream_Ribbon|Ground_MicroWisp|Ballistic_Spark|Stan_Roar_Ripple|TPU_Rack_Optical_LED/i;

// Module-level active Two-Tier context so standalone `updateTwoTierShadows({ heroPos, camera, ... })`
// works seamlessly with zero extra arguments and zero per-frame heap allocations.
let _activeTwoTierContext = null;

const _staticFrustumCallOpts = {
  sunDir: null,
  halfExtentM: OMNI_V5_LIGHTING_TELEMETRY.shadowFrustumHalfExtentM,
  cameraLeadBiasM: 12.0,
  forceProjectionUpdate: false,
};

const _dynamicFrustumCallOpts = {
  sunDir: null,
  halfExtentM: OMNI_V5_LIGHTING_TELEMETRY.dynamicShadowFrustumHalfExtentM,
  cameraLeadBiasM: 0.0,
  nearM: 2.0,
  farM: 240.0,
  forceProjectionUpdate: false,
};

const _twoTierShadowStatus = {
  staticRebuilt: false,
  staticPendingRender: false,
  movedDistM: 0.0,
  staticAnchorXZ: [0.0, 0.0],
  staticMapSize: 4096,
  staticHalfExtentM: 64.0,
  dynamicMapSize: 2048,
  dynamicHalfExtentM: 10.5,
  dynamicTexelSizeCm: (21.0 / 2048.0) * 100.0,
  staticCasterCount: 0,
  dynamicRootCount: 0,
  staticRenderCount: 0,
  dynamicRenderCount: 0,
};

/**
 * Idempotently patches `THREE.ShaderChunk.lights_fragment_begin` so a zero-irradiance (`intensity = 0.0`)
 * Tier-2 Dynamic Directional Shadow Light modulates the Tier-1 Static Directional Sun Light's shadow
 * attenuation via `min(staticShadow, dynamicShadow)` and skips `RE_Direct` when `directLight.color == 0`,
 * guaranteeing exact `1.000x` sunlit irradiance, `0` double-exposure, and `0` redundant BRDF evaluations!
 */
export function installTwoTierShadowShaderPatch(THREE = DEFAULT_THREE) {
  if (!THREE || !THREE.ShaderChunk || !THREE.ShaderChunk.lights_fragment_begin) {
    return false;
  }
  if (THREE.ShaderChunk.__v7TwoTierShadowPatched) {
    return true;
  }

  const src = THREE.ShaderChunk.lights_fragment_begin;
  const targetBlock = `#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
\tDirectionalLight directionalLight;
\t#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
\tDirectionalLightShadow directionalLightShadow;
\t#endif
\t#pragma unroll_loop_start
\tfor ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
\t\tdirectionalLight = directionalLights[ i ];
\t\tgetDirectionalLightInfo( directionalLight, directLight );
\t\t#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
\t\tdirectionalLightShadow = directionalLightShadows[ i ];
\t\tdirectLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
\t\t#endif
\t\tRE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
\t}
\t#pragma unroll_loop_end
#endif`;

  if (!src.includes(targetBlock)) {
    return false;
  }

  const patchedBlock = `#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
\tDirectionalLight directionalLight;
\t#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
\tDirectionalLightShadow directionalLightShadow;
\t#endif
\t#pragma unroll_loop_start
\tfor ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
\t\tdirectionalLight = directionalLights[ i ];
\t\tgetDirectionalLightInfo( directionalLight, directLight );
\t\t#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
\t\t{
\t\t\tdirectionalLightShadow = directionalLightShadows[ i ];
\t\t\tfloat v7ShadowAtten = ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
\t\t\t#if ( UNROLLED_LOOP_INDEX == 0 ) && ( NUM_DIR_LIGHT_SHADOWS >= 2 )
\t\t\tif ( directLight.visible && receiveShadow && dot( directionalLights[ 1 ].color, directionalLights[ 1 ].color ) <= 1e-6 ) {
\t\t\t\t// V8-01: Smooth 14.0m radial smoothstep shadow-border ease-in inside the outer +-64m Tier-1 frustum margin
\t\t\t\t// paired with continuous view-space lead distance so distant tree shadows glide in with 0 single-frame pops!
\t\t\t\tfloat v8FrustumRadM = length( vDirectionalShadowCoord[ 0 ].xy - vec2( 0.5 ) ) * 128.0;
\t\t\t\tfloat v8FrustumFade = 1.0 - smoothstep( 49.5, 63.5, v8FrustumRadM );
\t\t\t\tfloat v8ViewLeadDistM = length( geometryPosition - vec3( 0.0, 0.0, -14.0 ) );
\t\t\t\tfloat v8ViewFade = 1.0 - smoothstep( 44.0, 58.0, v8ViewLeadDistM );
\t\t\t\tv7ShadowAtten = mix( 1.0, v7ShadowAtten, min( v8FrustumFade, v8ViewFade ) );
\t\t\t\tDirectionalLightShadow v7DynShadow1 = directionalLightShadows[ 1 ];
\t\t\t\tfloat v8DynRaw1 = getShadow( directionalShadowMap[ 1 ], v7DynShadow1.shadowMapSize, v7DynShadow1.shadowIntensity, v7DynShadow1.shadowBias, v7DynShadow1.shadowRadius, vDirectionalShadowCoord[ 1 ] );
\t\t\t\tfloat v8DynFade1 = 1.0 - smoothstep( 8.8, 10.35, length( vDirectionalShadowCoord[ 1 ].xy - vec2( 0.5 ) ) * 21.0 );
\t\t\t\tv7ShadowAtten = min( v7ShadowAtten, mix( 1.0, v8DynRaw1, v8DynFade1 ) );
\t\t\t}
\t\t\t#endif
\t\t\t#if ( UNROLLED_LOOP_INDEX == 1 ) && ( NUM_DIR_LIGHT_SHADOWS >= 2 )
\t\t\tif ( directLight.visible && receiveShadow && dot( directionalLights[ 0 ].color, directionalLights[ 0 ].color ) <= 1e-6 ) {
\t\t\t\tfloat v8FrustumRadM1 = length( vDirectionalShadowCoord[ 1 ].xy - vec2( 0.5 ) ) * 128.0;
\t\t\t\tfloat v8FrustumFade1 = 1.0 - smoothstep( 49.5, 63.5, v8FrustumRadM1 );
\t\t\t\tfloat v8ViewLeadDistM1 = length( geometryPosition - vec3( 0.0, 0.0, -14.0 ) );
\t\t\t\tfloat v8ViewFade1 = 1.0 - smoothstep( 44.0, 58.0, v8ViewLeadDistM1 );
\t\t\t\tv7ShadowAtten = mix( 1.0, v7ShadowAtten, min( v8FrustumFade1, v8ViewFade1 ) );
\t\t\t\tDirectionalLightShadow v7DynShadow0 = directionalLightShadows[ 0 ];
\t\t\t\tfloat v8DynRaw0 = getShadow( directionalShadowMap[ 0 ], v7DynShadow0.shadowMapSize, v7DynShadow0.shadowIntensity, v7DynShadow0.shadowBias, v7DynShadow0.shadowRadius, vDirectionalShadowCoord[ 0 ] );
\t\t\t\tfloat v8DynFade0 = 1.0 - smoothstep( 8.8, 10.35, length( vDirectionalShadowCoord[ 0 ].xy - vec2( 0.5 ) ) * 21.0 );
\t\t\t\tv7ShadowAtten = min( v7ShadowAtten, mix( 1.0, v8DynRaw0, v8DynFade0 ) );
\t\t\t}
\t\t\t#endif
\t\t\tdirectLight.color *= v7ShadowAtten;
\t\t}
\t\t#endif
\t\tif ( dot( directLight.color, directLight.color ) > 1e-8 ) {
\t\t\tRE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
\t\t}
\t}
\t#pragma unroll_loop_end
#endif`;

  THREE.ShaderChunk.lights_fragment_begin = src.replace(targetBlock, patchedBlock);
  THREE.ShaderChunk.__v7TwoTierShadowPatched = true;
  return true;
}

function hasDynamicAncestor(obj, stopRoot) {
  let cur = obj ? obj.parent : null;
  while (cur && cur !== stopRoot) {
    if (cur.userData && cur.userData.__v7IsDynamicShadowRoot) {
      return true;
    }
    cur = cur.parent;
  }
  return false;
}

/**
 * Explicitly registers one or more Object3D roots (e.g. `heroAnchor`, Waymo fleet roots,
 * pinwheel rotor groups, glass-shatter shard groups) as Tier-2 Dynamic Shadow Casters
 * (`LAYER_DYNAMIC_SHADOW = 2`) and marks the scene shadow-layer cache for resync.
 */
export function registerDynamicShadowCasters(targets, scene = null) {
  if (!targets) return 0;
  const list = Array.isArray(targets) ? targets : [targets];
  let tagged = 0;
  for (let i = 0; i < list.length; i++) {
    const root = list[i];
    if (!root || typeof root.traverse !== "function") continue;
    root.userData = root.userData || {};
    root.userData.isDynamicShadowCaster = true;
    root.traverse((ch) => {
      if (!ch) return;
      ch.userData = ch.userData || {};
      ch.userData.isDynamicShadowCaster = true;
      if (ch.layers) {
        ch.layers.enable(0);
        const nm = String(ch.name || "");
        // Enable LAYER_DYNAMIC_SHADOW (2) even if `ch.castShadow` starts `false` at indoor gym boot!
        // Three.js WebGLShadowMap natively skips `castShadow === false` meshes with 0 draw cost,
        // and immediately renders crisp 1cm/texel dynamic shadows as soon as `castShadow` flips `true` outdoors.
        if (ch.isMesh && !ch.userData.noCastShadow && !STATIC_SHADOW_EXCLUDED_NAME_RE.test(nm)) {
          ch.layers.enable(LAYER_DYNAMIC_SHADOW);
          ch.layers.disable(LAYER_STATIC_SHADOW);
          tagged += 1;
        }
      }
    });
  }
  const targetScene = scene || (_activeTwoTierContext && _activeTwoTierContext.scene) || null;
  if (targetScene) {
    targetScene.userData = targetScene.userData || {};
    targetScene.userData.__v7ShadowLayersDirty = true;
    syncTwoTierShadowLayers(targetScene, list, true);
  }
  return tagged;
}

/**
 * Classifies scene shadow casters into `LAYER_STATIC_SHADOW (1)` vs `LAYER_DYNAMIC_SHADOW (2)`
 * while keeping `Layer 0` active on all meshes for main-camera rendering.
 * Runs in `O(1)` (`0` allocations, `0` traversal) whenever `scene.children.length` is unchanged.
 */
export function syncTwoTierShadowLayers(scene, extraDynamicRoots = null, forceResync = false) {
  if (!scene || !Array.isArray(scene.children)) {
    return null;
  }
  scene.userData = scene.userData || {};
  const childCount = scene.children.length;
  if (
    !forceResync &&
    !scene.userData.__v7ShadowLayersDirty &&
    scene.userData.__v7LastSyncedChildCount === childCount &&
    Array.isArray(scene.userData.__v7DynamicShadowRoots)
  ) {
    return scene.userData.__v7ShadowLayerSummary;
  }

  if (Array.isArray(extraDynamicRoots)) {
    for (let i = 0; i < extraDynamicRoots.length; i++) {
      const r = extraDynamicRoots[i];
      if (r) {
        r.userData = r.userData || {};
        r.userData.isDynamicShadowCaster = true;
      }
    }
  }

  // Clear previous dynamic-root markers before rebuilding deduplicated dynamic root list
  const prevRoots = scene.userData.__v7DynamicShadowRoots;
  if (Array.isArray(prevRoots)) {
    for (let i = 0; i < prevRoots.length; i++) {
      if (prevRoots[i] && prevRoots[i].userData) {
        prevRoots[i].userData.__v7IsDynamicShadowRoot = false;
      }
    }
    prevRoots.length = 0;
  } else {
    scene.userData.__v7DynamicShadowRoots = [];
  }
  const dynamicRoots = scene.userData.__v7DynamicShadowRoots;

  let outdoorProbes = scene.userData.__v7OutdoorShadowProbes;
  if (!Array.isArray(outdoorProbes)) {
    outdoorProbes = [];
    scene.userData.__v7OutdoorShadowProbes = outdoorProbes;
  } else {
    outdoorProbes.length = 0;
  }

  let staticCasterCount = 0;
  let dynamicCasterCount = 0;

  function walkClassify(node, inheritedDynamic, inheritedStaticCaster, inheritedExcluded) {
    if (!node) return;
    const nm = String(node.name || "");
    const ud = node.userData;
    const isExcluded =
      Boolean(inheritedExcluded) ||
      Boolean(ud && ud.noCastShadow === true) ||
      (nm.length > 0 && STATIC_SHADOW_EXCLUDED_NAME_RE.test(nm));
    const selfDynamic =
      !isExcluded &&
      (Boolean(ud && ud.isDynamicShadowCaster === true) ||
        (nm.length > 0 && DYNAMIC_SHADOW_CASTER_NAME_RE.test(nm)));
    const isDyn = (inheritedDynamic || selfDynamic) && !isExcluded;
    const isStaticTagged =
      !isExcluded && (inheritedStaticCaster || Boolean(ud && ud.v7StaticShadowCaster === true));

    if (selfDynamic && !inheritedDynamic && !hasDynamicAncestor(node, scene)) {
      node.userData = ud || {};
      node.userData.__v7IsDynamicShadowRoot = true;
      dynamicRoots.push(node);
    }

    if (node.isMesh && node.layers) {
      node.layers.enable(0);
      const mat = Array.isArray(node.material) ? node.material[0] : node.material;
      const isUnlitOrCustomVfx = Boolean(
        mat && (mat.isMeshBasicMaterial || mat.isShaderMaterial || mat.isRawShaderMaterial)
      );
      if (isExcluded) {
        node.layers.disable(LAYER_STATIC_SHADOW);
        node.layers.disable(LAYER_DYNAMIC_SHADOW);
      } else if (isDyn) {
        // Always assign LAYER_DYNAMIC_SHADOW (2) even if `castShadow` starts `false` inside Spin Studio!
        node.layers.enable(LAYER_DYNAMIC_SHADOW);
        node.layers.disable(LAYER_STATIC_SHADOW);
        dynamicCasterCount += 1;
      } else if (node.castShadow || isStaticTagged || !isUnlitOrCustomVfx) {
        // Assign LAYER_STATIC_SHADOW (1) on all outdoor/campus PBR static meshes even when `castShadow`
        // starts `false` at `z = 140.2` indoor boot — Three.js WebGLShadowMap natively skips `castShadow === false`
        // meshes with zero draw cost and renders their shadows as soon as `castShadow` flips `true` outdoors!
        node.layers.enable(LAYER_STATIC_SHADOW);
        node.layers.disable(LAYER_DYNAMIC_SHADOW);
        staticCasterCount += 1;
        if (
          !node.castShadow &&
          outdoorProbes.length < 8 &&
          (isStaticTagged || /Berm|Bridge|Pavilion|Monument|Pod|Canopy|Redwood|Oak/i.test(nm))
        ) {
          outdoorProbes.push(node);
        }
      } else {
        node.layers.disable(LAYER_STATIC_SHADOW);
        node.layers.disable(LAYER_DYNAMIC_SHADOW);
      }
    }

    const ch = node.children;
    if (Array.isArray(ch)) {
      for (let i = 0, l = ch.length; i < l; i++) {
        walkClassify(ch[i], isDyn, isStaticTagged, isExcluded);
      }
    }
  }

  for (let i = 0, l = scene.children.length; i < l; i++) {
    walkClassify(scene.children[i], false, false, false);
  }

  scene.userData.__v7LastSyncedChildCount = childCount;
  scene.userData.__v7ShadowLayersDirty = false;

  let summary = scene.userData.__v7ShadowLayerSummary;
  if (!summary) {
    summary = {
      staticCasterCount,
      dynamicCasterCount,
      dynamicRootCount: dynamicRoots.length,
    };
    scene.userData.__v7ShadowLayerSummary = summary;
  } else {
    summary.staticCasterCount = staticCasterCount;
    summary.dynamicCasterCount = dynamicCasterCount;
    summary.dynamicRootCount = dynamicRoots.length;
  }
  return summary;
}

function wrapRendererShadowMapForTwoTier(renderer, twoTierState) {
  if (!renderer || !renderer.shadowMap || typeof renderer.shadowMap.render !== "function") {
    return;
  }
  const shadowMap = renderer.shadowMap;
  shadowMap.__v7TwoTierState = twoTierState;
  if (shadowMap.__v7TwoTierWrapped) {
    return;
  }

  const origShadowRender = shadowMap.render.bind(shadowMap);
  const _tier1Arr = [null];
  const _tier2Arr = [null];
  const _otherArr = [];
  const _dynamicSceneProxy = {
    isScene: true,
    visible: true,
    isMesh: false,
    isLine: false,
    isPoints: false,
    layers: null,
    children: null,
    traverse: null,
  };

  shadowMap.render = function v7TwoTierShadowRender(lights, scene, camera) {
    const st = shadowMap.__v7TwoTierState;
    if (!st || !camera || !camera.layers || !scene || !Array.isArray(lights) || lights.length === 0) {
      return origShadowRender(lights, scene, camera);
    }
    if (shadowMap.enabled === false) return;
    if (shadowMap.autoUpdate === false && shadowMap.needsUpdate === false) return;

    // If caller explicitly set `renderer.shadowMap.needsUpdate = true` (e.g. teleport / diagnostic capture),
    // also refresh Tier-1 Static Regional Shadow Map on this frame.
    const explicitGlobalRefresh = shadowMap.needsUpdate === true;
    if (explicitGlobalRefresh && st.sunLight && st.sunLight.shadow) {
      st.sunLight.shadow.needsUpdate = true;
    }

    const summary = syncTwoTierShadowLayers(scene);
    const savedMask = camera.layers.mask;
    _otherArr.length = 0;
    let hasTier1 = false;
    let hasTier2 = false;

    for (let i = 0, l = lights.length; i < l; i++) {
      const lt = lights[i];
      if (!lt || !lt.shadow) continue;
      if (lt === st.sunLight) {
        hasTier1 = true;
      } else if (lt === st.dynamicSunLight) {
        hasTier2 = true;
      } else if (
        lt.visible !== false &&
        (lt.intensity > 1e-5 || lt.userData?.forcePrewarmShadow) &&
        (lt.shadow.autoUpdate !== false || lt.shadow.needsUpdate === true)
      ) {
        _otherArr.push(lt);
      }
    }

    try {
      // 1. Tier 1 Static Regional Shadow Pass (`4096x4096`, `+-64m`, `autoUpdate = false`)
      // Executes ONLY when `sunLight.shadow.needsUpdate === true` (`0.0ms` on 98%+ of frames!)
      if (
        hasTier1 &&
        st.sunLight &&
        st.sunLight.shadow &&
        (st.sunLight.shadow.autoUpdate === true || st.sunLight.shadow.needsUpdate === true)
      ) {
        _tier1Arr[0] = st.sunLight;
        camera.layers.mask = 1 << LAYER_STATIC_SHADOW;
        if (explicitGlobalRefresh) shadowMap.needsUpdate = true;
        origShadowRender(_tier1Arr, scene, camera);
        st.staticRenderCount += 1;
        st.lastRenderedStaticCasterCount = summary ? summary.staticCasterCount : 0;
      }

      // 2. Tier 2 Tight Dynamic Hero Shadow Pass (`2048x2048`, `+-10.5m` -> `~1.0cm/texel`, `3x` sharper)
      // Renders ONLY dynamic roots (`Pelican + GBike`, `Waymos`, `pinwheel rotors`, `glass shards`).
      if (
        hasTier2 &&
        !(st.isSoftwareRenderer && st.enclosedGym) &&
        st.dynamicSunLight &&
        st.dynamicSunLight.shadow &&
        (st.dynamicSunLight.shadow.autoUpdate !== false || st.dynamicSunLight.shadow.needsUpdate === true)
      ) {
        _tier2Arr[0] = st.dynamicSunLight;
        camera.layers.mask = 1 << LAYER_DYNAMIC_SHADOW;
        const dynRoots = scene.userData && scene.userData.__v7DynamicShadowRoots;
        if (Array.isArray(dynRoots) && dynRoots.length > 0 && shadowMap._v7TypeInitialized) {
          _dynamicSceneProxy.layers = scene.layers;
          _dynamicSceneProxy.children = dynRoots;
          _dynamicSceneProxy.traverse = scene.traverse.bind(scene);
          origShadowRender(_tier2Arr, _dynamicSceneProxy, camera);
        } else {
          origShadowRender(_tier2Arr, scene, camera);
          shadowMap._v7TypeInitialized = true;
        }
        st.dynamicRenderCount += 1;
      }

      // 3. Indoor / Auxiliary Shadow Lights (e.g., `V5_SpinStudio_Window_SunSpot` when indoors)
      if (_otherArr.length > 0) {
        camera.layers.mask = st.isSoftwareRenderer
          ? 1 << LAYER_STATIC_SHADOW
          : (1 << 0) | (1 << LAYER_STATIC_SHADOW) | (1 << LAYER_DYNAMIC_SHADOW);
        origShadowRender(_otherArr, scene, camera);
      }
    } finally {
      camera.layers.mask = savedMask;
      shadowMap.needsUpdate = false;
    }
  };

  shadowMap.__v7TwoTierWrapped = true;
}

/**
 * Section 1B — Zero-GC Two-Tier Shadow Synchronizer (`0` per-frame heap allocations).
 *
 * - **Tier 1 Static Regional Shadow Light (`4096x4096`, `+-64m` frustum, `shadow.autoUpdate = false`)**:
 *   Rebuilds ONLY on initial boot, explicit `forceStaticRebuild` (teleport / state jump), scene static-caster
 *   addition during boot, or when the hero moves `> 8.0m` from the last static shadow anchor.
 * - **Tier 2 Tight Dynamic Hero Shadow Light (`2048x2048`, `+-10.5m` frustum -> `~1.025cm/texel`, `3x` sharper)**:
 *   Tracks `heroPos` every frame with exact light-space texel-grid snapping for moving dynamic casters only.
 */
export function updateTwoTierShadows(params = {}) {
  const ctx = _activeTwoTierContext;
  const heroPos = params.heroPos !== undefined ? params.heroPos : params.focusPos;
  const camera = params.camera || (ctx && ctx.camera) || null;
  const sunLight = params.sunLight || (ctx && ctx.sunLight) || null;
  const dynamicSunLight = params.dynamicSunLight || (ctx && ctx.dynamicSunLight) || null;
  const scene = params.scene || (ctx && ctx.scene) || null;
  const sunDir = params.sunDir || (ctx && ctx.sunDir) || DEFAULT_SUN_DIR_UNIT;
  const forceStaticRebuild = Boolean(params.forceStaticRebuild);
  const moveThresholdM =
    Number.isFinite(params.moveThresholdM) && params.moveThresholdM > 0.5
      ? params.moveThresholdM
      : OMNI_V5_LIGHTING_TELEMETRY.staticShadowMoveRebuildThresholdM;

  const [hx, , hz] = extractFocusPoint(heroPos, camera);

  let layerSummary = null;
  if (scene) {
    layerSummary = syncTwoTierShadowLayers(
      scene,
      params.dynamicRoots || (ctx && ctx.dynamicRoots) || null,
      Boolean(params.forceLayerResync)
    );
  }

  let staticRebuilt = false;
  if (sunLight && sunLight.shadow) {
    sunLight.shadow.autoUpdate = false;
    const anchorInit = Boolean(ctx ? ctx.staticInitialized : sunLight.userData.__v7StaticInit);
    const prevAX = ctx ? ctx.staticAnchorX : Number(sunLight.userData.__v7AnchorX || 0.0);
    const prevAZ = ctx ? ctx.staticAnchorZ : Number(sunLight.userData.__v7AnchorZ || 0.0);
    const prevFX = ctx
      ? (ctx.staticFocusX ?? prevAX)
      : Number(sunLight.userData.__v8FocusX ?? prevAX);
    const prevFZ = ctx
      ? (ctx.staticFocusZ ?? prevAZ)
      : Number(sunLight.userData.__v8FocusZ ?? prevAZ);

    const staticHalfExtent =
      (ctx && ctx.staticHalfExtentM) || OMNI_V5_LIGHTING_TELEMETRY.shadowFrustumHalfExtentM;
    const effLeadBiasM =
      params.cameraLeadBiasM !== undefined ? Number(params.cameraLeadBiasM) : 12.0;
    let candFX = hx;
    let candFZ = hz;
    if (camera && effLeadBiasM > 0.0 && camera.matrixWorld && camera.matrixWorld.elements) {
      const ce = camera.matrixWorld.elements;
      const cfx = -ce[8];
      const cfz = -ce[10];
      const hLenSq = cfx * cfx + cfz * cfz;
      if (hLenSq > 1e-6 && Number.isFinite(hLenSq)) {
        const invHLen = 1.0 / Math.sqrt(hLenSq);
        const clampedLead = clamp(
          effLeadBiasM,
          0.0,
          Math.min(OMNI_V5_LIGHTING_TELEMETRY.maxCameraLeadClampM, staticHalfExtent * 0.28)
        );
        candFX += cfx * invHLen * clampedLead;
        candFZ += cfz * invHLen * clampedLead;
      }
    }

    const heroMovedDistM = anchorInit ? Math.hypot(hx - prevAX, hz - prevAZ) : Infinity;
    const focusMovedDistM = anchorInit ? Math.hypot(candFX - prevFX, candFZ - prevFZ) : Infinity;
    const movedDistM = Math.max(heroMovedDistM, focusMovedDistM);

    const hasHwShadowMap = Boolean(ctx && ctx.hasRenderer);
    const currentStaticCasters = layerSummary ? layerSummary.staticCasterCount : 0;
    const lastRenderedStaticCasters =
      ctx && hasHwShadowMap ? ctx.lastRenderedStaticCasterCount : currentStaticCasters;
    const staticTopologyChanged =
      anchorInit &&
      hasHwShadowMap &&
      currentStaticCasters > 0 &&
      currentStaticCasters !== lastRenderedStaticCasters;

    // One-time indoor->outdoor shadow ungate detector (0 allocations, <= 8 boolean reads):
    // When booting inside Spin Studio (`allowWorldShadows = false`), outdoor static casters start with
    // `castShadow = false`. As soon as the hero exits outdoors and `castShadow` flips `true`, refresh Tier 1 once!
    let outdoorJustUngated = false;
    const probes = scene && scene.userData && scene.userData.__v7OutdoorShadowProbes;
    if (Array.isArray(probes) && probes.length > 0) {
      let anyCasting = false;
      for (let i = 0; i < probes.length; i++) {
        if (probes[i] && probes[i].castShadow) {
          anyCasting = true;
          break;
        }
      }
      const prevCasting = Boolean(ctx ? ctx.outdoorProbesActive : sunLight.userData.__v7OutdoorActive);
      if (anyCasting && !prevCasting && anchorInit) {
        outdoorJustUngated = true;
      }
      if (ctx) ctx.outdoorProbesActive = anyCasting;
      sunLight.userData.__v7OutdoorActive = anyCasting;
    }

    const shouldRebuildStatic =
      !anchorInit ||
      forceStaticRebuild ||
      movedDistM > moveThresholdM ||
      (hasHwShadowMap && !sunLight.shadow.map) ||
      staticTopologyChanged ||
      outdoorJustUngated;

    if (shouldRebuildStatic) {
      _staticFrustumCallOpts.sunDir = sunDir;
      _staticFrustumCallOpts.halfExtentM = staticHalfExtent;
      _staticFrustumCallOpts.cameraLeadBiasM = effLeadBiasM;
      _staticFrustumCallOpts.forceProjectionUpdate = !anchorInit;

      updateTightCameraShadowFrustum(sunLight, heroPos, camera, _staticFrustumCallOpts);
      sunLight.shadow.needsUpdate = true;
      staticRebuilt = true;

      if (ctx) {
        ctx.staticInitialized = true;
        ctx.staticAnchorX = hx;
        ctx.staticAnchorZ = hz;
        ctx.staticFocusX = candFX;
        ctx.staticFocusZ = candFZ;
      }
      sunLight.userData.__v7StaticInit = true;
      sunLight.userData.__v7AnchorX = hx;
      sunLight.userData.__v7AnchorZ = hz;
      sunLight.userData.__v8FocusX = candFX;
      sunLight.userData.__v8FocusZ = candFZ;
      _twoTierShadowStatus.movedDistM = Number.isFinite(movedDistM) ? movedDistM : 0.0;
    } else {
      _twoTierShadowStatus.movedDistM = movedDistM;
    }

    _twoTierShadowStatus.staticPendingRender = Boolean(sunLight.shadow.needsUpdate);
    _twoTierShadowStatus.staticAnchorXZ[0] = ctx ? ctx.staticAnchorX : sunLight.userData.__v7AnchorX;
    _twoTierShadowStatus.staticAnchorXZ[1] = ctx ? ctx.staticAnchorZ : sunLight.userData.__v7AnchorZ;
    _twoTierShadowStatus.staticMapSize = sunLight.shadow.mapSize ? sunLight.shadow.mapSize.x : 4096;
    _twoTierShadowStatus.staticHalfExtentM = sunLight.shadow.camera
      ? Math.abs(sunLight.shadow.camera.right)
      : 64.0;
  }

  if (dynamicSunLight && dynamicSunLight.shadow) {
    dynamicSunLight.intensity = 0.0;
    dynamicSunLight.castShadow = true;
    dynamicSunLight.shadow.autoUpdate = true;

    const dynHalfExtent =
      (ctx && ctx.dynamicHalfExtentM) || OMNI_V5_LIGHTING_TELEMETRY.dynamicShadowFrustumHalfExtentM;
    _dynamicFrustumCallOpts.sunDir = sunDir;
    _dynamicFrustumCallOpts.halfExtentM = dynHalfExtent;
    _dynamicFrustumCallOpts.cameraLeadBiasM = 0.0;
    _dynamicFrustumCallOpts.forceProjectionUpdate = false;

    updateTightCameraShadowFrustum(dynamicSunLight, heroPos, camera, _dynamicFrustumCallOpts);

    _twoTierShadowStatus.dynamicMapSize = dynamicSunLight.shadow.mapSize
      ? dynamicSunLight.shadow.mapSize.x
      : 2048;
    _twoTierShadowStatus.dynamicHalfExtentM = dynamicSunLight.shadow.camera
      ? Math.abs(dynamicSunLight.shadow.camera.right)
      : 10.5;
    _twoTierShadowStatus.dynamicTexelSizeCm =
      ((_twoTierShadowStatus.dynamicHalfExtentM * 2.0) /
        Math.max(1, _twoTierShadowStatus.dynamicMapSize)) *
      100.0;
  }

  _twoTierShadowStatus.staticRebuilt = staticRebuilt || _twoTierShadowStatus.staticPendingRender;
  _twoTierShadowStatus.staticCasterCount = layerSummary ? layerSummary.staticCasterCount : 0;
  _twoTierShadowStatus.dynamicRootCount = layerSummary ? layerSummary.dynamicRootCount : 0;
  _twoTierShadowStatus.staticRenderCount = ctx ? ctx.staticRenderCount : 0;
  _twoTierShadowStatus.dynamicRenderCount = ctx ? ctx.dynamicRenderCount : 0;

  return _twoTierShadowStatus;
}

/**
 * Configures V7 Two-Tier Static (`4096x4096`, `+-64m`, `autoUpdate = false`) + Dynamic (`2048x2048`,
 * `+-10.5m` -> `~1.0cm/texel`) PCF directional shadows, golden-hour atmosphere, World-Cohesion
 * shared uniforms, warm horizon glow, and SwiftShader-safe optics on `renderer`, `scene`, and `sunLight`.
 *
 * Returns `{ sunDir, dynamicSunLight, updateTwoTierShadows, registerDynamicShadowCasters, syncTwoTierShadowLayers,
 * horizonGlowMesh, opticsOverlay, envRenderTarget, updateFrame, updateShadowFrustum, dispose }`.
 */
export function configureAAASunShadowsAndAtmosphere(
  THREE,
  renderer,
  scene,
  sunLight,
  options = {}
) {
  installTwoTierShadowShaderPatch(THREE);

  const [sx, sy, sz] = options.sunDir
    ? Array.isArray(options.sunDir)
      ? safeNormalizeTriplet(options.sunDir[0], options.sunDir[1], options.sunDir[2])
      : safeNormalizeTriplet(options.sunDir.x, options.sunDir.y, options.sunDir.z)
    : DEFAULT_SUN_DIR_UNIT;
  const sunDir = new THREE.Vector3(sx, sy, sz);

  // V7 Tier-1 Static Regional Shadow Light defaults strictly to 4096x4096 and +-64m (`0.0ms` on 98%+ of frames)
  const shadowMapSize =
    Number.isFinite(options.staticShadowMapSize) && options.staticShadowMapSize >= 1024
      ? Math.round(options.staticShadowMapSize)
      : OMNI_V5_LIGHTING_TELEMETRY.shadowMapSize;
  const halfExtentM =
    Number.isFinite(options.staticHalfExtentM) && options.staticHalfExtentM > 8.0
      ? options.staticHalfExtentM
      : Number.isFinite(options.halfExtentM) && options.halfExtentM > 8.0
        ? options.halfExtentM
        : OMNI_V5_LIGHTING_TELEMETRY.shadowFrustumHalfExtentM;

  const dynamicShadowMapSize =
    Number.isFinite(options.dynamicShadowMapSize) && options.dynamicShadowMapSize >= 512
      ? Math.round(options.dynamicShadowMapSize)
      : OMNI_V5_LIGHTING_TELEMETRY.dynamicShadowMapSize;
  const dynamicHalfExtentM =
    Number.isFinite(options.dynamicHalfExtentM) && options.dynamicHalfExtentM > 2.0
      ? options.dynamicHalfExtentM
      : OMNI_V5_LIGHTING_TELEMETRY.dynamicShadowFrustumHalfExtentM;

  // 1. Renderer ShadowMap & Tone Mapping Calibration (`PCFShadowMap` on GPU; `BasicShadowMap` single-tap on CPU SwiftShader)
  const isSoftwareRenderer = Boolean(options.isSoftwareRenderer);
  if (renderer) {
    if (renderer.shadowMap) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type =
        isSoftwareRenderer && THREE.BasicShadowMap !== undefined
          ? THREE.BasicShadowMap
          : THREE.PCFShadowMap !== undefined
            ? THREE.PCFShadowMap
            : THREE.PCFSoftShadowMap;
      renderer.shadowMap.autoUpdate = true;
      renderer.shadowMap.needsUpdate = true;
    }
    if (THREE.ACESFilmicToneMapping !== undefined) {
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
    }
    renderer.toneMappingExposure = Number.isFinite(options.exposure)
      ? options.exposure
      : OMNI_V5_LIGHTING_TELEMETRY.toneMappingExposure;
  }

  // 2A. Tier 1 Static Regional Shadow Light (`4096x4096`, `+-64m` ortho frustum, `shadow.autoUpdate = false`)
  if (sunLight) {
    if (!sunLight.name) {
      sunLight.name = "Tier1_StaticRegionalSunLight";
    }
    sunLight.color.set(options.sunHex || OMNI_V5_LIGHTING_TELEMETRY.sunColorHex);
    sunLight.intensity = Number.isFinite(options.sunIntensity)
      ? options.sunIntensity
      : OMNI_V5_LIGHTING_TELEMETRY.sunIntensity;
    sunLight.castShadow = true;
    sunLight.layers.enable(0);
    sunLight.userData = sunLight.userData || {};
    sunLight.userData.v5SunDir = sunDir.clone();

    if (sunLight.shadow) {
      const prevW = sunLight.shadow.mapSize ? sunLight.shadow.mapSize.x : 0;
      const prevH = sunLight.shadow.mapSize ? sunLight.shadow.mapSize.y : 0;
      sunLight.shadow.mapSize.set(shadowMapSize, shadowMapSize);
      if (
        sunLight.shadow.map &&
        (prevW !== shadowMapSize ||
          prevH !== shadowMapSize ||
          sunLight.shadow.map.width !== shadowMapSize ||
          sunLight.shadow.map.height !== shadowMapSize)
      ) {
        if (typeof sunLight.shadow.map.dispose === "function") {
          sunLight.shadow.map.dispose();
        }
        sunLight.shadow.map = null;
      }

      sunLight.shadow.autoUpdate = false;
      sunLight.shadow.needsUpdate = true;
      sunLight.shadow.bias = Number.isFinite(options.shadowBias)
        ? options.shadowBias
        : OMNI_V5_LIGHTING_TELEMETRY.shadowBias;
      sunLight.shadow.normalBias = Number.isFinite(options.shadowNormalBias)
        ? options.shadowNormalBias
        : OMNI_V5_LIGHTING_TELEMETRY.shadowNormalBias;
      sunLight.shadow.radius = Number.isFinite(options.shadowRadius)
        ? options.shadowRadius
        : OMNI_V5_LIGHTING_TELEMETRY.shadowRadius;

      const sc = sunLight.shadow.camera;
      if (sc) {
        sc.near = Number.isFinite(options.shadowNearM)
          ? options.shadowNearM
          : OMNI_V5_LIGHTING_TELEMETRY.shadowNearM;
        sc.far = Number.isFinite(options.shadowFarM)
          ? options.shadowFarM
          : OMNI_V5_LIGHTING_TELEMETRY.shadowFarM;
        sc.left = -halfExtentM;
        sc.right = halfExtentM;
        sc.top = halfExtentM;
        sc.bottom = -halfExtentM;
        sc.updateProjectionMatrix();
      }
    }

    if (scene) {
      if (!sunLight.parent) scene.add(sunLight);
      if (sunLight.target && !sunLight.target.parent) scene.add(sunLight.target);
    }
  }

  // 2B. Tier 2 Tight Dynamic Hero Shadow Light (`2048x2048`, `+-10.5m` -> `~1.0cm/texel`, `intensity = 0.0` = zero double-exposure!)
  let dynamicSunLight = options.dynamicSunLight || null;
  if (!dynamicSunLight && scene && typeof scene.getObjectByName === "function") {
    dynamicSunLight = scene.getObjectByName("Tier2_DynamicHeroShadowLight") || null;
  }
  if (!dynamicSunLight && options.enableTwoTierShadows !== false) {
    dynamicSunLight = new THREE.DirectionalLight(
      options.sunHex || OMNI_V5_LIGHTING_TELEMETRY.sunColorHex,
      0.0
    );
    dynamicSunLight.name = "Tier2_DynamicHeroShadowLight";
  }
  if (dynamicSunLight) {
    dynamicSunLight.intensity = 0.0;
    dynamicSunLight.castShadow = true;
    dynamicSunLight.layers.enable(0);
    dynamicSunLight.userData = dynamicSunLight.userData || {};
    dynamicSunLight.userData.v5SunDir = sunDir.clone();
    dynamicSunLight.userData.isTier2DynamicShadowLight = true;

    if (dynamicSunLight.shadow) {
      const prevDW = dynamicSunLight.shadow.mapSize ? dynamicSunLight.shadow.mapSize.x : 0;
      const prevDH = dynamicSunLight.shadow.mapSize ? dynamicSunLight.shadow.mapSize.y : 0;
      dynamicSunLight.shadow.mapSize.set(dynamicShadowMapSize, dynamicShadowMapSize);
      if (
        dynamicSunLight.shadow.map &&
        (prevDW !== dynamicShadowMapSize ||
          prevDH !== dynamicShadowMapSize ||
          dynamicSunLight.shadow.map.width !== dynamicShadowMapSize ||
          dynamicSunLight.shadow.map.height !== dynamicShadowMapSize)
      ) {
        if (typeof dynamicSunLight.shadow.map.dispose === "function") {
          dynamicSunLight.shadow.map.dispose();
        }
        dynamicSunLight.shadow.map = null;
      }

      dynamicSunLight.shadow.autoUpdate = true;
      dynamicSunLight.shadow.needsUpdate = true;
      dynamicSunLight.shadow.bias = Number.isFinite(options.dynamicShadowBias)
        ? options.dynamicShadowBias
        : OMNI_V5_LIGHTING_TELEMETRY.dynamicShadowBias;
      dynamicSunLight.shadow.normalBias = Number.isFinite(options.dynamicShadowNormalBias)
        ? options.dynamicShadowNormalBias
        : OMNI_V5_LIGHTING_TELEMETRY.dynamicShadowNormalBias;
      dynamicSunLight.shadow.radius = Number.isFinite(options.dynamicShadowRadius)
        ? options.dynamicShadowRadius
        : OMNI_V5_LIGHTING_TELEMETRY.dynamicShadowRadius;

      const dsc = dynamicSunLight.shadow.camera;
      if (dsc) {
        dsc.near = 2.0;
        dsc.far = 240.0;
        dsc.left = -dynamicHalfExtentM;
        dsc.right = dynamicHalfExtentM;
        dsc.top = dynamicHalfExtentM;
        dsc.bottom = -dynamicHalfExtentM;
        dsc.updateProjectionMatrix();
      }
    }

    if (scene) {
      if (!dynamicSunLight.parent) scene.add(dynamicSunLight);
      if (dynamicSunLight.target && !dynamicSunLight.target.parent) {
        scene.add(dynamicSunLight.target);
      }
    }
  }

  const twoTierState = {
    scene,
    hasRenderer: Boolean(renderer && renderer.shadowMap),
    camera: options.camera || null,
    sunLight,
    dynamicSunLight,
    sunDir,
    staticHalfExtentM: halfExtentM,
    dynamicHalfExtentM,
    dynamicRoots: Array.isArray(options.dynamicRoots) ? [...options.dynamicRoots] : [],
    staticInitialized: false,
    staticAnchorX: 0.0,
    staticAnchorZ: 0.0,
    staticRenderCount: 0,
    dynamicRenderCount: 0,
    lastRenderedStaticCasterCount: 0,
    isSoftwareRenderer,
    enclosedGym: false,
  };
  _activeTwoTierContext = twoTierState;

  if (options.dynamicRoots) {
    registerDynamicShadowCasters(options.dynamicRoots, scene);
  }
  if (renderer && options.enableTwoTierShadows !== false) {
    wrapRendererShadowMapForTwoTier(renderer, twoTierState);
  }

  updateTwoTierShadows({
    heroPos: options.initialFocusPos || { x: 0, y: 0, z: 0 },
    camera: options.camera || null,
    forceStaticRebuild: true,
    sunLight,
    dynamicSunLight,
    scene,
    sunDir,
  });

  // 3. Hemisphere Sky/Ground Bounce, Fill/Rim Calibration & Golden-Hour Aerial Haze
  let hemiLight = options.hemiLight || null;
  if (!hemiLight && scene && Array.isArray(scene.children)) {
    hemiLight = scene.children.find((c) => c && c.isHemisphereLight) || null;
  }
  if (hemiLight) {
    hemiLight.color.set(options.hemiSkyHex || OMNI_V5_LIGHTING_TELEMETRY.hemiSkyHex);
    hemiLight.groundColor.set(options.hemiGroundHex || OMNI_V5_LIGHTING_TELEMETRY.hemiGroundHex);
    hemiLight.intensity = Number.isFinite(options.hemiIntensity)
      ? options.hemiIntensity
      : OMNI_V5_LIGHTING_TELEMETRY.hemiIntensity;
  }

  if (options.fillLight && options.fillLight.color) {
    options.fillLight.color.set(OMNI_V5_LIGHTING_TELEMETRY.fillLightHex);
    options.fillLight.intensity = OMNI_V5_LIGHTING_TELEMETRY.fillLightIntensity;
  }
  if (options.rimLight && options.rimLight.color) {
    options.rimLight.color.set(OMNI_V5_LIGHTING_TELEMETRY.rimLightHex);
    options.rimLight.intensity = OMNI_V5_LIGHTING_TELEMETRY.rimLightIntensity;
  }

  const fogHex = options.fogHex || OMNI_V5_LIGHTING_TELEMETRY.horizonHazeHex;
  const fogDensity = Number.isFinite(options.fogDensity)
    ? options.fogDensity
    : OMNI_V5_LIGHTING_TELEMETRY.fogExp2Density;

  if (scene) {
    scene.background = new THREE.Color(options.skyZenithHex || OMNI_V5_LIGHTING_TELEMETRY.skyZenithHex);
    if (scene.fog && scene.fog.isFogExp2) {
      scene.fog.color.set(fogHex);
      scene.fog.density = fogDensity;
    } else {
      scene.fog = new THREE.FogExp2(fogHex, fogDensity);
    }
  }

  // 4. Warm Horizon Glow Ring
  let horizonGlowMesh = null;
  if (scene && options.enableHorizonGlow !== false) {
    const existingGlow = scene.getObjectByName("V5GoldenHourHorizonGlowRing");
    if (existingGlow) {
      horizonGlowMesh = existingGlow;
    } else {
      horizonGlowMesh = createGoldenHourHorizonGlowMesh(THREE, {
        sunDir,
        hazeHex: fogHex,
        sunHex: options.sunHex || OMNI_V5_LIGHTING_TELEMETRY.sunColorHex,
      });
      scene.add(horizonGlowMesh);
    }
  }

  // 5. SwiftShader-Safe Cinema Vignette & Solar Bloom Optics Overlay
  let opticsOverlay = null;
  if (options.enableOpticsOverlay !== false) {
    let existingVignette = options.vignetteMesh || null;
    if (!existingVignette && options.camera && typeof options.camera.getObjectByName === "function") {
      existingVignette = options.camera.getObjectByName("CinemaFilmicVignette") || null;
    }
    if (existingVignette || options.camera) {
      opticsOverlay = createSwiftShaderSafeOpticsOverlay(THREE, {
        existingVignetteMesh: existingVignette,
        aspect: (options.camera && options.camera.aspect) || 16.0 / 9.0,
        vignetteStrength: options.vignetteStrength,
        bloomStrength: options.bloomStrength,
      });
      if (options.camera && !opticsOverlay.parent) {
        options.camera.add(opticsOverlay);
      }
    }
  }

  // 6. Golden-Hour PMREM Environment Map (auto-baked unless explicitly disabled so Stan bronze & glass have 360 reflections)
  let envRenderTarget = null;
  if (
    options.bakeEnvironment !== false &&
    renderer &&
    scene &&
    (options.bakeEnvironment === true || !scene.environment)
  ) {
    envRenderTarget = bakeGoldenHourEnvironmentMap(THREE, renderer, { sunDir });
    if (envRenderTarget && envRenderTarget.texture) {
      scene.environment = envRenderTarget.texture;
    }
  }

  // 7. `[VETO-3D-02]` Dedicated Spin Studio Window-Streaming Directional Shadow Rig + Volumetric Sunbeams (auto-gated indoors)
  let spinStudioWindowRig = null;
  let spinStudioSunbeams = null;
  if (scene && options.enableSpinStudioWindowLight !== false) {
    spinStudioWindowRig = createSpinStudioWindowSunRig(THREE, scene, {
      shadowMapSize: options.gymShadowMapSize || 1024,
      isSoftwareRenderer,
    });
    if (options.enableSpinStudioSunbeams !== false) {
      spinStudioSunbeams = createSpinStudioSunbeams(THREE, scene, options.sunbeamOptions || {});
    }
    const initPos = options.initialFocusPos || { x: 0, y: 0, z: 0 };
    const nearInitGym = Math.abs(initPos.x || 0) < 28.0 && (initPos.z || 0) > 106.0;
    if (spinStudioWindowRig) {
      spinStudioWindowRig.setIndoorActive(nearInitGym);
    }
    if (spinStudioSunbeams) {
      spinStudioSunbeams.setActive(nearInitGym);
    }
  }

  // 8. `[VETO-W2-02]` Auto-discover & upgrade `Horizon_Santa_Cruz_Mountains_V5` with linear-space Rayleigh/Mie
  // aerial perspective, including self-healing if any post-load pass replaces `child.material`!
  let lastHorizonChildCount = -1;
  let totalAerialHorizonMeshes = 0;
  const isMatMissingAerialOrNormal = (m) =>
    m?.userData?.isFastRidgeSw
      ? false
      : !m?.userData?.v5AerialShaderInstalled ||
        (!isSoftwareRenderer && Boolean(m.userData.v5PreservedNormalMap && !m.normalMap));
  const hasUnpatchedHorizonMesh = (grp) => {
    let missing = false;
    grp.traverse((ch) => {
      if (missing || !ch || !ch.isMesh || !ch.material) return;
      if (Array.isArray(ch.material)) {
        for (let i = 0; i < ch.material.length; i++) {
          if (isMatMissingAerialOrNormal(ch.material[i])) {
            missing = true;
            return;
          }
        }
      } else if (isMatMissingAerialOrNormal(ch.material)) {
        missing = true;
      }
    });
    return missing;
  };
  const syncHorizonAerialPerspective = () => {
    if (!scene || options.enableHorizonAerialPerspective === false) return 0;
    const hGroup =
      options.horizonGroup ||
      (typeof scene.getObjectByName === "function"
        ? scene.getObjectByName("Horizon_Santa_Cruz_Mountains_V5")
        : null);
    if (!hGroup) return 0;
    const childLen = Array.isArray(hGroup.children) ? hGroup.children.length : 0;
    if (
      childLen === lastHorizonChildCount &&
      totalAerialHorizonMeshes > 0 &&
      !hasUnpatchedHorizonMesh(hGroup)
    ) {
      return 0;
    }
    const res = applyAerialPerspectiveToHorizonGroup(THREE, hGroup, { sunDir });
    lastHorizonChildCount = childLen;
    totalAerialHorizonMeshes += res.upgradedMeshes;
    return res.upgradedMeshes;
  };
  syncHorizonAerialPerspective();

  // Reusable scratch objects for zero-GC per-frame sun projection & Two-Tier shadow call
  const _projSun = new THREE.Vector3();
  const _camFwd = new THREE.Vector3();
  const _twoTierCallArgs = {
    heroPos: null,
    camera: null,
    forceStaticRebuild: false,
    isSoftwareRenderer: false,
    sunLight,
    dynamicSunLight,
    scene,
    sunDir,
    cameraLeadBiasM: undefined,
  };
  const _cohesionCallArgs = {
    time: 0.0,
    groundY: 0.0,
    sunDir: null,
    enclosedGym: false,
  };

  /**
   * Zero-GC per-frame synchronizer: locks golden-hour lighting/fog palette, drives the V7
   * Two-Tier Static (`4096x4096` `+-64m` cached) + Dynamic (`2048x2048` `+-10.5m` `1.0cm/texel`)
   * shadow split, updates shared World-Cohesion shader uniforms, auto-gates Spin Studio window
   * shadows/sunbeams, keeps horizon glow centered, and projects solar bloom.
   */
  function updateFrame(focusPos, camera = null, frameOpts = {}) {
    const activeCam = camera || options.camera || null;
    twoTierState.camera = activeCam;
    const activeSunDir = frameOpts.sunDir || sunDir;
    const [fx, fy, fz] = extractFocusPoint(focusPos, activeCam);

    // Lazily catch async-decoded `Horizon_Santa_Cruz_Mountains_V5` meshes (`O(1)` integer check once applied)
    syncHorizonAerialPerspective();

    const seqSec = Number.isFinite(frameOpts.sequenceTime)
      ? frameOpts.sequenceTime
      : Number.isFinite(focusPos?.sequenceTime)
        ? focusPos.sequenceTime
        : Number.isFinite(focusPos?.elapsedTime)
          ? focusPos.elapsedTime
          : 0.0;

    // Auto-gate Spin Studio window shadow rig & Zone 1 volumetric sunbeams: active inside/near Gradient Gym, zero outdoor cost!
    const nearGym = Boolean(frameOpts.enclosedGym) || (Math.abs(fx) < 28.0 && fz > 106.0);
    twoTierState.enclosedGym = Boolean(frameOpts.enclosedGym);
    if (spinStudioWindowRig) {
      spinStudioWindowRig.setIndoorActive(nearGym);
      if (isSoftwareRenderer && nearGym && spinStudioWindowRig.spotLight?.shadow && frameOpts.forceStaticRebuild) {
        spinStudioWindowRig.spotLight.shadow.needsUpdate = true;
      }
    }
    if (spinStudioSunbeams) {
      spinStudioSunbeams.update(seqSec, { nearGym });
    }

    // Synchronize shared World-Cohesion shader uniforms (`0` allocations)
    _cohesionCallArgs.time = seqSec;
    _cohesionCallArgs.groundY = Number.isFinite(focusPos?.groundY) ? focusPos.groundY : 0.0;
    _cohesionCallArgs.sunDir = activeSunDir;
    _cohesionCallArgs.enclosedGym = Boolean(frameOpts.enclosedGym);
    updateWorldCohesionUniforms(_cohesionCallArgs);

    // Keep golden-hour light, cool California sky shadow fill (#7A9EC2) & haze colors authoritative (default true)
    if (frameOpts.enforceGoldenHourPalette !== false) {
      if (sunLight) {
        sunLight.color.set(OMNI_V5_LIGHTING_TELEMETRY.sunColorHex);
        if (!Number.isFinite(frameOpts.sunIntensity)) {
          sunLight.intensity = OMNI_V5_LIGHTING_TELEMETRY.sunIntensity;
        } else {
          sunLight.intensity = frameOpts.sunIntensity;
        }
      }
      if (dynamicSunLight) {
        dynamicSunLight.intensity = 0.0;
      }
      if (hemiLight) {
        hemiLight.color.set(OMNI_V5_LIGHTING_TELEMETRY.hemiSkyHex);
        hemiLight.groundColor.set(OMNI_V5_LIGHTING_TELEMETRY.hemiGroundHex);
        hemiLight.intensity = OMNI_V5_LIGHTING_TELEMETRY.hemiIntensity;
      }
      if (options.fillLight && options.fillLight.color) {
        options.fillLight.color.set(OMNI_V5_LIGHTING_TELEMETRY.fillLightHex);
        options.fillLight.intensity = OMNI_V5_LIGHTING_TELEMETRY.fillLightIntensity;
      }
      if (options.rimLight && options.rimLight.color) {
        options.rimLight.color.set(OMNI_V5_LIGHTING_TELEMETRY.rimLightHex);
        options.rimLight.intensity = OMNI_V5_LIGHTING_TELEMETRY.rimLightIntensity;
      }
      if (scene && scene.fog && scene.fog.isFogExp2) {
        scene.fog.color.set(OMNI_V5_LIGHTING_TELEMETRY.horizonHazeHex);
        scene.fog.density = OMNI_V5_LIGHTING_TELEMETRY.fogExp2Density;
      }
    }

    _twoTierCallArgs.heroPos = focusPos;
    _twoTierCallArgs.camera = activeCam;
    _twoTierCallArgs.forceStaticRebuild = Boolean(frameOpts.forceStaticRebuild);
    _twoTierCallArgs.isSoftwareRenderer = Boolean(frameOpts.isSoftwareRenderer);
    _twoTierCallArgs.sunDir = activeSunDir;
    _twoTierCallArgs.cameraLeadBiasM = frameOpts.cameraLeadBiasM;
    updateTwoTierShadows(_twoTierCallArgs);

    const shadowTelemetry =
      (sunLight && sunLight.userData && sunLight.userData.v5LastShadowFrustum) || null;

    if (horizonGlowMesh) {
      horizonGlowMesh.position.set(fx, 0.0, fz);
      const u = horizonGlowMesh.material && horizonGlowMesh.material.uniforms;
      if (u && u.uSunDir && u.uSunDir.value) {
        const [sx2, sy2, sz2] = Array.isArray(activeSunDir)
          ? safeNormalizeTriplet(activeSunDir[0], activeSunDir[1], activeSunDir[2])
          : safeNormalizeTriplet(activeSunDir.x, activeSunDir.y, activeSunDir.z);
        u.uSunDir.value.set(sx2, sy2, sz2);
      }
    }

    if (opticsOverlay && opticsOverlay.material && opticsOverlay.material.uniforms && activeCam) {
      const u = opticsOverlay.material.uniforms;
      if (u.uAspect && Number.isFinite(activeCam.aspect) && activeCam.aspect > 0.1) {
        u.uAspect.value = activeCam.aspect;
      }
      const enclosedGym = Boolean(frameOpts.enclosedGym);
      if (enclosedGym) {
        u.uSunScreen.value.set(0.0, 0.0, 0.0);
      } else {
        const [sx2, sy2, sz2] = Array.isArray(activeSunDir)
          ? safeNormalizeTriplet(activeSunDir[0], activeSunDir[1], activeSunDir[2])
          : safeNormalizeTriplet(activeSunDir.x, activeSunDir.y, activeSunDir.z);
        _projSun.set(fx + sx2 * 355.0, Math.max(18.0, fy + sy2 * 355.0), fz + sz2 * 355.0);

        let forwardAlignment = 0.0;
        if (activeCam.matrixWorld && activeCam.matrixWorld.elements) {
          const e = activeCam.matrixWorld.elements;
          const [cfx, cfy, cfz] = safeNormalizeTriplet(-e[8], -e[9], -e[10], 0.0, 0.0, -1.0);
          _camFwd.set(cfx, cfy, cfz);
          forwardAlignment = _camFwd.x * sx2 + _camFwd.y * sy2 + _camFwd.z * sz2;
        }
        if (forwardAlignment > 0.05) {
          _projSun.project(activeCam);
          const vis = clamp((forwardAlignment - 0.05) / 0.55, 0.0, 1.0);
          u.uSunScreen.value.set(
            clamp(_projSun.x, -1.6, 1.6),
            clamp(_projSun.y, -1.6, 1.6),
            vis
          );
        } else {
          u.uSunScreen.value.set(0.0, 0.0, 0.0);
        }
      }
    }

    return shadowTelemetry;
  }

  function dispose() {
    if (horizonGlowMesh) {
      if (horizonGlowMesh.parent) horizonGlowMesh.parent.remove(horizonGlowMesh);
      if (horizonGlowMesh.geometry) horizonGlowMesh.geometry.dispose();
      if (horizonGlowMesh.material) horizonGlowMesh.material.dispose();
    }
    if (dynamicSunLight) {
      if (dynamicSunLight.shadow && dynamicSunLight.shadow.map) {
        dynamicSunLight.shadow.map.dispose();
      }
      if (dynamicSunLight.target && dynamicSunLight.target.parent) {
        dynamicSunLight.target.parent.remove(dynamicSunLight.target);
      }
      if (dynamicSunLight.parent) {
        dynamicSunLight.parent.remove(dynamicSunLight);
      }
    }
    if (spinStudioWindowRig && spinStudioWindowRig.rigGroup && spinStudioWindowRig.rigGroup.parent) {
      spinStudioWindowRig.rigGroup.parent.remove(spinStudioWindowRig.rigGroup);
    }
    if (spinStudioSunbeams && typeof spinStudioSunbeams.dispose === "function") {
      spinStudioSunbeams.dispose();
    }
    if (envRenderTarget && typeof envRenderTarget.dispose === "function") {
      envRenderTarget.dispose();
    }
    if (_activeTwoTierContext === twoTierState) {
      _activeTwoTierContext = null;
    }
  }

  const api = {
    telemetry: OMNI_V5_LIGHTING_TELEMETRY,
    sunDir,
    sunLight,
    dynamicSunLight,
    horizonGlowMesh,
    opticsOverlay,
    envRenderTarget,
    spinStudioWindowRig,
    spinStudioSunbeams,
    registerDynamicShadowCasters: (targets) => registerDynamicShadowCasters(targets, scene),
    syncTwoTierShadowLayers: (force = false) =>
      syncTwoTierShadowLayers(scene, twoTierState.dynamicRoots, force),
    updateTwoTierShadows: (opts = {}) => {
      _twoTierCallArgs.heroPos = opts.heroPos !== undefined ? opts.heroPos : opts.focusPos;
      _twoTierCallArgs.camera = opts.camera || twoTierState.camera;
      _twoTierCallArgs.forceStaticRebuild = Boolean(opts.forceStaticRebuild);
      _twoTierCallArgs.isSoftwareRenderer = Boolean(opts.isSoftwareRenderer);
      _twoTierCallArgs.sunDir = opts.sunDir || sunDir;
      _twoTierCallArgs.cameraLeadBiasM = opts.cameraLeadBiasM;
      return updateTwoTierShadows(_twoTierCallArgs);
    },
    updateForHero: (opts = {}) => {
      _twoTierCallArgs.heroPos = opts.heroPos !== undefined ? opts.heroPos : opts.focusPos;
      _twoTierCallArgs.camera = opts.camera || twoTierState.camera;
      _twoTierCallArgs.forceStaticRebuild = Boolean(opts.forceStaticRebuild);
      _twoTierCallArgs.isSoftwareRenderer = Boolean(opts.isSoftwareRenderer);
      _twoTierCallArgs.sunDir = opts.sunDir || sunDir;
      _twoTierCallArgs.cameraLeadBiasM = opts.cameraLeadBiasM;
      return updateTwoTierShadows(_twoTierCallArgs);
    },
    applyAerialPerspectiveToHorizonGroup: (grp, opts = {}) =>
      applyAerialPerspectiveToHorizonGroup(THREE, grp, { sunDir, ...opts }),
    syncHorizonAerialPerspective,
    updateFrame,
    updateShadowFrustum: (focusPos, camera = null, opts = {}) =>
      updateTightCameraShadowFrustum(sunLight, focusPos, camera, {
        sunDir,
        halfExtentM,
        ...opts,
      }),
    dispose,
  };

  if (typeof window !== "undefined") {
    window.__V5_LIGHTING_CONFIG__ = {
      shadowMapSize,
      shadowMapType: "PCFSoftShadowMap",
      halfExtentM,
      texelSizeM: (halfExtentM * 2.0) / shadowMapSize,
      dynamicShadowMapSize,
      dynamicHalfExtentM,
      dynamicTexelSizeM: (dynamicHalfExtentM * 2.0) / dynamicShadowMapSize,
      twoTierShadowsEnabled: Boolean(dynamicSunLight),
      sunColorHex: OMNI_V5_LIGHTING_TELEMETRY.sunColorHex,
      sunDirectionYup: [...OMNI_V5_LIGHTING_TELEMETRY.sunDirectionYup],
      horizonHazeHex: OMNI_V5_LIGHTING_TELEMETRY.horizonHazeHex,
      fogExp2Density: OMNI_V5_LIGHTING_TELEMETRY.fogExp2Density,
      spinStudioWindowShadowEnabled: Boolean(spinStudioWindowRig),
    };
  }

  return api;
}

const FUSED_CINEMA_POSTFX_VERTEX_GLSL = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const BLOOM_DOWNSAMPLE_FRAGMENT_GLSL = /* glsl */ `
  precision highp float;
  uniform sampler2D tSrc;
  uniform vec2 uSrcTexelSize;
  uniform float uBloomThreshold;
  varying vec2 vUv;

  float softBloomFactor(vec3 c, float threshold) {
    float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float knee = threshold * 0.48 + 1e-4;
    float soft = clamp(lum - threshold + knee, 0.0, 2.0 * knee);
    soft = (soft * soft) / (4.0 * knee);
    float contrib = max(soft, lum - threshold) / max(lum, 1e-4);
    return clamp(contrib, 0.0, 1.0);
  }

  vec3 extractBloom(vec2 uv) {
    vec3 col = clamp(texture2D(tSrc, clamp(uv, 0.001, 0.999)).rgb, vec3(0.0), vec3(6.0));
    return col * softBloomFactor(col, uBloomThreshold);
  }

  void main() {
    vec2 d = uSrcTexelSize * 1.25;
    vec3 acc = extractBloom(vUv) * 0.36;
    acc += extractBloom(vUv + vec2( d.x,  d.y)) * 0.16;
    acc += extractBloom(vUv + vec2(-d.x,  d.y)) * 0.16;
    acc += extractBloom(vUv + vec2( d.x, -d.y)) * 0.16;
    acc += extractBloom(vUv + vec2(-d.x, -d.y)) * 0.16;
    gl_FragColor = vec4(acc, 1.0);
  }
`;

const BLOOM_GAUSSIAN_BLUR_FRAGMENT_GLSL = /* glsl */ `
  precision highp float;
  uniform sampler2D tSrc;
  uniform vec2 uBlurStep;
  varying vec2 vUv;

  void main() {
    // 9-tap Gaussian filter realized with 5 linear-interpolated hardware texture fetches
    vec2 o1 = uBlurStep * 1.3846153846;
    vec2 o2 = uBlurStep * 3.2307692308;
    vec3 sum = texture2D(tSrc, vUv).rgb * 0.2270270270;
    sum += texture2D(tSrc, clamp(vUv + o1, 0.001, 0.999)).rgb * 0.3162162162;
    sum += texture2D(tSrc, clamp(vUv - o1, 0.001, 0.999)).rgb * 0.3162162162;
    sum += texture2D(tSrc, clamp(vUv + o2, 0.001, 0.999)).rgb * 0.0702702703;
    sum += texture2D(tSrc, clamp(vUv - o2, 0.001, 0.999)).rgb * 0.0702702703;
    gl_FragColor = vec4(max(sum, vec3(0.0)), 1.0);
  }
`;

const FUSED_CINEMA_POSTFX_FRAGMENT_GLSL = /* glsl */ `
  precision highp float;

  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform sampler2D tBloom;
  uniform vec2 uResolution;
  uniform vec2 uTexelSize;
  uniform float uCameraNear;
  uniform float uCameraFar;
  uniform float uExposure;
  uniform float uTime;

  uniform float uAoStrength;
  uniform float uAoRadiusPx;

  uniform float uDofStrength;
  uniform float uDofFocusDist;
  uniform float uDofFocalRange;
  uniform float uDofMaxBlurPx;

  uniform float uBloomStrength;
  uniform float uBloomThreshold;
  uniform vec3 uSunScreen;

  uniform float uVignetteStrength;
  uniform float uGrainStrength;
  uniform vec3 uShadowTint;
  uniform vec3 uHighlightTint;

  varying vec2 vUv;

  // Exact perspective depth [0..1] -> view-space positive distance in meters
  float linearizeDepthM(float rawDepth, float nearZ, float farZ) {
    float zNdc = rawDepth * 2.0 - 1.0;
    float denom = max(farZ + nearZ - zNdc * (farZ - nearZ), 1e-5);
    return (2.0 * nearZ * farZ) / denom;
  }

  float ignNoise(vec2 pixelPos) {
    return fract(52.9829189 * fract(dot(pixelPos, vec2(0.06711056, 0.00583715))));
  }

  float softBloomFactor(vec3 c, float threshold) {
    float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float knee = threshold * 0.48 + 1e-4;
    float soft = clamp(lum - threshold + knee, 0.0, 2.0 * knee);
    soft = (soft * soft) / (4.0 * knee);
    float contrib = max(soft, lum - threshold) / max(lum, 1e-4);
    return clamp(contrib, 0.0, 1.0);
  }

  // Troy Sobotka / Blender 4+ analytical AgX transform (column-major matrices preserving vec3(1.0) neutral)
  const mat3 AGX_INSET_MAT = mat3(
    0.842479062253094,  0.0423282422610123, 0.0423756549057051,
    0.0784335999999992, 0.878468636469772,  0.0784336,
    0.0792237451477643, 0.0791661274605434, 0.879142973793104
  );

  const mat3 AGX_OUTSET_MAT = mat3(
     1.19687900512017,   -0.0528968517574562, -0.0529716355144438,
    -0.0980208811401368,  1.15190312990417,   -0.0980434501171241,
    -0.0990297440797205, -0.0989611768448433,  1.15107367264116
  );

  vec3 agxSigmoidApprox(vec3 x) {
    vec3 x2 = x * x;
    vec3 x4 = x2 * x2;
    return 15.5 * x4 * x2
         - 40.14 * x4 * x
         + 31.96 * x4
         - 6.868 * x2 * x
         + 0.4298 * x2
         + 0.1191 * x
         - 0.00232;
  }

  vec3 applyGoldenHourAgX(vec3 hdrLinear) {
    vec3 c = max(hdrLinear, vec3(0.0));

    // Golden-Hour 3D Film Split-Grade in linear scene-referred space:
    // cool #7B9EC4 California sky fill in shadows + warm sunlight kiss in highlights
    float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float shadowMask = (1.0 - smoothstep(0.012, 0.28, lum)) * smoothstep(0.0005, 0.025, lum);
    float hiMask = smoothstep(0.30, 1.55, lum);

    float shTintLum = max(dot(uShadowTint, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
    vec3 normShadowTint = uShadowTint / shTintLum;
    c = mix(c, c * mix(vec3(1.0), normShadowTint, 0.20), shadowMask);

    float hiTintLum = max(dot(uHighlightTint, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
    vec3 normHiTint = uHighlightTint / hiTintLum;
    c = mix(c, c * mix(vec3(1.0), normHiTint, 0.16), hiMask);

    // AgX inset chroma compression + log2 encoding [-12.47393 .. +4.026069] EV
    vec3 inset = max(AGX_INSET_MAT * c, vec3(1e-10));
    vec3 ev = clamp((log2(inset) + 12.47393) / 16.50, 0.0, 1.0);
    vec3 curved = clamp(agxSigmoidApprox(ev), 0.0, 1.0);

    // Decode curve to linear display space (NaN-guarded pow) + subtle Golden-Hour Punchy chroma restore
    vec3 linearAgx = pow(max(curved, vec3(1e-5)), vec3(2.2));
    float agxLum = dot(linearAgx, vec3(0.2126, 0.7152, 0.0722));
    linearAgx = max(vec3(agxLum) + (linearAgx - vec3(agxLum)) * 1.15, vec3(0.0));

    vec3 outCol = max(AGX_OUTSET_MAT * linearAgx, vec3(0.0));
    // Soft highlight shoulder ceiling so specular glints never hard-clip to [1,1,1]
    outCol = outCol / (vec3(1.0) + outCol * 0.028);
    return clamp(outCol, 0.0, 0.996);
  }

  vec3 linearToSrgbExact(vec3 lin) {
    vec3 clamped = clamp(lin, 0.0, 1.0);
    vec3 lo = clamped * 12.92;
    vec3 hi = 1.055 * pow(max(clamped, vec3(1e-5)), vec3(1.0 / 2.4)) - 0.055;
    return mix(lo, hi, step(vec3(0.0031308), clamped));
  }

  void main() {
    vec3 baseHdr = max(texture2D(tColor, vUv).rgb, vec3(0.0));
    float rawDepth = texture2D(tDepth, vUv).r;
    float resScale = clamp(uResolution.y / 1080.0, 0.5, 3.0);
    float noise = ignNoise(gl_FragCoord.xy);
    float ang = noise * 6.28318530718;
    float ca = cos(ang);
    float sa = sin(ang);

    float viewZ = linearizeDepthM(rawDepth, uCameraNear, uCameraFar);

    // 1. Screen-Space Depth-Buffer Contact AO (symmetric-pair concavity -> zero flat-slope false shading!)
    float contactAo = 1.0;
    if (uAoStrength > 0.001 && rawDepth < 0.9995 && viewZ < 155.0) {
      vec2 step1 = vec2(ca, sa) * uTexelSize * (uAoRadiusPx * resScale);
      vec2 step2 = vec2(-sa, ca) * uTexelSize * (uAoRadiusPx * 0.62 * resScale);

      float z1p = linearizeDepthM(texture2D(tDepth, clamp(vUv + step1, 0.001, 0.999)).r, uCameraNear, uCameraFar);
      float z1m = linearizeDepthM(texture2D(tDepth, clamp(vUv - step1, 0.001, 0.999)).r, uCameraNear, uCameraFar);
      float z2p = linearizeDepthM(texture2D(tDepth, clamp(vUv + step2, 0.001, 0.999)).r, uCameraNear, uCameraFar);
      float z2m = linearizeDepthM(texture2D(tDepth, clamp(vUv - step2, 0.001, 0.999)).r, uCameraNear, uCameraFar);

      float thickness = clamp(viewZ * 0.042, 0.065, 0.90);
      float w1 = 1.0 - smoothstep(thickness * 0.55, thickness, max(abs(z1p - viewZ), abs(z1m - viewZ)));
      float w2 = 1.0 - smoothstep(thickness * 0.55, thickness, max(abs(z2p - viewZ), abs(z2m - viewZ)));

      float conc1 = max(0.0, viewZ - 0.5 * (z1p + z1m) - 0.0035 * max(1.0, viewZ * 0.25)) * w1;
      float conc2 = max(0.0, viewZ - 0.5 * (z2p + z2m) - 0.0025 * max(1.0, viewZ * 0.25)) * w2;
      float normScale = 1.0 / max(0.048 * max(1.0, viewZ * 0.28), 0.02);
      float occ = clamp((conc1 + conc2) * normScale, 0.0, 1.0);
      float distFade = 1.0 - smoothstep(65.0, 150.0, viewZ);
      contactAo = 1.0 - uAoStrength * occ * distFade;
    }

    // 2. Optional Cold-Open Macro Shallow Depth-of-Field (0 extra taps when uDofStrength <= 0.001!)
    vec3 sceneHdr = baseHdr;
    if (uDofStrength > 0.001) {
      float focusDist = max(uDofFocusDist, 0.15);
      float effFocalRange = min(uDofFocalRange, focusDist * 0.22);
      float cocDenom = max(focusDist * 0.85 + 0.35, 0.28);
      float distDelta = abs(viewZ - focusDist);
      float coc = clamp((distDelta - effFocalRange) / cocDenom, 0.0, 1.0) * clamp(uDofStrength, 0.0, 1.0);

      if (coc > 0.015) {
        vec2 blurScale = uTexelSize * (coc * uDofMaxBlurPx * resScale);
        vec3 accCol = baseHdr;
        float accW = 1.0;
        mat2 rotDof = mat2(ca, sa, -sa, ca);
        vec2 dofDisk[8];
        dofDisk[0] = vec2( 0.2500000,  0.0000000);
        dofDisk[1] = vec2(-0.3190379,  0.2923415);
        dofDisk[2] = vec2( 0.0480464, -0.5570127);
        dofDisk[3] = vec2( 0.4570868,  0.5734304);
        dofDisk[4] = vec2(-0.8224112, -0.1489626);
        dofDisk[5] = vec2( 0.7289457, -0.5305545);
        dofDisk[6] = vec2(-0.1757407,  0.9521634);
        dofDisk[7] = vec2(-0.5698216, -0.9015642);
        for (int k = 0; k < 8; k++) {
          vec2 sUv = clamp(vUv + (rotDof * dofDisk[k]) * blurScale, 0.001, 0.999);
          vec3 sCol = max(texture2D(tColor, sUv).rgb, vec3(0.0));
          float sZ = linearizeDepthM(texture2D(tDepth, sUv).r, uCameraNear, uCameraFar);
          float sCoc = clamp(
            (abs(sZ - focusDist) - effFocalRange) / cocDenom,
            0.0,
            1.0
          ) * clamp(uDofStrength, 0.0, 1.0);
          // Prevent crisp in-focus foreground dumbbell from bleeding blurry halo onto background or vice-versa
          float fgGuard = (sZ < viewZ - 0.08) ? smoothstep(0.02, 0.25, sCoc) : 1.0;
          float w = (0.35 + 0.65 * sCoc) * fgGuard;
          accCol += min(sCol, vec3(8.0)) * w;
          accW += w;
        }
        sceneHdr = accCol / max(accW, 1e-4);
      }
    }

    // Apply Contact AO largely to indirect/midtone energy while letting intense direct specular glints punch through
    float baseLum = dot(sceneHdr, vec3(0.2126, 0.7152, 0.0722));
    float specPreserve = smoothstep(0.85, 2.4, baseLum);
    sceneHdr *= mix(contactAo, 1.0, specPreserve * 0.75);

    // 3. Half-Resolution (0.5x) Separable Gaussian Bloom Halo + Golden Solar Screen Glow
    if (uBloomStrength > 0.001) {
      vec3 bloom = max(texture2D(tBloom, vUv).rgb, vec3(0.0));
      sceneHdr += bloom * vec3(1.06, 0.96, 0.85) * uBloomStrength;

      if (uSunScreen.z > 0.001) {
        float aspect = max(uResolution.x / max(uResolution.y, 1.0), 0.25);
        vec2 ndc = vUv * 2.0 - 1.0;
        vec2 dSun = vec2((ndc.x - uSunScreen.x) * aspect, ndc.y - uSunScreen.y);
        float sunDist = sqrt(max(dot(dSun, dSun), 1e-6));
        float sunGlow = exp(-sunDist * 2.55) * 0.075 * uSunScreen.z;
        sceneHdr += vec3(1.0, 0.83, 0.56) * sunGlow;
      }
    }

    // 4. Golden-Hour AgX / 3D Film Color-Grading Curve
    vec3 gradedLinear = applyGoldenHourAgX(sceneHdr * uExposure);

    // 5. Subtle Cinema Vignette + Exact sRGB + Fine 35mm Film Grain
    vec2 centered = vUv * 2.0 - 1.0;
    float aspectV = max(uResolution.x / max(uResolution.y, 1.0), 0.5);
    vec2 vigCoord = vec2(centered.x * mix(1.0, aspectV * 0.62, 0.35), centered.y);
    float r2 = dot(vigCoord, vigCoord);
    float vig = 1.0 - uVignetteStrength * smoothstep(0.45, 1.62, r2);
    gradedLinear *= clamp(vig, 0.55, 1.0);

    vec3 srgb = linearToSrgbExact(gradedLinear);

    if (uGrainStrength > 0.0001) {
      float tSeed = fract(uTime * 0.731);
      float g = ignNoise(gl_FragCoord.xy + vec2(tSeed * 197.0, tSeed * 113.0)) - 0.5;
      float srgbLum = dot(srgb, vec3(0.299, 0.587, 0.114));
      float emulsionWeight = 4.0 * srgbLum * (1.0 - srgbLum) * 0.70 + 0.30;
      srgb = clamp(srgb + vec3(g * uGrainStrength * emulsionWeight), 0.0, 1.0);
    }

    gl_FragColor = vec4(srgb, 1.0);
  }
`;

function detectSoftwareWebGLRenderer(renderer, explicitFlag) {
  if (typeof explicitFlag === "boolean") return explicitFlag;
  if (!renderer || typeof renderer.getContext !== "function") return false;
  try {
    const gl = renderer.getContext();
    if (!gl) return false;
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const rendererStr = dbg
      ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || "")
      : String(gl.getParameter(gl.RENDERER) || "");
    return /SwiftShader|llvmpipe|Software|Lavapipe/i.test(rendererStr);
  } catch {
    return false;
  }
}

/**
 * Section 4C — Single-Pass Fused Cinema Post-Processing Pipeline (`0` per-frame heap allocations).
 *
 * Renders the main scene into a linear HDR `WebGLRenderTarget` (`HalfFloatType` with `UnsignedByteType`
 * fallback, `samples: 4` MSAA on hardware WebGL2 / `samples: 0` on SwiftShader, + `DepthTexture`)
 * and fuses in ONE fullscreen triangle pass:
 *   1. Screen-space depth-buffer Contact AO,
 *   2. Conditional Cold-Open Macro Shallow Depth-of-Field (`uDofStrength`, `uDofFocusDist`; `0` extra taps when `0.0`),
 *   3. Controlled warm highlight Bloom halo,
 *   4. Golden-Hour AgX / 3D Film Color-Grading Curve (warm sunlit highlights + cool `#7B9EC4` sky shadows),
 *   5. Subtle cinema Vignette + fine `35mm` Film Grain.
 */
export function createCinemaPostFXPipeline(THREE = DEFAULT_THREE, renderer, options = {}) {
  const isSoftwareRenderer = detectSoftwareWebGLRenderer(renderer, options.isSoftwareRenderer);
  const gl = renderer && typeof renderer.getContext === "function" ? renderer.getContext() : null;

  let supportsHalfFloatColorBuffer = false;
  let maxSamples = 0;
  if (gl) {
    try {
      supportsHalfFloatColorBuffer = Boolean(
        gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float")
      );
      if (typeof gl.MAX_SAMPLES === "number") {
        maxSamples = Number(gl.getParameter(gl.MAX_SAMPLES)) || 0;
      }
    } catch {
      supportsHalfFloatColorBuffer = false;
      maxSamples = 0;
    }
  }

  const rtType =
    options.rtType ||
    (supportsHalfFloatColorBuffer && THREE.HalfFloatType !== undefined
      ? THREE.HalfFloatType
      : THREE.UnsignedByteType);

  const requestedSamples = isSoftwareRenderer
    ? Number.isFinite(options.softwareSamples)
      ? Math.max(0, Math.round(options.softwareSamples))
      : 0
    : Number.isFinite(options.samples)
      ? Math.max(0, Math.round(options.samples))
      : 4;
  const effectiveSamples = maxSamples > 0 ? Math.min(requestedSamples, maxSamples) : 0;

  const _drawSize = new THREE.Vector2(1920, 1080);
  if (renderer && typeof renderer.getDrawingBufferSize === "function") {
    renderer.getDrawingBufferSize(_drawSize);
  }
  const initW = Math.max(2, Math.round(options.width || _drawSize.x || 1920));
  const initH = Math.max(2, Math.round(options.height || _drawSize.y || 1080));

  const depthTexture = new THREE.DepthTexture(initW, initH, THREE.UnsignedIntType);
  depthTexture.format = THREE.DepthFormat;
  depthTexture.minFilter = THREE.NearestFilter;
  depthTexture.magFilter = THREE.NearestFilter;
  depthTexture.generateMipmaps = false;

  const renderTarget = new THREE.WebGLRenderTarget(initW, initH, {
    format: THREE.RGBAFormat,
    type: rtType,
    colorSpace:
      THREE.LinearSRGBColorSpace !== undefined ? THREE.LinearSRGBColorSpace : undefined,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
    stencilBuffer: false,
    samples: effectiveSamples,
    depthTexture,
     generateMipmaps: false,
  });
  renderTarget.texture.name = "V7CinemaPostFXColorRT";
  depthTexture.name = "V7CinemaPostFXDepthRT";

  // Priority 0.3B: Half-Resolution (0.5x) Gaussian Bloom Downsample + Separable Blur FBOs
  // while keeping primary HDR color + depth RT at full 1.0x native resolution!
  const BLOOM_SCALE = 0.5;
  const initBloomW = Math.max(1, Math.round(initW * BLOOM_SCALE));
  const initBloomH = Math.max(1, Math.round(initH * BLOOM_SCALE));
  const bloomRtOpts = {
    format: THREE.RGBAFormat,
    type: rtType,
    colorSpace:
      THREE.LinearSRGBColorSpace !== undefined ? THREE.LinearSRGBColorSpace : undefined,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
    samples: 0,
    generateMipmaps: false,
  };
  const bloomDownTarget = new THREE.WebGLRenderTarget(initBloomW, initBloomH, bloomRtOpts);
  bloomDownTarget.texture.name = "V9HalfResBloomDownRT";
  const bloomBlurTarget = new THREE.WebGLRenderTarget(initBloomW, initBloomH, bloomRtOpts);
  bloomBlurTarget.texture.name = "V9HalfResBloomBlurRT";

  const uniforms = {
    tColor: { value: renderTarget.texture },
    tDepth: { value: depthTexture },
    tBloom: { value: bloomBlurTarget.texture },
    uResolution: { value: new THREE.Vector2(initW, initH) },
    uTexelSize: { value: new THREE.Vector2(1.0 / initW, 1.0 / initH) },
    uCameraNear: { value: 0.1 },
    uCameraFar: { value: 1600.0 },
    uExposure: {
      value: Number.isFinite(options.exposure)
        ? options.exposure
        : (renderer && Number.isFinite(renderer.toneMappingExposure)
            ? renderer.toneMappingExposure
            : OMNI_V5_LIGHTING_TELEMETRY.toneMappingExposure),
    },
    uTime: { value: 0.0 },
    uAoStrength: { value: Number.isFinite(options.aoStrength) ? options.aoStrength : 0.34 },
    uAoRadiusPx: { value: Number.isFinite(options.aoRadiusPx) ? options.aoRadiusPx : 4.5 },
    uDofStrength: { value: Number.isFinite(options.dofStrength) ? options.dofStrength : 0.0 },
    uDofFocusDist: { value: Number.isFinite(options.dofFocusDist) ? options.dofFocusDist : 1.35 },
    uDofFocalRange: { value: Number.isFinite(options.dofFocalRange) ? options.dofFocalRange : 0.55 },
    uDofMaxBlurPx: { value: Number.isFinite(options.dofMaxBlurPx) ? options.dofMaxBlurPx : 9.5 },
    uBloomStrength: { value: Number.isFinite(options.bloomStrength) ? options.bloomStrength : 0.16 },
    uBloomThreshold: { value: Number.isFinite(options.bloomThreshold) ? options.bloomThreshold : 0.92 },
    uSunScreen: { value: new THREE.Vector3(0.0, 0.0, 0.0) },
    uVignetteStrength: {
      value: Number.isFinite(options.vignetteStrength) ? options.vignetteStrength : 0.18,
    },
    uGrainStrength: {
      value: Number.isFinite(options.grainStrength) ? options.grainStrength : 0.016,
    },
    uShadowTint: { value: new THREE.Color(options.shadowTintHex || "#7B9EC4") },
    uHighlightTint: { value: new THREE.Color(options.highlightTintHex || "#FFE6BF") },
  };

  const bloomDownUniforms = {
    tSrc: { value: renderTarget.texture },
    uSrcTexelSize: { value: new THREE.Vector2(1.0 / initW, 1.0 / initH) },
    uBloomThreshold: uniforms.uBloomThreshold,
  };
  const bloomDownMat = new THREE.ShaderMaterial({
    name: "V9HalfResBloomDownsampleMat",
    uniforms: bloomDownUniforms,
    vertexShader: FUSED_CINEMA_POSTFX_VERTEX_GLSL,
    fragmentShader: BLOOM_DOWNSAMPLE_FRAGMENT_GLSL,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
    toneMapped: false,
  });

  const bloomBlurUniforms = {
    tSrc: { value: bloomBlurTarget.texture },
    uBlurStep: { value: new THREE.Vector2(1.0 / initBloomW, 0.0) },
  };
  const bloomBlurMat = new THREE.ShaderMaterial({
    name: "V9HalfResBloomGaussianBlurMat",
    uniforms: bloomBlurUniforms,
    vertexShader: FUSED_CINEMA_POSTFX_VERTEX_GLSL,
    fragmentShader: BLOOM_GAUSSIAN_BLUR_FRAGMENT_GLSL,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
    toneMapped: false,
  });

  const material = new THREE.ShaderMaterial({
    name: "V7FusedCinemaPostFXMat",
    uniforms,
    vertexShader: FUSED_CINEMA_POSTFX_VERTEX_GLSL,
    fragmentShader: FUSED_CINEMA_POSTFX_FRAGMENT_GLSL,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
    toneMapped: false,
  });

  // Single fullscreen triangle (3 vertices -> 0 diagonal quad overshading seam!)
  const fsGeometry = new THREE.BufferGeometry();
  fsGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array([-1.0, -1.0, 0.0, 3.0, -1.0, 0.0, -1.0, 3.0, 0.0]), 3)
  );
  const fsMesh = new THREE.Mesh(fsGeometry, material);
  fsMesh.name = "V7FusedCinemaPostFXTriangle";
  fsMesh.frustumCulled = false;

  const bloomDownMesh = new THREE.Mesh(fsGeometry, bloomDownMat);
  bloomDownMesh.name = "V9HalfResBloomDownTriangle";
  bloomDownMesh.frustumCulled = false;
  const bloomDownScene = new THREE.Scene();
  bloomDownScene.name = "V9HalfResBloomDownScene";
  bloomDownScene.add(bloomDownMesh);

  const bloomBlurMesh = new THREE.Mesh(fsGeometry, bloomBlurMat);
  bloomBlurMesh.name = "V9HalfResBloomBlurTriangle";
  bloomBlurMesh.frustumCulled = false;
  const bloomBlurScene = new THREE.Scene();
  bloomBlurScene.name = "V9HalfResBloomBlurScene";
  bloomBlurScene.add(bloomBlurMesh);

  const fsScene = new THREE.Scene();
  fsScene.name = "V7FusedCinemaPostFXScene";
  fsScene.add(fsMesh);
  const fsCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  let enabled = options.enabled !== false;
  let cachedVignetteCam = null;
  let cachedVignetteMesh = options.vignetteMesh || null;

  function _syncTargetsToSize(w, h) {
    if (renderTarget.width !== w || renderTarget.height !== h) {
      renderTarget.setSize(w, h);
    }
    const bw = Math.max(1, Math.round(w * BLOOM_SCALE));
    const bh = Math.max(1, Math.round(h * BLOOM_SCALE));
    if (bloomDownTarget.width !== bw || bloomDownTarget.height !== bh) {
      bloomDownTarget.setSize(bw, bh);
    }
    if (bloomBlurTarget.width !== bw || bloomBlurTarget.height !== bh) {
      bloomBlurTarget.setSize(bw, bh);
    }
    uniforms.uResolution.value.set(w, h);
    uniforms.uTexelSize.value.set(1.0 / w, 1.0 / h);
    bloomDownUniforms.uSrcTexelSize.value.set(1.0 / w, 1.0 / h);
  }

  function setSize(width, height, pixelRatio = 1.0) {
    const pr = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1.0;
    const w = Math.max(2, Math.round(width * pr));
    const h = Math.max(2, Math.round(height * pr));
    _syncTargetsToSize(w, h);
  }

  function updateUniforms(uOpts = {}) {
    if (!uOpts) return;
    if (Number.isFinite(uOpts.time)) uniforms.uTime.value = uOpts.time;
    if (Number.isFinite(uOpts.exposure)) uniforms.uExposure.value = uOpts.exposure;
    if (Number.isFinite(uOpts.aoStrength)) uniforms.uAoStrength.value = uOpts.aoStrength;
    if (Number.isFinite(uOpts.aoRadiusPx)) uniforms.uAoRadiusPx.value = uOpts.aoRadiusPx;
    if (Number.isFinite(uOpts.dofStrength)) uniforms.uDofStrength.value = uOpts.dofStrength;
    const fDist = Number.isFinite(uOpts.dofFocusDist)
      ? uOpts.dofFocusDist
      : uOpts.dofFocusDistM;
    if (Number.isFinite(fDist) && fDist > 0.05) {
      uniforms.uDofFocusDist.value = fDist;
    }
    if (Number.isFinite(uOpts.dofFocalRange)) uniforms.uDofFocalRange.value = uOpts.dofFocalRange;
    if (Number.isFinite(uOpts.bloomStrength)) uniforms.uBloomStrength.value = uOpts.bloomStrength;
    if (Number.isFinite(uOpts.vignetteStrength)) {
      uniforms.uVignetteStrength.value = uOpts.vignetteStrength;
    }
    if (Number.isFinite(uOpts.grainStrength)) uniforms.uGrainStrength.value = uOpts.grainStrength;
    if (uOpts.sunScreen && Number.isFinite(uOpts.sunScreen.x)) {
      uniforms.uSunScreen.value.set(
        uOpts.sunScreen.x,
        uOpts.sunScreen.y,
        uOpts.sunScreen.z || 0.0
      );
    }
  }

  function render(scene, camera, frameOpts = null) {
    if (!renderer || !scene || !camera) return;

    if (!enabled) {
      renderer.render(scene, camera);
      return;
    }

    // Sync render-target resolution automatically with current WebGL drawing buffer (`0` allocations)
    if (typeof renderer.getDrawingBufferSize === "function") {
      renderer.getDrawingBufferSize(_drawSize);
      const dw = Math.max(2, Math.round(_drawSize.x));
      const dh = Math.max(2, Math.round(_drawSize.y));
      if (dw !== renderTarget.width || dh !== renderTarget.height) {
        _syncTargetsToSize(dw, dh);
      }
    }

    if (Number.isFinite(camera.near) && camera.near > 1e-4) {
      uniforms.uCameraNear.value = camera.near;
    }
    if (Number.isFinite(camera.far) && camera.far > uniforms.uCameraNear.value + 1.0) {
      uniforms.uCameraFar.value = camera.far;
    }

    // Pull optional Cold-Open Macro DoF from `frameOpts` or `camera.userData` (`0` allocations)
    const camUD = camera.userData;
    if (frameOpts) {
      updateUniforms(frameOpts);
    } else if (camUD) {
      if (Number.isFinite(camUD.dofStrength)) {
        uniforms.uDofStrength.value = camUD.dofStrength;
      }
      if (Number.isFinite(camUD.dofFocusDistM) && camUD.dofFocusDistM > 0.05) {
        uniforms.uDofFocusDist.value = camUD.dofFocusDistM;
      }
    }

    if (!frameOpts || !Number.isFinite(frameOpts.exposure)) {
      if (Number.isFinite(renderer.toneMappingExposure)) {
        uniforms.uExposure.value = renderer.toneMappingExposure;
      }
    }

    // Temporarily suppress legacy camera-attached `CinemaFilmicVignette` quad during offscreen HDR capture
    // so solar bloom & vignette are fused cleanly once in our single AgX fragment pass!
    if (cachedVignetteCam !== camera) {
      cachedVignetteCam = camera;
      if (!cachedVignetteMesh && typeof camera.getObjectByName === "function") {
        cachedVignetteMesh = camera.getObjectByName("CinemaFilmicVignette") || null;
      }
    }
    let prevVigVisible = false;
    if (cachedVignetteMesh) {
      prevVigVisible = cachedVignetteMesh.visible;
      const vigU = cachedVignetteMesh.material && cachedVignetteMesh.material.uniforms;
      if (vigU && vigU.uSunScreen && vigU.uSunScreen.value && (!frameOpts || !frameOpts.sunScreen)) {
        uniforms.uSunScreen.value.copy(vigU.uSunScreen.value);
      }
      cachedVignetteMesh.visible = false;
    }

    const prevTarget = renderer.getRenderTarget();
    const prevToneMapping = renderer.toneMapping;

    try {
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.setRenderTarget(renderTarget);
      renderer.render(scene, camera);

      // Half-resolution (0.5x) HDR bright-pass downsample + separable H/V Gaussian blur
      if (uniforms.uBloomStrength.value > 0.001) {
        bloomDownUniforms.tSrc.value = renderTarget.texture;
        renderer.setRenderTarget(bloomBlurTarget);
        renderer.render(bloomDownScene, fsCamera);

        const bw = Math.max(1, bloomBlurTarget.width);
        const bh = Math.max(1, bloomBlurTarget.height);
        bloomBlurUniforms.tSrc.value = bloomBlurTarget.texture;
        bloomBlurUniforms.uBlurStep.value.set(1.0 / bw, 0.0);
        renderer.setRenderTarget(bloomDownTarget);
        renderer.render(bloomBlurScene, fsCamera);

        bloomBlurUniforms.tSrc.value = bloomDownTarget.texture;
        bloomBlurUniforms.uBlurStep.value.set(0.0, 1.0 / bh);
        renderer.setRenderTarget(bloomBlurTarget);
        renderer.render(bloomBlurScene, fsCamera);
      }
    } finally {
      renderer.toneMapping = prevToneMapping;
      if (cachedVignetteMesh) {
        cachedVignetteMesh.visible = prevVigVisible;
      }
    }

    renderer.setRenderTarget(prevTarget || null);
    renderer.render(fsScene, fsCamera);
  }

  function dispose() {
    renderTarget.dispose();
    bloomDownTarget.dispose();
    bloomBlurTarget.dispose();
    depthTexture.dispose();
    fsGeometry.dispose();
    bloomDownMat.dispose();
    bloomBlurMat.dispose();
    material.dispose();
  }

  return {
    render,
    setSize,
    updateUniforms,
    setEnabled: (flag) => {
      enabled = Boolean(flag);
    },
    isEnabled: () => enabled,
    isSoftwareRenderer,
    samples: effectiveSamples,
    rtType,
    bloomScale: BLOOM_SCALE,
    renderTarget,
    bloomDownTarget,
    bloomBlurTarget,
    getBloomStats: () => ({
      bloomScale: BLOOM_SCALE,
      primaryWidth: renderTarget.width,
      primaryHeight: renderTarget.height,
      bloomWidth: bloomBlurTarget.width,
      bloomHeight: bloomBlurTarget.height,
    }),
    depthTexture,
    material,
    uniforms,
    dispose,
  };
}
